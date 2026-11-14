# False-positive risks

Ranked by how easily a green count can hide a broken behavior.

1. **Persisted outcome is untested.** All 142 ActiveClinic cases have `persists_rows=no`. A unique constraint, a trigger, or a second statement in the same transaction can be wrong while every current test passes.

2. **Integration files pass on the hold.** `runGated` returns `NOT_RUN` when the write flags are off, and the test does not fail. `d16-ac-auth.integration.test.js` does not even assert that return value. A green integration run is evidence that the gate held.

3. **CI does not run the D38–D52 tests.** `npm run test:v13:ac` is five files and 14 cases: `d16-ac-v213-contract`, `d19-qa-implementation`, `d14c-otp-auth`, `d17-ac-behavior`, and `d19-synthetic-fixtures`. Stage A and the non-mutating Stage D both run that script. The local 308-case G1 is a different command.

4. **AC-05 is a query double.** `d22-ac05-admin-denial.test.js` returns rows from an in-memory `query`. It does not sign in `tenant-reader@v13d19.example`. A broken session middleware can leave this file green. The file itself says a query double does not close the gate.

5. **Rollback and concurrency are simulated.** Appointment and consent tests can reject a fake error or a missing `rowCount`. They do not open two connections, and they do not show that a rolled-back transaction left no row.

6. **Tenant text is not a second tenant.** Contracts search source for `organization_id`. They do not insert clinic A and clinic B and read back one clinic’s patient from the other.

7. **One hundred thirty-six `* 2.js` copies** sit beside older ActiveClinic tests. They are not in this V13 inventory and not in G1. Editing one does not change the other.

An ID in a test name, including `ID-01-02` inside `d32-clinical-foundation.test.js`, is not one of the 84 acceptance results. Those 84 remain 0 passed.
