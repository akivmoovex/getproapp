# G2 and G3 execution plan

Do not run this plan until both database flags, the local database guard, and, for browser cases, the browser flag are set on purpose. A prepared file is not permission to open the gate.

Order:

1. AC-05 live denial. Use the existing lower-privilege session against `GET /admin/settings/test-database`. Expect 403 and an unchanged database. The cashier referral case does not count. In-process denial does not count.
2. Patient activation on a disposable database. One staff-created patient, one phone match, no second account, and no session from registration. Wrong organization and expired guest token stay denials.
3. Appointment staff overlap on that same disposable database. One assigned staff member, two overlapping times, one rejection. Do not treat that as slot capacity. `APT-01-03` stays unimplemented until a capacity rule exists.
4. Billing idempotency on the disposable database. One key, one payment row, the second call returns `duplicate_submission`. No production ledger.
5. OTP persistence only after the migration and provider are approved. Until then the integration file should keep failing on the missing `platform.otp_challenges` relation.
6. Browser specs after the database stage, with `hold()` removed only for the case being executed. AC-05 still requires the live session from step 1.

Restore, offline writes, Juflona, retention disposal, and a production OTP provider stay out of this plan.

Gates that remain closed after the 264 in-process passes: G2, G3, G4, AC-05 live denial, portal persistence, and appointment concurrency persistence.
