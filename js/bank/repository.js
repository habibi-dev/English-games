// Question Bank repository: the only place that touches the stored question bank.
// Bank files are listed in banks.json. Adding a new bank means adding an entry there
// and dropping in the JSON file. No game code changes are needed.

import { importQuestions } from './importer.js';
import * as db from '../storage/db.js';

const REGISTRY_URL = 'banks.json';

export const listQuestions = () => db.getAllQuestions();
export const getQuestion = (id) => db.getQuestion(id);
export const saveQuestion = (question) => db.putQuestion(question);
export const removeQuestion = (id) => db.deleteQuestion(id);
export const listBanks = () => db.getAllBankMeta();

/** Imports JSON/CSV text into the store (insert or update by id). */
export async function importIntoStore(text, format) {
  const result = importQuestions(text, format);
  if (result.questions.length > 0) {
    await db.putQuestions(result.questions);
  }
  return result;
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`فایل ${url} پیدا نشد (HTTP ${response.status}).`);
  }
  return response.text();
}

/**
 * Loads every bank listed in banks.json that is new or whose version changed.
 * With force=true every bank is reloaded (questions are overwritten by id).
 * Returns what was loaded and any per-bank errors, so one broken bank does not block the rest.
 */
export async function syncBanks({ force = false } = {}) {
  const registry = JSON.parse(await fetchText(REGISTRY_URL));
  const known = new Map((await db.getAllBankMeta()).map((meta) => [meta.id, meta]));
  const loaded = [];
  const errors = [];

  for (const bank of registry.banks ?? []) {
    const version = String(bank.version ?? '1');
    const name = bank.name ?? bank.id;
    const isDefault = Boolean(bank.default);
    const meta = known.get(bank.id);

    if (!force && meta && meta.version === version && meta.file === bank.file) {
      // Nothing to reload, but keep the display name and default flag from banks.json up to date.
      if (meta.name !== name || Boolean(meta.default) !== isDefault) {
        await db.putBankMeta({ ...meta, name, default: isDefault });
      }
      continue;
    }

    try {
      const result = importQuestions(await fetchText(bank.file));
      // Every question remembers which bank it came from, so the game can filter by bank.
      const incoming = result.questions.map((question) => ({ ...question, bank: bank.id }));
      await db.putQuestions(incoming);

      // The file is the source of truth for its bank: questions removed from the file are removed here too.
      // This runs only after the new file loaded, so a failed download never empties a bank.
      const incomingIds = new Set(incoming.map((question) => question.id));
      const stale = (await db.getAllQuestions()).filter((q) => q.bank === bank.id && !incomingIds.has(q.id));
      for (const question of stale) await db.deleteQuestion(question.id);

      const entry = {
        id: bank.id,
        name,
        file: bank.file,
        version,
        default: isDefault,
        count: result.questions.length,
        invalid: result.invalid.length,
        warnings: result.warnings.length,
        importedAt: new Date().toISOString(),
      };
      await db.putBankMeta(entry);
      loaded.push(entry);
      if (result.invalid.length) console.warn(`[bank ${bank.id}] invalid records:`, result.invalid);
    } catch (error) {
      errors.push({ bank: bank.id, message: error.message });
    }
  }

  return { loaded, errors };
}
