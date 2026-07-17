-- Minimal V5 BlessBoard login identity. Separate from V4 public users.

CREATE TABLE IF NOT EXISTS blessboard.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized TEXT NOT NULL,
  email_display TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ NULL,
  CONSTRAINT users_email_normalized_unique UNIQUE (email_normalized),
  CONSTRAINT users_email_normalized_format
    CHECK (
      email_normalized = lower(trim(email_normalized))
      AND email_normalized ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
      AND char_length(email_normalized) BETWEEN 3 AND 254
    ),
  CONSTRAINT users_email_display_len
    CHECK (char_length(email_display) BETWEEN 1 AND 254),
  CONSTRAINT users_password_hash_len
    CHECK (char_length(password_hash) BETWEEN 20 AND 200),
  CONSTRAINT users_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT users_status_check
    CHECK (status IN ('active', 'inactive', 'suspended', 'invited'))
);

CREATE INDEX IF NOT EXISTS users_status_idx
  ON blessboard.users (status);

CREATE OR REPLACE FUNCTION blessboard.normalize_user_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.email_normalized := lower(trim(NEW.email_normalized));
  NEW.email_display := trim(NEW.email_display);
  NEW.display_name := trim(NEW.display_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_normalize_email ON blessboard.users;
CREATE TRIGGER users_normalize_email
  BEFORE INSERT OR UPDATE OF email_normalized, email_display, display_name ON blessboard.users
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.normalize_user_email();
