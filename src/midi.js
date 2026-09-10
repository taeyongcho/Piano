// Web MIDI 입력 + 컴퓨터 자판 대체 입력.
// 전자피아노가 없어도 자판으로 모든 연습 모드를 그대로 써볼 수 있게 한다.

const KEY_MAP = {
  // 아래 줄: 낮은 옥타브
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6,
  KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11, Comma: 12, KeyL: 13, Period: 14,
  // 윗 줄: 한 옥타브 위
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18,
  KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23, KeyI: 24, Digit9: 25, KeyO: 26,
};

export class Emitter {
  constructor() { this.handlers = new Map(); }
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) { this.handlers.get(type)?.delete(fn); }
  emit(type, payload) { this.handlers.get(type)?.forEach((fn) => fn(payload)); }
}

export class MidiInput extends Emitter {
  constructor() {
    super();
    this.access = null;
    this.inputs = [];
    this.selectedId = localStorage.getItem('piano.midiInput') || 'all';
    this.status = 'idle'; // idle | ok | denied | unsupported
    this.held = new Set();
    this.keyboardOctave = 4; // 자판 입력의 기준 옥타브
    this.pressedKeys = new Set();
  }

  get supported() { return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator; }

  async connect() {
    if (!this.supported) {
      this.status = 'unsupported';
      this.emit('status', this.status);
      return false;
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.status = 'ok';
      this.access.onstatechange = () => this.refreshInputs();
      this.refreshInputs();
      this.emit('status', this.status);
      return true;
    } catch (err) {
      this.status = 'denied';
      this.error = err?.message || String(err);
      this.emit('status', this.status);
      return false;
    }
  }

  refreshInputs() {
    if (!this.access) return;
    this.inputs = [...this.access.inputs.values()];
    this.inputs.forEach((input) => { input.onmidimessage = (e) => this.handleMessage(input, e); });
    this.emit('devices', this.inputs);
  }

  select(id) {
    this.selectedId = id;
    localStorage.setItem('piano.midiInput', id);
    this.emit('devices', this.inputs);
  }

  handleMessage(input, event) {
    if (this.selectedId !== 'all' && input.id !== this.selectedId) return;
    const [status, d1, d2] = event.data;
    const type = status & 0xf0;
    if (type === 0x90 && d2 > 0) this.noteOn(d1, d2, 'midi');
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) this.noteOff(d1, 'midi');
    else if (type === 0xb0 && d1 === 64) this.emit('pedal', d2 >= 64);
    else if (type === 0xb0 && d1 === 123) this.panic();
  }

  noteOn(midi, velocity = 100, source = 'ui') {
    if (this.held.has(midi)) this.noteOff(midi, source);
    this.held.add(midi);
    this.emit('noteon', { midi, velocity, source, time: performance.now() });
  }

  noteOff(midi, source = 'ui') {
    if (!this.held.delete(midi)) return;
    this.emit('noteoff', { midi, source, time: performance.now() });
  }

  panic() {
    [...this.held].forEach((m) => this.noteOff(m, 'panic'));
  }

  /** 컴퓨터 자판을 건반처럼 쓰는 대체 입력을 켠다. */
  attachComputerKeyboard(target = window) {
    const down = (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Minus' || e.code === 'BracketLeft') { this.shiftOctave(-1); e.preventDefault(); return; }
      if (e.code === 'Equal' || e.code === 'BracketRight') { this.shiftOctave(1); e.preventDefault(); return; }
      const offset = KEY_MAP[e.code];
      if (offset === undefined) return;
      e.preventDefault();
      const midi = (this.keyboardOctave + 1) * 12 + offset;
      if (this.pressedKeys.has(e.code)) return;
      this.pressedKeys.add(e.code);
      this.noteOn(midi, 90, 'keyboard');
    };
    const up = (e) => {
      const offset = KEY_MAP[e.code];
      if (offset === undefined || !this.pressedKeys.delete(e.code)) return;
      this.noteOff((this.keyboardOctave + 1) * 12 + offset, 'keyboard');
    };
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    window.addEventListener('blur', () => { this.pressedKeys.clear(); this.panic(); });
    return () => { target.removeEventListener('keydown', down); target.removeEventListener('keyup', up); };
  }

  shiftOctave(delta) {
    this.keyboardOctave = Math.max(0, Math.min(7, this.keyboardOctave + delta));
    this.panic();
    this.emit('octave', this.keyboardOctave);
  }
}
