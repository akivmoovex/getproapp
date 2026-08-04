# ActiveClinic Stitch — P21–P27 Visual Parity Report

**Audited:** 2026-08-04  
**Branch:** `V6`  
**Stitch project:** `projects/17813606734422395399`  
**Production touched:** no  

## Method

- Live Stitch inventory via MCP `list_screens` (189 screens; 184 in P21–P27).
- Sample HTML extracted for Home Desktop, Onboarding Review, Directory Empty (`tmp/stitch-p21-p27/`).
- Implementation compared structurally (sections, nav, states, honesty copy) against Stitch names/IDs.
- Automated HTTP rendering via node:test suites (not browser pixel diff).
- Viewports requested by mission (1440×900 … 360×800): CSS is responsive (`ac-public.css` / `ac-patient.css`) with mobile drawers; **full multi-viewport screenshot MATCHED review was not completed in this run**.

## Verdict

**Do not claim MATCHED.** Aggregate visual status: **FUNCTIONAL_ONLY**, with several surfaces **CLOSE** to Stitch information architecture.

## Per-phase visual status

| Phase | Canonical families | Visual status | Notes |
|------:|--------------------|---------------|-------|
| P21 | Home, About, Solutions, Directory±states, Onboarding±states | FUNCTIONAL_ONLY / CLOSE | Substantial sections; not pixel-matched |
| P22 | Juflona tenant + closed/not-found/pricing/location | FUNCTIONAL_ONLY | Demo Clinic uses same templates |
| P23 | Services/doctors/detail/price patterns | FUNCTIONAL_ONLY | Price = honest no-price |
| P24 | Wizard steps + progress | FUNCTIONAL_ONLY | Slot step = preferred time honesty |
| P25 | Procedure multi-section | FUNCTIONAL_ONLY | Upload states → follow-up honesty |
| P26 | Lookup / detail / cancel / reschedule | FUNCTIONAL_ONLY | Status variants via one detail template |
| P27 | Portal EJS shell | FUNCTIONAL_ONLY | Honesty verify/offline |

## Duplicate / superseded Stitch screens

| Screen | Treatment |
|--------|-----------|
| Older P21 Home Desktop `22391e15…` | SUPERSEDED by `f96b4855…` |
| Older P21 Home Mobile `6dadae69…` | SUPERSEDED by `2ccf3272…` |
| Older Directory Desktop `2c612094…` | SUPERSEDED by `dac958cf…` |

## Pattern screens (not separate routes)

Progress patterns, SMS states, mobile summary patterns, portal component patterns, patient data boundaries: implemented as **shared partials / honesty notes / documented PRODUCT_DECISION**, not one-route-per-Stitch-artboard.

## Assets

No Stitch binary assets downloaded into `public/` this run (MCP screenshots referenced for structure only). **ASSET_BLOCKED** not used as a blocker for functional delivery.

## Next visual step

Browser comparison in Cursor against Stitch screenshots at 1440 and 390 widths for Home, Directory Empty, Onboarding Review, Booking Review, Patient Dashboard — then promote CLOSE→MATCHED only with evidence.
