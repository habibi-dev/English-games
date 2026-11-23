/**
 * Generator for lesson 2.2 – Describing people. Run: node scripts/generate-lesson-02-02.mjs
 */
import { writeFileSync } from 'node:fs';

const L = 'evolve-1-l02-02';

const ageBlock = [
  { word: 'elderly', ipa: '/ˈeldərli/', meaning: 'سالخورده', category: 'Age' },
  { word: 'aged', ipa: '/eɪdʒd/', meaning: 'مسن، سالخورده', category: 'Age' },
  { word: 'youth', ipa: '/juːθ/', meaning: 'جوانی، دورهٔ جوانی', category: 'Age' },
  { word: 'young people', ipa: '/jʌŋ ˈpiːpəl/', meaning: 'جوانان', category: 'Age' },
];

const appearanceBlock = [
  { word: 'short', ipa: '/ʃɔːrt/', meaning: 'کوتاه‌قد', category: 'Appearance' },
  { word: 'tall', ipa: '/tɔːl/', meaning: 'قدبلند', category: 'Appearance' },
  { word: 'pretty', ipa: '/ˈprɪti/', meaning: 'زیبا، خوشگل', category: 'Appearance' },
  { word: 'lovely', ipa: '/ˈlʌvli/', meaning: 'دوست‌داشتنی، زیبا', category: 'Appearance' },
  { word: 'smart', ipa: '/smɑːrt/', meaning: 'باهوش', category: 'Appearance' },
];

const personalityBlock = [
  { word: 'funny', ipa: '/ˈfʌni/', meaning: 'بامزه، خنده‌دار', category: 'Personality' },
  { word: 'boring', ipa: '/ˈbɔːrɪŋ/', meaning: 'کسل‌کننده', category: 'Personality' },
  { word: 'friendly', ipa: '/ˈfrendli/', meaning: 'خوش‌برخورد، دوستانه', category: 'Personality' },
  { word: 'interesting', ipa: '/ˈɪntrəstɪŋ/', meaning: 'جالب', category: 'Personality' },
  { word: 'shy', ipa: '/ʃaɪ/', meaning: 'خجالتی', category: 'Personality' },
  { word: 'clever', ipa: '/ˈklevər/', meaning: 'باهوش، زیرک', category: 'Personality' },
  { word: 'stupid', ipa: '/ˈstuːpɪd/', meaning: 'احمق، کم‌عقل', category: 'Personality' },
  { word: 'bold', ipa: '/boʊld/', meaning: 'جسور، بی‌باک', category: 'Personality' },
  { word: 'humorous', ipa: '/ˈhjuːmərəs/', meaning: 'شوخ‌طبع', category: 'Personality' },
  { word: 'intimate', ipa: '/ˈɪntəmət/', meaning: 'صمیمی، نزدیک', category: 'Personality' },
];

const numberBlock = [
  { word: 'twenty-four', ipa: '/ˌtwenti ˈfɔːr/', meaning: 'بیست‌وچهار', category: 'Numbers' },
  { word: 'eighty-five', ipa: '/ˌeɪti ˈfaɪv/', meaning: 'هشتاد‌وپنج', category: 'Numbers' },
];

