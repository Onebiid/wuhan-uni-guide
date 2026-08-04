import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from '../src/data/database';
import type { UnlockedWorkspace } from '../src/data/repository';
import { syncWorkspace } from '../src/services/sync';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  vi.stubEnv('VITE_SYNC_API', 'https://sync.example');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('retries encrypted media left in the failed state', async () => {
  const session = createSession();
  const key = `${session.workspace.id}:photo_one`;
  await db.media.put({
    key,
    workspaceId: session.workspace.id,
    id: 'photo_one',
    recordId: 'memory_one',
    contentType: 'image/jpeg',
    byteLength: 4,
    checksum: 'checksum',
    nonce: 'nonce',
    blob: new Blob([new Uint8Array([1, 2, 3, 4])]),
    createdAt: 1,
    syncState: 'failed',
  });
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    if (url.endsWith('/v1/workspaces')) return Promise.resolve(new Response(null, { status: 201 }));
    if (url.includes('/v1/media/')) return Promise.resolve(Response.json({ ok: true, etag: 'checksum' }, { status: 201 }));
    if (url.includes('/v1/sync?cursor=')) return Promise.resolve(Response.json({ cursor: 0, hasMore: false, records: [] }));
    return Promise.reject(new Error(`Unexpected fetch: ${url} ${init?.method ?? 'GET'}`));
  });

  expect(await syncWorkspace(session)).toBe('synced');
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/v1/media/memory_one/photo_one'),
    expect.objectContaining({ method: 'PUT' }),
  );
  expect((await db.media.get(key))?.syncState).toBe('synced');
});

function createSession(): UnlockedWorkspace {
  return {
    workspace: {
      id: 'workspace_test',
      salt: 'salt',
      kdfIterations: 600_000,
      authVerifier: 'verifier',
      createdAt: 1,
      schemaVersion: 1,
    },
    keys: { encryptionKey: {} as CryptoKey, authToken: 'token', authVerifier: 'verifier' },
    deviceId: 'device_test',
  };
}
