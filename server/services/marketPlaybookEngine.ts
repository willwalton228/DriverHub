/**
 * Market Launch Playbooks & Guardrails Engine (INCREMENT 9)
 * 
 * Backend-only system for:
 * 1. MarketPlaybook entity with required parameters
 * 2. Required guardrails for comp, operations, and safety
 * 3. canActivateMarket(market_id) validator
 * 4. Prevention of market activation if configuration is missing
 * 5. Versioning and prospective-only changes
 * 6. Programmatic launch readiness checklist generation
 * 
 * NOT implementing: recruiting logic, pricing to customers, UI beyond read-only
 */

// ============================================
// TYPES & CONSTANTS
// ============================================

/** Market activation status */
export type MarketStatus = 'DRAFT' | 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED';

/** Guardrail category */
export type GuardrailCategory = 'COMPENSATION' | 'OPERATIONS' | 'SAFETY' | 'COMPLIANCE';

/** Guardrail severity */
export type GuardrailSeverity = 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL';

/** Validation error */
export interface ValidationError {
  code: string;
  category: GuardrailCategory;
  severity: GuardrailSeverity;
  message: string;
  field: string;
  currentValue: any;
  requiredValue?: any;
}

/** Market playbook configuration */
export interface MarketPlaybook {
  id: string;
  marketId: string;
  version: number;
  status: MarketStatus;
  effectiveDate: string; // YYYY-MM-DD
  expiresAt: string | null;
  
  // Compensation configuration
  compensation: {
    defaultBaseRateCents: number;
    minimumBaseRateCents: number;
    maximumBaseRateCents: number;
    hourlyFloorCents: number;
    onDemandCapCents: number;
    volumeMultiplierEnabled: boolean;
    safetyMultiplierEnabled: boolean;
  };
  
  // Operations configuration
  operations: {
    serviceAreaDefined: boolean;
    zonesConfigured: number;
    dispatchRulesSet: boolean;
    minimumDriverCount: number;
    maximumDriverCount: number;
    operatingHoursSet: boolean;
  };
  
  // Safety configuration
  safety: {
    safetyPolicyVersionId: string | null;
    backgroundCheckRequired: boolean;
    drivingRecordCheckRequired: boolean;
    minimumTenureDays: number;
    trainingRequiredBeforeActivation: boolean;
  };
  
  // Compliance configuration
  compliance: {
    insuranceCoverageMinimumCents: number;
    vehicleInspectionRequired: boolean;
    licenseVerificationRequired: boolean;
    w2DriverSupported: boolean;
    icDriverSupported: boolean;
  };
  
