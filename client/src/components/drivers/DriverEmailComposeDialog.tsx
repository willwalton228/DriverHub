import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Send, Save, Clock, Paperclip, X, ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ── types ────────────────────────────────────────────────────────────────────

interface EmailAccount {
  id: string;
  display_name: string;
  email_address: string;
  is_active: boolean;
}

interface AttachmentFile {
  name: string;
  contentType: string;
  contentBytes: string;
  size: number;
}

interface DriverEmailComposeDialogProps {
  open: boolean;
  onClose: () => void;
  driverId: string;
  driverName: string;
  driverEmail: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:...;base64," prefix
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── component ─────────────────────────────────────────────────────────────────

export function DriverEmailComposeDialog({
  open, onClose, driverId, driverName, driverEmail,
}: DriverEmailComposeDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [from,        setFrom]        = useState("");
  const [to,          setTo]          = useState(driverEmail);
  const [cc,          setCc]          = useState("");
  const [showCc,      setShowCc]      = useState(false);
  const [subject,     setSubject]     = useState("");
  const [body,        setBody]        = useState("");
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [schedule,    setSchedule]    = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");

  // Reset state when dialog opens
  const handleOpen = (wasOpen: boolean) => {
    if (!wasOpen) {
      setFrom(""); setTo(driverEmail); setCc(""); setShowCc(false);
      setSubject(""); setBody(""); setAttachments([]);
      setSchedule(false); setScheduledAt("");
    }
  };

  // Fetch configured email accounts for From dropdown
  const { data: emailAccounts = [] } = useQuery<EmailAccount[]>({
    queryKey: ["/api/admin/comm-email-accounts"],
    enabled: open,
    queryFn: async () => {
      const r = await fetch("/api/admin/comm-email-accounts", { credentials: "include" });
      if (!r.ok) return [];
      const data = await r.json();
      return data.filter((a: EmailAccount) => a.is_active);
    },
  });

  const selectedAccount = emailAccounts.find(a => a.email_address === from);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB per file
    const oversized = files.filter(f => f.size > MAX_SIZE);
    if (oversized.length) {
      toast({ title: "File too large", description: `Max 10 MB per attachment.`, variant: "destructive" });
      return;
    }

    const converted = await Promise.all(
      files.map(async f => ({
        name:         f.name,
        contentType:  f.type || "application/octet-stream",
        contentBytes: await fileToBase64(f),
        size:         f.size,
      }))
    );
    setAttachments(prev => [...prev, ...converted]);
    e.target.value = "";
  }

  function removeAttachment(idx: number) {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  }

  const payload = () => ({
    fromEmail: from || undefined,
    to,
    cc:          cc || undefined,
    subject,
    body,
    attachments: attachments.map(({ name, contentType, contentBytes }) => ({ name, contentType, contentBytes })),
  });

