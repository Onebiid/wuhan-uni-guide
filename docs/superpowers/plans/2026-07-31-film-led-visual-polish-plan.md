# Film-Led Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the complete iPhone 15 Pro interface into the approved film-led private Wuhan University archive while preserving every existing data, security, map, and synchronization contract.

**Architecture:** Add one display-only `FilmFrame` primitive and one pure map-presentation derivation module, then update each existing feature in place. UI modules continue to consume the encrypted workspace snapshot; no repository, schema, Worker, coordinate, or persistence changes are allowed.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Leaflet 1.9, Lucide React, Testing Library/Vitest, Playwright, CSS with iOS safe-area variables.

## Global Constraints

- Primary viewport is exactly 393 by 852 CSS pixels in portrait standalone mode.
- Every actionable control remains at least 44 by 44 CSS pixels.
- Keep paper white `#F7F8F7`, ink navy `#16274A`, campus blue `#203E77`, brick red `#A03F49`, campus green `#4C795A`, and route gold `#E0AD46` in their approved roles.
- Do not make the interface uniformly beige, sepia, or yellow; map and photo colors remain inspectable.
- Use `Songti SC` only for product, memory, and major section titles; use `PingFang SC` for controls/body and `DIN Alternate` or monospace for roll/frame/date metadata.
- Do not add gradients, decorative blobs, broad blur, persistent map grain, new media dependencies, or hand-drawn SVG icons.
- Preserve pinch zoom, map pan, GCJ-02 display, WGS-84 storage, tile attribution, focus-visible states, dialog semantics, and iOS safe areas.
- Do not change encrypted record schemas, Dexie stores, sync payloads, Worker routes, D1/R2 behavior, or passphrase handling.
- Motion is limited to marker selection, sheet entry, and one successful frame-save response, each at most 180ms and disabled by `prefers-reduced-motion: reduce`.
- Initial compressed application resources remain at or below 250KB excluding tiles and user media.
- Use Windows `.cmd` shims (`npm.cmd`, `npx.cmd`) without changing PowerShell execution policy.

## File Structure

- Create `src/shared/FilmFrame.tsx`: display-only repeated film-frame structure; no data access or photo loading.
- Create `src/features/map/presentation.ts`: pure derivation of latest frame and route chronology for each place.
- Create `tests/film-frame.test.tsx`: rendering contract for photos and unexposed frames.
- Create `tests/map-presentation.test.ts`: deterministic frame and route-order tests.
- Create `tests/memory-page.test.tsx`: failed-photo retry contract without nested interactive controls.
- Create `e2e/helpers.ts`: reusable encrypted-workspace setup for Playwright.
- Create `e2e/visual.spec.ts`: layout, failure, long-text, and reduced-motion regression coverage.
- Modify `src/app/App.tsx`: film-led bottom navigation and removal of the redundant map route callback.
- Modify `src/features/map/MapPage.tsx`: compact film header and selected-place ticket.
- Modify `src/features/map/MapCanvas.tsx`: numbered markers and chronological route input.
- Modify `src/features/memories/MemoryPage.tsx`: roll header, `FilmFrame` cards, and unexposed placeholders.
- Modify `src/features/unlock/UnlockView.tsx`: private-roll hierarchy without changing authentication behavior.
- Modify `src/features/places/PlaceForm.tsx`: new/edit frame metadata and stable form presentation.
- Modify `src/features/memories/MemoryForm.tsx`: ordered photo slots and frame-save feedback contract.
- Modify `src/features/music/MusicPage.tsx`: soundtrack/side metadata and maintainable JSX structure.
- Modify `src/features/settings/SettingsPage.tsx`: archive index sections with direct status language.
- Modify `src/styles.css`: approved tokens and feature-owned film-led layout rules.
- Modify `e2e/app.spec.ts`: stable navigation labels and core-flow assertions.

---

### Task 1: Film Presentation Foundation

**Files:**
- Create: `src/shared/FilmFrame.tsx`
- Create: `src/features/map/presentation.ts`
- Create: `tests/film-frame.test.tsx`
- Create: `tests/map-presentation.test.ts`
- Modify: `src/styles.css:1-30` and append FilmFrame selectors before map feature selectors

**Interfaces:**
- Produces: `FilmFrame(props: FilmFrameProps): JSX.Element`
- Produces: `deriveMapPresentation(places: Place[], memories: Memory[]): ReadonlyMap<string, MapPlacePresentation>`
- Produces: `MapPlacePresentation = { latestMemoryId: string | null; latestFrameNumber: number | null; routeOrder: number | null }`
- Consumes: existing `Place` and `Memory` types from `src/domain/models.ts`

- [ ] **Step 1: Write failing pure-presentation tests**

Create `tests/map-presentation.test.ts` with deterministic place/memory fixtures:

