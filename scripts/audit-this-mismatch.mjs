import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'content/evolve-1');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

/** Persian line uses «این» as demonstrative «this», not اینجا / اینستاگرام / … */
function faUsesThis(fa) {
  if (!fa || typeof fa !== 'string') return false;
  const t = fa
    .replace(/اینجا/g, '')
    .replace(/اینستاگرام/g, '')
    .replace(/این درس/g, '')
    .replace(/این صفحه/g, '')
    .replace(/این مرحله/g, '')
    .replace(/این دو/g, '') // «این دو مخالف» in hints — skip if only that
    .replace(/این ساختار/g, '')
    .replace(/این واژه/g, '')
    .replace(/این تمرین/g, '')
    .replace(/این جمله/g, '')
    .replace(/این الگو/g, '')
    .replace(/این قید/g, '')
    .replace(/این نکته/g, '');
  return (
    /\bاین\s+کلید\b/u.test(t) ||
    /\bاین\s+معلم\b/u.test(t) ||
    /\bاین\s+دوست\b/u.test(t) ||
    /\bاین\s+خانه/u.test(t) ||
    /\bاین\s+تیم\b/u.test(t) ||
    /\bاین\s+پروفایل\b/u.test(t) ||
    /\bاین\s+اطلاعات\b/u.test(t) ||
    /\bآیا\s+این\b/u.test(t) ||
    /نه،\s*این/u.test(t) ||
    /^این\s+[^ی]/u.test(t.trim()) // «این کلید است» at start
  );
}

function enUsesThis(en) {
  return en && /\bthis\b/i.test(en);
}

const issues = [];

function record(lesson, file, loc, en, fa) {
  if (faUsesThis(fa) && !enUsesThis(en)) {
    issues.push({ lesson, file, loc, en, fa });
  }
}

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const lesson = data.lesson || file;

  for (const ex of data.exercises || []) {
    for (const item of ex.items || []) {
      const loc = item.id || ex.id;
      record(lesson, file, loc, item.expected_answer, item.translation || item.question);
    }
  }
  const lc = data.lesson_content;
  if (lc) {
    for (const s of lc.sentences || []) record(lesson, file, 'sentences', s.en, s.fa);
    for (const st of lc.stories || []) {
      for (const line of st.lines || []) record(lesson, file, `story:${st.title}`, line.en, line.fa);
    }
  }
}

console.log(JSON.stringify(issues, null, 2));
console.log('Total:', issues.length);
