# D1 + KV Cloud Sync Design

## Goal

Provide no-card, cross-device synchronization for places, memories, settings, playlists, and encrypted photos while preserving the existing client API and encryption model.

## Architecture

- D1 remains the authoritative store for workspaces, encrypted records, revisions, and change cursors.
- Workers KV replaces R2 for encrypted media. Each value uses the existing workspace/record/media key and stores nonce, checksum, plaintext content type, and record ID as KV metadata.
- The Worker keeps the existing media upload, download, and delete routes, so the frontend needs only the deployed Worker URL.
- The existing 5 MiB media limit remains below KV's per-value limit.

## Consistency And Failure Handling

- A successful upload is immediately retained locally and queued for sync.
- KV is eventually consistent. A second device may briefly receive `404`; the client keeps the placeholder and retries instead of treating the photo as deleted.
- Deletes remain idempotent. Authentication, rate limiting, client-side AES-GCM encryption, checksum validation, and private cache headers remain unchanged.
- No plaintext media, passphrase, or encryption key is stored in Cloudflare.

## Verification

- Worker tests cover encrypted KV upload, metadata-preserving download, delete, invalid metadata, and size limits.
- Existing record sync and conflict tests continue to pass against D1.
- Release checks include typecheck, lint, unit tests, production build, Worker dry-run, deployment health, CORS, and a live encrypted media round trip.

## Deployment

Create one KV namespace, bind it as `MEDIA`, deploy the Worker, set `VITE_SYNC_API` to its HTTPS URL, rebuild GitHub Pages, and verify cross-device sync. R2 is not required.
