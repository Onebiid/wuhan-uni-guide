# Multi-Device Shared Workspace Design

## Goal

All trusted devices using the same shared passphrase join one cloud workspace. Places, memories, settings, playlists, and encrypted photos can be changed on any device and synchronized to every other device.

## User Flow

- The first device creates a workspace with the shared passphrase.
- A later device chooses "Join existing space" and enters the same passphrase.
- The client derives a one-way discovery identifier from the passphrase, downloads only the workspace salt and public metadata, derives the encryption/authentication keys locally, and verifies access.
- The device immediately pulls the encrypted cloud snapshot and may then create, edit, or delete content.
- A trusted device stores a non-extractable local key reference so routine reopening does not require the passphrase. Locking or clearing site data removes that convenience.

## Cloud Contract

- Workspace registration stores a unique discovery identifier alongside the existing random workspace ID, salt, KDF settings, and authentication verifier.
- An unauthenticated, rate-limited discovery endpoint returns only workspace ID, salt, and KDF settings. It never returns an encryption key, authentication token, passphrase, or plaintext data.
- Existing authenticated record and encrypted-media routes remain the source of truth.
- Existing workspaces register their discovery identifier on the next successful unlock and sync, preserving current data.

## Synchronization

- Every successful unlock performs pull, then refreshes the local snapshot.
- Local edits enter the mutation queue and sync automatically while online.
- Remote changes are pulled when the app opens, regains connectivity, becomes visible, and on a short foreground interval.
- Revision conflicts remain explicit and are never silently overwritten. After pulling the latest revision, the user can retry the intended edit.
- Failed encrypted-photo transfers stay queued and retry later.

## Security

- AES-GCM encryption remains client-side; Cloudflare stores ciphertext only.
- The passphrase is never uploaded or persisted as plaintext.
- Discovery identifiers are one-way hashes and their endpoint is rate-limited to reduce enumeration and password-guessing abuse.
- A new device must know the shared passphrase at least once. This is required because the passphrase derives the decryption key.

## Production Map

- The production build supplies a GCJ-02-compatible Amap raster tile template and attribution.
- The existing WGS84/GCJ-02 conversion remains unchanged so markers align with the Wuhan basemap.
- Tile failure keeps the current usable fallback and error state.

## Compatibility And Tests

- Existing local workspaces migrate without data loss.
- Tests cover create/discover/join, wrong passphrase, cross-device pull, concurrent revision conflict, trusted-device reopening, media retry, and production tile configuration.
- Worker and frontend builds must pass before redeployment.
