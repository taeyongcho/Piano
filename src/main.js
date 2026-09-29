// 앱 셸 — 상단 바, 메트로놈, 모드 전환, 그리고 화면 아래 고정된 건반.

import { h, field, select, button, numberInput } from './ui.js';
import { Synth } from './audio.js';
import { MidiInput } from './midi.js';
import { PianoKeyboard } from './keyboard.js';
import { Metronome, TapTempo } from './metronome.js';
import { Stats } from './stats.js';

import freeplay from './modes/freeplay.js';
import song from './modes/song.js';
import sightread from './modes/sightread.js';
import scales from './modes/scales.js';
import chords from './modes/chords.js';
import fingers from './modes/fingers.js';
import ear from './modes/ear.js';
import record from './modes/record.js';

const MODES = [freeplay, song, sightread, scales, chords, fingers, ear, record];

const SETTINGS_KEY = 'piano.settings.v1';
const defaults = {
  labelStyle: 'off',
  keySig: 0,
  volume: 0.5,
  soundOn: true,
  low: 48,
  high: 84,
  bpm: 80,
  beatsPerBar: 4,
};

const settings = (() => {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...defaults }; }
})();
const saveSettings = () => {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 무시 */ }
};

const synth = new Synth();
const input = new MidiInput();
const metronome = new Metronome(synth);
const stats = new Stats();
const tapTempo = new TapTempo();

synth.enabled = settings.soundOn;
synth.volume = settings.volume;
metronome.bpm = settings.bpm;
metronome.beatsPerBar = settings.beatsPerBar;

// ── 화면 뼈대 ───────────────────────────────────────────────────────────────
const app = document.getElementById('app');
const statusEl = h('span', { class: 'status status-idle' }, 'MIDI 연결 안 됨');
const deviceSelectWrap = h('span', { class: 'device-wrap' });
const connectBtn = button('전자피아노 연결', connect, { variant: 'primary btn-connect' });
const beatDot = h('span', { class: 'beat-dot' });
const bpmLabel = h('span', { class: 'bpm-label' }, String(settings.bpm));
const modeHint = h('p', { class: 'mode-hint' });
const modeRoot = h('div', { class: 'mode-root' });
const keyboardEl = h('div', { class: 'keyboard' });
const octaveLabel = h('span', { class: 'pill' }, `자판 옥타브 C${input.keyboardOctave}`);

const nav = h('nav', { class: 'tabs' }, ...MODES.map((mode) =>
  h('button', {
    class: 'tab', type: 'button', dataset: { mode: mode.id },
    onClick: () => { location.hash = mode.id; },
  }, h('span', { class: 'tab-icon' }, mode.icon), h('span', {}, mode.title)),
));

const topBar = h('header', { class: 'topbar' },
  h('div', { class: 'brand' }, h('span', { class: 'brand-icon' }, '🎹'), h('span', {}, '피아노 연습실')),
  h('div', { class: 'topbar-group' }, connectBtn, statusEl, deviceSelectWrap),
  h('div', { class: 'topbar-group' },
    field('음이름', select([
      { value: 'off', label: '숨기기' },
      { value: 'en', label: 'C D E' },
      { value: 'solfege', label: '도 레 미' },
      { value: 'ko', label: '다 라 마' },
    ], settings.labelStyle, (v) => {
      settings.labelStyle = v;
      saveSettings();
      keyboard.setLabelStyle(v);
      remount();
    })),
    field('소리', h('div', { class: 'row' },
      (() => {
        const b = button(settings.soundOn ? '🔊' : '🔇', () => {
          settings.soundOn = !settings.soundOn;
          synth.enabled = settings.soundOn;
          if (!settings.soundOn) synth.allOff();
          b.textContent = settings.soundOn ? '🔊' : '🔇';
          saveSettings();
        });
        return b;
      })(),
      h('input', {
        type: 'range', class: 'slider', min: 0, max: 1, step: 0.01, value: settings.volume,
        onInput: (e) => { settings.volume = Number(e.target.value); synth.setVolume(settings.volume); saveSettings(); },
      }),
    )),
  ),
);

