/**
 * chord-db.js
 * Database of guitar chord fingerings and dynamic SVG chord chart renderer.
 */

// Enharmonic equivalences for lookup fallback
const ENHARMONIC_MAP = {
  'C#': 'Db', 'Db': 'C#',
  'D#': 'Eb', 'Eb': 'D#',
  'F#': 'Gb', 'Gb': 'F#',
  'G#': 'Ab', 'Ab': 'G#',
  'A#': 'Bb', 'Bb': 'A#',
  'A#m': 'Bbm', 'Bbm': 'A#m',
  'C#m': 'Dbm', 'Dbm': 'C#m',
  'D#m': 'Ebm', 'Ebm': 'D#m',
  'F#m': 'Gbm', 'Gbm': 'F#m',
  'G#m': 'Abm', 'Abm': 'G#m',
};

const GUITAR_CHORDS = {
  // Major chords
  'C':   { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  'C#':  { frets: [-1, 4, 6, 6, 6, 4], fingers: [0, 1, 2, 3, 4, 1], barre: 4 },
  'Db':  { frets: [-1, 4, 6, 6, 6, 4], fingers: [0, 1, 2, 3, 4, 1], barre: 4 },
  'D':   { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  'D#':  { frets: [-1, 6, 8, 8, 8, 6], fingers: [0, 1, 2, 3, 4, 1], barre: 6 },
  'Eb':  { frets: [-1, 6, 8, 8, 8, 6], fingers: [0, 1, 2, 3, 4, 1], barre: 6 },
  'E':   { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  'F':   { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barre: 1 },
  'F#':  { frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], barre: 2 },
  'Gb':  { frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], barre: 2 },
  'G':   { frets: [3, 2, 0, 0, 0, 3], fingers: [3, 2, 0, 0, 0, 4] },
  'G#':  { frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], barre: 4 },
  'Ab':  { frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], barre: 4 },
  'A':   { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  'A#':  { frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1], barre: 1 },
  'Bb':  { frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1], barre: 1 },
  'B':   { frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1], barre: 2 },

  // Minor chords
  'Cm':  { frets: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1], barre: 3 },
  'C#m': { frets: [-1, 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1], barre: 4 },
  'Dbm': { frets: [-1, 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1], barre: 4 },
  'Dm':  { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  'D#m': { frets: [-1, 6, 8, 8, 7, 6], fingers: [0, 1, 3, 4, 2, 1], barre: 6 },
  'Ebm': { frets: [-1, 6, 8, 8, 7, 6], fingers: [0, 1, 3, 4, 2, 1], barre: 6 },
  'Em':  { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  'Fm':  { frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], barre: 1 },
  'F#m': { frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], barre: 2 },
  'Gbm': { frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], barre: 2 },
  'Gm':  { frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], barre: 3 },
  'G#m': { frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1], barre: 4 },
  'Abm': { frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1], barre: 4 },
  'Am':  { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  'A#m': { frets: [-1, 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1], barre: 1 },
  'Bbm': { frets: [-1, 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1], barre: 1 },
  'Bm':  { frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], barre: 2 },

  // Seventh chords
  'C7':   { frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
  'C#7':  { frets: [-1, 4, 6, 4, 6, 4], fingers: [0, 1, 3, 1, 4, 1], barre: 4 },
  'Db7':  { frets: [-1, 4, 6, 4, 6, 4], fingers: [0, 1, 3, 1, 4, 1], barre: 4 },
  'D7':   { frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  'D#7':  { frets: [-1, 6, 8, 6, 8, 6], fingers: [0, 1, 3, 1, 4, 1], barre: 6 },
  'Eb7':  { frets: [-1, 6, 8, 6, 8, 6], fingers: [0, 1, 3, 1, 4, 1], barre: 6 },
  'E7':   { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  'F7':   { frets: [1, 3, 1, 2, 1, 1], fingers: [1, 3, 1, 2, 1, 1], barre: 1 },
  'F#7':  { frets: [2, 4, 2, 3, 2, 2], fingers: [1, 3, 1, 2, 1, 1], barre: 2 },
  'Gb7':  { frets: [2, 4, 2, 3, 2, 2], fingers: [1, 3, 1, 2, 1, 1], barre: 2 },
  'G7':   { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  'G#7':  { frets: [4, 6, 4, 5, 4, 4], fingers: [1, 3, 1, 2, 1, 1], barre: 4 },
  'Ab7':  { frets: [4, 6, 4, 5, 4, 4], fingers: [1, 3, 1, 2, 1, 1], barre: 4 },
  'A7':   { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 1, 0, 2, 0] },
  'A#7':  { frets: [-1, 1, 3, 1, 3, 1], fingers: [0, 1, 3, 1, 4, 1], barre: 1 },
  'Bb7':  { frets: [-1, 1, 3, 1, 3, 1], fingers: [0, 1, 3, 1, 4, 1], barre: 1 },
  'B7':   { frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },

  // Minor Seventh chords
  'Cm7':  { frets: [-1, 3, 5, 3, 4, 3], fingers: [0, 1, 3, 1, 2, 1], barre: 3 },
  'C#m7': { frets: [-1, 4, 6, 4, 5, 4], fingers: [0, 1, 3, 1, 2, 1], barre: 4 },
  'Dbm7': { frets: [-1, 4, 6, 4, 5, 4], fingers: [0, 1, 3, 1, 2, 1], barre: 4 },
  'Dm7':  { frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1], barre: 1 },
  'Ebm7': { frets: [-1, 6, 8, 6, 7, 6], fingers: [0, 1, 3, 1, 2, 1], barre: 6 },
  'Em7':  { frets: [0, 2, 0, 0, 0, 0], fingers: [0, 1, 0, 0, 0, 0] },
  'Fm7':  { frets: [1, 3, 1, 1, 1, 1], fingers: [1, 3, 1, 1, 1, 1], barre: 1 },
  'F#m7': { frets: [2, 4, 2, 2, 2, 2], fingers: [1, 3, 1, 1, 1, 1], barre: 2 },
  'Gbm7': { frets: [2, 4, 2, 2, 2, 2], fingers: [1, 3, 1, 1, 1, 1], barre: 2 },
  'Gm7':  { frets: [3, 5, 3, 3, 3, 3], fingers: [1, 3, 1, 1, 1, 1], barre: 3 },
  'Am7':  { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
  'Bm7':  { frets: [-1, 2, 4, 2, 3, 2], fingers: [0, 1, 3, 1, 2, 1], barre: 2 },

  // Diminished chords
  'Cdim':   { frets: [-1, 3, 4, 2, 4, -1], fingers: [0, 2, 3, 1, 4, 0] },
  'C#dim':  { frets: [-1, 4, 5, 3, 5, -1], fingers: [0, 2, 3, 1, 4, 0] },
  'Dbdim':  { frets: [-1, 4, 5, 3, 5, -1], fingers: [0, 2, 3, 1, 4, 0] },
  'Ddim':   { frets: [-1, -1, 0, 1, 0, 1], fingers: [0, 0, 0, 1, 0, 2] },
  'D#dim':  { frets: [-1, 6, 7, 5, 7, -1], fingers: [0, 2, 3, 1, 4, 0] },
  'Ebdim':  { frets: [-1, 6, 7, 5, 7, -1], fingers: [0, 2, 3, 1, 4, 0] },
  'Edim':   { frets: [-1, -1, 2, 3, 2, 3], fingers: [0, 0, 1, 2, 3, 4] },
  'Fdim':   { frets: [-1, -1, 3, 4, 3, 4], fingers: [0, 0, 1, 2, 3, 4] },
  'F#dim':  { frets: [-1, -1, 4, 5, 4, 5], fingers: [0, 0, 1, 2, 3, 4] },
  'Gbdim':  { frets: [-1, -1, 4, 5, 4, 5], fingers: [0, 0, 1, 2, 3, 4] },
  'Gdim':   { frets: [-1, -1, 5, 6, 5, 6], fingers: [0, 0, 1, 2, 3, 4] },
  'G#dim':  { frets: [-1, -1, 6, 7, 6, 7], fingers: [0, 0, 1, 2, 3, 4] },
  'Abdim':  { frets: [-1, -1, 6, 7, 6, 7], fingers: [0, 0, 1, 2, 3, 4] },
  'Adim':   { frets: [-1, 0, 1, 2, 1, -1], fingers: [0, 0, 1, 2, 3, 0] },
  'A#dim':  { frets: [-1, 1, 2, 0, 2, -1], fingers: [0, 1, 2, 0, 3, 0] },
  'Bbdim':  { frets: [-1, 1, 2, 0, 2, -1], fingers: [0, 1, 2, 0, 3, 0] },
  'Bdim':   { frets: [-1, 2, 3, 1, 3, -1], fingers: [0, 2, 3, 1, 4, 0] }
};

/**
 * Normalizes a chord name for database lookup.
 * Strips parentheses, brackets, and tries enharmonic equivalents if not found.
 * @param {string} chordName 
 * @returns {object|null} The chord data from the database
 */
function getChordData(chordName) {
  if (!chordName) return null;
  
  // Strip parentheses and brackets, plus trim
  let name = chordName.replace(/[()\[\]]/g, '').trim();
  
  // Strip bass note for diagram (e.g. C/E -> C)
  if (name.includes('/')) {
    name = name.split('/')[0];
  }
  
  // Intercept trailing 'o' or 'O' indicating diminished chords (e.g. Co / CO -> Cdim)
  if (name.endsWith('o') || name.endsWith('O')) {
    name = name.slice(0, -1) + 'dim';
  }
  
  // Direct lookup
  if (GUITAR_CHORDS[name]) {
    return { name, ...GUITAR_CHORDS[name] };
  }
  
  // Try enharmonic equivalent
  const enharmonicName = ENHARMONIC_MAP[name];
  if (enharmonicName && GUITAR_CHORDS[enharmonicName]) {
    return { name: enharmonicName, ...GUITAR_CHORDS[enharmonicName] };
  }
  
  // Fallbacks: If it's a sus4, add9, maj7, etc. - fall back to the base major/minor chord for display
  const baseMatch = name.match(/^([A-G][b#]?m?)/);
  if (baseMatch) {
    const baseChordName = baseMatch[1];
    if (GUITAR_CHORDS[baseChordName]) {
      return { name: baseChordName, ...GUITAR_CHORDS[baseChordName], fallback: true };
    }
    const baseEnharmonic = ENHARMONIC_MAP[baseChordName];
    if (baseEnharmonic && GUITAR_CHORDS[baseEnharmonic]) {
      return { name: baseEnharmonic, ...GUITAR_CHORDS[baseEnharmonic], fallback: true };
    }
  }
  
  return null;
}

/**
 * Renders an SVG representation of a guitar chord chart.
 * SVG Size is standard: 130px width, 150px height.
 * @param {string} chordName - The chord string (e.g. "C", "F#m", "D/F#")
 * @returns {string} HTML string containing the SVG, or an empty placeholder.
 */
function renderChordSVG(chordName) {
  const data = getChordData(chordName);
  if (!data) {
    return `<div class="chord-not-found">No diagram for ${chordName}</div>`;
  }
  
  const { frets, fingers, barre } = data;
  
  // Setup SVG size and layout dimensions
  const width = 130;
  const height = 150;
  
  // Chart geometry constants
  const startX = 25;  // X coordinate of first string (6th string, Low E)
  const spacingX = 16; // Distance between strings
  const startY = 30;  // Y coordinate of nut (or top fret line)
  const spacingY = 22; // Distance between frets
  const numFrets = 4;  // Number of frets to show
  
  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="chord-svg">`;
  
  // 1. Draw Chord Title
  svg += `<text x="${width / 2}" y="18" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="bold" font-size="14" fill="var(--text-color, #1e293b)">${chordName}</text>`;
  
  // Find start fret position
  let startFret = 1;
  if (barre && barre > 1) {
    startFret = barre;
  } else {
    // Check if we need to shift frets up
    const maxFret = Math.max(...frets);
    if (maxFret > 4) {
      // Find the minimum non-zero fret
      const nonZeroFrets = frets.filter(f => f > 0);
      const minFret = Math.min(...nonZeroFrets);
      startFret = minFret;
    }
  }
  
  // Draw starting fret number if not 1
  if (startFret > 1) {
    svg += `<text x="${startX - 12}" y="${startY + 15}" font-family="system-ui, sans-serif" font-size="10" font-weight="bold" fill="var(--text-color, #64748b)" text-anchor="end">${startFret}fr</text>`;
  }
  
  // 2. Draw Nut (Thick line if startFret is 1, thin otherwise)
  const nutStrokeWidth = startFret === 1 ? 4 : 1;
  svg += `<line x1="${startX}" y1="${startY}" x2="${startX + spacingX * 5}" y2="${startY}" stroke="var(--text-color, #1e293b)" stroke-width="${nutStrokeWidth}" />`;
  
  // 3. Draw Fretboard grid
  // Horizontal lines (frets)
  for (let i = 1; i <= numFrets; i++) {
    const y = startY + spacingY * i;
    svg += `<line x1="${startX}" y1="${y}" x2="${startX + spacingX * 5}" y2="${y}" stroke="var(--border-color, #94a3b8)" stroke-width="1" />`;
  }
  // Vertical lines (strings)
  for (let i = 0; i < 6; i++) {
    const x = startX + spacingX * i;
    svg += `<line x1="${x}" y1="${startY}" x2="${x}" y2="${startY + spacingY * numFrets}" stroke="var(--border-color, #94a3b8)" stroke-width="1.2" />`;
  }
  
  // 4. Draw Open (O) and Muted (X) indicators above the nut
  for (let stringIdx = 0; stringIdx < 6; stringIdx++) {
    const fret = frets[stringIdx];
    const x = startX + spacingX * stringIdx;
    const y = startY - 6;
    
    if (fret === -1) {
      // Muted string (draw X)
      svg += `<text x="${x}" y="${y}" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" fill="var(--muted-color, #ef4444)" text-anchor="middle">×</text>`;
    } else if (fret === 0) {
      // Open string (draw O)
      svg += `<circle cx="${x}" cy="${y - 3}" r="3" stroke="var(--text-color, #475569)" stroke-width="1.2" fill="none" />`;
    }
  }
  
  // 5. Draw Barre chord line if present
  if (barre) {
    // Find strings covered by the barre (usually from the first non-muted string to the 1st string)
    let firstBarredString = 0;
    for (let s = 0; s < 6; s++) {
      if (frets[s] >= barre) {
        firstBarredString = s;
        break;
      }
    }
    
    const barreY = startY + spacingY * (barre - startFret) + spacingY / 2;
    const x1 = startX + spacingX * firstBarredString;
    const x2 = startX + spacingX * 5;
    
    // Draw barre bar (rounded line)
    svg += `<rect x="${x1 - 4}" y="${barreY - 4}" width="${(x2 - x1) + 8}" height="8" rx="4" fill="var(--accent-color, #3b82f6)" opacity="0.85" />`;
  }
  
  // 6. Draw Finger position dots
  for (let stringIdx = 0; stringIdx < 6; stringIdx++) {
    const fret = frets[stringIdx];
    // Skip open or muted strings
    if (fret <= 0) continue;
    
    // If it's a barred fret, and this is part of the barre line, we don't draw a separate dot if it's the barre finger
    const finger = fingers ? fingers[stringIdx] : 0;
    
    // Calculate dot position
    const cx = startX + spacingX * stringIdx;
    const cy = startY + spacingY * (fret - startFret) + spacingY / 2;
    
    svg += `<circle cx="${cx}" cy="${cy}" r="6.5" fill="var(--accent-color, #2563eb)" />`;
    
    // Draw finger number inside the dot
    if (finger > 0) {
      svg += `<text x="${cx}" y="${cy + 3.5}" font-family="system-ui, sans-serif" font-size="9.5" font-weight="bold" fill="#ffffff" text-anchor="middle">${finger}</text>`;
    }
  }
  
  // Add indicator if it's a fallback diagram
  if (data.fallback) {
    svg += `<text x="${width / 2}" y="${height - 3}" font-family="system-ui, sans-serif" font-size="8" fill="var(--muted-color, #64748b)" text-anchor="middle" font-style="italic">Simplified diagram shown</text>`;
  }
  
  svg += `</svg>`;
  return svg;
}

// Semitone mapping for piano notes calculations
const ROOT_MAP = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
  'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};

const QUALITY_INTERVALS = {
  '': [0, 4, 7],         // Major
  'm': [0, 3, 7],        // Minor
  'min': [0, 3, 7],      // Minor
  '7': [0, 4, 7, 10],    // Dominant 7th
  'm7': [0, 3, 7, 10],   // Minor 7th
  'min7': [0, 3, 7, 10], // Minor 7th
  'maj7': [0, 4, 7, 11], // Major 7th
  'dim': [0, 3, 6],      // Diminished
  'dim7': [0, 3, 6, 9],  // Diminished 7th
  'sus4': [0, 5, 7],     // Suspended 4th
  'sus': [0, 5, 7],      // Suspended 4th (default)
  'sus2': [0, 2, 7],     // Suspended 2nd
  'add9': [0, 4, 7, 14], // Added 9th
  'madd9': [0, 3, 7, 14],// Minor added 9th
  '6': [0, 4, 7, 9],     // Major 6th
  'm6': [0, 3, 7, 9],    // Minor 6th
  '9': [0, 4, 7, 10, 14], // Dominant 9th
  'm9': [0, 3, 7, 10, 14], // Minor 9th
  '5': [0, 7],           // Power chord
  'aug': [0, 4, 8]       // Augmented
};

/**
 * Resolves a chord name to its absolute note values on a 2-octave range (0 to 24).
 * @param {string} chordName 
 * @returns {object|null} { root, quality, notes }
 */
function parseChordNotes(chordName) {
  if (!chordName) return null;
  let name = chordName.replace(/[()\[\]]/g, '').trim();
  
  // Strip bass note for diagram (e.g. C/E -> C)
  if (name.includes('/')) {
    name = name.split('/')[0];
  }
  
  // Intercept trailing 'o' or 'O' indicating diminished chords (e.g. Co / CO -> Cdim)
  if (name.endsWith('o') || name.endsWith('O')) {
    name = name.slice(0, -1) + 'dim';
  }

  // Regex to match root note
  const match = name.match(/^([A-G][b#]?)(.*)$/);
  if (!match) return null;
  
  const root = match[1];
  const quality = match[2];
  
  const rootIndex = ROOT_MAP[root];
  if (rootIndex === undefined) return null;
  
  let intervals = QUALITY_INTERVALS[quality];
  if (!intervals) {
    // Check fallback prefixes
    if (quality.startsWith('m7') || quality.startsWith('min7')) {
      intervals = QUALITY_INTERVALS['m7'];
    } else if (quality.startsWith('m') || quality.startsWith('min')) {
      intervals = QUALITY_INTERVALS['m'];
    } else if (quality.startsWith('7')) {
      intervals = QUALITY_INTERVALS['7'];
    } else if (quality.startsWith('maj7')) {
      intervals = QUALITY_INTERVALS['maj7'];
    } else if (quality.startsWith('dim')) {
      intervals = QUALITY_INTERVALS['dim'];
    } else if (quality.startsWith('sus2')) {
      intervals = QUALITY_INTERVALS['sus2'];
    } else if (quality.startsWith('sus')) {
      intervals = QUALITY_INTERVALS['sus'];
    } else if (quality.startsWith('add9')) {
      intervals = QUALITY_INTERVALS['add9'];
    } else if (quality.startsWith('aug')) {
      intervals = QUALITY_INTERVALS['aug'];
    } else {
      intervals = QUALITY_INTERVALS['']; // Default Major
    }
  }
  
  // Map root + intervals to absolute note indices on 2-octave keyboard (0 to 24)
  const notes = intervals.map(interval => {
    let note = rootIndex + interval;
    // Keep within 0 to 24 (wrap down if >= 24)
    if (note >= 24) {
      note = note - 12;
    }
    return note;
  });
  
  return { root, quality, notes };
}

/**
 * Renders an SVG representation of a 2-octave piano keyboard with highlighted notes.
 * Width is 230px, height is 100px.
 * @param {string} chordName 
 * @returns {string} HTML/SVG markup
 */
function renderPianoSVG(chordName) {
  const parsed = parseChordNotes(chordName);
  if (!parsed) {
    return `<div class="chord-not-found">No diagram for ${chordName}</div>`;
  }
  
  const { notes } = parsed;
  
  // Layout Constants
  const width = 230;
  const height = 100;
  const startX = 10;
  const startY = 30;
  const whiteKeyWidth = 14;
  const whiteKeyHeight = 60;
  
  const blackKeyWidth = 8;
  const blackKeyHeight = 38;
  
  // 15 white keys map to semitone values:
  const whiteKeyNotes = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
  
  // Black keys positions relative to white key index (centered between white keys)
  const blackKeys = [
    { leftOfWhiteKey: 1, note: 1 },  // between C and D (w=0 and w=1)
    { leftOfWhiteKey: 2, note: 3 },  // between D and E (w=1 and w=2)
    { leftOfWhiteKey: 4, note: 6 },  // between F and G (w=3 and w=4)
    { leftOfWhiteKey: 5, note: 8 },  // between G and A (w=4 and w=5)
    { leftOfWhiteKey: 6, note: 10 }, // between A and B (w=5 and w=6)
    { leftOfWhiteKey: 8, note: 13 }, // between C and D (w=7 and w=8)
    { leftOfWhiteKey: 9, note: 15 }, // between D and E (w=8 and w=9)
    { leftOfWhiteKey: 11, note: 18 },// between F and G (w=10 and w=11)
    { leftOfWhiteKey: 12, note: 20 },// between G and A (w=11 and w=12)
    { leftOfWhiteKey: 13, note: 22 } // between A and B (w=12 and w=13)
  ];
  
  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="chord-svg">`;
  
  // Title
  svg += `<text x="${width / 2}" y="18" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="bold" font-size="14" fill="var(--text-color, #1e293b)">${chordName}</text>`;
  
  // Render White Keys
  for (let i = 0; i < 15; i++) {
    const keyNote = whiteKeyNotes[i];
    const isHighlighted = notes.includes(keyNote);
    const fill = isHighlighted ? 'var(--accent-color, #2563eb)' : '#ffffff';
    const stroke = 'var(--border-color, #94a3b8)';
    const x = startX + i * whiteKeyWidth;
    
    // Draw white key rect
    svg += `<rect x="${x}" y="${startY}" width="${whiteKeyWidth}" height="${whiteKeyHeight}" fill="${fill}" stroke="${stroke}" stroke-width="1.2" rx="2" />`;
    
    // Draw dot on highlighted white keys
    if (isHighlighted) {
      svg += `<circle cx="${x + whiteKeyWidth / 2}" cy="${startY + whiteKeyHeight - 8}" r="2.5" fill="#ffffff" />`;
    }
  }
  
  // Render Black Keys (drawn on top of white keys)
  for (let k = 0; k < blackKeys.length; k++) {
    const bk = blackKeys[k];
    const isHighlighted = notes.includes(bk.note);
    const fill = isHighlighted ? 'var(--accent-color, #2563eb)' : '#1e293b';
    const stroke = '#000000';
    const x = startX + bk.leftOfWhiteKey * whiteKeyWidth - blackKeyWidth / 2;
    
    // Draw black key rect
    svg += `<rect x="${x}" y="${startY}" width="${blackKeyWidth}" height="${blackKeyHeight}" fill="${fill}" stroke="${stroke}" stroke-width="1" rx="1.5" />`;
    
    // Draw dot on highlighted black keys
    if (isHighlighted) {
      svg += `<circle cx="${x + blackKeyWidth / 2}" cy="${startY + blackKeyHeight - 6}" r="2" fill="#ffffff" />`;
    }
  }
  
  svg += `</svg>`;
  return svg;
}

/**
 * Renders either a guitar fretboard diagram or a piano keyboard diagram.
 * @param {string} chordName 
 * @param {string} instrument - 'guitar' or 'piano'
 * @returns {string} HTML/SVG markup
 */
function renderChordDiagram(chordName, instrument = 'guitar') {
  if (instrument === 'piano') {
    return renderPianoSVG(chordName);
  }
  return renderChordSVG(chordName);
}

// Export for ES modules and window global if loaded directly in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GUITAR_CHORDS, getChordData, renderChordSVG, renderPianoSVG, renderChordDiagram };
} else {
  window.ChordDB = { GUITAR_CHORDS, getChordData, renderChordSVG, renderPianoSVG, renderChordDiagram };
}
