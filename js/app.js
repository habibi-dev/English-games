// App entry point: loads the course content (content/index.json), routes between screens, registers the service worker.

import { syncContent } from './bank/repository.js';
import { renderPlay, isGameInProgress, setTabMode, startFromNav, confirmLeaveGame, endGame } from './ui/play.js';
import { renderReports } from './ui/reports.js';
import { renderAdmin } from './ui/admin.js';
import { h, toast, fa } from './ui/dom.js';
import { unlockSounds } from './ui/sounds.js';
import { endMission } from './progress/activity.js';

// Browsers only allow sound after a tap: the first tap anywhere prepares the sound effects.
document.addEventListener('pointerdown', unlockSounds, { once: true });

// Closing or reloading the page ends a running mission, so its time up to now is kept.
window.addEventListener('pagehide', () => endMission());

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
  // The setup screens switch the bar to its Play mode themselves (see setTabMode in play.js).
  setTabMode('home');

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

// Bottom Play tab. On the Difficulty step it reads "Play" and starts the mission (see setTabMode in play.js).
// Everywhere else it reads "Home" and goes to the first screen; during a mission it asks first.
document.querySelectorAll('[data-nav="play"]').forEach((link) => {
  link.addEventListener('click', async (event) => {
    event.preventDefault();
    if (startFromNav()) return;
    if (isGameInProgress()) {
      if (await confirmLeaveGame()) endGame();
      return;
    }
    if (location.hash === '#/play' || location.hash === '') route();
    else location.hash = '#/play';
  });
});

// Logo and title: always back to the main (play) screen, from any screen.
// During a mission it asks first (see confirmLeaveGame in play.js) and then ends the mission on the spot.
// Otherwise the click is handled here for every case: if the hash is already #/play (for example on the results
// screen), the browser would not fire hashchange, so the view is re-rendered directly.
document.querySelector('.brand-home')?.addEventListener('click', async (event) => {
  event.preventDefault();
  if (isGameInProgress()) {
    if (await confirmLeaveGame()) endGame();
    return;
  }
  if (location.hash === '#/play' || location.hash === '') route();
  else location.hash = '#/play';
});

// Top-right button: Settings normally. While a game runs it leaves the game instead, after asking.
document.querySelector('.topbar-admin')?.addEventListener('click', async (event) => {
  if (!isGameInProgress()) return; // a normal link to Settings
  event.preventDefault();
  if (await confirmLeaveGame()) endGame();
});

// Reports and the other tabs: leaving a running game asks first, like the logo does.
// The Play tab is left out: it has its own rule (see above). The top-right button has its own rule too.
document.querySelectorAll('[data-nav]:not([data-nav="play"]):not(.topbar-admin)').forEach((link) => {
  link.addEventListener('click', async (event) => {
    if (!isGameInProgress()) return;
    event.preventDefault();
    if (!(await confirmLeaveGame())) return;
    location.hash = link.getAttribute('href') ?? `#/${link.dataset.nav}`;
  });
});

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
