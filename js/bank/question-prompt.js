// Prompt for an AI assistant that writes questions in the import format (Settings > Question bank).
// The examples are checked by tests/question-prompt.test.js, so they always pass the importer.
// The same test checks that the prompt names every field the importer reads.

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
    translation: 'من دانشجو هستم.',
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
    translation: 'آن‌ها دانشجو هستند.',
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
    explanation: 'با She از is استفاده می‌کنیم.',
    translation: 'او خوشحال است.',
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
    explanation: 'مترادف یعنی کلمه‌ای با معنی نزدیک. big یعنی بزرگ.',
    translation: 'بزرگ',
  },
  {
    id: 'example-sb-01',
    book: 'evolve-1',
    lesson: 'lesson-01',
    topic: 'to_be',
    category: 'sentence_builder',
    difficulty: 'easy',
    question: 'کلمات را به ترتیب درست مرتب کن و جمله بساز.',
    expected_answer: 'Is she a student?',
    word_bank: ['student', 'a', 'she', 'Is'],
    explanation: 'در سؤال، is به ابتدای جمله می‌آید: Is + she + a student.',
    translation: 'آیا او دانشجو است؟',
  },
  {
    id: 'example-wt-01',
    book: 'evolve-1',
    lesson: 'lesson-01',
    topic: 'to_be',
    category: 'word_translation',
    difficulty: 'easy',
    word_bank: ['این', 'معلم', 'من', 'است'],
    expected_answer: 'This is my teacher.',
    explanation: 'ترتیب کلمات فارسی همان ترتیب جمله‌ی انگلیسی است.',
    hint: 'this = این؛ my = من؛ is = است؛ teacher = معلم.',
    translation: 'این معلم من است.',
  },
  {
    id: 'example-pn-01',
    book: 'evolve-1',
    lesson: 'lesson-01',
    topic: 'to_be',
    category: 'positive_negative_question',
    difficulty: 'easy',
    operation: 'negative',
    question: 'جمله را منفی کن: They are students.',
    expected_answer: 'They are not students.',
    accepted_answers: ["They aren't students."],
    explanation: 'بعد از are کلمه‌ی not می‌آید. شکل کوتاه are not برابر aren\'t است.',
    translation: 'آن‌ها دانشجو نیستند.',
  },
  {
    id: 'example-vt-01',
    book: 'evolve-1',
    lesson: 'lesson-01',
    topic: 'to_be',
    category: 'voice_translation',
    difficulty: 'medium',
    question: 'آن کتاب من است.',
    expected_answer: 'That is my book.',
    accepted_answers: ["That's my book"],
    explanation: 'That is و شکل کوتاه آن هر دو درست‌اند.',
    translation: 'آن کتاب من است.',
  },
  {
    id: 'example-dic-01',
    book: 'evolve-1',
    lesson: 'lesson-01',
    topic: 'vocabulary',
    category: 'dictation',
    difficulty: 'easy',
    presentation: 'audio',
    question: 'teacher',
    expected_answer: 'teacher',
    hint: 'معلم',
    explanation: 'به املای کلمه دقت کن.',
    translation: 'معلم',
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
- topic: the grammar topic in lowercase with underscores, for example "to_be" or "do_does". The same grammar point always gets the same topic.
- category: one of the exercise types listed below.
- difficulty: "easy", "medium" or "hard".
- question: the text the learner reads. Leave it out only for word_translation, which is made from word_bank.
- expected_answer: the correct answer, written exactly as the learner should type it.
- explanation: always write one: a short note in Persian, shown after a wrong answer.
- translation: always write one: the Persian meaning of expected_answer. For a sentence it is the whole Persian sentence; for a word, the Persian word. The learner can show it after answering.

Optional fields
- accepted_answers: array of other fully correct answers. The expected answer is always accepted. Nothing else is accepted automatically: "isn't" and "is not" are different unless both are listed.
- hint: a short Persian hint shown when the learner taps Hint. For dictation it is the Persian meaning of the word (see Dictation rules below).
- glossary: array of { "word": "...", "meaning": "..." } for key words in the question. The learner can tap them.
- points: whole number. Default: easy 10, medium 15, hard 20.
- time_limit: seconds. Default 20. The lesson files use 60, so use 60 unless the user asks for another value.
- presentation: "text" (default) or "audio". "audio" hides the sentence and only plays it. Use it for dictation and listening. The question must contain English text and no blank (___).
- answer_mode: "single" (default) or "list". Use "list" when the learner must give several items.
- min_items: list mode only. How many items the learner must give: at least 1, and no more than the number of accepted answers.
- operation: only for positive_negative_question: "positive", "negative" or "question".
- options: only for multiple_choice: an array of at least two different choices. expected_answer must be one of them, and so must every accepted answer.
- word_bank: only for sentence_builder: the words of expected_answer, in any order (the game checks that both lists hold the same words). Only for word_translation: the Persian words of the sentence, in order (at least two). question is then not needed: it is made from word_bank.
- incorrect_sentence: only for grammar_correction: the sentence with one mistake.
- enabled: true (default) or false. A question with false stays in the bank but is hidden from the game. Use false for drafts.

Exercise types (category)
${typeLines}
- quick_translation: question is a Persian sentence; the learner writes the English sentence.
- sentence_builder: question is an instruction in Persian; the learner puts word_bank in order to make expected_answer.
- word_translation: word_bank holds the Persian words of the sentence, in order (for example ["این", "معلم", "من", "است"]); the learner writes the whole English sentence (expected_answer).
- grammar_correction: question is an instruction; incorrect_sentence has one mistake; expected_answer is the whole correct sentence.
- multiple_choice: question asks something; the learner picks one of options; expected_answer must be one of them.
- positive_negative_question: question is "instruction: English sentence"; expected_answer is the sentence after the change set by operation.
- voice_translation: question is a Persian sentence; the learner says the English sentence (the answer is spoken).
- dictation: presentation "audio"; question is the English word, phrase or sentence (or "instruction: English sentence"); the learner types what they hear.
- vocabulary: question asks for synonyms or antonyms of a word; use answer_mode "list" when several are needed.

Dictation rules
- Prefer one English word or a short phrase, with hint set to its Persian meaning. The game sometimes asks for the English word from its Persian meaning, and that needs the hint.
- Do not give a full sentence a hint. The game would sometimes show that hint as the question "Write the English word for this meaning.", which makes no sense for a sentence.

Writing rules
- One grammar point per question, matching its topic.
- Instructions, explanations, hints, translations and glossary meanings are in Persian. English sentences and answers are in English.
- Whenever an instruction names a grammar term in Persian, write the English term next to it in brackets, for example: مترادف (synonym), متضاد (antonym), زمان حال ساده (present simple). Never write the Persian term alone.
- Use normal English punctuation. Final punctuation (. ! ?) and commas are ignored when answers are checked, so "Sorry, what page?" and "Sorry what page" are the same answer.
- Use contractions only when that form is listed in accepted_answers. Write them with a straight apostrophe (').
- Accepted answers: list every correct form a learner may type, for example both "She is not a teacher." and "She isn't a teacher.". Word order matters: "Isn't she?" and "Is she not?" are different answers, and each one must be listed if it is correct.
- Vocabulary that asks for several words: answer_mode "list", min_items set to the number asked, and accepted_answers holding every correct word.
- voice_translation: the learner speaks the answer, so list the common spoken forms (for example the contracted form) in accepted_answers.
- Keep questions short and clear for a beginner.
- Use only the field names above. No trailing commas.

EXAMPLE
${JSON.stringify({ questions: EXAMPLE_QUESTIONS }, null, 2)}

After this prompt, the user will say which book, lesson and topic to write, how many questions, and which exercise types to use.`;
