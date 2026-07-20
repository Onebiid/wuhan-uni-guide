# iOS Couple Map Release Implementation Plan

Design source: `docs/superpowers/specs/2026-07-20-ios-couple-map-release-design.md`

## Phase 1: Build and application shell

1. Add React 19, TypeScript, Vite 8, Leaflet, Dexie, Zod, Lucide, PWA, Vitest, Playwright, and Worker tooling.
2. Replace the static entry page with a CSP-constrained Vite entry and correct iOS PWA metadata.
3. Add strict TypeScript, lint/type-check scripts, test configuration, Workbox configuration, and versioned manifest generation.
4. Create the app shell, global error boundary, unlock/setup flow, safe-area layout, and stable bottom navigation.
5. Verify type-check, unit-test boot, production build, manifest, and app-shell offline assets.

## Phase 2: Domain, encrypted persistence, and migration

1. Define Zod schemas and typed entities for workspace, place, memory, photo, settings, playlist, and queued mutation.
2. Add Web Crypto key derivation, HKDF key separation, AES-GCM envelopes, and key clearing.
3. Add Dexie repositories for encrypted records, encrypted media, settings, and queued mutations.
4. Add idempotent migration for legacy local-storage data, safe URL handling, coordinate validation, and migration reports.
5. Add unit tests for schemas, WGS-84/GCJ-02 conversion, crypto round trips, migrations, and tombstones.

## Phase 3: Product UI and map behavior

1. Implement the Leaflet adapter with deployment-configured Amap-compatible tiles, map fallback, markers, selected route, and camera persistence.
2. Implement search, category filters, current location, marker selection, compact detail, and expandable detail sheet.
3. Implement crosshair-based create/edit positioning, photo compression, place editing, deletion confirmation, and undo.
4. Implement the Campus Chronicle visual system and iPhone 15 Pro safe-area behavior.
5. Implement the film-style memory timeline, photo viewer, anniversary header, and map return action.
6. Implement persistent device-local music, remote playlist entries, settings, diagnostics, import, and encrypted export.

## Phase 4: Cloudflare synchronization

1. Replace the insecure GitHub proxy with a TypeScript Worker using Hono, generated `Env` types, D1, R2, and a rate-limit binding.
2. Add D1 workspace, records, and change-log migrations with conditional revision updates and tombstones.
3. Add workspace setup/authentication, strict CORS, body limits, structured errors, and timing-safe verifier checks.
4. Add incremental sync routes and authenticated streaming media routes.
5. Add the client sync engine, offline queue, bounded retry with jitter, conflict state, and quiet sync status.
6. Test with the Workers Vitest pool, generated types, Wrangler dry run, startup check, and local D1 migrations.

## Phase 5: Release verification and cleanup

1. Add component and end-to-end coverage for unlock, map, create/edit, memories, offline queue, and relaunch.
2. Run TypeScript, tests, secret scan, dependency audit, production build, bundle budget, and Worker checks.
3. Start local servers and perform Playwright Chromium/WebKit visual verification at 393 x 852 and desktop fallback widths.
4. Check map canvas/tile pixels, long text, soft-keyboard viewport, safe areas, reduced motion, and 200% text.
5. Remove obsolete insecure runtime files and plaintext private seed data from the new build; retain migration instructions and Git recovery through prior commits.
6. Document Cloudflare provisioning, required secrets, map-provider configuration, deployment, migration, token revocation, and physical iPhone acceptance steps.

The implementation proceeds phase by phase. Each phase must pass its local verification commands before the next phase is considered complete.
