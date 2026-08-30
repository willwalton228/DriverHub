import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  Target, Tag, Users, Plus, Trash2, Edit, Loader2, 
  Weight, UserCheck, MapPin, Briefcase, BarChart3, Search
} from "lucide-react";

interface SkillTag {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
  createdAt: string;
}

interface Recruiter {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  activeApplications: number;
  skills: { name: string; category: string | null }[];
  markets: string[];
}

interface AssignmentRule {
  id: string;
  name: string;
  description: string | null;
  strategy: string;
  market: string | null;
  workerType: string | null;
  maxActiveApplications: number;
  eligibleRecruiters: string[];
  requiredSkillTagIds: string[];
  priority: number;
  isActive: boolean;
  marketWeight: number;
  skillWeight: number;
  workloadWeight: number;
  createdAt: string;
}

interface RecruiterSkill {
  id: string;
  userId: string;
  skillTagId: string;
  proficiencyLevel: number;
  tagName: string;
  tagCategory: string | null;
}

export default function AssignmentRulesPanel() {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState("rules");
  const [showCreateTag, setShowCreateTag] = useState(false);
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [editingRule, setEditingRule] = useState<AssignmentRule | null>(null);
  const [showAssignSkill, setShowAssignSkill] = useState(false);
  const [selectedRecruiter, setSelectedRecruiter] = useState<Recruiter | null>(null);
  const [recruiterSearch, setRecruiterSearch] = useState("");

  const [tagName, setTagName] = useState("");
  const [tagDescription, setTagDescription] = useState("");
  const [tagCategory, setTagCategory] = useState("");

  const [ruleName, setRuleName] = useState("");
  const [ruleDescription, setRuleDescription] = useState("");
  const [ruleStrategy, setRuleStrategy] = useState("skill_market_scored");
  const [ruleMarket, setRuleMarket] = useState("");
  const [ruleWorkerType, setRuleWorkerType] = useState("");
  const [ruleMaxApps, setRuleMaxApps] = useState(50);
  const [rulePriority, setRulePriority] = useState(0);
  const [ruleMarketWeight, setRuleMarketWeight] = useState(40);
  const [ruleSkillWeight, setRuleSkillWeight] = useState(40);
  const [ruleWorkloadWeight, setRuleWorkloadWeight] = useState(20);
  const [ruleSkillTags, setRuleSkillTags] = useState<string[]>([]);

  const [assignSkillTagId, setAssignSkillTagId] = useState("");
  const [assignProficiency, setAssignProficiency] = useState(1);

  const { data: skillTags = [], isLoading: loadingTags } = useQuery<SkillTag[]>({
    queryKey: ["/api/recruiting/skill-tags"],
  });

  const { data: rules = [], isLoading: loadingRules } = useQuery<AssignmentRule[]>({
    queryKey: ["/api/recruiting/assignment-rules"],
  });

  const { data: recruiters = [], isLoading: loadingRecruiters } = useQuery<Recruiter[]>({
    queryKey: ["/api/recruiting/recruiters"],
  });

  const { data: recruiterSkills = [] } = useQuery<RecruiterSkill[]>({
    queryKey: ["/api/recruiting/recruiter-skills", selectedRecruiter?.id],
    enabled: !!selectedRecruiter,
  });

  const createTagMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; category: string }) => {
      const res = await apiRequest("POST", "/api/recruiting/skill-tags", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/skill-tags"] });
      toast({ title: "Skill tag created" });
      setShowCreateTag(false);
      setTagName("");
      setTagDescription("");
      setTagCategory("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/recruiting/skill-tags/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/skill-tags"] });
      toast({ title: "Skill tag deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createRuleMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/recruiting/assignment-rules", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/assignment-rules"] });
      toast({ title: "Assignment rule created" });
      resetRuleForm();
      setShowCreateRule(false);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/recruiting/assignment-rules/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/assignment-rules"] });
      toast({ title: "Assignment rule updated" });
      setEditingRule(null);
      resetRuleForm();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/recruiting/assignment-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/assignment-rules"] });
      toast({ title: "Assignment rule deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const assignSkillMutation = useMutation({
    mutationFn: async (data: { targetUserId: string; skillTagId: string; proficiencyLevel: number }) => {
      const res = await apiRequest("POST", "/api/recruiting/recruiter-skills", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/recruiter-skills", selectedRecruiter?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/recruiters"] });
      toast({ title: "Skill assigned" });
      setShowAssignSkill(false);
      setAssignSkillTagId("");
      setAssignProficiency(1);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeSkillMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/recruiting/recruiter-skills/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/recruiter-skills", selectedRecruiter?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/recruiters"] });
      toast({ title: "Skill removed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function resetRuleForm() {
    setRuleName("");
    setRuleDescription("");
    setRuleStrategy("skill_market_scored");
    setRuleMarket("");
    setRuleWorkerType("");
    setRuleMaxApps(50);
    setRulePriority(0);
    setRuleMarketWeight(40);
    setRuleSkillWeight(40);
    setRuleWorkloadWeight(20);
    setRuleSkillTags([]);
  }

  function loadRuleForEdit(rule: AssignmentRule) {
    setEditingRule(rule);
    setRuleName(rule.name);
    setRuleDescription(rule.description || "");
    setRuleStrategy(rule.strategy);
    setRuleMarket(rule.market || "");
    setRuleWorkerType(rule.workerType || "");
    setRuleMaxApps(rule.maxActiveApplications);
    setRulePriority(rule.priority);
    setRuleMarketWeight(rule.marketWeight);
    setRuleSkillWeight(rule.skillWeight);
    setRuleWorkloadWeight(rule.workloadWeight);
    setRuleSkillTags(rule.requiredSkillTagIds || []);
    setShowCreateRule(true);
  }

  function handleSaveRule() {
    const data = {
      name: ruleName,
      description: ruleDescription || null,
      strategy: ruleStrategy,
      market: ruleMarket || null,
      workerType: ruleWorkerType || null,
      maxActiveApplications: ruleMaxApps,
      requiredSkillTagIds: ruleSkillTags,
      priority: rulePriority,
      marketWeight: ruleMarketWeight,
      skillWeight: ruleSkillWeight,
      workloadWeight: ruleWorkloadWeight,
    };
    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, data });
    } else {
      createRuleMutation.mutate(data);
    }
  }

  const filteredRecruiters = recruiters.filter(r => {
    if (!recruiterSearch) return true;
    const search = recruiterSearch.toLowerCase();
    return (r.email?.toLowerCase().includes(search) ||
      r.firstName?.toLowerCase().includes(search) ||
      r.lastName?.toLowerCase().includes(search));
  });

  const totalWeight = ruleMarketWeight + ruleSkillWeight + ruleWorkloadWeight;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Assignment Rules Engine
            </CardTitle>
            <CardDescription>
              Configure intelligent auto-assignment of applications to recruiters based on market access, skill matching, and workload balancing.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="flex-wrap gap-1">
          <TabsTrigger value="rules" data-testid="subtab-assignment-rules">
            <Target className="mr-1.5 h-4 w-4" />
            Rules
          </TabsTrigger>
          <TabsTrigger value="skill-tags" data-testid="subtab-skill-tags">
            <Tag className="mr-1.5 h-4 w-4" />
            Skill Tags
          </TabsTrigger>
          <TabsTrigger value="recruiters" data-testid="subtab-recruiters">
            <Users className="mr-1.5 h-4 w-4" />
            Recruiter Skills
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-muted-foreground">
              Rules are evaluated in priority order when an application is created without an assigned recruiter.
            </p>
            <Button onClick={() => { resetRuleForm(); setEditingRule(null); setShowCreateRule(true); }} data-testid="button-create-rule">
              <Plus className="mr-1.5 h-4 w-4" />
              Create Rule
            </Button>
          </div>

          {loadingRules ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rules.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No assignment rules configured. Create a rule to enable auto-assignment.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <Card key={rule.id} data-testid={`card-rule-${rule.id}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium" data-testid={`text-rule-name-${rule.id}`}>{rule.name}</span>
                          <Badge variant={rule.isActive ? "default" : "secondary"} data-testid={`badge-rule-status-${rule.id}`}>
                            {rule.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Badge variant="outline" data-testid={`badge-rule-strategy-${rule.id}`}>
                            {rule.strategy.replace(/_/g, " ")}
                          </Badge>
                          <Badge variant="outline">
                            Priority: {rule.priority}
                          </Badge>
                        </div>
                        {rule.description && (
                          <p className="text-sm text-muted-foreground">{rule.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          {rule.market && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> Market: {rule.market}
                            </span>
                          )}
                          {rule.workerType && (
                            <span className="flex items-center gap-1">
                              <Briefcase className="h-3 w-3" /> Type: {rule.workerType}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <UserCheck className="h-3 w-3" /> Max: {rule.maxActiveApplications} apps
                          </span>
                          <span className="flex items-center gap-1">
                            <Weight className="h-3 w-3" />
                            Weights: M:{rule.marketWeight} S:{rule.skillWeight} W:{rule.workloadWeight}
                          </span>
                          {rule.requiredSkillTagIds?.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Tag className="h-3 w-3" />
                              {rule.requiredSkillTagIds.length} required skill(s)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => {
                          updateRuleMutation.mutate({ id: rule.id, data: { isActive: !rule.isActive } });
                        }} data-testid={`button-toggle-rule-${rule.id}`}>
                          <Switch checked={rule.isActive} className="pointer-events-none" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => loadRuleForEdit(rule)} data-testid={`button-edit-rule-${rule.id}`}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteRuleMutation.mutate(rule.id)} data-testid={`button-delete-rule-${rule.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="skill-tags" className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-muted-foreground">
              Skill tags define capabilities that can be assigned to recruiters and required by assignment rules.
            </p>
            <Button onClick={() => setShowCreateTag(true)} data-testid="button-create-skill-tag">
              <Plus className="mr-1.5 h-4 w-4" />
              Create Skill Tag
            </Button>
          </div>

          {loadingTags ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : skillTags.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No skill tags defined. Create tags to categorize recruiter capabilities.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {skillTags.map((tag) => (
                <Card key={tag.id} data-testid={`card-skill-tag-${tag.id}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium" data-testid={`text-tag-name-${tag.id}`}>{tag.name}</span>
                          {tag.category && <Badge variant="outline">{tag.category}</Badge>}
                          {!tag.isActive && <Badge variant="secondary">Inactive</Badge>}
                        </div>
                        {tag.description && (
                          <p className="text-sm text-muted-foreground mt-1">{tag.description}</p>
                        )}
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => deleteTagMutation.mutate(tag.id)} data-testid={`button-delete-tag-${tag.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recruiters" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            View and manage recruiter skill assignments, market access, and current workload.
          </p>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search recruiters..."
              value={recruiterSearch}
              onChange={(e) => setRecruiterSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-recruiters"
            />
          </div>

          {loadingRecruiters ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRecruiters.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No recruiters found.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filteredRecruiters.map((recruiter) => (
                <Card key={recruiter.id} data-testid={`card-recruiter-${recruiter.id}`}
                  className={selectedRecruiter?.id === recruiter.id ? "ring-2 ring-primary" : ""}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">
                            {recruiter.firstName || recruiter.lastName
                              ? `${recruiter.firstName || ""} ${recruiter.lastName || ""}`.trim()
                              : recruiter.email}
                          </span>
                          <Badge variant="outline">{recruiter.role}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <BarChart3 className="h-3 w-3" />
                            {recruiter.activeApplications ?? 0} active
                          </span>
                          {(recruiter.markets?.length ?? 0) > 0 && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {recruiter.markets.join(", ")}
                            </span>
                          )}
                        </div>
                        {(recruiter.skills?.length ?? 0) > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {recruiter.skills.map((skill, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {skill.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setSelectedRecruiter(
                        selectedRecruiter?.id === recruiter.id ? null : recruiter
                      )} data-testid={`button-manage-skills-${recruiter.id}`}>
                        <Tag className="mr-1.5 h-3.5 w-3.5" />
                        Skills
                      </Button>
                    </div>

                    {selectedRecruiter?.id === recruiter.id && (
                      <div className="mt-4 pt-3 border-t space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">Assigned Skills</span>
                          <Button variant="outline" size="sm" onClick={() => setShowAssignSkill(true)} data-testid="button-assign-skill">
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Add Skill
                          </Button>
                        </div>
                        {recruiterSkills.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No skills assigned.</p>
                        ) : (
                          <div className="space-y-1">
                            {recruiterSkills.map((skill) => (
                              <div key={skill.id} className="flex items-center justify-between gap-2 py-1" data-testid={`row-skill-${skill.id}`}>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{skill.tagName}</Badge>
                                  {skill.tagCategory && (
                                    <span className="text-xs text-muted-foreground">{skill.tagCategory}</span>
                                  )}
                                  <span className="text-xs text-muted-foreground">Level {skill.proficiencyLevel}</span>
                                </div>
                                <Button size="icon" variant="ghost" onClick={() => removeSkillMutation.mutate(skill.id)} data-testid={`button-remove-skill-${skill.id}`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showCreateTag} onOpenChange={setShowCreateTag}>
        <DialogContent data-testid="dialog-create-skill-tag">
          <DialogHeader>
            <DialogTitle>Create Skill Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="e.g. CDL-A, Spanish Speaking" data-testid="input-tag-name" />
            </div>
            <div>
              <label className="text-sm font-medium">Category</label>
              <Input value={tagCategory} onChange={(e) => setTagCategory(e.target.value)} placeholder="e.g. License, Language, Experience" data-testid="input-tag-category" />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea value={tagDescription} onChange={(e) => setTagDescription(e.target.value)} placeholder="Optional description" data-testid="input-tag-description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTag(false)}>Cancel</Button>
            <Button onClick={() => createTagMutation.mutate({ name: tagName, description: tagDescription, category: tagCategory })}
              disabled={!tagName.trim() || createTagMutation.isPending} data-testid="button-save-tag">
              {createTagMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateRule} onOpenChange={(open) => { if (!open) { setShowCreateRule(false); setEditingRule(null); resetRuleForm(); } else setShowCreateRule(true); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-create-rule">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit" : "Create"} Assignment Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="Rule name" data-testid="input-rule-name" />
              </div>
              <div>
                <label className="text-sm font-medium">Strategy</label>
                <Select value={ruleStrategy} onValueChange={setRuleStrategy}>
                  <SelectTrigger data-testid="select-rule-strategy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skill_market_scored">Skill + Market Scored</SelectItem>
                    <SelectItem value="market_based">Market Based</SelectItem>
                    <SelectItem value="round_robin">Round Robin</SelectItem>
                    <SelectItem value="workload_balanced">Workload Balanced</SelectItem>
                    <SelectItem value="manual">Manual Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea value={ruleDescription} onChange={(e) => setRuleDescription(e.target.value)} placeholder="Optional description" data-testid="input-rule-description" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">Market Filter</label>
                <Input value={ruleMarket} onChange={(e) => setRuleMarket(e.target.value)} placeholder="e.g. NY, CA" data-testid="input-rule-market" />
              </div>
              <div>
                <label className="text-sm font-medium">Worker Type Filter</label>
                <Select value={ruleWorkerType} onValueChange={setRuleWorkerType}>
                  <SelectTrigger data-testid="select-rule-worker-type">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="full_time">Full-Time</SelectItem>
                    <SelectItem value="part_time">Part-Time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="temporary">Temporary</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Priority</label>
                <Input type="number" value={rulePriority} onChange={(e) => setRulePriority(parseInt(e.target.value) || 0)} data-testid="input-rule-priority" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Max Active Applications per Recruiter</label>
              <Input type="number" value={ruleMaxApps} onChange={(e) => setRuleMaxApps(parseInt(e.target.value) || 50)} data-testid="input-rule-max-apps" />
            </div>

            {ruleStrategy === "skill_market_scored" && (
              <>
                <div className="space-y-3">
                  <label className="text-sm font-medium">Required Skill Tags</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {skillTags.filter(t => t.isActive).map(tag => (
                      <Badge
                        key={tag.id}
                        variant={ruleSkillTags.includes(tag.id) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => {
                          setRuleSkillTags(prev =>
                            prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                          );
                        }}
                        data-testid={`badge-select-skill-${tag.id}`}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                    {skillTags.filter(t => t.isActive).length === 0 && (
                      <span className="text-sm text-muted-foreground">No active skill tags. Create some in the Skill Tags tab first.</span>
                    )}
                  </div>
                </div>

                <div className="space-y-4 p-4 border rounded-md">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Weight className="h-4 w-4" />
                      Scoring Weights
                    </label>
                    <span className={`text-sm font-medium ${totalWeight === 100 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                      Total: {totalWeight}%
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm">Market Match</span>
                        <span className="text-sm text-muted-foreground">{ruleMarketWeight}%</span>
                      </div>
                      <Slider value={[ruleMarketWeight]} onValueChange={([v]) => setRuleMarketWeight(v)} max={100} step={5} data-testid="slider-market-weight" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm">Skill Match</span>
                        <span className="text-sm text-muted-foreground">{ruleSkillWeight}%</span>
                      </div>
                      <Slider value={[ruleSkillWeight]} onValueChange={([v]) => setRuleSkillWeight(v)} max={100} step={5} data-testid="slider-skill-weight" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm">Workload Penalty</span>
                        <span className="text-sm text-muted-foreground">{ruleWorkloadWeight}%</span>
                      </div>
                      <Slider value={[ruleWorkloadWeight]} onValueChange={([v]) => setRuleWorkloadWeight(v)} max={100} step={5} data-testid="slider-workload-weight" />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateRule(false); setEditingRule(null); resetRuleForm(); }}>Cancel</Button>
            <Button onClick={handleSaveRule}
              disabled={!ruleName.trim() || createRuleMutation.isPending || updateRuleMutation.isPending}
              data-testid="button-save-rule">
              {(createRuleMutation.isPending || updateRuleMutation.isPending) && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editingRule ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAssignSkill} onOpenChange={setShowAssignSkill}>
        <DialogContent data-testid="dialog-assign-skill">
          <DialogHeader>
            <DialogTitle>Assign Skill to {selectedRecruiter?.firstName || selectedRecruiter?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Skill Tag</label>
              <Select value={assignSkillTagId} onValueChange={setAssignSkillTagId}>
                <SelectTrigger data-testid="select-assign-skill-tag">
                  <SelectValue placeholder="Select a skill tag" />
                </SelectTrigger>
                <SelectContent>
                  {skillTags.filter(t => t.isActive).map(tag => (
                    <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Proficiency Level (1-5)</label>
              <Input type="number" min={1} max={5} value={assignProficiency}
                onChange={(e) => setAssignProficiency(Math.min(5, Math.max(1, parseInt(e.target.value) || 1)))}
                data-testid="input-assign-proficiency" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignSkill(false)}>Cancel</Button>
            <Button onClick={() => {
              if (selectedRecruiter && assignSkillTagId) {
                assignSkillMutation.mutate({
                  targetUserId: selectedRecruiter.id,
                  skillTagId: assignSkillTagId,
                  proficiencyLevel: assignProficiency,
                });
              }
            }} disabled={!assignSkillTagId || assignSkillMutation.isPending} data-testid="button-confirm-assign-skill">
              {assignSkillMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}