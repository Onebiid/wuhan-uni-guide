import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { render, waitFor } from '@testing-library/react';
import { useWorkspace, WorkspaceProvider } from '../src/app/WorkspaceContext';
import { db } from '../src/data/database';
import {
  getActiveWorkspace,
  joinWorkspace,
  loadSnapshot,
  pendingMutationCount,
  rememberTrustedSession,
  restoreTrustedSession,
  savePlace,
  unlockWorkspace,
  type UnlockedWorkspace,
} from '../src/data/repository';
import type * as RepositoryModule from '../src/data/repository';
import { deriveWorkspaceKeys, encryptJson, recordAssociatedData } from '../src/security/crypto';
import { discoverWorkspace, syncWorkspace } from '../src/services/sync';
import type { Place } from '../src/domain/models';

vi.mock('../src/data/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof RepositoryModule>();
  return {
    ...actual,
    loadSnapshot: vi.fn(actual.loadSnapshot),
  };
});
beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  vi.stubEnv('VITE_SYNC_API', 'https://sync.example');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('converges changes made by two devices through the shared remote workspace', async () => {
  const sessionA = await createTrustedSession('shared passphrase');
  const sessionB = { ...sessionA, deviceId: 'device_b' };
  const server = createTestSyncServer();
  vi.spyOn(globalThis, 'fetch').mockImplementation(server.fetch);

  await savePlace(sessionA, createPlace('place_shared', 'Created on A', sessionA.deviceId));
  await expect(syncWorkspace(sessionA)).resolves.toBe('synced');

  await db.records.clear();
  await db.mutations.clear();
  await db.settings.clear();
  await expect(syncWorkspace(sessionB)).resolves.toBe('synced');
  const pulledOnB = (await loadSnapshot(sessionB)).places[0];
  expect(pulledOnB?.name).toBe('Created on A');

  if (!pulledOnB) throw new Error('Device B did not receive the place');
  await savePlace(sessionB, { ...pulledOnB, name: 'Updated on B', deviceId: sessionB.deviceId });
  await expect(syncWorkspace(sessionB)).resolves.toBe('synced');

  await db.records.clear();
  await db.mutations.clear();
  await db.settings.clear();
  await expect(syncWorkspace(sessionA)).resolves.toBe('synced');
  expect((await loadSnapshot(sessionA)).places[0]?.name).toBe('Updated on B');
});

it('keeps a later edit queued when an earlier generation finishes uploading', async () => {
  const session = await createTrustedSession('shared passphrase');
  const server = createTestSyncServer();
  const uploadGate = server.blockNextUpload();
  vi.spyOn(globalThis, 'fetch').mockImplementation(server.fetch);

  const first = await savePlace(session, createPlace('place_overlap', 'Upload A', session.deviceId));
  const firstSync = syncWorkspace(session);
  await uploadGate.started;
  await savePlace(session, { ...first, name: 'Edit B' });
  uploadGate.release();

  await expect(firstSync).resolves.toBe('pending');
  expect(await pendingMutationCount(session.workspace.id)).toBe(1);
  expect(await db.mutations.where('recordKey').equals(`${session.workspace.id}:place:place_overlap`).first()).toMatchObject({
    baseRevision: 1,
    generation: 2,
    state: 'pending',
  });
  expect((await loadSnapshot(session)).places[0]).toMatchObject({ name: 'Edit B', revision: 2 });

  await expect(syncWorkspace(session)).resolves.toBe('synced');
  expect(await pendingMutationCount(session.workspace.id)).toBe(0);
  expect(server.getRecord('place', 'place_overlap')).toMatchObject({ revision: 2 });
});