const otherWords = [
  { word: 'buddy', ipa: '/ˈbʌdi/', meaning: 'رفیق، دوست' },
  { word: 'best friend', ipa: '/best frend/', meaning: 'بهترین دوست' },
  { word: 'fam', ipa: '/fæm/', meaning: 'خانواده (خودمانی)' },
  { word: 'college student', ipa: '/ˈkɑːlɪdʒ ˈstuːdənt/', meaning: 'دانشجوی دانشگاه' },
  { word: 'seem', ipa: '/siːm/', meaning: 'به نظر رسیدن' },
  { word: 'look like', ipa: '/lʊk laɪk/', meaning: 'شبیه بودن به' },
  { word: 'lose', ipa: '/luːz/', meaning: 'گم کردن' },
  { word: 'really', ipa: '/ˈrɪəli/', meaning: 'واقعاً، خیلی' },
  { word: 'very', ipa: '/ˈveri/', meaning: 'خیلی، بسیار' },
  { word: 'so', ipa: '/soʊ/', meaning: 'خیلی، این‌قدر' },
  { word: 'above', ipa: '/əˈbʌv/', meaning: 'بالای، بالاتر از' },
  { word: 'over', ipa: '/ˈoʊvər/', meaning: 'بالای، بر فراز' },
  { word: 'higher', ipa: '/ˈhaɪər/', meaning: 'بالاتر' },
  { word: 'character', ipa: '/ˈkærəktər/', meaning: 'شخصیت، ویژگی‌های شخصیتی' },
  { word: 'personality', ipa: '/ˌpɜːrsəˈnæləti/', meaning: 'شخصیت' },
  { word: 'days', ipa: '/deɪz/', meaning: 'روزها' },
];

const vocabulary = [...ageBlock, ...appearanceBlock, ...personalityBlock, ...numberBlock, ...otherWords];

const sentences = [
  { en: 'She is funny.', fa: 'او بامزه است.' },
  { en: 'He is tall.', fa: 'او قدبلند است.' },
  { en: 'My mother is short.', fa: 'مادر من قدکوتاه است.' },
  { en: 'They are friendly.', fa: 'آن‌ها خوش‌برخورد هستند.' },
  { en: 'My sister is smart.', fa: 'خواهر من باهوش است.' },
  { en: "She's really funny.", fa: 'او واقعاً بامزه است.' },
  { en: "He's really tall.", fa: 'او خیلی قدبلند است.' },
  { en: "She's very smart.", fa: 'او بسیار باهوش است.' },
  { en: "She's very interesting.", fa: 'او خیلی جالب است.' },
  { en: 'He is really young.', fa: 'او واقعاً جوان است.' },
  { en: 'They are very friendly.', fa: 'آن‌ها خیلی خوش‌برخورد هستند.' },
  { en: 'My brother is really funny.', fa: 'برادرم واقعاً بامزه است.' },
  { en: 'My grandmother is very interesting.', fa: 'مادربزرگ من خیلی جالب است.' },
  { en: "She's so funny.", fa: 'او خیلی بامزه است.' },
  { en: "He's so smart.", fa: 'او خیلی باهوش است.' },
  { en: 'They are so friendly.', fa: 'آن‌ها خیلی خوش‌برخورد هستند.' },
  { en: "He's not tall.", fa: 'او قدبلند نیست.' },
  { en: "She's not old.", fa: 'او پیر نیست.' },
  { en: "They're not boring.", fa: 'آن‌ها کسل‌کننده نیستند.' },
  { en: "We're in Texas.", fa: 'ما در تگزاس هستیم.' },
  { en: "We're not in Texas.", fa: 'ما در تگزاس نیستیم.' },
  { en: 'Both my parents are 50.', fa: 'هر دو والد من ۵۰ ساله هستند.' },
  { en: "They're both really funny.", fa: 'هر دوی آن‌ها واقعاً بامزه هستند.' },
  { en: 'She is short.', fa: 'او قدکوتاه است.' },
  { en: 'My father is old.', fa: 'پدر من مسن است.' },
  { en: 'My mother is young.', fa: 'مادر من جوان است.' },
  { en: 'My brother is really tall.', fa: 'برادرم واقعاً قدبلند است.' },
  { en: "She's very beautiful.", fa: 'او بسیار زیباست.' },
  { en: 'My sister is funny.', fa: 'خواهرم بامزه است.' },
  { en: "He's really smart.", fa: 'او خیلی باهوش است.' },
  { en: "She's very friendly.", fa: 'او خیلی خوش‌برخورد است.' },
  { en: 'My friend is shy.', fa: 'دوست من خجالتی است.' },
  { en: "My brother isn't boring.", fa: 'برادرم کسل‌کننده نیست.' },
  { en: "They're really interesting.", fa: 'آن‌ها واقعاً جالب هستند.' },
  { en: 'My parents are both 50.', fa: 'والدین من هر دو ۵۰ ساله هستند.' },
  { en: "They're not from Texas.", fa: 'آن‌ها اهل تگزاس نیستند.' },
  { en: 'My grandmother is 85.', fa: 'مادربزرگ من ۸۵ ساله است.' },
  { en: "She's really funny and friendly.", fa: 'او خیلی بامزه و خوش‌برخورد است.' },
  { en: 'My best friend is very smart.', fa: 'بهترین دوست من خیلی باهوش است.' },
  { en: "He isn't shy.", fa: 'او خجالتی نیست.' },
  { en: "We're both students.", fa: 'ما هر دو دانشجو هستیم.' },
  { en: "Erika isn't old.", fa: 'ریکا پیر نیست.' },
  { en: "My parents aren't from Miami.", fa: 'والدین من اهل میامی نیستند.' },
  { en: "My friends aren't boring.", fa: 'دوستان من کسل‌کننده نیستند.' },
  { en: "Filip isn't American.", fa: 'فیلیپ آمریکایی نیست.' },
];

