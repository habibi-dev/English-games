// Prompt for an AI assistant that writes questions in the import format.
// The examples are checked by tests/question-prompt.test.js, so they always pass the importer.

import { CATEGORIES } from './schema.js';

export const EXAMPLE_QUESTIONS = Object.freeze([
  {
    id: 'example-tr-01',
    book: 'evolve-1',
    lesson: 'lesson-01',
    topic: 'to_be',
    category: 'quick_translation',
    difficulty: 'easy',
    question: 'من دانشجو هستم.',
    expected_answer: 'I am a student.',
    accepted_answers: ['I am a student'],
    explanation: 'با I از am استفاده می‌کنیم.',
    glossary: [{ word: 'student', meaning: 'دانشجو' }],
  },
  {
    id: 'example-gc-01',
    book: 'evolve-1',
    lesson: 'lesson-01',
    topic: 'to_be',
    category: 'grammar_correction',
    difficulty: 'easy',
    question: 'جمله‌ی اشتباه را درست کن.',
    incorrect_sentence: 'They is students.',
    expected_answer: 'They are students.',
    explanation: 'با they از are استفاده می‌کنیم.',
  },
  {
    id: 'example-mc-01',
    book: 'evolve-1',
    lesson: 'lesson-01',
    topic: 'to_be',
    category: 'multiple_choice',
    difficulty: 'easy',
    question: 'کدام جمله درست است؟',
    options: ['She are happy.', 'She is happy.', 'She am happy.'],
    expected_answer: 'She is happy.',
  },
  {
    id: 'example-vocab-01',
    book: 'evolve-1',
    lesson: 'lesson-01',
    topic: 'vocabulary',
    category: 'vocabulary',
    difficulty: 'medium',
    question: 'دو مترادف (synonym) این کلمه را بگو: big',
    expected_answer: 'large',
    accepted_answers: ['large', 'huge', 'great', 'enormous'],
    answer_mode: 'list',
    min_items: 2,
    points: 20,
  },
]);

const typeLines = Object.entries(CATEGORIES)
  .map(([key, label]) => `- ${key}: ${label}`)
  .join('\n');

export const QUESTION_PROMPT = `You write practice questions for an English grammar game. Reply with one JSON object only: no comments, no markdown, no text before or after it.

FORMAT
{ "questions": [ question, question, ... ] }

Every question is an object. Field names are exact.

Required fields
- id: unique text across the whole bank, for example "evolve-1-l03-tr-01". Never reuse an id.
- book: the book id, for example "evolve-1".
- lesson: the lesson id, for example "lesson-03".
- topic: the grammar topic in lowercase with underscores, for example "to_be" or "do_does".
- category: one of the exercise types listed below.
- difficulty: "easy", "medium" or "hard".
- question: the text the learner reads.
- expected_answer: the correct answer, written exactly as the learner should type it.

Optional fields
- accepted_answers: array of other fully correct answers. The expected answer is always accepted. Nothing else is accepted automatically: "isn't" and "is not" are different unless both are listed.
- explanation: a short note shown after a wrong answer.
- hint: a short hint shown when the learner taps Hint.
- glossary: array of { "word": "...", "meaning": "..." } for key words in the question. The learner can tap them.
- points: whole number. Default: easy 10, medium 15, hard 20.
- time_limit: seconds. Default 20.
- presentation: "text" (default) or "audio". "audio" hides the sentence and only plays it. Use it for dictation and listening. The question must contain English text and no blank (___).
- answer_mode: "single" (default) or "list". Use "list" when the learner must give several items.
- min_items: list mode only. How many items the learner must give: at least 1, and no more than the number of accepted answers.
- operation: only for positive_negative_question: "positive", "negative" or "question".
- options: only for multiple_choice: an array of at least two different choices.
- word_bank: only for sentence_builder: the words of expected_answer, in any order. For word_translation: the Persian words of the sentence, in order (at least two). question is then optional: it is made from word_bank.
- incorrect_sentence: only for grammar_correction: the sentence with one mistake.

Exercise types (category)
${typeLines}
- quick_translation: question is a Persian sentence; the learner writes the English sentence.
- sentence_builder: question is an instruction; the learner puts word_bank in order to make expected_answer.
- word_translation: word_bank holds the Persian words of the sentence, in order (for example ["این", "معلم", "من", "است"]); the learner writes the whole English sentence (expected_answer).
- grammar_correction: question is an instruction; incorrect_sentence has one mistake; expected_answer is the whole correct sentence.
- multiple_choice: question asks something; the learner picks one of options; expected_answer must be one of them.
- positive_negative_question: question is "instruction: English sentence"; expected_answer is the sentence after the change set by operation.
- voice_translation: question is a Persian sentence; the learner says or types the English sentence.
- dictation: presentation "audio"; question is "instruction: English sentence"; the learner types what they hear.
- vocabulary: question asks for synonyms or antonyms of a word; use answer_mode "list" when several are needed.

Writing rules
- One grammar point per question, matching its topic.
- Instructions, explanations, hints and glossary meanings are in Persian. English sentences and answers are in English.
- Whenever an instruction names a grammar term in Persian, write the English term next to it in brackets, for example: مترادف (synonym), متضاد (antonym), زمان حال ساده (present simple). Never write the Persian term alone.
- Use normal English punctuation. Final punctuation (. ! ?) is ignored when answers are checked.
- Use contractions only when that form is listed in accepted_answers.
- Keep questions short and clear for a beginner.
- Use only the field names above. No trailing commas.

EXAMPLE
${JSON.stringify({ questions: EXAMPLE_QUESTIONS }, null, 2)}

After this prompt, the user will say which book, lesson and topic to write, how many questions, and which exercise types to use.`;
