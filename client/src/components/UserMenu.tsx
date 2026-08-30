import { useState } from "react";
import { User, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { SignOutFeedbackDialog } from "@/components/SignOutFeedbackDialog";

export function UserMenu() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);

  const handleLogout = () => {
    setShowFeedbackDialog(true);
  };

  const handleLogoutConfirmed = () => {
    window.location.href = "/api/logout";
  };

  const handleProfile = () => {
    setLocation("/profile");
  };

  const fullName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.email || "User";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover-elevate cursor-pointer text-left"
            data-testid="button-user-menu"
          >
            <UserAvatar
              photoUrl={user?.profileImageUrl}
              firstName={user?.firstName}
              lastName={user?.lastName}
              email={user?.email}
              size="sm"
              className="h-9 w-9"
              fallbackClassName="bg-primary text-primary-foreground font-medium"
            />
            <span className="text-sm font-medium leading-tight" data-testid="text-user-name">
              {fullName}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={handleProfile} data-testid="menu-item-profile">
            <User className="mr-2 h-4 w-4" />
            <span>Profile & Settings</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} data-testid="menu-item-logout">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log Out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SignOutFeedbackDialog
        open={showFeedbackDialog}
        onOpenChange={setShowFeedbackDialog}
        onLogout={handleLogoutConfirmed}
      />
    </>
  );
}
