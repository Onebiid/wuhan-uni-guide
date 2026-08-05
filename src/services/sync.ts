import { z } from 'zod';
import { db, encryptedRecordKey, type EncryptedMedia, type EncryptedRecord, type PendingMutation } from '../data/database';
import type { UnlockedWorkspace } from '../data/repository';

const remoteRecordSchema = z.object({
  seq: z.number().int().positive(),
  id: z.string().min(1).max(128),
  kind: z.enum(['place', 'memory', 'settings', 'playlist']),
  revision: z.number().int().positive(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable(),
  nonce: z.string(),
  ciphertext: z.string(),
});
const syncResponseSchema = z.object({
  cursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  records: z.array(remoteRecordSchema),
});

const remoteWorkspaceSchema = z.object({
  id: z.string().min(1).max(128),
  salt: z.string().min(20).max(64),
  kdfIterations: z.number().int().min(100_000).max(2_000_000),
});

export interface RemoteWorkspaceMetadata {
  id: string;
  salt: string;
  kdfIterations: number;
}

export async function discoverWorkspace(discoveryId: string): Promise<RemoteWorkspaceMetadata | null> {
  const api = getSyncApi();
  if (!api) return null;
  const response = await fetch(`${api}/v1/workspaces/discover/${encodeURIComponent(discoveryId)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Workspace discovery failed: ${response.status}`);
  return remoteWorkspaceSchema.parse(await response.json());
}

export async function verifyWorkspaceAccess(session: UnlockedWorkspace): Promise<void> {
  const api = getSyncApi();
  if (!api) throw new Error('Remote sync is unavailable');
  const response = await fetch(`${api}/v1/sync?cursor=0`, { headers: authHeaders(session) });
  if (!response.ok) throw new Error(`Workspace authentication failed: ${response.status}`);
}
export type SyncOutcome = 'disabled' | 'synced' | 'pending' | 'conflict' | 'error';

export async function syncWorkspace(session: UnlockedWorkspace): Promise<SyncOutcome> {
  const api = getSyncApi();
  if (!api) return 'disabled';
  try {
    await registerWorkspace(api, session);
    const conflict = await pushMutations(api, session);
    await pushMedia(api, session);
    await pullChanges(api, session);
    if (conflict) return 'conflict';
    const pending = await db.mutations.where('workspaceId').equals(session.workspace.id).and((item) => item.state === 'pending').count();
    return pending > 0 ? 'pending' : 'synced';
  } catch {
    return 'error';
  }
}

export async function downloadRemoteMedia(session: UnlockedWorkspace, memoryId: string, mediaId: string): Promise<EncryptedMedia | null> {
  const api = getSyncApi();
  if (!api) return null;
  const response = await fetch(`${api}/v1/media/${encodeURIComponent(memoryId)}/${encodeURIComponent(mediaId)}`, { headers: authHeaders(session) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Media download failed: ${response.status}`);
  const nonce = response.headers.get('X-Media-Nonce');
  const checksum = response.headers.get('X-Media-Checksum');
  const contentType = response.headers.get('X-Plaintext-Type');
  if (!nonce || !checksum || !contentType) throw new Error('Remote media metadata is incomplete');
  const blob = await response.blob();
  const media: EncryptedMedia = {
    key: `${session.workspace.id}:${mediaId}`,
    workspaceId: session.workspace.id,
    id: mediaId,
    recordId: memoryId,
    contentType,
    byteLength: blob.size,
    checksum,
    nonce,
    blob,
    createdAt: Date.now(),
    syncState: 'synced',
  };
  await db.media.put(media);
  return media;
}

async function registerWorkspace(api: string, session: UnlockedWorkspace): Promise<void> {
  const response = await fetch(`${api}/v1/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: session.workspace.id,
      salt: session.workspace.salt,
      authVerifier: session.workspace.authVerifier,
      kdfIterations: session.workspace.kdfIterations,
      ...(session.workspace.discoveryId ? { discoveryId: session.workspace.discoveryId } : {}),
    }),
  });
  if (!response.ok) throw new Error(`Workspace registration failed: ${response.status}`);
}

