# V13 G115 platform OTP migration review

D14C and D16 still fail. Both throw because `platform.otp_challenges` is absent. The tests were not skipped and were not rewritten into passes.

Contract tests require `db/migrations/platform/048_otp_challenges.sql` to be absent. G120 did not add that file and did not execute a migration.

Reviewed design, not applied:

```sql
CREATE TABLE platform.otp_challenges (
  id uuid PRIMARY KEY,
  organization_id uuid NULL REFERENCES platform.organizations (id),
  subject_kind text NOT NULL,
  subject_id uuid NOT NULL,
  purpose text NOT NULL,
  code_hash text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_challenges_subject_purpose_idx
  ON platform.otp_challenges (subject_kind, subject_id, purpose, expires_at);
```

Before any later authorization:

1. Add the file only under a new approved name. Do not edit 043 or 044.
2. Store a hash, never the code.
3. Fail closed when the table is missing.
4. Deny replay, expiry, and a wrong purpose.
5. Apply it only on `getpro_v13_e2e_g78d2301` after a separate approval.
6. Keep production SMS and email off.

`NEW_MIGRATIONS_EXECUTED=NO`.