const grammar = [
  {
    title: 'صفات با am / is / are',
    explanation:
      'برای توصیف افراد، بعد از فعل بودن صفت می‌آید. صفت برای جمع تغییر نمی‌کند: They are smart (نه smarts).',
    examples: [
      { en: 'He is tall.', fa: 'او قدبلند است.' },
      { en: 'They are friendly.', fa: 'آن‌ها خوش‌برخورد هستند.' },
      { en: 'My sister is smart.', fa: 'خواهر من باهوش است.' },
    ],
  },
  {
    title: 'Really و Very قبل از صفت',
    explanation: 'Really و Very معمولاً قبل از صفت می‌آیند و معنای صفت را قوی‌تر می‌کنند.',
    examples: [
      { en: "She's really funny.", fa: 'او واقعاً بامزه است.' },
      { en: "She's very smart.", fa: 'او بسیار باهوش است.' },
      { en: 'My brother is really funny.', fa: 'برادرم واقعاً بامزه است.' },
    ],
  },
  {
    title: 'So + صفت',
    explanation: 'So قبل از صفت می‌آید و یعنی «خیلی» یا «این‌قدر»؛ بعد از آن فعل نیست.',
    examples: [
      { en: "She's so funny.", fa: 'او خیلی بامزه است.' },
      { en: "He's so smart.", fa: 'او خیلی باهوش است.' },
      { en: 'They are so friendly.', fa: 'آن‌ها خیلی خوش‌برخورد هستند.' },
    ],
  },
  {
    title: 'منفی با is not / are not',
    explanation:
      "برای منفی کردن، not را بعد از is یا are می‌گذاریم. شکل‌های مخفف: isn't، aren't، 're not.",
    examples: [
      { en: "He's not tall.", fa: 'او قدبلند نیست.' },
      { en: "She's not old.", fa: 'او پیر نیست.' },
      { en: "They're not boring.", fa: 'آن‌ها کسل‌کننده نیستند.' },
    ],
  },
  {
    title: 'Both',
    explanation: 'Both یعنی «هر دو». می‌تواند قبل از اسم بیاید یا بعد از فعل بودن: Both my parents… / They\'re both …',
    examples: [
      { en: 'Both my parents are 50.', fa: 'هر دو والد من ۵۰ ساله هستند.' },
      { en: "They're both really funny.", fa: 'هر دوی آن‌ها واقعاً بامزه هستند.' },
      { en: "We're both students.", fa: 'ما هر دو دانشجو هستیم.' },
    ],
  },
];

