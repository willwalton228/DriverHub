import { AlertTriangle } from "lucide-react";
import { frontendRegistry } from "../registry";

frontendRegistry.register({
  id:    "claims",
  label: "Claims",
  icon:  AlertTriangle,
  color: "text-rose-500",
  defaultFields: ["claim_status", "claim_type", "claim_date"],
  fieldGroups: [
    {
      label: "Claim",
      fields: [
        { key: "claim_status",     label: "Claim Status",    filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "claim_type",       label: "Claim Type",      filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "claim_severity",   label: "Claim Severity",  filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "claim_date",       label: "Accident Date",   sortable: true },
        { key: "claim_location",   label: "Claim Location",  filterable: true, groupable: true, sortable: true },
        { key: "claim_injuries",   label: "Injuries",        filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "claim_totalEst",   label: "Total Estimate",  sortable: true, isCurrency: true },
        { key: "claim_actualCost", label: "Actual Cost",     sortable: true, isCurrency: true },
      ],
    },
  ],
});

frontendRegistry.addRelationship({
  id:              "drivers_claims",
  sourceSubjectId: "drivers",
  targetSubjectId: "claims",
  label:           "Claims",
  reportingAllowed: true,
});
