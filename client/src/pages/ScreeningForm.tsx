import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, AlertCircle, FileText, Clock } from "lucide-react";

interface Question {
  id: string;
  type: "text" | "boolean" | "select" | "multiselect" | "date" | "textarea";
  label: string;
  required: boolean;
  options?: string[];
  helpText?: string;
}

interface FormTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  questions: Question[];
}

interface ScreeningData {
  formTemplate: FormTemplate;
  candidateName: string;
  expiresAt: string;
}

type FormState = "loading" | "ready" | "submitting" | "submitted" | "error";

export default function ScreeningForm() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<FormState>("loading");
  const [data, setData] = useState<ScreeningData | null>(null);
  const [error, setError] = useState<string>("");
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function fetchForm() {
      try {
        const res = await fetch(`/api/screening/${token}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Failed to load form");
        }
        const formData = await res.json();
        setData(formData);
        setState("ready");
        
        const initialResponses: Record<string, unknown> = {};
        formData.formTemplate.questions.forEach((q: Question) => {
          if (q.type === "multiselect") {
            initialResponses[q.id] = [];
          } else if (q.type === "boolean") {
            initialResponses[q.id] = null;
          } else {
            initialResponses[q.id] = "";
          }
        });
        setResponses(initialResponses);
      } catch (err: any) {
        setError(err.message);
        setState("error");
      }
    }
    fetchForm();
  }, [token]);

  const updateResponse = (questionId: string, value: unknown) => {
    setResponses(prev => ({ ...prev, [questionId]: value }));
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[questionId];
      return newErrors;
    });
  };

  const toggleMultiselect = (questionId: string, option: string) => {
    setResponses(prev => {
      const current = (prev[questionId] as string[]) || [];
      const updated = current.includes(option)
        ? current.filter(o => o !== option)
        : [...current, option];
      return { ...prev, [questionId]: updated };
    });
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    data?.formTemplate.questions.forEach((q: Question) => {
      if (q.required) {
        const value = responses[q.id];
        if (value === null || value === undefined || value === "") {
          errors[q.id] = "This field is required";
        } else if (q.type === "multiselect" && Array.isArray(value) && value.length === 0) {
          errors[q.id] = "Please select at least one option";
        }
      }
    });
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setState("submitting");
    try {
      const res = await fetch(`/api/screening/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to submit form");
      }
      setState("submitted");
    } catch (err: any) {
      setError(err.message);
      setState("error");
    }
  };

  const renderQuestion = (question: Question, index: number) => {
    const value = responses[question.id];
    const hasError = !!validationErrors[question.id];

    return (
      <div key={question.id} className="space-y-2" data-testid={`question-${question.id}`}>
        <Label className={`text-sm font-medium ${hasError ? "text-destructive" : ""}`}>
          {index + 1}. {question.label}
          {question.required && <span className="text-destructive ml-1">*</span>}
        </Label>

        {question.helpText && (
          <p className="text-xs text-muted-foreground">{question.helpText}</p>
        )}

        {question.type === "text" && (
          <Input
            data-testid={`input-${question.id}`}
            value={(value as string) || ""}
            onChange={(e) => updateResponse(question.id, e.target.value)}
            className={hasError ? "border-destructive" : ""}
          />
        )}

        {question.type === "textarea" && (
          <Textarea
            data-testid={`textarea-${question.id}`}
            value={(value as string) || ""}
            onChange={(e) => updateResponse(question.id, e.target.value)}
            className={hasError ? "border-destructive" : ""}
            rows={3}
          />
        )}

        {question.type === "date" && (
          <Input
            data-testid={`input-${question.id}`}
            type="date"
            value={(value as string) || ""}
            onChange={(e) => updateResponse(question.id, e.target.value)}
            className={hasError ? "border-destructive" : ""}
          />
        )}

        {question.type === "boolean" && (
          <RadioGroup
            value={value === true ? "yes" : value === false ? "no" : ""}
            onValueChange={(v) => updateResponse(question.id, v === "yes")}
            className="flex gap-4"
            data-testid={`radio-${question.id}`}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="yes" id={`${question.id}-yes`} />
              <Label htmlFor={`${question.id}-yes`} className="font-normal">Yes</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no" id={`${question.id}-no`} />
              <Label htmlFor={`${question.id}-no`} className="font-normal">No</Label>
            </div>
          </RadioGroup>
        )}

        {question.type === "select" && question.options && (
          <Select
            value={(value as string) || ""}
            onValueChange={(v) => updateResponse(question.id, v)}
          >
            <SelectTrigger 
              data-testid={`select-${question.id}`}
              className={hasError ? "border-destructive" : ""}
            >
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {question.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {question.type === "multiselect" && question.options && (
          <div className="space-y-2" data-testid={`multiselect-${question.id}`}>
            {question.options.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <Checkbox
                  id={`${question.id}-${option}`}
                  checked={((value as string[]) || []).includes(option)}
                  onCheckedChange={() => toggleMultiselect(question.id, option)}
                />
                <Label htmlFor={`${question.id}-${option}`} className="font-normal">
                  {option}
                </Label>
              </div>
            ))}
          </div>
        )}

        {hasError && (
          <p className="text-xs text-destructive">{validationErrors[question.id]}</p>
        )}
      </div>
    );
  };

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading screening form...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-lg font-semibold mb-2">Unable to Load Form</h2>
            <p className="text-muted-foreground text-center">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === "submitted") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-12 w-12 text-green-600 mb-4" />
            <h2 className="text-lg font-semibold mb-2">Form Submitted Successfully</h2>
            <p className="text-muted-foreground text-center">
              Thank you for completing the screening form. Our team will review your responses.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case "driving_history": return "Driving History";
      case "availability": return "Availability";
      case "equipment_access": return "Equipment Access";
      case "state_disclosure": return "State Disclosure";
      default: return "General";
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-5 w-5 text-primary" />
              <Badge variant="outline">{getCategoryLabel(data!.formTemplate.category)}</Badge>
            </div>
            <CardTitle data-testid="text-form-title">{data!.formTemplate.name}</CardTitle>
            <CardDescription>
              {data!.formTemplate.description}
            </CardDescription>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
              <Clock className="h-3 w-3" />
              <span>Completing for: {data!.candidateName}</span>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {data!.formTemplate.questions.map((question: Question, index: number) => 
              renderQuestion(question, index)
            )}
          </CardContent>

          <CardFooter className="flex justify-end gap-2">
            <Button
              data-testid="button-submit-form"
              onClick={handleSubmit}
              disabled={state === "submitting"}
            >
              {state === "submitting" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Submit Form
            </Button>
          </CardFooter>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          This is a secure form. Your responses will be kept confidential.
        </p>
      </div>
    </div>
  );
}
