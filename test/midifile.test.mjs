import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMidiFile } from '../src/midifile.js';
import { buildMidi, noteOn, noteOff, tempo, trackName, timeSignature, keySignature, vlq } from './helpers/smf.mjs';

test('가변 길이 값(VLQ) 인코딩 가정 확인', () => {
  assert.deepEqual(vlq(0), [0x00]);
  assert.deepEqual(vlq(127), [0x7f]);
  assert.deepEqual(vlq(128), [0x81, 0x00]);
  assert.deepEqual(vlq(480), [0x83, 0x60]);
});

test('음표의 시작·끝 시각을 초로 바꾼다', () => {
  // ♩=120 (500000us), 480틱 = 1박 = 0.5초
  const file = buildMidi({
    ticksPerBeat: 480,
    tracks: [[tempo(0, 500000), noteOn(0, 60), noteOff(480, 60), noteOn(0, 64), noteOff(960, 64)]],
  });
  const song = parseMidiFile(file);

  assert.equal(song.ticksPerBeat, 480);
  assert.equal(song.bpm, 120);
  assert.equal(song.notes.length, 2);

  assert.equal(song.notes[0].midi, 60);
  assert.equal(song.notes[0].start, 0);
  assert.equal(song.notes[0].end, 0.5);

  assert.equal(song.notes[1].midi, 64);
  assert.equal(song.notes[1].start, 0.5);
  assert.equal(song.notes[1].end, 1.5);
  assert.equal(song.duration, 1.5);
});

test('중간에 템포가 바뀌면 그 뒤 음표만 영향을 받는다', () => {
  const file = buildMidi({
    ticksPerBeat: 480,
    tracks: [[
      tempo(0, 500000),           // ♩=120 → 1박 0.5초
      noteOn(0, 60), noteOff(480, 60),
      tempo(0, 1000000),          // ♩=60 → 1박 1.0초
      noteOn(0, 62), noteOff(480, 62),
    ]],
  });
  const song = parseMidiFile(file);
  assert.equal(song.notes[0].start, 0);
  assert.equal(song.notes[0].end, 0.5);
  assert.equal(song.notes[1].start, 0.5);
  assert.equal(song.notes[1].end, 1.5);
});

test('벨로시티 0 인 note on 은 note off 로 본다', () => {
  const file = buildMidi({
    ticksPerBeat: 480,
    tracks: [[noteOn(0, 60, 90), [480, 0x90, 60, 0]]],
  });
  const song = parseMidiFile(file);
  assert.equal(song.notes.length, 1);
  assert.equal(song.notes[0].end, 0.5);
  assert.equal(song.notes[0].velocity, 90);
});

test('러닝 스테이터스(상태 바이트 생략)를 처리한다', () => {
  const file = buildMidi({
    ticksPerBeat: 480,
    tracks: [[
      noteOn(0, 60),
      [0, 62, 80],       // 0x90 생략
      [480, 60, 0],      // note off 대신 벨로시티 0
      [0, 62, 0],
    ]],
  });
  const song = parseMidiFile(file);
  assert.equal(song.notes.length, 2);
  assert.deepEqual(song.notes.map((n) => n.midi), [60, 62]);
  assert.equal(song.notes[0].end, 0.5);
});

test('트랙 이름·박자표·조표를 읽는다', () => {
  const file = buildMidi({
    ticksPerBeat: 480,
    tracks: [
      [trackName(0, 'Song'), timeSignature(0, 3, 2), keySignature(0, -2), tempo(0, 500000)],
      [trackName(0, 'Right'), noteOn(0, 72), noteOff(480, 72)],
      [trackName(0, 'Left'), noteOn(0, 48), noteOff(480, 48)],
    ],
  });
  const song = parseMidiFile(file);

  assert.equal(song.name, 'Song');
  assert.deepEqual(song.timeSignature, { numerator: 3, denominator: 4 });
  assert.equal(song.keySignature, -2);

  assert.equal(song.tracks.length, 2); // 음표가 있는 트랙만 집계한다
  assert.equal(song.tracks[0].name, 'Right');
  assert.equal(song.tracks[0].averagePitch, 72);
  assert.equal(song.tracks[1].name, 'Left');
  assert.equal(song.tracks[1].averagePitch, 48);
});

test('여러 트랙의 음표가 시간순으로 합쳐진다', () => {
  const file = buildMidi({
    ticksPerBeat: 480,
    tracks: [
      [tempo(0, 500000)],
      [noteOn(480, 72), noteOff(480, 72)],
      [noteOn(0, 48), noteOff(240, 48)],
    ],
  });
  const song = parseMidiFile(file);
  assert.deepEqual(song.notes.map((n) => [n.midi, n.start]), [[48, 0], [72, 0.5]]);
});

test('짝이 없는 note on 도 버리지 않는다', () => {
  const file = buildMidi({ ticksPerBeat: 480, tracks: [[noteOn(0, 60), noteOn(480, 64), noteOff(480, 64)]] });
  const song = parseMidiFile(file);
  assert.equal(song.notes.length, 2);
  assert.ok(song.notes.find((n) => n.midi === 60).end > 0);
});

test('MIDI 가 아닌 파일은 알아볼 수 있는 오류를 낸다', () => {
  assert.throws(() => parseMidiFile(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), /MIDI 파일이 아닙니다/);
});

test('곡 제목은 첫 트랙 이름만 쓴다', () => {
  // 연주 트랙 이름(Right Hand)이 곡 제목으로 새어 나오면 안 된다.
  const file = buildMidi({
    ticksPerBeat: 480,
    tracks: [
      [tempo(0, 500000)],
      [trackName(0, 'Right Hand'), noteOn(0, 72), noteOff(480, 72)],
    ],
  });
  assert.equal(parseMidiFile(file).name, '');

  const titled = buildMidi({
    ticksPerBeat: 480,
    tracks: [
      [trackName(0, '소나타'), tempo(0, 500000)],
      [trackName(0, 'Right Hand'), noteOn(0, 72), noteOff(480, 72)],
    ],
  });
  assert.equal(parseMidiFile(titled).name, '소나타');
});
