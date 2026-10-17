// Builds beginner_question_bank.json from the hand-written lists below.
// Run: node tools/build-beginner-bank.mjs
// Short sentences only; topics: to_be and do_does; question types: all five grammar types.
// glossary = key English words with their Persian meaning ("word=meaning | word2=meaning2").

import { writeFileSync } from 'node:fs';

const OUT = new URL('../beginner_question_bank.json', import.meta.url);

const TIME_LIMIT = {
  quick_translation: 25,
  sentence_builder: 40,
  grammar_correction: 30,
  multiple_choice: 15,
  positive_negative_question: 25,
};

const PN_INSTRUCTION = {
  positive: 'جمله را مثبت کن:',
  negative: 'جمله را منفی کن:',
  question: 'جمله را سؤالی کن:',
};

const SB_PREFIX = 'این جمله را با کلمات بساز:';
const GC_PREFIX = 'جمله‌ی اشتباه را درست کن:';

const parseGlossary = (text = '') =>
  text
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((pair) => {
      const at = pair.indexOf('=');
      return { word: pair.slice(0, at).trim(), meaning: pair.slice(at + 1).trim() };
    });

const parseAlt = (text = '') =>
  text
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

// Word bank: the words in reverse order, plus the final punctuation as its own token.
function buildWordBank(sentence) {
  const match = sentence.match(/[.?!]$/);
  const punct = match ? match[0] : '';
  const words = sentence.slice(0, sentence.length - punct.length).trim().split(/\s+/);
  return [...words.reverse(), ...(punct ? [punct] : [])];
}

const records = [];
const add = (fields) => {
  const id = `b${String(records.length + 1).padStart(3, '0')}`;
  records.push({
    id,
    difficulty: 'easy',
    ...fields,
    points: 10,
    time_limit: TIME_LIMIT[fields.category],
    enabled: true,
  });
};

