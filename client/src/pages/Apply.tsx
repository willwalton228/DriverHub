import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, MapPin, Building2, Clock, DollarSign, Briefcase, CheckCircle2,
  Camera, Video, Square, RefreshCw, ChevronRight, Mic, StopCircle, Phone,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cleanPhone } from "@/lib/phone";
import { PhoneInput } from "@/components/PhoneInput";

type IntakePath = "standard" | "video_optional" | "audio_optional";

const applyFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().refine((v) => v.replace(/\D/g, "").length === 10, "Valid 10-digit phone number is required"),
  coverLetter: z.string().optional(),
});

type ApplyFormValues = z.infer<typeof applyFormSchema>;

// ─── Video Recorder ───────────────────────────────────────────────────────────

function VideoRecorder({
  onRecorded,
  onSkip,
}: {
  onRecorded: (blob: Blob) => void;
  onSkip: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "requesting" | "ready" | "recording" | "preview" | "error">("idle");
  const [timeLeft, setTimeLeft] = useState(60);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const playbackRef = useRef<HTMLVideoElement | null>(null);
  const playbackUrlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopStream = useCallback(() => {
    stopTimer();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (playbackUrlRef.current) {
      URL.revokeObjectURL(playbackUrlRef.current);
      playbackUrlRef.current = null;
    }
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  const startCamera = async () => {
    setStatus("requesting");
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      setStatus("ready");
      setTimeLeft(60);
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.muted = true;
        liveVideoRef.current.play().catch(() => {});
      }
    } catch {
      setCameraError("Camera access denied. Please allow camera/microphone access and try again.");
      setStatus("error");
    }
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const options = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? { mimeType: "video/webm;codecs=vp9" }
      : MediaRecorder.isTypeSupported("video/webm")
      ? { mimeType: "video/webm" }
      : {};
    const mr = new MediaRecorder(streamRef.current, options);
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || "video/webm" });
      setRecordedBlob(blob);
      const url = URL.createObjectURL(blob);
      playbackUrlRef.current = url;
      setStatus("preview");
      if (playbackRef.current) {
        playbackRef.current.src = url;
        playbackRef.current.load();
      }
    };
    mr.start(200);
    mediaRecorderRef.current = mr;
    setStatus("recording");
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { stopRecording(); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    stopTimer();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    stopStream();
  };

  const retake = () => {
    if (playbackRef.current) playbackRef.current.src = "";
    setRecordedBlob(null);
    setTimeLeft(60);
    startCamera();
  };

  if (status === "idle") {
    return (
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" size="sm" onClick={startCamera} className="gap-2" data-testid="button-start-camera">
          <Camera className="h-4 w-4" /> Open Camera
        </Button>
        <button type="button" onClick={onSkip} className="text-xs text-muted-foreground underline underline-offset-2 self-start hover:text-foreground" data-testid="button-skip-video">Skip video</button>
      </div>
    );
  }
  if (status === "requesting") return <p className="text-sm text-muted-foreground">Requesting camera access…</p>;
  if (status === "error") return (
    <div className="space-y-2">
      <p className="text-sm text-destructive">{cameraError}</p>
      <Button type="button" variant="outline" size="sm" onClick={startCamera}>Try Again</Button>
    </div>
  );

  return (
    <div className="space-y-3">
      {(status === "ready" || status === "recording") && (
        <video ref={liveVideoRef} className="w-full rounded-md bg-black aspect-video object-cover" autoPlay muted playsInline data-testid="video-live-preview" />
      )}
      {status === "preview" && (
        <video ref={playbackRef} className="w-full rounded-md bg-black aspect-video object-cover" controls data-testid="video-playback" />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {status === "ready" && (
          <Button type="button" size="sm" onClick={startRecording} className="gap-2" data-testid="button-record-start">
            <Video className="h-4 w-4" /> Record ({timeLeft}s max)
          </Button>
        )}
        {status === "recording" && (
          <Button type="button" size="sm" variant="destructive" onClick={stopRecording} className="gap-2" data-testid="button-record-stop">
            <Square className="h-3 w-3 fill-current" /> Stop ({timeLeft}s)
          </Button>
        )}
        {status === "preview" && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={retake} className="gap-2" data-testid="button-retake">
              <RefreshCw className="h-4 w-4" /> Retake
            </Button>
            <Button type="button" size="sm" onClick={() => recordedBlob && onRecorded(recordedBlob)} className="gap-2" data-testid="button-accept-video">
              <CheckCircle2 className="h-4 w-4" /> Use This Video
            </Button>
          </>
        )}
        {status !== "preview" && (
          <button type="button" onClick={onSkip} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" data-testid="button-skip-video-recording">Skip</button>
        )}
      </div>
    </div>
  );
}