  // Send now
  const sendMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/drivers/${driverId}/send-email`, payload()),
    onSuccess: () => {
      toast({ title: "Email sent", description: `Sent to ${to}` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/comm-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers", driverId, "notes-comms"] });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Send failed", description: e.message ?? "Could not send email.", variant: "destructive" });
    },
  });

  // Save draft
  const draftMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/drivers/${driverId}/save-email-draft`, payload()),
    onSuccess: () => {
      toast({ title: "Draft saved" });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  // Schedule send
  const scheduleMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/drivers/${driverId}/schedule-email`, {
      ...payload(),
      scheduledAt,
    }),
    onSuccess: () => {
      toast({ title: "Email scheduled", description: `Will send on ${new Date(scheduledAt).toLocaleString()}` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/comm-logs"] });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Schedule failed", description: e.message, variant: "destructive" });
    },
  });

  const isPending = sendMutation.isPending || draftMutation.isPending || scheduleMutation.isPending;
  const canSend   = !!to && !!subject && !!body;

  // Compute min datetime for scheduler (1 minute from now)
  const minSchedule = new Date(Date.now() + 60_000).toISOString().slice(0, 16);

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v) onClose();
        handleOpen(!v);
      }}
    >
      <DialogContent className="max-w-2xl w-full" data-testid="dialog-email-driver">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            Compose Email
            <span className="text-muted-foreground font-normal text-sm">→ {driverName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* From */}
          <div className="grid grid-cols-[72px_1fr] items-center gap-2">
            <Label className="text-xs text-right text-muted-foreground">From</Label>
            <Select
              value={from}
              onValueChange={setFrom}
            >
              <SelectTrigger className="h-9 text-sm" data-testid="select-email-from">
                <SelectValue placeholder="Default sender (Microsoft 365)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default sender (Microsoft 365)</SelectItem>
                {emailAccounts.map(a => (
                  <SelectItem key={a.id} value={a.email_address}>
                    {a.display_name} &lt;{a.email_address}&gt;
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* To */}
          <div className="grid grid-cols-[72px_1fr] items-center gap-2">
            <Label htmlFor="email-to" className="text-xs text-right text-muted-foreground">To</Label>
            <div className="flex items-center gap-1.5">
              <Input
                id="email-to"
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="recipient@email.com"
                className="h-9 text-sm flex-1"
                data-testid="input-email-to"
              />
              <button
                type="button"
                onClick={() => setShowCc(v => !v)}
                className="text-xs text-muted-foreground hover-elevate px-2 py-1 rounded-md flex items-center gap-0.5 shrink-0"
                data-testid="button-toggle-cc"
              >
                CC <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* CC */}
          {showCc && (
            <div className="grid grid-cols-[72px_1fr] items-center gap-2">
              <Label htmlFor="email-cc" className="text-xs text-right text-muted-foreground">CC</Label>
              <Input
                id="email-cc"
                value={cc}
                onChange={e => setCc(e.target.value)}
                placeholder="cc@email.com, another@email.com"
                className="h-9 text-sm"
                data-testid="input-email-cc"
              />
            </div>
          )}

          {/* Subject */}
          <div className="grid grid-cols-[72px_1fr] items-center gap-2">
            <Label htmlFor="email-subject" className="text-xs text-right text-muted-foreground">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Enter subject…"
              className="h-9 text-sm"
              data-testid="input-email-subject"
            />
          </div>

          <Separator />

          {/* Body */}
          <Textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write your message…"
            className="min-h-[180px] resize-y text-sm font-normal"
            data-testid="textarea-email-body"
          />

          {/* Attachments */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover-elevate px-2 py-1 rounded-md"
                data-testid="button-add-attachment"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Attach files
              </button>
              <span className="text-[10px] text-muted-foreground">Max 10 MB per file</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              data-testid="input-file-attachment"
            />
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((a, i) => (
                  <Badge
                    key={i}
                    variant="secondary"
                    className="gap-1.5 pr-1 max-w-[220px]"
                    data-testid={`badge-attachment-${i}`}
                  >
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="truncate text-xs">{a.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">({formatFileSize(a.size)})</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="shrink-0 ml-0.5"
                      data-testid={`button-remove-attachment-${i}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Schedule toggle */}
          <div className="flex items-center gap-3 pt-1">
            <Switch
              id="schedule-toggle"
              checked={schedule}
              onCheckedChange={setSchedule}
              data-testid="switch-schedule-send"
            />
            <Label htmlFor="schedule-toggle" className="text-sm cursor-pointer">
              Schedule delivery
            </Label>
            {schedule && (
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                min={minSchedule}
                className="h-9 text-sm w-52"
                data-testid="input-scheduled-at"
              />
            )}
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="default"
            onClick={() => draftMutation.mutate()}
            disabled={isPending || !subject}
            data-testid="button-save-draft"
          >
            {draftMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            Save Draft
          </Button>

          {schedule ? (
            <Button
              size="default"
              onClick={() => scheduleMutation.mutate()}
              disabled={isPending || !canSend || !scheduledAt}
              data-testid="button-schedule-delivery"
            >
              {scheduleMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Clock className="h-3.5 w-3.5 mr-1.5" />
              )}
              Schedule Delivery
            </Button>
          ) : (
            <Button
              size="default"
              onClick={() => sendMutation.mutate()}
              disabled={isPending || !canSend}
              data-testid="button-send-email"
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1.5" />
              )}
              Send Now
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
