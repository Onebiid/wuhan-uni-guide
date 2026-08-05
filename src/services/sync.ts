import { z } from 'zod';
import { db, encryptedRecordKey, type EncryptedMedia, type EncryptedRecord, type PendingMutation } from '../data/database';
import type { UnlockedWorkspace } from '../data/repository';
import { decryptJson, encryptJson, recordAssociatedData } from '../security/crypto';

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
const conflictResponseSchema = z.object({
  currentRevision: z.number().int().nonnegative(),
});

const remoteWorkspaceSchema = z.object({
  id: z.string().min(1).max(128),
  salt: z.string().min(20).max(64),
  kdfIterations: z.number().int().min(100_000).max(2_000_000),
});

type RemoteRecord = z.infer<typeof remoteRecordSchema>;

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

export async function refreshWorkspace(session: UnlockedWorkspace): Promise<SyncOutcome> {
  const api = getSyncApi();
  if (!api) return 'disabled';
  await registerWorkspace(api, session);
  await pullChanges(api, session);
  return determineSyncOutcome(session.workspace.id);
}
export async function syncWorkspace(session: UnlockedWorkspace): Promise<SyncOutcome> {
  const api = getSyncApi();
  if (!api) return 'disabled';
  try {
    await registerWorkspace(api, session);
    await pullChanges(api, session);
    await pushMutations(api, session);
    await pushMedia(api, session);
    await pullChanges(api, session);
    return determineSyncOutcome(session.workspace.id);
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

async function pushMutations(api: string, session: UnlockedWorkspace): Promise<void> {
  const now = Date.now();
  const candidates = await db.mutations
    .where('workspaceId')
    .equals(session.workspace.id)
    .and((item) => item.state !== 'conflict' && item.nextAttemptAt <= now)
    .sortBy('createdAt');

  for (const candidate of candidates) {
    const snapshot = await readUploadSnapshot(candidate.id);
    if (!snapshot || snapshot.mutation.state === 'conflict' || snapshot.mutation.nextAttemptAt > now) continue;
    const { mutation, record } = snapshot;
    if (!record) {
      await deleteMutationGeneration(mutation);
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
        const parsed = conflictResponseSchema.safeParse(await response.json().catch(() => null));
        await markConflict(mutation, parsed.success ? parsed.data.currentRevision : undefined);
      } else if (response.ok) {
        await acknowledgeUploadedGeneration(session, mutation, record);
      } else {
        await scheduleRetry(mutation);
      }
    } catch {
      await scheduleRetry(mutation);
    }
  }
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
    for (const remote of parsed.records) await incorporateRemoteRecord(session, remote);
    cursor = parsed.cursor;
    hasMore = parsed.hasMore;
    await db.settings.put({ key: cursorKey, value: cursor });
  }
}

async function incorporateRemoteRecord(session: UnlockedWorkspace, remote: RemoteRecord): Promise<void> {
  const key = encryptedRecordKey(session.workspace.id, remote.kind, remote.id);
  await db.transaction('rw', db.records, db.mutations, async () => {
    const mutation = await db.mutations.where('recordKey').equals(key).first();
    const local = await db.records.get(key);

    if (!mutation) {
      if (local && local.revision >= remote.revision) return;
      await db.records.put(toEncryptedRecord(session.workspace.id, remote));
      return;
    }

    if (local && recordMatchesRemote(local, remote)) {
      await db.mutations.delete(mutation.id);
      return;
    }

    if (remote.revision > mutation.baseRevision) {
      await db.mutations.put({
        ...mutation,
        generation: mutationGeneration(mutation),
        remoteRevision: Math.max(mutation.remoteRevision ?? 0, remote.revision),
        state: 'conflict',
      });
    }
  });
}

async function readUploadSnapshot(id: string): Promise<{ mutation: PendingMutation; record: EncryptedRecord | undefined } | null> {
  return db.transaction('r', db.mutations, db.records, async () => {
    const mutation = await db.mutations.get(id);
    if (!mutation) return null;
    return { mutation, record: await db.records.get(mutation.recordKey) };
  });
}

