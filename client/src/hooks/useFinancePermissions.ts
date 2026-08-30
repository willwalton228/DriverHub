import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "./usePermissions";

export interface FinancePerms {
  canViewModule:    boolean;
  canViewDashboard: boolean;
  canViewRevenue:   boolean;
  canViewExpenses:  boolean;
  canViewMargin:    boolean;
  canExport:        boolean;
  canManageQbSync:  boolean;
  canManageProducts: boolean;
  isSuperAdmin:     boolean;
}

const DENIED: FinancePerms = {
  canViewModule:    false,
  canViewDashboard: false,
  canViewRevenue:   false,
  canViewExpenses:  false,
  canViewMargin:    false,
  canExport:        false,
  canManageQbSync:  false,
  canManageProducts: false,
  isSuperAdmin:     false,
};

export function useFinancePermissions() {
  const { isSuperAdmin } = usePermissions();

  const { data, isLoading } = useQuery<FinancePerms>({
    queryKey: ["/api/me/finance-permissions"],
    queryFn: () =>
      fetch("/api/me/finance-permissions", { credentials: "include" }).then(r =>
        r.ok ? r.json() : DENIED
      ),
    staleTime: 60_000,
    retry: false,
  });

  const perms: FinancePerms = isSuperAdmin
    ? { canViewModule: true, canViewDashboard: true, canViewRevenue: true, canViewExpenses: true, canViewMargin: true, canExport: true, canManageQbSync: true, canManageProducts: true, isSuperAdmin: true }
    : (data ?? DENIED);

  return {
    perms,
    isLoading: isLoading && !isSuperAdmin,
    hasAccess:        perms.canViewModule,
    canViewDashboard: perms.canViewDashboard,
    canViewRevenue:   perms.canViewRevenue,
    canViewExpenses:  perms.canViewExpenses,
    canViewMargin:    perms.canViewMargin,
    canExport:        perms.canExport,
    canManageQbSync:  perms.canManageQbSync,
    canManageProducts: perms.canManageProducts,
    isSuperAdmin:     perms.isSuperAdmin || isSuperAdmin,
  };
}
