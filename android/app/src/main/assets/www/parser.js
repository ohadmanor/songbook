/**
 * parser.js
 * Parses raw chord sheet text (with chords above lyrics) into structured JSON/HTML segments.
 */

// Import or reference Transposer
const transposer = typeof window !== 'undefined' ? window.Transposer : require('./transposer');

// Arial character widths (normalized to a standard scale where average characters are ~500)
const ARIAL_WIDTHS = {
  ' ': 278, '#': 556, '/': 278, '\\': 278, '-': 333,
  '(': 333, ')': 333, '[': 333, ']': 333, '{': 333, '}': 333,
  '+': 584, '|': 222, '*': 389, '~': 584,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556,
  'A': 667, 'B': 667, 'C': 722, 'D': 722, 'E': 667, 'F': 611, 'G': 778, 'H': 722, 'I': 278, 'J': 500,
  'K': 667, 'L': 556, 'M': 833, 'N': 722, 'O': 778, 'P': 667, 'Q': 778, 'R': 722, 'S': 667, 'T': 611,
  'U': 722, 'V': 667, 'W': 944, 'X': 667, 'Y': 667, 'Z': 611,
  'a': 556, 'b': 556, 'c': 500, 'd': 556, 'e': 556, 'f': 278, 'g': 556, 'h': 556, 'i': 222, 'j': 222,
  'k': 500, 'l': 222, 'm': 833, 'n': 556, 'o': 556, 'p': 556, 'q': 556, 'r': 333, 's': 500, 't': 278,
  'u': 556, 'v': 500, 'w': 722, 'x': 500, 'y': 500, 'z': 500,
  'א': 611, 'ב': 556, 'ג': 500, 'ד': 556, 'ה': 556, 'ו': 278, 'ז': 333, 'ח': 556, 'ט': 556, 'י': 278,
  'ך': 444, 'כ': 556, 'ל': 556, 'ם': 667, 'מ': 667, 'ן': 278, 'נ': 556, 'ס': 556, 'ע': 611, 'ף': 444,
  'פ': 556, 'ץ': 444, 'צ': 556, 'ק': 556, 'ר': 556, 'ש': 722, 'ת': 556
};

function getCharWidth(c) {
  return ARIAL_WIDTHS[c] || 500;
}

/**
 * Checks if a token is a valid chord symbol.
 * Handles parentheses or brackets around chords, e.g. (Am) or [C#].
 * @param {string} token 
 * @returns {boolean}
 */
function isValidChordToken(token) {
  const clean = token.replace(/[()\[\]*~]/g, '').trim();
  if (clean === '') return false;
  
  // Check if it's a known symbol, including repeat indicators (e.g. x2, X4, //x2, 2x) or common instrumental words
  if (/^[||\-xX/+&0-9~\u2013\u2014*]+$/.test(clean)) return true;
  if (/^(?:Solo|Drums|Mute|Bass|Guitar|Stop|Play)$/i.test(clean)) return true;
  
  // Try to parse it as a chord
  return transposer.parseChord(clean) !== null;
}

