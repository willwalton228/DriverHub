import { Building2 } from "lucide-react";
import { frontendRegistry } from "../registry";

frontendRegistry.register({
  id:    "accounts",
  label: "Accounts",
  icon:  Building2,
  color: "text-blue-500",
  defaultFields: ["acct_name", "acct_status"],
  fieldGroups: [
    {
      label: "Account",
      fields: [
        { key: "acct_name",      label: "Account Name",       filterable: true, groupable: true, sortable: true },
        { key: "acct_status",    label: "Account Status",     filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "acct_type",      label: "Account Type",       filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "acct_group",     label: "Account Group",      filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "acct_city",      label: "Account City",       filterable: true, groupable: true, sortable: true },
        { key: "acct_state",     label: "Account State",      filterable: true, groupable: true, sortable: true },
        { key: "acct_isPrimary", label: "Is Primary Account", filterable: true, groupable: true, sortable: true },
      ],
    },
    {
      label: "Account Summary",
      fields: [
        { key: "acct_count", label: "Account Count", sortable: true },
      ],
    },
  ],
});

frontendRegistry.addRelationship({
  id:               "drivers_accounts",
  sourceSubjectId:  "drivers",
  targetSubjectId:  "accounts",
  label:            "Accounts",
  reportingAllowed: true,
  supportsPrimaryOnly: true,
});
