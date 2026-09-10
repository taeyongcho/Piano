// 연습 기록 — 브라우저에만 저장되는 간단한 통계.

import { h, panel, button } from '../ui.js';
import { formatDuration } from '../stats.js';

const MODE_NAMES = {
  freeplay: '자유 연주', sightread: '악보 읽기', scales: '음계',
  chords: '화음', fingers: '핑거 연습', ear: '청음', record: '기록',
};

export default {
  id: 'record',
  title: '기록',
  icon: '📈',
  hint: '연습 시간과 정확도는 이 브라우저에만 저장됩니다.',

  mount(root, ctx) {
    const chartEl = h('div', { class: 'chart' });
    const summaryEl = h('div', { class: 'stats-row' });
    const breakdownEl = h('div', { class: 'breakdown' });

    function render() {
      ctx.stats.tick();
      const days = ctx.stats.lastDays(30);
      const total = ctx.stats.total();
      const today = days.at(-1);
      const maxSeconds = Math.max(60, ...days.map((d) => d.seconds));

      summaryEl.replaceChildren(
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, `${ctx.stats.streak()}일`), h('div', { class: 'stat-label' }, '연속 연습')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, formatDuration(today.seconds)), h('div', { class: 'stat-label' }, '오늘 연습')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, formatDuration(total.seconds)), h('div', { class: 'stat-label' }, '누적 연습')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, total.attempts ? `${Math.round((total.correct / total.attempts) * 100)}%` : '—'), h('div', { class: 'stat-label' }, '누적 정확도')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, String(total.attempts)), h('div', { class: 'stat-label' }, '푼 문제 수')),
      );

      chartEl.replaceChildren(...days.map((d) => {
        const height = Math.round((d.seconds / maxSeconds) * 100);
        return h('div', {
          class: `bar${d.seconds ? '' : ' is-empty'}`,
          title: `${d.day} · ${formatDuration(d.seconds)}`,
        }, h('div', { class: 'bar-fill', style: { height: `${Math.max(height, d.seconds ? 4 : 1)}%` } }));
      }));

      const perMode = {};
      for (const d of days) for (const [mode, sec] of Object.entries(d.modes || {})) perMode[mode] = (perMode[mode] || 0) + sec;
      const entries = Object.entries(perMode).sort((a, b) => b[1] - a[1]);
      const modeMax = Math.max(1, ...entries.map(([, v]) => v));
      breakdownEl.replaceChildren(
        ...(entries.length ? entries : [['—', 0]]).map(([mode, sec]) => h('div', { class: 'breakdown-row' },
          h('span', { class: 'breakdown-name' }, MODE_NAMES[mode] || mode),
          h('span', { class: 'breakdown-bar' }, h('span', { class: 'breakdown-fill', style: { width: `${(sec / modeMax) * 100}%` } })),
          h('span', { class: 'breakdown-value' }, formatDuration(sec)),
        )),
      );
    }

    root.append(
      panel('한눈에 보기', summaryEl),
      panel('최근 30일',
        chartEl,
        h('div', { class: 'chart-caption' }, '막대 높이는 그날 연습한 시간입니다.'),
      ),
      panel('모드별 연습 시간', breakdownEl),
      panel('관리',
        h('div', { class: 'row gap' },
          button('새로고침', render),
          button('기록 모두 지우기', () => {
            if (confirm('연습 기록을 모두 지울까요? 되돌릴 수 없습니다.')) {
              ctx.stats.reset();
              render();
            }
          }, { variant: 'danger' }),
        ),
        h('p', { class: 'note' }, '기록은 서버로 전송되지 않고 이 브라우저의 저장소에만 남습니다.'),
      ),
    );

    render();
    const timer = setInterval(render, 20000);
    return () => clearInterval(timer);
  },
};
