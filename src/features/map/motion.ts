export type MapCameraMotion =
  | { readonly animate: true; readonly duration: 0.18 }
  | { readonly animate: false };

export function getMarkerSelectionMotion(reducedMotion: boolean): MapCameraMotion {
  return reducedMotion
    ? { animate: false }
    : { animate: true, duration: 0.18 };
}

export function getGeolocationMotion(): MapCameraMotion {
  return { animate: false };
}