  // Metadata
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** Launch readiness checklist item */
export interface ChecklistItem {
  id: string;
  category: GuardrailCategory;
  name: string;
  description: string;
  status: 'PASS' | 'FAIL' | 'WARNING' | 'NOT_APPLICABLE';
  severity: GuardrailSeverity;
  details: string;
}

/** Launch readiness report */
export interface LaunchReadinessReport {
  marketId: string;
  playbookVersion: number;
  evaluatedAt: string;
  overallStatus: 'READY' | 'NOT_READY' | 'READY_WITH_WARNINGS';
  checklist: ChecklistItem[];
  errors: ValidationError[];
  warnings: ValidationError[];
  passCount: number;
  failCount: number;
  warningCount: number;
}

/** Activation result */
export interface ActivationResult {
  canActivate: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  report: LaunchReadinessReport;
}

// ============================================
// GUARDRAIL DEFINITIONS
// ============================================

/** Guardrail rule definition */
export interface GuardrailRule {
  id: string;
  category: GuardrailCategory;
  severity: GuardrailSeverity;
  name: string;
  description: string;
  validate: (playbook: MarketPlaybook) => ValidationError | null;
}

/** Required compensation guardrails */
export const COMPENSATION_GUARDRAILS: GuardrailRule[] = [
  {
    id: 'COMP_001',
    category: 'COMPENSATION',
    severity: 'REQUIRED',
    name: 'Base Rate Minimum',
    description: 'Default base rate must be at least the minimum wage equivalent',
    validate: (pb) => {
      const minRequiredCents = 1500; // $15/hr minimum
      if (pb.compensation.defaultBaseRateCents < minRequiredCents) {
        return {
          code: 'COMP_001',
          category: 'COMPENSATION',
          severity: 'REQUIRED',
          message: `Default base rate ($${(pb.compensation.defaultBaseRateCents / 100).toFixed(2)}/hr) is below minimum required ($${(minRequiredCents / 100).toFixed(2)}/hr)`,
          field: 'compensation.defaultBaseRateCents',
          currentValue: pb.compensation.defaultBaseRateCents,
          requiredValue: minRequiredCents,
        };
      }
      return null;
    },
  },
  {
    id: 'COMP_002',
    category: 'COMPENSATION',
    severity: 'REQUIRED',
    name: 'Rate Range Valid',
    description: 'Maximum rate must be greater than minimum rate',
    validate: (pb) => {
      if (pb.compensation.maximumBaseRateCents <= pb.compensation.minimumBaseRateCents) {
        return {
          code: 'COMP_002',
          category: 'COMPENSATION',
          severity: 'REQUIRED',
          message: 'Maximum base rate must be greater than minimum base rate',
          field: 'compensation.maximumBaseRateCents',
          currentValue: pb.compensation.maximumBaseRateCents,
          requiredValue: `> ${pb.compensation.minimumBaseRateCents}`,
        };
      }
      return null;
    },
  },
  {
    id: 'COMP_003',
    category: 'COMPENSATION',
    severity: 'REQUIRED',
    name: 'Default Rate In Range',
    description: 'Default rate must be within min/max range',
    validate: (pb) => {
      const { defaultBaseRateCents, minimumBaseRateCents, maximumBaseRateCents } = pb.compensation;
      if (defaultBaseRateCents < minimumBaseRateCents || defaultBaseRateCents > maximumBaseRateCents) {
        return {
          code: 'COMP_003',
          category: 'COMPENSATION',
          severity: 'REQUIRED',
          message: 'Default base rate must be within the min/max range',
          field: 'compensation.defaultBaseRateCents',
          currentValue: defaultBaseRateCents,
          requiredValue: `${minimumBaseRateCents} - ${maximumBaseRateCents}`,
        };
      }
      return null;
    },
  },
  {
    id: 'COMP_004',
    category: 'COMPENSATION',
    severity: 'REQUIRED',
    name: 'Hourly Floor Set',
    description: 'Hourly floor must be configured',
    validate: (pb) => {
      if (pb.compensation.hourlyFloorCents <= 0) {
        return {
          code: 'COMP_004',
          category: 'COMPENSATION',
          severity: 'REQUIRED',
          message: 'Hourly floor must be greater than zero',
          field: 'compensation.hourlyFloorCents',
          currentValue: pb.compensation.hourlyFloorCents,
          requiredValue: '> 0',
        };
      }
      return null;
    },
  },
  {
    id: 'COMP_005',
    category: 'COMPENSATION',
    severity: 'RECOMMENDED',
    name: 'Volume Multiplier Enabled',
    description: 'Volume multiplier should be enabled for performance incentives',
    validate: (pb) => {
      if (!pb.compensation.volumeMultiplierEnabled) {
        return {
          code: 'COMP_005',
          category: 'COMPENSATION',
          severity: 'RECOMMENDED',
          message: 'Volume multiplier is not enabled - drivers may lack volume incentives',
          field: 'compensation.volumeMultiplierEnabled',
          currentValue: false,
          requiredValue: true,
        };
      }
      return null;
    },
  },
];

/** Required operations guardrails */
export const OPERATIONS_GUARDRAILS: GuardrailRule[] = [
  {
    id: 'OPS_001',
    category: 'OPERATIONS',
    severity: 'REQUIRED',
    name: 'Service Area Defined',
    description: 'Service area must be defined before activation',
    validate: (pb) => {
      if (!pb.operations.serviceAreaDefined) {
        return {
          code: 'OPS_001',
          category: 'OPERATIONS',
          severity: 'REQUIRED',
          message: 'Service area must be defined',
          field: 'operations.serviceAreaDefined',
          currentValue: false,
          requiredValue: true,
        };
      }
      return null;
    },
  },
  {
    id: 'OPS_002',
    category: 'OPERATIONS',
    severity: 'REQUIRED',
    name: 'Minimum Zones Configured',
    description: 'At least one zone must be configured',
    validate: (pb) => {
      if (pb.operations.zonesConfigured < 1) {
        return {
          code: 'OPS_002',
          category: 'OPERATIONS',
          severity: 'REQUIRED',
          message: 'At least one zone must be configured',
          field: 'operations.zonesConfigured',
          currentValue: pb.operations.zonesConfigured,
          requiredValue: '>= 1',
        };
      }
      return null;
    },
  },
  {
    id: 'OPS_003',
    category: 'OPERATIONS',
    severity: 'REQUIRED',
    name: 'Dispatch Rules Set',
    description: 'Dispatch rules must be configured',
    validate: (pb) => {
      if (!pb.operations.dispatchRulesSet) {
        return {
          code: 'OPS_003',
          category: 'OPERATIONS',
          severity: 'REQUIRED',
          message: 'Dispatch rules must be configured',
          field: 'operations.dispatchRulesSet',
          currentValue: false,
          requiredValue: true,
        };
      }
      return null;
    },
  },
  {
    id: 'OPS_004',
    category: 'OPERATIONS',
    severity: 'REQUIRED',
    name: 'Minimum Driver Count',
    description: 'Minimum driver count must be positive',
    validate: (pb) => {
      if (pb.operations.minimumDriverCount < 1) {
        return {
          code: 'OPS_004',
          category: 'OPERATIONS',
          severity: 'REQUIRED',
          message: 'Minimum driver count must be at least 1',
          field: 'operations.minimumDriverCount',
          currentValue: pb.operations.minimumDriverCount,
          requiredValue: '>= 1',
        };
      }
      return null;
    },
  },
  {
    id: 'OPS_005',
    category: 'OPERATIONS',
    severity: 'RECOMMENDED',
    name: 'Operating Hours Set',
    description: 'Operating hours should be configured',
    validate: (pb) => {
      if (!pb.operations.operatingHoursSet) {
        return {
          code: 'OPS_005',
          category: 'OPERATIONS',
          severity: 'RECOMMENDED',
          message: 'Operating hours are not configured - using default 24/7',
          field: 'operations.operatingHoursSet',
          currentValue: false,
          requiredValue: true,
        };
      }
      return null;
    },
  },
];

/** Required safety guardrails */
export const SAFETY_GUARDRAILS: GuardrailRule[] = [
  {
    id: 'SAFETY_001',
    category: 'SAFETY',
    severity: 'REQUIRED',
    name: 'Safety Policy Configured',
    description: 'Safety policy must be assigned to market',
    validate: (pb) => {
      if (!pb.safety.safetyPolicyVersionId) {
        return {
          code: 'SAFETY_001',
          category: 'SAFETY',
          severity: 'REQUIRED',
          message: 'Safety policy must be configured',
          field: 'safety.safetyPolicyVersionId',
          currentValue: null,
          requiredValue: 'non-null policy version ID',
        };
      }
      return null;
    },
  },
  {
    id: 'SAFETY_002',
    category: 'SAFETY',
    severity: 'REQUIRED',
    name: 'Background Check Required',
    description: 'Background checks must be required for all drivers',
    validate: (pb) => {
      if (!pb.safety.backgroundCheckRequired) {
        return {
          code: 'SAFETY_002',
          category: 'SAFETY',
          severity: 'REQUIRED',
          message: 'Background checks must be required',
          field: 'safety.backgroundCheckRequired',
          currentValue: false,
          requiredValue: true,
        };
      }
      return null;
    },
  },
  {
    id: 'SAFETY_003',
    category: 'SAFETY',
    severity: 'REQUIRED',
    name: 'Driving Record Check Required',
    description: 'Driving record checks must be required',
    validate: (pb) => {
      if (!pb.safety.drivingRecordCheckRequired) {
        return {
          code: 'SAFETY_003',
          category: 'SAFETY',
          severity: 'REQUIRED',
          message: 'Driving record checks must be required',
          field: 'safety.drivingRecordCheckRequired',
          currentValue: false,
          requiredValue: true,
        };
      }
      return null;
    },
  },
  {
    id: 'SAFETY_004',
    category: 'SAFETY',
    severity: 'RECOMMENDED',
    name: 'Training Before Activation',
    description: 'Driver training should be required before first assignment',
    validate: (pb) => {
      if (!pb.safety.trainingRequiredBeforeActivation) {
        return {
          code: 'SAFETY_004',
          category: 'SAFETY',
          severity: 'RECOMMENDED',
          message: 'Training before activation is recommended but not required',
          field: 'safety.trainingRequiredBeforeActivation',
          currentValue: false,
          requiredValue: true,
        };
      }
      return null;
    },
  },
];

/** Required compliance guardrails */
export const COMPLIANCE_GUARDRAILS: GuardrailRule[] = [
  {
    id: 'COMPL_001',
    category: 'COMPLIANCE',
    severity: 'REQUIRED',
    name: 'Insurance Minimum',
    description: 'Insurance coverage must meet minimum requirements',
    validate: (pb) => {
      const minInsuranceCents = 100000000; // $1,000,000 minimum
      if (pb.compliance.insuranceCoverageMinimumCents < minInsuranceCents) {
        return {
          code: 'COMPL_001',
          category: 'COMPLIANCE',
          severity: 'REQUIRED',
          message: `Insurance coverage minimum ($${(pb.compliance.insuranceCoverageMinimumCents / 100).toLocaleString()}) is below required ($${(minInsuranceCents / 100).toLocaleString()})`,
          field: 'compliance.insuranceCoverageMinimumCents',
          currentValue: pb.compliance.insuranceCoverageMinimumCents,
          requiredValue: minInsuranceCents,
        };
      }
      return null;
    },
  },
  {
    id: 'COMPL_002',
    category: 'COMPLIANCE',
    severity: 'REQUIRED',
    name: 'Vehicle Inspection Required',
    description: 'Vehicle inspections must be required',
    validate: (pb) => {
      if (!pb.compliance.vehicleInspectionRequired) {
        return {
          code: 'COMPL_002',
          category: 'COMPLIANCE',
          severity: 'REQUIRED',
          message: 'Vehicle inspections must be required',
          field: 'compliance.vehicleInspectionRequired',
          currentValue: false,
          requiredValue: true,
        };
      }
      return null;
    },
  },
  {
    id: 'COMPL_003',
    category: 'COMPLIANCE',
    severity: 'REQUIRED',
    name: 'License Verification Required',
    description: 'License verification must be required',
    validate: (pb) => {
      if (!pb.compliance.licenseVerificationRequired) {
        return {
          code: 'COMPL_003',
          category: 'COMPLIANCE',
          severity: 'REQUIRED',
          message: 'License verification must be required',
          field: 'compliance.licenseVerificationRequired',
          currentValue: false,
          requiredValue: true,
        };
      }
      return null;
    },
  },
  {
    id: 'COMPL_004',
    category: 'COMPLIANCE',
    severity: 'REQUIRED',
    name: 'Worker Type Support',
    description: 'At least one worker type must be supported',
    validate: (pb) => {
      if (!pb.compliance.w2DriverSupported && !pb.compliance.icDriverSupported) {
        return {
          code: 'COMPL_004',
          category: 'COMPLIANCE',
          severity: 'REQUIRED',
          message: 'At least one worker type (W2 or IC) must be supported',
          field: 'compliance.w2DriverSupported',
          currentValue: { w2: pb.compliance.w2DriverSupported, ic: pb.compliance.icDriverSupported },
          requiredValue: 'At least one true',
        };
      }
      return null;
    },
  },
];

/** All guardrail rules */
export const ALL_GUARDRAILS: GuardrailRule[] = [
  ...COMPENSATION_GUARDRAILS,
  ...OPERATIONS_GUARDRAILS,
  ...SAFETY_GUARDRAILS,
  ...COMPLIANCE_GUARDRAILS,
];

// ============================================
// VALIDATION ENGINE
// ============================================

/**
 * Validate a playbook against all guardrails.
 */
export function validatePlaybook(playbook: MarketPlaybook): ValidationError[] {
  const errors: ValidationError[] = [];
  
  for (const rule of ALL_GUARDRAILS) {
    const error = rule.validate(playbook);
    if (error) {
      errors.push(error);
    }
  }
  
  return errors;
}

/**
 * Validate a playbook against a specific category.
 */
export function validateCategory(
  playbook: MarketPlaybook,
  category: GuardrailCategory
): ValidationError[] {
  const rules = ALL_GUARDRAILS.filter(r => r.category === category);
  const errors: ValidationError[] = [];
  
  for (const rule of rules) {
    const error = rule.validate(playbook);
    if (error) {
      errors.push(error);
    }
  }
  
  return errors;
}

/**
 * Check if a market can be activated.
 * Returns true if activation is allowed, or an array of errors if not.
 */
export function canActivateMarket(playbook: MarketPlaybook): boolean | ValidationError[] {
  const allErrors = validatePlaybook(playbook);
  const requiredErrors = allErrors.filter(e => e.severity === 'REQUIRED');
  
  if (requiredErrors.length === 0) {
    return true;
  }
  
  return requiredErrors;
}

/**
 * Get detailed activation result with all errors and warnings.
 */
export function getActivationResult(playbook: MarketPlaybook): ActivationResult {
  const allErrors = validatePlaybook(playbook);
  const requiredErrors = allErrors.filter(e => e.severity === 'REQUIRED');
  const warnings = allErrors.filter(e => e.severity === 'RECOMMENDED' || e.severity === 'OPTIONAL');
  
  const report = generateLaunchReadinessReport(playbook);
  
  return {
    canActivate: requiredErrors.length === 0,
    errors: requiredErrors,
    warnings,
    report,
  };
}

// ============================================
// LAUNCH READINESS CHECKLIST
// ============================================

/**
 * Generate a launch readiness checklist for a market playbook.
 */
export function generateLaunchReadinessChecklist(playbook: MarketPlaybook): ChecklistItem[] {
  const checklist: ChecklistItem[] = [];
  
  for (const rule of ALL_GUARDRAILS) {
    const error = rule.validate(playbook);
    
    let status: 'PASS' | 'FAIL' | 'WARNING' | 'NOT_APPLICABLE';
    let details: string;
    
    if (!error) {
      status = 'PASS';
      details = 'Requirement met';
    } else if (error.severity === 'REQUIRED') {
      status = 'FAIL';
      details = error.message;
    } else {
      status = 'WARNING';
      details = error.message;
    }
    
    checklist.push({
      id: rule.id,
      category: rule.category,
      name: rule.name,
      description: rule.description,
      status,
      severity: rule.severity,
      details,
    });
  }
  
  return checklist;
}

/**
 * Generate a complete launch readiness report.
 */
export function generateLaunchReadinessReport(playbook: MarketPlaybook): LaunchReadinessReport {
  const checklist = generateLaunchReadinessChecklist(playbook);
  const allErrors = validatePlaybook(playbook);
  
  const errors = allErrors.filter(e => e.severity === 'REQUIRED');
  const warnings = allErrors.filter(e => e.severity !== 'REQUIRED');
  
  const passCount = checklist.filter(c => c.status === 'PASS').length;
  const failCount = checklist.filter(c => c.status === 'FAIL').length;
  const warningCount = checklist.filter(c => c.status === 'WARNING').length;
  
  let overallStatus: 'READY' | 'NOT_READY' | 'READY_WITH_WARNINGS';
  if (failCount > 0) {
    overallStatus = 'NOT_READY';
  } else if (warningCount > 0) {
    overallStatus = 'READY_WITH_WARNINGS';
  } else {
    overallStatus = 'READY';
  }
  
  return {
    marketId: playbook.marketId,
    playbookVersion: playbook.version,
    evaluatedAt: new Date().toISOString(),
    overallStatus,
    checklist,
    errors,
    warnings,
    passCount,
    failCount,
    warningCount,
  };
}

// ============================================
// VERSIONING & PROSPECTIVE CHANGES
// ============================================

/**
 * Create a new version of a playbook with changes.
 * Changes are prospective-only (only affect future periods).
 */
export function createPlaybookVersion(
  currentPlaybook: MarketPlaybook,
  changes: Partial<Omit<MarketPlaybook, 'id' | 'version' | 'marketId' | 'createdAt' | 'createdBy'>>,
  effectiveDate: string,
  updatedBy: string
): MarketPlaybook {
  // Ensure effective date is in the future
  const today = new Date().toISOString().split('T')[0];
  if (effectiveDate <= today) {
    throw new ProspectiveChangeError('Effective date must be in the future for prospective changes');
  }
  
  return {
    ...currentPlaybook,
    ...changes,
    id: `pb-${currentPlaybook.marketId}-v${currentPlaybook.version + 1}`,
    version: currentPlaybook.version + 1,
    effectiveDate,
    updatedAt: new Date().toISOString(),
    updatedBy,
    // Merge nested objects
    compensation: {
      ...currentPlaybook.compensation,
      ...(changes.compensation || {}),
    },
    operations: {
      ...currentPlaybook.operations,
      ...(changes.operations || {}),
    },
    safety: {
      ...currentPlaybook.safety,
      ...(changes.safety || {}),
    },
    compliance: {
      ...currentPlaybook.compliance,
      ...(changes.compliance || {}),
    },
  };
}

/**
 * Error for invalid prospective changes.
 */
export class ProspectiveChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProspectiveChangeError';
  }
}

