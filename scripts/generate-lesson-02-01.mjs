/**
 * One-off generator for lesson 2.1 – A Family Party. Run: node scripts/generate-lesson-02-01.mjs
 */
import { writeFileSync } from 'node:fs';

const L = 'evolve-1-l02-01';

const familyBlock = [
  { word: 'family tree', ipa: '/ˈfæməli triː/', meaning: 'شجره‌نامه خانوادگی', category: 'Family' },
  { word: 'parent', ipa: '/ˈperənt/', meaning: 'والد', category: 'Family' },
  { word: 'parents', ipa: '/ˈperənts/', meaning: 'والدین', category: 'Family' },
  { word: 'father', ipa: '/ˈfɑːðər/', meaning: 'پدر', category: 'Family' },
  { word: 'dad', ipa: '/dæd/', meaning: 'بابا', category: 'Family' },
  { word: 'son', ipa: '/sʌn/', meaning: 'پسر', category: 'Family' },
  { word: 'daughter', ipa: '/ˈdɔːtər/', meaning: 'دختر', category: 'Family' },
  { word: 'child', ipa: '/tʃaɪld/', meaning: 'فرزند', category: 'Family' },
  { word: 'children', ipa: '/ˈtʃɪldrən/', meaning: 'فرزندان', category: 'Family' },
  { word: 'kid', ipa: '/kɪd/', meaning: 'بچه', category: 'Family' },
  { word: 'kids', ipa: '/kɪdz/', meaning: 'بچه‌ها', category: 'Family' },
  { word: 'brother', ipa: '/ˈbrʌðər/', meaning: 'برادر', category: 'Family' },
  { word: 'sister', ipa: '/ˈsɪstər/', meaning: 'خواهر', category: 'Family' },
  { word: 'siblings', ipa: '/ˈsɪblɪŋz/', meaning: 'خواهر و برادرها', category: 'Family' },
  { word: 'grandfather', ipa: '/ˈɡrænˌfɑːðər/', meaning: 'پدربزرگ', category: 'Family' },
  { word: 'grandmother', ipa: '/ˈɡrænˌmʌðər/', meaning: 'مادربزرگ', category: 'Family' },
  { word: 'grandparents', ipa: '/ˈɡrænˌperənts/', meaning: 'پدربزرگ و مادربزرگ', category: 'Family' },
  { word: 'grandpa', ipa: '/ˈɡrænpɑː/', meaning: 'پدربزرگ (خودمانی)', category: 'Family' },
  { word: 'grandma', ipa: '/ˈɡrænmɑː/', meaning: 'مادربزرگ (خودمانی)', category: 'Family' },
  { word: 'uncle', ipa: '/ˈʌŋkəl/', meaning: 'عمو، دایی', category: 'Family' },
  { word: 'aunt', ipa: '/ænt/', meaning: 'عمه، خاله', category: 'Family' },
  { word: 'cousin', ipa: '/ˈkʌzən/', meaning: 'عموزاده، دایی‌زاده و ...', category: 'Family' },
];

