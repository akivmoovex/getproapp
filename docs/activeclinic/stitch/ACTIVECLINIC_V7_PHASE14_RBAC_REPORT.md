# ActiveClinic V7 — Phase 14 authorization hardening

RBAC, facility, and department revalidation of Phase 4+ screens. **Appearance was out of scope except where UI visibility disagreed with server permission.**

No push. No deploy. Production untouched. **No migrations.**

## Verdict

| Check | Result |
|---|---|
| Authorization bypass | **0** |
| Routes audited (Phase 4+) | 90 HTTP routes |
| Permission defects found | 4 (1 bypass, 3 visibility / render) |
| Defects fixed | 4 |
| Last-admin / safety | Not regressed |
| Server auth | Remains authoritative |

HTTP model is unchanged: `requireAuth` → `requirePermission` (resolved permissions, never role-name allowlists) → `requireDepartment`. Facility comes from `auth.selectedFacility`. Cashier module maps to department type `billing`.

## 1. Route inventory (Phase 4+)

All `/app/*` routes are organization-scoped from the session tenant. Facility-scoped unless noted. Department is required where listed.

### Pharmacy — `requireDepartment("pharmacy")`

| Method | Path | Permission | Org | Facility | Dept | Role examples |
|---|---|---|---|---|---|---|
| GET | `/app/pharmacy` | `pharmacy.view` | session | selected | pharmacy | Pharmacist, auditor, clinic manager |
| GET | `/app/pharmacy/catalogue`, `/:id` | `inventory.view` | session | selected | pharmacy | Pharmacist, auditor |
| GET/POST | `/app/pharmacy/catalogue/new` | `inventory.manage` | session | selected | pharmacy | Pharmacist |
| GET | `/app/pharmacy/inventory`, `/alerts/low-stock`, `/alerts/expiry`, `/inventory/batches/:id` | `inventory.view` | session | selected | pharmacy | Pharmacist, auditor |
| GET/POST | `/app/pharmacy/inventory/receive`, `/adjust`, `/transfer` | `inventory.manage` | session | selected | pharmacy | Pharmacist |
| GET | `/app/pharmacy/queue`, `/prescriptions/:id` | `pharmacy.view` | session | selected | pharmacy | Pharmacist, auditor |
| GET/POST | dispense paths | `pharmacy.dispense` | session | selected | pharmacy | Pharmacist |
| GET/POST | `/prescriptions/:id/substitute` | `pharmacy.review` **or** `pharmacy.dispense` | session | selected | pharmacy | Pharmacist |
| GET | `/purchase-orders`, `/:id` | `inventory.view` | session | selected | pharmacy | Pharmacist, auditor |
| GET/POST | `/purchase-orders/new`, `/:id/submit`, `/:id/receive` | `inventory.manage` | session | selected | pharmacy | Pharmacist |
| GET | `/prescriptions/:id/labels` | `pharmacy.view` **or** `pharmacy.dispense` | session | selected | pharmacy | Pharmacist |
| GET | `/prescriptions/:id/instructions` | `pharmacy.view` | session | selected | pharmacy | Pharmacist, auditor |

Transfer authorizes at the **source** facility. Same org/HCO required.

### Billing — `requireDepartment("billing")`

