/**
 * app.js
 * Main client-side logic for the ChordBook application.
 */

// Application State
let state = {
  songs: [],
  filteredSongs: [],
  currentSongId: null,
  transposeOffset: 0,
  fontSize: 1.0,
  scrollSpeed: 3,
  isScrolling: false,
  preferFlats: false,
  theme: 'light',
  wakeLock: null,
  activeTooltipChord: null,
  instrument: 'guitar',
  hoveredChordElement: null,

  // Setlist feature state
  setlists: [],
  activeTab: 'songs', // 'songs' | 'setlists'
  activeSetlistId: null,
  activeSetlistSongIndex: null,

  // Metronome state
  metroBpm: 120,
  metroBeats: 4,
  metroMode: 'off', // 'off' | 'visual' | 'audio'
  metroBeatCounter: 0,
  metroIntervalId: null,
  isFullscreen: false
};

// Safe localStorage wrapper for strict/incognito environments
const safeStorage = {
  getItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      console.warn("Storage access denied:", e);
      return null;
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      console.warn("Storage write denied:", e);
    }
  },
  removeItem(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      console.warn("Storage remove denied:", e);
    }
  }
};
const localStorage = safeStorage;

// Global DB instance
let db = null;

// DOM Elements
const el = {
  sidebar: document.getElementById('sidebar'),
  songList: document.getElementById('song-list'),
  searchInput: document.getElementById('search-input'),
  toolbarSearchInput: document.getElementById('toolbar-search-input'),
  toolbarSearchDropdown: document.getElementById('toolbar-search-dropdown'),
  showSidebarBtn: document.getElementById('show-sidebar-btn'),
  hideSidebarBtn: document.getElementById('hide-sidebar-btn'),
  wakeLockBtn: document.getElementById('wake-lock-btn'),
  wakelockIndicator: document.getElementById('wakelock-indicator'),
  fontDecBtn: document.getElementById('font-dec-btn'),
  fontIncBtn: document.getElementById('font-inc-btn'),
  fontSizeVal: document.getElementById('font-size-val'),
  transposeDecBtn: document.getElementById('transpose-dec-btn'),
  transposeIncBtn: document.getElementById('transpose-inc-btn'),
  transposeVal: document.getElementById('transpose-val'),
  enharmonicToggleBtn: document.getElementById('enharmonic-toggle-btn'),
  scrollToggleBtn: document.getElementById('scroll-toggle-btn'),
  scrollSpeedSlider: document.getElementById('scroll-speed-slider'),
  instrumentSelect: document.getElementById('instrument-select'),
  themeSelect: document.getElementById('theme-select'),
  songViewport: document.getElementById('song-viewport'),
  songDisplayArea: document.getElementById('song-display-area'),
  chordTooltip: document.getElementById('chord-tooltip'),
  toastNotify: document.getElementById('toast-notify'),
  maximizeBtn: document.getElementById('maximize-btn'),
  restoreBtn: document.getElementById('restore-btn'),

  // Setlist feature elements
  tabSongsBtn: document.getElementById('tab-songs-btn'),
  tabSetlistsBtn: document.getElementById('tab-setlists-btn'),
  setlistList: document.getElementById('setlist-list'),
  setlistEditor: document.getElementById('setlist-editor'),
  setlistBackBtn: document.getElementById('setlist-back-btn'),
  setlistNameInput: document.getElementById('setlist-name-input'),
  setlistDeleteBtn: document.getElementById('setlist-delete-btn'),
  setlistAddSongSelect: document.getElementById('setlist-add-song-select'),
  setlistSongsContainer: document.getElementById('setlist-songs-container'),
  songsFooter: document.getElementById('songs-footer'),
  setlistsFooter: document.getElementById('setlists-footer'),
  newSetlistBtn: document.getElementById('new-setlist-btn'),
  mainImportSetlistBtn: document.getElementById('main-import-setlist-btn'),
  setlistExportBtn: document.getElementById('setlist-export-btn'),
  setlistImportBtn: document.getElementById('setlist-import-btn'),
  setlistsImportFile: document.getElementById('setlists-import-file'),
  searchContainer: document.getElementById('search-container'),
  toolbarSetlistSelect: document.getElementById('toolbar-setlist-select'),

  // Metronome Elements
  metroLed: document.getElementById('metro-led'),
  metroToggleBtn: document.getElementById('metro-toggle-btn'),
  metroBpmDecBtn: document.getElementById('metro-bpm-dec-btn'),
  metroBpmVal: document.getElementById('metro-bpm-val'),
  metroBpmIncBtn: document.getElementById('metro-bpm-inc-btn'),
  metroBeatsSelect: document.getElementById('metro-beats-select'),

  // Modal Elements
  newSongBtn: document.getElementById('new-song-btn'),
  songModal: document.getElementById('song-modal'),
  closeModalBtn: document.getElementById('close-modal-btn'),
  cancelModalBtn: document.getElementById('cancel-modal-btn'),
  saveSongBtn: document.getElementById('save-song-btn'),
  deleteSongBtn: document.getElementById('delete-song-btn'),
  modalTitle: document.getElementById('modal-title'),
  editSongId: document.getElementById('edit-song-id'),
  formTitle: document.getElementById('form-title'),
  formArtist: document.getElementById('form-artist'),
  formKey: document.getElementById('form-key'),
  formRtl: document.getElementById('form-rtl'),
  formText: document.getElementById('form-text'),
  remarksGroup: document.getElementById('remarks-group'),
  formRemarks: document.getElementById('form-remarks'),
  editorBoldBtn: document.getElementById('editor-bold-btn'),
  editorHighlightBtn: document.getElementById('editor-highlight-btn'),
  importDocxGroup: document.getElementById('import-docx-group'),
  formImportFile: document.getElementById('form-import-file'),
  importStatus: document.getElementById('import-status'),
  exportDbBtn: document.getElementById('export-db-btn'),
  restoreBackupBtn: document.getElementById('restore-backup-btn'),
  restoreConfirmModal: document.getElementById('restore-confirm-modal'),
  closeRestoreModalBtn: document.getElementById('close-restore-modal-btn'),
  cancelRestoreModalBtn: document.getElementById('cancel-restore-modal-btn'),
  confirmRestoreBtn: document.getElementById('confirm-restore-btn'),
  restoreFileInput: document.getElementById('restore-file-input'),
  restoreFilename: document.getElementById('restore-filename'),
  restoreAddedCount: document.getElementById('restore-added-count'),
  restoreModifiedCount: document.getElementById('restore-modified-count'),
  restoreDeletedCount: document.getElementById('restore-deleted-count'),
  restoreChangelogDetails: document.getElementById('restore-changelog-details')
};

// Scroll animation variables
let scrollAnimationId = null;
let lastScrollTime = 0;

// IndexedDB Helper Functions
const DB_NAME = 'SongbookDB';
const DB_VERSION = 3;
const STORE_NAME = 'songs';
const SETLIST_STORE_NAME = 'setlists';

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SETLIST_STORE_NAME)) {
        db.createObjectStore(SETLIST_STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pre_restore')) {
        db.createObjectStore('pre_restore', { keyPath: 'id' });
      }
    };
  });
}

