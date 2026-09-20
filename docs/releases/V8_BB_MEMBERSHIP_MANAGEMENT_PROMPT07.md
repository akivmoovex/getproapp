# V8 BlessBoard Membership Management (PROMPT 07)

**Verdict:** `V8_BB_MEMBERSHIP_MANAGEMENT_PASS`  
**Branch:** `V8` only  
**Date:** 2026-09-21  
**Prerequisites:** Prompt 06 public registration CODE_PASS  
**Prior ancestry:** membership workflow `938813bd` · Prompt 09 `V8_BB_MEMBERSHIP_CODE_PASS`  
**Stitch:** BB11–BB18 desktop + mobile (`projects/5087412725796049014`)  
**Hosts:** Code + local tests only (no deploy / no migration apply)

## Approach

Did **not** rebuild review, approve, pastoral notes, member records, or transfers. Tip already provided the full pastoral review → member record → HQ/branch directory path from prior overnight Prompt 09.

This prompt closed Stitch D/M marker gaps, required same-church transfer confirmation on POST, and hardened tests against invented live metrics.

## Flows

| Flow | Screens |
|------|---------|
| Review queue → application detail | BB11 → BB12 |
| Approve / Needs follow-up / Decline + pastoral notes | BB13 |
| Approved member profile → edit → branch transfer | BB14 → BB15 → BB16 |
| HQ / branch membership dashboards | BB17 / BB18 |

## Requirements checklist

| Requirement | Status |
|-------------|--------|
| Membership review queue and details | Present (BB11/BB12) |
| Separate decision actions | Present (approve / needs_follow_up / decline) |
| Restricted pastoral notes | Present (`pastoral_cases.view_restricted`) |
| Approval audit history | Present (`member_registration_review_events`) |
| Approved member records | Present (BB14+) |
| Member edit and status management | Present (BB15; status via existing workflow) |
| HQ and branch membership dashboards | Present (BB17 / BB18) |
| Authorized branch transfer workflow | **Hardened** — `confirm_transfer` required on POST |
| Separate member records from login accounts | Present (explicit copy; no account on approve/edit) |
| No cross-church or unauthorized branch access | Present (service isolation + transfer same-church) |
| No invented live metrics | **Asserted** — no Attendance Rate / Volunteer Hours / fake KPIs |
| Desktop + mobile Stitch markers | **Added** BB11–BB18 `-D`/`-M` |
| Reuses shared submission + RBAC | Present |

## Changes in this prompt

| Area | Change |
|------|--------|
| Routes | Transfer POST requires `confirm_transfer` (`1`/`on`) |
| Views | BB11–BB18 D/M markers; transfer confirm checkbox; login-vs-member copy; pastoral panel marker |
| Public register | Step nav label `Next step` (avoids a11y forbid on `Continue`) |
| Tests | BB11–BB18 markers, audit/pastoral markers, no invented metrics, `confirm_transfer` |

## Stitch note

BB18-M is still missing as a titled pair in Stitch inventory (83/84). Branch members list ships responsive `BB18-M` markers without inventing a second Stitch screen.

## Tests

- `node --test tests/v8-bb-membership.test.js tests/blessboard-v5-a11y-structure.test.js` — **97/97 PASS**

## Non-goals

- Applying migration `110` on hosted DB  
- Hosted verification (not claimed)  
- Automatic login creation on approve  
- Real notifications  
