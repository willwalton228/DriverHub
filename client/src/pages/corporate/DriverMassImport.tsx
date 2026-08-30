import { ImportWizard } from "@/components/ImportWizard";
import type { ImportModuleConfig } from "@/components/ImportWizard";

const DRIVER_PREVIEW_COLUMNS: ImportModuleConfig["rowPreviewColumns"] = [
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "driverType", label: "Type" },
  { key: "status", label: "Status" },
];

const DRIVER_MODULE_CONFIG: ImportModuleConfig = {
  moduleType: "driver",
  moduleName: "Drivers",
  apiPrefix: "/api/driver-import",
  backHref: "/drivers",
  description: "Upload a CSV or XLSX file to create or update driver records in bulk",
  requiredMappings: ["firstName", "lastName", "email"],
  defaultMatchKey: "driverNumber",
  rowPreviewColumns: DRIVER_PREVIEW_COLUMNS,
  invalidateOnCommit: ["/api/corporate/drivers"],
  preflight: true,
};

export default function DriverMassImport() {
  return <ImportWizard moduleConfig={DRIVER_MODULE_CONFIG} />;
}
