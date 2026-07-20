# iOS Couple Map Release Design

Status: Approved in conversation on 2026-07-20

## 1. Purpose

Rebuild the current Wuhan University map as a private, installable couple-focused PWA for an iPhone 15 Pro running iOS 26. The product's main job is to help two people find shared places, record new moments, and revisit those moments without sacrificing map usability.

The release must preserve and migrate existing places, photos, memories, playlist metadata, and relationship dates. It must remove the current security exposure, work offline after installation, synchronize safely across two devices, and meet the release gates in section 13.

## 2. Current-State Findings

The existing vanilla HTML/CSS/JavaScript implementation has useful domain logic, but it is not publishable in its current state.

Release blockers:

- A GitHub personal access token is committed in browser and Worker source. It must be revoked by the repository owner and removed from history as a separate credential-response action.
- Plaintext relationship dates, private memory text, and personal place content are tracked in the static application and Git history. The new build must not ship them, and the repository owner must approve a history-cleanup operation before public release.
- The Worker is an unrestricted, cross-origin GitHub API proxy. Any caller can use the embedded credential against arbitrary GitHub API paths.
- The cloud settings UI describes LeanCloud while the implementation always uses GitHub. Several settings paths are dead or throw on the current configuration shape.
- The app auto-enables cloud sync and can upload private content without a meaningful opt-in or unlock boundary.
- Photos are stored as Base64 strings in `localStorage`, which is too small and fails unpredictably on iOS.
- The current timestamp merge can lose edited names, coordinates, types, and notes. Deletions become an irreversible union.
- Imported and remotely synchronized data is not schema-validated. Several image and memory render paths can inject unsafe markup or URLs.
- Editing leaves the global edit mode active because state is cleared before the mode check. Adding a photo to a preset place silently fails.
- Seven floating action buttons, multiple banners, a love counter, a music panel, and a place panel compete for the same map area.
- The external Leaflet dependency is loaded from a CDN and is not part of the reliable offline app shell.
- The bundled default playlist hotlinks copyrighted third-party music endpoints that are unreliable and unsuitable as release defaults.
- The viewport disables zoom, dialogs do not manage focus, icon buttons lack consistent accessible names, and reduced-motion behavior is incomplete.

## 3. Scope

### In scope

- React, TypeScript, and Vite application shell.
- Leaflet-based map with a production map-provider adapter.
- Map and memory-book modes.
- Search, category filters, geolocation, navigation, place creation, editing, deletion, and undo.
- Multi-photo memories, relationship dates, anniversary presentation, music playlist, import, export, and diagnostics.
- IndexedDB persistence, client-side encryption, offline mutation queue, and Cloudflare synchronization.
- Automatic migration from the existing local-storage schema.
- iPhone 15 Pro and iOS 26 PWA behavior, with responsive fallback for other phones and desktop browsers.
- Automated tests and release checks described in section 13.

### Out of scope

- Public accounts, social sharing, comments, likes, or multi-tenant administration.
- Android native packaging and TWA/APK maintenance in this release.
- A general-purpose campus guide for unrelated users.
- Server-side access to plaintext place, memory, photo, or playlist content.
- Cloud synchronization of uploaded local audio files. Local audio remains device-only and is clearly labeled.

## 4. Technical Direction

Use React and TypeScript with Vite. Bundle React, Leaflet, styles, and the app shell so installation and subsequent offline launches do not depend on a third-party JavaScript CDN. Use React for UI and state ownership while keeping map rendering behind a focused Leaflet adapter.

The production map adapter uses a licensed Amap-compatible GCJ-02 tile source configured at deployment time with its required key and domain allowlist. The current undocumented tile endpoint may be used only during local migration work; provider credentials and terms verification are release prerequisites. If a compliant Amap-compatible source is unavailable, release is blocked rather than silently switching coordinate systems.

Use these module boundaries:

