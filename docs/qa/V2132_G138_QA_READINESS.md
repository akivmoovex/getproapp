# V2.13.2 G138 — QA readiness

QA_GO = NO-GO. RELEASE_READY = NO. Hosted QA is not verified. Do not deploy.

Both products remain 2.13.2. `main` was not modified.

Safe tests: 559 passed, 0 failed, 2 skipped, of 561.

HTTP run 1 and run 2, each: 35 executed, 32 passed, 3 failed, 0 skipped. Failures are only:

- D14C OTP. `platform.otp_challenges` is absent. Migration 048 was not created or executed.
- D16 platform OTP. Same missing table.
- D25 slot. `BLOCKED_APPROVAL_REQUIRED`. D21-05 has no capacity number. The test still throws.

D25 overlap and the two-connection same-staff test passed in both HTTP runs. One booking wins, the collision rolls back, a different staff member and the next touching interval succeed, and the other clinic stays at zero appointments.

Playwright cycle 1 and cycle 2, each: ActiveClinic 22 passed, BlessBoard 23 passed, combined 45 passed, 0 failed.

Patient activation, vitals correction, and website text plus an authorized https image reference are local disposable-database proofs. They are not hosted QA. Production media upload stays disabled. Public booking stays disabled. Unknown public users still cannot create a clinical patient.

No critical authorization regression appeared in these runs. The other-clinic portal registration, the other-clinic vitals correction, and the other-clinic appointment insert stayed denied.

## Blockers

1. Approve D21-05 before D25 slot can pass. The approval must name the capacity integer, whether it differs from one overlapping visit per assigned staff member, whether an unassigned visit counts, and where that integer already lives.
2. Approve an OTP challenge table before D14C and D16 can pass. Do not create `platform.otp_challenges` without that approval.
3. Repeat the 23 November scenarios on the hosted ActiveClinic site. Local passes do not close hosted QA.

## Next action

Keep this candidate undeployed. The next product change that can turn a red HTTP test green is an approved D21-05 capacity rule or an approved OTP persistence migration, not a weaker assertion.
