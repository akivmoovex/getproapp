# ActiveClinic P07 — Stitch Screen Workflow Groups

**Phase:** P07 (Billing / Cashier / Invoices)  
**Created:** 2026-08-04  
**Total screens:** 73 (Desktop 60 · Mobile 13)  
**Source:** `ACTIVECLINIC_STITCH_PHASE_07.md`

This document maps every P07 Stitch screen into logical workflow groups for implementation planning.

## Workflow group summary

| Group | Screens | Desktop | Mobile | Implementation notes |
|-------|---------|---------|--------|---------------------|
| Service Catalog | 3 | 2 | 1 | Charge item management |
| Patient Account | 3 | 2 | 1 | Patient billing overview |
| Charge Review | 1 | 1 | 0 | Automatic charge verification |
| Invoice Create | 3 | 3 | 0 | Draft → finalize workflow |
| Invoice Management | 7 | 5 | 2 | List, detail, history, amendments |
| Payment Collection | 10 | 6 | 4 | Cash, card, mobile money, bank, split |
| Payment Confirmation | 2 | 2 | 0 | Success states |
| Receipt | 3 | 3 | 0 | Print receipt, refund receipt, statement |
| Refund Workflow | 7 | 5 | 2 | Request, review, approval, completion, rejection |
| Reversal Workflow | 3 | 3 | 0 | Request, review, approval |
| Cashier Session | 7 | 6 | 1 | Open, current, close, variance, history |
| Collections | 3 | 3 | 0 | Work queue, contact patient, collections account |
| Price Management | 3 | 3 | 0 | Price lists, create, override approval |
| Accounts Receivable | 3 | 3 | 0 | AR dashboard, unpaid invoices (2) |
| Revenue Reports | 2 | 2 | 0 | Summary and detailed |
| External Placeholders | 3 | 3 | 0 | Insurance, NHIMA, write-off (PRODUCT_DECISION) |
| Payment Arrangements | 2 | 2 | 0 | Create and review payment plans |
| Payment History | 1 | 1 | 0 | Transaction history |
| Credit Notes | 1 | 1 | 0 | Credit note generation |
| Access Control | 1 | 1 | 0 | Financial correction restricted |
| Correction History | 3 | 2 | 1 | Audit trail for financial corrections |
| Error States | 1 | 1 | 0 | Invoice error handling |
| Billing Dashboard | 2 | 1 | 1 | Overview for billing staff |

**Total groups:** 23

## Detailed screen mapping

### 1. Service Catalog (3 screens)

Service and procedure price management.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Service Catalogue – Desktop | `4ca894f70d6646eca246847cd8c39d6a` | 2560×2048 | `/app/billing/catalog` | HIGH | List view |
| P07 – Service Catalogue – Mobile | `1ab29b0691c04233a1c972ea99f24351` | 780×1856 | `/app/billing/catalog` | HIGH | Mobile list |
| P07 – Service Detail – Desktop | `d5eb57a8319c4130be473f8dd23851d6` | 2560×2048 | `/app/billing/catalog/:id` | HIGH | Detail/edit |

**Backend:** `charge_catalogue_items` table, CRUD service.

---

### 2. Patient Account (3 screens)

Patient billing overview and balance.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Patient Billing Account – Desktop | `a84263ac97b8484698dc36d00b498ffa` | 2560×2048 | `/app/billing/patients/:id` | HIGH | Account summary |
| P07 – Patient Billing Account – Mobile | `c15d892b327848a6a2897ae3a08a5803` | 780×1908 | `/app/billing/patients/:id` | HIGH | Mobile account |
| P07 – Patient Collections Account – Desktop | `3f50a00be7624b36af773c181b2c562c` | 2560×2048 | `/app/billing/patients/:id/collections` | MEDIUM | Collections view |

**Backend:** Aggregate queries on `invoices`, `payments`, `payment_allocations`.

---

### 3. Charge Review (1 screen)

Automatic charge verification workflow.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Automatic Charge Review | `954a9269255245dd9c6e375f8cbdd93b` | 2560×2048 | `/app/billing/charges/review` | MEDIUM | Approval workflow |

