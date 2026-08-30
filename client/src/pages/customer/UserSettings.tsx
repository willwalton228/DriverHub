import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link } from "wouter";
import { 
  ArrowLeft,
  Users,
  UserPlus,
  Crown,
  Eye,
  Mail,
  Clock,
  CheckCircle2,
  MoreVertical,
  Trash2,
  RefreshCcw
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CustomerUser {
  id: string;
  customerId: string;
  userId: string | null;
  email: string;
  role: 'ACCOUNT_ADMIN' | 'ACCOUNT_VIEWER';
  status: 'PENDING' | 'ACTIVE' | 'DISABLED';
  invitedBy: string | null;
  invitedAt: string;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CurrentCustomerUser extends CustomerUser {
  customerName?: string;
}

export default function UserSettings() {
  const { toast } = useToast();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<CustomerUser | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<'ACCOUNT_ADMIN' | 'ACCOUNT_VIEWER'>('ACCOUNT_VIEWER');

  const { data: currentUser } = useQuery<CurrentCustomerUser>({
    queryKey: ["/api/customer/me"],
  });

  const { data: users, isLoading } = useQuery<CustomerUser[]>({
    queryKey: ["/api/customer/users"],
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      return apiRequest("POST", "/api/customer/users/invite", { email, role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/users"] });
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole('ACCOUNT_VIEWER');
      toast({
        title: "Invitation Sent",
        description: "An invitation email has been sent to the user."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive"
      });
    }
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      return apiRequest("PATCH", `/api/customer/users/${id}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/users"] });
      toast({
        title: "Role Updated",
        description: "User role has been updated successfully."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update role",
        variant: "destructive"
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/customer/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/users"] });
      setDeleteDialogOpen(false);
      setSelectedUser(null);
      toast({
        title: "User Removed",
        description: "User has been removed from the account."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove user",
        variant: "destructive"
      });
    }
  });

  const isAdmin = currentUser?.role === 'ACCOUNT_ADMIN';

  const handleInvite = () => {
    if (!inviteEmail.trim()) {
      toast({
        title: "Error",
        description: "Please enter an email address",
        variant: "destructive"
      });
      return;
    }
    inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  const handleRoleChange = (userId: string, newRole: string) => {
    updateRoleMutation.mutate({ id: userId, role: newRole });
  };

  const handleDeleteClick = (user: CustomerUser) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedUser) {
      deleteMutation.mutate(selectedUser.id);
    }
  };

  const getStatusBadge = (user: CustomerUser) => {
    switch (user.status) {
      case 'ACTIVE':
        return (
          <Badge variant="outline" className="text-green-600 border-green-300 dark:text-green-400 dark:border-green-700">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Active
          </Badge>
        );
      case 'PENDING':
        return (
          <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case 'DISABLED':
        return (
          <Badge variant="outline" className="text-gray-500 border-gray-300 dark:text-gray-400 dark:border-gray-600">
            Disabled
          </Badge>
        );
      default:
        return null;
    }
  };

  const getRoleBadge = (role: string) => {
    if (role === 'ACCOUNT_ADMIN') {
      return (
        <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
          <Crown className="w-3 h-3 mr-1" />
          Admin
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        <Eye className="w-3 h-3 mr-1" />
        Viewer
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/customer/requests">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold">Team Members</h1>
              <p className="text-sm text-muted-foreground">
                Manage who has access to your account
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <Users className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <CardTitle>Team Members</CardTitle>
                <CardDescription>
                  {isAdmin 
                    ? "Invite and manage team members for your account"
                    : "View team members in your account"
                  }
                </CardDescription>
              </div>
            </div>
            {isAdmin && (
              <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-invite-user">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Invite User
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite Team Member</DialogTitle>
                    <DialogDescription>
                      Send an invitation to add a new team member to your account.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Email Address</label>
                      <Input
                        type="email"
                        placeholder="colleague@company.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        data-testid="input-invite-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Role</label>
                      <Select value={inviteRole} onValueChange={(v: 'ACCOUNT_ADMIN' | 'ACCOUNT_VIEWER') => setInviteRole(v)}>
                        <SelectTrigger data-testid="select-invite-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ACCOUNT_ADMIN">
                            <div className="flex items-center gap-2">
                              <Crown className="h-4 w-4 text-orange-600" />
                              <div>
                                <div className="font-medium">Admin</div>
                                <div className="text-xs text-muted-foreground">Can manage users and settings</div>
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="ACCOUNT_VIEWER">
                            <div className="flex items-center gap-2">
                              <Eye className="h-4 w-4" />
                              <div>
                                <div className="font-medium">Viewer</div>
                                <div className="text-xs text-muted-foreground">Read-only access to moves and requests</div>
                              </div>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleInvite} 
                      disabled={inviteMutation.isPending}
                      data-testid="button-send-invite"
                    >
                      {inviteMutation.isPending ? (
                        <>
                          <RefreshCcw className="h-4 w-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="h-4 w-4 mr-2" />
                          Send Invitation
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : users && users.length > 0 ? (
              <div className="space-y-3">
                {users.map((user) => (
                  <div 
                    key={user.id} 
                    className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                    data-testid={`user-row-${user.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-semibold">
                        {user.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {user.email}
                          {user.userId === currentUser?.userId && (
                            <Badge variant="outline" className="text-xs">You</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          {getStatusBadge(user)}
                          {user.status === 'PENDING' && (
                            <span className="text-xs">
                              Invited {new Date(user.invitedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getRoleBadge(user.role)}
                      {isAdmin && user.userId !== currentUser?.userId && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-user-menu-${user.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {user.role === 'ACCOUNT_VIEWER' ? (
                              <DropdownMenuItem onClick={() => handleRoleChange(user.id, 'ACCOUNT_ADMIN')}>
                                <Crown className="h-4 w-4 mr-2" />
                                Make Admin
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => handleRoleChange(user.id, 'ACCOUNT_VIEWER')}>
                                <Eye className="h-4 w-4 mr-2" />
                                Make Viewer
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem 
                              onClick={() => handleDeleteClick(user)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No team members yet</p>
                {isAdmin && (
                  <p className="text-sm">Invite your first team member to get started</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <h3 className="font-medium mb-2">Role Permissions</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <Crown className="h-4 w-4 text-orange-600 mt-0.5" />
              <div>
                <span className="font-medium text-foreground">Admin</span> - Full access to account, can view billing, submit issues, and manage team members
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Eye className="h-4 w-4 mt-0.5" />
              <div>
                <span className="font-medium text-foreground">Viewer</span> - Read-only access to moves and requests, cannot view billing or submit issues
              </div>
            </div>
          </div>
        </div>
      </main>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{selectedUser?.email}</strong> from your account? 
              They will no longer have access to your account data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-remove"
            >
              Remove User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