function dbGetAllSetlists(dbInstance) {
  return new Promise((resolve, reject) => {
    if (!dbInstance) {
      resolve([]);
      return;
    }
    const transaction = dbInstance.transaction(SETLIST_STORE_NAME, 'readonly');
    const store = transaction.objectStore(SETLIST_STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function dbPutSetlist(dbInstance, setlist) {
  return new Promise((resolve, reject) => {
    if (!dbInstance) {
      resolve();
      return;
    }
    const transaction = dbInstance.transaction(SETLIST_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(SETLIST_STORE_NAME);
    const request = store.put(setlist);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function dbDeleteSetlist(dbInstance, id) {
  return new Promise((resolve, reject) => {
    if (!dbInstance) {
      resolve();
      return;
    }
    const transaction = dbInstance.transaction(SETLIST_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(SETLIST_STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function dbGetAllSongs(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function dbPutSongs(db, songsList) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    songsList.forEach(song => store.put(song));

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function dbPutSong(db, song) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(song);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function dbDeleteSong(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Toast helper
function showToast(message) {
  el.toastNotify.textContent = message;
  el.toastNotify.classList.add('active');
  setTimeout(() => el.toastNotify.classList.remove('active'), 2500);
}

// Utility to escape HTML
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Utility to parse dynamic formatting in lyric sheet (bolding & highlighting)
function formatLyricText(str) {
  if (!str) return '';
  let escaped = escapeHTML(str);
  
  // Convert standard markdown bold (**text**) and html bold (<b>text</b>)
  escaped = escaped
    .replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>')
    .replace(/&lt;b&gt;([\s\S]*?)&lt;\/b&gt;/g, '<strong>$1</strong>')
    // Convert standard highlight (==text==) and html highlight (<mark>text</mark>)
    .replace(/==([\s\S]*?)==/g, '<mark class="song-highlight">$1</mark>')
    .replace(/&lt;mark&gt;([\s\S]*?)&lt;\/mark&gt;/g, '<mark class="song-highlight">$1</mark>');
  
  return escaped;
}

// Helper for formatSegmentText to maintain bold/highlight states across segment boundaries
function formatSegmentText(text, state) {
  let resultHtml = '';
  
  // Open active formatting tags at the beginning of the segment
  if (state.bold) {
    resultHtml += '<strong>';
  }
  if (state.highlight) {
    resultHtml += '<mark class="song-highlight">';
  }
  
  let i = 0;
  while (i < text.length) {
    if (text.substring(i, i + 2) === '**') {
      state.bold = !state.bold;
      resultHtml += state.bold ? '<strong>' : '</strong>';
      i += 2;
    } else if (text.substring(i, i + 2) === '==') {
      state.highlight = !state.highlight;
      resultHtml += state.highlight ? '<mark class="song-highlight">' : '</mark>';
      i += 2;
    } else {
      resultHtml += escapeHTML(text[i]);
      i++;
    }
  }
  
  // Close active formatting tags at the end of the segment to keep HTML valid
  if (state.highlight) {
    resultHtml += '</mark>';
  }
  if (state.bold) {
    resultHtml += '</strong>';
  }
  
  return resultHtml;
}

// Clean chord names ending with 0, o, or O to display as 'dim'
function cleanChordNameForDisplay(chordStr) {
  if (!chordStr) return '';

  const cleanSingle = (str) => {
    const trimmed = str.trim();
    if (trimmed.endsWith('0') || trimmed.endsWith('o') || trimmed.endsWith('O')) {
      return trimmed.slice(0, -1) + 'dim';
    }
    return trimmed;
  };

  return chordStr.split('/').map(part => {
    const cleanPart = part.trim();
    if (cleanPart.includes('-')) {
      return cleanPart.split('-').map(cleanSingle).join('-');
    }
    return cleanSingle(cleanPart);
  }).join('/');
}

// Simple hash function to check database versions
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
}

// Initialize Application
async function init() {
  let defaultSongs = window.defaultSongs || [];
  let localSongs = [];

  try {
    db = await initDB();

    // Check if we have default songs from index.html (songs-data.js)
    let songsJsonText = JSON.stringify(defaultSongs);
    localSongs = await dbGetAllSongs(db);

    // Load setlists
    state.setlists = await dbGetAllSetlists(db);
    renderToolbarSetlistSelect();

    // Auto-sync logic
    if (defaultSongs.length > 0) {
      const newVersion = window.defaultSongsVersion || 'unknown';
      const oldVersion = localStorage.getItem('songs_db_version');

      if (newVersion !== oldVersion || localSongs.length === 0) {
        console.log("Syncing songbook database with songs-data.js version:", newVersion);

        // 1. Identify user-edited standard songs in the local DB
        const localEditedMap = new Map(
          localSongs.filter(s => s.modifiedByUser).map(s => [s.id, s])
        );

        // 2. Build list of default songs to sync (excluding ones user has edited)
        const songsToPut = [];
        for (const defaultSong of defaultSongs) {
          if (localEditedMap.has(defaultSong.id)) {
            continue; // Skip overwriting user edits
          }
          songsToPut.push(defaultSong);
        }

        if (songsToPut.length > 0) {
          await dbPutSongs(db, songsToPut);
        }

        // 3. Remove standard songs no longer in songs-data.js (and not edited by user)
        const fetchedMap = new Map(defaultSongs.map(s => [s.id, s]));
        for (const localSong of localSongs) {
          if (localSong.id.startsWith('song_') && !fetchedMap.has(localSong.id) && !localSong.modifiedByUser) {
            await dbDeleteSong(db, localSong.id);
          }
        }

        // Reload final songs list
        localSongs = await dbGetAllSongs(db);
        localStorage.setItem('songs_db_version', newVersion);
        showToast("Synchronized songbook database.");
      }
    }
  } catch (error) {
    console.error("Initialization failed, falling back to static songs list:", error);
    showToast("Using static backup database.");
    db = null; // Mark DB as unavailable
    localSongs = defaultSongs;
    state.setlists = [];
  }

  state.songs = localSongs;
  state.filteredSongs = [...localSongs];

  // Sort songs alphabetically by Title
  sortSongs();

  // Setup initial routing/view
  if (state.songs.length > 0) {
    // Restore last viewed song or first song
    const lastViewedId = localStorage.getItem('lastViewedSongId');
    const songExists = state.songs.some(s => s.id === lastViewedId);
    state.currentSongId = songExists ? lastViewedId : state.songs[0].id;
  }

  // Load Settings
  loadSettings();

  // Event bindings
  bindEvents(db);

  // Initial Render
  renderSidebar();
  renderSongList();
  renderActiveSong();
}

function sortSongs() {
  state.songs.sort((a, b) => a.title.localeCompare(b.title));
  state.filteredSongs.sort((a, b) => a.title.localeCompare(b.title));
}

function loadSettings() {
  // Theme
  const savedTheme = localStorage.getItem('theme') || 'light';
  state.theme = savedTheme;
  el.themeSelect.value = savedTheme;
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Font Size
  const savedFontSize = parseFloat(localStorage.getItem('fontSize')) || 1.0;
  state.fontSize = savedFontSize;
  updateFontSizeUI();

  // Flat/Sharp preference
  const savedPreferFlats = localStorage.getItem('preferFlats') === 'true';
  state.preferFlats = savedPreferFlats;
  el.enharmonicToggleBtn.textContent = savedPreferFlats ? 'b' : '#';

  // Instrument selection
  const savedInstrument = localStorage.getItem('instrument') || 'guitar';
  state.instrument = savedInstrument;
  if (el.instrumentSelect) {
    el.instrumentSelect.value = savedInstrument;
  }
}

function bindEvents(db) {
  // Synchronized Search Handler
  const performSearch = (query, sourceInput) => {
    const cleanQuery = query.toLowerCase().trim();

    // Sync query values across both inputs
    if (sourceInput === el.searchInput && el.toolbarSearchInput) {
      el.toolbarSearchInput.value = query;
    } else if (sourceInput === el.toolbarSearchInput && el.searchInput) {
      el.searchInput.value = query;
    }

    if (cleanQuery.length < 3) {
      state.filteredSongs = [...state.songs];
      if (el.toolbarSearchDropdown) {
        el.toolbarSearchDropdown.innerHTML = '';
        el.toolbarSearchDropdown.style.display = 'none';
      }
    } else {
      state.filteredSongs = state.songs.filter(song =>
        song.title.toLowerCase().includes(cleanQuery) ||
        song.artist.toLowerCase().includes(cleanQuery) ||
        song.key.toLowerCase().includes(cleanQuery)
      );

      // Update floating dropdown for toolbar search
      if (el.toolbarSearchDropdown) {
        el.toolbarSearchDropdown.innerHTML = '';
        if (state.filteredSongs.length === 0) {
          el.toolbarSearchDropdown.innerHTML = '<div style="padding: 0.8rem; text-align: center; color: var(--text-secondary); font-size: 0.8rem;">No results found.</div>';
        } else {
          state.filteredSongs.forEach(song => {
            const dropdownItem = document.createElement('div');
            dropdownItem.className = 'search-dropdown-item';

            // Clean display values
            const cleanTitle = escapeHTML(song.title);
            const cleanArtist = escapeHTML(song.artist);

            dropdownItem.innerHTML = `
              <div class="title">${cleanTitle}</div>
              <div class="artist">${cleanArtist}</div>
            `;

            dropdownItem.addEventListener('click', () => {
              // Open selected song
              state.currentSongId = song.id;
              localStorage.setItem('lastViewedSongId', song.id);

              // Reset transposition and scroll state
              state.transposeOffset = 0;
              el.transposeVal.textContent = '0';
              if (state.isScrolling) toggleAutoScroll();

              renderSongList();
              renderActiveSong();

              // Reset search queries and hide dropdown
              el.toolbarSearchInput.value = '';
              if (el.searchInput) el.searchInput.value = '';
              el.toolbarSearchDropdown.innerHTML = '';
              el.toolbarSearchDropdown.style.display = 'none';
              state.filteredSongs = [...state.songs];
              renderSongList();
            });
            el.toolbarSearchDropdown.appendChild(dropdownItem);
          });
        }
        el.toolbarSearchDropdown.style.display = 'block';
      }
    }
    renderSongList();
  };

  if (el.searchInput) {
    el.searchInput.addEventListener('input', (e) => {
      performSearch(e.target.value, el.searchInput);
    });
  }
  if (el.toolbarSearchInput) {
    el.toolbarSearchInput.addEventListener('input', (e) => {
      performSearch(e.target.value, el.toolbarSearchInput);
    });
    el.toolbarSearchInput.addEventListener('focus', () => {
      const query = el.toolbarSearchInput.value.toLowerCase().trim();
      if (query.length >= 3) {
        performSearch(el.toolbarSearchInput.value, el.toolbarSearchInput);
      }
    });
  }

  // Close toolbar search dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (el.toolbarSearchDropdown && !e.target.closest('.search-wrapper')) {
      el.toolbarSearchDropdown.style.display = 'none';
    }
  });

  // Theme selection
  el.themeSelect.addEventListener('change', (e) => {
    const theme = e.target.value;
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  });

  // Instrument selection
  if (el.instrumentSelect) {
    el.instrumentSelect.addEventListener('change', (e) => {
      const instrument = e.target.value;
      state.instrument = instrument;
      localStorage.setItem('instrument', instrument);

      // If there is an active tooltip, update its content immediately
      if (state.activeTooltipChord) {
        const svgHtml = window.ChordDB.renderChordDiagram(state.activeTooltipChord, state.instrument);
        el.chordTooltip.innerHTML = svgHtml;

        // Reposition tooltip since dimensions change between guitar (130px) and piano (230px)
        const targetEl = state.pinnedChordElement || state.hoveredChordElement;
        if (targetEl) {
          positionTooltip(targetEl);
        }
      }
    });
  }

  // Font Controls
  el.fontDecBtn.addEventListener('click', () => {
    if (state.fontSize > 0.7) {
      state.fontSize = parseFloat((state.fontSize - 0.1).toFixed(1));
      updateFontSizeUI();
    }
  });
  el.fontIncBtn.addEventListener('click', () => {
    if (state.fontSize < 2.0) {
      state.fontSize = parseFloat((state.fontSize + 0.1).toFixed(1));
      updateFontSizeUI();
    }
  });

  // Transpose Controls
  el.transposeDecBtn.addEventListener('click', () => {
    if (state.transposeOffset > -11) {
      state.transposeOffset--;
      updateTransposeUI();
    }
  });
  el.transposeIncBtn.addEventListener('click', () => {
    if (state.transposeOffset < 11) {
      state.transposeOffset++;
      updateTransposeUI();
    }
  });
  el.enharmonicToggleBtn.addEventListener('click', () => {
    state.preferFlats = !state.preferFlats;
    el.enharmonicToggleBtn.textContent = state.preferFlats ? 'b' : '#';
    localStorage.setItem('preferFlats', state.preferFlats);
    renderActiveSong();
  });

  // Auto Scroll Slider
  el.scrollSpeedSlider.addEventListener('input', (e) => {
    state.scrollSpeed = parseInt(e.target.value);
  });

  // Auto Scroll Toggle
  el.scrollToggleBtn.addEventListener('click', () => {
    toggleAutoScroll();
  });

  // Wake Lock Button
  el.wakeLockBtn.addEventListener('click', () => {
    toggleWakeLock();
  });

  // Mobile Nav Buttons
  el.showSidebarBtn.addEventListener('click', () => el.sidebar.classList.add('active'));
  el.hideSidebarBtn.addEventListener('click', () => el.sidebar.classList.remove('active'));

  // Maximize / Fullscreen toggle
  if (el.maximizeBtn) {
    el.maximizeBtn.addEventListener('click', () => {
      toggleFullscreen(true);
    });
  }
  if (el.restoreBtn) {
    el.restoreBtn.addEventListener('click', () => {
      toggleFullscreen(false);
    });
  }

  // Escape key to exit fullscreen
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.isFullscreen) {
      toggleFullscreen(false);
    }
  });

  // Modals opening/closing
  el.newSongBtn.addEventListener('click', () => openSongModal());
  el.closeModalBtn.addEventListener('click', () => closeSongModal());
  el.cancelModalBtn.addEventListener('click', () => closeSongModal());
  if (el.formRtl) {
    el.formRtl.addEventListener('change', () => {
      updateFormTextDirection();
    });
  }

  // Editor formatting toolbar selection wrapping helper
  const wrapTextSelection = (tagOpen, tagClose) => {
    const textarea = el.formText;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);
    
    const replacement = tagOpen + selectedText + tagClose;
    textarea.value = text.substring(0, start) + replacement + text.substring(end);
    
    // Restore focus and selection
    textarea.focus();
    textarea.selectionStart = start;
    textarea.selectionEnd = start + replacement.length;
  };

  if (el.editorBoldBtn) {
    el.editorBoldBtn.addEventListener('click', (e) => {
      e.preventDefault();
      wrapTextSelection('**', '**');
    });
  }

  if (el.editorHighlightBtn) {
    el.editorHighlightBtn.addEventListener('click', (e) => {
      e.preventDefault();
      wrapTextSelection('==', '==');
    });
  }

  // Save Song Button
  el.saveSongBtn.addEventListener('click', async () => {
    const title = el.formTitle.value.trim();
    const artist = el.formArtist.value.trim() || 'Unknown Artist';
    const key = el.formKey.value.trim();
    const isRTL = el.formRtl.checked;
    const rawText = el.formText.value.trim();

    if (!title || !rawText) {
      showToast("Title and lyrics content are required.");
      return;
    }

    const isSetlistEdit = !!(state.activeSetlistId && state.activeSetlistSongIndex !== null);
    if (isSetlistEdit) {
      const setlist = state.setlists.find(s => s.id === state.activeSetlistId);
      if (setlist && setlist.songs[state.activeSetlistSongIndex]) {
        const item = setlist.songs[state.activeSetlistSongIndex];
        const remarks = el.formRemarks ? el.formRemarks.value.trim() : '';

        // Save overrides in the setlist song item
        item.title = title;
        item.artist = artist;
        item.key = key;
        item.isRTL = isRTL;
        item.rawText = rawText;
        item.remarks = remarks;

        try {
          if (db) {
            await dbPutSetlist(db, setlist);
          }
          showToast("Setlist song updated.");
          closeSongModal();
          renderSetlistEditor();
          renderActiveSong();
        } catch (e) {
          console.error(e);
          showToast("Failed to save setlist song.");
        }
      }
      return;
    }

    const id = el.editSongId.value || 'custom_' + Date.now();
    const originalSong = state.songs.find(s => s.id === id);
    const filename = originalSong ? originalSong.filename : null;

    const song = { id, title, artist, key, isRTL, rawText };
    if (filename) {
      song.filename = filename;
    }
    if (id.startsWith('song_')) {
      song.modifiedByUser = true;
    }

    // Attempt to sync edits back to host disk using local server API
    try {
      const response = await fetch('/api/save-song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(song)
      });
      if (response.ok) {
        console.log("Edits successfully synced to local disk.");
      } else {
        console.warn("Failed to sync edits to local disk, status:", response.status);
      }
    } catch (err) {
      console.log("Local sync server unavailable. Saving locally inside browser only.");
    }

    try {
      if (db) {
        await dbPutSong(db, song);
      } else {
        console.warn("Offline database: saving changes in memory only.");
      }

      // Update local state
      const existingIdx = state.songs.findIndex(s => s.id === id);
      if (existingIdx >= 0) {
        state.songs[existingIdx] = song;
        showToast("Song updated successfully.");
      } else {
        state.songs.push(song);
        showToast("Song added successfully.");
      }

      // Sync UI
      state.filteredSongs = [...state.songs];
      sortSongs();
      state.currentSongId = id;
      localStorage.setItem('lastViewedSongId', id);

      closeSongModal();
      renderSongList();
      renderActiveSong();
    } catch (e) {
      console.error(e);
      showToast("Failed to save song.");
    }
  });

  // Delete Song Button
  el.deleteSongBtn.addEventListener('click', async () => {
    const id = el.editSongId.value;
    if (!id) return;

    if (confirm("Are you sure you want to delete this song permanently?")) {
      // Attempt to sync delete back to host disk using local server API
      try {
        const response = await fetch('/api/delete-song', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        if (response.ok) {
          console.log("Delete successfully synced to local disk.");
        } else {
          console.warn("Failed to sync delete to local disk, status:", response.status);
        }
      } catch (err) {
        console.log("Local sync server unavailable. Deleting locally inside browser only.");
      }

      try {
        if (db) {
          await dbDeleteSong(db, id);
        } else {
          console.warn("Offline database: deleting from memory only.");
        }
        showToast("Song deleted.");

        state.songs = state.songs.filter(s => s.id !== id);
        state.filteredSongs = [...state.songs];

        closeSongModal();

        if (state.songs.length > 0) {
          state.currentSongId = state.songs[0].id;
          localStorage.setItem('lastViewedSongId', state.currentSongId);
        } else {
          state.currentSongId = null;
        }

        renderSongList();
        renderActiveSong();
      } catch (e) {
        console.error(e);
        showToast("Failed to delete song.");
      }
    }
  });

  // Export DB Backup Button
  el.exportDbBtn.addEventListener('click', () => {
    const jsonContent = JSON.stringify(state.songs, null, 2);
    const filename = "songbook_backup.json";

    if (typeof AndroidApp !== 'undefined' && AndroidApp.shareTextFile) {
      AndroidApp.shareTextFile(filename, jsonContent);
      showToast("Export triggered via system share sheet.");
    } else {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonContent);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast("Backup downloaded.");
    }
  });

  // Restore Backup Button triggers modal (State 1) and checks undo availability
  if (el.restoreBackupBtn) {
    el.restoreBackupBtn.addEventListener('click', async () => {
      if (el.restoreFileInput) el.restoreFileInput.value = '';
      
      // Reset view to State 1
      const selectView = document.getElementById('restore-select-view');
      const changelogView = document.getElementById('restore-changelog-view');
      if (selectView) selectView.style.display = 'flex';
      if (changelogView) changelogView.style.display = 'none';
      if (el.confirmRestoreBtn) el.confirmRestoreBtn.style.display = 'none';
      
      let undoAvailable = false;
      try {
        const response = await fetch('/api/check-undo-available');
        if (response.ok) {
          const data = await response.json();
          undoAvailable = !!data.undoAvailable;
        }
      } catch (err) {
        // Local IndexedDB check
        if (db) {
          try {
            const transaction = db.transaction(['pre_restore'], 'readonly');
            const store = transaction.objectStore('pre_restore');
            const countReq = store.count();
            await new Promise((res) => {
              countReq.onsuccess = () => {
                undoAvailable = countReq.result > 0;
                res();
              };
              countReq.onerror = () => {
                undoAvailable = false;
                res();
              };
            });
          } catch (e) {
            undoAvailable = false;
          }
        }
      }
      
      const undoSection = document.getElementById('restore-undo-section');
      if (undoSection) undoSection.style.display = undoAvailable ? 'flex' : 'none';
      
      el.restoreConfirmModal.classList.add('active');
    });
  }

  // Trigger file selection inside the modal
  const selectFileBtn = document.getElementById('restore-select-file-btn');
  if (selectFileBtn && el.restoreFileInput) {
    selectFileBtn.addEventListener('click', () => {
      el.restoreFileInput.click();
    });
  }

  // Handle selected file for restore
  if (el.restoreFileInput) {
    el.restoreFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target.result;
          let parsedSongs = null;

          if (file.name.endsWith('.js')) {
            // Extract window.defaultSongs = [...]
            const match = text.match(/window\.defaultSongs\s*=\s*(\[[\s\S]*?\])\s*;?/);
            if (match) {
              parsedSongs = JSON.parse(match[1]);
            } else {
              // Fallback: search for first [ and last ]
              const start = text.indexOf('[');
              const end = text.lastIndexOf(']');
              if (start !== -1 && end !== -1) {
                parsedSongs = JSON.parse(text.substring(start, end + 1));
              } else {
                throw new Error("Could not find window.defaultSongs assignment in JS file.");
              }
            }
          } else {
            // JSON file
            parsedSongs = JSON.parse(text);
          }

          if (!Array.isArray(parsedSongs)) {
            throw new Error("Parsed content is not an array of songs.");
          }
          if (parsedSongs.length > 0 && (!parsedSongs[0].id || !parsedSongs[0].title)) {
            throw new Error("Invalid song format. Missing 'id' or 'title' fields.");
          }

          // Calculate Change Log
          const currentMap = new Map(state.songs.map(s => [s.id, s]));
          const backupMap = new Map(parsedSongs.map(s => [s.id, s]));

          const addedSongs = [];
          const modifiedSongs = [];
          const deletedSongs = [];

          for (const bSong of parsedSongs) {
            const cSong = currentMap.get(bSong.id);
            if (!cSong) {
              addedSongs.push(bSong);
            } else {
              const isDiff = cSong.title !== bSong.title ||
                             cSong.artist !== bSong.artist ||
                             cSong.key !== bSong.key ||
                             cSong.isRTL !== bSong.isRTL ||
                             cSong.rawText !== bSong.rawText;
              if (isDiff) {
                modifiedSongs.push({ current: cSong, backup: bSong });
              }
            }
          }

          for (const cSong of state.songs) {
            if (!backupMap.has(cSong.id)) {
              deletedSongs.push(cSong);
            }
          }

          // Update summary counts
          el.restoreFilename.textContent = file.name;
          el.restoreAddedCount.textContent = addedSongs.length;
          el.restoreModifiedCount.textContent = modifiedSongs.length;
          el.restoreDeletedCount.textContent = deletedSongs.length;

          // Render details list
          let html = '';
          if (addedSongs.length === 0 && modifiedSongs.length === 0 && deletedSongs.length === 0) {
            html = `<div style="text-align: center; padding: 1.5rem; color: var(--text-secondary); font-size: 0.9rem;">
                      No changes detected. The selected backup is identical to your current database.
                    </div>`;
          } else {
            if (addedSongs.length > 0) {
              html += `<div>
                <h4 style="color: #22c55e; font-size: 0.85rem; text-transform: uppercase; margin-bottom: 0.4rem; font-weight: 700;">Songs to Add (${addedSongs.length})</h4>
                <ul style="list-style: none; padding-left: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; max-height: 120px; overflow-y: auto;">
                  ${addedSongs.map(s => `
                    <li style="color: var(--text-primary); margin-bottom: 0.15rem; display: flex; align-items: center; gap: 0.5rem;">
                      <input type="checkbox" class="restore-add-checkbox" data-id="${s.id}" checked style="cursor: pointer; width: 14px; height: 14px;">
                      <span class="restore-item-text"><strong>+ ${escapeHTML(s.title)}</strong> <span style="color: var(--text-secondary); font-size: 0.8rem;">by ${escapeHTML(s.artist || 'Unknown')}</span></span>
                    </li>`).join('')}
                </ul>
              </div>`;
            }
            if (modifiedSongs.length > 0) {
              html += `<div style="margin-top: 0.8rem;">
                <h4 style="color: #eab308; font-size: 0.85rem; text-transform: uppercase; margin-bottom: 0.4rem; font-weight: 700;">Songs to Update (${modifiedSongs.length})</h4>
                <ul style="list-style: none; padding-left: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; max-height: 120px; overflow-y: auto;">
                  ${modifiedSongs.map(m => `
                    <li style="color: var(--text-primary); margin-bottom: 0.15rem; display: flex; align-items: center; gap: 0.5rem;">
                      <input type="checkbox" class="restore-modify-checkbox" data-id="${m.backup.id}" checked style="cursor: pointer; width: 14px; height: 14px;">
                      <span class="restore-item-text">
                        <strong>~ ${escapeHTML(m.backup.title)}</strong> 
                        <span style="color: var(--text-secondary); font-size: 0.8rem;">
                          (Key: ${escapeHTML(m.current.key || 'None')} → ${escapeHTML(m.backup.key || 'None')})
                        </span>
                      </span>
                    </li>
                  `).join('')}
                </ul>
              </div>`;
            }
            if (deletedSongs.length > 0) {
              html += `<div style="margin-top: 0.8rem;">
                <h4 style="color: #ef4444; font-size: 0.85rem; text-transform: uppercase; margin-bottom: 0.4rem; font-weight: 700;">Songs to Delete (${deletedSongs.length})</h4>
                <ul style="list-style: none; padding-left: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; max-height: 120px; overflow-y: auto;">
                  ${deletedSongs.map(s => `
                    <li style="color: var(--text-primary); margin-bottom: 0.15rem; display: flex; align-items: center; gap: 0.5rem;">
                      <input type="checkbox" class="restore-delete-checkbox" data-id="${s.id}" checked style="cursor: pointer; width: 14px; height: 14px;">
                      <span class="restore-item-text" style="text-decoration: line-through;"><strong>- ${escapeHTML(s.title)}</strong> <span style="color: var(--text-secondary); font-size: 0.8rem;">by ${escapeHTML(s.artist || 'Unknown')}</span></span>
                    </li>`).join('')}
                </ul>
              </div>`;
            }
          }
          el.restoreChangelogDetails.innerHTML = html;

          // Switch to State 2 (Changelog view)
          const selectView = document.getElementById('restore-select-view');
          const changelogView = document.getElementById('restore-changelog-view');
          if (selectView) selectView.style.display = 'none';
          if (changelogView) changelogView.style.display = 'flex';
          if (el.confirmRestoreBtn) el.confirmRestoreBtn.style.display = 'block';

          // Save pending state
          state.restorePendingSongs = parsedSongs;
        } catch (err) {
          console.error("Error parsing backup file:", err);
          showToast("Failed to parse file: " + err.message);
          el.restoreFileInput.value = '';
        }
      };

      reader.onerror = () => {
        showToast("Error reading file.");
        el.restoreFileInput.value = '';
      };

      reader.readAsText(file);
    });
  }

  // Handle modal closing
  const closeRestoreModal = () => {
    if (el.restoreConfirmModal) {
      el.restoreConfirmModal.classList.remove('active');
    }
    if (el.restoreFileInput) {
      el.restoreFileInput.value = '';
    }
    state.restorePendingSongs = null;
  };

  if (el.closeRestoreModalBtn) {
    el.closeRestoreModalBtn.addEventListener('click', closeRestoreModal);
  }
  if (el.cancelRestoreModalBtn) {
    el.cancelRestoreModalBtn.addEventListener('click', closeRestoreModal);
  }

  // Handle Revert Last Restore click
  const undoBtn = document.getElementById('restore-undo-btn');
  if (undoBtn) {
    undoBtn.addEventListener('click', async () => {
      if (confirm("Are you sure you want to revert to the previous database? Your current edits will be replaced.")) {
        closeRestoreModal();
        showToast("Reverting last restore...");
        
        try {
          const response = await fetch('/api/undo-restore', { method: 'POST' });
          if (response.ok) {
            try {
              window.localStorage.removeItem('songs_db_version');
              if (db) {
                const transaction = db.transaction(['songs'], 'readwrite');
                transaction.objectStore('songs').clear();
              }
            } catch (e) {
              console.error(e);
            }
            showToast("Database reverted successfully! Reloading...");
            setTimeout(() => {
              window.location.reload();
            }, 1500);
            return;
          }
        } catch (err) {
          console.log("Server undo unavailable. Attempting local IndexedDB undo.", err);
        }
        
        // Local IndexedDB undo fallback
        if (db) {
          try {
            const readTransaction = db.transaction(['pre_restore'], 'readonly');
            const preStore = readTransaction.objectStore('pre_restore');
            const songsToRevert = await new Promise((res, rej) => {
              const req = preStore.getAll();
              req.onsuccess = () => res(req.result);
              req.onerror = () => rej(req.error);
            });
            
            if (songsToRevert && songsToRevert.length > 0) {
              const writeTransaction = db.transaction(['songs', 'pre_restore'], 'readwrite');
              const songsStore = writeTransaction.objectStore('songs');
              const preStoreWrite = writeTransaction.objectStore('pre_restore');
              
              songsStore.clear();
              songsToRevert.forEach(s => songsStore.put(s));
              preStoreWrite.clear();
              
              writeTransaction.oncomplete = () => {
                const currentVersion = window.defaultSongsVersion || 'unknown';
                localStorage.setItem('songs_db_version', currentVersion);
                showToast("Database reverted locally! Reloading...");
                setTimeout(() => {
                  window.location.reload();
                }, 1500);
              };
              
              writeTransaction.onerror = (e) => {
                console.error("Local undo transaction failed:", e);
                showToast("Revert failed: database error.");
              };
            } else {
              showToast("No local undo backup found.");
            }
          } catch (dbErr) {
            console.error("Failed to execute local undo restore:", dbErr);
            showToast("Revert failed: " + dbErr.message);
          }
        } else {
          showToast("Revert failed: database unavailable.");
        }
      }
    });
  }

  // Handle checkbox change in restore changelog details (dynamic styling & count update)
  if (el.restoreChangelogDetails) {
    el.restoreChangelogDetails.addEventListener('change', (e) => {
      if (e.target.classList.contains('restore-add-checkbox') ||
          e.target.classList.contains('restore-modify-checkbox') ||
          e.target.classList.contains('restore-delete-checkbox')) {
        
        // Recalculate checked counts
        const addedCount = document.querySelectorAll('.restore-add-checkbox:checked').length;
        const modifiedCount = document.querySelectorAll('.restore-modify-checkbox:checked').length;
        const deletedCount = document.querySelectorAll('.restore-delete-checkbox:checked').length;

        if (el.restoreAddedCount) el.restoreAddedCount.textContent = addedCount;
        if (el.restoreModifiedCount) el.restoreModifiedCount.textContent = modifiedCount;
        if (el.restoreDeletedCount) el.restoreDeletedCount.textContent = deletedCount;

        // Visual feedback styling
        const textSpan = e.target.closest('li').querySelector('.restore-item-text');
        if (textSpan) {
          if (e.target.classList.contains('restore-delete-checkbox')) {
            textSpan.style.textDecoration = e.target.checked ? 'line-through' : 'none';
          } else {
            textSpan.style.opacity = e.target.checked ? '1' : '0.5';
          }
        }
      }
    });
  }

  // Handle Confirm Restore click
  if (el.confirmRestoreBtn) {
    el.confirmRestoreBtn.addEventListener('click', async () => {
      if (!state.restorePendingSongs) {
        showToast("No pending restore database found.");
        return;
      }

      // Calculate final songs list to send to server based on checked boxes!
      const currentMap = new Map(state.songs.map(s => [s.id, s]));
      const backupMap = new Map(state.restorePendingSongs.map(s => [s.id, s]));
      const songsToRestore = [];

      for (const bSong of state.restorePendingSongs) {
        const cSong = currentMap.get(bSong.id);
        if (!cSong) {
          // Added song
          const cb = document.querySelector(`.restore-add-checkbox[data-id="${bSong.id}"]`);
          if (!cb || cb.checked) {
            songsToRestore.push(bSong);
          }
        } else {
          // Modified or Unchanged
          const isModified = cSong.title !== bSong.title ||
                             cSong.artist !== bSong.artist ||
                             cSong.key !== bSong.key ||
                             cSong.isRTL !== bSong.isRTL ||
                             cSong.rawText !== bSong.rawText;
          if (isModified) {
            const cb = document.querySelector(`.restore-modify-checkbox[data-id="${bSong.id}"]`);
            if (!cb || cb.checked) {
              songsToRestore.push(bSong);
            } else {
              songsToRestore.push(cSong);
            }
          } else {
            songsToRestore.push(bSong);
          }
        }
      }

      for (const cSong of state.songs) {
        if (!backupMap.has(cSong.id)) {
          // Deleted song
          const cb = document.querySelector(`.restore-delete-checkbox[data-id="${cSong.id}"]`);
          // If deleted song checkbox is UNchecked, it means "do NOT delete (Keep)" -> include current version
          if (cb && !cb.checked) {
            songsToRestore.push(cSong);
          }
        }
      }

      if (songsToRestore.length === 0) {
        showToast("Cannot restore an empty database. Please select at least one song.");
        return;
      }

      try {
        showToast("Restoring selected database changes...");
        const response = await fetch('/api/restore-backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ songs: songsToRestore })
        });

        if (response.ok) {
          let newVersion = 'unknown';
          try {
            const data = await response.json();
            if (data && data.version) {
              newVersion = data.version;
            }
          } catch (jsonErr) {
            console.warn("Failed to parse server version from restore response:", jsonErr);
          }

          if (db) {
            try {
              const transaction = db.transaction(['songs'], 'readwrite');
              const store = transaction.objectStore('songs');
              store.clear();
              songsToRestore.forEach(song => store.put(song));
              
              transaction.oncomplete = () => {
                localStorage.setItem('songs_db_version', newVersion);
                showToast("Database restored successfully! Reloading...");
                setTimeout(() => {
                  window.location.reload();
                }, 1500);
              };
              
              transaction.onerror = (e) => {
                console.error("Failed to write restored songs to IndexedDB:", e);
                localStorage.setItem('songs_db_version', newVersion);
                window.location.reload();
              };
            } catch (dbErr) {
              console.error("Error writing restored songs to IndexedDB:", dbErr);
              localStorage.setItem('songs_db_version', newVersion);
              window.location.reload();
            }
          } else {
            localStorage.setItem('songs_db_version', newVersion);
            showToast("Database restored successfully! Reloading...");
            setTimeout(() => {
              window.location.reload();
            }, 1500);
          }
        } else {
          const errText = await response.text();
          console.error("Restore failed:", errText);
          showToast("Failed to restore backup: " + errText);
        }
      } catch (err) {
        console.warn("Network or server error during restore, attempting local browser restore fallback:", err);
        if (db) {
          try {
            const transaction = db.transaction(['songs', 'pre_restore'], 'readwrite');
            const store = transaction.objectStore('songs');
            const preStore = transaction.objectStore('pre_restore');
            
            // Backup current songs to pre_restore
            preStore.clear();
            state.songs.forEach(song => preStore.put(song));
            
            // Clear and restore
            store.clear();
            songsToRestore.forEach(song => store.put(song));
            
            transaction.oncomplete = () => {
              const currentVersion = window.defaultSongsVersion || 'unknown';
              localStorage.setItem('songs_db_version', currentVersion);
              showToast("Database restored locally in browser successfully! Reloading...");
              setTimeout(() => {
                window.location.reload();
              }, 1500);
            };

            transaction.onerror = (e) => {
              console.error("Local IndexedDB restore failed:", e);
              showToast("Failed to restore locally: database error.");
            };
          } catch (dbErr) {
            console.error("Failed to execute local DB restore:", dbErr);
            showToast("Failed to restore locally: " + dbErr.message);
          }
        } else {
          showToast("Error connecting to server and local database is unavailable.");
        }
      }
    });
  }

  // Chord Hover / Tap Tooltip events
  document.addEventListener('mouseover', handleChordTooltipOpen);
  document.addEventListener('mouseout', handleChordTooltipClose);

  // Touch event for mobile chord interaction (toggle display on tap)
  document.addEventListener('click', handleChordTooltipTap);

  // Toggle image zoom expansion
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('song-image')) {
      e.target.classList.toggle('expanded');
    }
  });

  // Handle viewport resize (to close mobile nav)
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      el.sidebar.classList.remove('active');
    }
  });

  // Word docx Import listener
  if (el.formImportFile) {
    el.formImportFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      el.importStatus.textContent = "Processing...";

      try {
        const result = await parseDocxFile(file);

        // Auto-populate fields
        el.formTitle.value = result.title;
        el.formText.value = result.text;
        el.formRtl.checked = result.isRTL;
        updateFormTextDirection();

        el.importStatus.textContent = "Imported successfully!";
        showToast("Word document converted.");
      } catch (err) {
        console.error(err);
        el.importStatus.textContent = "Import failed.";
        showToast("Failed to parse Word file.");
      }
    });
  }

  // Toolbar Setlist dropdown event listener
  if (el.toolbarSetlistSelect) {
    el.toolbarSetlistSelect.addEventListener('change', (e) => {
      const setlistId = e.target.value;
      if (setlistId) {
        state.activeSetlistId = setlistId;
        const setlist = state.setlists.find(s => s.id === setlistId);
        if (setlist && setlist.songs.length > 0) {
          state.activeSetlistSongIndex = 0;
          const item = setlist.songs[0];
          const song = state.songs.find(s => s.id === item.songId);
          if (song) {
            state.currentSongId = song.id;
            localStorage.setItem('lastViewedSongId', song.id);
            state.transposeOffset = item.transposeOffset || 0;
            el.transposeVal.textContent = (state.transposeOffset > 0 ? '+' : '') + state.transposeOffset;
          }
        } else {
          state.activeSetlistSongIndex = null;
        }
        state.activeTab = 'setlists';
      } else {
        state.activeSetlistId = null;
        state.activeSetlistSongIndex = null;
      }
      renderSidebar();
      renderActiveSong();
    });
  }

  // Setlist feature event listeners
  if (el.tabSongsBtn) {
    el.tabSongsBtn.addEventListener('click', () => {
      state.activeTab = 'songs';
      state.activeSetlistSongIndex = null;
      renderSidebar();
      renderActiveSong();
    });
  }

  if (el.tabSetlistsBtn) {
    el.tabSetlistsBtn.addEventListener('click', () => {
      state.activeTab = 'setlists';
      renderSidebar();
      renderActiveSong();
    });
  }

  if (el.newSetlistBtn) {
    el.newSetlistBtn.addEventListener('click', async () => {
      const name = prompt("Enter setlist name:");
      if (!name || !name.trim()) return;

      const newSetlist = {
        id: 'setlist_' + Date.now(),
        name: name.trim(),
        songs: []
      };

      try {
        if (db) {
          await dbPutSetlist(db, newSetlist);
        }
        state.setlists.push(newSetlist);
        state.activeSetlistId = newSetlist.id;
        state.activeSetlistSongIndex = null;
        state.activeTab = 'setlists';

        showToast("Setlist created.");
        renderToolbarSetlistSelect();
        renderSidebar();
      } catch (e) {
        console.error(e);
        showToast("Failed to create setlist.");
      }
    });
  }

  if (el.setlistBackBtn) {
    el.setlistBackBtn.addEventListener('click', () => {
      state.activeSetlistId = null;
      state.activeSetlistSongIndex = null;
      renderSidebar();
      renderActiveSong();
    });
  }

  if (el.setlistNameInput) {
    el.setlistNameInput.addEventListener('change', async (e) => {
      const newName = e.target.value.trim();
      if (!newName) return;

      const setlist = state.setlists.find(s => s.id === state.activeSetlistId);
      if (setlist) {
        setlist.name = newName;
        try {
          if (db) {
            await dbPutSetlist(db, setlist);
          }
          renderActiveSong(); // update gig header title
          renderToolbarSetlistSelect();
        } catch (err) {
          console.error(err);
        }
      }
    });
  }

  if (el.setlistDeleteBtn) {
    el.setlistDeleteBtn.addEventListener('click', async () => {
      const setlist = state.setlists.find(s => s.id === state.activeSetlistId);
      if (!setlist) return;

      if (confirm(`Are you sure you want to delete the setlist "${setlist.name}" permanently?`)) {
        try {
          if (db) {
            await dbDeleteSetlist(db, setlist.id);
          }
          state.setlists = state.setlists.filter(s => s.id !== setlist.id);
          state.activeSetlistId = null;
          state.activeSetlistSongIndex = null;

          showToast("Setlist deleted.");
          renderToolbarSetlistSelect();
          renderSidebar();
          renderActiveSong();
        } catch (e) {
          console.error(e);
          showToast("Failed to delete setlist.");
        }
      }
    });
  }

  if (el.setlistAddSongSelect) {
    el.setlistAddSongSelect.addEventListener('change', async (e) => {
      const songId = e.target.value;
      if (!songId) return;

      const setlist = state.setlists.find(s => s.id === state.activeSetlistId);
      if (!setlist) return;

      // Add song with default transpose offset of 0
      setlist.songs.push({ songId, transposeOffset: 0 });

      try {
        if (db) {
          await dbPutSetlist(db, setlist);
        }
        el.setlistAddSongSelect.value = ''; // reset dropdown
        renderSetlistEditor();
        showToast("Song added to setlist.");
      } catch (err) {
        console.error(err);
        showToast("Failed to add song.");
      }
    });
  }

  // Setlist Export (specific active setlist)
  if (el.setlistExportBtn) {
    el.setlistExportBtn.addEventListener('click', () => {
      const setlist = state.setlists.find(s => s.id === state.activeSetlistId);
      exportSetlistToFile(setlist);
    });
  }

  // Setlist Import Trigger (inside active setlist editor or main list)
  if (el.mainImportSetlistBtn) {
    el.mainImportSetlistBtn.addEventListener('click', () => {
      el.setlistsImportFile.click();
    });
  }

  if (el.setlistImportBtn && el.setlistsImportFile) {
    el.setlistImportBtn.addEventListener('click', () => {
      el.setlistsImportFile.click();
    });
  }

  // Metronome Event Listeners
  if (el.metroToggleBtn) {
    el.metroToggleBtn.addEventListener('click', () => {
      if (state.metroMode === 'off') {
        state.metroMode = 'visual';
        el.metroToggleBtn.textContent = '👁️';
        el.metroToggleBtn.title = "Metronome: Visual Only (Click to switch to Audible)";
      } else if (state.metroMode === 'visual') {
        state.metroMode = 'audio';
        el.metroToggleBtn.textContent = '🔊';
        el.metroToggleBtn.title = "Metronome: Audio + Visual (Click to turn Off)";
      } else {
        state.metroMode = 'off';
        el.metroToggleBtn.textContent = '🔇';
        el.metroToggleBtn.title = "Metronome: Off (Click to turn On)";
      }
      updateMetronomeTimer();
    });
  }

  if (el.metroBpmDecBtn) {
    el.metroBpmDecBtn.addEventListener('click', () => {
      changeBpm(-1);
    });
  }

  if (el.metroBpmIncBtn) {
    el.metroBpmIncBtn.addEventListener('click', () => {
      changeBpm(1);
    });
  }

  if (el.metroBeatsSelect) {
    el.metroBeatsSelect.addEventListener('change', (e) => {
      state.metroBeats = parseInt(e.target.value) || 4;
      if (state.metroIntervalId) {
        updateMetronomeTimer();
      }
    });
  }

  if (el.setlistsImportFile) {
    el.setlistsImportFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const imported = JSON.parse(evt.target.result);

          // Verify that it represents a single setlist structure (name and songs array)
          let setlistItem = null;
          if (Array.isArray(imported)) {
            if (imported.length > 0) {
              setlistItem = imported[0];
            }
          } else if (imported && typeof imported === 'object') {
            setlistItem = imported;
          }

          if (!setlistItem || !setlistItem.name || !Array.isArray(setlistItem.songs)) {
            showToast("No valid setlist found in file.");
            el.setlistsImportFile.value = '';
            return;
          }

          // We are inside the active setlist editor, so we have state.activeSetlistId
          const activeSetlist = state.setlists.find(s => s.id === state.activeSetlistId);
          const activeName = activeSetlist ? activeSetlist.name : 'current setlist';

          if (confirm(`Do you want to overwrite the current setlist "${activeName}" with the imported songs? (Cancel to import as a new setlist)`)) {
            // Overwrite current setlist
            if (activeSetlist) {
              activeSetlist.name = setlistItem.name;
              activeSetlist.songs = setlistItem.songs;
              if (db) {
                await dbPutSetlist(db, activeSetlist);
              }
              showToast(`Setlist "${activeSetlist.name}" overwritten.`);
              renderToolbarSetlistSelect();
              renderSetlistEditor();
              renderSidebar();
              renderActiveSong();
            } else {
              showToast("No active setlist found to overwrite.");
            }
          } else {
            // Import as a new setlist
            const newSetlist = JSON.parse(JSON.stringify(setlistItem));
            newSetlist.id = 'setlist_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

            // Check for name collision
            let baseName = newSetlist.name;
            let nameCollision = state.setlists.some(s => s.name === baseName);
            if (nameCollision) {
              newSetlist.name = baseName + ' (Copy)';
            }

            state.setlists.push(newSetlist);
            if (db) {
              await dbPutSetlist(db, newSetlist);
            }
            state.activeSetlistId = newSetlist.id;
            state.activeSetlistSongIndex = null;
            showToast(`Imported "${newSetlist.name}" as new setlist.`);
            renderToolbarSetlistSelect();
            renderSidebar();
            renderActiveSong();
          }
        } catch (err) {
          console.error(err);
          showToast("Failed to parse setlist file.");
        }
        el.setlistsImportFile.value = '';
      };
      reader.readAsText(file);
    });
  }
}

