import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Globe, Edit, Check, Loader2 } from "lucide-react";

interface LanguagePreferenceData {
  id: string;
  languagePreference: string;
  languagePreferenceSetAt: string | null;
  languagePreferenceSetBy: string | null;
  displayName: string;
  supportedLanguages: Array<{ code: string; name: string }>;
}

interface LanguagePreferenceProps {
  candidateId: string;
  canEdit: boolean;
}

export function LanguagePreference({ candidateId, canEdit }: LanguagePreferenceProps) {
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");

  const { data: preferences, isLoading } = useQuery<LanguagePreferenceData>({
    queryKey: ['/api/recruiting/candidates', candidateId, 'language-preference'],
    queryFn: async () => {
      const response = await fetch(`/api/recruiting/candidates/${candidateId}/language-preference`);
      if (!response.ok) throw new Error('Failed to fetch language preference');
      return response.json();
    },
    enabled: !!candidateId,
  });

  const updateMutation = useMutation({
    mutationFn: async (languagePreference: string) => {
      return apiRequest("PATCH", `/api/recruiting/candidates/${candidateId}/language-preference`, { languagePreference });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/candidates', candidateId, 'language-preference'] });
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/candidates'] });
      setIsEditDialogOpen(false);
      toast({
        title: "Language preference updated",
        description: "Candidate will now receive communications in their preferred language.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update language preference",
        variant: "destructive",
      });
    },
  });

  const handleEdit = () => {
    setSelectedLanguage(preferences?.languagePreference || "en");
    setIsEditDialogOpen(true);
  };

  const handleSave = () => {
    if (selectedLanguage) {
      updateMutation.mutate(selectedLanguage);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
              <Globe className="h-4 w-4" />
              Language Preference
            </CardTitle>
            <CardDescription>
              Preferred language for communications
            </CardDescription>
          </div>
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={handleEdit} data-testid="button-edit-language-pref">
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-medium" data-testid="text-language-display">
              {preferences?.displayName || "English"}
            </div>
            <div className="text-sm text-muted-foreground">
              Communications will be sent in this language when available
            </div>
          </div>
        </div>
        
        {preferences?.languagePreferenceSetAt && (
          <div className="mt-3 text-xs text-muted-foreground">
            Last updated: {new Date(preferences.languagePreferenceSetAt).toLocaleDateString()}
          </div>
        )}
      </CardContent>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Edit Language Preference
            </DialogTitle>
            <DialogDescription>
              Select the candidate's preferred language for all communications including emails, SMS messages, and portal content.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="language-select">Preferred Language</Label>
            <Select
              value={selectedLanguage}
              onValueChange={setSelectedLanguage}
            >
              <SelectTrigger className="mt-2" data-testid="select-language-preference">
                <SelectValue placeholder="Select a language" />
              </SelectTrigger>
              <SelectContent>
                {preferences?.supportedLanguages?.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <div className="flex items-center gap-2">
                      {lang.name}
                      {lang.code === preferences?.languagePreference && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              If a translation is not available for the selected language, communications will automatically fall back to English.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={updateMutation.isPending || !selectedLanguage}
              data-testid="button-save-language-pref"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
