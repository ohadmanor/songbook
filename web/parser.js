/**
 * parser.js
 * Parses raw chord sheet text (with chords above lyrics) into structured blocks:
 * section headers, images, and paragraphs of chord / lyric / chord-lyric lines.
 */

// Import or reference Transposer
const transposer = typeof window !== 'undefined' ? window.Transposer : require('./transposer');

/**
 * Checks if a token is a valid chord symbol.
 * Handles parentheses or brackets around chords, e.g. (Am) or [C#].
 * @param {string} token 
 * @returns {boolean}
 */
function isValidChordToken(token) {
  const clean = token.replace(/[()\[\]*~%=]/g, '').trim();
  if (clean === '') return false;
  
  // Check if it's a known symbol, including repeat indicators (e.g. x2, X4, //x2, 2x) or common instrumental words
  if (/^[||\-xX/+&0-9~\u2013\u2014*]+$/.test(clean)) return true;
  if (/^(?:Solo|Drums|Mute|Bass|Guitar|Stop|Play)$/i.test(clean)) return true;
  
  // Try to parse it as a chord
  return transposer.parseChord(clean) !== null;
}

// Prefix patterns for Hebrew and English intro / instrumental / outro lines
const INTRO_PREFIX_REGEX = /^(פתיחה|מעבר|סולו|סיום|מבוא|אינטרו|קודה|Intro|Outro|Solo|Bridge|Bass|BASS|Guitar|Drums|Flute|Violin|Coda|Mute)\s*:?\s*/i;

// Words that appear inside a chord line as a performance instruction rather
// than as lyrics, e.g. "Bass: // Cm // x3" or "// D // x3 fast". They must not
// count against the line when isChordLine() decides whether it is really lyrics.
const INSTRUCTION_WORD_REGEX = /^(?:Solo|Drums|Mute|Bass|Guitar|Stop|Play|Fast|Slow)$/i;

