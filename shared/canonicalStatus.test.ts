import { describe, it, expect } from 'vitest';
import {
  normalizeMoveStatus,
  auditEventToCanonicalStatus,
  getCanonicalStatusLabel,
  getTimelineEventLabel,
  CANONICAL_MOVE_STATUSES,
} from './canonicalStatus';

describe('normalizeMoveStatus', () => {
  describe('cancellation states', () => {
    it('maps CANCELLED assignment_state to CANCELLED_BY_OPS by default', () => {
      expect(normalizeMoveStatus('CANCELLED', null, null)).toBe('CANCELLED_BY_OPS');
    });

    it('maps CANCELLED execution_state to CANCELLED_BY_OPS by default', () => {
      expect(normalizeMoveStatus('ASSIGNED', 'CANCELLED', null)).toBe('CANCELLED_BY_OPS');
    });

    it('maps CANCELLED to CANCELLED_BY_CUSTOMER when cancelledBy is customer', () => {
      expect(normalizeMoveStatus('CANCELLED', null, null, 'customer')).toBe('CANCELLED_BY_CUSTOMER');
    });

    it('maps legacy cancelled status to CANCELLED_BY_OPS', () => {
      expect(normalizeMoveStatus(null, null, 'cancelled')).toBe('CANCELLED_BY_OPS');
    });
  });

  describe('completed states', () => {
    it('maps COMPLETED execution_state to COMPLETED', () => {
      expect(normalizeMoveStatus('ASSIGNED', 'COMPLETED', null)).toBe('COMPLETED');
    });

    it('maps legacy completed status to COMPLETED', () => {
      expect(normalizeMoveStatus(null, null, 'completed')).toBe('COMPLETED');
    });
  });

  describe('waiting states', () => {
    it('maps AT_PICKUP to WAITING', () => {
      expect(normalizeMoveStatus('ASSIGNED', 'AT_PICKUP', null)).toBe('WAITING');
    });

    it('maps AT_DESTINATION to WAITING', () => {
      expect(normalizeMoveStatus('ASSIGNED', 'AT_DESTINATION', null)).toBe('WAITING');
    });
  });

  describe('in-progress states', () => {
    it('maps EN_ROUTE_PICKUP to IN_PROGRESS', () => {
      expect(normalizeMoveStatus('ASSIGNED', 'EN_ROUTE_PICKUP', null)).toBe('IN_PROGRESS');
    });

    it('maps EN_ROUTE_DESTINATION to IN_PROGRESS', () => {
      expect(normalizeMoveStatus('ASSIGNED', 'EN_ROUTE_DESTINATION', null)).toBe('IN_PROGRESS');
    });

    it('maps legacy in-progress status to IN_PROGRESS', () => {
      expect(normalizeMoveStatus(null, null, 'in-progress')).toBe('IN_PROGRESS');
    });
  });

  describe('assignment states', () => {
    it('maps ASSIGNED with READY execution to ASSIGNED', () => {
      expect(normalizeMoveStatus('ASSIGNED', 'READY', null)).toBe('ASSIGNED');
    });

    it('maps ASSIGNED with no execution state to ASSIGNED', () => {
      expect(normalizeMoveStatus('ASSIGNED', null, null)).toBe('ASSIGNED');
    });

    it('maps REASSIGNING to ASSIGNED', () => {
      expect(normalizeMoveStatus('REASSIGNING', 'READY', null)).toBe('ASSIGNED');
    });

    it('maps OFFERED to OFFERED', () => {
      expect(normalizeMoveStatus('OFFERED', null, null)).toBe('OFFERED');
    });
  });

  describe('created/unassigned states', () => {
    it('maps UNASSIGNED to CREATED', () => {
      expect(normalizeMoveStatus('UNASSIGNED', null, null)).toBe('CREATED');
    });

    it('maps null assignment state to CREATED', () => {
      expect(normalizeMoveStatus(null, null, null)).toBe('CREATED');
    });

    it('maps undefined to CREATED', () => {
      expect(normalizeMoveStatus(undefined, undefined, undefined)).toBe('CREATED');
    });
  });
});

