# ActiveClinic V7 — Phase 16 inventory integrity

Evidence pass after overnight + Phases 4–15. **No product implementation. No UI redesign.**

No push. No deploy. Production untouched.

## Verdict

| Check | Result |
|---|---|
| Stitch screens | **388** |
| Mapping rows | **388** |
| Implementation records | **247** |
| Full | **361** |
| Partial | **0** |
| Missing | **0** |
| Product decisions | **9** |
| Duplicates | **8** |
| N/A | **10** |
| Ambiguous | **0** |
| Invalid implementation IDs | **0** |
| Orphan full mappings | **0** |
| Unused screen views (kept) | **2** |
| Push / deploy | no / no |

**Required targets met:** missing=0, ambiguous=0.

## Safety

| | |
|---|---|
| Branch | V7 |
| HEAD | `082b5712944d91b23502cb7b61f2cad98969e2a7` |
| Push | no |
| Deploy | no |
| Stitch (public / booking / portal) | `17813606734422395399` |
| Stitch (internal ops) | `12272131183982732110` |

## Partial

None. Overnight Phase 5A–5E remaps remain in force; live mappings have no PARTIAL_IMPLEMENTATION rows.

## Inventory evidence fixes

- ACV7-IMPL-0159 cashier close marked REDIRECT_ONLY; unused view detached
- ACV7-IMPL-0059 password-updated bound to POST reset-password
- ACV7-IMPL-0118 order route aligned to :orderType (lab)
- ACV7-IMPL-0119 order route aligned to :orderType (prescription)
- ACV7-IMPL-0120 order route aligned to :orderType (radiology)
- Mapping view_paths: procedure-entry.ejs → procedure-info.ejs (3 rows)

## Orphans

### Unused screen views (not deleted)

- `views/activeclinic/app/cashier-close-content.ejs` — GET `/app/cashier/close` redirects to cash-count. ACV7-IMPL-0159 is REDIRECT_ONLY.
- `views/activeclinic/booking/procedure-entry.ejs` — wizard renders `procedure-info.ejs`. Left on disk.

Infra GETs (`/healthz`, `/__ac/*`) are not screen inventory.

## Reverse map

| With Stitch | 201 |
| Without Stitch | 46 |
| Invalid IDs | 0 |
| Orphan full mappings | 0 |

Without-Stitch records are extra V7 states/steps (validation, redirects, infrastructure), not unmapped Stitch screens.

## Product decisions

- **P07 – Insurance Payment Placeholder** (`9c0219d791da43df8a7abf41cf0809df`) — Explicit placeholder / intentionally not built in V7
- **P07 – NHIMA Claim Placeholder** (`0489fa5d1c37481ba159eeed1cd64155`) — Explicit placeholder / intentionally not built in V7
- **P07 – Write-Off Request Placeholder** (`46a8b6c4f4b846e18ab586c3d6fae6ca`) — Explicit placeholder / intentionally not built in V7
- **P13 – Phone Verification** (`1db2777e1f444a0a90ca3174a4700ac2`) — Staff activation uses password set; patient verify-phone is separate portal flow
- **P13 – Role Permission Matrix – Desktop** (`6b9cfcd190e14155ac4390d66d0cff76`) — V7 uses fixed ActiveClinic role catalogue with capability-group summaries and role detail pages. Stitch role×permission matrix editor is intentionally not built — roles are system-defined, not custom-editable.
- **P25 - Juflona Booking - Procedure Slot - Desktop** (`8c52142a20484c39928c8f3355174384`) — V7 uses preferred datetime field; Stitch shows live selectable slot grid. Live slots explicitly not published online.
- **P25 - Juflona Booking - Procedure Slot - Mobile** (`3f05000a252b4732952b7dcbd70a9c06`) — V7 uses preferred datetime field; Stitch shows live selectable slot grid. Live slots explicitly not published online.
- **P25 - Juflona Booking - Referral and Upload States - Mobile** (`ef1d0961e88e43549af5361a5fb9320c`) — Stitch shows referral upload UI states; V7 has no secure public upload storage — honesty banner only
- **P26 - Juflona Booking - Booking Changed During Request - Mobile** (`ca7cdd02f84f4a13abb5b324f3fb453f`) — V7 reloads current booking status on each request. Stitch mid-request conflict UX (booking changed while editing) is intentionally not built; cancel/reschedule operate on current server state.

## Next

PHASE 17 — final readiness gate.