| Method | Path | Permission | Role examples |
|---|---|---|---|
| GET | `/app/billing`, catalog list/detail, invoices list/detail, AR, collections, credit-notes list/detail, arrangements list/new/detail, price-overrides list, statements | `billing.view` | Billing officer, cashier, finance supervisor, auditor |
| GET/POST | catalog new | `billing.catalog.manage` | Billing officer, finance supervisor |
| GET/POST | invoices new / add item | `billing.invoice.create` | Billing officer, finance supervisor |
| GET/POST | invoice post | `billing.invoice.post` | Billing officer, finance supervisor |
| GET/POST | invoice void | `billing.invoice.void` | Finance supervisor |
| GET/POST | invoice amend | `billing.invoice.amend` | Finance supervisor |
| GET/POST | credit-notes new | `billing.invoice.amend` | Finance supervisor |
| GET/POST | charge review | `billing.charge.review` | Billing officer, finance supervisor |
| GET | corrections | `billing.corrections.view` | Billing officer, finance supervisor, auditor — **not cashier** |
| POST | arrangements `/:id/review` | `billing.invoice.amend` | Finance supervisor |
| GET/POST | price-overrides new | `billing.charge` | Billing officer, finance supervisor |
| POST | price-overrides approve/reject | `billing.price.override` | Finance supervisor |
| GET | revenue summary/detailed | `billing.reports.view` | Billing officer, finance supervisor, auditor — **not cashier** |
| GET | payment history | `payment.view` | Billing officer, cashier, finance supervisor, auditor |
| POST | collections contact, arrangements create | `billing.view` | Includes cashier (see exceptions) |

### Cashier — `requireDepartment("cashier")` (= billing department)

| Method | Path | Permission | Role examples |
|---|---|---|---|
| GET/POST | open session, dashboard | `cashier.open_session` | Cashier, finance supervisor |
| GET/POST | close session | `cashier.close_session` | Cashier, finance supervisor |
| GET/POST | collect payment | `payment.collect` | Cashier, finance supervisor |
| GET/POST | refund **request** | `payment.collect` | Cashier (two-step by design) |
| POST | refund **approve/reject** | `payment.refund` | Finance supervisor |
| GET | refund review / completed | `payment.view` | Cashier, finance supervisor |
| POST | reverse / reversal approve | `payment.reverse` | Finance supervisor |
| POST | reconcile | `cashier.reconcile` | Finance supervisor |
| GET | session history | `cashier.manage` | Finance supervisor |

### Patients / booking linkage (no department)

| Method | Path | Permission | Role examples |
|---|---|---|---|
| GET | `/app/patients/:patientNumber/print-card` | `patient.view` | Receptionist, nurse, clinician, billing officer, auditor |
| GET | `/app/booking-requests`, `/:id`, POST link | `patient.search` | Receptionist, nurse, clinician |
| POST | `/app/booking-requests/:id/create-patient` | `patient.create` **or** `quick_register` | Receptionist |

## 2. Finance special attention

| Action | Permission | Who | Denied |
|---|---|---|---|
| Credit note create | `billing.invoice.amend` | Finance supervisor | Cashier, billing officer |
| Credit note list/detail | `billing.view` | Billing officer, cashier, supervisor, auditor | — |
| Price override request | `billing.charge` | Billing officer, supervisor | Cashier |
| Price override approve | `billing.price.override` | Finance supervisor | Cashier, billing officer |
| Refund request | `payment.collect` | Cashier | Intentional two-step |
| Refund approve | `payment.refund` | Finance supervisor; self-approval forbidden | Cashier |
| Corrections | `billing.corrections.view` | Billing officer, supervisor, auditor | Cashier |
| Revenue report | `billing.reports.view` | Billing officer, supervisor, auditor | Cashier |

Credit notes are tenant + facility filtered (`getCreditNote`). Cross-tenant GET is 404 (concealment).

## 3. Pharmacy special attention

| Action | Permission | Notes |
|---|---|---|
| Substitution | `pharmacy.review` or `pharmacy.dispense` | UI now uses `canSubstitute` (same OR) |
| Adjustment | `inventory.manage` | Append-only movement; department pharmacy |
| Transfer | `inventory.manage` | Auth at source facility |
| PO list/detail | `inventory.view` | Detail now facility-matched |
| PO create/submit/receive | `inventory.manage` | Receive already rejected other-facility POs |

## 4. Defects and fixes

### P1 — facility isolation leak (authorization bypass) — **fixed**

`getPurchaseOrder` filtered by organization + HCO only. A pharmacist at facility A who knew a facility B PO UUID (same HCO) could load it. Submit/receive already rejected `facility_id` mismatch.

**Fix:** if `facilityId` is provided and `po.facility_id` differs, return `PURCHASE_ORDER_NOT_FOUND` (conceal). HTTP already 404s on `!loaded.ok`.

