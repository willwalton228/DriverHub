import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, Clock, UserPlus, Truck, Briefcase } from "lucide-react";

export default function Register() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(location.split("?")[1] || "");
  const inviteCode = searchParams.get("code");

  const { data: invitation, isLoading, error } = useQuery({
    queryKey: ["/api/invitations", inviteCode],
    queryFn: async () => {
      if (!inviteCode) return null;
      const response = await fetch(`/api/invitations/${inviteCode}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Invalid invitation");
      }
      return response.json();
    },
    enabled: !!inviteCode,
  });

  if (!inviteCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle>No Invitation Code</CardTitle>
            <CardDescription>
              You need a valid invitation link to register. Please check your email for the invitation from your administrator.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/">
              <Button variant="outline" data-testid="button-back-home">
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Validating invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !invitation) {
    const errorMessage = error instanceof Error ? error.message : "Invalid invitation";
    const isExpired = errorMessage.includes("expired");
    const isUsed = errorMessage.includes("already been used");

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              {isExpired ? (
                <Clock className="h-8 w-8 text-destructive" />
              ) : (
                <AlertCircle className="h-8 w-8 text-destructive" />
              )}
            </div>
            <CardTitle className="text-destructive">
              {isExpired ? "Invitation Expired" : isUsed ? "Invitation Already Used" : "Invalid Invitation"}
            </CardTitle>
            <CardDescription>
              {isExpired
                ? "This invitation link has expired. Please contact your administrator for a new invitation."
                : isUsed
                ? "This invitation has already been used. If you need to reset your access, please contact your administrator."
                : "The invitation link is invalid or has been revoked. Please contact your administrator."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/">
              <Button variant="outline" data-testid="button-back-home">
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const roleDisplay = invitation.role === "driver" ? "Driver" : "Employee";
  const RoleIcon = invitation.role === "driver" ? Truck : Briefcase;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <UserPlus className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Welcome to DriverHub 360</CardTitle>
          <CardDescription>
            You've been invited to join as a {roleDisplay}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <RoleIcon className="h-5 w-5 text-primary" />
              <span className="font-medium">Role:</span>
              <Badge variant="secondary" data-testid="badge-role">
                {roleDisplay}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="font-medium">Email:</span>
              <span className="text-muted-foreground" data-testid="text-email">{invitation.email}</span>
            </div>
          </div>

          <div className="space-y-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">What happens next:</p>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>Click the button below to sign in</li>
              <li>Use your work email ({invitation.email}) to authenticate</li>
              <li>Complete your profile with all required information</li>
            </ol>
          </div>

          <a href={`/api/login?invite_code=${inviteCode}`} className="block">
            <Button className="w-full" size="lg" data-testid="button-register">
              <UserPlus className="mr-2 h-5 w-5" />
              Complete Registration
            </Button>
          </a>

          <p className="text-xs text-center text-muted-foreground">
            By registering, you agree to the terms of service and privacy policy.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
