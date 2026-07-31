# Film-Led Visual Polish Design

Status: Approved in conversation on 2026-07-31

## 1. Purpose

Polish the complete iPhone 15 Pro experience of "我们的武大" without changing its security, storage, synchronization, or coordinate contracts. The finished application should feel like a private Wuhan University film archive that is actively being recorded by two people, rather than a conventional map with retro decoration.

The selected direction is `Film-led`: approximately 35 percent campus archive and 65 percent shared film. Film language is strongest in photographs, frame numbers, date stamps, selected places, and save feedback. Operational surfaces remain legible, stable, and direct.

## 2. Design Principles

1. The map is the viewfinder; the memory book is the developed roll.
2. Film styling must carry information. Perforations, frame numbers, roll labels, and stamps indicate content type, chronology, or state.
3. The interface must not become uniformly yellow or sepia. Real map and photo colors remain visible; paper white, ink navy, brick red, campus green, and route gold retain their existing roles.
4. Romantic styling never weakens privacy, errors, forms, navigation, or destructive-action clarity.
5. One strong film signature is preferable to repeated decorative cards, rotations, shadows, or textures.

## 3. Visual Tokens

The existing core palette remains authoritative:

| Token | Value | Usage |
| --- | --- | --- |
| Ink navy | `#16274A` | Type, rules, film-frame structure |
| Campus blue | `#203E77` | Navigation and selected utility actions |
| Brick red | `#A03F49` | Shutter action, dates, active category, current frame |
| Campus green | `#4C795A` | Secure/success status and campus categories |
| Route gold | `#E0AD46` | Route accents and secondary chronology |
| Paper white | `#F7F8F7` | Primary surface without a warm beige cast |

Typography roles also remain stable:

- `Songti SC` / `STSong`: product name, memory title, and major section title only.
- `PingFang SC` / system sans-serif: body copy, forms, commands, and status messages.
- `DIN Alternate` / monospace fallback: roll, frame, date, count, and coordinate metadata.

The new visual system may add subtle photo treatment and one-degree stamp rotation. It must not add decorative gradients, ambient blobs, heavy blur, persistent grain over map labels, or rotations that change layout dimensions.

## 4. Map Composition

The map must recover vertical space and remain the primary working surface.

- Remove the duplicate Map/Memory segmented control from the top overlay. The bottom navigation already owns this route change.
- Combine the roll label, product name, and relationship day count into one compact film-header strip.
- Keep search and current-location actions in one 44px command strip below the title.
- Keep category filters horizontally scrollable as compact film labels. Partial next-item visibility remains the scroll affordance.
- Target a top-overlay height of approximately 120px plus the iOS safe-area inset, reducing the current layout by roughly 80px.
- Preserve native map pan, pinch zoom, tile attribution, geolocation, and crosshair placement behavior.

Markers retain their category color. A place with memories displays the frame number of its latest non-deleted memory. A place without memories displays the existing centered dot. The number is descriptive only and never replaces the accessible place name.

The route line continues to connect places that have memories. Its chronology follows the earliest linked memory date for each place, with creation time as the deterministic fallback. Coordinate storage and display conversion do not change.

Selecting a marker opens a compact film-ticket summary above the bottom navigation. It contains a photo crop or unexposed-frame placeholder, latest frame metadata, place name, and navigation command. Expanding the summary retains the existing note, coordinates, memory count, navigation, add-memory, edit, and delete actions.

## 5. Memory Book

The memory book becomes the most expressive surface while remaining a readable chronological list.

- The header shows the roll label, product title, frame count, and place count without repeating the route switch.
- Memories remain grouped by year and sorted by occurrence date, then creation time.
- Each repeated item is one film-frame card with a stable photo ratio, frame number, title, place, date stamp, and short text excerpt.
- Card offsets may alternate by a few pixels, but cards must not overlap or produce horizontal page scrolling.
- Real photos retain natural color with only restrained contrast/saturation treatment.
- A memory without a photo uses an "unexposed frame" containing its frame number and date. It must not present a large featureless grid.
- The detail sheet retains the photo gallery, complete text, date, and return-to-map command.

Frame numbers remain the persisted memory frame numbers already present in the data model. The visual polish does not renumber existing data.

## 6. Secondary Surfaces

Unlock, create/edit, music, and settings use archive order rather than maximum film decoration.

### Unlock

- Use one WHU private-archive seal, a roll identifier, the product title, and an unframed form hierarchy.
- State local key handling in direct language.
- Keep the passphrase fields, validation, setup dates, and primary action unchanged in behavior.

### Create and edit sheets