const laraStory = {
  title: 'متن Lara: توصیف خانواده',
  lines: [
    { en: "We're in Texas.", fa: 'ما در تگزاس هستیم.' },
    { en: 'My grandmother is 85.', fa: 'مادربزرگ من ۸۵ ساله است.' },
    { en: 'My grandmother is very interesting.', fa: 'مادربزرگ من خیلی جالب است.' },
    { en: 'My sister is funny.', fa: 'خواهرم بامزه است.' },
    { en: "She's really funny and friendly.", fa: 'او خیلی بامزه و خوش‌برخورد است.' },
    { en: 'My brother is really tall.', fa: 'برادرم واقعاً قدبلند است.' },
    { en: "He's really smart.", fa: 'او خیلی باهوش است.' },
    { en: 'My parents are both 50.', fa: 'والدین من هر دو ۵۰ ساله هستند.' },
    { en: "They're both really funny.", fa: 'هر دوی آن‌ها واقعاً بامزه هستند.' },
    { en: "Erika isn't old.", fa: 'ریکا پیر نیست.' },
    { en: 'My friend is shy.', fa: 'دوست من خجالتی است.' },
    { en: 'My best friend is very smart.', fa: 'بهترین دوست من خیلی باهوش است.' },
    { en: "My parents aren't from Miami.", fa: 'والدین من اهل میامی نیستند.' },
    { en: "My friends aren't boring.", fa: 'دوستان من کسل‌کننده نیستند.' },
  ],
};

const tr = (n, en, fa, extra = {}) => ({
  id: `${L}-tr-${String(n).padStart(2, '0')}`,
  expected_answer: en,
  translation: fa,
  question: fa,
  time_limit: 60,
  explanation: 'به ترتیب صفت، really/very و فعل بودن توجه کن.',
  hint: extra.hint ?? 'ساختار: فاعل + am/is/are + (really/very) + صفت',
  ...extra,
});

const translationItems = [
  tr(1, 'He is tall.', 'او قدبلند است.', { group: 'Appearance', hint: 'tall = قدبلند' }),
  tr(2, 'She is short.', 'او قدکوتاه است.', { group: 'Appearance', hint: 'short = کوتاه‌قد' }),
  tr(3, "She's really funny.", 'او واقعاً بامزه است.', {
    accepted_answers: ['She is really funny.'],
    group: 'Personality',
    hint: 'really قبل از صفت',
  }),
  tr(4, "She's very smart.", 'او بسیار باهوش است.', {
    accepted_answers: ['She is very smart.'],
    group: 'Appearance',
    hint: 'very = خیلی',
  }),
  tr(5, "He's not tall.", 'او قدبلند نیست.', {
    accepted_answers: ['He is not tall.'],
    group: 'Appearance',
    hint: 'منفی: is not یا isn\'t',
  }),
  tr(6, "She's not old.", 'او پیر نیست.', { accepted_answers: ['She is not old.'], group: 'Age' }),
  tr(7, 'Both my parents are 50.', 'هر دو والد من ۵۰ ساله هستند.', { hint: 'both = هر دو' }),
  tr(8, "They're both really funny.", 'هر دوی آن‌ها واقعاً بامزه هستند.', {
    accepted_answers: ['They are both really funny.'],
    group: 'Personality',
  }),
  tr(9, 'My grandmother is 85.', 'مادربزرگ من ۸۵ ساله است.', { group: 'Numbers' }),
  tr(10, 'My parents are both 50.', 'والدین من هر دو ۵۰ ساله هستند.'),
  tr(11, "They're not from Texas.", 'آن‌ها اهل تگزاس نیستند.', {
    accepted_answers: ['They are not from Texas.'],
  }),
  tr(12, "She's really funny and friendly.", 'او خیلی بامزه و خوش‌برخورد است.', {
    accepted_answers: ['She is really funny and friendly.'],
    group: 'Personality',
  }),
  tr(13, 'My best friend is very smart.', 'بهترین دوست من خیلی باهوش است.', {
    group: 'Appearance',
    hint: 'best friend = بهترین دوست',
  }),
  tr(14, "We aren't in Texas.", 'ما در تگزاس نیستیم.', {
    accepted_answers: ['We are not in Texas.'],
    question: 'ما در تگزاس نیستیم.',
    translation: 'ما در تگزاس نیستیم.',
  }),
  tr(15, "My brother isn't boring.", 'برادرم کسل‌کننده نیست.', {
    accepted_answers: ['My brother is not boring.'],
    group: 'Personality',
    hint: 'boring = کسل‌کننده',
  }),
  tr(16, 'They are very friendly.', 'آن‌ها خیلی خوش‌برخورد هستند.'),
  tr(17, 'My friend is shy.', 'دوست من خجالتی است.', { group: 'Personality', hint: 'shy = خجالتی' }),
  tr(18, "Erika isn't old.", 'ریکا پیر نیست.', {
    accepted_answers: ['Erika is not old.'],
    group: 'Age',
  }),
];

