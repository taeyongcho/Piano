// 아주 작은 DOM 헬퍼들. 프레임워크 없이 모드 화면을 조립하는 데만 쓴다.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (value !== null && value !== undefined && value !== false) el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const panel = (title, ...children) =>
  h('section', { class: 'panel' }, title ? h('h2', { class: 'panel-title' }, title) : null, ...children);

export function field(label, control) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control);
}

export function select(options, value, onChange) {
  const el = h('select', { class: 'input', onChange: (e) => onChange(e.target.value) });
  for (const opt of options) {
    const o = h('option', { value: opt.value }, opt.label);
    if (String(opt.value) === String(value)) o.selected = true;
    el.append(o);
  }
  return el;
}

export function numberInput(value, { min, max, step = 1, onChange }) {
  return h('input', {
    class: 'input', type: 'number', value, min, max, step,
    onInput: (e) => onChange(Number(e.target.value)),
  });
}

export function toggle(label, checked, onChange) {
  const input = h('input', { type: 'checkbox', onChange: (e) => onChange(e.target.checked) });
  input.checked = checked;
  return h('label', { class: 'toggle' }, input, h('span', {}, label));
}

export const button = (label, onClick, { variant = '', ...rest } = {}) =>
  h('button', { class: `btn ${variant}`.trim(), type: 'button', onClick, ...rest }, label);

export const stat = (label, value, id) =>
  h('div', { class: 'stat' }, h('div', { class: 'stat-value', id }, value), h('div', { class: 'stat-label' }, label));

/** 결과 메시지를 잠깐 띄우는 영역. */
export function flashArea() {
  const el = h('div', { class: 'flash' });
  let timer;
  el.show = (text, kind = 'ok', ms = 1400) => {
    el.textContent = text;
    el.className = `flash flash-${kind} is-visible`;
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('is-visible'), ms);
  };
  return el;
}

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
export const shuffle = (arr) => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