// Punctuation to discount when measuring how "word-like" a token is. Note this
// strips punctuation ONLY -- an earlier version of this class also contained the
// letters of the word "Israel", which silently shortened any token built from
// I/s/r/a/e/l and let plain lyric lines ("and the sky is grey", "It's 6 a.m. and
// I'm alone") pass as chord lines.
const TOKEN_PUNCTUATION_REGEX = /[()\[\].,!?;:"'\s]/g;

/**
 * Checks if a line contains only chords and spaces.
 * @param {string} line 
 * @returns {boolean}
 */
function isChordLine(line) {
  if (!line || line.trim().length === 0) return false;
  
  // Clean hidden characters
  let cleanLine = line.replace(/[\u200e\u200f\u200b]/g, '').replace(/\xa0/g, ' ');
  
  // Strip intro/instrumental prefix if present to check the remaining chords
  const match = cleanLine.match(INTRO_PREFIX_REGEX);
  if (match) {
    cleanLine = cleanLine.substring(match[0].length);
  }
  
  if (cleanLine.trim().length === 0) return false;
  
  const tokens = cleanLine.trim().split(/\s+/);
  let chordCount = 0;
  
  for (const token of tokens) {
    if (isValidChordToken(token)) {
      chordCount++;
    } else {
      // If a word is long and not a chord, symbol or performance instruction,
      // this is likely a lyrics line
      const cleanToken = token.replace(TOKEN_PUNCTUATION_REGEX, '').trim();
      if (cleanToken.length > 2 && !INSTRUCTION_WORD_REGEX.test(cleanToken)) {
        return false;
      }
    }
  }
  
  return chordCount > 0;
}

/**
 * Checks if a line is a section header (e.g. "[Chorus]", "בית א", "פזמון:")
 * @param {string} line 
 * @returns {boolean}
 */
function isHeaderLine(line) {
  if (!line) return false;
  const trimmed = line.trim();
  if (trimmed.startsWith('[IMAGE:')) return false;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return true;
  
  // Match Hebrew headers: בית, פזמון, מעבר, קורוס, מבוא, סיום (with or without numbers and colons)
  const hebrewHeaderPattern = /^(בית|פזמון|מעבר|מבוא|סיום|קודה|Chorus|Verse|Bridge|Intro|Outro|Coda)\s*(\d+|א|ב|ג|ד|ה|ו)?\s*:*$/i;
  return hebrewHeaderPattern.test(trimmed);
}

/**
 * Extracts chords and their indices from a chord line.
 * @param {string} line 
 * @returns {Array<{text: string, index: number}>}
 */
function extractChords(line) {
  const chords = [];
  const regex = /\S+/g;
  let match;
  
  while ((match = regex.exec(line)) !== null) {
    if (isValidChordToken(match[0])) {
      chords.push({
        text: match[0],
        index: match.index
      });
    }
  }
  
  return chords;
}

/**
 * Parses raw text of a songbook page/sheet.
 * @param {string} rawText 
 * @returns {Array<object>} List of parsed blocks (headers, paragraphs of aligned lines)
 */
function parseSongText(rawText) {
  if (!rawText) return [];
  
  const lines = rawText.split(/\r?\n/);
  const blocks = [];
  let currentParagraph = null;
  
  const commitParagraph = () => {
    if (currentParagraph && currentParagraph.lines.length > 0) {
      blocks.push(currentParagraph);
      currentParagraph = null;
    }
  };
  
  for (let i = 0; i < lines.length; i++) {
    // Clean control characters and non-breaking spaces
    const line = lines[i].replace(/[\u200e\u200f\u200b]/g, '').replace(/\xa0/g, ' ');
    const trimmed = line.trim();
    
    if (trimmed === '') {
      // Empty line signals end of current paragraph
      commitParagraph();
      continue;
    }
    
    if (trimmed.startsWith('[IMAGE:')) {
      commitParagraph();
      const src = trimmed.substring(7, trimmed.length - 1).trim();
      blocks.push({
        type: 'image',
        src: src
      });
      continue;
    }
    
    if (isHeaderLine(line)) {
      commitParagraph();
      blocks.push({
        type: 'header',
        text: trimmed.replace(/[\[\]]/g, '') // strip brackets for rendering
      });
      continue;
    }
    
    // If not in a paragraph, create one
    if (!currentParagraph) {
      currentParagraph = {
        type: 'paragraph',
        lines: []
      };
    }
    
    // Check if this line is a chord line
    if (isChordLine(line)) {
      // Look ahead to see if the next line is lyrics (not empty, not header, not chord line)
      let nextLine = (i + 1 < lines.length) ? lines[i + 1] : '';
      nextLine = nextLine.replace(/[\u200e\u200f\u200b\xa0]/g, ' ');
      const nextTrimmed = nextLine.trim();
      
      if (nextTrimmed !== '' && !isHeaderLine(nextLine) && !isChordLine(nextLine)) {
        // Aligned pair. Only the raw lines are kept: the renderer lays the chord
        // row over the lyric row using the original whitespace plus white-space:
        // pre-wrap, and never read the pixel-offset segments this used to compute
        // -- via an Arial width table and a nearest-offset search -- for every
        // line of every song on every render.
        currentParagraph.lines.push({
          type: 'chord-lyric',
          rawChordLine: line,
          rawLyricLine: nextLine
        });
        i++; // skip next line as it is consumed
      } else {
        // Chord line with no lyrics following it (instrumental / intro line)
        currentParagraph.lines.push({
          type: 'chord-only',
          rawLine: line
        });
      }
    } else {
      // Normal lyric line with no chords above it
      currentParagraph.lines.push({
        type: 'lyric-only',
        text: line
      });
    }
  }
  
  commitParagraph();
  return blocks;
}

/**
 * Detects if a text contains Hebrew characters.
 * @param {string} text 
 * @returns {boolean}
 */
function detectHebrew(text) {
  if (!text) return false;
  // Unicode range for Hebrew: U+0590 to U+05FF
  const hebrewRegex = /[\u0590-\u05FF]/;
  return hebrewRegex.test(text);
}

// Export for ES modules and window global if loaded directly in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseSongText, isChordLine, isHeaderLine, detectHebrew, extractChords };
} else {
  window.SongParser = { parseSongText, isChordLine, isHeaderLine, detectHebrew, extractChords };
}
