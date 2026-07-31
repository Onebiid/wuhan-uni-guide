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
