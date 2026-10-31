# V2.12 AC-05 Admin Negative RBAC

The shared `v5-foundation` runtime preserves the verified positive and safety
evidence: Super Admin `/admin` and read-only preview return 200,
unauthenticated access is denied, and a rejected database returns controlled
503.

The lower-privilege negative scenario remains `BLOCKED`. Assigning a tenant
administrator to the ActiveClinic-only organization is rejected by the
existing role contract with `invalid_input:church_hq_admin_scope`. A
BlessBoard church administrator was not fabricated and RBAC was not weakened.

Required closure is a supported lower-privilege shared-platform principal,
followed by page, Test Database Management, and read-only API denial checks.
