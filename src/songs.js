// 기본 제공 연습곡. 모두 저작권이 소멸했거나 전래되는 선율이다.
// 박(beat) 단위로 적어 두고 템포에 맞춰 초 단위로 펼친다.
//
// 표기: [시작 박, 길이(박), 음높이] — 음높이는 MIDI 번호. 60 = 가운데 도(C4)

const C3 = [48, 52, 55];  // 도미솔 (다장조)
const F2 = [41, 45, 48];  // 파라도
const G2 = [43, 47, 50];  // 솔시레

/** 한 손 화음을 [시작, 길이, 음] 목록으로 펼친다. */
const chord = (beat, length, notes) => notes.map((midi) => [beat, length, midi]);

/** 멜로디를 [음, 길이] 연속으로 적고 시작 박을 자동으로 채운다. */
function line(startBeat, pairs) {
  let beat = startBeat;
  const out = [];
  for (const [midi, length] of pairs) {
    if (midi !== null) out.push([beat, length, midi]);
    beat += length;
  }
  return out;
}

const Q = 1;      // 4분음표
const H = 2;      // 2분음표
const W = 4;      // 온음표
const DQ = 1.5;   // 점4분음표
const E = 0.5;    // 8분음표

// ── 반짝반짝 작은 별 ────────────────────────────────────────────────────────
const twinkleRight = line(0, [
  [60, Q], [60, Q], [67, Q], [67, Q],
  [69, Q], [69, Q], [67, H],
  [65, Q], [65, Q], [64, Q], [64, Q],
  [62, Q], [62, Q], [60, H],
  [67, Q], [67, Q], [65, Q], [65, Q],
  [64, Q], [64, Q], [62, H],
  [67, Q], [67, Q], [65, Q], [65, Q],
  [64, Q], [64, Q], [62, H],
  [60, Q], [60, Q], [67, Q], [67, Q],
  [69, Q], [69, Q], [67, H],
  [65, Q], [65, Q], [64, Q], [64, Q],
  [62, Q], [62, Q], [60, H],
]);
const twinkleLeftPlan = [
  [C3, C3], [F2, C3], [F2, C3], [G2, C3],
  [C3, F2], [C3, G2], [C3, F2], [C3, G2],
  [C3, C3], [F2, C3], [F2, C3], [G2, C3],
];
const twinkleLeft = twinkleLeftPlan.flatMap((bar, i) =>
  bar.flatMap((notes, half) => chord(i * 4 + half * 2, H, notes)));

// ── 환희의 송가 (베토벤) ────────────────────────────────────────────────────
const odeRight = line(0, [
  [64, Q], [64, Q], [65, Q], [67, Q],
  [67, Q], [65, Q], [64, Q], [62, Q],
  [60, Q], [60, Q], [62, Q], [64, Q],
  [64, DQ], [62, E], [62, H],
  [64, Q], [64, Q], [65, Q], [67, Q],
  [67, Q], [65, Q], [64, Q], [62, Q],
  [60, Q], [60, Q], [62, Q], [64, Q],
  [62, DQ], [60, E], [60, H],
]);
const odeLeftPlan = [
  [C3, C3], [C3, G2], [C3, G2], [G2, G2],
  [C3, C3], [C3, G2], [C3, G2], [G2, C3],
];
const odeLeft = odeLeftPlan.flatMap((bar, i) =>
  bar.flatMap((notes, half) => chord(i * 4 + half * 2, H, notes)));

// ── 비행기 (전래 선율) ──────────────────────────────────────────────────────
const planeRight = line(0, [
  [64, Q], [62, Q], [60, Q], [62, Q],
  [64, Q], [64, Q], [64, H],
  [62, Q], [62, Q], [62, H],
  [64, Q], [67, Q], [67, H],
  [64, Q], [62, Q], [60, Q], [62, Q],
  [64, Q], [64, Q], [64, Q], [64, Q],
  [62, Q], [62, Q], [64, Q], [62, Q],
  [60, W],
]);
const planeLeftPlan = [C3, C3, G2, C3, C3, C3, G2, C3];
const planeLeft = planeLeftPlan.flatMap((notes, i) => chord(i * 4, W, notes));

export const BUILT_IN_SONGS = [
  {
    id: 'twinkle',
    title: '반짝반짝 작은 별',
    composer: '전래 (프랑스 민요)',
    bpm: 96,
    timeSignature: { numerator: 4, denominator: 4 },
    right: twinkleRight,
    left: twinkleLeft,
    note: '오른손 멜로디 · 왼손 2분음표 화음. 가장 먼저 해보기 좋습니다.',
  },
  {
    id: 'ode',
    title: '환희의 송가',
    composer: '베토벤',
    bpm: 108,
    timeSignature: { numerator: 4, denominator: 4 },
    right: odeRight,
    left: odeLeft,
    note: '점4분음표 리듬이 한 번 나옵니다.',
  },
  {
    id: 'plane',
    title: '비행기',
    composer: '전래',
    bpm: 100,
    timeSignature: { numerator: 4, denominator: 4 },
    right: planeRight,
    left: planeLeft,
    note: '왼손이 온음표라 가장 단순합니다.',
  },
];

/** 기본 제공 곡을 parseMidiFile 과 같은 모양으로 펼친다. */
export function buildSong(def) {
  const secondsPerBeat = 60 / def.bpm;
  const make = (entries, hand, track) => entries.map(([beat, length, midi]) => ({
    midi,
    velocity: hand === 'right' ? 92 : 74,
    track,
    channel: track,
    hand,
    start: beat * secondsPerBeat,
    end: (beat + length) * secondsPerBeat,
    duration: length * secondsPerBeat,
  }));

  const notes = [...make(def.right, 'right', 0), ...make(def.left, 'left', 1)]
    .sort((a, b) => a.start - b.start || a.midi - b.midi);

  return {
    name: def.title,
    composer: def.composer,
    builtIn: true,
    id: def.id,
    format: 1,
    ticksPerBeat: 480,
    bpm: def.bpm,
    notes,
    tracks: [
      { index: 0, name: '오른손', noteCount: def.right.length, channels: [0], averagePitch: 70 },
      { index: 1, name: '왼손', noteCount: def.left.length, channels: [1], averagePitch: 50 },
    ],
    tempos: [{ tick: 0, time: 0, usPerBeat: Math.round(6e7 / def.bpm), bpm: def.bpm }],
    duration: notes.reduce((max, n) => Math.max(max, n.end), 0),
    timeSignature: def.timeSignature,
    keySignature: 0,
    note: def.note,
  };
}
