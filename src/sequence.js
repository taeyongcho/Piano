// 음/화음을 순서대로 짚어 나가는 연습 진행기.
// 음계·핑거·화음 진행 연습이 모두 이걸 공유한다.

export class SequenceRunner {
  constructor({ onStep, onError, onComplete, onDone } = {}) {
    this.steps = [];
    this.index = 0;
    this.held = new Set();
    this.errors = 0;
    this.hits = 0;
    this.times = [];
    this.startedAt = null;
    this.finished = false;
    this.onStep = onStep;
    this.onError = onError;
    this.onComplete = onComplete; // 한 스텝을 맞혔을 때
    this.onDone = onDone; // 전체를 끝냈을 때
  }

  load(steps) {
    this.steps = steps;
    this.reset();
  }

  reset() {
    this.index = 0;
    this.errors = 0;
    this.hits = 0;
    this.times = [];
    this.startedAt = null;
    this.finished = this.steps.length === 0;
    this.held.clear();
    this.onStep?.(this.current, this.index);
  }

  get current() { return this.steps[this.index] ?? null; }
  get progress() { return this.steps.length ? this.index / this.steps.length : 0; }

  noteOn(midi, timeMs = performance.now()) {
    if (this.finished) return 'done';
    this.held.add(midi);
    const step = this.current;
    if (!step) return 'done';

    const target = new Set(step.notes);
    if (!target.has(midi)) {
      this.errors++;
      this.onError?.({ midi, expected: step.notes });
      return 'wrong';
    }

    const allHeld = [...target].every((n) => this.held.has(n));
    if (!allHeld) return 'partial';

    if (this.startedAt === null) this.startedAt = timeMs;
    this.times.push(timeMs);
    this.hits++;
    this.index++;
    this.onComplete?.({ step, index: this.index - 1, time: timeMs });

    if (this.index >= this.steps.length) {
      this.finished = true;
      this.onDone?.(this.summary());
    } else {
      this.onStep?.(this.current, this.index);
    }
    return 'correct';
  }

  noteOff(midi) { this.held.delete(midi); }

  /** 스텝 간 간격의 고르기(표준편차)까지 포함한 결과 요약. */
  summary() {
    const gaps = this.times.slice(1).map((t, i) => t - this.times[i]);
    const avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    const variance = gaps.length ? gaps.reduce((a, b) => a + (b - avg) ** 2, 0) / gaps.length : 0;
    const elapsed = this.times.length > 1 ? this.times.at(-1) - this.times[0] : 0;
    return {
      total: this.steps.length,
      hits: this.hits,
      errors: this.errors,
      elapsedMs: elapsed,
      avgGapMs: avg,
      jitterMs: Math.sqrt(variance),
      accuracy: this.hits + this.errors ? this.hits / (this.hits + this.errors) : 0,
      // 고른 간격으로 쳤다면 이 값이 실제 템포에 가깝다.
      bpm: avg ? Math.round(60000 / avg) : 0,
    };
  }
}
