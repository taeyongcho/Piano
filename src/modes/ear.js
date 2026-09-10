// 청음 — 들은 소리를 건반에서 찾거나 화음 종류를 골라 맞힌다.

import { h, panel, field, select, button, flashArea, pick, randInt } from '../ui.js';
import { CHORD_DEFS, chordNotes, intervalName, noteLabel, scaleNotes, SHARP_NAMES, pretty } from '../theory.js';
import { SequenceRunner } from '../sequence.js';

const QUALITY_CHOICES = ['', 'm', 'dim', 'aug', '7', 'maj7', 'm7'];

export default {
  id: 'ear',
  title: '청음',
  icon: '👂',
  hint: '소리를 듣고 같은 음을 찾아 치거나, 화음 종류를 고르세요. 전자피아노 볼륨을 줄이고 앱 소리를 쓰면 편합니다.',

  mount(root, ctx) {
    const opts = { task: 'interval', maxInterval: 12, melodyLength: 4 };

    const promptEl = h('div', { class: 'huge' }, '들어보세요');
    const subEl = h('div', { class: 'sub' }, '');
    const answerArea = h('div', { class: 'row gap wrap' });
    const flash = flashArea();
    const scoreEl = h('div', { class: 'stats-row' });

    const score = { correct: 0, attempts: 0, streak: 0, best: 0 };
    let question = null;
    let answered = false;
    let wrong = 0;

    const melodyRunner = new SequenceRunner({
      onStep: (step) => { if (step) ctx.keyboard.setTargets([]); },
      onError: () => {
        wrong++;
        score.streak = 0;
        updateScore();
        flash.show('다시 들어보고 처음부터', 'err', 1000);
        melodyRunner.reset();
      },
      onDone: () => resolve(true),
    });

    function updateScore() {
      scoreEl.replaceChildren(
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, String(score.correct)), h('div', { class: 'stat-label' }, '한 번에 맞힘')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, String(score.attempts)), h('div', { class: 'stat-label' }, '푼 문제')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, score.attempts ? `${Math.round((score.correct / score.attempts) * 100)}%` : '—'), h('div', { class: 'stat-label' }, '정확도')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, `${score.streak} / 최고 ${score.best}`), h('div', { class: 'stat-label' }, '연속 정답')),
      );
    }

    function resolve(ok) {
      if (answered) return;
      answered = true;
      score.attempts++;
      if (ok && wrong === 0) {
        score.correct++;
        score.streak++;
        score.best = Math.max(score.best, score.streak);
        flash.show('정답!', 'ok');
      } else if (ok) {
        score.streak = 0;
        flash.show('맞았어요', 'warn');
      } else {
        score.streak = 0;
        flash.show(`정답은 ${question.answerText}`, 'err', 1800);
      }
      ctx.stats.record({ correct: ok && wrong === 0 ? 1 : 0, attempts: 1 });
      updateScore();
      subEl.textContent = question.answerText;
      setTimeout(newQuestion, ok ? 800 : 2000);
    }

    function play() {
      if (!question) return;
      if (question.type === 'melody') ctx.synth.playNotes(question.notes, { duration: 0.5, gap: 0.55 });
      else if (question.type === 'interval') ctx.synth.playNotes(question.notes, { duration: 1.1, gap: 0.6 });
      else ctx.synth.playNotes(question.notes, { duration: 1.4 });
    }

    function newQuestion() {
      answered = false;
      wrong = 0;
      answerArea.replaceChildren();
      ctx.keyboard.setTargets([]);
      ctx.keyboard.releaseAll();

      if (opts.task === 'interval') {
        const base = randInt(55, 67);
        const semis = randInt(1, opts.maxInterval);
        question = {
          type: 'interval',
          notes: [base, base + semis],
          answerText: intervalName(semis),
        };
        promptEl.textContent = '두 음을 그대로 쳐보세요';
        subEl.textContent = `낮은음은 ${noteLabel(base, { style: 'en', withOctave: true })} 입니다`;
        ctx.keyboard.setTargets([base]);
      } else if (opts.task === 'quality') {
        const sym = pick(QUALITY_CHOICES);
        const rootMidi = randInt(52, 64);
        const def = CHORD_DEFS.find((d) => d.sym === sym);
        question = {
          type: 'quality',
          notes: chordNotes(rootMidi, sym),
          answer: sym,
          answerText: `${def.name} (${pretty(SHARP_NAMES[rootMidi % 12] + sym)})`,
        };
        promptEl.textContent = '어떤 화음인가요?';
        subEl.textContent = '들리는 화음의 종류를 고르세요';
        answerArea.replaceChildren(...QUALITY_CHOICES.map((s) => {
          const d = CHORD_DEFS.find((c) => c.sym === s);
          return button(d.name, () => {
            if (answered) return;
            if (s === question.answer) resolve(true);
            else { wrong++; resolve(false); }
          });
        }));
      } else {
        const startMidi = 60;
        const scale = scaleNotes(startMidi, 'major', 1);
        const notes = [startMidi];
        for (let i = 1; i < opts.melodyLength; i++) {
          const prevIndex = scale.indexOf(notes[i - 1]);
          const step = pick([-2, -1, -1, 1, 1, 2]);
          const idx = Math.max(0, Math.min(scale.length - 1, prevIndex + step));
          notes.push(scale[idx]);
        }
        question = {
          type: 'melody',
          notes,
          answerText: notes.map((n) => noteLabel(n, { style: 'en' })).join(' – '),
        };
        promptEl.textContent = '들은 대로 순서대로 치세요';
        subEl.textContent = `${notes.length}음 · 첫 음은 도(C4) 입니다`;
        melodyRunner.load(notes.map((n) => ({ notes: [n] })));
      }

      setTimeout(play, 350);
    }

    ctx.on('noteon', ({ midi, time }) => {
      if (!question || answered) return;
      if (question.type === 'melody') { melodyRunner.noteOn(midi, time); return; }
      if (question.type !== 'interval') return;
      if (!question.notes.includes(midi)) {
        wrong++;
        score.streak = 0;
        updateScore();
        flash.show('아니에요, 다시', 'err', 800);
        return;
      }
      if (question.notes.every((n) => ctx.input.held.has(n))) resolve(true);
    });
    ctx.on('noteoff', ({ midi }) => melodyRunner.noteOff(midi));

    root.append(
      panel(null,
        h('div', { class: 'readout' }, promptEl, subEl),
        answerArea,
        flash,
        h('div', { class: 'row gap' },
          button('다시 듣기', play, { variant: 'primary' }),
          button('정답 보기', () => { wrong++; resolve(false); }),
          button('건너뛰기', () => { answered = true; newQuestion(); }),
        ),
      ),
      panel('점수', scoreEl),
      panel('설정',
        h('div', { class: 'controls' },
          field('문제 종류', select([
            { value: 'interval', label: '음정 따라 치기' },
            { value: 'quality', label: '화음 종류 맞히기' },
            { value: 'melody', label: '멜로디 따라 치기' },
          ], opts.task, (v) => { opts.task = v; newQuestion(); })),
          field('최대 음정(반음)', select([6, 8, 12].map((n) => ({ value: n, label: `${n}반음` })), opts.maxInterval, (v) => { opts.maxInterval = Number(v); })),
          field('멜로디 길이', select([3, 4, 5, 6].map((n) => ({ value: n, label: `${n}음` })), opts.melodyLength, (v) => { opts.melodyLength = Number(v); newQuestion(); })),
        ),
      ),
    );

    updateScore();
    newQuestion();

    return () => ctx.keyboard.setTargets([]);
  },
};
