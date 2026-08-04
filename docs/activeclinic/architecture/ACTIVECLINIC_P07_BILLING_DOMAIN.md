# ActiveClinic P07 — Billing Domain Architecture

**Phase:** P07 (Billing / Cashier / Invoices)  
**Created:** 2026-08-04  
**Product:** ActiveClinic  
**Stitch reference:** `ACTIVECLINIC_STITCH_PHASE_07.md` (73 screens)

## Financial integrity constraints (HARD)

These are non-negotiable requirements for any billing implementation:

### 1. Currency representation
- **Integer minor units ONLY** — never float for money
- All amounts stored as `BIGINT` (e.g., 10000 = ZMW 100.00)
- `currency_code` stored alongside every financial amount (ISO 4217)
- Default currency: **ZMW** (Zambian Kwacha) where organization config supports
- Display formatting handles division by 100 for ZMW, USD, etc.

### 2. Immutable financial history
- **Never delete** posted payments, receipts, or invoices
- **Never update** financial amounts after posting
- All corrections via explicit refund/reversal records
- Each record includes: timestamp, cashier_id, facility_id, tenant_id
- Audit trail for all financial transactions

### 3. Status management
- Separate `invoice_status` (draft/pending/posted/void) vs `payment_status` (unpaid/partial/paid/overpaid)
- Invoice posting is one-way (draft → posted); voiding requires reversal record
- Payment status calculated from allocation records, not stored redundantly

### 4. Payment allocation
- Prevent over-allocation: SUM(allocations) ≤ payment.amount
- Partial payments supported via allocation records
- Unallocated amounts tracked separately
- Multi-invoice allocation supported

### 5. Receipt numbering
- Server-side sequential receipt numbers per facility
- Format: `{facility_code}-{year}-{sequence}` (e.g., JUF-2026-000123)
- Duplicate submission protection via idempotency keys
- Receipt numbers never reused or skipped

### 6. Cashier session integrity
- All cash transactions within an open session
- Session reconciliation: expected vs actual cash count
- Variance tracking and approval workflow
- End-of-day closure required before new session

### 7. Payment method constraints
- **Cash**: record within cashier session; no external settlement proof required
- **Card**: PRODUCT_DECISION — no real payment gateway integration (honest copy required)
- **Mobile money**: PRODUCT_DECISION — no real USSD/API integration (honest copy required)
- **Insurance**: PRODUCT_DECISION — no real NHIMA integration (honest copy required)
- **Bank transfer**: PRODUCT_DECISION — manual verification required

### 8. Refunds and reversals
- Elevated permission required (`payment.refund`, `payment.reverse`)
- Confirmation dialog with reason required
- Refund creates negative payment record + allocation reversal
- Original payment + refund both preserved in history
- Partial refunds supported

### 9. Security
- Tenant-scoped patient financial data (strict isolation)
- Facility-scoped cashier sessions and receipt sequences
- CSRF protection on all financial POST actions
- Audit log for all charge, invoice, payment, refund, reversal operations

### 10. Calculation integrity
- All totals calculated from committed records only (not cached)
- Balance = invoice.total - SUM(allocated_payments)
- No floating-point arithmetic in financial calculations
- Rounding handled explicitly per currency rules

## Domain schema

### Core tables

#### `charge_catalogue_items`
Service/procedure price catalog for billing.

```sql
CREATE TABLE activeclinic.charge_catalogue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id),
  facility_id UUID REFERENCES activeclinic.facilities(id),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id UUID REFERENCES activeclinic.staff(id),
  UNIQUE(tenant_id, facility_id, code)
);
```

#### `patient_charges`
Individual charges applied to patient encounters.

```sql
CREATE TABLE activeclinic.patient_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id),
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id),
  patient_id UUID NOT NULL REFERENCES activeclinic.patients(id),
  encounter_id UUID REFERENCES activeclinic.clinical_encounters(id),
  catalogue_item_id UUID REFERENCES activeclinic.charge_catalogue_items(id),
  charge_type VARCHAR(50) NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  total_amount_minor INTEGER NOT NULL CHECK (total_amount_minor >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  charged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  charged_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('pending', 'invoiced', 'cancelled'))
);
```

#### `invoices`
Patient invoices grouping charges.

```sql
CREATE TABLE activeclinic.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id),
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id),
  patient_id UUID NOT NULL REFERENCES activeclinic.patients(id),
  invoice_number VARCHAR(50) NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor >= 0),
  tax_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (tax_amount_minor >= 0),
  total_amount_minor INTEGER NOT NULL CHECK (total_amount_minor >= 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  posted_at TIMESTAMPTZ,
  posted_by_staff_id UUID REFERENCES activeclinic.staff(id),
  voided_at TIMESTAMPTZ,
  voided_by_staff_id UUID REFERENCES activeclinic.staff(id),
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff(id),
  UNIQUE(tenant_id, facility_id, invoice_number),
  CHECK (status IN ('draft', 'pending', 'posted', 'void')),
  CHECK ((status = 'posted') = (posted_at IS NOT NULL)),
  CHECK ((status = 'void') = (voided_at IS NOT NULL))
);
```

