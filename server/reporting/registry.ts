/**
 * Reporting Relationship Framework — Backend Registry
 *
 * Register subjects (datasets) and the approved relationships between them.
 * Report-builder preview and export endpoints derive their allowlisted column
 * maps and JOIN clauses from this registry so that adding a new module only
 * requires one new file — no changes to endpoint code.
 *
 * Usage
 * ─────
 *   import { reportingRegistry } from "./reporting";
 *
 *   // Add a new subject
 *   reportingRegistry.registerSubject({ id: "moves", ... });
 *
 *   // Approve a join between two subjects
 *   reportingRegistry.registerRelationship({
 *     id: "drivers_moves",
 *     sourceSubjectId: "drivers",
 *     targetSubjectId: "moves",
 *     joinSql: "LEFT JOIN move_snapshots ms ON ms.driver_id = d.id",
 *     joinCondition: "ms.driver_id = d.id",
 *     cardinality: "one_to_many",
 *     reportingAllowed: true,
 *     label: "Moves",
 *     relatedFieldGroups: [...],
 *   });
 */

export interface FieldDef {
  key: string;
  /** Human-readable column label (used in Excel headers, grouped result labels) */
  label: string;
  /** Safe SQL expression for SELECT / ORDER BY */
  sqlExpr: string;
  dataType: "string" | "number" | "date" | "boolean" | "currency" | "percent";
  /** May appear in the filter dropdown */
  filterable?: boolean;
  /** May appear in the GROUP BY dropdowns */
  groupable?: boolean;
  /** May appear as a sort column */
  sortable?: boolean;
  /** Roles required to include this field. Undefined = no restriction. */
  requiresRole?: string[];
  /** When true DB enum values (e.g. "active") are title-cased in export output. */
  capitalizeValue?: boolean;
  /**
   * Custom SQL expression for use inside a GROUP BY aggregation context.
   * When absent:
   *   - dataType "currency" auto-generates ROUND(SUM(sqlExpr)::numeric, 2)
   *     (fallback; prefer providing an explicit aggregateExpr that sums raw
   *      columns before rounding to avoid double-rounding errors)
   *   - dataType "percent"  is excluded unless aggregateExpr is provided
   *   - all other dataTypes are excluded from aggregation
   */
  aggregateExpr?: string;
}

export interface FieldGroupDef {
  label: string;
  fields: FieldDef[];
}

export interface SubjectDef {
  /** Lowercase identifier, e.g. "drivers" */
  id: string;
  /** Display name, e.g. "Drivers" */
  label: string;
  /**
   * SQL FROM clause + required JOINs.
   * Must expose all table aliases referenced in FieldDef.sqlExpr.
   */
  baseJoin: string;
  /** Default WHERE conditions always applied (e.g. exclude archived rows) */
  baseWhere: string;
  fieldGroups: FieldGroupDef[];
  /** Keys selected when the report is first created */
  defaultFields: string[];
  /**
   * Column that uniquely identifies a drillable row (e.g. "d.id" for drivers).
   * Emitted as "_rowId" in SELECT so the frontend can build detail-page links.
   */
  rowIdColumn?: string;
  /** Roles required to use this subject. Undefined = no restriction. */
  requiresRole?: string[];
}

export type RelationshipCardinality =
  | "one_to_one"
  | "one_to_many"
  | "many_to_one"
  | "many_to_many";

/**
 * Controls how related rows are joined to the primary subject.
 * - "primary_only"  → filters to a single representative record (e.g. is_primary = true); 1 row per primary subject row.
 * - "all_records"   → full lateral join; may produce duplicate primary-subject rows.
 * - "summary"       → pre-aggregated subquery; 1 row per primary-subject row with aggregate metrics.
 */
export type RelationshipMode = "primary_only" | "all_records" | "summary";

export interface RelationshipDef {
  id: string;
  sourceSubjectId: string;
  targetSubjectId: string;
  /**
   * SQL ON condition documenting the join key (informational).
   */
  joinCondition: string;
  /**
   * SQL fragment appended to the primary subject's FROM/JOIN clause.
   * Must use table aliases that don't conflict with the primary subject.
   * Used for "all_records" mode (current/default for non-primary-aware relationships).
   */
  joinSql: string;
  /**
   * Whether this relationship supports a "primary_only" grain mode.
   * When true, the default grain mode for this relationship is "primary_only".
   */
  supportsPrimaryOnly?: boolean;
  /**
   * JOIN SQL used when grain mode is "primary_only".
   * Falls back to joinSql if undefined.
   */
  primaryOnlyJoinSql?: string;
  /**
   * JOIN SQL used when grain mode is "summary".
   * Falls back to primaryOnlyJoinSql, then joinSql, if undefined.
   */
  summaryJoinSql?: string;
  /**
   * Extra field groups exposed only when grain mode is "summary"
   * (e.g. aggregate counts, rolled-up metrics).
   */
  summaryFieldGroups?: FieldGroupDef[];
  cardinality: RelationshipCardinality;
  /** If false, the relationship exists but is not exposed in the report builder */
  reportingAllowed: boolean;
  /** Label shown in the field-grouping panel for the related dataset */
  label: string;
  requiresRole?: string[];
  /**
   * Field definitions exposed via this relationship.
   * Keys must be globally unique — use a module prefix (e.g. "acct_name").
   */
  relatedFieldGroups: FieldGroupDef[];
}

