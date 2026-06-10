/* ============================================
   ui.js — UI Component Manager
   Sidebar, modals, detail panel, toasts
   ============================================ */

const UI = (() => {
  // ---- DOM Cache ----
  const dom = {};
  function cacheDom() {
    dom.searchInput   = document.getElementById('search-input');
    dom.searchClear   = document.getElementById('search-clear');
    dom.searchResults = document.getElementById('search-results');
    dom.categoryBtns  = document.querySelectorAll('#category-bar .cat-btn');
    dom.addBtn        = document.getElementById('btn-add-place');
    dom.exportBtn     = document.getElementById('btn-export');
    dom.myLocBtn      = document.getElementById('btn-my-location');
    dom.modalOverlay  = document.getElementById('modal-overlay');
    dom.modalType     = document.getElementById('modal-type');
    dom.modalName     = document.getElementById('modal-name');
    dom.modalNote     = document.getElementById('modal-note');
    dom.modalCoords   = document.getElementById('modal-coords-display');
    dom.modalCancel   = document.getElementById('modal-cancel');
    dom.modalSave     = document.getElementById('modal-save');
    dom.addBanner     = document.getElementById('add-mode-banner');
    dom.cancelAdd     = document.getElementById('cancel-add');
    dom.detailPanel   = document.getElementById('detail-panel');
    dom.detailName    = document.getElementById('detail-name');
    dom.detailBadge   = document.getElementById('detail-type-badge');
    dom.detailNote    = document.getElementById('detail-note');
    dom.detailNav     = document.getElementById('detail-navigate');
    dom.detailDelete  = document.getElementById('detail-delete');
    dom.toast         = document.getElementById('toast');
  }

  // ---- State ----
  let addModeActive = false;
  let pendingLat = null;
  let pendingLng = null;
  let currentDetailPlace = null;
  let onAddModeChange = null;    // callback(app.setAddMode)
  let onSavePlace = null;        // callback(placeData)
  let onDeletePlace = null;      // callback(placeId)
  let onNavigate = null;         // callback(place)

  // ---- Init ----
  function init(callbacks) {
    cacheDom();
    onAddModeChange = callbacks.onAddModeChange;
    onSavePlace = callbacks.onSavePlace;
    onDeletePlace = callbacks.onDeletePlace;
    onNavigate = callbacks.onNavigate;
    _bindEvents();
  }

  // ---- Bind Events ----
  function _bindEvents() {
    // Add place button
    dom.addBtn.addEventListener('click', () => _toggleAddMode(!addModeActive));

    // Cancel add mode
    dom.cancelAdd.addEventListener('click', () => _toggleAddMode(false));

    // Modal close
    dom.modalCancel.addEventListener('click', closeModal);
    dom.modalOverlay.addEventListener('click', (e) => {
      if (e.target === dom.modalOverlay) closeModal();
    });

    // Modal save
    dom.modalSave.addEventListener('click', () => {
      const name = dom.modalName.value.trim();
      if (!name) {
        showToast('⚠️ 请输入地点名称');
        dom.modalName.focus();
        return;
      }
      if (pendingLat == null || pendingLng == null) {
        showToast('⚠️ 请先在地图上点击位置');
        return;
      }
      if (onSavePlace) {
        onSavePlace({
          type: dom.modalType.value,
          name: name,
          note: dom.modalNote.value.trim(),
          lat: pendingLat,
          lng: pendingLng,
        });
      }
      closeModal();
      _toggleAddMode(false);
    });

    // Detail panel
    dom.detailNav.addEventListener('click', () => {
      if (currentDetailPlace && onNavigate) onNavigate(currentDetailPlace);
    });
    dom.detailDelete.addEventListener('click', () => {
      if (currentDetailPlace && onDeletePlace) {
        onDeletePlace(currentDetailPlace.id);
        hideDetail();
      }
    });

    // Export button
    dom.exportBtn.addEventListener('click', () => {
      const json = Storage.exportAll();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whu-places-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('✅ 数据已导出下载');
    });

    // My location button
    dom.myLocBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        showToast('⚠️ 浏览器不支持定位');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // This will be handled by app.js via event/callback
          document.dispatchEvent(new CustomEvent('user-located', {
            detail: { lat: pos.coords.latitude, lng: pos.coords.longitude }
          }));
        },
        () => showToast('⚠️ 无法获取位置，请检查定位权限'),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });

    // Search clear button
    dom.searchClear.addEventListener('click', () => {
      dom.searchInput.value = '';
      dom.searchClear.classList.remove('visible');
      hideSearchResults();
      document.dispatchEvent(new CustomEvent('search-cleared'));
    });
  }

  // ---- Add Mode ----
  function _toggleAddMode(active) {
    addModeActive = active;
    if (active) {
      dom.addBanner.classList.remove('hidden');
      dom.addBtn.querySelector('span').textContent = '✖️';
      dom.addBtn.style.background = '#666';
    } else {
      dom.addBanner.classList.add('hidden');
      dom.addBtn.querySelector('span').textContent = '➕';
      dom.addBtn.style.background = '';
    }
    if (onAddModeChange) onAddModeChange(active);
  }

  function isAddMode() {
    return addModeActive;
  }

  function openModalAt(lat, lng) {
    pendingLat = lat;
    pendingLng = lng;
    dom.modalCoords.textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    dom.modalName.value = '';
    dom.modalNote.value = '';
    dom.modalOverlay.classList.remove('hidden');
    setTimeout(() => dom.modalName.focus(), 300);
  }

  function closeModal() {
    dom.modalOverlay.classList.add('hidden');
    pendingLat = null;
    pendingLng = null;
  }

  // ---- Search Results ----
  function showSearchResults(results, onSelect) {
    if (!results.length) {
      hideSearchResults();
      return;
    }
    dom.searchResults.innerHTML = results.map(r => `
      <div class="search-result-item" data-id="${r.id}">
        <span class="search-result-icon">${Storage.TYPE_META[r.type]?.icon || '📌'}</span>
        <div class="search-result-info">
          <div class="search-result-name">${_esc(r.name)}</div>
          <div class="search-result-note">${_esc(r.note || '')}</div>
        </div>
      </div>
    `).join('');

    dom.searchResults.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const place = results.find(r => r.id === id);
        if (place && onSelect) onSelect(place);
        hideSearchResults();
        dom.searchInput.value = '';
        dom.searchClear.classList.remove('visible');
      });
    });

    dom.searchResults.classList.remove('hidden');
  }

  function hideSearchResults() {
    dom.searchResults.classList.add('hidden');
    dom.searchResults.innerHTML = '';
  }

  // ---- Detail Panel ----
  function showDetail(place, deletable) {
    currentDetailPlace = place;
    dom.detailName.textContent = place.name;
    dom.detailBadge.textContent = Storage.TYPE_META[place.type]?.icon + ' ' + Storage.TYPE_META[place.type]?.label || '';
    dom.detailBadge.className = 'type-badge ' + place.type;
    dom.detailNote.textContent = place.note || '暂无备注';
    if (deletable || place.addedBy === 'user') {
      dom.detailDelete.classList.remove('hidden');
    } else {
      dom.detailDelete.classList.add('hidden');
    }
    dom.detailPanel.classList.remove('hidden');
  }

  function hideDetail() {
    dom.detailPanel.classList.add('hidden');
    currentDetailPlace = null;
  }

  // ---- Category Buttons ----
  function setCategoryActive(type) {
    dom.categoryBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
  }

  function onCategoryClick(callback) {
    dom.categoryBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        setCategoryActive(type);
        if (callback) callback(type);
      });
    });
  }

  // ---- Count Update ----
  function updateCounts(counts) {
    Object.entries(counts).forEach(([type, count]) => {
      const el = document.getElementById('count-' + type);
      if (el) el.textContent = count;
    });
  }

  // ---- Toast ----
  let toastTimer;
  function showToast(msg, duration = 2000) {
    clearTimeout(toastTimer);
    dom.toast.textContent = msg;
    dom.toast.classList.remove('hidden');
    toastTimer = setTimeout(() => {
      dom.toast.classList.add('hidden');
    }, duration);
  }

  // ---- Helpers ----
  function _esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Public API ----
  return {
    init,
    isAddMode,
    openModalAt,
    closeModal,
    showSearchResults,
    hideSearchResults,
    showDetail,
    hideDetail,
    setCategoryActive,
    onCategoryClick,
    updateCounts,
    showToast,
  };
})();