// [topic, Persian sentence, English answer, glossary, explanation, alternatives]
const QUICK_TRANSLATION = [
  ['to_be', 'من معلم هستم.', 'I am a teacher.', 'teacher=معلم', 'برای I از am استفاده می‌کنیم.', ''],
  ['to_be', 'او دانشجو است.', 'He is a student.', 'student=دانشجو', 'برای he از is استفاده می‌کنیم.', ''],
  ['to_be', 'ما خوشحالیم.', 'We are happy.', 'happy=خوشحال', 'برای we از are استفاده می‌کنیم.', ''],
  ['to_be', 'آن‌ها خسته‌اند.', 'They are tired.', 'tired=خسته', 'برای they از are استفاده می‌کنیم.', ''],
  ['to_be', 'تو مهربان هستی.', 'You are kind.', 'kind=مهربان', 'برای you از are استفاده می‌کنیم.', ''],
  ['to_be', 'من اهل گیلان هستم.', 'I am from Gilan.', 'from=از، اهل | Gilan=گیلان', 'from یعنی «از» یا «اهل».', ''],
  ['to_be', 'او پزشک نیست.', "He isn't a doctor.", 'doctor=پزشک', 'منفی is می‌شود isn’t.', 'He is not a doctor.'],
  ['to_be', 'ما گرسنه نیستیم.', "We aren't hungry.", 'hungry=گرسنه', 'منفی are می‌شود aren’t.', 'We are not hungry.'],
  ['to_be', 'من خسته نیستم.', 'I am not tired.', 'tired=خسته', 'منفی am می‌شود am not.', ''],
  ['to_be', 'اسم من علی است.', 'My name is Ali.', 'name=اسم', 'برای گفتن اسم از is استفاده می‌کنیم.', ''],
  ['to_be', 'امروز هوا گرم است.', 'It is hot today.', 'hot=گرم | today=امروز', 'برای it از is استفاده می‌کنیم.', ''],
  ['to_be', 'آیا تو معلم هستی؟', 'Are you a teacher?', 'teacher=معلم', 'در سؤال، are به اول جمله می‌آید.', ''],
  ['to_be', 'آن کتاب جدید است.', 'That book is new.', 'new=جدید | book=کتاب', 'برای that از is استفاده می‌کنیم.', ''],
  ['to_be', 'کیف من سنگین است.', 'My bag is heavy.', 'bag=کیف | heavy=سنگین', 'برای my bag از is استفاده می‌کنیم.', ''],
  ['to_be', 'آن‌ها مشغول نیستند.', "They aren't busy.", 'busy=مشغول', 'منفی are می‌شود aren’t.', 'They are not busy.'],
  ['to_be', 'من در تهران هستم.', 'I am in Tehran.', 'in=در | Tehran=تهران', 'برای گفتن جای بودن از in استفاده می‌کنیم.', ''],
  ['to_be', 'او بیمار نیست.', "He isn't sick.", 'sick=بیمار', 'منفی is می‌شود isn’t.', 'He is not sick.'],
  ['to_be', 'شما دوست من هستید.', 'You are my friend.', 'friend=دوست', 'برای you از are استفاده می‌کنیم.', ''],
  ['to_be', 'ما در خانه هستیم.', 'We are at home.', 'home=خانه | at=در', 'برای گفتن جای بودن از are at استفاده می‌کنیم.', ''],
  ['to_be', 'آیا او بلند است؟', 'Is she tall?', 'tall=بلند', 'در سؤال، is به اول جمله می‌آید.', ''],
  ['do_does', 'من در آلمان کار می‌کنم.', 'I work in Germany.', 'work=کار کردن | Germany=آلمان', 'برای I فعل بدون s است.', ''],
  ['do_does', 'او در ایران زندگی می‌کند.', 'He lives in Iran.', 'live=زندگی کردن | Iran=ایران', 'برای he فعل live می‌شود lives.', ''],
  ['do_does', 'آن‌ها انگلیسی صحبت می‌کنند.', 'They speak English.', 'speak=صحبت کردن', 'برای they فعل بدون s است.', ''],
  ['do_does', 'ما شب‌ها درس می‌خوانیم.', 'We study at night.', 'study=درس خواندن | night=شب', 'برای we فعل بدون s است.', ''],
  ['do_does', 'او قهوه نمی‌نوشد.', "She doesn't drink coffee.", 'drink=نوشیدن | coffee=قهوه', 'بعد از doesn’t فعل بدون s می‌آید.', 'She does not drink coffee.'],
  ['do_does', 'من امروز کار نمی‌کنم.', "I don't work today.", 'work=کار کردن | today=امروز', 'بعد از don’t فعل بدون s می‌آید.', 'I do not work today.'],
  ['do_does', 'آیا تو در گیلان زندگی می‌کنی؟', 'Do you live in Gilan?', 'live=زندگی کردن | Gilan=گیلان', 'در سؤال با you از Do استفاده می‌کنیم.', ''],
  ['do_does', 'آیا او انگلیسی بلد است؟', 'Does he speak English?', 'speak=صحبت کردن', 'در سؤال با he از Does استفاده می‌کنیم و فعل بدون s است.', ''],
  ['do_does', 'آن‌ها در آلمان زندگی نمی‌کنند.', "They don't live in Germany.", 'live=زندگی کردن | Germany=آلمان', 'بعد از don’t فعل بدون s می‌آید.', 'They do not live in Germany.'],
  ['do_does', 'او هر روز ورزش می‌کند.', 'He exercises every day.', 'exercise=ورزش کردن | every day=هر روز', 'برای he در جمله‌ی مثبت فعل s می‌گیرد.', ''],
  ['do_does', 'من کتاب می‌خوانم.', 'I read books.', 'read=خواندن | book=کتاب', 'برای I فعل بدون s است.', ''],
  ['do_does', 'آن‌ها ساعت نه می‌روند.', 'They leave at nine.', 'leave=رفتن، ترک کردن', 'برای they فعل بدون s است.', ''],
  ['do_does', 'او به مدرسه می‌رود.', 'She goes to school.', 'go=رفتن | school=مدرسه', 'برای she، go می‌شود goes.', ''],
  ['do_does', 'او ماشین ندارد.', "He doesn't have a car.", 'have=داشتن | car=ماشین', 'بعد از doesn’t فعل بدون s می‌آید.', 'He does not have a car.'],
  ['do_does', 'آیا آن‌ها امروز می‌آیند؟', 'Do they come today?', 'come=آمدن | today=امروز', 'در سؤال با they از Do استفاده می‌کنیم.', ''],
  ['do_does', 'من موسیقی گوش نمی‌دهم.', "I don't listen to music.", 'listen=گوش دادن | music=موسیقی', 'بعد از don’t فعل بدون s می‌آید.', 'I do not listen to music.'],
  ['do_does', 'او ساعت هفت بیدار می‌شود.', 'He wakes up at seven.', 'wake up=بیدار شدن', 'برای he، wake می‌شود wakes.', ''],
  ['do_does', 'شما ایمیل می‌فرستید؟', 'Do you send emails?', 'send=فرستادن | email=ایمیل', 'در سؤال با you از Do استفاده می‌کنیم.', ''],
  ['do_does', 'او اغلب تلویزیون تماشا می‌کند.', 'He often watches TV.', 'watch=تماشا کردن | TV=تلویزیون | often=اغلب', 'برای he، watch می‌شود watches.', ''],
  ['do_does', 'تو هر شب به خانه می‌آیی.', 'You come home every night.', 'come=آمدن | home=خانه | every night=هر شب', 'برای you فعل بدون s است.', ''],
];

