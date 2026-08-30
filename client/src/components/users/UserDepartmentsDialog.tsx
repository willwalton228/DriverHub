import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, LayoutGrid, Search, Save } from "lucide-react";
import { PermissionInfo } from "@/components/ui/PermissionInfo";
import { MODULES_DESCRIPTION } from "@/lib/permissionDescriptions";

interface DeptOption {
  id: string;
  name: string;
  code: string | null;
  accountId: string;
  accountName: string;
  sortOrder: number;
}

interface UserDeptAssignment {
  id: string;
  userId: string;
  departmentId: string;
  grantedAt: string;
  department: DeptOption | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string | null;
  userName: string;
}

export function UserDepartmentsDialog({ open, onOpenChange, userId, userName }: Props) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // All available modules/departments (admin view)
  const { data: allDepts, isLoading: deptsLoading } = useQuery<DeptOption[]>({
    queryKey: ["/api/user-departments/all-departments"],
    enabled: open,
  });

  // Current assignments for this user — custom queryFn with explicit ok-check to
  // prevent a non-ok response body from being mistaken for an assignment array.
  const { data: currentAssignments, isLoading: assignmentsLoading } = useQuery<UserDeptAssignment[]>({
    queryKey: ["/api/user-departments/users", userId],
    queryFn: async () => {
      if (!userId) return [];
      const r = await fetch(`/api/user-departments/users/${userId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json() as Promise<UserDeptAssignment[]>;
    },
    enabled: open && !!userId,
  });

  // Initialise selection from current assignments whenever dialog opens.
  // Guard against non-array values defensively.
  useEffect(() => {
    if (open && Array.isArray(currentAssignments)) {
      setSelected(new Set(currentAssignments.map((a) => a.departmentId)));
      setSearch("");
    }
  }, [open, currentAssignments]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", `/api/user-departments/users/${userId}`, Array.from(selected));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-departments/users", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-departments/mine"] });
      toast({
        title: "Modules saved",
        description: `${selected.size} module${selected.size !== 1 ? "s" : ""} assigned to ${userName}.`,
      });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save module assignments", variant: "destructive" });
    },
  });

  const toggle = (deptId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  };

  const selectAll = (deptIds: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      deptIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearAll = (deptIds: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      deptIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  // Group modules by account, filtered by search
  const grouped = useMemo(() => {
    const depts = allDepts ?? [];
    const q = search.toLowerCase().trim();
    const filtered = q
      ? depts.filter(
          (d) =>
            d.name.toLowerCase().includes(q) ||
            d.accountName.toLowerCase().includes(q) ||
            (d.code?.toLowerCase().includes(q) ?? false)
        )
      : depts;

    const map = new Map<string, { accountId: string; accountName: string; depts: DeptOption[] }>();
    for (const d of filtered) {
      if (!map.has(d.accountId)) map.set(d.accountId, { accountId: d.accountId, accountName: d.accountName, depts: [] });
      map.get(d.accountId)!.depts.push(d);
    }
    return Array.from(map.values()).sort((a, b) => a.accountName.localeCompare(b.accountName));
  }, [allDepts, search]);

  const isLoading = deptsLoading || assignmentsLoading;
  const totalDepts = (allDepts ?? []).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-user-modules">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            Module Assignments
            <PermissionInfo description={MODULES_DESCRIPTION} side="right" />
          </DialogTitle>
          <DialogDescription>
            {userName} — select one or more modules. Users only see the modules they are assigned to in Driver on Demand.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading modules…
          </div>
        ) : totalDepts === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <LayoutGrid className="h-8 w-8 mb-2" />
            <p className="text-sm">No modules found. Modules must be added to an Account before they can be assigned.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search modules or accounts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
                data-testid="input-module-search"
              />
            </div>

            {/* Summary */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{selected.size} of {totalDepts} selected</span>
              {selected.size > 0 && (
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setSelected(new Set())}
                  data-testid="button-clear-all-modules"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Grouped list */}
            {grouped.length === 0 ? (
              <p className="text-sm text-center text-muted-foreground py-4">No modules match your search.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-4 pr-1">
                {grouped.map(({ accountId, accountName, depts }) => {
                  const allSelected = depts.every((d) => selected.has(d.id));
                  const someSelected = depts.some((d) => selected.has(d.id));
                  return (
                    <div key={accountId}>
                      {/* Account header row */}
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
                            {accountName}
                          </span>
                          {someSelected && (
                            <Badge variant="secondary" className="text-xs">
                              {depts.filter((d) => selected.has(d.id)).length}/{depts.length}
                            </Badge>
                          )}
                        </div>
                        <button
                          type="button"
                          className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground shrink-0"
                          onClick={() =>
                            allSelected
                              ? clearAll(depts.map((d) => d.id))
                              : selectAll(depts.map((d) => d.id))
                          }
                          data-testid={`button-toggle-account-${accountId}`}
                        >
                          {allSelected ? "Deselect all" : "Select all"}
                        </button>
                      </div>

                      {/* Module rows */}
                      <div className="space-y-1 pl-1">
                        {depts.map((dept) => (
                          <label
                            key={dept.id}
                            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 cursor-pointer hover-elevate"
                            data-testid={`label-module-${dept.id}`}
                          >
                            <Checkbox
                              checked={selected.has(dept.id)}
                              onCheckedChange={() => toggle(dept.id)}
                              data-testid={`checkbox-module-${dept.id}`}
                            />
                            <span className="flex-1 text-sm font-medium">{dept.name}</span>
                            {dept.code && (
                              <Badge variant="outline" className="text-xs font-mono">{dept.code}</Badge>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-module-cancel">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isLoading}
            data-testid="button-module-save"
          >
            {saveMutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving…</>
              : <><Save className="h-4 w-4 mr-1.5" />Save Assignments</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
