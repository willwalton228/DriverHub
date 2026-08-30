export { reportingRegistry } from "./registry";
export type {
  SubjectDef,
  FieldDef,
  FieldGroupDef,
  RelationshipDef,
  RelationshipCardinality,
} from "./registry";

// Side-effect imports: each file calls reportingRegistry.registerSubject(...)
// Add a new import here whenever a new subject module is created.
import "./subjects/drivers";
