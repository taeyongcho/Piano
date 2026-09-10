// 화음 연습 — 코드 기호를 보고 짚기, 그리고 코드 진행 따라 치기.

import { h, panel, field, select, button, toggle, flashArea, pick, shuffle } from '../ui.js';
import { renderStaff } from '../staff.js';
import { CHORD_DEFS, SHARP_NAMES, pretty, chordNotes, diatonicChords, keySignature, noteLabel } from '../theory.js';

const PROGRESSIONS = [
  { name: 'I – V – vi – IV (팝)', degrees: [0, 4, 5, 3] },
  { name: 'ii – V – I (재즈)', degrees: [1, 4, 0], seventh: true },
  { name: 'I – vi – IV – V (50년대)', degrees: [0, 5, 3, 4] },
  { name: 'I – IV – V – I (기본)', degrees: [0, 3, 4, 0] },
  { name: 'vi – IV – I – V', degrees: [5, 3, 0, 4] },
  { name: 'I – iii – IV – V', degrees: [0, 2, 3, 4] },
];

const TRIAD_SYMS = ['', 'm', 'dim', 'aug'];
const SEVENTH_SYMS = ['7', 'maj7', 'm7', 'm7b5', 'dim7'];

export default {
  id: 'chords',
  title: '화음',
  icon: '🎵',
  hint: '코드 기호를 보고 건반에서 짚어보세요. 자리바꿈을 허용하면 어떤 배치로 눌러도 정답입니다.',

  mount(root, ctx) {
    const opts = {
      task: 'symbol', // symbol | progression
      useTriads: true,
      useSevenths: false,
      anyInversion: true,
      progression: 0,
      keyPc: 0,
    };

    const symbolEl = h('div', { class: 'huge' }, '—');
    const subEl = h('div', { class: 'sub' }, '');
    const staffEl = h('div', { class: 'staff-wrap big' });
    const flash = flashArea();
    const chipsEl = h('div', { class: 'note-chips' });
    const scoreEl = h('div', { class: 'stats-row' });

    const score = { correct: 0, attempts: 0, streak: 0, best: 0 };
    let queue = [];
    let qIndex = 0;
    let target = null; // { symbol, notes, pcs }
    let answered = false;
    let wrong = 0;

    const sigOf = () => keySignature(SHARP_NAMES[opts.keyPc], 'major') || 0;

    function symbolPool() {
      const pool = [];
      if (opts.useTriads) pool.push(...TRIAD_SYMS);
      if (opts.useSevenths) pool.push(...SEVENTH_SYMS);
      return pool.length ? pool : TRIAD_SYMS;
    }

    function makeSymbolQuestion() {
      const sym = pick(symbolPool());
      const rootPc = Math.floor(Math.random() * 12);
      const rootMidi = 48 + rootPc + (Math.random() < 0.5 ? 0 : 12);
      const notes = chordNotes(rootMidi, sym);
      const def = CHORD_DEFS.find((d) => d.sym === sym);
      return {
        symbol: pretty(SHARP_NAMES[rootPc] + sym),
        name: def?.name ?? '',
        notes,
        pcs: new Set(notes.map((n) => n % 12)),
      };
    }

    function buildProgression() {
      const prog = PROGRESSIONS[opts.progression];
      const chords = diatonicChords(opts.keyPc, 'major', !!prog.seventh);
      queue = prog.degrees.map((deg) => {
        const chord = chords[deg];
        let rootMidi = 48 + chord.rootPc;
        if (rootMidi < 48) rootMidi += 12;
        const notes = chord.intervals.map((i) => rootMidi + i);
        return {
          symbol: chord.symbol,
          name: chord.roman,
          notes,
          pcs: new Set(notes.map((n) => n % 12)),
        };
      });
      qIndex = 0;
    }

    function nextQuestion() {
      if (opts.task === 'progression') {
        if (!queue.length || qIndex >= queue.length) buildProgression();
        target = queue[qIndex];
        subEl.textContent = `${PROGRESSIONS[opts.progression].name} · ${qIndex + 1}/${queue.length} (${target.name})`;
        qIndex++;
      } else {
        target = makeSymbolQuestion();
        subEl.textContent = target.name;
      }
      answered = false;
      wrong = 0;
      symbolEl.textContent = target.symbol;
      chipsEl.replaceChildren();
      ctx.keyboard.setTargets([]);
      renderStaff(staffEl, { clef: 'grand', sig: sigOf(), groups: [] });
    }

    function held() { return [...ctx.input.held].sort((a, b) => a - b); }

    function check() {
      if (!target || answered) return;
      const notes = held();
      if (!notes.length) return;

      const ok = opts.anyInversion
        ? notes.length >= target.pcs.size
          && new Set(notes.map((n) => n % 12)).size === target.pcs.size
          && notes.every((n) => target.pcs.has(n % 12))
        : notes.length === target.notes.length && target.notes.every((n) => ctx.input.held.has(n));

      chipsEl.replaceChildren(...notes.map((m) => h('span', { class: 'chip' }, noteLabel(m, { style: 'en', sig: sigOf(), withOctave: true }))));

      if (!ok) return;
      answered = true;
      score.attempts++;
      if (wrong === 0) {
        score.correct++;
        score.streak++;
        score.best = Math.max(score.best, score.streak);
        flash.show('정답!', 'ok');
      } else {
        score.streak = 0;
        flash.show('맞았어요', 'warn');
      }
      ctx.stats.record({ correct: wrong === 0 ? 1 : 0, attempts: 1 });
      renderStaff(staffEl, { clef: 'grand', sig: sigOf(), groups: [{ notes, state: 'ok' }] });
      updateScore();
      setTimeout(nextQuestion, 700);
    }

    function updateScore() {
      scoreEl.replaceChildren(
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, String(score.correct)), h('div', { class: 'stat-label' }, '한 번에 맞힘')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, String(score.attempts)), h('div', { class: 'stat-label' }, '푼 문제')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, score.attempts ? `${Math.round((score.correct / score.attempts) * 100)}%` : '—'), h('div', { class: 'stat-label' }, '정확도')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, `${score.streak} / 최고 ${score.best}`), h('div', { class: 'stat-label' }, '연속 정답')),
      );
    }

    ctx.on('noteon', ({ midi }) => {
      if (!target || answered) return;
      const inChord = opts.anyInversion ? target.pcs.has(midi % 12) : target.notes.includes(midi);
      if (!inChord) {
        wrong++;
        score.streak = 0;
        updateScore();
        flash.show('그 음은 이 화음에 없어요', 'err', 900);
      }
      check();
    });
    ctx.on('noteoff', () => {
      if (!answered) chipsEl.replaceChildren(...held().map((m) => h('span', { class: 'chip' }, noteLabel(m, { style: 'en', withOctave: true }))));
    });

    const progressionField = h('span');
    const rebuildProgression = () => {
      progressionField.replaceChildren(select(
        PROGRESSIONS.map((p, i) => ({ value: i, label: p.name })),
        opts.progression,
        (v) => { opts.progression = Number(v); buildProgression(); nextQuestion(); },
      ));
    };
    rebuildProgression();

    root.append(
      panel(null,
        h('div', { class: 'readout' }, symbolEl, subEl, chipsEl),
        staffEl,
        flash,
        h('div', { class: 'row gap' },
          button('건너뛰기', () => { score.streak = 0; updateScore(); nextQuestion(); }),
          button('힌트 보기', () => { ctx.keyboard.setTargets(target.notes); wrong = Math.max(wrong, 1); }),
          button('소리로 듣기', () => ctx.synth.playNotes(target.notes, { duration: 1.1 })),
          button('한 음씩 듣기', () => ctx.synth.playNotes(target.notes, { duration: 0.5, gap: 0.3 })),
        ),
      ),
      panel('점수', scoreEl),
      panel('설정',
        h('div', { class: 'controls' },
          field('연습 종류', select([
            { value: 'symbol', label: '코드 기호 보고 짚기' },
            { value: 'progression', label: '코드 진행 따라 치기' },
          ], opts.task, (v) => { opts.task = v; queue = []; nextQuestion(); })),
          field('조(진행용)', select(SHARP_NAMES.map((n, i) => ({ value: i, label: `${pretty(n)} 장조` })), opts.keyPc, (v) => {
            opts.keyPc = Number(v); buildProgression(); nextQuestion();
          })),
          field('코드 진행', progressionField),
        ),
        h('div', { class: 'row gap wrap' },
          toggle('3화음 출제', opts.useTriads, (v) => { opts.useTriads = v; }),
          toggle('7화음 출제', opts.useSevenths, (v) => { opts.useSevenths = v; }),
          toggle('자리바꿈 허용', opts.anyInversion, (v) => { opts.anyInversion = v; }),
        ),
      ),
    );

    updateScore();
    nextQuestion();

    return () => ctx.keyboard.setTargets([]);
  },
};
