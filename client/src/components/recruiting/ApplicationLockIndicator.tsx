import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, LockOpen, AlertTriangle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ApplicationLockIndicatorProps {
  applicationId: string;
  currentUserId?: string;
  onConflict?: () => void;
}

const LOCK_REFRESH_INTERVAL = 60 * 1000; // 60 seconds

export function ApplicationLockIndicator({
  applicationId,
  currentUserId,
  onConflict,
}: ApplicationLockIndicatorProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const lockStatusQuery = useQuery({
    queryKey: ["/api/recruiting/applications", applicationId, "lock"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/applications/${applicationId}/lock`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch lock status");
      return res.json();
    },
    refetchInterval: 30000,
    enabled: !!applicationId,
  });

  const acquireLockMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/recruiting/applications/${applicationId}/lock`);
      return res.json();
    },
    onSuccess: () => {
      setIsEditing(true);
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "lock"] });
      startRefreshTimer();
    },
    onError: (error: any) => {
      if (error.message?.includes("409") || error.status === 409) {
        toast({
          title: "Application Locked",
          description: "Another user is currently editing this application.",
          variant: "destructive",
        });
      }
    },
  });

  const refreshLockMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/recruiting/applications/${applicationId}/lock`);
      return res.json();
    },
    onError: () => {
      setIsEditing(false);
      stopRefreshTimer();
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "lock"] });
    },
  });

  const releaseLockMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/recruiting/applications/${applicationId}/lock`);
      return res.json();
    },
    onSuccess: () => {
      setIsEditing(false);
      stopRefreshTimer();
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "lock"] });
    },
  });

  const startRefreshTimer = useCallback(() => {
    stopRefreshTimer();
    refreshTimerRef.current = setInterval(() => {
      refreshLockMutation.mutate();
    }, LOCK_REFRESH_INTERVAL);
  }, []);

  const stopRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopRefreshTimer();
      if (isEditing) {
        fetch(`/api/recruiting/applications/${applicationId}/lock`, {
          method: "DELETE",
          credentials: "include",
        }).catch(() => {});
      }
    };
  }, [applicationId, isEditing]);

  const lockData = lockStatusQuery.data;
  const isLockedByOther = lockData?.locked && lockData?.lock?.lockedBy !== currentUserId;
  const isLockedByMe = lockData?.locked && lockData?.lock?.lockedBy === currentUserId;

  if (isLockedByOther) {
    const lockedByEmail = lockData?.lock?.lockedByEmail || "Unknown user";
    const expiresAt = lockData?.lock?.expiresAt ? new Date(lockData.lock.expiresAt) : null;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="destructive" className="text-xs gap-1" data-testid={`badge-locked-${applicationId}`}>
            <Lock className="h-3 w-3" />
            Editing
          </Badge>
        </TooltipTrigger>
        <TooltipContent data-testid={`tooltip-locked-${applicationId}`}>
          <p>Being edited by {lockedByEmail}</p>
          {expiresAt && (
            <p className="text-xs text-muted-foreground">
              Lock expires at {expiresAt.toLocaleTimeString()}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (isLockedByMe) {
    return (
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="text-xs gap-1" data-testid={`badge-my-lock-${applicationId}`}>
              <Lock className="h-3 w-3" />
              You're editing
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>You hold the edit lock on this application</p>
          </TooltipContent>
        </Tooltip>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => releaseLockMutation.mutate()}
          disabled={releaseLockMutation.isPending}
          title="Release lock"
          data-testid={`button-release-lock-${applicationId}`}
        >
          <LockOpen className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => acquireLockMutation.mutate()}
          disabled={acquireLockMutation.isPending}
          title="Start editing (acquire lock)"
          data-testid={`button-acquire-lock-${applicationId}`}
        >
          <LockOpen className="h-4 w-4 text-muted-foreground" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Click to start editing this application</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface ConflictWarningProps {
  applicationId: string;
  lastKnownUpdatedAt: string;
  onRefresh: () => void;
}

export function ConflictWarningBanner({
  applicationId,
  lastKnownUpdatedAt,
  onRefresh,
}: ConflictWarningProps) {
  const conflictQuery = useQuery({
    queryKey: ["/api/recruiting/applications", applicationId, "conflict", lastKnownUpdatedAt],
    queryFn: async () => {
      const res = await apiRequest("POST", `/api/recruiting/applications/${applicationId}/check-conflict`, {
        lastKnownUpdatedAt,
      });
      if (res.status === 409) {
        return { conflict: true };
      }
      return res.json();
    },
    refetchInterval: 15000,
    enabled: !!applicationId && !!lastKnownUpdatedAt,
  });

  if (!conflictQuery.data?.conflict) return null;

  return (
    <div
      className="flex items-center gap-2 p-2 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-sm"
      data-testid={`conflict-warning-${applicationId}`}
    >
      <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
      <span className="text-yellow-800 dark:text-yellow-200">
        This application has been modified by another user.
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        className="ml-auto"
        data-testid={`button-refresh-conflict-${applicationId}`}
      >
        <RefreshCw className="h-3 w-3 mr-1" />
        Refresh
      </Button>
    </div>
  );
}
