import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestFingering, annotateFingering } from '../src/fingering.js';
import { groupIntoEvents, assignHands, findSplitPoint } from '../src/hands.js';

const melody = (midis, hand) => {
  const notes = midis.map((m, i) => ({ midi: m, start: i * 0.4, end: i * 0.4 + 0.35 }));
  return suggestFingering(groupIntoEvents(notes), hand).map((e) => e.fingers[0]);
};

const chord = (midis, hand) => {
  const notes = midis.map((m) => ({ midi: m, start: 0, end: 1 }));
  return suggestFingering(groupIntoEvents(notes), hand)[0].fingers;
};

test('다장조 음계 한 옥타브의 표준 운지를 낸다', () => {
  assert.deepEqual(melody([60, 62, 64, 65, 67, 69, 71, 72], 'right'), [1, 2, 3, 1, 2, 3, 4, 5]);
  assert.deepEqual(melody([72, 71, 69, 67, 65, 64, 62, 60], 'right'), [5, 4, 3, 2, 1, 3, 2, 1]);
  assert.deepEqual(melody([48, 50, 52, 53, 55, 57, 59, 60], 'left'), [5, 4, 3, 2, 1, 3, 2, 1]);
  assert.deepEqual(melody([60, 59, 57, 55, 53, 52, 50, 48], 'left'), [1, 2, 3, 1, 2, 3, 4, 5]);
});

test('5음 자리는 손가락을 그대로 펼친다', () => {
  assert.deepEqual(melody([60, 62, 64, 65, 67], 'right'), [1, 2, 3, 4, 5]);
  assert.deepEqual(melody([60, 59, 57, 55, 53], 'left'), [1, 2, 3, 4, 5]);
});

test('화음은 손 모양이 자연스러운 조합을 고른다', () => {
  assert.deepEqual(chord([60, 64, 67], 'right'), [1, 3, 5]);   // 도미솔
  assert.deepEqual(chord([48, 52, 55], 'left'), [1, 3, 5]);    // 왼손은 위에서부터 1
  assert.deepEqual(chord([60, 72], 'right'), [1, 5]);          // 옥타브
  assert.deepEqual(chord([60, 64, 67, 71], 'right'), [1, 2, 3, 5]); // Cmaj7
});

test('한 화음 안에서 손가락이 겹치지 않고 순서대로 놓인다', () => {
  for (const notes of [[60, 62, 64], [60, 65, 69, 74], [55, 59, 62, 67, 71]]) {
    const fingers = chord(notes, 'right');
    assert.equal(new Set(fingers).size, fingers.length, `${notes} 에서 손가락이 겹칩니다`);
    assert.deepEqual(fingers, [...fingers].sort((a, b) => a - b));
  }
});

test('모든 손가락 번호는 1~5 안에 있다', () => {
  const midis = Array.from({ length: 60 }, () => 36 + Math.floor(Math.random() * 48));
  for (const hand of ['right', 'left']) {
    for (const finger of melody(midis, hand)) {
      assert.ok(finger >= 1 && finger <= 5, `${finger} 는 손가락 번호가 아닙니다`);
    }
  }
});

test('한 손으로 닿지 않는 화음도 답을 낸다', () => {
  const fingers = chord([48, 55, 60, 64, 67, 72], 'right'); // 6음
  assert.equal(fingers.length, 6);
  assert.ok(fingers.every((f) => f >= 1 && f <= 5));
});

test('annotateFingering 은 음표에 finger 를 직접 채운다', () => {
  const notes = [60, 62, 64].map((m, i) => ({ midi: m, start: i * 0.5, end: i * 0.5 + 0.4 }));
  const events = groupIntoEvents(notes);
  annotateFingering(events, 'right');
  assert.deepEqual(notes.map((n) => n.finger), [1, 2, 3]);
});

test('긴 곡도 빠르게 처리한다', () => {
  const notes = Array.from({ length: 3000 }, (_, i) => ({
    midi: 48 + (i % 25), start: i * 0.12, end: i * 0.12 + 0.1,
  }));
  const started = Date.now();
  const result = suggestFingering(groupIntoEvents(notes), 'right');
  assert.equal(result.length, 3000);
  assert.ok(Date.now() - started < 2000, '3000음 운지 계산이 2초를 넘었습니다');
});
