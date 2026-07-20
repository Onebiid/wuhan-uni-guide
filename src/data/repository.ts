import { z } from 'zod';
import {
  memorySchema,
  placeSchema,
  playlistItemSchema,
  relationshipSettingsSchema,
  type Memory,
  type Place,
  type PlaylistItem,
  type RelationshipSettings,
  type SyncRecordKind,
} from '../domain/models';
import {
  DEFAULT_KDF_ITERATIONS,
  createSalt,
  decryptJson,
  deriveWorkspaceKeys,
  encryptJson,
  recordAssociatedData,
  type WorkspaceKeys,
  decryptBytes,
  encryptBytes,
  bytesToBase64,
} from '../security/crypto';
import { db, encryptedRecordKey, type EncryptedRecord, type LocalWorkspace, type PendingMutation } from './database';
import { normalizeImage } from '../services/images';
import { downloadRemoteMedia } from '../services/sync';

const ACTIVE_WORKSPACE_KEY = 'activeWorkspaceId';
const DEVICE_ID_KEY = 'deviceId';

export interface UnlockedWorkspace {
  workspace: LocalWorkspace;
  keys: WorkspaceKeys;
  deviceId: string;
}

export interface DecryptedSnapshot {
  places: Place[];
  memories: Memory[];
  relationship: RelationshipSettings;
  playlist: PlaylistItem[];
}

const defaultRelationship: RelationshipSettings = {
  metOn: null,
  togetherOn: null,
  autoLockMinutes: 15,
};

export async function getActiveWorkspace(): Promise<LocalWorkspace | null> {
  const active = await db.settings.get(ACTIVE_WORKSPACE_KEY);
  if (typeof active?.value !== 'string') return null;
  return (await db.workspaces.get(active.value)) ?? null;
}

export async function createWorkspace(passphrase: string): Promise<UnlockedWorkspace> {
  const salt = createSalt();
  const keys = await deriveWorkspaceKeys(passphrase, salt);
  const workspace: LocalWorkspace = {
    id: `workspace_${crypto.randomUUID().replaceAll('-', '')}`,
    salt,
    kdfIterations: DEFAULT_KDF_ITERATIONS,
    authVerifier: keys.authVerifier,
    createdAt: Date.now(),
    schemaVersion: 1,
  };
  const deviceId = await getOrCreateDeviceId();
  await db.transaction('rw', db.workspaces, db.settings, async () => {
    await db.workspaces.add(workspace);
    await db.settings.put({ key: ACTIVE_WORKSPACE_KEY, value: workspace.id });
  });
  return { workspace, keys, deviceId };
}

export async function unlockWorkspace(passphrase: string, workspace: LocalWorkspace): Promise<UnlockedWorkspace> {
  const keys = await deriveWorkspaceKeys(passphrase, workspace.salt, workspace.kdfIterations);
  if (keys.authVerifier !== workspace.authVerifier) throw new Error('口令不正确');
  return { workspace, keys, deviceId: await getOrCreateDeviceId() };
}

export async function loadSnapshot(session: UnlockedWorkspace): Promise<DecryptedSnapshot> {
  const records = await db.records.where('workspaceId').equals(session.workspace.id).toArray();
  const places: Place[] = [];
  const memories: Memory[] = [];
  let relationship = defaultRelationship;
  let playlist: PlaylistItem[] = [];

  for (const record of records) {
    try {
      const data = await decryptRecord(record, session.keys);
      if (record.kind === 'place') places.push(placeSchema.parse(data));
      if (record.kind === 'memory') memories.push(memorySchema.parse(data));
      if (record.kind === 'settings') relationship = relationshipSettingsSchema.parse(data);
      if (record.kind === 'playlist') playlist = z.array(playlistItemSchema).parse(data);
    } catch {
      // Corrupt records remain in storage for encrypted diagnostic export.
    }
  }

  return {
    places: places.filter((place) => place.deletedAt === null),
    memories: memories.filter((memory) => memory.deletedAt === null),
    relationship,
    playlist,
  };
}

export async function savePlace(session: UnlockedWorkspace, value: Place): Promise<Place> {
  return saveVersionedRecord(session, 'place', value.id, value, (revision) => ({ ...value, revision, updatedAt: Date.now() }));
}

export async function saveMemory(session: UnlockedWorkspace, value: Memory): Promise<Memory> {
  return saveVersionedRecord(session, 'memory', value.id, value, (revision) => ({ ...value, revision, updatedAt: Date.now() }));
}

export async function saveRelationship(session: UnlockedWorkspace, value: RelationshipSettings): Promise<RelationshipSettings> {
  const parsed = relationshipSettingsSchema.parse(value);
  await saveRecord(session, 'settings', 'relationship', parsed);
  return parsed;
}

export async function savePlaylist(session: UnlockedWorkspace, value: PlaylistItem[]): Promise<PlaylistItem[]> {
  const parsed = z.array(playlistItemSchema).parse(value);
  await saveRecord(session, 'playlist', 'main', parsed);
  return parsed;
}

