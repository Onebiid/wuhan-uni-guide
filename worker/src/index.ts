import { timingSafeEqual } from 'node:crypto';
import { Hono, type Context, type Input } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';

type Variables = { workspaceId: string; requestId: string };
type AppBindings = { Bindings: Env; Variables: Variables };
const app = new Hono<AppBindings>();

const idPattern = /^[a-zA-Z0-9_-]{1,128}$/;
const discoveryPattern = /^[a-f0-9]{64}$/;
const base64Pattern = /^[a-zA-Z0-9+/]+={0,2}$/;
const workspaceSchema = z.object({
  id: z.string().regex(idPattern),
  salt: z.string().min(20).max(64).regex(base64Pattern),
  authVerifier: z.string().min(40).max(64).regex(base64Pattern),
  kdfIterations: z.number().int().min(100_000).max(2_000_000),
  discoveryId: z.string().regex(discoveryPattern).optional(),
});
const recordSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable(),
  nonce: z.string().min(16).max(32).regex(base64Pattern),
  ciphertext: z.string().min(1).max(900_000).regex(base64Pattern),
}).refine((value) => value.revision === value.baseRevision + 1, { message: 'revision must equal baseRevision + 1' });
const recordKinds = new Set(['place', 'memory', 'settings', 'playlist']);
const MAX_JSON_BYTES = 950_000;
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

interface MediaMetadata {
  nonce: string;
  checksum: string;
  contentType: string;
  recordId: string;
  byteLength: number;
}

app.use('*', secureHeaders({ xFrameOptions: 'DENY', referrerPolicy: 'no-referrer', crossOriginResourcePolicy: 'same-site' }));
app.use('*', async (context, next) => {
  const requestId = crypto.randomUUID();
  context.set('requestId', requestId);
  const origin = context.req.header('Origin');
  const allowedOrigin = resolveAllowedOrigin(origin, context.env.ALLOWED_ORIGINS);
  if (origin && !allowedOrigin) return jsonError(context, 403, 'origin_not_allowed');
  if (context.req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
  }
  await next();
  corsHeaders(allowedOrigin).forEach((value, key) => context.res.headers.set(key, value));
  context.res.headers.set('X-Request-Id', requestId);
});
app.use('*', async (context, next) => {
  const started = Date.now();
  await next();
  console.log(JSON.stringify({ message: 'request', requestId: context.get('requestId'), method: context.req.method, route: context.req.routePath || context.req.path, status: context.res.status, durationMs: Date.now() - started }));
});

app.get('/health', (context) => context.json({ ok: true, service: 'whu-couple-map-sync', version: 1 }));

app.post('/v1/workspaces', async (context) => {
  const body = await readBoundedJson(context.req.raw, 4_096);
  const parsed = workspaceSchema.safeParse(body);
  if (!parsed.success) return jsonError(context, 400, 'invalid_workspace');
  const allowed = await context.env.SYNC_RATE_LIMITER.limit({ key: `setup:${parsed.data.id}` });
  if (!allowed.success) return jsonError(context, 429, 'rate_limited');
  try {
    await context.env.DB.prepare(
      'INSERT INTO workspaces (id, auth_verifier, salt, kdf_iterations, discovery_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(parsed.data.id, parsed.data.authVerifier, parsed.data.salt, parsed.data.kdfIterations, parsed.data.discoveryId ?? null, Date.now()).run();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('UNIQUE') || !parsed.data.discoveryId) {
      if (error instanceof Error && error.message.includes('UNIQUE')) return jsonError(context, 409, 'workspace_exists');
      throw error;
    }
    const existing = await context.env.DB.prepare('SELECT auth_verifier FROM workspaces WHERE id = ?').bind(parsed.data.id).first<{ auth_verifier: string }>();
    if (!existing || !verifiersMatch(parsed.data.authVerifier, existing.auth_verifier)) return jsonError(context, 409, 'workspace_exists');
    try {
      await context.env.DB.prepare('UPDATE workspaces SET discovery_id = ? WHERE id = ?').bind(parsed.data.discoveryId, parsed.data.id).run();
    } catch (updateError) {
      if (updateError instanceof Error && updateError.message.includes('UNIQUE')) return jsonError(context, 409, 'workspace_exists');
      throw updateError;
    }
    return context.json({ ok: true }, 200);
  }
  return context.json({ ok: true }, 201);
});