const builderItems = [
  {
    id: `${L}-sb-01`,
    expected_answer: "She's really funny.",
    translation: 'او واقعاً بامزه است.',
    question: 'کلمات را به ترتیب درست مرتب کن و جمله بساز.',
    hint: 'really قبل از صفت funny',
    word_bank: ['funny.', "She's", 'really'],
    group: 'Personality',
    time_limit: 60,
    explanation: 'She + is + really + adjective',
  },
  {
    id: `${L}-sb-02`,
    expected_answer: "They're both really funny.",
    translation: 'هر دوی آن‌ها واقعاً بامزه هستند.',
    question: 'کلمات را به ترتیب درست مرتب کن و جمله بساز.',
    hint: 'both بعد از فعل بودن',
    word_bank: ['funny.', 'both', "They're", 'really'],
    group: 'Personality',
    time_limit: 60,
    explanation: 'They are both + really + adjective',
  },
  {
    id: `${L}-sb-03`,
    expected_answer: 'My best friend is very smart.',
    translation: 'بهترین دوست من خیلی باهوش است.',
    question: 'کلمات را به ترتیب درست مرتب کن و جمله بساز.',
    hint: 'best friend = بهترین دوست',
    word_bank: ['smart.', 'friend', 'My', 'very', 'best', 'is'],
    time_limit: 60,
    explanation: 'My best friend + is + very + smart',
  },
];

const dictForCategory = (block, prefix) =>
  block.map((entry, i) => ({
    id: `${L}-dic-${prefix}-${String(i + 1).padStart(2, '0')}`,
    expected_answer: entry.word,
    translation: entry.meaning,
    question: entry.word,
    hint: entry.meaning,
    presentation: 'audio',
    group: entry.category,
    time_limit: 60,
    explanation: 'املای واژه را با دقت بنویس.',
  }));

const dictationOther = otherWords.map((entry, i) => ({
  id: `${L}-dic-o-${String(i + 1).padStart(2, '0')}`,
  expected_answer: entry.word,
  translation: entry.meaning,
  question: entry.word,
  hint: entry.meaning,
  presentation: 'audio',
  time_limit: 60,
  explanation: 'املای واژه یا عبارت را با دقت بنویس.',
}));

const synonymItems = [
  { q: 'smart', a: 'clever', g: 'Appearance' },
  { q: 'funny', a: 'humorous', g: 'Personality' },
  { q: 'pretty', a: 'lovely', g: 'Appearance' },
  { q: 'buddy', a: 'friend', g: null },
  { q: 'personality', a: 'character', g: null },
  { q: 'fam', a: 'family', g: null },
  { q: 'seem', a: 'look', g: null },
].map(({ q, a, g }, i) => ({
  id: `${L}-voc-syn-${String(i + 1).padStart(2, '0')}`,
  question: `Synonym: ${q}`,
  expected_answer: a,
  translation:
    a === 'friend'
      ? 'دوست'
      : a === 'family'
        ? 'خانواده'
        : a === 'look'
          ? 'نگاه کردن'
          : vocabulary.find((v) => v.word === a)?.meaning ?? a,
  hint: 'مترادف نزدیک در همین درس یا درس‌های قبل',
  ...(g ? { group: g } : {}),
  time_limit: 60,
  explanation: `${q} و ${a} در این زمینه نزدیک‌اند.`,
}));

