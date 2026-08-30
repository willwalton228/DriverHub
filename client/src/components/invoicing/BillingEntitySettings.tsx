import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { 
  Loader2, Plus, Building2, Settings, FileText, Hash, 
  Pencil, Trash2, CheckCircle, Star
} from "lucide-react";

interface BillingEntity {
  id: string;
  entityName: string;
  entityCode: string;
  legalName?: string;
  taxId?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  isPrimary?: boolean;
  isActive?: boolean;
  invoicePrefix?: string;
  invoiceFormat?: string;
  invoicePadding?: number;
  nextSequence?: number;
  defaultTermsText?: string;
  footerNotes?: string;
  remittanceInstructions?: string;
  createdAt?: string;
}

const entityFormSchema = z.object({
  entityName: z.string().min(1, "Entity name is required"),
  entityCode: z.string().min(1, "Entity code is required").max(10, "Entity code must be 10 characters or less"),
  legalName: z.string().optional(),
  taxId: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  website: z.string().optional(),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
  invoicePrefix: z.string().optional(),
  invoiceFormat: z.string().optional(),
  invoicePadding: z.coerce.number().min(1).max(10).optional(),
  nextSequence: z.coerce.number().min(1).optional(),
  defaultTermsText: z.string().optional(),
  footerNotes: z.string().optional(),
  remittanceInstructions: z.string().optional(),
});

type EntityFormValues = z.infer<typeof entityFormSchema>;