/**
 * Client-side Word (.docx) layout and media parser.
 * Reads the zip structure using JSZip, parses XML, and converts to formatted song lyrics/chords text.
 */
async function parseDocxFile(file) {
  const zip = await JSZip.loadAsync(file);

  // 1. Read document.xml
  const docXmlText = await zip.file("word/document.xml").async("text");
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(docXmlText, "text/xml");

  // 2. Read relationships file document.xml.rels if it exists
  const relsMap = {};
  try {
    const relsFile = zip.file("word/_rels/document.xml.rels");
    if (relsFile) {
      const relsXmlText = await relsFile.async("text");
      const relsDoc = parser.parseFromString(relsXmlText, "text/xml");
      const relationships = relsDoc.getElementsByTagName("Relationship");
      for (let i = 0; i < relationships.length; i++) {
        const id = relationships[i].getAttribute("Id");
        const target = relationships[i].getAttribute("Target");
        if (id && target) {
          relsMap[id] = target;
        }
      }
    }
  } catch (e) {
    console.warn("Failed to parse relationships files:", e);
  }

  // Helper: extract text and images from a paragraph node w:p
  const extractParagraphContent = async (pNode) => {
    let text = "";

    // Extract runs (r)
    const runs = pNode.getElementsByTagNameNS("*", "r");
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      const texts = run.getElementsByTagNameNS("*", "t");
      for (let j = 0; j < texts.length; j++) {
        text += texts[j].textContent || "";
      }
    }

    // Check for drawing/images (drawing)
    const drawings = pNode.getElementsByTagNameNS("*", "drawing");
    const imagePlaceholders = [];

    for (let i = 0; i < drawings.length; i++) {
      const drawing = drawings[i];
      const blips = drawing.getElementsByTagNameNS("*", "blip");

      for (let j = 0; j < blips.length; j++) {
        const blip = blips[j];
        // Relies on r:embed attribute
        let embedId = blip.getAttribute("r:embed") ||
          blip.getAttribute("embed") ||
          blip.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed");

        if (!embedId) {
          // Scan attributes ending with embed
          for (let a = 0; a < blip.attributes.length; a++) {
            const attr = blip.attributes[a];
            if (attr.nodeName.endsWith("embed")) {
              embedId = attr.nodeValue;
              break;
            }
          }
        }

        if (embedId && relsMap[embedId]) {
          const mediaPath = relsMap[embedId];
          const zipMediaPath = `word/${mediaPath}`;

          const mediaFile = zip.file(zipMediaPath);
          if (mediaFile) {
            // Read as base64 data URL
            const base64Bytes = await mediaFile.async("base64");
            // Determine MIME type
            let mimeType = "image/png";
            if (mediaPath.toLowerCase().endsWith(".jpg") || mediaPath.toLowerCase().endsWith(".jpeg")) {
              mimeType = "image/jpeg";
            } else if (mediaPath.toLowerCase().endsWith(".gif")) {
              mimeType = "image/gif";
            } else if (mediaPath.toLowerCase().endsWith(".svg")) {
              mimeType = "image/svg+xml";
            }

            const dataUrl = `data:${mimeType};base64,${base64Bytes}`;
            imagePlaceholders.push(`[IMAGE: ${dataUrl}]`);
          }
        }
      }
    }

    if (imagePlaceholders.length > 0) {
      if (text.trim()) {
        return text + "\n" + imagePlaceholders.join("\n");
      } else {
        return imagePlaceholders.join("\n");
      }
    }
    return text;
  };

  // Find w:body element
  const bodyNode = xmlDoc.getElementsByTagNameNS("*", "body")[0];
  if (!bodyNode) return { title: "", text: "", isRTL: false };

  const paragraphs = [];

  // Walk through the immediate children of w:body to preserve table column flow
  const bodyChildren = bodyNode.childNodes;
  for (let i = 0; i < bodyChildren.length; i++) {
    const child = bodyChildren[i];
    const nodeNameClean = child.nodeName.split(":").pop();

    // Normal paragraph (w:p)
    if (nodeNameClean === "p") {
      const text = await extractParagraphContent(child);
      paragraphs.push(text);
    }
    // Table element (w:tbl)
    else if (nodeNameClean === "tbl") {
      const col1 = [];
      const col2 = [];

      const rows = child.getElementsByTagNameNS("*", "tr");
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const cells = row.getElementsByTagNameNS("*", "tc");
        if (cells.length >= 1) {
          const pNodes = cells[0].getElementsByTagNameNS("*", "p");
          for (let p = 0; p < pNodes.length; p++) {
            col1.push(await extractParagraphContent(pNodes[p]));
          }
        }
        if (cells.length >= 2) {
          const pNodes = cells[1].getElementsByTagNameNS("*", "p");
          for (let p = 0; p < pNodes.length; p++) {
            col2.push(await extractParagraphContent(pNodes[p]));
          }
        }
      }

      paragraphs.push(...col1);
      paragraphs.push(...col2);
    }
  }

  // Format the output document text
  const cleanLyrics = paragraphs.join("\n");

  // Title extraction (Clean filename)
  const filename = file.name;
  let title = filename.replace(/\.docx$/i, "");
  title = title.replace(/^\d+[\s\-_]*/, ""); // strip numbers like "01 - "
  title = title.replace(/[_\-]/g, " "); // replace dashes with spaces
  title = title.replace(/\s+/g, " ").trim(); // normalize spacing

  // Detect Hebrew (RTL)
  const hasHebrew = /[\u0590-\u05FF]/.test(cleanLyrics) || /[\u0590-\u05FF]/.test(title);

  return { title, text: cleanLyrics, isRTL: hasHebrew };
}