const oppositeItems = [
  { q: 'elderly', a: 'young', note: 'young از درس قبل' },
  { q: 'short', a: 'tall', g: 'Appearance' },
  { q: 'boring', a: 'interesting', g: 'Personality' },
  { q: 'smart', a: 'stupid', g: 'Appearance' },
  { q: 'shy', a: 'bold', g: 'Personality' },
  { q: 'find', a: 'lose', g: null },
].map(({ q, a, g, note }, i) => ({
  id: `${L}-voc-opp-${String(i + 1).padStart(2, '0')}`,
  question: `Opposite: ${q}`,
  expected_answer: a,
  translation:
    a === 'young'
      ? 'جوان'
      : a === 'friend'
        ? 'دوست'
        : a === 'family'
          ? 'خانواده'
          : a === 'look'
            ? 'نگاه کردن'
            : vocabulary.find((v) => v.word === a)?.meaning ?? a,
  hint: note ? 'متضاد را از واژگان درس انتخاب کن' : 'متضاد صفت یا فعل',
  ...(g ? { group: g } : {}),
  time_limit: 60,
  explanation: `${q} ↔ ${a}`,
}));

const grammarCorrection = [
  {
    id: `${L}-gc-01`,
    incorrect_sentence: 'She are funny.',
    expected_answer: 'She is funny.',
    accepted_answers: ["She's funny."],
    translation: 'او بامزه است.',
    question: 'جملهٔ اشتباه را اصلاح کن.',
    hint: 'She با is می‌آید.',
    time_limit: 60,
    explanation: 'She + is + adjective',
    group: 'Personality',
  },
  {
    id: `${L}-gc-02`,
    incorrect_sentence: 'They is friendly.',
    expected_answer: 'They are friendly.',
    accepted_answers: ["They're friendly."],
    translation: 'آن‌ها خوش‌برخورد هستند.',
    question: 'جملهٔ اشتباه را اصلاح کن.',
    hint: 'They با are',
    time_limit: 60,
    explanation: 'They + are + adjective',
    group: 'Personality',
  },
  {
    id: `${L}-gc-03`,
    incorrect_sentence: "She's very funnies.",
    expected_answer: "She's very funny.",
    accepted_answers: ['She is very funny.'],
    translation: 'او خیلی بامزه است.',
    question: 'جملهٔ اشتباه را اصلاح کن.',
    hint: 'صفات جمع نمی‌شوند.',
    time_limit: 60,
    explanation: 'funny بدون s',
    group: 'Personality',
  },
];

const negativeItems = [
  {
    id: `${L}-neg-01`,
    operation: 'negative',
    question: "جمله را منفی کن: He's tall.",
    expected_answer: "He isn't tall.",
    accepted_answers: ["He's not tall.", 'He is not tall.'],
    translation: 'او قدبلند نیست.',
    hint: 'is + not',
    group: 'Appearance',
    time_limit: 60,
    explanation: "isn't / is not",
  },
  {
    id: `${L}-neg-02`,
    operation: 'negative',
    question: "جمله را منفی کن: They're boring.",
    expected_answer: "They aren't boring.",
    accepted_answers: ["They're not boring.", 'They are not boring.'],
    translation: 'آن‌ها کسل‌کننده نیستند.',
    hint: 'are + not',
    group: 'Personality',
    time_limit: 60,
    explanation: "aren't / are not",
  },
  {
    id: `${L}-neg-03`,
    operation: 'negative',
    question: "جمله را منفی کن: She's old.",
    expected_answer: "She isn't old.",
    accepted_answers: ["She's not old.", 'She is not old.'],
    translation: 'او پیر نیست.',
    hint: 'is + not',
    group: 'Age',
    time_limit: 60,
    explanation: "isn't / is not",
  },
];