// ─── Audio Recorder ───────────────────────────────────────────────────────────

function AudioRecorder({
  onRecorded,
  onSkip,
}: {
  onRecorded: (blob: Blob) => void;
  onSkip: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "requesting" | "ready" | "recording" | "preview" | "error">("idle");
  const [timeLeft, setTimeLeft] = useState(60);
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const playbackUrlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const stopStream = useCallback(() => {
    stopTimer();
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (playbackUrlRef.current) { URL.revokeObjectURL(playbackUrlRef.current); playbackUrlRef.current = null; }
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  const requestMic = async () => {
    setStatus("requesting");
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setStatus("ready");
      setTimeLeft(60);
      setElapsed(0);
    } catch {
      setMicError("Microphone access denied. Please allow microphone access and try again.");
      setStatus("error");
    }
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const options = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? { mimeType: "audio/webm;codecs=opus" }
      : MediaRecorder.isTypeSupported("audio/webm")
      ? { mimeType: "audio/webm" }
      : {};
    const mr = new MediaRecorder(streamRef.current, options);
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
      setRecordedBlob(blob);
      const url = URL.createObjectURL(blob);
      playbackUrlRef.current = url;
      setPlaybackUrl(url);
      setStatus("preview");
    };
    mr.start(200);
    mediaRecorderRef.current = mr;
    setStatus("recording");
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { stopRecording(); return 0; }
        return t - 1;
      });
      setElapsed((e) => e + 1);
    }, 1000);
  };

  const stopRecording = () => {
    stopTimer();
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    stopStream();
  };

  const retake = () => {
    setRecordedBlob(null);
    setPlaybackUrl(null);
    setTimeLeft(60);
    setElapsed(0);
    requestMic();
  };

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (status === "idle") {
    return (
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" size="sm" onClick={requestMic} className="gap-2" data-testid="button-start-mic">
          <Mic className="h-4 w-4" /> Record Audio Intro
        </Button>
        <button type="button" onClick={onSkip} className="text-xs text-muted-foreground underline underline-offset-2 self-start hover:text-foreground" data-testid="button-skip-audio">Skip audio</button>
      </div>
    );
  }
  if (status === "requesting") return <p className="text-sm text-muted-foreground">Requesting microphone access…</p>;
  if (status === "error") return (
    <div className="space-y-2">
      <p className="text-sm text-destructive">{micError}</p>
      <Button type="button" variant="outline" size="sm" onClick={requestMic}>Try Again</Button>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Waveform-style visualizer */}
      {status === "recording" && (
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-3">
          <div className="flex items-end gap-0.5 h-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="w-1 rounded-full bg-primary animate-pulse"
                style={{ height: `${30 + Math.sin(i * 0.9) * 50}%`, animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
          <span className="text-sm font-mono text-foreground ml-2">{fmtTime(elapsed)}</span>
          <span className="text-xs text-muted-foreground ml-auto">{timeLeft}s remaining</span>
        </div>
      )}

      {status === "preview" && playbackUrl && (
        <div className="rounded-md bg-muted/50 p-3">
          <audio src={playbackUrl} controls className="w-full" data-testid="audio-playback" />
        </div>
      )}

      {status === "ready" && (
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
          <Mic className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Microphone ready — up to 60 seconds</span>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {status === "ready" && (
          <Button type="button" size="sm" onClick={startRecording} className="gap-2" data-testid="button-audio-record-start">
            <Mic className="h-4 w-4" /> Start Recording
          </Button>
        )}
        {status === "recording" && (
          <Button type="button" size="sm" variant="destructive" onClick={stopRecording} className="gap-2" data-testid="button-audio-record-stop">
            <StopCircle className="h-4 w-4" /> Stop Recording
          </Button>
        )}
        {status === "preview" && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={retake} className="gap-2" data-testid="button-audio-retake">
              <RefreshCw className="h-4 w-4" /> Retake
            </Button>
            <Button type="button" size="sm" onClick={() => recordedBlob && onRecorded(recordedBlob)} className="gap-2" data-testid="button-accept-audio">
              <CheckCircle2 className="h-4 w-4" /> Use This Recording
            </Button>
          </>
        )}
        {status !== "preview" && (
          <button type="button" onClick={onSkip} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" data-testid="button-skip-audio-recording">Skip</button>
        )}
      </div>
    </div>
  );
}

// ─── Main Apply Component ─────────────────────────────────────────────────────

export default function Apply() {
  const { requisitionId } = useParams<{ requisitionId: string }>();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedPath, setSelectedPath] = useState<IntakePath | null>(null);
  // Video state
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const [videoAccepted, setVideoAccepted] = useState(false);
  // Audio state
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [audioAccepted, setAudioAccepted] = useState(false);
  // Quick call
  const [requestedQuickCall, setRequestedQuickCall] = useState(false);

  const { data: requisition, isLoading, error } = useQuery<any>({
    queryKey: ["/api/public/jobs", requisitionId],
    enabled: !!requisitionId,
    queryFn: async () => {
      const res = await fetch(`/api/public/jobs/${requisitionId}`, { credentials: "include" });
      if (res.status === 503) {
        const body = await res.json();
        if (body.isPaused) { setIsPaused(true); return null; }
      }
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
  });

  const form = useForm<ApplyFormValues>({
    resolver: zodResolver(applyFormSchema),
    defaultValues: { firstName: "", lastName: "", email: "", phone: "", coverLetter: "" },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: ApplyFormValues) => {
      // 1. Submit application
      const response = await apiRequest("POST", `/api/public/jobs/${requisitionId}/apply`, {
        ...data,
        intakePath: selectedPath || "standard",
        requestedQuickCall,
      });
      const result = await response.json();

      // 2. Upload video if accepted
      if (result.applicationId && recordedVideoBlob && videoAccepted) {
        try {
          const formData = new FormData();
          formData.append("video", recordedVideoBlob, "intro.webm");
          await fetch(`/api/public/applications/${result.applicationId}/intro-video`, {
            method: "POST",
            body: formData,
          });
        } catch {
          console.warn("Video upload failed; application already saved.");
        }
      }

      // 3. Upload audio if accepted
      if (result.applicationId && recordedAudioBlob && audioAccepted) {
        try {
          const formData = new FormData();
          formData.append("audio", recordedAudioBlob, "intro.webm");
          await fetch(`/api/public/applications/${result.applicationId}/intro-audio`, {
            method: "POST",
            body: formData,
          });
        } catch {
          console.warn("Audio upload failed; application already saved.");
        }
      }

      return result;
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Application Submitted",
        description: "Thank you for applying! We'll review your application and contact you if there's a match.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.message || "There was an error submitting your application. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ApplyFormValues) => submitMutation.mutate({ ...data, phone: cleanPhone(data.phone) });

  const resetMediaState = () => {
    setRecordedVideoBlob(null);
    setVideoAccepted(false);
    setRecordedAudioBlob(null);
    setAudioAccepted(false);
    setRequestedQuickCall(false);
  };

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Paused ──
  if (isPaused) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <CardTitle>Applications Temporarily Paused</CardTitle>
            <CardDescription>We're not accepting new applications right now. Please check back later.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // ── Not Found ──
  if (error || !requisition) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <CardTitle>Job Not Found</CardTitle>
            <CardDescription>This job posting may have been removed or the link is invalid.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // ── Success ──
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <div className="flex justify-center mb-2">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            </div>
            <CardTitle>Application Submitted!</CardTitle>
            <CardDescription>
              Thank you for applying to <strong>{requisition.title}</strong>. We'll review your application and reach out if there's a match.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {videoAccepted && (
              <p className="text-sm text-muted-foreground">Your video intro has been uploaded and will be reviewed by the hiring team.</p>
            )}
            {audioAccepted && (
              <p className="text-sm text-muted-foreground">Your audio intro has been uploaded and will be reviewed by the hiring team.</p>
            )}
            {requestedQuickCall && (
              <p className="text-sm text-muted-foreground mt-2">A recruiter will reach out to schedule a quick call with you.</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main Layout ──
  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-5xl mx-auto grid gap-8 lg:grid-cols-5">

        {/* Left: Job Details */}
        <div className="lg:col-span-3 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{requisition.title}</h1>
            <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
              {requisition.market && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {requisition.market}
                </span>
              )}
              {requisition.employmentType && (
                <span className="flex items-center gap-1">
                  <Briefcase className="h-4 w-4" />
                  {requisition.employmentType}
                </span>
              )}
              {requisition.shift && (
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {requisition.shift}
                </span>
              )}
              {(requisition.payMin || requisition.payMax) && (
                <span className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />
                  {requisition.payMin && requisition.payMax
                    ? `$${requisition.payMin}–$${requisition.payMax}/hr`
                    : requisition.payMin
                    ? `From $${requisition.payMin}/hr`
                    : `Up to $${requisition.payMax}/hr`}
                </span>
              )}
            </div>
          </div>

          {requisition.description && (
            <section>
              <h2 className="text-lg font-semibold mb-3">About the Role</h2>
              <div className="prose prose-sm text-muted-foreground whitespace-pre-wrap">
                {requisition.description}
              </div>
            </section>
          )}

          {requisition.requirements && (
            <section>
              <h2 className="text-lg font-semibold mb-3">Requirements</h2>
              <div className="prose prose-sm text-muted-foreground whitespace-pre-wrap">
                {requisition.requirements}
              </div>
            </section>
          )}
        </div>

        {/* Right: Application Panel */}
        <div className="lg:col-span-2 space-y-4">

          {/* ── Step 1: Path Selection ── */}
          {!selectedPath && (
            <Card>
              <CardHeader>
                <CardTitle>How would you like to apply?</CardTitle>
                <CardDescription>Choose the option that works best for you.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Standard */}
                <button
                  type="button"
                  onClick={() => setSelectedPath("standard")}
                  className="w-full text-left rounded-md border p-4 hover-elevate transition-colors"
                  data-testid="button-path-standard"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Briefcase className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">Standard Application</p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Submit your contact info and availability
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </button>

                {/* Audio Intro */}
                <button
                  type="button"
                  onClick={() => setSelectedPath("audio_optional")}
                  className="w-full text-left rounded-md border p-4 hover-elevate transition-colors"
                  data-testid="button-path-audio-optional"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Mic className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground flex items-center gap-2 flex-wrap">
                          Standard Application + Audio Intro
                          <Badge variant="secondary" className="text-xs">Optional</Badge>
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Record a quick 60-second audio intro — no camera required
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </button>

                {/* Video Intro */}
                <button
                  type="button"
                  onClick={() => setSelectedPath("video_optional")}
                  className="w-full text-left rounded-md border p-4 hover-elevate transition-colors"
                  data-testid="button-path-video-optional"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Camera className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground flex items-center gap-2 flex-wrap">
                          Standard Application + Video Intro
                          <Badge variant="secondary" className="text-xs">Optional</Badge>
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Record a quick 60-second video intro to stand out
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </button>
              </CardContent>
            </Card>
          )}

          {/* ── Step 2: Application Form ── */}
          {selectedPath && (
            <>
              <Card className="sticky top-4">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle>Apply Now</CardTitle>
                    <button
                      type="button"
                      onClick={() => { setSelectedPath(null); resetMediaState(); }}
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      data-testid="button-change-path"
                    >
                      Change
                    </button>
                  </div>
                  <CardDescription>
                    {selectedPath === "video_optional"
                      ? "Fill out the form and optionally record a 60-second video intro."
                      : selectedPath === "audio_optional"
                      ? "Fill out the form and optionally record a 60-second audio intro."
                      : "Fill out the form below to submit your application."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel required>First Name</FormLabel>
                              <FormControl>
                                <Input placeholder="John" {...field} data-testid="input-first-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel required>Last Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Doe" {...field} data-testid="input-last-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="john.doe@example.com" {...field} data-testid="input-email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>Phone</FormLabel>
                            <FormControl>
                              <PhoneInput {...field} data-testid="input-phone" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="coverLetter"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Why are you interested?</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Tell us why you'd be a great fit..."
                                className="min-h-[90px]"
                                {...field}
                                data-testid="input-cover-letter"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* ── Audio Section ── */}
                      {selectedPath === "audio_optional" && (
                        <div className="rounded-md border p-4 space-y-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="text-sm font-medium text-foreground flex items-center gap-2">
                              <Mic className="h-4 w-4 text-primary" />
                              Audio Intro
                            </p>
                            <Badge variant="secondary" className="text-xs">Optional</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Record a short audio introduction — no camera needed. You can skip this and still apply.
                          </p>

                          {!audioAccepted ? (
                            <AudioRecorder
                              onRecorded={(blob) => {
                                setRecordedAudioBlob(blob);
                                setAudioAccepted(true);
                              }}
                              onSkip={() => {
                                setRecordedAudioBlob(null);
                                setAudioAccepted(false);
                              }}
                            />
                          ) : (
                            <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
                              <div className="flex items-center gap-2 text-sm">
                                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                <span className="font-medium">Audio recorded</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => { setRecordedAudioBlob(null); setAudioAccepted(false); }}
                                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                                data-testid="button-remove-audio"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── Video Section ── */}
                      {selectedPath === "video_optional" && (
                        <div className="rounded-md border p-4 space-y-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="text-sm font-medium text-foreground">Video Intro</p>
                            <Badge variant="secondary" className="text-xs">Optional</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Record a quick 60-second intro to help us review your application faster. You can skip this and still apply.
                          </p>

                          {!videoAccepted ? (
                            <VideoRecorder
                              onRecorded={(blob) => {
                                setRecordedVideoBlob(blob);
                                setVideoAccepted(true);
                              }}
                              onSkip={() => {
                                setRecordedVideoBlob(null);
                                setVideoAccepted(false);
                              }}
                            />
                          ) : (
                            <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
                              <div className="flex items-center gap-2 text-sm">
                                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                <span className="font-medium">Video recorded</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => { setRecordedVideoBlob(null); setVideoAccepted(false); }}
                                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                                data-testid="button-remove-video"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── Quick Call Request ── */}
                      <button
                        type="button"
                        onClick={() => setRequestedQuickCall((v) => !v)}
                        className={`w-full text-left rounded-md border p-3 transition-colors ${
                          requestedQuickCall
                            ? "border-primary/50 bg-primary/5"
                            : "hover-elevate"
                        }`}
                        data-testid="button-toggle-quick-call"
                        aria-pressed={requestedQuickCall}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            requestedQuickCall ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"
                          }`}>
                            {requestedQuickCall && (
                              <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
                                <polyline points="1,6 4.5,9.5 11,2" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground leading-tight">
                              {selectedPath === "video_optional"
                                ? "Prefer not to record a video? Request a quick call."
                                : selectedPath === "audio_optional"
                                ? "Prefer not to record audio? Request a quick call."
                                : "I'd prefer a quick call from a recruiter."}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              We'll reach out to learn more about you — no recording required.
                            </p>
                          </div>
                        </div>
                      </button>

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={submitMutation.isPending}
                        data-testid="button-submit-application"
                      >
                        {submitMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {(recordedVideoBlob && videoAccepted) || (recordedAudioBlob && audioAccepted)
                              ? "Submitting & uploading…"
                              : "Submitting…"}
                          </>
                        ) : (
                          "Submit Application"
                        )}
                      </Button>

                      {selectedPath === "video_optional" && !videoAccepted && !requestedQuickCall && (
                        <p className="text-xs text-center text-muted-foreground">
                          No video? No problem — you can submit without one.
                        </p>
                      )}
                      {selectedPath === "audio_optional" && !audioAccepted && !requestedQuickCall && (
                        <p className="text-xs text-center text-muted-foreground">
                          No audio? No problem — you can submit without one.
                        </p>
                      )}
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
