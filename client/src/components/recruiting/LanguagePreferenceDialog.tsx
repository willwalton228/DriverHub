import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Globe, Check, Loader2 } from "lucide-react";

interface LanguagePreferenceData {
  id: string;
  languagePreference: string;
  languagePreferenceSetAt: string | null;
  languagePreferenceSetBy: string | null;
  displayName: string;
  supportedLanguages: Array<{ code: string; name: string }>;
}

interface LanguagePreferenceDialogProps {
  candidateId: string;
  candidateName: string;
  trigger?: React.ReactNode;
}

export function LanguagePreferenceDialog({ candidateId, candidateName, trigger }: LanguagePreferenceDialogProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");

  const { data: preferences, isLoading } = useQuery<LanguagePreferenceData>({
    queryKey: ['/api/recruiting/candidates', candidateId, 'language-preference'],
    queryFn: async () => {
      const response = await fetch(`/api/recruiting/candidates/${candidateId}/language-preference`);
      if (!response.ok) throw new Error('Failed to fetch language preference');
      return response.json();
    },
    enabled: !!candidateId && isOpen,
  });

  const updateMutation = useMutation({
    mutationFn: async (languagePreference: string) => {
      return apiRequest("PATCH", `/api/recruiting/candidates/${candidateId}/language-preference`, { languagePreference });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/candidates', candidateId, 'language-preference'] });
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/candidates'] });
      setIsOpen(false);
      toast({
        title: "Language preference updated",
        description: `${candidateName} will now receive communications in their preferred language.`,
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

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open && preferences) {
      setSelectedLanguage(preferences.languagePreference || "en");
    }
  };

  const handleSave = () => {
    if (selectedLanguage) {
      updateMutation.mutate(selectedLanguage);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="ghost"
            size="icon"
            title="Language preference"
            data-testid={`button-language-pref-${candidateId}`}
          >
            <Globe className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md" data-testid={`dialog-language-pref-${candidateId}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Language Preference
          </DialogTitle>
          <DialogDescription>
            Set the preferred language for communications with {candidateName}.
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-medium">Current: {preferences?.displayName || "English"}</div>
                <div className="text-sm text-muted-foreground">
                  {preferences?.languagePreferenceSetAt 
                    ? `Set on ${new Date(preferences.languagePreferenceSetAt).toLocaleDateString()}`
                    : "Default setting"}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="language-select">Change Preferred Language</Label>
              <Select
                value={selectedLanguage || preferences?.languagePreference || "en"}
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
              <p className="text-xs text-muted-foreground">
                If a translation is not available, communications will fall back to English.
              </p>
            </div>
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={updateMutation.isPending || !selectedLanguage || isLoading}
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
  );
}
