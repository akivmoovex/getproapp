-- Shared media folders for the website engine.
--
-- One flat namespace per organization, used by both ActiveClinic
-- (platform.website_media) and BlessBoard (blessboard.media_assets, which
-- reaches an organization through blessboard.churches.organization_id).
--
-- Deliberately flat: there is no parent_id, so nesting is impossible by schema.
-- Folder assignment is a nullable column on the asset row, so NULL means
-- "Unfiled" and no backfill is required. Deleting a folder must never delete
-- assets, which is enforced by ON DELETE SET NULL rather than left to
-- application code.

CREATE TABLE IF NOT EXISTS platform.media_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  name TEXT NOT NULL,
  created_by_identity_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT media_folders_name_len
    CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT media_folders_name_no_control_chars
    CHECK (name !~ '[\n\r\t]')
);

-- Folder names are unique per tenant, case-insensitively, so "Photos" and
-- "photos" cannot both exist and confuse the picker.
CREATE UNIQUE INDEX IF NOT EXISTS media_folders_org_name_uidx
  ON platform.media_folders (organization_id, lower(name));

CREATE INDEX IF NOT EXISTS media_folders_org_name_idx
  ON platform.media_folders (organization_id, name);

-- —— ActiveClinic asset assignment ——

ALTER TABLE platform.website_media
  ADD COLUMN IF NOT EXISTS folder_id UUID NULL
    REFERENCES platform.media_folders (id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS website_media_folder_idx
  ON platform.website_media (organization_id, folder_id);

-- A folder and the asset filed into it must belong to the same organization.
-- Enforced in the database so no route, service, or future caller can file an
-- asset into another tenant's folder.
CREATE OR REPLACE FUNCTION platform.require_media_folder_same_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  folder_org UUID;
BEGIN
  IF NEW.folder_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT organization_id INTO folder_org
    FROM platform.media_folders
   WHERE id = NEW.folder_id;

  IF folder_org IS NULL THEN
    RAISE EXCEPTION 'media folder % does not exist', NEW.folder_id;
  END IF;

  IF folder_org <> NEW.organization_id THEN
    RAISE EXCEPTION
      'media folder % belongs to organization %, not %',
      NEW.folder_id, folder_org, NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS website_media_folder_same_organization ON platform.website_media;
CREATE TRIGGER website_media_folder_same_organization
  BEFORE INSERT OR UPDATE OF folder_id, organization_id ON platform.website_media
  FOR EACH ROW
  EXECUTE FUNCTION platform.require_media_folder_same_organization();
