import { TriageSeverity, TRIAGE_SEVERITIES, TRIAGE_WORKFLOWS } from "@shared/schema";

export interface TriageInput {
  incidentType?: string;
  injuries?: string;
  injuryFlag?: boolean;
  drivableFlag?: boolean;
  damageEst1?: string | null;
  damageEst2?: string | null;
  totalEstimate?: string | null;
  probableCost?: string | null;
  claimType?: string;
}

export interface TriageResult {
  triageSeverity: TriageSeverity;
  injuryFlag: boolean;
  drivableFlag: boolean;
  carrierNotificationRequired: boolean;
  workflow: string;
  triageDecisionAt: Date;
}

export function calculateTriageSeverity(input: TriageInput): TriageResult {
  const injuryFlag = input.injuryFlag ?? 
    (input.injuries && input.injuries.toLowerCase() !== 'none' && input.injuries.toLowerCase() !== 'no' && input.injuries.trim() !== '');
  
  const drivableFlag = input.drivableFlag ?? true;
  
  // Use the maximum of all available estimates for accurate severity classification
  const estimates = [
    parseFloat(input.totalEstimate || '0') || 0,
    parseFloat(input.probableCost || '0') || 0,
    parseFloat(input.damageEst1 || '0') || 0,
    parseFloat(input.damageEst2 || '0') || 0,
  ];
  const estimatedCost = Math.max(...estimates);
  
  const incidentType = (input.incidentType || '').toLowerCase();
  const claimType = (input.claimType || '').toLowerCase();
  
  let triageSeverity: TriageSeverity = 'minor';
  
  // Severe: Injury OR >= $10k OR non-drivable
  if (injuryFlag) {
    triageSeverity = 'severe';
  } else if (incidentType === 'injury' || claimType === 'injury') {
    triageSeverity = 'severe';
  } else if (!drivableFlag || estimatedCost >= 10000 || incidentType === 'total_loss') {
    triageSeverity = 'severe';
  } 
  // Moderate: $2,500-$10k OR collision
  else if (estimatedCost >= 2500 || incidentType === 'collision' || claimType === 'accident') {
    triageSeverity = 'moderate';
  }
  
  const carrierNotificationRequired = triageSeverity === 'severe' || !!injuryFlag;
  
  const workflow = TRIAGE_WORKFLOWS[triageSeverity];
  
  return {
    triageSeverity,
    injuryFlag: !!injuryFlag,
    drivableFlag: drivableFlag,
    carrierNotificationRequired,
    workflow,
    triageDecisionAt: new Date(),
  };
}

export function getTriageWorkflowDescription(severity: TriageSeverity): string {
  switch (severity) {
    case 'minor':
      return 'Standard workflow - Routine processing';
    case 'moderate':
      return 'Ops + Safety notified - Enhanced monitoring';
    case 'severe':
      return 'Immediate escalation - Admin/Safety + Carrier notification required';
    default:
      return 'Unknown workflow';
  }
}

export function isValidTriageSeverity(value: string): value is TriageSeverity {
  return TRIAGE_SEVERITIES.includes(value as TriageSeverity);
}
