import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import * as offlineManager from "@/lib/offlineScheduleManager";
import type { OfflineClockAction, OfflineSyncResponse } from "@/lib/offlineScheduleManager";

export default function useOfflineSchedule(userId: string | null) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingActions, setPendingActions] = useState<OfflineClockAction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const prevOnlineRef = useRef(isOnline);
  const { toast } = useToast();

  useEffect(() => {
    if (userId) {
      setPendingActions(offlineManager.getClockActionQueue(userId));
      setLastSyncTime(offlineManager.getLastSyncTime(userId));
    }
  }, [userId]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const syncPendingActions = useCallback(async (): Promise<OfflineSyncResponse | null> => {
    if (!userId || pendingActions.length === 0) return null;

    setIsSyncing(true);
    try {
      const res = await apiRequest('POST', '/api/scheduling/offline-sync', { actions: pendingActions });
      const syncResponse: OfflineSyncResponse = await res.json();

      const syncedIds = syncResponse.results
        .filter((r) => r.status === 'synced')
        .map((r) => r.actionId || r.id);

      if (syncedIds.length > 0) {
        offlineManager.removeClockActions(userId, syncedIds);
      }

      const now = new Date().toISOString();
      offlineManager.setLastSyncTime(userId, now);
      setLastSyncTime(now);
      setPendingActions(offlineManager.getClockActionQueue(userId));

      toast({
        title: "Sync complete",
        description: `${syncResponse.syncedCount} synced, ${syncResponse.conflictCount} conflicts, ${syncResponse.failedCount} failed`,
      });

      return syncResponse;
    } catch (e: any) {
      toast({
        title: "Sync failed",
        description: e.message || "Could not sync pending actions",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [userId, pendingActions, toast]);

  useEffect(() => {
    if (isOnline && !prevOnlineRef.current && pendingActions.length > 0) {
      syncPendingActions();
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, syncPendingActions, pendingActions.length]);

  useEffect(() => {
    if (!isOnline || pendingActions.length === 0) return;

    const interval = setInterval(() => {
      syncPendingActions();
    }, 60_000);

    return () => clearInterval(interval);
  }, [isOnline, pendingActions.length, syncPendingActions]);

  const queueClockAction = useCallback(
    (action: Omit<OfflineClockAction, 'id' | 'queuedAt'>): OfflineClockAction => {
      const created = offlineManager.addClockAction(userId!, action);
      setPendingActions(offlineManager.getClockActionQueue(userId!));
      toast({
        title: "Action queued for sync",
        description: `${action.actionType === 'clock_in' ? 'Clock in' : 'Clock out'} will sync when online`,
      });
      return created;
    },
    [userId, toast],
  );

  const cacheSchedule = useCallback(
    (startDate: string, endDate: string, data: any) => {
      if (userId) {
        offlineManager.cacheScheduleData(userId, startDate, endDate, data);
      }
    },
    [userId],
  );

  const getCachedSchedule = useCallback(
    (startDate: string, endDate: string): { data: any; cachedAt: string } | null => {
      if (!userId) return null;
      return offlineManager.getCachedScheduleData(userId, startDate, endDate);
    },
    [userId],
  );

  return {
    isOnline,
    pendingActions,
    pendingCount: pendingActions.length,
    isSyncing,
    lastSyncTime,
    queueClockAction,
    syncPendingActions,
    cacheSchedule,
    getCachedSchedule,
  };
}