// [topic, Persian sentence, English answer, glossary, explanation, alternatives]
const SENTENCE_BUILDER = [
  ['to_be', 'من دانشجو هستم.', 'I am a student.', 'student=دانشجو', 'اول I و بعد am می‌آید.', ''],
  ['to_be', 'او خسته است.', 'She is tired.', 'tired=خسته', 'برای she از is استفاده می‌کنیم.', ''],
  ['to_be', 'ما خوشحالیم.', 'We are happy.', 'happy=خوشحال', 'برای we از are استفاده می‌کنیم.', ''],
  ['to_be', 'او در خانه نیست.', "He isn't at home.", 'home=خانه', 'منفی is می‌شود isn’t.', 'He is not at home.'],
  ['to_be', 'آیا آن‌ها معلم هستند؟', 'Are they teachers?', 'teacher=معلم', 'در سؤال، are اول جمله می‌آید.', ''],
  ['to_be', 'آیا او دوست تو است؟', 'Is he your friend?', 'friend=دوست | your=تو، مال تو', 'در سؤال، is اول جمله می‌آید.', ''],
  ['to_be', 'تو دیر نیستی.', "You aren't late.", 'late=دیر', 'منفی are می‌شود aren’t.', 'You are not late.'],
  ['to_be', 'امروز هوا سرد است.', 'It is cold today.', 'cold=سرد | today=امروز', 'برای it از is استفاده می‌کنیم.', ''],
  ['to_be', 'آیا او مشغول نیست؟', "Isn't she busy?", 'busy=مشغول', 'سؤال منفی: Isn’t اول جمله می‌آید.', ''],
  ['to_be', 'اسم من سارا است.', 'My name is Sara.', 'name=اسم', 'برای گفتن اسم از is استفاده می‌کنیم.', ''],
  ['do_does', 'آن‌ها در آلمان کار می‌کنند.', 'They work in Germany.', 'work=کار کردن | Germany=آلمان', 'برای they فعل بدون s است.', ''],
  ['do_does', 'او چای نمی‌نوشد.', "He doesn't drink tea.", 'drink=نوشیدن | tea=چای', 'بعد از doesn’t فعل بدون s می‌آید.', 'He does not drink tea.'],
  ['do_does', 'آیا او اینجا زندگی می‌کند؟', 'Does she live here?', 'live=زندگی کردن | here=اینجا', 'در سؤال با she از Does استفاده می‌کنیم.', ''],
  ['do_does', 'ما هر روز انگلیسی می‌خوانیم.', 'We study English every day.', 'study=درس خواندن | every day=هر روز', 'برای we فعل بدون s است.', ''],
  ['do_does', 'من روسی صحبت نمی‌کنم.', "I don't speak Russian.", 'speak=صحبت کردن | Russian=روسی', 'بعد از don’t فعل بدون s می‌آید.', 'I do not speak Russian.'],
  ['do_does', 'آیا تو موسیقی دوست داری؟', 'Do you like music?', 'like=دوست داشتن | music=موسیقی', 'در سؤال با you از Do استفاده می‌کنیم.', ''],
  ['do_does', 'او با اتوبوس به مدرسه می‌رود.', 'She goes to school by bus.', 'go=رفتن | school=مدرسه | bus=اتوبوس', 'برای she، go می‌شود goes.', ''],
  ['do_does', 'او ماشین ندارد.', "He doesn't have a car.", 'have=داشتن | car=ماشین', 'بعد از doesn’t فعل بدون s می‌آید.', 'He does not have a car.'],
  ['do_does', 'آیا برادرت شب‌ها کار می‌کند؟', 'Does your brother work at night?', 'brother=برادر | night=شب | work=کار کردن', 'در سؤال با Does فعل بدون s است.', ''],
  ['do_does', 'آن‌ها گوشت نمی‌خورند.', "They don't eat meat.", 'eat=خوردن | meat=گوشت', 'بعد از don’t فعل بدون s می‌آید.', 'They do not eat meat.'],
];

