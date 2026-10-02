-- V2.02: freeze blessboard.user_roles writes (authorization is catalogue-only).
-- Table retained for soak / testing reset / historical rows — NOT dropped.
-- New authorization must use blessboard.user_role_assignments.

CREATE OR REPLACE FUNCTION blessboard.forbid_user_roles_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'blessboard.user_roles is frozen (V2.02). Use user_role_assignments / catalogue roles.'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_forbid_user_roles_insert ON blessboard.user_roles;
CREATE TRIGGER trg_forbid_user_roles_insert
  BEFORE INSERT ON blessboard.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.forbid_user_roles_mutation();

-- UPDATE/DELETE remain for testing reset / archival soak. New grants must not INSERT.

COMMENT ON TABLE blessboard.user_roles IS
  'LEGACY FROZEN (V2.02). Authorization uses user_role_assignments. Do not write. Candidate for archival after soak.';
