# ActiveClinic Stitch — Implementation Ledger

**Starting SHA (mission):** `1fcd61a6b9a66c32399a510a40336d7ca95a3c6c`  
**Branch:** `V6`  
**Production touched:** no · **Deployed:** no · **Pushed:** no

## Pre-existing WIP (preserved)

At mission start the working tree already contained patient UI work and related docs/CSS/nav changes. Preserved; staged only into the Phase 2 checkpoint when belonging to P02.

## Actual Stitch phases (source of truth)

| Phase | Label | Module | Screens |
|------:|-------|--------|--------:|
| 1 | `P01` | Auth / shell | 7 |
| 2 | `P02` | Patients | 18 |
| 3 | `P03` | Appointments / reception / queues | 20 |
| 4 | `P04` | Triage / consultation | 12 |
| 5 | `P05` | Pharmacy / stock | 29 |
| 6 | `P06` | Lab / imaging | 14 |
| 7 | `P07` | Billing / cashier | 73 |

Unprefixed foundation duplicates (6) + platform states (4) recorded in master inventory. `P13` (16 staff/roles screens) is **after** Phase 7 — not implemented here.

## Checkpoints

| Phase | Starting SHA | Ending SHA | Attempted | Complete | Partial | Blocked | Tests | Next safe action |
|------:|--------------|------------|----------:|---------:|--------:|--------:|-------|------------------|
| Inventory | `1fcd61a6` | *(with phase 1)* | 173+10 | — | — | — | n/a | P01 verify |
| 1 | `1fcd61a6` | *(pending commit)* | 7 | 0 | 7 | 0 | P01 suite pass | P02 patients |
| 2 | *(after P1)* | *(pending)* | 18 | 0 | 17 | 1 print card | patient suites pass | P03 blocked docs |
| 3 | | | 20 | 0 | 0 | 20 | n/a | schema required |
| 4 | | | 12 | 0 | 0 | 12 | n/a | schema required |
| 5 | | | 29 | 0 | 0 | 29 | n/a | schema required |
| 6 | | | 14 | 0 | 0 | 14 | n/a | schema required |
| 7 | | | 73 | 0 | 0 | 73 | n/a | schema required |

### Phase 1 detail

- Screens: all P01 PARTIAL (login, dashboard, shell, drawer, shared states).
- No dead clinical nav links.
- Dashboard uses real foundation counts only; clinical KPIs omitted.
- Routes unchanged.
- Migrations: none.
- Tests: `activeclinic-auth-stitch-parity`, `dashboard-shell-parity`, `application-shell` — pass. Broader auth/lifecycle/isolation/session — pass after Patients-nav contract update deferred to Phase 2 commit.

### Phase 2 detail (in progress)

- Functional patient list/register/review/success/profile/edit/duplicate/states.
- Print Patient Card = PRODUCT_DECISION.
- Fixes: archive/deceased result checks; id/ec/status error flashes; review-required create CTA; medical-history honesty note.
- Test contract updates: allow Patients nav word without allowing fabricated clinical KPIs.
