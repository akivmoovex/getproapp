# V2.13.2 G130 — security and repeatability

The second HTTP run and the second Playwright cycle were separate processes. Their counts are not merged with the first runs.

Checked in source and tests:

- Public registration does not insert `activeclinic.patients`.
- Phone match is scoped by organization and healthcare organization.
- Ambiguous matches and already linked patients are rejected.
- Vitals correction inserts a new row and rejects a second correction of a superseded row.
- Original vitals rows are not updated.
- Same-staff appointment overlap is locked inside the transaction. Slot capacity was not added.
- `048_otp_challenges.sql` was not added.
- Public booking, production media upload, and production OTP stay off.
- CSRF remains on the vitals correction post.

No new skip was added. D14C, D16, and D25 slot stay visible failures.

Two ActiveClinic browser runs passed 20. Two BlessBoard browser runs passed 23. Two HTTP runs passed 31 of 34.

QA is NO-GO. Hosted QA was not executed.