const metroBar = h('div', { class: 'metro-bar' },
  beatDot,
  h('span', { class: 'metro-title' }, '메트로놈'),
  h('input', {
    type: 'range', class: 'slider wide', min: 30, max: 220, step: 1, value: settings.bpm,
    onInput: (e) => setBpm(Number(e.target.value)),
  }),
  bpmLabel,
  h('span', { class: 'unit' }, 'BPM'),
  field('박자', select([0, 2, 3, 4, 6].map((n) => ({ value: n, label: n === 0 ? '강박 없음' : `${n}/4` })), settings.beatsPerBar, (v) => {
    settings.beatsPerBar = Number(v);
    metronome.beatsPerBar = Number(v);
    saveSettings();
  })),
  button('시작 / 정지', () => {
    metronome.toggle();
    metroToggle.classList.toggle('is-on', metronome.running);
  }),
  button('탭 템포', () => {
    const bpm = tapTempo.tap();
    if (bpm) setBpm(bpm);
  }),
);
const metroToggle = metroBar;

const keyboardBar = h('div', { class: 'keyboard-bar' },
  h('div', { class: 'keyboard-controls' },
    field('건반 범위', h('div', { class: 'row gap-sm' },
      select([
        { value: '48,84', label: '3옥타브 (C3–C6)' },
        { value: '36,84', label: '4옥타브 (C2–C6)' },
        { value: '36,96', label: '5옥타브 (C2–C7)' },
        { value: '21,108', label: '88건반 전체' },
      ], `${settings.low},${settings.high}`, (v) => {
        const [low, high] = v.split(',').map(Number);
        settings.low = low; settings.high = high;
        saveSettings();
        keyboard.setRange(low, high);
      }),
    )),
    octaveLabel,
    h('span', { class: 'hint-inline' }, '전자피아노가 없다면 컴퓨터 자판(A~L, Q~I)으로도 칠 수 있어요. -/+ 로 옥타브 이동.'),
    button('모든 소리 끄기', () => { input.panic(); synth.allOff(); keyboard.releaseAll(); }),
  ),
  keyboardEl,
);

app.append(
  topBar,
  metroBar,
  h('main', { class: 'main' }, nav, modeHint, modeRoot),
  keyboardBar,
);

// ── 건반과 입력 연결 ────────────────────────────────────────────────────────
const keyboard = new PianoKeyboard(keyboardEl, {
  low: settings.low,
  high: settings.high,
  onNoteOn: (midi) => { synth.ensure(); input.noteOn(midi, 90, 'ui'); },
  onNoteOff: (midi) => input.noteOff(midi, 'ui'),
});
keyboard.setLabelStyle(settings.labelStyle);

input.on('noteon', ({ midi, velocity }) => {
  synth.noteOn(midi, velocity);
  keyboard.press(midi);
});
input.on('noteoff', ({ midi }) => {
  synth.noteOff(midi);
  keyboard.release(midi);
});
input.on('pedal', (down) => synth.setPedal(down));
input.on('octave', (oct) => { octaveLabel.textContent = `자판 옥타브 C${oct}`; });
input.on('status', renderStatus);
input.on('devices', renderDevices);
input.attachComputerKeyboard();

metronome.onBeat = ({ accent }) => {
  beatDot.classList.remove('is-beat', 'is-accent');
  // 클래스를 다시 붙이려면 리플로우를 한 번 강제해야 애니메이션이 재생된다.
  void beatDot.offsetWidth;
  beatDot.classList.add('is-beat');
  if (accent) beatDot.classList.add('is-accent');
};