app.get('/v1/workspaces/discover/:discoveryId', async (context) => {
  const discoveryId = context.req.param('discoveryId');
  if (!discoveryPattern.test(discoveryId)) return jsonError(context, 404, 'workspace_not_found');
  const allowed = await context.env.SYNC_RATE_LIMITER.limit({ key: `discover:${discoveryId}` });
  if (!allowed.success) return jsonError(context, 429, 'rate_limited');
  const row = await context.env.DB.prepare(
    'SELECT id, salt, kdf_iterations FROM workspaces WHERE discovery_id = ?',
  ).bind(discoveryId).first<{ id: string; salt: string; kdf_iterations: number }>();
  if (!row) return jsonError(context, 404, 'workspace_not_found');
  return context.json({ id: row.id, salt: row.salt, kdfIterations: row.kdf_iterations });
});
app.use('/v1/*', async (context, next) => {
  if ((context.req.path === '/v1/workspaces' && context.req.method === 'POST') || (context.req.path.startsWith('/v1/workspaces/discover/') && context.req.method === 'GET')) return next();
  const workspaceId = context.req.header('X-Workspace-Id') ?? '';
  const authorization = context.req.header('Authorization') ?? '';
  if (!idPattern.test(workspaceId) || !authorization.startsWith('Bearer ')) return jsonError(context, 401, 'unauthorized');
  const allowed = await context.env.SYNC_RATE_LIMITER.limit({ key: workspaceId });
  if (!allowed.success) return jsonError(context, 429, 'rate_limited');
  const workspace = await context.env.DB.prepare('SELECT auth_verifier FROM workspaces WHERE id = ?').bind(workspaceId).first<{ auth_verifier: string }>();
  if (!workspace || !(await verifyAuthToken(authorization.slice(7), workspace.auth_verifier))) return jsonError(context, 401, 'unauthorized');
  context.set('workspaceId', workspaceId);
  return next();
});

app.get('/v1/sync', async (context) => {
  const cursor = parseCursor(context.req.query('cursor'));
  if (cursor === null) return jsonError(context, 400, 'invalid_cursor');
  const workspaceId = context.get('workspaceId');
  const result = await context.env.DB.prepare(`
    SELECT c.seq, r.record_id, r.kind, r.revision, r.updated_at, r.deleted_at, r.nonce, r.ciphertext
    FROM changes c
    JOIN records r ON r.workspace_id = c.workspace_id AND r.record_id = c.record_id AND r.kind = c.kind
    WHERE c.workspace_id = ? AND c.seq > ?
    ORDER BY c.seq ASC
    LIMIT 201
  `).bind(workspaceId, cursor).all<ChangeRow>();
  const hasMore = result.results.length > 200;
  const rows = result.results.slice(0, 200);
  return context.json({ cursor: rows.at(-1)?.seq ?? cursor, hasMore, records: rows.map(toApiRecord) });
});

