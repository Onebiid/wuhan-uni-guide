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
    dom.importBtn     = document.getElementById('btn-import');
    dom.reloadMapBtn  = document.getElementById('btn-reload-map');
    dom.myLocBtn      = document.getElementById('btn-my-location');
    dom.modalOverlay  = document.getElementById('modal-overlay');
    dom.modalType     = document.getElementById('modal-type');
    dom.modalName     = document.getElementById('modal-name');
    dom.modalNote     = document.getElementById('modal-note');
    dom.modalPhotoInput   = document.getElementById('modal-photo');
    dom.modalPhotoPreview = document.getElementById('modal-photo-preview');
    dom.modalPhotoCount   = document.getElementById('modal-photo-count');
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
    dom.detailNote    = document.getElementById('detail-note');
    dom.carousel      = document.getElementById('detail-photo-carousel');
    dom.carouselTrack = document.getElementById('carousel-track');
    dom.carouselDots  = document.getElementById('carousel-dots');
    dom.carouselPrev  = document.getElementById('carousel-prev');
    dom.carouselNext  = document.getElementById('carousel-next');
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
  let pendingPhotoFiles = [];      // File[] — new files to compress on save
  let _existingPhotos = [];       // string[] — existing photo dataURLs when editing
  let _removedPhotoIndices = new Set();  // indices into _existingPhotos removed by user
  let currentEditId = null;       // null = adding, string = editing
  let currentDetailPlace = null;
  let _carouselPhotos = [];
  let _carouselIndex = 0;
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
      var name = dom.modalName.value.trim();
      if (!name) {
        showToast('⚠️ 请输入地点名称');
        dom.modalName.focus();
        return;
      }
      if (pendingLat == null || pendingLng == null) {
        showToast('⚠️ 请先在地图上点击位置');
        return;
      }

      var compressedPhotos = [];
      if (pendingPhotoFiles.length > 0) {
        dom.modalSave.textContent = '处理中...';
        dom.modalSave.disabled = true;
        try {
          compressedPhotos = await ImageUtils.compressImages(pendingPhotoFiles);
        } catch (e) {
          console.error('Photo compress failed', e);
          showToast('⚠️ 照片处理失败，请重试');
          dom.modalSave.textContent = currentEditId ? '保存修改' : '保存地点';
          dom.modalSave.disabled = false;
          return;
        }
        dom.modalSave.textContent = currentEditId ? '保存修改' : '保存地点';
        dom.modalSave.disabled = false;
      }

      if (currentEditId) {
        // ---- Edit existing place ----
        var keptExisting = _existingPhotos.filter(function(_, i) { return !_removedPhotoIndices.has(i); });
        var updates = {
          type: dom.modalType.value,
          name: name,
          note: dom.modalNote.value.trim(),
          lat: pendingLat,
          lng: pendingLng,
          photos: keptExisting.concat(compressedPhotos),
        };
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
            photos: compressedPhotos,
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

    // Import button
    dom.importBtn.addEventListener('click', () => {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = function() {
        var file = input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(e) {
          try {
            var count = Storage.importData(e.target.result);
            showToast('✅ 已导入 ' + count + ' 个地点，刷新页面...');
            setTimeout(function() { window.location.reload(); }, 1200);
          } catch (err) {
            showToast('❌ 导入失败：文件格式错误');
          }
        };
        reader.readAsText(file);
      };
      input.click();
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

    // Photo input — multi-select, append to pending files
    dom.modalPhotoInput.addEventListener('change', function() {
      var existingCount = currentEditId ? _existingPhotos.length - _removedPhotoIndices.size : 0;
      var remaining = 9 - (existingCount + pendingPhotoFiles.length);
      if (remaining <= 0) {
        showToast('⚠️ 最多添加9张照片');
        dom.modalPhotoInput.value = '';
        return;
      }
      var files = Array.from(dom.modalPhotoInput.files).slice(0, remaining);
      for (var i = 0; i < files.length; i++) { pendingPhotoFiles.push(files[i]); }
      _renderModalPhotoPreviews();
      dom.modalPhotoInput.value = '';
    });

    // Photo edit button in detail panel — trigger hidden file input
    dom.detailPhotoEdit.addEventListener('click', function() {
      var currentCount = (currentDetailPlace && currentDetailPlace.photos) ? currentDetailPlace.photos.length : 0;
      if (currentCount >= 9) {
        showToast('⚠️ 最多9张照片');
        return;
      }
      dom.detailPhotoInput.click();
    });

    // Detail panel photo input — multi-select, append to existing place
    dom.detailPhotoInput.addEventListener('change', async function() {
      var files = Array.from(dom.detailPhotoInput.files);
      if (!files.length || !currentDetailPlace) return;
      var currentCount = (currentDetailPlace.photos || []).length;
      var remaining = 9 - currentCount;
      if (remaining <= 0) {
        showToast('⚠️ 最多9张照片');
        dom.detailPhotoInput.value = '';
        return;
      }
      var toCompress = files.slice(0, remaining);
      try {
        showToast('🖼️ 正在处理照片...');
        var newPhotos = await ImageUtils.compressImages(toCompress);
        var updatedPhotos = (currentDetailPlace.photos || []).concat(newPhotos);
        var updated = Storage.updateUserPlace(currentDetailPlace.id, { photos: updatedPhotos });
        if (updated) {
          currentDetailPlace = updated;
          MapModule.refreshMarkerPopup(currentDetailPlace.id, updated);
          _renderDetailPhoto(updated);
          showToast('✅ 已添加 ' + newPhotos.length + ' 张照片！');
        }
      } catch (e) {
        console.error('Photo edit failed', e);
        showToast('⚠️ 照片处理失败，请重试');
      }
      dom.detailPhotoInput.value = '';
    });

    // Carousel navigation
    dom.carouselPrev.addEventListener('click', function() { _goToSlide(_carouselIndex - 1); });
    dom.carouselNext.addEventListener('click', function() { _goToSlide(_carouselIndex + 1); });
    dom.carouselDots.addEventListener('click', function(e) {
      var dot = e.target.closest('.carousel-dot');
      if (dot) _goToSlide(parseInt(dot.dataset.index));
    });

    // Touch swipe for carousel
    var touchStartX = 0;
    dom.carouselTrack.addEventListener('touchstart', function(e) {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    dom.carouselTrack.addEventListener('touchend', function(e) {
      var diff = touchStartX - e.changedTouches[0].screenX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) _goToSlide(_carouselIndex + 1);
        else _goToSlide(_carouselIndex - 1);
      }
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
    _removedPhotoIndices = new Set();
    _existingPhotos = place.photos || [];
    pendingPhotoFiles = [];
    pendingLat = place.lat;
    pendingLng = place.lng;
    dom.modalTitle.textContent = '✏️ 编辑地点';
    dom.modalSave.textContent = '保存修改';
    dom.modalType.value = place.type;
    dom.modalName.value = place.name;
    dom.modalNote.value = place.note || '';
    dom.modalCoords.textContent = '📍 ' + place.lat.toFixed(5) + ', ' + place.lng.toFixed(5);
    dom.modalPhotoInput.value = '';
    _renderModalPhotoPreviews();
    dom.modalOverlay.classList.remove('hidden');
    setTimeout(function() { dom.modalName.focus(); }, 300);
  }

  function openModalAt(lat, lng) {
    currentEditId = null;
    _removedPhotoIndices = new Set();
    _existingPhotos = [];
    pendingPhotoFiles = [];
    dom.modalTitle.textContent = '✨ 添加新地点';
    dom.modalSave.textContent = '保存地点';
    pendingLat = lat;
    pendingLng = lng;
    dom.modalPhotoInput.value = '';
    dom.modalPhotoPreview.innerHTML = '';
    dom.modalPhotoPreview.classList.add('hidden');
    dom.modalPhotoCount.classList.add('hidden');
    dom.modalPhotoInput.classList.remove('hidden');
    dom.modalCoords.textContent = '📍 ' + lat.toFixed(5) + ', ' + lng.toFixed(5);
    dom.modalName.value = '';
    dom.modalNote.value = '';
    dom.modalOverlay.classList.remove('hidden');
    setTimeout(function() { dom.modalName.focus(); }, 300);
  }

  function closeModal() {
    dom.modalOverlay.classList.add('hidden');
    pendingLat = null;
    pendingLng = null;
    pendingPhotoFiles = [];
    _existingPhotos = [];
    _removedPhotoIndices = new Set();
    currentEditId = null;
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
    // All buttons always visible — every place can be edited/deleted
    dom.detailEdit.classList.remove('hidden');
    dom.detailDelete.classList.remove('hidden');
    dom.detailPhotoEdit.classList.remove('hidden');
    dom.detailPanel.classList.remove('hidden');
  }

  function hideDetail() {
    dom.detailPanel.classList.add('hidden');
    currentDetailPlace = null;
  }

  function _renderDetailPhoto(place) {
    var photos = place.photos || [];
    _carouselPhotos = photos;
    _carouselIndex = 0;

    if (photos.length > 0) {
      // Build slides
      dom.carouselTrack.innerHTML = photos.map(function(src, i) {
        return '<div class="carousel-slide' + (i === 0 ? ' active' : '') + '" data-index="' + i + '">' +
          '<img src="' + src + '" alt="照片 ' + (i + 1) + '" />' +
        '</div>';
      }).join('');
      dom.carouselTrack.style.transform = 'translateX(0)';

      // Build dots
      dom.carouselDots.innerHTML = photos.map(function(_, i) {
        return '<span class="carousel-dot' + (i === 0 ? ' active' : '') + '" data-index="' + i + '"></span>';
      }).join('');

      // Show/hide nav
      dom.carouselPrev.style.display = photos.length > 1 ? '' : 'none';
      dom.carouselNext.style.display = photos.length > 1 ? '' : 'none';
      dom.carouselDots.style.display = photos.length > 1 ? '' : 'none';

      dom.carousel.classList.remove('hidden');
      dom.detailPhotoEdit.textContent = photos.length >= 9 ? '📷 已满' : '📷 添加照片';
    } else {
      dom.carousel.classList.add('hidden');
      dom.detailPhotoEdit.textContent = '📷 添加照片';
    }
  }

  function _goToSlide(index) {
    if (index < 0 || index >= _carouselPhotos.length) return;
    _carouselIndex = index;

    dom.carouselTrack.style.transform = 'translateX(-' + (index * 100) + '%)';

    dom.carouselTrack.querySelectorAll('.carousel-slide').forEach(function(s, i) {
      s.classList.toggle('active', i === index);
    });
    dom.carouselDots.querySelectorAll('.carousel-dot').forEach(function(d, i) {
      d.classList.toggle('active', i === index);
    });

    dom.carouselPrev.style.visibility = index === 0 ? 'hidden' : '';
    dom.carouselNext.style.visibility = index === _carouselPhotos.length - 1 ? 'hidden' : '';
  }

  // ---- Multi-photo modal preview ----

  function _renderModalPhotoPreviews() {
    dom.modalPhotoPreview.innerHTML = '';
    var total = 0;

    // Render existing (kept) photos
    if (currentEditId) {
      _existingPhotos.forEach(function(dataUrl, idx) {
        if (_removedPhotoIndices.has(idx)) return;
        _appendPhotoThumb(dataUrl, 'existing', idx);
        total++;
      });
    }

    // Render pending new files (with object URLs)
    pendingPhotoFiles.forEach(function(file, idx) {
      var objectUrl = URL.createObjectURL(file);
      _appendPhotoThumb(objectUrl, 'pending', idx, file);
      total++;
    });

    var show = total > 0;
    dom.modalPhotoPreview.classList.toggle('hidden', !show);
    dom.modalPhotoInput.classList.toggle('hidden', total >= 9);
    dom.modalPhotoCount.textContent = '已选 ' + total + '/9 张';
    dom.modalPhotoCount.classList.toggle('hidden', !show);
  }

  function _appendPhotoThumb(src, type, index, file) {
    var wrapper = document.createElement('div');
    wrapper.className = 'photo-preview-thumb';
    wrapper.dataset.type = type;
    wrapper.dataset.index = index;

    var img = document.createElement('img');
    img.src = src;

    var removeBtn = document.createElement('button');
    removeBtn.className = 'photo-remove-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.type = 'button';
    removeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      _removeModalPhoto(type, index, file);
    });

    wrapper.appendChild(img);
    wrapper.appendChild(removeBtn);
    dom.modalPhotoPreview.appendChild(wrapper);
  }

  function _removeModalPhoto(type, index, file) {
    if (type === 'pending') {
      pendingPhotoFiles = pendingPhotoFiles.filter(function(f, i) { return i !== index; });
    } else if (type === 'existing') {
      _removedPhotoIndices.add(index);
    }
    _renderModalPhotoPreviews();
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
