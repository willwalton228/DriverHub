import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Calendar, Copy, Check, Link2, ExternalLink, RefreshCw, Trash2, Clock, Info, Shield, AlertTriangle } from "lucide-react";
import { SiGooglecalendar, SiApple } from "react-icons/si";
import { cn } from "@/lib/utils";

interface FeedToken {
  id: string;
  token: string;
  label: string;
  is_active: boolean;
  last_accessed_at: string | null;
  access_count: number;
  created_at: string;
}

export function CalendarSyncTab() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [showInstructions, setShowInstructions] = useState<string | null>(null);

  const { data: tokensData, isLoading, isError, refetch } = useQuery<{ tokens: FeedToken[] }>({
    queryKey: ['/api/scheduling/calendar-feed/tokens'],
  });

  const createTokenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/scheduling/calendar-feed/token', { label: 'My Schedule' });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/calendar-feed/tokens'] });
      toast({ title: "Calendar feed created", description: "Your personal calendar feed URL is ready." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create calendar feed.", variant: "destructive" });
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      const res = await apiRequest('DELETE', `/api/scheduling/calendar-feed/token/${tokenId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/calendar-feed/tokens'] });
      toast({ title: "Feed revoked", description: "The calendar feed URL has been deactivated." });
    },
    onError: () => {
      toast({ title: "Revoke failed", description: "Could not revoke the calendar feed.", variant: "destructive" });
    },
  });

  const activeToken = tokensData?.tokens?.find(t => t.is_active);
  const feedUrl = activeToken ? `${window.location.origin}/api/calendar-feed/${activeToken.token}.ics` : null;

  const copyToClipboard = async () => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      toast({ title: "Copied", description: "Feed URL copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Please select and copy the URL manually.", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm" data-testid="error-calendar-sync">
        <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
        <span className="text-muted-foreground">Unable to load calendar feed information.</span>
        <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-row flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" data-testid="text-calendar-sync-title">Calendar Sync</h2>
          <p className="text-sm text-muted-foreground">Subscribe to your shift schedule in Google Calendar, Outlook, or Apple Calendar</p>
        </div>
      </div>

      <Card className="border-dashed" data-testid="card-sync-info">
        <CardContent className="flex items-start gap-3 py-3 px-4">
          <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">
            One-way sync from DriverHub to your personal calendar. Shift times, locations, and roles will appear as calendar events.
            Changes made in DriverHub are automatically reflected when your calendar refreshes (typically every 30 minutes).
          </p>
        </CardContent>
      </Card>

      {!activeToken ? (
        <Card data-testid="card-create-feed">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <Calendar className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">No Calendar Feed Active</p>
              <p className="text-sm text-muted-foreground mt-1">Create a personal feed URL to subscribe with your calendar app.</p>
            </div>
            <Button
              onClick={() => createTokenMutation.mutate()}
              disabled={createTokenMutation.isPending}
              data-testid="button-create-feed"
            >
              {createTokenMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Link2 className="h-4 w-4 mr-2" />
              Generate Calendar Feed
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card data-testid="card-feed-url">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Your Calendar Feed URL
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={feedUrl || ''}
                  className="font-mono text-xs"
                  data-testid="input-feed-url"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={copyToClipboard}
                  data-testid="button-copy-feed-url"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              <div className="flex flex-row flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>Created {new Date(activeToken.created_at).toLocaleDateString()}</span>
                </div>
                {activeToken.last_accessed_at && (
                  <div className="flex items-center gap-1">
                    <RefreshCw className="h-3 w-3" />
                    <span>Last synced {new Date(activeToken.last_accessed_at).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span>{activeToken.access_count} sync{activeToken.access_count !== 1 ? 's' : ''}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <Shield className="h-3 w-3" />
                  Private link
                </Badge>
                <span className="text-xs text-muted-foreground">Anyone with this URL can view your schedule. Keep it private.</span>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card
              className={cn("cursor-pointer hover-elevate", showInstructions === 'google' && 'ring-2 ring-primary')}
              onClick={() => setShowInstructions(showInstructions === 'google' ? null : 'google')}
              data-testid="card-google-calendar"
            >
              <CardContent className="flex flex-col items-center py-6 gap-3">
                <SiGooglecalendar className="h-8 w-8 text-[#4285F4]" />
                <span className="font-medium text-sm">Google Calendar</span>
                <Badge variant="outline" className="text-xs">How to subscribe</Badge>
              </CardContent>
            </Card>
            <Card
              className={cn("cursor-pointer hover-elevate", showInstructions === 'outlook' && 'ring-2 ring-primary')}
              onClick={() => setShowInstructions(showInstructions === 'outlook' ? null : 'outlook')}
              data-testid="card-outlook-calendar"
            >
              <CardContent className="flex flex-col items-center py-6 gap-3">
                <Calendar className="h-8 w-8 text-[#0078D4]" />
                <span className="font-medium text-sm">Outlook</span>
                <Badge variant="outline" className="text-xs">How to subscribe</Badge>
              </CardContent>
            </Card>
            <Card
              className={cn("cursor-pointer hover-elevate", showInstructions === 'apple' && 'ring-2 ring-primary')}
              onClick={() => setShowInstructions(showInstructions === 'apple' ? null : 'apple')}
              data-testid="card-apple-calendar"
            >
              <CardContent className="flex flex-col items-center py-6 gap-3">
                <SiApple className="h-8 w-8" />
                <span className="font-medium text-sm">Apple Calendar</span>
                <Badge variant="outline" className="text-xs">How to subscribe</Badge>
              </CardContent>
            </Card>
          </div>

          {showInstructions && (
            <Card data-testid="card-instructions">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {showInstructions === 'google' && 'Subscribe with Google Calendar'}
                  {showInstructions === 'outlook' && 'Subscribe with Outlook'}
                  {showInstructions === 'apple' && 'Subscribe with Apple Calendar'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {showInstructions === 'google' && (
                  <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                    <li>Copy the feed URL above</li>
                    <li>Open <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google Calendar</a></li>
                    <li>Click the <strong>+</strong> next to "Other calendars" in the left sidebar</li>
                    <li>Select <strong>"From URL"</strong></li>
                    <li>Paste the feed URL and click <strong>"Add calendar"</strong></li>
                    <li>Your shifts will appear within a few minutes and auto-update</li>
                  </ol>
                )}
                {showInstructions === 'outlook' && (
                  <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                    <li>Copy the feed URL above</li>
                    <li>Open <a href="https://outlook.live.com/calendar" target="_blank" rel="noopener noreferrer" className="text-primary underline">Outlook Calendar</a></li>
                    <li>Click <strong>"Add calendar"</strong> in the left panel</li>
                    <li>Select <strong>"Subscribe from web"</strong></li>
                    <li>Paste the feed URL, name it "DriverHub Schedule", and click <strong>"Import"</strong></li>
                    <li>Your shifts will sync automatically</li>
                  </ol>
                )}
                {showInstructions === 'apple' && (
                  <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                    <li>Copy the feed URL above</li>
                    <li>Open Apple Calendar on your Mac or iPhone</li>
                    <li>Go to <strong>File &gt; New Calendar Subscription</strong> (Mac) or <strong>Settings &gt; Calendar &gt; Accounts &gt; Add Account &gt; Other &gt; Add Subscribed Calendar</strong> (iPhone)</li>
                    <li>Paste the feed URL</li>
                    <li>Set auto-refresh to <strong>"Every 30 minutes"</strong> and click <strong>"Subscribe"</strong></li>
                    <li>Your shifts will appear and stay in sync</li>
                  </ol>
                )}
                <div className="mt-4">
                  <Button variant="outline" size="sm" onClick={copyToClipboard} data-testid="button-copy-in-instructions">
                    {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                    Copy Feed URL
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Feed Management
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                If you believe your feed URL has been compromised, revoke it and generate a new one.
                Calendar apps subscribed to the old URL will stop receiving updates.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => revokeTokenMutation.mutate(activeToken.id)}
                disabled={revokeTokenMutation.isPending}
                data-testid="button-revoke-feed"
              >
                {revokeTokenMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Trash2 className="h-4 w-4 mr-2" />
                Revoke Feed URL
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}