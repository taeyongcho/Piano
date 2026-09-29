import test from 'node:test';
import assert from 'node:assert/strict';
import { assignHands, findSplitPoint, groupIntoEvents } from '../src/hands.js';

const song = (notes, tracks) => ({
  notes: notes.map((n) => ({ channel: 0, track: 0, ...n })),
  tracks: tracks ?? [],
});

const withTracks = (notes) => {
  const tracks = [];
  for (const note of notes) {
    let track = tracks.find((t) => t.index === note.track);
    if (!track) { track = { index: note.track, noteCount: 0, pitchSum: 0 }; tracks.push(track); }
    track.noteCount++;
    track.pitchSum += note.midi;
  }
  for (const t of tracks) t.averagePitch = t.pitchSum / t.noteCount;
  return song(notes, tracks);
};

test('트랙이 둘이면 음이 높은 쪽을 오른손으로 본다', () => {
  const result = assignHands(withTracks([
    { midi: 72, track: 0, start: 0, end: 1 },
    { midi: 74, track: 0, start: 1, end: 2 },
    { midi: 48, track: 1, start: 0, end: 1 },
    { midi: 43, track: 1, start: 1, end: 2 },
  ]));
  assert.equal(result.strategy, 'track');
  assert.deepEqual(result.notes.map((n) => n.hand), ['right', 'right', 'left', 'left']);
});

test('트랙이 하나뿐이면 음높이로 가른다', () => {
  const notes = [
    { midi: 76, start: 0, end: 1 }, { midi: 74, start: 1, end: 2 }, { midi: 72, start: 2, end: 3 },
    { midi: 43, start: 0, end: 1 }, { midi: 45, start: 1, end: 2 }, { midi: 40, start: 2, end: 3 },
  ];
  const result = assignHands(withTracks(notes));
  assert.equal(result.strategy, 'pitch');
  const byMidi = Object.fromEntries(result.notes.map((n) => [n.midi, n.hand]));
  assert.equal(byMidi[76], 'right');
  assert.equal(byMidi[72], 'right');
  assert.equal(byMidi[43], 'left');
  assert.equal(byMidi[40], 'left');
});

test('음역이 좁은 한 줄 멜로디는 한 손에 몰아준다', () => {
  const notes = [60, 62, 64, 65, 67].map((midi, i) => ({ midi, start: i, end: i + 1 }));
  const result = assignHands(withTracks(notes));
  assert.equal(new Set(result.notes.map((n) => n.hand)).size, 1);
});

test('경계는 가운데 도 근처로 묶인다', () => {
  assert.ok(findSplitPoint([20, 21, 22, 100, 101, 102]) >= 52);
  assert.ok(findSplitPoint([20, 21, 22, 100, 101, 102]) <= 67);
  assert.equal(findSplitPoint([60, 62, 64]), 59); // 음역이 좁으면 전부 한쪽
});

test('트랙을 직접 지정하면 그대로 따른다', () => {
  const result = assignHands(
    withTracks([{ midi: 72, track: 0, start: 0, end: 1 }, { midi: 48, track: 1, start: 0, end: 1 }]),
    { leftTracks: [0] },
  );
  assert.deepEqual(result.notes.map((n) => n.hand), ['left', 'right']);
});

test('같은 시각의 음은 한 덩어리로 묶인다', () => {
  const events = groupIntoEvents([
    { midi: 60, start: 0, end: 1 }, { midi: 64, start: 0.01, end: 1 }, { midi: 67, start: 0, end: 1 },
    { midi: 72, start: 0.5, end: 1 },
  ]);
  assert.equal(events.length, 2);
  assert.deepEqual(events[0].notes.map((n) => n.midi), [60, 67, 64]);
  assert.equal(events[1].notes.length, 1);
});
