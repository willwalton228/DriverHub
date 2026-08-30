
const fs = require('fs');
const path = '/home/runner/workspace/client/src/pages/corporate/Vendors.tsx';
let content = fs.readFileSync(path, 'utf8');

const DEFAULT_CODING_COMPONENT = `
function DefaultCodingTab({ vendorId }: { vendorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const defaultForm = { defaultGlAccount: '', defaultDepartment: '', defaultClassCode: '', defaultLocation: '', defaultPaymentTerms: '', defaultBillableFlag: false };
  const [form, setForm] = useState({ ...defaultForm });

  const { data: coding, isLoading: codingLoading } = useQuery<any>({
    queryKey: ['/api/vendors', vendorId, 'default-coding'],
    queryFn: () => apiRequest('GET', \`/api/vendors/\${vendorId}/default-coding\`),
  });

  const saveCodingMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PUT', \`/api/vendors/\${vendorId}/default-coding\`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendors', vendorId, 'default-coding'] });
      setEditing(false);
      toast({ title: 'Default coding saved' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  function startEdit() {
    setForm({
      defaultGlAccount: coding?.defaultGlAccount || '',
      defaultDepartment: coding?.defaultDepartment || '',
      defaultClassCode: coding?.defaultClassCode || '',
      defaultLocation: coding?.defaultLocation || '',
      defaultPaymentTerms: coding?.defaultPaymentTerms || '',
      defaultBillableFlag: coding?.defaultBillableFlag || false,
    });
    setEditing(true);
  }

  const codingFields: Array<[string, keyof typeof defaultForm, string]> = [
    ['Default GL Account', 'defaultGlAccount', 'e.g. 6000-Vendor Expenses'],
    ['Default Department', 'defaultDepartment', 'e.g. Operations'],
    ['Default Class', 'defaultClassCode', 'e.g. Fleet'],
    ['Default Location', 'defaultLocation', 'e.g. Chicago'],
    ['Default Payment Terms', 'defaultPaymentTerms', 'e.g. Net 30'],
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Default AP Coding Rules</CardTitle>
          </div>
          {!editing && (
            <Button size="sm" variant="outline" onClick={startEdit} data-testid="button-edit-default-coding">
              {coding ? 'Edit' : 'Configure'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {codingLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : editing ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">These defaults will auto-populate new payables created for this vendor.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {codingFields.map(([label, key, placeholder]) => (
                <div key={key} className="space-y-1.5">
                  <Label className="text-sm">{label}</Label>
                  <Input value={String(form[key] || '')} onChange={(e: any) => setForm((f: any) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder} data-testid={\`input-coding-\${key}\`} />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="default-billable" checked={Boolean(form.defaultBillableFlag)}
                  onChange={(e: any) => setForm((f: any) => ({ ...f, defaultBillableFlag: e.target.checked }))}
                  data-testid="checkbox-default-billable" />
                <Label htmlFor="default-billable" className="text-sm">Mark charges as billable by default</Label>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={() => saveCodingMutation.mutate(form)} disabled={saveCodingMutation.isPending} data-testid="button-save-default-coding">
                {saveCodingMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : coding ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">These defaults auto-populate on new payables for this vendor.</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {([
                ['GL Account', coding.defaultGlAccount],
                ['Department', coding.defaultDepartment],
                ['Class', coding.defaultClassCode],
                ['Location', coding.defaultLocation],
                ['Payment Terms', coding.defaultPaymentTerms],
                ['Billable by Default', coding.defaultBillableFlag ? 'Yes' : 'No'],
              ] as [string, any][]).map(([label, val]) => (
                <div key={label} className="flex gap-2">
                  <span className="text-muted-foreground w-36 shrink-0">{label}:</span>
                  <span className="font-medium">{val || <span className="text-muted-foreground italic">Not set</span>}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No default coding configured</p>
            <p className="text-xs mt-1">Click Configure to set GL account, department, and other AP defaults for this vendor.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

`;

// Insert before ContractFormDialog function
if (content.includes('function ContractFormDialog({')) {
  content = content.replace(
    'function ContractFormDialog({',
    DEFAULT_CODING_COMPONENT + 'function ContractFormDialog({'
  );
  fs.writeFileSync(path, content, 'utf8');
  console.log('DefaultCodingTab component added, length:', content.length);
} else {
  console.log('ERROR: ContractFormDialog marker not found');
}