const numberBlock = [
  { word: 'eleven', ipa: '/ɪˈlevən/', meaning: 'یازده', category: 'Numbers' },
  { word: 'twelve', ipa: '/twɛlv/', meaning: 'دوازده', category: 'Numbers' },
  { word: 'thirteen', ipa: '/ˌθɝːˈtiːn/', meaning: 'سیزده', category: 'Numbers' },
  { word: 'fourteen', ipa: '/ˌfɔːrˈtiːn/', meaning: 'چهارده', category: 'Numbers' },
  { word: 'fifteen', ipa: '/ˌfɪfˈtiːn/', meaning: 'پانزده', category: 'Numbers' },
  { word: 'sixteen', ipa: '/ˌsɪksˈtiːn/', meaning: 'شانزده', category: 'Numbers' },
  { word: 'seventeen', ipa: '/ˌsevənˈtiːn/', meaning: 'هفده', category: 'Numbers' },
  { word: 'eighteen', ipa: '/ˌeɪˈtiːn/', meaning: 'هجده', category: 'Numbers' },
  { word: 'nineteen', ipa: '/ˌnaɪnˈtiːn/', meaning: 'نوزده', category: 'Numbers' },
  { word: 'twenty', ipa: '/ˈtwenti/', meaning: 'بیست', category: 'Numbers' },
  { word: 'twenty-one', ipa: '/ˌtwenti ˈwʌn/', meaning: 'بیست‌ویک', category: 'Numbers' },
  { word: 'twenty-two', ipa: '/ˌtwenti ˈtuː/', meaning: 'بیست‌ودو', category: 'Numbers' },
  { word: 'twenty-three', ipa: '/ˌtwenti ˈθriː/', meaning: 'بیست‌وسه', category: 'Numbers' },
  { word: 'thirty', ipa: '/ˈθɝːti/', meaning: 'سی', category: 'Numbers' },
  { word: 'thirty-two', ipa: '/ˌθɝːti ˈtuː/', meaning: 'سی‌ودو', category: 'Numbers' },
  { word: 'thirty-seven', ipa: '/ˌθɝːti ˈsevən/', meaning: 'سی‌وهفت', category: 'Numbers' },
  { word: 'forty', ipa: '/ˈfɔːrti/', meaning: 'چهل', category: 'Numbers' },
  { word: 'forty-two', ipa: '/ˌfɔːrti ˈtuː/', meaning: 'چهل‌ودو', category: 'Numbers' },
  { word: 'fifty', ipa: '/ˈfɪfti/', meaning: 'پنجاه', category: 'Numbers' },
  { word: 'fifty-eight', ipa: '/ˌfɪfti ˈeɪt/', meaning: 'پنجاه‌وهشت', category: 'Numbers' },
  { word: 'sixty', ipa: '/ˈsɪksti/', meaning: 'شصت', category: 'Numbers' },
  { word: 'sixty-one', ipa: '/ˌsɪksti ˈwʌn/', meaning: 'شصت‌ویک', category: 'Numbers' },
  { word: 'sixty-four', ipa: '/ˌsɪksti ˈfɔːr/', meaning: 'شصت‌وچهار', category: 'Numbers' },
  { word: 'seventy', ipa: '/ˈsevənti/', meaning: 'هفتاد', category: 'Numbers' },
  { word: 'eighty', ipa: '/ˈeɪti/', meaning: 'هشتاد', category: 'Numbers' },
  { word: 'eighty-six', ipa: '/ˌeɪti ˈsɪks/', meaning: 'هشتاد‌وشش', category: 'Numbers' },
  { word: 'eighty-seven', ipa: '/ˌeɪti ˈsevən/', meaning: 'هشتاد‌وهفت', category: 'Numbers' },
  { word: 'ninety', ipa: '/ˈnaɪnti/', meaning: 'نود', category: 'Numbers' },
  { word: 'one hundred', ipa: '/wʌn ˈhʌndrəd/', meaning: 'صد', category: 'Numbers' },
];

const otherWords = [
  { word: 'both', ipa: '/boʊθ/', meaning: 'هر دو' },
  { word: 'age', ipa: '/eɪdʒ/', meaning: 'سن' },
  { word: 'birthday', ipa: '/ˈbɝːθdeɪ/', meaning: 'تولد' },
  { word: 'formal', ipa: '/ˈfɔːrməl/', meaning: 'رسمی' },
  { word: 'informal', ipa: '/ɪnˈfɔːrməl/', meaning: 'غیررسمی' },
  { word: 'singular', ipa: '/ˈsɪŋɡjələr/', meaning: 'مفرد' },
  { word: 'plural', ipa: '/ˈplʊrəl/', meaning: 'جمع' },
  { word: 'describe', ipa: '/dɪˈskraɪb/', meaning: 'توصیف کردن' },
  { word: 'compare', ipa: '/kəmˈper/', meaning: 'مقایسه کردن' },
  { word: 'explain', ipa: '/ɪkˈspleɪn/', meaning: 'توضیح دادن' },
  { word: 'born', ipa: '/bɔːrn/', meaning: 'متولد شده' },
  { word: 'pass away', ipa: '/ˌpæs əˈweɪ/', meaning: 'فوت کردن (مؤدبانه)' },
  { word: 'tired', ipa: '/ˈtaɪərd/', meaning: 'خسته' },
  { word: 'angry', ipa: '/ˈæŋɡri/', meaning: 'عصبانی' },
  { word: 'hungry', ipa: '/ˈhʌŋɡri/', meaning: 'گرسنه' },
  { word: 'dead', ipa: '/ded/', meaning: 'مرده' },
  { word: 'alive', ipa: '/əˈlaɪv/', meaning: 'زنده' },
  { word: 'at home', ipa: '/æt hoʊm/', meaning: 'در خانه' },
  { word: 'at work', ipa: '/æt wɝːk/', meaning: 'سر کار' },
  { word: 'how old', ipa: '/haʊ oʊld/', meaning: 'چند ساله' },
  { word: 'man', ipa: '/mæn/', meaning: 'مرد' },
  { word: 'woman', ipa: '/ˈwʊmən/', meaning: 'زن' },
  { word: 'women', ipa: '/ˈwɪmɪn/', meaning: 'زن‌ها' },
  { word: 'foot', ipa: '/fʊt/', meaning: 'پا' },
  { word: 'feet', ipa: '/fiːt/', meaning: 'پاها' },
  { word: 'tooth', ipa: '/tuːθ/', meaning: 'دندان' },
  { word: 'teeth', ipa: '/tiːθ/', meaning: 'دندان‌ها' },
  { word: 'mouse', ipa: '/maʊs/', meaning: 'موش' },
  { word: 'mice', ipa: '/maɪs/', meaning: 'موش‌ها' },
  { word: 'goose', ipa: '/ɡuːs/', meaning: 'غاز' },
  { word: 'geese', ipa: '/ɡiːs/', meaning: 'غازها' },
  { word: 'men', ipa: '/men/', meaning: 'مردان' },
];