const multipleChoice = [
  {
    id: `${L}-mc-01`,
    question: 'Really و Very با صفت چه می‌کنند؟',
    expected_answer: 'They make the adjective stronger.',
    translation: 'صفت را قوی‌تر می‌کنند.',
    hint: 'درس ۲B کتاب',
    options: ['They make the adjective stronger.', 'They make the adjective weaker.', 'They change the adjective to a verb.'],
    time_limit: 60,
    explanation: 'Stronger (++).',
    group: 'Personality',
  },
  {
    id: `${L}-mc-02`,
    question: 'کدام جمله درست است؟',
    expected_answer: "They're very friendly.",
    translation: 'آن‌ها خیلی خوش‌برخورد هستند.',
    hint: 'They با are',
    options: ["They're very friendly.", "They're very friendlies.", 'They is very friendly.'],
    time_limit: 60,
    explanation: 'They are + very + friendly',
    group: 'Personality',
  },
  {
    id: `${L}-mc-03`,
    question: 'متضاد shy چیست؟',
    expected_answer: 'bold',
    translation: 'جسور',
    hint: 'شخصیت',
    options: ['bold', 'boring', 'short'],
    time_limit: 60,
    explanation: 'shy ↔ bold',
    group: 'Personality',
  },
];

const lesson = {
  schema_version: '2.0',
  book: 'evolve-1',
  lesson: 'lesson-02-02',
  title: 'Lesson 2.2 – Describing people',
  exercises: [
    {
      id: `${L}-translation`,
      type: 'quick_translation',
      title: 'ترجمه جمله‌ها و عبارت‌ها',
      presentation: 'text',
      difficulty: 'easy',
      items: translationItems,
    },
    {
      id: `${L}-builder`,
      type: 'sentence_builder',
      title: 'جمله‌سازی',
      presentation: 'text',
      difficulty: 'easy',
      items: builderItems,
    },
    {
      id: `${L}-grammar-correction`,
      type: 'grammar_correction',
      title: 'اصلاح جمله',
      presentation: 'text',
      difficulty: 'easy',
      items: grammarCorrection,
    },
    {
      id: `${L}-pnq`,
      type: 'positive_negative_question',
      title: 'منفی کردن',
      presentation: 'text',
      difficulty: 'easy',
      items: negativeItems,
    },
    {
      id: `${L}-choice`,
      type: 'multiple_choice',
      title: 'سؤالات چندگزینه‌ای',
      presentation: 'text',
      difficulty: 'easy',
      items: multipleChoice,
    },
    {
      id: `${L}-vocabulary`,
      type: 'vocabulary',
      title: 'مترادف و متضاد',
      presentation: 'text',
      difficulty: 'easy',
      items: [...synonymItems, ...oppositeItems],
    },
    {
      id: `${L}-dictation`,
      type: 'dictation',
      title: 'املای واژه‌ها',
      presentation: 'audio',
      difficulty: 'easy',
      items: [
        ...dictForCategory(ageBlock, 'a'),
        ...dictForCategory(appearanceBlock, 'p'),
        ...dictForCategory(personalityBlock, 'r'),
        ...dictForCategory(numberBlock, 'n'),
        ...dictationOther,
      ],
    },
  ],
  lesson_content: {
    vocabulary,
    sentences,
    grammar,
    stories: [laraStory],
  },
};

// fix duplicate type key in builder exercise
lesson.exercises[1] = {
  id: `${L}-builder`,
  type: 'sentence_builder',
  title: 'جمله‌سازی',
  presentation: 'text',
  difficulty: 'easy',
  items: builderItems,
};

const out = new URL('../content/evolve-1/lesson-02-02.json', import.meta.url);
writeFileSync(out, JSON.stringify(lesson, null, 2) + '\n', 'utf8');
console.log('Wrote', out.pathname, 'vocab', vocabulary.length);