function setBpm(bpm) {
  metronome.setBpm(bpm);
  settings.bpm = metronome.bpm;
  bpmLabel.textContent = String(metronome.bpm);
  const slider = metroBar.querySelector('.slider');
  if (slider) slider.value = metronome.bpm;
  saveSettings();
}

async function connect() {
  synth.ensure();
  connectBtn.disabled = true;
  connectBtn.textContent = '연결 중…';
  await input.connect();
  connectBtn.disabled = false;
  connectBtn.textContent = input.status === 'ok' ? '장치 다시 찾기' : '전자피아노 연결';
}

function renderStatus(status) {
  const text = {
    ok: 'MIDI 사용 가능',
    denied: 'MIDI 권한이 거부됨',
    unsupported: '이 브라우저는 Web MIDI 미지원',
    idle: 'MIDI 연결 안 됨',
  }[status];
  statusEl.textContent = text;
  statusEl.className = `status status-${status}`;
  if (status === 'unsupported') {
    statusEl.title = 'Chrome, Edge, Opera 에서 열면 전자피아노를 인식합니다. 그 외 브라우저에서는 컴퓨터 자판으로 연습할 수 있어요.';
  }
}

function renderDevices(inputs) {
  if (!inputs.length) {
    deviceSelectWrap.replaceChildren(h('span', { class: 'hint-inline' }, 'USB 케이블을 연결한 뒤 "장치 다시 찾기"를 눌러보세요.'));
    return;
  }
  deviceSelectWrap.replaceChildren(select(
    [{ value: 'all', label: `모든 장치 (${inputs.length})` }, ...inputs.map((i) => ({ value: i.id, label: i.name }))],
    input.selectedId,
    (v) => input.select(v),
  ));
}

// ── 모드 전환 ───────────────────────────────────────────────────────────────
let currentMode = null;
let cleanups = [];

const ctx = {
  input, synth, keyboard, metronome, stats, settings, saveSettings,
  /** 모드가 등록한 입력 핸들러는 모드가 바뀔 때 자동으로 해제된다. */
  on(type, fn) { cleanups.push(input.on(type, fn)); },
  setKeyboardRange(low, high) { keyboard.setRange(low, high); },
  resetKeyboardRange() { keyboard.setRange(settings.low, settings.high); },
};

function mountMode(id) {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  keyboard.setTargets([]);
  keyboard.releaseAll();
  input.panic();

  const mode = MODES.find((m) => m.id === id) ?? MODES[0];
  currentMode = mode;
  stats.setMode(mode.id);
  modeRoot.replaceChildren();
  modeHint.textContent = mode.hint;
  nav.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.mode === mode.id));

  const cleanup = mode.mount(modeRoot, ctx);
  if (typeof cleanup === 'function') cleanups.push(cleanup);
  document.title = `${mode.title} · 피아노 연습실`;
}

const remount = () => mountMode(currentMode?.id ?? MODES[0].id);

window.addEventListener('hashchange', () => mountMode(location.hash.slice(1)));
mountMode(location.hash.slice(1) || MODES[0].id);
renderStatus(input.supported ? 'idle' : 'unsupported');

// 첫 사용자 동작에서 오디오를 깨우고, 가능하면 MIDI도 자동으로 붙인다.
// pointerdown 이 아니라 click 에서 처리한다. 연결을 시작하면 상단 바 글자가 바뀌면서
// 좁은 화면에서는 줄바꿈이 달라져 그 아래가 밀리는데, pointerdown 에서 하면 그 사이에
// 눌린 자리의 요소가 바뀌어 첫 클릭이 통째로 무시된다.
const wake = () => {
  synth.ensure();
  if (input.supported && input.status === 'idle') connect();
  window.removeEventListener('click', wake);
  window.removeEventListener('keydown', wake);
};
window.addEventListener('click', wake);
window.addEventListener('keydown', wake);

// 스페이스바로 메트로놈을 켜고 끈다.
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
  e.preventDefault();
  metronome.toggle();
});
