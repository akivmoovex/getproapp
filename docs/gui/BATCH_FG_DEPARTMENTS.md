# BATCH_FG_DEPARTMENTS — gate stop

**Date:** 2026-07-19  
**Branch:** `V5`  
**Status:** **NOT STARTED** — retain gate failed

## Gate

Source: [`docs/product/FOUNDATION_GROWTH_BACKEND_PRIORITY.md`](../product/FOUNDATION_GROWTH_BACKEND_PRIORITY.md)

| Check | Result |
|-------|--------|
| Departments retained for Foundation/Growth? | **No** |
| Classification | **DEFERRED (fundable)** — Priority 3 **after product retain decision** |
| Agent window W3 entry criteria | “Product retains departments for V5” — **not met** |
| Open product question | **M5** — Retain departments/duty Stitch for V5? |

Slice BB-03 text: *“Do not start until product elevates class to REQUIRED/OPTIONAL…”* and lists departments under deferred items in the report summary.

## Why this batch did not run

Instruction: implement only if departments are **retained**. They are deferred pending M5. Shipping schema/routes/GUI now would invent a church/branch department model and entitlement behavior without an approved retain decision.

Unresolved before any future implement:

1. Church-level vs branch-scoped ownership (priority slice notes “church/branch scoped”)  
2. Whether ministries are distinct (requirement: do not duplicate unless model distinguishes them)  
3. Whether branch admin is approved for CRUD  
4. Foundation/Growth entitlement key vs “all packages”

## Current honest state (unchanged)

| Surface | State |
|---------|--------|
| Stitch desktop | `7ee4d401f26d45b8ae18f26fe9b391ec` |
| Stitch mobile | `3794bd0c398b42cbb3987964807b27c3` |
| V5 schema / routes / GUI | **Missing** |

## Resume when

1. Product answers **M5** and elevates departments to **REQUIRED** or **OPTIONAL GROWTH** (or otherwise marks retained).  
2. Priority doc updates BB-03 class and W3 entry criteria.  
3. Scope decisions above are signed (ownership, branch admin, entitlement).

## Not in this stop

- No migration, repository, routes, views, or nav  
- No hosted migration  
- Duty rosters **not** started  

## Suggested follow-up

Update `FOUNDATION_GROWTH_BACKEND_PRIORITY.md` when product retains departments; then re-run this batch prompt.
