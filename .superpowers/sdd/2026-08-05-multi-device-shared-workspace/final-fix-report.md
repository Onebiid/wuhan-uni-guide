# Multi-Device Shared Workspace Final Fix Report

Date: 2026-08-06
Worktree: film-led-visual-polish
Branch: feat/film-led-visual-polish

## Status

Complete. All four requested findings were fixed in one coherent code change, the six requested regression areas are covered, the focused gates pass, and the full repository quality gate passes.

Code commit:

- e08e84d fix: make shared workspace sync converge safely

## Changes

### 1. Durable conflicts, retry exhaustion, and truthful status

- Normal synchronization now runs in this order: register, pull, push records/media, final pull.
- Pulls no longer skip a local mutation and then discard the remote baseline by advancing the cursor. A divergent remote revision is stored on the mutation as remoteRevision, the local encrypted intent remains in the record table, and the mutation remains in durable conflict state.
- A subsequent user save rebases the intended edit onto remoteRevision, returns the mutation to pending, and can converge normally.
- Failed mutations are eligible for later scheduled attempts instead of becoming permanently stranded after attempt eight.
- Pending counts include pending, conflict, and failed mutations.
- Sync outcome is derived from all outstanding mutations and media: conflicts report conflict, exhausted failures report error, queued work reports pending, and only an empty queue reports synced.

### 2. Generation-safe acknowledgement

- Each record mutation has a monotonic generation.
- Uploads use an atomically captured mutation/record snapshot.
- Success, failure, and conflict updates are conditional on the generation that was actually sent.
- When edit B is saved while upload A is in flight, A cannot delete B. A successful acknowledgement rebases B onto A's accepted server revision, re-encrypts it with the correct revision-associated data, updates the versioned plaintext payload revision, and leaves B queued.
- Legacy queued rows without a stored generation are treated as generation zero and migrate naturally on the next save/update.

### 3. Pull before activation and before normal push

- Create, join, explicit unlock, and trusted-session restore perform a register plus authenticated pull-only refresh before setting the provider to unlocked.
- If the configured initial refresh fails, editing is not enabled.
- Listeners, foreground polling, and automatic push begin only after the initial pull has completed.
- Offline/local-only behavior is preserved when VITE_SYNC_API is not configured.
- Registration collisions and authentication failures remain errors.

### 4. Caller-derived public route budget

- Public create and discovery routes first charge a route-specific caller budget derived from Cloudflare's trusted CF-Connecting-IP header.
- Missing or malformed connecting IP values use the non-user-controlled shared unknown fallback.
- The existing attacker-supplied identifier budget remains as a secondary budget: setup:<workspaceId> or discover:<discoveryId>.
- Existing origin allowlisting and CORS middleware are unchanged; rate-limited responses retain the allowed CORS origin.
- The implementation uses the existing generated RateLimit binding type and awaits every binding call.

## Regression Coverage

Frontend sync tests cover:

1. Two-device convergence through a shared remote workspace, including A create, B pull/edit, and A pull.
2. Edit B saved while upload A is blocked in flight; B remains queued and later reaches revision 2 remotely.
3. Divergent remote conflict preserves local decrypted intent and records the remote base revision.
4. A user retry rebases the local intent and converges at the next revision.
5. Eight failed attempts report error, remain counted, and successfully retry later.
6. Join remains in setup with no editable session and no record push until the initial authenticated pull resolves.
7. Trusted restore installs foreground listeners only after the initial refresh and keeps foreground triggers single-flight.

Worker route tests cover:

- Caller and identifier keys for discovery.
- Caller and identifier keys for workspace creation.
- Safe unknown fallback.
- Caller-budget denial returning 429 before the identifier lookup.
- CORS preservation on the 429 response.

## Verification

Focused:

- npm.cmd run test -- tests/sync.test.ts: PASS, 15 tests.
- npm.cmd run worker:test: PASS, 10 tests.
- npm.cmd run typecheck: PASS.
- npm.cmd run worker:typecheck: PASS.
- npm.cmd run lint: PASS.
- git diff --check: PASS (Git emitted only the repository's CRLF conversion warnings).

Full gate:

- npm.cmd run check: PASS.
- Frontend Vitest: 9 files, 40 tests passed.
- Worker Vitest: 1 file, 10 tests passed.
- TypeScript frontend and Worker checks passed.
- ESLint passed.
- Vite production build passed.
- Wrangler deploy dry-run passed and resolved D1, KV, rate-limit, and environment bindings.

Non-blocking build note:

- Vite reports the existing main JavaScript chunk is larger than 500 kB after minification. This fix does not expand bundle-facing application code enough to justify unrelated code splitting in this release wave.

## Self-Review

No unresolved Critical or Important findings were found in the final diff.

Checked specifically:

- Every mutation deletion/update is generation-conditional.
- Cursor advancement occurs only after each remote record is incorporated or recorded as a durable conflict.
- Conflict and failed rows cannot produce synced.
- A causal later local edit uses the accepted prior revision and correct AES-GCM associated data.
- Initial activation cannot push before its first pull.
- Public route rate-limit keys do not rely solely on attacker-controlled identifiers.
- Cloudflare binding promises are awaited and no request-scoped state is stored globally.
- Allowed-origin/CORS behavior is preserved.

## Residual Concerns

- A true cross-device same-record conflict remains explicit. The client preserves local intent and the remote base, but deliberately requires a later user edit/save to retry rather than silently overwriting the other device.
- Cloudflare Workers Rate Limiting is local and eventually consistent, and IP-derived budgets can group callers behind NAT. The identifier budget remains in place as the secondary control; the configured 90/minute route budget limits the impact on normal shared-network use.
- No production deployment or remote D1 operation was performed in this fix wave.