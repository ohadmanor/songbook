/**
 * transposer.js
 * Handles music chord transposition math.
 */

const SHARP_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_SCALE  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Map to find the semitone index of any root note
const NOTE_TO_INDEX = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4,
  'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9,
  'A#': 10, 'Bb': 10, 'B': 11
};

/**
 * The single spelling this app uses for every accidental: sharps for C#/F#,
 * flats for Eb/Ab/Bb. This is deliberate, not an oversight -- it is the spelling
 * guitarists here expect, so transposeNote() ALWAYS uses it and ignores its
 * preferFlats argument. SHARP_SCALE and FLAT_SCALE, the `useFlats` calculation in
 * transposeChord() and every preferFlats parameter below are therefore inert;
 * the enharmonic toggle button that once drove them is gone from index.html.
 * Honouring preferFlats again means changing displayed chords for every song, so
 * treat it as a product decision rather than a bug to be tidied up.
 *
 * @param {string} note - The note (e.g., "C", "F#", "Bb")
 * @param {number} semitones - Number of semitones to shift (-11 to 11)
 * @param {boolean} preferFlats - Ignored; see above.
 * @returns {string} The transposed note
 */
const CUSTOM_SCALE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

function transposeNote(note, semitones, preferFlats = false) {
  if (NOTE_TO_INDEX[note] === undefined) return note;
  
  let currentIndex = NOTE_TO_INDEX[note];
  let newIndex = (currentIndex + semitones) % 12;
  if (newIndex < 0) newIndex += 12;
  
  return CUSTOM_SCALE[newIndex];
}

/**
 * Parses a chord string into its parts: root, suffix, and optional slash root
 * Example: "C#m7/E" -> { root: "C#", suffix: "m7", slash: "E" }
 * @param {string} chordStr 
 * @returns {object|null}
 */
function parseChord(chordStr) {
  if (!chordStr || typeof chordStr !== 'string') return null;
  
  // Trim spaces
  const cleanChord = chordStr.trim();
  if (cleanChord.length === 0) return null;

  // Handle hyphenated chords like Fm-Bbm (representing multiple chords in the same beat)
  if (cleanChord.includes('-')) {
    const parts = cleanChord.split('-');
    const allValid = parts.every(part => {
      if (part.includes('-') || part.trim() === '') return false;
      return parseChord(part) !== null;
    });
    if (allValid) {
      return { root: 'split', suffix: 'split', slash: null, isSplit: true, parts: parts };
    }
  }
  
  // Check for slash chords like C/E, Am/G
  const parts = cleanChord.split('/');
  const mainChord = parts[0];
  const slashNote = parts.length > 1 ? parts[1] : null;
  
  // Extract root note of the main chord (e.g. C, C#, Bb)
  let root = '';
  if (mainChord.length >= 2 && (mainChord[1] === '#' || mainChord[1] === 'b')) {
    root = mainChord.slice(0, 2);
  } else if (mainChord.length >= 1) {
    root = mainChord.slice(0, 1);
  }
  
  // If the root is not a valid note, it's not a parsable chord (e.g., text like "INTRO")
  if (NOTE_TO_INDEX[root] === undefined) {
    return null;
  }
  
  const suffix = mainChord.slice(root.length);
  
  // Validate that the suffix is a valid musical chord suffix, not arbitrary text (like "nd" in "And")
  const VALID_SUFFIX_REGEX = /^(?:m|M|maj|min|madd|minadd|sus|add|dim|aug|alt|Δ|ø|0|o|O)?(?:\d+)?(?:[b#+\-]?\d*)?$/;
  if (!VALID_SUFFIX_REGEX.test(suffix)) {
    return null;
  }
  
  return {
    root: root,
    suffix: suffix,
    slash: slashNote
  };
}

/**
 * Transposes a full chord symbol (e.g., "C#m7", "F/A", "Gdim")
 * @param {string} chordStr - The chord string to transpose
 * @param {number} semitones - Number of semitones to shift
 * @param {boolean} preferFlats - Whether to output using flats scale
 * @returns {string} The transposed chord string, or original if unparsable
 */
function transposeChord(chordStr, semitones, preferFlats = false) {
  if (!chordStr) return chordStr;
  
  const cleanChord = chordStr.trim();
  if (cleanChord.includes('-')) {
    const parts = cleanChord.split('-');
    const allValid = parts.every(part => {
      if (part.includes('-') || part.trim() === '') return false;
      return parseChord(part) !== null;
    });
    if (allValid) {
      return parts.map(part => transposeChord(part, semitones, preferFlats)).join('-');
    }
  }

  const parsed = parseChord(chordStr);
  if (!parsed) return chordStr; // Return original if not a chord
  
  // Determine scale preference based on original input note characteristics
  let useFlats = preferFlats;
  if (!preferFlats) {
    // If the original chord used flats, keep using flats
    if (parsed.root.includes('b') || (parsed.slash && parsed.slash.includes('b'))) {
      useFlats = true;
    }
  }
  
  const transposedRoot = transposeNote(parsed.root, semitones, useFlats);
  let transposedSlash = '';
  
  if (parsed.slash) {
    transposedSlash = '/' + transposeNote(parsed.slash, semitones, useFlats);
  }
  
  return `${transposedRoot}${parsed.suffix}${transposedSlash}`;
}

// Export for ES modules and window global if loaded directly in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { transposeChord, transposeNote, parseChord, SHARP_SCALE, FLAT_SCALE };
} else {
  window.Transposer = { transposeChord, transposeNote, parseChord };
}