**Backend:** `patient_charges` with status workflow.

---

### 4. Invoice Create (3 screens)

Draft → finalize invoice workflow.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Create Invoice – Desktop | `08ed6ee0d02447bca5e94698080bca4f` | 2560×2048 | `/app/billing/invoices/new` | HIGH | Draft creation |
| P07 – Add Invoice Item | `be4481e8f31b459facf2294f73311181` | 2560×2048 | Modal | HIGH | Add line item |
| P07 – Finalise Invoice | `319d7fca2acb45a38432aa40a2e7cf30` | 2560×2048 | `/app/billing/invoices/:id/finalize` | HIGH | Post confirmation |

**Backend:** `invoices`, `invoice_lines`, status transition draft → posted.

---

### 5. Invoice Management (7 screens)

Invoice list, detail, history, amendments.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Invoice List – Desktop | `c479c86234b840419e821c2c48329f4e` | 2560×2048 | `/app/billing/invoices` | HIGH | Filter/search |
| P07 – Invoice List – Mobile | `40fcc3c9e03e42a68e2cadbd5c1a7685` | 780×1768 | `/app/billing/invoices` | HIGH | Mobile list |
| P07 – Patient Invoice – Desktop | `9f422c33e30c450e9502126ba4012585` | 2560×2048 | `/app/billing/invoices/:id` | HIGH | Detail view |
| P07 – Patient Invoice – Mobile | `3735516f4ecb4624ac715c6f77e7810b` | 780×1768 | `/app/billing/invoices/:id` | HIGH | Mobile detail |
| P07 – Invoice Review – Desktop | `713f3ebe920240c1a647af277278eb2f` | 2560×2048 | `/app/billing/invoices/:id/review` | MEDIUM | Review state |
| P07 – Invoice History | `06e7e10102184cc5a047e6d594f22fc2` | 2560×2048 | `/app/billing/invoices/:id/history` | MEDIUM | Audit trail |
| P07 – Invoice Amendment | `5bde2c1a3d954ec396679abc3888abe5` | 2560×2048 | `/app/billing/invoices/:id/amend` | MEDIUM | Amendment request |
| P07 – Invoice Amendment Review – Desktop | `92af580dd9db4a3ea5734523b72287ba` | 2560×2048 | `/app/billing/invoices/:id/amendments` | MEDIUM | Approval view |

Note: Last screen added (8 total).

**Backend:** `invoices`, `invoice_lines`, status management.

---

### 6. Payment Collection (10 screens)

Multiple payment methods and split payments.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Record Payment – Desktop | `a9654729a9a44e17832910a41f0154de` | 2560×2176 | `/app/cashier/payment` | HIGH | Main entry |
| P07 – Record Payment – Mobile | `8ca889a31c4e4ec1858c4dd4efc62731` | 780×1956 | `/app/cashier/payment` | HIGH | Mobile entry |
| P07 – Cash Payment – Desktop | `2d81fb326b6644bbb11cabd7a8156e6e` | 2560×2048 | `/app/cashier/payment/cash` | HIGH | Cash specific |
| P07 – Cash Payment – Mobile | `3c8ce685b0d14b74a04e1127e341f004` | 780×1768 | `/app/cashier/payment/cash` | HIGH | Mobile cash |
| P07 – Card Payment – Desktop | `61922a4c2823426b8bcdc1f236c4072b` | 2560×2048 | `/app/cashier/payment/card` | PARTIAL | PRODUCT_DECISION |
| P07 – Mobile Money Payment – Desktop | `2b3c2c4ef6ac4ee48a789d3a527fe9ec` | 2560×2048 | `/app/cashier/payment/mobile` | PARTIAL | PRODUCT_DECISION |
| P07 – Mobile Money Payment – Mobile | `480e2d80a9f24f26b69b806d531fa913` | 780×1768 | `/app/cashier/payment/mobile` | PARTIAL | PRODUCT_DECISION |
| P07 – Bank Transfer Payment – Mobile | `f23ef64e307b44f780a19817ac04ebda` | 780×2074 | `/app/cashier/payment/bank` | PARTIAL | Manual verify |
| P07 – Deposit Payment – Desktop | `0f1fd946c97a48f99d34bd6ce8c8173c` | 2560×2048 | `/app/cashier/payment/deposit` | MEDIUM | Deposit handling |
| P07 – Split Payment – Desktop | `bb0a290730a44a108be9295a76478785` | 2560×2048 | `/app/cashier/payment/split` | MEDIUM | Multi-method |