const vocabulary = [...familyBlock, ...numberBlock, ...otherWords];

const sentences = [
  { en: 'What a great party!', fa: 'چه مهمانی فوق‌العاده‌ای!' },
  { en: 'Are your children here?', fa: 'آیا فرزندانت اینجا هستند؟' },
  { en: 'Yes, they are.', fa: 'بله، هستند.' },
  { en: "He's my son.", fa: 'او پسر من است.' },
  { en: "He's eight.", fa: 'او هشت ساله است.' },
  { en: "She's my daughter.", fa: 'او دختر من است.' },
  { en: "She's ten.", fa: 'او ده ساله است.' },
  { en: 'Is he your husband?', fa: 'آیا او شوهر تو است؟' },
  { en: "He's my brother Marcus.", fa: 'او برادرم مارکوس است.' },
  { en: "My husband isn't here.", fa: 'شوهرم اینجا نیست.' },
  { en: 'Are your parents here?', fa: 'آیا والدینت اینجا هستند؟' },
  { en: "Here's my grandmother.", fa: 'این هم مادربزرگ من.' },
  { en: 'Nice to meet you.', fa: 'از آشنایی با شما خوشبختم.' },
  { en: 'Are you both Elizabeth?', fa: 'آیا هر دوی شما الیزابت هستید؟' },
  { en: 'Yes, we are.', fa: 'بله، همین‌طور است.' },
  { en: 'Is your mother at home?', fa: 'آیا مادرت در خانه است؟' },
  { en: 'They were tired.', fa: 'آن‌ها خسته بودند.' },
  { en: 'She was born in 1999.', fa: 'او در سال ۱۹۹۹ متولد شد.' },
  { en: 'How old are you?', fa: 'چند سال داری؟' },
  { en: 'Where is your mother?', fa: 'مادرت کجاست؟' },
  { en: 'Who is your brother?', fa: 'برادرت کیست؟' },
  { en: 'Yes, he is.', fa: 'بله، هست.' },
  { en: "No, he isn't.", fa: 'نه، نیست.' },
  { en: 'Yes, she is.', fa: 'بله، هست.' },
  { en: "No, she isn't.", fa: 'نه، نیست.' },
  { en: "No, they aren't.", fa: 'نه، نیستند.' },
  { en: "No, I'm not.", fa: 'نه، نیستم.' },
];

