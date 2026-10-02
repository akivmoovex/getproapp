-- V7 BUG 4: branch_name mandatory on church registration applications.
-- Safe backfill for legacy rows before NOT NULL constraint.

UPDATE blessboard.platform_church_registration_applications
   SET branch_name = 'Headquarters'
 WHERE branch_name IS NULL
   OR trim(branch_name) = '';

ALTER TABLE blessboard.platform_church_registration_applications
  DROP CONSTRAINT IF EXISTS platform_church_reg_apps_branch_name_len;

ALTER TABLE blessboard.platform_church_registration_applications
  ALTER COLUMN branch_name SET NOT NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD CONSTRAINT platform_church_reg_apps_branch_name_len
    CHECK (char_length(branch_name) BETWEEN 1 AND 200);
