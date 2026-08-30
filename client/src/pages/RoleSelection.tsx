import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  Shield, 
  UserCog, 
  Network, 
  Award, 
  Briefcase, 
  ListChecks, 
  TestTube,
  Loader2,
  Mail 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/Logo";
import type { UserRole } from "@shared/schema";
import { Alert, AlertDescription } from "@/components/ui/alert";

const roleConfigs = {
  driver: {
    label: "Driver",
    icon: Users,
    description: "Access your profile, view pay data, and track your trip history",
    features: ["Manage personal information", "View payment history", "Track trip records", "Upload documents"],
    selectable: true,
  },
  employee: {
    label: "Employee",
    icon: Briefcase,
    description: "Standard employee access with basic permissions",
    features: ["View assigned tasks", "Submit reports", "Access company resources"],
    selectable: true,
  },
  regional_cl: {
    label: "Regional CL",
    icon: Network,
    description: "Regional coordinator with area-specific management permissions",
    features: ["Manage regional drivers", "View regional reports", "Coordinate operations"],
    selectable: false,
  },
  network_cl: {
    label: "Network CL",
    icon: Network,
    description: "Network coordinator managing multiple locations",
    features: ["Network-wide oversight", "Multi-location management", "Performance tracking"],
    selectable: false,
  },
  dealer_cl: {
    label: "Dealer CL",
    icon: UserCog,
    description: "Dealer coordinator with partner management access",
    features: ["Manage dealer relationships", "Track dealer performance", "Coordinate dealer operations"],
    selectable: false,
  },
  certification_liaison: {
    label: "Certification Liaison",
    icon: Award,
    description: "Manages driver certifications and compliance",
    features: ["Review certifications", "Track compliance", "Manage documentation"],
    selectable: false,
  },
  admin: {
    label: "Admin",
    icon: Shield,
    description: "Administrative access with elevated permissions",
    features: ["User management", "System configuration", "Full data access"],
    selectable: false,
  },
  super_user: {
    label: "Super User",
    icon: Shield,
    description: "Full system access with all permissions",
    features: ["Complete system control", "All administrative functions", "Unrestricted access"],
    selectable: false,
  },
  custom_user_list: {
    label: "Custom User List",
    icon: ListChecks,
    description: "Custom role with specific permissions",
    features: ["Custom access levels", "Specific permissions", "Tailored functionality"],
    selectable: false,
  },
  testing: {
    label: "Testing",
    icon: TestTube,
    description: "Testing and development access",
    features: ["System testing", "Development access", "QA functions"],
    selectable: false,
  },
} as const;

export default function RoleSelection() {
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  // Check for invitation code in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    if (code) {
      setInviteCode(code);
    }
  }, []);

  // Validate invitation code
  const { data: invitationData, isLoading: validatingInvite } = useQuery({
    queryKey: ['/api/invitations', inviteCode],
    queryFn: async () => {
      const response = await fetch(`/api/invitations/${inviteCode}`);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return response.json();
    },
    enabled: !!inviteCode,
    retry: false,
  });

  // Auto-select role from invitation
  useEffect(() => {
    if (invitationData && !selectedRole && !setRoleMutation.isPending) {
      setSelectedRole(invitationData.role as UserRole);
      setRoleMutation.mutate({ role: invitationData.role as UserRole, inviteCode: inviteCode! });
    }
  }, [invitationData]);

  const setRoleMutation = useMutation({
    mutationFn: async (data: { role: UserRole; inviteCode?: string }) => {
      return await apiRequest("POST", "/api/admin/set-role", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Success",
        description: "Your role has been set. Redirecting...",
      });
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to set role. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleSelectRole = (role: UserRole) => {
    const config = roleConfigs[role];
    if (!config.selectable && !invitationData) {
      toast({
        title: "Role Restricted",
        description: "This role must be assigned by an administrator. Contact your IT department for access.",
        variant: "destructive",
      });
      return;
    }
    setSelectedRole(role);
    setRoleMutation.mutate({ role, inviteCode: inviteCode || undefined });
  };

  const selectableRoles = Object.entries(roleConfigs).filter(([_, config]) => config.selectable);
  const restrictedRoles = Object.entries(roleConfigs).filter(([_, config]) => !config.selectable);

  // Show loading state while validating invite
  if (validatingInvite) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Validating invitation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-6xl space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center mb-6">
            <Logo className="h-16" />
          </div>
          <h1 className="text-3xl font-bold">Welcome to DriverHub 360</h1>
          <p className="text-lg text-muted-foreground">
            {invitationData 
              ? `You've been invited as ${roleConfigs[invitationData.role as UserRole]?.label || invitationData.role}`
              : "Please select your role to continue"}
          </p>
        </div>

        {invitationData && (
          <Alert>
            <Mail className="h-4 w-4" />
            <AlertDescription>
              You have an active invitation for the <strong>{roleConfigs[invitationData.role as UserRole]?.label || invitationData.role}</strong> role. 
              Your role is being set up automatically.
            </AlertDescription>
          </Alert>
        )}

        <div>
          <h2 className="text-xl font-semibold mb-4">Available Roles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {selectableRoles.map(([roleKey, config]) => {
              const Icon = config.icon;
              const role = roleKey as UserRole;
              return (
                <Card
                  key={role}
                  className={`cursor-pointer transition-all hover-elevate ${
                    selectedRole === role ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => !setRoleMutation.isPending && handleSelectRole(role)}
                  data-testid={`card-select-${role}`}
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle>{config.label}</CardTitle>
                        <CardDescription className="text-sm mt-1">
                          {config.description}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {config.features.map((feature, idx) => (
                        <li key={idx}>• {feature}</li>
                      ))}
                    </ul>
                    <Button 
                      className="w-full" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectRole(role);
                      }}
                      disabled={setRoleMutation.isPending}
                      data-testid={`button-confirm-${role}`}
                    >
                      {setRoleMutation.isPending && selectedRole === role ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Setting up...
                        </>
                      ) : (
                        "Select Role"
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">Restricted Roles</h2>
          <p className="text-sm text-muted-foreground mb-4">
            These roles must be assigned by an administrator. Contact your IT department if you need access.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {restrictedRoles.map(([roleKey, config]) => {
              const Icon = config.icon;
              return (
                <Card
                  key={roleKey}
                  className="opacity-60 cursor-not-allowed"
                  data-testid={`card-restricted-${roleKey}`}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col items-center text-center gap-2">
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium">{config.label}</div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
