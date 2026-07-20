import { categories, createId, isSafeImageSource, memorySchema, placeSchema, type Category, type Memory, type Place } from '../domain/models';

interface LegacyPlace {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  note?: unknown;
  lat?: unknown;
  lng?: unknown;
  memory?: unknown;
  photo?: unknown;
  photos?: unknown;
  addedBy?: unknown;
}

export interface LegacySnapshot {
  places: LegacyPlace[];
  deletedIds: string[];
  playlist: unknown[];
  playlistIndex: number;
  lastModified: number;
}

export interface MigrationResult {
  places: Place[];
  memories: Memory[];
  legacyPhotos: Array<{ memoryId: string; source: string }>;
  skipped: number;
  repaired: number;
}

export function readLegacySnapshot(storage: Storage): LegacySnapshot {
  return {
    places: parseArray(storage.getItem('whu_guide_user_places')).filter(isLegacyPlace),
    deletedIds: parseArray(storage.getItem('whu_guide_deleted_ids')).filter((value): value is string => typeof value === 'string'),
    playlist: parseArray(storage.getItem('whu_music_playlist')),
    playlistIndex: parseInteger(storage.getItem('whu_music_index')),
    lastModified: parseInteger(storage.getItem('whu_guide_last_modified')),
  };
}

function isLegacyPlace(value: unknown): value is LegacyPlace {
  return typeof value === 'object' && value !== null;
}

export function migrateLegacySnapshot(snapshot: LegacySnapshot, deviceId: string, now = Date.now()): MigrationResult {
  const places: Place[] = [];
  const memories: Memory[] = [];
  const legacyPhotos: Array<{ memoryId: string; source: string }> = [];
  let skipped = 0;
  let repaired = 0;

  snapshot.places.forEach((legacy, index) => {
    const name = typeof legacy.name === 'string' ? legacy.name.trim() : '';
    const lat = typeof legacy.lat === 'number' ? legacy.lat : Number.NaN;
    const lng = typeof legacy.lng === 'number' ? legacy.lng : Number.NaN;
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      skipped += 1;
      return;
    }
    const candidateCategory = typeof legacy.type === 'string' ? legacy.type : 'other';
    const category: Category = categories.includes(candidateCategory as Category) ? (candidateCategory as Category) : 'other';
    if (category !== candidateCategory) repaired += 1;
    const id = normalizeLegacyId(legacy.id, `place_${index}`);
    const deletedAt = snapshot.deletedIds.includes(String(legacy.id)) ? now : null;
    const parsedPlace = placeSchema.safeParse({
      id,
      category,
      name,
      note: typeof legacy.note === 'string' ? legacy.note : '',
      lat,
      lng,
      createdAt: snapshot.lastModified || now,
      updatedAt: snapshot.lastModified || now,
      revision: 0,
      deviceId,
      deletedAt,
    });
    if (!parsedPlace.success) {
      skipped += 1;
      return;
    }
    places.push(parsedPlace.data);

    const photos = normalizePhotos(legacy);
    const memoryText = typeof legacy.memory === 'string' ? legacy.memory.trim() : '';
    if (memoryText || photos.length > 0 || category === 'memory') {
      const memoryId = createId('memory');
      const parsedMemory = memorySchema.parse({
        id: memoryId,
        placeId: id,
        title: name,
        text: memoryText || (typeof legacy.note === 'string' ? legacy.note : ''),
        occurredOn: null,
        photoIds: [],
        frameNumber: memories.length + 1,
        createdAt: snapshot.lastModified || now,
        updatedAt: snapshot.lastModified || now,
        revision: 0,
        deviceId,
        deletedAt,
      });
      memories.push(parsedMemory);
      photos.forEach((source) => legacyPhotos.push({ memoryId, source }));
    }
  });

  return { places, memories, legacyPhotos, skipped, repaired };
}

export function migrateLegacyExport(value: unknown, deviceId: string, now = Date.now()): MigrationResult {
  const places = Array.isArray(value) ? value.filter(isLegacyPlace) : [];
  return migrateLegacySnapshot({ places, deletedIds: [], playlist: [], playlistIndex: 0, lastModified: now }, deviceId, now);
}

function parseArray(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseInteger(value: string | null): number {
  const parsed = Number.parseInt(value ?? '0', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeLegacyId(value: unknown, fallback: string): string {
  if (typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)) return value;
  return `${fallback}_${crypto.randomUUID().replaceAll('-', '')}`;
}

function normalizePhotos(place: LegacyPlace): string[] {
  const candidates = Array.isArray(place.photos) ? place.photos : place.photo ? [place.photo] : [];
  return candidates.filter((value): value is string => typeof value === 'string' && isSafeImageSource(value)).slice(0, 9);
}
