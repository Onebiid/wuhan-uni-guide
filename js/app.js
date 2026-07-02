/* ============================================
   app.js — Application entry point
   Initializes all modules, wires them together
   ============================================ */

const App = (() => {
  let addMode = false;

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

    // 2.5 Initialize surprise modules
    Memory.init();
    LoveCounter.init();
    Surprise.init();

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
      UI.updateCounts(Storage.getCounts());  // counts don't change, but keeping for consistency
    });

    // 7. Close detail panel when clicking map (if not in add mode)
    MapModule.getMap().on('click', () => {
      if (!addMode) {
        UI.hideDetail();
      }
    });

    // 8. Listen for cloud sync — refresh when remote data arrives
    document.addEventListener('cloud-synced', function() {
      MapModule.clearMarkers();
      var places = Storage.getVisiblePlaces();
      MapModule.renderMarkers(places);
      UI.updateCounts(Storage.getCounts());
      Search.updateIndex(places);
      UI.showToast('☁️ 已从云端同步 ' + places.length + ' 个地点');
    });

    // 9. Cloud sync status feedback
    document.addEventListener('sync-failed', function() {
      console.error('❌ 云端同步失败，请检查网络');
      UI.showToast('⚠️ 同步失败，数据仅保存在本地');
    });

    console.log('💕 武大生活地图已就绪！');
    console.log(`📍 共加载 ${allPlaces.length} 个地点`);
  }

  // Start the app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();
