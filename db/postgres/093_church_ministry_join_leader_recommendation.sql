-- Leader join-request recommendation fields (recommendation only; branch admin retains final approval).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_ministry_join_requests
  ADD COLUMN IF NOT EXISTS leader_recommendation TEXT;

ALTER TABLE public.church_ministry_join_requests
  ADD COLUMN IF NOT EXISTS leader_comment TEXT;

ALTER TABLE public.church_ministry_join_requests
  ADD COLUMN IF NOT EXISTS leader_reviewed_at TIMESTAMPTZ;

ALTER TABLE public.church_ministry_join_requests
  ADD COLUMN IF NOT EXISTS leader_reviewer_id INTEGER REFERENCES public.church_ministry_leaders (id) ON DELETE SET NULL;

ALTER TABLE public.church_ministry_join_requests
  DROP CONSTRAINT IF EXISTS church_ministry_join_requests_leader_recommendation_check;

ALTER TABLE public.church_ministry_join_requests
  ADD CONSTRAINT church_ministry_join_requests_leader_recommendation_check
  CHECK (
    leader_recommendation IS NULL
    OR leader_recommendation IN ('recommend_approval', 'do_not_recommend', 'more_info_needed')
  );

CREATE INDEX IF NOT EXISTS idx_church_ministry_join_requests_ministry_leader_review
  ON public.church_ministry_join_requests (ministry_id, leader_recommendation, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_ministry_join_requests_leader_reviewer
  ON public.church_ministry_join_requests (leader_reviewer_id);
