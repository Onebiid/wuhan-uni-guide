import Dexie, { type EntityTable } from 'dexie';
import type { EncryptionEnvelope } from '../security/crypto';
import type { SyncRecordKind } from '../domain/models';

export interface LocalWorkspace {
  id: string;
  salt: string;
  kdfIterations: number;
  authVerifier: string;
  discoveryId?: string;
  createdAt: number;
  schemaVersion: number;
}

export interface EncryptedRecord {
  key: string;
  workspaceId: string;
  kind: SyncRecordKind;
  id: string;
  revision: number;
  updatedAt: number;
  deletedAt: number | null;
  envelope: EncryptionEnvelope;
}

export interface EncryptedMedia {
  key: string;
  workspaceId: string;
  id: string;
  recordId: string;
  contentType: string;
  byteLength: number;
  checksum: string;
  nonce: string;
  blob: Blob;
  createdAt: number;
  syncState: 'pending' | 'synced' | 'failed';
}

export interface PendingMutation {
  id: string;
  workspaceId: string;
  recordKey: string;
  kind: SyncRecordKind;
  recordId: string;
  baseRevision: number;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  state: 'pending' | 'conflict' | 'failed';
}

export interface LocalSetting {
  key: string;
  value: unknown;
}

export interface TrustedSession {
  workspaceId: string;
  encryptionKey: CryptoKey;
  authToken: string;
  deviceId: string;
}

class CoupleMapDatabase extends Dexie {
  workspaces!: EntityTable<LocalWorkspace, 'id'>;
  records!: EntityTable<EncryptedRecord, 'key'>;
  media!: EntityTable<EncryptedMedia, 'key'>;
  mutations!: EntityTable<PendingMutation, 'id'>;
  settings!: EntityTable<LocalSetting, 'key'>;

  constructor() {
    super('whu-couple-map-v2');
    this.version(1).stores({
      workspaces: '&id, createdAt',
      records: '&key, workspaceId, kind, id, updatedAt, deletedAt',
      media: '&key, workspaceId, id, recordId, createdAt',
      mutations: '&id, workspaceId, recordKey, state, nextAttemptAt',
      settings: '&key',
    });
    this.version(2).stores({
      workspaces: '&id, createdAt',
      records: '&key, workspaceId, kind, id, updatedAt, deletedAt',
      media: '&key, workspaceId, id, recordId, createdAt, syncState',
      mutations: '&id, workspaceId, recordKey, state, nextAttemptAt',
      settings: '&key',
    });
    this.version(3).stores({
      workspaces: '&id, createdAt, discoveryId',
      records: '&key, workspaceId, kind, id, updatedAt, deletedAt',
      media: '&key, workspaceId, id, recordId, createdAt, syncState',
      mutations: '&id, workspaceId, recordKey, state, nextAttemptAt',
      settings: '&key',
    });
  }
}

export const db = new CoupleMapDatabase();

export function encryptedRecordKey(workspaceId: string, kind: SyncRecordKind, id: string): string {
  return `${workspaceId}:${kind}:${id}`;
}
