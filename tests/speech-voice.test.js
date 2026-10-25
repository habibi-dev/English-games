import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesEntry, voiceCandidates, voiceChain } from '../js/ui/speech-out.js';
import { DEFAULT_VOICE_PRIORITY } from '../js/storage/settings.js';

function withVoices(voices, run) {
  const previous = globalThis.window;
  globalThis.window = { speechSynthesis: { getVoices: () => voices } };
  try {
    run();
  } finally {
    globalThis.window = previous;
  }
}

function withSavedPriority(names, run) {
  const store = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };
  try {
    if (names) store.set('grammar-quest.voices.v1', JSON.stringify(names));
    run();
  } finally {
    globalThis.localStorage = previous;
  }
}

const local = { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true };
const zira = { name: 'Microsoft Zira - English (United States)', lang: 'en-US', localService: true };
const aria = { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US', localService: false };
const google = { name: 'Google US English', lang: 'en-US', localService: false };
const other = { name: 'Some Other Voice', lang: 'en-US', localService: false };
const britishNetwork = { name: 'Microsoft Libby Online (Natural)', lang: 'en-GB', localService: false };

const names = (chain) => chain.map((c) => c.name);

test('the default list puts Google US English first, then the Edge voices', () => {
  withSavedPriority(null, () => {
    withVoices([aria, google], () => {
      assert.deepEqual(names(voiceChain('en-US')), [google.name, aria.name]);
    });
  });
  assert.equal(DEFAULT_VOICE_PRIORITY[0], 'Google US English');
  assert.ok(!DEFAULT_VOICE_PRIORITY.some((entry) => entry.includes('Translate')));
});

test('the saved list decides the order of the voices', () => {
  withSavedPriority(['Microsoft Zira', 'Google US English'], () => {
    withVoices([google, zira], () => {
      assert.deepEqual(names(voiceChain('en-US')), [zira.name, google.name]);
    });
  });
});

test('a voice that is not in the list comes after the listed voices', () => {
  withSavedPriority(['Google US English'], () => {
    withVoices([other, google], () => {
      assert.deepEqual(names(voiceChain('en-US')), [google.name, other.name]);
    });
  });
});

test('unlisted voices: online before local', () => {
  withSavedPriority([], () => {
    withVoices([local, other], () => {
      assert.deepEqual(names(voiceChain('en-US')), [other.name, local.name]);
    });
  });
});

test('English is always American: a British voice is never in the chain', () => {
  withSavedPriority(['Microsoft Libby Online (Natural)'], () => {
    withVoices([britishNetwork, zira], () => {
      const chain = voiceChain('en-US');
      assert.ok(chain.every((c) => c.voice.lang === 'en-US'));
      assert.deepEqual(names(chain), [zira.name]);
    });
  });
});

test('Persian uses only Persian voices', () => {
  const persian = { name: 'Microsoft Dariush', lang: 'fa-IR', localService: true };
  withVoices([persian, zira], () => {
    assert.deepEqual(names(voiceCandidates('fa-IR')), [persian.name]);
  });
});

test('a list entry matches the full voice name without case', () => {
  const candidate = { name: zira.name, online: false, voice: zira };
  assert.equal(matchesEntry(candidate, 'microsoft zira'), true);
  assert.equal(matchesEntry(candidate, 'Microsoft Aria'), false);
});

test('with no voices at all, the browser default is the only choice', () => {
  withSavedPriority([], () => {
    withVoices([], () => {
      assert.deepEqual(names(voiceChain('fa-IR')), ['browser default']);
    });
  });
});
