import { useState, useRef, useCallback, useEffect } from "react";
import {
  FileText, Download, X, Info, ZoomIn, ZoomOut, Maximize2, Expand,
  ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import * as pdfjsLib from "pdfjs-dist";

// Configure worker once at module level
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocPreviewLinkProps {
  documentId: string;
  fileName: string;
  mimeType?: string | null;
  className?: string;
  testId?: string;
}

type ViewerMode = "pdf" | "image" | "text" | "csv" | "unsupported" | "idle";

// ── MIME helpers ──────────────────────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  zip: "application/zip",
};

function guessMime(fileName: string): string | null {
  return MIME_MAP[fileName.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

function isOfficeMime(mime: string, filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    mime.includes("spreadsheet") || mime.includes("excel") ||
    mime.includes("wordprocessing") || mime.includes("msword") ||
    mime.includes("presentation") || mime.includes("powerpoint") ||
    lower.endsWith(".xlsx") || lower.endsWith(".xls") ||
    lower.endsWith(".docx") || lower.endsWith(".doc") ||
    lower.endsWith(".pptx") || lower.endsWith(".ppt")
  );
}

function parseCSV(text: string): string[][] {
  return text.trim().split("\n")
    .map(row => row.split(",").map(cell => cell.trim().replace(/^"(.*)"$/, "$1")));
}

const OFFICE_ONLINE_BASE = "https://view.officeapps.live.com/op/view.aspx?src=";

// ── PDF canvas renderer hook ──────────────────────────────────────────────────

function usePdfRenderer(pdfDoc: pdfjsLib.PDFDocumentProxy | null, pageNum: number, scale: number) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;

    const render = async () => {
      const page = await pdfDoc.getPage(pageNum);
      if (cancelled) return;

      // Cancel any in-flight render
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }

      const baseViewport = page.getViewport({ scale: 1 });
      const finalViewport = page.getViewport({ scale });
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      canvas.width = finalViewport.width;
      canvas.height = finalViewport.height;

      const task = page.render({ canvasContext: ctx, viewport: finalViewport });
      renderTaskRef.current = task;
      try { await task.promise; } catch {}
    };

    render();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum, scale]);

  return canvasRef;
}

// ── Thumbnail sidebar ─────────────────────────────────────────────────────────

interface ThumbnailSidebarProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  currentPage: number;
  onPageSelect: (page: number) => void;
}

