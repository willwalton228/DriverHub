import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Send, Loader2, MessageCircle, ThumbsUp, Minus, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";

type PromptType = 'sign_in' | 'sign_out' | 'manual';
type Sentiment = 'positive' | 'neutral' | 'negative';

const FEEDBACK_PROMPT_HIDDEN_KEY = 'driverhub.feedbackPromptHidden';

function isHiddenForSession(): boolean {
  try {
    return window.sessionStorage.getItem(FEEDBACK_PROMPT_HIDDEN_KEY) === 'true';
  } catch {
    return false;
  }
}

function hideForSession(): void {
  try {
    window.sessionStorage.setItem(FEEDBACK_PROMPT_HIDDEN_KEY, 'true');
  } catch {
    // A blocked storage API must never prevent this optional prompt from closing.
  }
}

interface FeedbackPromptProps {
  promptType: PromptType;
  moduleContext?: string;
  onComplete?: () => void;
}

export function FeedbackPrompt({ promptType, moduleContext, onComplete }: FeedbackPromptProps) {
  const [visible, setVisible] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: suppression, isLoading: suppressionLoading } = useQuery<{
    suppressed: boolean;
    reason: string | null;
    lastActivity: string | null;
  }>({
    queryKey: ['/api/user-sentiment/suppression'],
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (
      !isHiddenForSession() &&
      !suppressionLoading &&
      suppression &&
      !suppression.suppressed
    ) {
      const timer = setTimeout(() => setVisible(true), promptType === 'sign_in' ? 2000 : 500);
      return () => clearTimeout(timer);
    }
  }, [suppression, suppressionLoading, promptType]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/user-sentiment", {
        promptType,
        responseText,
        sentiment: sentiment || 'neutral',
        moduleContext: moduleContext || null,
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
      closeForSession();
      onComplete?.();
      queryClient.invalidateQueries({ queryKey: ['/api/user-sentiment/suppression'] });
    },
    onError: () => {
      toast({
        title: "Feedback not submitted",
        description: "Your feedback is still here. Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/user-sentiment/dismiss", {
        promptType,
        moduleContext: moduleContext || null,
        pageUrl: window.location.pathname,
        appEnvironment: import.meta.env.MODE,
      });
    },
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user-sentiment/suppression'] });
    },
    onError: (error) => {
      console.error('[FeedbackPrompt] Failed to persist survey deferral:', error);
    },
  });

  const closeForSession = useCallback(() => {
    hideForSession();
    setVisible(false);
    setResponseText('');
    setSentiment(null);
  }, []);

  const handleDismiss = () => {
    closeForSession();
    onComplete?.();
    dismissMutation.mutate();
  };

  const handleClose = () => {
    closeForSession();
    onComplete?.();
  };

  const handleSubmit = () => {
    if (!responseText.trim() && !sentiment) return;
    submitMutation.mutate();
  };

  if (suppressionLoading || !visible || suppression?.suppressed) {
    return null;
  }

  const canSubmit = responseText.trim() || sentiment;

  const sentimentButtons: { value: Sentiment; icon: typeof ThumbsUp; label: string }[] = [
    { value: 'positive', icon: ThumbsUp, label: 'Great' },
    { value: 'neutral', icon: Minus, label: 'Okay' },
    { value: 'negative', icon: ThumbsDown, label: 'Needs Improvement' },
  ];

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 animate-in slide-in-from-bottom-4 fade-in duration-300"
      data-testid="feedback-prompt-container"
    >
      <Card className="p-3 shadow-lg border">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm font-medium leading-tight" data-testid="text-feedback-question">
              How is DriverHub 360 working for you?
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleClose}
            className="shrink-0"
            data-testid="button-feedback-prompt-dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1 mb-2">
          {sentimentButtons.map(({ value, icon: Icon, label }) => (
            <Button
              key={value}
              size="icon"
              variant="ghost"
              onClick={() => setSentiment(value)}
              className={`toggle-elevate ${sentiment === value ? 'toggle-elevated' : ''}`}
              title={label}
              data-testid={`button-sentiment-${value}`}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mb-2" data-testid="text-feedback-followup">
          What could we build to make your job easier or more efficient?
        </p>

        <Textarea
          placeholder="Share your thoughts... (optional)"
          value={responseText}
          onChange={(e) => setResponseText(e.target.value)}
          className="min-h-[60px] text-sm mb-2"
          data-testid="input-feedback-prompt-text"
        />

        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleDismiss}
            data-testid="button-feedback-not-now"
          >
            Not Now
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit || submitMutation.isPending}
            data-testid="button-feedback-prompt-submit"
          >
            {submitMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Send className="h-3 w-3 mr-1" />
            )}
            Send
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          This is optional and won't appear again for a while.
        </p>
      </Card>
    </div>
  );
}
