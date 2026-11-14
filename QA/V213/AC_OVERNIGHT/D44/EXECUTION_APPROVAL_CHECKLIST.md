# Execution approval checklist

Do not start until every box below is true. This stage left them false.

- [ ] A named approval allows database writes for one run id.
- [ ] Both write flags are set only for that run, then unset.
- [ ] The browser flag is set only after the database stage, then unset.
- [ ] The URL is local and the database name matches `getpro_v13_(ci|bb_qa|int|e2e)_*`.
- [ ] `DATABASE_IDENTITY_ENV=testing`, `GETPRO_TEST_DB=1`, and `NODE_ENV=test`.
- [ ] No banned host marker is in the URL.
- [ ] Existing committed migrations are the only schema applied.
- [ ] No new migration file is created, including an OTP table.
- [ ] Fixture apply is `applyActiveClinicFixtures` for the two synthetic clinics only.
- [ ] AC-05 uses `tenant-reader@v13d19.example` and expects 403, with unchanged row counts.
- [ ] Portal, overlap, document, and billing cases use the plans in this directory.
- [ ] Capacity, escalation, substitution, retention, restore, and Juflona stay out.
- [ ] OTP delivery stays inactive.
- [ ] Playwright uses `E2E_DATABASE_URL` for that same database.
- [ ] The run-owned database is dropped only after the guard still accepts its name.
- [ ] CI is not dispatched.
- [ ] Nothing is committed or pushed as part of the run.

Blocked until a separate approval, even after the boxes above are true: live OTP, slot capacity, encounter states beyond the stored three, amendment writer, allergy block, legal retention, restore, offline writes, and Juflona signing.
