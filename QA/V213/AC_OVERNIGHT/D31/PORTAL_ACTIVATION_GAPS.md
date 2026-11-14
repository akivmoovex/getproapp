# Portal activation gaps

Registration still validates CSRF and does not call `issueAuthenticatedSessionCookie`. Login issues the cookie only after `authenticatePatientIdentity` succeeds. That split is source evidence, not persistence.

Still not run:

- A staff-created patient linked through the phone match and stored.
- A wrong-tenant activation denied against stored rows.
- An expired or replayed activation that leaves no extra account in the database.

D24 already denies expired and revoked guest tokens in memory. A valid booking access token remains usable after verify, because verify updates `last_used_at` and does not revoke the row. This stage does not call that replay a pass.

`PAT-01-01` stays `EVIDENCE_MISSING`. The V2.12 pass sentence is still not reused.
