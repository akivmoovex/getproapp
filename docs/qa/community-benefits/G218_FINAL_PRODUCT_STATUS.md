# G218 final product status

Community Benefits is new source on V13. It is not released and it is not deployed. Product version remains 2.13.2.

## Existing released functionality

BlessBoard and ActiveClinic About stay on 2.13.2. This cycle did not change OTP, public booking, media uploads, AC-05, or the appointment overlap rule. Those existing gates were re-run and kept their previous results.

## New Community Benefits source

Membership, consent gating, presentation passes, reception check-in, clinic attribution, eligibility, patient linking, and integer agreement math are in `src/activeclinic/communityBenefits/`. The feature flag defaults off. A production signal cannot turn it on.

## Mock-backed QA

`playwright.v13-ac-community.config.cjs` starts an isolated server with an injected memory store. Eight tests passed twice. That evidence is `BROWSER_MOCK_BACKED`. It is not PostgreSQL end to end.

## Verified PostgreSQL E2E

Community Benefits PostgreSQL end to end did not pass. `PERSISTENCE_PASS=0`. The reviewed schema was not applied. Existing ActiveClinic and BlessBoard Playwright runs do use the disposable database. They passed 30 and 23 twice. Those runs do not prove Community Benefits persistence.

## Pending migrations

`docs/qa/community-benefits/V2132_COMMUNITY_BENEFITS_SCHEMA.sql` is reviewed and marked not applied. It is not under `db/migrations`. `048_otp_challenges.sql` was not created. The OTP script was not executed.

## Pending commercial decisions

The meaning of 10% is not approved. Models A, B, and C calculate only. No agreement is active. No clinic has an approved legal state.

## Pending legal approvals

Automatic enrollment is consent-gated because Zambia consent language is not approved. A QR scan is not identity verification.

## Deployment readiness

Not ready. QA is NO-GO. V2.13.2 release ready is NO. No production flag was enabled. No deployment was performed.
