import { describe, expect, it } from 'vitest';
import { getGeolocationMotion, getMarkerSelectionMotion } from '../src/features/map/motion';

describe('map camera motion', () => {
  it('caps normal marker selection motion at 180ms', () => {
    expect(getMarkerSelectionMotion(false)).toEqual({ animate: true, duration: 0.18 });
  });

  it('disables marker selection motion for reduced-motion users', () => {
    expect(getMarkerSelectionMotion(true)).toEqual({ animate: false });
  });

  it('keeps geolocation movement non-animated', () => {
    expect(getGeolocationMotion()).toEqual({ animate: false });
  });
});
