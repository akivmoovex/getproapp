-- BlessBoard V5 unified messaging: HQ broadcasts + canonical member inbox.
-- Additive. Does not replace announcements or V4 church_hq_broadcasts.

-- ---------------------------------------------------------------------------
-- messages (canonical HQ / system message record)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  created_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  sender_display_name TEXT NOT NULL,
  message_type TEXT NOT NULL,
  title TEXT NOT NULL,
  preview_text TEXT NULL,
  body TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  related_entity_type TEXT NULL,
  related_entity_id UUID NULL,
  call_to_action_label TEXT NULL,
  call_to_action_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  channel_in_app BOOLEAN NOT NULL DEFAULT true,
  channel_email BOOLEAN NOT NULL DEFAULT false,
  channel_sms BOOLEAN NOT NULL DEFAULT false,
  channel_push BOOLEAN NOT NULL DEFAULT false,
  scheduled_at TIMESTAMPTZ NULL,
  sent_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  send_idempotency_key TEXT NULL,
  recipient_count INT NOT NULL DEFAULT 0,
  in_app_created_count INT NOT NULL DEFAULT 0,
  excluded_inactive_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT messages_sender_display_name_len
    CHECK (char_length(sender_display_name) BETWEEN 1 AND 120),
  CONSTRAINT messages_title_len
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT messages_preview_text_len
    CHECK (preview_text IS NULL OR char_length(preview_text) BETWEEN 1 AND 500),
  CONSTRAINT messages_body_len
    CHECK (char_length(body) BETWEEN 1 AND 20000),
  CONSTRAINT messages_message_type_check
    CHECK (message_type IN (
      'announcement',
      'leadership_message',
      'ministry_announcement',
      'event_reminder',
      'service_update',
      'administrative_notice',
      'giving_receipt',
      'direct_message',
      'system_notice'
    )),
  CONSTRAINT messages_priority_check
    CHECK (priority IN ('normal', 'important', 'urgent')),
  CONSTRAINT messages_status_check
    CHECK (status IN (
      'draft',
      'scheduled',
      'sending',
      'sent',
      'partially_delivered',
      'failed',
      'cancelled'
    )),
  CONSTRAINT messages_cta_label_len
    CHECK (call_to_action_label IS NULL OR char_length(call_to_action_label) BETWEEN 1 AND 100),
  CONSTRAINT messages_cta_url_len
    CHECK (call_to_action_url IS NULL OR char_length(call_to_action_url) BETWEEN 1 AND 2000),
  CONSTRAINT messages_cta_pair
    CHECK (
      (call_to_action_url IS NULL AND call_to_action_label IS NULL)
      OR (call_to_action_url IS NOT NULL AND call_to_action_label IS NOT NULL)
    ),
  CONSTRAINT messages_related_pair
    CHECK (
      (related_entity_type IS NULL AND related_entity_id IS NULL)
      OR (related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL)
    ),
  CONSTRAINT messages_related_entity_type_check
    CHECK (
      related_entity_type IS NULL
      OR related_entity_type IN ('event', 'ministry', 'branch', 'sermon', 'giving_receipt')
    ),
  CONSTRAINT messages_scheduled_consistency
    CHECK (
      (status = 'scheduled' AND scheduled_at IS NOT NULL)
      OR (status <> 'scheduled')
    ),
  CONSTRAINT messages_sent_consistency
    CHECK (
      (status IN ('sent', 'partially_delivered', 'failed') AND sent_at IS NOT NULL)
      OR (status IN ('draft', 'scheduled', 'sending', 'cancelled'))
    ),
  CONSTRAINT messages_recipient_counts_nonneg
    CHECK (
      recipient_count >= 0
      AND in_app_created_count >= 0
      AND excluded_inactive_count >= 0
    ),
  CONSTRAINT messages_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS messages_church_status_created_idx
  ON blessboard.messages (church_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_church_sent_idx
  ON blessboard.messages (church_id, sent_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS messages_church_scheduled_due_idx
  ON blessboard.messages (church_id, scheduled_at)
  WHERE status = 'scheduled';

CREATE UNIQUE INDEX IF NOT EXISTS messages_church_send_idempotency_uidx
  ON blessboard.messages (church_id, send_idempotency_key)
  WHERE send_idempotency_key IS NOT NULL;

DROP TRIGGER IF EXISTS messages_branch_owns_church ON blessboard.messages;
CREATE TRIGGER messages_branch_owns_church
  BEFORE INSERT OR UPDATE OF church_id, branch_id ON blessboard.messages
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_content_branch_belongs_to_church();

CREATE OR REPLACE FUNCTION blessboard.touch_messages_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_touch_updated_at ON blessboard.messages;
CREATE TRIGGER messages_touch_updated_at
  BEFORE UPDATE ON blessboard.messages
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.touch_messages_updated_at();

-- ---------------------------------------------------------------------------
-- message_audiences
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.message_audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL
    REFERENCES blessboard.messages (id)
    ON DELETE CASCADE,
  audience_type TEXT NOT NULL,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  ministry_id UUID NULL
    REFERENCES blessboard.ministries (id)
    ON DELETE RESTRICT,
  role_key TEXT NULL,
  member_id UUID NULL
    REFERENCES blessboard.members (id)
    ON DELETE CASCADE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT message_audiences_type_check
    CHECK (audience_type IN (
      'all_active_members',
      'branches',
      'ministries',
      'roles',
      'members',
      'event_attendees'
    )),
  CONSTRAINT message_audiences_metadata_object
    CHECK (jsonb_typeof(metadata_json) = 'object'),
  CONSTRAINT message_audiences_role_key_format
    CHECK (role_key IS NULL OR role_key ~ '^[a-z][a-z0-9_]{0,63}$')
);

CREATE INDEX IF NOT EXISTS message_audiences_message_idx
  ON blessboard.message_audiences (message_id);

CREATE INDEX IF NOT EXISTS message_audiences_member_idx
  ON blessboard.message_audiences (member_id)
  WHERE member_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- member_notifications (canonical in-app letterbox)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.member_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  member_id UUID NOT NULL
    REFERENCES blessboard.members (id)
    ON DELETE CASCADE,
  message_id UUID NULL
    REFERENCES blessboard.messages (id)
    ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  preview_text TEXT NULL,
  body TEXT NOT NULL,
  sender_display_name TEXT NOT NULL,
  message_type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  related_entity_type TEXT NULL,
  related_entity_id UUID NULL,
  call_to_action_label TEXT NULL,
  call_to_action_url TEXT NULL,
  read_at TIMESTAMPTZ NULL,
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_notifications_title_len
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT member_notifications_preview_text_len
    CHECK (preview_text IS NULL OR char_length(preview_text) BETWEEN 1 AND 500),
  CONSTRAINT member_notifications_body_len
    CHECK (char_length(body) BETWEEN 1 AND 20000),
  CONSTRAINT member_notifications_sender_len
    CHECK (char_length(sender_display_name) BETWEEN 1 AND 120),
  CONSTRAINT member_notifications_source_type_check
    CHECK (source_type IN (
      'message',
      'announcement',
      'giving_receipt',
      'system'
    )),
  CONSTRAINT member_notifications_category_check
    CHECK (category IN (
      'church',
      'ministries',
      'events',
      'leadership',
      'giving',
      'direct',
      'system',
      'administrative'
    )),
  CONSTRAINT member_notifications_message_type_check
    CHECK (message_type IN (
      'announcement',
      'leadership_message',
      'ministry_announcement',
      'event_reminder',
      'service_update',
      'administrative_notice',
      'giving_receipt',
      'direct_message',
      'system_notice'
    )),
  CONSTRAINT member_notifications_priority_check
    CHECK (priority IN ('normal', 'important', 'urgent'))
);

