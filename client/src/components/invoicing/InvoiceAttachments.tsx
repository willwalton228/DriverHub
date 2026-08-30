import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { DeleteAttachmentDialog } from "@/components/DeleteAttachmentDialog";
import {
  Paperclip,
  Upload,
  Download,
  Trash2,
  FileText,
  Image,
  FileSpreadsheet,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";

interface InvoiceAttachment {
  id: string;
  invoiceId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  objectPath: string;
  attachmentType: string;
  customerVisible: boolean;
  uploadedBy: string | null;
  createdAt: string;
}

interface InvoiceAttachmentsProps {
  invoiceId: string;
  invoiceStatus: string | null;
}

const ATTACHMENT_TYPE_LABELS: Record<string, string> = {
  proof_of_service: "Proof of Service",
  signed_document: "Signed Document",
  rate_sheet: "Rate Sheet",
  other: "Other",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return <Image className="h-4 w-4" />;
  if (mimeType === "application/pdf") return <FileText className="h-4 w-4" />;
  if (mimeType.includes("csv") || mimeType.includes("excel"))
    return <FileSpreadsheet className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

export function InvoiceAttachments({ invoiceId, invoiceStatus }: InvoiceAttachmentsProps) {
  const { toast } = useToast();
  const { isSuperAdmin, isRootSuperAdmin } = useAuth();
  const canDelete = isSuperAdmin || isRootSuperAdmin;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachmentType, setAttachmentType] = useState<string>("other");
  const [customerVisible, setCustomerVisible] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; fileName: string } | null>(null);

  const { data: attachments, isLoading } = useQuery<InvoiceAttachment[]>({
    queryKey: ["/api/corporate/invoicing/invoices", invoiceId, "attachments"],
    enabled: !!invoiceId,
    refetchOnMount: "always",
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await apiRequest("DELETE", `/api/corporate/invoicing/invoices/${invoiceId}/attachments/${id}`, { deletionReason: reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices", invoiceId, "attachments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices", invoiceId, "activities"] });
      setDeleteTarget(null);
      toast({ title: "Attachment removed", description: "The attachment has been removed and an audit record created." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to remove attachment", variant: "destructive" });
    },
  });

  const handleUpload = async (file: File) => {
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "text/csv",
      "application/vnd.ms-excel",
    ];
    if (!allowedTypes.includes(file.type) && !file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Only PDF, images (JPEG, PNG, GIF, WebP), and CSV files are allowed.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 10MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const response = await fetch(`/api/corporate/invoicing/invoices/${invoiceId}/attachments`, {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "X-Filename": file.name,
          "X-Attachment-Type": attachmentType,
          "X-Customer-Visible": String(customerVisible),
        },
        body: buffer,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices", invoiceId, "attachments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/invoices", invoiceId, "activities"] });
      toast({ title: "Attachment uploaded successfully" });
      setAttachmentType("other");
      setCustomerVisible(false);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload attachment",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (attachment: InvoiceAttachment) => {
    try {
      const response = await fetch(`/api/corporate/invoicing/attachments/${attachment.id}/download`);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          Attachments
          {attachments && attachments.length > 0 && (
            <Badge variant="secondary" className="text-xs">{attachments.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-lg border p-3 bg-muted/20" data-testid="attachment-upload-form">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={attachmentType} onValueChange={setAttachmentType}>
                <SelectTrigger data-testid="select-attachment-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proof_of_service">Proof of Service</SelectItem>
                  <SelectItem value="signed_document">Signed Document</SelectItem>
                  <SelectItem value="rate_sheet">Rate Sheet</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Customer Visibility</Label>
              <div className="flex items-center gap-2 h-9">
                <Switch
                  checked={customerVisible}
                  onCheckedChange={setCustomerVisible}
                  data-testid="switch-customer-visible"
                />
                <span className="text-sm text-muted-foreground">
                  {customerVisible ? "Visible" : "Internal only"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.csv,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
              data-testid="input-file-upload"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full"
              data-testid="button-upload-attachment"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {isUploading ? "Uploading..." : "Choose File & Upload"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            PDF, images (JPEG, PNG, GIF, WebP), CSV. Max 10MB.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : attachments && attachments.length > 0 ? (
          <div className="space-y-2" data-testid="attachment-list">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                data-testid={`attachment-item-${attachment.id}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex-shrink-0 text-muted-foreground">
                    {getFileIcon(attachment.mimeType)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{attachment.fileName}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {ATTACHMENT_TYPE_LABELS[attachment.attachmentType] || attachment.attachmentType}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {formatFileSize(attachment.fileSize)}
                      </span>
                      {attachment.customerVisible ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
                          <Eye className="h-3 w-3" /> Customer visible
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <EyeOff className="h-3 w-3" /> Internal
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDownload(attachment)}
                    data-testid={`button-download-attachment-${attachment.id}`}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {canDelete && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteTarget({ id: attachment.id, fileName: attachment.fileName })}
                      data-testid={`button-delete-attachment-${attachment.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">
            No attachments yet
          </p>
        )}
      </CardContent>
    </Card>

    <DeleteAttachmentDialog
      open={!!deleteTarget}
      onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      fileName={deleteTarget?.fileName ?? ''}
      context="Invoice Attachment"
      onConfirm={(reason) => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id, reason })}
      isPending={deleteMutation.isPending}
    />
    </>
  );
}
