# V2132 G270 browser acceptance guide

Use after an **explicitly authorized** hosted QA deploy of the approved V13 tip.  
Do not use production. Synthetic patients only. No real email/SMS. No financial posting.

Hosts:

- https://activeclinic.pronline.org  
- https://blessboard.pronline.org  

## Pre-checks (read-only)

1. `/healthz` → `environment=testing`, `deploymentCode=moovex-platform-testing`, `gitSha` equals approved tip.  
2. `/about` → product version **2.13.4**, build SHA matches tip.  
3. Confirm public booking remains disabled.  
4. Confirm no live Resend key was enabled unless separately approved.

## ActiveClinic smoke (must pass)

| ID | Actor | Steps | Pass criteria |
| --- | --- | --- | --- |
| AC-S1 | Admin | Login → workspace | Staff shell, correct clinic |
| AC-S2 | Reception | Create synthetic patient; search by phone/name | One chart; facility association |
| AC-S3 | Clinician | Start encounter; record vitals; correct once | Correction persisted; stranger denied |
| AC-S4 | Clinician + lab | Order CBC/FBC → collect → receive → enter summary **and components** → second tech verifies → clinician read-back | Components visible on detail/print region; same-actor verify fails |
| AC-S5 | Clinician + rad | Order → report findings/impression → verify with second actor → read-back | Reported not in Open; counters move |
| AC-S6 | Admin | Draft website text → preview private → publish → public read-back | Draft private until publish |
| AC-S7 | Patient | Staff-created activation → portal login; wrong-clinic denied | One activation |
| AC-S8 | Any | Attempt public booking | Disabled; no coupon |

## BlessBoard smoke (must pass)

| ID | Actor | Steps | Pass criteria |
| --- | --- | --- | --- |
| BB-S1 | HQ admin | Login | Correct church shell |
| BB-S2 | HQ admin | Member register → activate → login | Portal works |
| BB-S3 | Admin | Draft sermon/event/announcement → publish → other-church isolation | Draft private; cross-church absent |
| BB-S4 | Visitor | Contact form → admin inbox | Correct church only |
| BB-S5 | Invited staff | Accept invite → set password → login | Role-limited |

## Community Benefits (hosted)

Only if feature flag remains off or mock path is intentional:

- Confirm posting disabled / settlement preview only.  
- Do not activate commercial agreements.  
- Do not apply Community schema without separate approval.

## OTP

- Expect production-style OTP activation blocked unless non-prod `GETPRO_OTP_ACTIVATION=ACTIVE` was separately authorized.  
- Do **not** send live mailbox OTP unless Resend readiness ticket is closed.  
- `verifyChallenge` alone must not create a session.

## Fail criteria (any → stop and roll back)

- Hosted SHA ≠ approved tip  
- Environment ≠ testing  
- Lab components missing after G266 tip deploy  
- Cross-clinic data leak  
- Public booking enabled  
- Live OTP/email without approval  
- Any financial posting
