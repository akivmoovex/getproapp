-- Apex public church-registration applications (pending review only).
-- Does not provision organizations, branches, domains, users, or subscriptions.

CREATE TABLE IF NOT EXISTS blessboard.platform_church_registration_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending',
  church_name TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  role_in_church TEXT NULL,
  branch_name TEXT NULL,
  branch_count TEXT NULL,
  selected_plan TEXT NULL,
  message TEXT NULL,
  consent_terms BOOLEAN NOT NULL DEFAULT false,
  review_notes TEXT NULL,
  source_ip TEXT NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_church_reg_apps_status_check
    CHECK (status IN ('pending', 'contacted', 'closed')),
  CONSTRAINT platform_church_reg_apps_church_name_len
    CHECK (char_length(church_name) BETWEEN 1 AND 200),
  CONSTRAINT platform_church_reg_apps_country_len
    CHECK (char_length(country) BETWEEN 1 AND 120),
  CONSTRAINT platform_church_reg_apps_city_len
    CHECK (char_length(city) BETWEEN 1 AND 120),
  CONSTRAINT platform_church_reg_apps_contact_name_len
    CHECK (char_length(contact_name) BETWEEN 1 AND 200),
  CONSTRAINT platform_church_reg_apps_contact_email_len
    CHECK (char_length(contact_email) BETWEEN 3 AND 254),
  CONSTRAINT platform_church_reg_apps_contact_phone_len
    CHECK (char_length(contact_phone) BETWEEN 1 AND 50),
  CONSTRAINT platform_church_reg_apps_role_len
    CHECK (role_in_church IS NULL OR char_length(role_in_church) BETWEEN 1 AND 120),
  CONSTRAINT platform_church_reg_apps_branch_name_len
    CHECK (branch_name IS NULL OR char_length(branch_name) BETWEEN 1 AND 200),
  CONSTRAINT platform_church_reg_apps_branch_count_len
    CHECK (branch_count IS NULL OR char_length(branch_count) BETWEEN 1 AND 20),
  CONSTRAINT platform_church_reg_apps_selected_plan_check
    CHECK (
      selected_plan IS NULL
      OR selected_plan IN ('foundation', 'growth', 'network')
    ),
  CONSTRAINT platform_church_reg_apps_message_len
    CHECK (message IS NULL OR char_length(message) BETWEEN 1 AND 5000),
  CONSTRAINT platform_church_reg_apps_review_notes_len
    CHECK (review_notes IS NULL OR char_length(review_notes) BETWEEN 1 AND 5000),
  CONSTRAINT platform_church_reg_apps_source_ip_len
    CHECK (source_ip IS NULL OR char_length(source_ip) BETWEEN 1 AND 64),
  CONSTRAINT platform_church_reg_apps_user_agent_len
    CHECK (user_agent IS NULL OR char_length(user_agent) BETWEEN 1 AND 500),
  CONSTRAINT platform_church_reg_apps_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS platform_church_reg_apps_status_created_idx
  ON blessboard.platform_church_registration_applications (status, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_church_reg_apps_email_created_idx
  ON blessboard.platform_church_registration_applications (lower(contact_email), created_at DESC);
