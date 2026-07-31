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
