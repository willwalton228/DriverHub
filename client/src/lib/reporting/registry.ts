/**
 * Reporting Relationship Framework — Frontend Registry
 *
 * Mirror of the backend registry that drives the Report Builder UI:
 * field group panels, filter dropdowns, group-by selectors, subject icons.
 *
 * SQL expressions live exclusively on the backend.
 * Only UI-facing metadata (labels, icons, groupable/filterable flags) lives here.
 *
 * Usage
 * ─────
 *   import { frontendRegistry } from "@/lib/reporting";
 *
 *   const subjectDef  = frontendRegistry.getSubject("drivers");
 *   const filterFields = frontendRegistry.getFilterFields("drivers");
 */

import type { FC } from "react";

export interface FrontendFieldDef {
  key: string;
  label: string;
  filterable?: boolean;
  groupable?: boolean;
  sortable?: boolean;
  /** Roles permitted to see/use this field. Undefined = no restriction. */
  requiresRole?: readonly string[];
  /** Short formula string shown as a tooltip in the Calculated Fields section. */
  formulaTooltip?: string;
  /** When true the value should be formatted as $X,XXX.XX in preview and export. */
  isCurrency?: boolean;
  /** When true the value should be formatted as XX.X% in preview and export. */
  isPercent?: boolean;
  /** When true DB enum values (e.g. "active") are displayed as Title Case (e.g. "Active"). */
  capitalizeValue?: boolean;
}

export interface FrontendFieldGroupDef {
  label: string;
  fields: FrontendFieldDef[];
  /**
   * When true this group is rendered in the dedicated "Calculated Fields" section
   * rather than inside the standard module-based field picker.
   */
  isCalculated?: boolean;
}

export interface FrontendSubjectDef {
  /** Must match the backend SubjectDef id exactly */
  id: string;
  /** Display name, e.g. "Drivers" */
  label: string;
  icon: FC<{ className?: string }>;
  color: string;
  fieldGroups: FrontendFieldGroupDef[];
  defaultFields: string[];
}

export interface FrontendRelationshipDef {
  id: string;
  sourceSubjectId: string;
  targetSubjectId: string;
  label: string;
  reportingAllowed: boolean;
  requiresRole?: string[];
  /** When true the relationship supports a "primary_only" grain mode (default for this relationship). */
  supportsPrimaryOnly?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

class FrontendReportingRegistry {
  private _subjects = new Map<string, FrontendSubjectDef>();
  private _relationships: FrontendRelationshipDef[] = [];

  register(def: FrontendSubjectDef): this {
    this._subjects.set(def.id, def);
    return this;
  }

  addRelationship(def: FrontendRelationshipDef): this {
    this._relationships.push(def);
    return this;
  }

  getSubject(id: string): FrontendSubjectDef | undefined {
    return this._subjects.get(id);
  }

  getAllSubjects(): FrontendSubjectDef[] {
    return [...this._subjects.values()];
  }

  /** All field keys for a subject — used to validate saved report configs */
  getAllFieldKeys(subjectId: string): string[] {
    return this._subjects.get(subjectId)
      ?.fieldGroups.flatMap(g => g.fields.map(f => f.key))
      ?? [];
  }

  /** key → label map for all fields */
  getLabelMap(subjectId: string): Record<string, string> {
    const subj = this._subjects.get(subjectId);
    if (!subj) return {};
    return Object.fromEntries(
      subj.fieldGroups.flatMap(g => g.fields.map(f => [f.key, f.label])),
    );
  }

  /** Fields that may appear in filter dropdowns */
  getFilterFields(subjectId: string): FrontendFieldDef[] {
    return this._subjects.get(subjectId)
      ?.fieldGroups.flatMap(g => g.fields.filter(f => f.filterable))
      ?? [];
  }

  /** Fields that may appear in GROUP BY selectors */
  getGroupFields(subjectId: string): FrontendFieldDef[] {
    return this._subjects.get(subjectId)
      ?.fieldGroups.flatMap(g => g.fields.filter(f => f.groupable))
      ?? [];
  }

  /** Approved related subjects visible from a source subject in the report builder */
  getRelatedSubjects(sourceSubjectId: string): FrontendSubjectDef[] {
    return this._relationships
      .filter(r => r.sourceSubjectId === sourceSubjectId && r.reportingAllowed)
      .map(r => this._subjects.get(r.targetSubjectId))
      .filter(Boolean) as FrontendSubjectDef[];
  }

  /** Look up the relationship definition between two subjects (source → target). */
  getRelationship(sourceSubjectId: string, targetSubjectId: string): FrontendRelationshipDef | undefined {
    return this._relationships.find(
      r => r.sourceSubjectId === sourceSubjectId && r.targetSubjectId === targetSubjectId,
    );
  }

  /**
   * All field keys from all subjects related to the given source subject.
   * Used to validate saved report configs that reference related-module fields.
   */
  getAllRelatedFieldKeys(sourceSubjectId: string): string[] {
    return this.getRelatedSubjects(sourceSubjectId)
      .flatMap(rs => rs.fieldGroups.flatMap(g => g.fields.map(f => f.key)));
  }
}

export const frontendRegistry = new FrontendReportingRegistry();
