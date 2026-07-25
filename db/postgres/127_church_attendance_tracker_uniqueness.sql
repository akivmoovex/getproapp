-- Branch attendance tracker uniqueness (aggregate service records, not per-member).
-- One record per branch + service date + attendance type + service name (case-insensitive),
-- for non-ministry branch-level tracker rows only.

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_attendance_records_branch_context_unique
  ON public.church_attendance_records (
    branch_id,
    service_date,
    attendance_type,
    lower(btrim(service_name))
  )
  WHERE ministry_id IS NULL;
