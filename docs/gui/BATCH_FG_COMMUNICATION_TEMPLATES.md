# BATCH_FG_COMMUNICATION_TEMPLATES — gate stop

**Date:** 2026-07-19  
**Branch:** `V5`  
**Status:** **NOT STARTED** — retain gate failed

## Gate

Source: [`docs/product/FOUNDATION_GROWTH_BACKEND_PRIORITY.md`](../product/FOUNDATION_GROWTH_BACKEND_PRIORITY.md)

| Check | Result |
|-------|--------|
| Communication / announcement templates retained? | **No** |
| Listed as REQUIRED / OPTIONAL GROWTH / retained slice? | **No** |
| Related rows | Scheduled communications **DEFERRED** (BB-08); HQ org templates **DEFERRED** (BB-07) — neither is announcement-template CRUD |
| Catalogue D2–D8 elevation? | Open **M4** — not elevated |

Stitch map (`/hq/announcements`): *Real eligible estimate on publish; **no** scheduling/SMS/**templates***.

## Why this batch did not run

Instruction: implement only if retained. Communication templates are not retained in the priority document. Implementing create/edit/archive/use would invent template storage and draft-population UX without product approval.

## Current honest state (unchanged)

| Surface | State |
|---------|--------|
| Announcement editor | Draft/publish-now fields only |
| Reusable announcement templates | **Absent** |

## Resume when

1. Product retains communication templates (Growth-only unless otherwise approved).  
2. Priority doc records field allow-list, church scope, and entitlement.  
3. Then re-run this batch.

## Not in this stop

- No migration, service, routes, or GUI  
- No hosted migration  

## Suggested commit (docs only)

```text
Document communication-templates batch stop: not retained.
```