// ==========================================
// METRONOME FEATURE HELPER & LOGIC FUNCTIONS
// ==========================================

let metroAudioCtx = null;
function playTick(isDownbeat = false) {
  if (!metroAudioCtx) {
    metroAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (metroAudioCtx.state === 'suspended') {
    metroAudioCtx.resume();
  }

  const time = metroAudioCtx.currentTime;

  if (isDownbeat) {
    // Foot Drum (Kick Drum) on the downbeat/new bar
    const osc = metroAudioCtx.createOscillator();
    const gain = metroAudioCtx.createGain();

    osc.connect(gain);
    gain.connect(metroAudioCtx.destination);

    osc.type = 'triangle';
    // Rapid frequency sweep from 150Hz down to 30Hz for the kick sound
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.15);

    // Quick volume decay over 180ms
    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    osc.start(time);
    osc.stop(time + 0.18);
  } else {
    // Closed Hi-Hat on other beats
    const bufferSize = metroAudioCtx.sampleRate * 0.05; // 50ms buffer
    const buffer = metroAudioCtx.createBuffer(1, bufferSize, metroAudioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    // Generate white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = metroAudioCtx.createBufferSource();
    noise.buffer = buffer;

    // High-pass filter at 7kHz to mimic hi-hat metallic sizzle
    const filter = metroAudioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, time);

    const gain = metroAudioCtx.createGain();
    // Rapid exponential decay over 40ms
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(metroAudioCtx.destination);

    noise.start(time);
    noise.stop(time + 0.04);
  }
}

