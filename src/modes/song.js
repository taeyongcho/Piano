// 곡 연습 — MIDI 파일이나 기본 곡을 떨어지는 노트로 따라 친다.
// 왼손/오른손을 나눠 연습할 수 있고, 운지 번호를 함께 보여준다.

import { h, panel, field, select, button, toggle, flashArea } from '../ui.js';
import { parseMidiFile } from '../midifile.js';
import { assignHands, groupIntoEvents, findSplitPoint } from '../hands.js';
import { annotateFingering } from '../fingering.js';
import { BUILT_IN_SONGS, buildSong } from '../songs.js';
import { FallingNotes } from '../falling.js';
import { computeKeyLayout } from '../keyboard.js';
import { noteLabel } from '../theory.js';

const HIT_WINDOW = 0.4;   // 따라치기에서 정답으로 쳐주는 시간 폭(초)

const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default {
  id: 'song',
  title: '곡 연습',
  icon: '🎬',
  hint: 'MIDI 파일을 끌어다 놓거나 기본 곡을 골라, 떨어지는 노트를 따라 쳐보세요.',

  mount(root, ctx) {
    const state = {
      raw: null,
      notes: [],
      events: [],
      time: 0,
      playing: false,
      speed: 1,
      practiceMode: 'wait',   // listen | wait | play
      hand: 'both',           // both | right | left
      showFingering: true,
      loopA: null,
      loopB: null,
      handStrategy: 'auto',
      splitPoint: 60,
      leftTracks: null,
      handLabel: '',
    };

    const runtime = {
      raf: 0,
      lastFrame: 0,
      playIndex: 0,
      waitIndex: 0,
      waiting: null,
      satisfied: new Set(),
      sounding: new Map(),   // note → true (신시사이저가 내고 있는 음)
      score: { hits: 0, misses: 0, wrong: 0, timingSum: 0 },
    };

    // ── 화면 ────────────────────────────────────────────────────────────────
    const canvas = h('canvas', { class: 'falling-canvas' });
    const dropHint = h('div', { class: 'falling-hint' }, 'MIDI 파일을 이곳에 끌어다 놓으세요');
    const dropZone = h('div', { class: 'falling-wrap' }, canvas, dropHint);
    const titleEl = h('div', { class: 'song-title' }, '곡을 고르세요');
    const metaEl = h('div', { class: 'sub' }, '');
    const timeEl = h('span', { class: 'song-time' }, '0:00 / 0:00');
    const progressFill = h('div', { class: 'progress-fill' });
    const loopBand = h('div', { class: 'loop-band' });
    const progress = h('div', { class: 'progress song-progress' }, loopBand, progressFill);
    const playBtn = button('▶ 재생', togglePlay, { variant: 'primary' });
    const flash = flashArea();
    const scoreEl = h('div', { class: 'stats-row' });
    const handInfo = h('span', { class: 'hint-inline' }, '');
    const speedLabel = h('span', { class: 'pill' }, '100%');
    const fileInput = h('input', { type: 'file', accept: '.mid,.midi,audio/midi', class: 'hidden-input', onChange: onFilePicked });

    const falling = new FallingNotes(canvas);
    falling.alignTo(ctx.keyboard.el);   // 노트가 실제 건반 바로 위로 떨어지도록

    // ── 곡 불러오기 ─────────────────────────────────────────────────────────
    function loadParsed(parsed) {
      state.raw = parsed;
      state.leftTracks = null;
      state.handStrategy = 'auto';
      stop();
      state.time = 0;
      state.loopA = null;
      state.loopB = null;
      applyHands();
      titleEl.textContent = parsed.name || '이름 없는 곡';
      const parts = [];
      if (parsed.composer) parts.push(parsed.composer);
      parts.push(formatTime(parsed.duration));
      parts.push(`${parsed.notes.length}음`);
      parts.push(`♩=${parsed.bpm}`);
      metaEl.textContent = parts.join(' · ') + (parsed.note ? ` — ${parsed.note}` : '');
      renderTrackControls();
      dropHint.style.display = 'none';
      flash.show(`${parsed.name || '곡'} 준비 완료`, 'ok');
    }

    function applyHands() {
      if (!state.raw) return;
      const options = state.leftTracks
        ? { leftTracks: state.leftTracks }
        : state.handStrategy === 'pitch'
          ? { strategy: 'pitch', splitPoint: state.splitPoint }
          : { strategy: 'auto' };
      const result = assignHands(state.raw, options);
      state.notes = result.notes;
      state.handLabel = result.label;
      if (result.strategy === 'pitch') state.splitPoint = result.splitPoint;

      // 손별로 운지를 계산한다. 왼손과 오른손은 서로 다른 흐름이므로 따로 본다.
      for (const hand of ['right', 'left']) {
        const handNotes = state.notes.filter((n) => n.hand === hand);
        if (handNotes.length) annotateFingering(groupIntoEvents(handNotes), hand);
      }

      handInfo.textContent = `${state.handLabel} · 오른손 ${state.notes.filter((n) => n.hand === 'right').length}음 / 왼손 ${state.notes.filter((n) => n.hand === 'left').length}음`;

      const low = Math.min(...state.notes.map((n) => n.midi));
      const high = Math.max(...state.notes.map((n) => n.midi));
      ctx.setKeyboardRange(Math.max(21, low - 2), Math.min(108, high + 2));
      falling.setLayout(computeKeyLayout(Math.max(21, low - 2), Math.min(108, high + 2)));
      falling.setNotes(state.notes);
      falling.setOptions({
        beatSeconds: 60 / (state.raw.bpm || 120),
        beatsPerBar: state.raw.timeSignature?.numerator ?? 4,
        showFingering: state.showFingering,
      });
      rebuildPractice();
    }

    function rebuildPractice() {
      const practiced = state.hand === 'both'
        ? state.notes
        : state.notes.filter((n) => n.hand === state.hand);
      state.events = groupIntoEvents(practiced);
      resetRuntime();
    }

    function resetRuntime() {
      runtime.playIndex = 0;
      runtime.waitIndex = 0;
      runtime.waiting = null;
      runtime.satisfied.clear();
      releaseAllSounding();
      for (const note of state.notes) { note.judged = false; note.hit = false; }
      runtime.score = { hits: 0, misses: 0, wrong: 0, timingSum: 0 };
      // 현재 시각보다 앞선 음표는 이미 지나간 것으로 표시한다.
      while (runtime.playIndex < state.notes.length && state.notes[runtime.playIndex].start < state.time) runtime.playIndex++;
      while (runtime.waitIndex < state.events.length && state.events[runtime.waitIndex].start < state.time - 0.001) runtime.waitIndex++;
      updateScore();
    }

    async function onFilePicked(event) {
      const file = event.target.files?.[0];
      if (file) await loadFile(file);
      event.target.value = '';
    }

    async function loadFile(file) {
      try {
        const parsed = parseMidiFile(await file.arrayBuffer());
        if (!parsed.notes.length) throw new Error('이 파일에는 음표가 없습니다.');
        parsed.name = parsed.name || file.name.replace(/\.midi?$/i, '');
        loadParsed(parsed);
      } catch (err) {
        flash.show(`불러오지 못했습니다: ${err.message}`, 'err', 4000);
      }
    }

    // ── 재생 ────────────────────────────────────────────────────────────────
    function togglePlay() {
      if (!state.raw) { flash.show('먼저 곡을 고르세요', 'warn'); return; }
      state.playing = !state.playing;
      if (state.playing) ctx.synth.ensure();
      else releaseAllSounding();
      playBtn.textContent = state.playing ? '⏸ 멈춤' : '▶ 재생';
    }

    function stop() {
      state.playing = false;
      playBtn.textContent = '▶ 재생';
      releaseAllSounding();
    }

    function seek(time) {
      state.time = Math.max(0, Math.min(time, (state.raw?.duration ?? 0)));
      resetRuntime();
    }

    function releaseAllSounding() {
      for (const note of runtime.sounding.keys()) ctx.synth.noteOff(note.midi, true);
      runtime.sounding.clear();
    }

    /** 이 음표를 앱이 대신 쳐줘야 하는가? */
    function isAccompaniment(note) {
      if (state.practiceMode === 'listen') return true;
      return state.hand !== 'both' && note.hand !== state.hand;
    }

    function advance(dt) {
      const step = dt * state.speed;
      const next = state.time + step;

      // 기다림 모드: 쳐야 할 차례에서 시간을 붙잡는다.
      if (state.practiceMode === 'wait') {
        const event = state.events[runtime.waitIndex];
        if (event && next >= event.start) {
          state.time = event.start;
          if (!runtime.waiting) {
            runtime.waiting = event;
            runtime.satisfied.clear();
            playHeadNotesUpTo(event.start);
          }
          return;
        }
      }

      state.time = next;
      playHeadNotesUpTo(state.time);

      if (state.practiceMode === 'play') judgeMissed();

      if (state.loopB !== null && state.time >= state.loopB) {
        seek(state.loopA ?? 0);
        return;
      }
      if (state.time > (state.raw?.duration ?? 0) + 0.8) finish();
    }

    /** 재생 머리가 지나간 반주 음을 소리 내고, 끝난 음은 끈다. */
    function playHeadNotesUpTo(time) {
      while (runtime.playIndex < state.notes.length && state.notes[runtime.playIndex].start <= time) {
        const note = state.notes[runtime.playIndex++];
        if (!isAccompaniment(note)) continue;
        ctx.synth.noteOn(note.midi, note.velocity ?? 80);
        runtime.sounding.set(note, true);
      }
      for (const note of [...runtime.sounding.keys()]) {
        if (note.end <= time) {
          ctx.synth.noteOff(note.midi, true);
          runtime.sounding.delete(note);
        }
      }
    }

    function judgeMissed() {
      for (const event of state.events) {
        if (event.start + HIT_WINDOW >= state.time) break;
        for (const note of event.notes) {
          if (note.judged) continue;
          note.judged = true;
          runtime.score.misses++;
        }
      }
      updateScore();
    }

    function finish() {
      stop();
      if (state.practiceMode === 'play') {
        const { hits, misses } = runtime.score;
        flash.show(hits + misses ? `연주 끝! 정확도 ${Math.round((hits / (hits + misses)) * 100)}%` : '연주 끝!', 'ok', 3000);
      } else {
        flash.show('끝까지 쳤습니다!', 'ok', 3000);
      }
      ctx.stats.record({ correct: runtime.score.hits, attempts: runtime.score.hits + runtime.score.misses });
      state.time = state.raw?.duration ?? 0;
    }

    // ── 입력 판정 ───────────────────────────────────────────────────────────
    ctx.on('noteon', ({ midi }) => {
      if (!state.raw) return;

      if (state.practiceMode === 'wait' && runtime.waiting) {
        const required = new Set(runtime.waiting.notes.map((n) => n.midi));
        if (required.has(midi)) {
          runtime.satisfied.add(midi);
          if ([...required].every((m) => runtime.satisfied.has(m))) {
            for (const note of runtime.waiting.notes) { note.judged = true; note.hit = true; }
            runtime.score.hits += runtime.waiting.notes.length;
            runtime.waiting = null;
            runtime.waitIndex++;
            runtime.satisfied.clear();
            ctx.keyboard.setTargets([]);
            updateScore();
          }
        } else {
          runtime.score.wrong++;
          updateScore();
        }
        return;
      }

      if (state.practiceMode === 'play') {
        // 지금 시각에서 가장 가까운, 아직 판정되지 않은 같은 음을 찾는다.
        let best = null;
        for (const event of state.events) {
          if (event.start > state.time + HIT_WINDOW) break;
          if (event.start < state.time - HIT_WINDOW) continue;
          for (const note of event.notes) {
            if (note.midi !== midi || note.judged) continue;
            const delta = Math.abs(note.start - state.time);
            if (!best || delta < best.delta) best = { note, delta };
          }
        }
        if (best) {
          best.note.judged = true;
          best.note.hit = true;
          runtime.score.hits++;
          runtime.score.timingSum += best.delta;
        } else {
          runtime.score.wrong++;
        }
        updateScore();
      }
    });

    function updateScore() {
      const { hits, misses, wrong, timingSum } = runtime.score;
      const total = hits + misses;
      scoreEl.replaceChildren(
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, String(hits)), h('div', { class: 'stat-label' }, '맞게 친 음')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, String(misses)), h('div', { class: 'stat-label' }, '놓친 음')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, String(wrong)), h('div', { class: 'stat-label' }, '틀린 음')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, total ? `${Math.round((hits / total) * 100)}%` : '—'), h('div', { class: 'stat-label' }, '정확도')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, hits ? `${Math.round((timingSum / hits) * 1000)}ms` : '—'), h('div', { class: 'stat-label' }, '평균 어긋남')),
      );
    }

    // ── 매 프레임 ───────────────────────────────────────────────────────────
    function frame(now) {
      const dt = runtime.lastFrame ? Math.min(0.06, (now - runtime.lastFrame) / 1000) : 0;
      runtime.lastFrame = now;
      if (state.playing) advance(dt);

      const waitingNotes = runtime.waiting ? new Set(runtime.waiting.notes) : null;
      if (runtime.waiting) {
        const remaining = runtime.waiting.notes.filter((n) => !runtime.satisfied.has(n.midi)).map((n) => n.midi);
        ctx.keyboard.setTargets(remaining);
      }

      falling.draw(state.time, {
        sounding: new Set(runtime.sounding.keys()),
        waiting: waitingNotes,
        dimOtherHand: state.hand !== 'both',
        practiceHand: state.hand,
      });

      const duration = state.raw?.duration ?? 0;
      progressFill.style.width = duration ? `${Math.min(100, (state.time / duration) * 100)}%` : '0%';
      timeEl.textContent = `${formatTime(state.time)} / ${formatTime(duration)}`;

      runtime.raf = requestAnimationFrame(frame);
    }

    // ── 조작 ────────────────────────────────────────────────────────────────
    progress.addEventListener('pointerdown', (event) => {
      if (!state.raw) return;
      const rect = progress.getBoundingClientRect();
      seek(((event.clientX - rect.left) / rect.width) * state.raw.duration);
    });

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('is-dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-dragover'));
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) await loadFile(file);
    });

    function updateLoopBand() {
      const duration = state.raw?.duration ?? 0;
      if (!duration || state.loopA === null || state.loopB === null) {
        loopBand.style.display = 'none';
        return;
      }
      loopBand.style.display = '';
      loopBand.style.left = `${(state.loopA / duration) * 100}%`;
      loopBand.style.width = `${((state.loopB - state.loopA) / duration) * 100}%`;
    }

    const trackControls = h('div', { class: 'row gap wrap' });
    function renderTrackControls() {
      const tracks = state.raw?.tracks ?? [];
      if (tracks.length < 2) { trackControls.replaceChildren(); return; }
      trackControls.replaceChildren(
        h('span', { class: 'field-label' }, '트랙별 손 지정'),
        ...tracks.map((track) => {
          const isLeft = state.leftTracks
            ? state.leftTracks.includes(track.index)
            : state.notes.some((n) => n.track === track.index && n.hand === 'left');
          return button(
            `${track.name || `트랙 ${track.index + 1}`}: ${isLeft ? '왼손' : '오른손'}`,
            () => {
              const current = new Set(state.leftTracks ?? state.raw.tracks
                .filter((t) => state.notes.some((n) => n.track === t.index && n.hand === 'left'))
                .map((t) => t.index));
              if (current.has(track.index)) current.delete(track.index);
              else current.add(track.index);
              state.leftTracks = [...current];
              applyHands();
              renderTrackControls();
            },
          );
        }),
        button('자동으로 되돌리기', () => { state.leftTracks = null; state.handStrategy = 'auto'; applyHands(); renderTrackControls(); }),
      );
    }

    const splitRow = h('div', { class: 'row gap' });
    function renderSplitRow() {
      splitRow.replaceChildren(
        field('손 나누기', select([
          { value: 'auto', label: '자동 (트랙/채널 우선)' },
          { value: 'pitch', label: '음높이 경계로 나누기' },
        ], state.handStrategy, (v) => {
          state.handStrategy = v;
          state.leftTracks = null;
          applyHands();
          renderSplitRow();
          renderTrackControls();
        })),
        state.handStrategy === 'pitch'
          ? h('label', { class: 'field' },
            h('span', { class: 'field-label' }, `경계 ${noteLabel(state.splitPoint, { style: 'en', withOctave: true })}`),
            h('input', {
              type: 'range', class: 'slider', min: 36, max: 84, step: 1, value: state.splitPoint,
              onInput: (e) => { state.splitPoint = Number(e.target.value); applyHands(); renderSplitRow(); },
            }))
          : null,
        handInfo,
      );
    }

    root.append(
      panel(null,
        h('div', { class: 'row gap wrap song-head' },
          h('div', {}, titleEl, metaEl),
          h('div', { class: 'row gap' },
            select(
              [{ value: '', label: '기본 곡 고르기…' }, ...BUILT_IN_SONGS.map((s) => ({ value: s.id, label: s.title }))],
              '',
              (v) => { const def = BUILT_IN_SONGS.find((s) => s.id === v); if (def) loadParsed(buildSong(def)); },
            ),
            button('MIDI 파일 열기', () => fileInput.click()),
          ),
        ),
        // 조작부를 노트 길 위에 둔다. 아래에 두면 화면이 낮을 때 재생 버튼이
        // 아래 건반 바에 가려 스크롤해야만 보인다.
        h('div', { class: 'row gap transport' },
          playBtn,
          button('⏮ 처음으로', () => seek(state.loopA ?? 0)),
          timeEl,
          h('label', { class: 'field' },
            h('span', { class: 'field-label' }, '속도'),
            h('input', {
              type: 'range', class: 'slider', min: 25, max: 150, step: 5, value: 100,
              onInput: (e) => { state.speed = Number(e.target.value) / 100; speedLabel.textContent = `${e.target.value}%`; },
            }),
            speedLabel),
        ),
        progress,
        dropZone,
        flash,
        fileInput,
      ),
      panel('연습 방법',
        h('div', { class: 'controls' },
          field('방식', select([
            { value: 'wait', label: '기다림 — 칠 때까지 기다려 줍니다' },
            { value: 'play', label: '따라치기 — 멈추지 않고 채점' },
            { value: 'listen', label: '듣기 — 연주를 들려줍니다' },
          ], state.practiceMode, (v) => { state.practiceMode = v; stop(); resetRuntime(); ctx.keyboard.setTargets([]); })),
          field('연습할 손', select([
            { value: 'both', label: '양손' },
            { value: 'right', label: '오른손 (왼손은 들려줌)' },
            { value: 'left', label: '왼손 (오른손은 들려줌)' },
          ], state.hand, (v) => { state.hand = v; stop(); rebuildPractice(); })),
        ),
        h('div', { class: 'row gap wrap' },
          toggle('운지 번호 보기', state.showFingering, (v) => {
            state.showFingering = v;
            falling.setOptions({ showFingering: v });
          }),
          button('구간 시작 A', () => { state.loopA = state.time; if (state.loopB !== null && state.loopB <= state.loopA) state.loopB = null; updateLoopBand(); flash.show(`A = ${formatTime(state.time)}`, 'ok', 900); }),
          button('구간 끝 B', () => { state.loopB = state.time; if (state.loopA === null || state.loopA >= state.loopB) state.loopA = 0; updateLoopBand(); flash.show(`B = ${formatTime(state.time)}`, 'ok', 900); }),
          button('구간 해제', () => { state.loopA = null; state.loopB = null; updateLoopBand(); }),
        ),
        splitRow,
        trackControls,
        h('p', { class: 'note' }, '운지 번호(1 엄지 ~ 5 새끼)는 손가락이 편하게 벌어지는 정도를 계산해 자동으로 붙인 추천입니다. 악보에 편집자가 적어 둔 운지와는 다를 수 있습니다.'),
      ),
      panel('점수', scoreEl),
    );

    renderSplitRow();
    updateScore();
    updateLoopBand();
    runtime.raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(runtime.raf);
      releaseAllSounding();
      ctx.keyboard.setTargets([]);
      ctx.resetKeyboardRange();
    };
  },
};
