-- Finance role separation: permissions, giving SoD columns, immutable events.
-- Additive only. Does not invent reconciliation/budget/period modules.

-- ---------------------------------------------------------------------------
-- Giving entry: rejection, adjustment, reversal, material edit, welfare link
-- ---------------------------------------------------------------------------

ALTER TABLE blessboard.giving_entries
  ADD COLUMN IF NOT EXISTS rejected_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS adjusted_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS adjusted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS adjustment_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS reversed_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS reversal_of_entry_id UUID NULL
    REFERENCES blessboard.giving_entries (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS last_materially_edited_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS last_materially_edited_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS welfare_request_id UUID NULL
    REFERENCES blessboard.welfare_requests (id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'giving_entries_rejection_reason_len'
  ) THEN
    ALTER TABLE blessboard.giving_entries
      ADD CONSTRAINT giving_entries_rejection_reason_len
      CHECK (rejection_reason IS NULL OR char_length(rejection_reason) BETWEEN 1 AND 500);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'giving_entries_adjustment_reason_len'
  ) THEN
    ALTER TABLE blessboard.giving_entries
      ADD CONSTRAINT giving_entries_adjustment_reason_len
      CHECK (adjustment_reason IS NULL OR char_length(adjustment_reason) BETWEEN 1 AND 500);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'giving_entries_reversal_reason_len'
  ) THEN
    ALTER TABLE blessboard.giving_entries
      ADD CONSTRAINT giving_entries_reversal_reason_len
      CHECK (reversal_reason IS NULL OR char_length(reversal_reason) BETWEEN 1 AND 500);
  END IF;
END $$;

ALTER TABLE blessboard.giving_entries
  DROP CONSTRAINT IF EXISTS giving_entries_status_check;

ALTER TABLE blessboard.giving_entries
  ADD CONSTRAINT giving_entries_status_check
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'void', 'reversed'));

ALTER TABLE blessboard.giving_entries
  DROP CONSTRAINT IF EXISTS giving_entries_submitted_consistency;

ALTER TABLE blessboard.giving_entries
  ADD CONSTRAINT giving_entries_submitted_consistency
    CHECK (
      (status IN ('submitted', 'approved', 'reversed') AND submitted_at IS NOT NULL)
      OR (status IN ('draft', 'void', 'rejected'))
    );

ALTER TABLE blessboard.giving_entries
  DROP CONSTRAINT IF EXISTS giving_entries_approved_consistency;

ALTER TABLE blessboard.giving_entries
  ADD CONSTRAINT giving_entries_approved_consistency
    CHECK (
      (status IN ('approved', 'reversed') AND approved_at IS NOT NULL)
      OR (status IN ('draft', 'submitted', 'void', 'rejected'))
    );

ALTER TABLE blessboard.giving_entries
  DROP CONSTRAINT IF EXISTS giving_entries_void_consistency;

ALTER TABLE blessboard.giving_entries
  ADD CONSTRAINT giving_entries_void_consistency
    CHECK (
      (status = 'void' AND voided_at IS NOT NULL AND void_reason IS NOT NULL)
      OR (status IN ('draft', 'submitted', 'approved', 'rejected', 'reversed') AND voided_at IS NULL)
    );

ALTER TABLE blessboard.giving_entries
  DROP CONSTRAINT IF EXISTS giving_entries_rejected_consistency;

ALTER TABLE blessboard.giving_entries
  ADD CONSTRAINT giving_entries_rejected_consistency
    CHECK (
      (status = 'rejected' AND rejected_at IS NOT NULL AND rejection_reason IS NOT NULL)
      OR (status IN ('draft', 'submitted', 'approved', 'void', 'reversed'))
    );

ALTER TABLE blessboard.giving_entries
  DROP CONSTRAINT IF EXISTS giving_entries_reversed_consistency;

ALTER TABLE blessboard.giving_entries
  ADD CONSTRAINT giving_entries_reversed_consistency
    CHECK (
      (status = 'reversed' AND reversed_at IS NOT NULL AND reversal_reason IS NOT NULL)
      OR (status IN ('draft', 'submitted', 'approved', 'void', 'rejected'))
    );

