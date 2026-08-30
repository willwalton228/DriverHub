import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import {
  Calendar, Clock, Phone, Video, MapPin, Link2, Plus, Copy,
  CheckCircle2, XCircle, Loader2, RefreshCw, Trash2, ExternalLink, Lock
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const INTERVIEW_TYPES = [
  { value: "phone", label: "Phone Screen", icon: Phone },
  { value: "video", label: "Video Interview", icon: Video },
  { value: "in_person", label: "In-Person", icon: MapPin },
] as const;

const DURATION_OPTIONS = [15, 20, 30, 45, 60, 90];

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Active", variant: "default" },
  booked: { label: "Booked", variant: "secondary" },
  expired: { label: "Expired", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

function buildBookingUrl(token: string): string {
  const base = window.location.origin;
  return `${base}/schedule/${token}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function generateDefaultSlots(): string[] {
  // Default: next 5 business days, 3 slots per day (9am, 1pm, 3pm)
  const slots: string[] = [];
  const now = new Date();
  let day = new Date(now);
  day.setDate(day.getDate() + 1);
  let count = 0;
  while (count < 5) {
    const dow = day.getDay();
    if (dow !== 0 && dow !== 6) {
      for (const hour of [9, 13, 15]) {
        const slot = new Date(day);
        slot.setHours(hour, 0, 0, 0);
        slots.push(slot.toISOString());
      }
      count++;
    }
    day.setDate(day.getDate() + 1);
  }
  return slots;
}

interface SlotPickerProps {
  slots: string[];
  onChange: (slots: string[]) => void;
}

function SlotPicker({ slots, onChange }: SlotPickerProps) {
  const [dateInput, setDateInput] = useState("");
  const [timeInput, setTimeInput] = useState("09:00");

  const addSlot = () => {
    if (!dateInput || !timeInput) return;
    const iso = new Date(`${dateInput}T${timeInput}:00`).toISOString();
    if (!slots.includes(iso)) {
      onChange([...slots, iso].sort());
    }
    setDateInput("");
    setTimeInput("09:00");
  };

  const removeSlot = (slot: string) => {
    onChange(slots.filter((s) => s !== slot));
  };

  const addDefaults = () => {
    const defaults = generateDefaultSlots();
    const merged = [...new Set([...slots, ...defaults])].sort();
    onChange(merged);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          type="date"
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          className="w-40"
          min={new Date().toISOString().split("T")[0]}
          data-testid="input-slot-date"
        />
        <Input
          type="time"
          value={timeInput}
          onChange={(e) => setTimeInput(e.target.value)}
          className="w-32"
          data-testid="input-slot-time"
        />
        <Button size="sm" variant="outline" onClick={addSlot} disabled={!dateInput} data-testid="btn-add-slot">
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Slot
        </Button>
        <Button size="sm" variant="ghost" onClick={addDefaults} data-testid="btn-add-default-slots">
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Add Next 5 Days
        </Button>
      </div>

      {slots.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">No slots added yet. Add slots above or click "Add Next 5 Days".</p>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-1 border rounded-md p-2 bg-muted/20">
          {slots.map((slot) => (
            <div key={slot} className="flex items-center justify-between gap-2 py-0.5">
              <span className="text-xs font-medium">{formatDateTime(slot)}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => removeSlot(slot)}
                data-testid={`btn-remove-slot-${slot}`}
              >
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{slots.length} slot{slots.length !== 1 ? "s" : ""} added</p>
    </div>
  );
}

interface Props {
  applicationId: string;
  candidateFirstName?: string | null;
  candidateLastName?: string | null;
  recruiterDecision?: string | null;
}

export function SchedulingLinksPanel({ applicationId, candidateFirstName, candidateLastName, recruiterDecision }: Props) {
  const isApproved = recruiterDecision === "approved_for_interview";
  const { toast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    title: `Interview with ${[candidateFirstName, candidateLastName].filter(Boolean).join(" ") || "Candidate"}`,
    description: "",
    interviewType: "phone",
    durationMinutes: 30,
    meetingLink: "",
    availableSlots: [] as string[],
    expiresAt: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString().split("T")[0];
    })(),
  });

  const { data: links = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/recruiting/applications", applicationId, "scheduling-links"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/applications/${applicationId}/scheduling-links`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load links");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/recruiting/applications/${applicationId}/scheduling-links`, {
        ...form,
        durationMinutes: Number(form.durationMinutes),
        expiresAt: new Date(`${form.expiresAt}T23:59:59`).toISOString(),
        meetingLink: form.meetingLink.trim() || undefined,
        description: form.description.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      setSheetOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "scheduling-links"] });
      toast({ title: "Scheduling link created", description: "Copy and send the link to the candidate." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create link", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const res = await apiRequest("PATCH", `/api/recruiting/scheduling-links/${linkId}/cancel`, {});
      return res.json();
    },
    onSuccess: () => {
      setCancelTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "scheduling-links"] });
      toast({ title: "Link cancelled" });
    },
  });

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(buildBookingUrl(token));
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
    toast({ title: "Link copied to clipboard" });
  };

  const activeLinks = links.filter((l: any) => l.status === "active" || l.status === "booked");
  const pastLinks = links.filter((l: any) => l.status === "expired" || l.status === "cancelled");

  return (
    <>
      {/* Cancel confirmation */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => { if (!open) setCancelTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Scheduling Link?</DialogTitle>
            <DialogDescription>The candidate will no longer be able to use this link to book an interview. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCancelTarget(null)}>Keep Link</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => cancelMutation.mutate(cancelTarget!)}
              disabled={cancelMutation.isPending}
              data-testid="btn-confirm-cancel-link"
            >
              {cancelMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Cancel Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create link sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              Create Scheduling Link
            </SheetTitle>
            <SheetDescription>
              Generate a unique link the candidate can use to self-schedule an interview from your available time slots.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 mt-6">
            <div className="space-y-1.5">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Initial Phone Screen"
                data-testid="input-link-title"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Description <span className="text-muted-foreground text-xs">(shown to candidate)</span></Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What to expect in this interview…"
                rows={2}
                data-testid="input-link-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Interview Type</Label>
                <Select value={form.interviewType} onValueChange={(v) => setForm((f) => ({ ...f, interviewType: v }))}>
                  <SelectTrigger data-testid="select-interview-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVIEW_TYPES.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Duration</Label>
                <Select value={String(form.durationMinutes)} onValueChange={(v) => setForm((f) => ({ ...f, durationMinutes: Number(v) }))}>
                  <SelectTrigger data-testid="select-duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>{d} minutes</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(form.interviewType === "video" || form.interviewType === "in_person") && (
              <div className="space-y-1.5">
                <Label>{form.interviewType === "video" ? "Video Meeting Link" : "Location / Address"}</Label>
                <Input
                  value={form.meetingLink}
                  onChange={(e) => setForm((f) => ({ ...f, meetingLink: e.target.value }))}
                  placeholder={form.interviewType === "video" ? "https://meet.google.com/…" : "123 Main St, Chicago, IL"}
                  data-testid="input-meeting-link"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Link Expires On <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                min={new Date().toISOString().split("T")[0]}
                data-testid="input-expires-at"
              />
            </div>

            <div className="space-y-2">
              <Label>Available Time Slots <span className="text-destructive">*</span></Label>
              <SlotPicker
                slots={form.availableSlots}
                onChange={(slots) => setForm((f) => ({ ...f, availableSlots: slots }))}
              />
            </div>

            <Button
              className="w-full"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.title.trim() || form.availableSlots.length === 0 || !form.expiresAt}
              data-testid="btn-create-scheduling-link"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
              Create Scheduling Link
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Panel */}
      <Card data-testid="card-scheduling-links">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Self-Scheduling Links
              {activeLinks.length > 0 && (
                <Badge variant="secondary" className="text-xs">{activeLinks.length} active</Badge>
              )}
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => isApproved && setSheetOpen(true)}
              disabled={!isApproved}
              title={!isApproved ? "Recruiter must approve this application for interview before a scheduling link can be created." : undefined}
              data-testid="btn-open-create-link-sheet"
            >
              {isApproved ? <Plus className="h-3.5 w-3.5 mr-1.5" /> : <Lock className="h-3.5 w-3.5 mr-1.5" />}
              {isApproved ? "New Link" : "Locked"}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Gate notice */}
          {!isApproved && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 text-sm text-muted-foreground" data-testid="notice-scheduling-locked">
              <Lock className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Scheduling links are locked until a recruiter approves this application for interview. Use the <strong>Recruiter Decision</strong> card above to approve.</span>
            </div>
          )}
          {isLoading ? (
            <div className="flex items-center gap-2 py-3 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading links…</span>
            </div>
          ) : activeLinks.length === 0 && pastLinks.length === 0 ? (
            <div className="py-6 text-center space-y-2">
              <Calendar className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">No scheduling links yet.</p>
              <p className="text-xs text-muted-foreground">Create a link to let the candidate self-schedule an interview.</p>
            </div>
          ) : (
            <>
              {/* Active links */}
              {activeLinks.map((link: any) => {
                const statusCfg = STATUS_CONFIG[link.status] || STATUS_CONFIG.active;
                const booking = link.bookings?.[0];
                const typeConfig = INTERVIEW_TYPES.find((t) => t.value === link.interviewType);
                const TypeIcon = typeConfig?.icon || Phone;
                const url = buildBookingUrl(link.token);
                const slotCount = Array.isArray(link.availableSlots) ? link.availableSlots.length : 0;
                const expirySoon = new Date(link.expiresAt) < new Date(Date.now() + 48 * 60 * 60 * 1000);

                return (
                  <div key={link.id} className="rounded-md border p-3 space-y-2.5" data-testid={`link-card-${link.id}`}>
                    <div className="flex items-start gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{link.title}</span>
                          <Badge variant={statusCfg.variant} className="text-xs">{statusCfg.label}</Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><TypeIcon className="h-3 w-3" />{typeConfig?.label}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{link.durationMinutes}min</span>
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{slotCount} slot{slotCount !== 1 ? "s" : ""}</span>
                          {expirySoon && link.status === "active" && (
                            <span className="text-amber-600">Expires soon</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Booking info */}
                    {booking && (
                      <div className="flex items-center gap-2 rounded-md bg-green-500/10 border border-green-500/20 px-2.5 py-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        <div className="text-xs">
                          <span className="font-medium text-green-700 dark:text-green-400">{booking.candidateName}</span>
                          <span className="text-muted-foreground"> booked {formatDateTime(booking.selectedSlot)}</span>
                          <span className="ml-2 font-mono text-muted-foreground"># {booking.confirmationCode}</span>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    {link.status === "active" && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => copyLink(link.token)}
                          data-testid={`btn-copy-link-${link.id}`}
                        >
                          {copiedToken === link.token ? <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" /> : <Copy className="h-3 w-3 mr-1" />}
                          {copiedToken === link.token ? "Copied!" : "Copy Link"}
                        </Button>
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost" className="h-7 text-xs" data-testid={`btn-preview-link-${link.id}`}>
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Preview
                          </Button>
                        </a>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-destructive"
                          onClick={() => setCancelTarget(link.id)}
                          data-testid={`btn-cancel-link-${link.id}`}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Past links (collapsed) */}
              {pastLinks.length > 0 && (
                <div className="pt-1">
                  <p className="text-xs text-muted-foreground mb-2">Past Links ({pastLinks.length})</p>
                  <div className="space-y-1.5">
                    {pastLinks.map((link: any) => {
                      const statusCfg = STATUS_CONFIG[link.status] || STATUS_CONFIG.expired;
                      const booking = link.bookings?.[0];
                      return (
                        <div key={link.id} className="rounded-md border px-3 py-2 opacity-60 flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium flex-1 min-w-0 truncate">{link.title}</span>
                          <Badge variant={statusCfg.variant} className="text-xs">{statusCfg.label}</Badge>
                          {booking && <span className="text-xs text-muted-foreground">Booked by {booking.candidateName}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
