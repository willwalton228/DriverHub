/**
 * useWorkPlanTaskMap
 *
 * Shared hook used by compliance dashboard widgets to auto-generate and
 * look up work plan tasks for a list of drivers/records.
 *
 * Call it with a stable array of EnsureItem objects. It fires a POST to
 * /api/work-plan-items/ensure-batch once per unique set of items,
 * creating any missing tasks and returning a map of recordId → task info.
 *
 * Usage:
 *   const { taskMap, isSyncing } = useWorkPlanTaskMap(items);
 *   const task = taskMap[driverId]; // { taskId, status }
 */

import { useState, useEffect, useRef } from "react";

export interface EnsureItem {
  eventType: string;
  recordId: string;
  recordName: string;
  reason: string;
  priority: "high" | "medium" | "low" | "normal";
  recordUrl?: string;
  taskType?: string;
  sourceModule?: string;
  category?: string;
}

export interface TaskEntry {
  taskId: string;
  status: string;
  summary?: string | null;
}

export type TaskMap = Record<string, TaskEntry>;

export function useWorkPlanTaskMap(items: EnsureItem[]) {
  const [taskMap, setTaskMap] = useState<TaskMap>({});
  const [isSyncing, setIsSyncing] = useState(false);

  // Compute a stable fingerprint so the effect only fires when the item set changes
  const fingerprint = items.map(i => `${i.eventType}|${i.recordId}`).sort().join(",");
  const lastFingerprintRef = useRef<string>("");

  useEffect(() => {
    if (!items.length) return;
    if (fingerprint === lastFingerprintRef.current) return;
    lastFingerprintRef.current = fingerprint;

    setIsSyncing(true);
    fetch("/api/work-plan-items/ensure-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ items }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: { taskMap: TaskMap }) => {
        if (data?.taskMap) setTaskMap(prev => ({ ...prev, ...data.taskMap }));
      })
      .catch(() => { /* silent — widget still works without task links */ })
      .finally(() => setIsSyncing(false));
  }, [fingerprint]);

  return { taskMap, isSyncing };
}

/** Returns a URL to deep-link to a specific task in the Driver Ops tab */
export function workPlanTaskUrl(taskId: string): string {
  return `/work-plan?category=driver_ops&highlight=${taskId}`;
}

/** Maps task status to a short display label */
export function taskStatusLabel(status: string): string {
  switch (status) {
    case "open":        return "Open";
    case "in_progress": return "In Progress";
    case "completed":   return "Completed";
    case "canceled":    return "Canceled";
    case "snoozed":     return "Snoozed";
    default:            return status;
  }
}

/** Maps task status to a badge variant */
export function taskStatusVariant(status: string): "outline" | "secondary" | "default" | "destructive" {
  switch (status) {
    case "open":        return "outline";
    case "in_progress": return "default";
    case "completed":   return "secondary";
    case "canceled":    return "secondary";
    default:            return "outline";
  }
}
