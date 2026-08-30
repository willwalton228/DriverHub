import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, RefreshCw, Users, UserPlus, Database, UserX, UserCheck, ArrowUpDown, ArrowUp, ArrowDown, Shield, ShieldCheck, ClipboardList, Clock, CheckCircle, XCircle, AlertTriangle, Info, Calendar, Zap, Send, UserCog, Copy, Link, RotateCcw, Building2 as VendorIcon, KeyRound, Smartphone, Globe, ToggleLeft, ToggleRight, Eye, EyeOff, Building2, MoreHorizontal, ChevronLeft, ChevronRight, Download, LayoutGrid } from "lucide-react";
import { UserDepartmentsDialog } from "@/components/users/UserDepartmentsDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LinkDriverModal } from "@/components/LinkDriverModal";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@shared/schema";
import { ROLE_HIERARCHY } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { formatDate } from "@/lib/dateFormat";
import { PermissionInfo } from "@/components/ui/PermissionInfo";
import {
  ROLE_DESCRIPTIONS,
  CORPORATE_ACCESS_ADMIN_DESCRIPTION,
  MODULES_DESCRIPTION,
  VENDOR_ACCESS_DESCRIPTION,
  VENDOR_PERM_DESCRIPTIONS,
} from "@/lib/permissionDescriptions";

const PAGE_SIZE = 15;

const roleLabels: Record<string, string> = {
  super_user: "Super Admin",
  admin: "Administrator",
  corporate_admin: "Corporate Admin",
  corporate: "Corporate",
  finance: "Finance",
  recruiter: "Recruiter",
  regional_cl: "Regional CL",
  network_cl: "Network CL",
  dealer_cl: "Dealer CL",
  certification_liaison: "Certification Liaison",
  custom_user_list: "Custom User List",
  driver: "Driver",
  employee: "Employee",
  testing: "Testing",
  integration_user: "Integration User",
};

interface AdminUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  orgId: string | null;
  isProvisioned: boolean | null;
  corporateAccessAdmin: boolean | null;
  canGrantSensitiveDataAccess: boolean | null;
  canGrantExports: boolean | null;
  actionPermissions?: Record<string, boolean> | null;
  driverId: string | null;
  employeeId: string | null;
  lastLoginAt?: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  isRootSuperAdmin?: boolean | null;
  forcePasswordReset?: boolean | null;
  inviteTokenExpiresAt?: string | null;
}

interface EffectivePermissions {
  maxGrantableRoleLevel: number;
  canGrantSensitive: boolean;
  canGrantExport: boolean;
  grantableRoles: string[];
  canProvision: boolean;
  isSuperAdmin: boolean;
  isCorporateAccessAdmin: boolean;
  sensitiveFields: string[];
}

interface AccessRequest {
  id: string;
  requestedEmail: string;
  requestedFirstName: string | null;
  requestedLastName: string | null;
  requestedRole: string;
  requestedPermissionPack: string | null;
  requestedSensitiveFields: string[];
  justification: string | null;
  cappedDiff: { reasons: string[] } | null;
  status: string;
  reviewerNotes: string | null;
  approvedRole: string | null;
  createdAt: string;
  resolvedAt: string | null;
  requestor: { email: string; firstName: string | null; lastName: string | null; role: string } | null;
}

type SortField = "name" | "email" | "role" | "lastLoginAt" | "status" | "createdAt";
type SortDir = "asc" | "desc";
type TabKey = "users" | "requests" | "provisioning" | "audit" | "sso";

interface AppEntitlement {
  appCode: string;
  accessGranted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  entitlementId: string | null;
}

interface SsoUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  orgId: string | null;
  ssoRole: string | null;
  effectiveSsoRole: string;
  ssoSubjectId: string | null;
  hasDriverHubAccess: boolean;
  hasDriverConnectAccess: boolean;
  lastLoginAt: string | null;
  appEntitlements: AppEntitlement[];
}

