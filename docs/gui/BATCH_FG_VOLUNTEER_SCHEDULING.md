# BATCH_FG_VOLUNTEER_SCHEDULING — gate stop

**Date:** 2026-07-19  
**Branch:** `V5`  
**Status:** **NOT STARTED** — prerequisite and retain gates failed

## Gates

Source: [`docs/product/FOUNDATION_GROWTH_BACKEND_PRIORITY.md`](../product/FOUNDATION_GROWTH_BACKEND_PRIORITY.md)

| Check | Result |
|-------|--------|
| Volunteer opportunities complete? | **No** — [BATCH_FG_VOLUNTEER_OPPORTUNITIES](./BATCH_FG_VOLUNTEER_OPPORTUNITIES.md) stopped; BB-13 deferred |
| Volunteer scheduling retained? | **No** — **DEFERRED** (Growth catalogue; BB-13) |
| Duty-roster structures available to reuse? | **No** — BB-04 duty roster also **DEFERRED**; [BATCH_FG_DUTY_ROSTER](./BATCH_FG_DUTY_ROSTER.md) stopped |
| Scheduled communications for reminders? | **No** — BB-08 deferred / MISSING_BACKEND |

## Why this batch did not run

Instruction: run only if volunteer opportunities are complete **and** scheduling is retained. Both fail. There is no approved opportunity or duty-roster model to reuse; implementing assignment/cancellation would invent a third scheduling surface.

Reminders and shift swaps were not started (and are not available).

## Resume when

1. Product retains and ships volunteer opportunities.  
2. Product retains scheduling (and clarifies reuse of opportunities vs duty roster).  
3. Priority doc is updated accordingly.  
4. Then re-run this batch.

## Not in this stop

- No service, routes, or GUI  
- No reminders or shift swaps  
- No hosted migration  

## Suggested commit (docs only)

```text
Document volunteer-scheduling batch stop: blocked on deferred BB-13.
```
