import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Share2, FileText, Calendar, Plus, Loader2, 
  Wand2, Send, Clock, CheckCircle, AlertCircle, Trash2,
  Facebook, Instagram, Linkedin, Twitter, MapPin, Briefcase
} from "lucide-react";

const postSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  postType: z.string().default("promotional"),
  targetPlatforms: z.array(z.string()).min(1, "Select at least one platform"),
  status: z.string().default("draft"),
  scheduledFor: z.string().optional(),
  mediaUrls: z.string().optional(),
  requisitionId: z.string().optional(),
});

type PostForm = z.infer<typeof postSchema>;

import { getStatusBadgeClass } from "@/lib/statusColors";
const statusColors: Record<string, string> = {
  publishing: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
};
function getSocialStatusClass(status: string): string {
  return statusColors[status] ?? getStatusBadgeClass(status);
}

const postTypeColors: Record<string, string> = {
  job_posting: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  promotional: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  announcement: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  event: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300",
  engagement: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
};

const platformIcons: Record<string, typeof Facebook> = {
  facebook: Facebook,
  instagram: Instagram,
  linkedin: Linkedin,
  twitter: Twitter,
  nextdoor: MapPin,
};

export default function SocialMedia() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("posts");
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [generatingContent, setGeneratingContent] = useState(false);

  const postForm = useForm<PostForm>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      title: "",
      content: "",
      postType: "promotional",
      targetPlatforms: ["facebook"],
      status: "draft",
      scheduledFor: "",
      mediaUrls: "",
      requisitionId: "",
    },
  });

  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalPosts: number;
    scheduledPosts: number;
    publishedPosts: number;
    draftPosts: number;
    connectedPlatforms: number;
    postsThisMonth: number;
  }>({
    queryKey: ["/api/corporate/social-media/stats"],
  });

  const { data: posts, isLoading: postsLoading } = useQuery<any[]>({
    queryKey: ["/api/corporate/social-media/posts"],
  });

  const { data: connections, isLoading: connectionsLoading } = useQuery<any[]>({
    queryKey: ["/api/corporate/social-media/connections"],
  });

  const { data: requisitions } = useQuery<any[]>({
    queryKey: ["/api/corporate/social-media/requisitions"],
  });

  const createPostMutation = useMutation({
    mutationFn: async (data: PostForm) => {
      const payload = {
        ...data,
        scheduledFor: data.scheduledFor ? new Date(data.scheduledFor).toISOString() : null,
        mediaUrls: data.mediaUrls ? data.mediaUrls.split(",").map(u => u.trim()).filter(Boolean) : [],
        requisitionId: data.requisitionId || null,
      };
      return apiRequest("POST", "/api/corporate/social-media/posts", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/social-media/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/social-media/stats"] });
      toast({ title: "Post created", description: "Your social media post has been saved." });
      setPostDialogOpen(false);
      postForm.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create post.", variant: "destructive" });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/corporate/social-media/posts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/social-media/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/social-media/stats"] });
      toast({ title: "Post deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete post.", variant: "destructive" });
    },
  });

  const generateContent = async () => {
    setGeneratingContent(true);
    try {
      const formData = postForm.getValues();
      const response = await apiRequest("POST", "/api/corporate/social-media/generate", {
        postType: formData.postType,
        topic: formData.title || "Company promotion",
        platforms: formData.targetPlatforms,
        requisitionId: formData.requisitionId,
      });
      
      const result = await response.json();
      const content = result.content + 
        (result.hashtags ? "\n\n" + result.hashtags.map((h: string) => `#${h}`).join(" ") : "") +
        (result.callToAction ? "\n\n" + result.callToAction : "");
      
      postForm.setValue("content", content);
      setGenerateDialogOpen(false);
      toast({ title: "Content generated!", description: "AI has created content for your post." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate content.", variant: "destructive" });
    } finally {
      setGeneratingContent(false);
    }
  };

  const onSubmitPost = (data: PostForm) => {
    createPostMutation.mutate(data);
  };

  const platforms = ["facebook", "instagram", "linkedin", "twitter", "nextdoor"];

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Share2 className="h-8 w-8 text-primary" />
            Social Media Marketing
          </h1>
          <p className="text-muted-foreground">Manage and schedule social media posts across platforms</p>
        </div>
        <Button 
          onClick={() => setPostDialogOpen(true)} 
          className="gap-2"
          data-testid="button-new-post"
        >
          <Plus className="h-4 w-4" />
          Create Post
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Posts</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-posts">
              {statsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.totalPosts || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-scheduled-posts">
              {statsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.scheduledPosts || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Published</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-published-posts">
              {statsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.publishedPosts || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-posts-this-month">
              {statsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.postsThisMonth || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="posts" data-testid="tab-posts">Posts</TabsTrigger>
          <TabsTrigger value="scheduled" data-testid="tab-scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="connections" data-testid="tab-connections">Connections</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="mt-6">
          {postsLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : posts?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No posts yet</h3>
                <p className="text-muted-foreground mb-4">Create your first social media post to get started.</p>
                <Button onClick={() => setPostDialogOpen(true)} data-testid="button-create-first-post">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Post
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {posts?.map((post: any) => (
                <Card key={post.id} className="hover-elevate" data-testid={`card-post-${post.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{post.title}</CardTitle>
                        <CardDescription className="mt-1">
                          {post.createdAt && format(new Date(post.createdAt), "MMM d, yyyy 'at' h:mm a")}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={postTypeColors[post.postType] || postTypeColors.promotional}>
                          {post.postType?.replace("_", " ")}
                        </Badge>
                        <Badge className={getSocialStatusClass(post.status)}>
                          {post.status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">{post.content}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-4">
                      {(post.targetPlatforms as string[])?.map((platform: string) => {
                        const Icon = platformIcons[platform] || Share2;
                        return (
                          <Badge key={platform} variant="outline" className="gap-1">
                            <Icon className="h-3 w-3" />
                            {platform}
                          </Badge>
                        );
                      })}
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-wrap justify-end gap-2 border-t pt-4">
                    {post.status === "draft" && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => deletePostMutation.mutate(post.id)}
                        data-testid={`button-delete-post-${post.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    )}
                    {post.status === "scheduled" && post.scheduledFor && (
                      <span className="text-sm text-muted-foreground mr-auto">
                        <Clock className="h-3 w-3 inline mr-1" />
                        Scheduled: {format(new Date(post.scheduledFor), "MMM d 'at' h:mm a")}
                      </span>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="scheduled" className="mt-6">
          {postsLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-4">
              {posts?.filter((p: any) => p.status === "scheduled").length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                    <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No scheduled posts</h3>
                    <p className="text-muted-foreground">Schedule posts to publish at a specific time.</p>
                  </CardContent>
                </Card>
              ) : (
                posts?.filter((p: any) => p.status === "scheduled").map((post: any) => (
                  <Card key={post.id} data-testid={`card-scheduled-${post.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="text-lg">{post.title}</CardTitle>
                        <Badge className={getSocialStatusClass('scheduled')}>
                          <Clock className="h-3 w-3 mr-1" />
                          {post.scheduledFor && format(new Date(post.scheduledFor), "MMM d 'at' h:mm a")}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2">{post.content}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-4">
                        {(post.targetPlatforms as string[])?.map((platform: string) => {
                          const Icon = platformIcons[platform] || Share2;
                          return (
                            <Badge key={platform} variant="outline" className="gap-1">
                              <Icon className="h-3 w-3" />
                              {platform}
                            </Badge>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="connections" className="mt-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {platforms.map((platform) => {
              const connection = connections?.find((c: any) => c.platform === platform);
              const Icon = platformIcons[platform] || Share2;
              const isConnected = connection?.isActive;
              
              return (
                <Card key={platform} data-testid={`card-connection-${platform}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isConnected ? 'bg-green-100 dark:bg-green-900' : 'bg-muted'}`}>
                        <Icon className={`h-6 w-6 ${isConnected ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg capitalize">{platform}</CardTitle>
                        <CardDescription>
                          {isConnected ? "Connected" : platform === "nextdoor" ? "Manual posting only" : "Not connected"}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isConnected ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-muted-foreground">
                          {connection.accountName || "Account connected"}
                        </span>
                      </div>
                    ) : platform === "nextdoor" ? (
                      <p className="text-sm text-muted-foreground">
                        NextDoor doesn't offer a public API. Posts will be generated for manual copy/paste.
                      </p>
                    ) : (
                      <Button variant="outline" className="w-full" disabled>
                        <Share2 className="h-4 w-4 mr-2" />
                        Connect (Coming Soon)
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Post Dialog */}
      <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Social Media Post</DialogTitle>
            <DialogDescription>
              Create a new post to share across your connected platforms.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...postForm}>
            <form onSubmit={postForm.handleSubmit(onSubmitPost)} className="space-y-4">
              <FormField
                control={postForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Post title (internal reference)" data-testid="input-post-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={postForm.control}
                  name="postType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Post Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-post-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="promotional">Promotional</SelectItem>
                          <SelectItem value="job_posting">Job Posting</SelectItem>
                          <SelectItem value="announcement">Announcement</SelectItem>
                          <SelectItem value="event">Event</SelectItem>
                          <SelectItem value="engagement">Engagement</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={postForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-post-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft">Save as Draft</SelectItem>
                          <SelectItem value="scheduled">Schedule</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {postForm.watch("postType") === "job_posting" && (
                <FormField
                  control={postForm.control}
                  name="requisitionId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Link to Job Requisition</FormLabel>
                      <Select onValueChange={(val) => field.onChange(val === "_none" ? "" : val)} value={field.value || "_none"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-requisition">
                            <SelectValue placeholder="Select a job requisition (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">None</SelectItem>
                          {requisitions?.map((req: any) => (
                            <SelectItem key={req.id} value={req.id}>
                              <div className="flex items-center gap-2">
                                <Briefcase className="h-3 w-3" />
                                {req.title} - {req.location || "Remote"}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Link to a job requisition to include details in AI-generated content
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={postForm.control}
                name="targetPlatforms"
                render={() => (
                  <FormItem>
                    <FormLabel>Target Platforms</FormLabel>
                    <div className="flex flex-wrap gap-4">
                      {platforms.map((platform) => {
                        const Icon = platformIcons[platform] || Share2;
                        return (
                          <FormField
                            key={platform}
                            control={postForm.control}
                            name="targetPlatforms"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(platform)}
                                    onCheckedChange={(checked) => {
                                      const current = field.value || [];
                                      if (checked) {
                                        field.onChange([...current, platform]);
                                      } else {
                                        field.onChange(current.filter((p) => p !== platform));
                                      }
                                    }}
                                    data-testid={`checkbox-platform-${platform}`}
                                  />
                                </FormControl>
                                <FormLabel className="flex items-center gap-1 cursor-pointer font-normal">
                                  <Icon className="h-4 w-4" />
                                  <span className="capitalize">{platform}</span>
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center gap-2">
                <FormField
                  control={postForm.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <div className="flex items-center justify-between">
                        <FormLabel>Content</FormLabel>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={generateContent}
                          disabled={generatingContent}
                          className="gap-1"
                          data-testid="button-generate-content"
                        >
                          {generatingContent ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Wand2 className="h-3 w-3" />
                          )}
                          Generate with AI
                        </Button>
                      </div>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="Write your post content here..." 
                          className="min-h-[150px]"
                          data-testid="textarea-post-content"
                        />
                      </FormControl>
                      <FormDescription>
                        Character count: {field.value?.length || 0}
                        {postForm.watch("targetPlatforms")?.includes("twitter") && (
                          <span className={field.value?.length > 280 ? " text-destructive" : ""}>
                            {" "}(Twitter limit: 280)
                          </span>
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {postForm.watch("status") === "scheduled" && (
                <FormField
                  control={postForm.control}
                  name="scheduledFor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Schedule Date & Time</FormLabel>
                      <FormControl>
                        <Input 
                          type="datetime-local" 
                          {...field} 
                          min={new Date().toISOString().slice(0, 16)}
                          data-testid="input-scheduled-time"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <DialogFooter className="flex flex-wrap gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPostDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createPostMutation.isPending} data-testid="button-save-post">
                  {createPostMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {postForm.watch("status") === "scheduled" ? "Schedule Post" : "Save Draft"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
