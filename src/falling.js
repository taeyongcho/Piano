// 건반 위로 떨어지는 노트. 건반과 같은 좌표계를 쓰므로 노트가 정확히 해당 건반 위에 놓인다.

const COLORS = {
  right: { fill: '#4f7fe8', edge: '#8fb0ff', text: '#ffffff' },
  left: { fill: '#2e9e74', edge: '#74dcb2', text: '#ffffff' },
  rightBlack: { fill: '#3a63b8', edge: '#7ea0f0', text: '#ffffff' },
  leftBlack: { fill: '#227a59', edge: '#5fc79e', text: '#ffffff' },
  muted: { fill: '#3a4356', edge: '#4d586e', text: '#aab4c6' },
};

export class FallingNotes {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layout = null;
    this.notes = [];
    this.lookahead = 3.2;      // 화면에 담는 시간(초)
    this.showFingering = true;
    this.beatSeconds = 0.5;
    this.beatsPerBar = 4;
    this.cssWidth = 0;
    this.cssHeight = 0;
    this.alignTarget = null;
  }

  setLayout(layout) { this.layout = layout; }

  /**
   * 노트를 실제 화면 건반 바로 위에 떨어뜨리기 위해, 건반 SVG 가 그려진
   * 위치와 배율을 기준으로 삼는다. SVG 는 가로세로 비율을 지키느라 좌우에
   * 여백을 두고 그려지므로, 컨테이너 너비가 아니라 그려진 내용의 너비를 재야 한다.
   */
  alignTo(container) { this.alignTarget = container; }

  measureAlignment(unitWidth) {
    const fallback = { scale: this.cssWidth / unitWidth, originX: 0 };
    const svg = this.alignTarget?.querySelector('svg');
    if (!svg) return fallback;
    const box = svg.getBoundingClientRect();
    const viewBox = svg.viewBox?.baseVal;
    if (!box.width || !viewBox?.width) return fallback;
    const scale = Math.min(box.width / viewBox.width, box.height / viewBox.height);
    const drawnWidth = viewBox.width * scale;
    const canvasBox = this.canvas.getBoundingClientRect();
    return {
      scale,
      originX: box.left + (box.width - drawnWidth) / 2 - canvasBox.left,
    };
  }

  setNotes(notes) {
    this.notes = [...notes].sort((a, b) => a.start - b.start);
  }

  setOptions(options = {}) { Object.assign(this, options); }

  /** 컨테이너 크기에 맞춰 캔버스 해상도를 다시 잡는다. 화면 배율(dpr)도 반영한다. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (!rect.width || !rect.height) return false;
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  /** 첫 번째로 화면에 보일 수 있는 음표의 인덱스를 이진 탐색으로 찾는다. */
  firstVisible(fromTime) {
    let lo = 0;
    let hi = this.notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.notes[mid].end < fromTime) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  draw(time, { sounding = new Set(), waiting = null, dimOtherHand = false, practiceHand = 'both' } = {}) {
    const ctx = this.ctx;
    if (!this.layout || !this.resize()) return;

    const { width: unitWidth, keys } = this.layout;
    const { scale, originX } = this.measureAlignment(unitWidth);
    const height = this.cssHeight;
    const hitLine = height - 2;
    const pps = height / this.lookahead;   // 초당 내려오는 픽셀

    ctx.clearRect(0, 0, this.cssWidth, height);

    // 배경: 검은건반 자리를 살짝 어둡게 해서 건반과 줄을 맞춘다.
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, this.cssWidth, height);
    ctx.fillStyle = 'rgba(255,255,255,0.028)';
    for (const [midi, key] of keys) {
      if (!key.black) continue;
      ctx.fillRect(originX + key.x * scale, 0, key.width * scale, height);
    }
    // 도(C) 자리마다 옅은 세로선 — 위치를 가늠하는 기준
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1;
    for (const [midi, key] of keys) {
      if (midi % 12 !== 0) continue;
      ctx.beginPath();
      ctx.moveTo(Math.round(originX + key.x * scale) + 0.5, 0);
      ctx.lineTo(Math.round(originX + key.x * scale) + 0.5, height);
      ctx.stroke();
    }

    // 박자 선
    if (this.beatSeconds > 0.05) {
      const firstBeat = Math.floor(time / this.beatSeconds);
      const lastBeat = Math.ceil((time + this.lookahead) / this.beatSeconds);
      for (let b = firstBeat; b <= lastBeat; b++) {
        if (b < 0) continue;
        const y = hitLine - (b * this.beatSeconds - time) * pps;
        if (y < 0 || y > height) continue;
        const bar = this.beatsPerBar > 0 && b % this.beatsPerBar === 0;
        ctx.strokeStyle = bar ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.07)';
        ctx.beginPath();
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(this.cssWidth, Math.round(y) + 0.5);
        ctx.stroke();
      }
    }

    // 음표
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontSize = Math.max(8, Math.min(13, 9 * scale));
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;

    for (let i = this.firstVisible(time - 0.2); i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.start > time + this.lookahead) break;
      const key = keys.get(note.midi);
      if (!key) continue;

      const yBottom = hitLine - (note.start - time) * pps;
      const noteHeight = Math.max(6, note.duration * pps);
      const yTop = yBottom - noteHeight;
      if (yTop > height || yBottom < 0) continue;

      const isOtherHand = practiceHand !== 'both' && note.hand !== practiceHand;
      const black = key.black;
      let palette;
      if (dimOtherHand && isOtherHand) palette = COLORS.muted;
      else if (note.hand === 'left') palette = black ? COLORS.leftBlack : COLORS.left;
      else palette = black ? COLORS.rightBlack : COLORS.right;

      const x = originX + key.x * scale + 1;
      const w = Math.max(3, key.width * scale - 2);
      const top = Math.max(-noteHeight, yTop);
      const bottom = Math.min(height, yBottom);
      const h = Math.max(3, bottom - top);

      const isSounding = sounding.has(note);
      const isWaitedOn = waiting?.has(note);

      ctx.fillStyle = palette.fill;
      ctx.globalAlpha = note.start < time - 0.05 && !isSounding ? 0.45 : 1;
      ctx.beginPath();
      const radius = Math.min(4, w / 2, h / 2);
      if (ctx.roundRect) ctx.roundRect(x, top, w, h, radius);
      else ctx.rect(x, top, w, h);
      ctx.fill();

      ctx.lineWidth = isWaitedOn ? 2.5 : 1;
      ctx.strokeStyle = isWaitedOn ? '#ffd76a' : palette.edge;
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (this.showFingering && note.finger && h > fontSize + 4 && w > fontSize) {
        ctx.fillStyle = palette.text;
        ctx.fillText(String(note.finger), x + w / 2, bottom - Math.min(h / 2, fontSize));
      }
    }

    // 건반에 닿는 선
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, hitLine);
    ctx.lineTo(this.cssWidth, hitLine);
    ctx.stroke();
  }
}
