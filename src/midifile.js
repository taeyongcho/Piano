// 표준 MIDI 파일(SMF) 파서. format 0 · 1 · 2 를 읽고, 음표를 초 단위 시각으로 바꿔 준다.
// 외부 라이브러리를 쓰지 않으므로 ArrayBuffer 를 직접 훑는다.

class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.pos = 0;
  }

  get done() { return this.pos >= this.bytes.length; }

  u8() {
    if (this.pos >= this.bytes.length) throw new Error('파일이 도중에 끊겼습니다.');
    return this.bytes[this.pos++];
  }

  u16() { return (this.u8() << 8) | this.u8(); }

  u32() { return ((this.u8() << 24) >>> 0) + (this.u8() << 16) + (this.u8() << 8) + this.u8(); }

  bytesN(n) {
    if (this.pos + n > this.bytes.length) throw new Error('파일이 도중에 끊겼습니다.');
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  text(n) {
    return new TextDecoder('utf-8', { fatal: false }).decode(this.bytesN(n)).replace(/\0+$/, '').trim();
  }

  /** 가변 길이 수치(VLQ) — 각 바이트의 하위 7비트만 값, 최상위 비트는 "더 있음" 표시. */
  vlq() {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const byte = this.u8();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error('잘못된 가변 길이 값입니다.');
  }
}

const chunkId = (reader) => String.fromCharCode(...reader.bytesN(4));

function parseTrack(reader, length, trackIndex) {
  const end = reader.pos + length;
  const events = [];
  let tick = 0;
  let runningStatus = 0;

  while (reader.pos < end) {
    tick += reader.vlq();
    let status = reader.u8();
    if (status < 0x80) {
      // 러닝 스테이터스: 상태 바이트가 생략되면 직전 것을 이어 쓴다.
      if (!runningStatus) throw new Error('상태 바이트 없이 시작하는 이벤트입니다.');
      reader.pos--;
      status = runningStatus;
    } else if (status < 0xf0) {
      runningStatus = status;
    }

    if (status === 0xff) {
      const type = reader.u8();
      const len = reader.vlq();
      const start = reader.pos;
      if (type === 0x51) {
        const data = reader.bytesN(3);
        events.push({ tick, kind: 'tempo', usPerBeat: (data[0] << 16) | (data[1] << 8) | data[2] });
      } else if (type === 0x58) {
        const data = reader.bytesN(len);
        events.push({ tick, kind: 'timeSignature', numerator: data[0], denominator: 2 ** data[1] });
      } else if (type === 0x59) {
        const data = reader.bytesN(len);
        // sf 는 -7..7 의 부호 있는 값, mi 는 0=장조 1=단조
        events.push({ tick, kind: 'keySignature', sig: (data[0] << 24) >> 24, minor: data[1] === 1 });
      } else if (type === 0x03 || type === 0x01) {
        events.push({ tick, kind: type === 0x03 ? 'trackName' : 'text', text: reader.text(len) });
      } else if (type === 0x2f) {
        reader.pos = start + len;
        break;
      } else {
        reader.pos = start + len;
      }
      reader.pos = Math.max(reader.pos, start + len);
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      reader.bytesN(reader.vlq());
      continue;
    }

    const type = status & 0xf0;
    const channel = status & 0x0f;
    if (type === 0xc0 || type === 0xd0) {
      const value = reader.u8();
      if (type === 0xc0) events.push({ tick, kind: 'program', channel, program: value, track: trackIndex });
      continue;
    }

    const d1 = reader.u8();
    const d2 = reader.u8();
    if (type === 0x90 && d2 > 0) {
      events.push({ tick, kind: 'noteOn', channel, midi: d1, velocity: d2, track: trackIndex });
    } else if (type === 0x80 || (type === 0x90 && d2 === 0)) {
      events.push({ tick, kind: 'noteOff', channel, midi: d1, track: trackIndex });
    } else if (type === 0xb0 && d1 === 64) {
      events.push({ tick, kind: 'sustain', channel, down: d2 >= 64, track: trackIndex });
    }
  }

  reader.pos = end;
  return events;
}

/** 템포 변화 목록으로 "틱 → 초" 변환기를 만든다. */
function buildTimeMap(tempoEvents, ticksPerBeat, smpteSecondsPerTick) {
  if (smpteSecondsPerTick) {
    const toSeconds = (tick) => tick * smpteSecondsPerTick;
    return { toSeconds, tempos: [{ tick: 0, usPerBeat: 500000, time: 0, bpm: 120 }] };
  }

  const changes = [{ tick: 0, usPerBeat: 500000 }];
  for (const e of tempoEvents) {
    if (e.tick === 0) changes[0].usPerBeat = e.usPerBeat;
    else changes.push({ tick: e.tick, usPerBeat: e.usPerBeat });
  }
  changes.sort((a, b) => a.tick - b.tick);

  // 각 구간의 시작 시각을 미리 누적해 두면 변환이 O(구간 수)로 끝난다.
  let time = 0;
  const segments = changes.map((change, i) => {
    if (i > 0) {
      const prev = changes[i - 1];
      time += ((change.tick - prev.tick) / ticksPerBeat) * (prev.usPerBeat / 1e6);
    }
    return { ...change, time, bpm: Math.round(6e7 / change.usPerBeat) };
  });

  const toSeconds = (tick) => {
    let seg = segments[0];
    for (const s of segments) {
      if (s.tick <= tick) seg = s;
      else break;
    }
    return seg.time + ((tick - seg.tick) / ticksPerBeat) * (seg.usPerBeat / 1e6);
  };

  return { toSeconds, tempos: segments };
}