```text
src/
  app/          App shell, routes, providers, error boundary
  features/
    unlock/     Workspace setup, unlock, lock, recovery
    map/        Leaflet adapter, markers, search, filters, crosshair positioning
    places/     Place detail, create/edit sheet, deletion and undo
    memories/   Timeline, film cards, photo viewer, anniversary content
    music/      Remote playlist metadata and device-local audio
    settings/   Sync, backup, import/export, diagnostics
  data/         IndexedDB repositories, migrations, validation, sync queue
  security/     Key derivation, encryption envelopes, safe URL handling
  services/     Worker client, geolocation, navigation, map provider
  shared/       Reusable controls, sheets, icons, formatting
worker/
  src/          Auth, sync API, D1 repository, R2 media operations
  migrations/   D1 schema migrations
```

Feature modules depend on repository and service interfaces. They do not access IndexedDB, the Worker, Leaflet globals, or browser storage directly. Coordinate conversion, migration, validation, encryption-envelope parsing, and conflict resolution remain pure testable functions.

## 5. Information Architecture

The installed app has four top-level states:

1. Locked: shared-passphrase unlock, initial workspace setup, or recovery import.
2. Map: location discovery and editing.
3. Memory book: chronological shared moments.
4. Settings: sync, privacy, backup, import/export, and diagnostics.

The stable bottom navigation contains Explore, Memories, a central Add action, Music, and Settings. Low-frequency actions are never placed over the map as permanent floating buttons.

### Map flow

- The top region contains the product title, relationship day count, Map/Memory segmented switch, and horizontally scrollable category filters.
- Search and current-location controls remain visible but compact and respect the top safe area.
- Selecting a marker opens a compact bottom summary with photo, name, memory date, and navigation action.
- Pulling the summary upward opens the full place sheet with photos, notes, memories, edit, and delete.
- Tapping the map clears the selection without changing the current category.

### Create and edit flow

- The central Add action enters crosshair positioning mode.
- The map moves under a fixed center crosshair; the user confirms the location before entering content.
- The create sheet captures category, name, note, memory date, and up to nine photos.
- Editing is scoped to one place. There is no global marker-drag mode.
- Location changes reuse crosshair positioning.
- Delete requires confirmation and creates a 30-day tombstone. An immediate undo action restores the item.

### Memory flow

- Memories are chronological entries linked to a place, not a single free-text field embedded in a place.
- The timeline groups entries by year and uses film-frame numbers and date stamps.
- Opening a memory provides photos, text, date, and a return-to-map action.
- Anniversary content appears at the top of the memory book. It does not block map use with an automatic full-screen overlay.

## 6. Visual System

Direction: `Luojia Campus Chronicle x Shared Film`.

The map uses the disciplined Campus Chronicle language. Film styling is limited to photos, dates, and the memory book, so it acts as a meaningful signature rather than visual noise.

Color tokens:

| Token | Value | Role |
| --- | --- | --- |
| Ink navy | `#16274A` | Primary text and structural lines |
| Campus blue | `#203E77` | Selected controls and navigation |
| Brick red | `#A03F49` | Shared-memory marker, add action, date stamps |
| Campus green | `#4C795A` | Campus and service markers |
| Route gold | `#E0AD46` | Route and secondary category accent |
| Paper white | `#F7F8F7` | App and memory background |

Typography:

- Display: `Songti SC` with `STSong` fallback, used only for product and memory titles.
- Body and controls: `PingFang SC` with system sans-serif fallbacks.
- Dates, frame numbers, and counters: `DIN Alternate` with tabular-number fallback.

The signature element is a route line connecting shared places on the map and continuing conceptually through numbered film frames in the memory book. Cards use a maximum 8px radius. Map controls use solid surfaces and borders instead of broad blur effects. Motion is limited to sheet transitions, marker selection, and one memory-book entry transition, all disabled when reduced motion is requested.

## 7. iOS PWA Behavior

Primary viewport: 393 x 852 CSS pixels, portrait, installed in standalone mode.

