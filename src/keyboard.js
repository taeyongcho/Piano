// 화면 건반. SVG로 그리고 상태(누름/목표/오답)를 CSS 클래스로 표시한다.

import { isBlackKey, noteLabel } from './theory.js';

const WHITE_W = 26;
const WHITE_H = 132;
const BLACK_W = 16;
const BLACK_H = 84;
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 건반 한 벌의 좌표를 계산한다. 화면 건반과 떨어지는 노트가 같은 좌표계를 써야
 * 노트가 건반 바로 위로 떨어지므로, 이 함수를 둘이 공유한다.
 * @returns {{low:number, high:number, width:number, height:number,
 *            keys:Map<number,{x:number,width:number,black:boolean}>}}
 */
export function computeKeyLayout(lowInput, highInput) {
  // 시작·끝이 흰건반이 되도록 살짝 넓힌다.
  let low = lowInput;
  let high = highInput;
  while (isBlackKey(low) && low > 0) low--;
  while (isBlackKey(high) && high < 127) high++;

  const whites = [];
  for (let m = low; m <= high; m++) if (!isBlackKey(m)) whites.push(m);
  const whiteIndex = new Map(whites.map((m, i) => [m, i]));

  const keys = new Map();
  for (let m = low; m <= high; m++) {
    if (isBlackKey(m)) {
      // 바로 아래 흰건반의 오른쪽 경계에 걸치도록 놓는다.
      let below = m - 1;
      while (isBlackKey(below)) below--;
      keys.set(m, { x: (whiteIndex.get(below) + 1) * WHITE_W - BLACK_W / 2, width: BLACK_W, black: true });
    } else {
      keys.set(m, { x: whiteIndex.get(m) * WHITE_W, width: WHITE_W - 1.5, black: false });
    }
  }

  return { low, high, width: whites.length * WHITE_W, height: WHITE_H, keys };
}

export class PianoKeyboard {
  constructor(el, { low = 36, high = 96, onNoteOn, onNoteOff } = {}) {
    this.el = el;
    this.low = low;
    this.high = high;
    this.onNoteOn = onNoteOn;
    this.onNoteOff = onNoteOff;
    this.labelStyle = 'off'; // off | en | solfege | ko
    this.keys = new Map();
    this.targets = new Set();
    this.pointerNote = null;
    this.render();
    this.attachPointer();
  }

  setRange(low, high) {
    this.low = low;
    this.high = high;
    this.render();
  }

  setLabelStyle(style) {
    this.labelStyle = style;
    this.render();
  }

  /** 지금 그려진 건반의 좌표계. 떨어지는 노트가 이 값을 그대로 쓴다. */
  getLayout() { return this.layout; }

  render() {
    const layout = computeKeyLayout(this.low, this.high);
    this.layout = layout;
    const { low, high, width } = layout;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${WHITE_H}`);
    svg.setAttribute('class', 'keyboard-svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    this.keys.clear();
    const whiteLayer = document.createElementNS(SVG_NS, 'g');
    const blackLayer = document.createElementNS(SVG_NS, 'g');

    for (let m = low; m <= high; m++) {
      const { x, width: keyWidth, black } = layout.keys.get(m);
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', 0);
      rect.setAttribute('width', keyWidth);
      rect.setAttribute('height', black ? BLACK_H : WHITE_H);
      rect.setAttribute('rx', black ? 2.5 : 3.5);
      rect.setAttribute('class', black ? 'key key-black' : 'key key-white');
      rect.dataset.midi = String(m);
      (black ? blackLayer : whiteLayer).appendChild(rect);
      this.keys.set(m, rect);

      if (!black && this.labelStyle !== 'off') {
        {
          const text = document.createElementNS(SVG_NS, 'text');
          text.setAttribute('x', x + keyWidth / 2);
          text.setAttribute('y', WHITE_H - 10);
          text.setAttribute('class', 'key-label');
          text.textContent = noteLabel(m, { style: this.labelStyle, withOctave: m % 12 === 0 });
          whiteLayer.appendChild(text);
        }
      }
    }

    svg.appendChild(whiteLayer);
    svg.appendChild(blackLayer);
    this.el.replaceChildren(svg);
    this.svg = svg;
    this.applyTargets();
  }

  attachPointer() {
    const noteAt = (event) => {
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const midi = el?.dataset?.midi;
      return midi === undefined ? null : Number(midi);
    };
    this.el.addEventListener('pointerdown', (e) => {
      const midi = noteAt(e);
      if (midi === null) return;
      e.preventDefault();
      this.el.setPointerCapture?.(e.pointerId);
      this.pointerNote = midi;
      this.onNoteOn?.(midi);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (this.pointerNote === null) return;
      const midi = noteAt(e);
      if (midi === null || midi === this.pointerNote) return;
      this.onNoteOff?.(this.pointerNote);
      this.pointerNote = midi;
      this.onNoteOn?.(midi);
    });
    const end = () => {
      if (this.pointerNote === null) return;
      this.onNoteOff?.(this.pointerNote);
      this.pointerNote = null;
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
    this.el.addEventListener('pointerleave', end);
  }

  press(midi, variant = '') {
    const key = this.keys.get(midi);
    if (!key) return;
    key.classList.add('is-down');
    key.classList.toggle('is-wrong', variant === 'wrong');
    key.classList.toggle('is-right', variant === 'right');
  }

  release(midi) {
    const key = this.keys.get(midi);
    if (!key) return;
    key.classList.remove('is-down', 'is-wrong', 'is-right');
  }

  releaseAll() {
    this.keys.forEach((key) => key.classList.remove('is-down', 'is-wrong', 'is-right'));
  }

  /** 지금 눌러야 할 음들을 강조한다. */
  setTargets(midis = []) {
    this.targets = new Set(midis);
    this.applyTargets();
  }

  applyTargets() {
    this.keys.forEach((key, midi) => key.classList.toggle('is-target', this.targets.has(midi)));
  }

  /** 짧게 반짝이는 힌트(정답 미리보기 등). */
  flash(midis, ms = 600) {
    midis.forEach((m) => this.keys.get(m)?.classList.add('is-hint'));
    setTimeout(() => midis.forEach((m) => this.keys.get(m)?.classList.remove('is-hint')), ms);
  }
}
