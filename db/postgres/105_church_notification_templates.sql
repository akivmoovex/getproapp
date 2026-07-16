-- BlessBoard system notification templates (platform defaults + org overrides).
-- Idempotent via ensureChurchSchema. No messaging provider changes.

CREATE TABLE IF NOT EXISTS public.church_notification_templates (
  id BIGSERIAL PRIMARY KEY,
  template_key TEXT NOT NULL,
  organization_id INTEGER
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  subject_template TEXT NOT NULL,
  body_text_template TEXT NOT NULL,
  body_html_template TEXT,
  updated_by_actor_type TEXT,
  updated_by_actor_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_notification_templates_key_check
    CHECK (char_length(template_key) BETWEEN 1 AND 64)
);

CREATE UNIQUE INDEX IF NOT EXISTS church_notification_templates_platform_default_uniq
  ON public.church_notification_templates (template_key)
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS church_notification_templates_org_override_uniq
  ON public.church_notification_templates (organization_id, template_key)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_church_notification_templates_org
  ON public.church_notification_templates (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.church_notification_test_deliveries (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER
    REFERENCES public.church_organizations (id) ON DELETE SET NULL,
  template_key TEXT NOT NULL,
  recipient_actor_type TEXT NOT NULL,
  recipient_actor_id INTEGER,
  recipient_email TEXT NOT NULL,
  subject_rendered TEXT NOT NULL,
  body_text_rendered TEXT NOT NULL,
  body_html_rendered TEXT,
  requested_by_actor_type TEXT NOT NULL,
  requested_by_actor_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_church_notification_test_deliveries_org
  ON public.church_notification_test_deliveries (organization_id, created_at DESC);
