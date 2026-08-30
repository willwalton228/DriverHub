import { useQuery } from "@tanstack/react-query";

interface OnboardingStatus {
  user_id: string;
  is_provisioned: boolean;
  has_organization: boolean;
  org_id: string | null;
  role: string;
  needs_onboarding: boolean;
}

export function useOnboarding() {
  const { data, isLoading, error, refetch } = useQuery<OnboardingStatus>({
    queryKey: ["/api/onboarding/status"],
    retry: false,
    staleTime: 30000,
  });

  return {
    isProvisioned: data?.is_provisioned ?? false,
    needsOnboarding: data?.needs_onboarding ?? true,
    hasOrganization: data?.has_organization ?? false,
    orgId: data?.org_id ?? null,
    role: data?.role ?? null,
    isLoading,
    error,
    refetch,
  };
}