const grammar = [
  {
    title: 'جملهٔ خبری با am / is / are',
    explanation:
      'برای گفتن وضعیت یا هویت، بعد از فاعل از am (برای I)، is (برای he/she/it) و are (برای you/we/they) استفاده می‌کنیم.',
    examples: [
      { en: "He's my son.", fa: 'او پسر من است.' },
      { en: "She's my daughter.", fa: 'او دختر من است.' },
      { en: 'Are your parents here?', fa: 'آیا والدینت اینجا هستند؟' },
    ],
  },
  {
    title: 'سؤال بله / خیر با am / is / are',
    explanation: 'برای سؤال، فعل بودن را قبل از فاعل می‌آوریم و در پایان علامت سؤال می‌گذاریم.',
    examples: [
      { en: 'Are your children here?', fa: 'آیا فرزندانت اینجا هستند؟' },
      { en: 'Is he your husband?', fa: 'آیا او شوهر تو است؟' },
      { en: 'Is your mother at home?', fa: 'آیا مادرت در خانه است؟' },
    ],
  },
  {
    title: 'پاسخ کوتاه',
    explanation: 'در پاسخ کوتاه، همان فعل بودن را تکرار می‌کنیم؛ در جواب منفی از not یا شکل مخفف آن استفاده می‌کنیم.',
    examples: [
      { en: 'Yes, they are.', fa: 'بله، هستند.' },
      { en: "No, he isn't.", fa: 'نه، نیست.' },
      { en: "No, I'm not.", fa: 'نه، نیستم.' },
    ],
  },
  {
    title: 'گذشتهٔ فعل بودن: was / were',
    explanation: 'برای زمان گذشته به‌جای am/is/are از was (اکثر ضمایر مفرد) و were (you و جمع) استفاده می‌شود.',
    examples: [
      { en: 'She was born in 1999.', fa: 'او در سال ۱۹۹۹ متولد شد.' },
      { en: 'They were tired.', fa: 'آن‌ها خسته بودند.' },
    ],
  },
  {
    title: 'سؤالات WH با فعل بودن',
    explanation: 'کلمهٔ پرسشی (مثل who، where، how old) ابتدای جمله می‌آید و بعد am/is/are و فاعل قرار می‌گیرد.',
    examples: [
      { en: 'How old are you?', fa: 'چند سال داری؟' },
      { en: 'Where is your mother?', fa: 'مادرت کجاست؟' },
      { en: 'Who is your brother?', fa: 'برادرت کیست؟' },
    ],
  },
];

const partyStory = {
  title: 'مکالمه: مهمانی خانوادگی',
  lines: [
    { en: 'What a great party!', fa: 'چه مهمانی فوق‌العاده‌ای!' },
    { en: 'Are your children here?', fa: 'آیا فرزندانت اینجا هستند؟' },
    { en: 'Yes, they are.', fa: 'بله، هستند.' },
    { en: "He's my son.", fa: 'او پسر من است.' },
    { en: "He's eight.", fa: 'او هشت ساله است.' },
    { en: "She's my daughter.", fa: 'او دختر من است.' },
    { en: "She's ten.", fa: 'او ده ساله است.' },
    { en: 'Is he your husband?', fa: 'آیا او شوهر تو است؟' },
    { en: "He's my brother Marcus.", fa: 'او برادرم مارکوس است.' },
    { en: "My husband isn't here.", fa: 'شوهرم اینجا نیست.' },
    { en: 'Are your parents here?', fa: 'آیا والدینت اینجا هستند؟' },
    { en: "Here's my grandmother.", fa: 'این هم مادربزرگ من.' },
    { en: 'Nice to meet you.', fa: 'از آشنایی با شما خوشبختم.' },
    { en: 'Are you both Elizabeth?', fa: 'آیا هر دوی شما الیزابت هستید؟' },
    { en: 'Yes, we are.', fa: 'بله، همین‌طور است.' },
  ],
};

const tr = (id, n, en, fa, extra = {}) => ({
  id: `${L}-tr-${String(n).padStart(2, '0')}`,
  expected_answer: en,
  translation: fa,
  question: fa,
  time_limit: 60,
  explanation: 'به ترتیب کلمات و فعل بودن توجه کن.',
  hint: extra.hint ?? 'ساختار سؤال یا جملهٔ خبری با فعل بودن را در نظر بگیر.',
  ...extra,
});