async function acknowledgeUploadedGeneration(
  session: UnlockedWorkspace,
  uploadedMutation: PendingMutation,
  uploadedRecord: EncryptedRecord,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readUploadSnapshot(uploadedMutation.id);
    if (!current) return;
    if (mutationGeneration(current.mutation) === mutationGeneration(uploadedMutation)) {
      await deleteMutationGeneration(uploadedMutation);
      return;
    }
    if (mutationGeneration(current.mutation) < mutationGeneration(uploadedMutation) || current.mutation.state === 'conflict' || !current.record) return;
    const currentRecord = current.record;
    if (current.mutation.baseRevision >= uploadedRecord.revision && currentRecord.revision === current.mutation.baseRevision + 1) return;

    const value = await decryptJson(
      currentRecord.envelope,
      session.keys.encryptionKey,
      recordAssociatedData(currentRecord.kind, currentRecord.id, currentRecord.revision),
    );
    const baseRevision = uploadedRecord.revision;
    const revision = baseRevision + 1;
    const envelope = await encryptJson(
      withRecordRevision(value, currentRecord.kind, revision),
      session.keys.encryptionKey,
      recordAssociatedData(currentRecord.kind, currentRecord.id, revision),
    );
    const rebased = await db.transaction('rw', db.records, db.mutations, async () => {
      const latestMutation = await db.mutations.get(current.mutation.id);
      const latestRecord = await db.records.get(currentRecord.key);
      if (!latestMutation || !latestRecord) return true;
      if (mutationGeneration(latestMutation) !== mutationGeneration(current.mutation) || !sameRecordVersion(latestRecord, currentRecord)) return false;
      await db.records.put({ ...latestRecord, revision, envelope });
      const rebasedMutation: PendingMutation = {
        ...latestMutation,
        baseRevision,
        generation: mutationGeneration(latestMutation),
        attempts: 0,
        nextAttemptAt: Date.now(),
        state: 'pending',
      };
      delete rebasedMutation.remoteRevision;
      await db.mutations.put(rebasedMutation);
      return true;
    });
    if (rebased) return;
  }
}

async function deleteMutationGeneration(mutation: PendingMutation): Promise<void> {
  await db.transaction('rw', db.mutations, async () => {
    const current = await db.mutations.get(mutation.id);
    if (current && mutationGeneration(current) === mutationGeneration(mutation)) {
      await db.mutations.delete(mutation.id);
    }
  });
}

async function markConflict(mutation: PendingMutation, remoteRevision?: number): Promise<void> {
  await db.transaction('rw', db.mutations, async () => {
    const current = await db.mutations.get(mutation.id);
    if (!current || mutationGeneration(current) !== mutationGeneration(mutation)) return;
    const conflict: PendingMutation = {
      ...current,
      generation: mutationGeneration(current),
      state: 'conflict',
    };
    if (remoteRevision !== undefined) {
      conflict.remoteRevision = Math.max(current.remoteRevision ?? 0, remoteRevision);
    }
    await db.mutations.put(conflict);
  });
}

async function scheduleRetry(mutation: PendingMutation): Promise<void> {
  const attempts = mutation.attempts + 1;
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const jitter = (random[0] ?? 0) % 1_000;
  const delay = Math.min(300_000, 1_000 * 2 ** Math.min(attempts, 8)) + jitter;
  await db.transaction('rw', db.mutations, async () => {
    const current = await db.mutations.get(mutation.id);
    if (!current || mutationGeneration(current) !== mutationGeneration(mutation)) return;
    await db.mutations.update(mutation.id, {
      attempts,
      generation: mutationGeneration(current),
      nextAttemptAt: Date.now() + delay,
      state: attempts >= 8 ? 'failed' : 'pending',
    });
  });
}

async function determineSyncOutcome(workspaceId: string): Promise<SyncOutcome> {
  const [mutations, media] = await Promise.all([
    db.mutations.where('workspaceId').equals(workspaceId).toArray(),
    db.media.where('workspaceId').equals(workspaceId).and((item) => item.syncState !== 'synced').toArray(),
  ]);
  if (mutations.some((item) => item.state === 'conflict')) return 'conflict';
  if (mutations.some((item) => item.state === 'failed') || media.some((item) => item.syncState === 'failed')) return 'error';
  if (mutations.length > 0 || media.length > 0) return 'pending';
  return 'synced';
}

function withRecordRevision(value: unknown, kind: EncryptedRecord['kind'], revision: number): unknown {
  if ((kind !== 'place' && kind !== 'memory') || typeof value !== 'object' || value === null) return value;
  return { ...value, revision };
}
function toEncryptedRecord(workspaceId: string, remote: RemoteRecord): EncryptedRecord {
  return {
    key: encryptedRecordKey(workspaceId, remote.kind, remote.id),
    workspaceId,
    kind: remote.kind,
    id: remote.id,
    revision: remote.revision,
    updatedAt: remote.updatedAt,
    deletedAt: remote.deletedAt,
    envelope: { v: 1, alg: 'A256GCM', nonce: remote.nonce, ciphertext: remote.ciphertext },
  };
}

function recordMatchesRemote(local: EncryptedRecord, remote: RemoteRecord): boolean {
  return local.revision === remote.revision
    && local.deletedAt === remote.deletedAt
    && local.envelope.nonce === remote.nonce
    && local.envelope.ciphertext === remote.ciphertext;
}

function sameRecordVersion(left: EncryptedRecord, right: EncryptedRecord): boolean {
  return left.key === right.key
    && left.revision === right.revision
    && left.envelope.nonce === right.envelope.nonce
    && left.envelope.ciphertext === right.envelope.ciphertext;
}

function mutationGeneration(mutation: PendingMutation): number {
  return Number.isSafeInteger(mutation.generation) ? mutation.generation : 0;
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