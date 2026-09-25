/**
 * musicxml-tools.js
 * Pure MusicXML helpers behind the score editor: decode/encode the
 * [MUSICXML: data:...] attachment payload, transpose a whole score, and
 * read back / write back the chord symbols and lyrics a user may edit.
 *
 * Classic script, no modules. Needs only DOMParser/XMLSerializer, the JSZip
 * global (compressed .mxl) and window.Transposer (house chord spelling).
 */
(function () {
  'use strict';

  const MUSICXML_MIME = 'application/vnd.recordare.musicxml+xml';

  // Same start-of-text test app.js applies before handing text to OSMD.
  const MUSICXML_START = /^\s*(<\?xml|<!DOCTYPE\s+score|<score-partwise|<score-timewise)/i;

  const STEP_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const STEP_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // Diatonic steps spanned by an upward chromatic shift of 0..11 semitones.
  // Spelling by generic interval keeps a transposed line readable (a third
  // stays a third) instead of collapsing everything onto one accidental.
  const DIATONIC_STEPS = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];

  // <kind> value -> suffix shown after the root. These are the labels OSMD
  // itself draws, so extractEditable() reads what the user sees on screen.
  const KIND_TO_SUFFIX = {
    'major': '', 'minor': 'm', 'dominant': '7', 'major-seventh': 'maj7',
    'minor-seventh': 'm7', 'diminished': 'dim', 'augmented': 'aug',
    'suspended-fourth': 'sus4', 'suspended-second': 'sus2', 'major-sixth': '6',
    'minor-sixth': 'm6', 'dominant-ninth': '9', 'half-diminished': 'm7b5',
    'diminished-seventh': 'dim7', 'major-ninth': 'maj9', 'minor-ninth': 'm9',
    'power': '5', 'none': 'N.C.', 'other': '',
    'augmented-seventh': 'aug7', 'major-minor': 'm(maj7)',
    'dominant-11th': '11', 'major-11th': 'maj11', 'minor-11th': 'm11',
    'dominant-13th': '13', 'major-13th': 'maj13', 'minor-13th': 'm13'
  };

  // Suffix (as typed) -> <kind>. The inverse of the table above plus the
  // common aliases people actually type. Anything else keeps the existing
  // kind: OSMD 1.8.8 ignores <kind text> when it draws the symbol (it only
  // reads "aug"/"dim" from it), so an unknown suffix cannot be shown anyway.
  const SUFFIX_TO_KIND = {};
  Object.keys(KIND_TO_SUFFIX).forEach((kind) => {
    if (kind === 'other') return;
    const suffix = KIND_TO_SUFFIX[kind];
    if (!(suffix in SUFFIX_TO_KIND)) SUFFIX_TO_KIND[suffix] = kind;
  });
  Object.assign(SUFFIX_TO_KIND, {
    'M': 'major', 'maj': 'major', 'min': 'minor', '-': 'minor',
    'M7': 'major-seventh', 'Δ': 'major-seventh', 'Δ7': 'major-seventh',
    'min7': 'minor-seventh', '-7': 'minor-seventh',
    'o': 'diminished', 'O': 'diminished', '°': 'diminished',
    'o7': 'diminished-seventh', '°7': 'diminished-seventh',
    '+': 'augmented', '+7': 'augmented-seventh', '7+': 'augmented-seventh', '7#5': 'augmented-seventh',
    'ø': 'half-diminished', 'ø7': 'half-diminished', 'min7b5': 'half-diminished',
    'sus': 'suspended-fourth', 'maj6': 'major-sixth', 'min6': 'minor-sixth',
    'M9': 'major-ninth', 'min9': 'minor-ninth',
    'mmaj7': 'major-minor', 'minmaj7': 'major-minor', 'mM7': 'major-minor',
    'NC': 'none', 'N.C': 'none', 'nc': 'none', 'n.c.': 'none'
  });

  const transposer = () => {
    if (!window.Transposer) throw new Error('transposer.js must be loaded before musicxml-tools.js');
    return window.Transposer;
  };

  const mod = (n, m) => ((n % m) + m) % m;

  // ---------------------------------------------------------------------
  // Pure note math
  // ---------------------------------------------------------------------

  /** 'Bb' -> { step: 'B', alter: -1 }; null when not a note name. */
  function noteNameToStepAlter(name) {
    const m = /^\s*([A-Ga-g])([#b]*)\s*$/.exec(name || '');
    if (!m) return null;
    let alter = 0;
    for (const ch of m[2]) alter += ch === '#' ? 1 : -1;
    return { step: m[1].toUpperCase(), alter };
  }

  /** ('B', -1) -> 'Bb'. Alter is rounded; 0 gives the bare step. */
  function stepAlterToNoteName(step, alter) {
    const a = Math.round(Number(alter) || 0);
    return step + (a > 0 ? '#'.repeat(a) : 'b'.repeat(-a));
  }

  /**
   * Key signature after a shift: each semitone moves seven fifths. The
   * result is folded into -6..6, preferring the smaller magnitude; the tie
   * at six accidentals goes to +6 (F# rather than Gb).
   */
  function transposeFifths(fifths, semitones) {
    let f = mod(Math.round(Number(fifths) || 0) + 7 * semitones, 12);
    if (f > 6) f -= 12;
    return f;
  }

  /** Semitones above C0 for a MusicXML pitch (C4 = 48). */
  function pitchToSemitone(step, alter, octave) {
    return STEP_SEMITONES[step] + (Number(alter) || 0) + 12 * octave;
  }

  /** Chromatic respelling in the house scale: semitone -> { step, alter, octave }. */
  function houseSpelling(semitone) {
    const name = transposer().transposeNote('C', mod(semitone, 12));
    const parts = noteNameToStepAlter(name);
    return { step: parts.step, alter: parts.alter, octave: Math.floor(semitone / 12) };
  }

  /**
   * Transposes one pitch by generic interval (see DIATONIC_STEPS). Returns
   * { step, alter, octave }; alter is 0 rather than absent. Falls back to a
   * chromatic house spelling when the interval would need a triple accidental.
   */
  function transposePitch(step, alter, octave, semitones) {
    const target = pitchToSemitone(step, alter, octave) + semitones;
    if (semitones === 0) return { step, alter: Number(alter) || 0, octave };

    // A downward shift is the complementary upward one, an octave lower.
    const up = mod(semitones, 12);
    const octaveCarry = Math.floor(semitones / 12);
    const totalStep = STEP_NAMES.indexOf(step) + DIATONIC_STEPS[up];
    const newStep = STEP_NAMES[mod(totalStep, 7)];
    const newOctave = octave + Math.floor(totalStep / 7) + octaveCarry;
    const newAlter = target - pitchToSemitone(newStep, 0, newOctave);

    if (Math.abs(newAlter) > 2) return houseSpelling(target);
    return { step: newStep, alter: newAlter, octave: newOctave };
  }

  /**
   * Chord roots and basses do not spell by interval: they must read exactly
   * like the transposed lyric chords, i.e. through window.Transposer.
   * Names that transposeNote() does not know (E#, Cb, double accidentals)
   * are resolved by pitch class into the same house scale.
   */
  function transposeHouseNote(step, alter, semitones) {
    const T = transposer();
    const name = stepAlterToNoteName(step, alter);
    const out = T.transposeNote(name, semitones);
    if (out !== name || mod(semitones, 12) === 0) return noteNameToStepAlter(out);
    return noteNameToStepAlter(T.transposeNote('C', mod(STEP_SEMITONES[step] + (Number(alter) || 0) + semitones, 12)));
  }

  function normalizeSemitones(semitones) {
    const n = Math.round(Number(semitones));
    if (!Number.isFinite(n)) throw new RangeError('semitones must be a number');
    if (n < -11 || n > 11) throw new RangeError('semitones must be within -11..11');
    return n;
  }

  // ---------------------------------------------------------------------
  // XML plumbing
  // ---------------------------------------------------------------------

  function stripBom(text) {
    return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  }

  function parserErrorMessage(doc) {
    const err = doc.getElementsByTagName('parsererror')[0];
    if (!err) return null;
    // Chrome nests the human-readable line inside a <div>; keep it short.
    const text = (err.textContent || 'XML parse error').replace(/\s+/g, ' ').trim();
    return text.length > 300 ? text.slice(0, 300) + '...' : text;
  }

  /** Parses MusicXML text into a Document, remembering its XML declaration. */
  function parse(xml) {
    if (typeof xml !== 'string') throw new Error('MusicXML must be a string');
    const text = stripBom(xml);
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const err = parserErrorMessage(doc);
    if (err) throw new Error('Invalid XML: ' + err);
    const decl = /^\s*<\?xml[^>]*\?>/.exec(text);
    doc.__musicxmlDeclaration = decl ? decl[0].trim() : null;
    return doc;
  }

  /** XMLSerializer output with the original XML declaration kept in front. */
  function serialize(doc) {
    let out = new XMLSerializer().serializeToString(doc);
    if (!/^\s*<\?xml/.test(out)) {
      const decl = doc.__musicxmlDeclaration || '<?xml version="1.0" encoding="UTF-8"?>';
      out = decl + '\n' + out;
    }
    return out;
  }

  function validate(xml) {
    try {
      const doc = parse(xml);
      const root = doc.documentElement ? doc.documentElement.tagName : '';
      if (root !== 'score-partwise' && root !== 'score-timewise') {
        return { ok: false, error: 'Root element is <' + (root || '?') + '>, expected <score-partwise> or <score-timewise>' };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // Direct children only: MusicXML nests <note> inside <measure> and
  // <root-step> inside <root>, so tag lookups must not cross levels.
  function child(el, tag) {
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (c.tagName === tag) return c;
    }
    return null;
  }

  function children(el, tag) {
    const out = [];
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (c.tagName === tag) out.push(c);
    }
    return out;
  }

  function ancestor(el, tag) {
    for (let p = el.parentNode; p && p.nodeType === 1; p = p.parentNode) {
      if (p.tagName === tag) return p;
    }
    return null;
  }

  const isBlankText = (node) => node && node.nodeType === 3 && !node.textContent.trim();

  // Removal and insertion that keep the pretty-printed indentation intact,
  // so a saved file still diffs cleanly against the original.
  function removeElement(el) {
    if (isBlankText(el.previousSibling)) el.previousSibling.remove();
    el.remove();
  }

  function insertAfter(ref, el) {
    const parent = ref.parentNode;
    const next = ref.nextSibling;
    if (isBlankText(ref.previousSibling)) parent.insertBefore(ref.previousSibling.cloneNode(), next);
    parent.insertBefore(el, next);
  }

  function appendChildIndented(parent, el) {
    const last = parent.lastElementChild;
    if (last) return insertAfter(last, el);
    parent.appendChild(el);
  }

  /**
   * Writes `<tag>value</tag>` under parent, creating it after `afterTag` when
   * missing. A null value removes the element instead.
   */
  function setChildText(parent, tag, value, afterTag) {
    let el = child(parent, tag);
    if (value === null || value === undefined) {
      if (el) removeElement(el);
      return;
    }
    if (!el) {
      el = parent.ownerDocument.createElement(tag);
      const ref = afterTag ? child(parent, afterTag) : null;
      if (ref) insertAfter(ref, el); else appendChildIndented(parent, el);
    }
    el.textContent = String(value);
  }

  // Writes a step/alter pair; alter 0 drops the alter element entirely.
  function writeStepAlter(parent, stepTag, alterTag, step, alter) {
    setChildText(parent, stepTag, step);
    setChildText(parent, alterTag, alter ? alter : null, stepTag);
  }

  function readStepAlter(parent, stepTag, alterTag) {
    const stepEl = child(parent, stepTag);
    if (!stepEl) return null;
    const step = stepEl.textContent.trim().toUpperCase();
    if (!(step in STEP_SEMITONES)) return null;
    const alterEl = child(parent, alterTag);
    const alter = alterEl ? Math.round(parseFloat(alterEl.textContent) || 0) : 0;
    return { step, alter };
  }

  // ---------------------------------------------------------------------
  // transpose
  // ---------------------------------------------------------------------

  function transposeNoteElement(note, semitones) {
    const pitch = child(note, 'pitch');
    if (!pitch || child(note, 'rest') || child(note, 'unpitched')) return;
    const sa = readStepAlter(pitch, 'step', 'alter');
    const octaveEl = child(pitch, 'octave');
    if (!sa || !octaveEl) return;

    const octave = parseInt(octaveEl.textContent, 10);
    const t = transposePitch(sa.step, sa.alter, Number.isFinite(octave) ? octave : 4, semitones);
    writeStepAlter(pitch, 'step', 'alter', t.step, t.alter);
    octaveEl.textContent = String(t.octave);

    // Stale accidentals would contradict the new alter; OSMD re-derives them
    // from alter + key signature.
    children(note, 'accidental').forEach(removeElement);
  }

  function transposeKeyElement(key, semitones) {
    const fifths = child(key, 'fifths');
    if (fifths) {
      fifths.textContent = String(transposeFifths(parseInt(fifths.textContent, 10) || 0, semitones));
      const cancel = child(key, 'cancel');
      if (cancel) cancel.textContent = String(transposeFifths(parseInt(cancel.textContent, 10) || 0, semitones));
      return;
    }
    // Non-traditional key: a list of <key-step>/<key-alter> pairs. The alter
    // here is the accidental applied to that step, so shift each like a pitch.
    const steps = children(key, 'key-step');
    const alters = children(key, 'key-alter');
    steps.forEach((stepEl, i) => {
      const step = stepEl.textContent.trim().toUpperCase();
      if (!(step in STEP_SEMITONES)) return;
      const alterEl = alters[i] || null;
      const alter = alterEl ? Math.round(parseFloat(alterEl.textContent) || 0) : 0;
      const t = transposePitch(step, alter, 4, semitones);
      stepEl.textContent = t.step;
      if (alterEl) alterEl.textContent = String(t.alter);
      else if (t.alter) {
        const created = key.ownerDocument.createElement('key-alter');
        created.textContent = String(t.alter);
        insertAfter(stepEl, created);
      }
    });
  }

  function transposeHarmonyElement(harmony, semitones) {
    const pairs = [['root', 'root-step', 'root-alter'], ['bass', 'bass-step', 'bass-alter']];
    pairs.forEach(([tag, stepTag, alterTag]) => {
      const el = child(harmony, tag);
      if (!el) return;
      const sa = readStepAlter(el, stepTag, alterTag);
      if (!sa) return;
      const t = transposeHouseNote(sa.step, sa.alter, semitones);
      writeStepAlter(el, stepTag, alterTag, t.step, t.alter);
    });
  }

  /**
   * Returns a new MusicXML string shifted by `semitones`. Pitches spell by
   * generic interval, key signatures move along the circle of fifths, chord
   * symbols use the house spelling. Everything else is left byte-for-byte
   * alone apart from the accidentals of transposed notes. 0 returns the input.
   */
  function transpose(xml, semitones) {
    const n = normalizeSemitones(semitones);
    if (n === 0) return xml;
    const doc = parse(xml);

    Array.from(doc.getElementsByTagName('note')).forEach((note) => transposeNoteElement(note, n));
    Array.from(doc.getElementsByTagName('key')).forEach((key) => transposeKeyElement(key, n));
    Array.from(doc.getElementsByTagName('harmony')).forEach((h) => transposeHarmonyElement(h, n));

    return serialize(doc);
  }

  // ---------------------------------------------------------------------
  // extractEditable / applyEdits
  // ---------------------------------------------------------------------

  function locate(el) {
    const measure = ancestor(el, 'measure');
    const part = ancestor(el, 'part');
    return {
      measure: measure ? (measure.getAttribute('number') || '') : '',
      part: part ? (part.getAttribute('id') || '') : ''
    };
  }

  function harmonyNoteName(harmony, tag, stepTag, alterTag) {
    const el = child(harmony, tag);
    const sa = el ? readStepAlter(el, stepTag, alterTag) : null;
    return sa ? stepAlterToNoteName(sa.step, sa.alter) : null;
  }

  function describeHarmony(harmony, id) {
    const kindEl = child(harmony, 'kind');
    const kind = kindEl ? kindEl.textContent.trim() : '';
    const kindText = kindEl && kindEl.hasAttribute('text') ? kindEl.getAttribute('text') : null;
    const root = harmonyNoteName(harmony, 'root', 'root-step', 'root-alter') || '';
    const bass = harmonyNoteName(harmony, 'bass', 'bass-step', 'bass-alter');
    const suffix = kindText !== null ? kindText : (kind in KIND_TO_SUFFIX ? KIND_TO_SUFFIX[kind] : '');
    const loc = locate(harmony);
    return {
      id, measure: loc.measure, part: loc.part,
      text: root + suffix + (bass ? '/' + bass : ''),
      root, kind, kindText, bass
    };
  }

  function lyricText(lyric) {
    let text = '';
    for (let c = lyric.firstElementChild; c; c = c.nextElementSibling) {
      if (c.tagName === 'text' || c.tagName === 'elision') text += c.textContent;
    }
    return text;
  }

  function describeLyric(lyric, id) {
    const note = lyric.parentNode;
    const measure = ancestor(lyric, 'measure');
    const noteIndex = measure ? children(measure, 'note').indexOf(note) : -1;
    const syllabic = child(lyric, 'syllabic');
    const loc = locate(lyric);
    return {
      id, measure: loc.measure, part: loc.part, noteIndex,
      verse: lyric.getAttribute('number') || '1',
      text: lyricText(lyric),
      syllabic: syllabic ? syllabic.textContent.trim() : ''
    };
  }

  /**
   * Lists every chord symbol and lyric in document order. The `id` is that
   * element's position among its kind, which applyEdits() resolves against
   * the same unmodified document.
   */
  function extractEditable(xml) {
    const doc = parse(xml);
    return {
      chords: Array.from(doc.getElementsByTagName('harmony')).map(describeHarmony),
      lyrics: Array.from(doc.getElementsByTagName('lyric')).map(describeLyric)
    };
  }

  function applyChordEdit(harmony, text) {
    if (!text) return removeElement(harmony);
    const doc = harmony.ownerDocument;
    const T = transposer();
    let kindEl = child(harmony, 'kind');
    if (!kindEl) {
      kindEl = doc.createElement('kind');
      kindEl.textContent = 'major';
      const root = child(harmony, 'root') || child(harmony, 'function');
      if (root) insertAfter(root, kindEl); else appendChildIndented(harmony, kindEl);
    }

    if (/^n\.?c\.?$/i.test(text)) {
      kindEl.textContent = 'none';
      kindEl.setAttribute('text', 'N.C.');
      return;
    }

    const parsed = T.parseChord(text);
    if (!parsed || parsed.isSplit || !noteNameToStepAlter(parsed.root)) {
      // Not something the chord grammar understands ("INTRO", "Fm-Bbm"):
      // record it verbatim and leave the pitches as they were.
      kindEl.setAttribute('text', text);
      return;
    }

    let root = child(harmony, 'root');
    if (!root) {
      root = doc.createElement('root');
      const fn = child(harmony, 'function');
      if (fn) removeElement(fn);
      if (harmony.firstElementChild) {
        harmony.insertBefore(root, harmony.firstElementChild);
        if (isBlankText(root.nextSibling)) harmony.insertBefore(root.nextSibling.cloneNode(), root);
      } else {
        harmony.appendChild(root);
      }
    }
    const rootSA = noteNameToStepAlter(parsed.root);
    writeStepAlter(root, 'root-step', 'root-alter', rootSA.step, rootSA.alter);

    if (parsed.suffix in SUFFIX_TO_KIND) kindEl.textContent = SUFFIX_TO_KIND[parsed.suffix];
    // Always record the suffix as typed, even though OSMD 1.8.8 draws its own
    // label for the kind: other readers show it and re-extraction returns it.
    kindEl.setAttribute('text', parsed.suffix);

    const bassSA = parsed.slash ? noteNameToStepAlter(parsed.slash) : null;
    let bass = child(harmony, 'bass');
    if (!bassSA) {
      // No slash, or one that is not a note ("C/x"): drop the bass.
      if (bass) removeElement(bass);
      return;
    }
    if (!bass) {
      bass = doc.createElement('bass');
      insertAfter(child(harmony, 'inversion') || kindEl, bass);
    }
    writeStepAlter(bass, 'bass-step', 'bass-alter', bassSA.step, bassSA.alter);
  }

  function applyLyricEdit(lyric, text) {
    if (!text.trim()) return removeElement(lyric);
    const texts = children(lyric, 'text');
    let first = texts.shift();
    if (!first) {
      first = lyric.ownerDocument.createElement('text');
      const syllabic = child(lyric, 'syllabic');
      if (syllabic) insertAfter(syllabic, first); else appendChildIndented(lyric, first);
    }
    first.textContent = text;
    // A single edited string replaces any elided multi-syllable structure.
    texts.forEach(removeElement);
    children(lyric, 'elision').forEach(removeElement);
  }

  /**
   * Applies { chords: [{ id, text }], lyrics: [{ id, text }] } to the XML
   * and returns the new string. Empty text removes the element.
   */
  function applyEdits(xml, edits) {
    const doc = parse(xml);
    // Snapshot both lists before any removal so ids stay valid throughout.
    const harmonies = Array.from(doc.getElementsByTagName('harmony'));
    const lyrics = Array.from(doc.getElementsByTagName('lyric'));

    ((edits && edits.chords) || []).forEach((edit) => {
      const harmony = harmonies[edit.id];
      if (harmony) applyChordEdit(harmony, String(edit.text === undefined || edit.text === null ? '' : edit.text).trim());
    });
    ((edits && edits.lyrics) || []).forEach((edit) => {
      const lyric = lyrics[edit.id];
      if (lyric) applyLyricEdit(lyric, String(edit.text === undefined || edit.text === null ? '' : edit.text));
    });

    return serialize(doc);
  }

  // ---------------------------------------------------------------------
  // Attachment payload
  // ---------------------------------------------------------------------

  function dataUrlToBytes(dataUrl) {
    const m = /^\s*data:([^,]*),([\s\S]*)$/i.exec(String(dataUrl || ''));
    if (!m) throw new Error('Attachment is not a data: URL');
    if (/;base64$/i.test(m[1])) {
      const binary = atob(m[2].replace(/\s+/g, ''));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    return new TextEncoder().encode(decodeURIComponent(m[2]));
  }

  function bytesToBase64(bytes) {
    // Chunked: String.fromCharCode.apply has an argument-count limit.
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  async function unzipMusicXML(bytes) {
    if (!window.JSZip) throw new Error('JSZip is required to read a compressed .mxl attachment');
    const zip = await window.JSZip.loadAsync(bytes);
    let entry = null;

    const container = zip.file('META-INF/container.xml');
    if (container) {
      const containerDoc = new DOMParser().parseFromString(await container.async('string'), 'application/xml');
      const rootfile = containerDoc.getElementsByTagName('rootfile')[0];
      const fullPath = rootfile ? rootfile.getAttribute('full-path') : null;
      if (fullPath) entry = zip.file(fullPath.replace(/^\.?\//, ''));
    }
    if (!entry) {
      // No usable container.xml: take the first score file outside META-INF.
      const names = Object.keys(zip.files).filter((name) =>
        !zip.files[name].dir && !/^META-INF\//i.test(name) && /\.(xml|musicxml)$/i.test(name));
      if (names.length) entry = zip.file(names[0]);
    }
    if (!entry) throw new Error('Compressed attachment holds no MusicXML file');
    return entry.async('string');
  }

  /**
   * Turns the attachment data URL into MusicXML text. A zip payload (.mxl,
   * detected by the PK magic number rather than the unreliable MIME label)
   * is unpacked via JSZip. Rejects when the result is not MusicXML.
   */
  async function decodeAttachment(dataUrl) {
    const bytes = dataUrlToBytes(dataUrl);
    const wasCompressed = bytes.length > 1 && bytes[0] === 0x50 && bytes[1] === 0x4B;
    const xml = stripBom(wasCompressed ? await unzipMusicXML(bytes) : new TextDecoder('utf-8').decode(bytes));
    if (!MUSICXML_START.test(xml)) throw new Error('Attachment is not MusicXML');
    return { xml, wasCompressed, bytes };
  }

  /** MusicXML text -> base64 data URL, safe for any Unicode content. */
  function encodeAttachment(xml) {
    return 'data:' + MUSICXML_MIME + ';base64,' + bytesToBase64(new TextEncoder().encode(String(xml)));
  }

  window.MusicXMLTools = {
    decodeAttachment,
    encodeAttachment,
    transpose,
    extractEditable,
    applyEdits,
    validate,
    serialize,
    parse,
    // Pure helpers, exposed for unit tests
    noteNameToStepAlter,
    stepAlterToNoteName,
    transposeFifths,
    transposePitch,
    transposeHouseNote,
    pitchToSemitone,
    looksLikeMusicXML: (text) => MUSICXML_START.test(stripBom(String(text || ''))),
    MUSICXML_MIME,
    DIATONIC_STEPS,
    KIND_TO_SUFFIX,
    SUFFIX_TO_KIND
  };
})();