export async function tombstonePlace(session: UnlockedWorkspace, value: Place): Promise<Place> {
  return savePlace(session, { ...value, deletedAt: Date.now() });
}

export async function restorePlace(session: UnlockedWorkspace, value: Place): Promise<Place> {
  return savePlace(session, { ...value, deletedAt: null });
}

export async function pendingMutationCount(workspaceId: string): Promise<number> {
  return db.mutations.where('workspaceId').equals(workspaceId).and((mutation) => mutation.state === 'pending').count();
}

export async function addEncryptedPhoto(session: UnlockedWorkspace, memoryId: string, file: File): Promise<string> {
  const normalized = await normalizeImage(file);
  const id = `photo_${crypto.randomUUID().replaceAll('-', '')}`;
  const associatedData = `media:${id}:${memoryId}`;
  const encrypted = await encryptBytes(await normalized.arrayBuffer(), session.keys.encryptionKey, associatedData);
  const checksum = bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', encrypted.ciphertext)));
  await db.media.put({
    key: `${session.workspace.id}:${id}`,
    workspaceId: session.workspace.id,
    id,
    recordId: memoryId,
    contentType: normalized.type,
    byteLength: encrypted.ciphertext.byteLength,
    checksum,
    nonce: encrypted.nonce,
    blob: new Blob([encrypted.ciphertext], { type: 'application/octet-stream' }),
    createdAt: Date.now(),
    syncState: 'pending',
  });
  return id;
}

export async function loadPhotoObjectUrl(session: UnlockedWorkspace, photoId: string, memoryId: string): Promise<string | null> {
  const media = await db.media.get(`${session.workspace.id}:${photoId}`) ?? await downloadRemoteMedia(session, memoryId, photoId);
  if (!media) return null;
  const plaintext = await decryptBytes(
    { nonce: media.nonce, ciphertext: await media.blob.arrayBuffer() },
    session.keys.encryptionKey,
    `media:${photoId}:${memoryId}`,
  );
  return URL.createObjectURL(new Blob([plaintext], { type: media.contentType }));
}

async function saveVersionedRecord<T extends { revision: number }>(
  session: UnlockedWorkspace,
  kind: SyncRecordKind,
  id: string,
  value: T,
  withRevision: (revision: number) => T,
): Promise<T> {
  const key = encryptedRecordKey(session.workspace.id, kind, id);
  const pending = await db.mutations.where('recordKey').equals(key).first();
  const existing = await db.records.get(key);
  const baseRevision = pending?.baseRevision ?? existing?.revision ?? value.revision;
  const next = withRevision(baseRevision + 1);
  await saveRecord(session, kind, id, next, baseRevision);
  return next;
}

async function saveRecord(
  session: UnlockedWorkspace,
  kind: SyncRecordKind,
  id: string,
  value: unknown,
  explicitBaseRevision?: number,
): Promise<void> {
  const key = encryptedRecordKey(session.workspace.id, kind, id);
  const pending = await db.mutations.where('recordKey').equals(key).first();
  const existing = await db.records.get(key);
  const baseRevision = explicitBaseRevision ?? pending?.baseRevision ?? existing?.revision ?? 0;
  const targetRevision = baseRevision + 1;
  const envelope = await encryptJson(value, session.keys.encryptionKey, recordAssociatedData(kind, id, targetRevision));
  const now = Date.now();
  const deletedAt = readDeletedAt(value);
  const record: EncryptedRecord = {
    key,
    workspaceId: session.workspace.id,
    kind,
    id,
    revision: targetRevision,
    updatedAt: now,
    deletedAt,
    envelope,
  };
  const mutation: PendingMutation = {
    id: pending?.id ?? crypto.randomUUID(),
    workspaceId: session.workspace.id,
    recordKey: key,
    kind,
    recordId: id,
    baseRevision,
    createdAt: pending?.createdAt ?? now,
    attempts: 0,
    nextAttemptAt: now,
    state: 'pending',
  };
  await db.transaction('rw', db.records, db.mutations, async () => {
    await db.records.put(record);
    await db.mutations.put(mutation);
  });
}

async function decryptRecord(record: EncryptedRecord, keys: WorkspaceKeys): Promise<unknown> {
  return decryptJson(record.envelope, keys.encryptionKey, recordAssociatedData(record.kind, record.id, record.revision));
}

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await db.settings.get(DEVICE_ID_KEY);
  if (typeof existing?.value === 'string') return existing.value;
  const value = `device_${crypto.randomUUID().replaceAll('-', '')}`;
  await db.settings.put({ key: DEVICE_ID_KEY, value });
  return value;
}

function readDeletedAt(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || !('deletedAt' in value)) return null;
  const deletedAt = (value as { deletedAt?: unknown }).deletedAt;
  return typeof deletedAt === 'number' ? deletedAt : null;
}
