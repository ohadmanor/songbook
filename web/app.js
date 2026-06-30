/**
 * app.js
 * Main client-side logic for the ChordBook application.
 */

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDaEId8GIcA958I3EYRTomdfFDkTyXU-Co",
  authDomain: "songbookchordsandlyrics.firebaseapp.com",
  projectId: "songbookchordsandlyrics",
  storageBucket: "songbookchordsandlyrics.firebasestorage.app",
  messagingSenderId: "821402914518",
  appId: "1:821402914518:web:9344781fdb4d8d2a0dc377",
  measurementId: "G-ZF1D9MSS3H"
};

let dbFirestore = null;
if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
  dbFirestore = firebase.firestore();
  dbFirestore.enablePersistence().catch((err) => {
    console.warn("Firestore persistence error:", err);
  });
}

// Application State
let state = {
  currentUser: null,
  songs: [],
  filteredSongs: [],
  currentSongId: null,
  transposeOffset: 0,
  fontSize: 1.0,
  scrollSpeed: 5,
  isScrolling: false,
  scrollAccumulator: 0,
  lastSetScrollTop: 0,
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
  setlistSearchIndex: -1,
  setlistSearchSongs: [],

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
  fullscreenControls: document.getElementById('fullscreen-controls'),
  fullscreenScrollToggleBtn: document.getElementById('fullscreen-scroll-toggle-btn'),
  fullscreenScrollSpeedSlider: document.getElementById('fullscreen-scroll-speed-slider'),

  // Setlist feature elements
  tabSongsBtn: document.getElementById('tab-songs-btn'),
  tabSetlistsBtn: document.getElementById('tab-setlists-btn'),
  setlistList: document.getElementById('setlist-list'),
  setlistEditor: document.getElementById('setlist-editor'),
  setlistBackBtn: document.getElementById('setlist-back-btn'),
  setlistNameInput: document.getElementById('setlist-name-input'),
  setlistDeleteBtn: document.getElementById('setlist-delete-btn'),
  setlistAddSongSearch: document.getElementById('setlist-add-song-search'),
  setlistAddSongDropdown: document.getElementById('setlist-add-song-dropdown'),
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

  // Modal & Editor Elements
  newSongBtn: document.getElementById('new-song-btn'),
  songModal: document.getElementById('song-editor-view'),
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
  importDocxGroup: document.getElementById('import-docx-group'),
  formImportFile: document.getElementById('form-import-file'),
  importStatus: document.getElementById('import-status'),
  mainToolbar: document.getElementById('main-toolbar'),
  editorBackBtn: document.getElementById('editor-back-btn'),
  editorPreviewToggleBtn: document.getElementById('editor-preview-toggle-btn'),
  editorFormatChordsBtn: document.getElementById('editor-format-chords-btn'),
  editorPreviewDisplay: document.getElementById('editor-preview-display'),
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
  restoreChangelogDetails: document.getElementById('restore-changelog-details'),
  mobileSettingsBtn: document.getElementById('mobile-settings-btn'),
  closeSettingsBtn: document.getElementById('close-settings-btn'),
  toolbarActions: document.getElementById('toolbar-actions'),
  bottomSheetBackdrop: document.getElementById('bottom-sheet-backdrop'),
  dashboardNewSetlistBtn: document.getElementById('dashboard-new-setlist-btn'),
  dashboardImportSetlistBtn: document.getElementById('dashboard-import-setlist-btn')
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

async function dbPutSetlist(dbInstance, setlist) {
  if (state.currentUser && !state.currentUser.isAnonymous && typeof dbFirestore !== 'undefined' && dbFirestore) {
    if (setlist.ownerId === undefined) setlist.ownerId = state.currentUser.uid;
    if (setlist.isShared === undefined) setlist.isShared = setlistShareCheckbox ? setlistShareCheckbox.checked : false;
    await dbFirestore.collection('setlists').doc(setlist.id).set(setlist);
  } else {
    return new Promise((resolve, reject) => {
      if (!dbInstance) { resolve(); return; }
      const transaction = dbInstance.transaction(SETLIST_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SETLIST_STORE_NAME);
      const request = store.put(setlist);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

async function dbDeleteSetlist(dbInstance, id) {
  if (state.currentUser && !state.currentUser.isAnonymous && typeof dbFirestore !== 'undefined' && dbFirestore) {
    await dbFirestore.collection('setlists').doc(id).delete();
  } else {
    return new Promise((resolve, reject) => {
      if (!dbInstance) { resolve(); return; }
      const transaction = dbInstance.transaction(SETLIST_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SETLIST_STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
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
    .replace(/&lt;mark&gt;([\s\S]*?)&lt;\/mark&gt;/g, '<mark class="song-highlight">$1</mark>')
    // Convert green highlight (%%text%%) and html green highlight (<mark class="song-highlight-green">text</mark>)
    .replace(/%%([\s\S]*?)%%/g, '<mark class="song-highlight-green">$1</mark>')
    .replace(/&lt;mark class=&quot;song-highlight-green&quot;&gt;([\s\S]*?)&lt;\/mark&gt;/g, '<mark class="song-highlight-green">$1</mark>');
  
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
  if (state.highlightGreen) {
    resultHtml += '<mark class="song-highlight-green">';
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
    } else if (text.substring(i, i + 2) === '%%') {
      state.highlightGreen = !state.highlightGreen;
      resultHtml += state.highlightGreen ? '<mark class="song-highlight-green">' : '</mark>';
      i += 2;
    } else {
      resultHtml += escapeHTML(text[i]);
      i++;
    }
  }
  
  // Close active formatting tags at the end of the segment to keep HTML valid
  if (state.highlightGreen) {
    resultHtml += '</mark>';
  }
  if (state.highlight) {
    resultHtml += '</mark>';
  }
  if (state.bold) {
    resultHtml += '</strong>';
  }
  
  return resultHtml;
}

// Clean chord names ending with o or O to display as 'dim'
function cleanChordNameForDisplay(chordStr) {
  if (!chordStr) return '';

  const cleanSingle = (str) => {
    const trimmed = str.trim();
    if (trimmed.endsWith('o') || trimmed.endsWith('O')) {
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

// DOM elements for Auth
const authContainer = document.querySelector('.auth-container');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');
const userName = document.getElementById('user-name');
const userAvatar = document.getElementById('user-avatar');
const shareSongGroup = document.getElementById('share-song-group');
const formShare = document.getElementById('form-share');
const shareSetlistGroup = document.getElementById('share-setlist-group');
const setlistShareCheckbox = document.getElementById('setlist-share-checkbox');

// Initialize Application
async function init() {
  loadSettings();
  
  try {
    db = await initDB();
  } catch (error) {
    console.error("Local IndexedDB failed:", error);
    db = null;
  }

  // Load default local songs first so the app is immediately usable offline/local
  let defaultSongs = window.defaultSongs || [];
  let deletedSongIds = [];
  try {
    deletedSongIds = JSON.parse(localStorage.getItem('deletedSongIds') || '[]');
  } catch (e) {}
  defaultSongs = defaultSongs.filter(s => !deletedSongIds.includes(s.id));
  state.songs = [...defaultSongs];

  if (db) {
    try {
      const localSongs = await dbGetAllSongs(db);
      if (localSongs && localSongs.length > 0) {
        const merged = new Map();
        state.songs.forEach(s => merged.set(s.id, s));
        localSongs.forEach(s => merged.set(s.id, s));
        state.songs = Array.from(merged.values());
      }
    } catch (error) {
      console.error("Error loading local IndexedDB songs:", error);
    }
  }

  state.filteredSongs = [...state.songs];
  sortSongs();
  if (state.songs.length > 0) {
    const lastViewedId = localStorage.getItem('lastViewedSongId');
    const exists = state.songs.some(s => s.id === lastViewedId);
    state.currentSongId = exists ? lastViewedId : state.songs[0].id;
  }

  bindEvents(db);
  renderSidebar();
  renderSongList();
  renderActiveSong();

  if (typeof firebase !== 'undefined') {
    try {
      firebase.auth().onAuthStateChanged((user) => {
        if (user) {
          state.currentUser = user;
          if (!user.isAnonymous) {
            userInfo.style.display = 'flex';
            userName.textContent = user.displayName || 'User';
            userAvatar.src = user.photoURL || '';
            loginBtn.style.display = 'none';
            logoutBtn.style.display = 'none'; // hide text button
            if (el.newSongBtn) el.newSongBtn.style.display = 'block';
            if (el.newSetlistBtn) el.newSetlistBtn.style.display = 'block';
            if (el.dashboardNewSetlistBtn) el.dashboardNewSetlistBtn.style.display = 'flex';
            if (el.dashboardImportSetlistBtn) el.dashboardImportSetlistBtn.style.display = 'flex';
            if (el.exportDbBtn) el.exportDbBtn.style.display = '';
            if (el.restoreBackupBtn) el.restoreBackupBtn.style.display = '';
          } else {
            // Guest
            userInfo.style.display = 'none';
            loginBtn.style.display = 'flex';
            logoutBtn.style.display = 'none';
            if (el.newSongBtn) el.newSongBtn.style.display = 'none';
            if (el.newSetlistBtn) el.newSetlistBtn.style.display = 'none';
            if (el.dashboardNewSetlistBtn) el.dashboardNewSetlistBtn.style.display = 'none';
            if (el.dashboardImportSetlistBtn) el.dashboardImportSetlistBtn.style.display = 'none';
            if (el.exportDbBtn) el.exportDbBtn.style.display = 'none';
            if (el.restoreBackupBtn) el.restoreBackupBtn.style.display = 'none';
          }
          startRealtimeSync();
        } else {
          firebase.auth().signInAnonymously().catch((err) => {
            console.warn("Firebase anonymous sign-in failed (standard in local file:/// WebView environments):", err);
          });
        }
      });
    } catch (e) {
      console.warn("Firebase Auth error: ", e);
    }
  }

  // Bind auth events regardless of firebase being loaded, to support native App fallback
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      if (typeof AndroidApp !== 'undefined' && AndroidApp.startGoogleSignIn) {
        AndroidApp.startGoogleSignIn();
      } else if (typeof firebase !== 'undefined' && firebase.auth) {
        const provider = new firebase.auth.GoogleAuthProvider();
        firebase.auth().signInWithPopup(provider).catch(console.error);
      } else {
        alert("Authentication is currently unavailable.");
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().signOut();
      }
      if (typeof AndroidApp !== 'undefined' && AndroidApp.signOut) {
        AndroidApp.signOut();
      }
    });
  }

  if (userInfo) {
    userInfo.addEventListener('click', () => {
      if (confirm("Do you want to sign out?")) {
        if (typeof firebase !== 'undefined' && firebase.auth) {
          firebase.auth().signOut();
        }
        if (typeof AndroidApp !== 'undefined' && AndroidApp.signOut) {
          AndroidApp.signOut();
        }
      }
    });
  }

  // Expose global function for Android Native Google Sign-In
  window.handleNativeGoogleLogin = function(idToken) {
    if (typeof firebase !== 'undefined' && firebase.auth) {
      const credential = firebase.auth.GoogleAuthProvider.credential(idToken);
      firebase.auth().signInWithCredential(credential).catch(err => {
        console.error("Firebase Auth failed with native token:", err);
        if (typeof AndroidApp !== 'undefined' && AndroidApp.showToast) {
          AndroidApp.showToast("Login Failed: " + err.message);
        } else {
          alert("Login Failed: " + err.message);
        }
      });
    } else {
      if (typeof AndroidApp !== 'undefined' && AndroidApp.showToast) {
        AndroidApp.showToast("Login Failed: Firebase is not initialized");
      }
    }
  };

  // Handle mobile layout responsive node movement for settings bottom sheet
  const handleResponsiveLayout = () => {
    const mobileQuery = window.matchMedia('(max-width: 768px)');
    const toolbarActions = el.toolbarActions;
    const toolbar = document.querySelector('.toolbar');
    
    if (!toolbarActions || !toolbar) return;

    const moveLayout = (isMobile) => {
      if (isMobile) {
        if (toolbarActions.parentElement !== document.body) {
          document.body.appendChild(toolbarActions);
        }
      } else {
        if (toolbarActions.parentElement !== toolbar) {
          toolbar.appendChild(toolbarActions);
        }
      }
    };
    
    mobileQuery.addEventListener('change', (e) => moveLayout(e.matches));
    moveLayout(mobileQuery.matches);
  };
  handleResponsiveLayout();
}

let unsubscribeSongs = null;
let unsubscribeSetlists = null;

function startRealtimeSync() {
  if (!dbFirestore || !state.currentUser) return;
  const uid = state.currentUser.uid;

  if (unsubscribeSongs) unsubscribeSongs();
  unsubscribeSongs = dbFirestore.collection('songs').onSnapshot((snapshot) => {
    let songs = [];
    let deletedCloudSongIds = new Set();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.deleted) {
        deletedCloudSongIds.add(data.id);
      } else {
        songs.push(data);
      }
    });
    
    let defaultSongs = window.defaultSongs || [];
    let deletedSongIds = [];
    try {
      deletedSongIds = JSON.parse(localStorage.getItem('deletedSongIds') || '[]');
    } catch (e) {}
    defaultSongs = defaultSongs.filter(s => !deletedSongIds.includes(s.id) && !deletedCloudSongIds.has(s.id));

    const merged = new Map();
    defaultSongs.forEach(s => merged.set(s.id, s));
    songs.forEach(s => merged.set(s.id, s));
    
    state.songs = Array.from(merged.values());
    state.filteredSongs = [...state.songs];
    sortSongs();
    
    // If the current song no longer exists (e.g., deleted), reset it
    if (state.currentSongId && !state.songs.some(s => s.id === state.currentSongId)) {
      state.currentSongId = state.songs.length > 0 ? state.songs[0].id : null;
      if (state.currentSongId) {
        localStorage.setItem('lastViewedSongId', state.currentSongId);
      } else {
        localStorage.removeItem('lastViewedSongId');
      }
    } else if (!state.currentSongId && state.songs.length > 0) {
      const lastViewedId = localStorage.getItem('lastViewedSongId');
      const exists = state.songs.some(s => s.id === lastViewedId);
      state.currentSongId = exists ? lastViewedId : state.songs[0].id;
    }
    
    renderSongList();
    renderActiveSong();
  });

  if (unsubscribeSetlists) unsubscribeSetlists();
  
  if (state.currentUser.isAnonymous) {
    dbGetAllSetlists(db).then(setlists => {
      state.setlists = setlists || [];
      renderToolbarSetlistSelect();
      renderSidebar();
    });
  } else {
    unsubscribeSetlists = dbFirestore.collection('setlists').onSnapshot((snapshot) => {
      let setlists = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.isShared || data.ownerId === uid) {
          setlists.push(data);
        }
      });
      state.setlists = setlists;
      renderToolbarSetlistSelect();
      renderSidebar();
    });
  }
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
  if (el.enharmonicToggleBtn) el.enharmonicToggleBtn.textContent = savedPreferFlats ? 'b' : '#';

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

              // Close settings bottom sheet if open
              if (el.toolbarActions) {
                el.toolbarActions.classList.remove('active');
                el.bottomSheetBackdrop.classList.remove('active');
              }
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

  // Close search dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (el.toolbarSearchDropdown && !e.target.closest('.search-wrapper')) {
      el.toolbarSearchDropdown.style.display = 'none';
    }
    if (el.setlistAddSongDropdown && !e.target.closest('#setlist-add-song-search') && !e.target.closest('#setlist-add-song-dropdown')) {
      el.setlistAddSongDropdown.style.display = 'none';
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
  if (el.enharmonicToggleBtn) {
    el.enharmonicToggleBtn.addEventListener('click', () => {
      state.preferFlats = !state.preferFlats;
      el.enharmonicToggleBtn.textContent = state.preferFlats ? 'b' : '#';
      localStorage.setItem('preferFlats', state.preferFlats);
      renderActiveSong();
    });
  }

  // Auto Scroll Slider
  el.scrollSpeedSlider.addEventListener('input', (e) => {
    state.scrollSpeed = parseInt(e.target.value);
    if (el.fullscreenScrollSpeedSlider) {
      el.fullscreenScrollSpeedSlider.value = e.target.value;
    }
  });

  if (el.fullscreenScrollSpeedSlider) {
    el.fullscreenScrollSpeedSlider.addEventListener('input', (e) => {
      state.scrollSpeed = parseInt(e.target.value);
      if (el.scrollSpeedSlider) {
        el.scrollSpeedSlider.value = e.target.value;
      }
    });
  }

  // Auto Scroll Toggle
  el.scrollToggleBtn.addEventListener('click', () => {
    toggleAutoScroll();
  });

  if (el.fullscreenScrollToggleBtn) {
    el.fullscreenScrollToggleBtn.addEventListener('click', () => {
      toggleAutoScroll();
    });
  }

  // Synchronize scroll accumulator on manual user scroll to prevent scroll fighting
  el.songViewport.addEventListener('scroll', () => {
    if (state.isScrolling) {
      const currentScroll = el.songViewport.scrollTop;
      const diff = Math.abs(currentScroll - state.lastSetScrollTop);
      if (diff > 2) {
        state.scrollAccumulator = currentScroll;
      }
      state.lastSetScrollTop = currentScroll;
    }
  });

  // Wake Lock Button
  el.wakeLockBtn.addEventListener('click', () => {
    toggleWakeLock();
  });

  // Mobile Nav Buttons
  el.showSidebarBtn.addEventListener('click', () => el.sidebar.classList.add('active'));
  el.hideSidebarBtn.addEventListener('click', () => el.sidebar.classList.remove('active'));

  // Mobile Settings Drawer Event Listeners
  if (el.mobileSettingsBtn) {
    el.mobileSettingsBtn.addEventListener('click', () => {
      el.toolbarActions.classList.add('active');
      el.bottomSheetBackdrop.classList.add('active');
    });
  }
  if (el.closeSettingsBtn) {
    el.closeSettingsBtn.addEventListener('click', () => {
      el.toolbarActions.classList.remove('active');
      el.bottomSheetBackdrop.classList.remove('active');
    });
  }
  if (el.bottomSheetBackdrop) {
    el.bottomSheetBackdrop.addEventListener('click', () => {
      el.toolbarActions.classList.remove('active');
      el.bottomSheetBackdrop.classList.remove('active');
    });
  }

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
  if (el.closeModalBtn) el.closeModalBtn.addEventListener('click', () => closeSongModal());
  el.cancelModalBtn.addEventListener('click', () => closeSongModal());
  if (el.editorBackBtn) el.editorBackBtn.addEventListener('click', () => closeSongModal());

  const editorThemeToggleBtn = document.getElementById('editor-theme-toggle-btn');
  if (editorThemeToggleBtn) {
    editorThemeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const newTheme = (currentTheme === 'light') ? 'dark' : 'light';
      state.theme = newTheme;
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      if (el.themeSelect) el.themeSelect.value = newTheme;
      editorThemeToggleBtn.textContent = newTheme === 'light' ? 'light_mode' : 'dark_mode';
    });
  }

  const editorFullscreenToggleBtn = document.getElementById('editor-fullscreen-toggle-btn');
  if (editorFullscreenToggleBtn) {
    editorFullscreenToggleBtn.addEventListener('click', () => {
      toggleFullscreen(!state.isFullscreen);
    });
  }

  // Editor Preview and Formatting Event Bindings
  if (el.editorPreviewToggleBtn && el.editorPreviewDisplay && el.formText) {
    el.editorPreviewToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isPreview = el.editorPreviewDisplay.style.display !== 'none';
      if (isPreview) {
        // Switch back to edit mode
        el.editorPreviewDisplay.style.display = 'none';
        el.formText.style.display = 'block';
        const span = el.editorPreviewToggleBtn.querySelector('span');
        if (span) span.textContent = 'visibility';
        el.editorPreviewToggleBtn.title = 'Preview Mode';
      } else {
        // Switch to preview mode
        const rawText = el.formText.value || '';
        
        // Build image replacement map for the editor temporary image store
        const textWithFullImages = rawText.replace(/\[IMAGE:\s*(\d+)\]/g, (match, idxStr) => {
          const idx = parseInt(idxStr, 10) - 1;
          if (state.editorImages && state.editorImages[idx]) {
            return `[IMAGE: ${state.editorImages[idx]}]`;
          }
          return match;
        });

        // Resolve images option
        const rendered = buildSongBodyFromRawText(textWithFullImages, {
          isRTL: el.formRtl ? el.formRtl.checked : false
        });
        
        el.editorPreviewDisplay.innerHTML = '';
        el.editorPreviewDisplay.appendChild(rendered);
        
        // Hide editor textarea, show preview container
        el.formText.style.display = 'none';
        el.editorPreviewDisplay.style.display = 'block';
        const span = el.editorPreviewToggleBtn.querySelector('span');
        if (span) span.textContent = 'edit';
        el.editorPreviewToggleBtn.title = 'Edit Mode';
      }
    });
  }

  if (el.editorFormatChordsBtn && el.formText) {
    el.editorFormatChordsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const originalText = el.formText.value || '';
      const formatted = originalText.split('\n').map(line => line.trimEnd()).join('\n');
      el.formText.value = formatted;
      showToast("Chords formatted (trailing whitespace trimmed).");
      
      // If we are currently in preview mode, refresh the preview
      if (el.editorPreviewDisplay.style.display !== 'none') {
        const textWithFullImages = formatted.replace(/\[IMAGE:\s*(\d+)\]/g, (match, idxStr) => {
          const idx = parseInt(idxStr, 10) - 1;
          if (state.editorImages && state.editorImages[idx]) {
            return `[IMAGE: ${state.editorImages[idx]}]`;
          }
          return match;
        });
        const rendered = buildSongBodyFromRawText(textWithFullImages, {
          isRTL: el.formRtl ? el.formRtl.checked : false
        });
        el.editorPreviewDisplay.innerHTML = '';
        el.editorPreviewDisplay.appendChild(rendered);
      }
    });
  }

  // Dashboard shortcuts
  if (el.dashboardNewSetlistBtn) {
    el.dashboardNewSetlistBtn.addEventListener('click', () => {
      if (el.newSetlistBtn) el.newSetlistBtn.click();
    });
  }
  if (el.dashboardImportSetlistBtn) {
    el.dashboardImportSetlistBtn.addEventListener('click', () => {
      if (el.mainImportSetlistBtn) el.mainImportSetlistBtn.click();
    });
  }
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

  if (el.editorHighlightGreenBtn) {
    el.editorHighlightGreenBtn.addEventListener('click', (e) => {
      e.preventDefault();
      wrapTextSelection('%%', '%%');
    });
  }



  // Click on import button triggers file selection
  if (el.editorImportImageBtn && el.editorImageInput) {
    el.editorImportImageBtn.addEventListener('click', (e) => {
      e.preventDefault();
      el.editorImageInput.click();
    });

    // Handle selected file
    el.editorImageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        const img = new Image();
        img.onload = () => {
          const maxW = 1024;
          let w = img.width;
          let h = img.height;
          
          if (w > maxW) {
            h = Math.round((h * maxW) / w);
            w = maxW;
          }
          
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          
          // Compress to JPEG with 0.7 quality
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
          insertImageToken(compressedDataUrl);
          
          // Clear input value so same file can be re-imported if needed
          el.editorImageInput.value = '';
        };
        img.onerror = () => {
          showToast("Failed to load image file.");
          el.editorImageInput.value = '';
        };
        img.src = evt.target.result;
      };
      reader.onerror = () => {
        showToast("Failed to read image file.");
        el.editorImageInput.value = '';
      };
      reader.readAsDataURL(file);
    });
  }

  // Save Song Button
  el.saveSongBtn.addEventListener('click', async () => {
    const title = el.formTitle.value.trim();
    const artist = el.formArtist.value.trim() || 'Unknown Artist';
    const key = el.formKey.value.trim();
    const isRTL = el.formRtl.checked;
    const rawText = getRawTextFromEditor();

    if (!title || !rawText.trim()) {
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
    if (filename) song.filename = filename;

    if (state.currentUser && !state.currentUser.isAnonymous && typeof dbFirestore !== 'undefined' && dbFirestore) {
      song.ownerId = originalSong ? (originalSong.ownerId || state.currentUser.uid) : state.currentUser.uid;
      song.isShared = formShare ? formShare.checked : false;
      try {
        await dbFirestore.collection('songs').doc(id).set(song);
        showToast("Song saved to cloud.");
        closeSongModal();
      } catch (err) {
        console.error(err);
        showToast("Failed to save to cloud.");
      }
    } else {
      const isLocalOrDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:' || location.hostname === 'appassets.androidplatform.net';
      if (isLocalOrDev) {
        // Remove from deletedSongIds in localStorage (if it was there)
        let deletedSongIds = [];
        try {
          deletedSongIds = JSON.parse(localStorage.getItem('deletedSongIds') || '[]');
        } catch (e) {}
        if (deletedSongIds.includes(id)) {
          deletedSongIds = deletedSongIds.filter(x => x !== id);
          localStorage.setItem('deletedSongIds', JSON.stringify(deletedSongIds));
        }

        // Save to IndexedDB
        if (db) {
          try {
            await dbPutSong(db, song);
          } catch (e) {
            console.error("Failed to save to IndexedDB:", e);
          }
        }

        // If running on local dev server, call save-song API
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
          try {
            const response = await fetch('/api/save-song', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(song)
            });
            if (!response.ok) throw new Error("Server save failed");
            showToast("Song saved locally & synced with disk.");
          } catch (err) {
            console.error("Local sync save failed:", err);
            showToast("Song saved locally (disk sync failed).");
          }
        } else {
          showToast("Song saved locally.");
        }

        // Update local state and refresh UI immediately
        const idx = state.songs.findIndex(s => s.id === id);
        if (idx !== -1) {
          state.songs[idx] = song;
        } else {
          state.songs.push(song);
        }
        state.filteredSongs = [...state.songs];
        sortSongs();

        state.currentSongId = id;
        localStorage.setItem('lastViewedSongId', id);

        renderSidebar();
        renderSongList();
        renderActiveSong();
        closeSongModal();
      } else {
        showToast("Guests cannot save songs.");
      }
    }
  });

  // Delete Song Button
  el.deleteSongBtn.addEventListener('click', async () => {
    const id = el.editSongId.value;
    if (!id) return;

    if (confirm("Are you sure you want to delete this song permanently?")) {
      if (state.currentUser && !state.currentUser.isAnonymous && typeof dbFirestore !== 'undefined' && dbFirestore) {
        try {
          if (!id.startsWith('custom_')) {
            // It's a default song. Set tombstone in Firestore.
            await dbFirestore.collection('songs').doc(id).set({
              id,
              deleted: true,
              ownerId: state.currentUser.uid
            });
            
            // Also store in local deletedSongIds so we know it's deleted locally
            let deletedSongIds = [];
            try {
              deletedSongIds = JSON.parse(localStorage.getItem('deletedSongIds') || '[]');
            } catch (e) {}
            if (!deletedSongIds.includes(id)) {
              deletedSongIds.push(id);
              localStorage.setItem('deletedSongIds', JSON.stringify(deletedSongIds));
            }
          } else {
            // It's a custom song. Delete from Firestore.
            await dbFirestore.collection('songs').doc(id).delete();
          }

          // Also delete from IndexedDB in case it exists locally
          if (db) {
            try {
              await dbDeleteSong(db, id);
            } catch (e) {
              console.error("Failed to delete from IndexedDB:", e);
            }
          }

          showToast("Song deleted from cloud.");

          // Update local state and refresh UI immediately
          state.songs = state.songs.filter(s => s.id !== id);
          state.filteredSongs = state.filteredSongs.filter(s => s.id !== id);

          if (state.currentSongId === id) {
            state.currentSongId = state.songs.length > 0 ? state.songs[0].id : null;
            if (state.currentSongId) {
              localStorage.setItem('lastViewedSongId', state.currentSongId);
            } else {
              localStorage.removeItem('lastViewedSongId');
            }
          }

          renderSidebar();
          renderSongList();
          renderActiveSong();
          closeSongModal();
        } catch (err) {
          console.error(err);
          showToast("Failed to delete from cloud.");
        }
      } else {
        const isLocalOrDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:' || location.hostname === 'appassets.androidplatform.net';
        if (isLocalOrDev) {
          // If default song, add to deleted default list in localStorage
          if (!id.startsWith('custom_')) {
            let deletedSongIds = [];
            try {
              deletedSongIds = JSON.parse(localStorage.getItem('deletedSongIds') || '[]');
            } catch (e) {}
            if (!deletedSongIds.includes(id)) {
              deletedSongIds.push(id);
              localStorage.setItem('deletedSongIds', JSON.stringify(deletedSongIds));
            }
          }

          // Delete from IndexedDB
          if (db) {
            try {
              await dbDeleteSong(db, id);
            } catch (e) {
              console.error("Failed to delete from IndexedDB:", e);
            }
          }

          // If running on local dev server, call delete-song API
          if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            try {
              const response = await fetch('/api/delete-song', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
              });
              if (!response.ok) throw new Error("Server delete failed");
              showToast("Song deleted locally & synced with disk.");
            } catch (err) {
              console.error("Local sync delete failed:", err);
              showToast("Song deleted locally (disk sync failed).");
            }
          } else {
            showToast("Song deleted locally.");
          }

          // Update local state and refresh UI immediately
          state.songs = state.songs.filter(s => s.id !== id);
          state.filteredSongs = state.filteredSongs.filter(s => s.id !== id);

          if (state.currentSongId === id) {
            state.currentSongId = state.songs.length > 0 ? state.songs[0].id : null;
            if (state.currentSongId) {
              localStorage.setItem('lastViewedSongId', state.currentSongId);
            } else {
              localStorage.removeItem('lastViewedSongId');
            }
          }

          renderSidebar();
          renderSongList();
          renderActiveSong();
          closeSongModal();
        } else {
          showToast("Guests cannot delete songs.");
        }
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
            showToast("Database reverted successfully! Reloading...");
            setTimeout(() => {
              window.location.reload();
            }, 1500);
            return;
          }
        } catch (err) {
          console.log("Server undo unavailable. Attempting local memory undo.", err);
        }
        
        // Local memory undo fallback
        if (state.preRestoreSongs) {
          state.songs = [...state.preRestoreSongs];
          window.defaultSongs = [...state.preRestoreSongs];
          state.filteredSongs = [...state.songs];
          sortSongs();
          if (state.songs.length > 0) {
            state.currentSongId = state.songs[0].id;
            localStorage.setItem('lastViewedSongId', state.currentSongId);
          } else {
            state.currentSongId = null;
          }
          renderSongList();
          renderActiveSong();
          showToast("Database reverted locally! Triggering download...");
          triggerHTMLDownload(state.songs);
        } else {
          showToast("No pre-restore backup available in this session.");
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

      // Save pre-restore state for memory undo
      state.preRestoreSongs = [...state.songs];

      let serverSynced = false;
      try {
        showToast("Restoring selected database changes...");
        if (dbFirestore && state.currentUser && !state.currentUser.isAnonymous) {
          const batch = dbFirestore.batch();
          for (let i = 0; i < songsToRestore.length; i += 400) {
            const currentBatch = dbFirestore.batch();
            const chunk = songsToRestore.slice(i, i + 400);
            for (const s of chunk) {
              const docRef = dbFirestore.collection('songs').doc(s.id);
              s.ownerId = s.ownerId || state.currentUser.uid;
              currentBatch.set(docRef, s);
            }
            await currentBatch.commit();
          }
          
          serverSynced = true;
          localStorage.removeItem('deletedSongIds');
          showToast("Database restored to Cloud successfully! Reloading...");
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          const response = await fetch('/api/restore-backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songs: songsToRestore })
          });

          if (response.ok) {
            serverSynced = true;
            localStorage.removeItem('deletedSongIds');
            showToast("Database restored successfully! Reloading...");
            setTimeout(() => {
              window.location.reload();
            }, 1500);
          } else {
            const errText = await response.text();
            console.error("Restore failed:", errText);
            showToast("Failed to restore backup: " + errText);
          }
        }
      } catch (err) {
        console.error("Error during restore:", err);
        showToast("Restore encountered an error: " + err.message);
      }

      if (!serverSynced) {
        localStorage.removeItem('deletedSongIds');
        state.songs = songsToRestore;
        window.defaultSongs = [...songsToRestore];
        state.filteredSongs = [...songsToRestore];
        sortSongs();
        if (state.songs.length > 0) {
          state.currentSongId = state.songs[0].id;
          localStorage.setItem('lastViewedSongId', state.currentSongId);
        } else {
          state.currentSongId = null;
        }
        renderSongList();
        renderActiveSong();
        closeRestoreModal();
        showToast("Database restored! Download of updated HTML triggered.");
        triggerHTMLDownload(songsToRestore);
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

      // Close settings bottom sheet if open
      if (el.toolbarActions) {
        el.toolbarActions.classList.remove('active');
        el.bottomSheetBackdrop.classList.remove('active');
      }
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
    el.newSetlistBtn.addEventListener('click', () => {
      const modal = document.getElementById('new-setlist-modal');
      const shareGroup = document.getElementById('new-setlist-share-group');
      const nameInput = document.getElementById('new-setlist-name');
      const shareCheckbox = document.getElementById('new-setlist-share-checkbox');

      if (nameInput) nameInput.value = '';
      if (state.currentUser && !state.currentUser.isAnonymous) {
        if (shareGroup) shareGroup.style.display = 'flex';
        if (shareCheckbox) shareCheckbox.checked = false;
      } else {
        if (shareGroup) shareGroup.style.display = 'none';
        if (shareCheckbox) shareCheckbox.checked = false;
      }
      if (modal) {
        modal.classList.add('active');
        if (nameInput) nameInput.focus();
      }
    });
  }

  const closeNewSetlist = () => {
    const modal = document.getElementById('new-setlist-modal');
    if (modal) modal.classList.remove('active');
  };
  
  const closeBtn = document.getElementById('close-new-setlist-modal-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeNewSetlist);
  
  const cancelBtn = document.getElementById('cancel-new-setlist-modal-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeNewSetlist);
  
  const createBtn = document.getElementById('create-new-setlist-btn');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const nameInput = document.getElementById('new-setlist-name');
      const shareCheckbox = document.getElementById('new-setlist-share-checkbox');
      const name = nameInput ? nameInput.value.trim() : '';
      if (!name) return;

      const newSetlist = {
        id: 'setlist_' + Date.now(),
        name: name,
        songs: [],
        isShared: shareCheckbox ? shareCheckbox.checked : false
      };

      try {
        if (state.currentUser && !state.currentUser.isAnonymous) {
          if (db) await dbPutSetlist(db, newSetlist);
          // Snapshot listener will populate state.setlists, preventing duplication
        } else {
          if (db) await dbPutSetlist(db, newSetlist);
          state.setlists.push(newSetlist);
        }
        state.activeSetlistId = newSetlist.id;
        state.activeSetlistSongIndex = null;
        state.activeTab = 'setlists';

        showToast("Setlist created.");
        renderToolbarSetlistSelect();
        renderSidebar();
        closeNewSetlist();
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

  if (setlistShareCheckbox) {
    setlistShareCheckbox.addEventListener('change', async (e) => {
      const setlist = state.setlists.find(s => s.id === state.activeSetlistId);
      if (setlist) {
        setlist.isShared = e.target.checked;
        try {
          if (db) {
            await dbPutSetlist(db, setlist);
          }
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

  if (el.setlistAddSongSearch) {
    el.setlistAddSongSearch.addEventListener('input', (e) => {
      renderSetlistAddSongDropdown(e.target.value);
    });

    el.setlistAddSongSearch.addEventListener('focus', () => {
      renderSetlistAddSongDropdown(el.setlistAddSongSearch.value);
    });

    el.setlistAddSongSearch.addEventListener('keydown', (e) => {
      const dropdown = el.setlistAddSongDropdown;
      if (!dropdown) return;
      const items = dropdown.querySelectorAll('.search-dropdown-item');
      if (items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.setlistSearchIndex = (state.setlistSearchIndex + 1) % items.length;
        updateSetlistDropdownHighlight(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.setlistSearchIndex = (state.setlistSearchIndex - 1 + items.length) % items.length;
        updateSetlistDropdownHighlight(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (state.setlistSearchIndex >= 0 && state.setlistSearchIndex < state.setlistSearchSongs.length) {
          const selectedSong = state.setlistSearchSongs[state.setlistSearchIndex];
          addSongToActiveSetlist(selectedSong.id);
        } else if (state.setlistSearchSongs.length > 0) {
          // Default to first result if none highlighted
          addSongToActiveSetlist(state.setlistSearchSongs[0].id);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        dropdown.style.display = 'none';
        el.setlistAddSongSearch.blur();
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

          // Check if we are actively viewing/editing a setlist in the sidebar
          const isEditing = state.activeTab === 'setlists' && state.activeSetlistId && el.setlistEditor && el.setlistEditor.style.display === 'flex';
          const activeSetlist = isEditing ? state.setlists.find(s => s.id === state.activeSetlistId) : null;

          const importAsNewSetlist = async (item) => {
            const newSetlist = JSON.parse(JSON.stringify(item));
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
            state.activeTab = 'setlists';
            showToast(`Imported "${newSetlist.name}" as new setlist.`);
            renderToolbarSetlistSelect();
            renderSidebar();
            renderActiveSong();
          };

          if (activeSetlist) {
            if (confirm(`Do you want to overwrite the current setlist "${activeSetlist.name}" with the imported songs? (Cancel to import as a new setlist)`)) {
              // Overwrite current setlist
              activeSetlist.name = setlistItem.name;
              activeSetlist.songs = setlistItem.songs;
              if (db) {
                await dbPutSetlist(db, activeSetlist);
              }
              showToast(`Setlist "${activeSetlist.name}" overwritten.`);
              state.activeTab = 'setlists';
              renderToolbarSetlistSelect();
              renderSetlistEditor();
              renderSidebar();
              renderActiveSong();
            } else {
              // Import as a new setlist
              await importAsNewSetlist(setlistItem);
            }
          } else {
            // Import directly as a new setlist without confirmation
            await importAsNewSetlist(setlistItem);
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
    const keyLabel = song.key ? `<span style="font-family: 'JetBrains Mono', monospace; font-weight: bold;">${song.key}</span>` : '';

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

function buildSongBodyFromRawText(rawText, options = {}) {
  const resolveImageSrc = typeof options.resolveImageSrc === 'function'
    ? options.resolveImageSrc
    : (src) => src;
  const isRTL = !!options.isRTL;

  const blocks = window.SongParser.parseSongText(rawText || '');
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
      img.src = resolveImageSrc(block.src);
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
          lineDiv.className = 'chord-lyric-pair';
          
          const chordDiv = document.createElement('div');
          chordDiv.className = 'chord-only-line';
          const rawChordLine = (line.rawChordLine || '');
          const chords = window.SongParser.extractChords(rawChordLine);

          if (chords.length === 0) {
            chordDiv.textContent = rawChordLine;
          } else {
            let htmlResult = '';
            let lastIdx = 0;

            chords.forEach(chord => {
              const startIdx = chord.index;
              htmlResult += escapeHTML(rawChordLine.substring(lastIdx, startIdx));

              const transposed = window.Transposer.transposeChord(chord.text, state.transposeOffset, state.preferFlats);
              const cleanDisplay = cleanChordNameForDisplay(transposed);

              htmlResult += `<span class="chord" data-chord="${cleanDisplay}">${cleanDisplay}</span>`;
              lastIdx = startIdx + chord.text.length;
            });

            htmlResult += escapeHTML(rawChordLine.substring(lastIdx));
            chordDiv.innerHTML = htmlResult;
          }

          const lyricDiv = document.createElement('div');
          lyricDiv.className = 'lyric-only-line';
          lyricDiv.innerHTML = formatLyricText(line.rawLyricLine || '');

          lineDiv.appendChild(chordDiv);
          lineDiv.appendChild(lyricDiv);
        } else if (line.type === 'chord-only') {
          lineDiv.className = 'chord-only-line';
          const rawLine = (line.rawLine || '');
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

  return body;
}

// Active Song Renderer
function renderActiveSong() {
  // If active tab is setlists and no specific setlist is selected, show setlist dashboard instead of viewport
  if (state.activeTab === 'setlists' && !state.activeSetlistId) {
    showView('setlists-dashboard-view');
    renderSetlistsDashboard();
    return;
  }

  el.songDisplayArea.innerHTML = '';

  if (!state.currentSongId) {
    el.songDisplayArea.innerHTML = `
      <div class="empty-state">
        <h2>No Song Selected</h2>
        <p>Choose a song from the library or add a new one to begin.</p>
      </div>
    `;
    showView('song-viewport');
    return;
  }

  showView('song-viewport');

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

  // Floating Setlist Gig Navigation Bar (moved to #gig-nav-container)
  const gigNavContainer = document.getElementById('gig-nav-container');
  if (gigNavContainer) {
    gigNavContainer.innerHTML = '';
    if (activeSetlist && state.activeSetlistSongIndex !== null) {
      gigNavContainer.style.display = 'block';
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

      gigNavContainer.appendChild(navBar);

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
    } else {
      gigNavContainer.style.display = 'none';
    }
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
          ${(state.currentUser && !state.currentUser.isAnonymous) ? `
          <button class="btn" id="edit-active-btn" style="flex: none; font-size: 0.8rem; padding: 4px 10px;">Edit</button>
          ` : ''}
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
  const body = buildSongBodyFromRawText(song.rawText, { isRTL: song.isRTL });

  container.appendChild(body);
  el.songDisplayArea.appendChild(container);

  // Re-bind click handler on the newly rendered edit button
  const editBtn = document.getElementById('edit-active-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      openSongModal(song);
    });
  }
}

// Auto-Scroll Loop
function toggleAutoScroll() {
  state.isScrolling = !state.isScrolling;

  if (state.isScrolling) {
    el.scrollToggleBtn.textContent = 'Pause';
    el.scrollToggleBtn.classList.add('active');
    if (el.fullscreenScrollToggleBtn) {
      el.fullscreenScrollToggleBtn.textContent = 'Pause';
      el.fullscreenScrollToggleBtn.classList.add('active');
    }
    lastScrollTime = performance.now();
    state.scrollAccumulator = el.songViewport.scrollTop;
    state.lastSetScrollTop = el.songViewport.scrollTop;
    scrollAnimationId = requestAnimationFrame(autoScrollStep);
    showToast("Auto-scroll started.");
  } else {
    el.scrollToggleBtn.textContent = 'Play';
    el.scrollToggleBtn.classList.remove('active');
    if (el.fullscreenScrollToggleBtn) {
      el.fullscreenScrollToggleBtn.textContent = 'Play';
      el.fullscreenScrollToggleBtn.classList.remove('active');
    }
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

  // 10 levels of speed using an exponential scale (slower at min, much faster at max)
  const clampedSpeed = Math.max(1, Math.min(10, state.scrollSpeed));
  
  // Calculate speed in pixels per second (matches linear visual speed independent of font size)
  const pxPerSec = 2.0 + Math.pow(1.65, clampedSpeed - 1) * 1.5;
  const speedRatio = pxPerSec / 1000.0;
  const scrollDelta = elapsed * speedRatio;

  if (scrollDelta > 0) {
    state.scrollAccumulator += scrollDelta;
    el.songViewport.scrollTop = Math.round(state.scrollAccumulator);
    state.lastSetScrollTop = el.songViewport.scrollTop;
    lastScrollTime = timestamp;

    // Check if we hit the bottom of the viewport
    const maxScrollTop = el.songViewport.scrollHeight - el.songViewport.clientHeight;
    if (el.songViewport.scrollTop >= maxScrollTop - 3) {
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

// Helper to update editor thumbnails preview
function updateEditorImagePreviews() {
  const container = document.getElementById('editor-image-preview-container');
  if (!container) return;

  container.innerHTML = '';
  if (!state.editorImages || state.editorImages.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  state.editorImages.forEach((src, idx) => {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.width = '60px';
    wrapper.style.height = '60px';
    wrapper.style.border = '1px solid var(--border-color)';
    wrapper.style.borderRadius = '6px';
    wrapper.style.overflow = 'hidden';
    wrapper.style.backgroundColor = 'var(--bg-primary)';

    const img = document.createElement('img');
    img.src = src;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.title = `Image ${idx + 1}`;

    // Index label
    const label = document.createElement('span');
    label.textContent = idx + 1;
    label.style.position = 'absolute';
    label.style.bottom = '2px';
    label.style.left = '2px';
    label.style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
    label.style.color = '#fff';
    label.style.fontSize = '0.65rem';
    label.style.fontWeight = 'bold';
    label.style.padding = '1px 4px';
    label.style.borderRadius = '2px';
    label.style.lineHeight = '1';

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.innerHTML = '&times;';
    removeBtn.style.position = 'absolute';
    removeBtn.style.top = '2px';
    removeBtn.style.right = '2px';
    removeBtn.style.width = '16px';
    removeBtn.style.height = '16px';
    removeBtn.style.borderRadius = '50%';
    removeBtn.style.backgroundColor = 'rgba(239, 68, 68, 0.9)';
    removeBtn.style.color = '#fff';
    removeBtn.style.border = 'none';
    removeBtn.style.fontSize = '10px';
    removeBtn.style.display = 'flex';
    removeBtn.style.alignItems = 'center';
    removeBtn.style.justifyContent = 'center';
    removeBtn.style.cursor = 'pointer';
    removeBtn.style.padding = '0';
    removeBtn.title = 'Remove Image';

    removeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      state.editorImages.splice(idx, 1);
      
      // Remove placeholder from textarea
      const placeholder = `[IMAGE: ${idx + 1}]`;
      let text = el.formText.value;
      text = text.replace(placeholder, '');
      
      // Shift subsequent placeholders: e.g. [IMAGE: 3] becomes [IMAGE: 2]
      for (let i = idx + 2; i <= state.editorImages.length + 1; i++) {
        const oldPlaceholder = `[IMAGE: ${i}]`;
        const newPlaceholder = `[IMAGE: ${i - 1}]`;
        text = text.replace(oldPlaceholder, newPlaceholder);
      }

      el.formText.value = text;
      el.formText.dispatchEvent(new Event('input', { bubbles: true }));
      updateEditorImagePreviews();
    });

    wrapper.appendChild(img);
    wrapper.appendChild(label);
    wrapper.appendChild(removeBtn);
    container.appendChild(wrapper);
  });
}

// Helper to reconstruct rawText by replacing index placeholders with full sources
function getRawTextFromEditor() {
  let text = el.formText.value;
  if (state.editorImages && state.editorImages.length > 0) {
    const placeholderRegex = /\[IMAGE:\s*(\d+)\]/g;
    text = text.replace(placeholderRegex, (fullMatch, numberStr) => {
      const idx = parseInt(numberStr, 10) - 1;
      if (idx >= 0 && idx < state.editorImages.length) {
        return `[IMAGE: ${state.editorImages[idx]}]`;
      }
      return fullMatch;
    });
  }
  return text;
}

// Helper to insert image token at cursor position
function insertImageToken(base64Data) {
  const textarea = el.formText;
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  
  let prefix = '';
  let suffix = '';
  
  if (start > 0 && text[start - 1] !== '\n') {
    prefix = '\n';
  }
  if (end < text.length && text[end] !== '\n') {
    suffix = '\n';
  }
  
  state.editorImages.push(base64Data);
  const imgIndex = state.editorImages.length;
  
  const replacement = `${prefix}[IMAGE: ${imgIndex}]${suffix}`;
  textarea.value = text.substring(0, start) + replacement + text.substring(end);
  
  // Trigger input event to update preview/dirty state
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  
  textarea.focus();
  textarea.selectionStart = start + replacement.length;
  textarea.selectionEnd = start + replacement.length;

  // Update previews
  updateEditorImagePreviews();
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

  // Reset editor preview state to text edit mode
  if (el.editorPreviewDisplay) el.editorPreviewDisplay.style.display = 'none';
  if (el.formText) el.formText.style.display = 'block';
  if (el.editorPreviewToggleBtn) {
    const iconSpan = el.editorPreviewToggleBtn.querySelector('span');
    if (iconSpan) iconSpan.textContent = 'visibility';
    el.editorPreviewToggleBtn.title = 'Preview Mode';
  }
  
  // Sync theme toggle icon
  const editorThemeToggleBtn = document.getElementById('editor-theme-toggle-btn');
  if (editorThemeToggleBtn) {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    editorThemeToggleBtn.textContent = currentTheme === 'light' ? 'light_mode' : 'dark_mode';
  }
  
  // Initialize/Reset temporary image store
  state.editorImages = [];

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
    if (formShare) formShare.checked = song.isShared || false;
    
    // Parse rawText to extract full image sources and replace them with short placeholders
    let rawText = song.rawText || '';
    const imageRegex = /\[IMAGE:\s*([^\]]+)\]/g;
    let imgCount = 0;
    
    const cleanText = rawText.replace(imageRegex, (fullMatch, imgSource) => {
      state.editorImages.push(imgSource.trim());
      imgCount++;
      return `[IMAGE: ${imgCount}]`;
    });
    el.formText.value = cleanText;

    if (el.formRemarks) {
      el.formRemarks.value = song.remarks || '';
    }
    el.deleteSongBtn.style.display = isSetlistEdit ? 'none' : 'block';
    if (el.importDocxGroup) el.importDocxGroup.style.display = 'none';
  } else {
    // New song mode
    el.modalTitle.textContent = "Add New Song";
    el.deleteSongBtn.style.display = 'none';
    if (formShare) formShare.checked = false;
    if (el.importDocxGroup) el.importDocxGroup.style.display = 'block';
  }

  // Render previews for loaded images (if any)
  updateEditorImagePreviews();

  updateFormTextDirection();

  showView('song-editor-view');
  el.formTitle.focus();
}

function closeSongModal() {
  if (state.activeTab === 'setlists' && !state.activeSetlistId) {
    showView('setlists-dashboard-view');
    renderSetlistsDashboard();
  } else if (state.activeTab === 'setlists' && state.activeSetlistId) {
    showView('song-viewport');
    renderActiveSong();
  } else {
    showView('song-viewport');
    renderActiveSong();
  }
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

function updateSongCount() {
  if (el.tabSongsBtn) {
    el.tabSongsBtn.textContent = `Songs (${state.songs.length})`;
  }
}

function renderSidebar() {
  updateSongCount();
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
      showView('setlists-dashboard-view');
      renderSetlistsDashboard();
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
        ${(state.currentUser && !state.currentUser.isAnonymous) ? `
        <button class="toggle-privacy-btn" title="${setlist.isShared ? 'Public - Click to make Private' : 'Private - Click to make Public'}" style="color: ${setlist.isShared ? 'var(--accent-color)' : 'var(--text-secondary)'}; border: none; background: transparent; width: 28px; height: 28px; padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: color 0.2s, transform 0.15s ease; border-radius: 4px;">
          ${setlist.isShared ? `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
          ` : `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          `}
        </button>
        ` : ''}
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

    const privacyBtn = item.querySelector('.toggle-privacy-btn');
    if (privacyBtn) {
      privacyBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); // prevent opening the setlist editor
        setlist.isShared = !setlist.isShared;
        try {
          if (db) await dbPutSetlist(db, setlist);
          renderSetlistsList();
        } catch (err) {
          console.error(err);
        }
      });
    }

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
  if (setlistShareCheckbox) setlistShareCheckbox.checked = setlist.isShared || false;
  if (shareSetlistGroup) {
    if (state.currentUser && !state.currentUser.isAnonymous) {
      shareSetlistGroup.style.display = 'flex';
    } else {
      shareSetlistGroup.style.display = 'none';
    }
  }

  // Reset setlist song search state
  if (el.setlistAddSongSearch) {
    el.setlistAddSongSearch.value = '';
  }
  if (el.setlistAddSongDropdown) {
    el.setlistAddSongDropdown.innerHTML = '';
    el.setlistAddSongDropdown.style.display = 'none';
  }
  state.setlistSearchIndex = -1;
  state.setlistSearchSongs = [];

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

function renderSetlistAddSongDropdown(query = '') {
  if (!el.setlistAddSongDropdown) return;
  el.setlistAddSongDropdown.innerHTML = '';

  const cleanQuery = query.toLowerCase().trim();
  state.setlistSearchSongs = state.songs.filter(song => {
    if (!cleanQuery) return true;
    return (
      song.title.toLowerCase().includes(cleanQuery) ||
      song.artist.toLowerCase().includes(cleanQuery) ||
      song.key.toLowerCase().includes(cleanQuery)
    );
  });

  state.setlistSearchIndex = -1;

  if (state.setlistSearchSongs.length === 0) {
    el.setlistAddSongDropdown.innerHTML = `
      <div style="padding: 0.6rem 0.8rem; text-align: center; color: var(--text-secondary); font-size: 0.8rem;">
        No songs found.
      </div>
    `;
  } else {
    state.setlistSearchSongs.forEach((song, index) => {
      const item = document.createElement('div');
      item.className = 'search-dropdown-item';
      item.dataset.index = index;

      const cleanTitle = escapeHTML(song.title);
      const cleanArtist = escapeHTML(song.artist);

      item.innerHTML = `
        <div class="title">${cleanTitle}</div>
        <div class="artist">${cleanArtist}</div>
      `;

      item.addEventListener('click', () => {
        addSongToActiveSetlist(song.id);
      });
      el.setlistAddSongDropdown.appendChild(item);
    });
  }

  el.setlistAddSongDropdown.style.display = 'block';
}

function updateSetlistDropdownHighlight(items) {
  items.forEach((item, index) => {
    if (index === state.setlistSearchIndex) {
      item.classList.add('highlighted');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('highlighted');
    }
  });
}

async function addSongToActiveSetlist(songId) {
  const setlist = state.setlists.find(s => s.id === state.activeSetlistId);
  if (!setlist) return;

  setlist.songs.push({ songId, transposeOffset: 0 });

  try {
    if (db) {
      await dbPutSetlist(db, setlist);
    }
    if (el.setlistAddSongSearch) el.setlistAddSongSearch.value = '';
    if (el.setlistAddSongDropdown) el.setlistAddSongDropdown.style.display = 'none';
    state.setlistSearchIndex = -1;
    state.setlistSearchSongs = [];
    renderSetlistEditor();
    showToast("Song added to setlist.");
  } catch (err) {
    console.error(err);
    showToast("Failed to add song.");
  }
}

function toggleFullscreen(enable) {
  state.isFullscreen = enable;
  const appContainer = document.querySelector('.app-container');
  if (enable) {
    appContainer.classList.add('fullscreen');
    if (el.fullscreenControls) el.fullscreenControls.style.display = 'flex';
  } else {
    appContainer.classList.remove('fullscreen');
    if (el.fullscreenControls) el.fullscreenControls.style.display = 'none';
  }
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", url);
  downloadAnchor.setAttribute("download", filename);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  URL.revokeObjectURL(url);
}

function triggerHTMLDownload(updatedSongs) {
  // Try to find the inlined script tag for defaultSongs
  const scripts = Array.from(document.querySelectorAll('script'));
  const songsScript = scripts.find(s => s.textContent && s.textContent.includes('window.defaultSongs'));
  
  if (songsScript) {
    // We are in standalone bundled HTML mode
    // Clone document element to avoid changing live DOM view permanently
    const clonedDoc = document.documentElement.cloneNode(true);
    
    // Find the songs script tag in the clone and update it
    const clonedScripts = Array.from(clonedDoc.querySelectorAll('script'));
    const clonedSongsScript = clonedScripts.find(s => s.textContent && s.textContent.includes('window.defaultSongs'));
    if (clonedSongsScript) {
      const newVersion = new Date().toISOString();
      clonedSongsScript.textContent = `window.defaultSongsVersion = '${newVersion}';\nwindow.defaultSongs = ${JSON.stringify(updatedSongs, null, 2)};`;
    }
    
    // Clean up any dynamic UI states in the clone so we don't download a dirty DOM
    const activeModals = clonedDoc.querySelectorAll('.modal-overlay.active');
    activeModals.forEach(m => m.classList.remove('active'));
    
    const activeSidebars = clonedDoc.querySelectorAll('.sidebar.active');
    activeSidebars.forEach(s => s.classList.remove('active'));
    
    const songDisplay = clonedDoc.querySelector('#song-display-area');
    if (songDisplay) songDisplay.innerHTML = '';
    
    // Grab the current filename from path or default to songbook.html
    let filename = 'songbook.html';
    const pathParts = window.location.pathname.split('/');
    const lastPart = pathParts[pathParts.length - 1];
    if (lastPart && lastPart.endsWith('.html')) {
      filename = lastPart;
    }
    
    const fullHtml = "<!DOCTYPE html>\n" + clonedDoc.outerHTML;
    downloadTextFile(filename, fullHtml);
    showToast(`Saved. Downloaded updated ${filename}`);
  } else {
    // We are running index.html directly with external songs-data.js script
    const newVersion = new Date().toISOString();
    const jsContent = `window.defaultSongsVersion = '${newVersion}';\nwindow.defaultSongs = ${JSON.stringify(updatedSongs, null, 2)};`;
    downloadTextFile('songs-data.js', jsContent);
    showToast("Saved. Downloaded updated songs-data.js");
  }
}

// Boot up
window.addEventListener('DOMContentLoaded', init);

// ==========================================
// VIEW MANAGER & SETLIST DASHBOARD FUNCTIONS
// ==========================================
function showView(viewId) {
  const views = {
    'song-viewport': document.getElementById('song-viewport'),
    'setlists-dashboard-view': document.getElementById('setlists-dashboard-view'),
    'song-editor-view': document.getElementById('song-editor-view')
  };

  for (const [id, element] of Object.entries(views)) {
    if (element) {
      element.style.display = id === viewId ? 'block' : 'none';
    }
  }

  // Toggle main toolbar visibility based on active view (only show when viewing songs)
  if (el.mainToolbar) {
    el.mainToolbar.style.display = (viewId === 'song-viewport') ? 'flex' : 'none';
  }
}

function renderSetlistsDashboard() {
  const gridContainer = document.getElementById('dashboard-setlists-grid');
  if (!gridContainer) return;

  gridContainer.innerHTML = '';

  // Update Stats
  const totalSetsEl = document.getElementById('stats-total-sets');
  const totalSongsEl = document.getElementById('stats-total-songs');
  const sharedSetsEl = document.getElementById('stats-shared-sets');

  if (totalSetsEl) totalSetsEl.textContent = state.setlists.length;
  if (totalSongsEl) totalSongsEl.textContent = state.songs.length;
  if (sharedSetsEl) {
    const sharedCount = state.setlists.filter(s => s.isShared).length;
    sharedSetsEl.textContent = sharedCount;
  }

  // Render Setlists Cards
  state.setlists.forEach(setlist => {
    const card = document.createElement('div');
    card.className = 'bento-card';
    
    // Choose icon based on setlist name
    let iconName = 'music_note';
    const nameLower = setlist.name.toLowerCase();
    if (nameLower.includes('acoustic') || nameLower.includes('solo') || nameLower.includes('unplugged') || nameLower.includes('mic')) {
      iconName = 'mic';
    } else if (nameLower.includes('wedding') || nameLower.includes('celebration') || nameLower.includes('party') || nameLower.includes('gig')) {
      iconName = 'celebration';
    } else if (nameLower.includes('jazz') || nameLower.includes('piano') || nameLower.includes('blues')) {
      iconName = 'piano';
    } else if (nameLower.includes('guitar') || nameLower.includes('rock')) {
      iconName = 'album';
    }

    // Dynamic description from song titles
    let desc = 'Empty setlist. Add songs to get started.';
    if (setlist.songs && setlist.songs.length > 0) {
      desc = setlist.songs.slice(0, 3).map(s => s.title).join(', ');
      if (setlist.songs.length > 3) {
        desc += ` and ${setlist.songs.length - 3} more`;
      }
    }

    const privacyBadge = setlist.isShared 
      ? '<span class="bento-card-badge">Public</span>' 
      : '<span class="bento-card-badge private">Private</span>';

    const countLabel = setlist.songs.length === 1 ? '1 Song' : `${setlist.songs.length} Songs`;

    card.innerHTML = `
      <div class="bento-card-header">
        <div class="bento-card-icon">
          <span class="material-symbols-outlined">${iconName}</span>
        </div>
        ${privacyBadge}
      </div>
      <div class="bento-card-body">
        <h4 class="bento-card-title">${escapeHTML(setlist.name)}</h4>
        <p class="bento-card-desc">${escapeHTML(desc)}</p>
      </div>
      <div class="bento-card-footer">
        <div class="bento-card-meta">
          <span class="material-symbols-outlined">list_alt</span>
          <span>${countLabel}</span>
        </div>
        <div class="bento-card-actions">
          ${(state.currentUser && !state.currentUser.isAnonymous) ? `
          <button class="bento-card-action-btn toggle-privacy" title="${setlist.isShared ? 'Make Private' : 'Make Public'}">
            <span class="material-symbols-outlined" style="font-size: 16px;">
              ${setlist.isShared ? 'lock_open' : 'lock'}
            </span>
          </button>
          ` : ''}
          <button class="bento-card-action-btn export-setlist" title="Export Setlist">
            <span class="material-symbols-outlined" style="font-size: 16px;">download</span>
          </button>
          <button class="bento-card-action-btn delete remove-setlist" title="Delete Setlist">
            <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
          </button>
        </div>
      </div>
    `;

    // Click handler for card - open setlist editor
    card.addEventListener('click', () => {
      state.activeSetlistId = setlist.id;
      state.activeSetlistSongIndex = null;
      state.activeTab = 'setlists';
      renderSidebar();
      
      // If the setlist has songs, open the first song, else stay on dashboard or open empty view
      if (setlist.songs && setlist.songs.length > 0) {
        const firstSong = setlist.songs[0];
        // Find if this song exists in our library
        const libSong = state.songs.find(s => s.id === firstSong.id || s.title === firstSong.title);
        if (libSong) {
          state.currentSongId = libSong.id;
          state.activeSetlistSongIndex = 0;
          state.transposeOffset = firstSong.transposeOffset || 0;
          if (el.transposeVal) {
            const sign = state.transposeOffset > 0 ? '+' : '';
            el.transposeVal.textContent = `${sign}${state.transposeOffset}`;
          }
          renderSongList();
          renderActiveSong();
          showView('song-viewport');
        } else {
          showToast("Song not found in library.");
        }
      } else {
        // Empty setlist: show dashboard but editor in sidebar is open
        renderSongList();
        renderActiveSong();
      }
    });

    // Stop propagation and bind action buttons
    const privacyBtn = card.querySelector('.toggle-privacy');
    if (privacyBtn) {
      privacyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        setlist.isShared = !setlist.isShared;
        try {
          if (db) await dbPutSetlist(db, setlist);
          renderSidebar();
          renderSetlistsDashboard();
        } catch (err) {
          console.error(err);
        }
      });
    }

    const exportBtn = card.querySelector('.export-setlist');
    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportSetlistToFile(setlist);
      });
    }

    const deleteBtn = card.querySelector('.remove-setlist');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
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
            renderSetlistsDashboard();
          } catch (err) {
            console.error(err);
            showToast("Failed to delete setlist.");
          }
        }
      });
    }

    gridContainer.appendChild(card);
  });

  // Append Create New Placeholder Card
  if (state.currentUser && !state.currentUser.isAnonymous) {
    const placeholder = document.createElement('div');
    placeholder.className = 'bento-card placeholder';
    placeholder.innerHTML = `
      <div class="bento-card-placeholder-icon">
        <span class="material-symbols-outlined" style="font-size: 24px;">add</span>
      </div>
      <span class="bento-card-placeholder-text">New Performance Set</span>
    `;
    placeholder.addEventListener('click', () => {
      if (el.newSetlistBtn) el.newSetlistBtn.click();
    });
    gridContainer.appendChild(placeholder);
  }
}
