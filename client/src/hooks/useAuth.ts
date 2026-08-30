import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPasswordResetExpiration,
  subscribeToPasswordResetSession,
} from "@/lib/passwordResetSession";

const corporateRoles = [
  "corporate",
  "corporate_admin",
  "super_user",
  "super_admin",
  "admin",
  "finance",
  "recruiter",
  "recruiting_admin",
  "ops_manager",
  "payroll_admin",
  "dispatcher",
  "regional_cl",
  "network_cl",
  "dealer_cl",
  "certification_liaison",
  "custom_user_list",
  "testing",
  "employee",
];

interface AuthMeResponse {
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  orgId: string | null;
  orgName: string | null;
  orgEnvironment: string | null;
  isProvisioned: boolean;
  hasSelectedRole: boolean;
  isRootSuperAdmin: boolean;
  corporateAccessAdmin: boolean;
  profileImageUrl: string | null;
  forcePasswordReset: boolean;
}

export function useAuth() {
  const passwordResetExpiresAt = useSyncExternalStore(
    subscribeToPasswordResetSession,
    getPasswordResetExpiration,
    () => null,
  );
  const isPasswordResetPending = passwordResetExpiresAt !== null;

  const { data, isLoading, error } = useQuery<AuthMeResponse>({
    queryKey: ["/api/auth/me"],
    enabled: !isPasswordResetPending,
    retry: false,
    // Keep stale data for only 30 s so the session state stays accurate.
    // The server now sends Cache-Control: no-store on all /api responses so
    // the CDN / browser won't serve stale 304s for the auth check.
    staleTime: 30 * 1000,
    refetchInterval: isPasswordResetPending ? false : 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const role = data?.role;
  const isDriver = role === "driver";
  const isEmployee = role === "employee";
  const isCorporate = !!role && corporateRoles.includes(role);
  const isAdmin = role === "super_user" || role === "super_admin" || role === "admin";
  const isSystemAdmin = role === "super_user" || role === "super_admin";
  const isSuperAdmin = role === "super_user" || role === "super_admin";
  
  const isAuthenticated =
    !isPasswordResetPending &&
    !!data &&
    !error &&
    data.forcePasswordReset !== true;
  const isProvisioned = data?.isProvisioned ?? false;
  const isRootSuperAdmin = data?.isRootSuperAdmin ?? false;
  const orgEnvironment = data?.orgEnvironment ?? "production";
  const isProductionOrg = orgEnvironment === "production";

  return {
    user: data ? {
      id: data.userId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      orgId: data.orgId,
      orgEnvironment: data.orgEnvironment ?? "production",
      isRootSuperAdmin: data.isRootSuperAdmin ?? false,
      corporateAccessAdmin: data.corporateAccessAdmin ?? false,
      profileImageUrl: data.profileImageUrl ?? null,
      forcePasswordReset: data.forcePasswordReset ?? false,
    } : null,
    isLoading,
    isPasswordResetPending,
    isAuthenticated,
    isProvisioned,
    isDriver,
    isEmployee,
    isCorporate,
    isAdmin,
    isSystemAdmin,
    isSuperAdmin,
    isRootSuperAdmin,
    isProductionOrg,
    orgEnvironment,
    hasSelectedRole: data?.hasSelectedRole ?? false,
    orgName: data?.orgName ?? null,
  };
}
