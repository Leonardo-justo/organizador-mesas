/**
 * Persistência local em IndexedDB (no navegador deste computador).
 * Não há servidor nem sincronização entre dispositivos.
 */
import type { AppSnapshot } from '../features/backup/backup';

const DB_NAME = 'organizador-mesas-casamento';
const DB_VERSION = 1;
const STORE = 'estado';
const KEY = 'atual';

export interface StoredData extends AppSnapshot {
  schemaVersion: number;
  savedAt: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador não permite armazenamento local (IndexedDB).'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Falha ao abrir o banco local.'));
    req.onblocked = () => reject(new Error('O banco local está bloqueado por outra aba. Feche as outras abas do organizador.'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
const db = () => (dbPromise ??= open().catch((e) => { dbPromise = null; throw e; }));

export async function loadData(): Promise<StoredData | null> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as StoredData) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Resolve somente quando a transação for efetivamente concluída (dados gravados). */
export async function saveData(data: AppSnapshot): Promise<string> {
  const d = await db();
  const savedAt = new Date().toISOString();
  const record: StoredData = { ...data, schemaVersion: 1, savedAt };
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record, KEY);
    tx.oncomplete = () => resolve(savedAt);
    tx.onerror = () => reject(tx.error ?? new Error('Falha ao gravar.'));
    tx.onabort = () => reject(tx.error ?? new Error('Gravação interrompida (espaço insuficiente?).'));
  });
}

export async function clearData(): Promise<void> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Só para testes: fecha a conexão para simular o recarregamento da aplicação. */
export function _resetConnectionForTests() {
  dbPromise?.then((d) => d.close()).catch(() => undefined);
  dbPromise = null;
}
