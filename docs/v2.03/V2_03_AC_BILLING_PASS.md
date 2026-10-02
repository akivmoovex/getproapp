# V2.03 AC Billing Pass — ACN21–ACN23

**Verdict:** `V2_03_AC_BILLING_PASS`

**Stitch project:** `projects/12272131183982732110` (ActiveClinic internal / authenticated operations)  
**Branch:** V10  
**Scope:** Invoices list, create/edit invoice, payment recording & receipt

| Screen | Stitch IDs | Route |
|--------|------------|-------|
| ACN21 Invoices | `c479c86234b840419e821c2c48329f4e` / `40fcc3c9e03e42a68e2cadbd5c1a7685` | `GET /app/billing/invoices` |
| ACN22 Create Invoice | `08ed6ee0d02447bca5e94698080bca4f` | `GET/POST /app/billing/invoices/new`, `POST /app/billing/invoices` |
| ACN22 Patient Invoice | `9f422c33e30c450e9502126ba4012585` / `3735516f4ecb4624ac715c6f77e7810b` | `GET /app/billing/invoices/:id` (+ add item / post) |
| ACN23 Record Payment | `a9654729a9a44e17832910a41f0154de` / `8ca889a31c4e4ec1858c4dd4efc62731` | `GET/POST /app/cashier/payment` |
| ACN23 Receipt | `914eee2a18f64fac81d2f0f69adc0cc8` | `GET /app/cashier/receipt/:receiptNumber` |

## Delivered

- **ACN21** — invoice list with total / paid / balance (computed from allocations + posted credit notes); desktop table + mobile cards.
- **ACN22** — create from pending charges; draft adjustment; catalog **or custom** line items (qty × unit price → line total); detail shows adjustment, paid, balance.
- **ACN23** — record **Cash** (open session required), **Bank**, and **Mobile Money** as externally completed payments (reference + date + amount + recording user). **No payment gateway.**
- **Receipt** — unique receipt number, patient, invoice allocation(s), date, amount, method/reference, clinic details, recorded-by, print via existing `window.print` chrome. Named **Receipt** (not “Statutory Receipt”).
- Overpayment rule: allocation cannot exceed remaining balance (`insufficient_balance`); payment amount above remaining may be recorded with unapplied remainder when allocation is clamped.
- Partial payments update paid/balance correctly.
- Facility-scoped invoice/receipt reads; finance HTML does not join clinical narratives.
- Platform reuse: finance RBAC, audit on payment/invoice mutations, money formatting/validation, responsive shell components.

## Tests

- `tests/activeclinic-batch1a-billing.test.js` — Stitch markers, calc/adjustment, partial + overpay, external methods, isolation + clinical non-leak

## Gaps (non-blocking)

1. Card remains allowed in the ledger service for legacy external recording; product UI exposes Cash / Bank / Mobile Money only.
2. Download uses browser print/PDF; no separate PDF binary export endpoint beyond existing print primitives.
