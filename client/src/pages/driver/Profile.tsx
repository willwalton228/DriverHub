import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { Driver, InsertDriver } from "@shared/schema";
import { insertDriverSchema, EMERGENCY_CONTACT_RELATIONSHIP_VALUES } from "@shared/schema";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ProfilePhotoUploader } from "@/components/ProfilePhotoUploader";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Phone, Contact, FileText, User, Briefcase, Lock, Camera, Car, AlertTriangle, Calendar, Clock, BookOpen, ExternalLink, Link } from "lucide-react";
import type { DriverResource } from "@shared/schema";
import { formatDate } from "@/lib/dateFormat";
import { formatPhone, cleanPhone } from "@/lib/phone";
import { PhoneInput } from "@/components/PhoneInput";

interface DriverStats {
  lifetimeMoveCount: number;
  accidentCountSinceHire: number;
  hireDate: string | null;
  totalGrossPay: number;
  totalNetPay: number;
  totalHoursWorked: number;
  totalMilesDelivered: number;
  totalBonuses: number;
  totalTrips: number;
  avgHourlyRate: number;
}

export default function Profile() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading, isDriver } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: driver, isLoading: driverLoading, isError: driverError } = useQuery<Driver>({
    queryKey: ["/api/drivers/profile"],
    enabled: isAuthenticated && isDriver,
    retry: false,
  });

  const { data: stats } = useQuery<DriverStats>({
    queryKey: ["/api/drivers/stats"],
    enabled: isAuthenticated && isDriver && !!driver,
  });

  const { data: resources = [], isLoading: resourcesLoading } = useQuery<DriverResource[]>({
    queryKey: ["/api/drivers/resources"],
    enabled: isAuthenticated && isDriver,
  });

  const driverProfileSchema = insertDriverSchema.partial().extend({
    emergencyContactName: z.string().min(1, "Emergency contact name is required"),
    emergencyContactPhone: z.string().min(1, "Emergency contact phone is required"),
    emergencyContactEmail: z.string().min(1, "Emergency contact email is required"),
    emergencyContactRelationship: z.string().min(1, "Emergency contact relationship is required"),
  });

  const form = useForm<Partial<InsertDriver>>({
    resolver: zodResolver(driverProfileSchema),
    defaultValues: {
      userId: "",
      profilePhotoUrl: "",
      phoneNumber: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      dateOfBirth: undefined,
      emergencyContactName: "",
      emergencyContactRelationship: "",
      emergencyContactPhone: "",
      emergencyContactEmail: "",
      licenseNumber: "",
      licenseState: "",
      licenseExpiration: undefined,
    },
  });

  useEffect(() => {
    if (driver) {
      form.reset({
        userId: driver.userId,
        profilePhotoUrl: driver.profilePhotoUrl || "",
        phoneNumber: formatPhone(driver.phoneNumber) || "",
        address: driver.address || "",
        city: driver.city || "",
        state: driver.state || "",
        zipCode: driver.zipCode || "",
        dateOfBirth: driver.dateOfBirth || undefined,
        emergencyContactName: driver.emergencyContactName || "",
        emergencyContactRelationship: driver.emergencyContactRelationship || "",
        emergencyContactPhone: formatPhone(driver.emergencyContactPhone) || "",
        emergencyContactEmail: driver.emergencyContactEmail || "",
        licenseNumber: driver.licenseNumber || "",
        licenseState: driver.licenseState || "",
        licenseExpiration: driver.licenseExpiration || undefined,
      });
    }
  }, [driver]);

  const calculateAge = (dateOfBirth: string | null | undefined): number | null => {
    if (!dateOfBirth) return null;
    
    const today = new Date();
    const dobStr = String(dateOfBirth).substring(0, 10);
    const [year, month, day] = dobStr.split('-').map(Number);
    
    let age = today.getFullYear() - year;
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();
    
    if (currentMonth < month || (currentMonth === month && currentDay < day)) {
      age--;
    }
    
    return age;
  };

  const dateOfBirth = form.watch("dateOfBirth");
  const age = calculateAge(dateOfBirth as string | null | undefined);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<InsertDriver>) => {
      return await apiRequest("PATCH", "/api/drivers/profile", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers/profile"] });
      toast({
        title: "Success",
        description: "Your profile has been updated.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: Partial<InsertDriver>) => {
    if (!isDriver) {
      toast({
        title: "Error",
        description: "Only drivers can update profile information.",
        variant: "destructive",
      });
      return;
    }
    const payload = { ...data };
    if (payload.phoneNumber) payload.phoneNumber = cleanPhone(payload.phoneNumber);
    if (payload.emergencyContactPhone) payload.emergencyContactPhone = cleanPhone(payload.emergencyContactPhone);
    updateMutation.mutate(payload);
  };

  const photoUploadMutation = useMutation({
    mutationFn: async (photoUrl: string) => {
      return await apiRequest("PUT", "/api/drivers/profile-photo", { profilePhotoUrl: photoUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers/profile"] });
      toast({
        title: "Success",
        description: "Profile photo updated successfully.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update profile photo. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePhotoUploadComplete = (dataUrl: string) => {
    if (dataUrl) {
      photoUploadMutation.mutate(dataUrl);
    }
  };

  const profilePhotoUrl = form.watch("profilePhotoUrl");
  
  const getInitials = () => {
    const firstName = user?.firstName || "";
    const lastName = user?.lastName || "";
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    return user?.email?.charAt(0)?.toUpperCase() || "U";
  };

  const formatDateDisplay = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "Not set";
    return formatDate(dateStr) || "Not set";
  };

  if (authLoading || driverLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isDriver) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <Lock className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="text-muted-foreground text-center max-w-md">
          This profile page is only available for driver accounts. 
          Please navigate to a different section of the application.
        </p>
      </div>
    );
  }

  if (driverError || (!driverLoading && !driver)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Clock className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">Profile Pending Setup</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Your driver profile is being set up by your administrator. 
          Please contact your manager or HR department to complete your profile setup.
        </p>
        <Card className="w-full max-w-md mt-4">
          <CardHeader>
            <CardTitle className="text-base">Your Account Information</CardTitle>
            <CardDescription>This information is from your login account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name:</span>
              <span className="font-medium">{user?.firstName} {user?.lastName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email:</span>
              <span className="font-medium">{user?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Role:</span>
              <span className="font-medium capitalize">{user?.role}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">My Profile</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          View and update your personal information
        </p>
      </div>

      {isDriver && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Moves Completed</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Car className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-moves-completed">
                {stats?.lifetimeMoveCount?.toLocaleString() ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Total lifetime moves</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Claims</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-claims">
                {stats?.accidentCountSinceHire ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Since start date</p>
            </CardContent>
          </Card>

          <Card className="col-span-2 md:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Member Since</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold" data-testid="text-member-since">
                {formatDate(stats?.hireDate)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Driver start date</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="personal" className="space-y-4 sm:space-y-6">
        <TabsList className="grid w-full grid-cols-4 h-auto">
          <TabsTrigger value="personal" data-testid="tab-personal-profile" className="text-xs sm:text-sm flex-col sm:flex-row gap-1 sm:gap-2 py-2 sm:py-1.5">
            <User className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Personal Profile</span>
            <span className="sm:hidden">Personal</span>
          </TabsTrigger>
          <TabsTrigger value="work" data-testid="tab-work-profile" className="text-xs sm:text-sm flex-col sm:flex-row gap-1 sm:gap-2 py-2 sm:py-1.5">
            <Briefcase className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Work Profile</span>
            <span className="sm:hidden">Work</span>
          </TabsTrigger>
          <TabsTrigger value="resources" data-testid="tab-resources" className="text-xs sm:text-sm flex-col sm:flex-row gap-1 sm:gap-2 py-2 sm:py-1.5">
            <BookOpen className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Resources</span>
            <span className="sm:hidden">Resources</span>
          </TabsTrigger>
          <TabsTrigger value="password" data-testid="tab-password-reset" className="text-xs sm:text-sm flex-col sm:flex-row gap-1 sm:gap-2 py-2 sm:py-1.5">
            <Lock className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Password Reset</span>
            <span className="sm:hidden">Password</span>
          </TabsTrigger>
        </TabsList>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <TabsContent value="personal" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Camera className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Profile Photo</CardTitle>
                      <CardDescription>Upload your profile picture</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                  <Avatar className="h-32 w-32">
                    <AvatarImage src={profilePhotoUrl as string || undefined} alt="Profile photo" data-testid="avatar-image" />
                    <AvatarFallback className="text-2xl" data-testid="avatar-fallback">{getInitials()}</AvatarFallback>
                  </Avatar>
                  <ProfilePhotoUploader
                    onComplete={handlePhotoUploadComplete}
                    buttonVariant="outline"
                    testId="button-upload-profile-photo"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    {profilePhotoUrl ? "Change Photo" : "Upload Photo"}
                  </ProfilePhotoUploader>
                  {photoUploadMutation.isPending && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading photo...
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Basic Information</CardTitle>
                      <CardDescription>Your personal details</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <Input 
                        value={user?.firstName || ""} 
                        disabled 
                        className="bg-muted"
                        data-testid="input-first-name" 
                      />
                      <p className="text-xs text-muted-foreground">Managed by your account</p>
                    </FormItem>

                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <Input 
                        value={user?.lastName || ""} 
                        disabled 
                        className="bg-muted"
                        data-testid="input-last-name" 
                      />
                      <p className="text-xs text-muted-foreground">Managed by your account</p>
                    </FormItem>
                  </div>

                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <Input 
                      type="email" 
                      value={user?.email || ""} 
                      disabled 
                      className="bg-muted"
                      data-testid="input-email" 
                    />
                    <p className="text-xs text-muted-foreground">Managed by your account</p>
                  </FormItem>

                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="dateOfBirth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date of Birth</FormLabel>
                          <FormControl>
                            <Input 
                              type="date" 
                              {...field} 
                              value={field.value as string || ""} 
                              data-testid="input-date-of-birth" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormItem>
                      <FormLabel>Age</FormLabel>
                      <Input 
                        value={age !== null ? `${age} years` : ""} 
                        disabled 
                        data-testid="display-age"
                        className="bg-muted"
                      />
                    </FormItem>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Phone className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Contact Information</CardTitle>
                      <CardDescription>Your phone number and address</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cell Number</FormLabel>
                        <FormControl>
                          <PhoneInput
                            {...field}
                            data-testid="input-phone-number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Textarea {...field} value={field.value || ""} data-testid="input-address" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-city" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-state" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="zipCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Zip Code</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-zip-code" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => form.reset()}
                  disabled={updateMutation.isPending}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  data-testid="button-save-personal"
                >
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="work" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Contact className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Emergency Contact</CardTitle>
                      <CardDescription>Who to contact in case of emergency</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="emergencyContactName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Name</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-emergency-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="emergencyContactRelationship"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Relationship</FormLabel>
                          <Select
                            value={field.value || ""}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-emergency-relationship">
                                <SelectValue placeholder="Select relationship" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {EMERGENCY_CONTACT_RELATIONSHIP_VALUES.map((rel) => (
                                <SelectItem key={rel} value={rel} data-testid={`option-relationship-${rel.toLowerCase()}`}>
                                  {rel}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="emergencyContactPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <PhoneInput
                              {...field}
                              data-testid="input-emergency-phone"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="emergencyContactEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} value={field.value || ""} data-testid="input-emergency-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Driver's License</CardTitle>
                      <CardDescription>Your license information</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="licenseNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>License Number</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} data-testid="input-license-number" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="licenseState"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>License State</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} placeholder="e.g., CA, TX" data-testid="input-license-state" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="licenseExpiration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expiration Date</FormLabel>
                          <FormControl>
                            <Input 
                              type="date" 
                              {...field} 
                              value={field.value as string || ""} 
                              data-testid="input-license-expiration" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => form.reset()}
                  disabled={updateMutation.isPending}
                  data-testid="button-cancel-work"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  data-testid="button-save-work"
                >
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="password" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Lock className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Password Reset</CardTitle>
                      <CardDescription>Request a password reset</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Password management is handled through your account provider. To reset your password,
                    please use the password reset option when logging in.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.location.href = "/api/logout"}
                    data-testid="button-logout-reset"
                  >
                    Log Out to Reset Password
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </form>
        </Form>

        {/* Resources tab — outside the form, read-only for drivers */}
        <TabsContent value="resources" className="space-y-5">
          {driver?.driverClassification && (
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground" data-testid="text-resources-classification">
              <BookOpen className="h-4 w-4" />
              Resources for: <span className="text-foreground font-semibold">{driver.driverClassification}</span>
            </div>
          )}

          {resourcesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : resources.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <BookOpen className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">No resources available right now.</p>
              </CardContent>
            </Card>
          ) : (
            (() => {
              const grouped = resources.reduce<Record<string, DriverResource[]>>((acc, r) => {
                const cat = r.category || "General";
                if (!acc[cat]) acc[cat] = [];
                acc[cat].push(r);
                return acc;
              }, {});
              return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([category, items]) => (
                <Card key={category}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{category}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {items.sort((a, b) => a.displayOrder - b.displayOrder).map((r) => (
                      <a
                        key={r.id}
                        href={r.url || r.filePath || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-md hover-elevate border group"
                        data-testid={`link-resource-${r.id}`}
                      >
                        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          {r.type === "link" ? (
                            <Link className="h-4 w-4 text-primary" />
                          ) : (
                            <FileText className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-tight truncate">{r.title}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{r.url || r.filePath || ""}</p>
                        </div>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                    ))}
                  </CardContent>
                </Card>
              ));
            })()
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