function updateMetronomeTimer() {
  // Clear any existing timer
  if (state.metroIntervalId) {
    clearInterval(state.metroIntervalId);
    state.metroIntervalId = null;
  }

  // Turn off LED flash
  if (el.metroLed) {
    el.metroLed.style.backgroundColor = 'var(--text-secondary)';
    el.metroLed.style.boxShadow = 'none';
  }

  // We only tick if metronome mode is not 'off'
  if (state.metroMode !== 'off') {
    const intervalMs = (60 / state.metroBpm) * 1000;
    state.metroBeatCounter = 0;

    // Trigger first beat immediately
    triggerMetroBeat();

    state.metroIntervalId = setInterval(() => {
      triggerMetroBeat();
    }, intervalMs);
  }
}

function triggerMetroBeat() {
  const beats = parseInt(state.metroBeats) || 4;
  const isDownbeat = (state.metroBeatCounter % beats) === 0;

  // 1. Audio tick
  if (state.metroMode === 'audio') {
    try {
      playTick(isDownbeat);
    } catch (e) {
      console.warn("AudioContext error:", e);
    }
  }

  // 2. Visual flash
  if (el.metroLed) {
    const flashColor = isDownbeat ? '#22c55e' : '#eab308';
    el.metroLed.style.backgroundColor = flashColor;
    el.metroLed.style.boxShadow = `0 0 8px ${flashColor}`;

    // Turn off after 100ms
    setTimeout(() => {
      if (state.metroIntervalId) {
        el.metroLed.style.backgroundColor = 'var(--text-secondary)';
        el.metroLed.style.boxShadow = 'none';
      }
    }, 100);
  }

  state.metroBeatCounter++;
}

