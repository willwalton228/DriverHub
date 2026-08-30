import { ImportWizard } from "@/components/ImportWizard";
import { ImportAccessGuard } from "@/components/ImportAccessGuard";
import type { ImportModuleConfig } from "@/components/ImportWizard";

const CLAIMS_MODULE_CONFIG: ImportModuleConfig = {
  moduleType: "claim",
  moduleName: "Claims",
  apiPrefix: "/api/claims-import",
  backHref: "/claims",
  description: "Upload a CSV or XLSX file to bulk import claims records. Supports Initial Load Mode for data with missing driver links.",
  requiredMappings: [],
  defaultMatchKey: "redcapId",
  rowPreviewColumns: [
    { key: "redcapId", label: "RC ID" },
    { key: "accidentDate", label: "Incident Date" },
    { key: "incidentType", label: "Type" },
    { key: "location", label: "Location" },
    { key: "status", label: "Status" },
  ],
  invalidateOnCommit: ["/api/claims", "/api/corporate/accidents"],
};

export default function ClaimsImport() {
  return (
    <ImportAccessGuard module="claims">
      <ImportWizard moduleConfig={CLAIMS_MODULE_CONFIG} />
    </ImportAccessGuard>
  );
}
