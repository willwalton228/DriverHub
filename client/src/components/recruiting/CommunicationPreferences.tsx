import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Mail, Phone, MessageSquare, Clock, AlertTriangle, Edit, Ban, CheckCircle } from "lucide-react";

interface CommunicationPreferences {
  id: string;
  preferredChannel: string | null;
  contactHoursStart: string | null;
  contactHoursEnd: string | null;
  contactTimezone: string | null;
  doNotContact: boolean;
  doNotContactReason: string | null;
  doNotContactSetAt: string | null;
}

interface CommunicationPreferencesProps {
  candidateId: string;
  isAdmin: boolean;
  canEdit: boolean;
}

const CHANNELS = [
  { value: "email", label: "Email", icon: Mail },
  { value: "phone", label: "Phone", icon: Phone },
  { value: "sms", label: "SMS", icon: MessageSquare },
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, '0');
  return { value: `${hour}:00`, label: `${hour}:00` };
});

export function CommunicationPreferences({ candidateId, isAdmin, canEdit }: CommunicationPreferencesProps) {
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDncDialogOpen, setIsDncDialogOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    preferredChannel: "",
    contactHoursStart: "09:00",
    contactHoursEnd: "18:00",
    contactTimezone: "America/Chicago",
    doNotContact: false,
    doNotContactReason: "",
  });

  const { data: preferences, isLoading } = useQuery<CommunicationPreferences>({
    queryKey: ['/api/recruiting/candidates', candidateId, 'communication-preferences'],
    queryFn: async () => {
      const response = await fetch(`/api/recruiting/candidates/${candidateId}/communication-preferences`);
      if (!response.ok) throw new Error('Failed to fetch preferences');
      return response.json();
    },
    enabled: !!candidateId,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("PATCH", `/api/recruiting/candidates/${candidateId}/communication-preferences`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/candidates', candidateId, 'communication-preferences'] });
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/candidates'] });
      setIsEditDialogOpen(false);
      toast({
        title: "Preferences updated",
        description: "Communication preferences have been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update preferences",
        variant: "destructive",
      });
    },
  });

  const setDncMutation = useMutation({
    mutationFn: async (data: { doNotContact: boolean; doNotContactReason?: string }) => {
      return apiRequest("PATCH", `/api/recruiting/candidates/${candidateId}/communication-preferences`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/candidates', candidateId, 'communication-preferences'] });
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/candidates'] });
      setIsDncDialogOpen(false);
      toast({
        title: preferences?.doNotContact ? "DNC cleared" : "DNC flag set",
        description: preferences?.doNotContact 
          ? "Candidate can now be contacted." 
          : "Candidate marked as Do Not Contact.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update DNC status",
        variant: "destructive",
      });
    },
  });

  const handleEdit = () => {
    setFormData({
      preferredChannel: preferences?.preferredChannel || "",
      contactHoursStart: preferences?.contactHoursStart || "09:00",
      contactHoursEnd: preferences?.contactHoursEnd || "18:00",
      contactTimezone: preferences?.contactTimezone || "America/Chicago",
      doNotContact: preferences?.doNotContact || false,
      doNotContactReason: preferences?.doNotContactReason || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleDncToggle = () => {
    if (preferences?.doNotContact) {
      setDncMutation.mutate({ doNotContact: false });
    } else {
      setIsDncDialogOpen(true);
    }
  };

  const getChannelIcon = (channel: string | null) => {
    const channelConfig = CHANNELS.find(c => c.value === channel);
    if (channelConfig) {
      const Icon = channelConfig.icon;
      return <Icon className="h-4 w-4" />;
    }
    return <Mail className="h-4 w-4" />;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Communication Preferences
            </CardTitle>
            <CardDescription>
              Contact preferences for this candidate
            </CardDescription>
          </div>
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={handleEdit} data-testid="button-edit-comm-prefs">
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {preferences?.doNotContact && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive">
            <Ban className="h-5 w-5" />
            <div className="flex-1">
              <div className="font-medium">Do Not Contact</div>
              {preferences.doNotContactReason && (
                <div className="text-sm opacity-80">{preferences.doNotContactReason}</div>
              )}
            </div>
            {isAdmin && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDncToggle}
                data-testid="button-clear-dnc"
              >
                Clear DNC
              </Button>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs">Preferred Channel</Label>
            <div className="flex items-center gap-2">
              {getChannelIcon(preferences?.preferredChannel || null)}
              <span className="text-sm">
                {preferences?.preferredChannel 
                  ? CHANNELS.find(c => c.value === preferences.preferredChannel)?.label || preferences.preferredChannel
                  : "Not set"}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs">Contact Hours</Label>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span className="text-sm">
                {preferences?.contactHoursStart && preferences?.contactHoursEnd
                  ? `${preferences.contactHoursStart} - ${preferences.contactHoursEnd}`
                  : "Not set"}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs">Timezone</Label>
            <span className="text-sm">{preferences?.contactTimezone || "Not set"}</span>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs">Status</Label>
            {preferences?.doNotContact ? (
              <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                <Ban className="h-3 w-3" />
                Do Not Contact
              </Badge>
            ) : (
              <Badge variant="outline" className="flex items-center gap-1 w-fit text-green-600 border-green-600">
                <CheckCircle className="h-3 w-3" />
                Can Contact
              </Badge>
            )}
          </div>
        </div>

        {!preferences?.doNotContact && canEdit && (
          <div className="pt-2 border-t">
            <Button 
              variant="outline" 
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setIsDncDialogOpen(true)}
              data-testid="button-set-dnc"
            >
              <Ban className="h-4 w-4 mr-1" />
              Mark Do Not Contact
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Communication Preferences</DialogTitle>
            <DialogDescription>
              Update contact preferences for this candidate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Preferred Channel</Label>
              <Select
                value={formData.preferredChannel}
                onValueChange={(value) => setFormData({ ...formData, preferredChannel: value })}
              >
                <SelectTrigger data-testid="select-preferred-channel">
                  <SelectValue placeholder="Select channel" />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((channel) => (
                    <SelectItem key={channel.value} value={channel.value}>
                      <div className="flex items-center gap-2">
                        <channel.icon className="h-4 w-4" />
                        {channel.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Contact Hours</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={formData.contactHoursStart}
                  onValueChange={(value) => setFormData({ ...formData, contactHoursStart: value })}
                >
                  <SelectTrigger data-testid="select-hours-start">
                    <SelectValue placeholder="Start" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((time) => (
                      <SelectItem key={time.value} value={time.value}>{time.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>to</span>
                <Select
                  value={formData.contactHoursEnd}
                  onValueChange={(value) => setFormData({ ...formData, contactHoursEnd: value })}
                >
                  <SelectTrigger data-testid="select-hours-end">
                    <SelectValue placeholder="End" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((time) => (
                      <SelectItem key={time.value} value={time.value}>{time.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Timezone</Label>
              <Select
                value={formData.contactTimezone}
                onValueChange={(value) => setFormData({ ...formData, contactTimezone: value })}
              >
                <SelectTrigger data-testid="select-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => updateMutation.mutate(formData)}
              disabled={updateMutation.isPending}
              data-testid="button-save-comm-prefs"
            >
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDncDialogOpen} onOpenChange={setIsDncDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Set Do Not Contact
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will prevent all outbound communications to this candidate. 
              This is a hard stop that overrides all other preferences.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="dncReason">Reason (optional)</Label>
            <Textarea
              id="dncReason"
              placeholder="Why is this candidate marked as Do Not Contact?"
              value={formData.doNotContactReason}
              onChange={(e) => setFormData({ ...formData, doNotContactReason: e.target.value })}
              className="mt-2"
              data-testid="input-dnc-reason"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setDncMutation.mutate({ 
                doNotContact: true, 
                doNotContactReason: formData.doNotContactReason 
              })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-dnc"
            >
              {setDncMutation.isPending ? "Setting..." : "Set DNC"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
