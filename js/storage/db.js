// Thin IndexedDB wrapper. Three object stores:
//   questions - the questions of every loaded lesson (keyed by question id)
//   attempts  - one row per answered question (used by the Progress Tracker)
//   lessons   - which lesson files have been loaded, and their version (keyed by "book/lesson")
//
// Version 2 replaced the old flat question banks. Upgrading from version 1 drops the old questions and
// bank metadata; they are loaded again from content/ on the next start. Attempts are kept.

const DB_NAME = 'english-grammar-quest';
const DB_VERSION = 2;

let dbPromise = null;

export function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (event.oldVersion < 2) {
          // The flat bank layout is gone: drop its stores (created again below).
          for (const name of ['questions', 'banks']) {
            if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
          }
        }
        if (!db.objectStoreNames.contains('questions')) {
          const store = db.createObjectStore('questions', { keyPath: 'id' });
          store.createIndex('topic', 'topic');
          store.createIndex('category', 'category');
        }
        if (!db.objectStoreNames.contains('attempts')) {
          const store = db.createObjectStore('attempts', { keyPath: 'id', autoIncrement: true });
          store.createIndex('questionId', 'questionId');
        }
        if (!db.objectStoreNames.contains('lessons')) {
          db.createObjectStore('lessons', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

function single(storeName, mode, action) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const request = action(db.transaction(storeName, mode).objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

function bulkPut(storeName, items) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        for (const item of items) store.put(item);
        tx.oncomplete = () => resolve(items.length);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

// Questions
export const getAllQuestions = () => single('questions', 'readonly', (s) => s.getAll());
export const getQuestion = (id) => single('questions', 'readonly', (s) => s.get(id));
export const putQuestion = (question) => single('questions', 'readwrite', (s) => s.put(question));
export const putQuestions = (questions) => bulkPut('questions', questions);
export const deleteQuestion = (id) => single('questions', 'readwrite', (s) => s.delete(id));

// Lesson metadata
export const getAllLessonMeta = () => single('lessons', 'readonly', (s) => s.getAll());
export const putLessonMeta = (meta) => single('lessons', 'readwrite', (s) => s.put(meta));
export const deleteLessonMeta = (key) => single('lessons', 'readwrite', (s) => s.delete(key));

// Attempts
export const addAttempt = (attempt) => single('attempts', 'readwrite', (s) => s.add(attempt));
export const getAllAttempts = () => single('attempts', 'readonly', (s) => s.getAll());
export const clearAttempts = () => single('attempts', 'readwrite', (s) => s.clear());