```ts
import { describe, expect, it } from 'vitest';
import { deriveMapPresentation } from '../src/features/map/presentation';
import type { Memory, Place } from '../src/domain/models';

const place = (id: string): Place => ({
  id, category: 'memory', name: id, note: '', lat: 30.54, lng: 114.36,
  createdAt: 100, updatedAt: 100, revision: 0, deviceId: 'device_one', deletedAt: null,
});
const memory = (id: string, placeId: string, frameNumber: number, occurredOn: string | null, createdAt: number): Memory => ({
  id, placeId, frameNumber, occurredOn, createdAt, updatedAt: createdAt,
  title: id, text: '', photoIds: [], revision: 0, deviceId: 'device_one', deletedAt: null,
});

describe('deriveMapPresentation', () => {
  it('uses the latest linked memory frame and earliest linked moment for route order', () => {
    const result = deriveMapPresentation(
      [place('place_a'), place('place_b')],
      [
        memory('memory_old', 'place_a', 3, '2025-01-02', 200),
        memory('memory_new', 'place_a', 18, '2026-07-20', 300),
        memory('memory_b', 'place_b', 8, null, 150),
      ],
    );
    expect(result.get('place_a')).toEqual({
      latestMemoryId: 'memory_new',
      latestFrameNumber: 18,
      routeOrder: Date.parse('2025-01-02T00:00:00Z'),
    });
    expect(result.get('place_b')).toEqual({ latestMemoryId: 'memory_b', latestFrameNumber: 8, routeOrder: 150 });
  });

  it('returns null presentation metadata for a place without memories', () => {
    expect(deriveMapPresentation([place('place_empty')], []).get('place_empty')).toEqual({
      latestMemoryId: null,
      latestFrameNumber: null,
      routeOrder: null,
    });
  });
});
```

- [ ] **Step 2: Write failing FilmFrame tests**

Create `tests/film-frame.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FilmFrame } from '../src/shared/FilmFrame';

describe('FilmFrame', () => {
  it('renders provided media and frame metadata', () => {
    render(<FilmFrame frameNumber={18} date="2026 / 07 / 20" media={<img src="blob:test" alt="雨后的珞珈山" />}><h2>雨后散步</h2></FilmFrame>);
    expect(screen.getByText('FRAME 018')).toBeInTheDocument();
    expect(screen.getByText('2026 / 07 / 20')).toBeInTheDocument();
    expect(screen.getByAltText('雨后的珞珈山')).toBeInTheDocument();
  });

  it('renders an unexposed frame when media is absent', () => {
    render(<FilmFrame frameNumber={1} date="DATE UNRECORDED" media={<img src="blob:hidden" alt="不应显示" />} hasMedia={false}><h2>第一帧</h2></FilmFrame>);
    expect(screen.getByText('UNEXPOSED')).toBeInTheDocument();
    expect(screen.getByText('FRAME 001')).toBeInTheDocument();
    expect(screen.queryByAltText('不应显示')).not.toBeInTheDocument();
  });

  it('supports a non-numeric frame label without leaking frame zero', () => {
    render(<FilmFrame frameNumber={0} frameLabel="NEW PLACE" date="DATE UNRECORDED" media={<span>地点缩略图</span>}><h2>新地点</h2></FilmFrame>);
    expect(screen.getByText('NEW PLACE')).toBeInTheDocument();
    expect(screen.queryByText('FRAME 000')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run:

```powershell
npm.cmd test -- tests/map-presentation.test.ts tests/film-frame.test.tsx
```

Expected: FAIL because both imported modules do not exist.

- [ ] **Step 4: Implement the map derivation module**

Create `src/features/map/presentation.ts`:

```ts
import type { Memory, Place } from '../../domain/models';

export interface MapPlacePresentation {
  latestMemoryId: string | null;
  latestFrameNumber: number | null;
  routeOrder: number | null;
}

function memoryMoment(memory: Memory): number {
  return memory.occurredOn ? Date.parse(`${memory.occurredOn}T00:00:00Z`) : memory.createdAt;
}

export function deriveMapPresentation(places: Place[], memories: Memory[]): ReadonlyMap<string, MapPlacePresentation> {
  const result = new Map<string, MapPlacePresentation>();
  for (const place of places) {
    const linked = memories
      .filter((memory) => memory.placeId === place.id && memory.deletedAt === null)
      .sort((left, right) => memoryMoment(left) - memoryMoment(right) || left.frameNumber - right.frameNumber);
    const latest = linked.at(-1) ?? null;
    result.set(place.id, {
      latestMemoryId: latest?.id ?? null,
      latestFrameNumber: latest?.frameNumber ?? null,
      routeOrder: linked[0] ? memoryMoment(linked[0]) : null,
    });
  }
  return result;
}
```

- [ ] **Step 5: Implement the display-only FilmFrame primitive**

Create `src/shared/FilmFrame.tsx`:

```tsx
import type { ReactNode } from 'react';

export interface FilmFrameProps {
  frameNumber: number;
  frameLabel?: string;
  date: string;
  media?: ReactNode;
  hasMedia?: boolean;
  children: ReactNode;
  variant?: 'card' | 'thumbnail';
  className?: string;
}