function changeBpm(delta) {
  const newBpm = Math.max(40, Math.min(250, state.metroBpm + delta));
  if (newBpm !== state.metroBpm) {
    state.metroBpm = newBpm;
    if (el.metroBpmVal) {
      el.metroBpmVal.textContent = newBpm;
    }

    // Save to current song
    const song = state.songs.find(s => s.id === state.currentSongId);
    if (song) {
      song.bpm = newBpm;
      if (db) {
        dbPutSong(db, song).catch(e => console.error("Error saving song BPM:", e));
      }
    }

    // Restart metronome timer with new BPM if it's currently running
    if (state.metroIntervalId) {
      updateMetronomeTimer();
    }
  }
}

// Font Size Helpers
function updateFontSizeUI() {
  el.fontSizeVal.textContent = `${state.fontSize.toFixed(1)}x`;
  el.songDisplayArea.style.fontSize = `${state.fontSize}rem`;
  localStorage.setItem('fontSize', state.fontSize);
}

// Transpose Helpers
function updateTransposeUI() {
  const sign = state.transposeOffset > 0 ? '+' : '';
  el.transposeVal.textContent = `${sign}${state.transposeOffset}`;
  renderActiveSong();
  saveSetlistTransposeOffset();
}

// Sidebar Render
function renderSongList() {
  el.songList.innerHTML = '';

  if (state.filteredSongs.length === 0) {
    el.songList.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">No songs found.</div>';
    return;
  }

  state.filteredSongs.forEach(song => {
    const item = document.createElement('div');
    item.className = `song-item ${song.id === state.currentSongId ? 'active' : ''}`;

    // Create label tag for Language/RTL
    const langTag = song.isRTL ? '<span style="font-size: 0.7rem; background: var(--border-color); padding: 1px 4px; border-radius: 4px; color: var(--text-secondary);">עב</span>' : '';
    const keyLabel = song.key ? `<span style="font-family: 'Roboto Mono', monospace; font-weight: bold;">${song.key}</span>` : '';

    item.innerHTML = `
      <span class="song-title">${escapeHTML(song.title)}</span>
      <div class="song-details">
        <span>${escapeHTML(song.artist)}</span>
        <div style="display: flex; gap: 0.4rem; align-items: center;">
          ${langTag}
          ${keyLabel}
        </div>
      </div>
    `;

    item.addEventListener('click', () => {
      state.currentSongId = song.id;
      localStorage.setItem('lastViewedSongId', song.id);

      // Reset transpose on song change
      state.transposeOffset = 0;
      el.transposeVal.textContent = '0';

      // Clear active setlist song context
      state.activeSetlistSongIndex = null;

      // Stop scroll on song change
      if (state.isScrolling) {
        toggleAutoScroll();
      }

      renderSongList();
      renderActiveSong();

      // Hide mobile sidebar
      el.sidebar.classList.remove('active');

      // Scroll song view back to top
      el.songViewport.scrollTop = 0;
    });

    el.songList.appendChild(item);
  });
}

// Active Song Renderer
function renderActiveSong() {
  el.songDisplayArea.innerHTML = '';

  if (!state.currentSongId) {
    el.songDisplayArea.innerHTML = `
      <div class="empty-state">
        <h2>No Song Selected</h2>
        <p>Choose a song from the library or add a new one to begin.</p>
      </div>
    `;
    return;
  }

  let song = state.songs.find(s => s.id === state.currentSongId);
  if (!song) return;

  const activeSetlist = state.setlists.find(s => s.id === state.activeSetlistId);
  
  // Merge setlist overrides if viewing within active setlist context
  if (activeSetlist && state.activeSetlistSongIndex !== null) {
    const setlistSongItem = activeSetlist.songs[state.activeSetlistSongIndex];
    if (setlistSongItem) {
      song = {
        ...song,
        title: setlistSongItem.title !== undefined ? setlistSongItem.title : song.title,
        artist: setlistSongItem.artist !== undefined ? setlistSongItem.artist : song.artist,
        key: setlistSongItem.key !== undefined ? setlistSongItem.key : song.key,
        isRTL: setlistSongItem.isRTL !== undefined ? setlistSongItem.isRTL : song.isRTL,
        rawText: setlistSongItem.rawText !== undefined ? setlistSongItem.rawText : song.rawText,
        remarks: setlistSongItem.remarks || ''
      };
    }
  }

  // Load BPM for current song
  if (song.bpm) {
    state.metroBpm = song.bpm;
  } else {
    state.metroBpm = 120; // default
  }
  if (el.metroBpmVal) {
    el.metroBpmVal.textContent = state.metroBpm;
  }

  // Restart metronome timer if running
  if (state.metroIntervalId) {
    updateMetronomeTimer();
  }

  // Build Song Display Container
  const container = document.createElement('div');
  container.className = `song-container ${song.isRTL ? 'rtl' : ''}`;

  // Floating Setlist Gig Navigation Bar
  if (activeSetlist && state.activeSetlistSongIndex !== null) {
    const navBar = document.createElement('div');
    navBar.className = 'setlist-gig-nav';

    const prevDisabled = state.activeSetlistSongIndex === 0 ? 'disabled' : '';
    const nextDisabled = state.activeSetlistSongIndex === activeSetlist.songs.length - 1 ? 'disabled' : '';

    navBar.innerHTML = `
      <button class="btn gig-nav-btn" id="gig-prev-btn" ${prevDisabled}>← Prev</button>
      <div class="gig-nav-info">
        <span class="gig-setlist-name">${escapeHTML(activeSetlist.name)}</span>
        <span class="gig-song-counter">Song ${state.activeSetlistSongIndex + 1} of ${activeSetlist.songs.length}</span>
      </div>
      <button class="btn gig-nav-btn" id="gig-next-btn" ${nextDisabled}>Next →</button>
    `;

    container.appendChild(navBar);

    navBar.querySelector('#gig-prev-btn').addEventListener('click', () => {
      if (state.activeSetlistSongIndex > 0) {
        navigateToSetlistSong(state.activeSetlistSongIndex - 1);
      }
    });

    navBar.querySelector('#gig-next-btn').addEventListener('click', () => {
      if (state.activeSetlistSongIndex < activeSetlist.songs.length - 1) {
        navigateToSetlistSong(state.activeSetlistSongIndex + 1);
      }
    });
  }

  // Header details
  const headerHtml = `
    <div class="song-header">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h1 id="song-title-heading">${escapeHTML(song.title)}</h1>
          <div class="artist">${escapeHTML(song.artist)}</div>
        </div>
        <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
          ${song.key ? `<button class="btn" style="flex: none; font-size: 0.8rem; padding: 4px 10px; font-weight: bold; background: var(--bg-secondary);">Orig: ${song.key}</button>` : ''}
          <button class="btn" id="edit-active-btn" style="flex: none; font-size: 0.8rem; padding: 4px 10px;">Edit</button>
        </div>
      </div>
      ${song.remarks ? `
        <div class="song-remarks-box" style="margin-top: 1rem; padding: 0.6rem 1rem; background-color: var(--accent-light); border-left: 4px solid var(--accent-color); border-radius: 4px; font-size: 0.9rem; font-style: italic; color: var(--text-primary); text-align: left;">
          <strong>Note:</strong> ${escapeHTML(song.remarks)}
        </div>
      ` : ''}
    </div>
  `;
  const headerDiv = document.createElement('div');
  headerDiv.innerHTML = headerHtml;
  container.appendChild(headerDiv);

  // Build parsed lyrics and chords
  const blocks = window.SongParser.parseSongText(song.rawText);
  const body = document.createElement('div');
  body.className = 'song-body';

  blocks.forEach(block => {
    if (block.type === 'header') {
      const h = document.createElement('div');
      h.className = 'song-section-header';
      h.textContent = block.text;
      body.appendChild(h);
    } else if (block.type === 'image') {
      const imgDiv = document.createElement('div');
      imgDiv.className = 'song-image-container';

      const img = document.createElement('img');
      img.src = block.src;
      img.className = 'song-image';
      img.alt = 'Scan Note';

      imgDiv.appendChild(img);
      body.appendChild(imgDiv);
    } else if (block.type === 'paragraph') {
      const p = document.createElement('div');
      p.className = 'song-paragraph';

      block.lines.forEach(line => {
        const lineDiv = document.createElement('div');

        if (line.type === 'chord-lyric') {
          lineDiv.className = 'chord-lyric-line';
          let formattingState = { bold: false, highlight: false };
          line.segments.forEach(seg => {
            const segSpan = document.createElement('span');
            segSpan.className = 'chord-segment';

            if (seg.chords && seg.chords.length > 0) {
              let maxChordRightBound = 0;

              seg.chords.forEach(cObj => {
                const transposed = window.Transposer.transposeChord(cObj.chord, state.transposeOffset, state.preferFlats);
                const cleanDisplay = cleanChordNameForDisplay(transposed);

                const chordSpan = document.createElement('span');
                chordSpan.className = 'chord';
                chordSpan.setAttribute('data-chord', cleanDisplay);
                chordSpan.textContent = cleanDisplay;

                // Position chord relative to segment left boundary
                chordSpan.style.left = `${cObj.offset / 1000}em`;
                chordSpan.style.right = 'auto';

                segSpan.appendChild(chordSpan);

                // Calculate visual right-boundary of this chord in Roboto Mono units
                const chordWidth = cleanDisplay.length * 530;
                const rightBound = cObj.offset + chordWidth;
                if (rightBound > maxChordRightBound) {
                  maxChordRightBound = rightBound;
                }
              });

              const lyricWidth = [...seg.text].reduce((sum, c) => sum + window.SongParser.getCharWidth(c), 0);
              const overflow = maxChordRightBound - lyricWidth;
              if (overflow > 0) {
                // Pad the right side to prevent overlap with the adjacent segment to the right (visually)
                const overflowEm = overflow / 1000;
                segSpan.style.paddingRight = `${overflowEm}em`;
              }
            }

            const lyricSpan = document.createElement('span');
            lyricSpan.className = 'lyric-text';
            lyricSpan.innerHTML = formatSegmentText(seg.text, formattingState);
            segSpan.appendChild(lyricSpan);

            lineDiv.appendChild(segSpan);
          });
        } else if (line.type === 'chord-only') {
          lineDiv.className = 'chord-only-line';
          const rawLine = (line.rawLine || '').trimEnd();
          const chords = window.SongParser.extractChords(rawLine);

          if (chords.length === 0) {
            lineDiv.textContent = rawLine;
          } else {
            let htmlResult = '';
            let lastIdx = 0;

            chords.forEach(chord => {
              const startIdx = chord.index;
              // Append text/spaces before this chord
              htmlResult += escapeHTML(rawLine.substring(lastIdx, startIdx));

              // Transpose and clean
              const transposed = window.Transposer.transposeChord(chord.text, state.transposeOffset, state.preferFlats);
              const cleanDisplay = cleanChordNameForDisplay(transposed);

              // Render chord in-flow
              htmlResult += `<span class="chord" data-chord="${cleanDisplay}">${cleanDisplay}</span>`;
              lastIdx = startIdx + chord.text.length;
            });

            // Append trailing characters
            htmlResult += escapeHTML(rawLine.substring(lastIdx));
            lineDiv.innerHTML = htmlResult;
          }
        } else {
          // Plain lyrics
          lineDiv.className = 'lyric-only-line';
          lineDiv.innerHTML = formatLyricText(line.text);
        }

        p.appendChild(lineDiv);
      });

      body.appendChild(p);
    }
  });

  container.appendChild(body);
  el.songDisplayArea.appendChild(container);

  // Re-bind click handler on the newly rendered edit button
  document.getElementById('edit-active-btn').addEventListener('click', () => {
    openSongModal(song);
  });
}

