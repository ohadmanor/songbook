/**
 * musicxml-edit.js
 * Locator core for direct score editing: the bridge between what OSMD drew on
 * screen and the exact <note> / <harmony> element it came from.
 *
 * Nothing here touches the DOM of the app or creates an OSMD instance; it only
 * reads a MusicXML document and an already-rendered OpenSheetMusicDisplay
 * graphic model. UI lives elsewhere.
 *
 * Classic script, no modules. Needs only DOMParser (via window.MusicXMLTools
 * when it is loaded) and the OSMD object the caller hands in.
 */
(function () {
  'use strict';

  // Same table musicxml-tools.js uses; halfTone = octave * 12 + step + alter,
  // which is exactly what OSMD reports on sourceNote.halfTone.
  const STEP_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // Onsets are compared in whole notes, so the unit is division-independent.
  // A 128th note is 1/128 = 0.0078; 1e-6 is far below any real note value yet
  // well above the float noise of Fraction.RealValue.
  const ONSET_EPSILON = 1e-6;

  const DEFAULT_TOLERANCE = 24;

  // ---------------------------------------------------------------------
  // Tiny DOM helpers (element children only - text nodes would break order)
  // ---------------------------------------------------------------------

  function childrenNamed(el, name) {
    const out = [];
    if (!el) return out;
    for (let n = el.firstElementChild; n; n = n.nextElementSibling) {
      if (n.localName === name) out.push(n);
    }
    return out;
  }

  function childNamed(el, name) {
    if (!el) return null;
    for (let n = el.firstElementChild; n; n = n.nextElementSibling) {
      if (n.localName === name) return n;
    }
    return null;
  }

  function textIn(el, name) {
    const c = childNamed(el, name);
    return c ? String(c.textContent || '').trim() : null;
  }

  function numberIn(el, name, fallback) {
    const t = textIn(el, name);
    if (t === null || t === '') return fallback;
    const v = parseFloat(t);
    return isFinite(v) ? v : fallback;
  }

  /** Rounds away float dust so integral onsets stay integral. */
  function tidy(n) {
    const r = Math.round(n);
    return Math.abs(n - r) < 1e-9 ? r : n;
  }

  function toDocument(xmlOrDoc) {
    if (!xmlOrDoc) throw new Error('buildScoreIndex needs MusicXML');
    if (typeof xmlOrDoc === 'object' && xmlOrDoc.nodeType === 9) return xmlOrDoc;
    if (typeof xmlOrDoc === 'object' && xmlOrDoc.nodeType === 1) {
      return xmlOrDoc.ownerDocument || xmlOrDoc;
    }
    if (window.MusicXMLTools && typeof window.MusicXMLTools.parse === 'function') {
      return window.MusicXMLTools.parse(String(xmlOrDoc));
    }
    const doc = new DOMParser().parseFromString(String(xmlOrDoc), 'application/xml');
    if (doc.getElementsByTagName('parsererror')[0]) throw new Error('Invalid XML');
    return doc;
  }

  /** octave * 12 + step + alter, i.e. OSMD's halfTone. null when unpitched. */
  function semitoneOf(step, alter, octave) {
    if (!step || !(step in STEP_SEMITONES) || octave === null || octave === undefined) return null;
    return octave * 12 + STEP_SEMITONES[step] + (alter || 0);
  }

  // ---------------------------------------------------------------------
  // buildScoreIndex - replay MusicXML timing over every part and measure
  // ---------------------------------------------------------------------

  /**
   * Walks every <part>/<measure>, replaying <duration>, <backup>, <forward>
   * and <chord/> so that every <note> gets an exact onset in divisions from
   * the start of its measure. Returns lookup structures for resolveLocator.
   */
  function buildScoreIndex(xmlOrDoc) {
    const doc = toDocument(xmlOrDoc);
    const root = doc.documentElement;
    const index = {
      doc: doc,
      isTimewise: !!root && root.localName === 'score-timewise',
      parts: [],
      partsById: Object.create(null),
      notes: [],
      harmonies: [],
      measures: []
    };
    if (!root) return index;

    const partEls = childrenNamed(root, 'part');
    partEls.forEach(function (partEl, partIndex) {
      const partId = partEl.getAttribute('id') || ('P' + (partIndex + 1));
      const part = {
        el: partEl,
        id: partId,
        index: partIndex,
        measures: [],
        measuresByNumber: Object.create(null),
        notes: [],
        harmonies: []
      };
      // <divisions> lives in <attributes> and stays in force until changed,
      // across measures as well as inside one.
      let divisions = 1;

      childrenNamed(partEl, 'measure').forEach(function (measureEl, measureIndex) {
        const rawNumber = measureEl.getAttribute('number');
        const parsedNumber = parseInt(rawNumber, 10);
        const measure = {
          el: measureEl,
          partId: partId,
          partIndex: partIndex,
          index: measureIndex,
          number: isFinite(parsedNumber) ? parsedNumber : measureIndex + 1,
          numberXml: rawNumber === null ? null : String(rawNumber),
          divisions: divisions,
          notes: [],
          harmonies: []
        };

        let onset = 0;         // running position in divisions from measure start
        let headOnset = 0;     // onset of the last non-chord note (chords share it)
        let chordIndex = 0;
        let graceIndex = 0;    // 1-based position among graces at headOnset
        let lastWasGrace = false;

        for (let node = measureEl.firstElementChild; node; node = node.nextElementSibling) {
          const tag = node.localName;

          if (tag === 'attributes') {
            const d = numberIn(node, 'divisions', null);
            if (d !== null && d > 0) {
              divisions = d;
              if (measure.notes.length === 0 && onset === 0) measure.divisions = d;
            }
            continue;
          }

          if (tag === 'backup') {
            onset = tidy(onset - numberIn(node, 'duration', 0));
            if (onset < 0) onset = 0;
            headOnset = onset;
            chordIndex = 0;
            graceIndex = 0;
            lastWasGrace = false;
            continue;
          }

          if (tag === 'forward') {
            onset = tidy(onset + numberIn(node, 'duration', 0));
            headOnset = onset;
            chordIndex = 0;
            graceIndex = 0;
            lastWasGrace = false;
            continue;
          }

          if (tag === 'harmony') {
            const offsetEl = childNamed(node, 'offset');
            const offset = offsetEl ? parseFloat(offsetEl.textContent || '0') || 0 : 0;
            const hOnset = tidy(onset + offset);
            const harmony = {
              el: node,
              partId: partId,
              partIndex: partIndex,
              measureNumber: measure.number,
              measureIndex: measureIndex,
              divisions: divisions,
              onset: hOnset,
              onsetWhole: hOnset / (divisions * 4),
              offset: offset,
              harmonyIndex: measure.harmonies.length,
              root: harmonyRootText(node),
              kind: textIn(node, 'kind')
            };
            measure.harmonies.push(harmony);
            part.harmonies.push(harmony);
            index.harmonies.push(harmony);
            continue;
          }

          if (tag !== 'note') continue;

          const isChordMember = !!childNamed(node, 'chord');
          const isGrace = !!childNamed(node, 'grace');
          const duration = numberIn(node, 'duration', 0);

          let noteOnset;
          if (isChordMember) {
            noteOnset = headOnset;
            chordIndex += 1;
          } else {
            noteOnset = onset;
            headOnset = onset;
            chordIndex = 0;
            if (isGrace) {
              graceIndex = lastWasGrace ? graceIndex + 1 : 1;
            } else {
              graceIndex = 0;
              onset = tidy(onset + duration);
            }
            lastWasGrace = isGrace;
          }

          const restEl = childNamed(node, 'rest');
          const pitchEl = childNamed(node, 'pitch');
          const unpitchedEl = childNamed(node, 'unpitched');
          let step = null, alter = 0, octave = null;
          if (pitchEl) {
            step = textIn(pitchEl, 'step');
            alter = numberIn(pitchEl, 'alter', 0);
            octave = numberIn(pitchEl, 'octave', null);
          } else if (unpitchedEl) {
            step = textIn(unpitchedEl, 'display-step');
            octave = numberIn(unpitchedEl, 'display-octave', null);
          } else if (restEl) {
            step = textIn(restEl, 'display-step');
            octave = numberIn(restEl, 'display-octave', null);
          }

          const record = {
            el: node,
            partId: partId,
            partIndex: partIndex,
            measureNumber: measure.number,
            measureIndex: measureIndex,
            measureEl: measureEl,
            voice: textIn(node, 'voice') || '1',
            staff: textIn(node, 'staff') || '1',
            onset: noteOnset,
            onsetWhole: noteOnset / (divisions * 4),
            divisions: divisions,
            duration: duration,
            isChordMember: isChordMember,
            chordIndex: chordIndex,
            graceIndex: graceIndex,
            isRest: !!restEl,
            isGrace: isGrace,
            isUnpitched: !!unpitchedEl,
            step: step,
            alter: pitchEl ? alter : 0,
            octave: octave,
            semitone: semitoneOf(step, pitchEl ? alter : 0, octave),
            type: textIn(node, 'type'),
            dots: childrenNamed(node, 'dot').length,
            noteIndex: measure.notes.length
          };

          measure.notes.push(record);
          part.notes.push(record);
          index.notes.push(record);
        }

        part.measures.push(measure);
        if (!(measure.number in part.measuresByNumber)) {
          part.measuresByNumber[measure.number] = measure;
        }
        index.measures.push(measure);
      });

      index.parts.push(part);
      if (!(partId in index.partsById)) index.partsById[partId] = part;
    });

    return index;
  }

  function harmonyRootText(harmonyEl) {
    const rootEl = childNamed(harmonyEl, 'root');
    if (!rootEl) return null;
    const step = textIn(rootEl, 'root-step');
    if (!step) return null;
    const alter = numberIn(rootEl, 'root-alter', 0);
    let out = step;
    for (let i = 0; i < Math.abs(alter); i++) out += alter > 0 ? '#' : 'b';
    return out;
  }

  // ---------------------------------------------------------------------
  // OSMD graphic model -> locator
  // ---------------------------------------------------------------------

  function osmdVoiceEntry(gn) {
    const sn = gn && gn.sourceNote;
    return sn ? (sn.ParentVoiceEntry || sn.voiceEntry || null) : null;
  }

  function osmdStaffEntry(gn) {
    const sn = gn && gn.sourceNote;
    return sn ? (sn.ParentStaffEntry || sn.parentStaffEntry || null) : null;
  }

  function osmdPartId(gn) {
    const se = osmdStaffEntry(gn);
    const staff = se && (se.ParentStaff || se.parentStaff);
    const instrument = staff && (staff.ParentInstrument || staff.parentInstrument);
    if (instrument && instrument.IdString) return String(instrument.IdString);
    const ve = osmdVoiceEntry(gn);
    const voice = ve && (ve.ParentVoice || ve.parentVoice);
    const viaVoice = voice && voice.Parent;
    if (viaVoice && viaVoice.IdString) return String(viaVoice.IdString);
    return null;
  }

  function isGraceEntry(ve) {
    if (!ve) return false;
    return !!(ve.IsGrace !== undefined ? ve.IsGrace : ve.isGrace);
  }

  /** 1-based position of a grace voice entry among the graces of its voice. */
  function graceIndexOf(gn) {
    const ve = osmdVoiceEntry(gn);
    if (!isGraceEntry(ve)) return 0;
    const se = osmdStaffEntry(gn);
    const entries = se && (se.VoiceEntries || se.voiceEntries);
    if (!entries || !entries.length) return 1;
    const voiceId = voiceIdOf(ve);
    let n = 0;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!isGraceEntry(e) || voiceIdOf(e) !== voiceId) continue;
      n += 1;
      if (e === ve) return n;
    }
    return n || 1;
  }

  function voiceIdOf(ve) {
    const voice = ve && (ve.ParentVoice || ve.parentVoice);
    const id = voice ? voice.VoiceId : null;
    return id === null || id === undefined ? '1' : String(id);
  }

  function timestampOf(gn) {
    const ve = osmdVoiceEntry(gn);
    let ts = ve && (ve.Timestamp || ve.timestamp);
    if (!ts) {
      const se = osmdStaffEntry(gn);
      ts = se && (se.Timestamp || se.timestamp);
    }
    if (!ts) return 0;
    const v = ts.RealValue !== undefined ? ts.RealValue : (ts.realValue !== undefined ? ts.realValue : 0);
    return typeof v === 'number' && isFinite(v) ? v : 0;
  }

  function chordIndexOf(gn) {
    const gve = gn && (gn.ParentVoiceEntry || gn.parentVoiceEntry);
    const notes = gve && gve.notes;
    if (!notes || !notes.length) return 0;
    const i = notes.indexOf(gn);
    return i < 0 ? 0 : i;
  }

  /**
   * { partId, measureNumber, measureIndex, voice, staff, onset, onsetWhole,
   *   divisions, chordIndex, graceIndex, semitone }
   * `index` is optional: without it onset/divisions stay null and resolution
   * falls back to onsetWhole (whole notes), which is division-independent.
   */
  function locatorFromGraphicalNote(gn, index) {
    if (!gn || !gn.sourceNote) return null;
    const sn = gn.sourceNote;
    const ve = osmdVoiceEntry(gn);
    const se = osmdStaffEntry(gn);
    const staff = se && (se.ParentStaff || se.parentStaff);
    const sm = sn.sourceMeasure || sn.SourceMeasure;

    let measureNumber = null, measureIndex = null;
    if (sm) {
      if (sm.MeasureNumberXML !== undefined && sm.MeasureNumberXML !== null) measureNumber = sm.MeasureNumberXML;
      else if (sm.MeasureNumber !== undefined) measureNumber = sm.MeasureNumber;
      if (sm.measureListIndex !== undefined && sm.measureListIndex !== null) measureIndex = sm.measureListIndex;
    }

    const onsetWhole = timestampOf(gn);
    const locator = {
      partId: osmdPartId(gn),
      measureNumber: measureNumber,
      measureIndex: measureIndex,
      voice: voiceIdOf(ve),
      staff: staff && staff.Id !== undefined && staff.Id !== null ? String(staff.Id) : '1',
      onset: null,
      onsetWhole: onsetWhole,
      divisions: null,
      chordIndex: chordIndexOf(gn),
      graceIndex: graceIndexOf(gn),
      semitone: sn.isRestFlag ? null : (typeof sn.halfTone === 'number' ? sn.halfTone : null)
    };

    if (index) {
      const measure = findMeasure(index, locator);
      if (measure) {
        locator.divisions = measure.divisions;
        locator.onset = tidy(onsetWhole * 4 * measure.divisions);
      }
    }
    return locator;
  }

  /** The inverse, so a selection survives a re-render of the same score. */
  function locatorFromNoteRecord(rec) {
    if (!rec) return null;
    return {
      partId: rec.partId,
      measureNumber: rec.measureNumber,
      measureIndex: rec.measureIndex,
      voice: rec.voice,
      staff: rec.staff,
      onset: rec.onset,
      onsetWhole: rec.onsetWhole,
      divisions: rec.divisions,
      chordIndex: rec.chordIndex,
      graceIndex: rec.graceIndex,
      semitone: rec.isRest ? null : rec.semitone
    };
  }

  function locatorFromHarmonyRecord(rec) {
    if (!rec) return null;
    return {
      kind: 'harmony',
      partId: rec.partId,
      measureNumber: rec.measureNumber,
      measureIndex: rec.measureIndex,
      onset: rec.onset,
      onsetWhole: rec.onsetWhole,
      divisions: rec.divisions,
      harmonyIndex: rec.harmonyIndex
    };
  }

  // ---------------------------------------------------------------------
  // locator -> <note> record
  // ---------------------------------------------------------------------

  function findPart(index, locator) {
    if (!index || !index.parts.length) return null;
    if (locator && locator.partId !== null && locator.partId !== undefined) {
      const byId = index.partsById[locator.partId];
      if (byId) return byId;
    }
    if (locator && typeof locator.partIndex === 'number' && index.parts[locator.partIndex]) {
      return index.parts[locator.partIndex];
    }
    // A single-part score can only mean one thing, whatever the id said.
    return index.parts.length === 1 ? index.parts[0] : null;
  }

  function findMeasure(index, locator) {
    const part = findPart(index, locator);
    if (!part) return null;
    if (locator && typeof locator.measureIndex === 'number' && part.measures[locator.measureIndex]) {
      const byIndex = part.measures[locator.measureIndex];
      // Trust the index only when the number agrees, or no number was given.
      if (locator.measureNumber === null || locator.measureNumber === undefined ||
          byIndex.number === Number(locator.measureNumber)) {
        return byIndex;
      }
    }
    if (locator && locator.measureNumber !== null && locator.measureNumber !== undefined) {
      const byNumber = part.measuresByNumber[Number(locator.measureNumber)];
      if (byNumber) return byNumber;
    }
    if (locator && typeof locator.measureIndex === 'number' && part.measures[locator.measureIndex]) {
      return part.measures[locator.measureIndex];
    }
    return null;
  }

  function sameOnset(rec, target) {
    return Math.abs(rec.onsetWhole - target) < ONSET_EPSILON;
  }

  function targetOnsetWhole(locator, measure) {
    if (locator.onsetWhole !== null && locator.onsetWhole !== undefined) return locator.onsetWhole;
    if (locator.onset !== null && locator.onset !== undefined) {
      const div = locator.divisions || (measure && measure.divisions) || 1;
      return locator.onset / (div * 4);
    }
    return 0;
  }

  /** Exact match first, then the nearest onset inside the same measure. */
  function resolveLocator(index, locator) {
    if (!index || !locator) return null;
    const measure = findMeasure(index, locator);
    if (!measure || !measure.notes.length) return null;

    const target = targetOnsetWhole(locator, measure);
    const wantGrace = locator.graceIndex || 0;
    const wantChord = locator.chordIndex || 0;

    let pool = measure.notes;
    if (locator.voice !== null && locator.voice !== undefined) {
      const byVoice = pool.filter(function (r) { return r.voice === String(locator.voice); });
      if (byVoice.length) pool = byVoice;
    }
    if (locator.staff !== null && locator.staff !== undefined) {
      const byStaff = pool.filter(function (r) { return r.staff === String(locator.staff); });
      if (byStaff.length) pool = byStaff;
    }

    let atOnset = pool.filter(function (r) { return sameOnset(r, target) && r.graceIndex === wantGrace; });
    if (!atOnset.length) {
      atOnset = pool.filter(function (r) { return sameOnset(r, target); });
    }
    if (atOnset.length) {
      const exact = atOnset.filter(function (r) { return r.chordIndex === wantChord; });
      if (exact.length === 1) return exact[0];
      const pick = exact.length ? exact : atOnset;
      if (locator.semitone !== null && locator.semitone !== undefined) {
        const byPitch = pick.filter(function (r) { return r.semitone === locator.semitone; });
        if (byPitch.length) return byPitch[0];
        const allByPitch = atOnset.filter(function (r) { return r.semitone === locator.semitone; });
        if (allByPitch.length) return allByPitch[0];
      }
      return pick[0];
    }

    // Nearest-onset fallback: "click landed somewhere in this measure".
    let best = null, bestScore = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const r = pool[i];
      const score = Math.abs(r.onsetWhole - target) * 1000 +
                    Math.abs(r.chordIndex - wantChord) +
                    (r.graceIndex === wantGrace ? 0 : 0.5);
      if (score < bestScore) { bestScore = score; best = r; }
    }
    return best;
  }

  function resolveHarmonyLocator(index, locator) {
    if (!index || !locator) return null;
    const measure = findMeasure(index, locator);
    if (!measure || !measure.harmonies.length) return null;
    if (typeof locator.harmonyIndex === 'number' && measure.harmonies[locator.harmonyIndex]) {
      return measure.harmonies[locator.harmonyIndex];
    }
    const target = targetOnsetWhole(locator, measure);
    let best = null, bestDelta = Infinity;
    for (let i = 0; i < measure.harmonies.length; i++) {
      const h = measure.harmonies[i];
      const delta = Math.abs(h.onsetWhole - target);
      if (delta < bestDelta) { bestDelta = delta; best = h; }
    }
    return best;
  }

  // ---------------------------------------------------------------------
  // Graphic model walking + SVG geometry
  // ---------------------------------------------------------------------

  /** gn.vfnote[0].attrs.el, with the fallbacks that were measured on 1.8.8. */
  function noteSvgElement(gn) {
    if (!gn) return null;
    try {
      const vf = gn.vfnote;
      if (vf) {
        if (vf[0] && vf[0].attrs && vf[0].attrs.el) return vf[0].attrs.el;
        if (vf.attrs && vf.attrs.el) return vf.attrs.el;
      }
    } catch (e) { /* VexFlow object shapes vary; fall through */ }
    try {
      const gve = gn.ParentVoiceEntry || gn.parentVoiceEntry;
      const vfe = gve && (gve.vfStaveNote || gve.VfStaveNote);
      if (vfe && vfe.attrs && vfe.attrs.el) return vfe.attrs.el;
    } catch (e) { /* ignore */ }
    return null;
  }

  /** Every drawn GraphicalNote, in graphic-model order. */
  function eachGraphicalNote(osmd, callback) {
    const graphic = osmd && (osmd.graphic || osmd.GraphicSheet);
    if (!graphic || !graphic.MusicPages) return;
    for (const page of graphic.MusicPages) {
      for (const system of (page.MusicSystems || [])) {
        for (const staffLine of (system.StaffLines || [])) {
          for (const measure of (staffLine.Measures || [])) {
            for (const staffEntry of (measure.staffEntries || [])) {
              for (const gve of (staffEntry.graphicalVoiceEntries || [])) {
                for (const gn of (gve.notes || [])) callback(gn, staffEntry, measure, gve);
              }
            }
          }
        }
      }
    }
  }

  function collectGraphicalNotes(osmd) {
    const out = [];
    eachGraphicalNote(osmd, function (gn) { out.push(gn); });
    return out;
  }

  function svgOf(el) {
    if (!el) return null;
    if (el.ownerSVGElement) return el.ownerSVGElement;
    return el.tagName === 'svg' ? el : null;
  }

  function svgRoots(osmd) {
    const roots = [];
    const push = (el) => { if (el && roots.indexOf(el) < 0) roots.push(el); };
    try {
      const backends = (osmd && osmd.drawer && (osmd.drawer.Backends || osmd.drawer.backends)) || [];
      for (const b of backends) {
        if (b && typeof b.getSvgElement === 'function') push(b.getSvgElement());
        else if (b && b.ctx && b.ctx.svg) push(b.ctx.svg);
      }
    } catch (e) { /* ignore */ }
    if (!roots.length) {
      const container = osmd && (osmd.container || osmd.Container);
      if (container && container.querySelectorAll) {
        container.querySelectorAll('svg').forEach(push);
      }
    }
    return roots;
  }

  function clientRectOf(el) {
    if (!el || !el.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();
    if (!r || (!r.width && !r.height)) return null;
    return r;
  }

  function staveOf(measure) {
    try { return (measure && (measure.stave || measure.Stave)) || null; } catch (e) { return null; }
  }

  function staveBoundingBox(stave) {
    if (!stave) return null;
    let bb = null;
    try { bb = typeof stave.getBoundingBox === 'function' ? stave.getBoundingBox() : null; } catch (e) { bb = null; }
    if (!bb) {
      if (typeof stave.x !== 'number') return null;
      bb = { x: stave.x, y: stave.y, w: stave.width, h: stave.height || 40 };
    }
    const x = bb.x !== undefined ? bb.x : (bb.getX && bb.getX());
    const y = bb.y !== undefined ? bb.y : (bb.getY && bb.getY());
    const w = bb.w !== undefined ? bb.w : (bb.getW && bb.getW());
    const h = bb.h !== undefined ? bb.h : (bb.getH && bb.getH());
    if (![x, y, w, h].every(function (n) { return typeof n === 'number' && isFinite(n); })) return null;
    return { x: x, y: y, w: w, h: h };
  }

  function svgOfStave(stave) {
    let el = null;
    try { el = stave.attrs && stave.attrs.el; } catch (e) { el = null; }
    let svg = svgOf(el);
    if (!svg) {
      try { svg = stave.context && stave.context.svg; } catch (e) { svg = null; }
    }
    return svg;
  }

  /**
   * OSMD layout units -> SVG user units. It is 10 in OSMD 1.8.8, but reading
   * it off the drawn stave keeps zoom and any future default honest.
   */
  function unitToPixel(measure) {
    const stave = staveOf(measure);
    const bb = staveBoundingBox(stave);
    const ps = measure && measure.PositionAndShape;
    if (bb && ps && isFinite(ps.BorderRight) && isFinite(ps.BorderLeft)) {
      const units = ps.BorderRight - ps.BorderLeft;
      if (units > 0.001) {
        const ratio = bb.w / units;
        if (isFinite(ratio) && ratio > 0) return ratio;
      }
    }
    return null;
  }

  /** VexFlow stave bbox (SVG user units) -> client rect, via getScreenCTM. */
  function staveClientRect(measure) {
    const stave = staveOf(measure);
    if (!stave) return null;
    const bb = staveBoundingBox(stave);
    if (!bb) return null;
    const svg = svgOfStave(stave);
    if (!svg || typeof svg.getScreenCTM !== 'function') return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const a = ctm.a || 1, d = ctm.d || 1;
    return {
      svg: svg,
      left: ctm.e + bb.x * a, top: ctm.f + bb.y * d,
      width: bb.w * a, height: bb.h * d
    };
  }

  /**
   * A chord's notes all share one VexFlow StaveNote - and therefore one SVG
   * element and one rect. Their noteheads are told apart by the layout model:
   * AbsolutePosition is the notehead centre in OSMD units.
   */
  function noteheadClientRect(gn, measure, ratio, elRect) {
    if (!ratio) return null;
    const ps = gn && gn.PositionAndShape;
    const abs = ps && ps.AbsolutePosition;
    if (!abs || !isFinite(abs.x) || !isFinite(abs.y)) return null;
    const stave = staveOf(measure);
    const svg = stave && svgOfStave(stave);
    if (!svg || typeof svg.getScreenCTM !== 'function') return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const a = ctm.a || 1, d = ctm.d || 1;
    const cx = ctm.e + abs.x * ratio * a;
    const cy = ctm.f + abs.y * ratio * d;
    let w = ratio * 1.2 * a;
    if (elRect && elRect.width > 0) w = Math.min(elRect.width, ratio * 1.6 * a);
    const h = ratio * 0.95 * d;
    return { svg: svg, left: cx - w / 2, top: cy - h / 2, width: w, height: h };
  }

  // ---------------------------------------------------------------------
  // hitTest - nearest drawn thing to a screen point
  // ---------------------------------------------------------------------

  const hitCaches = new WeakMap();

  function invalidateHitCache(osmd) {
    if (osmd) hitCaches.delete(osmd);
  }

  function cacheSignature(osmd, roots) {
    const parts = [roots.length];
    for (const svg of roots) {
      const r = svg.getBoundingClientRect();
      parts.push(Math.round(r.width), Math.round(r.height));
    }
    return parts.join(':');
  }

  function buildHitCache(osmd) {
    const roots = svgRoots(osmd);
    const cache = {
      graphic: osmd && (osmd.graphic || osmd.GraphicSheet),
      roots: roots,
      signature: cacheSignature(osmd, roots),
      notes: [],
      harmonies: [],
      measures: []
    };
    // Rects are stored relative to their own <svg>, so scrolling never stales
    // the cache: only one getBoundingClientRect per svg per hit test.
    const originOf = new Map();
    const origin = (svg) => {
      if (!svg) return null;
      if (!originOf.has(svg)) {
        const r = svg.getBoundingClientRect();
        originOf.set(svg, { left: r.left, top: r.top });
      }
      return originOf.get(svg);
    };

    const graphic = cache.graphic;
    if (!graphic || !graphic.MusicPages) return cache;

    for (const page of graphic.MusicPages) {
      for (const system of (page.MusicSystems || [])) {
        for (const staffLine of (system.StaffLines || [])) {
          for (const measure of (staffLine.Measures || [])) {
            let measureBox = null;
            const ratio = unitToPixel(measure);
            const measureHarmonies = [];

            for (const staffEntry of (measure.staffEntries || [])) {
              for (const gve of (staffEntry.graphicalVoiceEntries || [])) {
                const isChord = (gve.notes || []).length > 1;
                for (const gn of (gve.notes || [])) {
                  const el = noteSvgElement(gn);
                  const elRect = clientRectOf(el);
                  const head = isChord ? noteheadClientRect(gn, measure, ratio, elRect) : null;
                  const r = head || elRect;
                  if (!r) continue;
                  const svg = (head && head.svg) || svgOf(el);
                  const o = origin(svg);
                  if (!o) continue;
                  const local = { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
                  cache.notes.push({ gn: gn, svg: svg, local: local, measure: measure, element: el });
                  if (elRect) {
                    measureBox = growBox(measureBox, {
                      x: elRect.left - o.left, y: elRect.top - o.top, w: elRect.width, h: elRect.height
                    }, svg);
                  }
                }
              }
              const chordContainers = staffEntry.graphicalChordContainers || [];
              for (let ci = 0; ci < chordContainers.length; ci++) {
                const label = chordContainers[ci] && (chordContainers[ci].GraphicalLabel || chordContainers[ci].graphicalLabel);
                const node = label && (label.SVGNode || label.svgNode);
                const r = clientRectOf(node);
                if (!r) continue;
                const svg = svgOf(node);
                const o = origin(svg);
                if (!o) continue;
                const entry = {
                  container: chordContainers[ci],
                  chordIndex: ci,
                  staffEntry: staffEntry,
                  measure: measure,
                  svg: svg,
                  element: node,
                  measureOrdinal: measureHarmonies.length,
                  measureTotal: 0,
                  local: { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }
                };
                measureHarmonies.push(entry);
                cache.harmonies.push(entry);
              }
            }
            for (const e of measureHarmonies) e.measureTotal = measureHarmonies.length;

            const sr = staveClientRect(measure);
            if (sr) {
              const o = origin(sr.svg);
              if (o) {
                cache.measures.push({
                  measure: measure, svg: sr.svg,
                  local: { x: sr.left - o.left, y: sr.top - o.top, w: sr.width, h: sr.height }
                });
                measureBox = null;
              }
            }
            if (measureBox) {
              cache.measures.push({ measure: measure, svg: measureBox.svg, local: measureBox.box });
            }
          }
        }
      }
    }
    return cache;
  }

  function growBox(acc, local, svg) {
    if (!acc) return { svg: svg, box: { x: local.x, y: local.y, w: local.w, h: local.h } };
    const b = acc.box;
    const right = Math.max(b.x + b.w, local.x + local.w);
    const bottom = Math.max(b.y + b.h, local.y + local.h);
    b.x = Math.min(b.x, local.x);
    b.y = Math.min(b.y, local.y);
    b.w = right - b.x;
    b.h = bottom - b.y;
    return acc;
  }

  function getHitCache(osmd) {
    let cache = hitCaches.get(osmd);
    const graphic = osmd && (osmd.graphic || osmd.GraphicSheet);
    if (cache && cache.graphic === graphic) {
      let sig = null;
      try { sig = cacheSignature(osmd, cache.roots); } catch (e) { sig = null; }
      // A re-render at the same width keeps the same <svg> and graphic model
      // but replaces every element inside it, so check one of them is still
      // in the document before trusting the rects.
      const probe = (cache.notes[0] && cache.notes[0].element) ||
                    (cache.harmonies[0] && cache.harmonies[0].element);
      const live = !probe || probe.isConnected !== false;
      if (sig !== null && sig === cache.signature && live) return cache;
    }
    cache = buildHitCache(osmd);
    hitCaches.set(osmd, cache);
    return cache;
  }

  function distanceToBox(box, x, y) {
    const dx = x < box.x ? box.x - x : (x > box.x + box.w ? x - (box.x + box.w) : 0);
    const dy = y < box.y ? box.y - y : (y > box.y + box.h ? y - (box.y + box.h) : 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function toClientRect(local, origin) {
    return {
      left: local.x + origin.left, top: local.y + origin.top,
      width: local.w, height: local.h,
      right: local.x + origin.left + local.w,
      bottom: local.y + origin.top + local.h
    };
  }

  /**
   * Nearest drawn note / chord symbol to a screen point, else the measure the
   * point sits in, else null.
   *   opts: { tolerance = 24, index, kinds = ['note','harmony','measure'] }
   */
  function hitTest(osmd, clientX, clientY, opts) {
    const options = opts || {};
    const tolerance = options.tolerance === undefined ? DEFAULT_TOLERANCE : options.tolerance;
    const kinds = options.kinds || ['note', 'harmony', 'measure'];
    const index = options.index || null;
    const cache = getHitCache(osmd);
    if (!cache) return null;

    const origins = new Map();
    const originOf = (svg) => {
      if (!origins.has(svg)) {
        const r = svg.getBoundingClientRect();
        origins.set(svg, { left: r.left, top: r.top });
      }
      return origins.get(svg);
    };

    let best = null;
    const consider = (entry, kind) => {
      const o = originOf(entry.svg);
      const x = clientX - o.left, y = clientY - o.top;
      const d = distanceToBox(entry.local, x, y);
      if (d > tolerance) return;
      // Overlapping boxes (chord noteheads share a stem, voices share a staff)
      // are separated by which centre the point is closest to.
      const cx = entry.local.x + entry.local.w / 2, cy = entry.local.y + entry.local.h / 2;
      const centre = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (!best || d < best.distance - 1e-9 ||
          (Math.abs(d - best.distance) < 1e-9 && centre < best.centre)) {
        best = { entry: entry, kind: kind, distance: d, centre: centre, origin: o };
      }
    };

    if (kinds.indexOf('note') >= 0) for (const e of cache.notes) consider(e, 'note');
    if (kinds.indexOf('harmony') >= 0) for (const e of cache.harmonies) consider(e, 'harmony');

    if (best) {
      const rect = toClientRect(best.entry.local, best.origin);
      if (best.kind === 'note') {
        const gn = best.entry.gn;
        const locator = locatorFromGraphicalNote(gn, index);
        return {
          kind: 'note', gn: gn, locator: locator,
          record: index ? resolveLocator(index, locator) : null,
          element: best.entry.element, measure: best.entry.measure,
          rect: rect, localRect: best.entry.local, distance: best.distance
        };
      }
      const locator = harmonyLocatorFromEntry(best.entry, index);
      return {
        kind: 'harmony', container: best.entry.container, locator: locator,
        record: index ? resolveHarmonyLocator(index, locator) : null,
        element: best.entry.element, measure: best.entry.measure,
        rect: rect, localRect: best.entry.local, distance: best.distance
      };
    }

    if (kinds.indexOf('measure') < 0) return null;

    // "Clicked empty staff": only when the point really is inside a measure.
    const pad = options.measurePadding === undefined ? 0 : options.measurePadding;
    let bestMeasure = null;
    for (const e of cache.measures) {
      const o = originOf(e.svg);
      const d = distanceToBox(e.local, clientX - o.left, clientY - o.top);
      if (d > pad) continue;
      if (!bestMeasure || d < bestMeasure.distance) bestMeasure = { entry: e, distance: d, origin: o };
    }
    if (!bestMeasure) return null;
    const e = bestMeasure.entry;
    const measureLocator = measureLocatorFrom(e.measure);
    return {
      kind: 'measure', measure: e.measure, locator: measureLocator,
      record: index ? findMeasure(index, measureLocator) : null,
      element: null, rect: toClientRect(e.local, bestMeasure.origin),
      localRect: e.local, distance: bestMeasure.distance
    };
  }

  /**
   * The client rects hitTest matches against, in graphic-model order.
   * kind: 'note' (default), 'harmony' or 'measure'.
   */
  function hitRects(osmd, kind, index) {
    const cache = getHitCache(osmd);
    if (!cache) return [];
    const list = kind === 'harmony' ? cache.harmonies : (kind === 'measure' ? cache.measures : cache.notes);
    const origins = new Map();
    return list.map(function (e) {
      if (!origins.has(e.svg)) {
        const r = e.svg.getBoundingClientRect();
        origins.set(e.svg, { left: r.left, top: r.top });
      }
      // The locator is what a caller needs to re-find this thing after the
      // next render, so every rect carries its own.
      let locator = null;
      if (kind === 'harmony') locator = harmonyLocatorFromEntry(e, index || null);
      else if (kind === 'measure') locator = measureLocatorFrom(e.measure);
      else if (e.gn) locator = locatorFromGraphicalNote(e.gn, index || null);
      return {
        gn: e.gn || null, container: e.container || null, measure: e.measure || null,
        element: e.element || null, locator: locator,
        rect: toClientRect(e.local, origins.get(e.svg))
      };
    });
  }

  function measureLocatorFrom(graphicalMeasure) {
    const sm = graphicalMeasure && (graphicalMeasure.parentSourceMeasure || graphicalMeasure.ParentSourceMeasure);
    const staff = graphicalMeasure && (graphicalMeasure.ParentStaff || graphicalMeasure.parentStaff);
    const instrument = staff && (staff.ParentInstrument || staff.parentInstrument);
    let measureNumber = null, measureIndex = null;
    if (sm) {
      measureNumber = sm.MeasureNumberXML !== undefined && sm.MeasureNumberXML !== null
        ? sm.MeasureNumberXML : sm.MeasureNumber;
      if (sm.measureListIndex !== undefined) measureIndex = sm.measureListIndex;
    }
    return {
      kind: 'measure',
      partId: instrument && instrument.IdString ? String(instrument.IdString) : null,
      measureNumber: measureNumber,
      measureIndex: measureIndex,
      staff: staff && staff.Id !== undefined && staff.Id !== null ? String(staff.Id) : '1'
    };
  }

  function harmonyLocatorFromEntry(entry, index) {
    const se = entry.staffEntry;
    const measure = entry.measure;
    const measureLocator = measureLocatorFrom(measure);
    let onsetWhole = 0;
    const ts = se && (se.relInMeasureTimestamp || se.RelInMeasureTimestamp);
    if (ts && typeof ts.RealValue === 'number') onsetWhole = ts.RealValue;
    else {
      const sse = se && (se.sourceStaffEntry || se.SourceStaffEntry);
      const sts = sse && (sse.Timestamp || sse.timestamp);
      if (sts && typeof sts.RealValue === 'number') onsetWhole = sts.RealValue;
    }
    const locator = {
      kind: 'harmony',
      partId: measureLocator.partId,
      measureNumber: measureLocator.measureNumber,
      measureIndex: measureLocator.measureIndex,
      onsetWhole: onsetWhole,
      onset: null,
      divisions: null,
      harmonyIndex: null
    };
    if (index) {
      const m = findMeasure(index, locator);
      if (m) {
        locator.divisions = m.divisions;
        locator.onset = tidy(onsetWhole * 4 * m.divisions);
        // OSMD draws every <harmony> of a measure in document order and hangs
        // them all off the staff entry it found, ignoring <offset>. So when the
        // counts agree, drawing order IS document order; only when they differ
        // (a harmony that was not drawn) do we fall back to onset matching.
        let pick = null;
        if (entry.measureTotal === m.harmonies.length) {
          pick = m.harmonies[entry.measureOrdinal] || null;
        }
        if (!pick) {
          const atOnset = m.harmonies.filter(function (h) {
            return Math.abs(h.onsetWhole - onsetWhole) < ONSET_EPSILON;
          });
          pick = atOnset[entry.chordIndex] || atOnset[0] || null;
        }
        if (pick) locator.harmonyIndex = pick.harmonyIndex;
      }
    }
    return locator;
  }

  // =====================================================================
  // Edit operations
  //
  // Every operation takes MusicXML (a string or a Document) plus a locator
  // and returns a NEW MusicXML string. The input is never modified: a string
  // is parsed into a private document, a Document is deep-cloned first.
  //
  // A locator that does not resolve is a NO-OP: the input comes back
  // unchanged rather than throwing, so a selection left over from an older
  // render can never corrupt a score.
  //
  // BAR DURATION POLICY
  // A measure has to stay internally consistent, so after any operation that
  // changes how much time a voice occupies we rebalance that voice inside
  // that one measure:
  //   under-full -> append rest(s) at the end of the voice's run, split
  //                 greedily into real note values (dotted where exact);
  //   over-full  -> shorten the trailing notes-or-rests of the voice,
  //                 removing any that reach zero. The element(s) the user
  //                 just edited or inserted are protected, so "insert" pushes
  //                 material out of the bar instead of undoing itself.
  // The target is the voice's OWN length before the edit, not the nominal
  // length of the time signature: a pickup bar, a cadenza bar or a bar that
  // was already wrong stays exactly as long as it was, and we never silently
  // "fix" it. measureDurationReport() reports what still does not add up so
  // the UI can flag it.
  // =====================================================================

  // MusicXML child order. Elements we create are inserted at the right place
  // instead of appended, because the schema is a sequence, not a bag.
  const NOTE_CHILD_ORDER = [
    'grace', 'cue', 'chord', 'pitch', 'unpitched', 'rest', 'duration', 'tie',
    'instrument', 'footnote', 'level', 'voice', 'type', 'dot', 'accidental',
    'time-modification', 'stem', 'notehead', 'notehead-text', 'staff', 'beam',
    'notations', 'lyric', 'play', 'listen'
  ];
  const PITCH_CHILD_ORDER = ['step', 'alter', 'octave'];
  const DISPLAY_CHILD_ORDER = ['display-step', 'display-octave'];
  const NOTATIONS_CHILD_ORDER = [
    'footnote', 'level', 'tied', 'slur', 'tuplet', 'glissando', 'slide',
    'ornaments', 'technical', 'articulations', 'dynamics', 'fermata',
    'arpeggiate', 'non-arpeggiate', 'accidental-mark', 'other-notation'
  ];
  const ATTRIBUTES_CHILD_ORDER = [
    'footnote', 'level', 'divisions', 'key', 'time', 'staves', 'part-symbol',
    'instruments', 'clef', 'staff-details', 'transpose', 'directive', 'measure-style'
  ];
  const TIME_CHILD_ORDER = ['beats', 'beat-type', 'senza-misura'];
  const HARMONY_CHILD_ORDER = [
    'root', 'numeral', 'function', 'kind', 'inversion', 'bass', 'degree',
    'frame', 'offset', 'footnote', 'level', 'staff'
  ];

  // <alter> alone is invisible when the key signature already implies it, so
  // setAccidental() writes the matching <accidental> glyph as well.
  const ALTER_TO_ACCIDENTAL = {
    '-2': 'flat-flat', '-1': 'flat', '0': 'natural', '1': 'sharp', '2': 'sharp-sharp'
  };

  // Middle of the staff per clef sign - where a rest turned back into a note
  // starts when nothing better is remembered.
  const CLEF_MIDDLE = {
    G: { step: 'B', octave: 4 }, F: { step: 'D', octave: 3 }, C: { step: 'C', octave: 4 },
    percussion: { step: 'B', octave: 4 }, TAB: { step: 'B', octave: 4 }, none: { step: 'B', octave: 4 }
  };

  // <type> -> length in quarter notes.
  const TYPE_QUARTERS = {
    'maxima': 32, 'long': 16, 'breve': 8, 'whole': 4, 'half': 2, 'quarter': 1,
    'eighth': 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625, '128th': 0.03125,
    '256th': 0.015625, '512th': 0.0078125, '1024th': 0.00390625
  };

  // Every (type, dots) pair a padding rest may use, longest first. Dots stop
  // at two: a triple-dotted rest is legal but nobody wants to read one.
  const NOTE_VALUES = (function () {
    const out = [];
    ['breve', 'whole', 'half', 'quarter', 'eighth', '16th', '32nd', '64th', '128th'].forEach(function (type) {
      for (let dots = 2; dots >= 0; dots--) {
        out.push({ type: type, dots: dots, quarters: TYPE_QUARTERS[type] * (2 - Math.pow(2, -dots)) });
      }
    });
    out.sort(function (a, b) { return b.quarters - a.quarters; });
    return out;
  })();

  const DUR_EPSILON = 1e-9;

  // ---------------------------------------------------------------------
  // Document in / string out
  // ---------------------------------------------------------------------

  function cloneDocument(xmlOrDoc) {
    if (typeof xmlOrDoc === 'string') return toDocument(xmlOrDoc);
    const src = toDocument(xmlOrDoc);
    const copy = src.cloneNode(true);
    if (src.__musicxmlDeclaration) copy.__musicxmlDeclaration = src.__musicxmlDeclaration;
    return copy;
  }

  function serializeDoc(doc) {
    if (window.MusicXMLTools && typeof window.MusicXMLTools.serialize === 'function') {
      return window.MusicXMLTools.serialize(doc);
    }
    let out = new XMLSerializer().serializeToString(doc);
    if (!/^\s*<\?xml/.test(out)) {
      out = (doc.__musicxmlDeclaration || '<?xml version="1.0" encoding="UTF-8"?>') + '\n' + out;
    }
    return out;
  }

  /** The unchanged input, for a locator that did not resolve. */
  function unchanged(xmlOrDoc) {
    return typeof xmlOrDoc === 'string' ? xmlOrDoc : serializeDoc(toDocument(xmlOrDoc));
  }

  // ---------------------------------------------------------------------
  // Whitespace-preserving DOM surgery
  // ---------------------------------------------------------------------

  const isBlankText = (node) => !!node && node.nodeType === 3 && !node.textContent.trim();

  /** The '\n      ' in front of an element, or null when the file is flat. */
  function whitespaceIndent(el) {
    const prev = el && el.previousSibling;
    if (!isBlankText(prev)) return null;
    const text = prev.textContent;
    const nl = text.lastIndexOf('\n');
    return nl < 0 ? null : text.slice(nl);
  }

  /** One indentation step, read off the file so new elements match it. */
  function detectIndentUnit(doc) {
    const note = doc.getElementsByTagName('note')[0] || doc.getElementsByTagName('measure')[0];
    if (note) {
      const outer = whitespaceIndent(note);
      const inner = note.firstElementChild ? whitespaceIndent(note.firstElementChild) : null;
      if (outer && inner && inner.length > outer.length) return inner.slice(outer.length);
    }
    return '  ';
  }

  function removeIndented(el) {
    if (!el || !el.parentNode) return;
    if (isBlankText(el.previousSibling)) el.previousSibling.remove();
    el.remove();
  }

  function insertBeforeIndented(ref, el) {
    const parent = ref.parentNode;
    const ws = isBlankText(ref.previousSibling) ? ref.previousSibling.cloneNode() : null;
    parent.insertBefore(el, ref);
    if (ws) parent.insertBefore(ws, ref);
  }

  function insertAfterIndented(ref, el) {
    const parent = ref.parentNode;
    const ws = isBlankText(ref.previousSibling) ? ref.previousSibling.cloneNode() : null;
    const next = ref.nextSibling;
    if (ws) parent.insertBefore(ws, next);
    parent.insertBefore(el, next);
  }

  function appendIndented(parent, el) {
    const last = parent.lastElementChild;
    if (last) return insertAfterIndented(last, el);
    parent.appendChild(el);
  }

  /** Inserts el at its schema position among parent's existing children. */
  function insertInOrder(parent, el, order) {
    const rank = order ? order.indexOf(el.localName) : -1;
    if (rank >= 0) {
      for (let c = parent.firstElementChild; c; c = c.nextElementSibling) {
        const r = order.indexOf(c.localName);
        if (r >= 0 && r > rank) return insertBeforeIndented(c, el);
      }
    }
    return appendIndented(parent, el);
  }

  /** `<tag>value</tag>` under parent; null removes it. */
  function setChild(parent, tag, value, order) {
    let el = childNamed(parent, tag);
    if (value === null || value === undefined) {
      if (el) removeIndented(el);
      return null;
    }
    if (!el) {
      el = parent.ownerDocument.createElement(tag);
      insertInOrder(parent, el, order);
    }
    el.textContent = String(value);
    return el;
  }

  function appendText(parent, tag, value) {
    const el = parent.ownerDocument.createElement(tag);
    el.textContent = String(value);
    parent.appendChild(el);
    return el;
  }

  /** Pretty-prints a freshly built element tree to match the file around it. */
  function indentTree(el, baseIndent, unit) {
    if (!baseIndent) return;
    const doc = el.ownerDocument;
    const kids = [];
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) kids.push(c);
    if (!kids.length) return;
    const inner = baseIndent + unit;
    kids.forEach(function (k) {
      el.insertBefore(doc.createTextNode(inner), k);
      indentTree(k, inner, unit);
    });
    el.appendChild(doc.createTextNode(baseIndent));
  }

  function childIndentOf(parentEl, unit) {
    const first = parentEl.firstElementChild;
    const ws = first ? whitespaceIndent(first) : null;
    if (ws) return ws;
    const own = whitespaceIndent(parentEl);
    return own ? own + unit : null;
  }

  /**
   * Places a new element next to refEl (or at the end of parentEl), matching
   * the way its neighbours are written: key-change.musicxml puts a whole
   * <note> on one line while machine_dance.musicxml gives every child its
   * own, and a new element in the other style would stick out of the diff.
   */
  function placeElement(parentEl, refEl, position, el, unit) {
    const indent = (refEl ? whitespaceIndent(refEl) : null) || childIndentOf(parentEl, unit);
    const neighbour = refEl || parentEl.firstElementChild;
    const flat = !!(neighbour && neighbour.firstElementChild && !whitespaceIndent(neighbour.firstElementChild));
    if (!flat) indentTree(el, indent, unit);
    if (refEl && position === 'before') insertBeforeIndented(refEl, el);
    else if (refEl) insertAfterIndented(refEl, el);
    else appendIndented(parentEl, el);
  }

  // ---------------------------------------------------------------------
  // Note-value arithmetic
  // ---------------------------------------------------------------------

  const dotFactor = (dots) => 2 - Math.pow(2, -(dots || 0));

  /** Divisions for a (type, dots) pair, or null for an unknown type. */
  function durationOfType(type, dots, divisions) {
    const q = TYPE_QUARTERS[type];
    if (!q) return null;
    return tidy(q * dotFactor(dots) * divisions);
  }

  /** The exact inverse, or null when no real note value matches. */
  function typeForDuration(duration, divisions) {
    const q = duration / divisions;
    for (let i = 0; i < NOTE_VALUES.length; i++) {
      if (Math.abs(NOTE_VALUES[i].quarters - q) < DUR_EPSILON) {
        return { type: NOTE_VALUES[i].type, dots: NOTE_VALUES[i].dots };
      }
    }
    return null;
  }

  /** Greedy longest-first decomposition of `rem` divisions into note values. */
  function splitDuration(rem, divisions) {
    const out = [];
    let left = rem;
    let guard = 0;
    while (left > DUR_EPSILON && guard++ < 64) {
      const q = left / divisions;
      let pick = null;
      for (let i = 0; i < NOTE_VALUES.length; i++) {
        if (NOTE_VALUES[i].quarters <= q + DUR_EPSILON) { pick = NOTE_VALUES[i]; break; }
      }
      if (!pick) break;
      const d = tidy(pick.quarters * divisions);
      out.push({ type: pick.type, dots: pick.dots, duration: d });
      left = tidy(left - d);
    }
    // Anything left is shorter than a 128th: keep the time, drop the glyph.
    if (left > DUR_EPSILON) out.push({ type: null, dots: 0, duration: tidy(left) });
    return out;
  }

  // ---------------------------------------------------------------------
  // Note element helpers
  // ---------------------------------------------------------------------

  /** Walks back to the notehead that owns a <chord/> member's onset. */
  function chordHeadElement(noteEl) {
    let el = noteEl;
    while (el && childNamed(el, 'chord')) {
      const prev = el.previousElementSibling;
      if (!prev || prev.localName !== 'note') break;
      el = prev;
    }
    return el;
  }

  /** [head, ...<chord/> members] in document order. */
  function chordMemberElements(headEl) {
    const out = [headEl];
    for (let el = headEl.nextElementSibling;
         el && el.localName === 'note' && childNamed(el, 'chord');
         el = el.nextElementSibling) {
      out.push(el);
    }
    return out;
  }

  /** <pitch> or <unpitched>, with the tag names each of them uses. */
  function pitchTarget(noteEl) {
    const pitch = childNamed(noteEl, 'pitch');
    if (pitch) return { el: pitch, step: 'step', alter: 'alter', octave: 'octave', order: PITCH_CHILD_ORDER };
    const unpitched = childNamed(noteEl, 'unpitched');
    if (unpitched) {
      return { el: unpitched, step: 'display-step', alter: null, octave: 'display-octave', order: DISPLAY_CHILD_ORDER };
    }
    return null;
  }

  function readPitchTarget(target) {
    if (!target) return null;
    const step = textIn(target.el, target.step);
    const octave = numberIn(target.el, target.octave, null);
    const alter = target.alter ? numberIn(target.el, target.alter, 0) : 0;
    if (!step || octave === null) return null;
    return { step: step.toUpperCase(), alter: alter, octave: octave };
  }

  function writePitchTarget(target, step, alter, octave) {
    setChild(target.el, target.step, step, target.order);
    if (target.alter) setChild(target.el, target.alter, alter ? String(alter) : null, target.order);
    setChild(target.el, target.octave, String(octave), target.order);
  }

  /** Keeps an existing <accidental> honest; `force` writes one that was absent. */
  function syncAccidental(noteEl, alter, force) {
    const existing = childNamed(noteEl, 'accidental');
    if (!force && !existing) return;
    const name = ALTER_TO_ACCIDENTAL[String(Math.round(alter || 0))];
    if (!name) {
      if (existing) removeIndented(existing);
      return;
    }
    setChild(noteEl, 'accidental', name, NOTE_CHILD_ORDER);
  }

  function setNoteType(noteEl, type, dots) {
    setChild(noteEl, 'type', type || null, NOTE_CHILD_ORDER);
    childrenNamed(noteEl, 'dot').forEach(removeIndented);
    for (let i = 0; i < (dots || 0); i++) {
      insertInOrder(noteEl, noteEl.ownerDocument.createElement('dot'), NOTE_CHILD_ORDER);
    }
  }

  function createNoteElement(doc, spec) {
    const note = doc.createElement('note');
    if (spec.isChordMember) note.appendChild(doc.createElement('chord'));
    if (spec.isRest) {
      const rest = doc.createElement('rest');
      if (spec.measureRest) rest.setAttribute('measure', 'yes');
      if (spec.displayStep) {
        appendText(rest, 'display-step', spec.displayStep);
        appendText(rest, 'display-octave', String(spec.displayOctave));
      }
      note.appendChild(rest);
    } else {
      const pitch = doc.createElement('pitch');
      appendText(pitch, 'step', spec.step || 'B');
      if (spec.alter) appendText(pitch, 'alter', String(spec.alter));
      appendText(pitch, 'octave', String(spec.octave === null || spec.octave === undefined ? 4 : spec.octave));
      note.appendChild(pitch);
    }
    appendText(note, 'duration', String(spec.duration));
    appendText(note, 'voice', String(spec.voice || '1'));
    if (spec.type) appendText(note, 'type', spec.type);
    for (let i = 0; i < (spec.dots || 0); i++) note.appendChild(doc.createElement('dot'));
    if (spec.staff) appendText(note, 'staff', String(spec.staff));
    return note;
  }

  // Toggling a note to a rest must not MOVE the rest on the staff, so the
  // pitch it came from is parked in an XML comment: legal anywhere, ignored
  // by every reader OSMD included, and it survives a save/load round trip.
  // (<rest><display-step> would remember it too, but OSMD 1.8.8 honours those
  // and draws the rest where the notehead was - measured at 72px / 87px /
  // 152px for a C6 / default / C3 rest on the same staff.)
  const PITCH_MEMO = /^\s*songbook-pitch:([A-G])\/(-?\d+)\/(-?\d+)\s*$/;

  function readPitchMemo(noteEl) {
    for (let n = noteEl.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 8) continue;
      const m = PITCH_MEMO.exec(n.data || '');
      if (m) return { node: n, step: m[1], alter: parseInt(m[2], 10), octave: parseInt(m[3], 10) };
    }
    return null;
  }

  function writePitchMemo(noteEl, ref, pitch) {
    const existing = readPitchMemo(noteEl);
    if (existing) removeIndented(existing.node);
    const memo = noteEl.ownerDocument.createComment(
      ' songbook-pitch:' + pitch.step + '/' + (pitch.alter || 0) + '/' + pitch.octave + ' ');
    insertBeforeIndented(ref, memo);
  }

  function addTie(noteEl, type) {
    const doc = noteEl.ownerDocument;
    const hasTie = childrenNamed(noteEl, 'tie').some(function (t) { return t.getAttribute('type') === type; });
    if (!hasTie) {
      const tie = doc.createElement('tie');
      tie.setAttribute('type', type);
      insertInOrder(noteEl, tie, NOTE_CHILD_ORDER);
    }
    const notations = childNamed(noteEl, 'notations');
    if (!notations) {
      const created = doc.createElement('notations');
      const tied = doc.createElement('tied');
      tied.setAttribute('type', type);
      created.appendChild(tied);
      insertInOrder(noteEl, created, NOTE_CHILD_ORDER);
      indentTree(created, whitespaceIndent(created), detectIndentUnit(doc));
      return;
    }
    const hasTied = childrenNamed(notations, 'tied').some(function (t) { return t.getAttribute('type') === type; });
    if (!hasTied) {
      const tied = doc.createElement('tied');
      tied.setAttribute('type', type);
      insertInOrder(notations, tied, NOTATIONS_CHILD_ORDER);
    }
  }

  function removeTie(noteEl, type) {
    childrenNamed(noteEl, 'tie').forEach(function (t) {
      if (t.getAttribute('type') === type) removeIndented(t);
    });
    const notations = childNamed(noteEl, 'notations');
    if (!notations) return;
    childrenNamed(notations, 'tied').forEach(function (t) {
      if (t.getAttribute('type') === type) removeIndented(t);
    });
    if (!notations.firstElementChild) removeIndented(notations);
  }

  const samePitch = (a, b) => !!a && !!b && !a.isRest && !b.isRest &&
    a.step === b.step && a.alter === b.alter && a.octave === b.octave;

  const eventKey = (r) => r.measureIndex + ':' + r.onsetWhole + ':' + r.graceIndex;

  /**
   * The matching notehead in the voice's very NEXT (direction 1) or PREVIOUS
   * (-1) event, across barlines. A chord ties member to member, so the whole
   * event is searched; anything else - a rest, a different pitch - means no
   * partner, because a tie may not skip over what the voice plays in between.
   */
  function tiePartner(index, rec, direction) {
    const part = index.parts[rec.partIndex];
    if (!part || !rec.step || rec.octave === null) return null;
    const at = part.notes.indexOf(rec);
    if (at < 0) return null;
    const here = eventKey(rec);
    let groupKey = null;
    const group = [];
    for (let i = at + direction; i >= 0 && i < part.notes.length; i += direction) {
      const other = part.notes[i];
      if (other.voice !== rec.voice || other.isGrace) continue;
      const key = eventKey(other);
      if (key === here) continue;
      if (groupKey === null) groupKey = key;
      else if (key !== groupKey) break;
      group.push(other);
    }
    for (let i = 0; i < group.length; i++) if (samePitch(rec, group[i])) return group[i];
    return null;
  }

  // ---------------------------------------------------------------------
  // Time signatures and bar balance
  // ---------------------------------------------------------------------

  function readTime(measureEl) {
    const attrs = childrenNamed(measureEl, 'attributes');
    for (let i = 0; i < attrs.length; i++) {
      const time = childNamed(attrs[i], 'time');
      if (!time) continue;
      if (childNamed(time, 'senza-misura')) return { senzaMisura: true };
      const beats = parseFloat(textIn(time, 'beats'));
      const beatType = parseFloat(textIn(time, 'beat-type'));
      if (isFinite(beats) && isFinite(beatType) && beatType > 0) {
        return { beats: beats, beatType: beatType };
      }
    }
    return null;
  }

  /** Time signature in force at a measure, walking back through the part. */
  function timeInForce(part, measureIndex) {
    for (let i = Math.min(measureIndex, part.measures.length - 1); i >= 0; i--) {
      const t = readTime(part.measures[i].el);
      if (t) return t;
    }
    return { beats: 4, beatType: 4 };
  }

  /** Nominal length of a bar in divisions; null for senza-misura. */
  function expectedDuration(time, divisions) {
    if (!time || time.senzaMisura) return null;
    return tidy(time.beats * (4 * divisions) / time.beatType);
  }

  function clefInForce(part, measureIndex, staff) {
    const want = String(staff || '1');
    for (let i = Math.min(measureIndex, part.measures.length - 1); i >= 0; i--) {
      const attrs = childrenNamed(part.measures[i].el, 'attributes');
      for (let a = attrs.length - 1; a >= 0; a--) {
        const clefs = childrenNamed(attrs[a], 'clef');
        for (let c = clefs.length - 1; c >= 0; c--) {
          const number = clefs[c].getAttribute('number');
          if (number === null || String(number) === want) return textIn(clefs[c], 'sign') || 'G';
        }
      }
    }
    return 'G';
  }

  /** Notes of one voice that occupy time in a measure (heads only). */
  function voiceNotesOf(measure, voice) {
    return measure.notes.filter(function (r) {
      return r.voice === String(voice) && !r.isChordMember && !r.isGrace;
    });
  }

  function voiceEndOf(measure, voice) {
    let end = 0;
    voiceNotesOf(measure, voice).forEach(function (r) {
      const e = r.onset + r.duration;
      if (e > end) end = e;
    });
    return tidy(end);
  }

  function padVoice(measure, voice, amount, divisions, unit) {
    const notes = voiceNotesOf(measure, voice);
    const doc = measure.el.ownerDocument;
    const last = notes.length ? notes[notes.length - 1] : null;
    const group = last ? chordMemberElements(last.el) : null;
    const staff = last ? textIn(last.el, 'staff') : null;
    let anchor = group ? group[group.length - 1] : null;
    splitDuration(amount, divisions).forEach(function (piece) {
      const note = createNoteElement(doc, {
        isRest: true, duration: piece.duration, voice: voice,
        type: piece.type, dots: piece.dots, staff: staff
      });
      placeElement(measure.el, anchor, 'after', note, unit);
      anchor = note;
    });
  }

  function trimVoice(measure, voice, excess, divisions, protectedEls) {
    const notes = voiceNotesOf(measure, voice);
    const keepOut = protectedEls || [];
    let left = excess;
    for (let i = notes.length - 1; i >= 0 && left > DUR_EPSILON; i--) {
      const rec = notes[i];
      if (keepOut.indexOf(rec.el) >= 0) continue;
      const group = chordMemberElements(rec.el);
      if (rec.duration <= left + DUR_EPSILON) {
        left = tidy(left - rec.duration);
        group.forEach(removeIndented);
        continue;
      }
      const keep = tidy(rec.duration - left);
      left = 0;
      const td = typeForDuration(keep, divisions);
      group.forEach(function (el) {
        setChild(el, 'duration', String(keep), NOTE_CHILD_ORDER);
        setNoteType(el, td ? td.type : null, td ? td.dots : 0);
      });
    }
    return left;
  }

  /**
   * Restores one voice of one measure to `target` divisions (see BAR DURATION
   * POLICY). Re-indexes first, because the mutation that called us moved
   * elements around.
   */
  function rebalanceVoice(doc, partIndex, measureIndex, voice, target, protectedEls) {
    if (!(target > 0)) return;
    const index = buildScoreIndex(doc);
    const part = index.parts[partIndex];
    const measure = part && part.measures[measureIndex];
    if (!measure) return;
    const divisions = measure.divisions || 1;
    const diff = tidy(target - voiceEndOf(measure, voice));
    if (Math.abs(diff) < DUR_EPSILON) return;
    const unit = detectIndentUnit(doc);
    if (diff > 0) padVoice(measure, voice, diff, divisions, unit);
    else trimVoice(measure, voice, -diff, divisions, protectedEls);
  }

  /**
   * [{ partId, measureNumber, voice, expected, actual, ok }] for every voice
   * of every measure, measured against the time signature in force.
   * `expected` is null (and `ok` true) for a senza-misura bar.
   */
  function measureDurationReport(xmlOrDoc) {
    const index = buildScoreIndex(xmlOrDoc);
    const rows = [];
    index.parts.forEach(function (part) {
      let time = { beats: 4, beatType: 4 };
      part.measures.forEach(function (measure) {
        const declared = readTime(measure.el);
        if (declared) time = declared;
        const divisions = measure.divisions || 1;
        const expected = expectedDuration(time, divisions);
        const voices = [];
        measure.notes.forEach(function (r) {
          if (r.isChordMember || r.isGrace) return;
          if (voices.indexOf(r.voice) < 0) voices.push(r.voice);
        });
        if (!voices.length) voices.push('1');
        voices.forEach(function (voice) {
          const actual = voiceEndOf(measure, voice);
          rows.push({
            partId: part.id, measureNumber: measure.number, voice: voice,
            expected: expected, actual: actual,
            ok: expected === null || Math.abs(actual - expected) < DUR_EPSILON
          });
        });
      });
    });
    return rows;
  }

  // ---------------------------------------------------------------------
  // Locator plumbing shared by every operation
  // ---------------------------------------------------------------------

  /** Accepts a locator or a record straight out of buildScoreIndex. */
  function asNoteLocator(x) {
    if (!x) return null;
    return (x.el && x.measureEl) ? locatorFromNoteRecord(x) : x;
  }

  function asHarmonyLocator(x) {
    if (!x) return null;
    return (x.el && x.harmonyIndex !== undefined && !x.measureEl) ? locatorFromHarmonyRecord(x) : x;
  }

  /**
   * Resolve, mutate, rebalance, serialize. `mutate(ctx)` returns false to
   * abort (leaving the input untouched) or an object:
   *   { rebalance: true, protect: [elements the rebalance must not trim] }
   */
  function editNote(xmlOrDoc, locator, mutate) {
    const loc = asNoteLocator(locator);
    if (!loc) return unchanged(xmlOrDoc);
    const doc = cloneDocument(xmlOrDoc);
    const index = buildScoreIndex(doc);
    const rec = resolveLocator(index, loc);
    if (!rec) return unchanged(xmlOrDoc);
    const part = index.parts[rec.partIndex];
    const measure = part.measures[rec.measureIndex];
    let before = voiceEndOf(measure, rec.voice);
    if (!before) {
      before = expectedDuration(timeInForce(part, rec.measureIndex), measure.divisions || 1) || 0;
    }
    const outcome = mutate({ doc: doc, index: index, rec: rec, measure: measure, unit: detectIndentUnit(doc) });
    if (outcome === false) return unchanged(xmlOrDoc);
    if (outcome && outcome.rebalance) {
      rebalanceVoice(doc, rec.partIndex, rec.measureIndex, rec.voice, before, outcome.protect || []);
    }
    return serializeDoc(doc);
  }

  // ---------------------------------------------------------------------
  // NOTE OPERATIONS
  // ---------------------------------------------------------------------

  /**
   * Writes <pitch><step>/<alter>/<octave>; <alter> disappears when it is 0.
   * A rest becomes a pitched note; an <unpitched> percussion note keeps its
   * <unpitched> wrapper and moves its display position instead.
   */
  function setPitch(xml, locator, pitch) {
    return editNote(xml, locator, function (ctx) {
      if (!pitch || !pitch.step) return false;
      const noteEl = ctx.rec.el;
      const target = pitchTarget(noteEl);
      const alter = Math.round(Number(pitch.alter) || 0);
      const octave = pitch.octave === null || pitch.octave === undefined
        ? ((target && readPitchTarget(target)) || { octave: 4 }).octave : Math.round(Number(pitch.octave));
      const step = String(pitch.step).toUpperCase();
      if (target) {
        const current = readPitchTarget(target);
        if (!current || current.step !== step || current.alter !== alter || current.octave !== octave) {
          dropTies(ctx.index, ctx.rec);
        }
        writePitchTarget(target, step, alter, octave);
        syncAccidental(noteEl, alter, false);
        return null;
      }
      const rest = childNamed(noteEl, 'rest');
      if (!rest) return false;
      const el = ctx.doc.createElement('pitch');
      appendText(el, 'step', step);
      if (alter) appendText(el, 'alter', String(alter));
      appendText(el, 'octave', String(octave));
      insertBeforeIndented(rest, el);
      indentTree(el, whitespaceIndent(el), ctx.unit);
      removeIndented(rest);
      const memo = readPitchMemo(noteEl);
      if (memo) removeIndented(memo.node);
      return null;
    });
  }

  /**
   * Moves a notehead N places up or down the staff, carrying the octave. The
   * accidental travels with it (C# up one step is D#); clear it afterwards
   * with setAccidental(xml, loc, null) when the key signature should govern.
   */
  function nudgePitch(xml, locator, deltaDiatonicSteps) {
    return editNote(xml, locator, function (ctx) {
      const delta = Math.round(Number(deltaDiatonicSteps) || 0);
      if (!delta) return false;
      const target = pitchTarget(ctx.rec.el);
      const current = readPitchTarget(target);
      if (!current) return false;
      const stepNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
      const total = stepNames.indexOf(current.step) + delta;
      const octave = current.octave + Math.floor(total / 7);
      if (octave < 0 || octave > 9) return false;
      dropTies(ctx.index, ctx.rec);
      writePitchTarget(target, stepNames[((total % 7) + 7) % 7], current.alter, octave);
      syncAccidental(ctx.rec.el, current.alter, false);
      return null;
    });
  }

  function nudgeOctave(xml, locator, deltaOctaves) {
    return editNote(xml, locator, function (ctx) {
      const delta = Math.round(Number(deltaOctaves) || 0);
      if (!delta) return false;
      const target = pitchTarget(ctx.rec.el);
      const current = readPitchTarget(target);
      if (!current) return false;
      const octave = current.octave + delta;
      if (octave < 0 || octave > 9) return false;
      dropTies(ctx.index, ctx.rec);
      writePitchTarget(target, current.step, current.alter, octave);
      return null;
    });
  }

  /**
   * -2..2 sets <alter> and writes the matching <accidental> so the glyph is
   * drawn even when the key signature already implies it. null clears both
   * and hands the note back to the key signature.
   */
  function setAccidental(xml, locator, alter) {
    return editNote(xml, locator, function (ctx) {
      const noteEl = ctx.rec.el;
      const target = pitchTarget(noteEl);
      if (!target || !target.alter) return false;
      const current = readPitchTarget(target);
      if (!current) return false;
      if (alter === null || alter === undefined) {
        if (current.alter) dropTies(ctx.index, ctx.rec);
        setChild(target.el, target.alter, null, target.order);
        const existing = childNamed(noteEl, 'accidental');
        if (existing) removeIndented(existing);
        return null;
      }
      const value = Math.max(-2, Math.min(2, Math.round(Number(alter) || 0)));
      if (value !== current.alter) dropTies(ctx.index, ctx.rec);
      setChild(target.el, target.alter, value ? String(value) : null, target.order);
      syncAccidental(noteEl, value, true);
      return null;
    });
  }

  /**
   * New <type>/<dot>s plus a <duration> recomputed from the part's
   * <divisions>. A chord moves as one: every member keeps the head's length.
   * The bar is then rebalanced around the edited note (BAR DURATION POLICY).
   */
  function setDuration(xml, locator, value) {
    return editNote(xml, locator, function (ctx) {
      const spec = value || {};
      const type = spec.type;
      const dots = Math.max(0, Math.round(Number(spec.dots) || 0));
      if (!type || !(type in TYPE_QUARTERS)) return false;
      const divisions = ctx.measure.divisions || 1;
      const head = chordHeadElement(ctx.rec.el);
      const group = chordMemberElements(head);
      const grace = !!childNamed(head, 'grace');
      const duration = durationOfType(type, dots, divisions);
      group.forEach(function (el) {
        setNoteType(el, type, dots);
        if (!grace) setChild(el, 'duration', String(Math.max(1, Math.round(duration))), NOTE_CHILD_ORDER);
      });
      return grace ? null : { rebalance: true, protect: group };
    });
  }

  /** Drops what a rest may not carry: accidentals, stems, ties, beams, lyrics. */
  function stripPitchOnlyChildren(noteEl) {
    ['accidental', 'stem', 'notehead', 'notehead-text', 'tie', 'beam', 'lyric'].forEach(function (tag) {
      childrenNamed(noteEl, tag).forEach(removeIndented);
    });
    const notations = childNamed(noteEl, 'notations');
    if (!notations) return;
    childrenNamed(notations, 'tied').forEach(removeIndented);
    if (!notations.firstElementChild) removeIndented(notations);
  }

  /**
   * Note <-> rest. Turning a note into a rest parks the pitch in a comment
   * (see PITCH_MEMO) so toggling back restores it without moving the drawn
   * rest. A rest that never was a note comes back on its own
   * <display-step>/<display-octave> when the file gave it one, else on the
   * middle line of the clef in force.
   */
  function toggleRest(xml, locator) {
    return editNote(xml, locator, function (ctx) {
      const noteEl = ctx.rec.el;
      const doc = ctx.doc;
      const rest = childNamed(noteEl, 'rest');
      if (rest) {
        const memo = readPitchMemo(noteEl);
        const displayStep = textIn(rest, 'display-step');
        const displayOctave = numberIn(rest, 'display-octave', null);
        let home = memo;
        if (!home && displayStep && displayOctave !== null) {
          home = { step: displayStep, alter: 0, octave: displayOctave };
        }
        if (!home) {
          const part = ctx.index.parts[ctx.rec.partIndex];
          home = CLEF_MIDDLE[clefInForce(part, ctx.rec.measureIndex, ctx.rec.staff)] || CLEF_MIDDLE.G;
        }
        const pitch = doc.createElement('pitch');
        appendText(pitch, 'step', home.step);
        if (home.alter) appendText(pitch, 'alter', String(home.alter));
        appendText(pitch, 'octave', String(home.octave));
        insertBeforeIndented(rest, pitch);
        indentTree(pitch, whitespaceIndent(pitch), ctx.unit);
        removeIndented(rest);
        if (memo) removeIndented(memo.node);
        return null;
      }
      // MusicXML has no rest inside a chord, and OSMD dies on one (it asks the
      // missing <pitch> for its half tone). A notehead that shares its onset
      // with others is removed with Delete, not turned into a rest.
      if (childNamed(noteEl, 'chord')) return false;
      if (chordMemberElements(noteEl).length > 1) return false;
      const target = pitchTarget(noteEl);
      if (!target) return false;
      const current = readPitchTarget(target);
      // A rest cannot be tied, so the partner's half goes with the pitch.
      dropTies(ctx.index, ctx.rec);
      const newRest = doc.createElement('rest');
      insertBeforeIndented(target.el, newRest);
      removeIndented(target.el);
      if (current) writePitchMemo(noteEl, newRest, current);
      stripPitchOnlyChildren(noteEl);
      return null;
    });
  }

  /** Drops the tie this note starts or stops, so no half-tie is left behind. */
  function unlinkTies(index, rec) {
    const hasStart = childrenNamed(rec.el, 'tie').some(function (t) { return t.getAttribute('type') === 'start'; });
    const hasStop = childrenNamed(rec.el, 'tie').some(function (t) { return t.getAttribute('type') === 'stop'; });
    if (hasStart) {
      const next = tiePartner(index, rec, 1);
      if (next) removeTie(next.el, 'stop');
    }
    if (hasStop) {
      const prev = tiePartner(index, rec, -1);
      if (prev) removeTie(prev.el, 'start');
    }
  }

  /**
   * Lets go of the tie this note is part of, both halves. A tie may only join
   * two IDENTICAL pitches (see tiePartner), so every edit that moves the
   * notehead - or takes the pitch away altogether - has to drop the tie rather
   * than leave one joining two different notes.
   */
  function dropTies(index, rec) {
    unlinkTies(index, rec);
    removeTie(rec.el, 'start');
    removeTie(rec.el, 'stop');
  }

  /**
   * Removes the <note>. A notehead that carries <chord/> members hands its
   * onset to the first of them instead of taking the whole chord with it.
   * The freed time is padded with rests (BAR DURATION POLICY).
   */
  function deleteNote(xml, locator) {
    return editNote(xml, locator, function (ctx) {
      const noteEl = ctx.rec.el;
      unlinkTies(ctx.index, ctx.rec);
      if (ctx.rec.isChordMember) {
        removeIndented(noteEl);
        return null;               // chord members occupy no extra time
      }
      const members = chordMemberElements(noteEl);
      if (members.length > 1) {
        const heir = members[1];
        const chordTag = childNamed(heir, 'chord');
        if (chordTag) removeIndented(chordTag);
        removeIndented(noteEl);
        return null;
      }
      const grace = ctx.rec.isGrace;
      removeIndented(noteEl);
      return grace ? null : { rebalance: true };
    });
  }

  /**
   * A new <note> before or after the located one, in the same voice and
   * staff. The bar is rebalanced afterwards with the new note protected, so
   * inserting pushes material out of the bar rather than undoing itself.
   */
  function insertNote(xml, locator, spec) {
    return editNote(xml, locator, function (ctx) {
      const options = spec || {};
      const where = options.where === 'before' ? 'before' : 'after';
      const type = options.type || ctx.rec.type || 'quarter';
      if (!(type in TYPE_QUARTERS)) return false;
      const dots = Math.max(0, Math.round(Number(options.dots) || 0));
      const divisions = ctx.measure.divisions || 1;
      const head = chordHeadElement(ctx.rec.el);
      const group = chordMemberElements(head);
      const ref = where === 'before' ? head : group[group.length - 1];
      const note = createNoteElement(ctx.doc, {
        isRest: !!options.isRest,
        step: options.step || 'B',
        alter: Math.round(Number(options.alter) || 0),
        octave: options.octave === null || options.octave === undefined ? 4 : Math.round(Number(options.octave)),
        duration: Math.max(1, Math.round(durationOfType(type, dots, divisions))),
        voice: ctx.rec.voice,
        type: type,
        dots: dots,
        staff: textIn(head, 'staff')
      });
      placeElement(ctx.measure.el, ref, where, note, ctx.unit);
      return { rebalance: true, protect: [note] };
    });
  }

  /**
   * Ties to the next note of the same pitch in the same voice - <tie> for
   * playback plus <tied> for the drawn slur. Turning it off also removes the
   * other end, so a tie never dangles.
   */
  function setTie(xml, locator, on) {
    return editNote(xml, locator, function (ctx) {
      const rec = ctx.rec;
      if (on) {
        if (rec.isRest || rec.isGrace) return false;
        const next = tiePartner(ctx.index, rec, 1);
        if (!next) return false;
        addTie(rec.el, 'start');
        addTie(next.el, 'stop');
        return null;
      }
      unlinkTies(ctx.index, rec);
      removeTie(rec.el, 'start');
      removeTie(rec.el, 'stop');
      return null;
    });
  }

  /** Another notehead at the same onset: a <note> carrying <chord/>. */
  function addChordMember(xml, locator, pitch) {
    return editNote(xml, locator, function (ctx) {
      if (!pitch || !pitch.step) return false;
      const head = chordHeadElement(ctx.rec.el);
      if (childNamed(head, 'rest')) return false;
      const group = chordMemberElements(head);
      const note = createNoteElement(ctx.doc, {
        isChordMember: true,
        step: String(pitch.step).toUpperCase(),
        alter: Math.round(Number(pitch.alter) || 0),
        octave: pitch.octave === null || pitch.octave === undefined ? 4 : Math.round(Number(pitch.octave)),
        duration: numberIn(head, 'duration', 0),
        voice: textIn(head, 'voice') || ctx.rec.voice,
        type: textIn(head, 'type'),
        dots: childrenNamed(head, 'dot').length,
        staff: textIn(head, 'staff')
      });
      placeElement(ctx.measure.el, group[group.length - 1], 'after', note, ctx.unit);
      return null;                 // chord members add no time
    });
  }

  /**
   * Takes one notehead out of a chord. Pointing at the head promotes the
   * next member so the chord keeps its onset and duration.
   */
  function removeChordMember(xml, locator) {
    return editNote(xml, locator, function (ctx) {
      const noteEl = ctx.rec.el;
      // The notehead leaves the score, so any tie it was half of goes with it -
      // the same reason deleteNote unlinks first.
      unlinkTies(ctx.index, ctx.rec);
      if (ctx.rec.isChordMember) {
        removeIndented(noteEl);
        return null;
      }
      const members = chordMemberElements(noteEl);
      if (members.length < 2) return false;   // not part of a chord
      const heir = members[1];
      const chordTag = childNamed(heir, 'chord');
      if (chordTag) removeIndented(chordTag);
      removeIndented(noteEl);
      return null;
    });
  }

  // ---------------------------------------------------------------------
  // MEASURE OPERATIONS
  // ---------------------------------------------------------------------

  function renumberFrom(part, fromIndex, delta) {
    for (let i = fromIndex; i < part.measures.length; i++) {
      const el = part.measures[i].el;
      const raw = el.getAttribute('number');
      const n = parseInt(raw, 10);
      if (isFinite(n) && String(n) === String(raw).trim()) el.setAttribute('number', String(n + delta));
    }
  }

  function createMeasureElement(doc, number, duration) {
    const measure = doc.createElement('measure');
    measure.setAttribute('number', String(number));
    const note = createNoteElement(doc, {
      isRest: true, measureRest: true, duration: duration, voice: '1'
    });
    measure.appendChild(note);
    return measure;
  }

  /**
   * A new bar filled with a whole-measure rest, after `afterMeasureNumber`
   * (0 puts it in front of the score, null/undefined appends). partId null
   * inserts it in EVERY part so the parts stay aligned; every following
   * <measure number> in each part that got one is renumbered.
   */
  function insertMeasure(xml, options) {
    const opts = options || {};
    const doc = cloneDocument(xml);
    const index = buildScoreIndex(doc);
    if (!index.parts.length) return unchanged(xml);
    const unit = detectIndentUnit(doc);
    const parts = opts.partId === null || opts.partId === undefined
      ? index.parts
      : (index.partsById[opts.partId] ? [index.partsById[opts.partId]] : []);
    if (!parts.length) return unchanged(xml);

    const after = opts.afterMeasureNumber;
    const append = after === null || after === undefined;
    let touched = 0;

    parts.forEach(function (part) {
      if (!part.measures.length) return;
      let at;                                     // index of the measure to insert AFTER
      if (append) at = part.measures.length - 1;
      else if (Number(after) === 0 && !(0 in part.measuresByNumber)) at = -1;
      else {
        const found = part.measuresByNumber[Number(after)];
        if (!found) return;
        at = found.index;
      }
      const anchor = at >= 0 ? part.measures[at] : null;
      const divisions = anchor ? anchor.divisions : part.measures[0].divisions;
      const time = timeInForce(part, at >= 0 ? at : 0);
      const duration = expectedDuration(time, divisions || 1);
      const number = anchor ? anchor.number + 1 : Math.max(1, part.measures[0].number);
      const measureEl = createMeasureElement(doc, number, Math.max(1, Math.round(duration || divisions * 4)));
      placeElement(part.el, anchor ? anchor.el : part.measures[0].el, anchor ? 'after' : 'before', measureEl, unit);
      if (!anchor) {
        // A bar inserted in FRONT of the score becomes the one that has to
        // declare divisions, key, time, clef and transpose - the old first bar
        // is no longer first. Without <divisions> the new bar's own
        // whole-measure rest has no scale and the score stops rendering, so
        // the attributes move forward, the mirror of what deleteMeasure does.
        migrateAttributes(part.measures[0].el, measureEl, unit, true);
      }
      renumberFrom(part, at + 1, 1);
      touched++;
    });

    return touched ? serializeDoc(doc) : unchanged(xml);
  }

  /**
   * Copies divisions/key/time/clef/... forward when their bar is deleted.
   * `move` also strips them from the source, for when that bar survives and
   * would otherwise re-declare a key or clef it no longer introduces.
   */
  function migrateAttributes(fromMeasureEl, toMeasureEl, unit, move) {
    const sources = childrenNamed(fromMeasureEl, 'attributes');
    if (!sources.length || !toMeasureEl) return;
    const doc = toMeasureEl.ownerDocument;
    let target = childNamed(toMeasureEl, 'attributes');
    if (!target) {
      target = doc.createElement('attributes');
      placeElement(toMeasureEl, toMeasureEl.firstElementChild, 'before', target, unit);
    }
    const has = function (tag, number) {
      return childrenNamed(target, tag).some(function (c) {
        return (c.getAttribute('number') || '') === (number || '');
      });
    };
    sources.forEach(function (source) {
      for (let c = source.firstElementChild; c; c = c.nextElementSibling) {
        if (has(c.localName, c.getAttribute('number'))) continue;
        // The clone already carries the indentation it had one bar earlier.
        insertInOrder(target, c.cloneNode(true), ATTRIBUTES_CHILD_ORDER);
      }
    });
    if (move) sources.forEach(removeIndented);
  }

  /**
   * Removes the bar from EVERY part and renumbers what follows. Anything the
   * bar declared (divisions, key, time, clef, transpose...) moves onto the
   * next bar, so deleting bar 1 never strips the score of its attributes.
   * A part with a single measure is left alone - an empty part is not a score.
   */
  function deleteMeasure(xml, options) {
    const opts = options || {};
    const number = Number(opts.measureNumber);
    if (!isFinite(number)) return unchanged(xml);
    const doc = cloneDocument(xml);
    const index = buildScoreIndex(doc);
    const unit = detectIndentUnit(doc);
    let touched = 0;
    index.parts.forEach(function (part) {
      const measure = part.measuresByNumber[number];
      if (!measure || part.measures.length < 2) return;
      const next = part.measures[measure.index + 1] || null;
      if (next) migrateAttributes(measure.el, next.el, unit);
      removeIndented(measure.el);
      renumberFrom(part, measure.index + 1, -1);
      touched++;
    });
    return touched ? serializeDoc(doc) : unchanged(xml);
  }

  /**
   * Writes <time> into that bar of every part (a time signature the parts
   * disagree on is not a score). The bars themselves are NOT re-cut: what no
   * longer adds up shows up in measureDurationReport() for the UI to flag.
   */
  function setTimeSignature(xml, options) {
    const opts = options || {};
    const beats = Math.round(Number(opts.beats));
    const beatType = Math.round(Number(opts.beatType));
    const number = Number(opts.measureNumber);
    if (!isFinite(beats) || beats < 1 || !isFinite(beatType) || beatType < 1 || !isFinite(number)) {
      return unchanged(xml);
    }
    const doc = cloneDocument(xml);
    const index = buildScoreIndex(doc);
    const unit = detectIndentUnit(doc);
    let touched = 0;
    index.parts.forEach(function (part) {
      const measure = part.measuresByNumber[number];
      if (!measure) return;
      let attrs = childNamed(measure.el, 'attributes');
      if (!attrs) {
        attrs = doc.createElement('attributes');
        placeElement(measure.el, measure.el.firstElementChild, 'before', attrs, unit);
      }
      const time = childNamed(attrs, 'time');
      if (time) {
        const senza = childNamed(time, 'senza-misura');
        if (senza) removeIndented(senza);
        setChild(time, 'beats', String(beats), TIME_CHILD_ORDER);
        setChild(time, 'beat-type', String(beatType), TIME_CHILD_ORDER);
      } else {
        const created = doc.createElement('time');
        appendText(created, 'beats', String(beats));
        appendText(created, 'beat-type', String(beatType));
        insertInOrder(attrs, created, ATTRIBUTES_CHILD_ORDER);
        indentTree(created, whitespaceIndent(created), unit);
      }
      touched++;
    });
    return touched ? serializeDoc(doc) : unchanged(xml);
  }

  // ---------------------------------------------------------------------
  // HARMONY (CHORD SYMBOL) OPERATIONS
  // ---------------------------------------------------------------------

  function harmonyDocumentIndex(doc, harmonyEl) {
    const all = doc.getElementsByTagName('harmony');
    for (let i = 0; i < all.length; i++) if (all[i] === harmonyEl) return i;
    return -1;
  }

  /**
   * Chord text goes through MusicXMLTools' parseChord + SUFFIX_TO_KIND, the
   * same path the score editor uses, so the result is a <kind> OSMD really
   * draws rather than a text attribute it ignores.
   */
  function writeChordText(doc, harmonyEl, text) {
    const tools = window.MusicXMLTools;
    if (!tools || typeof tools.applyEdits !== 'function') {
      throw new Error('musicxml-tools.js must be loaded before the harmony operations');
    }
    const id = harmonyDocumentIndex(doc, harmonyEl);
    if (id < 0) return null;
    return tools.applyEdits(serializeDoc(doc), { chords: [{ id: id, text: text }] });
  }

  /** '' removes the chord symbol. */
  function setHarmonyText(xml, locator, text) {
    const loc = asHarmonyLocator(locator);
    if (!loc) return unchanged(xml);
    const doc = cloneDocument(xml);
    const index = buildScoreIndex(doc);
    const rec = resolveHarmonyLocator(index, loc);
    if (!rec) return unchanged(xml);
    const out = writeChordText(doc, rec.el, String(text === null || text === undefined ? '' : text));
    return out === null ? unchanged(xml) : out;
  }

  /**
   * The chord symbols already hanging on a note. MusicXML anchors a <harmony>
   * to the <note> that follows it, so they are the run of <harmony> elements
   * immediately before the notehead; <direction>, <print> and friends may sit
   * in between without breaking the link.
   */
  function harmoniesOnNote(noteEl) {
    const head = chordHeadElement(noteEl);
    const found = [];
    for (let el = head.previousElementSibling; el; el = el.previousElementSibling) {
      const name = el.localName;
      if (name === 'harmony') { found.unshift(el); continue; }
      if (name === 'direction' || name === 'print' || name === 'sound' || name === 'barline') continue;
      break;
    }
    return found;
  }

  /**
   * The chord symbol on the located note: its own one rewritten when it
   * already has one, a new <harmony> in front of its <note> when it does not.
   * Appending a second symbol to a note that already carries one would draw
   * two labels on the same notehead, so this replaces rather than piles up.
   */
  function addHarmony(xml, noteLocator, text) {
    const loc = asNoteLocator(noteLocator);
    const label = String(text === null || text === undefined ? '' : text).trim();
    if (!loc || !label) return unchanged(xml);
    const doc = cloneDocument(xml);
    const index = buildScoreIndex(doc);
    const rec = resolveLocator(index, loc);
    if (!rec) return unchanged(xml);
    const unit = detectIndentUnit(doc);
    const head = chordHeadElement(rec.el);

    const already = harmoniesOnNote(rec.el);
    if (already.length) {
      const out = writeChordText(doc, already[already.length - 1], label);
      return out === null ? unchanged(xml) : out;
    }

    // A minimal, valid <harmony>; writeChordText then fills in the real root,
    // kind and bass through the shared chord grammar.
    const harmony = doc.createElement('harmony');
    const root = doc.createElement('root');
    appendText(root, 'root-step', 'C');
    harmony.appendChild(root);
    appendText(harmony, 'kind', 'major');
    placeElement(rec.measureEl, head, 'before', harmony, unit);

    const out = writeChordText(doc, harmony, label);
    return out === null ? unchanged(xml) : out;
  }

  function removeHarmony(xml, locator) {
    const loc = asHarmonyLocator(locator);
    if (!loc) return unchanged(xml);
    const doc = cloneDocument(xml);
    const index = buildScoreIndex(doc);
    const rec = resolveHarmonyLocator(index, loc);
    if (!rec) return unchanged(xml);
    removeIndented(rec.el);
    return serializeDoc(doc);
  }

  /**
   * Re-attaches a chord symbol to a different note, inside the bar or across
   * barlines: MusicXML aligns a <harmony> with the <note> it precedes, so the
   * element is physically moved there and any <offset> - which only shifts it
   * further - is dropped, landing the symbol exactly on the target.
   */
  function moveHarmony(xml, harmonyLocator, targetNoteLocator) {
    const hLoc = asHarmonyLocator(harmonyLocator);
    const nLoc = asNoteLocator(targetNoteLocator);
    if (!hLoc || !nLoc) return unchanged(xml);
    const doc = cloneDocument(xml);
    const index = buildScoreIndex(doc);
    const harmony = resolveHarmonyLocator(index, hLoc);
    const note = resolveLocator(index, nLoc);
    if (!harmony || !note) return unchanged(xml);
    const head = chordHeadElement(note.el);
    const offset = childNamed(harmony.el, 'offset');
    if (!offset && harmony.el.nextElementSibling === head && harmony.el.parentNode === head.parentNode) {
      return serializeDoc(doc);          // already exactly where it belongs
    }
    const unit = detectIndentUnit(doc);
    if (offset) removeIndented(offset);
    removeIndented(harmony.el);
    placeElement(head.parentNode, head, 'before', harmony.el, unit);
    return serializeDoc(doc);
  }

  /**
   * Fine placement through <offset> (divisions, may be negative); 0 removes
   * it. Correct MusicXML that other readers honour - OSMD 1.8.8 itself
   * ignores <offset> and draws the symbol over the staff entry it found.
   */
  function nudgeHarmony(xml, locator, deltaDivisions) {
    const loc = asHarmonyLocator(locator);
    const delta = Number(deltaDivisions);
    if (!loc || !isFinite(delta)) return unchanged(xml);
    const doc = cloneDocument(xml);
    const index = buildScoreIndex(doc);
    const rec = resolveHarmonyLocator(index, loc);
    if (!rec) return unchanged(xml);
    const next = tidy((rec.offset || 0) + delta);
    const existing = childNamed(rec.el, 'offset');
    if (!next) {
      if (existing) removeIndented(existing);
      return serializeDoc(doc);
    }
    if (existing) existing.textContent = String(next);
    else {
      const el = doc.createElement('offset');
      el.textContent = String(next);
      insertInOrder(rec.el, el, HARMONY_CHILD_ORDER);
    }
    return serializeDoc(doc);
  }

  window.MusicXMLEdit = {
    buildScoreIndex: buildScoreIndex,
    locatorFromGraphicalNote: locatorFromGraphicalNote,
    locatorFromNoteRecord: locatorFromNoteRecord,
    locatorFromHarmonyRecord: locatorFromHarmonyRecord,
    resolveLocator: resolveLocator,
    resolveHarmonyLocator: resolveHarmonyLocator,
    findMeasure: findMeasure,
    hitTest: hitTest,
    hitRects: hitRects,
    invalidateHitCache: invalidateHitCache,
    noteSvgElement: noteSvgElement,
    eachGraphicalNote: eachGraphicalNote,
    collectGraphicalNotes: collectGraphicalNotes,
    // Edit operations - XML in, new XML string out, input never touched
    setPitch: setPitch,
    nudgePitch: nudgePitch,
    nudgeOctave: nudgeOctave,
    setAccidental: setAccidental,
    setDuration: setDuration,
    toggleRest: toggleRest,
    deleteNote: deleteNote,
    insertNote: insertNote,
    setTie: setTie,
    addChordMember: addChordMember,
    removeChordMember: removeChordMember,
    insertMeasure: insertMeasure,
    deleteMeasure: deleteMeasure,
    setTimeSignature: setTimeSignature,
    measureDurationReport: measureDurationReport,
    setHarmonyText: setHarmonyText,
    addHarmony: addHarmony,
    removeHarmony: removeHarmony,
    moveHarmony: moveHarmony,
    nudgeHarmony: nudgeHarmony,
    // Pure helpers, exposed for unit tests
    durationOfType: durationOfType,
    typeForDuration: typeForDuration,
    splitDuration: splitDuration,
    TYPE_QUARTERS: TYPE_QUARTERS,
    ALTER_TO_ACCIDENTAL: ALTER_TO_ACCIDENTAL,
    semitoneOf: semitoneOf,
    STEP_SEMITONES: STEP_SEMITONES,
    ONSET_EPSILON: ONSET_EPSILON,
    DEFAULT_TOLERANCE: DEFAULT_TOLERANCE
  };
})();
