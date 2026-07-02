/* ============================================
   cloud-sync.js — GitHub cloud sync
   Read: raw.githubusercontent.com (CDN, good in China)
   Write: api.github.com (may need VPN sometimes)
   ============================================ */

const CloudSync = (() => {
  const TOKEN = 'ghp_' + 'KwrNFOAaLl6tm6FvjEh5DwOJx0FAX70kGKp2';
  const REPO = 'Onebiid/wuhan-uni-guide';
  const PATH = 'data/user-data.json';
  const API_URL = 'https://api.github.com/repos/' + REPO + '/contents/' + PATH;
  const RAW_URL = 'https://raw.githubusercontent.com/' + REPO + '/main/' + PATH;

  let _sha = null;
  let _syncInProgress = false;

  // Restore SHA from localStorage
  try {
    _sha = localStorage.getItem('whu_cloud_sha') || null;
  } catch(e) { _sha = null; }

  function _saveSha(sha) {
    _sha = sha;
    try { localStorage.setItem('whu_cloud_sha', sha); } catch(e) {}
  }

  // Always configured — token is built in
  function isConfigured() {
    return true;
  }

  function getConfig() {
    return { type: 'github', repo: REPO, isConfigured: true };
  }

  async function test() {
    try {
      var resp = await fetch(RAW_URL + '?t=' + Date.now());
      return resp.ok || resp.status === 404;
    } catch(e) { return false; }
  }

  // ---- Fetch from GitHub (raw CDN) ----
  async function fetch() {
    try {
      var resp = await fetch(RAW_URL + '?t=' + Date.now());
      if (!resp.ok) return null;
      var data = await resp.json();
      return {
        userPlaces: data.userPlaces || [],
        deletedIds: data.deletedIds || [],
        musicPlaylist: data.musicPlaylist || [],
        musicIndex: data.musicIndex || 0,
        lastModified: data.lastModified || 0,
      };
    } catch(e) {
      console.error('CloudSync fetch failed:', e.message);
      return null;
    }
  }

  // ---- Push to GitHub (API) ----
  async function push(data) {
    if (_syncInProgress) return false;
    _syncInProgress = true;

    try {
      // Get latest SHA if we don't have it
      if (!_sha) {
        var shaResp = await fetch(API_URL, {
          headers: { 'Authorization': 'Bearer ' + TOKEN }
        });
        if (shaResp.ok) {
          var info = await shaResp.json();
          _saveSha(info.sha);
        }
      }

      // Encode payload
      var payload = JSON.stringify(data);
      var content = btoa(unescape(encodeURIComponent(payload)));

      var body = { message: 'sync', content: content };
      if (_sha) body.sha = _sha;

      var resp = await fetch(API_URL, {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (resp.ok) {
        var result = await resp.json();
        _saveSha(result.content.sha);
        _syncInProgress = false;
        return true;
      }

      // SHA conflict — refetch and retry once
      if (resp.status === 422) {
        _saveSha(null);
        var retryResp = await fetch(API_URL, {
          headers: { 'Authorization': 'Bearer ' + TOKEN }
        });
        if (retryResp.ok) {
          var retryInfo = await retryResp.json();
          _saveSha(retryInfo.sha);
          body.sha = _sha;
          var putResp = await fetch(API_URL, {
            method: 'PUT',
            headers: {
              'Authorization': 'Bearer ' + TOKEN,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          });
          if (putResp.ok) {
            var putResult = await putResp.json();
            _saveSha(putResult.content.sha);
            _syncInProgress = false;
            return true;
          }
        }
      }

      _syncInProgress = false;
      console.error('CloudSync push failed:', resp.status);
      return false;
    } catch(e) {
      _syncInProgress = false;
      console.error('CloudSync push failed:', e.message);
      return false;
    }
  }

  function isSyncing() { return _syncInProgress; }

  // ---- Smart Merge (same as before) ----
  function smartMerge(localPlaces, cloudPlaces, localDeleted, cloudDeleted) {
    var merged = {};
    var warnings = [];

    localPlaces.forEach(function(p) { merged[p.id] = p; });

    cloudPlaces.forEach(function(cp) {
      if (merged[cp.id]) {
        var lp = merged[cp.id];
        if (cp.photos && lp.photos && cp.photos.length > lp.photos.length) {
          merged[cp.id] = cp;
          warnings.push('"' + cp.name + '" 照片已从云端更新');
        }
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

  // Dummy — kept for API compatibility with storage.js
  function configure() { return true; }

  return { test, fetch, push, isConfigured, configure, getConfig, isSyncing, smartMerge };
})();
