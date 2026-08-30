import { AlertTriangle, Ban, Clock, Mail, Phone, MessageSquare, CheckCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ContactPreference {
  preferredChannel: string | null;
  contactHoursStart: string | null;
  contactHoursEnd: string | null;
  contactTimezone: string | null;
  doNotContact: boolean;
  doNotContactReason: string | null;
}

interface ContactPreferenceWarningProps {
  preferences: ContactPreference | null;
  intendedChannel: "email" | "phone" | "sms";
  isAdmin?: boolean;
  onAdminOverride?: () => void;
  className?: string;
}

function isWithinContactHours(
  start: string | null, 
  end: string | null, 
  timezone: string | null
): boolean {
  if (!start || !end) return true;
  
  try {
    const tz = timezone || "America/Chicago";
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", { 
      hour: "2-digit", 
      minute: "2-digit", 
      hour12: false, 
      timeZone: tz 
    });
    const currentTime = formatter.format(now);
    
    const [currentHour, currentMin] = currentTime.split(":").map(Number);
    const [startHour, startMin] = start.split(":").map(Number);
    const [endHour, endMin] = end.split(":").map(Number);
    
    const currentMinutes = currentHour * 60 + currentMin;
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch {
    return true;
  }
}

function getChannelIcon(channel: string) {
  switch (channel) {
    case "email": return <Mail className="h-4 w-4" />;
    case "phone": return <Phone className="h-4 w-4" />;
    case "sms": return <MessageSquare className="h-4 w-4" />;
    default: return <Mail className="h-4 w-4" />;
  }
}

export function ContactPreferenceWarning({ 
  preferences, 
  intendedChannel, 
  isAdmin = false,
  onAdminOverride,
  className = ""
}: ContactPreferenceWarningProps) {
  if (!preferences) return null;

  if (preferences.doNotContact) {
    return (
      <Alert variant="destructive" className={className} data-testid="alert-dnc-block">
        <Ban className="h-4 w-4" />
        <AlertTitle>Do Not Contact</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>This candidate has requested no contact.</p>
          {preferences.doNotContactReason && (
            <p className="text-sm opacity-80">Reason: {preferences.doNotContactReason}</p>
          )}
          {isAdmin && onAdminOverride && (
            <div className="pt-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={onAdminOverride}
                data-testid="button-admin-override-dnc"
              >
                Admin Override
              </Button>
              <p className="text-xs mt-1 opacity-70">
                Override will be logged for compliance purposes
              </p>
            </div>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  const warnings: { type: "error" | "warning" | "info"; message: string; key: string }[] = [];

  if (preferences.preferredChannel && preferences.preferredChannel !== intendedChannel) {
    warnings.push({
      type: "warning",
      key: "channel",
      message: `Candidate prefers ${preferences.preferredChannel}. You're about to use ${intendedChannel}.`
    });
  }

  const withinHours = isWithinContactHours(
    preferences.contactHoursStart,
    preferences.contactHoursEnd,
    preferences.contactTimezone
  );

  if (!withinHours) {
    warnings.push({
      type: "warning",
      key: "hours",
      message: `Outside contact hours (${preferences.contactHoursStart} - ${preferences.contactHoursEnd} ${preferences.contactTimezone || "local time"}).`
    });
  }

  if (warnings.length === 0) {
    return (
      <Alert className={`border-green-500/50 bg-green-50 dark:bg-green-950/20 ${className}`} data-testid="alert-contact-ok">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-700 dark:text-green-400">
          Contact preferences OK
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="default" className={`border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 ${className}`} data-testid="alert-preference-warning">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-700 dark:text-amber-400">Contact Preference Mismatch</AlertTitle>
      <AlertDescription className="space-y-2">
        <ul className="text-sm space-y-1 text-amber-700 dark:text-amber-400">
          {warnings.map((w) => (
            <li key={w.key}>• {w.message}</li>
          ))}
        </ul>
        <p className="text-xs opacity-70">
          You may still proceed, but consider respecting the candidate's preferences.
        </p>
      </AlertDescription>
    </Alert>
  );
}

export function ContactPreferenceBadge({ 
  preferences, 
  size = "default" 
}: { 
  preferences: ContactPreference | null;
  size?: "default" | "sm";
}) {
  if (!preferences) return null;

  if (preferences.doNotContact) {
    return (
      <Badge 
        variant="destructive" 
        className={size === "sm" ? "text-xs" : ""}
        data-testid="badge-dnc"
      >
        <Ban className="h-3 w-3 mr-1" />
        DNC
      </Badge>
    );
  }

  if (preferences.preferredChannel) {
    return (
      <Badge 
        variant="secondary" 
        className={size === "sm" ? "text-xs" : ""}
        data-testid="badge-channel-pref"
      >
        {getChannelIcon(preferences.preferredChannel)}
        <span className="ml-1 capitalize">{preferences.preferredChannel}</span>
      </Badge>
    );
  }

  return null;
}

export function checkContactCompliance(
  preferences: ContactPreference | null,
  intendedChannel: "email" | "phone" | "sms"
): { canContact: boolean; warnings: string[]; blockReason: string | null } {
  if (!preferences) {
    return { canContact: true, warnings: [], blockReason: null };
  }

  if (preferences.doNotContact) {
    return { 
      canContact: false, 
      warnings: [], 
      blockReason: preferences.doNotContactReason || "Candidate marked as Do Not Contact" 
    };
  }

  const warnings: string[] = [];

  if (preferences.preferredChannel && preferences.preferredChannel !== intendedChannel) {
    warnings.push(`Preferred channel is ${preferences.preferredChannel}`);
  }

  const withinHours = isWithinContactHours(
    preferences.contactHoursStart,
    preferences.contactHoursEnd,
    preferences.contactTimezone
  );

  if (!withinHours) {
    warnings.push(`Outside contact hours`);
  }

  return { canContact: true, warnings, blockReason: null };
}
