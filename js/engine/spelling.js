// Spelling modes for dictation words. The same word can be practised three ways, so it is remembered
// by its spelling and not only by its sound:
//   audio    the word is only heard; the learner types it
//   meaning  the Persian meaning is shown; the learner types the English word
//   letters  the letters are shown in shuffled tiles; the learner taps them into the right order
// Pure functions (the random source can be passed in), so they can be tested in Node.

export const SPELLING_MODES = Object.freeze(['audio', 'meaning', 'letters']);

// Letters mode needs a single word made of plain letters, long enough to be a real spelling task.
const MIN_LETTERS = 3;

/** True when the answer is one plain word that can be built from letter tiles (no spaces or punctuation). */
export function canSpellWithLetters(question) {
  const word = String(question?.expected_answer ?? '');
  return /^[A-Za-z]+$/.test(word) && word.length >= MIN_LETTERS;
}

/** The modes this dictation word can be practised in. Audio always works; the others need their data. */
export function spellingModesFor(question) {
  const modes = ['audio'];
  if (question?.hint) modes.push('meaning');
  if (canSpellWithLetters(question)) modes.push('letters');
  return modes;
}

/** Picks one of the word's modes. `random` returns a number in [0, 1). */
export function pickSpellingMode(question, random = Math.random) {
  const modes = spellingModesFor(question);
  return modes[Math.floor(random() * modes.length) % modes.length];
}

/**
 * A dictation question in one of its spelling modes. Other question types are returned unchanged.
 * The chosen mode becomes the question's presentation, which the rest of the game already understands.
 */
export function applySpellingMode(question, random = Math.random) {
  if (question?.category !== 'dictation') return question;
  return { ...question, presentation: pickSpellingMode(question, random) };
}

/**
 * The letters of a word in a shuffled order, for the letter tiles. Never the original order
 * (when the word has more than one distinct letter), so the tiles are a real task.
 */
export function scrambleLetters(word, random = Math.random) {
  const letters = [...String(word)];
  const original = letters.join('');
  for (let attempt = 0; attempt < 10; attempt++) {
    const shuffled = [...letters];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (shuffled.join('') !== original || new Set(letters).size < 2) return shuffled;
  }
  return letters;
}
