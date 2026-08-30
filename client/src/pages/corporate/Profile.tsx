import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfilePhotoUploader } from "@/components/ProfilePhotoUploader";
import { Mail, Shield, Calendar, User, Briefcase, Lock, Camera, Bell, Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { MyBadgeStrip } from "@/components/amr/AMRAchievementBadges";
import { formatDate } from "@/lib/dateFormat";
import NotificationPreferences from "./NotificationPreferences";

const roleLabels: Record<string, string> = {
  super_user: "Super User",
  admin: "Administrator",
  regional_cl: "Regional CL",
  network_cl: "Network CL",
  dealer_cl: "Dealer CL",
  certification_liaison: "Certification Liaison",
  custom_user_list: "Custom User List",
  driver: "Driver",
  employee: "Employee",
  testing: "Testing",
  corporate: "Corporate",
};

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();

  const updatePhotoMutation = useMutation({
    mutationFn: async (profileImageUrl: string) => {
      const response = await apiRequest("PUT", "/api/users/profile-photo", { profileImageUrl });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Photo Updated",
        description: "Your profile photo has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update profile photo. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePhotoUploadComplete = (dataUrl: string) => {
    if (dataUrl) {
      updatePhotoMutation.mutate(dataUrl);
    }
  };

  if (!user) {
    return null;
  }

  const getInitials = () => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    return user.email?.[0]?.toUpperCase() || "U";
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Profile</h1>
        <p className="text-muted-foreground">Manage your account information and preferences</p>
      </div>

      <Tabs defaultValue="personal" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="personal" data-testid="tab-personal-profile">
            <User className="h-4 w-4 mr-2" />
            Personal
          </TabsTrigger>
          <TabsTrigger value="work" data-testid="tab-work-profile">
            <Briefcase className="h-4 w-4 mr-2" />
            Work
          </TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">
            <Bell className="h-4 w-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="password" data-testid="tab-password-reset">
            <Lock className="h-4 w-4 mr-2" />
            Password
          </TabsTrigger>
        </TabsList>

        {/* Personal Profile Tab */}
        <TabsContent value="personal" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>Your personal account details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={user.profileImageUrl || undefined} />
                    <AvatarFallback className="text-lg">{getInitials()}</AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-1 -right-1">
                    <ProfilePhotoUploader
                      onComplete={handlePhotoUploadComplete}
                      buttonVariant="secondary"
                      buttonClassName="h-8 w-8 rounded-full p-0"
                      testId="button-upload-profile-photo"
                    >
                      <Camera className="h-4 w-4" />
                    </ProfilePhotoUploader>
                  </div>
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-semibold">
                    {user.firstName && user.lastName
                      ? `${user.firstName} ${user.lastName}`
                      : "User"}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {user.email || "No email provided"}
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-sm text-muted-foreground">{user.email || "Not provided"}</p>
                  </div>
                </div>

                {user.createdAt && (
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Member Since</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* AMR Achievement Badges */}
          <Card data-testid="card-amr-achievements">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-sm">AMR Achievement Badges</CardTitle>
              </div>
              <CardDescription className="text-xs">Badges you currently hold based on your AMR contributions.</CardDescription>
            </CardHeader>
            <CardContent>
              <MyBadgeStrip period="all_time" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Work Profile Tab */}
        <TabsContent value="work" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Work Information</CardTitle>
              <CardDescription>Your role and work-related details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Role</p>
                    <div className="mt-1">
                      <Badge variant={user.role === "super_user" || user.role === "admin" ? "default" : "secondary"}>
                        {roleLabels[user.role || ""] || user.role}
                      </Badge>
                    </div>
                  </div>
                </div>

                {user.roleSelectedAt && (
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Role Assigned</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(user.roleSelectedAt)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6">
                <p className="text-sm text-muted-foreground">
                  Additional work profile settings coming soon.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notification Preferences Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <NotificationPreferences />
        </TabsContent>

        {/* Password Reset Tab */}
        <TabsContent value="password" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Password Reset</CardTitle>
              <CardDescription>Manage your account password</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Password reset functionality coming soon. You are currently authenticated via Replit Auth.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
