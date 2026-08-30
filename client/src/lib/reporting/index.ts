export { frontendRegistry } from "./registry";
export type {
  FrontendSubjectDef,
  FrontendFieldDef,
  FrontendFieldGroupDef,
  FrontendRelationshipDef,
} from "./registry";

// Side-effect imports: each file calls frontendRegistry.register(...)
// Add a new import here whenever a new subject module is created.
import "./subjects/drivers";
import "./subjects/accounts";
import "./subjects/moves";
import "./subjects/claims";
