import { ImportWizard } from "@/components/ImportWizard";
import type { ImportModuleConfig } from "@/components/ImportWizard";

const ACCOUNT_PREVIEW_COLUMNS: ImportModuleConfig["rowPreviewColumns"] = [
  { key: "customerName", label: "Account Name" },
  { key: "primaryContactName", label: "Primary Contact" },
  { key: "primaryContactEmail", label: "Email" },
  { key: "customerCity", label: "City" },
  { key: "status", label: "Status" },
];

const ACCOUNT_MODULE_CONFIG: ImportModuleConfig = {
  moduleType: "account",
  moduleName: "Accounts",
  apiPrefix: "/api/account-import",
  backHref: "/customers",
  description: "Upload a CSV or XLSX file to create or update customer account records in bulk",
  requiredMappings: ["customerName"],
  defaultMatchKey: "customerName",
  rowPreviewColumns: ACCOUNT_PREVIEW_COLUMNS,
  invalidateOnCommit: ["/api/corporate/customers"],
};

export default function AccountImport() {
  return <ImportWizard moduleConfig={ACCOUNT_MODULE_CONFIG} />;
}
