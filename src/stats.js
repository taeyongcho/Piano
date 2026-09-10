// 연습 기록. 서버 없이 localStorage 에만 저장한다.

const KEY = 'piano.practice.v1';
const todayKey = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { days: raw.days || {}, ...raw };
  } catch {
    return { days: {} };
  }
}

function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* 저장 실패는 조용히 무시 */ }
}

export class Stats {
  constructor() {
    this.data = load();
    this.sessionStart = Date.now();
    this.currentMode = null;
    this.flushTimer = setInterval(() => this.tick(), 15000);
    window.addEventListener('beforeunload', () => this.tick());
  }

  entryFor(day = todayKey()) {
    if (!this.data.days[day]) this.data.days[day] = { seconds: 0, attempts: 0, correct: 0, modes: {} };
    return this.data.days[day];
  }

  setMode(mode) {
    this.tick();
    this.currentMode = mode;
  }

  /** 마지막 호출 이후 흐른 시간을 연습 시간으로 적립한다. */
  tick() {
    const now = Date.now();
    const seconds = Math.round((now - this.sessionStart) / 1000);
    this.sessionStart = now;
    if (seconds <= 0 || seconds > 300) return; // 탭을 오래 방치한 경우는 제외
    const entry = this.entryFor();
    entry.seconds += seconds;
    if (this.currentMode) {
      entry.modes[this.currentMode] = (entry.modes[this.currentMode] || 0) + seconds;
    }
    save(this.data);
  }

  record({ correct = 0, attempts = 0, mode = this.currentMode } = {}) {
    const entry = this.entryFor();
    entry.attempts += attempts;
    entry.correct += correct;
    if (mode) {
      entry.modes[mode] = entry.modes[mode] || 0;
    }
    save(this.data);
  }

  /** 오늘부터 거꾸로 세는 연속 연습 일수. */
  streak() {
    let count = 0;
    const d = new Date();
    for (;;) {
      const entry = this.data.days[todayKey(d)];
      if (!entry || entry.seconds < 60) break;
      count++;
      d.setDate(d.getDate() - 1);
    }
    return count;
  }

  lastDays(n = 30) {
    const out = [];
    const d = new Date();
    d.setDate(d.getDate() - (n - 1));
    for (let i = 0; i < n; i++) {
      const key = todayKey(d);
      out.push({ day: key, ...(this.data.days[key] || { seconds: 0, attempts: 0, correct: 0, modes: {} }) });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  total() {
    return Object.values(this.data.days).reduce(
      (acc, e) => ({ seconds: acc.seconds + e.seconds, attempts: acc.attempts + e.attempts, correct: acc.correct + e.correct }),
      { seconds: 0, attempts: 0, correct: 0 },
    );
  }

  reset() {
    this.data = { days: {} };
    save(this.data);
  }
}

export const formatDuration = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h) return `${h}시간 ${m}분`;
  if (m) return `${m}분`;
  return `${seconds}초`;
};