export function BillingEntitySettings() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<BillingEntity | null>(null);

  const { data: entities, isLoading } = useQuery<BillingEntity[]>({
    queryKey: ['/api/corporate/invoicing/billing-entities'],
  });

  const createForm = useForm<EntityFormValues>({
    resolver: zodResolver(entityFormSchema),
    defaultValues: {
      entityName: "",
      entityCode: "",
      legalName: "",
      taxId: "",
      addressLine1: "",
      city: "",
      state: "",
      zipCode: "",
      country: "USA",
      phone: "",
      email: "",
      isPrimary: false,
      isActive: true,
      invoicePrefix: "",
      invoiceFormat: "PREFIX-YYYY-NNNNNN",
      invoicePadding: 6,
      nextSequence: 1,
      defaultTermsText: "",
      footerNotes: "",
      remittanceInstructions: "",
    },
  });

  const editForm = useForm<EntityFormValues>({
    resolver: zodResolver(entityFormSchema),
    defaultValues: {
      entityName: "",
      entityCode: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: EntityFormValues) => {
      return apiRequest('POST', '/api/corporate/invoicing/billing-entities', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/billing-entities'] });
      setIsCreateDialogOpen(false);
      createForm.reset();
      toast({ title: "Success", description: "Billing entity created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: EntityFormValues }) => {
      return apiRequest('PATCH', `/api/corporate/invoicing/billing-entities/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/billing-entities'] });
      setIsEditDialogOpen(false);
      setSelectedEntity(null);
      toast({ title: "Success", description: "Billing entity updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/corporate/invoicing/billing-entities/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/invoicing/billing-entities'] });
      toast({ title: "Success", description: "Billing entity deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (entity: BillingEntity) => {
    setSelectedEntity(entity);
    editForm.reset({
      entityName: entity.entityName || "",
      entityCode: entity.entityCode || "",
      legalName: entity.legalName || "",
      taxId: entity.taxId || "",
      addressLine1: entity.addressLine1 || "",
      addressLine2: entity.addressLine2 || "",
      city: entity.city || "",
      state: entity.state || "",
      zipCode: entity.zipCode || "",
      country: entity.country || "USA",
      phone: entity.phone || "",
      email: entity.email || "",
      website: entity.website || "",
      isPrimary: entity.isPrimary || false,
      isActive: entity.isActive !== false,
      invoicePrefix: entity.invoicePrefix || "",
      invoiceFormat: entity.invoiceFormat || "PREFIX-YYYY-NNNNNN",
      invoicePadding: entity.invoicePadding || 6,
      nextSequence: entity.nextSequence || 1,
      defaultTermsText: entity.defaultTermsText || "",
      footerNotes: entity.footerNotes || "",
      remittanceInstructions: entity.remittanceInstructions || "",
    });
    setIsEditDialogOpen(true);
  };

  const generateInvoicePreview = (prefix?: string, format?: string, padding?: number, sequence?: number) => {
    const year = new Date().getFullYear();
    const seq = String(sequence || 1).padStart(padding || 6, '0');
    let preview = format || "PREFIX-YYYY-NNNNNN";
    preview = preview.replace('PREFIX', prefix || 'INV');
    preview = preview.replace('YYYY', String(year));
    preview = preview.replace(/N+/g, seq);
    return preview;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Billing Entities
            </CardTitle>
            <CardDescription>
              Manage billing entities for multi-brand invoicing with custom numbering and templates
            </CardDescription>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-entity">
            <Plus className="w-4 h-4 mr-2" />
            Add Entity
          </Button>
        </CardHeader>
        <CardContent>
          {entities && entities.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Invoice Prefix</TableHead>
                  <TableHead>Next Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entities.map((entity) => (
                  <TableRow key={entity.id} data-testid={`row-entity-${entity.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {entity.entityName}
                            {entity.isPrimary && (
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">{entity.entityCode}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-mono text-sm">{entity.invoicePrefix || 'INV'}</div>
                        <div className="text-xs text-muted-foreground">
                          Preview: {generateInvoicePreview(entity.invoicePrefix, entity.invoiceFormat, entity.invoicePadding, entity.nextSequence)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">{entity.nextSequence || 1}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={entity.isActive !== false ? "default" : "secondary"}>
                        {entity.isActive !== false ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(entity)}
                          data-testid={`button-edit-entity-${entity.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this billing entity?')) {
                              deleteMutation.mutate(entity.id);
                            }
                          }}
                          disabled={entity.isPrimary}
                          data-testid={`button-delete-entity-${entity.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No billing entities configured.</p>
              <p className="text-sm mt-1">Create your first billing entity to start invoicing.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Billing Entity</DialogTitle>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))} className="space-y-6">
              <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Basic Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={createForm.control}
                    name="entityName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Entity Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Transportation LLC" {...field} data-testid="input-entity-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="entityCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Entity Code</FormLabel>
                        <FormControl>
                          <Input placeholder="ACME" maxLength={10} {...field} data-testid="input-entity-code" />
                        </FormControl>
                        <FormDescription>Short code for internal reference</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={createForm.control}
                    name="legalName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Legal Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Transportation LLC" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="taxId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tax ID / EIN</FormLabel>
                        <FormControl>
                          <Input placeholder="12-3456789" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  Invoice Numbering
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={createForm.control}
                    name="invoicePrefix"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Invoice Prefix</FormLabel>
                        <FormControl>
                          <Input placeholder="INV" {...field} data-testid="input-invoice-prefix" />
                        </FormControl>
                        <FormDescription>Prefix for invoice numbers (e.g., INV, ACME)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="invoiceFormat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Invoice Format</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-invoice-format">
                              <SelectValue placeholder="Select format" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="PREFIX-YYYY-NNNNNN">PREFIX-YYYY-NNNNNN</SelectItem>
                            <SelectItem value="PREFIX-NNNNNN">PREFIX-NNNNNN</SelectItem>
                            <SelectItem value="YYYY-PREFIX-NNNNNN">YYYY-PREFIX-NNNNNN</SelectItem>
                            <SelectItem value="NNNNNN">NNNNNN (Numbers only)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={createForm.control}
                    name="invoicePadding"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Number Padding</FormLabel>
                        <Select onValueChange={(v) => field.onChange(parseInt(v))} defaultValue={String(field.value || 6)}>
                          <FormControl>
                            <SelectTrigger data-testid="select-invoice-padding">
                              <SelectValue placeholder="Select padding" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="4">4 digits (0001)</SelectItem>
                            <SelectItem value="5">5 digits (00001)</SelectItem>
                            <SelectItem value="6">6 digits (000001)</SelectItem>
                            <SelectItem value="8">8 digits (00000001)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="nextSequence"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Starting Sequence</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} data-testid="input-next-sequence" />
                        </FormControl>
                        <FormDescription>Next invoice number to be assigned</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Invoice Number Preview:</div>
                  <div className="font-mono text-lg mt-1">
                    {generateInvoicePreview(
                      createForm.watch('invoicePrefix'),
                      createForm.watch('invoiceFormat'),
                      createForm.watch('invoicePadding'),
                      createForm.watch('nextSequence')
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Invoice Template Defaults
                </h3>
                <FormField
                  control={createForm.control}
                  name="defaultTermsText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Terms Text</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Payment is due within 30 days of invoice date..."
                          className="min-h-[80px]"
                          {...field} 
                          data-testid="textarea-default-terms"
                        />
                      </FormControl>
                      <FormDescription>Terms and conditions for invoices</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="footerNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Footer Notes</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Thank you for your business!"
                          className="min-h-[60px]"
                          {...field} 
                          data-testid="textarea-footer-notes"
                        />
                      </FormControl>
                      <FormDescription>Notes to appear at bottom of invoices</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="remittanceInstructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remittance Instructions</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Please make checks payable to..."
                          className="min-h-[80px]"
                          {...field} 
                          data-testid="textarea-remittance"
                        />
                      </FormControl>
                      <FormDescription>Payment instructions for customers</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" data-testid="button-cancel-create">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-create">
                  {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create Entity
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Billing Entity</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((data) => selectedEntity && updateMutation.mutate({ id: selectedEntity.id, data }))} className="space-y-6">
              <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Basic Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="entityName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Entity Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Transportation LLC" {...field} data-testid="input-edit-entity-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="entityCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Entity Code</FormLabel>
                        <FormControl>
                          <Input placeholder="ACME" maxLength={10} {...field} data-testid="input-edit-entity-code" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="legalName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Legal Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Transportation LLC" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="taxId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tax ID / EIN</FormLabel>
                        <FormControl>
                          <Input placeholder="12-3456789" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  Invoice Numbering
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="invoicePrefix"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Invoice Prefix</FormLabel>
                        <FormControl>
                          <Input placeholder="INV" {...field} data-testid="input-edit-invoice-prefix" />
                        </FormControl>
                        <FormDescription>Prefix for invoice numbers</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="invoiceFormat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Invoice Format</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-invoice-format">
                              <SelectValue placeholder="Select format" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="PREFIX-YYYY-NNNNNN">PREFIX-YYYY-NNNNNN</SelectItem>
                            <SelectItem value="PREFIX-NNNNNN">PREFIX-NNNNNN</SelectItem>
                            <SelectItem value="YYYY-PREFIX-NNNNNN">YYYY-PREFIX-NNNNNN</SelectItem>
                            <SelectItem value="NNNNNN">NNNNNN (Numbers only)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="invoicePadding"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Number Padding</FormLabel>
                        <Select onValueChange={(v) => field.onChange(parseInt(v))} value={String(field.value || 6)}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-invoice-padding">
                              <SelectValue placeholder="Select padding" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="4">4 digits (0001)</SelectItem>
                            <SelectItem value="5">5 digits (00001)</SelectItem>
                            <SelectItem value="6">6 digits (000001)</SelectItem>
                            <SelectItem value="8">8 digits (00000001)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="nextSequence"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Next Sequence Number</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} data-testid="input-edit-next-sequence" />
                        </FormControl>
                        <FormDescription>Warning: Changing may cause gaps</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Invoice Number Preview:</div>
                  <div className="font-mono text-lg mt-1">
                    {generateInvoicePreview(
                      editForm.watch('invoicePrefix'),
                      editForm.watch('invoiceFormat'),
                      editForm.watch('invoicePadding'),
                      editForm.watch('nextSequence')
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Invoice Template Defaults
                </h3>
                <FormField
                  control={editForm.control}
                  name="defaultTermsText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Terms Text</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Payment is due within 30 days of invoice date..."
                          className="min-h-[80px]"
                          {...field} 
                          data-testid="textarea-edit-default-terms"
                        />
                      </FormControl>
                      <FormDescription>Applied to new invoices from this entity</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="footerNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Footer Notes</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Thank you for your business!"
                          className="min-h-[60px]"
                          {...field} 
                          data-testid="textarea-edit-footer-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="remittanceInstructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remittance Instructions</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Please make checks payable to..."
                          className="min-h-[80px]"
                          {...field} 
                          data-testid="textarea-edit-remittance"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" data-testid="button-cancel-edit">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-submit-edit">
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
