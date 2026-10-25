import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeBackup, decodeBackup, newAttempts } from '../js/progress/backup.js';

const ATTEMPTS = [
  { id: 1, questionId: 'q-1', correct: true, points: 10, at: 1000 },
  { id: 2, questionId: 'q-2', correct: false, points: 0, at: 2000 },
];
const SESSIONS = [{ start: 1000, end: 61000 }, { start: 90000, end: 150000 }];

test('a backup keeps the unlocked lessons, and an older backup without them still imports', async () => {
  const text = await encodeBackup({ attempts: ATTEMPTS, sessions: SESSIONS, unlocked: ['evolve-1/lesson-01-01'] });
  const { unlocked } = await decodeBackup(text);
  assert.deepEqual(unlocked, ['evolve-1/lesson-01-01']);
  // A backup made without the lessons (for example by an older app) has none.
  const older = await decodeBackup(await encodeBackup({ attempts: ATTEMPTS, sessions: SESSIONS }));
  assert.deepEqual(older.unlocked, []);
});

test('a backup decodes to the same attempts (without device ids) and the same activity sessions', async () => {
  const text = await encodeBackup({ attempts: ATTEMPTS, sessions: SESSIONS });
  const { attempts, sessions } = await decodeBackup(text);
  assert.deepEqual(attempts, [
    { questionId: 'q-1', correct: true, points: 10, at: 1000 },
    { questionId: 'q-2', correct: false, points: 0, at: 2000 },
  ]);
  assert.deepEqual(sessions, SESSIONS);
});

test('a backup is plain text, not readable JSON', async () => {
  const text = await encodeBackup({ attempts: ATTEMPTS, sessions: SESSIONS });
  assert.match(text, /^[A-Za-z0-9+/=\s]+$/);
  assert.doesNotMatch(text, /questionId/);
});

test('a changed backup is refused (a score or a time edited by hand)', async () => {
  const envelope = JSON.parse(
    Buffer.from((await encodeBackup({ attempts: ATTEMPTS, sessions: SESSIONS })).trim(), 'base64').toString('utf8'),
  );
  const edited = envelope.payload.replace('"points":0', '"points":999');
  assert.notEqual(edited, envelope.payload);
  const forged = Buffer.from(JSON.stringify({ payload: edited, signature: envelope.signature })).toString('base64');
  await assert.rejects(decodeBackup(forged), /was changed/);

  const longer = envelope.payload.replace('"end":61000', '"end":999999');
  const forgedTime = Buffer.from(JSON.stringify({ payload: longer, signature: envelope.signature })).toString('base64');
  await assert.rejects(decodeBackup(forgedTime), /was changed/);
});

test('text that is not a backup is refused', async () => {
  await assert.rejects(decodeBackup('hello world'), /not a progress file/);
  await assert.rejects(decodeBackup(Buffer.from('{"a":1}').toString('base64')), /not a progress file/);
});

test('newAttempts skips answers already on the device and repeats inside the file', () => {
  const existing = [{ id: 7, questionId: 'q-1', at: 1000 }];
  const incoming = [
    { questionId: 'q-1', at: 1000 },
    { questionId: 'q-2', at: 2000 },
    { questionId: 'q-2', at: 2000 },
  ];
  assert.deepEqual(newAttempts(existing, incoming), [{ questionId: 'q-2', at: 2000 }]);
});