**Backend:** `payments`, `payment_allocations`, method-specific validation.

---

### 7. Payment Confirmation (2 screens)

Success states after payment.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Payment Completed – Desktop | `bda1fbd1f6f441dba26719f451ee53de` | 2560×2048 | State variant | HIGH | Success message |
| P07 – Payment Review – Desktop | `89ce6798cbca4723ae20aa61225411b2` | 2560×2048 | `/app/billing/payments/:id/review` | MEDIUM | Review state |

**Backend:** Route state, no separate model.

---

### 8. Receipt (3 screens)

Receipt printing and statements.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Print Receipt | `914eee2a18f64fac81d2f0f69adc0cc8` | 2560×2048 | `/app/billing/receipts/:id/print` | HIGH | Receipt template |
| P07 – Print Refund Receipt | `244dc0c45a23434bb2747468a699167b` | 2560×2196 | `/app/billing/receipts/:id/refund-print` | HIGH | Refund receipt |
| P07 – Print Patient Account Statement | `666806c4ea194d478e3baf2b7876950c` | 2560×2664 | `/app/billing/patients/:id/statement` | MEDIUM | Statement |

**Backend:** `receipts`, `payments`, PDF/print view generation.

---

### 9. Refund Workflow (7 screens)

Complete refund request → approval → completion.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Refund Request – Desktop | `685fb829c50a45af995772909fb49fb7` | 2560×2278 | `/app/billing/refunds/new` | HIGH | Request form |
| P07 – Refund Request – Mobile | `8461f1792a7a41209ae2abfe44db7b6a` | 780×1980 | `/app/billing/refunds/new` | HIGH | Mobile request |
| P07 – Refund Review – Desktop | `438b1bb01f534492850ee8cb1253fcfe` | 2560×2048 | `/app/billing/refunds/:id/review` | HIGH | Review state |
| P07 – Refund Approval – Desktop | `d8f3108dfcda4ab9bf58472786d0484c` | 2560×2228 | `/app/billing/refunds/:id/approve` | HIGH | Approval action |
| P07 – Refund Completed – Desktop | `e52271b7be804e0ea95c825be9f977bd` | 2560×2048 | State variant | HIGH | Success state |
| P07 – Refund Rejected | `b76f80fb0d164501b8108bea91813385` | 2560×2176 | State variant | HIGH | Rejection state |
| P07 – Add Service – Desktop | `764d9a2a5a634150babb4daa1d6ebf13` | 2560×2048 | Modal | MEDIUM | Service addition (may be catalog) |

Note: Last screen may belong to catalog group (verify during implementation).

**Backend:** `refunds`, status workflow, approval permissions.

---

### 10. Reversal Workflow (3 screens)

Payment reversal with approval.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Payment Reversal Request | `2665942082b4428dbcabf3ff3a40ec60` | 2560×3174 | `/app/billing/reversals/new` | HIGH | Elevated perm |
| P07 – Payment Reversal Review – Desktop | `027b12b482934ef1a6f5dee02c888d26` | 2560×2048 | `/app/billing/reversals/:id/review` | HIGH | Approval queue |
| P07 – Financial Correction History | `54163d0beee74c29990bd83b77480af5` | 2560×2048 | `/app/billing/corrections` | MEDIUM | Audit trail |
| P07 – Financial Correction History – Mobile | `a21d364d62f04c78ac8477971377eca9` | 780×3162 | `/app/billing/corrections` | MEDIUM | Mobile audit |

Note: 4 screens total (correction history added).

