/* ============================================
   music-player.js — Mini music player
   Playlist in localStorage, HTML5 Audio
   Supports: external URLs + local file uploads
   ============================================ */

const MusicPlayer = (() => {
  const STORAGE_KEY = 'whu_music_playlist';
  const STORAGE_INDEX_KEY = 'whu_music_index';
  const LOCAL_FILES_KEY = 'whu_music_local_files'; // base64 encoded local files

  let audio = null;
  let playlist = [];
  let currentIndex = 0;
  let isPlaying = false;
  let retryCount = 0;
  const MAX_RETRIES = 2;

  const dom = {};

  // ---- Default playlist (free instrumental tracks from multiple sources) ----
  const DEFAULT_PLAYLIST = [
    {
      title: '告白气球 - 周杰伦 (钢琴版)',
      url: 'https://music.163.com/song/media/outer/url?id=18627257.mp3',
    },
    {
      title: '慢慢喜欢你 - 莫文蔚 (钢琴版)',
      url: 'https://music.163.com/song/media/outer/url?id=536099860.mp3',
    },
    {
      title: '简单爱 - 周杰伦 (钢琴版)',
      url: 'https://music.163.com/song/media/outer/url?id=18627254.mp3',
    },
  ];

  function init() {
    cacheDom();
    if (!dom.toggleBtn) return;

    // Create audio element
    audio = new Audio();
    audio.preload = 'auto';
    audio.volume = 0.5;
    audio.crossOrigin = 'anonymous';
    bindAudioEvents();

    // Load playlist
    loadPlaylist();

    // Wire UI
    bindUI();

    // Restore local file blobs
    restoreLocalFiles();

    // If songs exist, prepare first
    if (playlist.length > 0 && currentIndex < playlist.length) {
      loadSong(currentIndex, false); // don't autoplay on init
    }

    // Listen for cloud music sync
    document.addEventListener('music-synced', function() {
      loadPlaylist();
      renderPlaylist();
      if (playlist.length > 0) {
        loadSong(0, false);
      }
      console.log('🎵 Playlist refreshed from cloud');
    });
  }

  function cacheDom() {
    dom.toggleBtn  = document.getElementById('btn-music');
    dom.playerEl   = document.getElementById('music-player');
    dom.songTitle  = document.getElementById('player-song-title');
    dom.playBtn    = document.getElementById('player-play');
    dom.prevBtn    = document.getElementById('player-prev');
    dom.nextBtn    = document.getElementById('player-next');
    dom.progress   = document.getElementById('player-progress');
    dom.timeDisplay = document.getElementById('player-time');
    dom.volumeSlider = document.getElementById('player-volume');
    dom.playlistBtn  = document.getElementById('player-playlist-btn');
    dom.playlistPanel = document.getElementById('playlist-panel');
    dom.playlistList  = document.getElementById('playlist-list');
    dom.addSongInput  = document.getElementById('add-song-url');
    dom.addSongTitle  = document.getElementById('add-song-title');
    dom.addSongBtn    = document.getElementById('add-song-btn');
  }

  function loadPlaylist() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        playlist = JSON.parse(raw);
      } else {
        playlist = DEFAULT_PLAYLIST.slice();
        savePlaylist();
      }
      var idx = parseInt(localStorage.getItem(STORAGE_INDEX_KEY) || '0', 10);
      currentIndex = (idx >= 0 && idx < playlist.length) ? idx : 0;
    } catch(e) {
      playlist = DEFAULT_PLAYLIST.slice();
      currentIndex = 0;
    }
  }

  function savePlaylist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(playlist));
    localStorage.setItem(STORAGE_INDEX_KEY, currentIndex);
  }

  function loadSong(index, autoPlay) {
    if (index < 0 || index >= playlist.length) return;
    currentIndex = index;
    savePlaylist();
    retryCount = 0;

    var song = playlist[index];
    audio.src = song.url;
    dom.songTitle.textContent = song.title;
    updatePlaylistHighlight();

    if (autoPlay !== false) {
      // small delay to let audio load
      var playPromise = audio.play();
      if (playPromise) {
        playPromise.catch(function(e) {
          console.warn('Autoplay prevented:', e.message);
        });
      }
    }
  }

  // ---- Audio events ----
  function bindAudioEvents() {
    audio.addEventListener('loadedmetadata', updateProgress);
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', onSongEnd);
    audio.addEventListener('play', function() {
      isPlaying = true;
      retryCount = 0;
      updatePlayButton();
    });
    audio.addEventListener('pause', function() {
      isPlaying = false;
      updatePlayButton();
    });
    audio.addEventListener('error', function() {
      console.warn('Audio load error for:', playlist[currentIndex] ? playlist[currentIndex].title : 'unknown');

      if (retryCount < MAX_RETRIES) {
        // Retry: some CDNs need a second attempt
        retryCount++;
        console.log('Retrying (' + retryCount + '/' + MAX_RETRIES + ')...');
        setTimeout(function() {
          if (playlist[currentIndex]) {
            audio.src = playlist[currentIndex].url;
            audio.play().catch(function() {});
          }
        }, 800);
      } else {
        // Skip to next song after all retries exhausted
        console.warn('Skipping unplayable song: ' + playlist[currentIndex].title);
        setTimeout(function() { next(); }, 500);
      }
    });
  }

  function onSongEnd() {
    // Auto-advance to next song
    next();
  }

  // ---- UI bindings ----
  function bindUI() {
    // Toggle player visibility
    dom.toggleBtn.addEventListener('click', togglePlayer);

    // Play/Pause
    dom.playBtn.addEventListener('click', togglePlay);

    // Prev
    dom.prevBtn.addEventListener('click', prev);

    // Next
    dom.nextBtn.addEventListener('click', next);

    // Progress bar
    dom.progress.addEventListener('input', function() {
      if (!audio.duration) return;
      audio.currentTime = (dom.progress.value / 100) * audio.duration;
    });

    // Volume
    dom.volumeSlider.addEventListener('input', function() {
      audio.volume = dom.volumeSlider.value / 100;
    });

    // Playlist toggle
    dom.playlistBtn.addEventListener('click', togglePlaylist);

    // Add song
    dom.addSongBtn.addEventListener('click', addSong);

    // Keyboard controls
    document.addEventListener('keydown', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    });
  }

  function togglePlayer() {
    var hidden = dom.playerEl.classList.contains('hidden');
    if (hidden) {
      dom.playerEl.classList.remove('hidden');
      dom.toggleBtn.classList.add('active');
    } else {
      dom.playerEl.classList.add('hidden');
      dom.playlistPanel.classList.add('hidden');
      dom.toggleBtn.classList.remove('active');
    }
  }

  function togglePlay() {
    if (!audio.src || audio.src === window.location.href) {
      if (playlist.length > 0) {
        loadSong(currentIndex);
      }
      return;
    }
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(function() {});
    }
  }

  function prev() {
    if (playlist.length === 0) return;
    var idx = currentIndex - 1;
    if (idx < 0) idx = playlist.length - 1;
    loadSong(idx);
  }

  function next() {
    if (playlist.length === 0) return;
    var idx = currentIndex + 1;
    if (idx >= playlist.length) idx = 0;
    loadSong(idx);
  }

  function updateProgress() {
    if (!audio.duration) return;
    var pct = (audio.currentTime / audio.duration) * 100;
    dom.progress.value = pct;

    var cur = formatTime(audio.currentTime);
    var dur = formatTime(audio.duration);
    dom.timeDisplay.textContent = cur + ' / ' + dur;
  }

  function updatePlayButton() {
    dom.playBtn.textContent = isPlaying ? '⏸' : '▶️';
  }

  function formatTime(sec) {
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // ---- Playlist Management ----
  function togglePlaylist() {
    dom.playlistPanel.classList.toggle('hidden');
    if (!dom.playlistPanel.classList.contains('hidden')) {
      renderPlaylist();
    }
  }

  function renderPlaylist() {
    dom.playlistList.innerHTML = '';
    playlist.forEach(function(song, i) {
      var isLocal = song.url && song.url.indexOf('blob:') === 0;
      var item = document.createElement('div');
      item.className = 'playlist-item' + (i === currentIndex ? ' active' : '');
      item.innerHTML =
        '<span class="playlist-item-num">' + (i + 1) + '</span>' +
        '<span class="playlist-item-title">' + escapeHtml(song.title) +
        (isLocal ? ' 📁' : '') + '</span>' +
        '<button class="playlist-item-del" data-idx="' + i + '">✕</button>';
      item.addEventListener('click', function(e) {
        if (e.target.classList.contains('playlist-item-del')) return;
        loadSong(i);
      });
      dom.playlistList.appendChild(item);
    });

    // Delete handlers
    dom.playlistList.querySelectorAll('.playlist-item-del').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(btn.dataset.idx, 10);
        // Revoke blob URL if local file
        var removed = playlist[idx];
        if (removed && removed.url && removed.url.indexOf('blob:') === 0) {
          URL.revokeObjectURL(removed.url);
        }
        playlist.splice(idx, 1);
        savePlaylist();
        if (currentIndex >= playlist.length) currentIndex = Math.max(0, playlist.length - 1);
        if (idx === currentIndex && playlist.length > 0) {
          loadSong(currentIndex, false);
        } else if (playlist.length === 0) {
          audio.src = '';
          dom.songTitle.textContent = '未选择歌曲';
          dom.timeDisplay.textContent = '--:-- / --:--';
          dom.progress.value = 0;
        }
        renderPlaylist();
      });
    });
  }

  function updatePlaylistHighlight() {
    var items = dom.playlistList.querySelectorAll('.playlist-item');
    items.forEach(function(item, i) {
      item.classList.toggle('active', i === currentIndex);
    });
  }

  function addSong() {
    var url = dom.addSongInput.value.trim();
    var title = dom.addSongTitle.value.trim();
    if (!url) return;
    if (!title) title = '未命名歌曲 ' + (playlist.length + 1);

    playlist.push({ title: title, url: url });
    savePlaylist();
    dom.addSongInput.value = '';
    dom.addSongTitle.value = '';
    renderPlaylist();

    // If this is the first song, load it
    if (playlist.length === 1) {
      loadSong(0, false);
    }
  }

  // ---- Local File Support ----
  // Allows users to upload MP3 files from their device

  function addLocalFiles(files) {
    if (!files || files.length === 0) return 0;
    var added = 0;
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|ogg|flac|aac|m4a|wma)$/i)) {
        console.warn('Skipping non-audio file:', file.name);
        continue;
      }
      var blobUrl = URL.createObjectURL(file);
      playlist.push({
        title: file.name.replace(/\.[^.]+$/, ''), // strip extension
        url: blobUrl,
        _local: true,
      });
      added++;
    }
    if (added > 0) {
      savePlaylist();
      renderPlaylist();
      if (playlist.length === added) {
        // These are the first songs added
        loadSong(0, false);
      }
      console.log('Added ' + added + ' local file(s) to playlist');
    }
    return added;
  }

  // Re-create blob URLs from stored base64 data (if any)
  function restoreLocalFiles() {
    try {
      var raw = localStorage.getItem(LOCAL_FILES_KEY);
      if (!raw) return;
      var stored = JSON.parse(raw);
      // Note: blob URLs can't be persisted across sessions.
      // Local files stored as base64 are too large for localStorage.
      // We only keep the metadata and let users re-add files.
      // Clean up stale entries
      var cleaned = false;
      playlist = playlist.filter(function(song) {
        if (song._local && !song.url) {
          cleaned = true;
          return false;
        }
        return true;
      });
      if (cleaned) savePlaylist();
    } catch(e) {
      // ignore
    }
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { init, addLocalFiles, addSong };
})();