// ─────────────────────────────────────────────────────────────────────────────

export class ReportingRegistry {
  private _subjects = new Map<string, SubjectDef>();
  private _relationships: RelationshipDef[] = [];

  registerSubject(def: SubjectDef): this {
    this._subjects.set(def.id, def);
    return this;
  }

  registerRelationship(def: RelationshipDef): this {
    this._relationships.push(def);
    return this;
  }

  getSubject(id: string): SubjectDef | undefined {
    return this._subjects.get(id);
  }

  getAllSubjects(): SubjectDef[] {
    return [...this._subjects.values()];
  }

  /** All relationships originating from a source subject */
  getRelationships(sourceSubjectId: string): RelationshipDef[] {
    return this._relationships.filter(r => r.sourceSubjectId === sourceSubjectId);
  }

  /**
   * Relationships currently approved for the report builder,
   * optionally filtered by user role.
   */
  getApprovedRelationships(sourceSubjectId: string, userRole?: string): RelationshipDef[] {
    return this.getRelationships(sourceSubjectId).filter(r => {
      if (!r.reportingAllowed) return false;
      if (r.requiresRole?.length && userRole && !r.requiresRole.includes(userRole)) return false;
      return true;
    });
  }

  // ── Single-subject query-building helpers ───────────────────────────────────

  /**
   * key → sqlExpr for every field in the subject.
   * Allowlists SELECT columns and ORDER BY expressions.
   */
  buildFieldMap(subjectId: string, userRole?: string): Record<string, string> {
    const subj = this._subjects.get(subjectId);
    if (!subj) return {};
    const map: Record<string, string> = {};
    for (const grp of subj.fieldGroups)
      for (const f of grp.fields) {
        // Enforce role gate: skip if field requires a role the caller doesn't have.
        // Secure default: deny when userRole is absent and restriction is present.
        if (f.requiresRole?.length && (!userRole || !f.requiresRole.includes(userRole))) continue;
        map[f.key] = f.sqlExpr;
      }
    return map;
  }

  /**
   * key → sqlExpr for fields that may appear in GROUP BY / filter expressions
   * (i.e. fields with `groupable: true`).
   */
  buildGroupMap(subjectId: string): Record<string, string> {
    const subj = this._subjects.get(subjectId);
    if (!subj) return {};
    const map: Record<string, string> = {};
    for (const grp of subj.fieldGroups)
      for (const f of grp.fields)
        if (f.groupable) map[f.key] = f.sqlExpr;
    return map;
  }

  /** key → label map for all fields (used for Excel column headers, grouped result labels) */
  buildLabelMap(subjectId: string): Record<string, string> {
    const subj = this._subjects.get(subjectId);
    if (!subj) return {};
    const map: Record<string, string> = {};
    for (const grp of subj.fieldGroups)
      for (const f of grp.fields)
        map[f.key] = f.label;
    return map;
  }

  /** All filterable FieldDef entries for a subject */
  getFilterableFields(subjectId: string): FieldDef[] {
    return this._subjects.get(subjectId)
      ?.fieldGroups.flatMap(g => g.fields.filter(f => f.filterable))
      ?? [];
  }

  // ── Multi-module query-building helpers ─────────────────────────────────────

