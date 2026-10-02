# ActiveClinic — Stitch Product Decisions (AC-V6-11)

Only decisions that **block** an implementation wave. Minor visual choices are omitted.

---

## PD-AC-01 — Canonical P01 vs unprefixed foundation screens

- **Affected:** Login, Dashboard, Shell, Navigation Drawer (unprefixed + `P01 – …`)
- **Issue:** Duplicate Stitch designs with overlapping intent.
- **Options:** (1) Canonical = P01 series; (2) Canonical = unprefixed; (3) Merge visually later in Stitch.
- **Recommended:** (1) **P01** titles are canonical; unprefixed = `DUPLICATE` reference only.
- **Security / data / routes:** none
- **Proceed around?** Yes — Wave 1 uses P01 names.

## PD-AC-02 — Admin surfaces without Stitch (Facilities / Staff / Access / Settings / lifecycle visuals)

- **Affected:** facilities CRUD UI, staff detail/invite forms, access editor, org settings, activate/forgot/reset visual parity
- **Issue:** Backend routes/services exist (or are proposed) but **no** Stitch screens.
- **Options:** (1) Implement utilitarian UI in shell without Stitch; (2) Design Stitch screens first; (3) Defer admin UI until designed.
- **Recommended:** (1) for read lists already shipped; (2) before large create/edit visual claims; allow functional forms without claiming Stitch MATCHED.
- **Proceed around?** Yes for AC-V6-S01 auth parity and shell; **partial** for admin write UIs.

## PD-AC-03 — Facility admin invite scope

- **Affected:** invite staff actions
- **Issue:** Facility admins have `staff.invite` in catalogue; limits vs network admin unclear for multi-facility orgs.
- **Options:** facility-scoped invite only · network-wide · invitation requires network admin
- **Recommended:** Keep facility-scoped create/invite as today; document explicitly in staff UI copy.
- **Proceed around?** Yes for Wave 1 read UIs; resolve before expanding invite UX.

## PD-AC-04 — Clinical roles beyond foundation

- **Affected:** P02–P07
- **Issue:** Only network admin / facility admin / staff foundation roles exist.
- **Recommended:** Define clinical roles with permissions **after** schemas; do not fake clinical nav.
- **Proceed around?** Yes — clinical waves blocked on schemas anyway.

## PD-AC-05 — Patient identifier format

- **Affected:** P02 registration / print card
- **Blocked wave:** Wave 2
- **Recommended:** Decide before patient schema migration.

## PD-AC-06 — Clinical confidentiality levels

- **Affected:** P04 notes, diagnoses, results alerts
- **Blocked wave:** Wave 4+
- **Recommended:** Security review before any clinical note UI.

## PD-AC-07 — Offline expectations

- **Affected:** Shared Offline State
- **Options:** presentational only · queued writes · full offline clinical
- **Recommended:** Presentational / “retry” only until product invests in sync.
- **Proceed around?** Yes — treat as chrome state.

## PD-AC-08 — Billing currency and payment methods

- **Affected:** P07
- **Blocked wave:** Wave 7

## PD-AC-09 — External messaging delivery

- **Affected:** invitations, password reset
- **Issue:** Links generated; email/SMS not configured.
- **Recommended:** Continue copyable + WhatsApp/mailto share until providers chosen.
- **Proceed around?** Yes.

## PD-AC-10 — Subscription / feature-lock behavior

- **Affected:** none dedicated in inventory; org product status exists on platform
- **Recommended:** Defer feature-lock screens until commercial packaging defined.
- **Proceed around?** Yes.

---

## Non-decisions (do not block)

- Exact violet vs teal token values within ActiveClinic system  
- Card radius ±2px  
- Whether dashboard shows static welcome vs KPI widgets before clinical data exists