CREATE INDEX IF NOT EXISTS giving_entries_welfare_request_idx
  ON blessboard.giving_entries (welfare_request_id)
  WHERE welfare_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS giving_entries_reversal_of_idx
  ON blessboard.giving_entries (reversal_of_entry_id)
  WHERE reversal_of_entry_id IS NOT NULL;

-- Prevent hard-delete of posted/approved/reversed finance records.
CREATE OR REPLACE FUNCTION blessboard.prevent_giving_entry_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('submitted', 'approved', 'reversed') THEN
    RAISE EXCEPTION 'posted giving entry cannot be hard-deleted'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS giving_entries_no_hard_delete_posted ON blessboard.giving_entries;
CREATE TRIGGER giving_entries_no_hard_delete_posted
  BEFORE DELETE ON blessboard.giving_entries
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_giving_entry_hard_delete();

-- Extend void-reactivation guard for reversed.
CREATE OR REPLACE FUNCTION blessboard.prevent_giving_void_reactivation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'void' AND NEW.status IS DISTINCT FROM 'void' THEN
    RAISE EXCEPTION 'voided giving entry cannot be reactivated'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.status = 'reversed' AND NEW.status IS DISTINCT FROM 'reversed' THEN
    RAISE EXCEPTION 'reversed giving entry cannot be reactivated'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Immutable finance transition events (append-only).