### P2 — billing dashboard showed actions the server would 403 — **fixed**

Cashier (`billing.view` only) saw Charge review, Corrections, and Revenue report. Billing officer saw Cashier (`cashier.open_session` required).

**Fix:** dashboard `capabilities` from `auth.permissions`; EJS gates those cards. Server permission middleware remains the authority.

### P2 — pharmacy dashboard hid view-only inventory from auditor — **fixed**

Inventory/catalogue/PO list/low-stock/expiry are `inventory.view`. They were gated on `canManageInventory`. Auditor could URL to them (200) but saw no links.

**Fix:** `canViewInventory` vs `canManageInventory`. Receive/adjust/transfer stay manage-only.

### P2 — authorized pharmacy mutation forms 500 — **fixed**

Adjust, transfer, receive, PO new/detail, substitution templates used `csrfField` / `csrfToken`, which the app shell did not pass. Authorized pharmacists got 500 instead of the form.

**Fix:** `renderActiveClinicAppPage` now exposes CSRF locals from `shell.csrf`.

## 5. Negative testing

| Case | Result |
|---|---|
| Unauthenticated | 303 `/login` on credit-note new, revenue, adjust, PO new, refund request |
| Missing permission | Cashier 403 on credit-note new, revenue, corrections, charge review; billing officer 403 on credit-note new and cashier; nurse 403 on adjust/receive/transfer/PO new |
| Positive control | Finance supervisor 200 on credit-note new / revenue / corrections; pharmacist 200 on adjust / PO new |
| Wrong tenant | Credit note UUID from tenant A is 404 for tenant B billing officer; owner 200 |
| Wrong facility | Pharmacist A 404 on pharmacist B’s PO; owner at B 200 |
| Inactive pharmacy department | Pharmacist 403 on adjust |
| Inactive staff | Session 403 workspace unavailable |
| Nav vs server | Cashier billing HTML has no revenue/corrections/charge-review; has cashier. Billing officer has reports/corrections/review; no cashier href. Pharmacist has receive/adjust. Auditor pharmacy has inventory/PO list; no receive/adjust/transfer |
| Last-admin | `assertNotLastOrgAdminRemoval` still returns `last_org_admin_protected` |

Existing suites re-run: finance SoD, navigation RBAC, role matrix, roles & access admin — **28 pass**.

## 6. Navigation

Shell nav already uses permission keys (`billing.view`, `cashier.open_session`, `pharmacy.view`). Dashboard quick actions now match those gates. **Hiding a link is not authorization.** Direct URL still hits `requirePermission`.

## 7. Last-admin / safety

`assertNotLastOrgAdminRemoval` in `activeClinicAccessManagementService` is unchanged. Phase 14 asserts the last org admin cannot be removed. `tests/activeclinic-roles-access-admin.test.js` still covers last-admin, dependent facility roles, and cross-tenant access 404.

## 8. Remaining exceptions (not bypasses)

| Exception | Why left |
|---|---|
| Cashier can POST payment arrangements and collections contacts | Those POSTs use `billing.view`; cashier has it. Review/approve still `invoice.amend`. Product SoD gray area |
| Charge catalog GET is `billing.view` | Read prices; create/update remains `catalog.manage` |
| Auditor can open inventory / PO list by URL | Catalogue grants `inventory.view`; mutations remain `inventory.manage` |
| Labels GET allows `pharmacy.view` **or** `pharmacy.dispense` | Service requires view; extra OR is not a write bypass |
| Refund request is `payment.collect` | Two-step SoD: approve is `payment.refund` |
| Public booking confirm still does not create internal appointments | Phase 13 remaining; not an auth bypass |

## Tests

`tests/activeclinic-phase14-rbac.test.js` — **6 pass / 0 fail**.

Related: `activeclinic-finance-rbac`, `activeclinic-navigation-rbac`, `activeclinic-rbac-role-matrix`, `activeclinic-roles-access-admin` — **28 pass / 0 fail**.

## Next

PHASE 15 — code quality / cleanup.
