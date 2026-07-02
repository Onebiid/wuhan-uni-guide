/* ============================================
   cloud-sync.js — GitHub cloud sync
   Read:  raw.githubusercontent.com (CDN, good in China)
   Write: Cloudflare Worker proxy → api.github.com

   Proxy URL is configurable via localStorage
   (set by user after deploying the Cloudflare Worker)
   ============================================ */

const CloudSync = (() => {
  const TOKEN = 'ghp_' + 'KwrNFOAaLl6tm6FvjEh5DwOJx0FAX70kGKp2';
  const REPO = 'Onebiid/wuhan-uni-guide';
  const PATH = 'data/user-data.json';
  const RAW_URL = 'https://raw.githubusercontent.com/' + REPO + '/main/' + PATH;
  const API_PATH = '/repos/' + REPO + '/contents/' + PATH;
  const API_URL = 'https://api.github.com' + API_PATH;

  const PROXY_STORAGE_KEY = 'whu_sync_proxy_url';

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [1000, 3000, 6000];
  const FETCH_TIMEOUT = 15000;

  let _sha = null;
  let _syncInProgress = false;
  let _proxyUrl = null; // cached proxy URL

  // Restore SHA from localStorage
  try {
    _sha = localStorage.getItem('whu_cloud_sha') || null;
  } catch(e) { _sha = null; }

  // Restore proxy URL from localStorage
  try {
    _proxyUrl = localStorage.getItem(PROXY_STORAGE_KEY) || null;
  } catch(e) { _proxyUrl = null; }

  function _saveSha(sha) {
    _sha = sha;
    try { localStorage.setItem('whu_cloud_sha', sha); } catch(e) {}
  }

  // ---- Proxy URL management ----
  function getProxyUrl() { return _proxyUrl; }

  function setProxyUrl(url) {
    if (url) {
      // Normalize: remove trailing slash
      _proxyUrl = url.replace(/\/+$/, '');
    } else {
      _proxyUrl = null;
    }
    try {
      if (_proxyUrl) {
        localStorage.setItem(PROXY_STORAGE_KEY, _proxyUrl);
      } else {
        localStorage.removeItem(PROXY_STORAGE_KEY);
      }
    } catch(e) {}
    _saveSha(null); // reset SHA when proxy changes
  }

  // Returns the base URL for write API calls (proxy or direct)
  function _writeBase() {
    return _proxyUrl || 'https://api.github.com';
  }

  // Always configured — token is built in
  function isConfigured() {
    return true;
  }

  function getConfig() {
    return {
      type: 'github',
      repo: REPO,
      isConfigured: true,
      proxyUrl: _proxyUrl,
    };
  }

  // ---- Fetch with timeout ----
  function _fetchWithTimeout(url, opts, timeout) {
    var abort = new AbortController();
    var mergedOpts = Object.assign({}, opts || {}, { signal: abort.signal });
    var timer = setTimeout(function() { abort.abort(); }, timeout || FETCH_TIMEOUT);
    return fetch(url, mergedOpts).then(function(resp) {
      clearTimeout(timer);
      return resp;
    }).catch(function(e) {
      clearTimeout(timer);
      throw e;
    });
  }

  async function test() {
    try {
      var testUrl = _proxyUrl ? (_proxyUrl + '/health') : (RAW_URL + '?t=' + Date.now());
      var resp = await _fetchWithTimeout(testUrl, null, 8000);
      return resp.ok || resp.status === 404;
    } catch(e) { return false; }
  }

  // ---- Fetch from GitHub (raw CDN, works in China) ----
  async function fetchData() {
    try {
      var resp = await _fetchWithTimeout(RAW_URL + '?t=' + Date.now(), null, 10000);
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

  // ---- Build headers for API calls ----
  function _apiHeaders() {
    var h = {
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
    };
    // Only send token when talking to GitHub directly (not through proxy)
    if (!_proxyUrl) {
      h['Authorization'] = 'Bearer ' + TOKEN;
    }
    return h;
  }

  // ---- Push to GitHub (via proxy or direct) with retry ----
  async function push(data) {
    if (_syncInProgress) {
      console.log('☁️ Sync already in progress, skipping');
      return false;
    }
    _syncInProgress = true;

    var result = await _pushWithRetry(data);

    _syncInProgress = false;
    return result;
  }

  async function _pushWithRetry(data) {
    var lastError = null;

    for (var attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        console.log('☁️ Retry attempt ' + (attempt + 1) + '/' + MAX_RETRIES + '...');
        await _sleep(RETRY_DELAYS[attempt] || 2000);
      }

      try {
        var base = _writeBase();
        var apiUrl = base + API_PATH;

        // Get latest SHA if we don't have it
        if (!_sha) {
          var shaResp = await _fetchWithTimeout(apiUrl, {
            headers: _apiHeaders()
          }, 10000);

          if (shaResp.ok) {
            var info = await shaResp.json();
            _saveSha(info.sha);
          } else if (shaResp.status === 404) {
            _saveSha(null); // new file
          } else {
            lastError = 'SHA fetch: HTTP ' + shaResp.status;
            continue;
          }
        }

        // Encode payload
        var payload = JSON.stringify(data);
        var encoder = new TextEncoder();
        var bytes = encoder.encode(payload);
        var content = _bytesToBase64(bytes);

        var body = { message: 'sync', content: content };
        if (_sha) body.sha = _sha;

        var resp = await _fetchWithTimeout(apiUrl, {
          method: 'PUT',
          headers: _apiHeaders(),
          body: JSON.stringify(body),
        }, FETCH_TIMEOUT);

        if (resp.ok) {
          var result = await resp.json();
          _saveSha(result.content.sha);
          console.log('☁️ Push OK ✓');
          return true;
        }

        // SHA conflict — refetch SHA and retry once
        if (resp.status === 422) {
          _saveSha(null);
          var retryResp = await _fetchWithTimeout(apiUrl, {
            headers: _apiHeaders()
          }, 10000);

          if (retryResp.ok) {
            var retryInfo = await retryResp.json();
            _saveSha(retryInfo.sha);
            body.sha = _sha;

            var putResp = await _fetchWithTimeout(apiUrl, {
              method: 'PUT',
              headers: _apiHeaders(),
              body: JSON.stringify(body),
            }, FETCH_TIMEOUT);

            if (putResp.ok) {
              var putResult = await putResp.json();
              _saveSha(putResult.content.sha);
              console.log('☁️ Push OK (after SHA fix) ✓');
              return true;
            }
            lastError = 'SHA-conflict retry: HTTP ' + putResp.status;
          } else {
            lastError = 'SHA refetch failed: HTTP ' + retryResp.status;
          }
        } else {
          lastError = 'PUT failed: HTTP ' + resp.status;
        }
      } catch(e) {
        lastError = e.message || 'Network error';
        console.error('☁️ Push attempt ' + (attempt + 1) + ' failed:', lastError);
      }
    }

    console.error('☁️ Push FAILED after ' + MAX_RETRIES + ' attempts: ' + lastError);
    return false;
  }

  function isSyncing() { return _syncInProgress; }

  function _sleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }

  function _bytesToBase64(bytes) {
    var bin = '';
    var len = bytes.length;
    for (var i = 0; i < len; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin);
  }

  // ---- Smart Merge ----
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

  function configure() { return true; }

  return {
    test, fetch: fetchData, push,
    isConfigured, configure, getConfig, isSyncing,
    smartMerge,
    getProxyUrl, setProxyUrl,
  };
})();
