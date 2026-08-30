-- Migration 0022: Expand ticket_type enum with new AMR classification types
-- PostgreSQL requires each ADD VALUE in a separate statement

ALTER TYPE ticket_type ADD VALUE IF NOT EXISTS 'architectural_changes';
ALTER TYPE ticket_type ADD VALUE IF NOT EXISTS 'artificial_intelligence';
ALTER TYPE ticket_type ADD VALUE IF NOT EXISTS 'performance';
ALTER TYPE ticket_type ADD VALUE IF NOT EXISTS 'security_compliance';
ALTER TYPE ticket_type ADD VALUE IF NOT EXISTS 'synchronization';
ALTER TYPE ticket_type ADD VALUE IF NOT EXISTS 'user_experience';
