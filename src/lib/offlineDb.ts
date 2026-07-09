import { openDB, DBSchema, IDBPDatabase } from 'idb';

export type OfflinePage = 'calificar' | 'entrega';
export type QueueItemStatus = 'pending' | 'syncing' | 'synced' | 'conflict' | 'error';

export interface QueueItem {
  id: string;
  page: OfflinePage;
  type: string;
  payload: any;
  createdAt: number;
  status: QueueItemStatus;
}

/** Snapshot mínimo de una fila de `personal`, cacheado para validar escaneos sin red. */
export interface SnapshotEntry {
  name: string | null;
  product: string | null;
  status: string;
}

export interface Snapshot {
  page: OfflinePage;
  entries: Record<string, SnapshotEntry>;
  updatedAt: number;
}

interface OfflineDBSchema extends DBSchema {
  queue: {
    key: string;
    value: QueueItem;
    indexes: { 'by-page': OfflinePage; 'by-status': QueueItemStatus };
  };
  snapshots: {
    key: OfflinePage;
    value: Snapshot;
  };
}

const DB_NAME = 'qr-scanner-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<OfflineDBSchema>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const queueStore = db.createObjectStore('queue', { keyPath: 'id' });
        queueStore.createIndex('by-page', 'page');
        queueStore.createIndex('by-status', 'status');

        db.createObjectStore('snapshots', { keyPath: 'page' });
      },
    });
  }
  return dbPromise;
}

export async function enqueue(item: Omit<QueueItem, 'status'> & { status?: QueueItemStatus }) {
  const db = await getDb();
  const record: QueueItem = { status: 'pending', ...item };
  await db.put('queue', record);
  return record;
}

export async function getAllByPage(page: OfflinePage) {
  const db = await getDb();
  return db.getAllFromIndex('queue', 'by-page', page);
}

export async function getPending(page: OfflinePage) {
  const items = await getAllByPage(page);
  return items.filter((item) => item.status === 'pending' || item.status === 'error');
}

export async function updateQueueItem(id: string, changes: Partial<QueueItem>) {
  const db = await getDb();
  const existing = await db.get('queue', id);
  if (!existing) return;
  await db.put('queue', { ...existing, ...changes });
}

export async function deleteQueueItem(id: string) {
  const db = await getDb();
  await db.delete('queue', id);
}

/** Combina nuevas entradas con el snapshot existente de la página (las nuevas ganan). */
export async function mergeSnapshotEntries(page: OfflinePage, entries: Record<string, SnapshotEntry>) {
  const db = await getDb();
  const existing = await db.get('snapshots', page);
  const merged: Snapshot = {
    page,
    entries: { ...(existing?.entries ?? {}), ...entries },
    updatedAt: Date.now(),
  };
  await db.put('snapshots', merged);
  return merged;
}

export async function getSnapshotEntries(page: OfflinePage): Promise<Record<string, SnapshotEntry>> {
  const db = await getDb();
  const snapshot = await db.get('snapshots', page);
  return snapshot?.entries ?? {};
}
