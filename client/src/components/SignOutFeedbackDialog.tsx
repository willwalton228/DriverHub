import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Loader2, ThumbsUp, Minus, ThumbsDown, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Sentiment = 'positive' | 'neutral' | 'negative';

interface SignOutFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogout: () => void;
}

export function SignOutFeedbackDialog({ open, onOpenChange, onLogout }: SignOutFeedbackDialogProps) {
  const [responseText, setResponseText] = useState('');
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: suppression } = useQuery<{
    suppressed: boolean;
  }>({
    queryKey: ['/api/user-sentiment/suppression'],
    staleTime: 1000 * 60 * 5,
    enabled: open,
  });

  const isSuppressed = suppression?.suppressed ?? false;

  const submitMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/user-sentiment", {
        promptType: 'sign_out',
        responseText,
        sentiment: sentiment || 'neutral',
        moduleContext: getCurrentModule(),
        pageUrl: window.location.pathname,
        appEnvironment: import.meta.env.MODE,
        dismissed: false,
      });
    },
    onSuccess: () => {
      toast({
        title: "Thank you",
        description: "Your feedback has been recorded.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/user-sentiment/suppression'] });
      onLogout();
    },
    onError: () => {
      toast({
        title: "Feedback not submitted",
        description: "Your feedback is still here. Please try again before signing out.",
        variant: "destructive",
      });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/user-sentiment/dismiss", {
        promptType: 'sign_out',
        moduleContext: getCurrentModule(),
        pageUrl: window.location.pathname,
        appEnvironment: import.meta.env.MODE,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user-sentiment/suppression'] });
      onLogout();
    },
    onError: () => {
      onLogout();
    },
  });

  const handleSubmitAndLogout = () => {
    if (responseText.trim() || sentiment) {
      submitMutation.mutate();
    } else {
      onLogout();
    }
  };

  const handleSkipAndLogout = () => {
    if (!isSuppressed) {
      dismissMutation.mutate();
    } else {
      onLogout();
    }
  };

  const handleClose = () => {
    if (!isSuppressed) {
      dismissMutation.mutate();
    } else {
      onLogout();
    }
  };

  const sentimentButtons: { value: Sentiment; icon: typeof ThumbsUp; label: string }[] = [
    { value: 'positive', icon: ThumbsUp, label: 'Great' },
    { value: 'neutral', icon: Minus, label: 'Okay' },
    { value: 'negative', icon: ThumbsDown, label: 'Needs Improvement' },
  ];

  const isPending = submitMutation.isPending || dismissMutation.isPending;
  const canSubmit = responseText.trim() || sentiment;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        handleClose();
      } else {
        onOpenChange(isOpen);
      }
    }}>
      <DialogContent className="sm:max-w-sm" data-testid="dialog-signout-feedback">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-4 w-4" />
            Sign Out
          </DialogTitle>
          {!isSuppressed && (
            <DialogDescription data-testid="text-feedback-question-signout">
              How is DriverHub 360 working for you?
            </DialogDescription>
          )}
        </DialogHeader>

        {!isSuppressed && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {sentimentButtons.map(({ value, icon: Icon, label }) => (
                <Button
                  key={value}
                  size="icon"
                  variant="ghost"
                  onClick={() => setSentiment(value)}
                  className={`toggle-elevate ${sentiment === value ? 'toggle-elevated' : ''}`}
                  title={label}
                  data-testid={`button-signout-sentiment-${value}`}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              ))}
            </div>

            <p className="text-xs text-muted-foreground" data-testid="text-signout-followup">
              What could we build to make your job easier or more efficient?
            </p>

            <Textarea
              placeholder="Share your thoughts... (optional)"
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              className="min-h-[60px] text-sm"
              data-testid="input-signout-feedback-text"
            />
          </div>
        )}

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={handleSkipAndLogout}
            disabled={isPending}
            data-testid="button-skip-logout"
          >
            {dismissMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <LogOut className="h-3 w-3 mr-1" />
            )}
            {isSuppressed ? 'Sign Out' : 'Not Now'}
          </Button>
          {!isSuppressed && canSubmit && (
            <Button
              onClick={handleSubmitAndLogout}
              disabled={isPending}
              data-testid="button-submit-and-logout"
            >
              {submitMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Send className="h-3 w-3 mr-1" />
              )}
              Send & Sign Out
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getCurrentModule(): string | null {
  const path = window.location.pathname;
  if (path.includes('/drivers')) return 'drivers';
  if (path.includes('/recruiting')) return 'recruiting';
  if (path.includes('/scheduling')) return 'scheduling';
  if (path.includes('/invoicing')) return 'invoicing';
  if (path.includes('/tickets')) return 'tickets';
  if (path.includes('/accounts')) return 'accounts';
  if (path.includes('/payroll')) return 'payroll';
  if (path.includes('/safety')) return 'safety';
  return null;
}
