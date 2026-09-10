// WebAudio 기반의 간단한 피아노 음색 + 메트로놈 클릭.
// 전자피아노 자체 소리를 쓰는 사람도 있으므로 기본값은 "켜짐"이되 언제든 끌 수 있다.

const midiToHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

export class Synth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.voices = new Map(); // midi → voice
    this.sustained = new Set();
    this.pedalDown = false;
    this.enabled = true;
    this.volume = 0.5;
  }

  /** 브라우저 정책상 사용자 제스처 이후에만 오디오를 시작할 수 있다. */
  ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }

  noteOn(midi, velocity = 100) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    this.noteOff(midi, true);

    const t = ctx.currentTime;
    const freq = midiToHz(midi);
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(freq * 8 + 800, 12000);
    filter.Q.value = 0.6;

    // 배음을 조금 섞어 피아노에 가까운 소리를 만든다.
    const partials = [
      { type: 'triangle', ratio: 1, gain: 1 },
      { type: 'sine', ratio: 2, gain: 0.34 },
      { type: 'sine', ratio: 3.01, gain: 0.12 },
    ];
    const oscs = partials.map((p) => {
      const osc = ctx.createOscillator();
      osc.type = p.type;
      osc.frequency.value = freq * p.ratio;
      const g = ctx.createGain();
      g.gain.value = p.gain;
      osc.connect(g).connect(filter);
      osc.start(t);
      return osc;
    });

    const peak = Math.max(0.05, Math.min(velocity / 127, 1)) * 0.28;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.35);
    // 높은 음일수록 빨리 감쇠하도록
    const decay = midi < 48 ? 9 : midi < 72 ? 6 : 3.5;
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    filter.connect(gain).connect(this.master);

    this.voices.set(midi, { oscs, gain, filter, started: t });
  }

  noteOff(midi, force = false) {
    if (this.pedalDown && !force) {
      this.sustained.add(midi);
      return;
    }
    const voice = this.voices.get(midi);
    if (!voice) return;
    this.voices.delete(midi);
    this.sustained.delete(midi);
    const t = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0001), t);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    voice.oscs.forEach((o) => o.stop(t + 0.3));
  }

  setPedal(down) {
    this.pedalDown = down;
    if (!down) {
      [...this.sustained].forEach((m) => this.noteOff(m, true));
      this.sustained.clear();
    }
  }

  allOff() {
    [...this.voices.keys()].forEach((m) => this.noteOff(m, true));
    this.sustained.clear();
  }

  /** 예: 화음 미리듣기 — 지정한 시각에 잠깐 울리고 꺼진다. */
  playNotes(midis, { duration = 0.9, gap = 0, velocity = 96 } = {}) {
    const ctx = this.ensure();
    midis.forEach((m, i) => {
      const delay = i * gap;
      setTimeout(() => this.noteOn(m, velocity), delay * 1000);
      setTimeout(() => this.noteOff(m, true), (delay + duration) * 1000);
    });
    return (midis.length - 1) * gap + duration;
  }

  /** 메트로놈 클릭. when 은 AudioContext 시간축. */
  click(when, accent = false) {
    const ctx = this.ensure();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1760 : 1100;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.3 : 0.16, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(gain).connect(this.master ?? ctx.destination);
    osc.start(when);
    osc.stop(when + 0.08);
  }
}
