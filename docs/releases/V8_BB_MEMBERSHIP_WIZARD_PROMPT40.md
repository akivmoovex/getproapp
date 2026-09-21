# V8 BlessBoard Membership Wizard — Prompt 40

**Verdict:** pending hosted verify  
**Date:** 2026-09-21  
**Branch:** `V8` only  
**Stitch:** BB03–BB07 desktop + mobile (`projects/5087412725796049014`)  
**QA tenant:** `bb-v8qa-mub23a6v6a6b` (path-public `/c/:org/register`)

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

## Hosted

Filled after deploy.
