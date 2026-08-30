import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cleanPhone } from "@/lib/phone";
import { PhoneInput } from "@/components/PhoneInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar, Clock, Phone, Video, MapPin, User, Mail,
  CheckCircle2, AlertTriangle, ChevronLeft, CalendarCheck
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const INTERVIEW_TYPE_CONFIG = {
  phone: { label: "Phone Screen", icon: Phone, color: "text-blue-500" },
  video: { label: "Video Interview", icon: Video, color: "text-violet-500" },
  in_person: { label: "In-Person Interview", icon: MapPin, color: "text-green-500" },
} as const;

function formatSlotDate(iso: string): { date: string; time: string; dayOfWeek: string } {
  const d = new Date(iso);
  return {
    dayOfWeek: d.toLocaleDateString("en-US", { weekday: "long" }),
    date: d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
  };
}

function groupSlotsByDate(slots: string[], bookedSlots: string[]): Record<string, string[]> {
  const bookedSet = new Set(bookedSlots.map((s) => new Date(s).toISOString()));
  const available = slots.filter((s) => !bookedSet.has(new Date(s).toISOString()) && new Date(s) > new Date());
  const groups: Record<string, string[]> = {};
  for (const slot of available) {
    const key = new Date(slot).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    (groups[key] = groups[key] || []).push(slot);
  }
  return groups;
}

