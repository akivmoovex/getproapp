# BATCH_FG_DEPARTMENT_MEMBERSHIP — gate stop

**Date:** 2026-07-19  
**Branch:** `V5`  
**Status:** **NOT STARTED** — prerequisite and retain gates failed

## Gates

| Check | Result |
|-------|--------|
| Departments foundation (BB-03) complete? | **No** — no V5 department schema/routes; BB-03 still **DEFERRED** ([priority](../product/FOUNDATION_GROWTH_BACKEND_PRIORITY.md); [BATCH_FG_DEPARTMENTS](./BATCH_FG_DEPARTMENTS.md)) |
| This subfeature retained? | **No** — not listed as a retained/REQUIRED/OPTIONAL slice; membership/leadership is not scheduled after BB-03 directory CRUD |
| Global department-lead role approved? | **No** — fixed roles only; “do not invent pastoral/leader roles” |

## Why this batch did not run

Instruction: run only if departments foundation is complete **and** this subfeature is retained. Both fail. Implementing membership/leadership would invent tables and assignment UX on top of a missing department domain, and risk a de-facto leadership role without product approval.

Duty schedules / attendance are out of scope for this batch anyway; they were not started.

## Resume when

1. Product retains and ships **BB-03** departments foundation.  
2. Product explicitly retains department membership / scoped leadership (not a new global `role_key`).  
3. Priority doc (or a follow-on slice note) schedules this after BB-03.

## Not in this stop

- No migration, service, routes, or GUI  
- No hosted migration  
- Duty rosters / schedules **not** started  

## Suggested commit (docs only)

```text
Document department membership batch stop: blocked on deferred BB-03.
```
