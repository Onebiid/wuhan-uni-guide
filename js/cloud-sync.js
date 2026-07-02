/* ============================================
   cloud-sync.js — LeanCloud cloud sync
   Works in China without VPN
   Supports: places data + music playlist sync
   ============================================ */

const CloudSync = (() => {
  const CONFIG_KEY = 'whu_cloud_config';
  const OBJ_ID_KEY = 'whu_cloud_object_id';

  const CLASS = 'UserData';
  const OBJ_ID = 'main';

  let _config = null;
  let _objectId = null;
  let _syncInProgress = false;

  // Load saved config + objectId from localStorage
  function _loadConfig() {
    try {
      var raw = localStorage.getItem(CONFIG_KEY);
      if (raw) { _config = JSON.parse(raw); return true; }
    } catch(e) { /* ignore */ }
    _config = {
      appId: 'PASTE_YOUR_LEANCLOUD_APP_ID_HERE',
      appKey: 'PASTE_YOUR_LEANCLOUD_APP_KEY_HERE',
      region: 'lc-cn-n1-shared',
    };
    return false;
  }

  function _loadObjectId() {
    try {
      _objectId = localStorage.getItem(OBJ_ID_KEY) || null;
    } catch(e) { _objectId = null; }
  }

  function _saveObjectId(id) {
    _objectId = id;
    try { localStorage.setItem(OBJ_ID_KEY, id); } catch(e) {}
  }

  function _getBaseUrl() {
    if (!_config) _loadConfig();
    return 'https://' + _config.appId + '.' + _config.region + '.com/1.1';
  }

  function _getHeaders() {
    if (!_config) _loadConfig();
    return { 'X-LC-Id': _config.appId, 'X-LC-Key': _config.appKey };
  }

  // ---- Init ----
  _loadConfig();
  _loadObjectId();

  // ---- Public API ----

  function isConfigured() {
    if (!_config) _loadConfig();
    return _config.appId.indexOf('PASTE_YOUR') === -1 && _config.appId.length > 10;
  }

  function configure(appId, appKey, region) {
    _config = { appId: appId, appKey: appKey, region: region || 'lc-cn-n1-shared' };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(_config));
    _saveObjectId(null); // reset — will re-resolve on next fetch
    return true;
  }

  function getConfig() {
    if (!_config) _loadConfig();
    return {
      appId: _config.appId,
      appKey: _config.appKey,
      region: _config.region,
      isConfigured: isConfigured(),
    };
  }

  async function test() {
    if (!isConfigured()) return false;
    try {
      var resp = await fetch(_getBaseUrl() + '/classes/' + CLASS + '/main', {
        headers: _getHeaders()
      });
      return resp.ok || resp.status === 404;
    } catch(e) {
      console.error('CloudSync test failed:', e.message);
      return false;
    }
  }

  async function fetch() {
    if (!isConfigured()) return null;

    // Try by saved objectId first, then by OBJ_ID
    var ids = [];
    if (_objectId) ids.push(_objectId);
    ids.push(OBJ_ID);

    for (var i = 0; i < ids.length; i++) {
      try {
        var resp = await fetch(_getBaseUrl() + '/classes/' + CLASS + '/' + ids[i], {
          headers: _getHeaders()
        });
        if (resp.ok) {
          var data = await resp.json();
          _saveObjectId(data.objectId);
          return {
            userPlaces: data.userPlaces || [],
            deletedIds: data.deletedIds || [],
            musicPlaylist: data.musicPlaylist || [],
            musicIndex: data.musicIndex || 0,
            lastModified: data.lastModified || 0,
          };
        }
      } catch(e) {}
    }
    return null;
  }

  async function push(data) {
    if (!isConfigured()) return false;
    if (_syncInProgress) return false;
    _syncInProgress = true;

    try {
      var body = JSON.stringify(data);
      var headers = Object.assign({}, _getHeaders(), { 'Content-Type': 'application/json' });
      var resp;

      if (_objectId) {
        // Update existing object
        resp = await fetch(_getBaseUrl() + '/classes/' + CLASS + '/' + _objectId, {
          method: 'PUT', headers: headers, body: body,
        });
        if (!resp.ok && resp.status === 404) {
          // Object was deleted on server — create new
          _saveObjectId(null);
          _syncInProgress = false;
          return await push(data); // retry once
        }
      }

      if (!_objectId) {
        // No objectId yet — search for existing object
        var found = await _findExistingObject();
        if (found) {
          _saveObjectId(found);
          resp = await fetch(_getBaseUrl() + '/classes/' + CLASS + '/' + found, {
            method: 'PUT', headers: headers, body: body,
          });
        } else {
          // Create new object
          resp = await fetch(_getBaseUrl() + '/classes/' + CLASS, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(Object.assign({}, JSON.parse(body))),
          });
          if (resp.ok) {
            var created = await resp.json();
            _saveObjectId(created.objectId);
          }
        }
      }

      _syncInProgress = false;
      if (resp && resp.ok) return true;

      console.error('CloudSync push failed:', resp ? resp.status : 'no response');
      return false;
    } catch(e) {
      _syncInProgress = false;
      console.error('CloudSync push failed:', e.message);
      return false;
    }
  }

  // Find existing UserData object (first one in the class)
  async function _findExistingObject() {
    try {
      var url = _getBaseUrl() + '/classes/' + CLASS + '?limit=1&order=-createdAt';
      var resp = await fetch(url, { headers: _getHeaders() });
      if (resp.ok) {
        var data = await resp.json();
        if (data.results && data.results.length > 0) {
          return data.results[0].objectId;
        }
      }
    } catch(e) {}
    return null;
  }

  function isSyncing() { return _syncInProgress; }

  // ---- Smart Merge ----
  function smartMerge(localPlaces, cloudPlaces, localDeleted, cloudDeleted) {
    var merged = {};
    var warnings = [];

    localPlaces.forEach(function(p) { merged[p.id] = p; });

    cloudPlaces.forEach(function(cp) {
      if (merged[cp.id]) {
        var lp = merged[cp.id];
        // Keep version with more photos
        if (cp.photos && lp.photos && cp.photos.length > lp.photos.length) {
          merged[cp.id] = cp;
          warnings.push('"' + cp.name + '" 照片已从云端更新');
        }
        // Keep longer note
        if (cp.note && cp.note.length > (lp.note || '').length) {
          merged[cp.id].note = cp.note;
        }
      } else {
        merged[cp.id] = cp;
      }
    });

    var deletedUnion = {};
    localDeleted.forEach(function(d) { deletedUnion[d] = true; });
    cloudDeleted.forEach(function(d) { deletedUnion[d] = true; });

    return {
      places: Object.values(merged),
      deletedIds: Object.keys(deletedUnion),
      warnings: warnings,
    };
  }

  return { test, fetch, push, isConfigured, configure, getConfig, isSyncing, smartMerge };
})();
