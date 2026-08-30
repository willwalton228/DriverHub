-- ============================================
-- PAYROLL IMMUTABILITY TRIGGERS (INCREMENT 0)
-- ============================================
-- These triggers enforce data immutability at the Postgres level
-- to ensure payroll integrity. Application code cannot bypass these rules.

-- ============================================
-- 1. MOVES TABLE - Immutable Fields Trigger
-- ============================================
-- Fields that cannot change after insert: assigned_at, policy_version_id, estimated_minutes_snapshot

CREATE OR REPLACE FUNCTION prevent_moves_immutable_field_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if any immutable field is being changed
    IF OLD.assigned_at IS DISTINCT FROM NEW.assigned_at THEN
        RAISE EXCEPTION 'Cannot modify immutable field: assigned_at on moves table';
    END IF;
    
    IF OLD.policy_version_id IS DISTINCT FROM NEW.policy_version_id THEN
        RAISE EXCEPTION 'Cannot modify immutable field: policy_version_id on moves table';
    END IF;
    
    IF OLD.estimated_minutes_snapshot IS DISTINCT FROM NEW.estimated_minutes_snapshot THEN
        RAISE EXCEPTION 'Cannot modify immutable field: estimated_minutes_snapshot on moves table';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_moves_immutable_fields ON moves;
CREATE TRIGGER tr_moves_immutable_fields
    BEFORE UPDATE ON moves
    FOR EACH ROW
    EXECUTE FUNCTION prevent_moves_immutable_field_update();

-- ============================================
-- 2. PAY_PERIODS TABLE - Status Transition Trigger
-- ============================================
-- Valid transitions: OPEN -> PROCESSING -> LOCKED
-- Once LOCKED, status cannot change

CREATE OR REPLACE FUNCTION enforce_pay_period_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- If status hasn't changed, allow the update
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;
    
    -- Once LOCKED, status cannot change
    IF OLD.status = 'LOCKED' THEN
        RAISE EXCEPTION 'Pay period status cannot be changed once LOCKED';
    END IF;
    
    -- Valid transitions: OPEN -> PROCESSING, PROCESSING -> LOCKED
    IF OLD.status = 'OPEN' AND NEW.status = 'PROCESSING' THEN
        RETURN NEW;
    ELSIF OLD.status = 'PROCESSING' AND NEW.status = 'LOCKED' THEN
        -- Automatically set locked_at timestamp when locking
        NEW.locked_at := NOW();
        RETURN NEW;
    ELSE
        RAISE EXCEPTION 'Invalid pay period status transition: % -> %. Valid transitions: OPEN -> PROCESSING -> LOCKED', OLD.status, NEW.status;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_pay_period_status_transition ON pay_periods;
CREATE TRIGGER tr_pay_period_status_transition
    BEFORE UPDATE ON pay_periods
    FOR EACH ROW
    EXECUTE FUNCTION enforce_pay_period_status_transition();

-- ============================================
-- VERIFICATION QUERIES (for testing)
-- ============================================
-- Run these after creating triggers to verify they work:

-- Test 1: Try to update immutable field on moves (should fail)
-- UPDATE moves SET assigned_at = NOW() WHERE id = 'some-id';

-- Test 2: Try invalid status transition (should fail)
-- UPDATE pay_periods SET status = 'LOCKED' WHERE status = 'OPEN' AND id = 'some-id';

-- Test 3: Try to unlock a locked period (should fail)
-- UPDATE pay_periods SET status = 'OPEN' WHERE status = 'LOCKED' AND id = 'some-id';
