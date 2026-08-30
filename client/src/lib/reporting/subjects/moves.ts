import { Truck } from "lucide-react";
import { frontendRegistry } from "../registry";

frontendRegistry.register({
  id:    "moves",
  label: "Moves",
  icon:  Truck,
  color: "text-emerald-500",
  defaultFields: ["mv_workType", "mv_account", "mv_serviceDate"],
  fieldGroups: [
    {
      label: "Move",
      fields: [
        { key: "mv_workType",      label: "Work Type",      filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "mv_executionMode", label: "Execution Mode", filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "mv_account",       label: "Move Account",   filterable: true, groupable: true, sortable: true },
        { key: "mv_market",        label: "Move Market",    filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "mv_serviceDate",   label: "Service Date",   sortable: true },
        { key: "mv_origin",        label: "Origin Address", sortable: true },
        { key: "mv_destination",   label: "Destination",    sortable: true },
        { key: "mv_billRate",      label: "Bill Rate",      sortable: true },
        { key: "mv_zone",          label: "Zone",           filterable: true, groupable: true, sortable: true, capitalizeValue: true },
      ],
    },
  ],
});

frontendRegistry.addRelationship({
  id:              "drivers_moves",
  sourceSubjectId: "drivers",
  targetSubjectId: "moves",
  label:           "Moves",
  reportingAllowed: true,
});