export default function ScheduleBooking() {
  const [, params] = useRoute("/schedule/:token");
  const token = params?.token || "";

  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [step, setStep] = useState<"pick" | "form" | "confirm">("pick");
  const [form, setForm] = useState({ candidateName: "", candidateEmail: "", candidatePhone: "", notes: "" });
  const [confirmation, setConfirmation] = useState<{ confirmationCode: string; interviewId: string | null } | null>(null);

  const { data: linkData, isLoading, error } = useQuery<any>({
    queryKey: ["/api/schedule", token],
    queryFn: async () => {
      const res = await fetch(`/api/schedule/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body.message || "Not found"), { code: body.code, status: res.status });
      }
      return res.json();
    },
    retry: false,
    enabled: !!token,
  });

  const bookMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await fetch(`/api/schedule/${token}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.message || "Booking failed"), { code: data.code });
      return data;
    },
    onSuccess: (data) => {
      setConfirmation({ confirmationCode: data.confirmationCode, interviewId: data.interviewId });
      setStep("confirm");
    },
  });

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading scheduling link…</p>
        </div>
      </div>
    );
  }

  // ─── Error states ──────────────────────────────────────────────────────────
  if (error || !linkData) {
    const err = error as any;
    const code = err?.code;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <h2 className="font-semibold text-lg">
              {code === "expired" ? "Link Expired" : code === "cancelled" ? "Link Cancelled" : "Link Not Found"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {code === "expired"
                ? "This scheduling link has expired. Please contact your recruiter for a new link."
                : code === "cancelled"
                ? "This scheduling link has been cancelled. Please contact your recruiter."
                : "This scheduling link could not be found. Please check the link and try again."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Already booked ────────────────────────────────────────────────────────
  if (linkData.isBooked && !confirmation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <h2 className="font-semibold text-lg">Already Booked</h2>
            <p className="text-sm text-muted-foreground">
              This scheduling link has already been booked. If you need to reschedule, please contact your recruiter.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const typeConfig = INTERVIEW_TYPE_CONFIG[linkData.interviewType as keyof typeof INTERVIEW_TYPE_CONFIG] || INTERVIEW_TYPE_CONFIG.phone;
  const TypeIcon = typeConfig.icon;
  const slots: string[] = Array.isArray(linkData.availableSlots) ? linkData.availableSlots : [];
  const bookedSlots: string[] = Array.isArray(linkData.bookedSlots) ? linkData.bookedSlots : [];
  const groupedSlots = groupSlotsByDate(slots, bookedSlots);
  const hasAvailableSlots = Object.keys(groupedSlots).length > 0;
  const candidateName = linkData.candidate ? `${linkData.candidate.firstName || ""} ${linkData.candidate.lastName || ""}`.trim() : "";
  const organizerName = linkData.organizer ? `${linkData.organizer.firstName || ""} ${linkData.organizer.lastName || ""}`.trim() : "Your Recruiter";

  // ─── Confirmation screen ───────────────────────────────────────────────────
  if (step === "confirm" && confirmation) {
    const slot = formatSlotDate(selectedSlot!);
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 space-y-5">
            <div className="text-center space-y-2">
              <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-7 w-7 text-green-500" />
              </div>
              <h2 className="text-xl font-bold">You're Confirmed!</h2>
              <p className="text-sm text-muted-foreground">Your interview has been scheduled. Please save your confirmation details.</p>
            </div>

            <div className="rounded-md border p-4 space-y-3 bg-muted/30">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Confirmation Code</p>
                <p className="text-2xl font-bold tracking-widest text-primary" data-testid="confirmation-code">{confirmation.confirmationCode}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Interview</p>
                <p className="font-medium text-sm">{linkData.title}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Date & Time</p>
                <p className="font-medium text-sm">{slot.dayOfWeek}, {slot.date}</p>
                <p className="text-sm text-muted-foreground">{slot.time} — {linkData.durationMinutes} minutes</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Format</p>
                <p className="text-sm flex items-center gap-1.5">
                  <TypeIcon className={`h-3.5 w-3.5 ${typeConfig.color}`} />
                  {typeConfig.label}
                  {linkData.meetingLink && <span className="text-muted-foreground">· <a href={linkData.meetingLink} target="_blank" rel="noopener noreferrer" className="underline text-primary">Join Link</a></span>}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Interviewer</p>
                <p className="text-sm">{organizerName}</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              A confirmation has been recorded. Please keep your confirmation code for reference. If you need to make changes, contact your recruiter.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Step: Form ────────────────────────────────────────────────────────────
  if (step === "form" && selectedSlot) {
    const slot = formatSlotDate(selectedSlot);
    return (
      <div className="min-h-screen bg-background py-10 px-4">
        <div className="max-w-lg mx-auto space-y-6">
          {/* Header */}
          <div className="text-center space-y-1">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <CalendarCheck className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">{linkData.title}</h1>
            <p className="text-sm text-muted-foreground">{organizerName} · {linkData.requisition?.title}</p>
          </div>

          {/* Selected slot summary */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="font-semibold text-sm">{slot.dayOfWeek}, {slot.date}</p>
                  <p className="text-sm text-muted-foreground">{slot.time} · {linkData.durationMinutes} min · <span className="flex-inline items-center gap-1">{typeConfig.label}</span></p>
                </div>
                <Button size="sm" variant="ghost" className="ml-auto shrink-0" onClick={() => setStep("pick")} data-testid="btn-change-slot">
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />Change
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Candidate info form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Your Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="candidateName">Full Name <span className="text-destructive">*</span></Label>
                <Input
                  id="candidateName"
                  value={form.candidateName}
                  onChange={(e) => setForm((f) => ({ ...f, candidateName: e.target.value }))}
                  placeholder={candidateName || "Your full name"}
                  data-testid="input-candidate-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="candidateEmail">Email Address <span className="text-destructive">*</span></Label>
                <Input
                  id="candidateEmail"
                  type="email"
                  value={form.candidateEmail}
                  onChange={(e) => setForm((f) => ({ ...f, candidateEmail: e.target.value }))}
                  placeholder={linkData.candidate?.email || "your@email.com"}
                  data-testid="input-candidate-email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="candidatePhone">Phone Number <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <PhoneInput
                  id="candidatePhone"
                  value={form.candidatePhone}
                  onChange={(v) => setForm((f) => ({ ...f, candidatePhone: v }))}
                  data-testid="input-candidate-phone"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes for the Interviewer <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Anything you'd like the interviewer to know beforehand…"
                  rows={3}
                  data-testid="input-notes"
                />
              </div>
            </CardContent>
          </Card>

          {bookMutation.error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">{(bookMutation.error as any)?.message || "Booking failed. Please try again."}</p>
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={() =>
              bookMutation.mutate({
                selectedSlot,
                candidateName: form.candidateName.trim() || candidateName,
                candidateEmail: form.candidateEmail.trim() || linkData.candidate?.email,
                candidatePhone: form.candidatePhone ? cleanPhone(form.candidatePhone) || undefined : undefined,
                notes: form.notes.trim() || undefined,
              })
            }
            disabled={bookMutation.isPending || (!form.candidateName.trim() && !candidateName) || (!form.candidateEmail.trim() && !linkData.candidate?.email)}
            data-testid="btn-confirm-booking"
          >
            {bookMutation.isPending ? "Confirming…" : "Confirm Interview"}
          </Button>
        </div>
      </div>
    );
  }

  // ─── Step: Pick a slot ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <CalendarCheck className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">{linkData.title}</h1>
          {linkData.description && <p className="text-sm text-muted-foreground">{linkData.description}</p>}
        </div>

        {/* Interview info */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4 shrink-0" />
              <span>with <span className="font-medium text-foreground">{organizerName}</span></span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" />
              <span>{linkData.durationMinutes} minutes</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TypeIcon className={`h-4 w-4 shrink-0 ${typeConfig.color}`} />
              <span>{typeConfig.label}</span>
              {linkData.meetingLink && <a href={linkData.meetingLink} target="_blank" rel="noopener noreferrer" className="ml-1 underline text-primary text-xs">(Join Link)</a>}
            </div>
            {linkData.requisition?.title && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0" />
                <span>Position: <span className="text-foreground font-medium">{linkData.requisition.title}</span>{linkData.requisition?.market ? ` — ${linkData.requisition.market}` : ""}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Slot picker */}
        <div className="space-y-4">
          <h2 className="text-base font-semibold">Select a Time</h2>

          {!hasAvailableSlots ? (
            <Card>
              <CardContent className="py-10 text-center space-y-2">
                <Calendar className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm font-medium text-muted-foreground">No available time slots</p>
                <p className="text-xs text-muted-foreground">All slots may be filled or expired. Contact your recruiter for availability.</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(groupedSlots).map(([dateLabel, daySlots]) => (
              <div key={dateLabel} className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground">{dateLabel}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {daySlots.map((slot) => {
                    const { time } = formatSlotDate(slot);
                    const isSelected = selectedSlot === slot;
                    return (
                      <button
                        key={slot}
                        onClick={() => setSelectedSlot(slot)}
                        className={`rounded-md border px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                          isSelected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background hover:bg-muted/50 text-foreground"
                        }`}
                        data-testid={`slot-${slot}`}
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {selectedSlot && (
          <Button
            className="w-full"
            size="lg"
            onClick={() => {
              setForm((f) => ({
                ...f,
                candidateName: f.candidateName || candidateName,
                candidateEmail: f.candidateEmail || linkData.candidate?.email || "",
              }));
              setStep("form");
            }}
            data-testid="btn-continue-to-form"
          >
            Continue
          </Button>
        )}

        <p className="text-xs text-center text-muted-foreground">
          All times shown in your local timezone. This link expires {new Date(linkData.expiresAt).toLocaleDateString()}.
        </p>
      </div>
    </div>
  );
}