CREATE TABLE IF NOT EXISTS blessboard.giving_entry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL
    REFERENCES blessboard.giving_entries (id) ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL
    REFERENCES blessboard.users (id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  from_status TEXT NULL,
  to_status TEXT NULL,
  reason TEXT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT giving_entry_events_type_check
    CHECK (event_type IN (
      'created', 'updated_draft', 'submitted', 'approved', 'rejected',
      'reopened', 'adjusted', 'voided', 'reversed', 'material_edit'
    )),
  CONSTRAINT giving_entry_events_reason_len
    CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS giving_entry_events_entry_idx
  ON blessboard.giving_entry_events (entry_id, created_at ASC);

CREATE OR REPLACE FUNCTION blessboard.prevent_giving_entry_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'giving_entry_events are append-only'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS giving_entry_events_no_update ON blessboard.giving_entry_events;
CREATE TRIGGER giving_entry_events_no_update
  BEFORE UPDATE OR DELETE ON blessboard.giving_entry_events
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.prevent_giving_entry_events_mutation();

-- ---------------------------------------------------------------------------
-- Finance permissions (only features with real product support)
-- ---------------------------------------------------------------------------

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  ('finance.transactions.view', 'finance', 'view', 'View finance transactions', 'View giving/finance entries within scope', 'standard'),
  ('finance.transactions.create', 'finance', 'create', 'Create finance transactions', 'Create draft giving/finance entries', 'standard'),
  ('finance.transactions.edit_draft', 'finance', 'edit_draft', 'Edit draft finance transactions', 'Edit draft giving/finance entries', 'standard'),
  ('finance.transactions.submit', 'finance', 'submit', 'Submit finance transactions', 'Submit drafts for approval', 'standard'),
  ('finance.transactions.approve', 'finance', 'approve', 'Approve finance transactions', 'Approve submitted entries', 'sensitive'),
  ('finance.transactions.reject', 'finance', 'reject', 'Reject finance transactions', 'Reject submitted entries with reason', 'sensitive'),
  ('finance.transactions.adjust', 'finance', 'adjust', 'Adjust finance transactions', 'Controlled adjustment of approved entries', 'sensitive'),
  ('finance.transactions.void', 'finance', 'void', 'Void finance transactions', 'Void entries with reason', 'sensitive'),
  ('finance.transactions.reverse', 'finance', 'reverse', 'Reverse finance transactions', 'Reverse approved entries with reason', 'sensitive'),
  ('finance.reports.view', 'finance', 'view', 'View finance reports', 'View aggregated finance/giving reports', 'standard'),
  ('finance.data.export', 'finance', 'export', 'Export finance data', 'Export finance reports or rows', 'sensitive'),
  ('finance.bank_details.view', 'finance', 'view', 'View bank details', 'View giving method account details', 'sensitive'),
  ('finance.settings.manage', 'finance', 'manage', 'Manage finance settings', 'Manage giving method finance settings', 'sensitive'),
  ('finance.welfare_instructions.view', 'finance', 'view', 'View welfare payment instructions', 'View approved welfare payment instructions only', 'standard'),
  ('finance.welfare_disbursement.record', 'finance', 'record', 'Record welfare disbursement', 'Record authorized welfare disbursement finance entry', 'sensitive')
ON CONFLICT (permission_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  sensitivity = EXCLUDED.sensitivity,
  resource_key = EXCLUDED.resource_key,
  action_key = EXCLUDED.action_key,
  is_active = true,
  updated_at = now();

-- Finance Officer
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'finance_officer'
   AND p.permission_key IN (
     'finance.transactions.view', 'finance.transactions.create',
     'finance.transactions.edit_draft', 'finance.transactions.submit',
     'finance.reports.view',
     'finance.welfare_instructions.view', 'finance.welfare_disbursement.record',
     'giving.view_summary', 'giving.record', 'giving.submit'
   )
ON CONFLICT DO NOTHING;

-- Finance Approver
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'finance_approver'
   AND p.permission_key IN (
     'finance.transactions.view', 'finance.transactions.approve',
     'finance.transactions.reject', 'finance.reports.view',
     'finance.welfare_instructions.view',
     'giving.view_summary', 'giving.approve'
   )
ON CONFLICT DO NOTHING;

-- Finance Director
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'finance_director'
   AND p.permission_key IN (
     'finance.transactions.view', 'finance.transactions.create',
     'finance.transactions.edit_draft', 'finance.transactions.submit',
     'finance.transactions.approve', 'finance.transactions.reject',
     'finance.transactions.adjust', 'finance.transactions.void',
     'finance.transactions.reverse',
     'finance.reports.view', 'finance.data.export',
     'finance.bank_details.view', 'finance.settings.manage',
     'finance.welfare_instructions.view', 'finance.welfare_disbursement.record',
     'giving.view_summary', 'giving.record', 'giving.submit', 'giving.approve', 'giving.void'
   )
ON CONFLICT DO NOTHING;

-- Auditor: read-only finance + reports (no export / mutate)
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'auditor'
   AND p.permission_key IN (
     'finance.transactions.view', 'finance.reports.view',
     'finance.welfare_instructions.view',
     'giving.view_summary'
   )
ON CONFLICT DO NOTHING;

-- Remove transaction-level Finance from platform_administrator catalogue default.
DELETE FROM blessboard.role_permissions rp
 USING blessboard.roles r, blessboard.permissions p
 WHERE rp.role_id = r.id
   AND rp.permission_id = p.id
   AND r.role_key = 'platform_administrator'
   AND p.permission_key IN (
     'giving.view_summary', 'giving.record', 'giving.submit', 'giving.approve', 'giving.void',
     'finance.transactions.view', 'finance.transactions.create', 'finance.transactions.edit_draft',
     'finance.transactions.submit', 'finance.transactions.approve', 'finance.transactions.reject',
     'finance.transactions.adjust', 'finance.transactions.void', 'finance.transactions.reverse',
     'finance.reports.view', 'finance.data.export', 'finance.bank_details.view',
     'finance.settings.manage', 'finance.welfare_instructions.view',
     'finance.welfare_disbursement.record'
   );

-- Temporary HQ catalogue compatibility: map existing giving ops + finance equivalents
-- for church_system_administrator / organisation_administrator (documented legacy bridge).
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM blessboard.roles r CROSS JOIN blessboard.permissions p
 WHERE r.role_key IN ('church_system_administrator', 'organisation_administrator')
   AND p.permission_key IN (
     'finance.transactions.view', 'finance.transactions.create',
     'finance.transactions.edit_draft', 'finance.transactions.submit',
     'finance.transactions.approve', 'finance.transactions.reject',
     'finance.transactions.void', 'finance.reports.view'
   )
ON CONFLICT DO NOTHING;
