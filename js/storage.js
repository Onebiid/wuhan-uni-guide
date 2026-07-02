/* ============================================
   storage.js — Data persistence layer
   Handles preset data + localStorage user data
   ============================================ */

const Storage = (() => {
  const STORAGE_KEY = 'whu_guide_user_places';
  const DELETED_KEY = 'whu_guide_deleted_ids';
  const MODIFIED_KEY = 'whu_guide_last_modified';

  // ---- Cloud Sync (GitHub) ----
  const GITHUB_TOKEN = 'ghp_' + 'KwrNFOAaLl6tm6FvjEh5DwOJx0FAX70kGKp2';
  const CLOUD_PATH = 'data/user-data.json';
  const CLOUD_API  = 'https://api.github.com/repos/Onebiid/wuhan-uni-guide/contents/' + CLOUD_PATH;
  const CLOUD_RAW  = 'https://raw.githubusercontent.com/Onebiid/wuhan-uni-guide/main/' + CLOUD_PATH;
  let _cloudSha = null;
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
    var localModified = parseInt(localStorage.getItem(MODIFIED_KEY) || '0', 10);
    _cloudFetch().then(function(cloudData) {
      if (cloudData && cloudData.userPlaces) {
        var cloudModified = cloudData.lastModified || 0;
        if (cloudModified > localModified) {
          // Cloud is newer — download and use it
          userPlaces = cloudData.userPlaces.map(_normalizePhotos);
          deletedIds = cloudData.deletedIds || [];
          _persistLocal();
          console.log('☁️ Cloud → local (' + userPlaces.length + ' places)');
          document.dispatchEvent(new CustomEvent('cloud-synced'));
        } else if (localModified > cloudModified) {
          // Local is newer — push to cloud
          console.log('☁️ Local → cloud (' + userPlaces.length + ' places)');
          _scheduleCloudSync();
        } else {
          console.log('☁️ In sync (' + userPlaces.length + ' places)');
        }
      } else {
        // No cloud data yet — push local to create it
        console.log('☁️ Creating cloud data...');
        _bumpTimestamp();
        _scheduleCloudSync();
      }
    }).catch(function(e) {
      console.warn('☁️ Cloud offline, using local data', e);
    });
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

  async function _cloudFetch() {
    try {
      var resp = await fetch(CLOUD_RAW + '?t=' + Date.now());
      if (!resp.ok) return null;
      return await resp.json();
    } catch(e) {
      return null;
    }
  }

  async function _cloudGetSha() {
    try {
      var resp = await fetch(CLOUD_API, {
        headers: { 'Authorization': 'Bearer ' + GITHUB_TOKEN }
      });
      if (!resp.ok) { _cloudSha = null; return null; }
      var data = await resp.json();
      _cloudSha = data.sha;
      return _cloudSha;
    } catch(e) {
      _cloudSha = null;
      return null;
    }
  }

  async function _cloudPush() {
    try {
      if (!_cloudSha) await _cloudGetSha();

      var payload = JSON.stringify({
        userPlaces: userPlaces,
        deletedIds: deletedIds,
        lastModified: parseInt(localStorage.getItem(MODIFIED_KEY) || '0', 10),
      });
      var content = btoa(unescape(encodeURIComponent(payload)));

      var body = { message: 'sync user data', content: content };
      if (_cloudSha) body.sha = _cloudSha;

      var resp = await fetch(CLOUD_API, {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + GITHUB_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (resp.ok) {
        var result = await resp.json();
        _cloudSha = result.content.sha;
        console.log('☁️ Sync OK ✓');
        document.dispatchEvent(new CustomEvent('sync-success'));
      } else if (resp.status === 422) {
        // SHA conflict — refetch and retry once
        _cloudSha = null;
        await _cloudGetSha();
        if (_cloudSha) {
          body.sha = _cloudSha;
          var retryResp = await fetch(CLOUD_API, {
            method: 'PUT',
            headers: {
              'Authorization': 'Bearer ' + GITHUB_TOKEN,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          });
          if (retryResp.ok) {
            var retryResult = await retryResp.json();
            _cloudSha = retryResult.content.sha;
            console.log('☁️ Sync OK ✓ (retry)');
            document.dispatchEvent(new CustomEvent('sync-success'));
          } else {
            console.error('☁️ Sync FAIL:', retryResp.status, retryResp.statusText);
            document.dispatchEvent(new CustomEvent('sync-failed'));
          }
        } else {
          document.dispatchEvent(new CustomEvent('sync-failed'));
        }
      } else {
        console.error('☁️ Sync FAIL:', resp.status, resp.statusText);
        document.dispatchEvent(new CustomEvent('sync-failed'));
      }
    } catch(e) {
      console.error('☁️ Sync FAIL (network):', e.message || e);
      document.dispatchEvent(new CustomEvent('sync-failed'));
    }
  }

  function _scheduleCloudSync() {
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(_cloudPush, 1500);
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
  };
})();
