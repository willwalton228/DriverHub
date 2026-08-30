-- Keep Lisa's established identity and relationships intact while correcting
-- the current legal display name used by Recruiting and Driver operations.
-- Audit/history tables are intentionally untouched.

UPDATE users
SET first_name = 'Lisa',
    last_name = 'Parkhurst',
    updated_at = NOW()
WHERE lower(email) = 'lisa@driverondemand.co'
  AND (first_name IS DISTINCT FROM 'Lisa' OR last_name IS DISTINCT FROM 'Parkhurst');

UPDATE recruiting_requests
SET cert_liaison = 'Lisa Parkhurst',
    updated_at = NOW()
WHERE cert_liaison = 'Lisa Wickers';

UPDATE drivers
SET certified_by = 'Lisa Parkhurst',
    updated_at = NOW()
WHERE certified_by = 'Lisa Wickers';

UPDATE drivers
SET direct_manager = 'Lisa Parkhurst',
    updated_at = NOW()
WHERE direct_manager = 'Lisa Wickers';