export function FilmFrame({ frameNumber, frameLabel, date, media, hasMedia, children, variant = 'card', className = '' }: FilmFrameProps) {
  const number = String(frameNumber).padStart(3, '0');
  const label = frameLabel ?? `FRAME ${number}`;
  const showMedia = hasMedia ?? media !== undefined;
  return <div className={`film-frame film-frame-${variant} ${className}`.trim()}>
    <div className="film-frame-perforation" aria-hidden="true"><span>▪ ▪ ▪ ▪</span><b>{label}</b><span>▪ ▪ ▪ ▪</span></div>
    <div className={showMedia ? 'film-frame-media' : 'film-frame-media unexposed'}>
      {showMedia ? media : <><strong>UNEXPOSED</strong><small>{label}</small></>}
    </div>
    <div className="film-frame-content">{children}<time>{date}</time></div>
  </div>;
}
```

- [ ] **Step 6: Add stable FilmFrame CSS**

Add selectors to `src/styles.css` using fixed media dimensions and no layout-changing hover states:

```css
.film-frame { position: relative; border: 1px solid var(--ink); background: var(--surface); color: var(--ink); }
.film-frame-perforation { height: 17px; display: flex; align-items: center; justify-content: space-between; padding: 0 4px; color: var(--muted); font-size: 6px; }
.film-frame-perforation b { color: var(--ink); font: 700 7px/1 "DIN Alternate", ui-monospace, monospace; }
.film-frame-media { width: 100%; aspect-ratio: 4 / 3; overflow: hidden; background: #e4e8e6; }
.film-frame-media > img { width: 100%; height: 100%; display: block; object-fit: cover; }
.film-frame-media.unexposed { display: grid; place-content: center; justify-items: center; color: var(--brick-red); }
.film-frame-media.unexposed strong { font: 800 15px/1 "DIN Alternate", ui-monospace, monospace; }
.film-frame-media.unexposed small { margin-top: 7px; color: var(--muted); font: 700 8px/1 "DIN Alternate", ui-monospace, monospace; }
.film-frame-content { position: relative; padding: 11px; }
.film-frame-content > time { display: inline-block; margin-top: 8px; padding: 5px; border: 1px solid var(--brick-red); color: var(--brick-red); font: 700 7px/1 "DIN Alternate", ui-monospace, monospace; transform: rotate(-2deg); }
```

- [ ] **Step 7: Run focused tests, typecheck, and lint**

Run:

```powershell
npm.cmd test -- tests/map-presentation.test.ts tests/film-frame.test.tsx
npm.cmd run typecheck
npm.cmd run lint
```

Expected: all commands PASS.

- [ ] **Step 8: Commit the foundation**

```powershell
git add src/shared/FilmFrame.tsx src/features/map/presentation.ts src/styles.css tests/film-frame.test.tsx tests/map-presentation.test.ts
git commit -m "feat: add film presentation foundation"
```

### Task 2: Compact Film Map and Navigation

**Files:**
- Create: `e2e/helpers.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/features/map/MapPage.tsx`
- Modify: `src/features/map/MapCanvas.tsx`
- Modify: `src/styles.css:38-158`
- Modify: `e2e/app.spec.ts`

**Interfaces:**
- Consumes: `deriveMapPresentation()` and `MapPlacePresentation` from Task 1
- Produces: `MapCanvas` prop `presentations: ReadonlyMap<string, MapPlacePresentation>`
- Produces: `createWorkspace(page: Page): Promise<void>` for all Playwright files
- Removes: `MapPageProps.onOpenMemories`

- [ ] **Step 1: Extract the reusable Playwright workspace setup**

Create `e2e/helpers.ts`:

```ts
import type { Page } from '@playwright/test';

export async function createWorkspace(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('共同口令').fill('playwright shared passphrase');
  await page.getByLabel('再次输入').fill('playwright shared passphrase');
  await page.getByLabel('初见日期').fill('2023-03-15');
  await page.getByLabel('在一起日期').fill('2024-01-01');
  await page.getByRole('button', { name: '创建并进入' }).click();
  await page.getByLabel('武汉大学地点地图').waitFor({ state: 'visible' });
}
```

Replace the duplicated setup at the beginning of the first E2E test with `await createWorkspace(page)`.

- [ ] **Step 2: Add failing map-layout assertions**

After workspace creation in `e2e/app.spec.ts`, add:

```ts
await expect(page.getByLabel('视图切换')).toHaveCount(0);
await expect(page.locator('.bottom-nav').getByRole('button', { name: '胶片', exact: true })).toBeVisible();
const mapHeaderBox = await page.locator('.map-header').boundingBox();
expect(mapHeaderBox).not.toBeNull();
expect(mapHeaderBox?.height).toBeLessThanOrEqual(150);
```

Run:

```powershell
npx.cmd playwright test e2e/app.spec.ts --project=iphone-chromium
```

Expected: FAIL because the segmented control still exists, the nav label is `回忆`, and the header exceeds 150px.

- [ ] **Step 3: Update application navigation and map ownership**

In `src/app/App.tsx`, change labels to:

```ts
const items: Array<{ id: AppSection; label: string; icon: typeof Map }> = [
  { id: 'map', label: '地图', icon: Map },
  { id: 'memories', label: '胶片', icon: BookOpen },
  { id: 'music', label: '声音', icon: Music2 },
  { id: 'settings', label: '档案', icon: Settings },
];
```

Remove the `onOpenMemories` prop from the `MapPage` invocation and interface. Keep `MemoryPage.onOpenMap` because empty/detail actions still return to a place.

- [ ] **Step 4: Derive map presentation once in MapPage**

In `MapPage`, import and memoize Task 1's helper:

```ts
const presentations = useMemo(
  () => deriveMapPresentation(snapshot.places, snapshot.memories),
  [snapshot.memories, snapshot.places],
);
```

Pass `presentations` to `MapCanvas`. For the selected ticket, derive the latest memory using `presentations.get(selected.id)?.latestMemoryId` and `snapshot.memories.find()`; do not sort or mutate the snapshot arrays during render.

- [ ] **Step 5: Replace the map header and selected summary markup**

Replace `.map-title-row` plus `.mode-switch` with this structure:

```tsx
<div className="film-map-heading">
  <span className="roll-stamp">ROLL 01</span>
  <div><p className="eyebrow">LUOJIA / PRIVATE ARCHIVE</p><h1>我们的武大</h1></div>
  <div className="day-stamp"><span>TOGETHER</span><strong>{dayCount === null ? '未设置' : `DAY ${dayCount.toLocaleString('zh-CN')}`}</strong></div>
</div>
```

Retain the search row and filters immediately below it. Change category count metadata to the utility typeface but keep existing labels and filtering behavior.

Update the collapsed selected summary to use `<FilmFrame variant="thumbnail">` with the latest memory frame/date. When no memory exists, pass `frameNumber={0}` and `frameLabel="NEW PLACE"`, and render the category-color thumbnail currently used by `.film-thumb`; never expose a fake `FRAME 000` label.

- [ ] **Step 6: Render numbered markers and chronological routes**

Change `MapCanvasProps` from `routePlaceIds` to `presentations`. In the marker loop:

```ts
const frameNumber = presentations.get(place.id)?.latestFrameNumber ?? null;
const markerLabel = frameNumber === null ? '' : String(frameNumber).padStart(2, '0');
const icon = L.divIcon({
  className: 'map-marker-shell',
  html: `<span class="map-marker ${selected ? 'selected' : ''} ${frameNumber === null ? '' : 'has-frame'}" style="--marker-color:${meta.color}"><i>${markerLabel}</i></span>`,
  iconSize: [32, 38],
  iconAnchor: [16, 34],
});
```

Build route points by filtering presentations with non-null `routeOrder`, then sort by `routeOrder` and place id before converting coordinates. Preserve the existing dashed brick-red polyline and WGS-84 to GCJ-02 conversion.

- [ ] **Step 7: Replace map CSS with stable film-led geometry**

Implement these measurable rules in `src/styles.css`:

```css
.map-header { top: calc(8px + var(--safe-top)); left: 10px; right: 10px; }
.film-map-heading { min-height: 54px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; padding: 7px 8px; border: 1px solid var(--ink); background: rgba(247, 248, 247, 0.96); box-shadow: 3px 3px 0 var(--ink); pointer-events: auto; }
.film-map-heading h1 { margin: 2px 0 0; font: 700 18px/1 "Songti SC", "STSong", serif; }
.roll-stamp { padding: 5px; border: 1px solid var(--brick-red); color: var(--brick-red); font: 800 7px/1 "DIN Alternate", ui-monospace, monospace; transform: rotate(-2deg); }
.map-search-row { margin-top: 7px; }
.filter-strip { margin-top: 6px; }
.map-marker.has-frame i { inset: 0; display: grid; place-items: center; background: transparent; color: #fff; font: 800 7px/1 "DIN Alternate", ui-monospace, monospace; transform: rotate(45deg); }
.place-summary { border-color: var(--ink); border-radius: 2px; box-shadow: 4px 4px 0 var(--ink); }
```

Delete obsolete `.map-title-row` and `.mode-switch` rules after confirming no remaining references.

- [ ] **Step 8: Run map tests and inspect the screenshot**

Run:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- tests/map-presentation.test.ts tests/film-frame.test.tsx
npx.cmd playwright test e2e/app.spec.ts --project=iphone-chromium
```

Expected: all PASS. Inspect `test-results/**/map-home.png`; confirm the map header is compact, filter scrolling remains visible, attribution is readable, and map labels are not covered below the header.

- [ ] **Step 9: Commit the map composition**

```powershell
git add e2e/helpers.ts e2e/app.spec.ts src/app/App.tsx src/features/map/MapPage.tsx src/features/map/MapCanvas.tsx src/styles.css
git commit -m "feat: apply film-led map composition"
```

### Task 3: Developed-Roll Memory Book

**Files:**
- Modify: `src/features/memories/MemoryPage.tsx`
- Modify: `src/styles.css:192-228`
- Modify: `e2e/app.spec.ts`
- Create: `tests/memory-page.test.tsx`

**Interfaces:**
- Consumes: `FilmFrame` from Task 1
- Preserves: `MemoryPageProps.onOpenMap(placeId?: string): void`
- Preserves: `loadPhotoObjectUrl(session, photoId, memoryId): Promise<string | null>` and URL cleanup
- Produces: `MemoryCover` retry control with accessible name `重试照片`

- [ ] **Step 1: Add failing memory visual and failed-photo retry assertions**

Create `tests/memory-page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Memory } from '../src/domain/models';

const mocks = vi.hoisted(() => ({ loadPhotoObjectUrl: vi.fn() }));

vi.mock('../src/app/WorkspaceContext', () => ({
  useWorkspace: () => ({ session: { workspace: { id: 'workspace_test' } } }),
}));
vi.mock('../src/data/repository', () => ({ loadPhotoObjectUrl: mocks.loadPhotoObjectUrl }));

import { MemoryCover } from '../src/features/memories/MemoryPage';

const memory: Memory = {
  id: 'memory_retry', placeId: 'place_one', title: '照片回忆', text: '', occurredOn: '2026-07-20',
  photoIds: ['photo_one'], frameNumber: 1, createdAt: 1, updatedAt: 1, revision: 0,
  deviceId: 'device_one', deletedAt: null,
};

describe('MemoryCover', () => {
  beforeEach(() => {
    mocks.loadPhotoObjectUrl.mockReset();
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  it('retries a failed photo load from an independent accessible control', async () => {
    mocks.loadPhotoObjectUrl.mockResolvedValueOnce(null).mockResolvedValueOnce('blob:retried');
    const user = userEvent.setup();
    render(<MemoryCover memory={memory} />);

    await user.click(await screen.findByRole('button', { name: '重试照片' }));

    expect(await screen.findByRole('img', { name: '照片回忆' })).toHaveAttribute('src', 'blob:retried');
    expect(mocks.loadPhotoObjectUrl).toHaveBeenCalledTimes(2);
  });
});
```

Update the existing navigation click to use the stable label and assert the film frame:

```ts
await page.locator('.bottom-nav').getByRole('button', { name: '胶片', exact: true }).click();
await expect(page.getByRole('heading', { name: '第一帧测试' })).toBeVisible();
await expect(page.locator('.film-frame').first()).toContainText('FRAME 001');
await expect(page.locator('.film-frame-media.unexposed').first()).toContainText('UNEXPOSED');
await expect(page.getByLabel('视图切换')).toHaveCount(0);
```

Run the single project and expect FAIL because `MemoryPage` still uses `.memory-card`, the old placeholder, and the segmented switch.

- [ ] **Step 2: Replace the memory header with roll metadata**

Use this stable structure in `MemoryPage`:

```tsx
<header className="memory-header">
  <p className="eyebrow">OUR SHARED FILM · ROLL 01</p>
  <div className="memory-title-row"><h1>我们的武大</h1><div className="day-stamp"><span>TOGETHER</span><strong>{togetherDays ? `DAY ${togetherDays.toLocaleString('zh-CN')}` : '未设置日期'}</strong></div></div>
  <div className="film-counter"><span>{String(sorted.length).padStart(2, '0')} FRAMES</span><i /><span>{snapshot.places.length} PLACES</span></div>
</header>
```

Remove the `.mode-switch`. Keep the empty-state and detail return-to-map commands.

- [ ] **Step 3: Make MemoryCover return media only**

Import `RefreshCw` from Lucide. Export `MemoryCover` for its focused contract test, and make it return photo-loading, loaded-photo, or failed-photo presentation content without owning the no-photo placeholder:

```tsx
export function MemoryCover({ memory }: { memory: Memory }) {
  const { session } = useWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ settled: boolean; url: string | null }>({
    settled: false,
    url: null,
  });
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setState({ settled: false, url: null });
    if (session && memory.photoIds[0]) {
      void loadPhotoObjectUrl(session, memory.photoIds[0], memory.id)
        .then((value) => {
          objectUrl = value;
          if (active) setState({ settled: true, url: value });
        })
        .catch(() => {
          if (active) setState({ settled: true, url: null });
        });
    } else {
      setState({ settled: true, url: null });
    }
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attempt, memory.id, memory.photoIds, session]);
  if (!state.settled) return <span>DEVELOPING</span>;
  return state.url
    ? <img src={state.url} alt={memory.title} />
    : <button className="photo-retry" type="button" onClick={() => setAttempt((value) => value + 1)}><RefreshCw aria-hidden="true" />重试照片</button>;
}
```

The `FilmFrame` primitive owns `UNEXPOSED` whenever `hasMedia` is false. When a photo id exists, `MemoryCover` owns the `DEVELOPING`, loaded-image, and load-failure states.

- [ ] **Step 4: Render each memory through FilmFrame**

Replace the outer card button with a non-interactive `<article className="memory-card">`. Render the independent open command inside `FilmFrame` content so the retry command in the media slot is never nested inside another button:

```tsx
<article className="memory-card" key={memory.id}>
  <FilmFrame
    frameNumber={memory.frameNumber}
    date={formatDate(memory.occurredOn)}
    media={<MemoryCover memory={memory} />}
    hasMedia={memory.photoIds.length > 0}
  >
    <button className="memory-card-open" type="button" onClick={() => setSelected(memory)} aria-label={`打开回忆：${memory.title}`}>
      <span className="memory-card-copy">
        <strong>{memory.title}</strong>
        <span>{place?.name ?? '未关联地点'}{memory.text ? ` · ${memory.text}` : ''}</span>
      </span>
    </button>
  </FilmFrame>
</article>
```

Because photo presence and asynchronous photo state are different concerns, let `FilmFrame` accept `hasMedia?: boolean` and pass `hasMedia={memory.photoIds.length > 0}`. Render its `media` slot only when `hasMedia` is true; otherwise render `UNEXPOSED`. Task 1 tests cover the explicit false override and the `NEW PLACE` label contract.

- [ ] **Step 5: Apply developed-roll CSS**

Use fixed geometry:

```css
.memory-header { padding: calc(18px + var(--safe-top)) 14px 12px; border-bottom-color: var(--ink); background: rgba(247, 248, 247, 0.98); }
.memory-scroll { padding: calc(126px + var(--safe-top)) 14px calc(88px + var(--safe-bottom)); }
.memory-card { width: calc(100% - 8px); margin: 0 4px 20px; padding: 0; border: 0; background: transparent; text-align: left; }
.memory-card .film-frame { box-shadow: 4px 4px 0 var(--ink); }
.memory-card:nth-of-type(even) { margin-left: 8px; transform: none; }
.memory-card:nth-of-type(even) .film-frame { box-shadow: -4px 4px 0 var(--brick-red); }
.memory-card-open { width: 100%; min-height: 44px; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; }
.memory-card-copy { display: grid; gap: 5px; }
.memory-card-copy strong { font: 700 17px/1.25 "Songti SC", "STSong", serif; }
.memory-card-copy span { display: -webkit-box; overflow: hidden; color: var(--muted); font-size: 10px; line-height: 1.5; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.photo-retry { display: inline-flex; min-width: 44px; min-height: 44px; align-items: center; justify-content: center; gap: 6px; border: 1px solid currentColor; background: transparent; color: inherit; }
.photo-retry svg { width: 16px; height: 16px; }
```

Remove obsolete `.film-perforation`, `.memory-cover.placeholder`, and duplicated date-stamp rules now owned by `FilmFrame`.

- [ ] **Step 6: Run focused tests and inspect memory screenshot**

Run:

```powershell
npm.cmd test -- tests/film-frame.test.tsx tests/memory-page.test.tsx
npm.cmd run typecheck
npm.cmd run lint
npx.cmd playwright test e2e/app.spec.ts --project=iphone-chromium
```

Expected: PASS. Inspect `memory-book.png`; confirm photo ratio remains stable, unexposed content is informative, cards do not overlap, and bottom navigation does not cover content.

- [ ] **Step 7: Commit the memory book**

```powershell
git add src/features/memories/MemoryPage.tsx src/shared/FilmFrame.tsx src/styles.css tests/film-frame.test.tsx tests/memory-page.test.tsx e2e/app.spec.ts
git commit -m "feat: polish the developed-roll memory book"
```

### Task 4: Unlock, Forms, and Successful Frame Feedback

**Files:**
- Modify: `src/features/unlock/UnlockView.tsx`
- Modify: `src/features/places/PlaceForm.tsx`
- Modify: `src/features/memories/MemoryForm.tsx`
- Modify: `src/features/map/MapPage.tsx`
- Modify: `src/styles.css:65-88, 159-191`
- Modify: `e2e/app.spec.ts`

**Interfaces:**
- Preserves all existing form props and save callbacks
- Changes internal map notice state to `{ message: string; kind: 'default' | 'frame' } | null`
- Produces CSS state `.notice-toast.frame-saved` only after successful local memory save

- [ ] **Step 1: Add failing unlock and keyboard-layout assertions**

In `e2e/app.spec.ts`, before setup assert:

```ts
await expect(page.locator('.unlock-view')).toContainText('ROLL 01');
await expect(page.locator('.unlock-form')).toHaveCSS('box-shadow', 'none');
```

Add a separate test using `createWorkspace(page)`:

```ts
test('keeps the new-frame sheet usable with a keyboard-sized viewport', async ({ page }) => {
  await createWorkspace(page);
  await page.setViewportSize({ width: 393, height: 520 });
  await page.getByRole('button', { name: '添加地点' }).click();
  await page.getByRole('button', { name: '确认位置' }).click();
  const sheet = page.locator('.form-sheet');
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(520);
  await expect(page.getByRole('button', { name: '保存地点' })).toBeVisible();
});
```

Run E2E and expect the `ROLL 01` and shadow assertions to FAIL.

- [ ] **Step 2: Restructure UnlockView without changing its form contract**

Add a roll line and direct privacy line:

```tsx
<p className="roll-line">ROLL 01 · TWO PEOPLE ONLY</p>
```

Place it between the seal and existing eyebrow. Keep all input labels, autocomplete values, minimum length, error roles, submit copy, setup behavior, and date fields unchanged. Add a `.unlock-privacy` line containing `ShieldCheck` and `密钥只保留在当前设备内存，离开后自动锁定。` below the primary action.

- [ ] **Step 3: Apply archive-order unlock CSS**

Replace the floating-card effect:

```css
.unlock-view { padding: calc(30px + var(--safe-top)) 20px calc(28px + var(--safe-bottom)); }
.unlock-intro { margin-bottom: 22px; }
.roll-line { margin: 0 0 7px; color: var(--brick-red); font: 800 8px/1 "DIN Alternate", ui-monospace, monospace; }
.unlock-form { padding: 18px 0 0; border: 0; border-top: 1px solid var(--ink); border-radius: 0; background: transparent; box-shadow: none; }
.unlock-privacy { display: flex; align-items: center; gap: 8px; margin: 16px 0 0; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 10px; line-height: 1.45; }
.unlock-privacy svg { flex: none; color: var(--campus-green); }
```

- [ ] **Step 4: Apply frame metadata to place and memory sheets**

Keep familiar Chinese field labels and actions. Change kickers only:

```tsx
<p className="sheet-kicker">{value ? 'EDIT FRAME · PLACE' : 'NEW FRAME · PLACE'}</p>
```

For `MemoryForm`, retain `FRAME NNN` and add the place name in a `.sheet-context` line. Replace filename pills with ordered slots:

```tsx
<div className="selected-files" aria-label="已选择照片">
  {files.map((file, index) => <span key={`${file.name}-${file.lastModified}`}><b>{String(index + 1).padStart(2, '0')}</b><i>{file.name}</i></span>)}
</div>
```

CSS must keep filename text truncated and must not let a selected file change sheet width.

- [ ] **Step 5: Add post-save frame feedback only after repository success**

In `MapPage`, replace string notice state with:

```ts
type Notice = { message: string; kind: 'default' | 'frame' };
const [notice, setNotice] = useState<Notice | null>(null);
```

Set place success to `{ message: '地点已加密保存', kind: 'default' }`. In the memory callback, set `{ message: '回忆已存入胶片册', kind: 'frame' }` only after `upsertMemory` and all selected local photo writes finish. Render:

```tsx
{notice && <button className={notice.kind === 'frame' ? 'notice-toast frame-saved' : 'notice-toast'} type="button" onClick={() => setNotice(null)}>{notice.message}</button>}
```

Add:

```css
@media (prefers-reduced-motion: no-preference) {
  .notice-toast.frame-saved { animation: frame-saved 180ms ease-out; }
}
@keyframes frame-saved { from { opacity: 0; transform: translateX(-50%) scale(0.96); } to { opacity: 1; transform: translateX(-50%) scale(1); } }
```

Do not animate a full-screen overlay.

- [ ] **Step 6: Run form, motion, and core-flow verification**

Run:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npx.cmd playwright test e2e/app.spec.ts --project=iphone-chromium
```

Expected: PASS. Confirm the existing reduced-motion test reports `0s` transitions and the keyboard-sized sheet stays within 520px.

- [ ] **Step 7: Commit unlock and forms**

```powershell
git add src/features/unlock/UnlockView.tsx src/features/places/PlaceForm.tsx src/features/memories/MemoryForm.tsx src/features/map/MapPage.tsx src/styles.css e2e/app.spec.ts
git commit -m "feat: unify secure forms with film styling"
```

### Task 5: Soundtrack and Archive Index

**Files:**
- Modify: `src/features/music/MusicPage.tsx`
- Modify: `src/features/settings/SettingsPage.tsx`
- Modify: `src/styles.css:229-263`
- Modify: `e2e/app.spec.ts`

**Interfaces:**
- Preserves `MusicPage` audio/ref/playlist behavior and URL validation
- Preserves `SettingsPage` sync, relationship, import, export, and lock callbacks
- Produces only presentational section classes and copy changes

- [ ] **Step 1: Add failing utility-page E2E assertions**

Add a test:

```ts
test('uses soundtrack and archive-index presentation without changing commands', async ({ page }) => {
  await createWorkspace(page);
  await page.getByRole('button', { name: '声音', exact: true }).click();
  await expect(page.getByText('OUR SOUNDTRACK · SIDE A')).toBeVisible();
  await expect(page.getByRole('button', { name: '播放' })).toBeVisible();
  await page.getByRole('button', { name: '档案', exact: true }).click();
  await expect(page.getByRole('heading', { name: '档案设置' })).toBeVisible();
  await expect(page.getByText('01 / RELATIONSHIP')).toBeVisible();
  await expect(page.getByRole('button', { name: /立即锁定/ })).toBeVisible();
});
```

Run the project and expect FAIL because the new kicker, heading, and indexes are absent.

- [ ] **Step 2: Reformat and label MusicPage as a soundtrack**

Expand the current one-line JSX into header, now-playing, add form, and track-list blocks. Change only presentation copy:

```tsx
<header className="utility-header soundtrack-header">
  <p className="eyebrow">OUR SOUNDTRACK · SIDE A</p>
  <h1>一起听</h1>
  <div className="utility-counter"><span>{String(snapshot.playlist.length).padStart(2, '0')} TRACKS</span><i /><span>PRIVATE PLAYLIST</span></div>
</header>
```

Keep the existing current title, previous/play/next controls, hidden audio element, URL form, error copy, item deletion, and safe-URL checks unchanged. Add `SIDE A / TRACK NN` metadata to each track row.

- [ ] **Step 3: Reformat SettingsPage into indexed unframed sections**

Change the header to:

```tsx
<header className="utility-header archive-header">
  <p className="eyebrow">PRIVATE ARCHIVE · INDEX</p>
  <h1>档案设置</h1>
  <p>隐私、同步与本机数据集中管理。</p>
</header>
```

Create presentational section headings with exact labels `01 / RELATIONSHIP`, `02 / DATA`, and `03 / SECURITY`. Place existing relationship form under 01, sync/import/export/migration under 02, and lock under 03. Preserve every handler, `syncLabel()` branch, form label, and migration count.

- [ ] **Step 4: Replace utility card stacks with archive rules**

Implement:

```css
.utility-header { margin-bottom: 18px; padding-bottom: 13px; border-bottom: 1px solid var(--ink); }
.utility-counter, .archive-index-title { display: flex; align-items: center; gap: 8px; color: var(--brick-red); font: 800 8px/1 "DIN Alternate", ui-monospace, monospace; }
.utility-counter i, .archive-index-title i { height: 1px; flex: 1; background: var(--line); }
.archive-index-title { max-width: 680px; margin: 20px auto 8px; }
.settings-status { border-radius: 0; border-inline: 0; }
.settings-section { border: 0; border-top: 1px solid var(--line); border-radius: 0; background: transparent; }
.track { border-bottom-color: var(--line); }
.track.active { border-left-color: var(--brick-red); background: var(--surface); }
```

Keep the now-playing tool framed because it is a genuine player surface, but remove any nested card appearance around its controls.

- [ ] **Step 5: Run utility E2E and static checks**

Run:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npx.cmd playwright test e2e/app.spec.ts --project=iphone-chromium
```

Expected: PASS. Manually confirm `播放`, `上一首`, `下一首`, sync, export, import, save dates, and lock remain reachable and named.

- [ ] **Step 6: Commit soundtrack and archive index**

```powershell
git add src/features/music/MusicPage.tsx src/features/settings/SettingsPage.tsx src/styles.css e2e/app.spec.ts
git commit -m "feat: polish soundtrack and archive settings"
```

### Task 6: Visual Regression and Release Verification

**Files:**
- Create: `e2e/visual.spec.ts`
- Modify: `e2e/app.spec.ts`
- Modify: `src/styles.css` only for defects proven by this task

**Interfaces:**
- Consumes: `createWorkspace(page)` from Task 2
- Preserves: existing tile-loaded pixel assertion and all release commands
- Produces: screenshots for map, selected ticket, memory roll, unlock, keyboard sheet, soundtrack, and archive settings

- [ ] **Step 1: Add failure, empty, long-text, and horizontal-overflow coverage**

Create `e2e/visual.spec.ts` with separate isolated tests:

```ts
import { expect, test } from '@playwright/test';
import { createWorkspace } from './helpers';

test('keeps the film system inside the iPhone viewport', async ({ page }) => {
  await createWorkspace(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393);
  const header = await page.locator('.map-header').boundingBox();
  expect(header).not.toBeNull();
  expect(header?.height).toBeLessThanOrEqual(150);
  const nav = await page.locator('.bottom-nav').boundingBox();
  expect(nav).not.toBeNull();
  expect((nav?.y ?? 0) + (nav?.height ?? 0)).toBeLessThanOrEqual(852);
});

test('shows an operational tile failure state', async ({ page }) => {
  await page.route('https://webrd0*.is.autonavi.com/**', (route) => route.abort());
  await createWorkspace(page);
  await expect(page.getByText('底图暂时未载入，地点仍可使用')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.map-marker')).toHaveCount(5);
});

test('shows an unexposed empty roll', async ({ page }) => {
  await createWorkspace(page);
  await page.getByRole('button', { name: '胶片', exact: true }).click();
  await expect(page.getByText('FRAME 000')).toBeVisible();
  await expect(page.getByRole('button', { name: '回到地图' })).toBeVisible();
});
```

- [ ] **Step 2: Add approximate 200-percent text and reduced-motion checks**

Add:

```ts
test('keeps primary commands coherent with enlarged text', async ({ page }) => {
  await createWorkspace(page);
  await page.evaluate(() => { document.body.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393);
  for (const button of await page.locator('.bottom-nav button').all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test('removes film motion when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await createWorkspace(page);
  await expect(page.locator('.map-marker').first()).toHaveCSS('transition-duration', '0s');
  await expect(page.locator('.bottom-nav')).toHaveCSS('transition-duration', '0s');
});
```

If enlarged text exposes clipping, fix the specific selector with wrapping, minimum block size, or ellipsis. Do not shrink fonts dynamically with viewport width.

- [ ] **Step 3: Capture named screenshots after stable states**

Use `testInfo.outputPath()` and wait for loaded tiles/opacity before map captures. Add screenshots named:

```text
unlock-film.png
map-film.png
map-ticket.png
memory-roll.png
keyboard-sheet.png
soundtrack.png
archive-settings.png
```

For every screenshot, assert the target heading or status is visible first. Never use arbitrary timeouts to hide layout races.

- [ ] **Step 4: Run the complete automated gate**

Run:

```powershell
npm.cmd run check
npx.cmd playwright test --project=iphone-chromium
npm.cmd audit
git diff --check
```

Expected:

```text
TypeScript: PASS
ESLint: PASS
Frontend unit tests: PASS
Worker runtime tests: PASS
Production build: PASS
Worker dry-run: PASS
iPhone Chromium E2E: PASS
npm audit: 0 vulnerabilities
git diff --check: no errors
```

- [ ] **Step 5: Check the compressed resource budget**

Read the Vite build output and sum the gzip sizes of the initial application JS, CSS, and PWA registration helper. Expected total: at most 250KB, excluding map tiles and user media. Do not count source maps or Workbox runtime maps.

- [ ] **Step 6: Perform screenshot review**

Inspect every screenshot at original resolution and verify:

```text
No clipped Chinese text
No incoherent overlap
No horizontal document scroll
Map attribution remains readable
Header leaves a usable map viewport
Selected ticket clears the bottom navigation
Film offsets do not move card dimensions
Keyboard sheet keeps save visible
Error states remain direct and actionable
Palette is not beige/sepia dominated
```

Use `rg -n "#[0-9a-fA-F]{6}|rgba?\(" src/styles.css` to scan the final palette. Fix only defects demonstrated by tests or screenshots.

- [ ] **Step 7: Attempt WebKit and record the environment result**

Run:

```powershell
npx.cmd playwright test --project=iphone-webkit
```

Expected: PASS when Playwright WebKit is installed. If the browser runtime cannot be downloaded in the current network, do not remove the project; report the limitation and retain the physical iPhone 15 Pro acceptance requirement.

- [ ] **Step 8: Scan current files for secrets and private generated artifacts**

Run:

```powershell
rg -n -S "(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)" . --glob '!node_modules/**' --glob '!dist/**' --glob '!dist-worker/**' --glob '!.git/**' --glob '!.superpowers/**' --glob '!test-results/**'
git status --short --ignored
```

Expected: no secret matches. `.superpowers/`, `.wrangler/`, `.legacy-private/`, `dist/`, `dist-worker/`, `test-results/`, and Playwright output remain ignored.

- [ ] **Step 9: Commit verification coverage and final visual fixes**

```powershell
git add e2e/app.spec.ts e2e/visual.spec.ts src/styles.css
git commit -m "test: verify film-led iPhone experience"
```

- [ ] **Step 10: Start the final local preview**

Run:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

If port 5173 is occupied, use the next free port. Report the exact URL, final commit list, automated results, WebKit limitation if any, and the remaining production blockers: credential revocation, licensed production tiles, Cloudflare provisioning, and physical iPhone acceptance. Do not deploy or rewrite Git history without explicit authorization.
