import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link2, Loader2 } from "lucide-react";

interface UnlinkedUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

interface UnlinkedDriver {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  status: string | null;
}

interface LinkDriverModalProps {
  trigger?: React.ReactNode;
}

export function LinkDriverModal({ trigger }: LinkDriverModalProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");

  const { data: usersData, isLoading: loadingUsers } = useQuery<{ users: UnlinkedUser[] }>({
    queryKey: ["/api/admin/users/unlinked"],
    enabled: open,
  });

  const { data: driversData, isLoading: loadingDrivers } = useQuery<{ drivers: UnlinkedDriver[] }>({
    queryKey: ["/api/admin/drivers/unlinked"],
    enabled: open,
  });

  const linkMutation = useMutation({
    mutationFn: async ({ userId, driverId }: { userId: string; driverId: string }) => {
      const response = await apiRequest("POST", "/api/admin/drivers/link", { userId, driverId });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Driver Linked",
        description: data.message || "User has been linked to driver profile successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/unlinked"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/drivers/unlinked"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers"] });
      setSelectedUserId("");
      setSelectedDriverId("");
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Link",
        description: error.message || "Failed to link user to driver profile",
        variant: "destructive",
      });
    },
  });

  const handleLink = () => {
    if (!selectedUserId || !selectedDriverId) {
      toast({
        title: "Selection Required",
        description: "Please select both a user and a driver profile",
        variant: "destructive",
      });
      return;
    }
    linkMutation.mutate({ userId: selectedUserId, driverId: selectedDriverId });
  };

  const unlinkedUsers = usersData?.users || [];
  const unlinkedDrivers = driversData?.drivers || [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" data-testid="button-link-driver">
            <Link2 className="mr-2 h-4 w-4" />
            Link Driver Profile
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Link Driver Profile</DialogTitle>
          <DialogDescription>
            Connect a user account to an existing driver profile. This enables driver-specific features for the selected user.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="user-select">Select User</Label>
            {loadingUsers ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading users...
              </div>
            ) : unlinkedUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No unlinked users available</p>
            ) : (
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger id="user-select" data-testid="select-user">
                  <SelectValue placeholder="Choose a user..." />
                </SelectTrigger>
                <SelectContent>
                  {unlinkedUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id} data-testid={`user-option-${user.id}`}>
                      {user.firstName} {user.lastName} ({user.email || "No email"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="driver-select">Select Driver Profile</Label>
            {loadingDrivers ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading drivers...
              </div>
            ) : unlinkedDrivers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No unlinked driver profiles available</p>
            ) : (
              <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                <SelectTrigger id="driver-select" data-testid="select-driver">
                  <SelectValue placeholder="Choose a driver profile..." />
                </SelectTrigger>
                <SelectContent>
                  {unlinkedDrivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id} data-testid={`driver-option-${driver.id}`}>
                      {driver.firstName} {driver.lastName} ({driver.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel">
            Cancel
          </Button>
          <Button 
            onClick={handleLink} 
            disabled={linkMutation.isPending || !selectedUserId || !selectedDriverId}
            data-testid="button-confirm-link"
          >
            {linkMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Linking...
              </>
            ) : (
              <>
                <Link2 className="mr-2 h-4 w-4" />
                Link Profile
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
