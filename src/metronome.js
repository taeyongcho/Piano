// 메트로놈. setTimeout 만으로는 흔들리므로 AudioContext 시간축에 미리 예약한다.

export class Metronome {
  constructor(synth) {
    this.synth = synth;
    this.bpm = 80;
    this.beatsPerBar = 4;
    this.running = false;
    this.beat = 0;
    this.nextNoteTime = 0;
    this.timer = null;
    this.lookahead = 0.1; // 초
    this.onBeat = null;
    this.beatLog = []; // { beat, time(performance.now 기준 ms) }
  }

  start() {
    if (this.running) return;
    const ctx = this.synth.ensure();
    this.running = true;
    this.beat = 0;
    this.beatLog = [];
    this.nextNoteTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    this.timer = null;
  }

  toggle() { this.running ? this.stop() : this.start(); }

  setBpm(bpm) { this.bpm = Math.max(20, Math.min(300, Math.round(bpm))); }

  schedule() {
    const ctx = this.synth.ctx;
    if (!ctx) return;
    const spb = 60 / this.bpm;
    while (this.nextNoteTime < ctx.currentTime + this.lookahead) {
      const accent = this.beatsPerBar > 0 && this.beat % this.beatsPerBar === 0;
      this.synth.click(this.nextNoteTime, accent);
      // AudioContext 시간을 performance.now() 기준으로 환산해 기록해 둔다.
      const wallMs = performance.now() + (this.nextNoteTime - ctx.currentTime) * 1000;
      this.beatLog.push({ beat: this.beat, time: wallMs });
      if (this.beatLog.length > 64) this.beatLog.shift();
      this.onBeat?.({ beat: this.beat, accent, time: wallMs });
      this.beat++;
      this.nextNoteTime += spb;
    }
  }

  /** 어떤 시각이 가장 가까운 박에서 몇 ms 벗어났는지. (+면 늦음) */
  deviationAt(timeMs) {
    if (!this.beatLog.length) return null;
    const spbMs = (60 / this.bpm) * 1000;
    let best = null;
    for (const b of this.beatLog) {
      const d = timeMs - b.time;
      if (best === null || Math.abs(d) < Math.abs(best)) best = d;
    }
    // 기록 범위를 벗어난 경우 박 간격으로 접어 넣는다.
    if (best !== null && Math.abs(best) > spbMs / 2) {
      best = ((((best + spbMs / 2) % spbMs) + spbMs) % spbMs) - spbMs / 2;
    }
    return best;
  }
}

export class TapTempo {
  constructor() { this.taps = []; }
  tap() {
    const now = performance.now();
    if (this.taps.length && now - this.taps.at(-1) > 2500) this.taps = [];
    this.taps.push(now);
    if (this.taps.length > 8) this.taps.shift();
    if (this.taps.length < 2) return null;
    const gaps = this.taps.slice(1).map((t, i) => t - this.taps[i]);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    return Math.round(60000 / avg);
  }
}
