// Win and lose sound effects. They are synthesized with the Web Audio API, so no audio files are needed.
// Win: a short, soft rising arpeggio (a cheerful little chime).
// Lose: a slow, soft falling "aww", sung by two detuned voices a third apart, so it sounds like a small group.
// Sounds only use the browser when they are played, so this module can be imported anywhere.

import { getSoundSettings } from '../storage/settings.js';

// Overall loudness is kept low on purpose; the volume setting scales it further.
const MASTER_LEVEL = 0.8;
let context = null;

/** The shared audio context, created on first use. Returns null where the browser has no Web Audio. */
function audioContext() {
  if (typeof window === 'undefined') return null;
  const Constructor = window.AudioContext ?? window.webkitAudioContext;
  if (!Constructor) return null;
  context ??= new Constructor();
  if (context.state === 'suspended') context.resume().catch(() => {});
  return context;
}

/**
 * Browsers only let sound start after a user action, so the context is prepared on the first tap.
 * Called once from the app shell. Nothing is played here.
 */
export function unlockSounds() {
  try {
    audioContext();
  } catch {
    // No audio available: the sounds are simply skipped.
  }
}

/** One soft note with a quick fade in and a longer fade out. */
function note(ac, output, { freq, slideTo = null, start = 0, duration = 0.4, type = 'sine', peak = 0.2 }) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const t = ac.currentTime + start;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(output);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

// Notes of the win chime (C major arpeggio, then a shimmer on the top chord).
const WIN_NOTES = [
  { freq: 523.25, start: 0, duration: 0.5, peak: 0.2 }, // C5
  { freq: 659.25, start: 0.09, duration: 0.5, peak: 0.2 }, // E5
  { freq: 783.99, start: 0.18, duration: 0.55, peak: 0.2 }, // G5
  { freq: 1046.5, start: 0.27, duration: 0.8, peak: 0.18 }, // C6
  { freq: 1318.5, start: 0.27, duration: 0.8, peak: 0.08, type: 'triangle' }, // E6, a soft shimmer
  { freq: 1567.98, start: 0.27, duration: 0.8, peak: 0.06, type: 'triangle' }, // G6, a soft shimmer
];

function winSound(ac, output) {
  for (const entry of WIN_NOTES) {
    note(ac, output, { type: 'sine', ...entry });
  }
}

function loseSound(ac, output) {
  // A low-pass filter takes the edge off, so the sound stays gentle.
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.connect(output);
  // Two voices a third apart, each gliding down.
  note(ac, filter, { freq: 392, slideTo: 311, start: 0, duration: 1.1, type: 'triangle', peak: 0.2 }); // G4 down to Eb4
  note(ac, filter, { freq: 466.16, slideTo: 349.23, start: 0.05, duration: 1.1, type: 'triangle', peak: 0.14 }); // Bb4 down to F4
}

// Time's up: two short, falling blips, like a soft buzzer. Shorter and higher than the lose sound.
function timeoutSound(ac, output) {
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  filter.connect(output);
  note(ac, filter, { freq: 587.33, slideTo: 440, start: 0, duration: 0.2, type: 'triangle', peak: 0.2 }); // D5 down to A4
  note(ac, filter, { freq: 440, slideTo: 329.63, start: 0.24, duration: 0.3, type: 'triangle', peak: 0.2 }); // A4 down to E4
}

/** Plays one sound at the chosen volume. Silent (and no error) where audio is not available. */
function play(sound) {
  try {
    const ac = audioContext();
    if (!ac) return;
    const master = ac.createGain();
    master.gain.value = getSoundSettings().volume * MASTER_LEVEL;
    master.connect(ac.destination);
    sound(ac, master);
  } catch {
    // Sound is a nicety: a failure must never break the answer screen.
  }
}

/** The win sound. Used for previews too, so it plays even when sounds are turned off. */
export function playWinSound() {
  play(winSound);
}

/** The lose sound. Used for previews too, so it plays even when sounds are turned off. */
export function playLoseSound() {
  play(loseSound);
}

/** The time-up sound. Used for previews too, so it plays even when sounds are turned off. */
export function playTimeoutSound() {
  play(timeoutSound);
}

/**
 * Called when an answer is judged:
 *  - a right answer plays the win sound;
 *  - a wrong answer plays the lose sound;
 *  - a time-out plays the time-up sound.
 * Respects the sound settings (master switch and each sound's own switch).
 */
export function playResultSound(correct, timedOut = false) {
  vibrateFor(correct ? 'correct' : 'wrong');
  const settings = getSoundSettings();
  if (!settings.enabled) return;
  if (correct) {
    if (settings.win) play(winSound);
  } else if (timedOut) {
    if (settings.timeout) play(timeoutSound);
  } else if (settings.lose) {
    play(loseSound);
  }
}

