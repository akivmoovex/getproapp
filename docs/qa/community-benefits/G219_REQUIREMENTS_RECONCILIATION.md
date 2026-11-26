# G219 requirements reconciliation

Base commit: `f2ea819fc1a0d208dd5d7b95c78edb0d8a7701ab` on branch V13. `origin/V13` matched that commit before this cycle. Product versions stay ActiveClinic 2.13.2 and BlessBoard 2.13.2.

## Specification source

The file `ActiveClinic_Community_Benefits_Product_Technical_QA_Specification_v1_2(1).pdf` was searched again in the V13 worktree and was not present. G218 already recorded that Cursor could not read that PDF. This cycle does not claim complete PDF traceability.

The figure of 190 scenarios remains a planning target from the implementation prompt. It is not a count of executed tests.

Requirements below are the written rules from G193 through G218 plus the G219–G223 prompt.

## Preserved distinctions

| Rule | Source | Test |
| --- | --- | --- |
| Portable network-wide membership | `activateMembership` in `communityBenefitsService.js` | `g195` membership test |
| Clinic-specific referral eligibility | `recordIntroduction` writes `PLATFORM_INTRODUCED` only for the target clinic | `g211` A/B/C attribution |
| Clinic A direct walk-in stays ineligible at A | `recordWalkIn` plus `decideEligibility` reason `walk_in_no_introduction` | `g195` and community browser check-in |
| A later documented introduction can qualify clinic B | `recordIntroduction` when current acquisition is absent or `CLINIC_EXITED` | `g211` and clinic B browser preview |
| QR presentation alone creates no referral | `presentPass` does not append introductions | `g195` QR test and browser fixtures |
| Clinical records stay clinic-scoped | `readChart` and `searchLocalPatients` filter by clinic | `g195` link test and `g220` lookup test |

## Requirement matrix

| Requirement | Source | Executed test | Status |
| --- | --- | --- | --- |
| Flag off by default and off in production | `flags.js` | `g194` contract, `g198` HTTP | Executed |
| Consent before active membership | `requestEnrollment`, `recordConsent` | `g195` | Executed |
| One membership per person | `activateMembership` | `g195` | Executed |
| Pass issue, rotate, revoke | `issuePass`, `rotatePass`, `revokePass` | `g195`, browser | Executed, memory store |
| Reception check-in requires reception or clinic admin | `routes.js` | `g211`, browser | Executed |
| Explicit chart confirmation before linking | `linkMember` | `g195`, browser | Executed |
| Name and phone lookup without auto-link | `searchLocalPatients` | `g220`, browser | Executed |
| Masked candidates and duplicate handling | `searchLocalPatients` | `g220`, browser | Executed |
| Inactive or unapproved agreement is not eligible | `selectAgreementForClinic` | `g211` | Executed |
| Exact minor-unit model math | `money.js`, `previewInvoice` | `g195` | Executed, synthetic rates |
| Ledger plan and refund plan | `planLedger`, `planRefund` | `g195`, `g211` | Executed, not posted |
| Settlement batch preview | `planSettlementBatch` | `g220`, browser | Executed, `PENDING_APPROVAL` |
| Settlement execution and funds movement | `commitSettlement` | `g220` | Refused, `posting_disabled` |
| PostgreSQL persistence | reviewed SQL, `g206` | authorized check | `BLOCKED_BY_MIGRATION` |

National-identifier search and automatic chart merge are not implemented. No approved identity policy authorizes them. Phone match alone does not create an introduction or a link.
