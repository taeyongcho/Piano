// 왼손/오른손 나누기.
// 피아노 MIDI 는 대개 트랙이나 채널로 손이 나뉘어 있고, 한 덩어리로 된 파일은 음높이로 가른다.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 음높이 목록을 두 덩어리로 가르는 경계를 1차원 k-means(k=2)로 찾는다. */
export function findSplitPoint(pitches, fallback = 60) {
  if (pitches.length < 2) return fallback;
  const low = Math.min(...pitches);
  const high = Math.max(...pitches);
  // 음역이 한 옥타브도 안 되면 두 손으로 나눌 이유가 없다.
  if (high - low < 12) return low >= 60 ? low - 1 : high + 1;

  let centroidLow = low;
  let centroidHigh = high;
  for (let step = 0; step < 24; step++) {
    let sumLow = 0; let countLow = 0; let sumHigh = 0; let countHigh = 0;
    for (const p of pitches) {
      if (Math.abs(p - centroidLow) <= Math.abs(p - centroidHigh)) { sumLow += p; countLow++; }
      else { sumHigh += p; countHigh++; }
    }
    if (!countLow || !countHigh) break;
    const nextLow = sumLow / countLow;
    const nextHigh = sumHigh / countHigh;
    if (nextLow === centroidLow && nextHigh === centroidHigh) break;
    centroidLow = nextLow;
    centroidHigh = nextHigh;
  }
  // 경계가 건반 한가운데에서 너무 멀어지면 오히려 손이 꼬이므로 가운데 도 근처로 묶어 둔다.
  return clamp(Math.round((centroidLow + centroidHigh) / 2), 52, 67);
}

/**
 * 곡의 음표마다 hand('right' | 'left') 를 붙인다. 원본 음표 객체를 그대로 수정하지 않고 새 배열을 준다.
 * @param {object} song parseMidiFile 결과
 * @param {object} opts
 *  - strategy: 'auto' | 'track' | 'channel' | 'pitch'
 *  - leftTracks / leftChannels: 왼손으로 지정할 트랙·채널 번호 배열 (strategy 를 덮어쓴다)
 *  - splitPoint: 'pitch' 일 때 이 음 미만이 왼손
 */
export function assignHands(song, opts = {}) {
  const notes = song.notes;
  if (!notes.length) return { notes: [], strategy: 'none', splitPoint: opts.splitPoint ?? 60, label: '음표가 없습니다' };

  const explicitLeftTracks = opts.leftTracks && new Set(opts.leftTracks);
  const explicitLeftChannels = opts.leftChannels && new Set(opts.leftChannels);

  let strategy = opts.strategy ?? 'auto';
  let splitPoint = opts.splitPoint ?? 60;
  let leftTracks = null;
  let leftChannels = null;
  let label = '';

  if (explicitLeftTracks) {
    strategy = 'track';
    leftTracks = explicitLeftTracks;
    label = '직접 고른 트랙 기준';
  } else if (explicitLeftChannels) {
    strategy = 'channel';
    leftChannels = explicitLeftChannels;
    label = '직접 고른 채널 기준';
  } else if (strategy === 'auto' || strategy === 'track' || strategy === 'channel') {
    const tracks = song.tracks.filter((t) => t.noteCount > 0);
    const channels = [...new Set(notes.map((n) => n.channel))];

    if (tracks.length >= 2) {
      // 평균 음높이가 높은 트랙을 오른손으로 본다. 셋 이상이면 전체 평균을 기준으로 가른다.
      const sorted = [...tracks].sort((a, b) => b.averagePitch - a.averagePitch);
      const pivot = tracks.length === 2
        ? (sorted[0].averagePitch + sorted[1].averagePitch) / 2
        : sorted.reduce((sum, t) => sum + t.averagePitch, 0) / sorted.length;
      leftTracks = new Set(tracks.filter((t) => t.averagePitch < pivot).map((t) => t.index));
      // 한쪽이 비면 가장 낮은 트랙만 왼손으로 돌린다.
      if (!leftTracks.size) leftTracks = new Set([sorted[sorted.length - 1].index]);
      strategy = 'track';
      label = `트랙 ${tracks.length}개 기준`;
    } else if (channels.length >= 2) {
      const byChannel = channels.map((ch) => {
        const list = notes.filter((n) => n.channel === ch);
        return { ch, avg: list.reduce((s, n) => s + n.midi, 0) / list.length };
      }).sort((a, b) => b.avg - a.avg);
      leftChannels = new Set(byChannel.slice(1).map((c) => c.ch));
      strategy = 'channel';
      label = `채널 ${channels.length}개 기준`;
    } else {
      strategy = 'pitch';
    }
  }

  if (strategy === 'pitch') {
    if (opts.splitPoint === undefined) splitPoint = findSplitPoint(notes.map((n) => n.midi));
    label = `음높이 기준 (경계 ${splitPoint})`;
  }

  const assigned = notes.map((note) => {
    let hand;
    if (leftTracks) hand = leftTracks.has(note.track) ? 'left' : 'right';
    else if (leftChannels) hand = leftChannels.has(note.channel) ? 'left' : 'right';
    else hand = note.midi < splitPoint ? 'left' : 'right';
    return { ...note, hand };
  });

  return { notes: assigned, strategy, splitPoint, label };
}

/** 같은 시각에 시작하는 음표들을 한 덩어리(화음)로 묶는다. */
export function groupIntoEvents(notes, tolerance = 0.03) {
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi);
  const events = [];
  for (const note of sorted) {
    const last = events[events.length - 1];
    if (last && note.start - last.start <= tolerance) {
      last.notes.push(note);
      last.end = Math.max(last.end, note.end);
    } else {
      events.push({ start: note.start, end: note.end, notes: [note] });
    }
  }
  return events;
}
