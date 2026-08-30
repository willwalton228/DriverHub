import { useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  FileText,
  AlertTriangle,
  DollarSign,
  BarChart3,
  TrendingDown,
  Clock,
} from "lucide-react";

// ── Widget metadata ────────────────────────────────────────────────────────────
export const CLAIMS_WIDGET_IDS = [
  "total-claims",
  "open-claims",
  "probable-exposure",
  "investigating",
  "closed",
  "avg-cost-per-month",
] as const;
export type ClaimsWidgetId = (typeof CLAIMS_WIDGET_IDS)[number];

const WIDGET_META: Record<ClaimsWidgetId, { title: string; description: string; icon: React.ElementType }> = {
  "total-claims":       { title: "Total Claims",            description: "All-time claim count",          icon: FileText      },
  "open-claims":        { title: "Open Claims",             description: "Active and investigating",      icon: AlertTriangle },
  "probable-exposure":  { title: "Probable Exposure",       description: "Estimated financial liability", icon: DollarSign    },
  "investigating":      { title: "Actual vs Probable Cost", description: "Closed claims cost comparison", icon: BarChart3     },
  "closed":             { title: "Claims per 1k Moves",     description: "30-day incident rate",          icon: TrendingDown  },
  "avg-cost-per-month": { title: "Avg Cost per Month",      description: "Monthly cost trend",            icon: Clock         },
};

// ── Sortable row ───────────────────────────────────────────────────────────────
function SortableWidgetRow({
  id,
  hidden,
  onToggle,
}: {
  id: ClaimsWidgetId;
  hidden: boolean;
  onToggle: (id: ClaimsWidgetId) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  const meta = WIDGET_META[id];
  const Icon = meta.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-background border border-border rounded-lg select-none"
    >
      {/* Drag handle */}
      <button
        type="button"
        aria-label="Drag to reorder"
        className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground transition-colors shrink-0"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Icon */}
      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium leading-tight truncate ${
            hidden ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-foreground"
          }`}
        >
          {meta.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">{meta.description}</p>
      </div>

      {/* Visibility toggle */}
      <Switch
        checked={!hidden}
        onCheckedChange={() => onToggle(id)}
        aria-label={hidden ? `Show ${meta.title}` : `Hide ${meta.title}`}
      />
    </div>
  );
}

// ── Sheet component ────────────────────────────────────────────────────────────
export interface ClaimsWidgetLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgetOrder: ClaimsWidgetId[];
  hiddenWidgets: ClaimsWidgetId[];
  onReorder: (newOrder: ClaimsWidgetId[]) => void;
  onToggle: (id: ClaimsWidgetId) => void;
}

export function ClaimsWidgetLibrary({
  open,
  onOpenChange,
  widgetOrder,
  hiddenWidgets,
  onReorder,
  onToggle,
}: ClaimsWidgetLibraryProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = widgetOrder.indexOf(active.id as ClaimsWidgetId);
      const newIdx = widgetOrder.indexOf(over.id as ClaimsWidgetId);
      if (oldIdx !== -1 && newIdx !== -1) {
        onReorder(arrayMove(widgetOrder, oldIdx, newIdx));
      }
    },
    [widgetOrder, onReorder],
  );

  const visibleCount = widgetOrder.length - hiddenWidgets.length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[380px] sm:w-[420px] flex flex-col gap-0 p-0"
      >
        {/* Header */}
        <SheetHeader className="px-6 py-5 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle>Widget Library</SheetTitle>
            <Badge variant="secondary" className="text-xs tabular-nums">
              {visibleCount} / {widgetOrder.length} visible
            </Badge>
          </div>
          <SheetDescription className="text-xs mt-1">
            Toggle widgets on or off and drag to reorder. Changes save automatically.
          </SheetDescription>
        </SheetHeader>

        {/* Sortable list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={widgetOrder} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {widgetOrder.map((id) => (
                  <SortableWidgetRow
                    key={id}
                    id={id}
                    hidden={hiddenWidgets.includes(id)}
                    onToggle={onToggle}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0">
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
