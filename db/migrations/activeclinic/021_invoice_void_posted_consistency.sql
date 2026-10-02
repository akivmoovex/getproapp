-- AC-V6 Prompt 10: allow voiding posted invoices while retaining posted_at.
-- Idempotent. Does not modify identities, staff, facilities, or role_permissions.
--
-- Prior CHECK ((status = 'posted') = (posted_at IS NOT NULL)) made it impossible
-- to transition posted → void without clearing posted_at. Void must keep the
-- posted audit trail and set voided_at.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'activeclinic.invoices'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%posted_at%'
  LOOP
    EXECUTE format('ALTER TABLE activeclinic.invoices DROP CONSTRAINT %I', r.conname);
  END LOOP;

  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'activeclinic.invoices'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%voided_at%'
  LOOP
    EXECUTE format('ALTER TABLE activeclinic.invoices DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE activeclinic.invoices
  DROP CONSTRAINT IF EXISTS invoices_posted_void_consistency;

ALTER TABLE activeclinic.invoices
  ADD CONSTRAINT invoices_posted_void_consistency
  CHECK (
    (
      status IN ('draft', 'pending')
      AND posted_at IS NULL
      AND voided_at IS NULL
    )
    OR (
      status = 'posted'
      AND posted_at IS NOT NULL
      AND voided_at IS NULL
    )
    OR (
      status = 'void'
      AND voided_at IS NOT NULL
    )
  );
