// 음계 연습 — 고른 음계를 한 음씩 순서대로 짚는다. 메트로놈에 맞춰 고르게 치는 연습.

import { h, panel, field, select, button, toggle, numberInput, flashArea } from '../ui.js';
import { renderStaff } from '../staff.js';
import { SCALES, scaleNotes, noteLabel, SHARP_NAMES, pretty, keySignature } from '../theory.js';
import { SequenceRunner } from '../sequence.js';

const WINDOW = 8; // 오선보에 한 번에 보여줄 음 개수

export default {
  id: 'scales',
  title: '음계',
  icon: '🪜',
  hint: '표시된 음을 순서대로 누르세요. 메트로놈을 켜면 박에 맞춰 치는 연습이 됩니다.',

  mount(root, ctx) {
    const opts = {
      rootPc: 0,
      octave: 4,
      scale: 'major',
      octaves: 2,
      direction: 'updown', // up | down | updown
    };

    const staffEl = h('div', { class: 'staff-wrap big' });
    const progressBar = h('div', { class: 'progress-fill' });
    const nextEl = h('div', { class: 'huge' }, '—');
    const subEl = h('div', { class: 'sub' }, '시작하려면 첫 음을 누르세요');
    const flash = flashArea();
    const resultEl = h('div', { class: 'result' });

    const runner = new SequenceRunner({
      onStep: (step) => showStep(step),
      onError: ({ midi }) => {
        flash.show(`${noteLabel(midi, { style: 'en', withOctave: true })} — 다음 음은 ${labelOf(runner.current?.notes[0])}`, 'err', 1000);
      },
      onDone: (summary) => finish(summary),
    });

    const labelOf = (midi) => (midi === undefined ? '—' : noteLabel(midi, {
      style: ctx.settings.labelStyle === 'off' ? 'en' : ctx.settings.labelStyle,
      sig: sig(),
      withOctave: true,
    }));

    const rootMidi = () => (opts.octave + 1) * 12 + opts.rootPc;
    // 장·단음계일 때만 조표를 붙이고, 나머지 음계는 임시표로 그대로 보여준다.
    const MAJOR_KEY_NAME = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const MINOR_KEY_NAME = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
    const MINOR_SCALES = ['natural_minor', 'harmonic_minor', 'melodic_minor'];
    const sig = () => {
      if (opts.scale === 'major') return keySignature(MAJOR_KEY_NAME[opts.rootPc], 'major');
      if (MINOR_SCALES.includes(opts.scale)) return keySignature(MINOR_KEY_NAME[opts.rootPc], 'minor');
      return 0;
    };

    function buildSequence() {
      const up = scaleNotes(rootMidi(), opts.scale, opts.octaves);
      let notes;
      if (opts.direction === 'up') notes = up;
      else if (opts.direction === 'down') notes = [...up].reverse();
      else notes = [...up, ...[...up].reverse().slice(1)];
      runner.load(notes.map((n) => ({ notes: [n] })));
      resultEl.replaceChildren();
      const low = Math.min(...notes) - 4;
      const high = Math.max(...notes) + 4;
      ctx.setKeyboardRange(Math.max(21, low), Math.min(108, high));
      showStep(runner.current);
    }

    function showStep(step) {
      const pct = runner.progress * 100;
      progressBar.style.width = `${pct}%`;
      if (!step) return;
      const midi = step.notes[0];
      nextEl.textContent = labelOf(midi);
      subEl.textContent = `${runner.index + 1} / ${runner.steps.length}`;
      ctx.keyboard.setTargets([midi]);

      const start = Math.max(0, Math.min(runner.index - 1, runner.steps.length - WINDOW));
      const groups = runner.steps.slice(start, start + WINDOW).map((s, i) => ({
        notes: s.notes,
        state: start + i < runner.index ? 'dim' : start + i === runner.index ? 'pending' : 'dim',
      }));
      renderStaff(staffEl, { clef: 'auto', sig: sig(), groups });
    }

    function finish(summary) {
      ctx.keyboard.setTargets([]);
      progressBar.style.width = '100%';
      nextEl.textContent = '완료!';
      subEl.textContent = '다시 하려면 아래 버튼을 누르세요';
      ctx.stats.record({ correct: summary.hits, attempts: summary.hits + summary.errors });
      const evenness = summary.jitterMs && summary.avgGapMs
        ? Math.max(0, Math.round((1 - summary.jitterMs / summary.avgGapMs) * 100))
        : 0;
      resultEl.replaceChildren(
        h('div', { class: 'stats-row' },
          h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, `${(summary.elapsedMs / 1000).toFixed(1)}초`), h('div', { class: 'stat-label' }, '걸린 시간')),
          h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, String(summary.errors)), h('div', { class: 'stat-label' }, '틀린 횟수')),
          h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, `${summary.bpm}`), h('div', { class: 'stat-label' }, '평균 빠르기(♩)')),
          h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, `${evenness}%`), h('div', { class: 'stat-label' }, '박자 고르기')),
        ),
      );
      flash.show('음계 완주!', 'ok', 2000);
    }

    ctx.on('noteon', ({ midi, time }) => {
      if (runner.finished) return;
      runner.noteOn(midi, time);
    });
    ctx.on('noteoff', ({ midi }) => runner.noteOff(midi));

    const rootOptions = SHARP_NAMES.map((n, i) => ({ value: i, label: pretty(n) }));
    const scaleOptions = Object.entries(SCALES).map(([key, v]) => ({ value: key, label: v.name }));

    root.append(
      panel(null,
        h('div', { class: 'readout' }, nextEl, subEl),
        h('div', { class: 'progress' }, progressBar),
        staffEl,
        flash,
        resultEl,
        h('div', { class: 'row gap' },
          button('처음부터', () => buildSequence(), { variant: 'primary' }),
          button('한 음 듣기', () => runner.current && ctx.synth.playNotes(runner.current.notes, { duration: 0.6 })),
          button('전체 들려주기', () => {
            const notes = runner.steps.map((s) => s.notes[0]);
            ctx.synth.playNotes(notes, { duration: 0.35, gap: 0.32 });
          }),
        ),
      ),
      panel('설정',
        h('div', { class: 'controls' },
          field('으뜸음', select(rootOptions, opts.rootPc, (v) => { opts.rootPc = Number(v); buildSequence(); })),
          field('시작 옥타브', numberInput(opts.octave, { min: 1, max: 6, onChange: (v) => { opts.octave = v; buildSequence(); } })),
          field('음계', select(scaleOptions, opts.scale, (v) => { opts.scale = v; buildSequence(); })),
          field('옥타브 수', numberInput(opts.octaves, { min: 1, max: 4, onChange: (v) => { opts.octaves = Math.max(1, Math.min(4, v)); buildSequence(); } })),
          field('방향', select([
            { value: 'up', label: '올라가기' },
            { value: 'down', label: '내려가기' },
            { value: 'updown', label: '올라갔다 내려오기' },
          ], opts.direction, (v) => { opts.direction = v; buildSequence(); })),
        ),
      ),
    );

    buildSequence();

    return () => {
      ctx.keyboard.setTargets([]);
      ctx.resetKeyboardRange();
    };
  },
};