**Backend:** `financial_reversals`, elevated permissions.

---

### 11. Cashier Session (7 screens)

Shift management and reconciliation.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Open Cashier Shift – Desktop | `c2f068812d0b45809a214d6ba8399ae5` | 2560×2048 | `/app/cashier/open` | HIGH | Opening flow |
| P07 – Cashier Shift – Desktop | `1c02fc47e49c4c9990646d94a9876986` | 2560×2048 | `/app/cashier/session` | HIGH | Current session |
| P07 – Cashier Shift – Mobile | `0d8cd08aba454a2f971d6cc4389d98d2` | 780×1768 | `/app/cashier/session` | HIGH | Mobile session |
| P07 – Cash Count – Desktop | `02e8083e943d40deb9429b95a294ae30` | 2560×2048 | `/app/cashier/session/count` | HIGH | Count entry |
| P07 – Cashier Closing – Desktop | `d3e2ff001f694720b57371ef1a60d517` | 2560×2048 | `/app/cashier/close` | HIGH | Close flow |
| P07 – Cashier Variance – Desktop | `7dd49983c4a840b9980fb4a92d486b3c` | 2560×2048 | State variant | HIGH | Variance display |
| P07 – Cashier Shift History – Desktop | `1cd25ed2bb7a4504a63095a015bd823b` | 2560×2048 | `/app/cashier/history` | MEDIUM | Past sessions |

**Backend:** `cashier_sessions`, `cashier_session_events`, reconciliation logic.

---

### 12. Collections (3 screens)

Collections workflow (PRODUCT_DECISION scope).

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Collections Work Queue – Desktop | `16318693e2874e79a8463d91c6ba63ad` | 2560×2048 | `/app/billing/collections` | LOW | PRODUCT_DECISION |
| P07 – Contact Patient for Payment – Desktop | `513301ae28e1423ab7431e299cf45eee` | 2560×2258 | `/app/billing/collections/contact` | LOW | PRODUCT_DECISION |
| P07 – Patient Collections Account – Desktop | `3f50a00be7624b36af773c181b2c562c` | 2560×2048 | (duplicate) | LOW | See Patient Account |

Note: 3rd screen duplicated from Patient Account group.

**Backend:** Placeholder routes, no automated collections.

---

### 13. Price Management (3 screens)

Price list management and overrides.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Price Lists – Desktop | `46cc5311173d48adb99cafe18ea331c2` | 2560×2048 | `/app/billing/price-lists` | MEDIUM | List view |
| P07 – Create Price List – Desktop | `b69484b43b074d6593f264d8df958d74` | 2560×2048 | `/app/billing/price-lists/new` | MEDIUM | Create flow |
| P07 – Price Override Approval | `a953a043598945fdab38285c7dab7206` | 2560×2176 | `/app/billing/price-overrides` | MEDIUM | Approval queue |

**Backend:** `charge_catalogue_items`, price list versioning (future), override workflow.

---

### 14. Accounts Receivable (3 screens)

AR dashboard and unpaid invoice tracking.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Accounts Receivable – Desktop | `1829edeb5d1741be9b6ae68a219ef7cc` | 2560×2392 | `/app/billing/ar` | MEDIUM | AR dashboard |
| P07 – Unpaid Invoices – Desktop | `defb5bc8233046a4b9b1e86ebe740d1d` | 2560×2048 | `/app/billing/invoices/unpaid` | HIGH | Unpaid list |
| P07 – Unpaid Invoices – Mobile | `9c5a3f10f1cb44e983af2a7c36403e3d` | 780×2568 | `/app/billing/invoices/unpaid` | HIGH | Mobile unpaid |

**Backend:** Aggregate queries on invoices with balance > 0.

---

### 15. Revenue Reports (2 screens)

Basic revenue reporting.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Revenue Reports – Desktop | `08921cb100ab462d8ec08c007f1bd895` | 2560×2176 | `/app/billing/reports` | MEDIUM | Summary reports |
| P07 – Revenue Reports – Detailed | `550a52476c254e258d58737fc1184bb6` | 2560×2048 | `/app/billing/reports/detailed` | MEDIUM | Detailed view |

