// 운지(손가락 번호) 자동 추천.
//
// 손가락 쌍마다 "편하게 벌어지는 반음 간격"을 정해 두고, 음에서 음으로 옮길 때의
// 불편함을 비용으로 매긴 뒤 동적 계획법으로 전체 비용이 가장 낮은 조합을 고른다.
// 어디까지나 기계적인 추천이라 실제 악보의 편집 운지와는 다를 수 있다.

import { isBlackKey } from './theory.js';

export const FINGER_NAMES = { 1: '엄지', 2: '검지', 3: '중지', 4: '약지', 5: '새끼' };

// 손가락 쌍마다 [최소, 최대, 가장 편한] 벌림(반음).
// '가장 편한' 값은 다섯 손가락을 이웃한 흰건반에 얹었을 때(도-레-미-파-솔)의 실제 간격이다.
// 오른손 기준이며, 왼손은 좌우를 뒤집어 같은 표를 쓴다.
const SPAN = {
  '1,2': [0, 6, 2], '1,3': [2, 9, 4], '1,4': [3, 11, 5], '1,5': [5, 12, 7],
  '2,3': [1, 4, 2], '2,4': [2, 6, 3], '2,5': [3, 9, 5],
  '3,4': [1, 3, 1], '3,5': [2, 6, 3],
  '4,5': [1, 4, 2],
};

const OUT_OF_RANGE_COST = 2.0;   // 편한 범위를 반음 벗어날 때마다
const AWAY_FROM_REST = 0.25;     // 가장 편한 벌림에서 멀어질 때 (범위 안에서의 선호도)
const CHORD_SHAPE_COST = 0.35;   // 화음에서 손 모양이 자연스러운지
const WEAK_FINGER_COST = 0.2;    // 화음에서 약지(4)는 독립성이 떨어진다
const WEAK_OUTER_COST = 0.6;     // 화음의 바깥을 약지로 받치면 모양이 불안정하다
const SPREAD_COST = 0.3;         // 쓰지 않는 손가락이 낄 자리가 없으면 손이 옹색해진다
const SAME_FINGER_BASE = 5.0;    // 같은 손가락으로 다른 음을 이어 칠 때
// 엄지를 넣거나 손을 넘길 때의 기본 비용과, 그 손가락 아래로 엄지가 지나갈 수 있는 한계.
// 3번 아래로 넣는 것이 가장 자연스럽고 2번 아래는 어색하다.
const CROSS = { 2: { base: 4.0, limit: 4 }, 3: { base: 2.2, limit: 7 }, 4: { base: 3.2, limit: 9 } };

const REUSED_FINGER_COST = 4.0;  // 손가락 하나로 건반 둘을 누르는 경우 (한 손에 다 안 들어오는 화음)

const spanFor = (a, b) => SPAN[`${Math.min(a, b)},${Math.max(a, b)}`];

/** 음높이를 "손 좌표"로 바꾼다. 이 좌표에서는 두 손 모두 번호가 큰 손가락이 + 방향이다. */
const handX = (midi, hand) => (hand === 'left' ? -midi : midi);

/** 손가락 하나에 음 하나를 얹었을 때의 고정 비용. */
function noteCost(midi, finger) {
  let cost = 0;
  if (isBlackKey(midi)) {
    if (finger === 1) cost += 2.0;   // 검은건반 위의 엄지는 되도록 피한다
    else if (finger === 5) cost += 1.2;
  }
  return cost;
}

/** 한 음에서 다음 음으로 옮길 때의 비용. dx 는 손 좌표 기준 이동량. */
function moveCost(dx, from, to) {
  if (from === to) return dx === 0 ? 0 : SAME_FINGER_BASE + Math.abs(dx) * 0.6;

  const [min, max, rest] = spanFor(from, to);
  const forward = to > from;          // 번호가 큰 손가락 쪽으로 = + 방향이 자연스럽다
  const span = forward ? dx : -dx;

  if (span >= min && span <= max) return 0.2 + Math.abs(span - rest) * AWAY_FROM_REST;
  if (span > max) return (span - max) * OUT_OF_RANGE_COST + Math.abs(max - rest) * AWAY_FROM_REST;
  if (span >= 0) return (min - span) * 0.8;              // 방향은 맞지만 너무 좁음

  // span < 0 — 손가락 순서와 반대 방향. 엄지를 넣거나(1) 손을 넘기는(1→3 등) 동작이다.
  const crossing = -span;
  const over = to === 1 ? from : from === 1 ? to : 0;
  const cross = CROSS[over];
  if (cross) return cross.base + Math.max(0, crossing - cross.limit) * OUT_OF_RANGE_COST;
  return 8 + crossing * OUT_OF_RANGE_COST;   // 엄지가 끼지 않는 손가락 교차는 사실상 불가능하다
}

/** k개 음을 동시에 누를 때 쓸 수 있는 손가락 조합들(손 좌표 오름차순). */
function fingerCombinations(k) {
  if (k <= 0) return [[]];
  if (k > 5) return null;
  const out = [];
  const walk = (start, acc) => {
    if (acc.length === k) { out.push([...acc]); return; }
    for (let f = start; f <= 5; f++) { acc.push(f); walk(f + 1, acc); acc.pop(); }
  };
  walk(1, []);
  return out;
}

