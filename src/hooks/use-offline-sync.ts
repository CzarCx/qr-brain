import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnlineStatus } from '@/hooks/use-online-status';
import {
  OfflinePage,
  QueueItem,
  deleteQueueItem,
  getAllByPage,
  getPending,
  updateQueueItem,
} from '@/lib/offlineDb';

export type SyncOutcome = 'synced' | 'conflict' | 'error';

/**
 * Motor de sincronización genérico para una cola offline de una página.
 * `processItem` hace la revalidación contra el servidor y aplica el cambio;
 * nunca sobreescribe a ciegas: si el estado del servidor divergió de lo
 * asumido al escanear, debe devolver 'conflict' en vez de aplicar el cambio.
 */
export function useOfflineSync(page: OfflinePage, processItem: (item: QueueItem) => Promise<SyncOutcome>) {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [conflicts, setConflicts] = useState<QueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const processItemRef = useRef(processItem);
  processItemRef.current = processItem;

  const refresh = useCallback(async () => {
    const items = await getAllByPage(page);
    setPendingCount(items.filter((i) => i.status === 'pending' || i.status === 'error' || i.status === 'syncing').length);
    setConflicts(items.filter((i) => i.status === 'conflict'));
  }, [page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const flush = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const items = await getPending(page);
      for (const item of items) {
        await updateQueueItem(item.id, { status: 'syncing' });
        try {
          const outcome = await processItemRef.current(item);
          await updateQueueItem(item.id, { status: outcome });
        } catch (err) {
          console.error(`[useOfflineSync:${page}] Error procesando item de la cola`, err);
          await updateQueueItem(item.id, { status: 'error' });
        }
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      await refresh();
    }
  }, [page, refresh]);

  useEffect(() => {
    if (isOnline) flush();
  }, [isOnline, flush]);

  const retryConflict = useCallback(
    async (id: string) => {
      await updateQueueItem(id, { status: 'pending' });
      await refresh();
      if (isOnline) flush();
    },
    [flush, isOnline, refresh]
  );

  const discardConflict = useCallback(
    async (id: string) => {
      await deleteQueueItem(id);
      await refresh();
    },
    [refresh]
  );

  return { isOnline, pendingCount, conflicts, isSyncing, flush, refresh, retryConflict, discardConflict };
}
