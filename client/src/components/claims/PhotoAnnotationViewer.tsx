import { useState, useCallback, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Download, X, ChevronLeft, ChevronRight,
  Circle, ArrowRight, Pen, Type, Undo2, Trash2, Save, Film,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const CATEGORY_LABELS_INLINE: Record<string, string> = {
  uncategorized: "Uncategorized", scene_photos: "Scene Photos",
  vehicle_damage_photos: "Vehicle Damage Photos", driver_photos: "Driver Photos",
  video_photos: "Video / Photos", video: "Video", police_report: "Police Report",
  driver_statement: "Driver Statement", repair_estimate: "Repair Estimate",
  invoice_receipt: "Invoice / Receipt", insurance_form: "Insurance Form",
  other_documents: "Other Documents", general: "General",
};

// ── Annotation types ──────────────────────────────────────────────────────────

export type AnnotationTool = "circle" | "arrow" | "draw" | "text";

interface CircleAnnotation { id: string; type: "circle"; color: string; cx: number; cy: number; rx: number; ry: number; }
interface ArrowAnnotation  { id: string; type: "arrow";  color: string; x1: number; y1: number; x2: number; y2: number; }
interface DrawAnnotation   { id: string; type: "draw";   color: string; strokeWidth: number; points: [number, number][]; }
interface TextAnnotation   { id: string; type: "text";   color: string; x: number; y: number; text: string; }

export type AnnotationShape = CircleAnnotation | ArrowAnnotation | DrawAnnotation | TextAnnotation;

// ── Canvas helpers ────────────────────────────────────────────────────────────

type ImgRect = { x: number; y: number; w: number; h: number };

function getImgRect(canvas: HTMLCanvasElement, img: HTMLImageElement): ImgRect {
  const cw = canvas.width, ch = canvas.height;
  const iw = img.naturalWidth || cw, ih = img.naturalHeight || ch;
  const scale = Math.min(cw / iw, ch / ih);
  const w = iw * scale, h = ih * scale;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

function drawArrowShape(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  const headLen = 14;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function drawShape(ctx: CanvasRenderingContext2D, shape: AnnotationShape, ir: ImgRect) {
  switch (shape.type) {
    case "circle": {
      const cx = ir.x + shape.cx * ir.w, cy = ir.y + shape.cy * ir.h;
      const rx = Math.abs(shape.rx * ir.w), ry = Math.abs(shape.ry * ir.h);
      ctx.strokeStyle = shape.color; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(rx, 2), Math.max(ry, 2), 0, 0, 2 * Math.PI);
      ctx.stroke();
      break;
    }
    case "arrow":
      drawArrowShape(ctx,
        ir.x + shape.x1 * ir.w, ir.y + shape.y1 * ir.h,
        ir.x + shape.x2 * ir.w, ir.y + shape.y2 * ir.h,
        shape.color,
      );
      break;
    case "draw": {
      if (shape.points.length < 2) break;
      ctx.strokeStyle = shape.color; ctx.lineWidth = shape.strokeWidth;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      const [fx, fy] = shape.points[0];
      ctx.moveTo(ir.x + fx * ir.w, ir.y + fy * ir.h);
      for (let i = 1; i < shape.points.length; i++) {
        const [px, py] = shape.points[i];
        ctx.lineTo(ir.x + px * ir.w, ir.y + py * ir.h);
      }
      ctx.stroke();
      break;
    }
    case "text": {
      const tx = ir.x + shape.x * ir.w, ty = ir.y + shape.y * ir.h;
      ctx.font = "bold 14px sans-serif";
      const p = 3, m = ctx.measureText(shape.text);
      ctx.fillStyle = "rgba(0,0,0,0.78)";
      ctx.fillRect(tx - p, ty - 16 - p, m.width + p * 2, 22 + p * 2);
      ctx.fillStyle = shape.color;
      ctx.fillText(shape.text, tx, ty);
      break;
    }
  }
}

// ── Image URL helper ──────────────────────────────────────────────────────────

function getImageUrl(photo: any): string | null {
  if (photo?.fileUrl?.startsWith("data:")) return photo.fileUrl;
  if (photo?.attachmentDocumentId) return `/api/documents/${photo.attachmentDocumentId}/download`;
  if (!photo?.fileUrl) return null; // stripped legacy base64 — caller must fetch on-demand
  const raw = (photo.fileUrl as string).replace(/^\//, "");
  return raw.startsWith("objects/") ? `/${raw}` : `/objects/${raw}`;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

// ── Color palette ─────────────────────────────────────────────────────────────

const PALETTE = [
  { value: "#ef4444", label: "Red"    },
  { value: "#f97316", label: "Orange" },
  { value: "#fbbf24", label: "Yellow" },
  { value: "#22c55e", label: "Green"  },
  { value: "#3b82f6", label: "Blue"   },
  { value: "#ffffff", label: "White"  },
];

const TOOLS: { id: AnnotationTool; Icon: React.FC<React.SVGProps<SVGSVGElement>>; label: string }[] = [
  { id: "circle", Icon: Circle,      label: "Circle — mark a damage area"     },
  { id: "arrow",  Icon: ArrowRight,  label: "Arrow — point to damage location" },
  { id: "draw",   Icon: Pen,         label: "Freehand draw"                    },
  { id: "text",   Icon: Type,        label: "Add text note"                    },
];

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PhotoAnnotationViewerProps {
  photos: any[];
  currentIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  isReadOnly?: boolean;
  onSaveAnnotations?: (attachmentId: string, annotationsJson: string) => Promise<void>;
  accidentId?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PhotoAnnotationViewer({
  photos,
  currentIndex,
  onClose,
  onNext,
  onPrev,
  isReadOnly,
  onSaveAnnotations,
  accidentId,
}: PhotoAnnotationViewerProps) {
  const { toast } = useToast();
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement | null>(null);
  const isDrawing    = useRef(false);
  const startPos     = useRef<[number, number]>([0, 0]);
  const livePoints   = useRef<[number, number][]>([]);
  const liveShape    = useRef<AnnotationShape | null>(null);

  const [imgLoaded,    setImgLoaded]    = useState(false);
  const [downloading,  setDownloading]  = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [annotations,  setAnnotations]  = useState<AnnotationShape[]>([]);
  const [isDirty,      setIsDirty]      = useState(false);
  const [activeTool,   setActiveTool]   = useState<AnnotationTool | null>(null);
  const [color,        setColor]        = useState("#ef4444");
  const [textInput, setTextInput] = useState<{
    visible: boolean; cssX: number; cssY: number; relX: number; relY: number; value: string;
  }>({ visible: false, cssX: 0, cssY: 0, relX: 0, relY: 0, value: "" });

  const photo   = photos[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast  = currentIndex === photos.length - 1;
  const catLabel  = CATEGORY_LABELS_INLINE[photo?.category] || photo?.category || "";
  const uploadDate = photo?.createdAt ? format(new Date(photo.createdAt), "MMM d, yyyy") : "";

  // Load annotations from photo when photo changes
  useEffect(() => {
    let parsed: AnnotationShape[] = [];
    if (photo?.annotations) {
      try { parsed = JSON.parse(photo.annotations); } catch { /* ignore */ }
    }
    setAnnotations(parsed);
    setIsDirty(false);
    liveShape.current = null;
    setTextInput(s => ({ ...s, visible: false }));
  }, [photo?.id, currentIndex]);

  // Draw canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img || !img.complete || !img.naturalWidth) return;

    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const ir = getImgRect(canvas, img);
    ctx.drawImage(img, ir.x, ir.y, ir.w, ir.h);
    for (const s of annotations) drawShape(ctx, s, ir);
    if (liveShape.current) drawShape(ctx, liveShape.current, ir);
  }, [annotations]);

  useEffect(() => { redraw(); }, [redraw, imgLoaded]);

  // ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(redraw);
    ro.observe(container);
    return () => ro.disconnect();
  }, [redraw]);

  const isCurrentVideo = !!(photo?.fileType?.startsWith("video/"));

  // Load image — fetches URL on-demand when fileUrl was stripped (legacy base64)
  // For video files, skip the canvas image loading entirely.
  useEffect(() => {
    if (isCurrentVideo) {
      setImgLoaded(true); // nothing to draw on canvas for videos
      return;
    }

    setImgLoaded(false);
    let cancelled = false;

    const loadImg = (src: string) => {
      if (cancelled) return;
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload  = () => { if (!cancelled) { imgRef.current = img; setImgLoaded(true); } };
      img.onerror = () => { if (!cancelled) { imgRef.current = img; setImgLoaded(true); } };
      img.src = src;
    };

    const src = getImageUrl(photo);
    if (src !== null) {
      loadImg(src);
    } else if (accidentId && photo?.id) {
      // fileUrl was stripped — fetch on-demand from URL endpoint
      fetch(`/api/corporate/accidents/${accidentId}/attachments/${photo.id}/url`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (!cancelled && data?.fileUrl) loadImg(data.fileUrl); })
        .catch(() => { if (!cancelled) setImgLoaded(true); });
    } else {
      setImgLoaded(true); // nothing to load
    }

    return () => { cancelled = true; };
  }, [photo?.id, currentIndex, accidentId, isCurrentVideo]);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && !textInput.visible) { setIsDirty(false); setImgLoaded(false); onNext(); }
      else if (e.key === "ArrowLeft" && !textInput.visible) { setIsDirty(false); setImgLoaded(false); onPrev(); }
      else if (e.key === "Escape") {
        if (textInput.visible) { setTextInput(s => ({ ...s, visible: false })); return; }
        if (activeTool) { setActiveTool(null); return; }
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        setAnnotations(prev => prev.slice(0, -1));
        setIsDirty(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [activeTool, textInput.visible, onNext, onPrev, onClose]);

  // ── Canvas position helpers ─────────────────────────────────────────────────

  const getRelPos = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
    const canvas = canvasRef.current!;
    const img    = imgRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top)  * scaleY;
    const ir = getImgRect(canvas, img);
    return [(cx - ir.x) / ir.w, (cy - ir.y) / ir.h];
  };

  const getCssPos = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  // ── Mouse handlers ──────────────────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeTool || isReadOnly) return;
    if (activeTool === "text") {
      if (!canvasRef.current) return;
      const [cssX, cssY] = getCssPos(e);
      let relX = 0.5, relY = 0.5;
      if (imgRef.current && imgRef.current.naturalWidth) {
        [relX, relY] = getRelPos(e);
      } else {
        const rect = canvasRef.current.getBoundingClientRect();
        relX = (e.clientX - rect.left) / rect.width;
        relY = (e.clientY - rect.top)  / rect.height;
      }
      setTextInput({ visible: true, cssX, cssY: cssY - 30, relX, relY, value: "" });
      return;
    }
    isDrawing.current = true;
    const pos = getRelPos(e);
    startPos.current  = pos;
    livePoints.current = [pos];
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !activeTool) return;
    const [rx, ry] = getRelPos(e);
    const [sx, sy] = startPos.current;
    if (activeTool === "circle") {
      liveShape.current = { id: "live", type: "circle", color, cx: sx, cy: sy, rx: rx - sx, ry: ry - sy };
    } else if (activeTool === "arrow") {
      liveShape.current = { id: "live", type: "arrow", color, x1: sx, y1: sy, x2: rx, y2: ry };
    } else if (activeTool === "draw") {
      livePoints.current = [...livePoints.current, [rx, ry]];
      liveShape.current  = { id: "live", type: "draw", color, strokeWidth: 3, points: [...livePoints.current] };
    }
    redraw();
  };

  const handleMouseUp = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const shape = liveShape.current;
    liveShape.current = null;
    if (shape && shape.id === "live") {
      const finalized = { ...shape, id: uid() } as AnnotationShape;
      setAnnotations(prev => [...prev, finalized]);
      setIsDirty(true);
    }
    redraw();
  };

  // ── Text confirm ────────────────────────────────────────────────────────────

  const handleTextConfirm = () => {
    if (!textInput.value.trim()) { setTextInput(s => ({ ...s, visible: false })); return; }
    const shape: TextAnnotation = {
      id: uid(), type: "text", color,
      x: textInput.relX, y: textInput.relY,
      text: textInput.value.trim(),
    };
    setAnnotations(prev => [...prev, shape]);
    setIsDirty(true);
    setTextInput(s => ({ ...s, visible: false, value: "" }));
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!onSaveAnnotations || !photo) return;
    setSaving(true);
    try {
      await onSaveAnnotations(photo.id, JSON.stringify(annotations));
      setIsDirty(false);
      toast({ title: "Annotations saved", description: `${annotations.length} markup${annotations.length !== 1 ? "s" : ""} saved.` });
    } catch {
      toast({ title: "Save failed", description: "Could not save annotations. Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Download ────────────────────────────────────────────────────────────────

  const handleDownload = async () => {
    setDownloading(true);
    try {
      let src = getImageUrl(photo);
      // Fetch on-demand for legacy base64 photos with stripped fileUrl
      if (src === null && accidentId && photo?.id) {
        const res = await fetch(`/api/corporate/accidents/${accidentId}/attachments/${photo.id}/url`, { credentials: "include" });
        if (res.ok) { const d = await res.json(); src = d.fileUrl || null; }
      }
      if (!src) {
        toast({ title: "Download failed", description: "File URL could not be resolved.", variant: "destructive" });
        return;
      }
      if (src.startsWith("data:")) {
        const a = document.createElement("a"); a.href = src; a.download = photo.fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        return;
      }
      const resp = await fetch(src, { credentials: "include" });
      if (resp.ok) {
        const blob = await resp.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a"); a.href = url; a.download = photo.fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      } else {
        toast({ title: "Download failed", description: "Could not retrieve file.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Download failed", description: "A network error occurred.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const cursorStyle: React.CSSProperties = {
    cursor: activeTool && !isReadOnly ? (activeTool === "text" ? "text" : "crosshair") : "default",
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-[96vw] w-full p-0 overflow-hidden bg-background border-border"
        style={{ maxHeight: "96vh", height: "96vh" }}
        data-testid="photo-annotation-viewer"
      >
        <div className="flex flex-col h-full">

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 shrink-0 gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Badge variant="secondary" className="shrink-0 text-xs">
                {currentIndex + 1} / {photos.length}
              </Badge>
              <span className="text-sm font-medium truncate" data-testid="annotation-viewer-filename">
                {photo?.fileName}
              </span>
              {catLabel && (
                <Badge variant="outline" className="text-xs font-normal shrink-0 hidden sm:block">
                  {catLabel}
                </Badge>
              )}
              {uploadDate && (
                <span className="text-xs text-muted-foreground shrink-0 hidden md:block">{uploadDate}</span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="icon" variant="ghost" onClick={handleDownload} disabled={downloading}
                title="Download original (annotations not included)"
                data-testid="button-annotation-download"
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              </Button>
              <Separator orientation="vertical" className="h-5 mx-0.5" />
              <Button size="icon" variant="ghost" onClick={() => { setIsDirty(false); setImgLoaded(false); onPrev(); }} disabled={isFirst} title="Previous (←)" data-testid="button-annotation-prev">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => { setIsDirty(false); setImgLoaded(false); onNext(); }} disabled={isLast} title="Next (→)" data-testid="button-annotation-next">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Separator orientation="vertical" className="h-5 mx-0.5" />
              <Button size="icon" variant="ghost" onClick={onClose} title="Close (Esc)" data-testid="button-annotation-close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* ── Canvas / Video area ──────────────────────────────────────────── */}
          <div ref={containerRef} className="flex-1 relative min-h-0 bg-[#111] overflow-hidden">
            {!imgLoaded && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Video player — shown instead of canvas for video attachments */}
            {isCurrentVideo ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
                {(() => {
                  const videoSrc = getImageUrl(photo);
                  if (!videoSrc) {
                    return (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Film className="h-10 w-10" />
                        <span className="text-sm">Video could not be loaded</span>
                      </div>
                    );
                  }
                  return (
                    <video
                      key={photo?.id}
                      src={videoSrc}
                      controls
                      playsInline
                      className="max-w-full max-h-full rounded-md"
                      style={{ maxHeight: "calc(100% - 1rem)" }}
                      data-testid="annotation-video-player"
                    />
                  );
                })()}
              </div>
            ) : (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={cursorStyle}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              data-testid="annotation-canvas"
            />
            )}

            {/* Text input overlay — explicit confirm/cancel so blur from the triggering
                mouseup never auto-dismisses the input before the user can type */}
            {textInput.visible && (
              <div
                style={{
                  position: "absolute",
                  left: Math.min(textInput.cssX, (canvasRef.current?.offsetWidth ?? 600) - 210),
                  top: Math.max(0, textInput.cssY - 4),
                  zIndex: 30,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <input
                  autoFocus
                  type="text"
                  value={textInput.value}
                  onChange={(e) => setTextInput(s => ({ ...s, value: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleTextConfirm(); }
                    if (e.key === "Escape") setTextInput(s => ({ ...s, visible: false, value: "" }));
                  }}
                  style={{
                    background: "rgba(0,0,0,0.85)",
                    color: color,
                    border: "1px solid rgba(255,255,255,0.4)",
                    borderRadius: 4,
                    padding: "4px 8px",
                    fontSize: 14,
                    fontWeight: "bold",
                    outline: "none",
                    minWidth: 200,
                    width: 200,
                  }}
                  placeholder="Type note, press Enter"
                  data-testid="input-annotation-text"
                />
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    onClick={handleTextConfirm}
                    disabled={!textInput.value.trim()}
                    style={{
                      flex: 1,
                      background: textInput.value.trim() ? "#22c55e" : "rgba(255,255,255,0.15)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 4,
                      padding: "3px 0",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: textInput.value.trim() ? "pointer" : "default",
                    }}
                    data-testid="button-annotation-text-confirm"
                  >
                    Add Note
                  </button>
                  <button
                    type="button"
                    onClick={() => setTextInput(s => ({ ...s, visible: false, value: "" }))}
                    style={{
                      background: "rgba(255,255,255,0.15)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 4,
                      padding: "3px 10px",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                    data-testid="button-annotation-text-cancel"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Markup count badge */}
            {annotations.length > 0 && (
              <div className="absolute top-2 right-2 pointer-events-none z-10">
                <Badge variant="secondary" className="text-xs opacity-80">
                  {annotations.length} markup{annotations.length !== 1 ? "s" : ""}
                </Badge>
              </div>
            )}

            {/* Tool hint */}
            {activeTool && !isReadOnly && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none z-10">
                <div className="bg-black/70 text-white text-xs px-3 py-1.5 rounded-md">
                  {activeTool === "circle" && "Click and drag to draw a circle"}
                  {activeTool === "arrow"  && "Click and drag to draw an arrow"}
                  {activeTool === "draw"   && "Hold and drag to draw freehand"}
                  {activeTool === "text"   && "Click on the image to place a text note"}
                </div>
              </div>
            )}
          </div>

          {/* ── Annotation toolbar — hidden for video files ──────────────────── */}
          {!isReadOnly && !isCurrentVideo && (
            <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/20 shrink-0 flex-wrap">
              {/* Tools */}
              <div className="flex items-center gap-1" role="group" aria-label="Annotation tools">
                {TOOLS.map(({ id, Icon, label }) => (
                  <Button
                    key={id}
                    size="icon"
                    variant={activeTool === id ? "default" : "ghost"}
                    onClick={() => setActiveTool(prev => prev === id ? null : id)}
                    title={label}
                    data-testid={`button-annotation-tool-${id}`}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                ))}
              </div>

              <Separator orientation="vertical" className="h-6" />

              {/* Color swatches */}
              <div className="flex items-center gap-1.5" role="group" aria-label="Color palette">
                {PALETTE.map(({ value, label }) => (
                  <button
                    key={value}
                    title={`${label} — current color`}
                    onClick={() => setColor(value)}
                    data-testid={`button-annotation-color-${label.toLowerCase()}`}
                    style={{ background: value }}
                    className={`h-5 w-5 rounded-full border-2 transition-transform ${
                      color === value ? "border-foreground scale-125" : "border-border/50"
                    }`}
                  />
                ))}
              </div>

              <Separator orientation="vertical" className="h-6" />

              {/* Undo / Clear */}
              <Button
                size="icon" variant="ghost"
                onClick={() => { setAnnotations(prev => prev.slice(0, -1)); setIsDirty(true); }}
                disabled={annotations.length === 0}
                title="Undo last markup (Ctrl+Z)"
                data-testid="button-annotation-undo"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                size="icon" variant="ghost"
                onClick={() => { setAnnotations([]); setIsDirty(true); }}
                disabled={annotations.length === 0}
                title="Clear all markups"
                data-testid="button-annotation-clear"
              >
                <Trash2 className="h-4 w-4" />
              </Button>

              <div className="flex-1" />

              {/* Save section */}
              {onSaveAnnotations && (
                <div className="flex items-center gap-2">
                  {isDirty ? (
                    <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>
                  ) : annotations.length > 0 ? (
                    <span className="text-xs text-muted-foreground">All markups saved</span>
                  ) : null}
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving || !isDirty}
                    data-testid="button-annotation-save"
                  >
                    {saving
                      ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      : <Save className="h-3.5 w-3.5 mr-1.5" />}
                    {saving ? "Saving…" : "Save Markups"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Read-only annotations notice ──────────────────────────────────── */}
          {isReadOnly && annotations.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/20 shrink-0">
              <Badge variant="secondary" className="text-xs">
                {annotations.length} markup{annotations.length !== 1 ? "s" : ""}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Saved annotations are shown on this photo
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