app.put('/v1/records/:kind/:id', async (context) => {
  const kind = context.req.param('kind');
  const id = context.req.param('id');
  if (!recordKinds.has(kind) || !idPattern.test(id)) return jsonError(context, 404, 'record_route_not_found');
  const parsed = recordSchema.safeParse(await readBoundedJson(context.req.raw, MAX_JSON_BYTES));
  if (!parsed.success) return jsonError(context, 400, 'invalid_record');
  const workspaceId = context.get('workspaceId');
  const value = parsed.data;
  const result = await context.env.DB.prepare(`
    INSERT INTO records (workspace_id, record_id, kind, revision, updated_at, deleted_at, nonce, ciphertext)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, record_id, kind) DO UPDATE SET
      revision = excluded.revision,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at,
      nonce = excluded.nonce,
      ciphertext = excluded.ciphertext
    WHERE records.revision = ?
  `).bind(workspaceId, id, kind, value.revision, value.updatedAt, value.deletedAt, value.nonce, value.ciphertext, value.baseRevision).run();
  if ((result.meta.changes ?? 0) === 0) {
    const current = await context.env.DB.prepare('SELECT revision FROM records WHERE workspace_id = ? AND record_id = ? AND kind = ?').bind(workspaceId, id, kind).first<{ revision: number }>();
    return context.json({ error: 'revision_conflict', currentRevision: current?.revision ?? 0 }, 409);
  }
  const cursor = await context.env.DB.prepare('SELECT MAX(seq) AS cursor FROM changes WHERE workspace_id = ?').bind(workspaceId).first<{ cursor: number | null }>();
  return context.json({ ok: true, revision: value.revision, cursor: cursor?.cursor ?? 0 });
});

app.put('/v1/media/:recordId/:mediaId', async (context) => {
  const workspaceId = context.get('workspaceId');
  const recordId = context.req.param('recordId');
  const mediaId = context.req.param('mediaId');
  if (!idPattern.test(recordId) || !idPattern.test(mediaId)) return jsonError(context, 400, 'invalid_media_id');
  const length = Number.parseInt(context.req.header('Content-Length') ?? '', 10);
  if (!Number.isFinite(length) || length <= 0 || length > MAX_MEDIA_BYTES) return jsonError(context, 413, 'media_too_large');
  const nonce = context.req.header('X-Media-Nonce') ?? '';
  const checksum = context.req.header('X-Media-Checksum') ?? '';
  const contentType = context.req.header('X-Plaintext-Type') ?? 'application/octet-stream';
  if (!base64Pattern.test(nonce) || !base64Pattern.test(checksum) || contentType.length > 120) return jsonError(context, 400, 'invalid_media_metadata');
  const body = await context.req.raw.arrayBuffer();
  if (body.byteLength !== length) return jsonError(context, 400, 'media_length_mismatch');
  const key = mediaKey(workspaceId, recordId, mediaId);
  const metadata: MediaMetadata = { nonce, checksum, contentType, recordId, byteLength: body.byteLength };
  await context.env.MEDIA.put(key, body, { metadata });
  return context.json({ ok: true, etag: checksum }, 201);
});

app.get('/v1/media/:recordId/:mediaId', async (context) => {
  const recordId = context.req.param('recordId');
  const mediaId = context.req.param('mediaId');
  if (!idPattern.test(recordId) || !idPattern.test(mediaId)) return jsonError(context, 400, 'invalid_media_id');
  const object = await context.env.MEDIA.getWithMetadata<MediaMetadata>(mediaKey(context.get('workspaceId'), recordId, mediaId), 'stream');
  if (!object.value || !object.metadata) return jsonError(context, 404, 'media_not_found');
  const headers = new Headers({
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(object.metadata.byteLength),
    'Cache-Control': 'private, no-store',
    ETag: `"${object.metadata.checksum}"`,
    'X-Media-Nonce': object.metadata.nonce,
    'X-Media-Checksum': object.metadata.checksum,
    'X-Plaintext-Type': object.metadata.contentType,
  });
  return new Response(object.value, { headers });
});

app.delete('/v1/media/:recordId/:mediaId', async (context) => {
  const recordId = context.req.param('recordId');
  const mediaId = context.req.param('mediaId');
  if (!idPattern.test(recordId) || !idPattern.test(mediaId)) return jsonError(context, 400, 'invalid_media_id');
  await context.env.MEDIA.delete(mediaKey(context.get('workspaceId'), recordId, mediaId));
  return context.body(null, 204);
});

app.notFound((context) => jsonError(context, 404, 'not_found'));
app.onError((error, context) => {
  if (error instanceof HTTPException) return jsonError(context, error.status, error.code);
  console.error(JSON.stringify({ message: 'unhandled_error', requestId: context.get('requestId'), error: error.message }));
  return jsonError(context, 500, 'internal_error');
});

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanExpiredTombstones(env));
  },
} satisfies ExportedHandler<Env>;

