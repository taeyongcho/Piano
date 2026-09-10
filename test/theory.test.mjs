import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nameToMidi, noteLabel, spell, staffStep, keyAccidentals, keySignature,
  scaleNotes, detectChord, chordNotes, diatonicChords, intervalName, SCALES,
} from '../src/theory.js';

test('음이름 ↔ MIDI 변환', () => {
  assert.equal(nameToMidi('C4'), 60);
  assert.equal(nameToMidi('A4'), 69);
  assert.equal(nameToMidi('C#4'), 61);
  assert.equal(nameToMidi('Db4'), 61);
  assert.equal(nameToMidi('A0'), 21);
  assert.equal(nameToMidi('C8'), 108);
});

test('철자는 조표의 방향을 따른다', () => {
  assert.deepEqual(spell(61, 0), { midi: 61, letter: 'C', acc: 1, octave: 4 });
  assert.deepEqual(spell(61, -2), { midi: 61, letter: 'D', acc: -1, octave: 4 });
  assert.equal(spell(59, 0).octave, 3); // B3
});

test('오선 위치는 한 음마다 한 칸씩 올라간다', () => {
  assert.equal(staffStep(spell(60)) + 1, staffStep(spell(62))); // C4 → D4
  assert.equal(staffStep(spell(64)) - staffStep(spell(60)), 2); // C4 → E4
  assert.equal(staffStep(spell(72)) - staffStep(spell(60)), 7); // 한 옥타브 = 7칸
});

test('조표', () => {
  assert.equal(keySignature('D', 'major'), 2);
  assert.equal(keySignature('F', 'major'), -1);
  assert.equal(keySignature('A', 'minor'), 0);
  assert.equal(keySignature('C', 'minor'), -3);
  assert.deepEqual(keyAccidentals(2), { F: 1, C: 1 });
  assert.deepEqual(keyAccidentals(-2), { B: -1, E: -1 });
  assert.deepEqual(keyAccidentals(0), {});
});

test('음계 생성', () => {
  assert.deepEqual(scaleNotes(60, 'major', 1), [60, 62, 64, 65, 67, 69, 71, 72]);
  assert.equal(scaleNotes(60, 'major', 2).length, 15);
  assert.deepEqual(scaleNotes(57, 'natural_minor', 1), [57, 59, 60, 62, 64, 65, 67, 69]);
  for (const [key, def] of Object.entries(SCALES)) {
    assert.ok(def.iv.every((i) => i >= 0 && i < 12), `${key} 음계 간격이 한 옥타브를 벗어남`);
  }
});

test('화음 인식', () => {
  assert.equal(detectChord([60, 64, 67]).text, 'C');
  assert.equal(detectChord([60, 63, 67]).text, 'Cm');
  assert.equal(detectChord([60, 64, 67, 70]).text, 'C7');
  assert.equal(detectChord([60, 64, 67, 71]).text, 'Cmaj7');
  assert.equal(detectChord([59, 62, 65]).text, 'Bdim');
  // 자리바꿈은 최저음을 밝혀 준다
  assert.equal(detectChord([64, 67, 72]).text, 'C/E');
  assert.equal(detectChord([67, 72, 76]).text, 'C/G');
  // 두 음이면 음정으로 읽는다
  assert.equal(detectChord([60, 67]).text, intervalName(7));
  assert.equal(detectChord([60]), null);
});

test('화음 음 구성', () => {
  assert.deepEqual(chordNotes(60, ''), [60, 64, 67]);
  assert.deepEqual(chordNotes(60, 'm7'), [60, 63, 67, 70]);
  assert.deepEqual(chordNotes(60, '9'), [60, 64, 67, 70, 74]);
});

test('다이아토닉 화음', () => {
  const major = diatonicChords(0, 'major', false);
  assert.deepEqual(major.map((c) => c.roman), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
  assert.deepEqual(major.map((c) => c.symbol), ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);

  const sevenths = diatonicChords(0, 'major', true);
  assert.deepEqual(sevenths.map((c) => c.symbol), ['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7♭5']);

  assert.deepEqual(sevenths.map((c) => c.roman), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'viiø']);

  const minor = diatonicChords(9, 'natural_minor', false);
  assert.deepEqual(minor.map((c) => c.symbol), ['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
  assert.deepEqual(minor.map((c) => c.roman), ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
});

test('표시용 음이름', () => {
  assert.equal(noteLabel(60, { style: 'en', withOctave: true }), 'C4');
  assert.equal(noteLabel(60, { style: 'solfege' }), '도');
  assert.equal(noteLabel(62, { style: 'ko' }), '라');
  assert.equal(noteLabel(61, { style: 'en' }), 'C♯');
  assert.equal(noteLabel(61, { style: 'en', sig: -2 }), 'D♭');
});
