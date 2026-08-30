ALTER TABLE recruiting_candidates
  ADD COLUMN IF NOT EXISTS address_line_2 varchar,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS current_employer varchar;