const translationItems = [
  tr(0, 1, 'What a great party!', 'چه مهمانی فوق‌العاده‌ای!', { hint: 'great = عالی؛ party = مهمانی (درس قبل)' }),
  tr(0, 2, 'Are your children here?', 'آیا فرزندانت اینجا هستند؟', {
    accepted_answers: ['Are your children here?'],
    group: 'Family',
    hint: 'children = فرزندان؛ سؤال با Are شروع می‌شود.',
  }),
  tr(0, 3, 'Yes, they are.', 'بله، هستند.'),
  tr(0, 4, "He's my son.", 'او پسر من است.', {
    accepted_answers: ['He is my son.'],
    group: 'Family',
    hint: 'son = پسر',
  }),
  tr(0, 5, "He's eight.", 'او هشت ساله است.', { accepted_answers: ['He is eight.'] }),
  tr(0, 6, "She's my daughter.", 'او دختر من است.', {
    accepted_answers: ['She is my daughter.'],
    group: 'Family',
    hint: 'daughter = دختر',
  }),
  tr(0, 7, "She's ten.", 'او ده ساله است.', { accepted_answers: ['She is ten.'] }),
  tr(0, 8, 'Is he your husband?', 'آیا او شوهر تو است؟'),
  tr(0, 9, "He's my brother Marcus.", 'او برادرم مارکوس است.', {
    accepted_answers: ['He is my brother Marcus.'],
    group: 'Family',
    hint: 'brother = برادر',
  }),
  tr(0, 10, "My husband isn't here.", 'شوهرم اینجا نیست.', {
    accepted_answers: ['My husband is not here.'],
    hint: 'ساختار منفی با isn\'t',
  }),
  tr(0, 11, 'Are your parents here?', 'آیا والدینت اینجا هستند؟', { group: 'Family', hint: 'parents = والدین' }),
  tr(0, 12, "Here's my grandmother.", 'این هم مادربزرگ من.', {
    accepted_answers: ['Here is my grandmother.'],
    group: 'Family',
    hint: 'grandmother = مادربزرگ',
  }),
  tr(0, 13, 'Nice to meet you.', 'از آشنایی با شما خوشبختم.'),
  tr(0, 14, 'Are you both Elizabeth?', 'آیا هر دوی شما الیزابت هستید؟', { hint: 'both = هر دو' }),
  tr(0, 15, 'Yes, we are.', 'بله، همین‌طور است.'),
  tr(0, 16, 'Is your mother at home?', 'آیا مادرت در خانه است؟', {
    accepted_answers: ['Is your mother at home?'],
    hint: 'at home = در خانه',
  }),
  tr(0, 17, 'They were tired.', 'آن‌ها خسته بودند.', { hint: 'was/were برای گذشتهٔ فعل بودن' }),
  tr(0, 18, 'She was born in 1999.', 'او در سال ۱۹۹۹ متولد شد.', { hint: 'born = متولد شده' }),
  tr(0, 19, 'How old are you?', 'چند سال داری؟', { hint: 'how old = چند ساله' }),
];

const builderItems = [
  {
    id: `${L}-sb-01`,
    expected_answer: 'Are your children here?',
    translation: 'آیا فرزندانت اینجا هستند؟',
    question: 'کلمات را به ترتیب درست مرتب کن و جمله بساز.',
    hint: 'سؤال با Are شروع می‌شود.',
    word_bank: ['Are', 'your', 'children', 'here?'],
    group: 'Family',
    time_limit: 60,
    explanation: 'در سؤال، فعل بودن قبل از فاعل می‌آید.',
  },
  {
    id: `${L}-sb-02`,
    expected_answer: "He's my son.",
    translation: 'او پسر من است.',
    question: 'کلمات را به ترتیب درست مرتب کن و جمله بساز.',
    hint: 'فاعل و فعل را کنار هم بگذار.',
    word_bank: ["He's", 'my', 'son.'],
    group: 'Family',
    time_limit: 60,
    explanation: 'جملهٔ خبری: فاعل + فعل بودن + بقیه.',
  },
  {
    id: `${L}-sb-03`,
    expected_answer: 'Is he your husband?',
    translation: 'آیا او شوهر تو است؟',
    question: 'کلمات را به ترتیب درست مرتب کن و جمله بساز.',
    hint: 'سؤال با Is شروع می‌شود.',
    word_bank: ['Is', 'he', 'your', 'husband?'],
    time_limit: 60,
    explanation: 'برای سؤال بله/خیر، is را قبل از he می‌آوریم.',
  },
  {
    id: `${L}-sb-04`,
    expected_answer: 'How old are you?',
    translation: 'چند سال داری؟',
    question: 'کلمات را به ترتیب درست مرتب کن و جمله بساز.',
    hint: 'how old = چند ساله',
    word_bank: ['How', 'old', 'are', 'you?'],
    time_limit: 60,
    explanation: 'سؤال WH: how old + are + you',
  },
];

const dictationFamily = familyBlock.map((entry, i) => ({
  id: `${L}-dic-f-${String(i + 1).padStart(2, '0')}`,
  expected_answer: entry.word,
  translation: entry.meaning,
  question: entry.word,
  hint: entry.meaning,
  presentation: 'audio',
  group: 'Family',
  time_limit: 60,
  explanation: 'به ترتیب حروف و شکل نوشتاری واژه توجه کن.',
}));

