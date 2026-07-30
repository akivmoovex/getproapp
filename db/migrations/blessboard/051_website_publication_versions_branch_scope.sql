-- Stage 6: branch-scoped website publication versions (additive, backward compatible).
-- branch_id NULL = church-wide website; branch_id set = one branch mini website.

ALTER TABLE blessboard.website_publication_versions
  ADD COLUMN IF NOT EXISTS branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT;

COMMENT ON COLUMN blessboard.website_publication_versions.branch_id IS
  'NULL = church-wide website publication; UUID = branch mini-website publication scope.';

-- Replace org-wide single published unique index with scope-aware indexes.
DROP INDEX IF EXISTS blessboard.wpv_one_published_per_org;

CREATE UNIQUE INDEX IF NOT EXISTS wpv_one_published_church_wide
  ON blessboard.website_publication_versions (organization_id)
  WHERE status = 'published' AND branch_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wpv_one_published_per_branch
  ON blessboard.website_publication_versions (organization_id, branch_id)
  WHERE status = 'published' AND branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wpv_org_branch_idx
  ON blessboard.website_publication_versions (organization_id, branch_id)
  WHERE branch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION blessboard.validate_website_publication_version_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  church_org UUID;
  branch_church UUID;
BEGIN
  SELECT c.organization_id INTO church_org
    FROM blessboard.churches c
   WHERE c.id = NEW.church_id;
  IF church_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'blessboard.website_publication_versions church/organization mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.branch_id IS NOT NULL THEN
    SELECT b.church_id INTO branch_church
      FROM blessboard.branches b
     WHERE b.id = NEW.branch_id;
    IF branch_church IS NULL OR branch_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'blessboard.website_publication_versions branch/church mismatch'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS website_publication_versions_scope_ok
  ON blessboard.website_publication_versions;
CREATE TRIGGER website_publication_versions_scope_ok
  BEFORE INSERT OR UPDATE OF organization_id, church_id, branch_id
  ON blessboard.website_publication_versions
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.validate_website_publication_version_scope();
