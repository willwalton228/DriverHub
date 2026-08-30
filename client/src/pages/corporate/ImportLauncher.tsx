import { useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { ImportWizard } from "@/components/ImportWizard";
import type { ImportModuleConfig } from "@/components/ImportWizard";
import { Button } from "@/components/ui/button";
import { ShieldX, PackageX, ArrowLeft, Loader2 } from "lucide-react";

// ── Module Registry ──────────────────────────────────────────────────────────
// Each moduleKey maps to either a wizard config (rendered inline)
// or a redirect target (legacy / custom import pages).
// To add a new module: extend this registry only — no route changes needed.

type WizardModule = {
  type: "wizard";
  moduleName: string;
  enabled: boolean;
  wizardConfig: ImportModuleConfig;
};

type RedirectModule = {
  type: "redirect";
  moduleName: string;
  enabled: boolean;
  redirectTo: string;
};

type ModuleEntry = WizardModule | RedirectModule;

const MODULE_REGISTRY: Record<string, ModuleEntry> = {
  accounts: {
    type: "wizard",
    moduleName: "Accounts",
    enabled: true,
    wizardConfig: {
      moduleType: "account",
      moduleName: "Accounts",
      apiPrefix: "/api/account-import",
      backHref: "/customers",
      description: "Upload a CSV or XLSX file to create or update customer account records in bulk",
      requiredMappings: ["customerName"],
      defaultMatchKey: "customerName",
      rowPreviewColumns: [
        { key: "customerName", label: "Account Name" },
        { key: "primaryContactName", label: "Primary Contact" },
        { key: "primaryContactEmail", label: "Email" },
        { key: "customerCity", label: "City" },
        { key: "status", label: "Status" },
      ],
      invalidateOnCommit: ["/api/corporate/customers"],
    },
  },

  drivers: {
    type: "wizard",
    moduleName: "Drivers",
    enabled: true,
    wizardConfig: {
      moduleType: "driver",
      moduleName: "Drivers",
      apiPrefix: "/api/driver-import",
      backHref: "/drivers",
      description: "Upload a CSV or XLSX file to create or update driver records in bulk",
      requiredMappings: ["firstName", "lastName", "email"],
      defaultMatchKey: "driverNumber",
      rowPreviewColumns: [
        { key: "firstName", label: "First Name" },
        { key: "lastName", label: "Last Name" },
        { key: "email", label: "Email" },
        { key: "driverType", label: "Type" },
        { key: "status", label: "Status" },
      ],
      invalidateOnCommit: ["/api/corporate/drivers"],
      showImportModeSelector: true,
    },
  },

  claims: {
    type: "wizard",
    moduleName: "Claims",
    enabled: true,
    wizardConfig: {
      moduleType: "claim",
      moduleName: "Claims",
      apiPrefix: "/api/claims-import",
      backHref: "/claims",
      requiredMappings: [],
      defaultMatchKey: "redcapId",
      rowPreviewColumns: [
        { key: "_rawIdentifier", label: "Identifier" },
        { key: "accidentDate", label: "Date" },
        { key: "incidentType", label: "Type" },
        { key: "location", label: "Location" },
        { key: "status", label: "Status" },
      ],
      invalidateOnCommit: ["/api/claims"],
    },
  },

  employees: {
    type: "wizard",
    moduleName: "Employees",
    enabled: true,
    wizardConfig: {
      moduleType: "employee",
      moduleName: "Employees",
      apiPrefix: "/api/employee-import",
      backHref: "/drivers",
      requiredMappings: ["firstName", "lastName", "email"],
      defaultMatchKey: "email",
      rowPreviewColumns: [
        { key: "firstName", label: "First Name" },
        { key: "lastName", label: "Last Name" },
        { key: "email", label: "Email" },
        { key: "title", label: "Title" },
        { key: "status", label: "Status" },
      ],
      invalidateOnCommit: ["/api/employees"],
    },
  },

  recruiting: {
    type: "redirect",
    moduleName: "Recruiting",
    enabled: true,
    redirectTo: "/recruiting/import",
  },
};

// ── Screen helpers ────────────────────────────────────────────────────────────

function ScreenShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      {children}
    </div>
  );
}

function AccessDeniedScreen() {
  return (
    <ScreenShell>
      <ShieldX className="h-14 w-14 text-destructive mb-4 opacity-80" />
      <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
      <p className="text-muted-foreground mb-6 max-w-sm">
        Data imports require Super Admin access. Contact your administrator if you need this capability.
      </p>
      <Link href="/">
        <Button variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </Link>
    </ScreenShell>
  );
}

function ModuleNotFoundScreen({ moduleKey }: { moduleKey: string }) {
  return (
    <ScreenShell>
      <PackageX className="h-14 w-14 text-muted-foreground mb-4 opacity-60" />
      <h2 className="text-xl font-semibold mb-2">Module Not Found</h2>
      <p className="text-muted-foreground mb-6 max-w-sm">
        <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-sm">{moduleKey}</span> is not a recognized import module.
      </p>
      <Link href="/">
        <Button variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </Link>
    </ScreenShell>
  );
}

function ModuleDisabledScreen({ moduleName }: { moduleName: string }) {
  return (
    <ScreenShell>
      <PackageX className="h-14 w-14 text-muted-foreground mb-4 opacity-60" />
      <h2 className="text-xl font-semibold mb-2">Module Not Enabled</h2>
      <p className="text-muted-foreground mb-6 max-w-sm">
        The <strong>{moduleName}</strong> import module is not enabled for this organization. Contact support to enable it.
      </p>
      <Link href="/">
        <Button variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </Link>
    </ScreenShell>
  );
}

function RedirectingScreen({ moduleName }: { moduleName: string }) {
  return (
    <ScreenShell>
      <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mb-4" />
      <p className="text-muted-foreground">Opening {moduleName} import&hellip;</p>
    </ScreenShell>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ImportLauncher() {
  const { moduleKey = "" } = useParams<{ moduleKey: string }>();
  const [, setLocation] = useLocation();
  const { isSuperAdmin, isAuthenticated } = useAuth();

  const moduleEntry = MODULE_REGISTRY[moduleKey];

  // Handle redirect-type modules: transparent pass-through to legacy import page
  useEffect(() => {
    if (
      isAuthenticated &&
      isSuperAdmin &&
      moduleEntry?.type === "redirect" &&
      moduleEntry.enabled
    ) {
      setLocation(moduleEntry.redirectTo);
    }
  }, [isAuthenticated, isSuperAdmin, moduleEntry, setLocation]);

  // Auth guard
  if (!isAuthenticated || !isSuperAdmin) {
    return <AccessDeniedScreen />;
  }

  // Module not registered
  if (!moduleEntry) {
    return <ModuleNotFoundScreen moduleKey={moduleKey} />;
  }

  // Module disabled
  if (!moduleEntry.enabled) {
    return <ModuleDisabledScreen moduleName={moduleEntry.moduleName} />;
  }

  // Redirect type: show transient loading while useEffect fires
  if (moduleEntry.type === "redirect") {
    return <RedirectingScreen moduleName={moduleEntry.moduleName} />;
  }

  // Wizard type: render the shared ImportWizard inline
  return <ImportWizard moduleConfig={moduleEntry.wizardConfig} />;
}