/** 화음 안에서 손가락 간격이 실제 음 간격과 맞는지 본 비용. */
function chordCost(xs, fingers) {
  let cost = 0;
  for (let i = 0; i < fingers.length; i++) {
    cost += noteCost(xs[i].midi, fingers[i]);
    if (i === 0) continue;
    const gap = xs[i].x - xs[i - 1].x;
    if (fingers[i] === fingers[i - 1]) {
      // 손가락 하나로 이웃한 두 건반을 함께 누르는 것 말고는 방법이 없다.
      cost += REUSED_FINGER_COST + Math.max(0, gap - 2) * OUT_OF_RANGE_COST;
      continue;
    }
    const [min, max, rest] = spanFor(fingers[i - 1], fingers[i]);
    if (gap > max) cost += (gap - max) * OUT_OF_RANGE_COST;
    else if (gap < min) cost += (min - gap) * 0.7;
    cost += Math.abs(gap - rest) * CHORD_SHAPE_COST;
    // 건너뛴 손가락도 건반 위에 얹혀야 하므로, 손가락 번호 간격은 음 간격에 비례하는 편이 낫다.
    cost += Math.abs((fingers[i] - fingers[i - 1]) - gap / 2) * SPREAD_COST;
  }
  // 바깥쪽 두 손가락이 전체 음폭을 감당하는지도 본다.
  if (fingers.length >= 2 && fingers[0] !== fingers[fingers.length - 1]) {
    const total = xs[xs.length - 1].x - xs[0].x;
    const [, max, rest] = spanFor(fingers[0], fingers[fingers.length - 1]);
    if (total > max) cost += (total - max) * OUT_OF_RANGE_COST;
    cost += Math.abs(total - rest) * CHORD_SHAPE_COST;
  }
  if (fingers.length >= 3) {
    if (fingers.includes(4)) cost += WEAK_FINGER_COST;
    if (fingers[fingers.length - 1] === 4) cost += WEAK_OUTER_COST;
  }
  return cost;
}

/**
 * 한 손의 연주 흐름에 운지를 붙인다.
 * @param {Array} events groupIntoEvents 결과 — [{start, notes:[{midi}]}]
 * @param {'right'|'left'} hand
 * @returns {Array<Array<number>>} 이벤트별, 손 좌표 오름차순 음에 대한 손가락 번호
 */
export function suggestFingering(events, hand = 'right') {
  if (!events.length) return [];

  // 각 이벤트의 음을 손 좌표 오름차순으로 세워 둔다.
  const shaped = events.map((event) => {
    const xs = event.notes
      .map((note) => ({ note, midi: note.midi, x: handX(note.midi, hand) }))
      .sort((a, b) => a.x - b.x);
    return { start: event.start, xs };
  });

  const candidatesFor = (event) => {
    const combos = fingerCombinations(event.xs.length);
    if (combos) return combos;
    // 한 손으로 소화할 수 없는 화음은 바깥부터 1·5 를 두고 나머지를 고르게 편다.
    const k = event.xs.length;
    return [Array.from({ length: k }, (_, i) => Math.min(5, 1 + Math.round((i * 4) / (k - 1))))];
  };

  let previous = null; // [{fingers, cost, backpointer}]
  const table = [];

  shaped.forEach((event, index) => {
    const candidates = candidatesFor(event);
    const row = candidates.map((fingers) => {
      const base = chordCost(event.xs, fingers);
      if (!previous) return { fingers, cost: base, from: -1 };

      // 사이가 벌어진 구간은 손을 옮길 시간이 있으므로 이동 비용을 깎아 준다.
      const gap = event.start - shaped[index - 1].start;
      const relief = Math.max(0.2, Math.min(1, 1.1 - gap));

      let best = null;
      previous.forEach((prev, prevIndex) => {
        const prevXs = shaped[index - 1].xs;
        const lowCost = moveCost(
          event.xs[0].x - prevXs[0].x,
          prev.fingers[0], fingers[0],
        );
        const highCost = moveCost(
          event.xs[event.xs.length - 1].x - prevXs[prevXs.length - 1].x,
          prev.fingers[prev.fingers.length - 1], fingers[fingers.length - 1],
        );
        const move = ((lowCost + highCost) / 2) * relief;
        const total = prev.cost + base + move;
        if (!best || total < best.cost) best = { fingers, cost: total, from: prevIndex };
      });
      return best;
    });

    table.push(row);
    previous = row;
  });

  // 가장 싼 끝점에서 거꾸로 되짚어 간다.
  let bestIndex = 0;
  table[table.length - 1].forEach((cell, i) => {
    if (cell.cost < table[table.length - 1][bestIndex].cost) bestIndex = i;
  });

  const result = new Array(table.length);
  for (let i = table.length - 1; i >= 0; i--) {
    const cell = table[i][bestIndex];
    result[i] = cell.fingers;
    bestIndex = cell.from;
  }

  // 손 좌표 순서로 낸 결과를 원래 음표에 붙여 돌려준다.
  return result.map((fingers, i) => {
    const map = new Map();
    shaped[i].xs.forEach((entry, j) => map.set(entry.note, fingers[j]));
    return { fingers, byNote: map };
  });
}

/** 음표 배열에 finger 값을 직접 채워 넣는 편의 함수. */
export function annotateFingering(events, hand) {
  const suggestion = suggestFingering(events, hand);
  suggestion.forEach((entry, i) => {
    for (const [note, finger] of entry.byNote) note.finger = finger;
    events[i].fingers = entry.fingers;
  });
  return events;
}
