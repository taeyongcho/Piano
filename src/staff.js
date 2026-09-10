// 오선보 렌더러(SVG). 큰보표/높은음자리표/낮은음자리표를 그린다.
// 좌표는 "스텝"(줄→칸 한 칸 = 1)으로 계산하므로 덧줄과 조표 위치가 자연스럽게 맞는다.

import { spell, staffStep, keyAccidentals, SHARP_ORDER, FLAT_ORDER, LETTERS } from './theory.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LINE_GAP = 12;
const HALF = LINE_GAP / 2;

const TREBLE = { top: 30, topStep: staffStep({ letter: 'F', octave: 5 }), clef: '\u{1D11E}', clefBaselineStep: staffStep({ letter: 'G', octave: 4 }) };
const BASS = { top: 126, topStep: staffStep({ letter: 'A', octave: 3 }), clef: '\u{1D122}', clefBaselineStep: staffStep({ letter: 'F', octave: 3 }) };

const yOf = (staff, step) => staff.top + (staff.topStep - step) * HALF;

// 조표에 쓰이는 임시표 위치(높은음자리표 기준 스텝). 낮은음자리표는 두 옥타브(14스텝) 아래.
const SHARP_STEPS = { F: 38, C: 35, G: 39, D: 36, A: 33, E: 37, B: 34 };
const FLAT_STEPS = { B: 34, E: 37, A: 33, D: 36, G: 32, C: 35, F: 31 };

const el = (name, attrs = {}, text) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
};

function drawStaffLines(g, staff, x0, x1) {
  for (let i = 0; i < 5; i++) {
    const y = staff.top + i * LINE_GAP;
    g.appendChild(el('line', { x1: x0, y1: y, x2: x1, y2: y, class: 'staff-line' }));
  }
}

function drawKeySignature(g, staff, sig, x) {
  if (!sig) return x;
  const shift = staff === BASS ? -14 : 0;
  const letters = sig > 0 ? SHARP_ORDER.slice(0, sig) : FLAT_ORDER.slice(0, -sig);
  const table = sig > 0 ? SHARP_STEPS : FLAT_STEPS;
  let cursor = x;
  for (const letter of letters) {
    g.appendChild(el('text', {
      x: cursor, y: yOf(staff, table[letter] + shift) + 5, class: 'accidental key-sig',
    }, sig > 0 ? '♯' : '♭'));
    cursor += 11;
  }
  return cursor;
}

function drawLedgerLines(g, staff, step, x) {
  const w = 11;
  // 오선 위쪽
  for (let k = staff.topStep + 2; k <= step; k += 2) {
    const y = yOf(staff, k);
    g.appendChild(el('line', { x1: x - w, y1: y, x2: x + w, y2: y, class: 'staff-line ledger' }));
  }
  // 오선 아래쪽 (맨 아래 줄은 topStep - 8)
  for (let k = staff.topStep - 10; k >= step; k -= 2) {
    const y = yOf(staff, k);
    g.appendChild(el('line', { x1: x - w, y1: y, x2: x + w, y2: y, class: 'staff-line ledger' }));
  }
}

/**
 * @param {HTMLElement} container
 * @param {object} opts
 *  - clef: 'grand' | 'treble' | 'bass'
 *  - sig: 조표 개수(양수 = #, 음수 = b)
 *  - groups: [{ notes: number[](MIDI), state?: 'pending'|'ok'|'err'|'dim', label?: string }]
 *  - split: 큰보표에서 위/아래 보표를 나누는 기준 MIDI (기본 60 = 가운데 도)
 */
export function renderStaff(container, opts = {}) {
  const { clef = 'grand', sig = 0, groups = [], split = 60, showNames = false } = opts;

  // 'auto' 는 음역을 보고 한 보표로 충분하면 큰보표 대신 한 줄만 그린다.
  let resolved = clef;
  if (clef === 'auto') {
    const all = groups.flatMap((g) => g.notes);
    if (!all.length) resolved = 'treble';
    else if (Math.min(...all) >= 57) resolved = 'treble';   // A3 이상이면 높은음자리표만
    else if (Math.max(...all) <= 64) resolved = 'bass';     // E4 이하면 낮은음자리표만
    else resolved = 'grand';
  }
  const staves = resolved === 'grand' ? [TREBLE, BASS] : resolved === 'bass' ? [BASS] : [TREBLE];
  const single = staves.length === 1;
  const height = single ? (staves[0] === TREBLE ? 130 : 130) : 230;
  const accInKey = keyAccidentals(sig);

  const slotWidth = 56;
  const leftPad = 16 + 40 + Math.abs(sig) * 11 + 14;
  const width = Math.max(420, leftPad + Math.max(groups.length, 1) * slotWidth + 24);

  const svg = el('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'staff-svg',
    preserveAspectRatio: 'xMidYMid meet',
  });
  const g = el('g', single ? { transform: `translate(0, ${staves[0] === BASS ? -96 : 0})` } : {});
  svg.appendChild(g);

  for (const staff of staves) {
    drawStaffLines(g, staff, 16, width - 12);
    g.appendChild(el('text', {
      x: 20, y: yOf(staff, staff.clefBaselineStep), class: 'clef',
    }, staff.clef));
    drawKeySignature(g, staff, sig, 62);
  }

  if (!single) {
    // 큰보표 왼쪽의 세로줄과 대괄호
    g.appendChild(el('line', { x1: 16, y1: TREBLE.top, x2: 16, y2: BASS.top + 4 * LINE_GAP, class: 'staff-line brace' }));
  }

  groups.forEach((group, i) => {
    const x = leftPad + i * slotWidth + slotWidth / 2;
    const state = group.state ?? 'pending';
    const notes = [...new Set(group.notes)].sort((a, b) => a - b);

    notes.forEach((midi) => {
      const s = spell(midi, sig);
      const step = staffStep(s);
      const staff = single ? staves[0] : midi >= split ? TREBLE : BASS;
      const y = yOf(staff, step);
      drawLedgerLines(g, staff, step, x);

      const head = el('ellipse', {
        cx: x, cy: y, rx: 7.2, ry: 5.2,
        transform: `rotate(-20 ${x} ${y})`,
        class: `notehead state-${state}`,
      });
      g.appendChild(head);

      const showAcc = accInKey[s.letter] !== undefined ? accInKey[s.letter] !== s.acc : s.acc !== 0;
      if (showAcc) {
        const glyph = s.acc === 1 ? '♯' : s.acc === -1 ? '♭' : '♮';
        g.appendChild(el('text', { x: x - 14, y: y + 5, class: `accidental state-${state}` }, glyph));
      }

      // 기둥: 가운데 줄보다 낮으면 위로, 높으면 아래로
      const middleStep = staff.topStep - 4;
      const up = step < middleStep;
      const x1 = up ? x + 6.8 : x - 6.8;
      const y2 = up ? y - 34 : y + 34;
      g.appendChild(el('line', { x1, y1: y, x2: x1, y2, class: `stem state-${state}` }));

      if (showNames) {
        g.appendChild(el('text', {
          x, y: (single ? staves[0].top + 4 * LINE_GAP : BASS.top + 4 * LINE_GAP) + 24,
          class: 'note-name',
        }, group.nameFor ? group.nameFor(midi) : ''));
      }
    });

    if (group.label) {
      g.appendChild(el('text', { x, y: TREBLE.top - 14, class: 'chord-label' }, group.label));
    }
  });

  // 뷰박스 실제 크기를 넘어 늘어나면 오선이 불필요하게 커지므로 가로폭을 고정한다.
  svg.style.maxWidth = `${width}px`;
  container.replaceChildren(svg);
  return svg;
}
