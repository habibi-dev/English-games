// Win and lose sound effects. They are synthesized with the Web Audio API, so no audio files are needed.
// Win: a short, soft rising arpeggio (a cheerful little chime).
// Lose: a slow, soft falling "aww", sung by two detuned voices a third apart, so it sounds like a small group.
// Sounds only use the browser when they are played, so this module can be imported anywhere.

import { getSoundSettings } from '../storage/settings.js';

// Overall loudness is kept low on purpose; the volume setting scales it further.
const MASTER_LEVEL = 0.8;
// The background tune is much quieter than the sound effects, so it stays in the background.
const MUSIC_LEVEL = 0.1;

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

// ---- Background music: a soft, slow chord pad that changes every few seconds.
// It is made with the Web Audio API (no audio file), starts when a game starts and stops when it ends.
const CHORDS = [
  [130.81, 164.81, 196.0], // C3 E3 G3
  [110.0, 130.81, 164.81], // A2 C3 E3
  [87.31, 110.0, 130.81], // F2 A2 C3
  [98.0, 123.47, 146.83], // G2 B2 D3
];
const CHORD_SECONDS = 4;

let music = null;

/** Starts the background tune (no effect if it is already playing or the sound settings turn it off). */
export function startMusic() {
  const settings = getSoundSettings();
  if (!settings.enabled || !settings.music || music) return;
  try {
    const ac = audioContext();
    if (!ac) return;
    const output = ac.createGain();
    output.gain.value = 0.0001;
    output.gain.setTargetAtTime(settings.volume * MUSIC_LEVEL, ac.currentTime, 1.5); // fade in
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.connect(output);
    output.connect(ac.destination);

    const voices = CHORDS[0].map((freq) => {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start();
      return osc;
    });

    let step = 0;
    const changeChord = () => {
      const chord = CHORDS[step % CHORDS.length];
      step += 1;
      voices.forEach((osc, i) => osc.frequency.setTargetAtTime(chord[i], ac.currentTime, 0.8));
    };
    const timer = setInterval(changeChord, CHORD_SECONDS * 1000);
    music = { ac, output, voices, timer };
  } catch {
    // Music is optional: a failure must never break the game.
    music = null;
  }
}

/** Fades the background tune out and stops it. Does nothing when it is not playing. */
export function stopMusic() {
  if (!music) return;
  const { ac, output, voices, timer } = music;
  music = null;
  clearInterval(timer);
  try {
    output.gain.setTargetAtTime(0.0001, ac.currentTime, 0.4);
    voices.forEach((osc) => osc.stop(ac.currentTime + 2));
  } catch {
    // Already stopped or the context is gone: nothing else to do.
  }
}
