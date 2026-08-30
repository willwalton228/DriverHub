import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Upload, FileText, Download, Trash2, AlertCircle, Calendar } from "lucide-react";
import type { DriverDocumentWithUploader } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dateFormat";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DeleteAttachmentDialog } from "@/components/DeleteAttachmentDialog";

export default function Documents() {
  const { isAuthenticated, isSuperAdmin, isRootSuperAdmin } = useAuth();
  const canDelete = isSuperAdmin || isRootSuperAdmin;
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; fileName: string } | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploadData, setUploadData] = useState({
    documentType: "license",
    description: "",
    expirationDate: "",
    file: null as File | null,
  });

  const { data: documents = [], isLoading } = useQuery<DriverDocumentWithUploader[]>({
    queryKey: ["/api/drivers/documents"],
    enabled: isAuthenticated,
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/drivers/documents", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers/documents"] });
      setIsUploadDialogOpen(false);
      setUploadData({ documentType: "license", description: "", expirationDate: "", file: null });
      toast({
        title: "Success",
        description: "Document uploaded successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to upload document",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return await apiRequest("DELETE", `/api/drivers/documents/${id}`, { deletionReason: reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers/documents"] });
      setDeleteTarget(null);
      toast({ title: "Document removed", description: "The document has been removed and an audit record created." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to remove document", variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "File size must be less than 5MB",
          variant: "destructive",
        });
        return;
      }
      setUploadData({ ...uploadData, file });
    }
  };

  const handleUpload = async () => {
    if (!uploadData.file) {
      toast({
        title: "Error",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target?.result as string;
      
      uploadMutation.mutate({
        documentType: uploadData.documentType,
        fileName: uploadData.file!.name,
        fileSize: uploadData.file!.size.toString(),
        mimeType: uploadData.file!.type,
        fileData: base64Data.split(',')[1],
        description: uploadData.description || null,
        expirationDate: uploadData.expirationDate || null,
      });
    };
    reader.readAsDataURL(uploadData.file);
  };

  const handleDownload = (document: DriverDocumentWithUploader) => {
    const link = window.document.createElement('a');
    link.href = `data:${document.mimeType};base64,${document.fileData}`;
    link.download = document.fileName;
    link.click();
  };

  const getDocumentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      license: "License",
      certification: "Certification",
      compliance: "Compliance",
      other: "Other",
    };
    return labels[type] || type;
  };

  const isExpiringSoon = (expirationDate: string | null) => {
    if (!expirationDate) return false;
    const expDate = new Date(expirationDate);
    const today = new Date();
    const daysUntilExpiration = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiration <= 30 && daysUntilExpiration > 0;
  };

  const isExpired = (expirationDate: string | null) => {
    if (!expirationDate) return false;
    return new Date(expirationDate) < new Date();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const expiredDocs = documents.filter(doc => isExpired(doc.expirationDate));
  const expiringSoonDocs = documents.filter(doc => isExpiringSoon(doc.expirationDate));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Documents</h1>
          <p className="text-muted-foreground mt-2">
            Manage your licenses, certifications, and compliance documents
          </p>
        </div>
        <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-upload-document">
              <Upload className="mr-2 h-4 w-4" />
              Upload Document
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-upload-document">
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
              <DialogDescription>
                Upload a new license, certification, or compliance document
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="documentType">Document Type</Label>
                <Select
                  value={uploadData.documentType}
                  onValueChange={(value) => setUploadData({ ...uploadData, documentType: value })}
                >
                  <SelectTrigger data-testid="select-document-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="license">License</SelectItem>
                    <SelectItem value="certification">Certification</SelectItem>
                    <SelectItem value="compliance">Compliance</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="file">File (Max 5MB)</Label>
                <Input
                  id="file"
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.jpg,.jpeg,.png"
                  data-testid="input-file-upload"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={uploadData.description}
                  onChange={(e) => setUploadData({ ...uploadData, description: e.target.value })}
                  placeholder="Add a description for this document"
                  data-testid="input-document-description"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expirationDate">Expiration Date (Optional)</Label>
                <Input
                  id="expirationDate"
                  type="date"
                  value={uploadData.expirationDate}
                  onChange={(e) => setUploadData({ ...uploadData, expirationDate: e.target.value })}
                  data-testid="input-expiration-date"
                />
              </div>

              <Button
                className="w-full"
                onClick={handleUpload}
                disabled={uploadMutation.isPending}
                data-testid="button-confirm-upload"
              >
                {uploadMutation.isPending ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(expiredDocs.length > 0 || expiringSoonDocs.length > 0) && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {expiredDocs.length > 0 && (
              <p className="font-semibold text-destructive">
                {expiredDocs.length} document{expiredDocs.length > 1 ? 's have' : ' has'} expired
              </p>
            )}
            {expiringSoonDocs.length > 0 && (
              <p className="text-muted-foreground">
                {expiringSoonDocs.length} document{expiringSoonDocs.length > 1 ? 's expire' : ' expires'} within 30 days
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              No documents uploaded yet. Upload your first document to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <Card key={doc.id} className="hover-elevate" data-testid={`card-document-${doc.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <FileText className="h-8 w-8 text-primary" />
                  <Badge variant={isExpired(doc.expirationDate) ? "destructive" : isExpiringSoon(doc.expirationDate) ? "outline" : "secondary"}>
                    {getDocumentTypeLabel(doc.documentType)}
                  </Badge>
                </div>
                <CardTitle className="text-lg truncate" title={doc.fileName}>
                  {doc.fileName}
                </CardTitle>
                <CardDescription>
                  {doc.description || "No description"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {doc.expirationDate && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className={isExpired(doc.expirationDate) ? "text-destructive font-semibold" : isExpiringSoon(doc.expirationDate) ? "text-orange-600 font-semibold" : "text-muted-foreground"}>
                      Expires: {formatDate(doc.expirationDate)}
                    </span>
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  Uploaded {formatDate(doc.createdAt)}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(doc)}
                    className="flex-1"
                    data-testid={`button-download-${doc.id}`}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                  {canDelete && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleteTarget({ id: doc.id, fileName: doc.fileName })}
                      data-testid={`button-delete-${doc.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DeleteAttachmentDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        fileName={deleteTarget?.fileName ?? ""}
        context="Driver Document"
        onConfirm={(reason) => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id, reason })}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
