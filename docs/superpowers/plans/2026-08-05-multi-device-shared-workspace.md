# Multi-Device Shared Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every trusted device discover, unlock, edit, and synchronize the same encrypted cloud workspace while restoring the production Wuhan basemap.

**Architecture:** A passphrase-derived, deliberately expensive PBKDF2 discovery ID locates public workspace metadata in D1; workspace PBKDF2 and AES-GCM keys remain client-derived and never leave the device. Existing authenticated record/KV media APIs remain authoritative, while foreground lifecycle triggers pull remote revisions into IndexedDB.

**Tech Stack:** React 19, TypeScript, Dexie 4, Web Crypto, Hono, Cloudflare Workers/D1/KV, Vitest, Vite PWA, Leaflet.

## Global Constraints

- Preserve client-side AES-GCM encryption and the existing 5 MiB encrypted-media limit.
- Never upload or persist the plaintext passphrase.
- Existing workspaces and encrypted records must remain usable without data loss.
- Use the GCJ-02-compatible Wuhan basemap because map coordinates are converted before rendering.
- Use `npm.cmd` and `npx.cmd`; do not change PowerShell execution policy.

---

### Task 1: Cloud Workspace Discovery

**Files:**
- Create: `worker/migrations/0002_workspace_discovery.sql`
- Modify: `worker/src/index.ts`
- Modify: `worker/test/index.test.ts`
- Modify: `worker/test/apply-migrations.ts`

**Interfaces:**
- Consumes: existing `POST /v1/workspaces` registration.
- Produces: `GET /v1/workspaces/discover/:discoveryId` returning `{ id, salt, kdfIterations }` and registration field `discoveryId`.

- [ ] **Step 1: Write failing Worker tests**

```ts
it('discovers public key-derivation metadata without exposing the verifier', async () => {
  const response = await request(`/v1/workspaces/discover/${discoveryId}`, { headers: { Origin: origin } });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: workspaceId, salt, kdfIterations: 600_000 });
});

it('does not reveal whether an invalid discovery identifier exists', async () => {
  expect((await request('/v1/workspaces/discover/not-valid', { headers: { Origin: origin } })).status).toBe(404);
});
```

- [ ] **Step 2: Run the Worker tests and verify failure**

Run: `npm.cmd run worker:test`
Expected: FAIL because discovery registration and route do not exist.

- [ ] **Step 3: Add the D1 migration**

```sql
ALTER TABLE workspaces ADD COLUMN discovery_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_discovery_id
ON workspaces(discovery_id) WHERE discovery_id IS NOT NULL;
```

- [ ] **Step 4: Implement registration and discovery**

```ts
const discoveryPattern = /^[a-f0-9]{64}$/;

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
```

Update registration to accept a 64-character lowercase hex `discoveryId`, store it on insert, and attach it to a matching existing workspace on conflict only after the supplied verifier matches.

- [ ] **Step 5: Run tests and commit**

Run: `npm.cmd run worker:test && npm.cmd run worker:typecheck`
Expected: all Worker tests pass.

```bash
git add worker/migrations/0002_workspace_discovery.sql worker/src/index.ts worker/test
git commit -m "feat: add secure workspace discovery"
```

### Task 2: Client Discovery, Join, And Migration

**Files:**
- Modify: `src/security/crypto.ts`
- Modify: `src/data/database.ts`
- Modify: `src/data/repository.ts`
- Modify: `src/services/sync.ts`
- Modify: `tests/crypto.test.ts`
- Modify: `tests/sync.test.ts`

**Interfaces:**
- Produces: `deriveDiscoveryId(passphrase: string): Promise<string>`.
- Produces: `joinWorkspace(passphrase: string): Promise<UnlockedWorkspace>`.
- Produces: `discoverWorkspace(discoveryId: string): Promise<RemoteWorkspaceMetadata | null>`.

- [ ] **Step 1: Write failing crypto and join tests**

```ts
it('derives a stable non-secret discovery identifier', async () => {
  expect(await deriveDiscoveryId('shared passphrase')).toMatch(/^[a-f0-9]{64}$/);
  expect(await deriveDiscoveryId('shared passphrase')).toBe(await deriveDiscoveryId('shared passphrase'));
});

it('joins the existing remote workspace instead of creating another id', async () => {
  const session = await joinWorkspace('shared passphrase');
  expect(session.workspace.id).toBe('workspace_remote');
  expect(await getActiveWorkspace()).toMatchObject({ id: 'workspace_remote' });
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm.cmd run test -- tests/crypto.test.ts tests/sync.test.ts`
Expected: FAIL because discovery and join APIs are missing.

- [ ] **Step 3: Implement deterministic discovery and join**

```ts
export async function deriveDiscoveryId(passphrase: string): Promise<string> {
  const normalized = passphrase.normalize('NFKC');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalized), 'PBKDF2', false, ['deriveBits']);
  const digest = new Uint8Array(await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', iterations: 210_000,
    salt: new TextEncoder().encode('whu-couple-map/discovery/v1'),
  }, material, 256));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
```

`joinWorkspace` must discover metadata, derive keys with the returned salt/KDF iterations, confirm the derived verifier by calling an authenticated sync request, then save the workspace and active-workspace setting in one Dexie transaction. Existing local workspaces compute and register `discoveryId` on their next successful unlock.

- [ ] **Step 4: Run focused tests and commit**

Run: `npm.cmd run test -- tests/crypto.test.ts tests/sync.test.ts`
Expected: all focused tests pass.

```bash
git add src/security/crypto.ts src/data/database.ts src/data/repository.ts src/services/sync.ts tests/crypto.test.ts tests/sync.test.ts
git commit -m "feat: join shared workspace across devices"
```

