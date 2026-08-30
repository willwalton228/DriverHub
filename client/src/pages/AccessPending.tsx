import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Mail, LogOut } from "lucide-react";

export default function AccessPending() {
  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Clock className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">Access Pending</CardTitle>
          <CardDescription className="text-base">
            Your account is awaiting admin approval
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border bg-muted/50 p-4 text-center">
            <Mail className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              An administrator needs to provision your account before you can access the system.
              You'll receive an email once your access has been granted.
            </p>
          </div>
          
          <div className="text-center text-sm text-muted-foreground">
            <p>If you believe this is an error, please contact your organization administrator.</p>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