// [topic, wrong sentence, correct sentence, glossary, explanation, alternatives]
const GRAMMAR_CORRECTION = [
  ['to_be', 'I is a teacher.', 'I am a teacher.', 'teacher=معلم', 'برای I فقط am درست است.', ''],
  ['to_be', 'She are happy.', 'She is happy.', 'happy=خوشحال', 'برای she از is استفاده می‌کنیم.', ''],
  ['to_be', 'They is students.', 'They are students.', 'student=دانشجو', 'برای they از are استفاده می‌کنیم.', ''],
  ['to_be', 'He not is tired.', 'He is not tired.', 'tired=خسته', 'ترتیب درست: He is not tired.', "He isn't tired."],
  ['to_be', 'Are she a doctor?', 'Is she a doctor?', 'doctor=پزشک', 'در سؤال با she از is استفاده می‌کنیم.', ''],
  ['to_be', 'You is my friend.', 'You are my friend.', 'friend=دوست', 'برای you از are استفاده می‌کنیم.', ''],
  ['to_be', 'We is at home.', 'We are at home.', 'home=خانه', 'برای we از are استفاده می‌کنیم.', ''],
  ['to_be', 'Is they busy?', 'Are they busy?', 'busy=مشغول', 'برای they از are استفاده می‌کنیم.', ''],
  ['to_be', 'It are cold today.', 'It is cold today.', 'cold=سرد', 'برای it از is استفاده می‌کنیم.', ''],
  ['to_be', 'Am you tired?', 'Are you tired?', 'tired=خسته', 'برای you از are استفاده می‌کنیم.', ''],
  ['do_does', "She don't like coffee.", "She doesn't like coffee.", 'like=دوست داشتن | coffee=قهوه', 'برای she از doesn’t استفاده می‌کنیم.', 'She does not like coffee.'],
  ['do_does', 'He work in Iran.', 'He works in Iran.', 'work=کار کردن | Iran=ایران', 'برای he، work می‌شود works.', ''],
  ['do_does', 'Does he works here?', 'Does he work here?', 'work=کار کردن | here=اینجا', 'بعد از Does فعل بدون s می‌آید.', ''],
  ['do_does', "They doesn't live in Gilan.", "They don't live in Gilan.", 'live=زندگی کردن | Gilan=گیلان', 'برای they از don’t استفاده می‌کنیم.', ''],
  ['do_does', "I doesn't speak German.", "I don't speak German.", 'speak=صحبت کردن | German=آلمانی', 'برای I از don’t استفاده می‌کنیم.', ''],
  ['do_does', 'She study at night.', 'She studies at night.', 'study=درس خواندن | night=شب', 'برای she، study می‌شود studies.', ''],
  ['do_does', 'Do she live in Germany?', 'Does she live in Germany?', 'live=زندگی کردن | Germany=آلمان', 'در سؤال برای she از Does استفاده می‌کنیم.', ''],
  ['do_does', "He don't have a car.", "He doesn't have a car.", 'have=داشتن | car=ماشین', 'برای he از doesn’t استفاده می‌کنیم.', 'He does not have a car.'],
  ['do_does', "We doesn't eat meat.", "We don't eat meat.", 'eat=خوردن | meat=گوشت', 'برای we از don’t استفاده می‌کنیم.', ''],
  ['do_does', 'Does they like tea?', 'Do they like tea?', 'like=دوست داشتن | tea=چای', 'برای they در سؤال از Do استفاده می‌کنیم.', ''],
];

