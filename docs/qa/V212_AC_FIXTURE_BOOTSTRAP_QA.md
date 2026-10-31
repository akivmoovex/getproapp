# V2.12 ActiveClinic Fixture Bootstrap QA

Status: `BLOCKED`

Environment checks passed: V12 HEAD `07f4fcdfd9f7ab22585b59e3cbebf608b4569687`, isolated network `v212-qa-internal`, synthetic PostgreSQL identity, and existing six synthetic patients/one confirmed appointment.

The existing supported seeds are repeatable for the demo clinic and QA role users. They do not provide:

1. a public booking request with a supported guest access token and deliberate patient association;
2. a second clinic with independently seeded patient and appointment records;
3. a platform Super Admin identity/deployment relationship in the ActiveClinic database.

No direct role insertion, fabricated token, tenant-ID rewriting, or database reset was performed. These are test-fixture/provisioning blockers, not confirmed product defects.
