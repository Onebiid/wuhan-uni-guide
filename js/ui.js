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
    dom.editBtn       = document.getElementById('btn-edit-place');
    dom.exportBtn     = document.getElementById('btn-export');
    dom.reloadMapBtn  = document.getElementById('btn-reload-map');
    dom.myLocBtn      = document.getElementById('btn-my-location');
    dom.modalOverlay  = document.getElementById('modal-overlay');
    dom.modalType     = document.getElementById('modal-type');
    dom.modalName     = document.getElementById('modal-name');
    dom.modalNote     = document.getElementById('modal-note');
    dom.modalPhotoInput   = document.getElementById('modal-photo');
    dom.modalPhotoPreview = document.getElementById('modal-photo-preview');
    dom.modalPhotoPreviewImg = document.getElementById('modal-photo-preview-img');
    dom.modalPhotoRemove = document.getElementById('modal-photo-remove');
    dom.modalCoords   = document.getElementById('modal-coords-display');
    dom.modalCancel   = document.getElementById('modal-cancel');
    dom.modalTitle    = document.getElementById('modal-title');
    dom.modalSave     = document.getElementById('modal-save');
    dom.addBanner     = document.getElementById('add-mode-banner');
    dom.cancelAdd     = document.getElementById('cancel-add');
    dom.editBanner    = document.getElementById('edit-mode-banner');
    dom.cancelEdit    = document.getElementById('cancel-edit');
    dom.detailPanel   = document.getElementById('detail-panel');
    dom.detailName    = document.getElementById('detail-name');
    dom.detailBadge   = document.getElementById('detail-type-badge');
    dom.detailPhoto   = document.getElementById('detail-photo');
    dom.detailNote    = document.getElementById('detail-note');
    dom.detailPhotoEdit  = document.getElementById('detail-photo-edit');
    dom.detailPhotoInput = document.getElementById('detail-photo-input');
    dom.detailEdit    = document.getElementById('detail-edit');
    dom.detailNav     = document.getElementById('detail-navigate');
    dom.detailDelete  = document.getElementById('detail-delete');
    dom.toast         = document.getElementById('toast');
  }

  // ---- State ----
  let addModeActive = false;
  let editModeActive = false;
  let pendingLat = null;
  let pendingLng = null;
  let pendingPhotoFile = null;
  let currentEditId = null;       // null = adding, string = editing
  let _existingPhotoRemoved = false;
  let currentDetailPlace = null;
  let onAddModeChange = null;    // callback(app.setAddMode)
  let onEditModeChange = null;   // callback(active)
  let onSavePlace = null;        // callback(placeData)
  let onEditPlace = null;        // callback(id, data)
  let onDeletePlace = null;      // callback(placeId)
  let onNavigate = null;         // callback(place)

  // ---- Init ----
  function init(callbacks) {
    cacheDom();
    onAddModeChange = callbacks.onAddModeChange;
    onEditModeChange = callbacks.onEditModeChange;
    onSavePlace = callbacks.onSavePlace;
    onEditPlace = callbacks.onEditPlace;
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

    // Edit mode toggle
    dom.editBtn.addEventListener('click', () => _toggleEditMode(!editModeActive));
    dom.cancelEdit.addEventListener('click', () => _toggleEditMode(false));

    // Detail panel edit button
    dom.detailEdit.addEventListener('click', () => {
      if (currentDetailPlace) {
        hideDetail();
        openEditModal(currentDetailPlace);
      }
    });

    // Modal close
    dom.modalCancel.addEventListener('click', closeModal);
    dom.modalOverlay.addEventListener('click', (e) => {
      if (e.target === dom.modalOverlay) closeModal();
    });

    // Modal save
    dom.modalSave.addEventListener('click', async () => {
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

      let photo = null;
      if (pendingPhotoFile) {
        dom.modalSave.textContent = '处理中...';
        dom.modalSave.disabled = true;
        try {
          photo = await ImageUtils.compressImage(pendingPhotoFile);
        } catch (e) {
          console.error('Photo compress failed', e);
          showToast('⚠️ 照片处理失败，请重试');
          dom.modalSave.textContent = '保存地点';
          dom.modalSave.disabled = false;
          return;
        }
        dom.modalSave.textContent = '保存地点';
        dom.modalSave.disabled = false;
      }

      if (currentEditId) {
        // ---- Edit existing place ----
        const updates = {
          type: dom.modalType.value,
          name: name,
          note: dom.modalNote.value.trim(),
          lat: pendingLat,
          lng: pendingLng,
        };
        // Photo: only include if changed
        if (pendingPhotoFile) {
          updates.photo = photo;
        } else if (_existingPhotoRemoved) {
          updates.photo = null;
        }
        if (onEditPlace) onEditPlace(currentEditId, updates);
      } else {
        // ---- Add new place ----
        if (onSavePlace) {
          onSavePlace({
            type: dom.modalType.value,
            name: name,
            note: dom.modalNote.value.trim(),
            lat: pendingLat,
            lng: pendingLng,
            photo: photo,
          });
        }
      }
      closeModal();
      if (currentEditId) {
        _toggleEditMode(false);
      } else {
        _toggleAddMode(false);
      }
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

    // Reload map tiles button
    dom.reloadMapBtn.addEventListener('click', () => {
      MapModule.reloadTiles();
      showToast('🗺️ 地图已刷新');
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

    // Photo input — preview selected image in modal
    dom.modalPhotoInput.addEventListener('change', () => {
      const file = dom.modalPhotoInput.files[0];
      if (!file) return;
      pendingPhotoFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        dom.modalPhotoPreviewImg.src = e.target.result;
        dom.modalPhotoPreview.classList.remove('hidden');
        dom.modalPhotoInput.classList.add('hidden');
      };
      reader.readAsDataURL(file);
    });

    // Photo remove button in modal preview
    dom.modalPhotoRemove.addEventListener('click', () => {
      pendingPhotoFile = null;
      _existingPhotoRemoved = true;
      dom.modalPhotoInput.value = '';
      dom.modalPhotoPreview.classList.add('hidden');
      dom.modalPhotoInput.classList.remove('hidden');
    });

    // Photo edit button in detail panel — trigger hidden file input
    dom.detailPhotoEdit.addEventListener('click', () => {
      dom.detailPhotoInput.click();
    });

    // Detail panel photo input — compress & update existing place
    dom.detailPhotoInput.addEventListener('change', async () => {
      const file = dom.detailPhotoInput.files[0];
      if (!file || !currentDetailPlace) return;
      try {
        showToast('🖼️ 正在处理照片...');
        const dataUrl = await ImageUtils.compressImage(file);
        const updated = Storage.updateUserPlace(currentDetailPlace.id, { photo: dataUrl });
        if (updated) {
          currentDetailPlace = updated;
          MapModule.refreshMarkerPopup(currentDetailPlace.id, updated);
          _renderDetailPhoto(updated);
          showToast('✅ 照片已添加！');
        }
      } catch (e) {
        console.error('Photo edit failed', e);
        showToast('⚠️ 照片处理失败，请重试');
      }
      dom.detailPhotoInput.value = '';
    });
  }

  // ---- Add Mode ----
  function _toggleAddMode(active) {
    if (active && editModeActive) {
      _toggleEditMode(false);
    }
    addModeActive = active;
    if (active) {
      dom.addBanner.classList.remove('hidden');
      dom.addBtn.querySelector('span').textContent = '×';
      dom.addBtn.style.background = '#666';
    } else {
      dom.addBanner.classList.add('hidden');
      dom.addBtn.querySelector('span').textContent = '+';
      dom.addBtn.style.background = '';
    }
    if (onAddModeChange) onAddModeChange(active);
  }

  function isAddMode() {
    return addModeActive;
  }

  function isEditMode() {
    return editModeActive;
  }

  function _toggleEditMode(active) {
    editModeActive = active;
    if (active) {
      // Exit add mode first
      if (addModeActive) _toggleAddMode(false);
      dom.editBanner.classList.remove('hidden');
      dom.editBtn.querySelector('span').textContent = '✓';
      dom.editBtn.style.background = '#27ae60';
    } else {
      dom.editBanner.classList.add('hidden');
      dom.editBtn.querySelector('span').textContent = '✎';
      dom.editBtn.style.background = '';
    }
    if (onEditModeChange) onEditModeChange(active);
  }

  function openEditModal(place) {
    currentEditId = place.id;
    _existingPhotoRemoved = false;
    pendingLat = place.lat;
    pendingLng = place.lng;
    pendingPhotoFile = null;
    dom.modalTitle.textContent = '✏️ 编辑地点';
    dom.modalSave.textContent = '保存修改';
    dom.modalType.value = place.type;
    dom.modalName.value = place.name;
    dom.modalNote.value = place.note || '';
    dom.modalCoords.textContent = `📍 ${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;
    dom.modalPhotoInput.value = '';
    if (place.photo) {
      dom.modalPhotoPreviewImg.src = place.photo;
      dom.modalPhotoPreview.classList.remove('hidden');
      dom.modalPhotoInput.classList.add('hidden');
    } else {
      dom.modalPhotoPreview.classList.add('hidden');
      dom.modalPhotoInput.classList.remove('hidden');
    }
    dom.modalOverlay.classList.remove('hidden');
    setTimeout(() => dom.modalName.focus(), 300);
  }

  function openModalAt(lat, lng) {
    currentEditId = null;
    _existingPhotoRemoved = false;
    dom.modalTitle.textContent = '✨ 添加新地点';
    dom.modalSave.textContent = '保存地点';
    pendingLat = lat;
    pendingLng = lng;
    pendingPhotoFile = null;
    dom.modalPhotoInput.value = '';
    dom.modalPhotoPreview.classList.add('hidden');
    dom.modalPhotoInput.classList.remove('hidden');
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
    pendingPhotoFile = null;
    currentEditId = null;
    _existingPhotoRemoved = false;
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
    _renderDetailPhoto(place);
    dom.detailNote.textContent = place.note || '暂无备注';
    // Edit button: always visible
    dom.detailEdit.classList.remove('hidden');
    if (deletable || place.addedBy === 'user') {
      dom.detailDelete.classList.remove('hidden');
      dom.detailPhotoEdit.classList.remove('hidden');
    } else {
      dom.detailDelete.classList.add('hidden');
      dom.detailPhotoEdit.classList.add('hidden');
    }
    dom.detailPanel.classList.remove('hidden');
  }

  function hideDetail() {
    dom.detailPanel.classList.add('hidden');
    currentDetailPlace = null;
  }

  function _renderDetailPhoto(place) {
    if (place.photo) {
      dom.detailPhoto.src = place.photo;
      dom.detailPhoto.classList.remove('hidden');
      dom.detailPhotoEdit.textContent = '📷 更换照片';
    } else {
      dom.detailPhoto.classList.add('hidden');
      dom.detailPhotoEdit.textContent = '📷 添加照片';
    }
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
    isEditMode,
    openModalAt,
    openEditModal,
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
