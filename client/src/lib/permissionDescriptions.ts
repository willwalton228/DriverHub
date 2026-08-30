/**
 * Centralized permission and role descriptions for DriverHub.
 *
 * To add a new role or permission, add an entry to the relevant object here.
 * No other files need to be changed for the tooltip to appear automatically
 * wherever <PermissionInfo> is used with that key.
 */

export interface PermissionDescription {
  title: string;
  /** One-sentence summary shown at the top of the tooltip. */
  summary: string;
  /** Bullet-point list of what this role/permission allows. */
  allows: string[];
  /** Optional caveat shown below the bullets. */
  note?: string;
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const ROLE_DESCRIPTIONS: Record<string, PermissionDescription> = {
  super_user: {
    title: "Super Admin",
    summary: "Full unrestricted access to all DriverHub systems and data.",
    allows: [
      "Access and manage all modules across the platform",
      "Create, edit, and disable any user account",
      "Grant or revoke all roles and permissions",
      "Access all financial, compliance, and audit records",
      "Manage system-level configuration and integrations",
    ],
    note: "This role cannot be granted by Corporate Access Admins.",
  },
  admin: {
    title: "Administrator",
    summary: "Full administrative access, subordinate only to Super Admin.",
    allows: [
      "Manage all users below Super Admin level",
      "Access all corporate modules and reports",
      "Assign modules and vendor permissions to users",
      "Manage driver and employee records",
    ],
  },
  corporate_admin: {
    title: "Corporate Admin",
    summary: "Administrative access to corporate and HR functions.",
    allows: [
      "Access all corporate-level modules",
      "Manage employee records and onboarding",
      "View accounting and HR reports",
      "Invite and manage corporate users",
    ],
  },
  corporate: {
    title: "Corporate User",
    summary: "Standard access to assigned corporate operations.",
    allows: [
      "Access explicitly assigned corporate modules",
      "View driver and employee records within module scope",
      "Submit and process standard operational tasks",
    ],
    note: "Access is limited to the modules assigned via the Modules action.",
  },
  finance: {
    title: "Finance",
    summary: "Access limited to financial modules and reporting.",
    allows: [
      "View and manage accounts payable and receivable",
      "Access financial reports and data exports",
      "Process invoices and expense records",
    ],
  },
  recruiter: {
    title: "Recruiter",
    summary: "Access limited to recruiting and hiring workflows.",
    allows: [
      "View and manage recruiting pipelines",
      "Process driver and employee applications",
      "Access onboarding and background-check workflows",
    ],
  },
  regional_cl: {
    title: "Regional CL",
    summary: "Compliance liaison with regional scope.",
    allows: [
      "Manage compliance records for regional accounts",
      "View and process certification workflows",
      "Access regional driver compliance status",
    ],
  },
  network_cl: {
    title: "Network CL",
    summary: "Compliance liaison with network-wide scope.",
    allows: [
      "Manage compliance across multiple regions",
      "Oversee network-level certification workflows",
      "Access compliance reports across all accounts",
    ],
  },
  dealer_cl: {
    title: "Dealer CL",
    summary: "Compliance liaison scoped to dealer accounts.",
    allows: [
      "Manage compliance records for dealer accounts",
      "Process dealer-specific certification workflows",
    ],
  },
  certification_liaison: {
    title: "Certification Liaison",
    summary: "Manages certification and credentialing workflows.",
    allows: [
      "Review and approve driver certifications",
      "Process credentialing documents",
      "Track certification expiry and renewal status",
    ],
  },
  custom_user_list: {
    title: "Custom User List",
    summary: "Role with a manually curated set of module access permissions.",
    allows: [
      "Access only the specific modules explicitly assigned by an administrator",
    ],
    note: "Module assignments must be configured separately via the Modules action.",
  },
  driver: {
    title: "Driver User",
    summary: "Access limited to the Driver Portal.",
    allows: [
      "View personal driver profile and uploaded documents",
      "Access assigned shift schedules and attendance records",
      "Submit documents and forms through the Driver Portal",
    ],
    note: "Driver Users must be linked to an active Driver record to access DriverHub.",
  },
  employee: {
    title: "Employee User",
    summary: "Access limited to the Employee Portal.",
    allows: [
      "View personal employee profile and leave records",
      "Access HR self-service features",
      "Submit timesheets and expense reports",
    ],
    note: "Employee Users must have an active Employee record (no termination date) to access DriverHub.",
  },
  testing: {
    title: "Testing",
    summary: "Non-production role used for QA and platform testing.",
    allows: [
      "Access test-mode features and sandbox data",
      "Simulate user flows without affecting production records",
    ],
    note: "Do not assign this role to real end users.",
  },
  integration_user: {
    title: "Integration User",
    summary: "System-to-system service account for API integrations.",
    allows: [
      "Authenticate via the DriverConnect V2 API using a Bearer token",
      "Access permitted API endpoints programmatically",
      "Operate without interactive login or dashboard access",
    ],
    note: "Integration Users cannot access the corporate dashboard and are exempt from Driver/Employee eligibility checks.",
  },
};

// ---------------------------------------------------------------------------
// Administrative permission toggles
// ---------------------------------------------------------------------------

export const CORPORATE_ACCESS_ADMIN_DESCRIPTION: PermissionDescription = {
  title: "Corporate Access Admin",
  summary: "Delegated administrative capability layered on top of any corporate role.",
  allows: [
    "Create and manage user accounts",
    "Assign application modules to users",
    "Access the Accounting module",
    "View all modules across DriverHub",
    "Perform delegated administrative functions",
  ],
  note: "Does not grant full Super Admin privileges. Cannot create or manage Super Admin accounts.",
};

export const MODULES_DESCRIPTION: PermissionDescription = {
  title: "Module Assignments",
  summary: "Controls which DriverHub modules this user can see and access.",
  allows: [
    "Users only see the modules they are explicitly assigned to",
    "Super Admins and Admins automatically see all modules",
    "Module access is enforced across the entire platform",
  ],
  note: "Users with no modules assigned cannot access any corporate features.",
};

export const VENDOR_ACCESS_DESCRIPTION: PermissionDescription = {
  title: "Vendor Module Permissions",
  summary: "Granular access controls for the Vendor module.",
  allows: [
    "Independently control read, write, and management actions",
    "Restrict users to view-only or allow full vendor management",
    "Permissions apply only within the Vendor module",
  ],
};

// ---------------------------------------------------------------------------
// Vendor module permission granulars
// ---------------------------------------------------------------------------

export const VENDOR_PERM_DESCRIPTIONS: Record<string, PermissionDescription> = {
  canView: {
    title: "View Vendors",
    summary: "Access the vendor list and individual vendor detail pages.",
    allows: [
      "Browse the full vendor directory",
      "View vendor contact info, status, and profile details",
    ],
    note: "Required for any other vendor permission to be useful.",
  },
  canCreate: {
    title: "Create Vendors",
    summary: "Add new vendors to the system.",
    allows: [
      "Submit the new-vendor form",
      "Create vendor profiles from scratch",
    ],
  },
  canEdit: {
    title: "Edit Vendors",
    summary: "Modify existing vendor information.",
    allows: [
      "Update contact details, status, and profile fields",
      "Edit vendor records created by any user",
    ],
  },
  canDelete: {
    title: "Archive Vendors",
    summary: "Deactivate or archive vendor records.",
    allows: [
      "Mark vendors as inactive or archived",
      "Remove vendors from active lists without permanent deletion",
    ],
  },
  canManageContracts: {
    title: "Manage Contracts",
    summary: "View and edit vendor contracts.",
    allows: [
      "Upload and update contract documents",
      "Edit contract terms, dates, and status",
    ],
  },
  canManagePricing: {
    title: "Manage Pricing",
    summary: "View and edit vendor pricing schedules.",
    allows: [
      "Access and update rate cards and pricing tiers",
      "Edit billing rates associated with vendor contracts",
    ],
  },
  canManageDocuments: {
    title: "Manage Documents",
    summary: "Upload and manage vendor-related documents.",
    allows: [
      "Upload, replace, and delete vendor documents",
      "Organize the vendor document library",
    ],
  },
  canManageNotes: {
    title: "Manage Notes",
    summary: "Add and edit internal notes on vendor records.",
    allows: [
      "Create new notes on any vendor",
      "Edit or delete existing notes",
    ],
  },
  canManageCompliance: {
    title: "Manage Compliance",
    summary: "Handle compliance records and certifications for vendors.",
    allows: [
      "Upload and verify compliance documents",
      "Update certification status and expiry dates",
      "Manage insurance and credentialing records",
    ],
  },
  canManageRenewals: {
    title: "Manage Renewals",
    summary: "Manage contract renewals and auto-renewal settings.",
    allows: [
      "Trigger and process contract renewal workflows",
      "Configure auto-renewal rules and notice periods",
    ],
  },
};
