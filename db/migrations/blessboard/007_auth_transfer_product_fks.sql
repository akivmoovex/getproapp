-- Product-schema FKs for platform.auth_transfers after blessboard tables exist.

ALTER TABLE platform.auth_transfers
  DROP CONSTRAINT IF EXISTS auth_transfers_church_id_fkey;
ALTER TABLE platform.auth_transfers
  ADD CONSTRAINT auth_transfers_church_id_fkey
  FOREIGN KEY (church_id) REFERENCES blessboard.churches (id) ON DELETE RESTRICT;

ALTER TABLE platform.auth_transfers
  DROP CONSTRAINT IF EXISTS auth_transfers_branch_id_fkey;
ALTER TABLE platform.auth_transfers
  ADD CONSTRAINT auth_transfers_branch_id_fkey
  FOREIGN KEY (branch_id) REFERENCES blessboard.branches (id) ON DELETE RESTRICT;

ALTER TABLE platform.auth_transfers
  DROP CONSTRAINT IF EXISTS auth_transfers_user_id_fkey;
ALTER TABLE platform.auth_transfers
  ADD CONSTRAINT auth_transfers_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES blessboard.users (id) ON DELETE RESTRICT;