// Prefix patterns for Hebrew and English intro / instrumental / outro lines
const INTRO_PREFIX_REGEX = /^(פתיחה|מעבר|סולו|סיום|מבוא|אינטרו|קודה|Intro|Outro|Solo|Bridge|Bass|BASS|Guitar|Drums|Flute|Violin|Coda|Mute)\s*:?\s*/i;

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
      // If a word is long and not a chord or symbol, this is likely a lyrics line
      const cleanToken = token.replace(/[()\[\].,!?;:"' Israel]/g, '').trim();
      if (cleanToken.length > 2) {
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
 * Aligns a chord line with a lyric line by breaking them into segments.
 * @param {string} chordLine 
 * @param {string} lyricLine 
 * @returns {Array<{chord: string|null, text: string}>}
 */
function alignChordsAndLyrics(chordLine, lyricLine) {
  const isRTL = detectHebrew(lyricLine);
  const lyricLen = lyricLine ? lyricLine.length : 0;
  
  if (lyricLen === 0) {
    const chords = extractChords(chordLine);
    return chords.map(c => ({
      text: '',
      chords: [{ chord: c.text, offset: c.index * 500 }]
    }));
  }
  
  // 1. Tokenize lyric line into word/space segments
  const tokenRegex = /\S+|\s+/g;
  let match;
  const tokens = [];
  while ((match = tokenRegex.exec(lyricLine)) !== null) {
    tokens.push({
      text: match[0],
      start: match.index,
      end: tokenRegex.lastIndex
    });
  }
  
  // 2. Compute visual offsets
  const chordOffsets = [0];
  let currentChordOffset = 0;
  for (let i = 0; i < chordLine.length; i++) {
    currentChordOffset += getCharWidth(chordLine[i]);
    chordOffsets.push(currentChordOffset);
  }
  const chordWidth = currentChordOffset;
  
  const lyricOffsets = [0];
  let currentLyricOffset = 0;
  let jIdx = 0;
  while (jIdx < lyricLine.length) {
    if (lyricLine.substring(jIdx, jIdx + 2) === '**' || lyricLine.substring(jIdx, jIdx + 2) === '==') {
      lyricOffsets.push(currentLyricOffset);
      lyricOffsets.push(currentLyricOffset);
      jIdx += 2;
    } else {
      currentLyricOffset += getCharWidth(lyricLine[jIdx]);
      lyricOffsets.push(currentLyricOffset);
      jIdx++;
    }
  }
  const lyricWidth = currentLyricOffset;
  
  const scale = chordWidth > lyricWidth ? lyricWidth / chordWidth : 1.0;
  
  const chords = extractChords(chordLine);
  const mappedChords = chords.map(chord => {
    const chordOffset = chordOffsets[chord.index] * scale;
    
    // Adjust offset for RTL right-alignment (scaling chordWidth correctly)
    const chordOffsetAdjusted = isRTL ? (chordOffset + (lyricWidth - chordWidth * scale)) : chordOffset;
    
    let minDiff = Infinity;
    let closestIdx = 0;
    for (let j = 0; j < lyricOffsets.length; j++) {
      const targetOffset = isRTL ? (lyricWidth - lyricOffsets[j]) : lyricOffsets[j];
      const diff = Math.abs(targetOffset - chordOffsetAdjusted);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = j;
      }
    }
    
    return {
      text: chord.text,
      index: Math.min(lyricLen - 1, closestIdx),
      targetOffset: chordOffsetAdjusted
    };
  });
  
  // 3. Build output segments by matching chords to tokens
  const outputSegments = tokens.map(token => {
    const tokenChords = [];
    const tokenWidth = lyricOffsets[token.end] - lyricOffsets[token.start];
    const tokenStartOffset = isRTL ? (lyricWidth - lyricOffsets[token.end]) : lyricOffsets[token.start];
    
    mappedChords.forEach(mc => {
      if (mc.index >= token.start && mc.index < token.end) {
        let offsetInToken = mc.targetOffset - tokenStartOffset;
        if (offsetInToken < 0) offsetInToken = 0;
        if (offsetInToken > tokenWidth) offsetInToken = tokenWidth;
        
        tokenChords.push({
          chord: mc.text,
          offset: offsetInToken
        });
      }
    });
    
    tokenChords.sort((a, b) => a.offset - b.offset);
    
    return {
      text: token.text,
      chords: tokenChords
    };
  });
  
  return outputSegments;
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
        // Aligned pair!
        const alignedSegments = alignChordsAndLyrics(line, nextLine);
        currentParagraph.lines.push({
          type: 'chord-lyric',
          segments: alignedSegments
        });
        i++; // skip next line as it is consumed
      } else {
        // Chord line with no lyrics following it (instrumental / intro line)
        const alignedSegments = alignChordsAndLyrics(line, '');
        currentParagraph.lines.push({
          type: 'chord-only',
          rawLine: line,
          segments: alignedSegments
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
  module.exports = { parseSongText, isChordLine, isHeaderLine, alignChordsAndLyrics, detectHebrew, extractChords, getCharWidth };
} else {
  window.SongParser = { parseSongText, isChordLine, isHeaderLine, alignChordsAndLyrics, detectHebrew, extractChords, getCharWidth };
}