/**
 * MIDI 파일을 파싱한다.
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {{name:string, format:number, ticksPerBeat:number, duration:number,
 *            notes:Array, tracks:Array, tempos:Array, timeSignature:object, keySignature:number}}
 */
export function parseMidiFile(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const reader = new Reader(bytes);

  if (chunkId(reader) !== 'MThd') throw new Error('MIDI 파일이 아닙니다. (MThd 머리말을 찾을 수 없습니다)');
  const headerLength = reader.u32();
  const format = reader.u16();
  const trackCount = reader.u16();
  const division = reader.u16();
  reader.pos += Math.max(0, headerLength - 6);

  let ticksPerBeat = division;
  let smpteSecondsPerTick = 0;
  if (division & 0x8000) {
    // SMPTE 방식: 상위 바이트는 초당 프레임 수를 음수로 담고(-24 는 0xE8),
    // 하위 바이트가 프레임당 틱 수다.
    const framesPerSecond = 256 - ((division >> 8) & 0xff);
    const ticksPerFrame = division & 0xff;
    smpteSecondsPerTick = 1 / (framesPerSecond * ticksPerFrame);
    ticksPerBeat = framesPerSecond * ticksPerFrame;
  }

  const allEvents = [];
  const trackNames = [];
  for (let i = 0; i < trackCount && !reader.done; i++) {
    const id = chunkId(reader);
    const length = reader.u32();
    if (id !== 'MTrk') { reader.pos += length; continue; }
    const events = parseTrack(reader, length, i);
    trackNames[i] = events.find((e) => e.kind === 'trackName')?.text || '';
    allEvents.push(...events);
  }

  const { toSeconds, tempos } = buildTimeMap(
    allEvents.filter((e) => e.kind === 'tempo'),
    ticksPerBeat,
    smpteSecondsPerTick,
  );

  // 같은 (트랙, 채널, 음높이) 의 note on 을 쌓아 두었다가 note off 와 짝지운다.
  const pending = new Map();
  const key = (e) => `${e.track}:${e.channel}:${e.midi}`;
  const notes = [];
  const ordered = allEvents
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.tick - b.e.tick || a.i - b.i)
    .map((x) => x.e);

  for (const event of ordered) {
    if (event.kind === 'noteOn') {
      if (!pending.has(key(event))) pending.set(key(event), []);
      pending.get(key(event)).push(event);
    } else if (event.kind === 'noteOff') {
      const stack = pending.get(key(event));
      const started = stack?.shift();
      if (!started) continue;
      notes.push({
        midi: started.midi,
        velocity: started.velocity,
        track: started.track,
        channel: started.channel,
        startTick: started.tick,
        endTick: event.tick,
      });
    }
  }
  // 짝이 없는 note on 은 마지막 틱까지 눌린 것으로 본다.
  const lastTick = ordered.length ? ordered[ordered.length - 1].tick : 0;
  for (const stack of pending.values()) {
    for (const started of stack) {
      notes.push({
        midi: started.midi,
        velocity: started.velocity,
        track: started.track,
        channel: started.channel,
        startTick: started.tick,
        endTick: Math.max(lastTick, started.tick + ticksPerBeat),
      });
    }
  }

  for (const note of notes) {
    note.start = toSeconds(note.startTick);
    note.end = toSeconds(note.endTick);
    note.duration = Math.max(note.end - note.start, 0.02);
  }
  notes.sort((a, b) => a.start - b.start || a.midi - b.midi);

  const tracks = [];
  for (const note of notes) {
    let track = tracks.find((t) => t.index === note.track);
    if (!track) {
      track = { index: note.track, name: trackNames[note.track] || '', noteCount: 0, channels: new Set(), pitchSum: 0, low: 127, high: 0 };
      tracks.push(track);
    }
    track.noteCount++;
    track.channels.add(note.channel);
    track.pitchSum += note.midi;
    track.low = Math.min(track.low, note.midi);
    track.high = Math.max(track.high, note.midi);
  }
  for (const track of tracks) {
    track.averagePitch = track.noteCount ? track.pitchSum / track.noteCount : 0;
    track.channels = [...track.channels];
  }
  tracks.sort((a, b) => a.index - b.index);

  const timeSigEvent = allEvents.find((e) => e.kind === 'timeSignature');
  const keySigEvent = allEvents.find((e) => e.kind === 'keySignature');

  return {
    // 곡 제목은 관례상 첫 트랙(지휘 트랙)에 들어간다. 연주 트랙 이름을 곡 제목으로 쓰면 엉뚱해진다.
    name: trackNames[0] || '',
    format,
    ticksPerBeat,
    notes,
    tracks,
    tempos,
    duration: notes.reduce((max, n) => Math.max(max, n.end), 0),
    timeSignature: timeSigEvent
      ? { numerator: timeSigEvent.numerator, denominator: timeSigEvent.denominator }
      : { numerator: 4, denominator: 4 },
    keySignature: keySigEvent ? keySigEvent.sig : 0,
    bpm: tempos[0]?.bpm ?? 120,
  };
}
