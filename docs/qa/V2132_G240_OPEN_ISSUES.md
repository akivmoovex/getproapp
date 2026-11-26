# G240 open issues

## P1 coverage

- Independent print-ready assertions for clinical documents beyond laboratory
  results and radiology reports (SOAP, prescriptions, referrals) without
  inventing unapproved print formats.
- Complete SOAP and referral field-by-field browser/persistence matrix.

## Closed this cycle

- Full radiology order → report → verify → clinician read-back journey
  (HTTP + browser + PostgreSQL read-back).
- Radiology reported filter/tab and dashboard counter.
- Radiology request detail with print and second-staff verification.

## Blocked gates

- D14C and D16: absent `platform.otp_challenges` schema.
- Community Benefits PostgreSQL: reviewed schema not applied.
- D25 slot capacity: policy not approved.
- Production OTP/live email: provider and production activation not approved.
- Financial posting and public booking: explicitly disabled.

None of these are hidden as skips or counted as PASS.