### Task 3: Trusted Device And Continuous Pull

**Files:**
- Modify: `src/data/database.ts`
- Modify: `src/data/repository.ts`
- Modify: `src/app/WorkspaceContext.tsx`
- Modify: `tests/sync.test.ts`

**Interfaces:**
- Produces: `rememberTrustedSession(session: UnlockedWorkspace): Promise<void>`.
- Produces: `restoreTrustedSession(): Promise<UnlockedWorkspace | null>`.
- Consumes: `syncWorkspace(session)` from `src/services/sync.ts`.

- [ ] **Step 1: Write failing trusted-session and lifecycle tests**

```ts
it('restores the same workspace without storing a plaintext passphrase', async () => {
  await rememberTrustedSession(session);
  expect(await restoreTrustedSession()).toMatchObject({ workspace: { id: session.workspace.id } });
  expect(JSON.stringify(await db.settings.toArray())).not.toContain('shared passphrase');
});
```

Render `WorkspaceProvider`, dispatch `visibilitychange` after setting visibility to `visible`, and assert the sync fetch is invoked once without overlapping an active request.

- [ ] **Step 2: Verify tests fail**

Run: `npm.cmd run test -- tests/sync.test.ts`
Expected: FAIL because trusted-session persistence and visibility sync do not exist.

- [ ] **Step 3: Implement trusted-device restore and foreground sync**

Persist only the structured-cloneable non-extractable `CryptoKey`, derived authentication token, workspace ID, and device ID in IndexedDB. Restore it during provider boot; clear it on explicit lock. Add `online`, `visibilitychange`, and a 60-second foreground interval, all funneled through the existing `syncPromise` single-flight guard.

- [ ] **Step 4: Run focused tests and commit**

Run: `npm.cmd run test -- tests/sync.test.ts`
Expected: all sync lifecycle tests pass.

```bash
git add src/data/database.ts src/data/repository.ts src/app/WorkspaceContext.tsx tests/sync.test.ts
git commit -m "feat: keep trusted devices synchronized"
```

### Task 4: Join UI And Production Basemap

**Files:**
- Modify: `src/features/unlock/UnlockView.tsx`
- Modify: `src/app/WorkspaceContext.tsx`
- Modify: `src/styles.css`
- Modify: `.env.example`
- Modify: `.env.production.local` (ignored deployment configuration)
- Test: `tests/unlock-view.test.tsx`

**Interfaces:**
- Consumes: `join(passphrase: string)` exposed by `WorkspaceContext`.
- Produces: explicit create/join modes and a trusted-device checkbox.

- [ ] **Step 1: Write the failing join UI test**

```tsx
it('joins an existing shared space with one passphrase', async () => {
  render(<UnlockView />);
  await user.click(screen.getByRole('button', { name: '加入已有空间' }));
  await user.type(screen.getByLabelText('共同口令'), 'shared passphrase');
  await user.click(screen.getByRole('button', { name: '加入并同步' }));
  expect(join).toHaveBeenCalledWith('shared passphrase', true);
});
```

- [ ] **Step 2: Verify the UI test fails**

Run: `npm.cmd run test -- tests/unlock-view.test.tsx`
Expected: FAIL because join mode is absent.

- [ ] **Step 3: Implement create/join controls and production map configuration**

Use a two-option segmented control: `加入已有空间` as the default when no local workspace exists, and `创建新空间` as the secondary action. Keep confirmation/date fields only for create mode. Configure:

```dotenv
VITE_MAP_TILE_URL=https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}
VITE_MAP_ATTRIBUTION=地图数据 © 高德地图
```

- [ ] **Step 4: Run UI/build tests and commit**

Run: `npm.cmd run test -- tests/unlock-view.test.tsx && npm.cmd run build`
Expected: tests pass and the production bundle no longer contains `发布环境尚未配置地图底图` as its initial state.

```bash
git add src/features/unlock/UnlockView.tsx src/app/WorkspaceContext.tsx src/styles.css .env.example tests/unlock-view.test.tsx
git commit -m "feat: add shared-space onboarding"
```

### Task 5: Migrate, Deploy, And Publish

**Files:**
- Modify generated `dist/` only for the GitHub Pages release commit.

**Interfaces:**
- Consumes: D1 migration `0002_workspace_discovery.sql`, Worker build, frontend production build.
- Produces: deployed Worker and GitHub Pages release.

- [ ] **Step 1: Run the complete quality gate**

Run: `npm.cmd run check`
Expected: typechecks, lint, frontend tests, Worker tests, production build, and Worker dry-run all pass.

- [ ] **Step 2: Apply D1 migration and deploy Worker**

Run: `npx.cmd wrangler d1 migrations apply whu-couple-map --remote`
Expected: migration `0002_workspace_discovery.sql` is applied.

Run: `npx.cmd wrangler deploy`
Expected: deployment URL is `https://whu-couple-map-sync.fyhzxy.workers.dev`.

- [ ] **Step 3: Build and publish GitHub Pages**

Run: `npm.cmd run build`
Expected: `dist` contains the sync URL and configured tile URL.

Publish `dist` plus `.nojekyll` to `main` using the already-authorized GitHub API path, preserving the source branch separately.

- [ ] **Step 4: Verify public behavior**

Open `https://onebiid.github.io/wuhan-uni-guide/` on two fresh browser profiles. Create or migrate the workspace on device A, join with the same passphrase on device B, edit one place on B, and confirm A receives the change after foreground sync. Confirm map tiles load and markers align.

- [ ] **Step 5: Commit deployment metadata if changed**

```bash
git status --short
git log -5 --oneline
```

Expected: the feature worktree is clean and the remote Pages `main` points to the new release.
