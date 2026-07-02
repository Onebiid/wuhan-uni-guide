/* ============================================
   app.js — Application entry point
   Initializes all modules, wires them together
   ============================================ */

const App = (() => {
  let addMode = false;
  let _localFileInput = null;

  async function init() {
    // 1. Initialize storage (load data)
    await Storage.init();

    // 2. Initialize UI
    UI.init({
      onAddModeChange: (active) => {
        addMode = active;
        // Update cursor style on the map
        const mapEl = document.getElementById('map');
        if (mapEl) {
          mapEl.style.cursor = active ? 'crosshair' : '';
        }
      },
      onSavePlace: (placeData) => {
        const newPlace = Storage.addUserPlace(placeData);
        // Switch to "all" filter so the new marker is visible
        UI.setCategoryActive('all');
        MapModule.filterByType('all');
        MapModule.addMarker(newPlace);
        UI.updateCounts(Storage.getCounts());
        Search.updateIndex(Storage.getVisiblePlaces());
        UI.showToast('✅ 地点已添加！');
      },
      onDeletePlace: (id) => {
        Storage.deletePlace(id);
        MapModule.removeMarker(id);
        MapModule.refresh();
        UI.updateCounts(Storage.getCounts());
        Search.updateIndex(Storage.getVisiblePlaces());
        UI.showToast('🗑️ 地点已删除');
      },
      onNavigate: (place) => {
        Routing.navigate(place);
      },
      onEditModeChange: (active) => {
        MapModule.setEditMode(active);
      },
      onEditPlace: (id, data) => {
        const result = Storage.editPlace(id, data);
        if (!result) return;
        if (result.idChanged) {
          MapModule.removeMarker(result.oldId);
          MapModule.addMarker(result.place);
        } else {
          MapModule.refreshMarkerPopup(result.place.id, result.place);
        }
        MapModule.refresh();
        UI.showToast('✅ 地点已更新！');
      },
    });

    // 2.5 Initialize surprise + music modules
    Memory.init();
    LoveCounter.init();
    Surprise.init();
    MusicPlayer.init();

    // 3. Initialize map
    MapModule.init({
      onMapClickForAdd: (lat, lng) => {
        if (UI.isAddMode()) {
          UI.openModalAt(lat, lng);
        }
      },
    });

    // 4. Initialize search
    Search.init((place) => {
      if (UI.isEditMode()) {
        UI.openEditModal(place);
      } else {
        MapModule.flyToPlace(place);
      }
    });

    // 5. Render initial data
    const allPlaces = Storage.getVisiblePlaces();
    MapModule.renderMarkers(allPlaces);
    UI.updateCounts(Storage.getCounts());
    Search.updateIndex(allPlaces);

    // 6. Category filter clicks
    UI.onCategoryClick((type) => {
      MapModule.filterByType(type);
      UI.updateCounts(Storage.getCounts());
    });

    // 7. Close detail panel when clicking map (if not in add mode)
    MapModule.getMap().on('click', () => {
      if (!addMode) {
        UI.hideDetail();
      }
    });

    // ---- 8. Cloud Sync Event Wiring ----

    // 8a. Listen for cloud sync — refresh when remote data arrives
    document.addEventListener('cloud-synced', function() {
      MapModule.clearMarkers();
      var places = Storage.getVisiblePlaces();
      MapModule.renderMarkers(places);
      UI.updateCounts(Storage.getCounts());
      Search.updateIndex(places);
      UI.showToast('☁️ 已从云端同步 ' + places.length + ' 个地点');
    });

    // 8b. Cloud sync status feedback
    document.addEventListener('sync-success', function() {
      UI.showToast('☁️ 同步成功！');
      var syncBtn = document.getElementById('btn-sync-now');
      if (syncBtn) syncBtn.classList.remove('syncing');
    });

    document.addEventListener('sync-failed', function() {
      console.error('❌ 云端同步失败，请检查网络');
      UI.showToast('⚠️ 同步失败，数据仅保存在本地');
      var syncBtn = document.getElementById('btn-sync-now');
      if (syncBtn) syncBtn.classList.remove('syncing');
    });

    // 8c. Manual sync button
    var syncBtn = document.getElementById('btn-sync-now');
    if (syncBtn) {
      syncBtn.addEventListener('click', function() {
        if (syncBtn.classList.contains('syncing')) return;
        if (!CloudSync.isConfigured()) {
          // Open settings panel instead
          _openCloudSettings();
          return;
        }
        syncBtn.classList.add('syncing');
        UI.showToast('☁️ 正在同步...');
        Storage.syncNow();
      });
    }

    // 8d. Cloud settings panel
    _initCloudSettings();

    // 8e. Local music file upload
    _initLocalFileUpload();

    console.log('💕 武大生活地图已就绪！');
    console.log('📍 共加载 ' + allPlaces.length + ' 个地点');
    if (CloudSync.isConfigured()) {
      console.log('☁️ 云同步已配置');
    } else {
      console.log('💡 提示：点击 ☁️ 按钮配置云同步');
    }
  }

  // ---- Cloud Settings Panel ----

  function _openCloudSettings() {
    var overlay = document.getElementById('cloud-settings-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');

    // Populate current config
    var cfg = CloudSync.getConfig();
    var appIdEl = document.getElementById('cloud-app-id');
    var appKeyEl = document.getElementById('cloud-app-key');
    var regionEl = document.getElementById('cloud-region');
    var statusEl = document.getElementById('cloud-status');

    if (appIdEl) appIdEl.value = cfg.appId.indexOf('PASTE_YOUR') !== -1 ? '' : cfg.appId;
    if (appKeyEl) appKeyEl.value = cfg.appKey.indexOf('PASTE_YOUR') !== -1 ? '' : cfg.appKey;
    if (regionEl && cfg.region) regionEl.value = cfg.region;
    if (statusEl) statusEl.textContent = '';
    if (statusEl) statusEl.className = 'cloud-status';
  }

  function _initCloudSettings() {
    var overlay = document.getElementById('cloud-settings-overlay');
    if (!overlay) return;

    // Close button
    var closeBtn = document.getElementById('cloud-settings-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        overlay.classList.add('hidden');
      });
    }

    // Click overlay to close
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.classList.add('hidden');
    });

    // Test connection button
    var testBtn = document.getElementById('cloud-settings-test');
    if (testBtn) {
      testBtn.addEventListener('click', async function() {
        var appId = document.getElementById('cloud-app-id').value.trim();
        var appKey = document.getElementById('cloud-app-key').value.trim();
        var region = document.getElementById('cloud-region').value;
        var statusEl = document.getElementById('cloud-status');

        if (!appId || !appKey) {
          if (statusEl) { statusEl.textContent = '⚠️ 请填写 App ID 和 App Key'; statusEl.className = 'cloud-status error'; }
          return;
        }

        // Temporarily configure for testing
        CloudSync.configure(appId, appKey, region);
        if (statusEl) { statusEl.textContent = '⏳ 正在测试连接...'; statusEl.className = 'cloud-status testing'; }

        var ok = await CloudSync.test();
        if (ok) {
          if (statusEl) { statusEl.textContent = '✅ 连接成功！可以保存设置'; statusEl.className = 'cloud-status success'; }
        } else {
          if (statusEl) { statusEl.textContent = '❌ 连接失败，请检查密钥和网络'; statusEl.className = 'cloud-status error'; }
        }
      });
    }

    // Save button
    var saveBtn = document.getElementById('cloud-settings-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function() {
        var appId = document.getElementById('cloud-app-id').value.trim();
        var appKey = document.getElementById('cloud-app-key').value.trim();
        var region = document.getElementById('cloud-region').value;
        var statusEl = document.getElementById('cloud-status');

        if (!appId || !appKey) {
          if (statusEl) { statusEl.textContent = '⚠️ 请填写 App ID 和 App Key'; statusEl.className = 'cloud-status error'; }
          return;
        }

        CloudSync.configure(appId, appKey, region);
        if (statusEl) { statusEl.textContent = '⏳ 正在保存并测试...'; statusEl.className = 'cloud-status testing'; }

        var ok = await CloudSync.test();
        if (ok) {
          if (statusEl) { statusEl.textContent = '✅ 设置已保存，连接成功！'; statusEl.className = 'cloud-status success'; }
          UI.showToast('☁️ 云同步配置成功！');
          // Do an initial push
          Storage.syncNow();
          setTimeout(function() {
            overlay.classList.add('hidden');
          }, 1200);
        } else {
          if (statusEl) { statusEl.textContent = '⚠️ 设置已保存，但连接失败 — 请检查密钥'; statusEl.className = 'cloud-status error'; }
        }
      });
    }
  }

  // ---- Local File Upload for Music Player ----

  function _initLocalFileUpload() {
    var fileInput = document.getElementById('local-file-input');
    var addBtn = document.getElementById('add-local-file-btn');

    if (!fileInput || !addBtn) return;

    addBtn.addEventListener('click', function() {
      fileInput.click();
    });

    fileInput.addEventListener('change', function() {
      var files = fileInput.files;
      if (!files || files.length === 0) return;

      var added = MusicPlayer.addLocalFiles(files);
      if (added > 0) {
        UI.showToast('📁 已添加 ' + added + ' 首本地歌曲');
      } else {
        UI.showToast('⚠️ 未识别到音频文件');
      }
      fileInput.value = '';
    });
  }

  // Start the app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();
