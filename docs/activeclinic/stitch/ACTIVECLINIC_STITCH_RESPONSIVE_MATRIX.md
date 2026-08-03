# ActiveClinic Stitch — Responsive Matrix (Phases 1–7)

**Audited:** 2026-08-04

## Required viewports

1440 · 1280 · 1024 · 768 · 430 · 390 · 360

## Pairing rules

| Desktop Stitch | Mobile Stitch | Implementation |
|----------------|---------------|----------------|
| Dedicated `– Desktop` screen | Dedicated `– Mobile` when present | One responsive route matching mobile layout below ~768px; do not merely shrink desktop |
| Desktop only | — | Responsive collapse using shell patterns; record intentional gap if mobile-specific chrome missing |

## Phase notes

| Phase | Desktop screens | Mobile screens | Parity approach |
|------:|----------------:|---------------:|-----------------|
| 1 | 4 | 3 | Shared responsive auth + app shell |
| 2 | 11 | 7 | List cards / stacked forms on mobile |
| 3 | 17 | 3 | Blocked — no UI until schema |
| 4 | 10 | 2 | Blocked |
| 5 | 23 | 6 | Blocked |
| 6 | 12 | 2 | Blocked |
| 7 | 60 | 13 | Blocked |