const dictationNumbers = numberBlock.map((entry, i) => ({
  id: `${L}-dic-n-${String(i + 1).padStart(2, '0')}`,
  expected_answer: entry.word,
  translation: entry.meaning,
  question: entry.word,
  hint: entry.meaning,
  presentation: 'audio',
  group: 'Numbers',
  time_limit: 60,
  explanation: 'به تلفظ عدد و خط فاصله در اعداد مرکب توجه کن.',
}));

const dictationOther = [
  'both',
  'birthday',
  'formal',
  'informal',
  'singular',
  'plural',
  'describe',
  'compare',
  'born',
  'pass away',
  'tired',
  'angry',
  'hungry',
  'dead',
  'alive',
].map((word, i) => {
  const entry = vocabulary.find((v) => v.word === word);
  return {
    id: `${L}-dic-o-${String(i + 1).padStart(2, '0')}`,
    expected_answer: word,
    translation: entry.meaning,
    question: word,
    hint: entry.meaning,
    presentation: 'audio',
    time_limit: 60,
    explanation: 'املای واژه را با دقت بنویس.',
  };
});

const pluralItems = [
  ['child', 'children'],
  ['man', 'men'],
  ['woman', 'women'],
  ['foot', 'feet'],
  ['tooth', 'teeth'],
  ['mouse', 'mice'],
  ['goose', 'geese'],
  ['brother', 'brothers'],
  ['sister', 'sisters'],
  ['cousin', 'cousins'],
].map(([sing, plur], i) => {
  const familySing = new Set(['child', 'brother', 'sister', 'cousin']);
  return {
    id: `${L}-voc-pl-${String(i + 1).padStart(2, '0')}`,
    question: `Plural: ${sing}`,
    expected_answer: plur,
    translation: vocabulary.find((v) => v.word === plur)?.meaning ?? plur,
    hint: 'شکل جمع نامنظم یا با s',
    time_limit: 60,
    explanation: `${sing} → ${plur}`,
    ...(familySing.has(sing) ? { group: 'Family' } : {}),
  };
});

const synonymItems = [
  ['dad', 'father', 'Family'],
  ['grandpa', 'grandfather', 'Family'],
  ['grandma', 'grandmother', 'Family'],
  ['kid', 'child', 'Family'],
].map(([from, to, group], i) => ({
  id: `${L}-voc-syn-${String(i + 1).padStart(2, '0')}`,
  question: `Synonym: ${from}`,
  expected_answer: to,
  translation: vocabulary.find((v) => v.word === to).meaning,
  hint: `معنی ${from} را در نظر بگیر`,
  group,
  time_limit: 60,
  explanation: `${from} و ${to} در این درس نزدیک به هم‌معنی‌اند.`,
}));

const oppositeItems = [
  ['formal', 'informal'],
  ['dead', 'alive'],
  ['singular', 'plural'],
].map(([from, to], i) => ({
  id: `${L}-voc-opp-${String(i + 1).padStart(2, '0')}`,
  question: `Opposite: ${from}`,
  expected_answer: to,
  translation: vocabulary.find((v) => v.word === to).meaning,
  hint: 'متضاد واژه را انتخاب کن',
  time_limit: 60,
  explanation: `${from} ↔ ${to}`,
}));

const grammarCorrection = [
  {
    id: `${L}-gc-01`,
    incorrect_sentence: 'She are my daughter.',
    expected_answer: "She's my daughter.",
    accepted_answers: ['She is my daughter.'],
    translation: 'او دختر من است.',
    question: 'جملهٔ اشتباه را اصلاح کن.',
    hint: 'بعد از She فعل is می‌آید.',
    time_limit: 60,
    explanation: 'She با is قرار می‌گیرد، نه are.',
  },
  {
    id: `${L}-gc-02`,
    incorrect_sentence: 'They was tired.',
    expected_answer: 'They were tired.',
    translation: 'آن‌ها خسته بودند.',
    question: 'جملهٔ اشتباه را اصلاح کن.',
    hint: 'they با were در گذشته می‌آید.',
    time_limit: 60,
    explanation: 'با they در گذشته were می‌آید، نه was.',
  },
  {
    id: `${L}-gc-03`,
    incorrect_sentence: 'Is your children here?',
    expected_answer: 'Are your children here?',
    translation: 'آیا فرزندانت اینجا هستند؟',
    question: 'جملهٔ اشتباه را اصلاح کن.',
    hint: 'children جمع است.',
    time_limit: 60,
    explanation: 'children جمع است، پس Are می‌آید.',
    group: 'Family',
  },
];

