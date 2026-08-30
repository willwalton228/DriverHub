import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EmailSummaryDialogProps {
  title: string;
  summaryContent: string;
}

export function EmailSummaryDialog({ title, summaryContent }: EmailSummaryDialogProps) {
  const [open, setOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [comments, setComments] = useState("");
  const { toast } = useToast();

  const handleSendEmail = () => {
    if (!recipientEmail) {
      toast({
        title: "Email Required",
        description: "Please enter a recipient email address.",
        variant: "destructive",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    const subject = encodeURIComponent(`${title} Summary - DriverHub 360`);
    const body = encodeURIComponent(
      `${title} Summary\n` +
      `${"=".repeat(50)}\n\n` +
      `${summaryContent}\n\n` +
      (comments ? `Comments:\n${"-".repeat(30)}\n${comments}\n\n` : "") +
      `---\nSent from DriverHub 360`
    );

    window.location.href = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;

    toast({
      title: "Email Client Opened",
      description: "Your email client has been opened with the summary.",
    });

    setOpen(false);
    setRecipientEmail("");
    setComments("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-email-summary">
          <Mail className="h-4 w-4 mr-2" />
          Email Summary
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Email Summary</DialogTitle>
          <DialogDescription>
            Send the {title.toLowerCase()} summary to a colleague with optional comments.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Recipient Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="colleague@company.com"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              data-testid="input-recipient-email"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="comments">Comments (Optional)</Label>
            <Textarea
              id="comments"
              placeholder="Add any notes or context for the recipient..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="resize-none"
              rows={4}
              data-testid="input-email-comments"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-email">
            Cancel
          </Button>
          <Button onClick={handleSendEmail} data-testid="button-send-email">
            <Send className="h-4 w-4 mr-2" />
            Send Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
