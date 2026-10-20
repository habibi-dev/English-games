// Progress backup: the answers and the activity time so far, as one text that can be saved and imported on another device.
// The text is base64 of { payload, signature }. The payload is the JSON of the data; the signature is an
// HMAC-SHA256 of that payload. Any change to the text (a score, an answer, a time) breaks the signature,
// so the import refuses it.
// The key is part of the app code, so a determined person can still find it. This stops casual edits, not that.

const FORMAT = 'english-grammar-quest-progress';
// Version 2 adds the activity sessions. Version 1 files (answers only) can still be imported.
const VERSION = 2;
const READABLE_VERSIONS = [1, 2];
const SIGNING_KEY_TEXT = 'english-grammar-quest:progress-backup:v1';

const encoder = new TextEncoder();

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(text) {
  const binary = atob(text);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function signingKey() {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(SIGNING_KEY_TEXT),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

// The id of an attempt is counted on each device, so it is left out of the backup.
const withoutId = ({ id, ...attempt }) => attempt;

/** The text to save: the attempts and the activity sessions, signed. */
export async function encodeBackup({ attempts, sessions }, now = Date.now()) {
  const payload = JSON.stringify({
    format: FORMAT,
    version: VERSION,
    exportedAt: now,
    attempts: attempts.map(withoutId),
    sessions,
  });
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(), encoder.encode(payload)));
  return bytesToBase64(encoder.encode(JSON.stringify({ payload, signature: bytesToBase64(signature) })));
}

/**
 * Checks the signature and returns { attempts, sessions } of a backup text.
 * Throws an Error with a message when the text is refused.
 */
export async function decodeBackup(text) {
  const notBackup = new Error('This is not a progress file from this app.');
  let envelope;
  try {
    envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(text.trim())));
  } catch {
    throw notBackup;
  }
  const { payload, signature } = envelope ?? {};
  if (typeof payload !== 'string' || typeof signature !== 'string') throw notBackup;

  let valid = false;
  try {
    valid = await crypto.subtle.verify('HMAC', await signingKey(), base64ToBytes(signature), encoder.encode(payload));
  } catch {
    valid = false;
  }
  if (!valid) throw new Error('The file was changed, so it was not imported.');

  const data = JSON.parse(payload);
  if (data.format !== FORMAT || !READABLE_VERSIONS.includes(data.version) || !Array.isArray(data.attempts)) {
    throw new Error('This progress file version is not supported.');
  }
  return {
    attempts: data.attempts,
    // Version 1 files have no activity time.
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
  };
}

const sameAnswer = (a) => `${a.questionId}|${a.at}`;

/**
 * The incoming attempts this device does not have yet. An answer is the same one when it is for the same
 * question at the same time, so importing the same file twice adds nothing.
 */
export function newAttempts(existing, incoming) {
  const seen = new Set(existing.map(sameAnswer));
  return incoming.filter((attempt) => {
    const key = sameAnswer(attempt);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
