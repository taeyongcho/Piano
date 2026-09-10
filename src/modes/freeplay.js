// 자유 연주 — 지금 누른 음과 화음 이름을 실시간으로 보여준다.

import { h, panel, stat, toggle } from '../ui.js';
import { detectChord, noteLabel, pretty } from '../theory.js';
import { renderStaff } from '../staff.js';

export default {
  id: 'freeplay',
  title: '자유 연주',
  icon: '🎹',
  hint: '아무 음이나 눌러보세요. 누른 음과 화음 이름이 바로 나타납니다.',

  mount(root, ctx) {
    const chordEl = h('div', { class: 'huge' }, '—');
    const chordName = h('div', { class: 'sub' }, '건반을 눌러보세요');
    const notesEl = h('div', { class: 'note-chips' });
    const staffEl = h('div', { class: 'staff-wrap' });
    const pedalEl = h('span', { class: 'pill' }, '페달 ―');
    const countEl = h('span', { class: 'stat-value' }, '0');
    const polyEl = h('span', { class: 'stat-value' }, '0');

    let played = 0;
    let maxPoly = 0;
    let showStaff = true;

    const held = () => [...ctx.input.held].sort((a, b) => a - b);

    function refresh() {
      const notes = held();
      maxPoly = Math.max(maxPoly, notes.length);
      polyEl.textContent = String(maxPoly);
      countEl.textContent = String(played);

      notesEl.replaceChildren(
        ...notes.map((m) => h('span', { class: 'chip' }, noteLabel(m, { style: ctx.settings.labelStyle === 'off' ? 'en' : ctx.settings.labelStyle, sig: ctx.settings.keySig, withOctave: true }))),
      );

      const detected = detectChord(notes, { sig: ctx.settings.keySig });
      if (!detected) {
        chordEl.textContent = notes.length === 1
          ? noteLabel(notes[0], { style: 'en', sig: ctx.settings.keySig, withOctave: true })
          : '—';
        chordName.textContent = notes.length === 1 ? '단음' : '건반을 눌러보세요';
      } else if (detected.kind === 'interval') {
        chordEl.textContent = detected.text;
        chordName.textContent = `${notes.length}음 · 음정`;
      } else {
        chordEl.textContent = pretty(detected.text);
        chordName.textContent = detected.kind === 'chord'
          ? `${detected.name}${detected.inverted ? ' · 자리바꿈' : ''}`
          : '알 수 없는 화음';
      }

      if (showStaff) {
        renderStaff(staffEl, {
          clef: 'grand',
          sig: ctx.settings.keySig,
          groups: notes.length ? [{ notes, state: 'ok' }] : [],
        });
      }
    }

    ctx.on('noteon', () => { played++; refresh(); });
    ctx.on('noteoff', refresh);
    ctx.on('pedal', (down) => {
      pedalEl.textContent = down ? '페달 ●' : '페달 ―';
      pedalEl.classList.toggle('is-on', down);
    });

    root.append(
      panel(null,
        h('div', { class: 'readout' }, chordEl, chordName, notesEl),
        h('div', { class: 'row gap' },
          pedalEl,
          toggle('오선보 보기', showStaff, (v) => { showStaff = v; staffEl.style.display = v ? '' : 'none'; refresh(); }),
        ),
        staffEl,
      ),
      panel('이번 세션',
        h('div', { class: 'stats-row' },
          h('div', { class: 'stat' }, countEl, h('div', { class: 'stat-label' }, '친 음 수')),
          h('div', { class: 'stat' }, polyEl, h('div', { class: 'stat-label' }, '최대 동시 음')),
        ),
      ),
    );

    refresh();
  },
};
