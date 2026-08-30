import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Users,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  UserPlus,
  Shield,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Team {
  id: string;
  name: string;
  queueType: string;
  orgId: string | null;
  createdAt: string;
  memberCount: number;
}

interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  createdAt: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface CorporateUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

// ── Queue type display ────────────────────────────────────────────────────────

const QUEUE_TYPES = [
  "operations", "claims", "finance", "compliance", "recruiting", "dispatch", "leadership",
];

const queueBadgeClass: Record<string, string> = {
  operations:  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  claims:      "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  finance:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  compliance:  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  recruiting:  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  dispatch:    "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
  leadership:  "bg-primary/15 text-primary",
};

// ── Add Member Modal ──────────────────────────────────────────────────────────

function AddMemberModal({
  team,
  existingUserIds,
  onClose,
}: {
  team: Team;
  existingUserIds: string[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState("");

  const { data: allUsers = [] } = useQuery<CorporateUser[]>({
    queryKey: ["/api/users?role=corporate"],
    staleTime: 120_000,
  });

  const eligible = allUsers.filter(u => !existingUserIds.includes(u.id));

  const addMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/teams/${team.id}/members`, { userId: selectedUserId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: `Member added to ${team.name}` });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add member", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            Add Member to {team.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Select User</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger data-testid="select-add-member-user">
                <SelectValue placeholder="Choose a team member..." />
              </SelectTrigger>
              <SelectContent>
                {eligible.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">All users already on this team</div>
                ) : eligible.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} — {u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => addMutation.mutate()}
            disabled={addMutation.isPending || !selectedUserId}
            data-testid="button-add-member-confirm"
          >
            {addMutation.isPending ? "Adding..." : "Add Member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Create Team Modal ─────────────────────────────────────────────────────────

function CreateTeamModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [queueType, setQueueType] = useState("operations");

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/teams", { name: name.trim(), queueType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Team created" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create team", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-muted-foreground" />
            Create Team Queue
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Team Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. West Region Dispatch"
              data-testid="input-team-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Queue Type</Label>
            <Select value={queueType} onValueChange={setQueueType}>
              <SelectTrigger data-testid="select-team-queue-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUEUE_TYPES.map(q => (
                  <SelectItem key={q} value={q} className="capitalize">{q.charAt(0).toUpperCase() + q.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !name.trim()}
            data-testid="button-create-team-submit"
          >
            {createMutation.isPending ? "Creating..." : "Create Team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Team Row ──────────────────────────────────────────────────────────────────

function TeamRow({ team }: { team: Team }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  const { data: members = [], isLoading: membersLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/teams", team.id, "members"],
    enabled: expanded,
    staleTime: 60_000,
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => apiRequest("DELETE", `/api/teams/${team.id}/members/${userId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Member removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to remove member", description: err.message, variant: "destructive" });
    },
  });

  const queueClass = queueBadgeClass[team.queueType] || "bg-muted text-muted-foreground";

  return (
    <>
      <div
        className={`grid grid-cols-[1fr_120px_80px_100px] items-center border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer ${expanded ? "bg-muted/30" : ""}`}
        onClick={() => setExpanded(e => !e)}
        data-testid={`team-row-${team.id}`}
      >
        <div className="py-3 px-4 flex items-center gap-2">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <span className="text-sm font-medium">{team.name}</span>
        </div>
        <div className="py-3">
          <Badge className={`text-[10px] capitalize no-default-active-elevate ${queueClass}`} variant="outline">
            {team.queueType}
          </Badge>
        </div>
        <div className="py-3">
          <span className="text-sm text-muted-foreground">{team.memberCount} member{team.memberCount !== 1 ? "s" : ""}</span>
        </div>
        <div className="py-3 pr-4 flex justify-end" onClick={e => e.stopPropagation()}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddMember(true)}
            data-testid={`button-add-member-${team.id}`}
          >
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            Add
          </Button>
        </div>
      </div>

      {/* Members panel */}
      {expanded && (
        <div className="border-b border-border bg-muted/20">
          {membersLoading ? (
            <div className="px-8 py-3 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : members.length === 0 ? (
            <p className="px-8 py-3 text-sm text-muted-foreground">No members yet. Add team members to route tasks to this queue.</p>
          ) : (
            <div>
              {members.map(m => (
                <div key={m.id} className="grid grid-cols-[1fr_160px_80px] items-center px-8 py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {(m.firstName?.[0] || "") + (m.lastName?.[0] || "")}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{m.firstName} {m.lastName}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </div>
                  <div>
                    <Badge variant="outline" className="text-[10px] no-default-active-elevate bg-muted text-muted-foreground capitalize">
                      {m.role?.toLowerCase().replace(/_/g, " ") || "user"}
                    </Badge>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeMutation.mutate(m.userId)}
                      disabled={removeMutation.isPending}
                      data-testid={`button-remove-member-${m.userId}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAddMember && (
        <AddMemberModal
          team={team}
          existingUserIds={members.map(m => m.userId)}
          onClose={() => setShowAddMember(false)}
        />
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TeamsAdmin() {
  const [showCreate, setShowCreate] = useState(false);

  const { data: teams = [], isLoading } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
    staleTime: 60_000,
  });

  const totalMembers = teams.reduce((sum, t) => sum + t.memberCount, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Team Queues
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage team assignments for task routing in the Daily Work Plan.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-team">
          <Plus className="h-4 w-4 mr-1.5" />
          New Team
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
          <Shield className="h-4 w-4 text-primary shrink-0" />
          <div>
            <p className="text-[11px] text-muted-foreground font-medium leading-none mb-1">Total Teams</p>
            <p className="text-xl font-bold leading-none">{isLoading ? "—" : teams.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
          <Users className="h-4 w-4 text-blue-500 dark:text-blue-400 shrink-0" />
          <div>
            <p className="text-[11px] text-muted-foreground font-medium leading-none mb-1">Total Members</p>
            <p className="text-xl font-bold leading-none">{isLoading ? "—" : totalMembers}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3 col-span-2 sm:col-span-1">
          <Users className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0" />
          <div>
            <p className="text-[11px] text-muted-foreground font-medium leading-none mb-1">Queue Types</p>
            <p className="text-xl font-bold leading-none">{isLoading ? "—" : new Set(teams.map(t => t.queueType)).size}</p>
          </div>
        </div>
      </div>

      {/* Teams table */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            All Teams
            {teams.length > 0 && (
              <Badge variant="outline" className="text-xs no-default-active-elevate bg-muted text-muted-foreground">{teams.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>

        {/* Table header */}
        <div className="grid grid-cols-[1fr_120px_80px_100px] border-t border-border bg-muted/40 px-0">
          <div className="py-1.5 px-4 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Team Name</div>
          <div className="py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Queue Type</div>
          <div className="py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Members</div>
          <div className="py-1.5 pr-4 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Actions</div>
        </div>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-0">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="grid grid-cols-[1fr_120px_80px_100px] items-center border-b border-border px-4 py-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-12" />
                  <div className="flex justify-end"><Skeleton className="h-7 w-16" /></div>
                </div>
              ))}
            </div>
          ) : teams.length === 0 ? (
            <div className="flex items-center gap-2 py-8 justify-center">
              <p className="text-sm text-muted-foreground">No teams yet. Create your first team queue.</p>
            </div>
          ) : (
            <div>
              {teams.map(team => (
                <TeamRow key={team.id} team={team} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info card */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">How team queues work:</strong> Tasks assigned to a team will appear in the Daily Work Plan for all members of that team. Use team queues for tasks that don't have a specific individual owner — like Claims review, Finance collections, or Operations exceptions. Team members can claim, reassign, or complete tasks from the shared queue.
          </p>
        </CardContent>
      </Card>

      {showCreate && <CreateTeamModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
