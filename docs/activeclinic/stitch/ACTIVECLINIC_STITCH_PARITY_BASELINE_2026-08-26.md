# ActiveClinic Stitch Parity — Frozen Baseline (2026-08-26)

**Status:** IMMUTABLE COMPARISON POINT  
**Branch:** V7 @ `fc99fa5a35166d5971fcbbb085333bf4efe1291c`  
**Source audit:** [`ACTIVECLINIC_FINAL_STITCH_PARITY_MATRIX.json`](./ACTIVECLINIC_FINAL_STITCH_PARITY_MATRIX.json)  
**Do not overwrite** the final parity matrix files. All remediation work measures against this baseline.

---

## Safety (frozen)

| Check | Value |
|-------|-------|
| Branch | V7 |
| Environment | testing |
| Database | moovex-platform-v7 |
| Production touched | NO |

---

## Baseline counts

| Metric | Value |
|--------|------:|
| CURRENT_STITCH_TOTAL | 496 |
| ACCOUNTED_FOR | 496 |
| MISSING | 0 |
| IMPLEMENTED | 376 |
| PARTIAL | 86 |
| PRODUCT_DIFFERENCES | 13 |
| N/A | 21 |
| DESIGN_AVERAGE | 89.0 |
| TEXT_AVERAGE | 91.4 |
| ASSET_AVERAGE | 85.3 |
| RESPONSIVE_AVERAGE | 89.0 |
| OVERALL_AVERAGE | 89.0 |
| SCREENS_95_PLUS | 0 |

## Verdict at baseline

`ACTIVECLINIC_ALL_STITCH_SCREENS_IMPLEMENTED_VISUAL_GAPS_REMAIN`

---

## Stitch projects (frozen)

| Project ID | Name | Screens |
|------------|------|--------:|
| `17813606734422395399` | ActiveClinic Public Ecosystem & Booking Flow | 189 |
| `12272131183982732110` | ActiveClinic – Juflona Pilot | 199 |
| `10611909237747031838` | ActiveClinic Universal Authentication Interface | 108 |

---

## Classification distribution (all 496 rows)

| Classification | Count |
|----------------|------:|
| MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION | 244 |
| EXACT_IMPLEMENTATION_MATCH | 169 |
| DUPLICATE_STITCH_VARIANT | 30 |
| PARTIAL_IMPLEMENTATION | 8 |
| PRODUCT_DECISION_DIFFERENCE | 14 |
| NO_IMPLEMENTATION_REQUIRED | 21 |

---

## Intentional product differences (frozen — do not remediate)

| Area | Screens | Decision |
|------|--------:|----------|
| MF11 patient EHR / lab results | 4 | Conflicts P27 data boundaries |
| OTP verification (MF04, MF08) | 4 | Token-link recovery only |
| Google SSO (legacy auth) | 2 | Not in auth architecture |
| MW07-03 publish-note modal | 1 | Native confirm kept |
| Stitch reference patterns (P25/P26/P27) | 21 | N/A — merged into parent flows |
| Duplicate Stitch iterations (unprefixed P01) | 30 | Superseded by P01 canonical screens |

Full per-screen scores preserved in JSON (`rows[]` array, 496 entries).

---

## Score preservation note

Each JSON row retains: `designPct`, `textPct`, `photosAssetsPct`, `responsivePct`, `overallPct`, `implemented`, `classification`, `requiredAction`, `productDifference`.

Remediation phases MUST re-score against this baseline and report deltas.
