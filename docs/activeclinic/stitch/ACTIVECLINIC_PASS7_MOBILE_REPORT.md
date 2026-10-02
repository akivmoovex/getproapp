# ActiveClinic V7 — Pass 7 mobile report

## PASS7_MOBILE_QUEUE (executed)

Public platform · Juflona · P24/P25 booking · P26 My Booking · P27 portal · authenticated app shell.

Highest-impact implementations:

1. Shared mobile tokens (`--acp-gutter`, `--acp-bottom-nav-h`, heading/body scale)
2. Stitch-style mobile bottom nav (tenant + platform browsing; hidden on booking/auth)
3. Booking fixed bottom CTA + `padding-bottom` content reservation
4. Directory filter bottom-sheet
5. Phone country picker fixed sheet ≤430px
6. Authenticated drawer polish (w-80, rounded items, mobile gutters)
7. Overflow fixes (platform hero margins, patient auth card width)

## Overflow

Priority routes at 375 / 390 / 430: **0** horizontal overflow after fixes.

## Remaining P0 mobile blockers (examples)

| Screen | Score | Blockers |
|--------|-------|----------|
| Portal Offline | 82 | Offline illustration/state vs Stitch |
| Recovery verification | 84 | Honesty shell vs full Stitch recovery chrome |
| Availability / procedure unavailable | 85 | Live slot grids FUNCTIONAL_BACKEND_GAP |
| Procedure booking variants | ~87 | Single-page flow vs multi-step Stitch chrome |
| Closed / Not found | 86 | State card copy/layout detail |
| Exact MATCHED ≥95 | — | Requires per-screen Stitch side-by-side evidence |

## Isolation

All selectors scoped under ActiveClinic public/patient/app CSS namespaces.
