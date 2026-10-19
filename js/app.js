// App entry point: loads the course content (content/index.json), routes between screens, registers the service worker.

import { syncContent } from './bank/repository.js';
import { renderPlay } from './ui/play.js';
import { renderReports } from './ui/reports.js';
import { renderAdmin } from './ui/admin.js';
import { h, toast, fa } from './ui/dom.js';

const views = {
  play: renderPlay,
  reports: renderReports,
  admin: renderAdmin,
};

const root = document.getElementById('app');
let cleanup = null;
let routeToken = 0;

async function route() {
  const token = ++routeToken;
  cleanup?.();
  cleanup = null;

  const [name = 'play', ...rest] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const viewName = views[name] ? name : 'play';

  document.querySelectorAll('[data-nav]').forEach((link) => {
    link.classList.toggle('active', link.dataset.nav === viewName);
  });

  try {
    const result = await views[viewName](root, rest);
    if (token !== routeToken) {
      if (typeof result === 'function') result();
      return;
    }
    cleanup = typeof result === 'function' ? result : null;
  } catch (error) {
    console.error(error);
    root.replaceChildren(
      h('div', { class: 'card error-box' }, h('strong', {}, 'Error displaying this page.'), h('p', {}, error.message)),
    );
  }
}

async function boot() {
  root.replaceChildren(h('p', { class: 'loading' }, 'Preparing lessons…'));

  try {
    const { loaded, errors } = await syncContent();
    if (loaded.length) {
      const total = loaded.reduce((sum, lesson) => sum + lesson.count, 0);
      toast(`${fa(total)} questions loaded from new lessons.`);
    }
    errors.forEach((e) => toast(`Lesson ${e.lesson}: ${e.message}`, 'error'));
  } catch (error) {
    console.error(error);
    toast(`Failed to load lesson content: ${error.message}`, 'error');
  }

  window.addEventListener('hashchange', route);
  await route();

  // Ask the browser to keep stored progress (best effort; ignored where unsupported).
  navigator.storage?.persist?.()?.catch?.(() => {});
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker:', error));
  }
}

boot();
