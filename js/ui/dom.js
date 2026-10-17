// Small DOM helpers (no framework).

// Keys that must be set as DOM properties (their attribute form does not reflect the live state).
const PROPERTY_KEYS = new Set(['value', 'checked', 'selected', 'disabled', 'hidden', 'readOnly', 'spellcheck']);

/**
 * h('button', { class: 'btn', onclick: fn }, 'text')
 * - `on*` functions become event listeners; `class` sets className; `dataset` sets data-* values.
 * - Keys in PROPERTY_KEYS are set as properties; other keys become attributes.
 * - false/null/undefined boolean-style attributes are omitted; true becomes a bare attribute.
 * - null/undefined/false children are skipped.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (PROPERTY_KEYS.has(key)) el[key] = value;
    else if (typeof value === 'boolean') {
      if (value) el.setAttribute(key, '');
    } else el.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const fa = (n) => Number(n ?? 0).toLocaleString('fa-IR');

export const percent = (ratio) => (ratio == null ? '—' : `${fa(Math.round(ratio * 100))}٪`);

export const ltr = (text) => h('bdi', { class: 'ltr', dir: 'ltr' }, text);

export function badge(text, kind = '') {
  return h('span', { class: `badge ${kind}`.trim() }, text);
}

export function toast(message, kind = 'info') {
  let host = document.getElementById('toasts');
  if (!host) {
    host = h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const el = h('div', { class: `toast ${kind}` }, message);
  host.append(el);
  setTimeout(() => el.remove(), 3200);
}

export function download(filename, content, mime) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** rows: array of arrays of cell contents (text or DOM nodes). */
export function table(headers, rows) {
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, headers.map((text) => h('th', {}, text)))),
      h('tbody', {}, rows.map((cells) => h('tr', {}, cells.map((cell) => h('td', {}, cell))))),
    ),
  );
}

export function stat(label, value) {
  return h('div', { class: 'stat' }, h('strong', {}, value), h('span', {}, label));
}