function formatLastLogin(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Never";
  return d.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

const sensitiveFieldLabels: Record<string, string> = {
  ssn: "SSN / Tax ID",
  banking_ach: "Banking / ACH",
  pay_rate: "Pay Rate",
  background_check: "Background Check",
  internal_risk_notes: "Internal Risk Notes",
  data_export: "Data Export",
};

function getUserInitials(u: AdminUser): string {
  if (u.role === "integration_user") return "⚡";
  const first = u.firstName?.[0] ?? "";
  const last = u.lastName?.[0] ?? "";
  return (first + last).toUpperCase() || (u.email?.[0] ?? "?").toUpperCase();
}

function getAccessDescription(u: AdminUser): string {
  if (u.role === "integration_user") return "API + Database";
  if (u.role === "super_user") return "All Modules";
  if (u.role === "admin" || u.corporateAccessAdmin) return "All Modules";
  if (u.role === "corporate_admin") return "Corporate + Admin";
  if (u.role === "finance") return "Finance";
  if (u.role === "recruiter") return "Recruiting";
  if (u.role === "driver") return "Driver Portal";
  if (u.role === "employee") return "Corporate Dashboard";
  return "—";
}

function getRolePillClass(role: string): string {
  if (role === "super_user" || role === "integration_user")
    return "bg-[#eeebff] text-[#4a2bd3] border-[#d4ccff]";
  return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
}

function getStatusPillClass(status: string): string {
  if (status === "ACTIVE") return "bg-[#eeebff] text-[#4a2bd3] border-[#d4ccff]";
  if (status === "INVITED") return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";
}

export default function AdminUserManagement() {
  const { toast } = useToast();
  const { user, isProductionOrg, isRootSuperAdmin } = useAuth();
  const orgId = user?.orgId;
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("driver");
  const [inviteJustification, setInviteJustification] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [activeTab, setActiveTab] = useState<TabKey>("users");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "DISABLED" | "all">("ACTIVE");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  // Provisioning tab state
  const [hmEmpId, setHmEmpId] = useState("");
  const [hmRole, setHmRole] = useState("employee");
  const [hmStartDate, setHmStartDate] = useState("");
  const [hmJustification, setHmJustification] = useState("");
  const [provisionNotes, setProvisionNotes] = useState<Record<string, string>>({});
  const [manualInviteOpen, setManualInviteOpen] = useState(false);
  const [miEmail, setMiEmail] = useState("");
  const [miFirstName, setMiFirstName] = useState("");
  const [miLastName, setMiLastName] = useState("");
  const [miRole, setMiRole] = useState("employee");
  const [miReason, setMiReason] = useState("");
  // Create Direct User dialog state
  const [createDirectOpen, setCreateDirectOpen] = useState(false);
  const [cdFirstName, setCdFirstName] = useState("");
  const [cdLastName, setCdLastName] = useState("");
  const [cdEmail, setCdEmail] = useState("");
  const [cdPassword, setCdPassword] = useState("");
  const [cdShowPassword, setCdShowPassword] = useState(false);
  const [cdRole, setCdRole] = useState("corporate");
  const [cdStatus, setCdStatus] = useState<"ACTIVE" | "DISABLED">("ACTIVE");
  const [inviteLinkDialog, setInviteLinkDialog] = useState<{
    open: boolean;
    url: string;
    expiresAt: string | null;
    userName: string;
  }>({ open: false, url: "", expiresAt: null, userName: "" });
  const [roleEditUser, setRoleEditUser] = useState<AdminUser | null>(null);
  const [roleEditValue, setRoleEditValue] = useState("");

  // Department Assignment dialog
  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [deptDialogUser, setDeptDialogUser] = useState<{ id: string; name: string } | null>(null);

  // Vendor Module Permissions dialog
  const [vendorPermsUserId, setVendorPermsUserId] = useState<string | null>(null);
  const [vendorPermsForm, setVendorPermsForm] = useState({
    canView: false, canCreate: false, canEdit: false, canDelete: false,
    canManageContracts: false, canManagePricing: false, canManageDocuments: false,
    canManageNotes: false, canManageCompliance: false, canManageRenewals: false,
  });

  const { data: users, isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: effectivePerms } = useQuery<EffectivePermissions>({
    queryKey: ["/api/admin/users/effective-permissions"],
  });

  const { data: accessRequests, isLoading: requestsLoading } = useQuery<AccessRequest[]>({
    queryKey: ["/api/admin/users/access-requests"],
  });

  const { data: auditLogs, isLoading: auditLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/users/provisioning-audit"],
    enabled: effectivePerms?.isSuperAdmin || user?.role === 'admin',
  });

  const [ssoSearch, setSsoSearch] = useState("");
  const [ssoSubTab, setSsoSubTab] = useState<"entitlements" | "provisioned" | "audit">("entitlements");

  const { data: ssoUsers, isLoading: ssoLoading, refetch: refetchSso } = useQuery<SsoUser[]>({
    queryKey: ["/api/admin/v1/sso/users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/v1/sso/users", { credentials: "include" });
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: activeTab === "sso",
  });

  const { data: dcProvisionedData, isLoading: dcProvisionedLoading, refetch: refetchProvisioned } = useQuery<any[]>({
    queryKey: ["/api/admin/v1/sso/provisioned"],
    queryFn: async () => {
      const res = await fetch("/api/admin/v1/sso/provisioned", { credentials: "include" });
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: activeTab === "sso" && ssoSubTab === "provisioned",
  });

  const { data: ssoAuditData, isLoading: ssoAuditLoading, refetch: refetchSsoAudit } = useQuery<any[]>({
    queryKey: ["/api/admin/v1/sso/audit-log"],
    queryFn: async () => {
      const res = await fetch("/api/admin/v1/sso/audit-log", { credentials: "include" });
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: activeTab === "sso" && ssoSubTab === "audit",
  });

  const updateSsoRoleMutation = useMutation({
    mutationFn: async ({ userId, ssoRole, ssoSubjectId }: { userId: string; ssoRole?: string | null; ssoSubjectId?: string | null }) => {
      const body: any = {};
      if (ssoRole !== undefined) body.ssoRole = ssoRole;
      if (ssoSubjectId !== undefined) body.ssoSubjectId = ssoSubjectId;
      const res = await apiRequest("PATCH", `/api/admin/v1/sso/users/${userId}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/v1/sso/users"] });
      toast({ title: "SSO role updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update SSO role", description: err.message, variant: "destructive" });
    },
  });

  const updateEntitlementMutation = useMutation({
    mutationFn: async ({ userId, appCode, accessGranted, notes }: { userId: string; appCode: string; accessGranted: boolean; notes?: string }) => {
      const res = await apiRequest("POST", `/api/admin/v1/sso/users/${userId}/entitlements`, { appCode, accessGranted, notes });
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/v1/sso/users"] });
      toast({ title: vars.accessGranted ? `${vars.appCode} access granted` : `${vars.appCode} access revoked` });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update entitlement", description: err.message, variant: "destructive" });
    },
  });

  type VendorModulePerms = {
    canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
    canManageContracts: boolean; canManagePricing: boolean; canManageDocuments: boolean;
    canManageNotes: boolean; canManageCompliance: boolean; canManageRenewals: boolean;
  };
  const { data: vendorPermsData, isLoading: vendorPermsLoading } = useQuery<VendorModulePerms | null>({
    queryKey: ["/api/admin/users", vendorPermsUserId, "module-permissions", "vendors"],
    queryFn: async () => {
      if (!vendorPermsUserId) return null;
      const res = await fetch(`/api/admin/users/${vendorPermsUserId}/module-permissions/vendors`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!vendorPermsUserId,
  });

  const saveVendorPermsMutation = useMutation({
    mutationFn: async (perms: VendorModulePerms) => {
      if (!vendorPermsUserId) throw new Error("No user selected");
      const res = await apiRequest("PUT", `/api/admin/users/${vendorPermsUserId}/module-permissions/vendors`, perms);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", vendorPermsUserId, "module-permissions", "vendors"] });
      toast({ title: "Vendor permissions saved" });
      setVendorPermsUserId(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to save permissions", description: err.message, variant: "destructive" });
    },
  });

  const { data: employeesList } = useQuery<any[]>({
    queryKey: ["/api/corporate/employees"],
    enabled: activeTab === "provisioning",
  });

  const { data: pendingActivations, isLoading: pendingActivationsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/users/provisioning/pending-activations"],
    enabled: activeTab === "provisioning" && !!effectivePerms?.isSuperAdmin,
  });

  const inviteUserMutation = useMutation({
    mutationFn: async (data: { email: string; role: string; firstName?: string; lastName?: string; justification?: string }) => {
      const response = await apiRequest("POST", "/api/admin/users/invite", data);
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/access-requests"] });
      if (data.requiresApproval) {
        toast({
          title: "Approval Required",
          description: data.message || "Request sent to Super Admin for approval.",
        });
      } else if (data.inviteUrl) {
        setInviteLinkDialog({
          open: true,
          url: data.inviteUrl,
          expiresAt: data.inviteTokenExpiresAt ?? null,
          userName: variables.email,
        });
      } else {
        toast({ title: "Invitation Sent", description: "User invitation has been created." });
      }
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
      setInviteRole("driver");
      setInviteJustification("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      });
    },
  });

  const updateUserStatusMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}`, { status });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "User Updated",
        description: variables.status === "DISABLED" ? "User has been disabled." : "User has been enabled.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update user", variant: "destructive" });
    },
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}`, { role });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setRoleEditUser(null);
      toast({
        title: "Role Updated",
        description: `User role changed to ${roleLabels[variables.role] || variables.role}.`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update user role", variant: "destructive" });
    },
  });

  const updateCaaMutation = useMutation({
    mutationFn: async (data: { userId: string; corporateAccessAdmin?: boolean; canGrantSensitiveDataAccess?: boolean; canGrantExports?: boolean }) => {
      const { userId, ...body } = data;
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}/caa`, body);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Updated", description: "Delegation permissions updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update permissions", variant: "destructive" });
    },
  });

  const updateDriverSsnPermissionMutation = useMutation({
    mutationFn: async ({ userId, enabled }: { userId: string; enabled: boolean }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}/driver-permission`, {
        viewFullDriverSsn: enabled,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Updated", description: "Driver SSN permission updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update Driver SSN permission", variant: "destructive" });
    },
  });

  const reviewRequestMutation = useMutation({
    mutationFn: async (data: { requestId: string; action: string; reviewerNotes?: string; approvedRole?: string }) => {
      const { requestId, ...body } = data;
      const response = await apiRequest("POST", `/api/admin/users/access-requests/${requestId}/review`, body);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/access-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/provisioning-audit"] });
      toast({ title: "Review Complete", description: "Access request has been processed." });
      setReviewNotes({});
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to process request", variant: "destructive" });
    },
  });

  const hmRequestMutation = useMutation({
    mutationFn: async (data: { employeeId: string; requestedRole: string; startDate?: string; justification?: string }) => {
      const response = await apiRequest("POST", "/api/admin/users/access-requests/hiring-manager", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/access-requests"] });
      toast({ title: "Request Submitted", description: "Access request sent to Super Admin for approval." });
      setHmEmpId(""); setHmRole("employee"); setHmStartDate(""); setHmJustification("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to submit request", variant: "destructive" });
    },
  });

  const provisionUserMutation = useMutation({
    mutationFn: async (data: { requestId: string; reviewerNotes?: string; approvedRole?: string }) => {
      const { requestId, ...body } = data;
      const response = await apiRequest("POST", `/api/admin/users/access-requests/${requestId}/provision`, body);
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/access-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/provisioning/pending-activations"] });
      toast({
        title: data.pendingActivation ? "Provisioned — Pending Activation" : "User Provisioned",
        description: data.message,
      });
      setProvisionNotes({});
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to provision user", variant: "destructive" });
    },
  });

  const manualInviteMutation = useMutation({
    mutationFn: async (data: { email: string; firstName?: string; lastName?: string; role: string; reason: string }) => {
      const response = await apiRequest("POST", "/api/admin/users/manual-invite", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/provisioning-audit"] });
      toast({ title: "Manual Invite Sent", description: "The invitation has been issued." });
      setManualInviteOpen(false);
      setMiEmail(""); setMiFirstName(""); setMiLastName(""); setMiRole("employee"); setMiReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to send manual invite", variant: "destructive" });
    },
  });

  const createDirectUserMutation = useMutation({
    mutationFn: async (data: {
      email: string; firstName: string; lastName: string;
      temporaryPassword: string; role: string; status: string;
    }) => {
      const response = await apiRequest("POST", "/api/admin/users/create-direct", data);
      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.message || "Failed to create user");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/provisioning-audit"] });
      toast({ title: "User Created", description: "User account is active. They must set a new password on first login." });
      setCreateDirectOpen(false);
      setCdFirstName(""); setCdLastName(""); setCdEmail(""); setCdPassword(""); setCdRole("corporate"); setCdStatus("ACTIVE");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create user", variant: "destructive" });
    },
  });

  const activateUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("POST", `/api/admin/users/provisioning/activate/${userId}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/provisioning/pending-activations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User Activated", description: "Invitation sent to the user." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to activate user", variant: "destructive" });
    },
  });

  const seedDatabaseMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/seed-database", { credentials: "include" });
      if (!response.ok) { const text = await response.text(); throw new Error(text || "Failed to seed database"); }
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/trips"] });
      toast({ title: "Database Seeded", description: `Created: ${data.drivers || 0} drivers, ${data.employees || 0} employees, ${data.customers || 0} customers, ${data.trips || 0} trips` });
    },
    onError: (error: any) => {
      toast({ title: "Seed Error", description: error.message || "Failed to seed database", variant: "destructive" });
    },
  });

  const handleInviteUser = () => {
    if (!inviteEmail) {
      toast({ title: "Validation Error", description: "Please enter an email address", variant: "destructive" });
      return;
    }
    inviteUserMutation.mutate({
      email: inviteEmail,
      role: inviteRole,
      firstName: inviteFirstName || undefined,
      lastName: inviteLastName || undefined,
      justification: inviteJustification || undefined,
    });
  };

  const allNonInvited = users?.filter(u => u.status !== "INVITED") || [];

  useEffect(() => {
    if (vendorPermsData) {
      setVendorPermsForm({
        canView: vendorPermsData.canView ?? false,
        canCreate: vendorPermsData.canCreate ?? false,
        canEdit: vendorPermsData.canEdit ?? false,
        canDelete: vendorPermsData.canDelete ?? false,
        canManageContracts: vendorPermsData.canManageContracts ?? false,
        canManagePricing: vendorPermsData.canManagePricing ?? false,
        canManageDocuments: vendorPermsData.canManageDocuments ?? false,
        canManageNotes: vendorPermsData.canManageNotes ?? false,
        canManageCompliance: vendorPermsData.canManageCompliance ?? false,
        canManageRenewals: vendorPermsData.canManageRenewals ?? false,
      });
    }
  }, [vendorPermsData]);

  const filteredAndSortedUsers = useMemo(() => {
    let filtered = [...allNonInvited];
    if (statusFilter !== "all") {
      filtered = filtered.filter(u => u.status === statusFilter);
    }
    if (roleFilter !== "all") {
      filtered = filtered.filter(u => u.role === roleFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(u => {
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ").toLowerCase();
        const email = (u.email || "").toLowerCase();
        return name.includes(q) || email.includes(q);
      });
    }
    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name": {
          const nameA = [a.firstName, a.lastName].filter(Boolean).join(" ").toLowerCase();
          const nameB = [b.firstName, b.lastName].filter(Boolean).join(" ").toLowerCase();
          cmp = nameA.localeCompare(nameB); break;
        }
        case "email": cmp = (a.email || "").localeCompare(b.email || ""); break;
        case "role": cmp = (a.role || "").localeCompare(b.role || ""); break;
        case "status": cmp = (a.status || "").localeCompare(b.status || ""); break;
        case "lastLoginAt": {
          const tA = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
          const tB = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
          cmp = tA - tB; break;
        }
        case "createdAt": {
          const tA = a.createdAt ? new Date(a.createdAt as any).getTime() : 0;
          const tB = b.createdAt ? new Date(b.createdAt as any).getTime() : 0;
          cmp = tA - tB; break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return filtered;
  }, [allNonInvited, sortField, sortDir, statusFilter, roleFilter, searchQuery]);

  useEffect(() => { setPage(1); }, [statusFilter, roleFilter, searchQuery]);

  const metrics = useMemo(() => {
    const nonInvited = (users || []).filter(u => u.status !== "INVITED");
    return {
      active: nonInvited.filter(u => u.status === "ACTIVE").length,
      admins: nonInvited.filter(u => ["super_user", "admin", "corporate_admin"].includes(u.role)).length,
      integration: nonInvited.filter(u => u.role === "integration_user").length,
      disabled: nonInvited.filter(u => u.status === "DISABLED").length,
      total: nonInvited.length,
    };
  }, [users]);

  const roleDist = useMemo(() => {
    const total = allNonInvited.length;
    return {
      corporate: allNonInvited.filter(u => !["super_user", "admin", "corporate_admin", "integration_user", "driver", "employee"].includes(u.role)).length,
      corporateAdmin: allNonInvited.filter(u => u.role === "admin" || u.role === "corporate_admin").length,
      superAdmin: allNonInvited.filter(u => u.role === "super_user").length,
      integration: allNonInvited.filter(u => u.role === "integration_user").length,
      driver: allNonInvited.filter(u => u.role === "driver" || u.role === "employee").length,
      total,
    };
  }, [allNonInvited]);

  const securityStats = useMemo(() => ({
    active: allNonInvited.filter(u => u.status === "ACTIVE").length,
    needsAction: allNonInvited.filter(u => u.forcePasswordReset).length,
    disabled: allNonInvited.filter(u => u.status === "DISABLED").length,
  }), [allNonInvited]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedUsers.length / PAGE_SIZE));
  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredAndSortedUsers.slice(start, start + PAGE_SIZE);
  }, [filteredAndSortedUsers, page]);

  const handleSort = (field: SortField) => {
    if (sortField === field) { setSortDir(d => d === "asc" ? "desc" : "asc"); }
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE": return <Badge variant="default" className="bg-green-600">Active</Badge>;
      case "INVITED": return <Badge variant="secondary">Invited</Badge>;
      case "DISABLED": return <Badge variant="destructive">Disabled</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getRequestStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "approved": return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case "approved_with_changes": return <Badge variant="default" className="bg-blue-600"><CheckCircle className="h-3 w-3 mr-1" />Approved (Modified)</Badge>;
      case "approved_pending_activation": return <Badge variant="default" className="bg-amber-600"><Calendar className="h-3 w-3 mr-1" />Pending Activation</Badge>;
      case "denied": return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Denied</Badge>;
      case "more_info_requested": return <Badge variant="outline"><Info className="h-3 w-3 mr-1" />More Info Needed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const exceedsCurrentLevel = inviteRole && effectivePerms
    ? (ROLE_HIERARCHY[inviteRole] ?? 0) > effectivePerms.maxGrantableRoleLevel
    : false;

  const pendingRequestCount = accessRequests?.filter(r => r.status === 'pending').length || 0;

  const hmPendingCount = accessRequests?.filter(r => r.status === 'pending' && (r as any).requestType === 'hiring_manager_request').length || 0;

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "users", label: "Users" },
    { key: "requests", label: "Access Requests", count: pendingRequestCount },
    { key: "provisioning", label: "Provisioning", count: (pendingActivations?.length || 0) + hmPendingCount || undefined },
    ...(effectivePerms?.isSuperAdmin || user?.role === 'admin' ? [{ key: "audit" as TabKey, label: "Audit Log" }] : []),
    ...(effectivePerms?.isSuperAdmin ? [{ key: "sso" as TabKey, label: "SSO Identity" }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#f7f8fc] dark:bg-background p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Administration&nbsp;&nbsp;/&nbsp;&nbsp;<span className="font-semibold text-foreground">Users</span></p>
          <h1 className="text-2xl font-bold tracking-tight text-[#182039] dark:text-foreground" data-testid="text-page-title">User Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create users, manage access, and review account activity.</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <LinkDriverModal />
          {effectivePerms?.canProvision && (
            <Button onClick={() => setCreateDirectOpen(true)} className="bg-[#5737f2] hover:bg-[#4a2bd3] text-white" data-testid="button-create-direct-user">
              <UserPlus className="h-4 w-4 mr-2" />Create New User
            </Button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Users", value: metrics.active, sub: "All enabled", icon: <Users className="h-4 w-4 text-[#5737f2]" /> },
          { label: "Administrators", value: metrics.admins, sub: metrics.total > 0 ? `${Math.round((metrics.admins / metrics.total) * 100)}% of users` : "—", icon: <Shield className="h-4 w-4 text-[#5737f2]" /> },
          { label: "Integration Users", value: metrics.integration, sub: "Service accounts", icon: <Zap className="h-4 w-4 text-[#5737f2]" /> },
          { label: "Disabled", value: metrics.disabled, sub: "Not shown by default", icon: <UserX className="h-4 w-4 text-[#5737f2]" /> },
        ].map((m) => (
          <div key={m.label} className="bg-white dark:bg-card border border-[#e6e8ef] dark:border-border rounded-xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-[#eeebff] dark:bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">{m.icon}</div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">{m.label}</p>
              <p className="text-2xl font-bold text-[#182039] dark:text-foreground leading-tight mt-0.5">{usersLoading ? <span className="text-muted-foreground text-base">—</span> : m.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{m.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tab Bar */}
      <div className="border-b border-[#dde0e8] dark:border-border">
        <div className="flex gap-0">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-[#5737f2] text-[#4a2bd3] dark:text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-${tab.key}`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">{tab.count}</Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "users" && (
        <div className="flex gap-4 items-start">
          {/* Table Panel */}
          <div className="flex-1 min-w-0 bg-white dark:bg-card border border-[#e4e7ee] dark:border-border rounded-xl overflow-hidden">
            <div className="px-6 pt-5 pb-4">
              <h2 className="text-base font-bold text-[#182039] dark:text-foreground">
                {statusFilter === "ACTIVE" ? "Active Users" : statusFilter === "DISABLED" ? "Inactive Users" : "All Users"}
                {" "}<span className="text-[#5737f2]">({filteredAndSortedUsers.length})</span>
              </h2>
            </div>
            <div className="px-6 pb-4 flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 min-w-[180px] max-w-xs h-9 text-sm border-[#cfd4df] dark:border-border"
                data-testid="input-user-search"
              />
              <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setPage(1); }}>
                <SelectTrigger className="w-36 h-9 text-sm border-[#cfd4df] dark:border-border" data-testid="select-role-filter">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {Object.entries(roleLabels).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={v => setStatusFilter(v as "ACTIVE" | "DISABLED" | "all")}>
                <SelectTrigger
                  className={`w-32 h-9 text-sm font-semibold ${statusFilter === "ACTIVE" ? "border-[#c8bfff] bg-[#f4f1ff] text-[#4a2bd3] dark:bg-primary/10 dark:text-primary" : "border-[#cfd4df] dark:border-border"}`}
                  data-testid="select-user-status-filter"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE" data-testid="option-status-active">Active</SelectItem>
                  <SelectItem value="DISABLED" data-testid="option-status-inactive">Inactive</SelectItem>
                  <SelectItem value="all" data-testid="option-status-all">All Users</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {usersLoading ? (
              <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : filteredAndSortedUsers.length === 0 ? (
              <div className="text-center py-14 px-6">
                <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery.trim() ? `No users match "${searchQuery.trim()}"` : statusFilter === "ACTIVE" ? "No active users found" : "No users found"}
                </p>
              </div>
            ) : (
              <>
                <div className="px-6">
                  <div className="grid grid-cols-[minmax(180px,2fr)_minmax(120px,1fr)_minmax(100px,1fr)_90px_minmax(110px,1fr)_90px] bg-[#f7f8fb] dark:bg-muted/30 rounded-md px-4 py-2.5 gap-2">
                    <button className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-left" onClick={() => handleSort("name")} data-testid="sort-name">User <SortIcon field="name" /></button>
                    <button className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-left" onClick={() => handleSort("role")} data-testid="sort-role">Role <SortIcon field="role" /></button>
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Access</span>
                    <button className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-left" onClick={() => handleSort("status")} data-testid="sort-status">Status <SortIcon field="status" /></button>
                    <button className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-left" onClick={() => handleSort("lastLoginAt")} data-testid="sort-last-login">Last Login <SortIcon field="lastLoginAt" /></button>
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-right">Actions</span>
                  </div>
                </div>
                <div className="px-6 pb-2">
                  {paginatedUsers.map((u, idx) => (
                    <div key={u.id} data-testid={`row-user-${u.id}`}>
                      <div className="grid grid-cols-[minmax(180px,2fr)_minmax(120px,1fr)_minmax(100px,1fr)_90px_minmax(110px,1fr)_90px] items-center px-4 py-3.5 gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-[#e9e5ff] dark:bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-[#4a2bd3] dark:text-primary">{getUserInitials(u)}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground leading-tight truncate">
                              {u.firstName || u.lastName ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "—"}
                              {u.isRootSuperAdmin && <span className="ml-1.5 text-[10px] text-[#5737f2] font-normal">(Root)</span>}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{u.email || "—"}</p>
                          </div>
                        </div>
                        <div>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${getRolePillClass(u.role)}`}>
                            {u.role === "integration_user" && <Zap className="h-3 w-3" />}
                            {roleLabels[u.role] || u.role}
                          </span>
                          {u.forcePasswordReset && <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400">Reset</span>}
                        </div>
                        <span className="text-xs text-muted-foreground truncate">{getAccessDescription(u)}</span>
                        <div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusPillClass(u.status)}`}>
                            {u.status === "ACTIVE" ? "Active" : u.status === "INVITED" ? "Invited" : "Disabled"}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground truncate">
                          {u.role === "integration_user" ? "Service account" : formatLastLogin(u.lastLoginAt)}
                        </span>
                        <div className="flex justify-end">
                          {u.isRootSuperAdmin ? (
                            <span className="text-xs text-muted-foreground italic">Protected</span>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs border-[#d7dbe4] dark:border-border" data-testid={`button-actions-${u.id}`}>
                                  Edit <MoreHorizontal className="h-3.5 w-3.5 ml-1" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                {(effectivePerms?.isSuperAdmin || user?.role === "admin") && (
                                  <DropdownMenuItem onClick={() => { setDeptDialogUser({ id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id }); setDeptDialogOpen(true); }} data-testid={`button-dept-assign-${u.id}`}>
                                    <LayoutGrid className="h-3.5 w-3.5 mr-2" />
                                    <span className="flex-1">Modules</span>
                                    <PermissionInfo description={MODULES_DESCRIPTION} side="left" className="ml-1" />
                                  </DropdownMenuItem>
                                )}
                                {effectivePerms?.grantableRoles?.length && (
                                  <DropdownMenuItem
                                    onClick={() => { setRoleEditUser(u); setRoleEditValue(u.role); }}
                                    data-testid={`button-role-edit-${u.id}`}
                                  >
                                    <ShieldCheck className="h-3.5 w-3.5 mr-2" />
                                    Change Role
                                  </DropdownMenuItem>
                                )}
                                {(effectivePerms?.isSuperAdmin || user?.role === "admin") && u.role !== "driver" && (
                                  <DropdownMenuItem onClick={() => { setVendorPermsUserId(u.id); setVendorPermsForm({ canView: false, canCreate: false, canEdit: false, canDelete: false, canManageContracts: false, canManagePricing: false, canManageDocuments: false, canManageNotes: false, canManageCompliance: false, canManageRenewals: false }); }} data-testid={`button-vendor-perms-${u.id}`}>
                                    <VendorIcon className="h-3.5 w-3.5 mr-2" />
                                    <span className="flex-1">Vendor Access</span>
                                    <PermissionInfo description={VENDOR_ACCESS_DESCRIPTION} side="left" className="ml-1" />
                                  </DropdownMenuItem>
                                )}
                                {effectivePerms?.isSuperAdmin && u.role !== "super_user" && u.role !== "driver" && u.role !== "employee" && (
                                  <DropdownMenuItem onClick={() => updateCaaMutation.mutate({ userId: u.id, corporateAccessAdmin: !u.corporateAccessAdmin })} data-testid={`button-caa-toggle-${u.id}`}>
                                    <Shield className="h-3.5 w-3.5 mr-2" />
                                    <span className="flex-1">{u.corporateAccessAdmin ? "Remove Corp. Access Admin" : "Grant Corp. Access Admin"}</span>
                                    <PermissionInfo description={CORPORATE_ACCESS_ADMIN_DESCRIPTION} side="left" className="ml-1" />
                                  </DropdownMenuItem>
                                )}
                                {effectivePerms?.isSuperAdmin && u.role !== "driver" && u.role !== "employee" && (
                                  <DropdownMenuItem
                                    onClick={() => updateDriverSsnPermissionMutation.mutate({
                                      userId: u.id,
                                      enabled: u.actionPermissions?.view_full_driver_ssn !== true,
                                    })}
                                    disabled={updateDriverSsnPermissionMutation.isPending}
                                    data-testid={`button-driver-ssn-permission-${u.id}`}
                                  >
                                    <Shield className="h-3.5 w-3.5 mr-2" />
                                    <span className="flex-1">
                                      {u.actionPermissions?.view_full_driver_ssn === true
                                        ? "Remove Drivers — View Full SSN"
                                        : "Grant Drivers — View Full SSN"}
                                    </span>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                {u.status === "ACTIVE" ? (
                                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => updateUserStatusMutation.mutate({ userId: u.id, status: "DISABLED" })} disabled={updateUserStatusMutation.isPending} data-testid={`button-disable-${u.id}`}>
                                    <UserX className="h-3.5 w-3.5 mr-2" />Disable User
                                  </DropdownMenuItem>
                                ) : u.status === "DISABLED" ? (
                                  <DropdownMenuItem onClick={() => updateUserStatusMutation.mutate({ userId: u.id, status: "ACTIVE" })} disabled={updateUserStatusMutation.isPending} data-testid={`button-enable-${u.id}`}>
                                    <UserCheck className="h-3.5 w-3.5 mr-2" />Enable User
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                      {idx < paginatedUsers.length - 1 && <div className="border-b border-[#eceef3] dark:border-border mx-4" />}
                    </div>
                  ))}
                </div>
                <div className="px-6 py-4 flex items-center justify-between border-t border-[#eceef3] dark:border-border">
                  <p className="text-[11px] text-muted-foreground">
                    Showing {Math.min((page - 1) * PAGE_SIZE + 1, filteredAndSortedUsers.length)}–{Math.min(page * PAGE_SIZE, filteredAndSortedUsers.length)} of {filteredAndSortedUsers.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7 border-[#d7dbe4] dark:border-border" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pg = i + 1;
                      if (totalPages > 5) { if (page <= 3) pg = i + 1; else if (page >= totalPages - 2) pg = totalPages - 4 + i; else pg = page - 2 + i; }
                      return (
                        <Button key={pg} variant={pg === page ? "default" : "outline"} size="icon" className={`h-7 w-7 text-xs ${pg === page ? "bg-[#5737f2] hover:bg-[#4a2bd3]" : "border-[#d7dbe4] dark:border-border"}`} onClick={() => setPage(pg)}>{pg}</Button>
                      );
                    })}
                    <Button variant="outline" size="icon" className="h-7 w-7 border-[#d7dbe4] dark:border-border" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-72 flex-shrink-0 bg-white dark:bg-card border border-[#e4e7ee] dark:border-border rounded-xl overflow-hidden">
            <div className="p-5 space-y-5">
              <div>
                <h3 className="text-base font-bold text-[#182039] dark:text-foreground">Access Summary</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Current organization permissions</p>
              </div>
              <div className="border-t border-[#e7e9ef] dark:border-border" />
              <div className="space-y-3">
                <p className="text-xs font-semibold text-[#283149] dark:text-foreground">Role Distribution</p>
                {roleDist.total > 0 && (
                  <div className="flex h-2 rounded-full overflow-hidden gap-[2px]">
                    {roleDist.superAdmin > 0 && <div className="bg-[#5737f2] rounded-full" style={{ width: `${Math.round((roleDist.superAdmin / roleDist.total) * 100)}%` }} />}
                    {roleDist.corporateAdmin > 0 && <div className="bg-[#8a6ff5] rounded-full" style={{ width: `${Math.round((roleDist.corporateAdmin / roleDist.total) * 100)}%` }} />}
                    {roleDist.corporate > 0 && <div className="bg-[#cfc7ff] rounded-full" style={{ width: `${Math.round((roleDist.corporate / roleDist.total) * 100)}%` }} />}
                    {roleDist.integration > 0 && <div className="bg-[#e8e4ff] rounded-full" style={{ width: `${Math.round((roleDist.integration / roleDist.total) * 100)}%` }} />}
                    {roleDist.driver > 0 && <div className="bg-slate-200 dark:bg-muted rounded-full" style={{ width: `${Math.round((roleDist.driver / roleDist.total) * 100)}%` }} />}
                  </div>
                )}
                <div className="space-y-1.5">
                  {[
                    { label: "Corporate", count: roleDist.corporate },
                    { label: "Corporate Admin", count: roleDist.corporateAdmin },
                    { label: "Super Admin", count: roleDist.superAdmin },
                    { label: "Integration User", count: roleDist.integration },
                    { label: "Driver / Employee", count: roleDist.driver },
                  ].filter(r => r.count > 0).map(r => (
                    <div key={r.label} className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">{r.label}</span>
                      <span className="text-xs font-semibold text-[#283149] dark:text-foreground">{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-[#e7e9ef] dark:border-border" />
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-[#283149] dark:text-foreground">Quick Actions</p>
                {effectivePerms?.canProvision && (
                  <button onClick={() => setCreateDirectOpen(true)} className="w-full text-left px-3 py-2.5 rounded-lg bg-[#f4f1ff] dark:bg-primary/10 hover:bg-[#eeebff] dark:hover:bg-primary/20 transition-colors" data-testid="button-quick-create-user">
                    <span className="text-xs font-semibold text-[#4a2bd3] dark:text-primary">＋ Create user with password</span>
                  </button>
                )}
                {effectivePerms?.canProvision && (
                  <button onClick={() => setInviteOpen(true)} className="w-full text-left px-3 py-2.5 rounded-lg border border-[#dfe2ea] dark:border-border hover:bg-muted/30 transition-colors" data-testid="button-quick-send-invite">
                    <span className="text-xs font-semibold text-[#283149] dark:text-foreground">✉ Send invitation</span>
                  </button>
                )}
                {!isProductionOrg && (
                  <button onClick={() => seedDatabaseMutation.mutate()} disabled={seedDatabaseMutation.isPending} className="w-full text-left px-3 py-2.5 rounded-lg border border-[#dfe2ea] dark:border-border hover:bg-muted/30 transition-colors">
                    <span className="text-xs font-semibold text-[#283149] dark:text-foreground flex items-center gap-1.5">
                      {seedDatabaseMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}⚙ Seed test data
                    </span>
                  </button>
                )}
              </div>
              <div className="border-t border-[#e7e9ef] dark:border-border" />
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-[#283149] dark:text-foreground">Security</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#5737f2] shrink-0" /><span className="text-sm text-muted-foreground">{securityStats.active} active accounts</span></div>
                  <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#8f7cf6] shrink-0" /><span className="text-sm text-muted-foreground">{securityStats.needsAction > 0 ? `${securityStats.needsAction} pending password reset` : "No resets pending"}</span></div>
                  <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" /><span className="text-sm text-muted-foreground">{securityStats.disabled} disabled accounts</span></div>
                </div>
              </div>
              {(effectivePerms?.isSuperAdmin || user?.role === "admin") && (
                <button onClick={() => setActiveTab("audit")} className="w-full px-3 py-2.5 rounded-lg border border-[#dfe2ea] dark:border-border hover:bg-muted/30 transition-colors text-center">
                  <span className="text-xs font-semibold text-[#283149] dark:text-foreground">View Audit Log →</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "requests" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              <CardTitle>Access Requests {pendingRequestCount > 0 && `(${pendingRequestCount} pending)`}</CardTitle>
            </div>
            <CardDescription>
              {effectivePerms?.isSuperAdmin
                ? "Review and approve/deny user access requests"
                : "Track your submitted access requests"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {requestsLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : !accessRequests || accessRequests.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No access requests found</p>
            ) : (
              <div className="space-y-4">
                {accessRequests.map((req) => (
                  <Card key={req.id} data-testid={`card-request-${req.id}`}>
                    <CardContent className="pt-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-2 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {getRequestStatusBadge(req.status)}
                            <span className="font-medium">{req.requestedEmail}</span>
                            <Badge variant="secondary">{roleLabels[req.requestedRole] || req.requestedRole}</Badge>
                          </div>
                          {req.requestedFirstName && (
                            <p className="text-sm text-muted-foreground">
                              Name: {req.requestedFirstName} {req.requestedLastName || ''}
                            </p>
                          )}
                          {req.requestor && (
                            <p className="text-sm text-muted-foreground">
                              Requested by: {req.requestor.firstName || ''} {req.requestor.lastName || ''} ({req.requestor.email}) — {roleLabels[req.requestor.role] || req.requestor.role}
                            </p>
                          )}
                          {req.justification && (
                            <p className="text-sm"><span className="font-medium">Justification:</span> {req.justification}</p>
                          )}
                          {req.cappedDiff?.reasons && req.cappedDiff.reasons.length > 0 && (
                            <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                              <div className="text-sm">
                                <p className="font-medium text-amber-700 dark:text-amber-400">Exceeds requestor access:</p>
                                <ul className="list-disc list-inside text-muted-foreground">
                                  {req.cappedDiff.reasons.map((r: string, i: number) => (
                                    <li key={i}>{r}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}
                          {req.reviewerNotes && (
                            <p className="text-sm"><span className="font-medium">Reviewer Notes:</span> {req.reviewerNotes}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Submitted: {new Date(req.createdAt).toLocaleDateString()}
                            {req.resolvedAt && ` — Resolved: ${new Date(req.resolvedAt).toLocaleDateString()}`}
                          </p>
                        </div>

                        {effectivePerms?.isSuperAdmin && (req.status === 'pending' || req.status === 'more_info_requested') && (
                          <div className="space-y-2 w-full sm:w-auto">
                            <Textarea
                              placeholder="Reviewer notes (optional)..."
                              value={reviewNotes[req.id] || ''}
                              onChange={(e) => setReviewNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                              className="text-sm"
                              data-testid={`input-review-notes-${req.id}`}
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                onClick={() => reviewRequestMutation.mutate({ requestId: req.id, action: 'approve', reviewerNotes: reviewNotes[req.id] })}
                                disabled={reviewRequestMutation.isPending}
                                data-testid={`button-approve-${req.id}`}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => reviewRequestMutation.mutate({ requestId: req.id, action: 'deny', reviewerNotes: reviewNotes[req.id] })}
                                disabled={reviewRequestMutation.isPending}
                                data-testid={`button-deny-${req.id}`}
                              >
                                <XCircle className="h-4 w-4 mr-1" />Deny
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => reviewRequestMutation.mutate({ requestId: req.id, action: 'request_more_info', reviewerNotes: reviewNotes[req.id] })}
                                disabled={reviewRequestMutation.isPending}
                                data-testid={`button-more-info-${req.id}`}
                              >
                                <Info className="h-4 w-4 mr-1" />Request Info
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "provisioning" && (
        <div className="space-y-6">
          {/* Hiring Manager Access Request Form */}
          {effectivePerms?.canProvision && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserCog className="h-5 w-5" />
                  <CardTitle>Submit Employee Access Request</CardTitle>
                </div>
                <CardDescription>
                  Request a system account for an employee. If a start date is set, the account will be provisioned but the invitation held until that date.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="hm-employee">Employee</Label>
                    <Select value={hmEmpId} onValueChange={setHmEmpId}>
                      <SelectTrigger id="hm-employee" data-testid="select-hm-employee">
                        <SelectValue placeholder="Select employee..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(employeesList || []).filter((e: any) => e.status === "active").map((emp: any) => (
                          <SelectItem key={emp.id} value={emp.id} data-testid={`option-emp-${emp.id}`}>
                            {emp.firstName} {emp.lastName} — {emp.email || emp.workEmail}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="hm-role" className="flex items-center gap-1.5">
                      System Role
                      {hmRole && ROLE_DESCRIPTIONS[hmRole] && (
                        <PermissionInfo description={ROLE_DESCRIPTIONS[hmRole]} side="right" />
                      )}
                    </Label>
                    <Select value={hmRole} onValueChange={setHmRole}>
                      <SelectTrigger id="hm-role" data-testid="select-hm-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(effectivePerms?.grantableRoles || []).map(r => (
                          <SelectItem key={r} value={r}>{roleLabels[r] || r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="hm-start-date">Start Date (optional)</Label>
                    <Input
                      id="hm-start-date"
                      type="date"
                      value={hmStartDate}
                      onChange={(e) => setHmStartDate(e.target.value)}
                      data-testid="input-hm-start-date"
                    />
                    <p className="text-xs text-muted-foreground mt-1">If set, invitation will be held until this date.</p>
                  </div>
                  <div>
                    <Label htmlFor="hm-justification">Justification (optional)</Label>
                    <Input
                      id="hm-justification"
                      placeholder="Why does this employee need access?"
                      value={hmJustification}
                      onChange={(e) => setHmJustification(e.target.value)}
                      data-testid="input-hm-justification"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => hmRequestMutation.mutate({ employeeId: hmEmpId, requestedRole: hmRole, startDate: hmStartDate || undefined, justification: hmJustification || undefined })}
                    disabled={!hmEmpId || hmRequestMutation.isPending}
                    data-testid="button-submit-hm-request"
                  >
                    {hmRequestMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Submit Request
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* SA: Pending HM Requests — Provision Action */}
          {effectivePerms?.isSuperAdmin && (() => {
            const hmPending = (accessRequests || []).filter((r: any) => r.status === 'pending' && r.requestType === 'hiring_manager_request');
            if (hmPending.length === 0) return null;
            return (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-amber-500" />
                    <CardTitle>Pending Employee Access Requests</CardTitle>
                    <Badge variant="destructive" className="ml-2">{hmPending.length}</Badge>
                  </div>
                  <CardDescription>
                    Review and provision accounts for employees submitted by hiring managers. Setting a future start date will hold the invitation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {hmPending.map((req: any) => (
                    <Card key={req.id} data-testid={`card-hm-request-${req.id}`}>
                      <CardContent className="pt-4">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              {getRequestStatusBadge(req.status)}
                              <span className="font-medium">{req.requestedEmail}</span>
                              <Badge variant="secondary">{roleLabels[req.requestedRole] || req.requestedRole}</Badge>
                              {req.startDate && (
                                <Badge variant="outline" className="text-xs">
                                  <Calendar className="h-3 w-3 mr-1" />Start: {req.startDate}
                                </Badge>
                              )}
                            </div>
                            {req.requestedFirstName && (
                              <p className="text-sm text-muted-foreground">
                                Name: {req.requestedFirstName} {req.requestedLastName || ''}
                              </p>
                            )}
                            {req.requestor && (
                              <p className="text-sm text-muted-foreground">
                                Requested by: {req.requestor.firstName || ''} {req.requestor.lastName || ''} ({req.requestor.email})
                              </p>
                            )}
                            {req.justification && (
                              <p className="text-sm"><span className="font-medium">Justification:</span> {req.justification}</p>
                            )}
                            <p className="text-xs text-muted-foreground">Submitted: {new Date(req.createdAt).toLocaleDateString()}</p>
                          </div>
                          <div className="space-y-2 w-full sm:w-64">
                            <Textarea
                              placeholder="Reviewer notes (optional)..."
                              value={provisionNotes[req.id] || ''}
                              onChange={(e) => setProvisionNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                              className="text-sm"
                              data-testid={`input-provision-notes-${req.id}`}
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                onClick={() => provisionUserMutation.mutate({ requestId: req.id, reviewerNotes: provisionNotes[req.id] })}
                                disabled={provisionUserMutation.isPending}
                                data-testid={`button-provision-${req.id}`}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                {req.startDate && req.startDate > new Date().toISOString().split('T')[0] ? 'Provision (Pending Activation)' : 'Provision & Invite'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => reviewRequestMutation.mutate({ requestId: req.id, action: 'deny', reviewerNotes: provisionNotes[req.id] })}
                                disabled={reviewRequestMutation.isPending}
                                data-testid={`button-deny-hm-${req.id}`}
                              >
                                <XCircle className="h-4 w-4 mr-1" />Deny
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </CardContent>
              </Card>
            );
          })()}

          {/* SA: Pending Activations Queue */}
          {effectivePerms?.isSuperAdmin && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  <CardTitle>Pending Activations</CardTitle>
                  {pendingActivations && pendingActivations.length > 0 && (
                    <Badge variant="secondary" className="ml-2">{pendingActivations.length}</Badge>
                  )}
                </div>
                <CardDescription>
                  Users provisioned with a future start date. Invitations will be sent automatically on their start date, or you can activate them early.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pendingActivationsLoading ? (
                  <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                ) : !pendingActivations || pendingActivations.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No pending activations</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingActivations.map((pa: any) => (
                        <TableRow key={pa.id} data-testid={`row-pending-activation-${pa.id}`}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{pa.requestedFirstName} {pa.requestedLastName}</p>
                              <p className="text-xs text-muted-foreground">{pa.requestedEmail}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{roleLabels[pa.approvedRole || pa.requestedRole] || pa.requestedRole}</Badge>
                          </TableCell>
                          <TableCell>
                            {pa.startDate ? (
                              <span className={`text-sm ${pa.startDate <= new Date().toISOString().split('T')[0] ? 'text-amber-600 font-medium' : ''}`}>
                                {pa.startDate}
                                {pa.startDate <= new Date().toISOString().split('T')[0] && ' (due today)'}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(pa.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {pa.user?.id && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => activateUserMutation.mutate(pa.user.id)}
                                disabled={activateUserMutation.isPending}
                                data-testid={`button-activate-${pa.user.id}`}
                              >
                                <Zap className="h-4 w-4 mr-1" />Activate Now
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {/* SA: Manual Invite — restricted to Super Admin */}
          {effectivePerms?.isSuperAdmin && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  <CardTitle>Manual Invitation</CardTitle>
                </div>
                <CardDescription>
                  Bypass the normal request workflow and directly invite a user. A documented reason is required for audit compliance.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => setManualInviteOpen(true)} data-testid="button-open-manual-invite">
                  <Mail className="h-4 w-4 mr-2" />Issue Manual Invite
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Create Direct User Dialog */}
      {/* Send Invitation Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Send Invitation</DialogTitle>
            <DialogDescription>Send an invitation email to add a new user to your organization.{!effectivePerms?.isSuperAdmin && <span className="block mt-1 text-xs">Higher permissions require Super Admin approval.</span>}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2">
              <div><Label htmlFor="invite-first-name">First Name</Label><Input id="invite-first-name" placeholder="First" value={inviteFirstName} onChange={e => setInviteFirstName(e.target.value)} data-testid="input-invite-first-name" /></div>
              <div><Label htmlFor="invite-last-name">Last Name</Label><Input id="invite-last-name" placeholder="Last" value={inviteLastName} onChange={e => setInviteLastName(e.target.value)} data-testid="input-invite-last-name" /></div>
            </div>
            <div><Label htmlFor="invite-email">Email Address <span className="text-destructive">*</span></Label><Input id="invite-email" type="email" placeholder="user@example.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} data-testid="input-invite-email" /></div>
            <div>
              <Label htmlFor="invite-role" className="flex items-center gap-1.5">
                User Role
                {inviteRole && ROLE_DESCRIPTIONS[inviteRole] && (
                  <PermissionInfo description={ROLE_DESCRIPTIONS[inviteRole]} side="right" />
                )}
              </Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger id="invite-role" data-testid="select-invite-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="driver">Driver</SelectItem>
                  <SelectItem value="corporate">Corporate User</SelectItem>
                  <SelectItem value="corporate_admin">Corporate Admin</SelectItem>
                  {user?.email === "will@driverondemand.co" && <SelectItem value="super_user">Super Admin</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            {exceedsCurrentLevel && (
              <>
                <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-sm"><p className="font-medium text-amber-700 dark:text-amber-400">This role exceeds your access level</p><p className="text-muted-foreground">This invitation will be routed to Super Admin for approval.</p></div>
                </div>
                <div><Label htmlFor="invite-justification">Justification (recommended)</Label><Textarea id="invite-justification" placeholder="Explain why this access level is needed..." value={inviteJustification} onChange={e => setInviteJustification(e.target.value)} data-testid="input-invite-justification" /></div>
              </>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInviteUser} disabled={!inviteEmail || inviteUserMutation.isPending} data-testid="button-invite-user">
              {inviteUserMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</> : exceedsCurrentLevel ? <><ClipboardList className="mr-2 h-4 w-4" />Submit for Approval</> : <><Mail className="mr-2 h-4 w-4" />Send Invitation</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDirectOpen} onOpenChange={setCreateDirectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create User Directly</DialogTitle>
            <DialogDescription>
              Create an active user account without sending an invitation. The user will be required to reset their password on first login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2">
              <div>
                <Label htmlFor="cd-first">First Name <span className="text-destructive">*</span></Label>
                <Input id="cd-first" value={cdFirstName} onChange={e => setCdFirstName(e.target.value)} data-testid="input-cd-first-name" />
              </div>
              <div>
                <Label htmlFor="cd-last">Last Name <span className="text-destructive">*</span></Label>
                <Input id="cd-last" value={cdLastName} onChange={e => setCdLastName(e.target.value)} data-testid="input-cd-last-name" />
              </div>
            </div>
            <div>
              <Label htmlFor="cd-email">Email / Username <span className="text-destructive">*</span></Label>
              <Input id="cd-email" type="email" value={cdEmail} onChange={e => setCdEmail(e.target.value)} data-testid="input-cd-email" />
            </div>
            <div>
              <Label htmlFor="cd-password">Temporary Password <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Input
                  id="cd-password"
                  type={cdShowPassword ? "text" : "password"}
                  value={cdPassword}
                  onChange={e => setCdPassword(e.target.value)}
                  placeholder="Min 10 chars, 1 upper, 1 lower, 1 number"
                  className="pr-10"
                  data-testid="input-cd-password"
                />
                <button
                  type="button"
                  onClick={() => setCdShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  data-testid="button-cd-toggle-password"
                >
                  {cdShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">User must reset this password on first login.</p>
            </div>
            <div>
              <Label htmlFor="cd-role" className="flex items-center gap-1.5">
                User Role <span className="text-destructive">*</span>
                {cdRole && ROLE_DESCRIPTIONS[cdRole] && (
                  <PermissionInfo description={ROLE_DESCRIPTIONS[cdRole]} side="right" />
                )}
              </Label>
              <Select value={cdRole} onValueChange={setCdRole}>
                <SelectTrigger id="cd-role" data-testid="select-cd-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(effectivePerms?.grantableRoles || []).map(r => (
                    <SelectItem key={r} value={r}>
                      <span className="flex items-center gap-1.5">
                        {r === "integration_user" && <Zap className="h-3.5 w-3.5 text-blue-500" />}
                        {roleLabels[r] || r}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {cdRole === "integration_user" && (
              <div className="flex gap-2 rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-3 text-sm text-blue-800 dark:text-blue-300">
                <Zap className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
                <div>
                  <p className="font-medium mb-0.5">Service Account</p>
                  <p className="text-xs text-blue-700 dark:text-blue-400">Integration Users are system-to-system service accounts. They cannot access the corporate dashboard. They authenticate via the DriverConnect V2 API using a Bearer token.</p>
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="cd-status">Initial Status</Label>
              <Select value={cdStatus} onValueChange={v => setCdStatus(v as "ACTIVE" | "DISABLED")}>
                <SelectTrigger id="cd-status" data-testid="select-cd-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="DISABLED">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateDirectOpen(false)} data-testid="button-cd-cancel">Cancel</Button>
            <Button
              onClick={() => createDirectUserMutation.mutate({
                email: cdEmail, firstName: cdFirstName, lastName: cdLastName,
                temporaryPassword: cdPassword, role: cdRole, status: cdStatus,
              })}
              disabled={
                !cdEmail.trim() || !cdFirstName.trim() || !cdLastName.trim() ||
                cdPassword.length < 10 || createDirectUserMutation.isPending
              }
              data-testid="button-cd-submit"
            >
              {createDirectUserMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
                : <><UserPlus className="h-4 w-4 mr-2" />Create User</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!roleEditUser} onOpenChange={(open) => !open && setRoleEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              Update the DriverHub system role for {roleEditUser?.firstName || roleEditUser?.lastName
                ? `${roleEditUser.firstName || ""} ${roleEditUser.lastName || ""}`.trim()
                : roleEditUser?.email || "this user"}.
              Customer Account assignment is not required for corporate roles.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-user-role">System Role</Label>
            <Select value={roleEditValue} onValueChange={setRoleEditValue}>
              <SelectTrigger id="edit-user-role" data-testid="select-edit-user-role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {(effectivePerms?.grantableRoles || []).map(role => (
                  <SelectItem key={role} value={role}>{roleLabels[role] || role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleEditUser(null)}>Cancel</Button>
            <Button
              onClick={() => roleEditUser && updateUserRoleMutation.mutate({ userId: roleEditUser.id, role: roleEditValue })}
              disabled={!roleEditUser || !roleEditValue || roleEditValue === roleEditUser.role || updateUserRoleMutation.isPending}
              data-testid="button-save-user-role"
            >
              {updateUserRoleMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Invite Dialog */}
      <Dialog open={manualInviteOpen} onOpenChange={setManualInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Issue Manual Invitation</DialogTitle>
            <DialogDescription>
              This action bypasses the standard access request workflow. A reason is required and will be recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2">
              <div>
                <Label htmlFor="mi-first">First Name</Label>
                <Input id="mi-first" value={miFirstName} onChange={(e) => setMiFirstName(e.target.value)} data-testid="input-mi-first-name" />
              </div>
              <div>
                <Label htmlFor="mi-last">Last Name</Label>
                <Input id="mi-last" value={miLastName} onChange={(e) => setMiLastName(e.target.value)} data-testid="input-mi-last-name" />
              </div>
            </div>
            <div>
              <Label htmlFor="mi-email">Email Address</Label>
              <Input id="mi-email" type="email" value={miEmail} onChange={(e) => setMiEmail(e.target.value)} data-testid="input-mi-email" />
            </div>
            <div>
              <Label htmlFor="mi-role" className="flex items-center gap-1.5">
                System Role
                {miRole && ROLE_DESCRIPTIONS[miRole] && (
                  <PermissionInfo description={ROLE_DESCRIPTIONS[miRole]} side="right" />
                )}
              </Label>
              <Select value={miRole} onValueChange={setMiRole}>
                <SelectTrigger id="mi-role" data-testid="select-mi-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(effectivePerms?.grantableRoles || []).map(r => (
                    <SelectItem key={r} value={r}>{roleLabels[r] || r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="mi-reason">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="mi-reason"
                placeholder="Why is this manual invite being issued? (required, min 10 characters)"
                value={miReason}
                onChange={(e) => setMiReason(e.target.value)}
                className="text-sm"
                data-testid="input-mi-reason"
              />
              <p className="text-xs text-muted-foreground mt-1">{miReason.length}/10 min characters</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setManualInviteOpen(false)}>Cancel</Button>
            <Button
              onClick={() => manualInviteMutation.mutate({ email: miEmail, firstName: miFirstName || undefined, lastName: miLastName || undefined, role: miRole, reason: miReason })}
              disabled={!miEmail || miReason.length < 10 || manualInviteMutation.isPending}
              data-testid="button-submit-manual-invite"
            >
              {manualInviteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Issue Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeTab === "audit" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <CardTitle>Provisioning Audit Log</CardTitle>
            </div>
            <CardDescription>Immutable log of all user provisioning actions</CardDescription>
          </CardHeader>
          <CardContent>
            {auditLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : !auditLogs || auditLogs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No audit log entries yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log: any) => (
                    <TableRow key={log.id} data-testid={`row-audit-${log.id}`}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.actor ? `${log.actor.firstName || ''} ${log.actor.lastName || ''} (${log.actor.email})` : log.actorId}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {log.action.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{log.targetEmail || log.targetUserId || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {log.details ? JSON.stringify(log.details).slice(0, 100) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
      {activeTab === "sso" && (
        <div className="space-y-6">
          {/* Header */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                <CardTitle>SSO Identity Configuration</CardTitle>
              </div>
              <CardDescription>
                DriverHub acts as the identity provider for DriverConnect. Configure each user's SSO role and application access entitlements here.
                Changes take effect on the user's next authentication.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex items-start gap-3 p-3 rounded-md bg-muted/40">
                  <Globe className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">DriverHub Access</p>
                    <p className="text-xs text-muted-foreground">Controls login to the DriverHub corporate portal</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-md bg-muted/40">
                  <Smartphone className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">DriverConnect Access</p>
                    <p className="text-xs text-muted-foreground">Grants access to the DriverConnect mobile platform</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-md bg-muted/40">
                  <ShieldCheck className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">SSO Role Override</p>
                    <p className="text-xs text-muted-foreground">Overrides the derived role passed to downstream apps</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sub-tab navigation */}
          <div className="flex gap-1 border-b">
            {([
              { key: "entitlements", label: "Entitlements" },
              { key: "provisioned",  label: "Provisioned Users" },
              { key: "audit",        label: "Audit Log" },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setSsoSubTab(t.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${ssoSubTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                data-testid={`tab-sso-${t.key}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Entitlements sub-tab ── */}
          {ssoSubTab === "entitlements" && <>

          {/* User Entitlements Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle>User Entitlements</CardTitle>
                <CardDescription>
                  App access is managed per user from the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">user_app_entitlements</code> table.
                  Toggle access using the grant/revoke buttons.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search by name or email..."
                  value={ssoSearch}
                  onChange={(e) => setSsoSearch(e.target.value)}
                  className="w-64"
                  data-testid="input-sso-search"
                />
                <Button size="icon" variant="outline" onClick={() => refetchSso()} data-testid="button-sso-refresh">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {ssoLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
              ) : !ssoUsers || ssoUsers.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No users found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Platform Role</TableHead>
                      <TableHead>Role Classification</TableHead>
                      <TableHead className="text-center">DriverHub</TableHead>
                      <TableHead className="text-center">DriverConnect</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead>Subject ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(ssoUsers || [])
                      .filter(u => {
                        if (!ssoSearch.trim()) return true;
                        const q = ssoSearch.trim().toLowerCase();
                        return (u.email || "").toLowerCase().includes(q) ||
                          [u.firstName, u.lastName].filter(Boolean).join(" ").toLowerCase().includes(q);
                      })
                      .map(u => {
                        const dhEnt = u.appEntitlements?.find(e => e.appCode === "DRIVERHUB");
                        const dcEnt = u.appEntitlements?.find(e => e.appCode === "DRIVERCONNECT");
                        const dhAccess = dhEnt ? dhEnt.accessGranted : u.hasDriverHubAccess;
                        const dcAccess = dcEnt ? dcEnt.accessGranted : u.hasDriverConnectAccess;
                        return (
                          <TableRow key={u.id} data-testid={`row-sso-${u.id}`}>
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium">{[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}</p>
                                <p className="text-xs text-muted-foreground">{u.email}</p>
                                {u.status !== "ACTIVE" && <Badge variant="destructive" className="text-xs mt-1">{u.status}</Badge>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">{u.role}</Badge>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={u.ssoRole ?? "__auto__"}
                                onValueChange={(v) => {
                                  updateSsoRoleMutation.mutate({ userId: u.id, ssoRole: v === "__auto__" ? null : v });
                                }}
                              >
                                <SelectTrigger className="w-40 text-xs" data-testid={`select-sso-role-${u.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__auto__">Auto ({u.effectiveSsoRole})</SelectItem>
                                  <SelectItem value="SUPER_ADMIN">SUPER_ADMIN</SelectItem>
                                  <SelectItem value="ADMIN">ADMIN</SelectItem>
                                  <SelectItem value="MANAGER">MANAGER</SelectItem>
                                  <SelectItem value="DISPATCHER">DISPATCHER</SelectItem>
                                  <SelectItem value="DRIVER">DRIVER</SelectItem>
                                  <SelectItem value="READ_ONLY">READ_ONLY</SelectItem>
                                  <SelectItem value="CUSTOMER_ADMIN">CUSTOMER_ADMIN</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex flex-col items-center gap-1">
                                <button
                                  onClick={() => updateEntitlementMutation.mutate({ userId: u.id, appCode: "DRIVERHUB", accessGranted: !dhAccess })}
                                  disabled={updateEntitlementMutation.isPending}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  data-testid={`toggle-driverhub-${u.id}`}
                                  title={dhAccess ? "Revoke DriverHub access" : "Grant DriverHub access"}
                                >
                                  {dhAccess
                                    ? <ToggleRight className="h-6 w-6 text-green-600" />
                                    : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
                                </button>
                                {dhEnt?.grantedAt && dhAccess && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(dhEnt.grantedAt).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex flex-col items-center gap-1">
                                <button
                                  onClick={() => updateEntitlementMutation.mutate({ userId: u.id, appCode: "DRIVERCONNECT", accessGranted: !dcAccess })}
                                  disabled={updateEntitlementMutation.isPending}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  data-testid={`toggle-driverconnect-${u.id}`}
                                  title={dcAccess ? "Revoke DriverConnect access" : "Grant DriverConnect access"}
                                >
                                  {dcAccess
                                    ? <ToggleRight className="h-6 w-6 text-blue-600" />
                                    : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
                                </button>
                                {dcEnt?.grantedAt && dcAccess && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(dcEnt.grantedAt).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground font-mono max-w-[120px] truncate" title={u.ssoSubjectId ?? undefined}>
                              {u.ssoSubjectId || <span className="italic">not set</span>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Role Reference */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Role Classification Reference</CardTitle>
              <CardDescription>
                High-level classification (roleClassification field) sent to DriverConnect via the identity payload.
                DriverConnect uses this to map users into its local permission model.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Classification</TableHead>
                    <TableHead>Suggested DC Role</TableHead>
                    <TableHead>Auto-derived From</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { role: "SUPER_ADMIN",    dc: "super_admin",   from: "super_user, root_super_admin, super_admin" },
                    { role: "ADMIN",           dc: "ops_admin",     from: "admin, corporate_admin, finance" },
                    { role: "MANAGER",         dc: "ops_admin",     from: "manager, ops_manager, recruiter, regional_cl, network_cl" },
                    { role: "DISPATCHER",      dc: "dispatcher",    from: "dispatcher" },
                    { role: "DRIVER",          dc: "driver",        from: "driver, employee" },
                    { role: "CUSTOMER_ADMIN",  dc: "customer_admin",from: "customer_admin, dealer_cl, certification_liaison" },
                    { role: "READ_ONLY",       dc: "read_only",     from: "All other roles (default — fail safe)" },
                  ].map(r => (
                    <TableRow key={r.role}>
                      <TableCell><Badge variant="outline" className="font-mono text-xs">{r.role}</Badge></TableCell>
                      <TableCell><Badge variant="secondary" className="font-mono text-xs">{r.dc}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.from}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          </>} {/* end entitlements sub-tab */}

          {/* ── Provisioned Users sub-tab ── */}
          {ssoSubTab === "provisioned" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle>DriverConnect Provisioned Users</CardTitle>
                  <CardDescription>
                    Users that have been JIT-provisioned in DriverConnect via <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">POST /api/v1/sso/provision</code>.
                    Records are created on first successful login and updated on each repeat login.
                  </CardDescription>
                </div>
                <Button size="icon" variant="outline" onClick={() => refetchProvisioned()} data-testid="button-provisioned-refresh">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {dcProvisionedLoading ? (
                  <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                ) : !dcProvisionedData || dcProvisionedData.length === 0 ? (
                  <div className="text-center text-muted-foreground py-10 px-4">
                    <p className="text-sm font-medium">No provisioned users yet</p>
                    <p className="text-xs mt-1">Users will appear here after their first successful DriverConnect login triggers JIT provisioning.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>DC Local Role</TableHead>
                        <TableHead>DH Classification</TableHead>
                        <TableHead>Org / Market</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Provisioned</TableHead>
                        <TableHead>Last Login</TableHead>
                        <TableHead>Trigger</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(dcProvisionedData || []).map((r: any) => (
                        <TableRow key={r.id} data-testid={`row-provisioned-${r.id}`}>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">{[r.firstName, r.lastName].filter(Boolean).join(" ") || "—"}</p>
                              <p className="text-xs text-muted-foreground">{r.email}</p>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="secondary" className="font-mono text-xs">{r.dcLocalRole}</Badge></TableCell>
                          <TableCell><Badge variant="outline" className="font-mono text-xs">{r.driverHubRoleClassification}</Badge></TableCell>
                          <TableCell className="text-xs">
                            <div>{r.homeMarket || "—"}</div>
                            <div className="text-muted-foreground">{r.homeNetwork || ""}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={r.status === "ACTIVE" ? "default" : "destructive"} className="text-xs">{r.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.provisionedAt ? new Date(r.provisionedAt).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleDateString() : "Never"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{r.provisioningTrigger}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── SSO Audit Log sub-tab ── */}
          {ssoSubTab === "audit" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle>SSO Audit Log</CardTitle>
                  <CardDescription>
                    All significant SSO events across DriverHub and DriverConnect — logins, denials, token issuance, provisioning.
                  </CardDescription>
                </div>
                <Button size="icon" variant="outline" onClick={() => refetchSsoAudit()} data-testid="button-ssoaudit-refresh">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {ssoAuditLoading ? (
                  <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                ) : !ssoAuditData || ssoAuditData.length === 0 ? (
                  <div className="text-center text-muted-foreground py-10 px-4">
                    <p className="text-sm font-medium">No SSO events recorded yet</p>
                    <p className="text-xs mt-1">Events are logged when users authenticate, tokens are issued/exchanged, or users are provisioned.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>App</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Denial Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(ssoAuditData || []).map((e: any) => (
                        <TableRow key={e.id} data-testid={`row-ssoaudit-${e.id}`}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {e.createdAt ? new Date(e.createdAt).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${e.app === "DRIVERHUB" ? "border-primary/50" : "border-blue-500/50"}`}>{e.app}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{e.event}</TableCell>
                          <TableCell className="text-xs">
                            <p>{e.email || "—"}</p>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{e.roleClassification || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={e.success ? "default" : "destructive"} className="text-xs">
                              {e.success ? "OK" : "DENIED"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{e.denialReason || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      )}

      <Dialog open={inviteLinkDialog.open} onOpenChange={(open) => setInviteLinkDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-lg" data-testid="dialog-invite-link">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link className="h-5 w-5" />
              Invite Link Ready
            </DialogTitle>
            <DialogDescription>
              Copy and send this link to <span className="font-medium text-foreground">{inviteLinkDialog.userName}</span>. The link grants one-time access to set up their account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Invite URL</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={inviteLinkDialog.url}
                  className="font-mono text-xs"
                  data-testid="input-invite-url"
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLinkDialog.url);
                    toast({ title: "Copied", description: "Invite link copied to clipboard." });
                  }}
                  data-testid="button-copy-invite-url"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {inviteLinkDialog.expiresAt && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                  Expires{" "}
                  <span className="font-medium text-foreground">
                    {new Date(inviteLinkDialog.expiresAt).toLocaleString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </span>
                </span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              This link is single-use and will expire once accepted. Regenerating an invite invalidates any previous link sent to this user.
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(inviteLinkDialog.url);
                toast({ title: "Copied", description: "Invite link copied to clipboard." });
                setInviteLinkDialog(prev => ({ ...prev, open: false }));
              }}
              data-testid="button-copy-and-close"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy & Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vendor Module Permissions Dialog */}
      <Dialog open={!!vendorPermsUserId} onOpenChange={(open) => { if (!open) setVendorPermsUserId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <VendorIcon className="h-5 w-5" />
              Vendor Module Permissions
            </DialogTitle>
            <DialogDescription>
              Configure what actions this user can perform within the Vendor module.
            </DialogDescription>
          </DialogHeader>
          {vendorPermsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-4">
              {([
                { key: "canView", label: "View Vendors" },
                { key: "canCreate", label: "Create Vendors" },
                { key: "canEdit", label: "Edit Vendors" },
                { key: "canDelete", label: "Archive Vendors" },
                { key: "canManageContracts", label: "Manage Contracts" },
                { key: "canManagePricing", label: "Manage Pricing" },
                { key: "canManageDocuments", label: "Manage Documents" },
                { key: "canManageNotes", label: "Manage Notes" },
                { key: "canManageCompliance", label: "Manage Compliance" },
                { key: "canManageRenewals", label: "Manage Renewals" },
              ] as { key: keyof typeof vendorPermsForm; label: string }[]).map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium">{label}</p>
                    {VENDOR_PERM_DESCRIPTIONS[key] && (
                      <PermissionInfo description={VENDOR_PERM_DESCRIPTIONS[key]} side="right" />
                    )}
                  </div>
                  <Switch
                    checked={vendorPermsForm[key]}
                    onCheckedChange={(val) => setVendorPermsForm(prev => ({ ...prev, [key]: val }))}
                    data-testid={`switch-vendor-perm-${key}`}
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVendorPermsUserId(null)} data-testid="button-vendor-perms-cancel">Cancel</Button>
            <Button
              onClick={() => saveVendorPermsMutation.mutate(vendorPermsForm)}
              disabled={saveVendorPermsMutation.isPending || vendorPermsLoading}
              data-testid="button-vendor-perms-save"
            >
              {saveVendorPermsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UserDepartmentsDialog
        open={deptDialogOpen}
        onOpenChange={setDeptDialogOpen}
        userId={deptDialogUser?.id ?? null}
        userName={deptDialogUser?.name ?? ""}
      />
    </div>
  );
}
