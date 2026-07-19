# BATCH_FG_SCHEDULED_COMMUNICATIONS — gate stop + MISSING_BACKEND

**Date:** 2026-07-19  
**Branch:** `V5`  
**Status:** **NOT STARTED** — not retained; prerequisites missing

## Gates

| Check | Result |
|-------|--------|
| Scheduled communications retained? | **No** — **DEFERRED** (Growth catalogue / marketing-only; BB-08 not in next five) ([priority](../product/FOUNDATION_GROWTH_BACKEND_PRIORITY.md)) |
| Job / delivery infrastructure approved for V5? | **No** — architecture: *“No V5 blessboard job/outbox for broadcasts, reports, or offline sync”* |
| Safe to implement? | **No** |

Blocked-screens D2: *No V5 announcement scheduler, job runner, or SMS channel — publish-now only*.

## Pre-code verification

| Item | Finding |
|------|---------|
| Announcement publication service | **Yes** — publish-now HQ/branch announcement flows exist |
| Audience estimation | **Yes** — eligible estimate on publish (existing) |
| Job runner for scheduled publish | **No** V5 blessboard schedule/outbox worker |
| Delivery channels (SMS / WhatsApp / email) | **Not** implemented for V5 scheduled communications |
| `BLESSBOARD_JOBS_ENABLED` | Master switch; V5 foundation keeps jobs disabled / no workers started; hosted SoT `BLESSBOARD_JOBS_ENABLED=0` |

### Verdict

**MISSING_BACKEND** — even if later retained, do not ship schedule GUI that pretends success while jobs are off or channels are absent.

## Why this batch did not run

1. Feature is **DEFERRED**, not retained.  
2. No safe V5 scheduler + delivery for announcements.  
3. Requirement: do not add SMS/WhatsApp/email unless genuinely implemented — they are not.

## Current honest state (unchanged)

| Surface | State |
|---------|--------|
| `/hq/announcements` (+ branch mount) | Publish-now; no schedule states |
| Stitch schedule chrome | Not wired to a V5 scheduler |

## Resume when

1. Product elevates scheduled communications from **DEFERRED** (Growth-only unless otherwise approved).  
2. Ops/product approves V5 job runner with fail-closed behavior when `BLESSBOARD_JOBS_ENABLED` is off.  
3. Delivery contract signed (in-app publish-at-time only vs real channels).  
4. Then re-run this batch.

## Not in this stop

- No migration, scheduling service, routes, or GUI  
- No SMS/WhatsApp/email  
- No hosted migration  

## Suggested commit (docs only)

```text
Document scheduled-communications batch stop: deferred and MISSING_BACKEND.
```