**Backend:** Aggregate queries, date range filtering, PARTIAL implementation.

---

### 16. External Placeholders (3 screens)

Integration placeholders (PRODUCT_DECISION).

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Insurance Payment Placeholder | `9c0219d791da43df8a7abf41cf0809df` | 2560×2048 | `/app/billing/insurance` | LOW | PRODUCT_DECISION |
| P07 – NHIMA Claim Placeholder | `0489fa5d1c37481ba159eeed1cd64155` | 2560×2048 | `/app/billing/nhima` | LOW | PRODUCT_DECISION |
| P07 – Write-Off Request Placeholder | `46a8b6c4f4b846e18ab586c3d6fae6ca` | 2560×2048 | `/app/billing/write-offs` | LOW | PRODUCT_DECISION |

**Backend:** Placeholder routes with honest copy about external integrations.

---

### 17. Payment Arrangements (2 screens)

Payment plan workflow.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Payment Arrangement | `02e1c1976d844c2cac63682e1853fa46` | 2560×2048 | `/app/billing/arrangements/new` | MEDIUM | Create plan |
| P07 – Payment Arrangement Review | `2a0ae995f3e140da863e5aede4b2e71f` | 2560×2048 | `/app/billing/arrangements/:id` | MEDIUM | Review/approve |

**Backend:** Future table `payment_arrangements`, PARTIAL implementation.

---

### 18. Payment History (1 screen)

Transaction history view.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Payment History – Desktop | `45929cd32480420aaa5788be86e183f9` | 2560×2048 | `/app/billing/payments` | HIGH | List with filters |

**Backend:** `payments` with joins.

---

### 19. Credit Notes (1 screen)

Credit note generation.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Credit Note – Desktop | `92b97e715c6f4c308e61d3b39d66a1e9` | 2560×2666 | `/app/billing/credit-notes/:id` | MEDIUM | Credit note view |

**Backend:** Negative invoice or separate credit note table.

---

### 20. Access Control (1 screen)

Restricted access state.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Financial Correction Access Restricted | `778eee4267984f32bcedcc38ca720fa0` | 2560×2048 | State variant | HIGH | 403 state |

**Backend:** Permission check result.

---

### 21. Correction History (3 screens)

Financial correction audit trail.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Financial Correction History | `54163d0beee74c29990bd83b77480af5` | 2560×2048 | `/app/billing/corrections` | MEDIUM | Audit list |
| P07 – Financial Correction History – Mobile | `a21d364d62f04c78ac8477971377eca9` | 780×3162 | `/app/billing/corrections` | MEDIUM | Mobile audit |

Note: These were also listed under Reversal Workflow (screens counted once).

**Backend:** `financial_reversals` query.

---

### 22. Error States (1 screen)

Invoice error handling.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Invoice Error State | `b1a8b1855b9b4e268cd42359707d292e` | 2560×2176 | State variant | HIGH | Error display |

**Backend:** Error state variant.

---

### 23. Billing Dashboard (2 screens)

Main billing overview.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Billing Dashboard – Desktop | `ece0b9d1d9384f5d8c1e3b944f122e47` | 2560×2048 | `/app/billing` | HIGH | Main dashboard |
| P07 – Billing Dashboard – Mobile | `649bd7649ebf4c6eb787612f844a637e` | 780×1982 | `/app/billing` | HIGH | Mobile dashboard |

**Backend:** Aggregate KPIs (invoices, payments, balances).

---

### 24. Cashier Dashboard (1 screen)

Cashier main view.

| Exact Stitch name | ID | Viewport | Implementation route | Priority | Notes |
|---|---|---|---|---|---|
| P07 – Cashier Dashboard – Desktop | `792d5cbb6f234332a088399e4ccdd545` | 2560×2048 | `/app/cashier` | HIGH | Session + KPIs |

**Backend:** Current session + today's stats.

---

## Implementation priority