async function pushMutations(api: string, session: UnlockedWorkspace): Promise<boolean> {
  const now = Date.now();
  const mutations = await db.mutations.where('workspaceId').equals(session.workspace.id).and((item) => item.state === 'pending' && item.nextAttemptAt <= now).sortBy('createdAt');
  let conflict = false;
  for (const mutation of mutations) {
    const record = await db.records.get(mutation.recordKey);
    if (!record) {
      await db.mutations.delete(mutation.id);
      continue;
    }
    try {
      const response = await fetch(`${api}/v1/records/${record.kind}/${encodeURIComponent(record.id)}`, {
        method: 'PUT',
        headers: { ...authHeadersObject(session), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseRevision: mutation.baseRevision,
          revision: record.revision,
          updatedAt: record.updatedAt,
          deletedAt: record.deletedAt,
          nonce: record.envelope.nonce,
          ciphertext: record.envelope.ciphertext,
        }),
      });
      if (response.status === 409) {
        conflict = true;
        await db.mutations.update(mutation.id, { state: 'conflict' });
      } else if (response.ok) {
        await db.mutations.delete(mutation.id);
      } else {
        await scheduleRetry(mutation);
      }
    } catch {
      await scheduleRetry(mutation);
    }
  }
  return conflict;
}

async function pushMedia(api: string, session: UnlockedWorkspace): Promise<void> {
  const items = await db.media.where('workspaceId').equals(session.workspace.id).and((item) => item.syncState !== 'synced').toArray();
  for (const media of items) {
    try {
      const response = await fetch(`${api}/v1/media/${encodeURIComponent(media.recordId)}/${encodeURIComponent(media.id)}`, {
        method: 'PUT',
        headers: {
          ...authHeadersObject(session),
          'Content-Type': 'application/octet-stream',
          'X-Media-Nonce': media.nonce,
          'X-Media-Checksum': media.checksum,
          'X-Plaintext-Type': media.contentType,
        },
        body: media.blob,
      });
      await db.media.update(media.key, { syncState: response.ok ? 'synced' : 'failed' });
    } catch {
      await db.media.update(media.key, { syncState: 'failed' });
    }
  }
}

async function pullChanges(api: string, session: UnlockedWorkspace): Promise<void> {
  const cursorKey = `syncCursor:${session.workspace.id}`;
  const storedCursor = await db.settings.get(cursorKey);
  let cursor = typeof storedCursor?.value === 'number' ? storedCursor.value : 0;
  let hasMore = true;
  while (hasMore) {
    const response = await fetch(`${api}/v1/sync?cursor=${cursor}`, { headers: authHeaders(session) });
    if (!response.ok) throw new Error(`Sync pull failed: ${response.status}`);
    const parsed = syncResponseSchema.parse(await response.json());
    for (const remote of parsed.records) {
      const key = encryptedRecordKey(session.workspace.id, remote.kind, remote.id);
      const pending = await db.mutations.where('recordKey').equals(key).first();
      const local = await db.records.get(key);
      if (pending || (local && local.revision >= remote.revision)) continue;
      const record: EncryptedRecord = {
        key,
        workspaceId: session.workspace.id,
        kind: remote.kind,
        id: remote.id,
        revision: remote.revision,
        updatedAt: remote.updatedAt,
        deletedAt: remote.deletedAt,
        envelope: { v: 1, alg: 'A256GCM', nonce: remote.nonce, ciphertext: remote.ciphertext },
      };
      await db.records.put(record);
    }
    cursor = parsed.cursor;
    hasMore = parsed.hasMore;
    await db.settings.put({ key: cursorKey, value: cursor });
  }
}

async function scheduleRetry(mutation: PendingMutation): Promise<void> {
  const attempts = mutation.attempts + 1;
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const jitter = (random[0] ?? 0) % 1_000;
  const delay = Math.min(300_000, 1_000 * 2 ** Math.min(attempts, 8)) + jitter;
  await db.mutations.update(mutation.id, { attempts, nextAttemptAt: Date.now() + delay, state: attempts >= 8 ? 'failed' : 'pending' });
}

function authHeaders(session: UnlockedWorkspace): Headers {
  return new Headers(authHeadersObject(session));
}

function authHeadersObject(session: UnlockedWorkspace): Record<string, string> {
  return { 'X-Workspace-Id': session.workspace.id, Authorization: `Bearer ${session.keys.authToken}` };
}

function getSyncApi(): string | null {
  const value = import.meta.env.VITE_SYNC_API?.replace(/\/+$/, '');
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return null;
  return url.toString().replace(/\/+$/, '');
}
