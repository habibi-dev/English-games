import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getSoundSettings, saveSoundSettings, SOUND_DEFAULTS } from '../js/storage/settings.js';
import { playResultSound, playWinSound, playLoseSound } from '../js/ui/sounds.js';

// A tiny in-memory localStorage, so the settings functions can run under Node.
function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

beforeEach(() => {
  globalThis.localStorage = memoryStorage();
});

test('sound effects are on by default, at a moderate volume', () => {
  assert.deepEqual(getSoundSettings(), { ...SOUND_DEFAULTS });
  assert.equal(SOUND_DEFAULTS.enabled, true);
  assert.equal(SOUND_DEFAULTS.win, true);
  assert.equal(SOUND_DEFAULTS.lose, true);
  assert.equal(SOUND_DEFAULTS.timeout, true);
});

test('the time-up sound has its own switch, and saving it keeps the others', () => {
  saveSoundSettings({ timeout: false });
  const settings = getSoundSettings();
  assert.equal(settings.timeout, false);
  assert.equal(settings.lose, true);
});

test('saving one sound setting keeps the others', () => {
  saveSoundSettings({ lose: false });
  const settings = getSoundSettings();
  assert.equal(settings.lose, false);
  assert.equal(settings.win, true);
  assert.equal(settings.enabled, true);
});

test('the volume is kept between 0 and 1', () => {
  saveSoundSettings({ volume: 4 });
  assert.equal(getSoundSettings().volume, 1);
  saveSoundSettings({ volume: -1 });
  assert.equal(getSoundSettings().volume, 0);
});

test('an unreadable stored value falls back to the defaults', () => {
  globalThis.localStorage.setItem('grammar-quest.sounds.v1', '{not json');
  assert.deepEqual(getSoundSettings(), { ...SOUND_DEFAULTS });
});

test('a bad field is replaced by its default, the valid ones are kept', () => {
  globalThis.localStorage.setItem('grammar-quest.sounds.v1', JSON.stringify({ enabled: 'yes', win: false, volume: 'loud' }));
  const settings = getSoundSettings();
  assert.equal(settings.enabled, true);
  assert.equal(settings.win, false);
  assert.equal(settings.volume, SOUND_DEFAULTS.volume);
});

test('playing sounds is silent and never throws where there is no Web Audio (Node)', () => {
  assert.doesNotThrow(() => playWinSound());
  assert.doesNotThrow(() => playLoseSound());
  assert.doesNotThrow(() => playResultSound(true));
  assert.doesNotThrow(() => playResultSound(false));
});