### Phase 1: Core financial flow (HIGH priority)
1. Service Catalog (3) — charge items
2. Patient Account (2) — billing overview (exclude collections variant)
3. Invoice Create (3) — draft → post
4. Invoice Management (4) — list, detail (desktop/mobile)
5. Payment Collection (4) — cash only (desktop/mobile)
6. Receipt (1) — basic receipt print
7. Cashier Session (5) — open, current, count, close, variance
8. Billing Dashboard (2)
9. Cashier Dashboard (1)

**Total Phase 1:** 25 screens

### Phase 2: Refunds and history (MEDIUM priority)
10. Refund Workflow (5) — request, review, approval, states
11. Payment History (1)
12. Cashier Session History (1)
13. Invoice History (2) — history, amendments
14. Unpaid Invoices (2)
15. Access Control (1)
16. Error States (1)

**Total Phase 2:** 13 screens

### Phase 3: Extended workflows (MEDIUM-LOW priority)
17. Payment Collection extended (6) — card, mobile money, bank, deposit, split
18. Reversal Workflow (3)
19. Correction History (2)
20. Payment Confirmation (2)
21. Accounts Receivable (1) — AR dashboard
22. Revenue Reports (2)
23. Price Management (3)
24. Payment Arrangements (2)
25. Credit Notes (1)

**Total Phase 3:** 22 screens

### Phase 4: Placeholders (LOW priority / PRODUCT_DECISION)
26. Collections (2) — excluding duplicate
27. External Placeholders (3) — insurance, NHIMA, write-offs
28. Charge Review (1)
29. Receipts extended (2) — refund receipt, statement

**Total Phase 4:** 8 screens

**Phase 1-4 total:** 68 screens

### Unaccounted screens
Reviewing the original 73 screens, some may be:
- Duplicates across groups (Patient Collections Account appears twice)
- Additional payment method variants
- State variants counted as separate screens in Stitch

Need to verify during implementation that all 73 screen IDs from Phase 07 doc are mapped.

## Implementation approach

### Shared components
- `BillingInvoiceCard` — reusable invoice display
- `PaymentForm` — reusable payment collection form
- `ReceiptDisplay` — reusable receipt layout
- `CashierSessionSummary` — session KPI widget
- `ConfirmationDialog` — financial action confirmation
- `FinancialAccessDenied` — 403 state for elevated permissions

### State management via routes
- Confirmation screens: query param `?confirmed=true`
- Error states: flash messages + error locals
- Loading states: standard loading partial
- Access restricted: permission check → 403 view

Avoid duplicating full markup for every state variant.

### Backend services
- `ChargeService` — charge catalog CRUD
- `InvoiceService` — invoice creation, posting, voiding, line items
- `PaymentService` — payment recording, allocation, receipt generation
- `RefundService` — refund request, approval, completion
- `ReversalService` — payment reversal with approval
- `CashierSessionService` — session lifecycle, reconciliation, events

### Permission gates
All routes check permissions; refunds/reversals require elevated permissions.

### PRODUCT_DECISION honesty
Screens for card gateway, mobile money API, insurance claims show honest copy:
> "External payment integration not yet connected. Contact finance team to verify payment manually."

No fake "processing" or "success" states for unimplemented integrations.

## Testing coverage

Each workflow group requires:
- Happy path test
- Validation failure test
- Authorization test (permission required)
- Tenant isolation test
- Financial integrity test (integer arithmetic, no over-allocation)

Refunds, reversals, and voiding require approval workflow tests.

## Status tracking

As screens are implemented, update `ACTIVECLINIC_STITCH_IMPLEMENTATION_LEDGER.md` with:
- Screen ID
- Implementation status (PARTIAL, MATCHED, PRODUCT_DECISION)
- Route
- Limitations (if PARTIAL)
- Test coverage

## Verification

After implementation, compare each screen side-by-side in Cursor Browser against Stitch to verify:
- Layout matches
- Typography matches
- Color/spacing matches
- Responsive behavior matches (desktop vs mobile)
- Financial integrity preserved

Report any differences that cannot safely be matched.