/**
 * Check if a playbook version is effective for a given date.
 */
export function isPlaybookEffective(playbook: MarketPlaybook, date: string): boolean {
  if (date < playbook.effectiveDate) {
    return false;
  }
  if (playbook.expiresAt && date > playbook.expiresAt) {
    return false;
  }
  return true;
}

/**
 * Find the effective playbook version for a given date.
 */
export function findEffectivePlaybook(
  playbooks: MarketPlaybook[],
  marketId: string,
  date: string
): MarketPlaybook | null {
  const marketPlaybooks = playbooks
    .filter(p => p.marketId === marketId && p.status === 'ACTIVE')
    .filter(p => isPlaybookEffective(p, date))
    .sort((a, b) => b.version - a.version);
  
  return marketPlaybooks[0] || null;
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create a new draft playbook for a market.
 */
export function createDraftPlaybook(
  marketId: string,
  createdBy: string,
  effectiveDate: string
): MarketPlaybook {
  return {
    id: `pb-${marketId}-v1`,
    marketId,
    version: 1,
    status: 'DRAFT',
    effectiveDate,
    expiresAt: null,
    compensation: {
      defaultBaseRateCents: 2500,
      minimumBaseRateCents: 2000,
      maximumBaseRateCents: 3500,
      hourlyFloorCents: 1500,
      onDemandCapCents: 5000,
      volumeMultiplierEnabled: true,
      safetyMultiplierEnabled: true,
    },
    operations: {
      serviceAreaDefined: false,
      zonesConfigured: 0,
      dispatchRulesSet: false,
      minimumDriverCount: 5,
      maximumDriverCount: 100,
      operatingHoursSet: false,
    },
    safety: {
      safetyPolicyVersionId: null,
      backgroundCheckRequired: true,
      drivingRecordCheckRequired: true,
      minimumTenureDays: 0,
      trainingRequiredBeforeActivation: false,
    },
    compliance: {
      insuranceCoverageMinimumCents: 100000000,
      vehicleInspectionRequired: true,
      licenseVerificationRequired: true,
      w2DriverSupported: true,
      icDriverSupported: true,
    },
    createdAt: new Date().toISOString(),
    createdBy,
    updatedAt: new Date().toISOString(),
    updatedBy: createdBy,
  };
}

/**
 * Create a fully configured playbook that passes all required guardrails.
 */
export function createReadyPlaybook(
  marketId: string,
  createdBy: string,
  effectiveDate: string,
  safetyPolicyVersionId: string
): MarketPlaybook {
  const playbook = createDraftPlaybook(marketId, createdBy, effectiveDate);
  
  return {
    ...playbook,
    operations: {
      ...playbook.operations,
      serviceAreaDefined: true,
      zonesConfigured: 3,
      dispatchRulesSet: true,
      operatingHoursSet: true,
    },
    safety: {
      ...playbook.safety,
      safetyPolicyVersionId,
      trainingRequiredBeforeActivation: true,
    },
  };
}
