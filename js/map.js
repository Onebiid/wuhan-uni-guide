/* ============================================
   map.js — Leaflet map core
   Map init, markers, layers, interaction
   ============================================ */

const MapModule = (() => {
  // Wuhan University center
  const WHU_CENTER = [30.5410, 114.3640];
  const DEFAULT_ZOOM = 15;

  let map = null;
  let markers = [];              // { id, marker, place }
  let currentFilter = 'all';
  let onMapClickForAdd = null;   // callback(lat, lng)

  /**
   * Initialize the Leaflet map
   */
  function init(options = {}) {
    onMapClickForAdd = options.onMapClickForAdd || null;

    map = L.map('map', {
      center: WHU_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: true,
      gestureHandling: true,          // prevent map scroll trap on mobile
    });

    // Tile layer with China-friendly fallback
    // Primary: CartoDB Voyager (global CDN, usually accessible)
    // Fallback: Wikimedia maps (different CDN)
    const tileUrls = [
      { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', opts: { subdomains: 'abcd', maxZoom: 19 } },
      { url: 'https://tiles.wmflabs.org/osm-no-labels/{z}/{x}/{y}.png', opts: { maxZoom: 18 } },
      { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', opts: { subdomains: 'abc', maxZoom: 19 } },
    ];

    let tileLayer = L.tileLayer(tileUrls[0].url, {
      ...tileUrls[0].opts,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> | 💕 WHU Guide',
    }).addTo(map);

    // Fallback: if tiles fail to load, try next source
    let tileFailCount = 0;
    let fallbackIndex = 0;
    tileLayer.on('tileerror', function(e) {
      tileFailCount++;
      if (tileFailCount > 3 && fallbackIndex < tileUrls.length - 1) {
        fallbackIndex++;
        map.removeLayer(tileLayer);
        tileLayer = L.tileLayer(tileUrls[fallbackIndex].url, {
          ...tileUrls[fallbackIndex].opts,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> | 💕 WHU Guide',
        }).addTo(map);
        tileFailCount = 0;
        console.warn('Tile source failed, switched to fallback #' + fallbackIndex);
      }
    });

    // Zoom control — top right, below top bar
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Map click handler
    map.on('click', (e) => {
      if (UI.isAddMode()) {
        UI.openModalAt(e.latlng.lat, e.latlng.lng);
      }
    });

    // Listen for user-located event
    document.addEventListener('user-located', (e) => {
      const { lat, lng } = e.detail;
      map.setView([lat, lng], 17, { animate: true });
      // Add a temporary location marker
      L.circleMarker([lat, lng], {
        radius: 10,
        color: '#2980b9',
        fillColor: '#3498db',
        fillOpacity: 0.4,
        weight: 3,
      }).addTo(map).bindPopup('📍 你现在在这里').openPopup();
    });
  }

  /**
   * Render all markers for visible places
   */
  function renderMarkers(places) {
    // Clear existing markers
    clearMarkers();
    markers = [];

    const filtered = currentFilter === 'all'
      ? places
      : places.filter(p => p.type === currentFilter);

    filtered.forEach(place => {
      const meta = Storage.TYPE_META[place.type];
      const color = meta?.color || '#95a5a6';
      const icon = meta?.icon || '📌';

      const marker = L.circleMarker([place.lat, place.lng], {
        radius: 10,
        fillColor: color,
        color: '#fff',
        weight: 2.5,
        opacity: 1,
        fillOpacity: 0.85,
      }).addTo(map);

      // Popup on click
      marker.bindPopup(_buildPopupHtml(place), {
        closeButton: true,
        className: 'custom-popup',
      });

      // Click to show detail panel
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e.originalEvent);
        const deletable = place.addedBy === 'user';
        UI.showDetail(place, deletable);
        // Fly to the marker
        map.flyTo([place.lat, place.lng], 17, { duration: 0.6 });
      });

      markers.push({ id: place.id, marker, place });
    });
  }

  /**
   * Fly to a specific place
   */
  function flyToPlace(place) {
    map.flyTo([place.lat, place.lng], 17, {
      duration: 0.8,
    });
    // Briefly pulse the marker
    const entry = markers.find(m => m.id === place.id);
    if (entry) {
      const originalRadius = entry.marker.getRadius();
      entry.marker.setRadius(originalRadius + 6);
      entry.marker.setStyle({ fillOpacity: 1, weight: 4 });
      setTimeout(() => {
        entry.marker.setRadius(originalRadius);
        entry.marker.setStyle({ fillOpacity: 0.85, weight: 2.5 });
      }, 800);
    }
    UI.showDetail(place, place.addedBy === 'user');
  }

  /**
   * Filter markers by type
   */
  function filterByType(type) {
    currentFilter = type;
    const places = Storage.getVisiblePlaces();
    renderMarkers(places);
  }

  /**
   * Add a single marker for a newly added place
   */
  function addMarker(place) {
    const meta = Storage.TYPE_META[place.type];
    const color = meta?.color || '#95a5a6';

    const marker = L.circleMarker([place.lat, place.lng], {
      radius: 12,  // slightly larger for new marker
      fillColor: color,
      color: '#fff',
      weight: 3,
      opacity: 1,
      fillOpacity: 0.9,
    }).addTo(map);

    marker.bindPopup(_buildPopupHtml(place));
    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e.originalEvent);
      UI.showDetail(place, true);
      map.flyTo([place.lat, place.lng], 17, { duration: 0.6 });
    });

    markers.push({ id: place.id, marker, place });

    // Fly to the new marker
    map.flyTo([place.lat, place.lng], 17, { duration: 0.5 });

    // Pulse animation
    setTimeout(() => {
      marker.setRadius(10);
      marker.setStyle({ fillOpacity: 0.85, weight: 2.5 });
    }, 1200);
  }

  /**
   * Remove a marker by place ID
   */
  function removeMarker(id) {
    const idx = markers.findIndex(m => m.id === id);
    if (idx >= 0) {
      map.removeLayer(markers[idx].marker);
      markers.splice(idx, 1);
    }
  }

  /**
   * Clear all markers from map
   */
  function clearMarkers() {
    markers.forEach(m => map.removeLayer(m.marker));
    markers = [];
  }

  /**
   * Refresh all markers (after data change)
   */
  function refresh() {
    const places = Storage.getVisiblePlaces();
    renderMarkers(places);
    UI.updateCounts(Storage.getCounts());
    Search.updateIndex(places);
  }

  /**
   * Get map instance
   */
  function getMap() {
    return map;
  }

  // ---- Internal ----
  function _buildPopupHtml(place) {
    const meta = Storage.TYPE_META[place.type];
    const icon = meta?.icon || '📌';
    const navLinks = Routing.getNavLinks(place);
    const primaryNav = navLinks.find(l => l.primary) || navLinks[0];

    return `
      <div style="min-width:160px;font-family:inherit;">
        <strong>${icon} ${_esc(place.name)}</strong>
        <span style="display:inline-block;background:${meta?.color};color:white;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${meta?.label}</span>
        ${place.note ? `<p style="margin:6px 0 0;font-size:12px;color:#7a6652;">${_esc(place.note)}</p>` : ''}
        <a href="${primaryNav.url}" target="_blank" class="popup-nav-btn" style="display:inline-block;margin-top:8px;padding:6px 14px;background:#e74c3c;color:white;border-radius:14px;font-size:12px;font-weight:600;text-decoration:none;">🗺️ 导航</a>
      </div>
    `;
  }

  function _esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    init,
    renderMarkers,
    flyToPlace,
    filterByType,
    addMarker,
    removeMarker,
    clearMarkers,
    refresh,
    getMap,
  };
})();