- Use `viewport-fit=cover` and safe-area variables on every fixed top and bottom surface.
- Reserve space for the Home Indicator; no actionable control sits inside the bottom inset.
- Use 44px minimum interactive targets and visible pressed, disabled, loading, and focus-visible states.
- Do not disable pinch zoom.
- Bottom sheets adjust to the visual viewport when the software keyboard opens.
- Lock body scroll only while a sheet owns scrolling; map panning remains available otherwise.
- Restore the last stable route and map camera after an app suspension, but never restore a half-completed destructive action.
- Precache the versioned app shell. Runtime-cache previously viewed map tiles only when the provider terms permit it, with a bounded expiration policy.
- Never cache API responses or encrypted private media in the Service Worker response cache. Private records remain in encrypted IndexedDB storage.
- Version updates install in the background and prompt for a controlled reload after pending mutations are persisted.

## 8. Data Model

Core records:

- `Workspace`: opaque id, KDF salt and parameters, schema version, created timestamp.
- `Place`: id, category, name, WGS-84 coordinates, note, created/updated timestamps, revision, device id, optional deletion timestamp.
- `Memory`: id, place id, occurred date, title, text, ordered photo ids, frame number, created/updated timestamps, revision, device id, optional deletion timestamp.
- `Photo`: id, encrypted blob metadata, dimensions, media type, checksum, created timestamp.
- `PlaylistItem`: id, title, external URL or device-local media reference, ordering, updated timestamp.
- `RelationshipSettings`: meeting date, relationship date, anniversary preferences.
- `PendingMutation`: record kind, record id, base revision, encrypted operation envelope, retry state.

Coordinates are stored only as WGS-84. Conversion to GCJ-02 occurs at the Chinese map display and navigation boundaries. Data validators reject unknown categories, invalid coordinate ranges, unsafe URL schemes, oversized fields, unsupported media types, and malformed encrypted envelopes.

Each memory accepts at most nine images. An input image may be at most 20MB; the client normalizes orientation, limits the longest edge to 1600 pixels, removes embedded metadata, and encodes WebP at quality 0.82 with JPEG fallback. Each encrypted output blob must be 5MB or less. Larger or undecodable files are rejected before a local or remote write.

## 9. Encryption and Authentication

The shared passphrase is processed locally:

1. PBKDF2-SHA-256 with a 128-bit workspace-specific random salt and 600,000 iterations derives root key material. The value is versioned in the workspace record so a future release can increase it without changing old data implicitly.
2. HKDF derives separate encryption and authentication keys.
3. AES-256-GCM encrypts each record and media blob with a random 96-bit nonce. Record id, kind, and revision are authenticated as associated data.
4. The Worker stores only a one-way verifier for the authentication key and encrypted payloads. It cannot derive the encryption key.
5. The encryption key remains in memory while unlocked and is cleared on explicit lock or configured inactivity timeout.

The Service Worker, logs, analytics, error messages, and URL parameters never contain plaintext private data or key material. Changing the passphrase decrypts and re-encrypts records locally before publishing a new workspace key version.

## 10. Cloudflare Sync

Use a Cloudflare Worker with D1 for encrypted record metadata and revisions, and R2 for encrypted photo blobs. The API exposes only workspace session verification, incremental change retrieval, conditional record mutation, and bounded media upload/download.

Security controls:

- Allow only the production origin and explicit local development origins.
- Allow only declared API routes and HTTP methods.
- Enforce authentication before data access.
- Enforce request, record, and media size limits.
- Apply per-workspace rate limits and constant-time verifier comparison.
- Store deployment secrets through Worker secrets, never source files or browser bundles.
- Return generic errors without upstream credentials or internal stack traces.

Synchronization is incremental by server cursor. Mutations include a base revision. Non-conflicting records apply directly. If the same record changed on two devices, the app preserves both encrypted versions and asks the user to choose or merge after decryption. Tombstones remain recoverable for 30 days before server cleanup.

## 11. Offline and Failure Behavior

