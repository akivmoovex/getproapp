-- Platform apex contact inquiries (ACW07). Not clinic-tenant scoped.

CREATE TABLE IF NOT EXISTS activeclinic.platform_contact_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_name TEXT NOT NULL,
  sender_email_normalized TEXT NOT NULL,
  sender_email_display TEXT NOT NULL,
  sender_phone_normalized TEXT NULL,
  sender_phone_display TEXT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_contact_inquiries_status_check
    CHECK (status IN ('received', 'reviewed', 'closed')),
  CONSTRAINT platform_contact_inquiries_message_len
    CHECK (char_length(message) BETWEEN 1 AND 4000),
  CONSTRAINT platform_contact_inquiries_sender_name_len
    CHECK (char_length(sender_name) BETWEEN 2 AND 120)
);

CREATE INDEX IF NOT EXISTS platform_contact_inquiries_created_idx
  ON activeclinic.platform_contact_inquiries (created_at DESC);

COMMENT ON TABLE activeclinic.platform_contact_inquiries IS
  'ActiveClinic.org public contact form. Stores received inquiries; never claims email/SMS delivery.';