#### `invoice_lines`
Line items on invoices.

```sql
CREATE TABLE activeclinic.invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES activeclinic.invoices(id) ON DELETE CASCADE,
  charge_id UUID REFERENCES activeclinic.patient_charges(id),
  line_number INTEGER NOT NULL,
  description VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount_minor INTEGER NOT NULL CHECK (unit_amount_minor >= 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(invoice_id, line_number)
);
```

#### `payments`
All payment records (cash, card, mobile money, etc.).

```sql
CREATE TABLE activeclinic.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id),
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id),
  patient_id UUID NOT NULL REFERENCES activeclinic.patients(id),
  payment_number VARCHAR(50) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  payment_method VARCHAR(50) NOT NULL,
  reference_number VARCHAR(100),
  notes TEXT,
  cashier_session_id UUID REFERENCES activeclinic.cashier_sessions(id),
  received_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key VARCHAR(100) UNIQUE,
  UNIQUE(tenant_id, facility_id, payment_number),
  CHECK (payment_method IN ('cash', 'card', 'mobile_money', 'bank_transfer', 'insurance', 'other'))
);
```

#### `payment_allocations`
Links payments to invoices with amounts.

```sql
CREATE TABLE activeclinic.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES activeclinic.payments(id),
  invoice_id UUID NOT NULL REFERENCES activeclinic.invoices(id),
  allocated_amount_minor INTEGER NOT NULL CHECK (allocated_amount_minor > 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff(id)
);
```

#### `receipts`
Official receipt records for payments.

```sql
CREATE TABLE activeclinic.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id),
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id),
  payment_id UUID NOT NULL REFERENCES activeclinic.payments(id),
  receipt_number VARCHAR(50) NOT NULL,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  issued_to_patient_name VARCHAR(255) NOT NULL,
  issued_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, facility_id, receipt_number)
);
```

#### `refunds`
Refund records (negative payments).

```sql
CREATE TABLE activeclinic.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id),
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id),
  original_payment_id UUID NOT NULL REFERENCES activeclinic.payments(id),
  refund_payment_id UUID NOT NULL REFERENCES activeclinic.payments(id),
  refund_date DATE NOT NULL DEFAULT CURRENT_DATE,
  refund_amount_minor INTEGER NOT NULL CHECK (refund_amount_minor > 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  reason TEXT NOT NULL,
  requested_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff(id),
  approved_by_staff_id UUID REFERENCES activeclinic.staff(id),
  approved_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('pending', 'approved', 'rejected', 'completed'))
);
```

#### `financial_reversals`
Audit trail for voided invoices and reversed payments.

```sql
CREATE TABLE activeclinic.financial_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id),
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id),
  reversal_type VARCHAR(50) NOT NULL,
  original_record_id UUID NOT NULL,
  original_record_type VARCHAR(50) NOT NULL,
  reversal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL,
  requested_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff(id),
  approved_by_staff_id UUID REFERENCES activeclinic.staff(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reversal_type IN ('invoice_void', 'payment_reverse', 'charge_cancel')),
  CHECK (original_record_type IN ('invoice', 'payment', 'charge'))
);
```

#### `cashier_sessions`
Daily cashier shift tracking.

```sql
CREATE TABLE activeclinic.cashier_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id),
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id),
  cashier_staff_id UUID NOT NULL REFERENCES activeclinic.staff(id),
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  opening_cash_minor INTEGER NOT NULL DEFAULT 0 CHECK (opening_cash_minor >= 0),
  expected_cash_minor INTEGER,
  actual_cash_minor INTEGER,
  variance_minor INTEGER,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  closed_by_staff_id UUID REFERENCES activeclinic.staff(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('open', 'closed', 'reconciled')),
  CHECK ((status != 'open') = (closed_at IS NOT NULL))
);
```

#### `cashier_session_events`
Audit log of session activity.

```sql
CREATE TABLE activeclinic.cashier_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES activeclinic.cashier_sessions(id),
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff(id),
  CHECK (event_type IN ('open', 'payment', 'refund', 'count', 'close', 'reconcile'))
);
```

### Indexes

