# V8 BlessBoard Membership Wizard — Prompt 40

**Verdict:** `V8_BB_MEMBERSHIP_WIZARD_PASS`  
**Date:** 2026-09-21  
**Branch:** `V8` only  
**Implementation SHA:** `37cd39a3ba18feacba6d6c3beecddae82cfc7dee`  
**Hosted application SHA:** `37cd39a3ba18` (confirmed `/healthz`)  
**Stitch:** BB03–BB07 desktop + mobile (`projects/5087412725796049014`)  
**QA tenant:** `bb-v8qa-mub23a6v6a6b` via path-public `/c/:org/register`

## Goal

Replace the single-page membership application with the approved four-step journey:

1. Personal and contact details (BB03)  
2. Optional spiritual background (BB04)  
3. Participation interests (BB05)  
4. Review and submit (BB06)  
→ Confirmation (BB07)

## Implementation

| Area | Change |
|------|--------|
| `views/blessboard/v5/public/register.ejs` | Always-on wizard panels; progress stepper; review summary; Next/Back |
| `public/blessboard/v5/membership-wizard.js` | Step nav, validate-before-advance, review refresh, single-submit guard |
| `tenant-auth.css?v=17` | Desktop node stepper + mobile progress bar + review styles |
| BB07 | Existing confirmation; CSS pin `v=17` |
| Backend | Unchanged — reuses `submitMembershipApplication`, church/branch from host/path scope |

Requirements covered: functional Next/Back, DOM-preserved fields, step-1 validation, optional BB04/BB05, submit once (client guard + server duplicate handling), no auto login, 1440/390 layouts, no pastoral notes in public output.

## Local tests

| Suite | Result |
|-------|--------|
| `v8-bb-membership` + a11y + path-public | PASS |
| `scripts/v8/run-suite.js blessboard` | **PASS** (241/241) |
| `shared-platform` | PASS |
| `compatibility` | PASS |

## Hosted evidence (`37cd39a3ba18`)

Harness: `scripts/local/v8-bb-membership-wizard-p40-hosted.js`

| Check | Result |
|-------|--------|
| GET `/c/bb-v8qa-…/register` | **200**, wizard + panels 1–4 + Next + review |
| Path-public form action | `/c/bb-v8qa-mub23a6v6a6b/register` |
| Submit disposable application | BB07 confirmation, ref `2682ae15-659d-4631-b501-c4afacb23f15` |
| No auto login copy | Present |
| Missing first name | **400**, stayed on form |
| Pastoral notes in public HTML | Absent |

## Final verdict

**`V8_BB_MEMBERSHIP_WIZARD_PASS`**
