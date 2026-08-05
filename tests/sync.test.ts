import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { render, waitFor } from '@testing-library/react';
import { useWorkspace, WorkspaceProvider } from '../src/app/WorkspaceContext';
import { db } from '../src/data/database';
import {
  getActiveWorkspace,
  joinWorkspace,
  loadSnapshot,
  rememberTrustedSession,
  restoreTrustedSession,
  unlockWorkspace,
  type UnlockedWorkspace,
} from '../src/data/repository';
import type * as RepositoryModule from '../src/data/repository';
import { deriveWorkspaceKeys } from '../src/security/crypto';
import { discoverWorkspace, syncWorkspace } from '../src/services/sync';

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

it('restores a trusted provider session and keeps foreground sync single-flight', async () => {
  const session = await createTrustedSession('shared passphrase');
  await db.workspaces.put(session.workspace);
  await rememberTrustedSession(session);
  const actualRepository = await vi.importActual<typeof RepositoryModule>('../src/data/repository');
  let snapshotLoadCount = 0;
  let markLocalReloadStarted: (() => void) | undefined;
  const localReloadStarted = new Promise<void>((resolve) => { markLocalReloadStarted = resolve; });
  let releaseLocalReload: (() => void) | undefined;
  const localReloadGate = new Promise<void>((resolve) => { releaseLocalReload = resolve; });
  vi.mocked(loadSnapshot).mockImplementation(async (activeSession) => {
    snapshotLoadCount += 1;
    if (snapshotLoadCount === 4) {
      markLocalReloadStarted?.();
      await localReloadGate;
    }
    return actualRepository.loadSnapshot(activeSession);
  });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  let explicitLock: (() => void) | undefined;
  let explicitUnlock: ReturnType<typeof useWorkspace>['unlock'] | undefined;
  let currentBootState: ReturnType<typeof useWorkspace>['bootState'] | undefined;
  let currentSyncStatus: ReturnType<typeof useWorkspace>['syncStatus'] | undefined;
  function CaptureWorkspace() {
    const current = useWorkspace();
    explicitLock = current.lock;
    explicitUnlock = current.unlock;
    currentBootState = current.bootState;
    currentSyncStatus = current.syncStatus;
    return null;
  }
  const intervalSpy = vi.spyOn(window, 'setInterval');
  const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
  const windowAddListenerSpy = vi.spyOn(window, 'addEventListener');
  const windowRemoveListenerSpy = vi.spyOn(window, 'removeEventListener');
  const documentAddListenerSpy = vi.spyOn(document, 'addEventListener');
  const documentRemoveListenerSpy = vi.spyOn(document, 'removeEventListener');
  let finishFirstRegistration: ((response: Response) => void) | undefined;
  const firstRegistration = new Promise<Response>((resolve) => { finishFirstRegistration = resolve; });
  let registrationCount = 0;
  let pullCount = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    if (url.endsWith('/v1/workspaces')) {
      registrationCount += 1;
      if (registrationCount === 1) return firstRegistration;
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
  const foregroundInterval = intervalSpy.mock.calls.find(([, delay]) => delay === 60_000);
  expect(foregroundInterval).toBeDefined();

  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('online'));
  expect(registrationCount).toBe(1);

  finishFirstRegistration?.(new Response(null, { status: 200 }));
  await waitFor(() => expect(pullCount).toBe(1));
  await waitFor(() => expect(currentSyncStatus).toBe('synced'));

  const intervalCallback = foregroundInterval?.[0];
  if (typeof intervalCallback !== 'function') throw new Error('Missing foreground interval callback');
  intervalCallback();
  await waitFor(() => expect(registrationCount).toBe(2));
  await waitFor(() => expect(pullCount).toBe(2));
  await waitFor(() => expect(currentSyncStatus).toBe('synced'));

  document.dispatchEvent(new Event('visibilitychange'));
  await waitFor(() => expect(registrationCount).toBe(3));
  await waitFor(() => expect(pullCount).toBe(3));
  await localReloadStarted;
  await waitFor(() => expect(currentSyncStatus).toBe('syncing'));

  const intervalId = intervalSpy.mock.results.find((_, index) => intervalSpy.mock.calls[index]?.[1] === 60_000)?.value as number | undefined;
  explicitLock?.();
  await waitFor(async () => {
    expect(await restoreTrustedSession()).toBeNull();
    expect(currentBootState).toBe('locked');
    expect(currentSyncStatus).toBe('pending');
  });
  await waitFor(() => expect(windowRemoveListenerSpy.mock.calls.filter(([type]) => type === 'online')).toHaveLength(1));
  await waitFor(() => expect(documentRemoveListenerSpy.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(1));

  await explicitUnlock?.('shared passphrase');
  await waitFor(() => expect(currentBootState).toBe('unlocked'));
  await waitFor(() => expect(windowAddListenerSpy.mock.calls.filter(([type]) => type === 'online')).toHaveLength(2));
  await waitFor(() => expect(documentAddListenerSpy.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(2));
  releaseLocalReload?.();
  await waitFor(() => expect(registrationCount).toBe(4));
  await waitFor(() => expect(pullCount).toBe(4));
  await waitFor(() => expect(currentSyncStatus).toBe('synced'));

  explicitLock?.();
  await waitFor(() => expect(currentBootState).toBe('locked'));
  await waitFor(() => expect(windowRemoveListenerSpy.mock.calls.filter(([type]) => type === 'online')).toHaveLength(2));
  await waitFor(() => expect(documentRemoveListenerSpy.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(2));
  await explicitUnlock?.('shared passphrase');
  await waitFor(() => expect(currentBootState).toBe('unlocked'));
  await waitFor(() => expect(registrationCount).toBe(5));
  await waitFor(() => expect(pullCount).toBe(5));
  await waitFor(() => expect(currentSyncStatus).toBe('synced'));

  view.unmount();
  expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
  expect(windowAddListenerSpy.mock.calls.filter(([type]) => type === 'online')).toHaveLength(3);
  expect(windowRemoveListenerSpy.mock.calls.filter(([type]) => type === 'online')).toHaveLength(3);
  expect(documentAddListenerSpy.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(3);
  expect(documentRemoveListenerSpy.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(3);
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
