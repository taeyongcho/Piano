// 테스트용 최소 SMF 작성기. 파서를 왕복 검증하는 데만 쓴다.

export function vlq(value) {
  const out = [value & 0x7f];
  let v = value >> 7;
  while (v > 0) {
    out.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return out;
}

const u16 = (v) => [(v >> 8) & 0xff, v & 0xff];
const u32 = (v) => [(v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const utf8 = (s) => [...new TextEncoder().encode(s)];

/** 이벤트는 [deltaTicks, ...바이트] 배열. endOfTrack 은 자동으로 붙는다. */
export function buildTrack(events) {
  const body = events.flatMap(([delta, ...bytes]) => [...vlq(delta), ...bytes]);
  body.push(...vlq(0), 0xff, 0x2f, 0x00);
  return [...ascii('MTrk'), ...u32(body.length), ...body];
}

export function buildMidi({ format = 1, ticksPerBeat = 480, tracks = [] }) {
  const header = [...ascii('MThd'), ...u32(6), ...u16(format), ...u16(tracks.length), ...u16(ticksPerBeat)];
  return new Uint8Array([...header, ...tracks.flatMap((events) => buildTrack(events))]);
}

export const noteOn = (delta, midi, velocity = 80, channel = 0) => [delta, 0x90 | channel, midi, velocity];
export const noteOff = (delta, midi, channel = 0) => [delta, 0x80 | channel, midi, 0];
export const tempo = (delta, usPerBeat) => [delta, 0xff, 0x51, 0x03, (usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff];
export const trackName = (delta, name) => {
  const bytes = utf8(name);   // 한글처럼 여러 바이트인 글자도 길이를 바이트로 적어야 한다
  return [delta, 0xff, 0x03, bytes.length, ...bytes];
};
export const timeSignature = (delta, numerator, denominatorPow2) => [delta, 0xff, 0x58, 0x04, numerator, denominatorPow2, 24, 8];
export const keySignature = (delta, sig, minor = 0) => [delta, 0xff, 0x59, 0x02, sig & 0xff, minor];
