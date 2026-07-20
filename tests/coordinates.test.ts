import { describe, expect, it } from 'vitest';
import { gcj02ToWgs84, toAmapNavigationUrl, wgs84ToGcj02 } from '../src/services/coordinates';

describe('coordinate conversion', () => {
  it('leaves coordinates outside China unchanged', () => {
    expect(wgs84ToGcj02(-0.1276, 51.5072)).toEqual([-0.1276, 51.5072]);
  });

  it('round-trips Wuhan coordinates within practical map precision', () => {
    const source: [number, number] = [114.3585, 30.5445];
    const display = wgs84ToGcj02(source[0], source[1]);
    const restored = gcj02ToWgs84(display[0], display[1]);
    expect(display[0]).not.toBe(source[0]);
    expect(Math.abs(restored[0] - source[0])).toBeLessThan(0.00003);
    expect(Math.abs(restored[1] - source[1])).toBeLessThan(0.00003);
  });

  it('creates an encoded HTTPS Amap navigation URL', () => {
    const value = toAmapNavigationUrl({ name: '樱花大道', lat: 30.541, lng: 114.366 });
    const url = new URL(value);
    expect(url.protocol).toBe('https:');
    expect(url.searchParams.get('name')).toBe('樱花大道');
    expect(url.searchParams.get('callnative')).toBe('1');
  });
});
