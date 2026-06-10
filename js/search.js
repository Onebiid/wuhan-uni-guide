/* ============================================
   search.js — Fuzzy search & autocomplete
   ============================================ */

const Search = (() => {
  let places = [];
  let onSelectPlace = null;

  const dom = {
    input: null,
    clearBtn: null,
  };

  /**
   * Init search — bind to DOM elements
   * @param {function} onSelect callback(place) when user selects a result
   */
  function init(onSelect) {
    dom.input = document.getElementById('search-input');
    dom.clearBtn = document.getElementById('search-clear');
    onSelectPlace = onSelect;

    dom.input.addEventListener('input', _onInput);
    dom.input.addEventListener('focus', () => {
      if (dom.input.value.trim()) _doSearch(dom.input.value.trim());
    });

    // Close results when clicking outside
    document.addEventListener('click', (e) => {
      const results = document.getElementById('search-results');
      if (results && !results.classList.contains('hidden') &&
          !dom.input.contains(e.target) &&
          !results.contains(e.target)) {
        UI.hideSearchResults();
      }
    });

    // Listen for search clear events
    document.addEventListener('search-cleared', () => {
      dom.clearBtn.classList.remove('visible');
    });
  }

  /**
   * Update the places index (call when data changes)
   */
  function updateIndex(newPlaces) {
    places = newPlaces;
  }

  function _onInput() {
    const query = dom.input.value.trim();

    // Show/hide clear button
    if (query) {
      dom.clearBtn.classList.add('visible');
    } else {
      dom.clearBtn.classList.remove('visible');
      UI.hideSearchResults();
      return;
    }

    _doSearch(query);
  }

  function _doSearch(query) {
    if (!places.length) {
      UI.hideSearchResults();
      return;
    }

    const q = query.toLowerCase();
    const results = places
      .map(p => {
        const score = _matchScore(p, q);
        return { place: p, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(r => r.place);

    UI.showSearchResults(results, (place) => {
      if (onSelectPlace) onSelectPlace(place);
    });
  }

  /**
   * Fuzzy match scoring
   * - Exact name match: 100
   * - Name starts with query: 80
   * - Name contains query: 60
   * - Type label match: 50
   * - Note contains query: 30
   * - Pinyin initials match: 40 (bonus)
   */
  function _matchScore(place, q) {
    let score = 0;
    const name = place.name.toLowerCase();
    const typeMeta = Storage.TYPE_META[place.type];
    const typeLabel = (typeMeta?.label || '').toLowerCase();
    const note = (place.note || '').toLowerCase();

    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else if (typeLabel.includes(q)) score = 50;
    else if (note.includes(q)) score = 30;

    // Bonus: check if query chars appear in order (initials-like matching)
    if (score === 0) {
      let qi = 0;
      for (let i = 0; i < name.length && qi < q.length; i++) {
        if (name[i] === q[qi]) qi++;
      }
      if (qi === q.length) score = 40;
    }

    return score;
  }

  return { init, updateIndex };
})();
