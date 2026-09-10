// 핑거 연습 — 하농식 반복 패턴으로 손가락 독립과 고른 터치를 기른다.

import { h, panel, field, select, button, numberInput, flashArea } from '../ui.js';
import { renderStaff } from '../staff.js';
import { SCALES, scaleNotes, noteLabel, SHARP_NAMES, pretty } from '../theory.js';
import { SequenceRunner } from '../sequence.js';

const WINDOW = 8;

const PATTERNS = {
  five: {
    name: '5손가락 (1-2-3-4-5-4-3-2-1)',
    build: (S, steps) => {
      const out = [];
      for (let r = 0; r < steps; r++) {
        for (const d of [0, 1, 2, 3, 4, 3, 2, 1]) out.push(S[r + d]);
      }
      out.push(S[steps - 1]);
      return out;
    },
  },
  hanon: {
    name: '하농 1번 스타일',
    build: (S, steps) => {
      const shape = [0, 2, 3, 4, 5, 4, 3, 2];
      const out = [];
      for (let i = 0; i < steps; i++) for (const d of shape) out.push(S[i + d]);
      for (let i = steps - 1; i >= 0; i--) for (const d of shape) out.push(S[i + d]);
      return out;
    },
  },
  arpeggio: {
    name: '분산화음 (1-3-5-8)',
    build: (S, steps) => {
      const out = [];
      for (let i = 0; i < steps; i++) for (const d of [0, 2, 4, 7]) out.push(S[i + d]);
      for (let i = steps - 1; i >= 0; i--) for (const d of [7, 4, 2, 0]) out.push(S[i + d]);
      return out;
    },
  },
  trill: {
    name: '이웃음 반복 (트릴)',
    build: (S, steps) => {
      const out = [];
      for (let i = 0; i < steps; i++) for (let k = 0; k < 4; k++) { out.push(S[i]); out.push(S[i + 1]); }
      return out;
    },
  },
};

export default {
  id: 'fingers',
  title: '핑거 연습',
  icon: '💪',
  hint: '같은 모양을 한 음씩 올려가며 반복합니다. 메트로놈을 켜고 느린 템포부터 시작하세요.',

  mount(root, ctx) {
    const opts = { pattern: 'hanon', rootPc: 0, octave: 4, steps: 5, scale: 'major' };

    const staffEl = h('div', { class: 'staff-wrap big' });
    const progressBar = h('div', { class: 'progress-fill' });
    const nextEl = h('div', { class: 'huge' }, '—');
    const subEl = h('div', { class: 'sub' }, '');
    const flash = flashArea();
    const resultEl = h('div', { class: 'result' });

    const runner = new SequenceRunner({
      onStep: (step) => showStep(step),
      onError: () => flash.show(`다음 음은 ${labelOf(runner.current?.notes[0])}`, 'err', 800),
      onDone: (summary) => finish(summary),
    });

    const labelOf = (midi) => (midi === undefined ? '—' : noteLabel(midi, {
      style: ctx.settings.labelStyle === 'off' ? 'en' : ctx.settings.labelStyle,
      withOctave: true,
    }));

    function build() {
      const rootMidi = (opts.octave + 1) * 12 + opts.rootPc;
      // 패턴이 위로 뻗어나가므로 넉넉하게 3옥타브를 만들어 둔다.
      const S = scaleNotes(rootMidi, opts.scale, 3);
      const steps = Math.max(1, Math.min(opts.steps, S.length - 8));
      const notes = PATTERNS[opts.pattern].build(S, steps).filter((n) => Number.isFinite(n));
      runner.load(notes.map((n) => ({ notes: [n] })));
      resultEl.replaceChildren();
      ctx.setKeyboardRange(Math.max(21, Math.min(...notes) - 4), Math.min(108, Math.max(...notes) + 4));
      showStep(runner.current);
    }

    function showStep(step) {
      progressBar.style.width = `${runner.progress * 100}%`;
      if (!step) return;
      nextEl.textContent = labelOf(step.notes[0]);
      subEl.textContent = `${runner.index + 1} / ${runner.steps.length} · 틀린 횟수 ${runner.errors}`;
      ctx.keyboard.setTargets([step.notes[0]]);
      const start = Math.max(0, Math.min(runner.index - 1, runner.steps.length - WINDOW));
      renderStaff(staffEl, {
        clef: 'auto',
        sig: 0,
        groups: runner.steps.slice(start, start + WINDOW).map((s, i) => ({
          notes: s.notes,
          state: start + i === runner.index ? 'pending' : 'dim',
        })),
      });
    }

    function finish(summary) {
      ctx.keyboard.setTargets([]);
      progressBar.style.width = '100%';
      nextEl.textContent = '완료!';
      const evenness = summary.jitterMs && summary.avgGapMs
        ? Math.max(0, Math.round((1 - summary.jitterMs / summary.avgGapMs) * 100))
        : 0;
      subEl.textContent = '수고했어요';
      ctx.stats.record({ correct: summary.hits, attempts: summary.hits + summary.errors });
      resultEl.replaceChildren(
        h('div', { class: 'stats-row' },
          h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, `${(summary.elapsedMs / 1000).toFixed(1)}초`), h('div', { class: 'stat-label' }, '걸린 시간')),
          h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, String(summary.errors)), h('div', { class: 'stat-label' }, '틀린 횟수')),
          h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, String(summary.bpm)), h('div', { class: 'stat-label' }, '평균 빠르기(♩)')),
          h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, `${evenness}%`), h('div', { class: 'stat-label' }, '박자 고르기')),
        ),
      );
      flash.show('한 세트 완주!', 'ok', 2000);
    }

    ctx.on('noteon', ({ midi, time }) => { if (!runner.finished) runner.noteOn(midi, time); });
    ctx.on('noteoff', ({ midi }) => runner.noteOff(midi));

    root.append(
      panel(null,
        h('div', { class: 'readout' }, nextEl, subEl),
        h('div', { class: 'progress' }, progressBar),
        staffEl,
        flash,
        resultEl,
        h('div', { class: 'row gap' },
          button('처음부터', () => build(), { variant: 'primary' }),
          button('전체 들려주기', () => ctx.synth.playNotes(runner.steps.map((s) => s.notes[0]), { duration: 0.28, gap: 0.26 })),
        ),
      ),
      panel('설정',
        h('div', { class: 'controls' },
          field('패턴', select(Object.entries(PATTERNS).map(([k, v]) => ({ value: k, label: v.name })), opts.pattern, (v) => { opts.pattern = v; build(); })),
          field('시작음', select(SHARP_NAMES.map((n, i) => ({ value: i, label: pretty(n) })), opts.rootPc, (v) => { opts.rootPc = Number(v); build(); })),
          field('옥타브', numberInput(opts.octave, { min: 1, max: 6, onChange: (v) => { opts.octave = v; build(); } })),
          field('음계', select(Object.entries(SCALES).filter(([k]) => SCALES[k].iv.length === 7).map(([k, v]) => ({ value: k, label: v.name })), opts.scale, (v) => { opts.scale = v; build(); })),
          field('반복 구간 수', numberInput(opts.steps, { min: 1, max: 8, onChange: (v) => { opts.steps = v; build(); } })),
        ),
      ),
    );

    build();

    return () => { ctx.keyboard.setTargets([]); ctx.resetKeyboardRange(); };
  },
};
