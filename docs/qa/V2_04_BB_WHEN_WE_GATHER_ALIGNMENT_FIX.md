# V2.04 BB Desktop When We Gather Alignment

**BUG_ID:** `BB-WHEN-WE-GATHER-ALIGN-01`  
**Date:** 2026-10-02  
**Scope:** BlessBoard public mini-website desktop layout only.

---

## ROOT_CAUSE

Public (non-edit) When We Gather rendered platform `hours` **without** `.bb-tp-service-times__inner`, and CTAs sat as **siblings outside** the band. Full-bleed band was intentional; content lacked the shared `--bb-max` shell used by homepage neighbors (`.bb-tp-container` / A Place to Belong / Grow and Serve Together). Not caused by `100vw` or negative margins.

## FIX

1. Wrap public hours + Plan Your Visit / Get Directions in `.bb-tp-service-times--band` → `.bb-tp-service-times__inner` (same family as edit mode / `--bb-max`).
2. Platform-public inner uses horizontal padding `0` to match home sections’ effective content edge (those sections reset horizontal padding via `padding: 2rem 0`).
3. `@media (max-width: 899px)`: platform-public inner `max-width: none` so tablet/mobile stay flush (pre-fix).

## FILES

- `views/blessboard/v5/public/partials/service-times-block.ejs`
- `public/blessboard/v5/tenant-public.css`
- `tests/v2-04-bb-when-we-gather-alignment.test.js`

## End report

```
ROOT_CAUSE=public hours/CTAs missing shared __inner max-width shell
DESKTOP_ALIGNMENT=PASS
TABLET_REGRESSION=PASS
MOBILE_REGRESSION=PASS
FINAL=V2_04_BB_WHEN_WE_GATHER_ALIGNMENT_FIXED
```
