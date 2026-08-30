import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, Trash2, Download, Edit2, FolderOpen, Upload, Library } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/dateFormat";

interface StandardDocument {
  id: string;
  name: string;
  description: string | null;
  filename: string;
  originalFilename: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  uploadedByUserId: string | null;
}

export default function StandardDocuments() {
  const { isAuthenticated, isAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<StandardDocument | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    file: null as File | null,
  });

  // Fetch all standard documents (including inactive for admin view)
  const { data: documents = [], isLoading } = useQuery<StandardDocument[]>({
    queryKey: ["/api/corporate/standard-documents", { activeOnly: "false" }],
    enabled: isAuthenticated,
  });

  // Create document mutation
  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; filename: string; originalFilename: string; fileUrl: string; fileSize: number; mimeType: string }) => {
      const res = await apiRequest("POST", "/api/corporate/standard-documents", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/standard-documents"] });
      toast({ title: "Document added to library" });
      setAddDialogOpen(false);
      setFormData({ name: "", description: "", file: null });
    },
    onError: (error: Error) => {
      toast({ title: "Error adding document", description: error.message, variant: "destructive" });
    },
  });

  // Update document mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; description?: string; isActive?: boolean } }) => {
      const res = await apiRequest("PATCH", `/api/corporate/standard-documents/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/standard-documents"] });
      toast({ title: "Document updated" });
      setEditDialogOpen(false);
      setSelectedDoc(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error updating document", description: error.message, variant: "destructive" });
    },
  });

  // Delete document mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/corporate/standard-documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/standard-documents"] });
      toast({ title: "Document removed from library" });
    },
    onError: (error: Error) => {
      toast({ title: "Error removing document", description: error.message, variant: "destructive" });
    },
  });

  const handleUpload = async () => {
    if (!formData.file || !formData.name) {
      toast({ title: "Please provide a name and select a file", variant: "destructive" });
      return;
    }

    try {
      const arrayBuffer = await formData.file.arrayBuffer();
      const uploadRes = await fetch("/api/objects/upload-file", {
        method: "POST",
        headers: {
          "Content-Type": formData.file.type || "application/octet-stream",
          "X-Filename": encodeURIComponent(formData.file.name),
        },
        body: arrayBuffer,
        credentials: "include",
      });

      if (!uploadRes.ok) {
        let errorMsg = "Failed to upload file";
        try {
          const errData = await uploadRes.json();
          errorMsg = errData.message || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }

      const { objectPath } = await uploadRes.json();

      await createMutation.mutateAsync({
        name: formData.name,
        description: formData.description,
        filename: formData.file.name,
        originalFilename: formData.file.name,
        fileUrl: objectPath,
        fileSize: formData.file.size,
        mimeType: formData.file.type,
      });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    }
  };

  // Format file size
  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "N/A";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Wait for auth to load before checking admin status
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <Library className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">Admin Access Required</h2>
            <p className="text-muted-foreground">Only administrators can manage the standard documents library.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Library className="h-6 w-6" />
            Standard Documents Library
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage global documents that can be sent to any customer account
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} data-testid="button-add-document">
          <Plus className="h-4 w-4 mr-2" />
          Add Document
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Document Library</CardTitle>
          <CardDescription>
            {documents.length} document{documents.length !== 1 ? "s" : ""} in the library
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading documents...</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="font-medium mb-2">No documents in library</h3>
              <p className="text-sm">Add documents to make them available for sending to customers</p>
              <Button className="mt-4" onClick={() => setAddDialogOpen(true)} data-testid="button-add-first">
                <Plus className="h-4 w-4 mr-2" />
                Add First Document
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id} data-testid={`row-standard-doc-${doc.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <div>
                          <div className="font-medium">{doc.name}</div>
                          <div className="text-xs text-muted-foreground">{doc.originalFilename}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground line-clamp-2">
                        {doc.description || "—"}
                      </span>
                    </TableCell>
                    <TableCell>{formatFileSize(doc.fileSize)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={doc.isActive}
                          onCheckedChange={(checked) => updateMutation.mutate({ id: doc.id, data: { isActive: checked } })}
                          data-testid={`switch-active-${doc.id}`}
                        />
                        <Badge variant={doc.isActive ? "default" : "secondary"}>
                          {doc.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(doc.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => window.open(doc.fileUrl, "_blank")}
                          data-testid={`button-download-${doc.id}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setSelectedDoc(doc);
                            setEditDialogOpen(true);
                          }}
                          data-testid={`button-edit-${doc.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Are you sure you want to remove this document from the library?")) {
                              deleteMutation.mutate(doc.id);
                            }
                          }}
                          data-testid={`button-delete-${doc.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Document Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent data-testid="dialog-add-document">
          <DialogHeader>
            <DialogTitle>Add Document to Library</DialogTitle>
            <DialogDescription>Upload a document to make it available for all customer accounts</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label required>Document Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Standard Services Agreement"
                data-testid="input-doc-name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this document"
                rows={3}
                data-testid="input-description"
              />
            </div>
            <div>
              <Label required>File</Label>
              <Input
                type="file"
                onChange={(e) => setFormData({ ...formData, file: e.target.files?.[0] || null })}
                data-testid="input-file"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={createMutation.isPending} data-testid="button-confirm-add">
              {createMutation.isPending ? "Uploading..." : "Add Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Document Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-document">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
            <DialogDescription>Update document details</DialogDescription>
          </DialogHeader>
          {selectedDoc && (
            <div className="space-y-4">
              <div>
                <Label>Document Name</Label>
                <Input
                  value={selectedDoc.name}
                  onChange={(e) => setSelectedDoc({ ...selectedDoc, name: e.target.value })}
                  data-testid="input-edit-name"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={selectedDoc.description || ""}
                  onChange={(e) => setSelectedDoc({ ...selectedDoc, description: e.target.value })}
                  rows={3}
                  data-testid="input-edit-description"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch
                  checked={selectedDoc.isActive}
                  onCheckedChange={(checked) => setSelectedDoc({ ...selectedDoc, isActive: checked })}
                  data-testid="switch-edit-active"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (selectedDoc) {
                  updateMutation.mutate({
                    id: selectedDoc.id,
                    data: {
                      name: selectedDoc.name,
                      description: selectedDoc.description || undefined,
                      isActive: selectedDoc.isActive,
                    },
                  });
                }
              }}
              disabled={updateMutation.isPending}
              data-testid="button-confirm-edit"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
