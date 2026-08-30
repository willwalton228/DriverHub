/**
 * Canonical Move Status - Customer-Facing Status Standardization
 * 
 * This module provides a single source of truth for customer-visible move statuses.
 * Internal statuses are mapped to these canonical values before being exposed to customers.
 */

export const CANONICAL_MOVE_STATUSES = [
  'CREATED',
  'OFFERED',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING',
  'COMPLETED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_OPS',
] as const;

export type CanonicalMoveStatus = typeof CANONICAL_MOVE_STATUSES[number];

export const CANONICAL_STATUS_LABELS: Record<CanonicalMoveStatus, string> = {
  CREATED: 'Move Created',
  OFFERED: 'Driver Being Assigned',
  ASSIGNED: 'Driver Assigned',
  IN_PROGRESS: 'In Progress',
  WAITING: 'Waiting',
  COMPLETED: 'Completed',
  CANCELLED_BY_CUSTOMER: 'Cancelled by Customer',
  CANCELLED_BY_OPS: 'Cancelled by Operations',
};

/**
 * Maps internal assignment_state and execution_state to a customer-facing canonical status.
 * 
 * Internal states:
 * - assignment_state: UNASSIGNED | OFFERED | ASSIGNED | REASSIGNING | CANCELLED
 * - execution_state: READY | EN_ROUTE_PICKUP | AT_PICKUP | EN_ROUTE_DESTINATION | AT_DESTINATION | COMPLETED | CANCELLED
 * - status (legacy): completed | cancelled | in-progress
 * 
 * Mapping logic:
 * 1. If assignment_state is CANCELLED → CANCELLED_BY_OPS (default, can be overridden by metadata)
 * 2. If execution_state is CANCELLED → CANCELLED_BY_OPS
 * 3. If execution_state is COMPLETED → COMPLETED
 * 4. If execution_state indicates active work → IN_PROGRESS
 * 5. If execution_state is AT_PICKUP or AT_DESTINATION → WAITING
 * 6. Based on assignment_state for pre-execution states
 */
export function normalizeMoveStatus(
  assignmentState?: string | null,
  executionState?: string | null,
  legacyStatus?: string | null,
  cancelledBy?: 'customer' | 'ops' | null
): CanonicalMoveStatus {
  // Handle cancellation first - check both states
  if (assignmentState === 'CANCELLED' || executionState === 'CANCELLED') {
    return cancelledBy === 'customer' ? 'CANCELLED_BY_CUSTOMER' : 'CANCELLED_BY_OPS';
  }
  
  // Handle legacy cancelled status
  if (legacyStatus === 'cancelled') {
    return cancelledBy === 'customer' ? 'CANCELLED_BY_CUSTOMER' : 'CANCELLED_BY_OPS';
  }
  
  // Handle completed states
  if (executionState === 'COMPLETED' || legacyStatus === 'completed') {
    return 'COMPLETED';
  }
  
  // Handle waiting states (at a location)
  if (executionState === 'AT_PICKUP' || executionState === 'AT_DESTINATION') {
    return 'WAITING';
  }
  
  // Handle in-progress states (actively moving)
  if (executionState === 'EN_ROUTE_PICKUP' || executionState === 'EN_ROUTE_DESTINATION') {
    return 'IN_PROGRESS';
  }
  
  // Handle assignment states
  if (assignmentState === 'ASSIGNED' || assignmentState === 'REASSIGNING') {
    // If assigned but execution hasn't started (READY), show as ASSIGNED
    if (executionState === 'READY' || !executionState) {
      return 'ASSIGNED';
    }
    return 'IN_PROGRESS';
  }
  
  if (assignmentState === 'OFFERED') {
    return 'OFFERED';
  }
  
  // Handle legacy in-progress status before defaulting to CREATED
  if (legacyStatus === 'in-progress') {
    return 'IN_PROGRESS';
  }
  
  // Default for unassigned or newly created moves
  if (assignmentState === 'UNASSIGNED' || !assignmentState) {
    return 'CREATED';
  }
  
  // Default fallback
  return 'CREATED';
}

/**
 * Maps an audit event type to a canonical status for timeline display.
 */
export function auditEventToCanonicalStatus(
  eventType: string,
  newState?: string | null
): CanonicalMoveStatus {
  switch (eventType) {
    case 'CREATED':
      return 'CREATED';
    case 'OFFERED':
      return 'OFFERED';
    case 'ACCEPTED':
      return 'ASSIGNED';
    case 'DECLINED':
    case 'EXPIRED':
      return 'CREATED'; // Move goes back to created state
    case 'CANCELLED':
      return 'CANCELLED_BY_OPS'; // Default, can be refined with metadata
    case 'STATUS_UPDATE':
      // Map the new_state execution state to canonical
      return executionStateToCanonical(newState);
    case 'REASSIGNED':
      return 'ASSIGNED';
    default:
      return 'CREATED';
  }
}

/**
 * Maps execution state from audit events to canonical status.
 */
function executionStateToCanonical(executionState?: string | null): CanonicalMoveStatus {
  switch (executionState) {
    case 'EN_ROUTE_PICKUP':
    case 'EN_ROUTE_DESTINATION':
      return 'IN_PROGRESS';
    case 'AT_PICKUP':
    case 'AT_DESTINATION':
      return 'WAITING';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'CANCELLED':
      return 'CANCELLED_BY_OPS';
    case 'READY':
    default:
      return 'ASSIGNED';
  }
}

/**
 * Get a human-readable label for a canonical status.
 */
export function getCanonicalStatusLabel(status: CanonicalMoveStatus): string {
  return CANONICAL_STATUS_LABELS[status] || status;
}

/**
 * Get detailed customer-facing label for timeline events.
 */
export function getTimelineEventLabel(
  eventType: string,
  newState?: string | null
): string {
  switch (eventType) {
    case 'CREATED':
      return 'Move Created';
    case 'OFFERED':
      return 'Finding Your Driver';
    case 'ACCEPTED':
      return 'Driver Assigned';
    case 'DECLINED':
      return 'Reassigning Driver';
    case 'EXPIRED':
      return 'Reassigning Driver';
    case 'CANCELLED':
      return 'Move Cancelled';
    case 'REASSIGNED':
      return 'New Driver Assigned';
    case 'STATUS_UPDATE':
      return getExecutionStateLabel(newState);
    default:
      return 'Status Updated';
  }
}

/**
 * Get customer-friendly label for execution states.
 */
function getExecutionStateLabel(executionState?: string | null): string {
  switch (executionState) {
    case 'READY':
      return 'Driver Ready';
    case 'EN_ROUTE_PICKUP':
      return 'Driver En Route to Pickup';
    case 'AT_PICKUP':
      return 'Driver at Pickup Location';
    case 'EN_ROUTE_DESTINATION':
      return 'In Transit to Destination';
    case 'AT_DESTINATION':
      return 'Arrived at Destination';
    case 'COMPLETED':
      return 'Move Completed';
    case 'CANCELLED':
      return 'Move Cancelled';
    default:
      return 'Status Updated';
  }
}
