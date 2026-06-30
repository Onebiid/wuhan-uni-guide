/* ============================================
   map.js — Leaflet map core
   高德底图 (GCJ-02) + WGS-84 ↔ GCJ-02 坐标转换
   All stored data is WGS-84. Display on GCJ-02 tiles.
   ============================================ */

const MapModule = (() => {
  // Wuhan University center
  const WHU_CENTER = [30.5410, 114.3640];
  const DEFAULT_ZOOM = 15;

  let map = null;
  let markers = [];              // { id, marker, place }
  let currentFilter = 'all';
  let editModeActive = false;

  // ---- Custom drag state ----
  let dragTarget = null;
  let dragStartPoint = null;
  let dragStartLatLng = null;
  let dragMoved = false;
  const DRAG_THRESHOLD = 5;

  // ============================================================
  //  WGS-84 ↔ GCJ-02 coordinate transformation
  //  Amap (高德) tiles use GCJ-02. GPS / OSM use WGS-84.
  //  We store everything as WGS-84 and convert on display.
  // ============================================================
  const PI = Math.PI;
  const A  = 6378245.0;
  const EE = 0.00669342162296594323;

  function _isOutOfChina(lng, lat) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }

  function _transformLat(x, y) {
    var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * PI) + 320.0 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }

  function _transformLng(x, y) {
    var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
    return ret;
  }

  /** WGS-84 → GCJ-02. Returns [lng, lat]. No-op if outside China. */
  function wgs84ToGcj02(lng, lat) {
    if (_isOutOfChina(lng, lat)) return [lng, lat];
    var dlat = _transformLat(lng - 105.0, lat - 35.0);
    var dlng = _transformLng(lng - 105.0, lat - 35.0);
    var radlat = lat / 180.0 * PI;
    var magic = Math.sin(radlat);
    magic = 1 - EE * magic * magic;
    var sqrtmagic = Math.sqrt(magic);
    dlat = (dlat * 180.0) / ((A * (1 - EE)) / (magic * sqrtmagic) * PI);
    dlng = (dlng * 180.0) / (A / sqrtmagic * Math.cos(radlat) * PI);
    return [lng + dlng, lat + dlat];
  }

  /** GCJ-02 → WGS-84. Returns [lng, lat]. Iterative reverse. */
  function gcj02ToWgs84(lng, lat) {
    if (_isOutOfChina(lng, lat)) return [lng, lat];
    var gcj = wgs84ToGcj02(lng, lat);
    var dlng = gcj[0] - lng;
    var dlat = gcj[1] - lat;
    return [lng - dlng, lat - dlat];
  }

  // Convenience: convert a [lat, lng] pair for Leaflet display
  function _toDisplay(lat, lng) {
    var gcj = wgs84ToGcj02(lng, lat);
    return [gcj[1], gcj[0]];  // [lat, lng] for Leaflet
  }

  function _toStorage(lat, lng) {
    var wgs = gcj02ToWgs84(lng, lat);
    return { lat: wgs[1], lng: wgs[0] };
  }

  // ---- Tile system (高德 Amap GCJ-02) ----
  let tileLayer = null;
  // Amap style=7 is the lighter / cleaner variant
  const AMAP_URL = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}';

  function _createTileLayer() {
    var layer = L.tileLayer(AMAP_URL, {
      subdomains: ['1', '2', '3', '4'],
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.amap.com/">高德地图</a> | &#x1f495; WHU',
    });
    layer.on('tileerror', function () {
      // silently ignore — tiles usually recover on next pan
    });
    return layer;
  }

  function reloadTiles() {
    if (tileLayer) map.removeLayer(tileLayer);
    tileLayer = _createTileLayer();
    tileLayer.addTo(map);
    console.log('🔄 Map tiles reloaded (Amap)');
  }

  // ---- Map init ----

  function init(options) {
    options = options || {};

    // Initial center: WGS-84 → GCJ-02
    var centerGcj = _toDisplay(WHU_CENTER[0], WHU_CENTER[1]);

    map = L.map('map', {
      center: centerGcj,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: true,
      gestureHandling: false,
    });

    tileLayer = _createTileLayer();
    tileLayer.addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    // Map click — add mode (convert GCJ-02 → WGS-84 for storage)
    map.on('click', function (e) {
      if (UI.isAddMode()) {
        var wgs = _toStorage(e.latlng.lat, e.latlng.lng);
        UI.openModalAt(wgs.lat, wgs.lng);
      }
    });

    // User-located event (GPS is WGS-84, convert for display)
    document.addEventListener('user-located', function (e) {
      var display = _toDisplay(e.detail.lat, e.detail.lng);
      map.setView(display, 17, { animate: true });
      L.circleMarker(display, {
        radius: 10,
        color: '#c2776a',
        fillColor: '#d4a099',
        fillOpacity: 0.4,
        weight: 3,
      }).addTo(map).bindPopup('📍 你现在在这里').openPopup();
    });
  }

  // ---- Markers ----

  function _createDivIcon(place) {
    return L.divIcon({
      className: 'map-marker ' + (place.type || 'other'),
      html: '<div class="marker-dot"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12],
    });
  }

  function renderMarkers(places) {
    clearMarkers();
    markers = [];

    var filtered = currentFilter === 'all'
      ? places
      : places.filter(function (p) { return p.type === currentFilter; });

    filtered.forEach(function (place) {
      // WGS-84 → GCJ-02 for display
      var display = _toDisplay(place.lat, place.lng);

      var marker = L.marker(display, {
        icon: _createDivIcon(place),
        draggable: false,
      }).addTo(map);

      marker.bindPopup(_buildPopupHtml(place), {
        closeButton: true,
        className: 'custom-popup',
      });

      // Drag (edit mode only)
      marker.on('mousedown touchstart', function (e) {
        if (!editModeActive) return;
        map.dragging.disable();
        L.DomEvent.stopPropagation(e.originalEvent);
        dragTarget = marker;
        dragStartPoint = e.containerPoint;
        dragStartLatLng = marker.getLatLng();
        dragMoved = false;
        map.on('mousemove touchmove', _onDragMove);
        map.on('mouseup touchend', _onDragEnd);
      });

      // Click
      marker.on('click', function (e) {
        L.DomEvent.stopPropagation(e.originalEvent);

        if (editModeActive) {
          _cleanupDrag();
          var entry = markers.find(function (m) { return m.marker === e.target; });
          if (entry) UI.openEditModal(entry.place);
          return;
        }

        map.flyTo(display, 17, { duration: 0.6 });

        if (place.photo) {
          Memory.show(place, function () {
            UI.showDetail(place, place.addedBy === 'user');
          });
        } else {
          UI.showDetail(place, place.addedBy === 'user');
        }
      });

      markers.push({ id: place.id, marker: marker, place: place });
    });

    if (editModeActive) _applyEditStyle(true);
  }

  // ---- Drag handlers (convert GCJ-02 back to WGS-84 on save) ----

  function _onDragMove(e) {
    if (!dragTarget) return;
    var dx = e.containerPoint.x - dragStartPoint.x;
    var dy = e.containerPoint.y - dragStartPoint.y;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      dragMoved = true;
    }
    if (dragMoved) {
      dragTarget.setLatLng(e.latlng);
    }
  }

  function _cleanupDrag() {
    map.off('mousemove touchmove', _onDragMove);
    map.off('mouseup touchend', _onDragEnd);
    map.dragging.enable();
    dragTarget = null;
    dragStartPoint = null;
    dragMoved = false;
  }

  function _onDragEnd(e) {
    if (dragTarget && dragMoved) {
      var latlng = dragTarget.getLatLng();
      var entry = markers.find(function (m) { return m.marker === dragTarget; });
      if (entry) {
        // GCJ-02 → WGS-84 for storage
        var wgs = _toStorage(latlng.lat, latlng.lng);
        entry.place.lat = wgs.lat;
        entry.place.lng = wgs.lng;
        Storage.editPlace(entry.place.id, { lat: wgs.lat, lng: wgs.lng });
        UI.showToast('📍 位置已更新');
      }
    }
    _cleanupDrag();
  }

  // ---- Public API ----

  function flyToPlace(place) {
    var display = _toDisplay(place.lat, place.lng);
    map.flyTo(display, 17, { duration: 0.8 });
    var entry = markers.find(function (m) { return m.id === place.id; });
    if (entry) {
      var el = entry.marker.getElement();
      if (el) {
        var dot = el.querySelector('.marker-dot');
        if (dot) {
          dot.classList.add('highlight');
          setTimeout(function () {
            dot.classList.remove('highlight');
          }, 800);
        }
      }
    }
    UI.showDetail(place, place.addedBy === 'user');
  }

  function setEditMode(active) {
    editModeActive = active;
    _cleanupDrag();
    _applyEditStyle(active);
  }

  function _applyEditStyle(active) {
    markers.forEach(function (m) {
      var el = m.marker.getElement();
      if (!el) return;
      var dot = el.querySelector('.marker-dot');
      if (!dot) return;
      if (active) {
        dot.classList.add('edit-mode');
      } else {
        dot.classList.remove('edit-mode');
      }
    });
  }

  function filterByType(type) {
    currentFilter = type;
    renderMarkers(Storage.getVisiblePlaces());
  }

  function addMarker(place) {
    var display = _toDisplay(place.lat, place.lng);

    var marker = L.marker(display, {
      icon: _createDivIcon(place),
      draggable: false,
    }).addTo(map);

    marker.bindPopup(_buildPopupHtml(place));

    marker.on('mousedown touchstart', function (e) {
      if (!editModeActive) return;
      map.dragging.disable();
      L.DomEvent.stopPropagation(e.originalEvent);
      dragTarget = marker;
      dragStartPoint = e.containerPoint;
      dragStartLatLng = marker.getLatLng();
      dragMoved = false;
      map.on('mousemove touchmove', _onDragMove);
      map.on('mouseup touchend', _onDragEnd);
    });

    marker.on('click', function (e) {
      L.DomEvent.stopPropagation(e.originalEvent);
      if (editModeActive) {
        _cleanupDrag();
        var entry = markers.find(function (m) { return m.marker === e.target; });
        if (entry) UI.openEditModal(entry.place);
        return;
      }
      map.flyTo(display, 17, { duration: 0.6 });
      if (place.photo) {
        Memory.show(place, function () { UI.showDetail(place, true); });
      } else {
        UI.showDetail(place, true);
      }
    });

    markers.push({ id: place.id, marker: marker, place: place });

    if (editModeActive) {
      var editEl = marker.getElement();
      if (editEl) {
        var editDot = editEl.querySelector('.marker-dot');
        if (editDot) editDot.classList.add('edit-mode');
      }
    }

    map.flyTo(display, 17, { duration: 0.5 });

    setTimeout(function () {
      var animEl = marker.getElement();
      if (animEl) {
        var animDot = animEl.querySelector('.marker-dot');
        if (animDot) {
          animDot.classList.add('just-added');
          setTimeout(function () {
            animDot.classList.remove('just-added');
          }, 500);
        }
      }
    }, 1200);
  }

  function removeMarker(id) {
    var idx = markers.findIndex(function (m) { return m.id === id; });
    if (idx >= 0) {
      map.removeLayer(markers[idx].marker);
      markers.splice(idx, 1);
    }
  }

  function refreshMarkerPopup(id, updatedPlace) {
    var entry = markers.find(function (m) { return m.id === id; });
    if (entry) {
      entry.marker.unbindPopup();
      entry.marker.bindPopup(_buildPopupHtml(updatedPlace), {
        closeButton: true,
        className: 'custom-popup',
      });
      entry.place = updatedPlace;
    }
  }

  function clearMarkers() {
    markers.forEach(function (m) { map.removeLayer(m.marker); });
    markers = [];
  }

  function refresh() {
    var places = Storage.getVisiblePlaces();
    renderMarkers(places);
    UI.updateCounts(Storage.getCounts());
    Search.updateIndex(places);
  }

  function getMap() {
    return map;
  }

  // ---- Popup HTML ----

  function _buildPopupHtml(place) {
    var meta = Storage.TYPE_META[place.type];
    var navLinks = Routing.getNavLinks(place);
    var primaryNav = navLinks.find(function (l) { return l.primary; }) || navLinks[0];

    var html = '<div style="min-width:160px;font-family:inherit;">';
    var icon = meta ? meta.icon : '📌';
    html += '<strong>' + icon + ' ' + _esc(place.name) + '</strong>';
    html += '<span style="display:inline-block;background:' + (meta ? meta.color : '#8c8c8c') + ';color:white;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">' + (meta ? meta.label : '') + '</span>';
    if (place.photo) {
      html += '<img src="' + place.photo + '" style="display:block;width:100%;max-height:120px;object-fit:cover;border-radius:8px;margin-top:8px;" alt="" />';
    }
    if (place.note) {
      html += '<p style="margin:6px 0 0;font-size:12px;color:#7a6652;">' + _esc(place.note) + '</p>';
    }
    html += '<a href="' + primaryNav.url + '" target="_blank" style="display:inline-block;margin-top:8px;padding:6px 14px;background:#c2776a;color:white;border-radius:14px;font-size:12px;font-weight:600;text-decoration:none;">🗺️ 导航</a>';
    html += '</div>';
    return html;
  }

  function _esc(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    init: init,
    renderMarkers: renderMarkers,
    flyToPlace: flyToPlace,
    setEditMode: setEditMode,
    filterByType: filterByType,
    addMarker: addMarker,
    removeMarker: removeMarker,
    refreshMarkerPopup: refreshMarkerPopup,
    clearMarkers: clearMarkers,
    refresh: refresh,
    reloadTiles: reloadTiles,
    getMap: getMap,
  };
})();
