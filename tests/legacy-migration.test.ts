import { beforeEach, describe, expect, it } from 'vitest';
import { migrateLegacySnapshot, readLegacySnapshot } from '../src/data/legacy-migration';

describe('legacy migration', () => {
  beforeEach(() => localStorage.clear());

  it('repairs categories and separates a memory from its place', () => {
    localStorage.setItem('whu_guide_last_modified', '1000');
    localStorage.setItem('whu_guide_user_places', JSON.stringify([
      {
        id: 'user_1', name: '老斋舍', type: 'unknown', lat: 30.54, lng: 114.36,
        note: '散步', memory: '第一次一起走过这里', photo: 'https://example.com/photo.jpg',
      },
    ]));
    const result = migrateLegacySnapshot(readLegacySnapshot(localStorage), 'device_test', 2_000);
    expect(result.places).toHaveLength(1);
    expect(result.places[0]?.category).toBe('other');
    expect(result.memories[0]?.placeId).toBe('user_1');
    expect(result.legacyPhotos).toEqual([{ memoryId: result.memories[0]?.id, source: 'https://example.com/photo.jpg' }]);
    expect(result.repaired).toBe(1);
  });

  it('skips malformed coordinates without throwing', () => {
    localStorage.setItem('whu_guide_user_places', JSON.stringify([{ name: '坏数据', lat: 'x', lng: 114 }]));
    const result = migrateLegacySnapshot(readLegacySnapshot(localStorage), 'device_test');
    expect(result.places).toEqual([]);
    expect(result.skipped).toBe(1);
  });
});
