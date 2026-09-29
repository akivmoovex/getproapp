-- BlessBoard V5: justified indexes for package-metered storage reconcile + audit follow-ups.
-- Idempotent via ensureChurchSchema. Does not rewrite data.
--
-- church_announcement_attachments: org-scoped SUM in reconcileStorageBytesUsed
--   (broadcast attachments already have idx_church_hq_broadcast_attachments_org).
-- Verified-member partial index: NOT added — idx_church_members_organization_status (122) covers
--   organization_id + status lookups used by seat/usage meters.
-- Attendance / giving org composite indexes: decided at apply-time via EXPLAIN fixtures in tests;
--   only add here when EXPLAIN confirms Index Scan benefit. Default: announcement org only.

CREATE INDEX IF NOT EXISTS idx_church_announcement_attachments_organization
  ON public.church_announcement_attachments (organization_id);
