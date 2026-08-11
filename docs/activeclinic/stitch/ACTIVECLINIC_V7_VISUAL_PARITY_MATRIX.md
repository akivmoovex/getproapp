# ActiveClinic V7 Visual Parity Matrix

**Generated:** 2026-08-11  
**Branch:** V7  
**SHA:** 529020f0  
**Machine-readable:** [`ACTIVECLINIC_V7_VISUAL_PARITY_MATRIX.json`](./ACTIVECLINIC_V7_VISUAL_PARITY_MATRIX.json)

## Authoritative Stitch sources (both required)

ActiveClinic has **two** approved Stitch projects. Neither is optional. BlessBoard/church Stitch must never be used for ActiveClinic.

| # | Surface | Project | ID | URL | Live screens |
|---|---------|---------|----|-----|-------------:|
| 1 | Public platform, tenant sites, booking, My Booking, patient portal | ActiveClinic Public Ecosystem & Booking | `17813606734422395399` | https://stitch.withgoogle.com/projects/17813606734422395399 | 189 |
| 2 | Authenticated clinic operations (shell, patients, clinical, pharmacy, diagnostics, billing) | ActiveClinic – Juflona Pilot | `12272131183982732110` | https://stitch.withgoogle.com/projects/12272131183982732110 | 199 |
| | **Total mapped** | | | | **388** |

### Selection rules

1. For every V7 route, choose the project whose screen clearly belongs to that product surface.
2. Prefer the more recent/current approved design when repository evidence establishes recency.
3. Preserve newer V7 functional requirements over decorative Stitch controls that conflict.
4. Record genuine conflicts as `PRODUCT_DECISION_DIFFERENCE` — do not invent an unevidence hybrid.
5. Do **not** claim a screen has no Stitch reference until **both** ActiveClinic projects have been checked.

### Documented product decision differences

| Topic | Public project use | Internal project use |
|-------|--------------------|----------------------|
| Patient registration | P27 portal self-register | P02 staff Register Patient* |
| Patient profile | P27 patient self-service profile | P02 Patient Profile Overview (clinical) |
| Patient details | P24/P25 booking patient details | P02 Edit Patient Details |
| Dashboard | P27 patient portal dashboard | P01 staff dashboard |

## Matrix schema (every row)

| Column | JSON field |
|--------|------------|
| Phase | `phase` |
| Surface | `surface` |
| Stitch Project ID | `stitchProjectId` (alias: `projectId`) |
| Stitch Screen ID | `stitchScreenId` (alias: `stitchId`) |
| Desktop/Mobile | `device` |
| State | `state` |
| V7 Route | `route` |
| V7 View | `view` |
| Parity Score | `score` |
| Status | `status` |
| Remaining Gap | `remainingGap` |

Additional provenance: `bothProjectsChecked`, `authoritativeProject`, `screen`, `priority`.

## Dual-source audit (2026-08-11)

Reconciled against live MCP `list_screens` for **both** ActiveClinic projects:

- Public live screens in matrix: **189 / 189**
- Internal live screens in matrix: **199 / 199**
- Rows missing `stitchProjectId`: **0**
- Authority mismatches (surface vs project): **0**
- P27 route/view corrections applied (portal vs staff `/app` mis-maps): **12**

## Status summary (after Pass 2 + dual-source schema)

| Status | Count |
|--------|------:|
| MATCHED | 0 |
| MINOR_VARIANCE | 71 |
| NEEDS_WORK | 82 |
| MAJOR_VARIANCE | 134 |
| MISSING_IMPLEMENTATION | 96 |
| NO_IMPLEMENTATION_REQUIRED | 5 |

Do **not** claim MATCHED without browser side-by-side evidence.

## Surface rollup

| Surface | Stitch project | Screens |
|---------|----------------|--------:|
| `public_platform` | `17813606734422395399` | 28 |
| `tenant_website` | `17813606734422395399` | 48 |
| `consultation_booking` | `17813606734422395399` | 19 |
| `procedure_booking` | `17813606734422395399` | 24 |
| `my_booking` | `17813606734422395399` | 35 |
| `patient_portal` | `17813606734422395399` | 30 |
| `internal_operations` | `12272131183982732110` | 189 |
| `shared_or_patterns` | by row `stitchProjectId` | 15 |

