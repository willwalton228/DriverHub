/**
 * Notification Preferences Page
 *
 * Allows users to control which in-app notification categories they receive
 * per module. Mandatory notifications (required for role responsibilities)
 * are shown as locked and cannot be disabled.
 *
 * Uses an optimistic update pattern: toggles apply immediately in the UI
 * and are persisted in the background with automatic rollback on error.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Bell, BellOff, Lock, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CategoryDef {
  category: string;
  label: string;
  description: string;
  mandatory?: boolean;
}

interface ModuleDef {
  module: string;
  label: string;
  description: string;
  categories: CategoryDef[];
}

interface PrefRow {
  userId: string;
  module: string;
  category: string;
  channel: string;
  enabled: boolean;
}

// ── Helper: build a lookup key ────────────────────────────────────────────────
const key = (module: string, category: string, channel = "in_app") =>
  `${module}:${category}:${channel}`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function NotificationPreferences() {
  const { toast } = useToast();

  // Preference schema (static, describes modules + categories)
  const { data: schema, isLoading: schemaLoading } = useQuery<ModuleDef[]>({
    queryKey: ["/api/me/notification-preferences/schema"],
  });

  // Current user preference rows (absent = enabled)
  const { data: prefs, isLoading: prefsLoading } = useQuery<PrefRow[]>({
    queryKey: ["/api/me/notification-preferences"],
    staleTime: 30_000,
  });

  // Local overlay: tracks unsaved/pending changes keyed by "module:category:channel"
  const [localOverride, setLocalOverride] = useState<Record<string, boolean>>({});

  // Reset local overrides whenever server prefs refresh
  useEffect(() => {
    setLocalOverride({});
  }, [prefs]);

  const patchMutation = useMutation({
    mutationFn: async (preferences: Array<{ module: string; category: string; channel: string; enabled: boolean }>) => {
      const res = await apiRequest("PATCH", "/api/me/notification-preferences", { preferences });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/notification-preferences"] });
    },
    onError: (err: any, variables) => {
      // Roll back the optimistic change
      setLocalOverride((prev) => {
        const next = { ...prev };
        for (const p of variables) {
          delete next[key(p.module, p.category, p.channel)];
        }
        return next;
      });
      toast({
        title: "Couldn't save preference",
        description: "Your change was not saved. Please try again.",
        variant: "destructive",
      });
    },
  });

  // ── Derive effective enabled state ────────────────────────────────────────

  function isEnabled(module: string, category: string, channel = "in_app"): boolean {
    const k = key(module, category, channel);
    if (k in localOverride) return localOverride[k];
    // If no pref row exists → default enabled
    const row = prefs?.find((p) => p.module === module && p.category === category && p.channel === channel);
    return row ? row.enabled : true;
  }

  // ── Toggle handler ────────────────────────────────────────────────────────

  function handleToggle(module: string, category: string, channel = "in_app", checked: boolean) {
    // Optimistic update
    setLocalOverride((prev) => ({ ...prev, [key(module, category, channel)]: checked }));
    // Persist
    patchMutation.mutate([{ module, category, channel, enabled: checked }]);
  }

  // ── Count disabled in module ──────────────────────────────────────────────

  function countDisabled(mod: ModuleDef): number {
    return mod.categories.filter(
      (c) => !c.mandatory && !isEnabled(mod.module, c.category),
    ).length;
  }

  const isLoading = schemaLoading || prefsLoading;

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-64 mt-1" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3].map((j) => (
                <div key={j} className="flex items-center justify-between py-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-6 w-11 rounded-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 bg-muted/40 rounded-lg border">
        <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-sm text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Opt out of optional notifications.</span>{" "}
          Notifications marked with{" "}
          <span className="inline-flex items-center gap-1 align-middle">
            <Lock className="h-3 w-3" />
            <span className="font-medium text-foreground">Required</span>
          </span>{" "}
          are mandatory for your role and cannot be disabled.
        </div>
      </div>

      {/* Channels — in_app only for now */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Delivery Channels</CardTitle>
          <CardDescription>Choose how you receive notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-3 border-b last:border-0">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">In-App</p>
                <p className="text-xs text-muted-foreground">Notification bell inside DriverHub</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Always on</span>
            </div>
          </div>
          <div className="flex items-center justify-between py-3 border-b last:border-0 opacity-50">
            <div className="flex items-center gap-3">
              <BellOff className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-xs text-muted-foreground">Coming soon</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">Future</Badge>
          </div>
          <div className="flex items-center justify-between py-3 opacity-50">
            <div className="flex items-center gap-3">
              <BellOff className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">SMS &amp; Digest</p>
                <p className="text-xs text-muted-foreground">Coming soon</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">Future</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Per-module category preferences */}
      {(schema ?? []).map((mod) => {
        const disabled = countDisabled(mod);
        return (
          <Card key={mod.module}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{mod.label}</CardTitle>
                {disabled > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {disabled} muted
                  </Badge>
                )}
              </div>
              <CardDescription>{mod.description}</CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {mod.categories.map((cat) => {
                const enabled = isEnabled(mod.module, cat.category);
                const isMandatory = !!cat.mandatory;

                return (
                  <div
                    key={cat.category}
                    className={cn(
                      "flex items-center justify-between py-3 gap-4",
                      !enabled && !isMandatory && "opacity-60",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{cat.label}</p>
                        {isMandatory && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                            <Lock className="h-3 w-3" />
                            Required
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        {cat.description}
                      </p>
                    </div>
                    <Switch
                      checked={isMandatory ? true : enabled}
                      disabled={isMandatory || patchMutation.isPending}
                      onCheckedChange={(checked) =>
                        handleToggle(mod.module, cat.category, "in_app", checked)
                      }
                      aria-label={`${cat.label} notifications`}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
