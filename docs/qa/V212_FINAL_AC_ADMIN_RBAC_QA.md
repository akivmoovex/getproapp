# V2.12 Final AC-05 Admin RBAC QA

The shared `v5-foundation` runtime evidence remains valid:

- Super Admin `/admin`: `200`
- Test Database Management page: `200`
- Read-only preview: `200`
- Unauthenticated `/admin`: `303`
- Rejected database safety guard: controlled `503`

The lower-privilege gate remains `BLOCKED`. The existing supported role
assignment rejected `organisation_administrator` with
`invalid_input:church_hq_admin_scope` because the synthetic ActiveClinic
organization is not a BlessBoard church scope. A website-support role is not
accepted by the production role-assignment contract. No cross-product tenant
identity, fabricated role, or authorization bypass was used.

Required closure is a supported shared-platform non-Super-Admin principal,
then denial checks for `/admin`, Test Database Management, and the preview API.
