# BATCH_FG_VOLUNTEER_OPPORTUNITIES — gate stop

**Date:** 2026-07-19  
**Branch:** `V5`  
**Status:** **NOT STARTED** — retain gate failed

## Gate

Source: [`docs/product/FOUNDATION_GROWTH_BACKEND_PRIORITY.md`](../product/FOUNDATION_GROWTH_BACKEND_PRIORITY.md)

| Check | Result |
|-------|--------|
| Volunteer scheduling / opportunities retained? | **No** |
| Classification | **DEFERRED** (Growth catalogue / marketing-only; no schema/routes) |
| Backlog id | BB-13 (`volunteers.scheduling`) — not elevated |
| Open product question | **M4** — elevate catalogue D2–D8 to sold Growth? |
| Departments dependency | BB-03 departments also **DEFERRED** — optional ministry/department link not available |

Priority: *Marketing-only today* · High complexity/risk · **DEFERRED**. Not in the next five. Duty roster (BB-04) is a separate deferred slice and was not started.

## Why this batch did not run

Instruction: implement only if volunteer scheduling is **retained**. It is deferred. Shipping opportunities + signup would invent capacity, publication, and duplicate-signup rules without product approval—and without a retained department/ministry model for optional linkage.

## Resume when

1. Product elevates volunteer opportunities/scheduling from **DEFERRED** (Growth-only unless otherwise approved).  
2. Priority doc records capacity, cancellation, and optional department linkage.  
3. Then re-run this batch (signup only; not duty rosters).

## Not in this stop

- No migration, service, routes, or GUI  
- No messaging, background checks, or duty rosters  
- No hosted migration  

## Suggested commit (docs only)

```text
Document volunteer-opportunities batch stop: deferred pending M4.
```