it('preserves local intent in a durable conflict and rebases the next edit', async () => {
  const session = await createTrustedSession('shared passphrase');
  const remoteV1 = await encryptRemotePlace(session, createPlace('place_conflict', 'Remote v1', 'device_remote'), 1);
  const server = createTestSyncServer([remoteV1]);
  vi.spyOn(globalThis, 'fetch').mockImplementation(server.fetch);

  await expect(syncWorkspace(session)).resolves.toBe('synced');
  const remoteBase = (await loadSnapshot(session)).places[0];
  if (!remoteBase) throw new Error('Remote baseline was not pulled');
  await savePlace(session, { ...remoteBase, name: 'Local intent' });
  server.setRecord(await encryptRemotePlace(session, { ...remoteBase, name: 'Remote v2', deviceId: 'device_remote' }, 2));

  await expect(syncWorkspace(session)).resolves.toBe('conflict');
  expect(await pendingMutationCount(session.workspace.id)).toBe(1);
  expect(await db.mutations.where('recordKey').equals(`${session.workspace.id}:place:place_conflict`).first()).toMatchObject({
    baseRevision: 1,
    remoteRevision: 2,
    state: 'conflict',
  });
  const localIntent = (await loadSnapshot(session)).places[0];
  expect(localIntent?.name).toBe('Local intent');

  if (!localIntent) throw new Error('Local intent was not preserved');
  await savePlace(session, { ...localIntent, name: 'Local retry' });
  expect(await db.mutations.where('recordKey').equals(`${session.workspace.id}:place:place_conflict`).first()).toMatchObject({
    baseRevision: 2,
    state: 'pending',
  });
  await expect(syncWorkspace(session)).resolves.toBe('synced');
  expect(server.getRecord('place', 'place_conflict')).toMatchObject({ revision: 3 });
  expect((await loadSnapshot(session)).places[0]?.name).toBe('Local retry');
});

