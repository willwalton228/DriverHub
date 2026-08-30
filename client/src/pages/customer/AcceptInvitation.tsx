import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Loader2, Users } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function AcceptInvitation() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/customer/accept-invitation/:invitationId");
  const invitationId = params?.invitationId;
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState("");

  const acceptMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/customer/users/accept-invitation/${invitationId}`);
    },
    onSuccess: () => {
      setStatus('success');
    },
    onError: (error: any) => {
      setStatus('error');
      setErrorMessage(error.message || "Failed to accept invitation");
    }
  });

  useEffect(() => {
    if (invitationId) {
      acceptMutation.mutate();
    }
  }, [invitationId]);

  const handleContinue = () => {
    setLocation("/customer/requests");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 rounded-full bg-orange-100 dark:bg-orange-900/30 w-fit">
            <Users className="h-8 w-8 text-orange-600 dark:text-orange-400" />
          </div>
          <CardTitle>Account Invitation</CardTitle>
          <CardDescription>
            {status === 'loading' && "Processing your invitation..."}
            {status === 'success' && "You've been added to the account!"}
            {status === 'error' && "Something went wrong"}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          {status === 'loading' && (
            <div className="py-8">
              <Loader2 className="h-12 w-12 mx-auto animate-spin text-orange-600" />
              <p className="mt-4 text-muted-foreground">Accepting invitation...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="py-4">
              <CheckCircle2 className="h-16 w-16 mx-auto text-green-600 mb-4" />
              <p className="text-muted-foreground mb-6">
                You now have access to view moves and manage requests for this account.
              </p>
              <Button onClick={handleContinue} className="w-full" data-testid="button-continue">
                Continue to Dashboard
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="py-4">
              <AlertCircle className="h-16 w-16 mx-auto text-red-600 mb-4" />
              <p className="text-red-600 mb-2 font-medium">{errorMessage}</p>
              <p className="text-muted-foreground text-sm mb-6">
                The invitation may have already been used, expired, or was sent to a different email address.
              </p>
              <Button variant="outline" onClick={handleContinue} data-testid="button-go-home">
                Go to Dashboard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