const negativeItems = [
  {
    id: `${L}-neg-01`,
    operation: 'negative',
    question: "جمله را منفی کن: He's my son.",
    expected_answer: "He isn't my son.",
    accepted_answers: ['He is not my son.'],
    translation: 'او پسر من نیست.',
    hint: 'not را بعد از is بگذار.',
    time_limit: 60,
    explanation: "منفی: isn't یا is not",
    group: 'Family',
  },
];

const questionItems = [
  {
    id: `${L}-q-01`,
    operation: 'question',
    question: 'جمله را سؤالی کن: He is your husband.',
    expected_answer: 'Is he your husband?',
    translation: 'آیا او شوهر تو است؟',
    hint: 'Is را قبل از he بیاور.',
    time_limit: 60,
    explanation: 'فعل بودن را به ابتدای جمله منتقل کن.',
  },
  {
    id: `${L}-q-02`,
    operation: 'question',
    question: 'جمله را سؤالی کن: Your parents are here.',
    expected_answer: 'Are your parents here?',
    translation: 'آیا والدینت اینجا هستند؟',
    hint: 'parents جمع است.',
    time_limit: 60,
    explanation: 'Are قبل از فاعل می‌آید.',
    group: 'Family',
  },
];

const multipleChoice = [
  {
    id: `${L}-mc-01`,
    question: 'کدام جمله درست است؟',
    expected_answer: 'Are your children here?',
    translation: 'آیا فرزندانت اینجا هستند؟',
    hint: 'children با are می‌آید.',
    options: ['Is your children here?', 'Are your children here?', 'Are your child here?'],
    time_limit: 60,
    explanation: 'children جمع است.',
    group: 'Family',
  },
  {
    id: `${L}-mc-02`,
    question: 'پاسخ کوتاه منفی درست کدام است؟ (Is he your husband?)',
    expected_answer: "No, he isn't.",
    accepted_answers: ['No, he is not.'],
    translation: 'نه، نیست.',
    hint: 'در پاسخ منفی از isn\'t استفاده کن.',
    options: ["No, he isn't.", 'No, he are not.', "No, he don't."],
    time_limit: 60,
    explanation: 'he با isn\'t',
  },
  {
    id: `${L}-mc-03`,
    question: 'جمع کلمه child چیست؟',
    expected_answer: 'children',
    translation: 'فرزندان',
    hint: 'جمع نامنظم',
    options: ['childs', 'children', 'childes'],
    time_limit: 60,
    explanation: 'child → children',
    group: 'Family',
  },
  {
    id: `${L}-mc-04`,
    question: 'عدد ۱۳ کدام است؟',
    expected_answer: 'thirteen',
    translation: 'سیزده',
    hint: 'با -teen برای ۱۳ تا ۱۹',
    options: ['thirty', 'thirteen', 'three'],
    time_limit: 60,
    explanation: '13 = thirteen؛ 30 = thirty',
    group: 'Numbers',
  },
];

const lesson = {
  schema_version: '2.0',
  book: 'evolve-1',
  lesson: 'lesson-02-01',
  title: 'Lesson 2.1 – A Family Party',
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
      title: 'منفی و سؤالی کردن',
      presentation: 'text',
      difficulty: 'easy',
      items: [...negativeItems, ...questionItems],
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
      title: 'مترادف، متضاد و جمع',
      presentation: 'text',
      difficulty: 'easy',
      items: [...synonymItems, ...oppositeItems, ...pluralItems],
    },
    {
      id: `${L}-dictation`,
      type: 'dictation',
      title: 'املای واژه‌ها و اعداد',
      presentation: 'audio',
      difficulty: 'easy',
      items: [...dictationFamily, ...dictationNumbers, ...dictationOther],
    },
  ],
  lesson_content: {
    vocabulary,
    sentences,
    grammar,
    stories: [partyStory],
  },
};

const out = new URL('../content/evolve-1/lesson-02-01.json', import.meta.url);
writeFileSync(out, JSON.stringify(lesson, null, 2) + '\n', 'utf8');
console.log('Wrote', out.pathname, 'vocab', vocabulary.length, 'items', lesson.exercises.reduce((n, e) => n + e.items.length, 0));