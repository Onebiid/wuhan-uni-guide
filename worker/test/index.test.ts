import { exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

const origin = 'https://onebiid.github.io';
let workspaceId = '';
let authToken = '';
let discoveryId = '';

beforeEach(async () => {
  workspaceId = `workspace_${crypto.randomUUID().replaceAll('-', '')}`;
  const bytes = new Uint8Array(32);
  bytes.fill(7);
  authToken = bytesToBase64(bytes);
  discoveryId = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const response = await request('/v1/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ id: workspaceId, salt: bytesToBase64(new Uint8Array(16).fill(3)), authVerifier: bytesToBase64(digest), kdfIterations: 600_000, discoveryId }),
  });
  expect(response.status).toBe(201);
});

describe('sync worker', () => {
  it('discovers public key-derivation metadata without exposing the verifier', async () => {
    const response = await request(`/v1/workspaces/discover/${discoveryId}`, { headers: { Origin: origin } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: workspaceId, salt: bytesToBase64(new Uint8Array(16).fill(3)), kdfIterations: 600_000 });
  });

  it('does not reveal whether an invalid discovery identifier exists', async () => {
    expect((await request('/v1/workspaces/discover/not-valid', { headers: { Origin: origin } })).status).toBe(404);
  });

  it('adds discovery metadata to an existing workspace only when its verifier matches', async () => {
    const existingWorkspaceId = `workspace_${crypto.randomUUID().replaceAll('-', '')}`;
    const salt = bytesToBase64(new Uint8Array(16).fill(6));
    const verifier = bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(32).fill(8))));
    const newDiscoveryId = bytesToHex(new Uint8Array(32).fill(10));
    const existing = await request('/v1/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ id: existingWorkspaceId, salt, authVerifier: verifier, kdfIterations: 600_000 }),
    });
    expect(existing.status).toBe(201);

    const rejected = await request('/v1/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ id: existingWorkspaceId, salt, authVerifier: bytesToBase64(new Uint8Array(32).fill(4)), kdfIterations: 600_000, discoveryId: newDiscoveryId }),
    });
    expect(rejected.status).toBe(409);
    expect((await request(`/v1/workspaces/discover/${newDiscoveryId}`, { headers: { Origin: origin } })).status).toBe(404);

    const attached = await request('/v1/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ id: existingWorkspaceId, salt, authVerifier: verifier, kdfIterations: 600_000, discoveryId: newDiscoveryId }),
    });
    expect(attached.status).toBe(200);
    expect(await (await request(`/v1/workspaces/discover/${newDiscoveryId}`, { headers: { Origin: origin } })).json()).toEqual({ id: existingWorkspaceId, salt, kdfIterations: 600_000 });
  });
  it('rejects origins outside the deployment allowlist', async () => {
    const response = await request('/health', { headers: { Origin: 'https://attacker.example' } });
    expect(response.status).toBe(403);
  });

  it('requires a valid workspace authentication token', async () => {
    const response = await request('/v1/sync?cursor=0', { headers: { Origin: origin, 'X-Workspace-Id': workspaceId, Authorization: 'Bearer wrong' } });
    expect(response.status).toBe(401);
  });

  it('writes a conditional encrypted record and returns it incrementally', async () => {
    const payload = { baseRevision: 0, revision: 1, updatedAt: 1_000, deletedAt: null, nonce: bytesToBase64(new Uint8Array(12).fill(1)), ciphertext: bytesToBase64(new Uint8Array([1, 2, 3, 4])) };
    const write = await request('/v1/records/place/place_one', authRequest({ method: 'PUT', body: JSON.stringify(payload) }));
    expect(write.status).toBe(200);
    const conflict = await request('/v1/records/place/place_one', authRequest({ method: 'PUT', body: JSON.stringify(payload) }));
    expect(conflict.status).toBe(409);
    const sync = await request('/v1/sync?cursor=0', authRequest());
    const body = await sync.json<{ records: Array<{ id: string; revision: number }>; cursor: number }>();
    expect(sync.status).toBe(200);
    expect(body.records.some((record) => record.id === 'place_one' && record.revision === 1)).toBe(true);
    expect(body.cursor).toBeGreaterThan(0);
  });

  it('rejects media without encryption metadata', async () => {
    const response = await request('/v1/media/memory_one/photo_one', authRequest({ method: 'PUT', body: new Uint8Array([1, 2, 3]) }));
    expect(response.status).toBe(400);
  });

  it('rejects media declared above the 5MB limit before buffering', async () => {
    const init = authRequest({ method: 'PUT', body: new Uint8Array([1]) });
    const headers = new Headers(init.headers);
    headers.set('Content-Length', String(5 * 1024 * 1024 + 1));
    headers.set('X-Media-Nonce', bytesToBase64(new Uint8Array(12).fill(1)));
    headers.set('X-Media-Checksum', bytesToBase64(new Uint8Array(32).fill(2)));
    const response = await request('/v1/media/memory_one/photo_one', { ...init, headers });
    expect(response.status).toBe(413);
  });
  it('stores, returns, and deletes encrypted media with stable metadata', async () => {
    const encrypted = new Uint8Array([11, 22, 33, 44]);
    const nonce = bytesToBase64(new Uint8Array(12).fill(4));
    const checksum = bytesToBase64(new Uint8Array(32).fill(5));
    const headers = new Headers(authRequest().headers);
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Content-Length', String(encrypted.byteLength));
    headers.set('X-Media-Nonce', nonce);
    headers.set('X-Media-Checksum', checksum);
    headers.set('X-Plaintext-Type', 'image/jpeg');

    const put = await request('/v1/media/memory_one/photo_one', { method: 'PUT', headers, body: encrypted });
    expect(put.status).toBe(201);
    expect(await put.json()).toEqual({ ok: true, etag: checksum });

    const get = await request('/v1/media/memory_one/photo_one', authRequest());
    expect(get.status).toBe(200);
    expect(get.headers.get('X-Media-Nonce')).toBe(nonce);
    expect(get.headers.get('X-Media-Checksum')).toBe(checksum);
    expect(get.headers.get('X-Plaintext-Type')).toBe('image/jpeg');
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(encrypted);

    expect((await request('/v1/media/memory_one/photo_one', authRequest({ method: 'DELETE' }))).status).toBe(204);
    expect((await request('/v1/media/memory_one/photo_one', authRequest())).status).toBe(404);
  });
});

function authRequest(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set('Origin', origin);
  headers.set('X-Workspace-Id', workspaceId);
  headers.set('Authorization', `Bearer ${authToken}`);
  headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');
  return { ...init, headers };
}

function request(path: string, init?: RequestInit): Promise<Response> {
  return exports.default.fetch(new Request(`https://sync.example${path}`, init));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