interface ChangeRow {
  seq: number;
  record_id: string;
  kind: string;
  revision: number;
  updated_at: number;
  deleted_at: number | null;
  nonce: string;
  ciphertext: string;
}

function toApiRecord(row: ChangeRow) {
  return { seq: row.seq, id: row.record_id, kind: row.kind, revision: row.revision, updatedAt: row.updated_at, deletedAt: row.deleted_at, nonce: row.nonce, ciphertext: row.ciphertext };
}

async function readBoundedJson(request: Request, limit: number): Promise<unknown> {
  const declared = Number.parseInt(request.headers.get('Content-Length') ?? '0', 10);
  if (declared > limit) throw new HTTPException(413, 'payload_too_large');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > limit) throw new HTTPException(413, 'payload_too_large');
  try { return JSON.parse(text) as unknown; } catch { throw new HTTPException(400, 'invalid_json'); }
}

class HTTPException extends Error {
  constructor(readonly status: 400 | 413, readonly code: string) { super(code); }
}

function resolveAllowedOrigin(origin: string | undefined, configured: string): string | null {
  if (!origin) return null;
  return configured.split(',').map((value) => value.trim()).includes(origin) ? origin : null;
}

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({ Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Workspace-Id,X-Media-Nonce,X-Media-Checksum,X-Plaintext-Type', 'Access-Control-Expose-Headers': 'ETag,X-Media-Nonce,X-Media-Checksum,X-Plaintext-Type', 'Access-Control-Max-Age': '86400' });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function jsonError<P extends string, I extends Input>(context: Context<AppBindings, P, I>, status: ContentfulStatusCode, code: string): Response {
  return context.json({ error: code, requestId: context.get('requestId') }, status);
}

function parseCursor(value: string | undefined): number | null {
  const cursor = Number.parseInt(value ?? '0', 10);
  return Number.isFinite(cursor) && cursor >= 0 ? cursor : null;
}

function verifiersMatch(providedVerifier: string, expectedVerifier: string): boolean {
  try {
    const provided = base64ToBytes(providedVerifier);
    const expected = base64ToBytes(expectedVerifier);
    return provided.byteLength === expected.byteLength && timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}
async function verifyAuthToken(token: string, expectedVerifier: string): Promise<boolean> {
  try {
    const tokenBytes = base64ToBytes(token);
    const provided = new Uint8Array(await crypto.subtle.digest('SHA-256', tokenBytes));
    const expected = base64ToBytes(expectedVerifier);
    if (provided.byteLength !== expected.byteLength) return false;
    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function mediaKey(workspaceId: string, recordId: string, mediaId: string): string {
  return `${workspaceId}/${recordId}/${mediaId}`;
}

async function cleanExpiredTombstones(env: Env): Promise<void> {
  const cutoff = Date.now() - 30 * 86_400_000;
  const expired = await env.DB.prepare('SELECT workspace_id, record_id, kind FROM records WHERE deleted_at IS NOT NULL AND deleted_at < ? LIMIT 100').bind(cutoff).all<{ workspace_id: string; record_id: string; kind: string }>();
  for (const record of expired.results) {
    if (record.kind === 'memory') await deleteMediaPrefix(env.MEDIA, `${record.workspace_id}/${record.record_id}/`);
    await env.DB.prepare('DELETE FROM records WHERE workspace_id = ? AND record_id = ? AND kind = ?').bind(record.workspace_id, record.record_id, record.kind).run();
  }
  await env.DB.prepare('DELETE FROM changes WHERE changed_at < ? AND seq NOT IN (SELECT MAX(seq) FROM changes GROUP BY workspace_id, record_id, kind)').bind(cutoff).run();
}

async function deleteMediaPrefix(namespace: KVNamespace, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const listed = await namespace.list(cursor ? { prefix, cursor, limit: 1000 } : { prefix, limit: 1000 });
    await Promise.all(listed.keys.map((key) => namespace.delete(key.name)));
    cursor = listed.list_complete ? undefined : listed.cursor;
  } while (cursor);
}