// [topic, sentence with ___, options separated by |, correct option, explanation, glossary]
const MULTIPLE_CHOICE = [
  ['to_be', 'I ___ a student.', 'is|am|are', 'am', 'برای I از am استفاده می‌کنیم.', ''],
  ['to_be', 'She ___ happy.', 'is|am|are', 'is', 'برای she از is استفاده می‌کنیم.', ''],
  ['to_be', 'They ___ at home.', 'is|are|am', 'are', 'برای they از are استفاده می‌کنیم.', 'home=خانه'],
  ['to_be', 'We ___ tired.', 'are|is|am', 'are', 'برای we از are استفاده می‌کنیم.', 'tired=خسته'],
  ['to_be', 'He ___ my brother.', 'are|is|am', 'is', 'برای he از is استفاده می‌کنیم.', 'brother=برادر'],
  ['to_be', '___ you a teacher?', 'Are|Is|Am', 'Are', 'در سؤال با you از are استفاده می‌کنیم.', 'teacher=معلم'],
  ['to_be', '___ she busy?', 'Are|Am|Is', 'Is', 'در سؤال با she از is استفاده می‌کنیم.', 'busy=مشغول'],
  ['to_be', 'It ___ hot today.', 'are|is|am', 'is', 'برای it از is استفاده می‌کنیم.', 'hot=گرم'],
  ['to_be', 'I ___ not hungry.', 'is|am|are', 'am', 'برای I از am استفاده می‌کنیم.', 'hungry=گرسنه'],
  ['to_be', 'My friends ___ kind.', 'is|am|are', 'are', 'friends جمع است، پس are.', 'kind=مهربان'],
  ['do_does', 'He ___ English every day.', 'speak|speaks|speaking', 'speaks', 'برای he در جمله‌ی مثبت فعل s می‌گیرد.', 'speak=صحبت کردن'],
  ['do_does', 'I ___ coffee.', 'drink|drinks|drinking', 'drink', 'برای I فعل بدون s است.', 'drink=نوشیدن'],
  ['do_does', 'She ___ to school.', 'go|goes|going', 'goes', 'برای she، go می‌شود goes.', 'school=مدرسه'],
  ['do_does', 'They ___ in Germany.', 'work|works|working', 'work', 'برای they فعل بدون s است.', 'work=کار کردن'],
  ['do_does', '___ he like music?', 'Does|Do|Is', 'Does', 'در سؤال با he از Does استفاده می‌کنیم.', 'like=دوست داشتن'],
  ['do_does', '___ they live here?', 'Does|Do|Are', 'Do', 'در سؤال با they از Do استفاده می‌کنیم.', 'live=زندگی کردن'],
  ['do_does', 'She ___ not have a car.', 'do|does|is', 'does', 'بعد از she، does not می‌آید.', 'have=داشتن'],
  ['do_does', 'We ___ TV at night.', 'watch|watches|watching', 'watch', 'برای we فعل بدون s است.', 'watch=تماشا کردن'],
  ['do_does', 'My father ___ to work at eight.', 'go|goes|going', 'goes', 'برای my father، go می‌شود goes.', 'work=کار کردن'],
  ['do_does', 'You ___ not eat meat.', 'do|does|are', 'do', 'برای you از do not استفاده می‌کنیم.', 'meat=گوشت'],
];

// [operation, topic, source sentence, expected answer, glossary, explanation, alternatives]
const POSITIVE_NEGATIVE_QUESTION = [
  ['negative', 'to_be', 'I am happy.', 'I am not happy.', 'happy=خوشحال', 'برای منفی کردن am از not استفاده می‌کنیم.', ''],
  ['negative', 'to_be', 'She is a teacher.', "She isn't a teacher.", 'teacher=معلم', 'منفی is می‌شود isn’t.', 'She is not a teacher.'],
  ['negative', 'to_be', 'They are students.', "They aren't students.", 'student=دانشجو', 'منفی are می‌شود aren’t.', 'They are not students.'],
  ['negative', 'to_be', 'He is at school.', "He isn't at school.", 'school=مدرسه', 'منفی is می‌شود isn’t.', 'He is not at school.'],
  ['question', 'to_be', 'You are tired.', 'Are you tired?', 'tired=خسته', 'برای سؤال، are را اول جمله می‌بریم.', ''],
  ['question', 'to_be', 'He is a doctor.', 'Is he a doctor?', 'doctor=پزشک', 'برای سؤال، is را اول جمله می‌بریم.', ''],
  ['question', 'to_be', 'We are happy.', 'Are we happy?', 'happy=خوشحال', 'برای سؤال، are را اول جمله می‌بریم.', ''],
  ['question', 'to_be', 'It is cold.', 'Is it cold?', 'cold=سرد', 'برای سؤال، is را اول جمله می‌بریم.', ''],
  ['positive', 'to_be', "She isn't busy.", 'She is busy.', 'busy=مشغول', 'برای مثبت کردن، isn’t را به is تبدیل می‌کنیم.', 'She is not busy.'],
  ['positive', 'to_be', "They aren't tired.", 'They are tired.', 'tired=خسته', 'برای مثبت کردن، aren’t را به are تبدیل می‌کنیم.', ''],
  ['negative', 'do_does', 'I work here.', "I don't work here.", 'work=کار کردن | here=اینجا', 'برای منفی کردن I از don’t استفاده می‌کنیم.', 'I do not work here.'],
  ['negative', 'do_does', 'She speaks English.', "She doesn't speak English.", 'speak=صحبت کردن', 'برای منفی کردن she از doesn’t و فعل بدون s استفاده می‌کنیم.', 'She does not speak English.'],
  ['negative', 'do_does', 'They live in Iran.', "They don't live in Iran.", 'live=زندگی کردن | Iran=ایران', 'برای منفی کردن they از don’t استفاده می‌کنیم.', 'They do not live in Iran.'],
  ['negative', 'do_does', 'He likes tea.', "He doesn't like tea.", 'like=دوست داشتن | tea=چای', 'برای منفی کردن he از doesn’t و فعل بدون s استفاده می‌کنیم.', 'He does not like tea.'],
  ['question', 'do_does', 'You live in Gilan.', 'Do you live in Gilan?', 'live=زندگی کردن | Gilan=گیلان', 'برای سؤال با you از Do استفاده می‌کنیم.', ''],
  ['question', 'do_does', 'He works in Tehran.', 'Does he work in Tehran?', 'work=کار کردن | Tehran=تهران', 'برای سؤال با he از Does استفاده می‌کنیم و فعل بدون s است.', ''],
  ['question', 'do_does', 'They study English.', 'Do they study English?', 'study=درس خواندن', 'برای سؤال با they از Do استفاده می‌کنیم.', ''],
  ['question', 'do_does', 'She drinks coffee.', 'Does she drink coffee?', 'drink=نوشیدن | coffee=قهوه', 'برای سؤال با she از Does استفاده می‌کنیم و drink بدون s است.', ''],
  ['positive', 'do_does', "He doesn't drink tea.", 'He drinks tea.', 'drink=نوشیدن | tea=چای', 'doesn’t را حذف می‌کنیم و drink را s می‌دهیم.', ''],
  ['positive', 'do_does', "They don't live here.", 'They live here.', 'live=زندگی کردن | here=اینجا', 'don’t را حذف می‌کنیم و فعل بدون s می‌ماند.', ''],
];