- Label the sheet as a new or edited frame while retaining familiar Chinese field names.
- Render categories as compact film labels and photos as ordered frame slots.
- Keep the keyboard-resilient bottom-sheet layout and a visible save action.
- Use one 180ms shutter-like save response when reduced motion is not requested. Do not flash the full screen.

### Music

- Present the playlist as the shared film soundtrack, with side/track metadata in the utility typeface.
- Preserve direct play, external-link, add, and delete actions. Do not introduce licensed default media or decorative playback controls.

### Settings

- Rename the visual section to the private archive index while keeping settings vocabulary explicit.
- Use unframed indexed sections separated by rules instead of stacking cards.
- Encryption, sync, backup, migration, and lock statuses use direct Chinese copy and familiar icons.
- Destructive actions remain brick red and require the existing confirmation behavior where applicable.

The bottom navigation labels become `地图`, `胶片`, `声音`, and `档案`, with the central Add shutter action. Existing Lucide icons remain; the central action keeps its plus icon and accessible name.

## 7. Component Boundaries

No data model, encryption envelope, database schema, sync API, Worker route, or coordinate contract changes in this polish.

Implementation stays within the existing feature modules:

- `MapPage` owns the compact film header, command strip, filters, and selected-place ticket.
- `MapCanvas` owns marker visual metadata and chronological route rendering.
- `MemoryPage` owns roll grouping, film cards, unexposed frames, and detail presentation.
- Unlock, place, memory, music, and settings features adopt the shared tokens without changing their repositories or commands.
- `App` owns bottom-navigation labels and route state.

Add one focused reusable `FilmFrame` visual primitive for repeated photo/placeholder, perforation, frame metadata, and optional date stamp. It accepts display data and content slots only; it must not fetch photos, query workspace state, mutate records, or know about Leaflet.

Split the current stylesheet by visual ownership only if the new rules make it materially harder to navigate. Token definitions remain centralized, and feature selectors must not override generic form or accessibility behavior by element specificity.

## 8. State and Data Flow

Existing encrypted workspace snapshots remain the single source of truth.

1. `MapPage` derives each visible place's latest memory and passes its frame number to `MapCanvas` as display metadata.
2. Route ordering is derived from linked memories without persisting a second order.
3. `MemoryPage` supplies decrypted object URLs to `FilmFrame`; the primitive displays a placeholder when no URL exists.
4. Save actions continue through the existing repositories and synchronization queue. Visual shutter feedback begins only after the local encrypted write succeeds.
5. Locking clears the current session exactly as before; visual state must not retain decrypted titles or photo URLs.

## 9. Failure and Empty States

- Tile failure retains the neutral map surface, saved markers, map commands, and the current direct status message.
- Geolocation failure explains manual crosshair placement.
- Photo load/decryption failure preserves the frame metadata and offers retry where the existing repository can retry.
- Sync pending, conflict, authentication, and failure states use operational wording rather than film metaphors.
- Empty memory state uses `FRAME 000`, one short invitation, and a return-to-map command.
- Long titles and place names wrap or truncate within stable dimensions and never resize navigation or markers.

## 10. Motion and Accessibility

- All actionable controls remain at least 44 by 44 CSS pixels.
- Safe-area padding remains on fixed top and bottom surfaces.
- Focus-visible styles, dialog semantics, accessible names, and pinch zoom remain intact.
- Motion is limited to marker selection, sheet entrance, and successful frame save. Each is 180ms or less.
- `prefers-reduced-motion: reduce` removes all nonessential transitions and shutter feedback.
- Film holes, stamps, numbers, and route lines never become the sole indicator of state.

## 11. Verification

Automated verification must include:

- Existing type, lint, unit, Worker, build, audit, and dry-run gates.
- Playwright at 393 by 852 for map, selected ticket, positioning, create/edit sheets, memory list, detail, unlock, music, and settings.
- Assertions that the top map overlay does not exceed its target region and does not intercept map interaction below it.
- Long Chinese titles, empty photos, failed tiles, failed geolocation, keyboard-sized viewport, 200 percent text, and reduced-motion checks.
- Tile-loaded and tile-pixel checks retained from the current suite.
- Screenshot review for no overlaps, no horizontal page scroll, readable map attribution, and stable bottom navigation.

The compressed initial application budget remains 250KB excluding map tiles and user media. Physical iPhone 15 Pro verification remains required before production release.

## 12. Scope Exclusions

This polish does not add social sharing, public profiles, comments, analytics, new cloud providers, automatic photo filters, camera capture UI, map-style licensing, passphrase recovery, or production deployment. Existing release blockers around credential revocation, licensed production tiles, Cloudflare provisioning, and physical iPhone acceptance remain in force.
