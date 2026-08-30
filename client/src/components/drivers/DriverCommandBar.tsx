import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Pencil,
  CheckCircle,
  XCircle,
  Ban,
  RotateCcw,
  FileText,
  MessageSquare,
  Upload,
  History,
  ShieldCheck,
  Download,
  MoreHorizontal,
  Loader2,
  LayoutDashboard,
} from "lucide-react";
import type { DriverWithUser } from "@shared/schema";

interface DriverCommandBarProps {
  driver: DriverWithUser;
  onEditDriver: () => void;
  onChangeStatus: (status: string) => void;
  onAddNote: () => void;
  onAddComment: () => void;
  onUploadDocument: () => void;
  onViewHistory: () => void;
  onViewCompliance: () => void;
  onExportRecord: () => void;
  onViewDashboard?: () => void;
  isPending?: boolean;
  canEdit?: boolean;
  className?: string;
  disableSticky?: boolean;
}

function StatusActions({
  driver,
  onChangeStatus,
  onConfirmTerminate,
  isPending,
  canEdit,
}: {
  driver: DriverWithUser;
  onChangeStatus: (status: string) => void;
  onConfirmTerminate: () => void;
  isPending?: boolean;
  canEdit?: boolean;
}) {
  if (!canEdit || (driver as any).isDeleted) return null;

  const status = (driver.status || "active").toLowerCase();

  return (
    <>
      {(status === "active" || status === "pending") && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onChangeStatus("Inactive")}
              disabled={isPending}
              data-testid="button-deactivate-driver"
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Deactivate
            </Button>
          </TooltipTrigger>
          <TooltipContent>Set driver status to Inactive</TooltipContent>
        </Tooltip>
      )}

      {(status === "inactive") && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onChangeStatus("Active")}
              disabled={isPending}
              data-testid="button-activate-driver"
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
              Activate
            </Button>
          </TooltipTrigger>
          <TooltipContent>Set driver status to Active</TooltipContent>
        </Tooltip>
      )}

      {(status === "terminated") && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onChangeStatus("Active")}
              disabled={isPending}
              data-testid="button-reactivate-driver"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reactivate
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reactivate this driver</TooltipContent>
        </Tooltip>
      )}

      {(status !== "terminated") && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onConfirmTerminate}
              disabled={isPending}
              data-testid="button-terminate-driver"
              className="text-destructive hover:text-destructive"
            >
              <Ban className="h-3.5 w-3.5 mr-1.5" />
              Terminate
            </Button>
          </TooltipTrigger>
          <TooltipContent>Permanently terminate this driver</TooltipContent>
        </Tooltip>
      )}
    </>
  );
}

export function DriverCommandBar({
  driver,
  onEditDriver,
  onChangeStatus,
  onAddNote,
  onAddComment,
  onUploadDocument,
  onViewHistory,
  onViewCompliance,
  onExportRecord,
  onViewDashboard,
  isPending = false,
  canEdit = false,
  className,
  disableSticky = false,
}: DriverCommandBarProps) {
  const [showTerminateDialog, setShowTerminateDialog] = useState(false);

  const driverName =
    driver.user?.firstName && driver.user?.lastName
      ? `${driver.user.firstName} ${driver.user.lastName}`
      : driver.user?.email ?? "this driver";

  const isArchived = !!(driver as any).isDeleted;

  return (
    <>
      <div
        className={`${disableSticky ? "" : "sticky top-0 z-40"} bg-background border-b border-border ${className ?? ""}`}
        data-testid="driver-command-bar"
      >
        <div className="flex items-center gap-1.5 px-4 py-2 flex-wrap">

          {/* ── Left: Driver Actions ── */}
          <div className="flex items-center gap-1.5 flex-wrap" data-testid="dcb-left-actions">
            {canEdit && !isArchived && (
              <Button
                variant="outline"
                size="sm"
                onClick={onEditDriver}
                data-testid="button-edit-driver"
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit Driver
              </Button>
            )}

            <StatusActions
              driver={driver}
              onChangeStatus={onChangeStatus}
              onConfirmTerminate={() => setShowTerminateDialog(true)}
              isPending={isPending}
              canEdit={canEdit}
            />
          </div>

          {/* ── Divider ── */}
          {canEdit && !isArchived && (
            <Separator orientation="vertical" className="h-5 mx-1 shrink-0" />
          )}

          {/* ── Middle: Operational Tools ── */}
          <div className="flex items-center gap-1.5 flex-wrap" data-testid="dcb-middle-actions">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAddNote}
                  data-testid="button-add-internal-note"
                >
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Add Internal Note
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add an internal staff note</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAddComment}
                  data-testid="button-add-driver-comment"
                >
                  <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                  Add Comment
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add a driver-visible comment</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onUploadDocument}
                  data-testid="button-upload-document"
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Upload Doc
                </Button>
              </TooltipTrigger>
              <TooltipContent>Upload a document for this driver</TooltipContent>
            </Tooltip>

          </div>

          {/* ── Right: Utilities (pushed to end) ── */}
          <div className="flex items-center gap-1.5 ml-auto flex-wrap" data-testid="dcb-right-actions">
            {onViewDashboard && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={onViewDashboard} data-testid="button-view-driver-dashboard">
                    <LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />
                    Dashboard
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View driver performance dashboard</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onViewHistory}
                  data-testid="button-view-driver-history"
                >
                  <History className="h-3.5 w-3.5 mr-1.5" />
                  History
                </Button>
              </TooltipTrigger>
              <TooltipContent>View move history</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onViewCompliance}
                  data-testid="button-view-compliance-snapshot"
                >
                  <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                  Compliance
                </Button>
              </TooltipTrigger>
              <TooltipContent>View compliance snapshot</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onExportRecord}
                  data-testid="button-export-driver-record"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Export
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export driver record to Excel</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-5 mx-0.5 shrink-0" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="button-more-actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5 mr-1" />
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52" data-testid="dropdown-more-actions">
                <DropdownMenuItem onClick={onViewHistory} data-testid="menu-view-driver-history">
                  <History className="h-4 w-4 mr-2" />
                  View Driver History
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onViewCompliance} data-testid="menu-view-compliance">
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  View Compliance Snapshot
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportRecord} data-testid="menu-export-record">
                  <Download className="h-4 w-4 mr-2" />
                  Export Driver Record
                </DropdownMenuItem>
                {canEdit && !isArchived && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setShowTerminateDialog(true)}
                      data-testid="menu-terminate-driver"
                    >
                      <Ban className="h-4 w-4 mr-2" />
                      Terminate Driver
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {isPending && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-1 shrink-0" />
            )}
          </div>
        </div>
      </div>

      {/* Terminate Confirmation Dialog */}
      <AlertDialog open={showTerminateDialog} onOpenChange={setShowTerminateDialog}>
        <AlertDialogContent data-testid="dialog-terminate-driver">
          <AlertDialogHeader>
            <AlertDialogTitle>Terminate Driver</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to terminate <strong>{driverName}</strong>? This will set their
              status to Terminated. You can reactivate them later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-terminate-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onChangeStatus("Terminated");
                setShowTerminateDialog(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-terminate-confirm"
            >
              Terminate Driver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