// ---- Results jingles: one short piece for each result look (see resultTier in player.js and result-stage.js).
// Each one has its own notes and its own sound, so the learner hears how the mission went before reading it.

// A brass-like chord: a few sawtooth voices through a soft low-pass filter.
function brass(ac, output, freqs, { start, duration, peak }) {
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1800;
  filter.connect(output);
  for (const freq of freqs) {
    note(ac, filter, { freq, type: 'sawtooth', start, duration, peak });
  }
}

const RESULT_JINGLES = [
  // 0 Keep going: two low, soft notes that step down, like a gentle sigh.
  (ac, out) => {
    note(ac, out, { freq: 329.63, start: 0, duration: 0.5, type: 'sine', peak: 0.16 }); // E4
    note(ac, out, { freq: 261.63, start: 0.28, duration: 0.8, type: 'sine', peak: 0.16 }); // C4
  },
  // 1 Getting there: two rising notes on a soft wooden tone.
  (ac, out) => {
    note(ac, out, { freq: 349.23, start: 0, duration: 0.35, type: 'triangle', peak: 0.2 }); // F4
    note(ac, out, { freq: 523.25, start: 0.16, duration: 0.7, type: 'triangle', peak: 0.2 }); // C5
  },
  // 2 Good work: three quick bell notes climbing to a high G, which rings on.
  (ac, out) => {
    note(ac, out, { freq: 783.99, start: 0, duration: 0.6, type: 'sine', peak: 0.2 }); // G5
    note(ac, out, { freq: 1046.5, start: 0.1, duration: 0.6, type: 'sine', peak: 0.2 }); // C6
    note(ac, out, { freq: 1318.5, start: 0.2, duration: 0.6, type: 'sine', peak: 0.2 }); // E6
    note(ac, out, { freq: 1567.98, start: 0.32, duration: 1.1, type: 'triangle', peak: 0.12 }); // G6
  },
  // 3 Excellent: a short brass fanfare, three rising calls, then a held chord.
  (ac, out) => {
    brass(ac, out, [392], { start: 0, duration: 0.14, peak: 0.12 }); // G4
    brass(ac, out, [523.25], { start: 0.14, duration: 0.14, peak: 0.12 }); // C5
    brass(ac, out, [659.25], { start: 0.28, duration: 0.14, peak: 0.12 }); // E5
    brass(ac, out, [523.25, 659.25, 783.99, 1046.5], { start: 0.42, duration: 1.1, peak: 0.1 }); // C major, held
  },
  // 4 Perfect score: a low drum, a bigger fanfare, a chord that swells, then a sparkle run up two octaves.
  (ac, out) => {
    note(ac, out, { freq: 120, slideTo: 50, start: 0, duration: 0.35, type: 'sine', peak: 0.35 }); // drum
    brass(ac, out, [392], { start: 0.12, duration: 0.12, peak: 0.13 });
    brass(ac, out, [523.25], { start: 0.24, duration: 0.12, peak: 0.13 });
    brass(ac, out, [659.25], { start: 0.36, duration: 0.12, peak: 0.13 });
    brass(ac, out, [523.25, 659.25, 783.99, 1046.5], { start: 0.5, duration: 1.5, peak: 0.11 });
    [1046.5, 1318.5, 1567.98, 2093, 2637, 3136, 3951, 4186].forEach((freq, i) => {
      note(ac, out, { freq, start: 0.75 + i * 0.07, duration: 0.45, type: 'sine', peak: 0.07 });
    });
  },
];

/**
 * Plays the jingle of a result look (0 to 4). Used at the end of a mission and by the preview in Settings.
 * The master sound switch is the only one that applies: the jingle is part of the result, not a sound effect.
 */
export function playResultJingle(tier) {
  const jingle = RESULT_JINGLES[tier] ?? RESULT_JINGLES[0];
  play(jingle);
}

/** Plays the jingle at the end of a mission, when the sound effects are on. */
export function playResultJingleIfEnabled(tier) {
  if (!getSoundSettings().enabled) return;
  playResultJingle(tier);
}

// ---- Vibration (phones and tablets that have a vibration motor; ignored elsewhere).
// correct: one short tap. wrong (and time-up): one long buzz. end: a pattern at the end of a game.
const VIBRATION = {
  correct: [70],
  wrong: [600],
  end: [120, 90, 120, 90, 380],
};

/** Vibrates for an event, if the device can and the vibration setting is on. */
export function vibrateFor(kind) {
  try {
    if (!getSoundSettings().vibrate) return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(VIBRATION[kind] ?? []);
    }
  } catch {
    // Vibration is a nicety: never let it break the answer screen.
  }
}
