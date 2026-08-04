# No-Card Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy full cross-device synchronization for encrypted records and photos without R2 or a payment card.

**Architecture:** D1 remains authoritative for workspaces, revisions, and change cursors. Workers KV replaces R2 behind the existing `/v1/media` routes, while IndexedDB remains the immediate local source and retries failed media uploads on later sync runs.

**Tech Stack:** React 19, TypeScript, Dexie, Hono, Cloudflare Workers, D1, Workers KV, Vitest, Wrangler 4.

## Global Constraints

- Keep client-side AES-GCM encryption; Cloudflare never receives plaintext media or encryption keys.
- Preserve the existing media HTTP routes and 5 MiB upload limit.
- Use the existing `MEDIA` binding name so frontend contracts do not change.
- Keep GitHub Pages at `/wuhan-uni-guide/` and allow only `https://onebiid.github.io` plus existing local origins.
- Do not require R2, a payment card, or a second cloud provider.

---

### Task 1: Replace R2 With Workers KV

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `worker/src/index.ts`
- Modify: `worker/test/index.test.ts`
- Regenerate: `worker-configuration.d.ts`

**Interfaces:**
- Consumes: existing `mediaKey(workspaceId, recordId, mediaId)` and authenticated media routes.
- Produces: KV metadata `{ nonce, checksum, contentType, recordId, byteLength }` and unchanged upload/download/delete responses.

- [ ] **Step 1: Write the failing KV media round-trip test**

Add this test inside `describe('sync worker', ...)`:

```ts
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
```

- [ ] **Step 2: Run the Worker test and verify the R2 response fails the stable-etag assertion**

Run: `npm.cmd run worker:test`

Expected: the new test fails because R2 returns its own HTTP ETag instead of `checksum`.

- [ ] **Step 3: Remove the R2 binding and create the KV namespace**

Delete `r2_buckets` from `wrangler.jsonc`, then run:

```powershell
npx.cmd wrangler kv namespace create whu-couple-map-media --binding MEDIA --update-config
```

Expected: Cloudflare creates one namespace and Wrangler writes a `kv_namespaces` entry with binding `MEDIA` and its concrete ID.

- [ ] **Step 4: Implement the KV-backed media routes**

Add the metadata type:

```ts
interface MediaMetadata {
  nonce: string;
  checksum: string;
  contentType: string;
  recordId: string;
  byteLength: number;
}
```

Replace the R2 write with:

```ts
const metadata: MediaMetadata = { nonce, checksum, contentType, recordId, byteLength: body.byteLength };
await context.env.MEDIA.put(key, body, { metadata });
return context.json({ ok: true, etag: checksum }, 201);
```

Replace the R2 read with:

```ts
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
```

Keep deletion as `await context.env.MEDIA.delete(mediaKey(...))` because the KV and R2 method names match.

- [ ] **Step 5: Regenerate types and verify Worker behavior**

Run:

```powershell
npm.cmd run worker:types
npm.cmd run worker:typecheck
npm.cmd run worker:test
npm.cmd run worker:check
```

Expected: generated `Env.MEDIA` is `KVNamespace`; all Worker tests and dry-run pass.

- [ ] **Step 6: Commit the backend change**

```powershell
git add wrangler.jsonc worker-configuration.d.ts worker/src/index.ts worker/test/index.test.ts
git commit -m "feat: sync encrypted media through workers kv"
```

---

### Task 2: Retry Failed Media Uploads

**Files:**
- Create: `tests/sync.test.ts`
- Modify: `src/services/sync.ts`

**Interfaces:**
- Consumes: `EncryptedMedia.syncState` and the public `syncWorkspace(session)` workflow.
- Produces: every media row whose state is not `synced` is retried on a later sync run.

- [ ] **Step 1: Write the failing retry test**