- Reads and edits operate against local encrypted IndexedDB first.
- Offline mutations enter an ordered queue and display a quiet pending status.
- Retry uses bounded exponential backoff with jitter and stops on authentication, schema, or conflict errors.
- A failed photo upload does not block saving place text; the memory shows a retry state for that photo.
- Storage quota is checked before image conversion and writes. The app offers cleanup or export instead of silently losing data.
- Map tile failure retains controls and saved markers over a neutral fallback surface, with one retry command in diagnostics.
- Geolocation denial explains how to continue with manual crosshair positioning.
- The app-level error boundary offers restart and encrypted diagnostic export without deleting local data.
- Every migration creates a pre-migration encrypted backup and commits its schema version only after verification.

## 12. Legacy Migration

On first successful unlock, detect the existing local-storage keys and run an idempotent migration:

- Normalize single `photo` values into ordered photos.
- Convert each existing place into a validated `Place` record.
- Convert the existing `memory` field and date-like content into one linked `Memory` record when present.
- Preserve user, forked preset, and deleted-place semantics using new ids and tombstones.
- Copy compressed Base64 photos into encrypted IndexedDB blobs, then verify checksums.
- Migrate external playlist entries. Persist valid local audio into device-only IndexedDB when the browser still exposes the source blob; discard stale blob URLs with an explicit migration report.
- Preserve relationship dates as encrypted settings.
- Do not seed copyrighted remote tracks in a new workspace. A migrated remote playlist remains the user's data and is marked as externally hosted.

The old keys remain untouched until migration verification, backup creation, and an explicit completion marker all succeed. The app then removes the plaintext legacy keys by default while retaining the encrypted backup; the user may postpone cleanup once from the migration report. A migration report lists imported, skipped, repaired, and failed items without private content in logs.

## 13. Testing and Release Gates

Automated gates:

- Unit tests for coordinate conversion fixtures, validators, encryption envelopes, migrations, conflict handling, tombstones, and retry policy.
- React component tests for unlock, search/filter, create/edit, photo handling, deletion/undo, memory navigation, playlist behavior, and settings.
- Worker integration tests for authentication, CORS, size limits, conditional revisions, rate limits, D1 changes, and R2 media access.
- Playwright end-to-end tests at 393 x 852 for unlock, map use, crosshair creation, editing, offline queueing, resync, memory browsing, and relaunch.
- Chromium and Playwright WebKit visual snapshots for safe areas, bottom sheets, keyboard-sized viewports, long Chinese text, empty states, loading states, 200% text, and reduced motion.
- PWA tests for manifest correctness, app-shell offline launch, controlled updates, cache corruption recovery, and no private API caching.
- Secret scan, dependency audit, Content Security Policy checks, and static checks for unsafe HTML and URL sinks.

Release budgets:

- Initial compressed application resources must be 250KB or less, excluding map tiles and user media.
- No memory-book photo downloads before the user opens a memory or visible timeline range.
- Every actionable control is at least 44 x 44 CSS pixels.
- No overlapping controls or clipped text at the primary viewport and supported responsive widths.
- No high-severity security findings and no plaintext credential in tracked files or built assets.

Windows cannot provide an actual iOS simulator. The automated WebKit and viewport gates must be followed by a short physical iPhone 15 Pro checklist: install from Safari, unlock, offline cold start, keyboard interaction, map pan/zoom, location permission, photo capture/upload, navigation handoff, app suspension/resume, and update acceptance.

## 14. Deployment and Rollout

1. Revoke the exposed GitHub token before deploying any Worker or site revision.
2. Remove plaintext private seed data from the new app, then obtain explicit owner approval before rewriting public Git history to purge the credential and private payloads.
3. Deploy D1 migrations, create the private R2 bucket, and configure Worker secrets and origin allowlists.
4. Configure the licensed Amap-compatible production tile source and deployment-domain allowlist.
5. Deploy a staging site and complete automated checks.
6. Import a copy of legacy data in staging and verify counts, coordinates, photos, memories, and playlist metadata.
7. Complete the physical iPhone checklist.
8. Deploy production with a new PWA application version and controlled migration prompt.
9. Keep the pre-migration export until both devices have synchronized and passed spot checks.

The release is complete only when the credential response, automated gates, staging migration, and physical-device checklist are all satisfied.
