# BATCH_FG_DUTY_ROSTER — gate stop

**Date:** 2026-07-19  
**Branch:** `V5`  
**Status:** **NOT STARTED** — retain and prerequisite gates failed

## Gates

Source: [`docs/product/FOUNDATION_GROWTH_BACKEND_PRIORITY.md`](../product/FOUNDATION_GROWTH_BACKEND_PRIORITY.md)

| Check | Result |
|-------|--------|
| Duty roster retained? | **No** — **DEFERRED** (BB-04); open **M5** retain decision |
| Departments foundation complete? | **No** — BB-03 still **DEFERRED**; no V5 department schema ([BATCH_FG_DEPARTMENTS](./BATCH_FG_DEPARTMENTS.md)) |
| W4 entry criteria | “BB-03 done **or** explicit no-department dependency” — **neither met** |

Priority: BB-04 is **separate** from departments; may reference department ids **only if BB-03 shipped**. Product has not elevated either class to REQUIRED/OPTIONAL.

## Why this batch did not run

Instruction: run only if duty roster is retained **and** departments are complete. Both fail. Implementing would invent roster schema, assignment rules, and Stitch GUI without an approved department/ministry model or retain decision.

Also out of scope for this stop (and not implemented): SMS/email reminders, shift-swapping, availability automation, calendar integration, notifications.

## Current honest state (unchanged)

| Surface | State |
|---------|--------|
| Stitch duty-roster pair | See `STITCH_SCREEN_MAP.md` / blocked-screens inventory |
| V5 schema / routes / GUI | **Missing** |
| Member “My Duties” | Not approved — not implemented |

## Resume when

1. Product retains departments (**M5**) and ships **BB-03**, **or** explicitly approves a no-department roster model.  
2. Product elevates duty roster from **DEFERRED** to retained.  
3. Priority doc updates BB-04 / W4 entry criteria accordingly.

## Not in this stop

- No migration, service, routes, or GUI  
- No hosted migration  
- No notifications  

## Suggested commit (docs only)

```text
Document duty-roster batch stop: deferred pending BB-03 and M5.
```