// Auto-Scroll Loop
function toggleAutoScroll() {
  state.isScrolling = !state.isScrolling;

  if (state.isScrolling) {
    el.scrollToggleBtn.textContent = 'Pause';
    el.scrollToggleBtn.classList.add('active');
    lastScrollTime = performance.now();
    scrollAnimationId = requestAnimationFrame(autoScrollStep);
    showToast("Auto-scroll started.");
  } else {
    el.scrollToggleBtn.textContent = 'Play';
    el.scrollToggleBtn.classList.remove('active');
    if (scrollAnimationId) {
      cancelAnimationFrame(scrollAnimationId);
      scrollAnimationId = null;
    }
    showToast("Auto-scroll paused.");
  }
}

function getRowHeight() {
  if (!el.songDisplayArea) return 32;
  const sampleLine = el.songDisplayArea.querySelector('.chord-lyric-line, .chord-only-line, .lyric-only-line');
  if (sampleLine) {
    const height = sampleLine.offsetHeight;
    if (height > 0) return height;
  }
  const baseSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return 1.8 * baseSize * state.fontSize;
}

function autoScrollStep(timestamp) {
  if (!state.isScrolling) return;

  let elapsed = timestamp - lastScrollTime;
  // Cap elapsed time to 50ms to prevent speed jumps during lag spikes or tab switching
  if (elapsed > 50) {
    elapsed = 50;
  }

  // 5 levels: 1 = min (1 row in 1.0 sec), 5 = max (1 row in 0.5 sec)
  const clampedSpeed = Math.max(1, Math.min(5, state.scrollSpeed));
  const T = 1.0 - (clampedSpeed - 1) * 0.025; // 1->1.0s, 2->0.875s, 3->0.75s, 4->0.625s, 5->0.5s
  const speedRatio = getRowHeight() / (T * 1000);
  const scrollDelta = elapsed * speedRatio;

  if (scrollDelta > 0) {
    el.songViewport.scrollTop += scrollDelta;
    lastScrollTime = timestamp;

    // Check if we hit the bottom of the viewport
    const maxScrollTop = el.songViewport.scrollHeight - el.songViewport.clientHeight;
    if (el.songViewport.scrollTop >= maxScrollTop - 2) {
      toggleAutoScroll(); // stop at bottom
      return;
    }
  }

  scrollAnimationId = requestAnimationFrame(autoScrollStep);
}

// Wake Lock API
async function toggleWakeLock() {
  if (!('wakeLock' in navigator)) {
    showToast("Screen Wake Lock not supported on this browser.");
    return;
  }

  if (state.wakeLock) {
    // Release active wake lock
    try {
      await state.wakeLock.release();
      state.wakeLock = null;
      el.wakelockIndicator.style.display = 'none';
      showToast("Wake Lock released.");
    } catch (e) {
      console.error(e);
    }
  } else {
    // Request new wake lock
    try {
      state.wakeLock = await navigator.wakeLock.request('screen');
      el.wakelockIndicator.style.display = 'inline-block';
      showToast("Screen Lock active. Screen will stay on.");

      // Handle automatic release on minimize/tab swap
      state.wakeLock.addEventListener('release', () => {
        state.wakeLock = null;
        el.wakelockIndicator.style.display = 'none';
      });
    } catch (e) {
      console.error(e);
      showToast("Failed to lock screen wake.");
    }
  }
}

// Chord Tooltip Hover Handlers
function handleChordTooltipOpen(e) {
  if (!e.target.classList.contains('chord')) return;

  const chordName = e.target.getAttribute('data-chord');
  state.activeTooltipChord = chordName;
  state.hoveredChordElement = e.target;

  // Render SVG diagram
  const svgHtml = window.ChordDB.renderChordDiagram(chordName, state.instrument);
  el.chordTooltip.innerHTML = svgHtml;
  el.chordTooltip.classList.add('active');

  // Position above the chord element
  positionTooltip(e.target);
}

function handleChordTooltipClose(e) {
  if (!e.target.classList.contains('chord')) return;

  state.hoveredChordElement = null;

  // Clear only if it is not pinned/tapped
  if (!state.pinnedChordElement) {
    el.chordTooltip.classList.remove('active');
    state.activeTooltipChord = null;
  }
}

// Mobile/Click Tap to Pin Tooltip
state.pinnedChordElement = null;

function handleChordTooltipTap(e) {
  // If clicked a chord
  if (e.target.classList.contains('chord')) {
    e.stopPropagation(); // prevent closing immediately

    // If it's already pinned, and we clicked it again, unpin it
    if (state.pinnedChordElement === e.target) {
      el.chordTooltip.classList.remove('active');
      state.pinnedChordElement = null;
      state.activeTooltipChord = null;
    } else {
      // Pin new chord element
      state.pinnedChordElement = e.target;
      const chordName = e.target.getAttribute('data-chord');

      const svgHtml = window.ChordDB.renderChordDiagram(chordName, state.instrument);
      el.chordTooltip.innerHTML = svgHtml;
      el.chordTooltip.classList.add('active');
      positionTooltip(e.target);
    }
    return;
  }

  // Clicked elsewhere - dismiss pinned tooltips
  if (state.pinnedChordElement) {
    el.chordTooltip.classList.remove('active');
    state.pinnedChordElement = null;
    state.activeTooltipChord = null;
  }
}

function positionTooltip(targetEl) {
  const rect = targetEl.getBoundingClientRect();
  const tooltipRect = el.chordTooltip.getBoundingClientRect();

  // Position above chord
  let top = rect.top - 5;
  let left = rect.left + rect.width / 2;

  // Bound checks
  if (top - tooltipRect.height < 0) {
    // If it goes off-screen top, show below chord
    top = rect.bottom + tooltipRect.height + 5;
    el.chordTooltip.style.transform = 'translate(-50%, -100%)';
  } else {
    el.chordTooltip.style.transform = 'translate(-50%, -105%)';
  }

  // Boundary check on sides
  if (left - tooltipRect.width / 2 < 10) {
    left = tooltipRect.width / 2 + 10;
  } else if (left + tooltipRect.width / 2 > window.innerWidth - 10) {
    left = window.innerWidth - tooltipRect.width / 2 - 10;
  }

  el.chordTooltip.style.top = `${top}px`;
  el.chordTooltip.style.left = `${left}px`;
}

// Modal open/close actions
function openSongModal(song = null) {
  // Clear fields
  el.editSongId.value = '';
  el.formTitle.value = '';
  el.formArtist.value = '';
  el.formKey.value = '';
  el.formRtl.checked = false;
  el.formText.value = '';
  if (el.formRemarks) el.formRemarks.value = '';

  if (el.formImportFile) el.formImportFile.value = '';
  if (el.importStatus) el.importStatus.textContent = '';

  const isSetlistEdit = !!(state.activeSetlistId && state.activeSetlistSongIndex !== null);
  if (el.remarksGroup) {
    el.remarksGroup.style.display = isSetlistEdit ? 'block' : 'none';
  }

  if (song) {
    // Editing mode
    el.modalTitle.textContent = isSetlistEdit ? "Edit Song in Setlist" : "Edit Song";
    el.editSongId.value = song.id;
    el.formTitle.value = song.title;
    el.formArtist.value = song.artist === 'Unknown Artist' ? '' : song.artist;
    el.formKey.value = song.key || '';
    el.formRtl.checked = song.isRTL;
    el.formText.value = song.rawText;
    if (el.formRemarks) {
      el.formRemarks.value = song.remarks || '';
    }
    el.deleteSongBtn.style.display = isSetlistEdit ? 'none' : 'block';
    if (el.importDocxGroup) el.importDocxGroup.style.display = 'none';
  } else {
    // New song mode
    el.modalTitle.textContent = "Add New Song";
    el.deleteSongBtn.style.display = 'none';
    if (el.importDocxGroup) el.importDocxGroup.style.display = 'block';
  }

  updateFormTextDirection();

  el.songModal.classList.add('active');
  el.formTitle.focus();
}

function closeSongModal() {
  el.songModal.classList.remove('active');
}

function updateFormTextDirection() {
  if (el.formRtl && el.formText) {
    el.formText.classList.toggle('rtl', el.formRtl.checked);
  }
}

// ==========================================
// SETLIST FEATURE HELPER & RENDER FUNCTIONS
// ==========================================

// Export single setlist to file
function exportSetlistToFile(setlist) {
  if (!setlist) {
    showToast("No setlist to export.");
    return;
  }

  const jsonContent = JSON.stringify(setlist, null, 2);
  const safeName = setlist.name.replace(/[^a-zA-Z0-9\u0590-\u05FF]/g, '_').toLowerCase();
  const filename = `setlist_${safeName}.json`;

  if (typeof AndroidApp !== 'undefined' && AndroidApp.shareTextFile) {
    AndroidApp.shareTextFile(filename, jsonContent);
    showToast("Export triggered via system share sheet.");
  } else {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonContent);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast(`Setlist "${setlist.name}" exported.`);
  }
}