for (const [topic, question, answer, glossary, explanation, alt] of QUICK_TRANSLATION) {
  add({
    category: 'quick_translation',
    topic,
    question,
    expected_answer: answer,
    accepted_answers: [answer, ...parseAlt(alt)],
    explanation,
    glossary: parseGlossary(glossary),
  });
}

for (const [topic, persian, answer, glossary, explanation, alt] of SENTENCE_BUILDER) {
  add({
    category: 'sentence_builder',
    topic,
    question: `${SB_PREFIX} ${persian}`,
    expected_answer: answer,
    accepted_answers: [answer, ...parseAlt(alt)],
    explanation,
    glossary: parseGlossary(glossary),
    word_bank: buildWordBank(answer),
  });
}

for (const [topic, wrong, correct, glossary, explanation, alt] of GRAMMAR_CORRECTION) {
  add({
    category: 'grammar_correction',
    topic,
    question: `${GC_PREFIX} ${wrong}`,
    expected_answer: correct,
    accepted_answers: [correct, ...parseAlt(alt)],
    explanation,
    glossary: parseGlossary(glossary),
    incorrect_sentence: wrong,
  });
}

for (const [topic, sentence, options, answer, explanation, glossary] of MULTIPLE_CHOICE) {
  add({
    category: 'multiple_choice',
    topic,
    question: sentence,
    expected_answer: answer,
    accepted_answers: [answer],
    explanation,
    glossary: parseGlossary(glossary),
    options: options.split('|'),
  });
}

for (const [operation, topic, source, answer, glossary, explanation, alt] of POSITIVE_NEGATIVE_QUESTION) {
  add({
    category: 'positive_negative_question',
    topic,
    question: `${PN_INSTRUCTION[operation]} ${source}`,
    expected_answer: answer,
    accepted_answers: [answer, ...parseAlt(alt)],
    explanation,
    glossary: parseGlossary(glossary),
    operation,
  });
}

const document = {
  schema_version: '1.1',
  dataset_name: 'English Grammar Quest – Beginner Bank',
  description:
    'Short, simple sentences for beginners. Topics: To Be and Do/Does. Each question has glossary words with Persian meanings.',
  question_counts: Object.fromEntries(
    ['quick_translation', 'sentence_builder', 'grammar_correction', 'multiple_choice', 'positive_negative_question'].map(
      (category) => [category, records.filter((q) => q.category === category).length],
    ),
  ),
  questions: records,
};

writeFileSync(OUT, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
console.log(`wrote ${records.length} questions to beginner_question_bank.json`);
