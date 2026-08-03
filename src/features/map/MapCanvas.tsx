import { useEffect, useRef, useState } from 'react';
import L, { type LayerGroup, type Map as LeafletMap } from 'leaflet';
import { categoryMeta, type Place } from '../../domain/models';
import { gcj02ToWgs84, wgs84ToGcj02 } from '../../services/coordinates';
import { getGeolocationMotion, getMarkerSelectionMotion } from './motion';
import type { MapPlacePresentation } from './presentation';

interface MapCanvasProps {
  places: Place[];
  selectedId: string | null;
  presentations: ReadonlyMap<string, MapPlacePresentation>;
  positioning: boolean;
  onSelect: (id: string | null) => void;
  onPositionChange: (lat: number, lng: number) => void;
  locateRequest: number;
}

const DEFAULT_CENTER: [number, number] = [30.5404, 114.3634];
const DEV_TILE_URL = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}';
type TileStatus = 'loading' | 'ready' | 'error' | 'unconfigured';
const CONFIGURED_TILE_URL = import.meta.env.VITE_MAP_TILE_URL?.trim();
const TILE_URL = CONFIGURED_TILE_URL || (import.meta.env.DEV ? DEV_TILE_URL : null);

export function MapCanvas({
  places,
  selectedId,
  presentations,
  positioning,
  onSelect,
  onPositionChange,
  locateRequest,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LayerGroup | null>(null);
  const routeRef = useRef<LayerGroup | null>(null);
  const callbacksRef = useRef({ onSelect, onPositionChange });
  const [tileStatus, setTileStatus] = useState<TileStatus>(TILE_URL ? 'loading' : 'unconfigured');

  useEffect(() => {
    callbacksRef.current = { onSelect, onPositionChange };
  }, [onPositionChange, onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const [displayLng, displayLat] = wgs84ToGcj02(DEFAULT_CENTER[1], DEFAULT_CENTER[0]);
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true, preferCanvas: true })
      .setView([displayLat, displayLng], 16);
    mapRef.current = map;
    markersRef.current = L.layerGroup().addTo(map);
    routeRef.current = L.layerGroup().addTo(map);
    if (!TILE_URL) {
      containerRef.current.classList.add('map-fallback');
    }

    if (TILE_URL) {
      const tileLayer = L.tileLayer(TILE_URL, {
        subdomains: ['1', '2', '3', '4'],
        maxZoom: 19,
        minZoom: 3,
        updateWhenIdle: true,
        attribution: import.meta.env.VITE_MAP_ATTRIBUTION ?? '地图数据 © 高德地图',
      });
      let tileFailures = 0;
      let loadedTiles = 0;
      tileLayer.on('loading', () => {
        if (loadedTiles === 0) setTileStatus('loading');
      });
      tileLayer.on('tileerror', () => {
        tileFailures += 1;
        if (tileFailures >= 6 && loadedTiles === 0) {
          containerRef.current?.classList.add('map-fallback');
          setTileStatus('error');
        }
      });
      tileLayer.on('tileload', () => {
        loadedTiles += 1;
      });
      tileLayer.on('load', () => {
        if (loadedTiles === 0) return;
        containerRef.current?.classList.remove('map-fallback');
        setTileStatus('ready');
      });
      tileLayer.addTo(map);
    }
    map.on('click', () => callbacksRef.current.onSelect(null));
    map.on('move', () => {
      const center = map.getCenter();
      const [lng, lat] = gcj02ToWgs84(center.lng, center.lat);
      callbacksRef.current.onPositionChange(lat, lng);
    });
    const resize = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    resize.observe(containerRef.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      routeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const markers = markersRef.current;
    const map = mapRef.current;
    if (!markers || !map) return;
    markers.clearLayers();
    for (const place of places) {
      const [lng, lat] = wgs84ToGcj02(place.lng, place.lat);
      const meta = categoryMeta[place.category];
      const selected = selectedId === place.id;
      const frameNumber = presentations.get(place.id)?.latestFrameNumber ?? null;
      const markerLabel = frameNumber === null ? '' : String(frameNumber).padStart(2, '0');
      const icon = L.divIcon({
        className: 'map-marker-shell',
        html: `<span class="map-marker ${selected ? 'selected' : ''} ${frameNumber === null ? '' : 'has-frame'}" style="--marker-color:${meta.color}"><i>${markerLabel}</i></span>`,
        iconSize: [44, 44],
        iconAnchor: [22, 34],
      });
      const marker = L.marker([lat, lng], { icon, title: place.name, keyboard: true, riseOnHover: true });
      marker.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        callbacksRef.current.onSelect(place.id);
      });
      marker.addTo(markers);
    }
  }, [places, presentations, selectedId]);

  useEffect(() => {
    const layer = routeRef.current;
    if (!layer) return;
    layer.clearLayers();
    const points = places
      .filter((place) => presentations.get(place.id)?.routeOrder != null)
      .sort((a, b) => {
        const order = (presentations.get(a.id)?.routeOrder ?? 0) - (presentations.get(b.id)?.routeOrder ?? 0);
        return order || a.id.localeCompare(b.id);
      })
      .map((place) => {
        const [lng, lat] = wgs84ToGcj02(place.lng, place.lat);
        return L.latLng(lat, lng);
      });
    if (points.length > 1) {
      L.polyline(points, { color: '#a03f49', weight: 3, opacity: 0.72, dashArray: '7 9', lineCap: 'round' }).addTo(layer);
    }
  }, [places, presentations]);

  useEffect(() => {
    if (!selectedId || positioning) return;
    const place = places.find((item) => item.id === selectedId);
    const map = mapRef.current;
    if (!place || !map) return;
    const [lng, lat] = wgs84ToGcj02(place.lng, place.lat);
    const zoom = Math.max(map.getZoom(), 17);
    const motion = getMarkerSelectionMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (motion.animate) map.flyTo([lat, lng], zoom, motion);
    else map.setView([lat, lng], zoom, motion);
  }, [places, positioning, selectedId]);

  useEffect(() => {
    if (locateRequest === 0 || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition((position) => {
      const [lng, lat] = wgs84ToGcj02(position.coords.longitude, position.coords.latitude);
      mapRef.current?.setView([lat, lng], 17, getGeolocationMotion());
    }, () => {
      containerRef.current?.dispatchEvent(new CustomEvent('location-denied', { bubbles: true }));
    }, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 });
  }, [locateRequest]);

  return (
    <div className="map-surface">
      <div
        ref={containerRef}
        className="map-canvas"
        data-tile-status={tileStatus}
        aria-busy={tileStatus === 'loading'}
        aria-label="武汉大学地点地图"
      />
      {tileStatus !== 'ready' && (
        <div className={`map-tile-status ${tileStatus}`} role="status">
          <span aria-hidden="true" />
          {tileStatus === 'loading' && '正在加载校园底图'}
          {tileStatus === 'error' && '底图暂时未载入，地点仍可使用'}
          {tileStatus === 'unconfigured' && '发布环境尚未配置地图底图'}
        </div>
      )}
      {positioning && <div className="map-crosshair" aria-hidden="true"><span /></div>}
    </div>
  );
}