function renderToolbarSetlistSelect() {
  if (!el.toolbarSetlistSelect) return;
  el.toolbarSetlistSelect.innerHTML = '<option value="">None</option>';
  state.setlists.forEach(setlist => {
    const opt = document.createElement('option');
    opt.value = setlist.id;
    opt.textContent = setlist.name;
    el.toolbarSetlistSelect.appendChild(opt);
  });
  if (state.activeSetlistId && state.setlists.some(s => s.id === state.activeSetlistId)) {
    el.toolbarSetlistSelect.value = state.activeSetlistId;
  } else {
    el.toolbarSetlistSelect.value = '';
  }
}

function renderSidebar() {
  if (el.toolbarSetlistSelect) {
    el.toolbarSetlistSelect.value = state.activeSetlistId || '';
  }
  if (state.activeTab === 'songs') {
    el.tabSongsBtn.classList.add('active');
    el.tabSetlistsBtn.classList.remove('active');

    el.searchContainer.style.display = 'block';
    el.songList.style.display = 'block';
    el.songsFooter.style.display = 'flex';

    el.setlistList.style.display = 'none';
    el.setlistEditor.style.display = 'none';
    el.setlistsFooter.style.display = 'none';
  } else {
    el.tabSongsBtn.classList.remove('active');
    el.tabSetlistsBtn.classList.add('active');

    el.searchContainer.style.display = 'none';
    el.songList.style.display = 'none';
    el.songsFooter.style.display = 'none';

    if (state.activeSetlistId) {
      el.setlistList.style.display = 'none';
      el.setlistsFooter.style.display = 'none';
      el.setlistEditor.style.display = 'flex';
      renderSetlistEditor();
    } else {
      el.setlistList.style.display = 'block';
      el.setlistsFooter.style.display = 'flex';
      el.setlistEditor.style.display = 'none';
      renderSetlistsList();
    }
  }
}

function renderSetlistsList() {
  el.setlistList.innerHTML = '';

  if (state.setlists.length === 0) {
    el.setlistList.innerHTML = `
      <div style="padding: 1.5rem; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">
        No setlists created yet. Click "Create Setlist" below to start!
      </div>
    `;
    return;
  }

  state.setlists.forEach(setlist => {
    const item = document.createElement('div');
    item.className = 'song-item';
    item.style.display = 'flex';
    item.style.flexDirection = 'row';
    item.style.alignItems = 'center';
    item.style.justifyContent = 'space-between';
    item.style.gap = '0.5rem';

    const count = setlist.songs.length;
    const countLabel = count === 1 ? '1 song' : `${count} songs`;

    item.innerHTML = `
      <div style="flex: 1; min-width: 0;">
        <span class="song-title" style="display: block; margin-bottom: 0.25rem;">${escapeHTML(setlist.name)}</span>
        <div class="song-details">
          <span>${countLabel}</span>
        </div>
      </div>
      <div style="display: flex; gap: 0.2rem; align-items: center; flex-shrink: 0;">
        <button class="export-setlist-btn" title="Export Setlist" style="color: var(--text-secondary); border: none; background: transparent; width: 28px; height: 28px; padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: color 0.2s, transform 0.15s ease; border-radius: 4px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
        <button class="remove-setlist-btn" title="Delete Setlist" style="color: #ef4444; border: none; background: transparent; font-size: 1.2rem; width: 28px; height: 28px; padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: color 0.2s, transform 0.15s ease; border-radius: 4px;">×</button>
      </div>
    `;

    item.addEventListener('click', () => {
      state.activeSetlistId = setlist.id;
      state.activeSetlistSongIndex = null;
      renderSidebar();
    });

    const exportBtn = item.querySelector('.export-setlist-btn');
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent opening the setlist editor
      exportSetlistToFile(setlist);
    });

    const deleteBtn = item.querySelector('.remove-setlist-btn');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); // prevent opening the setlist editor
      if (confirm(`Are you sure you want to delete the setlist "${setlist.name}" permanently?`)) {
        try {
          if (db) {
            await dbDeleteSetlist(db, setlist.id);
          }
          state.setlists = state.setlists.filter(s => s.id !== setlist.id);
          if (state.activeSetlistId === setlist.id) {
            state.activeSetlistId = null;
            state.activeSetlistSongIndex = null;
          }
          showToast("Setlist deleted.");
          renderToolbarSetlistSelect();
          renderSidebar();
          renderActiveSong();
        } catch (err) {
          console.error(err);
          showToast("Failed to delete setlist.");
        }
      }
    });

    el.setlistList.appendChild(item);
  });
}

function renderSetlistEditor() {
  const setlist = state.setlists.find(s => s.id === state.activeSetlistId);
  if (!setlist) return;

  el.setlistNameInput.value = setlist.name;

  // Populate songs dropdown
  el.setlistAddSongSelect.innerHTML = '<option value="">+ Add Song to Setlist...</option>';
  state.songs.forEach(song => {
    const opt = document.createElement('option');
    opt.value = song.id;
    opt.textContent = `${song.title} (${song.artist})`;
    el.setlistAddSongSelect.appendChild(opt);
  });

  // Render songs inside setlist
  el.setlistSongsContainer.innerHTML = '';

  if (setlist.songs.length === 0) {
    el.setlistSongsContainer.innerHTML = `
      <div style="padding: 1.5rem; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">
        No songs in this setlist yet. Select a song above to add it!
      </div>
    `;
    return;
  }

  setlist.songs.forEach((item, index) => {
    const song = state.songs.find(s => s.id === item.songId);
    if (!song) return; // song might have been deleted from global songs

    // Merge overrides
    const mergedSong = {
      ...song,
      title: item.title !== undefined ? item.title : song.title,
      artist: item.artist !== undefined ? item.artist : song.artist,
      key: item.key !== undefined ? item.key : song.key,
      isRTL: item.isRTL !== undefined ? item.isRTL : song.isRTL,
      remarks: item.remarks || ''
    };

    const row = document.createElement('div');
    row.className = 'setlist-song-row';

    let displayKey = 'Orig';
    if (mergedSong.key) {
      const transposed = window.Transposer.transposeChord(mergedSong.key, item.transposeOffset || 0, state.preferFlats);
      displayKey = cleanChordNameForDisplay(transposed);
    }

    const isRtlStyle = mergedSong.isRTL ? 'dir="rtl" style="text-align: right;"' : '';

    const remarksBadge = mergedSong.remarks ? `
      <div style="font-size: 0.7rem; color: var(--accent-color); font-style: italic; margin-top: 0.15rem; display: flex; align-items: center; gap: 0.2rem;">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>${escapeHTML(mergedSong.remarks.length > 25 ? mergedSong.remarks.substring(0, 25) + '...' : mergedSong.remarks)}</span>
      </div>
    ` : '';

    row.innerHTML = `
      <div class="setlist-song-info" ${isRtlStyle}>
        <div class="setlist-song-title">${escapeHTML(mergedSong.title)}</div>
        <div class="setlist-song-artist">${escapeHTML(mergedSong.artist)}</div>
        ${remarksBadge}
      </div>
      <div class="setlist-song-controls">
        <span class="setlist-song-key-badge">${displayKey}</span>
        <button class="setlist-row-btn move-up-btn" title="Move Up" ${index === 0 ? 'disabled' : ''}>▲</button>
        <button class="setlist-row-btn move-down-btn" title="Move Down" ${index === setlist.songs.length - 1 ? 'disabled' : ''}>▼</button>
        <button class="setlist-row-btn remove-song-btn" title="Remove" style="color: #ef4444;">×</button>
      </div>
    `;

    row.querySelector('.setlist-song-info').addEventListener('click', () => {
      state.currentSongId = song.id;
      localStorage.setItem('lastViewedSongId', song.id);

      state.activeSetlistSongIndex = index;
      state.transposeOffset = item.transposeOffset || 0;
      el.transposeVal.textContent = (state.transposeOffset > 0 ? '+' : '') + state.transposeOffset;

      if (state.isScrolling) toggleAutoScroll();

      renderSongList();
      renderActiveSong();

      el.sidebar.classList.remove('active');
      el.songViewport.scrollTop = 0;
    });

    row.querySelector('.move-up-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (index > 0) {
        const temp = setlist.songs[index];
        setlist.songs[index] = setlist.songs[index - 1];
        setlist.songs[index - 1] = temp;

        try {
          if (db) await dbPutSetlist(db, setlist);
        } catch (err) { console.error(err); }

        if (state.activeSetlistId === setlist.id) {
          if (state.activeSetlistSongIndex === index) {
            state.activeSetlistSongIndex = index - 1;
          } else if (state.activeSetlistSongIndex === index - 1) {
            state.activeSetlistSongIndex = index;
          }
        }

        renderSetlistEditor();
        renderActiveSong();
      }
    });

    row.querySelector('.move-down-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (index < setlist.songs.length - 1) {
        const temp = setlist.songs[index];
        setlist.songs[index] = setlist.songs[index + 1];
        setlist.songs[index + 1] = temp;

        try {
          if (db) await dbPutSetlist(db, setlist);
        } catch (err) { console.error(err); }

        if (state.activeSetlistId === setlist.id) {
          if (state.activeSetlistSongIndex === index) {
            state.activeSetlistSongIndex = index + 1;
          } else if (state.activeSetlistSongIndex === index + 1) {
            state.activeSetlistSongIndex = index;
          }
        }

        renderSetlistEditor();
        renderActiveSong();
      }
    });

    row.querySelector('.remove-song-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      setlist.songs.splice(index, 1);

      try {
        if (db) await dbPutSetlist(db, setlist);
      } catch (err) { console.error(err); }

      if (state.activeSetlistId === setlist.id) {
        if (state.activeSetlistSongIndex === index) {
          state.activeSetlistSongIndex = null;
        } else if (state.activeSetlistSongIndex > index) {
          state.activeSetlistSongIndex--;
        }
      }

      renderSetlistEditor();
      renderActiveSong();
    });

    el.setlistSongsContainer.appendChild(row);
  });
}

function navigateToSetlistSong(index) {
  const setlist = state.setlists.find(s => s.id === state.activeSetlistId);
  if (!setlist || index < 0 || index >= setlist.songs.length) return;

  const item = setlist.songs[index];
  const song = state.songs.find(s => s.id === item.songId);
  if (!song) return;

  state.currentSongId = song.id;
  localStorage.setItem('lastViewedSongId', song.id);

  state.activeSetlistSongIndex = index;
  state.transposeOffset = item.transposeOffset || 0;
  el.transposeVal.textContent = (state.transposeOffset > 0 ? '+' : '') + state.transposeOffset;

  if (state.isScrolling) toggleAutoScroll();

  renderSongList();
  renderActiveSong();

  el.songViewport.scrollTop = 0;
}

async function saveSetlistTransposeOffset() {
  if (state.activeSetlistId && state.activeSetlistSongIndex !== null) {
    const setlist = state.setlists.find(s => s.id === state.activeSetlistId);
    if (setlist && setlist.songs[state.activeSetlistSongIndex]) {
      setlist.songs[state.activeSetlistSongIndex].transposeOffset = state.transposeOffset;
      try {
        if (db) {
          await dbPutSetlist(db, setlist);
        }
        renderSetlistEditor();
      } catch (err) {
        console.error("Failed to save setlist transpose offset:", err);
      }
    }
  }
}

function toggleFullscreen(enable) {
  state.isFullscreen = enable;
  const appContainer = document.querySelector('.app-container');
  if (enable) {
    appContainer.classList.add('fullscreen');
    if (el.restoreBtn) el.restoreBtn.style.display = 'flex';
  } else {
    appContainer.classList.remove('fullscreen');
    if (el.restoreBtn) el.restoreBtn.style.display = 'none';
  }
}

// Boot up
window.addEventListener('DOMContentLoaded', init);
