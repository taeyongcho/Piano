// 음악 이론 유틸리티 — 음이름, 음계, 화음, 조표
// 내부 표기는 ASCII('#', 'b')를 쓰고, 화면에 보일 때만 pretty()로 ♯/♭ 로 바꾼다.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// 계이름(도레미)과 한국식 음이름(다라마) — 흰건반 7음 기준
export const SOLFEGE = ['도', '레', '미', '파', '솔', '라', '시'];
export const KOREAN_LETTERS = ['다', '라', '마', '바', '사', '가', '나'];

export const pretty = (sym) => String(sym).replace(/#/g, '♯').replace(/b/g, '♭');

export const isBlackKey = (midi) => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
export const octaveOf = (midi) => Math.floor(midi / 12) - 1;

/** MIDI 번호를 철자(letter/accidental/octave)로 푼다. sig<0 이면 플랫 조로 읽는다. */
export function spell(midi, sig = 0) {
  const name = (sig < 0 ? FLAT_NAMES : SHARP_NAMES)[((midi % 12) + 12) % 12];
  const letter = name[0];
  const acc = name.length > 1 ? (name[1] === '#' ? 1 : -1) : 0;
  return { midi, letter, acc, octave: octaveOf(midi) };
}

/** 오선 위의 세로 위치를 정하는 값. 한 칸(줄→칸)이 1씩 움직인다. */
export const staffStep = ({ letter, octave }) => octave * 7 + LETTERS.indexOf(letter);

/** 표시용 음이름. style: 'en' | 'solfege' | 'ko', octave를 붙일지 선택 */
export function noteLabel(midi, { style = 'en', sig = 0, withOctave = false } = {}) {
  const s = spell(midi, sig);
  const idx = LETTERS.indexOf(s.letter);
  const accStr = s.acc === 1 ? '♯' : s.acc === -1 ? '♭' : '';
  let base;
  if (style === 'solfege') base = accStr + SOLFEGE[idx];
  else if (style === 'ko') base = accStr + KOREAN_LETTERS[idx];
  else base = s.letter + accStr;
  return withOctave ? `${base}${s.octave}` : base;
}

/** "C#4" / "Bb3" / "F4" → MIDI 번호 */
export function nameToMidi(name) {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim());
  if (!m) throw new Error(`음이름을 해석할 수 없습니다: ${name}`);
  const semitone = LETTER_SEMITONE[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return (Number(m[3]) + 1) * 12 + semitone;
}

// ── 조표 ────────────────────────────────────────────────────────────────────
export const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
export const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** 조표에 포함된 임시표. { F: 1, C: 1 } 처럼 letter → +1(#)/-1(b) */
export function keyAccidentals(sig) {
  const map = {};
  if (sig > 0) SHARP_ORDER.slice(0, sig).forEach((l) => (map[l] = 1));
  else if (sig < 0) FLAT_ORDER.slice(0, -sig).forEach((l) => (map[l] = -1));
  return map;
}

// 장조/단조 으뜸음 → 조표 개수(양수=#, 음수=b)
const MAJOR_SIG = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6 };
const MINOR_SIG = { A: 0, E: 1, B: 2, 'F#': 3, 'C#': 4, 'G#': 5, 'D#': 6, D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6 };

export const MAJOR_KEYS = Object.keys(MAJOR_SIG);
export const MINOR_KEYS = Object.keys(MINOR_SIG);

export function keySignature(tonicName, mode = 'major') {
  const table = mode === 'minor' ? MINOR_SIG : MAJOR_SIG;
  return table[tonicName] ?? 0;
}

// ── 음계 ────────────────────────────────────────────────────────────────────
export const SCALES = {
  major: { name: '장음계', iv: [0, 2, 4, 5, 7, 9, 11] },
  natural_minor: { name: '자연 단음계', iv: [0, 2, 3, 5, 7, 8, 10] },
  harmonic_minor: { name: '화성 단음계', iv: [0, 2, 3, 5, 7, 8, 11] },
  melodic_minor: { name: '가락 단음계', iv: [0, 2, 3, 5, 7, 9, 11] },
  major_pentatonic: { name: '장5음계', iv: [0, 2, 4, 7, 9] },
  minor_pentatonic: { name: '단5음계', iv: [0, 3, 5, 7, 10] },
  blues: { name: '블루스', iv: [0, 3, 5, 6, 7, 10] },
  dorian: { name: '도리안', iv: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { name: '프리지안', iv: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { name: '리디안', iv: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { name: '믹솔리디안', iv: [0, 2, 4, 5, 7, 9, 10] },
  locrian: { name: '로크리안', iv: [0, 1, 3, 5, 6, 8, 10] },
  whole_tone: { name: '온음음계', iv: [0, 2, 4, 6, 8, 10] },
  chromatic: { name: '반음계', iv: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

/** 음계를 MIDI 번호 배열로. 오름차순 한 옥타브 + 마지막 으뜸음까지 포함. */
export function scaleNotes(rootMidi, scaleKey, octaves = 1) {
  const iv = SCALES[scaleKey].iv;
  const out = [];
  for (let o = 0; o < octaves; o++) for (const i of iv) out.push(rootMidi + o * 12 + i);
  out.push(rootMidi + octaves * 12);
  return out;
}

// ── 화음 ────────────────────────────────────────────────────────────────────
// 앞쪽에 있을수록 화음 인식 시 우선한다.
export const CHORD_DEFS = [
  { sym: '', name: '메이저', iv: [0, 4, 7] },
  { sym: 'm', name: '마이너', iv: [0, 3, 7] },
  { sym: '7', name: '속7', iv: [0, 4, 7, 10] },
  { sym: 'maj7', name: '메이저7', iv: [0, 4, 7, 11] },
  { sym: 'm7', name: '마이너7', iv: [0, 3, 7, 10] },
  { sym: 'dim', name: '감3화음', iv: [0, 3, 6] },
  { sym: 'aug', name: '증3화음', iv: [0, 4, 8] },
  { sym: 'sus4', name: 'sus4', iv: [0, 5, 7] },
  { sym: 'sus2', name: 'sus2', iv: [0, 2, 7] },
  { sym: '6', name: '메이저6', iv: [0, 4, 7, 9] },
  { sym: 'm6', name: '마이너6', iv: [0, 3, 7, 9] },
  { sym: 'm7b5', name: '반감7', iv: [0, 3, 6, 10] },
  { sym: 'dim7', name: '감7', iv: [0, 3, 6, 9] },
  { sym: 'mMaj7', name: '마이너메이저7', iv: [0, 3, 7, 11] },
  { sym: 'add9', name: 'add9', iv: [0, 4, 7, 14] },
  { sym: '9', name: '9화음', iv: [0, 4, 7, 10, 14] },
  { sym: 'maj9', name: '메이저9', iv: [0, 4, 7, 11, 14] },
  { sym: 'm9', name: '마이너9', iv: [0, 3, 7, 10, 14] },
];

export const INTERVAL_NAMES = [
  '완전1도', '단2도', '장2도', '단3도', '장3도', '완전4도',
  '증4도/감5도', '완전5도', '단6도', '장6도', '단7도', '장7도', '완전8도',
];

export const intervalName = (semitones) => INTERVAL_NAMES[Math.min(Math.abs(semitones), 12)] ?? `${semitones}반음`;

const pcSet = (arr) => [...new Set(arr.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b);

/**
 * 누르고 있는 음들로부터 화음을 추정한다.
 * 근음이 최저음이면 가산점을 줘서 자리바꿈보다 기본 위치를 먼저 고른다.
 */
export function detectChord(midis, { sig = 0 } = {}) {
  const notes = [...new Set(midis)].sort((a, b) => a - b);
  if (notes.length < 2) return null;
  if (notes.length === 2) {
    const d = notes[1] - notes[0];
    return { kind: 'interval', text: intervalName(d % 12 === 0 && d > 0 ? 12 : d % 12), semitones: d };
  }

  const pcs = pcSet(notes);
  const bassPc = ((notes[0] % 12) + 12) % 12;
  let best = null;

  for (let root = 0; root < 12; root++) {
    const rel = pcs.map((p) => (p - root + 12) % 12).sort((a, b) => a - b);
    CHORD_DEFS.forEach((def, defIndex) => {
      const target = pcSet(def.iv);
      if (target.length !== rel.length) return;
      if (!target.every((v, i) => v === rel[i])) return;
      let score = 1000 - defIndex;
      if (root === bassPc) score += 5000;
      if (!best || score > best.score) best = { root, def, score };
    });
  }
  if (!best) return { kind: 'unknown', text: '?' };

  const rootName = pretty((sig < 0 ? FLAT_NAMES : SHARP_NAMES)[best.root]);
  const bassName = pretty((sig < 0 ? FLAT_NAMES : SHARP_NAMES)[bassPc]);
  const symbol = rootName + best.def.sym;
  return {
    kind: 'chord',
    rootPc: best.root,
    bassPc,
    def: best.def,
    inverted: best.root !== bassPc,
    text: best.root === bassPc ? symbol : `${symbol}/${bassName}`,
    name: best.def.name,
  };
}

/** 화음 기호(예: 'Cmaj7')와 근음 MIDI로 실제 음 배열을 만든다. */
export function chordNotes(rootMidi, sym) {
  const def = CHORD_DEFS.find((d) => d.sym === sym);
  if (!def) throw new Error(`알 수 없는 화음: ${sym}`);
  return def.iv.map((i) => rootMidi + i);
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** 어떤 조의 다이아토닉 화음 목록(3화음 또는 7화음). */
export function diatonicChords(tonicPc, scaleKey = 'major', seventh = false) {
  const iv = SCALES[scaleKey].iv;
  if (iv.length !== 7) throw new Error('7음 음계에서만 다이아토닉 화음을 만들 수 있습니다.');
  return iv.map((_, degree) => {
    const pick = (n) => iv[(degree + n) % 7] + (degree + n >= 7 ? 12 : 0);
    const tones = seventh ? [pick(0), pick(2), pick(4), pick(6)] : [pick(0), pick(2), pick(4)];
    const rel = tones.map((t) => (t - iv[degree] + 12) % 12).sort((a, b) => a - b);
    const def = CHORD_DEFS.find((d) => {
      const target = pcSet(d.iv);
      return target.length === rel.length && target.every((v, i) => v === rel[i]);
    });
    const rootPc = (tonicPc + iv[degree]) % 12;
    const sym = def ? def.sym : '';
    const minorish = /^(m(?!aj)|dim)/.test(sym); // maj7 은 장화음이므로 제외
    const suffix = sym === 'dim' || sym === 'dim7' ? '°' : sym === 'm7b5' ? 'ø' : sym === 'aug' ? '+' : '';
    return {
      degree,
      roman: (minorish ? ROMAN[degree].toLowerCase() : ROMAN[degree]) + suffix,
      rootPc,
      sym,
      symbol: pretty(SHARP_NAMES[rootPc] + sym),
      intervals: def ? def.iv : rel,
    };
  });
}