## Pass history

Pass 2 implemented public/booking/portal visual improvements and rescored those rows. Internal P01–P07 geometry remains Pass 3. Schema update on this revision adds dual-source authority fields without rebuilding the inventory from scratch.


## Pass 3 update (2026-08-11T21:34:20.555114+00:00)

Authenticated shell + internal P01–P07 shared visual system (Stitch project `12272131183982732110`).

| Status | Before Pass 3 | After Pass 3 |
| --- | ---: | ---: |
| MATCHED | 0 | 0 |
| MINOR_VARIANCE | 71 | 78 |
| NEEDS_WORK | 82 | 148 |
| MAJOR_VARIANCE | 134 | 72 |
| MISSING_IMPLEMENTATION | 96 | 86 |

Screens rescored this pass: 73

No MATCHED claims without browser side-by-side.

## Pass 4 update (2026-08-11) — browser side-by-side

Method: Playwright Chromium captures of V7 (`activeclinic.org` → local `:3456`) vs Stitch screenshot PNGs from both projects (`17813606734422395399`, `12272131183982732110`). Viewports include 1440 / 390 (plus 1024 / 768 / 430 / 375 sampled).

| Status | Before Pass 4 | After Pass 4 |
| --- | ---: | ---: |
| MATCHED | 0 | 0 |
| MINOR_VARIANCE | 78 | 79 |
| NEEDS_WORK | 148 | 147 |
| MAJOR_VARIANCE | 72 | 72 |
| MISSING_IMPLEMENTATION | 90 | 90 |

### P0 score bands (scored rows)

| Band | Count |
| --- | ---: |
| ≥95 MATCHED | 0 |
| 90–94 | 38 |
| 80–89 | 54 |
| <80 | 0 |

### Largest shared fixes

1. Booking mobile horizontal overflow — removed overflowing sticky CTA; compact “Step N of M” + progress bar on ≤767px
2. Directory clinic cards — image media strip + body stack (shared default hero asset)
3. Doctors cards — portrait media area + dual CTAs (Book / View profile)
4. Patient login — centered auth card, mark, forgot-password row, guest lookup secondary

### Explicit asset gaps

- Exact Juflona/doctor photography unavailable → initials / shared `clinic-hero-default.jpg` (`ASSET_PARITY_GAP`)
- Directory cards reuse one default photo for all clinics (`WRONG_ASSET` / not per-clinic)

MATCHED still not claimed.

## Pass 5 update — close MISSING_IMPLEMENTATION

Focus: screens marked `MISSING_IMPLEMENTATION` only (map existing routes/states; implement shared loading/empty/error/success/offline; wire clinical GET forms; label honest backend gaps).

| Metric | Before | After |
| --- | ---: | ---: |
| MISSING_IMPLEMENTATION | 86 | **0** |
| IMPLEMENTED (this pass disposition) | — | 55 |
| FUNCTIONAL_BACKEND_GAP | — | 22 |
| DUPLICATE_STITCH_VARIANT | — | 7 |
| NO_IMPLEMENTATION_REQUIRED (new) | — | 2 |
| STILL_MISSING | — | **0** |

Shared additions: `ac-loading-state`, `ac-success-state`, `acp-shared-state`, `/app/offline`, clinical diagnosis/nursing GET, patient `data-boundaries`, dispense patient-instructions panel.

No MATCHED claims. Backend gaps are listed under `pass5.functionalBackendGaps` in the JSON matrix.

## Pass 6 (assets)

See `ACTIVECLINIC_PASS6_ASSET_REPORT.md`. Priority heroes/doctor photos wired from Stitch CDN (`=s2048`). Remaining: retina `LOW_RESOLUTION`, nurse photo `ASSET_PARITY_GAP`, Material Symbols vs SVG icons.

## Pass 7 (mobile)

Mobile-only sweep: bottom nav, booking fixed CTA, filter bottom-sheet, phone picker, app drawer polish. Priority overflow 375/390/430 = 0. See pass7 block in JSON matrix.