function ThumbnailSidebar({ pdfDoc, currentPage, onPageSelect }: ThumbnailSidebarProps) {
  const [thumbs, setThumbs] = useState<string[]>([]);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Render all thumbnails sequentially in the background
  useEffect(() => {
    let cancelled = false;
    const results: string[] = new Array(pdfDoc.numPages).fill("");

    const renderAll = async () => {
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        if (cancelled) break;
        try {
          const page = await pdfDoc.getPage(p);
          const viewport = page.getViewport({ scale: 0.25 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const task = page.render({ canvasContext: canvas.getContext("2d")!, viewport });
          await task.promise;
          if (!cancelled) {
            results[p - 1] = canvas.toDataURL();
            setThumbs([...results]);
          }
        } catch {}
      }
    };

    renderAll();
    return () => { cancelled = true; };
  }, [pdfDoc]);

  // Scroll active thumb into view
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentPage]);

  return (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden py-2 gap-2 px-2">
      {Array.from({ length: pdfDoc.numPages }, (_, i) => {
        const pageNum = i + 1;
        const isActive = pageNum === currentPage;
        return (
          <button
            key={pageNum}
            ref={isActive ? activeRef : undefined}
            onClick={() => onPageSelect(pageNum)}
            className={`flex flex-col items-center gap-1 rounded-md p-1.5 transition-colors w-full
              ${isActive ? "bg-primary/15 ring-1 ring-primary/40" : "hover:bg-muted"}`}
            data-testid={`button-pdf-thumb-${pageNum}`}
          >
            <div className="w-full rounded overflow-hidden bg-white border border-border shadow-sm flex items-center justify-center"
              style={{ minHeight: 80 }}>
              {thumbs[i] ? (
                <img src={thumbs[i]} alt={`Page ${pageNum}`} className="w-full h-auto block" />
              ) : (
                <div className="flex items-center justify-center h-20 w-full">
                  <span className="h-4 w-4 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin block" />
                </div>
              )}
            </div>
            <span className={`text-[10px] tabular-nums ${isActive ? "text-primary font-medium" : "text-muted-foreground"}`}>
              {pageNum}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── PDF viewer ────────────────────────────────────────────────────────────────

interface PdfViewerProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  currentPage: number;
  scale: number;
  sidebarOpen: boolean;
  onPageChange: (page: number) => void;
  onSidebarToggle: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onActualSize: () => void;
  zoomPct: number;
}

function PdfViewer({
  pdfDoc, currentPage, scale, sidebarOpen,
  onPageChange, onSidebarToggle,
  onZoomIn, onZoomOut, onFit, onActualSize,
  zoomPct,
}: PdfViewerProps) {
  const canvasRef = usePdfRenderer(pdfDoc, currentPage, scale);
  const numPages = pdfDoc.numPages;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Thumbnail sidebar */}
      {sidebarOpen && (
        <div
          className="bg-muted/50 border-r border-border overflow-hidden flex flex-col shrink-0"
          style={{ width: 112 }}
        >
          <ThumbnailSidebar
            pdfDoc={pdfDoc}
            currentPage={currentPage}
            onPageSelect={onPageChange}
          />
        </div>
      )}

      {/* Main canvas area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* PDF sub-toolbar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-background shrink-0 flex-wrap">
          <Button size="icon" variant="ghost" onClick={onSidebarToggle} title={sidebarOpen ? "Hide thumbnails" : "Show thumbnails"}>
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Page navigation */}
          <Button
            size="icon" variant="ghost"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            title="Previous page (←)"
            data-testid="button-pdf-prev"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
            Page {currentPage} of {numPages}
          </span>
          <Button
            size="icon" variant="ghost"
            onClick={() => onPageChange(Math.min(numPages, currentPage + 1))}
            disabled={currentPage >= numPages}
            title="Next page (→)"
            data-testid="button-pdf-next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Zoom controls */}
          <Button size="icon" variant="ghost" onClick={onZoomOut} title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground w-10 text-center tabular-nums">{zoomPct}%</span>
          <Button size="icon" variant="ghost" onClick={onZoomIn} title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onFit} title="Fit to screen" className="gap-1">
            <Maximize2 className="h-3.5 w-3.5" /> Fit
          </Button>
          <Button size="sm" variant="ghost" onClick={onActualSize} title="Actual size" className="gap-1">
            <Expand className="h-3.5 w-3.5" /> 100%
          </Button>
        </div>

        {/* Canvas scroll area */}
        <div className="flex-1 overflow-auto min-h-0 flex items-start justify-center p-6 bg-neutral-700 dark:bg-neutral-900">
          <canvas
            ref={canvasRef}
            className="shadow-2xl rounded-sm block"
            style={{ maxWidth: "none" }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Image viewer with zoom/pan ────────────────────────────────────────────────

interface ImageViewerProps {
  blobUrl: string;
  fileName: string;
  scale: number;
  offset: { x: number; y: number };
  onWheel: (e: WheelEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  dragging: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  imgRef: React.RefObject<HTMLImageElement>;
}

function ImageViewer({
  blobUrl, fileName, scale, offset, onWheel, onMouseDown, onMouseMove, onMouseUp,
  dragging, containerRef, imgRef,
}: ImageViewerProps) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel, containerRef]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden flex items-center justify-center bg-neutral-700 dark:bg-neutral-900 select-none min-h-0"
      style={{ cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <img
        ref={imgRef}
        src={blobUrl}
        alt={fileName}
        draggable={false}
        style={{
          maxWidth: scale === 1 ? "100%" : undefined,
          maxHeight: scale === 1 ? "100%" : undefined,
          objectFit: scale === 1 ? "contain" : undefined,
          transform: scale !== 1
            ? `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`
            : undefined,
          transformOrigin: "center center",
          transition: dragging ? "none" : "transform 0.08s ease",
          pointerEvents: "none",
          userSelect: "none",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const MIN_SCALE = 0.2;
const MAX_SCALE = 10;
const ZOOM_STEP = 0.2;

export function DocPreviewLink({ documentId, fileName, mimeType, className, testId }: DocPreviewLinkProps) {
  const resolvedMime = mimeType || guessMime(fileName);

  // Open/load state
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [mode, setMode] = useState<ViewerMode>("idle");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState<string[][] | null>(null);

  // PDF state
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pdfFitScaleRef = useRef<number>(1.0);

  // Shared zoom/pan (images) / scale (PDF)
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const lastOffset = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const mainAreaRef = useRef<HTMLDivElement>(null);

  const clamp = (v: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, v));

  // ── Zoom helpers ──

  const zoomBy = useCallback((delta: number) => {
    setScale(prev => clamp(prev + delta));
  }, []);

  const fitToScreen = useCallback(async (doc?: pdfjsLib.PDFDocumentProxy, page?: number) => {
    const d = doc ?? pdfDoc;
    const p = page ?? currentPage;
    if (d && mainAreaRef.current) {
      try {
        const pdfPage = await d.getPage(p);
        const viewport = pdfPage.getViewport({ scale: 1 });
        const containerW = mainAreaRef.current.clientWidth - 48; // minus padding
        const containerH = mainAreaRef.current.clientHeight - 48;
        const fitScale = Math.min(containerW / viewport.width, containerH / viewport.height);
        const clamped = clamp(fitScale);
        pdfFitScaleRef.current = clamped;
        setScale(clamped);
      } catch {}
    } else {
      setScale(1);
    }
    setOffset({ x: 0, y: 0 });
  }, [pdfDoc, currentPage]);

  const setActualSize = useCallback(async () => {
    const d = pdfDoc;
    if (d) {
      // 1 PDF point = 1px at 96dpi/72dpi ratio ≈ 1.333
      setScale(clamp(1.333));
    } else if (imgContainerRef.current && imgRef.current) {
      const { naturalWidth } = imgRef.current;
      const { width } = imgContainerRef.current.getBoundingClientRect();
      setScale(clamp(naturalWidth / width));
    } else {
      setScale(clamp(1));
    }
    setOffset({ x: 0, y: 0 });
  }, [pdfDoc]);

  // ── Image wheel zoom ──
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setScale(prev => clamp(prev + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
  }, []);

  // ── Image drag-to-pan ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setDragging(true);
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    lastOffset.current = { ...offset };
  }, [scale, offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setOffset({
      x: lastOffset.current.x + (e.clientX - dragOrigin.current.x),
      y: lastOffset.current.y + (e.clientY - dragOrigin.current.y),
    });
  }, [dragging]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  // ── Keyboard ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (mode === "pdf") {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          setCurrentPage(p => pdfDoc ? Math.min(pdfDoc.numPages, p + 1) : p);
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          setCurrentPage(p => Math.max(1, p - 1));
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, mode, pdfDoc]);

  // ── Load PDF into pdfjs when blob URL changes ──
  useEffect(() => {
    if (!blobUrl || mode !== "pdf") return;
    let cancelled = false;
    let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;

    (async () => {
      try {
        loadingTask = pdfjsLib.getDocument({ url: blobUrl });
        const doc = await loadingTask.promise;
        if (cancelled) { doc.destroy(); return; }
        setPdfDoc(doc);
        setCurrentPage(1);
        // Auto-fit after a tick so mainAreaRef has dimensions
        setTimeout(() => fitToScreen(doc, 1), 80);
      } catch {}
    })();

    return () => {
      cancelled = true;
      loadingTask?.destroy?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blobUrl, mode]);

  // ── Reset helpers ──
  const resetContent = useCallback(() => {
    if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 500);
    setBlobUrl(null);
    setTextContent(null);
    setCsvRows(null);
    setPdfDoc(doc => { doc?.destroy(); return null; });
    setMode("idle");
    setCurrentPage(1);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [blobUrl]);

  // ── Download ──
  const triggerDownload = async () => {
    setDownloadLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/download`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {} finally { setDownloadLoading(false); }
  };

  // ── Open click ──
  const handleOpenClick = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();

    if (resolvedMime && isOfficeMime(resolvedMime, fileName)) {
      setLoading(true);
      try {
        const r = await fetch(`/api/documents/${documentId}/preview`, { credentials: "include" });
        if (r.ok) {
          const d = await r.json();
          if (d.previewUrl && !d.useServerProxy) {
            window.open(OFFICE_ONLINE_BASE + encodeURIComponent(d.previewUrl), "_blank", "noopener");
            return;
          }
        }
      } catch {} finally { setLoading(false); }
      setMode("unsupported"); setOpen(true); return;
    }

    const mime = resolvedMime ?? "";
    const lower = fileName.toLowerCase();
    const isPDF  = mime === "application/pdf" || lower.endsWith(".pdf");
    const isImg  = mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/.test(lower);
    const isCSV  = mime.includes("csv") || lower.endsWith(".csv");
    const isText = !isCSV && (mime.startsWith("text/") || lower.endsWith(".txt"));

    if (!isPDF && !isImg && !isCSV && !isText) {
      setMode("unsupported"); setOpen(true); return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/download?disposition=inline`, { credentials: "include" });
      if (!res.ok) throw new Error();

      const ct = res.headers.get("content-type")?.split(";")[0]?.trim() || mime;

      if (isCSV || ct.includes("csv")) {
        setCsvRows(parseCSV(await res.text()));
        setMode("csv");
      } else if (isText) {
        setTextContent(await res.text());
        setMode("text");
      } else {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setMode(isPDF ? "pdf" : "image");
      }
      setOpen(true);
    } catch {
      setMode("unsupported"); setOpen(true);
    } finally { setLoading(false); }
  };

  const handleClose = () => { setOpen(false); resetContent(); };

  // ── Render ────────────────────────────────────────────────────────────────

  const isImageMode = mode === "image" && !!blobUrl;
  const isPdfMode   = mode === "pdf" && !!pdfDoc;
  const zoomPct = Math.round(scale * 100);

  return (
    <>
      {/* ── Trigger button + inline download ── */}
      <div className={`inline-flex items-center gap-0.5 ${className ?? ""}`}>
        <button
          type="button"
          onClick={handleOpenClick}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs bg-muted hover-elevate text-foreground max-w-[180px] disabled:opacity-50 cursor-pointer"
          title={`View ${fileName}`}
          data-testid={testId}
        >
          {loading
            ? <span className="h-3 w-3 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin" />
            : <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />}
          <span className="truncate">{fileName}</span>
        </button>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); triggerDownload(); }}
          disabled={downloadLoading}
          className="p-1 rounded text-muted-foreground hover-elevate disabled:opacity-50"
          title={`Download ${fileName}`}
          data-testid={testId ? `${testId}-download` : undefined}
        >
          {downloadLoading
            ? <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin block" />
            : <Download className="h-3 w-3" />}
        </button>
      </div>

      {/* ── Full viewer modal ── */}
      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent
          hideCloseButton
          className="max-w-[95vw] w-[95vw] flex flex-col gap-0 p-0 overflow-hidden"
          style={{ height: "92vh", maxHeight: "92vh" }}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b shrink-0 bg-background">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium truncate max-w-xs">{fileName}</span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Image zoom controls — in header for images; PDF has its own sub-toolbar */}
              {isImageMode && (
                <div className="flex items-center gap-1 mr-2 border-r pr-3">
                  <Button size="icon" variant="ghost" onClick={() => zoomBy(-ZOOM_STEP)} title="Zoom out">
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground w-10 text-center tabular-nums">{zoomPct}%</span>
                  <Button size="icon" variant="ghost" onClick={() => zoomBy(ZOOM_STEP)} title="Zoom in">
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => fitToScreen()} className="gap-1" title="Fit to screen">
                    <Maximize2 className="h-3.5 w-3.5" /> Fit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={setActualSize} className="gap-1" title="Actual size">
                    <Expand className="h-3.5 w-3.5" /> 100%
                  </Button>
                </div>
              )}

              <Button variant="ghost" size="icon" onClick={() => triggerDownload()} title="Download" disabled={downloadLoading}>
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleClose} title="Close (Esc)" data-testid="button-preview-close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* ── Body ── */}
          <div ref={mainAreaRef} className="flex-1 flex min-h-0 overflow-hidden">

            {/* Unsupported */}
            {mode === "unsupported" && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
                <Info className="h-10 w-10 text-muted-foreground opacity-50" />
                <p className="text-sm font-medium">Preview not available. Use download to open file.</p>
                <p className="text-xs text-muted-foreground">Click the download icon above to save and open the file on your device.</p>
              </div>
            )}

            {/* PDF */}
            {isPdfMode && pdfDoc && (
              <PdfViewer
                pdfDoc={pdfDoc}
                currentPage={currentPage}
                scale={scale}
                sidebarOpen={sidebarOpen}
                onPageChange={setCurrentPage}
                onSidebarToggle={() => setSidebarOpen(v => !v)}
                onZoomIn={() => zoomBy(ZOOM_STEP)}
                onZoomOut={() => zoomBy(-ZOOM_STEP)}
                onFit={() => fitToScreen()}
                onActualSize={setActualSize}
                zoomPct={zoomPct}
              />
            )}

            {/* Image */}
            {isImageMode && (
              <ImageViewer
                blobUrl={blobUrl}
                fileName={fileName}
                scale={scale}
                offset={offset}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                dragging={dragging}
                containerRef={imgContainerRef}
                imgRef={imgRef}
              />
            )}

            {/* Plain text */}
            {mode === "text" && textContent !== null && (
              <div className="flex-1 overflow-auto p-4">
                <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted p-4 rounded">
                  {textContent}
                </pre>
              </div>
            )}

            {/* CSV */}
            {mode === "csv" && csvRows !== null && (
              <div className="flex-1 overflow-auto p-4">
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr>
                      {csvRows[0]?.map((cell, i) => (
                        <th key={i} className="border border-border bg-muted px-2 py-1 text-left font-semibold whitespace-nowrap">
                          {cell}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(1).map((row, ri) => (
                      <tr key={ri} className="even:bg-muted/40">
                        {row.map((cell, ci) => (
                          <td key={ci} className="border border-border px-2 py-1 text-muted-foreground whitespace-nowrap">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
