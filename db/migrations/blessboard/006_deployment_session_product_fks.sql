-- Add product-schema FKs on platform.deployment_sessions after blessboard tables exist.

ALTER TABLE platform.deployment_sessions
  DROP CONSTRAINT IF EXISTS deployment_sessions_user_id_fkey;
ALTER TABLE platform.deployment_sessions
  ADD CONSTRAINT deployment_sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES blessboard.users (id)
  ON DELETE RESTRICT;

ALTER TABLE platform.deployment_sessions
  DROP CONSTRAINT IF EXISTS deployment_sessions_church_id_fkey;
ALTER TABLE platform.deployment_sessions
  ADD CONSTRAINT deployment_sessions_church_id_fkey
  FOREIGN KEY (church_id) REFERENCES blessboard.churches (id)
  ON DELETE RESTRICT;

ALTER TABLE platform.deployment_sessions
  DROP CONSTRAINT IF EXISTS deployment_sessions_branch_id_fkey;
ALTER TABLE platform.deployment_sessions
  ADD CONSTRAINT deployment_sessions_branch_id_fkey
  FOREIGN KEY (branch_id) REFERENCES blessboard.branches (id)
  ON DELETE RESTRICT;