it('reports exhausted retries as unsynced and retries the failed row later', async () => {
  const session = await createTrustedSession('shared passphrase');
  const server = createTestSyncServer();
  server.failUploads = true;
  vi.spyOn(globalThis, 'fetch').mockImplementation(server.fetch);
  await savePlace(session, createPlace('place_retry', 'Retry me', session.deviceId));

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await db.mutations.where('workspaceId').equals(session.workspace.id).modify({ nextAttemptAt: 0 });
    await expect(syncWorkspace(session)).resolves.toBe(attempt === 8 ? 'error' : 'pending');
  }
  expect(await pendingMutationCount(session.workspace.id)).toBe(1);
  expect(await db.mutations.where('workspaceId').equals(session.workspace.id).first()).toMatchObject({ attempts: 8, state: 'failed' });

  server.failUploads = false;
  await db.mutations.where('workspaceId').equals(session.workspace.id).modify({ nextAttemptAt: 0 });
  await expect(syncWorkspace(session)).resolves.toBe('synced');
  expect(await pendingMutationCount(session.workspace.id)).toBe(0);
});
it('pulls a joined workspace before exposing an unlocked session', async () => {
  const salt = 'AAAAAAAAAAAAAAAAAAAAAA==';
  const keys = await deriveWorkspaceKeys('shared passphrase', salt, 100_000);
  const remoteSession: UnlockedWorkspace = {
    workspace: {
      id: 'workspace_remote',
      salt,
      kdfIterations: 100_000,
      authVerifier: keys.authVerifier,
      createdAt: 1,
      schemaVersion: 1,
    },
    keys,
    deviceId: 'device_remote',
  };
  const remoteRecord = await encryptRemotePlace(remoteSession, createPlace('place_join', 'Pulled before unlock', 'device_remote'), 1);
  const initialPull = deferred<Response>();
  let syncRequestCount = 0;
  let current: ReturnType<typeof useWorkspace> | undefined;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = requestUrl(input);
    if (url.includes('/v1/workspaces/discover/')) {
      return Promise.resolve(Response.json({ id: remoteSession.workspace.id, salt, kdfIterations: 100_000 }));
    }
    if (url.endsWith('/v1/workspaces')) return Promise.resolve(new Response(null, { status: 200 }));
    if (url.includes('/v1/sync?cursor=')) {
      syncRequestCount += 1;
      if (syncRequestCount === 1) return Promise.resolve(Response.json({ cursor: 0, hasMore: false, records: [] }));
      if (syncRequestCount === 2) return initialPull.promise;
      return Promise.resolve(Response.json({ cursor: remoteRecord.seq, hasMore: false, records: [] }));
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url} ${init?.method ?? 'GET'}`));
  });
  function CaptureWorkspace() {
    current = useWorkspace();
    return null;
  }
  const view = render(createElement(WorkspaceProvider, null, createElement(CaptureWorkspace)));
  await waitFor(() => expect(current?.bootState).toBe('setup'));

  const joining = current?.join('shared passphrase');
  await waitFor(() => expect(syncRequestCount).toBe(2));
  expect(current?.bootState).toBe('setup');
  expect(current?.session).toBeNull();
  expect(vi.mocked(globalThis.fetch).mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);

  initialPull.resolve(Response.json({ cursor: remoteRecord.seq, hasMore: false, records: [remoteRecord] }));
  await joining;
  await waitFor(() => expect(current?.bootState).toBe('unlocked'));
  expect(current?.snapshot.places[0]?.name).toBe('Pulled before unlock');
  view.unmount();
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

it('discovers existing remote workspace metadata', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
    id: 'workspace_remote',
    salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
    kdfIterations: 100_000,
  }));

  await expect(discoverWorkspace('a'.repeat(64))).resolves.toEqual({
    id: 'workspace_remote',
    salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
    kdfIterations: 100_000,
  });
  expect(fetchMock).toHaveBeenCalledWith('https://sync.example/v1/workspaces/discover/' + 'a'.repeat(64));
});

it('joins the existing remote workspace instead of creating another id', async () => {
  const salt = 'AAAAAAAAAAAAAAAAAAAAAA==';
  const keys = await deriveWorkspaceKeys('shared passphrase', salt, 100_000);
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    if (url.includes('/v1/workspaces/discover/')) {
      return Promise.resolve(Response.json({ id: 'workspace_remote', salt, kdfIterations: 100_000 }));
    }
    if (url.includes('/v1/sync?cursor=0')) return Promise.resolve(Response.json({ cursor: 0, hasMore: false, records: [] }));
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });

  const session = await joinWorkspace('shared passphrase');

  expect(session.workspace).toMatchObject({
    id: 'workspace_remote',
    salt,
    kdfIterations: 100_000,
    authVerifier: keys.authVerifier,
  });
  expect(await getActiveWorkspace()).toMatchObject({ id: 'workspace_remote' });
  const probe = fetchMock.mock.calls.find(([url]) => url === 'https://sync.example/v1/sync?cursor=0');
  const init = probe?.[1];
  if (!init || typeof init !== 'object' || !('headers' in init) || !(init.headers instanceof Headers)) throw new Error('Missing authentication headers');
  expect(init.headers.get('Authorization')).toBe(`Bearer ${keys.authToken}`);
  expect(init.headers.get('X-Workspace-Id')).toBe('workspace_remote');
});

it('does not persist a joined workspace when remote authentication rejects the passphrase', async () => {
  const salt = 'AAAAAAAAAAAAAAAAAAAAAA==';
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    if (url.includes('/v1/workspaces/discover/')) {
      return Promise.resolve(Response.json({ id: 'workspace_remote', salt, kdfIterations: 100_000 }));
    }
    if (url.includes('/v1/sync?cursor=0')) return Promise.resolve(new Response(null, { status: 401 }));
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });

  await expect(joinWorkspace('shared passphrase')).rejects.toThrow('authentication failed');
  expect(await getActiveWorkspace()).toBeNull();
  expect(await db.workspaces.get('workspace_remote')).toBeUndefined();
});

it('registers a discovery identifier after a successful legacy workspace unlock', async () => {
  const salt = 'AAAAAAAAAAAAAAAAAAAAAA==';
  const keys = await deriveWorkspaceKeys('shared passphrase', salt, 1_000);
  const workspace = {
    id: 'workspace_legacy',
    salt,
    kdfIterations: 1_000,
    authVerifier: keys.authVerifier,
    createdAt: 1,
    schemaVersion: 1,
  };
  await db.workspaces.add(workspace);
  const session = await unlockWorkspace('shared passphrase', workspace);
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    if (url.endsWith('/v1/workspaces')) return Promise.resolve(new Response(null, { status: 200 }));
    if (url.includes('/v1/sync?cursor=0')) return Promise.resolve(Response.json({ cursor: 0, hasMore: false, records: [] }));
    return Promise.reject(new Error(`Unexpected fetch: ${url} ${init?.method ?? 'GET'}`));
  });

  expect(await syncWorkspace(session)).toBe('synced');
  expect((await db.workspaces.get(workspace.id))?.discoveryId).toMatch(/^[a-f0-9]{64}$/);
  const registration = fetchMock.mock.calls.find(([url]) => url === 'https://sync.example/v1/workspaces');
  const init = registration?.[1];
  if (!init || typeof init !== 'object' || !('body' in init) || typeof init.body !== 'string') throw new Error('Missing registration payload');
  expect(JSON.parse(init.body) as unknown).toMatchObject({ discoveryId: session.workspace.discoveryId });
});

it('reports an error when discovery registration collides', async () => {
  const baseSession = createSession();
  const session: UnlockedWorkspace = {
    ...baseSession,
    workspace: { ...baseSession.workspace, discoveryId: 'a'.repeat(64) },
  };
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    if (url.endsWith('/v1/workspaces')) return Promise.resolve(new Response(null, { status: 409 }));
    return Promise.reject(new Error(`Sync continued after collision: ${url}`));
  });

  expect(await syncWorkspace(session)).toBe('error');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('restores the same workspace without storing a plaintext passphrase', async () => {
  const session = await createTrustedSession('shared passphrase');
  await db.workspaces.put(session.workspace);

  await rememberTrustedSession(session);

  await expect(restoreTrustedSession()).resolves.toMatchObject({
    workspace: { id: session.workspace.id },
    deviceId: session.deviceId,
    keys: { authToken: session.keys.authToken },
  });
  expect(JSON.stringify(await db.settings.toArray())).not.toContain('shared passphrase');
  expect((await restoreTrustedSession())?.keys.encryptionKey.extractable).toBe(false);
});

it('falls back to the locked active workspace when trusted boot loading fails', async () => {
  vi.stubEnv('VITE_SYNC_API', '');
  const session = await createTrustedSession('shared passphrase');
  await db.workspaces.put(session.workspace);
  await db.settings.put({ key: 'activeWorkspaceId', value: session.workspace.id });
  await rememberTrustedSession(session);
  vi.mocked(loadSnapshot).mockRejectedValueOnce(new Error('Trusted snapshot cannot be loaded'));
  let currentBootState: ReturnType<typeof useWorkspace>['bootState'] | undefined;
  let currentWorkspaceId: string | null = null;
  let hasCurrentSession = false;
  function CaptureWorkspace() {
    const current = useWorkspace();
    currentBootState = current.bootState;
    currentWorkspaceId = current.workspace?.id ?? null;
    hasCurrentSession = current.session !== null;
    return null;
  }

  const view = render(createElement(WorkspaceProvider, null, createElement(CaptureWorkspace)));

  await waitFor(() => expect(currentBootState).toBe('locked'));
  expect(currentWorkspaceId).toBe(session.workspace.id);
  expect(hasCurrentSession).toBe(false);
  await expect(restoreTrustedSession()).resolves.toBeNull();
  view.unmount();
});


it('does not restore a trusted session after provider unlock opts out', async () => {
  vi.stubEnv('VITE_SYNC_API', '');
  const session = await createTrustedSession('shared passphrase');
  await db.workspaces.put(session.workspace);
  await db.settings.put({ key: 'activeWorkspaceId', value: session.workspace.id });
  await rememberTrustedSession(session);
  let explicitLock: (() => void) | undefined;
  let explicitUnlock: ReturnType<typeof useWorkspace>['unlock'] | undefined;
  let currentBootState: ReturnType<typeof useWorkspace>['bootState'] | undefined;
  function CaptureWorkspace() {
    const current = useWorkspace();
    explicitLock = current.lock;
    explicitUnlock = current.unlock;
    currentBootState = current.bootState;
    return null;
  }

  const view = render(createElement(WorkspaceProvider, null, createElement(CaptureWorkspace)));
  await waitFor(() => expect(currentBootState).toBe('unlocked'));
  explicitLock?.();
  await waitFor(() => expect(currentBootState).toBe('locked'));

  await explicitUnlock?.('shared passphrase', false);
  await waitFor(() => expect(currentBootState).toBe('unlocked'));
  await expect(restoreTrustedSession()).resolves.toBeNull();
  view.unmount();
});

it.each([
  ['trusted restore', 'mutation'],
  ['trusted restore', 'media'],
  ['explicit unlock', 'mutation'],
  ['explicit unlock', 'media'],
] as const)('activates from %s with failed %s and retries it after activation', async (activation, failure) => {
  const passphrase = 'shared passphrase';
  const session = await createTrustedSession(passphrase);
  await db.workspaces.put(session.workspace);
  await db.settings.put({ key: 'activeWorkspaceId', value: session.workspace.id });

  if (failure === 'mutation') {
    await savePlace(session, createPlace('place_activation_retry', 'Retry after activation', session.deviceId));
    await db.mutations.where('workspaceId').equals(session.workspace.id).modify({
      attempts: 8,
      nextAttemptAt: 0,
      state: 'failed',
    });
  } else {
    await db.media.put({
      key: session.workspace.id + ':photo_activation_retry',
      workspaceId: session.workspace.id,
      id: 'photo_activation_retry',
      recordId: 'memory_activation_retry',
      contentType: 'image/jpeg',
      byteLength: 4,
      checksum: 'checksum',
      nonce: 'nonce',
      blob: new Blob([new Uint8Array([1, 2, 3, 4])]),
      createdAt: 1,
      syncState: 'failed',
    });
  }
  if (activation === 'trusted restore') await rememberTrustedSession(session);

  const retryStarted = deferred<void>();
  const releaseRetry = deferred<void>();
  let retryCount = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = requestUrl(input);
    if (url.endsWith('/v1/workspaces')) return new Response(null, { status: 200 });
    if (url.includes('/v1/sync?cursor=')) {
      return Response.json({ cursor: 0, hasMore: false, records: [] });
    }
    if ((url.includes('/v1/records/') || url.includes('/v1/media/')) && init?.method === 'PUT') {
      retryCount += 1;
      retryStarted.resolve();
      await releaseRetry.promise;
      return url.includes('/v1/records/')
        ? Response.json({ ok: true, revision: 1, cursor: 1 })
        : Response.json({ ok: true, etag: 'checksum' }, { status: 201 });
    }
    throw new Error('Unexpected fetch: ' + url + ' ' + (init?.method ?? 'GET'));
  });

  let current: ReturnType<typeof useWorkspace> | undefined;
  const observed: Array<{ bootState: string; syncStatus: string }> = [];
  function CaptureWorkspace() {
    current = useWorkspace();
    observed.push({ bootState: current.bootState, syncStatus: current.syncStatus });
    return null;
  }

  const view = render(createElement(WorkspaceProvider, null, createElement(CaptureWorkspace)));
  if (activation === 'explicit unlock') {
    await waitFor(() => expect(current?.bootState).toBe('locked'));
    await current?.unlock(passphrase);
  }

  await retryStarted.promise;
  await waitFor(() => expect(current?.bootState).toBe('unlocked'));
  expect(observed).toContainEqual({ bootState: 'unlocked', syncStatus: 'error' });
  expect(retryCount).toBe(1);

  releaseRetry.resolve();
  await waitFor(() => expect(current?.syncStatus).toBe('synced'));
  if (failure === 'mutation') {
    expect(await db.mutations.where('workspaceId').equals(session.workspace.id).count()).toBe(0);
  } else {
    expect((await db.media.get(session.workspace.id + ':photo_activation_retry'))?.syncState).toBe('synced');
  }
  view.unmount();
});
it('restores a trusted provider session and keeps foreground sync single-flight', async () => {
  const session = await createTrustedSession('shared passphrase');
  await db.workspaces.put(session.workspace);
  await rememberTrustedSession(session);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');

  let currentBootState: ReturnType<typeof useWorkspace>['bootState'] | undefined;
  let currentSyncStatus: ReturnType<typeof useWorkspace>['syncStatus'] | undefined;
  function CaptureWorkspace() {
    const current = useWorkspace();
    currentBootState = current.bootState;
    currentSyncStatus = current.syncStatus;
    return null;
  }

  const intervalSpy = vi.spyOn(window, 'setInterval');
  const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
  const windowRemoveListenerSpy = vi.spyOn(window, 'removeEventListener');
  const documentRemoveListenerSpy = vi.spyOn(document, 'removeEventListener');
  const firstRegistration = deferred<Response>();
  const foregroundRegistration = deferred<Response>();
  let registrationCount = 0;
  let pullCount = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = requestUrl(input);
    if (url.endsWith('/v1/workspaces')) {
      registrationCount += 1;
      if (registrationCount === 1) return firstRegistration.promise;
      if (registrationCount === 2) return foregroundRegistration.promise;
      return Promise.resolve(new Response(null, { status: 200 }));
    }
    if (url.includes('/v1/sync?cursor=')) {
      pullCount += 1;
      return Promise.resolve(Response.json({ cursor: 0, hasMore: false, records: [] }));
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });

  const view = render(createElement(WorkspaceProvider, null, createElement(CaptureWorkspace)));
  await waitFor(() => expect(registrationCount).toBe(1));
  expect(currentBootState).toBe('loading');
  expect(intervalSpy.mock.calls.find(([, delay]) => delay === 60_000)).toBeUndefined();

  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('online'));
  expect(registrationCount).toBe(1);

  firstRegistration.resolve(new Response(null, { status: 200 }));
  await waitFor(() => expect(pullCount).toBe(1));
  await waitFor(() => expect(currentBootState).toBe('unlocked'));
  await waitFor(() => expect(registrationCount).toBe(2));
  const foregroundInterval = intervalSpy.mock.calls.find(([, delay]) => delay === 60_000);
  expect(foregroundInterval).toBeDefined();

  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('online'));
  expect(registrationCount).toBe(2);

  foregroundRegistration.resolve(new Response(null, { status: 200 }));
  await waitFor(() => expect(pullCount).toBe(3));
  await waitFor(() => expect(currentSyncStatus).toBe('synced'));

  const intervalId = intervalSpy.mock.results.find((_, index) => intervalSpy.mock.calls[index]?.[1] === 60_000)?.value as number | undefined;
  view.unmount();
  expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
  expect(windowRemoveListenerSpy.mock.calls.filter(([type]) => type === 'online')).toHaveLength(1);
  expect(documentRemoveListenerSpy.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(1);
});
interface TestRemoteRecord {
  seq: number;
  id: string;
  kind: 'place';
  revision: number;
  updatedAt: number;
  deletedAt: number | null;
  nonce: string;
  ciphertext: string;
}

function createTestSyncServer(initial: TestRemoteRecord[] = []) {
  const records = new Map<string, TestRemoteRecord>();
  let sequence = 0;
  let nextUploadGate: { started: ReturnType<typeof deferred<void>>; released: ReturnType<typeof deferred<void>> } | null = null;
  for (const record of initial) {
    sequence = Math.max(sequence, record.seq);
    records.set(`${record.kind}:${record.id}`, record);
  }

  const server = {
    failUploads: false,
    fetch: async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
      const url = new URL(requestUrl(input));
      if (url.pathname === '/v1/workspaces') return new Response(null, { status: 200 });
      if (url.pathname === '/v1/sync') {
        const cursor = Number(url.searchParams.get('cursor') ?? 0);
        const changes = [...records.values()].filter((record) => record.seq > cursor).sort((left, right) => left.seq - right.seq);
        return Response.json({
          cursor: changes.at(-1)?.seq ?? cursor,
          hasMore: false,
          records: changes,
        });
      }
      if (url.pathname.startsWith('/v1/records/') && init?.method === 'PUT') {
        if (server.failUploads) return new Response(null, { status: 503 });
        if (typeof init.body !== 'string') throw new Error('Expected a JSON record upload');
        const [, , , kind, id] = url.pathname.split('/');
        if (kind !== 'place' || !id) throw new Error(`Unexpected record route: ${url.pathname}`);
        const body = JSON.parse(init.body) as Omit<TestRemoteRecord, 'seq' | 'id' | 'kind'> & { baseRevision: number };
        const current = records.get(`${kind}:${id}`);
        if ((current?.revision ?? 0) !== body.baseRevision) {
          return Response.json({ error: 'revision_conflict', currentRevision: current?.revision ?? 0 }, { status: 409 });
        }
        const gate = nextUploadGate;
        nextUploadGate = null;
        if (gate) {
          gate.started.resolve();
          await gate.released.promise;
        }
        const record: TestRemoteRecord = {
          seq: ++sequence,
          id,
          kind,
          revision: body.revision,
          updatedAt: body.updatedAt,
          deletedAt: body.deletedAt,
          nonce: body.nonce,
          ciphertext: body.ciphertext,
        };
        records.set(`${kind}:${id}`, record);
        return Response.json({ ok: true, revision: record.revision, cursor: record.seq });
      }
      throw new Error(`Unexpected fetch: ${url.toString()} ${init?.method ?? 'GET'}`);
    },
    blockNextUpload() {
      const started = deferred<void>();
      const released = deferred<void>();
      nextUploadGate = { started, released };
      return { started: started.promise, release: () => released.resolve() };
    },
    getRecord(kind: string, id: string) {
      return records.get(`${kind}:${id}`);
    },
    setRecord(record: TestRemoteRecord) {
      const next = { ...record, seq: ++sequence };
      records.set(`${next.kind}:${next.id}`, next);
    },
  };
  return server;
}

async function encryptRemotePlace(session: UnlockedWorkspace, place: Place, revision: number): Promise<TestRemoteRecord> {
  const value = { ...place, revision, updatedAt: revision * 1_000 };
  const envelope = await encryptJson(value, session.keys.encryptionKey, recordAssociatedData('place', place.id, revision));
  return {
    seq: revision,
    id: place.id,
    kind: 'place',
    revision,
    updatedAt: value.updatedAt,
    deletedAt: value.deletedAt,
    nonce: envelope.nonce,
    ciphertext: envelope.ciphertext,
  };
}

function createPlace(id: string, name: string, deviceId: string): Place {
  return {
    id,
    name,
    category: 'other',
    note: '',
    lat: 30.54,
    lng: 114.36,
    createdAt: 1,
    updatedAt: 1,
    revision: 0,
    deviceId,
    deletedAt: null,
  };
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (input instanceof Request) return input.url;
  if (input instanceof URL) return input.href;
  return input;
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
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

async function createTrustedSession(passphrase: string): Promise<UnlockedWorkspace> {
  const salt = 'AAAAAAAAAAAAAAAAAAAAAA==';
  const keys = await deriveWorkspaceKeys(passphrase, salt, 1_000);
  return {
    workspace: {
      id: 'workspace_trusted',
      salt,
      kdfIterations: 1_000,
      authVerifier: keys.authVerifier,
      createdAt: 1,
      schemaVersion: 1,
    },
    keys,
    deviceId: 'device_trusted',
  };
}
