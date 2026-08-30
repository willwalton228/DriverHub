export interface OfflineClockAction {
  id: string;
  assignmentId: string;
  actionType: 'clock_in' | 'clock_out';
  timestamp: string;
  latitude?: number;
  longitude?: number;
  overrideReason?: string;
  notes?: string;
  queuedAt: string;
}

export interface SyncResult {
  actionId?: string;
  id?: string;
  status: 'synced' | 'conflict' | 'failed';
  message?: string;
  serverTimestamp?: string;
}

export interface OfflineSyncResponse {
  results: SyncResult[];
  syncedCount: number;
  conflictCount: number;
  failedCount: number;
}

const SCHEDULE_CACHE_PREFIX = 'dh360:schedule:cache:';
const CLOCK_QUEUE_KEY_PREFIX = 'dh360:clock:queue:';
const LAST_SYNC_PREFIX = 'dh360:clock:lastSync:';

export function cacheScheduleData(userId: string, startDate: string, endDate: string, data: any): void {
  try {
    const key = `${SCHEDULE_CACHE_PREFIX}${userId}:${startDate}:${endDate}`;
    const payload = { data, cachedAt: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (e) {
  }
}

export function getCachedScheduleData(userId: string, startDate: string, endDate: string): { data: any; cachedAt: string } | null {
  try {
    const key = `${SCHEDULE_CACHE_PREFIX}${userId}:${startDate}:${endDate}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function clearScheduleCache(userId: string): void {
  try {
    const prefix = `${SCHEDULE_CACHE_PREFIX}${userId}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (e) {
  }
}

export function getClockActionQueue(userId: string): OfflineClockAction[] {
  try {
    const key = `${CLOCK_QUEUE_KEY_PREFIX}${userId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

export function addClockAction(userId: string, action: Omit<OfflineClockAction, 'id' | 'queuedAt'>): OfflineClockAction {
  let id: string;
  try {
    id = crypto.randomUUID();
  } catch {
    id = Date.now().toString();
  }

  const fullAction: OfflineClockAction = {
    ...action,
    id,
    queuedAt: new Date().toISOString(),
  };

  try {
    const queue = getClockActionQueue(userId);
    queue.push(fullAction);
    const key = `${CLOCK_QUEUE_KEY_PREFIX}${userId}`;
    localStorage.setItem(key, JSON.stringify(queue));
  } catch (e) {
  }

  return fullAction;
}

export function removeClockActions(userId: string, actionIds: string[]): void {
  try {
    const queue = getClockActionQueue(userId);
    const idsSet = new Set(actionIds);
    const filtered = queue.filter((a) => !idsSet.has(a.id));
    const key = `${CLOCK_QUEUE_KEY_PREFIX}${userId}`;
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch (e) {
  }
}

export function clearClockQueue(userId: string): void {
  try {
    const key = `${CLOCK_QUEUE_KEY_PREFIX}${userId}`;
    localStorage.removeItem(key);
  } catch (e) {
  }
}

export function getLastSyncTime(userId: string): string | null {
  try {
    const key = `${LAST_SYNC_PREFIX}${userId}`;
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

export function setLastSyncTime(userId: string, timestamp: string): void {
  try {
    const key = `${LAST_SYNC_PREFIX}${userId}`;
    localStorage.setItem(key, timestamp);
  } catch (e) {
  }
}

export function getQueueCount(userId: string): number {
  try {
    return getClockActionQueue(userId).length;
  } catch (e) {
    return 0;
  }
}
