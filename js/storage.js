/* ============================================
   storage.js — Data persistence layer
   Handles preset data + localStorage user data
   ============================================ */

const Storage = (() => {
  const STORAGE_KEY = 'whu_guide_user_places';
  const DELETED_KEY = 'whu_guide_deleted_ids';
  const MODIFIED_KEY = 'whu_guide_last_modified';

  // ---- Cloud Sync ----
  let _syncTimer = null;

  // ---- Place type metadata ----
  const TYPE_META = {
    food:          { icon: '🍜', label: '美食', color: '#c2776a' },
    shopping:      { icon: '🛒', label: '购物', color: '#7a9db5' },
    service:       { icon: '🏪', label: '生活服务', color: '#7a9e7e' },
    study:         { icon: '📚', label: '学习', color: '#8b7a9e' },
    entertainment: { icon: '🎮', label: '娱乐', color: '#c49b6e' },
    memory:        { icon: '🎓', label: '我们', color: '#c48b8a' },
    other:         { icon: '📌', label: '其他', color: '#8c8c8c' },
  };

  let presetPlaces = [];
  let userPlaces = [];
  let deletedIds = [];

  // ---- Initialization ----
  async function init() {
    // Load preset data from JSON
    try {
      const resp = await fetch('data/places.json');
      if (resp.ok) {
        presetPlaces = await resp.json();
      }
    } catch (e) {
      console.warn('Failed to load preset places, using empty list', e);
      presetPlaces = [];
    }

    // Migrate preset places from old single-photo format
    presetPlaces = presetPlaces.map(_normalizePhotos);

    // Load user-added places from localStorage
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      userPlaces = raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('Failed to parse user places', e);
      userPlaces = [];
    }

    // Migrate user places + persist cleaned format
    var migrated = false;
    userPlaces = userPlaces.map(function(p) {
      var n = _normalizePhotos(p);
      if (n !== p) migrated = true;
      return n;
    });
    if (migrated) _persistUserPlaces();

    // Load deleted IDs
    try {
      var raw = localStorage.getItem(DELETED_KEY);
      deletedIds = raw ? JSON.parse(raw) : [];
    } catch (e) {
      deletedIds = [];
    }

    // ---- Background cloud sync ----
    if (CloudSync.isConfigured()) {
      var localModified = parseInt(localStorage.getItem(MODIFIED_KEY) || '0', 10);
      CloudSync.fetch().then(function(cloudData) {
        if (cloudData && cloudData.userPlaces) {
          var cloudModified = cloudData.lastModified || 0;
          if (cloudModified > localModified) {
            // Cloud is newer — use smart merge instead of overwrite
            var result = CloudSync.smartMerge(userPlaces, cloudData.userPlaces.map(_normalizePhotos), deletedIds, cloudData.deletedIds || []);
            userPlaces = result.places;
            deletedIds = result.deletedIds;
            _persistLocal();
            console.log('☁️ Cloud merged → local (' + userPlaces.length + ' places)');
            if (result.warnings.length > 0) {
              console.log('☁️ Merge notes:', result.warnings.join(', '));
            }
            // Sync music playlist from cloud
            if (cloudData.musicPlaylist && cloudData.musicPlaylist.length > 0) {
              _syncMusicFromCloud(cloudData.musicPlaylist, cloudData.musicIndex || 0);
            }
            document.dispatchEvent(new CustomEvent('cloud-synced'));
          } else if (localModified > cloudModified) {
            console.log('☁️ Local → cloud (' + userPlaces.length + ' places)');
            _scheduleCloudSync();
          } else {
            console.log('☁️ In sync (' + userPlaces.length + ' places)');
          }
        } else {
          console.log('☁️ Creating cloud data...');
          _bumpTimestamp();
          _scheduleCloudSync();
        }
      }).catch(function(e) {
        console.warn('☁️ Cloud offline, using local data', e);
      });
    } else {
      console.log('☁️ Cloud sync not configured — localStorage only');
    }
  }

  /** Migrate old `photo` field → `photos` array. Returns a new object if changed. */
  function _normalizePhotos(place) {
    if (!place.photos) {
      if (place.photo) {
        var p = Object.assign({}, place, { photos: [place.photo] });
        delete p.photo;
        return p;
      }
      return Object.assign({}, place, { photos: [] });
    }
    return place;
  }

  /** Safe access to first photo regardless of field name */
  function getPrimaryPhoto(place) {
    if (place.photos && place.photos.length > 0) return place.photos[0];
    if (place.photo) return place.photo;
    return null;
  }

  // ---- Accessors ----
  function getAllPlaces() {
    return [...presetPlaces, ...userPlaces];
  }

  function getVisiblePlaces() {
    return getAllPlaces().filter(p => !deletedIds.includes(p.id));
  }

  function getByType(type) {
    if (!type || type === 'all') return getVisiblePlaces();
    return getVisiblePlaces().filter(p => p.type === type);
  }

  function getCounts() {
    const visible = getVisiblePlaces();
    const counts = { all: visible.length };
    Object.keys(TYPE_META).forEach(t => {
      counts[t] = visible.filter(p => p.type === t).length;
    });
    return counts;
  }

  // ---- User data mutations ----
  function addUserPlace(place) {
    const newPlace = {
      ...place,
      id: 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      addedBy: 'user',
    };
    userPlaces.push(newPlace);
    _persistUserPlaces();
    return newPlace;
  }

  function deletePlace(id) {
    const userIdx = userPlaces.findIndex(p => p.id === id);
    if (userIdx >= 0) {
      userPlaces.splice(userIdx, 1);
      _persistUserPlaces();
      return true;
    }

    if (!deletedIds.includes(id)) {
      deletedIds.push(id);
      _persistDeleted();
      return true;
    }
    return false;
  }

  function resetDeleted() {
    deletedIds = [];
    _persistDeleted();
  }

  function updateUserPlace(id, updates) {
    const idx = userPlaces.findIndex(p => p.id === id);
    if (idx >= 0) {
      userPlaces[idx] = { ...userPlaces[idx], ...updates };
      _persistUserPlaces();
      return userPlaces[idx];
    }
    return null;
  }

  function isUserPlace(id) {
    return userPlaces.some(p => p.id === id);
  }

  function getPlaceById(id) {
    var preset = presetPlaces.find(function(p) { return p.id === id; });
    if (preset) return _normalizePhotos(Object.assign({}, preset, { _isPreset: true }));
    var user = userPlaces.find(function(p) { return p.id === id; });
    return user ? _normalizePhotos(Object.assign({}, user, { _isPreset: false })) : null;
  }

  function editPlace(id, data) {
    const userIdx = userPlaces.findIndex(p => p.id === id);
    if (userIdx >= 0) {
      userPlaces[userIdx] = { ...userPlaces[userIdx], ...data };
      _persistUserPlaces();
      return { place: userPlaces[userIdx], idChanged: false };
    }

    const presetIdx = presetPlaces.findIndex(p => p.id === id);
    if (presetIdx >= 0) {
      if (!deletedIds.includes(id)) {
        deletedIds.push(id);
        _persistDeleted();
      }
      const forked = {
        ...presetPlaces[presetIdx],
        ...data,
        id: 'forked_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        addedBy: 'user',
      };
      userPlaces.push(forked);
      _persistUserPlaces();
      return { place: forked, idChanged: true, oldId: id };
    }

    return null;
  }

  function exportAll() {
    return JSON.stringify(getVisiblePlaces(), null, 2);
  }

  function importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!Array.isArray(data)) throw new Error('Not an array');
      const existingNames = new Set(userPlaces.map(p => p.name));
      const newItems = data.filter(d => !existingNames.has(d.name));
      userPlaces = [...userPlaces, ...newItems.map(function(d) {
        return _normalizePhotos(Object.assign({}, d, {
          id: 'import_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          addedBy: 'import',
        }));
      })];
      _persistUserPlaces();
      return newItems.length;
    } catch (e) {
      console.error('Import failed', e);
      throw e;
    }
  }

  function _bumpTimestamp() {
    localStorage.setItem(MODIFIED_KEY, Date.now());
  }

  function _persistUserPlaces() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userPlaces));
    _bumpTimestamp();
    _scheduleCloudSync();
  }

  function _persistDeleted() {
    localStorage.setItem(DELETED_KEY, JSON.stringify(deletedIds));
    _bumpTimestamp();
    _scheduleCloudSync();
  }

  function _persistLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userPlaces));
    localStorage.setItem(DELETED_KEY, JSON.stringify(deletedIds));
  }

  // ---- Cloud Sync Functions ----

  function _getMusicData() {
    try {
      var raw = localStorage.getItem('whu_music_playlist');
      var idx = localStorage.getItem('whu_music_index');
      return {
        playlist: raw ? JSON.parse(raw) : [],
        index: idx ? parseInt(idx, 10) : 0,
      };
    } catch(e) { return { playlist: [], index: 0 }; }
  }

  function _syncMusicFromCloud(cloudPlaylist, cloudIndex) {
    try {
      var local = _getMusicData();
      // Only sync if cloud has more songs or local is empty
      if (cloudPlaylist.length > local.playlist.length || local.playlist.length === 0) {
        localStorage.setItem('whu_music_playlist', JSON.stringify(cloudPlaylist));
        localStorage.setItem('whu_music_index', String(cloudIndex));
        console.log('🎵 Music playlist synced from cloud (' + cloudPlaylist.length + ' songs)');
        document.dispatchEvent(new CustomEvent('music-synced'));
      }
    } catch(e) {
      console.warn('Music sync from cloud failed:', e);
    }
  }

  function _cloudPush() {
    var musicData = _getMusicData();
    var data = {
      userPlaces: userPlaces,
      deletedIds: deletedIds,
      musicPlaylist: musicData.playlist,
      musicIndex: musicData.index,
      lastModified: parseInt(localStorage.getItem(MODIFIED_KEY) || '0', 10),
    };
    CloudSync.push(data).then(function(ok) {
      if (ok) {
        console.log('☁️ Sync OK ✓');
        document.dispatchEvent(new CustomEvent('sync-success'));
      } else {
        console.error('☁️ Sync FAIL');
        document.dispatchEvent(new CustomEvent('sync-failed'));
      }
    }).catch(function(e) {
      console.error('☁️ Sync FAIL:', e.message || e);
      document.dispatchEvent(new CustomEvent('sync-failed'));
    });
  }

  function _scheduleCloudSync() {
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(_cloudPush, 1500);
  }

  // ---- Manual sync trigger (called from UI) ----
  function syncNow() {
    if (!CloudSync.isConfigured()) {
      console.warn('☁️ Cloud sync not configured');
      document.dispatchEvent(new CustomEvent('sync-failed'));
      return;
    }
    _bumpTimestamp();
    _scheduleCloudSync();
  }

  return {
    TYPE_META,
    init,
    getAllPlaces,
    getVisiblePlaces,
    getByType,
    getCounts,
    addUserPlace,
    deletePlace,
    updateUserPlace,
    isUserPlace,
    getPlaceById,
    editPlace,
    resetDeleted,
    exportAll,
    importData,
    getPrimaryPhoto,
    syncNow,
  };
})();
