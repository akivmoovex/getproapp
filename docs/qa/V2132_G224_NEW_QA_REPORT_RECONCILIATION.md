# G224 QA report reconciliation

Base before this cycle: `13740959ffd61e35f32f50c77c9b3246a29a162f` on V13. Product version stays 2.13.2.

## Source documents

The two named files were not on disk:

- ActiveClinic V2.13.1 Sanity Testing and Bug Fix Report
- ActiveClinic V2.13.1 New Features Role-Based Test Report

Searches of the V13 worktree, Downloads, and Documents did not find those DOCX attachments. The November 25 PDF in Downloads is the release-notes and browser guide, not these two reports. This reconciliation uses the findings named in the G224 request. It does not claim that 26 role scenarios from an unread report were executed.

The existing role catalogue has 16 ActiveClinic role keys in `activeClinicQaRoleUsersSpec.js`. Those keys already have permission-matrix tests. They are not a substitute for an unread 26-row report.

## Named findings

| Finding | Class | Current behavior |
| --- | --- | --- |
| Laboratory result entry after specimen receipt | CONFIRMED_BUG | The service already accepted status `received`. The request page offered no Enter result action, so the form was unreachable. |
| Laboratory queue filters | CONFIRMED_BUG | Open queue already included `received`. The visible tabs jumped from pending collection to processing, so a received order disappeared from the selected filter. |
| Dashboard counters | CONFIRMED_BUG | Counts are SQL aggregates. The laboratory dashboard omitted collected, received, and resulted. Verification updated the result row and left the request status at `resulted`, so the verified counter stayed at 0. |
| Radiology queue filters | CONFIRMED_BUG | Open queue already included `completed`. The completed tab and dashboard card were absent. |
| Vitals correction | ALREADY_FIXED_LOCAL | Append-only correction is in source and in the existing browser journey. Hosted retest is still required. |
| Missing print actions | CONFIRMED_BUG | The laboratory result page had no print control. Patient card and billing already print. |
| Patient portal activation | ALREADY_FIXED_LOCAL | Staff-created patient activation is covered by the existing browser journey. Hosted retest is still required. |
| Patient authentication | BLOCKED_BY_DEPENDENCY | Testing reset remains available. Production OTP stays disabled. D14C and D16 still fail because `platform.otp_challenges` is absent. |
| New website-section publication | ALREADY_FIXED_LOCAL | Draft text stays private until publish. Binary upload stays disabled. |
| OTP delivery | BLOCKED_BY_DEPENDENCY | No mail is sent. The challenge table is not applied. |
| Public booking disabled | POLICY_MISMATCH | The disabled state is the approved contract. It is not a defect. |

No new migration was applied. Community Benefits posting stays disabled. Public booking stays disabled. Production media uploads stay disabled.