  /**
   * Build merged field/group/label maps and extended JOIN SQL for a
   * multi-module query.  Call this in preview and export endpoints instead
   * of the individual single-subject helpers.
   *
   * @param primarySubjectId  The primary subject (e.g. "drivers")
   * @param includedModuleIds Related subject IDs chosen by the user (e.g. ["accounts","moves"])
   * @param userRole          Caller's role — used to enforce requiresRole restrictions
   * @param moduleGrainModes  Per-module grain mode overrides.  Keys are targetSubjectId values.
   *                          When omitted the default mode is derived from the relationship definition
   *                          (supportsPrimaryOnly → "primary_only", else → "all_records").
   */
  buildMultiModuleComponents(
    primarySubjectId: string,
    includedModuleIds: string[],
    userRole?: string,
    moduleGrainModes?: Record<string, string>,
  ): {
    joinSql:      string;
    fieldMap:     Record<string, string>;
    groupMap:     Record<string, string>;
    labelMap:     Record<string, string>;
    /** Keys of fields whose dataType is "currency" — used for $X,XXX.XX formatting. */
    currencyFields: Set<string>;
    /** Keys of fields whose dataType is "percent" — used for XX.X% formatting. */
    percentFields: Set<string>;
    /** Keys of fields with capitalizeValue=true — used for Title Case formatting in export. */
    capitalizeFields: Set<string>;
    /**
     * key → aggregate SQL expression for use in GROUP BY queries.
     * Built for every field that can meaningfully aggregate:
     *   - "currency" fields  → ROUND(SUM(sqlExpr)::numeric, 2)  (or custom aggregateExpr)
     *   - "percent" fields   → custom aggregateExpr only (omitted if none provided)
     * Fields not in this map produce no aggregate column in grouped queries.
     */
    aggregateMap: Record<string, string>;
  } {
    const primary = this._subjects.get(primarySubjectId);
    if (!primary) throw new Error(`Subject "${primarySubjectId}" not found in registry`);

    let joinSql  = primary.baseJoin;
    // Pass userRole so role-gated primary-subject fields are excluded from FIELD_MAP.
    const fieldMap: Record<string, string> = this.buildFieldMap(primarySubjectId, userRole);
    const groupMap: Record<string, string> = this.buildGroupMap(primarySubjectId);
    const labelMap: Record<string, string> = this.buildLabelMap(primarySubjectId);

    // Collect currency / percent / capitalize / aggregate from the primary subject.
    // Mirror the same role gate used in buildFieldMap so AGG_MAP stays consistent.
    const currencyFields  = new Set<string>();
    const percentFields   = new Set<string>();
    const capitalizeFields = new Set<string>();
    const aggregateMap: Record<string, string> = {};

    const canAccessField = (f: FieldDef) =>
      !f.requiresRole?.length || (!!userRole && f.requiresRole.includes(userRole));

    const registerField = (f: FieldDef) => {
      if (f.dataType === "currency") {
        currencyFields.add(f.key);
        // Use custom aggregateExpr or fall back to SUM wrapping
        aggregateMap[f.key] = f.aggregateExpr ?? `ROUND(SUM(${f.sqlExpr})::numeric, 2)`;
      } else if (f.dataType === "percent") {
        percentFields.add(f.key);
        // Only aggregatable when an explicit aggregateExpr is provided (weighted avg etc.)
        if (f.aggregateExpr) aggregateMap[f.key] = f.aggregateExpr;
      }
      if (f.capitalizeValue) capitalizeFields.add(f.key);
    };

    for (const grp of primary.fieldGroups)
      for (const f of grp.fields)
        if (canAccessField(f)) registerField(f);

    if (includedModuleIds.length > 0) {
      const approved = this.getApprovedRelationships(primarySubjectId, userRole);
      for (const moduleId of includedModuleIds) {
        const rel = approved.find(r => r.targetSubjectId === moduleId);
        if (!rel) continue;

        // Resolve the effective grain mode for this module
        const defaultMode: RelationshipMode = rel.supportsPrimaryOnly ? "primary_only" : "all_records";
        const mode = (moduleGrainModes?.[moduleId] ?? defaultMode) as RelationshipMode;

        // Select the correct JOIN SQL fragment for the chosen mode
        let effectiveJoinSql = rel.joinSql;
        if (mode === "primary_only") {
          effectiveJoinSql = rel.primaryOnlyJoinSql ?? rel.joinSql;
        } else if (mode === "summary") {
          effectiveJoinSql = rel.summaryJoinSql ?? rel.primaryOnlyJoinSql ?? rel.joinSql;
        }

        joinSql += `\n  ${effectiveJoinSql}`;

        // Regular relationship fields (always included)
        for (const grp of rel.relatedFieldGroups) {
          for (const f of grp.fields) {
            if (f.requiresRole?.length && userRole && !f.requiresRole.includes(userRole)) continue;
            fieldMap[f.key] = f.sqlExpr;
            labelMap[f.key] = f.label;
            if (f.groupable) groupMap[f.key] = f.sqlExpr;
            registerField(f);
          }
        }

        // Summary-only fields — only injected into the field map when mode is "summary"
        if (mode === "summary" && rel.summaryFieldGroups) {
          for (const grp of rel.summaryFieldGroups) {
            for (const f of grp.fields) {
              if (f.requiresRole?.length && userRole && !f.requiresRole.includes(userRole)) continue;
              fieldMap[f.key] = f.sqlExpr;
              labelMap[f.key] = f.label;
              if (f.groupable) groupMap[f.key] = f.sqlExpr;
              registerField(f);
            }
          }
        }
      }
    }

    return { joinSql, fieldMap, groupMap, labelMap, currencyFields, percentFields, capitalizeFields, aggregateMap };
  }
}

export const reportingRegistry = new ReportingRegistry();
