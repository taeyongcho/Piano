// 악보 읽기 — 오선보에 뜬 음을 보고 건반에서 찾아 누른다.

import { h, panel, field, select, button, toggle, flashArea, pick, randInt } from '../ui.js';
import { renderStaff } from '../staff.js';
import { SCALES, noteLabel, keySignature, MAJOR_KEYS, MINOR_KEYS, pretty, diatonicChords } from '../theory.js';

const CLEF_RANGES = {
  treble: [60, 84],
  bass: [36, 60],
  grand: [40, 81],
};

export default {
  id: 'sightread',
  title: '악보 읽기',
  icon: '🎼',
  hint: '오선보에 나온 음을 건반에서 찾아 누르세요. 맞히면 다음 문제로 넘어갑니다.',

  mount(root, ctx) {
    const opts = {
      clef: 'grand',
      tonic: 'C',
      mode: 'major',
      kind: 'single', // single | triad
      accidentals: false,
      autoPlay: false,
      hintAfter: 3,
    };

    const staffEl = h('div', { class: 'staff-wrap big' });
    const flash = flashArea();
    const scoreEls = {
      correct: h('div', { class: 'stat-value' }, '0'),
      attempts: h('div', { class: 'stat-value' }, '0'),
      accuracy: h('div', { class: 'stat-value' }, '—'),
      speed: h('div', { class: 'stat-value' }, '—'),
      streak: h('div', { class: 'stat-value' }, '0'),
    };

    const score = { correct: 0, attempts: 0, streak: 0, best: 0, totalMs: 0 };
    let target = [];
    let askedAt = 0;
    let wrongCount = 0;
    let answered = false;

    const sig = () => keySignature(opts.tonic, opts.mode);
    const scaleKey = () => (opts.mode === 'minor' ? 'natural_minor' : 'major');

    const PITCH_CLASS = {
      C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
      'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
    };
    const tonicPc = () => PITCH_CLASS[opts.tonic] ?? 0;

    function allowedPitchClasses() {
      if (opts.accidentals) return [...Array(12).keys()];
      return SCALES[scaleKey()].iv.map((i) => (tonicPc() + i) % 12);
    }

    function newQuestion() {
      const [low, high] = CLEF_RANGES[opts.clef];
      const pcs = allowedPitchClasses();

      if (opts.kind === 'triad') {
        const chords = diatonicChords(tonicPc(), scaleKey(), false);
        const chord = pick(chords);
        const base = randInt(low, high - 12);
        // 근음을 음역 안으로 옮긴다.
        let rootMidi = base - ((base % 12) - chord.rootPc + 12) % 12;
        while (rootMidi < low) rootMidi += 12;
        while (rootMidi + 7 > high) rootMidi -= 12;
        target = chord.intervals.map((i) => rootMidi + i);
      } else {
        const candidates = [];
        for (let m = low; m <= high; m++) if (pcs.includes(m % 12)) candidates.push(m);
        let next = pick(candidates);
        // 같은 문제가 연달아 나오지 않게 한 번만 다시 뽑는다.
        if (target.length === 1 && next === target[0]) next = pick(candidates);
        target = [next];
      }

      askedAt = performance.now();
      wrongCount = 0;
      answered = false;
      draw('pending');
      ctx.keyboard.setTargets([]);
      if (opts.autoPlay) ctx.synth.playNotes(target, { duration: 0.7, gap: opts.kind === 'triad' ? 0 : 0 });
    }

    function draw(state) {
      renderStaff(staffEl, {
        clef: opts.clef,
        sig: sig(),
        groups: target.length ? [{ notes: target, state }] : [],
      });
    }

    function updateScore() {
      scoreEls.correct.textContent = String(score.correct);
      scoreEls.attempts.textContent = String(score.attempts);
      scoreEls.accuracy.textContent = score.attempts ? `${Math.round((score.correct / score.attempts) * 100)}%` : '—';
      scoreEls.speed.textContent = score.correct ? `${(score.totalMs / score.correct / 1000).toFixed(1)}초` : '—';
      scoreEls.streak.textContent = `${score.streak}${score.best ? ` / 최고 ${score.best}` : ''}`;
    }

    function onCorrect() {
      answered = true;
      const elapsed = performance.now() - askedAt;
      score.attempts++;
      if (wrongCount === 0) {
        score.correct++;
        score.streak++;
        score.best = Math.max(score.best, score.streak);
        score.totalMs += elapsed;
        flash.show(`정답! ${(elapsed / 1000).toFixed(1)}초`, 'ok');
      } else {
        score.streak = 0;
        flash.show(`맞았지만 ${wrongCount}번 틀렸어요`, 'warn');
      }
      ctx.stats.record({ correct: wrongCount === 0 ? 1 : 0, attempts: 1 });
      updateScore();
      draw('ok');
      setTimeout(() => { if (answered) newQuestion(); }, 550);
    }

    ctx.on('noteon', ({ midi }) => {
      if (answered || !target.length) return;
      if (!target.includes(midi)) {
        wrongCount++;
        score.streak = 0;
        updateScore();
        flash.show(`${noteLabel(midi, { style: 'en', sig: sig(), withOctave: true })} — 다시`, 'err', 900);
        draw('err');
        setTimeout(() => { if (!answered) draw('pending'); }, 350);
        if (wrongCount >= opts.hintAfter) ctx.keyboard.setTargets(target);
        return;
      }
      const allHeld = target.every((n) => ctx.input.held.has(n));
      if (allHeld) onCorrect();
    });

    const keyOptions = () => (opts.mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS).map((k) => ({
      value: k, label: `${pretty(k)} ${opts.mode === 'minor' ? '단조' : '장조'}`,
    }));

    const keySelectWrap = h('span');
    const rebuildKeySelect = () => {
      keySelectWrap.replaceChildren(select(keyOptions(), opts.tonic, (v) => { opts.tonic = v; newQuestion(); }));
    };

    const controls = panel('설정',
      h('div', { class: 'controls' },
        field('보표', select([
          { value: 'grand', label: '큰보표' },
          { value: 'treble', label: '높은음자리표' },
          { value: 'bass', label: '낮은음자리표' },
        ], opts.clef, (v) => { opts.clef = v; newQuestion(); })),
        field('조성', select([
          { value: 'major', label: '장조' },
          { value: 'minor', label: '단조' },
        ], opts.mode, (v) => {
          opts.mode = v;
          opts.tonic = v === 'minor' ? 'A' : 'C';
          rebuildKeySelect();
          newQuestion();
        })),
        field('조', keySelectWrap),
        field('문제', select([
          { value: 'single', label: '단음' },
          { value: 'triad', label: '3화음' },
        ], opts.kind, (v) => { opts.kind = v; newQuestion(); })),
      ),
      h('div', { class: 'row gap wrap' },
        toggle('조 밖의 음(임시표)도 출제', opts.accidentals, (v) => { opts.accidentals = v; newQuestion(); }),
        toggle('문제를 소리로 들려주기', opts.autoPlay, (v) => { opts.autoPlay = v; }),
      ),
    );

    rebuildKeySelect();

    root.append(
      panel(null,
        staffEl,
        flash,
        h('div', { class: 'row gap' },
          button('건너뛰기', () => { score.streak = 0; updateScore(); newQuestion(); }),
          button('힌트', () => { ctx.keyboard.setTargets(target); wrongCount = Math.max(wrongCount, opts.hintAfter); }),
          button('소리로 듣기', () => ctx.synth.playNotes(target, { duration: 0.8 })),
        ),
      ),
      panel('점수',
        h('div', { class: 'stats-row' },
          h('div', { class: 'stat' }, scoreEls.correct, h('div', { class: 'stat-label' }, '한 번에 맞힘')),
          h('div', { class: 'stat' }, scoreEls.attempts, h('div', { class: 'stat-label' }, '푼 문제')),
          h('div', { class: 'stat' }, scoreEls.accuracy, h('div', { class: 'stat-label' }, '정확도')),
          h('div', { class: 'stat' }, scoreEls.speed, h('div', { class: 'stat-label' }, '평균 시간')),
          h('div', { class: 'stat' }, scoreEls.streak, h('div', { class: 'stat-label' }, '연속 정답')),
        ),
      ),
      controls,
    );

    updateScore();
    newQuestion();

    return () => ctx.keyboard.setTargets([]);
  },
};
