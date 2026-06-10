/* ============================================
   storage.js — Data persistence layer
   Handles preset data + localStorage user data
   ============================================ */

const Storage = (() => {
  const STORAGE_KEY = 'whu_guide_user_places';
  const DELETED_KEY = 'whu_guide_deleted_ids';

  // ---- Place type metadata ----
  const TYPE_META = {
    food:         { icon: '🍜', label: '美食', color: '#e74c3c' },
    shopping:     { icon: '🛒', label: '购物', color: '#3498db' },
    service:      { icon: '🏪', label: '生活服务', color: '#2ecc71' },
    study:        { icon: '📚', label: '学习', color: '#9b59b6' },
    entertainment:{ icon: '🎮', label: '娱乐', color: '#f39c12' },
    other:        { icon: '📌', label: '其他', color: '#95a5a6' },
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

    // Load user-added places from localStorage
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      userPlaces = raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('Failed to parse user places', e);
      userPlaces = [];
    }

    // Load deleted IDs
    try {
      const raw = localStorage.getItem(DELETED_KEY);
      deletedIds = raw ? JSON.parse(raw) : [];
    } catch (e) {
      deletedIds = [];
    }
  }

  // ---- Accessors ----
  function getAllPlaces() {
    return [...presetPlaces, ...userPlaces];
  }

  function getVisiblePlaces() {
    return getAllPlaces().filter(p => !deletedIds.includes(p.id));
  }

  /**
   * Get all places of a specific type
   */
  function getByType(type) {
    if (!type || type === 'all') return getVisiblePlaces();
    return getVisiblePlaces().filter(p => p.type === type);
  }

  /**
   * Get count of visible places by type
   */
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
    // Check if it's a user-added place — remove fully
    const userIdx = userPlaces.findIndex(p => p.id === id);
    if (userIdx >= 0) {
      userPlaces.splice(userIdx, 1);
      _persistUserPlaces();
      return true;
    }

    // Preset place — add to deleted list
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

  // ---- Export / Backup ----
  function exportAll() {
    return JSON.stringify(getVisiblePlaces(), null, 2);
  }

  function importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!Array.isArray(data)) throw new Error('Not an array');
      // Merge with existing user places (keep non-duplicate names)
      const existingNames = new Set(userPlaces.map(p => p.name));
      const newItems = data.filter(d => !existingNames.has(d.name));
      userPlaces = [...userPlaces, ...newItems.map(d => ({
        ...d,
        id: 'import_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        addedBy: 'import',
      }))];
      _persistUserPlaces();
      return newItems.length;
    } catch (e) {
      console.error('Import failed', e);
      throw e;
    }
  }

  // ---- Persistence helpers ----
  function _persistUserPlaces() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userPlaces));
  }

  function _persistDeleted() {
    localStorage.setItem(DELETED_KEY, JSON.stringify(deletedIds));
  }

  // ---- Public API ----
  return {
    TYPE_META,
    init,
    getAllPlaces,
    getVisiblePlaces,
    getByType,
    getCounts,
    addUserPlace,
    deletePlace,
    resetDeleted,
    exportAll,
    importData,
  };
})();
