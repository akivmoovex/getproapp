-- Phase 7: extended giving-method fields for public website editors.
ALTER TABLE blessboard.giving_methods
  ADD COLUMN IF NOT EXISTS description TEXT NULL,
  ADD COLUMN IF NOT EXISTS account_details TEXT NULL,
  ADD COLUMN IF NOT EXISTS button_label TEXT NULL,
  ADD COLUMN IF NOT EXISTS qr_image_url TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'giving_methods_description_len'
  ) THEN
    ALTER TABLE blessboard.giving_methods
      ADD CONSTRAINT giving_methods_description_len
      CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 2000);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'giving_methods_account_details_len'
  ) THEN
    ALTER TABLE blessboard.giving_methods
      ADD CONSTRAINT giving_methods_account_details_len
      CHECK (account_details IS NULL OR char_length(account_details) BETWEEN 1 AND 2000);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'giving_methods_button_label_len'
  ) THEN
    ALTER TABLE blessboard.giving_methods
      ADD CONSTRAINT giving_methods_button_label_len
      CHECK (button_label IS NULL OR char_length(button_label) BETWEEN 1 AND 48);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'giving_methods_qr_image_url_len'
  ) THEN
    ALTER TABLE blessboard.giving_methods
      ADD CONSTRAINT giving_methods_qr_image_url_len
      CHECK (qr_image_url IS NULL OR char_length(qr_image_url) BETWEEN 1 AND 2000);
  END IF;
END $$;