```sql
-- Patient charges
CREATE INDEX idx_patient_charges_tenant_patient ON activeclinic.patient_charges(tenant_id, patient_id);
CREATE INDEX idx_patient_charges_facility ON activeclinic.patient_charges(facility_id);
CREATE INDEX idx_patient_charges_encounter ON activeclinic.patient_charges(encounter_id);
CREATE INDEX idx_patient_charges_status ON activeclinic.patient_charges(status);

-- Invoices
CREATE INDEX idx_invoices_tenant_patient ON activeclinic.invoices(tenant_id, patient_id);
CREATE INDEX idx_invoices_facility ON activeclinic.invoices(facility_id);
CREATE INDEX idx_invoices_status ON activeclinic.invoices(status);
CREATE INDEX idx_invoices_date ON activeclinic.invoices(invoice_date);

-- Payments
CREATE INDEX idx_payments_tenant_patient ON activeclinic.payments(tenant_id, patient_id);
CREATE INDEX idx_payments_facility ON activeclinic.payments(facility_id);
CREATE INDEX idx_payments_session ON activeclinic.payments(cashier_session_id);
CREATE INDEX idx_payments_date ON activeclinic.payments(payment_date);
CREATE INDEX idx_payments_method ON activeclinic.payments(payment_method);

-- Payment allocations
CREATE INDEX idx_payment_allocations_payment ON activeclinic.payment_allocations(payment_id);
CREATE INDEX idx_payment_allocations_invoice ON activeclinic.payment_allocations(invoice_id);

-- Cashier sessions
CREATE INDEX idx_cashier_sessions_facility_date ON activeclinic.cashier_sessions(facility_id, session_date);
CREATE INDEX idx_cashier_sessions_cashier ON activeclinic.cashier_sessions(cashier_staff_id);
CREATE INDEX idx_cashier_sessions_status ON activeclinic.cashier_sessions(status);
```

## Permissions model

### Billing permissions
- `billing.view` — View charge catalog and patient charges
- `billing.charge` — Create patient charges
- `billing.invoice.create` — Create invoices
- `billing.invoice.post` — Post invoices (finalize)
- `billing.invoice.void` — Void posted invoices (requires approval)

### Payment permissions
- `payment.view` — View payment history
- `payment.collect` — Record payments
- `payment.refund` — Process refunds (elevated)
- `payment.reverse` — Reverse payments (elevated, requires approval)

### Cashier permissions
- `cashier.open_session` — Open cashier shift
- `cashier.close_session` — Close cashier shift
- `cashier.manage` — Full cashier management (sessions, reconciliation)

### Grant strategy
- Network + Facility Admin: all billing/payment/cashier permissions by default
- Cashier role: `payment.collect`, `cashier.open_session`, `cashier.close_session`
- Billing clerk: `billing.view`, `billing.charge`, `billing.invoice.create`
- Finance manager: all billing + `payment.refund` + `billing.invoice.void`

## Implementation strategy

### Shared components approach
- Create reusable billing primitives (invoice card, payment form, receipt display)
- State variants via route/model states — avoid duplicating full markup
- Confirmation dialogs for financial actions (post, void, refund, reverse)
- Error states (payment failed, session variance, authorization denied)

### Routes
- `/app/billing/dashboard` — Billing overview
- `/app/billing/charges` — Charge catalog management
- `/app/billing/invoices` — Invoice list
- `/app/billing/invoices/new` — Create invoice
- `/app/billing/invoices/:id` — Invoice detail
- `/app/billing/payments` — Payment history
- `/app/billing/payments/:id` — Payment detail
- `/app/billing/refunds` — Refund requests
- `/app/cashier/dashboard` — Cashier shift overview
- `/app/cashier/session` — Current session detail
- `/app/cashier/history` — Session history
- `/app/cashier/open` — Open new session

### Navigation wiring
Add billing/cashier links to authenticated shell navigation for roles with permissions.

### Validation
- Server-side validation for all financial amounts
- CSRF tokens on all POST/PUT/DELETE actions
- Duplicate submission prevention via idempotency keys
- Balance validation before payment allocation

## Testing requirements

### Unit tests
- Integer currency arithmetic (no rounding errors)
- Payment allocation validation (no over-allocation)
- Receipt number generation (sequential, no gaps)
- Session variance calculation
- Invoice total calculation from lines

### Integration tests
- Create charge → invoice → payment → receipt flow
- Partial payment allocation
- Multi-invoice payment
- Refund request → approval → completion
- Cashier session open → payment → close → reconcile
- Duplicate submission protection
- Authorization checks (tenant isolation, permission gates)
- BlessBoard regression (no church data mutation)

### PRODUCT_DECISION screens
Screens marked as placeholders for external integrations:
- Card payment gateway (no real integration)
- Mobile money USSD/API (no real integration)
- NHIMA insurance claims (no real integration)
- Bank transfer verification (manual only)

These screens should show honest copy indicating PARTIAL implementation or requiring manual verification.

## Honest PARTIAL implementation

For implemented workflows with limitations:
- Cash payments: FULL implementation (within cashier session)
- Manual payment methods: PARTIAL (record-only, no external verification)
- Insurance/claims: PRODUCT_DECISION placeholder
- Automatic charge capture: PARTIAL (manual charge creation only)
- Collections workflow: PRODUCT_DECISION placeholder
- Revenue reports: PARTIAL (basic queries only)

Each limitation documented in screen status and user-facing copy where appropriate.
