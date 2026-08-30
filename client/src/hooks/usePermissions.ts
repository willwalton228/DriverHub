import { useQuery } from "@tanstack/react-query";
import type {
  CorporateModuleKey,
  ActionPermissionKey,
  SensitiveDataCategory,
  DriverPermissionKey,
} from "@shared/schema";

type RoleClass = 'SUPER_ADMIN' | 'CORPORATE' | 'DRIVER';

interface EffectivePermissions {
  roleClass: RoleClass;
  role: string;
  modulesEnabled: CorporateModuleKey[];
  actionsAllowed: ActionPermissionKey[];
  driverPermissions: DriverPermissionKey[];
  sensitiveViewAllowed: SensitiveDataCategory[];
  sensitiveEditAllowed: SensitiveDataCategory[];
  isCorporateAccessAdmin: boolean;
  scope: {
    accountId: string | null;
    driverId: string | null;
    crossTenantAllowed: boolean;
  };
}

export function usePermissions() {
  const { data, isLoading } = useQuery<EffectivePermissions>({
    queryKey: ["/api/me/permissions"],
    retry: false,
    staleTime: 60_000,
  });

  const hasModule = (key: CorporateModuleKey): boolean => {
    return data?.modulesEnabled?.includes(key) ?? false;
  };

  const hasAction = (key: ActionPermissionKey): boolean => {
    return data?.actionsAllowed?.includes(key) ?? false;
  };

  const canViewSensitive = (key: SensitiveDataCategory): boolean => {
    return data?.sensitiveViewAllowed?.includes(key) ?? false;
  };

  const canEditSensitive = (key: SensitiveDataCategory): boolean => {
    return data?.sensitiveEditAllowed?.includes(key) ?? false;
  };

  const hasDriverPermission = (key: DriverPermissionKey): boolean => {
    return data?.driverPermissions?.includes(key) ?? false;
  };

  return {
    permissions: data ?? null,
    isLoading,
    roleClass: data?.roleClass ?? null,
    isSuperAdmin: data?.roleClass === 'SUPER_ADMIN',
    isCorporate: data?.roleClass === 'CORPORATE',
    isDriver: data?.roleClass === 'DRIVER',
    isCorporateAccessAdmin: data?.isCorporateAccessAdmin ?? false,
    modulesEnabled: data?.modulesEnabled ?? [],
    actionsAllowed: data?.actionsAllowed ?? [],
    driverPermissions: data?.driverPermissions ?? [],
    hasModule,
    hasAction,
    canViewSensitive,
    canEditSensitive,
    hasDriverPermission,
  };
}
