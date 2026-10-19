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

/**
 * Keeps keyboard focus where it is when this element is pressed (used for helper buttons
 * inside the answer screen, so tapping a word or a speak button does not drop the answer input).
 * The click event still fires normally.
 */
export function keepFocus(el) {
  el.addEventListener('mousedown', (event) => event.preventDefault());
  el.addEventListener('click', () => {
    // Some browsers still move focus on click, so put it back on the answer input if it is open.
    setTimeout(() => {
      const input = document.querySelector('.answer-input:not([disabled])');
      if (input && document.activeElement !== input) input.focus({ preventScroll: true });
    }, 0);
  });
  return el;
}

// Numbers are shown with Latin digits: the interface is English and left-to-right.
export const fa = (n) => Number(n ?? 0).toLocaleString('en-US');

export const percent = (ratio) => (ratio == null ? '—' : `${fa(Math.round(ratio * 100))}%`);

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

/**
 * In-app confirmation card, shown over the page (not a browser dialog).
 * Resolves true when the confirm button is chosen, and false for cancel, Escape or a tap outside the card.
 */
export function confirmDialog({ title, message, confirmText = 'OK', cancelText = 'Cancel' }) {
  return new Promise((resolve) => {
    let overlay = null;
    const finish = (value) => {
      document.removeEventListener('keydown', onKey);
      overlay?.remove();
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') finish(false);
    };
    overlay = h(
      'div',
      { class: 'dialog-overlay', onclick: (event) => event.target === overlay && finish(false) },
      h(
        'div',
        { class: 'dialog-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title' },
        h('h3', { id: 'dialog-title', class: 'dialog-title' }, title),
        h('p', { class: 'dialog-message' }, message),
        h(
          'div',
          { class: 'dialog-actions' },
          h('button', { type: 'button', class: 'btn ghost', onclick: () => finish(false) }, cancelText),
          h('button', { type: 'button', class: 'btn primary', onclick: () => finish(true) }, confirmText),
        ),
      ),
    );
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    // The safe choice is focused: pressing Enter right away keeps the game.
    overlay.querySelector('.dialog-actions .btn.ghost')?.focus();
  });
}
