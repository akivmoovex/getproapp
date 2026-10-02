# ActiveClinic Stitch — Product Gaps (Phases 1–7)

**Audited:** 2026-08-04

| ID | Phase | Gap | Severity | Notes |
|----|------:|-----|----------|-------|
| GAP-P01-KPI | 1 | Dashboard clinical KPIs in Stitch | Medium | Show only real infra metrics / empty |
| GAP-P01-OFFLINE | 1 | Shared Offline State | Low | No browser offline handler |
| GAP-P02-WIZARD | 2 | Multi-step register screens vs single form | Medium | Stitch shows Identity/Contact/Emergency/Review steps; app may consolidate with honest sections |
| GAP-P02-PRINT | 2 | Print Patient Card Preview | Medium | PRODUCT_DECISION — card format, ID barcode, print pipeline |
| GAP-P02-MEDHIST | 2 | Medical fields on registration | High | Do not store unsupported clinical history |
| GAP-P03-SCHEMA | 3 | Appointments booking schema | Resolved (partial) | Booking UI shipped; queue/walk-in still blocked |
| GAP-P03-QUEUE | 3 | Reception queue / call board / walk-in encounter | Blocker | No complete queue product surface committed |
| GAP-P04-SCHEMA | 4 | Clinical notes/orders schema | Blocker | Entire phase |

| GAP-P04-SCHEMA | 4 | Clinical notes/orders schema | Blocker | Entire phase |
| GAP-P05-SCHEMA | 5 | Pharmacy/stock schema | Blocker | Entire phase |
| GAP-P06-SCHEMA | 6 | Lab/imaging schema | Blocker | Entire phase |
| GAP-P07-SCHEMA | 7 | Billing/cashier schema | Blocker | Entire phase |
| GAP-NAV-CLINICAL | 1–7 | Stitch nav shows clinical modules | Medium | Hide or mark unavailable — no dead links |
| GAP-P13 | — | Staff/roles live in P13 not P01–P07 | Info | Functional admin UI exists without those Stitch screens |

## Decisions required before unblocking 3–7

1. Approve domain schemas and clinical safety rules per module.
2. Define RBAC permission keys.
3. Define facility scoping for queues and clinical worklists.
4. Define audit requirements for financial corrections (P07).