describe('auditEventToCanonicalStatus', () => {
  it('maps CREATED event to CREATED', () => {
    expect(auditEventToCanonicalStatus('CREATED')).toBe('CREATED');
  });

  it('maps OFFERED event to OFFERED', () => {
    expect(auditEventToCanonicalStatus('OFFERED')).toBe('OFFERED');
  });

  it('maps ACCEPTED event to ASSIGNED', () => {
    expect(auditEventToCanonicalStatus('ACCEPTED')).toBe('ASSIGNED');
  });

  it('maps DECLINED event to CREATED', () => {
    expect(auditEventToCanonicalStatus('DECLINED')).toBe('CREATED');
  });

  it('maps STATUS_UPDATE with EN_ROUTE_PICKUP to IN_PROGRESS', () => {
    expect(auditEventToCanonicalStatus('STATUS_UPDATE', 'EN_ROUTE_PICKUP')).toBe('IN_PROGRESS');
  });

  it('maps STATUS_UPDATE with AT_PICKUP to WAITING', () => {
    expect(auditEventToCanonicalStatus('STATUS_UPDATE', 'AT_PICKUP')).toBe('WAITING');
  });

  it('maps STATUS_UPDATE with COMPLETED to COMPLETED', () => {
    expect(auditEventToCanonicalStatus('STATUS_UPDATE', 'COMPLETED')).toBe('COMPLETED');
  });
});

describe('getCanonicalStatusLabel', () => {
  it('returns human-readable label for CREATED', () => {
    expect(getCanonicalStatusLabel('CREATED')).toBe('Move Created');
  });

  it('returns human-readable label for IN_PROGRESS', () => {
    expect(getCanonicalStatusLabel('IN_PROGRESS')).toBe('In Progress');
  });

  it('returns human-readable label for CANCELLED_BY_CUSTOMER', () => {
    expect(getCanonicalStatusLabel('CANCELLED_BY_CUSTOMER')).toBe('Cancelled by Customer');
  });

  it('returns human-readable label for CANCELLED_BY_OPS', () => {
    expect(getCanonicalStatusLabel('CANCELLED_BY_OPS')).toBe('Cancelled by Operations');
  });
});

describe('getTimelineEventLabel', () => {
  it('returns customer-friendly label for CREATED', () => {
    expect(getTimelineEventLabel('CREATED')).toBe('Move Created');
  });

  it('returns customer-friendly label for OFFERED', () => {
    expect(getTimelineEventLabel('OFFERED')).toBe('Finding Your Driver');
  });

  it('returns customer-friendly label for STATUS_UPDATE with EN_ROUTE_PICKUP', () => {
    expect(getTimelineEventLabel('STATUS_UPDATE', 'EN_ROUTE_PICKUP')).toBe('Driver En Route to Pickup');
  });

  it('returns customer-friendly label for STATUS_UPDATE with COMPLETED', () => {
    expect(getTimelineEventLabel('STATUS_UPDATE', 'COMPLETED')).toBe('Move Completed');
  });
});

describe('CANONICAL_MOVE_STATUSES', () => {
  it('contains all expected statuses', () => {
    expect(CANONICAL_MOVE_STATUSES).toContain('CREATED');
    expect(CANONICAL_MOVE_STATUSES).toContain('OFFERED');
    expect(CANONICAL_MOVE_STATUSES).toContain('ASSIGNED');
    expect(CANONICAL_MOVE_STATUSES).toContain('IN_PROGRESS');
    expect(CANONICAL_MOVE_STATUSES).toContain('WAITING');
    expect(CANONICAL_MOVE_STATUSES).toContain('COMPLETED');
    expect(CANONICAL_MOVE_STATUSES).toContain('CANCELLED_BY_CUSTOMER');
    expect(CANONICAL_MOVE_STATUSES).toContain('CANCELLED_BY_OPS');
  });

  it('has exactly 8 statuses', () => {
    expect(CANONICAL_MOVE_STATUSES.length).toBe(8);
  });
});
