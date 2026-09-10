import test from 'node:test';
import assert from 'node:assert/strict';
import { SequenceRunner } from '../src/sequence.js';

const steps = (notes) => notes.map((n) => ({ notes: Array.isArray(n) ? n : [n] }));

test('순서대로 맞히면 끝까지 진행된다', () => {
  let done = null;
  const r = new SequenceRunner({ onDone: (s) => { done = s; } });
  r.load(steps([60, 62, 64]));

  assert.equal(r.noteOn(60, 0), 'correct');
  r.noteOff(60);
  assert.equal(r.noteOn(62, 500), 'correct');
  r.noteOff(62);
  assert.equal(r.noteOn(64, 1000), 'correct');

  assert.ok(r.finished);
  assert.equal(done.hits, 3);
  assert.equal(done.errors, 0);
  assert.equal(done.bpm, 120); // 500ms 간격 = ♩=120
});

test('틀린 음은 진행을 막고 오류로 센다', () => {
  const r = new SequenceRunner();
  r.load(steps([60, 62]));
  assert.equal(r.noteOn(61, 0), 'wrong');
  assert.equal(r.errors, 1);
  assert.equal(r.index, 0);
  r.noteOff(61);
  assert.equal(r.noteOn(60, 100), 'correct');
  assert.equal(r.index, 1);
});

test('화음 스텝은 모든 음을 함께 눌러야 넘어간다', () => {
  const r = new SequenceRunner();
  r.load(steps([[60, 64, 67]]));
  assert.equal(r.noteOn(60, 0), 'partial');
  assert.equal(r.noteOn(64, 10), 'partial');
  assert.equal(r.index, 0);
  assert.equal(r.noteOn(67, 20), 'correct');
  assert.ok(r.finished);
});

test('reset 은 진행과 점수를 되돌린다', () => {
  const r = new SequenceRunner();
  r.load(steps([60, 62]));
  r.noteOn(61, 0);
  r.noteOn(60, 10);
  r.reset();
  assert.equal(r.index, 0);
  assert.equal(r.errors, 0);
  assert.equal(r.hits, 0);
  assert.equal(r.finished, false);
});
