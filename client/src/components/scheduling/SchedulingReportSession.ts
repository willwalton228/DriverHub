import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { queryClient } from "@/lib/queryClient";

const REPORT_SESSION_PARAM = "reportSession";
const STORAGE_PREFIX = "driverhub:scheduling-report:";

export interface StoredReportSession<TState, TData> {
  state: TState;
  data: TData;
  lastRefreshedAt: string;
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function storageKey(reportId: string, sessionId: string): string {
  return `${STORAGE_PREFIX}${reportId}:${sessionId}`;
}

function endReportSession(reportId: string, sessionId: string): void {
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(storageKey(reportId, sessionId));
    } catch {
      // React Query cache removal below still prevents this session from resurfacing.
    }
  }

  queryClient.removeQueries({
    predicate: (query) => Array.isArray(query.queryKey) && query.queryKey.includes(sessionId),
  });
}

function reportAtLocation(location: string, search: string): { reportId: string; sessionId: string } | null {
  const url = new URL(location, window.location.origin);
  if (!url.search && search) url.search = search;
  const sessionId = url.searchParams.get(REPORT_SESSION_PARAM);
  if (!sessionId) return null;

  if (url.pathname === "/scheduling/reports/time-off" || url.pathname === "/scheduling/driver-time-off") {
    return { reportId: "time-off", sessionId };
  }
  if (url.pathname === "/scheduling/reports/no-show") {
    return { reportId: "no-show", sessionId };
  }
  return null;
}

function isReportDrillDown(location: string): boolean {
  return /^\/(?:drivers|customers)\/[^/]+$/.test(location);
}

export function createReportSessionHref(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${REPORT_SESSION_PARAM}=${encodeURIComponent(createSessionId())}`;
}

export function useSchedulingReportSessionId(): string {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const requestedSessionId = new URLSearchParams(search).get(REPORT_SESSION_PARAM);
  const [sessionId] = useState(() => requestedSessionId || createSessionId());

  useEffect(() => {
    if (requestedSessionId) return;

    const url = new URL(location, window.location.origin);
    url.searchParams.set(REPORT_SESSION_PARAM, sessionId);
    navigate(`${url.pathname}${url.search}${url.hash}`, { replace: true });
  }, [location, navigate, requestedSessionId, sessionId]);

  return sessionId;
}

export function readSchedulingReportSession<TState, TData>(
  reportId: string,
  sessionId: string,
): StoredReportSession<TState, TData> | null {
  if (typeof window === "undefined") return null;

  try {
    const value = window.sessionStorage.getItem(storageKey(reportId, sessionId));
    return value ? JSON.parse(value) as StoredReportSession<TState, TData> : null;
  } catch {
    return null;
  }
}

export function writeSchedulingReportSession<TState, TData>(
  reportId: string,
  sessionId: string,
  session: StoredReportSession<TState, TData>,
): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(storageKey(reportId, sessionId), JSON.stringify(session));
  } catch {
    // Report data remains available in React Query if browser storage is unavailable.
  }
}

/**
 * Keeps a report session through report row drill-downs, but drops it when
 * navigation leaves that report workflow for another main module.
 */
export function useSchedulingReportSessionLifecycle(location: string, search: string): void {
  const activeSession = useRef<{ reportId: string; sessionId: string } | null>(null);

  useEffect(() => {
    const openedReport = reportAtLocation(location, search);
    if (openedReport) {
      if (
        activeSession.current &&
        (activeSession.current.reportId !== openedReport.reportId ||
          activeSession.current.sessionId !== openedReport.sessionId)
      ) {
        endReportSession(activeSession.current.reportId, activeSession.current.sessionId);
      }
      activeSession.current = openedReport;
      return;
    }

    const pathname = new URL(location, window.location.origin).pathname;
    if (activeSession.current && !isReportDrillDown(pathname)) {
      endReportSession(activeSession.current.reportId, activeSession.current.sessionId);
      activeSession.current = null;
    }
  }, [location, search]);

  useEffect(() => () => {
    if (activeSession.current) {
      endReportSession(activeSession.current.reportId, activeSession.current.sessionId);
    }
  }, []);
}