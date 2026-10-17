// Thin IndexedDB wrapper. Three object stores:
//   questions - the question bank (keyed by question id)
//   attempts  - one row per answered question (used by the Progress Tracker)
//   banks     - which bank files have been loaded, and their version

const DB_NAME = 'english-grammar-quest';
const DB_VERSION = 1;

let dbPromise = null;

export function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('questions')) {
          const store = db.createObjectStore('questions', { keyPath: 'id' });
          store.createIndex('topic', 'topic');
          store.createIndex('category', 'category');
        }
        if (!db.objectStoreNames.contains('attempts')) {
          const store = db.createObjectStore('attempts', { keyPath: 'id', autoIncrement: true });
          store.createIndex('questionId', 'questionId');
        }
        if (!db.objectStoreNames.contains('banks')) {
          db.createObjectStore('banks', { keyPath: 'id' });
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

// Bank metadata
export const getAllBankMeta = () => single('banks', 'readonly', (s) => s.getAll());
export const putBankMeta = (meta) => single('banks', 'readwrite', (s) => s.put(meta));

// Attempts
export const addAttempt = (attempt) => single('attempts', 'readwrite', (s) => s.add(attempt));
export const getAllAttempts = () => single('attempts', 'readonly', (s) => s.getAll());
export const clearAttempts = () => single('attempts', 'readwrite', (s) => s.clear());