Create `tests/sync.test.ts` with a workspace from `createWorkspace`, seed one encrypted media row with `syncState: 'failed'`, stub `fetch` for workspace registration, media upload, and an empty pull response, then call `syncWorkspace(session)` and assert the media PUT occurred and the row becomes `synced`.

The core assertions are:

```ts
expect(fetchMock).toHaveBeenCalledWith(
  expect.stringContaining('/v1/media/memory_one/photo_one'),
  expect.objectContaining({ method: 'PUT' }),
);
expect((await db.media.get(`${session.workspace.id}:photo_one`))?.syncState).toBe('synced');
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx.cmd vitest run tests/sync.test.ts`

Expected: FAIL because `pushMedia` currently selects only `syncState === 'pending'`.

- [ ] **Step 3: Include failed rows in subsequent sync attempts**

Change the media query predicate in `pushMedia` to:

```ts
.and((item) => item.syncState !== 'synced')
```

Keep failed writes marked `failed`; the next `syncWorkspace` invocation will now retry them.

- [ ] **Step 4: Run frontend and full release checks**

```powershell
npx.cmd vitest run tests/sync.test.ts
npm.cmd run check
npm.cmd audit
```

Expected: focused test passes, the full suite/build/dry-run passes, and audit reports zero vulnerabilities.

- [ ] **Step 5: Commit the client retry change**

```powershell
git add src/services/sync.ts tests/sync.test.ts
git commit -m "fix: retry failed encrypted media sync"
```

---

### Task 3: Deploy Worker And Republish GitHub Pages

**Files:**
- Local ignored config: `.env.production.local`
- Generated deployment files: `dist/**`

**Interfaces:**
- Consumes: deployed Worker URL from Wrangler and the existing GitHub Pages `/wuhan-uni-guide/` base.
- Produces: a live HTTPS sync API and a Pages build configured to call it.

- [ ] **Step 1: Confirm D1 migration state and deploy the Worker**

```powershell
npx.cmd wrangler d1 migrations list whu-couple-map --remote
npx.cmd wrangler deploy
```

Expected: `0001_initial.sql` is applied and Wrangler prints the HTTPS URL for `whu-couple-map-sync`.

- [ ] **Step 2: Configure the production frontend without committing secrets**

Write `.env.production.local` with:

```dotenv
VITE_BASE_PATH=/wuhan-uni-guide/
VITE_SYNC_API=https://whu-couple-map-sync.onebiid0.workers.dev
```

If Wrangler reports a different `workers.dev` hostname, use that exact reported URL. This file remains ignored and contains no secret.

- [ ] **Step 3: Build and validate the configured frontend**

```powershell
npm.cmd run build
rg -n "whu-couple-map-sync.*workers.dev" dist/assets/*.js
```

Expected: build passes and the deployed Worker hostname appears in the generated JS.

- [ ] **Step 4: Verify Worker health and CORS**

```powershell
Invoke-WebRequest -UseBasicParsing https://whu-couple-map-sync.onebiid0.workers.dev/health -Headers @{ Origin='https://onebiid.github.io' }
```

Expected: HTTP 200 with `Access-Control-Allow-Origin: https://onebiid.github.io`.

- [ ] **Step 5: Publish the new `dist` as a fast-forward Pages commit**

Fetch remote `main`, create an isolated release worktree from it, replace only its tracked static site with `dist`, preserve `.nojekyll`, commit, and push the release branch to `main` without force. Git must reject the push if remote `main` advanced.

- [ ] **Step 6: Verify the public release**

Check `https://onebiid.github.io/wuhan-uni-guide/`, its hashed JS/CSS, manifest, and service worker all return HTTP 200. Confirm the generated JS contains the Worker URL and the Settings screen reports Cloudflare sync configured.

- [ ] **Step 7: Push source commits and clean only the temporary release worktree**

Push `feat/film-led-visual-polish` through the already authorized GitHub path, remove the temporary Pages worktree, and retain all source and deployment commits.
