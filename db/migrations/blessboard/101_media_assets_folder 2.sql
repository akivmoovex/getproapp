-- Assign BlessBoard media assets to a shared media folder.
--
-- Folders live in platform.media_folders (see platform/033_media_folders.sql),
-- which runs first because the migrator applies the platform module before
-- blessboard. The column is nullable, so NULL means "Unfiled" and existing rows
-- need no backfill. ON DELETE SET NULL guarantees deleting a folder returns its
-- assets to Unfiled instead of deleting them.

ALTER TABLE blessboard.media_assets
  ADD COLUMN IF NOT EXISTS folder_id UUID NULL
    REFERENCES platform.media_folders (id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS media_assets_church_folder_idx
  ON blessboard.media_assets (church_id, folder_id);

-- A church may only file assets into folders owned by the organization that
-- church belongs to. Enforced in the database so tenant isolation does not
-- depend on route-level checks.
CREATE OR REPLACE FUNCTION blessboard.require_media_folder_belongs_to_church()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  folder_org UUID;
  church_org UUID;
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

  SELECT organization_id INTO church_org
    FROM blessboard.churches
   WHERE id = NEW.church_id;

  IF church_org IS NULL THEN
    RAISE EXCEPTION 'church % does not exist', NEW.church_id;
  END IF;

  IF folder_org <> church_org THEN
    RAISE EXCEPTION
      'media folder % belongs to organization %, not %',
      NEW.folder_id, folder_org, church_org;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS media_assets_folder_belongs_to_church ON blessboard.media_assets;
CREATE TRIGGER media_assets_folder_belongs_to_church
  BEFORE INSERT OR UPDATE OF folder_id, church_id ON blessboard.media_assets
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.require_media_folder_belongs_to_church();
