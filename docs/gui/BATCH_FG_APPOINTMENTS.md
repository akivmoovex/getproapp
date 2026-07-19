# BATCH_FG_APPOINTMENTS — gate stop

**Date:** 2026-07-19  
**Branch:** `V5`  
**Status:** **NOT STARTED** — retain gate failed

## Gate

Source: [`docs/product/FOUNDATION_GROWTH_BACKEND_PRIORITY.md`](../product/FOUNDATION_GROWTH_BACKEND_PRIORITY.md)

| Check | Result |
|-------|--------|
| Appointments retained? | **No** |
| Classification | **DEFERRED** (Growth catalogue / marketing-only; no schema/routes) |
| Backlog id | BB-12 (`appointments.calendar`) — not elevated |
| Open product question | **M4** — elevate catalogue D2–D8 to sold Growth? |

Priority: *Marketing-only today* · High complexity/risk · **DEFERRED**. Not in the next five. Rules also forbid inventing a general calendar platform without retain.

## Why this batch did not run

Instruction: implement only if appointments are **retained**. They are deferred. No approved appointment type/scope, privacy rules, or confirmation that `member_requests` may represent appointments. Implementing would invent scheduling semantics, admin queues, and status transitions without product sign-off.

Current honest path: existing **member requests** / forms workflows — not an appointments product.

## Resume when

1. Product elevates appointments from **DEFERRED** (Growth-only unless otherwise approved).  
2. Priority/product doc defines category, request reuse vs new tables, and privacy.  
3. Then re-run this batch (no external calendar sync / payments).

## Not in this stop

- No migration, service, routes, or GUI  
- No calendar sync, auto-confirm, or payment  
- No hosted migration  

## Suggested commit (docs only)

```text
Document appointments batch stop: deferred pending catalogue elevation (M4).
```