CREATE UNIQUE INDEX IF NOT EXISTS member_notifications_message_member_uidx
  ON blessboard.member_notifications (message_id, member_id)
  WHERE message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS member_notifications_source_member_uidx
  ON blessboard.member_notifications (church_id, member_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS member_notifications_member_created_idx
  ON blessboard.member_notifications (member_id, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS member_notifications_member_unread_idx
  ON blessboard.member_notifications (member_id, created_at DESC)
  WHERE read_at IS NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS member_notifications_church_member_idx
  ON blessboard.member_notifications (church_id, member_id, created_at DESC);

CREATE OR REPLACE FUNCTION blessboard.require_member_notification_church_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  member_church UUID;
  message_church UUID;
BEGIN
  SELECT m.church_id INTO member_church
    FROM blessboard.members m
   WHERE m.id = NEW.member_id;
  IF member_church IS NULL THEN
    RAISE EXCEPTION 'member % not found for notification', NEW.member_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF member_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'notification church must match member'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.message_id IS NOT NULL THEN
    SELECT msg.church_id INTO message_church
      FROM blessboard.messages msg
     WHERE msg.id = NEW.message_id;
    IF message_church IS NULL THEN
      RAISE EXCEPTION 'message % not found for notification', NEW.message_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF message_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'notification church must match message'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_notifications_church_match ON blessboard.member_notifications;
CREATE TRIGGER member_notifications_church_match
  BEFORE INSERT OR UPDATE OF church_id, member_id, message_id
  ON blessboard.member_notifications
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_member_notification_church_match();

-- ---------------------------------------------------------------------------
-- message_delivery_attempts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.message_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  message_id UUID NOT NULL
    REFERENCES blessboard.messages (id)
    ON DELETE CASCADE,
  member_id UUID NOT NULL
    REFERENCES blessboard.members (id)
    ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_reference TEXT NULL,
  failure_code TEXT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ NULL,
  CONSTRAINT message_delivery_attempts_channel_check
    CHECK (channel IN ('in_app', 'email', 'sms', 'push')),
  CONSTRAINT message_delivery_attempts_status_check
    CHECK (status IN (
      'not_requested',
      'queued',
      'sending',
      'delivered',
      'failed',
      'unavailable',
      'suppressed_by_preference',
      'suppressed_by_consent'
    )),
  CONSTRAINT message_delivery_attempts_provider_ref_len
    CHECK (provider_reference IS NULL OR char_length(provider_reference) BETWEEN 1 AND 200),
  CONSTRAINT message_delivery_attempts_failure_code_len
    CHECK (failure_code IS NULL OR char_length(failure_code) BETWEEN 1 AND 80)
);

CREATE INDEX IF NOT EXISTS message_delivery_attempts_message_idx
  ON blessboard.message_delivery_attempts (message_id, channel, status);

CREATE INDEX IF NOT EXISTS message_delivery_attempts_member_idx
  ON blessboard.message_delivery_attempts (member_id, attempted_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS message_delivery_attempts_unique_channel_uidx
  ON blessboard.message_delivery_attempts (message_id, member_id, channel);

-- ---------------------------------------------------------------------------
-- member_notification_preferences (category × channel matrix)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.member_notification_preferences (
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  member_id UUID NOT NULL
    REFERENCES blessboard.members (id)
    ON DELETE CASCADE,
  category TEXT NOT NULL,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  push_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  PRIMARY KEY (church_id, member_id, category),
  CONSTRAINT member_notification_preferences_category_check
    CHECK (category IN (
      'church_announcements',
      'leadership_messages',
      'ministry_updates',
      'event_reminders',
      'service_updates',
      'giving_receipts',
      'direct_messages',
      'administrative_notices'
    ))
);

CREATE INDEX IF NOT EXISTS member_notification_preferences_member_idx
  ON blessboard.member_notification_preferences (member_id);

CREATE OR REPLACE FUNCTION blessboard.require_preference_member_church_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  member_church UUID;
BEGIN
  SELECT m.church_id INTO member_church
    FROM blessboard.members m
   WHERE m.id = NEW.member_id;
  IF member_church IS NULL THEN
    RAISE EXCEPTION 'member % not found for preference', NEW.member_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF member_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'preference church must match member'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_notification_preferences_church_match
  ON blessboard.member_notification_preferences;
CREATE TRIGGER member_notification_preferences_church_match
  BEFORE INSERT OR UPDATE OF church_id, member_id
  ON blessboard.member_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_preference_member_church_match();
