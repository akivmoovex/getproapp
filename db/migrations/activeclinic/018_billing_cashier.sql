-- ActiveClinic P07 — Billing / Cashier / Invoices schema
-- Migration: 018
-- Created: 2026-08-04
-- Dependencies: 017_diagnostics.sql

-- Financial integrity constraints:
-- 1. Integer minor currency units ONLY (never float money)
-- 2. Immutable financial history (never delete posted payments/receipts)
-- 3. Explicit refund/reversal records for corrections
-- 4. Separate invoice_status vs payment_status
-- 5. Server-side receipt numbering with duplicate protection
-- 6. Tenant-scoped patient financial data
-- 7. Cashier session integrity for cash transactions

-- ============================================================================
-- CHARGE CATALOG
-- ============================================================================

CREATE TABLE activeclinic.charge_catalogue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  facility_id UUID REFERENCES activeclinic.facilities(id) ON DELETE CASCADE,
  
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  
  -- Integer minor units (e.g., 10000 = ZMW 100.00)
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  
  is_taxable BOOLEAN NOT NULL DEFAULT false,
  tax_rate_percent NUMERIC(5,2) DEFAULT 0.00 CHECK (tax_rate_percent >= 0),
  
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE,
  effective_until DATE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id UUID REFERENCES activeclinic.staff_members(id),
  updated_by_staff_id UUID REFERENCES activeclinic.staff_members(id),
  
  UNIQUE(tenant_id, facility_id, code),
  CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

CREATE INDEX idx_charge_catalogue_tenant_facility ON activeclinic.charge_catalogue_items(tenant_id, facility_id);
CREATE INDEX idx_charge_catalogue_category ON activeclinic.charge_catalogue_items(category) WHERE is_active = true;
CREATE INDEX idx_charge_catalogue_active ON activeclinic.charge_catalogue_items(is_active, effective_from, effective_until);

COMMENT ON TABLE activeclinic.charge_catalogue_items IS 'Service/procedure price catalog for billing';
COMMENT ON COLUMN activeclinic.charge_catalogue_items.amount_minor IS 'Price in minor currency units (e.g., 10000 = ZMW 100.00)';

-- ============================================================================
-- PATIENT CHARGES
-- ============================================================================

CREATE TABLE activeclinic.patient_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES activeclinic.patients(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES activeclinic.encounters(id) ON DELETE SET NULL,
  
  catalogue_item_id UUID REFERENCES activeclinic.charge_catalogue_items(id),
  
  charge_type VARCHAR(50) NOT NULL,
  description VARCHAR(255) NOT NULL,
  
  -- Pricing
  unit_amount_minor BIGINT NOT NULL CHECK (unit_amount_minor >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  subtotal_minor BIGINT NOT NULL CHECK (subtotal_minor >= 0),
  tax_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (tax_amount_minor >= 0),
  total_amount_minor BIGINT NOT NULL CHECK (total_amount_minor >= 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  
  charged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  charged_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff_members(id),
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CHECK (status IN ('pending', 'invoiced', 'cancelled')),
  CHECK (total_amount_minor = subtotal_minor + tax_amount_minor)
);

CREATE INDEX idx_patient_charges_tenant_patient ON activeclinic.patient_charges(tenant_id, patient_id);
CREATE INDEX idx_patient_charges_facility ON activeclinic.patient_charges(facility_id);
CREATE INDEX idx_patient_charges_encounter ON activeclinic.patient_charges(encounter_id);
CREATE INDEX idx_patient_charges_status ON activeclinic.patient_charges(status);
CREATE INDEX idx_patient_charges_date ON activeclinic.patient_charges(charged_at);

COMMENT ON TABLE activeclinic.patient_charges IS 'Individual charges applied to patient encounters';
COMMENT ON COLUMN activeclinic.patient_charges.status IS 'pending: awaiting invoice; invoiced: included in invoice; cancelled: voided';

-- ============================================================================
-- INVOICES
-- ============================================================================

CREATE TABLE activeclinic.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES activeclinic.patients(id) ON DELETE CASCADE,
  
  invoice_number VARCHAR(50) NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  
  -- Amounts in minor units
  subtotal_minor BIGINT NOT NULL CHECK (subtotal_minor >= 0),
  tax_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (tax_amount_minor >= 0),
  adjustment_minor BIGINT NOT NULL DEFAULT 0,
  total_amount_minor BIGINT NOT NULL CHECK (total_amount_minor >= 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  
  -- Status management (immutable after posting)
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  
  posted_at TIMESTAMPTZ,
  posted_by_staff_id UUID REFERENCES activeclinic.staff_members(id),
  
  voided_at TIMESTAMPTZ,
  voided_by_staff_id UUID REFERENCES activeclinic.staff_members(id),
  void_reason TEXT,
  
  notes TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff_members(id),
  updated_by_staff_id UUID REFERENCES activeclinic.staff_members(id),
  
  UNIQUE(tenant_id, facility_id, invoice_number),
  CHECK (status IN ('draft', 'pending', 'posted', 'void')),
  CHECK ((status = 'posted') = (posted_at IS NOT NULL)),
  CHECK ((status = 'void') = (voided_at IS NOT NULL)),
  CHECK (due_date IS NULL OR due_date >= invoice_date),
  CHECK (total_amount_minor = subtotal_minor + tax_amount_minor + adjustment_minor)
);

CREATE INDEX idx_invoices_tenant_patient ON activeclinic.invoices(tenant_id, patient_id);
CREATE INDEX idx_invoices_facility ON activeclinic.invoices(facility_id);
CREATE INDEX idx_invoices_status ON activeclinic.invoices(status);
CREATE INDEX idx_invoices_date ON activeclinic.invoices(invoice_date);
CREATE INDEX idx_invoices_posted ON activeclinic.invoices(posted_at) WHERE status = 'posted';

COMMENT ON TABLE activeclinic.invoices IS 'Patient invoices grouping charges (immutable after posting)';
COMMENT ON COLUMN activeclinic.invoices.status IS 'draft: editable; pending: awaiting approval; posted: finalized (immutable); void: cancelled via reversal';

-- ============================================================================
-- INVOICE LINES
-- ============================================================================

CREATE TABLE activeclinic.invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES activeclinic.invoices(id) ON DELETE CASCADE,
  charge_id UUID REFERENCES activeclinic.patient_charges(id) ON DELETE SET NULL,
  
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  
  description VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  
  unit_amount_minor BIGINT NOT NULL CHECK (unit_amount_minor >= 0),
  subtotal_minor BIGINT NOT NULL CHECK (subtotal_minor >= 0),
  tax_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (tax_amount_minor >= 0),
  line_total_minor BIGINT NOT NULL CHECK (line_total_minor >= 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(invoice_id, line_number),
  CHECK (subtotal_minor = unit_amount_minor * quantity),
  CHECK (line_total_minor = subtotal_minor + tax_amount_minor)
);

CREATE INDEX idx_invoice_lines_invoice ON activeclinic.invoice_lines(invoice_id);
CREATE INDEX idx_invoice_lines_charge ON activeclinic.invoice_lines(charge_id);

COMMENT ON TABLE activeclinic.invoice_lines IS 'Line items on invoices (immutable after invoice posted)';

-- ============================================================================
-- CASHIER SESSIONS
-- ============================================================================

CREATE TABLE activeclinic.cashier_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id) ON DELETE CASCADE,
  cashier_staff_id UUID NOT NULL REFERENCES activeclinic.staff_members(id) ON DELETE RESTRICT,
  
  session_number VARCHAR(50) NOT NULL,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  
  -- Cash reconciliation (minor units)
  opening_cash_minor BIGINT NOT NULL DEFAULT 0 CHECK (opening_cash_minor >= 0),
  expected_cash_minor BIGINT,
  actual_cash_minor BIGINT,
  variance_minor BIGINT,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  
  closed_by_staff_id UUID REFERENCES activeclinic.staff_members(id),
  reconciled_at TIMESTAMPTZ,
  reconciled_by_staff_id UUID REFERENCES activeclinic.staff_members(id),
  
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(tenant_id, facility_id, session_number),
  CHECK (status IN ('open', 'closed', 'reconciled')),
  CHECK ((status != 'open') = (closed_at IS NOT NULL)),
  CHECK ((status = 'reconciled') = (reconciled_at IS NOT NULL)),
  CHECK (variance_minor IS NULL OR (expected_cash_minor IS NOT NULL AND actual_cash_minor IS NOT NULL)),
  CHECK (variance_minor IS NULL OR variance_minor = actual_cash_minor - expected_cash_minor)
);

CREATE INDEX idx_cashier_sessions_facility_date ON activeclinic.cashier_sessions(facility_id, session_date);
CREATE INDEX idx_cashier_sessions_cashier ON activeclinic.cashier_sessions(cashier_staff_id);
CREATE INDEX idx_cashier_sessions_status ON activeclinic.cashier_sessions(status);
CREATE INDEX idx_cashier_sessions_open ON activeclinic.cashier_sessions(facility_id, status) WHERE status = 'open';

COMMENT ON TABLE activeclinic.cashier_sessions IS 'Daily cashier shift tracking with reconciliation';
COMMENT ON COLUMN activeclinic.cashier_sessions.variance_minor IS 'Calculated as actual_cash - expected_cash (minor units)';

-- ============================================================================
-- CASHIER SESSION EVENTS
-- ============================================================================

CREATE TABLE activeclinic.cashier_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES activeclinic.cashier_sessions(id) ON DELETE CASCADE,
  
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff_members(id),
  
  CHECK (event_type IN ('session_open', 'payment_received', 'refund_issued', 'cash_count', 'session_close', 'session_reconcile', 'variance_noted'))
);

CREATE INDEX idx_cashier_session_events_session ON activeclinic.cashier_session_events(session_id);
CREATE INDEX idx_cashier_session_events_type ON activeclinic.cashier_session_events(event_type);
CREATE INDEX idx_cashier_session_events_created ON activeclinic.cashier_session_events(created_at);

COMMENT ON TABLE activeclinic.cashier_session_events IS 'Audit log of cashier session activity';

-- ============================================================================
-- PAYMENTS
-- ============================================================================

CREATE TABLE activeclinic.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES activeclinic.patients(id) ON DELETE CASCADE,
  
  payment_number VARCHAR(50) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Amount in minor units (immutable after creation)
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  
  payment_method VARCHAR(50) NOT NULL,
  reference_number VARCHAR(100),
  
  -- Link to cashier session (required for cash)
  cashier_session_id UUID REFERENCES activeclinic.cashier_sessions(id),
  
  notes TEXT,
  
  received_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff_members(id),
  
  -- Duplicate prevention
  idempotency_key VARCHAR(100) UNIQUE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(tenant_id, facility_id, payment_number),
  CHECK (payment_method IN ('cash', 'card', 'mobile_money', 'bank_transfer', 'insurance', 'cheque', 'other')),
  CHECK ((payment_method = 'cash') = (cashier_session_id IS NOT NULL))
);

CREATE INDEX idx_payments_tenant_patient ON activeclinic.payments(tenant_id, patient_id);
CREATE INDEX idx_payments_facility ON activeclinic.payments(facility_id);
CREATE INDEX idx_payments_session ON activeclinic.payments(cashier_session_id);
CREATE INDEX idx_payments_date ON activeclinic.payments(payment_date);
CREATE INDEX idx_payments_method ON activeclinic.payments(payment_method);
CREATE INDEX idx_payments_reference ON activeclinic.payments(reference_number) WHERE reference_number IS NOT NULL;

COMMENT ON TABLE activeclinic.payments IS 'All payment records (immutable; corrections via refunds/reversals)';
COMMENT ON COLUMN activeclinic.payments.idempotency_key IS 'Prevents duplicate submissions (e.g., form double-click)';
COMMENT ON COLUMN activeclinic.payments.amount_minor IS 'Payment amount in minor currency units (never float)';

-- ============================================================================
-- PAYMENT ALLOCATIONS
-- ============================================================================

CREATE TABLE activeclinic.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES activeclinic.payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES activeclinic.invoices(id) ON DELETE CASCADE,
  
  allocated_amount_minor BIGINT NOT NULL CHECK (allocated_amount_minor > 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff_members(id)
);

CREATE INDEX idx_payment_allocations_payment ON activeclinic.payment_allocations(payment_id);
CREATE INDEX idx_payment_allocations_invoice ON activeclinic.payment_allocations(invoice_id);

COMMENT ON TABLE activeclinic.payment_allocations IS 'Links payments to invoices with amounts (supports partial payments)';

-- Prevent over-allocation constraint (sum of allocations cannot exceed payment amount)
-- Enforced in application layer; check in tests

-- ============================================================================
-- RECEIPTS
-- ============================================================================

CREATE TABLE activeclinic.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES activeclinic.payments(id) ON DELETE CASCADE,
  
  receipt_number VARCHAR(50) NOT NULL,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  
  issued_to_patient_name VARCHAR(255) NOT NULL,
  issued_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff_members(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(tenant_id, facility_id, receipt_number)
);

CREATE INDEX idx_receipts_tenant_facility ON activeclinic.receipts(tenant_id, facility_id);
CREATE INDEX idx_receipts_payment ON activeclinic.receipts(payment_id);
CREATE INDEX idx_receipts_date ON activeclinic.receipts(receipt_date);

COMMENT ON TABLE activeclinic.receipts IS 'Official receipt records for payments (immutable)';
COMMENT ON COLUMN activeclinic.receipts.receipt_number IS 'Sequential per facility (e.g., JUF-2026-000123)';

-- ============================================================================
-- REFUNDS
-- ============================================================================

CREATE TABLE activeclinic.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id) ON DELETE CASCADE,
  
  original_payment_id UUID NOT NULL REFERENCES activeclinic.payments(id) ON DELETE CASCADE,
  refund_payment_id UUID REFERENCES activeclinic.payments(id),
  
  refund_date DATE NOT NULL DEFAULT CURRENT_DATE,
  refund_amount_minor BIGINT NOT NULL CHECK (refund_amount_minor > 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  
  reason TEXT NOT NULL,
  
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  
  requested_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff_members(id),
  approved_by_staff_id UUID REFERENCES activeclinic.staff_members(id),
  approved_at TIMESTAMPTZ,
  rejected_by_staff_id UUID REFERENCES activeclinic.staff_members(id),
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  CHECK ((status = 'approved') = (approved_at IS NOT NULL)),
  CHECK ((status = 'rejected') = (rejected_at IS NOT NULL)),
  CHECK ((status = 'completed') = (refund_payment_id IS NOT NULL))
);

CREATE INDEX idx_refunds_tenant_facility ON activeclinic.refunds(tenant_id, facility_id);
CREATE INDEX idx_refunds_original_payment ON activeclinic.refunds(original_payment_id);
CREATE INDEX idx_refunds_status ON activeclinic.refunds(status);
CREATE INDEX idx_refunds_date ON activeclinic.refunds(refund_date);

COMMENT ON TABLE activeclinic.refunds IS 'Refund requests with approval workflow (elevated permission)';
COMMENT ON COLUMN activeclinic.refunds.refund_payment_id IS 'References negative payment record created upon completion';

-- ============================================================================
-- FINANCIAL REVERSALS
-- ============================================================================

CREATE TABLE activeclinic.financial_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id) ON DELETE CASCADE,
  
  reversal_type VARCHAR(50) NOT NULL,
  original_record_id UUID NOT NULL,
  original_record_type VARCHAR(50) NOT NULL,
  
  reversal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL,
  
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  
  requested_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff_members(id),
  approved_by_staff_id UUID REFERENCES activeclinic.staff_members(id),
  approved_at TIMESTAMPTZ,
  rejected_by_staff_id UUID REFERENCES activeclinic.staff_members(id),
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  reversal_data JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CHECK (reversal_type IN ('invoice_void', 'payment_reverse', 'charge_cancel', 'allocation_reverse')),
  CHECK (original_record_type IN ('invoice', 'payment', 'charge', 'allocation')),
  CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  CHECK ((status = 'approved') = (approved_at IS NOT NULL)),
  CHECK ((status = 'rejected') = (rejected_at IS NOT NULL))
);

CREATE INDEX idx_financial_reversals_tenant_facility ON activeclinic.financial_reversals(tenant_id, facility_id);
CREATE INDEX idx_financial_reversals_original ON activeclinic.financial_reversals(original_record_id, original_record_type);
CREATE INDEX idx_financial_reversals_status ON activeclinic.financial_reversals(status);
CREATE INDEX idx_financial_reversals_type ON activeclinic.financial_reversals(reversal_type);
CREATE INDEX idx_financial_reversals_date ON activeclinic.financial_reversals(reversal_date);

COMMENT ON TABLE activeclinic.financial_reversals IS 'Audit trail for voided invoices and reversed payments (elevated permission)';

-- ============================================================================
-- PAYMENT ARRANGEMENTS (future / PRODUCT_DECISION)
-- ============================================================================

CREATE TABLE activeclinic.payment_arrangements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES activeclinic.patients(id) ON DELETE CASCADE,
  
  arrangement_number VARCHAR(50) NOT NULL,
  total_amount_minor BIGINT NOT NULL CHECK (total_amount_minor > 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  
  number_of_installments INTEGER NOT NULL CHECK (number_of_installments > 0),
  installment_amount_minor BIGINT NOT NULL CHECK (installment_amount_minor > 0),
  installment_frequency VARCHAR(20) NOT NULL,
  
  start_date DATE NOT NULL,
  
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  
  requested_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff_members(id),
  approved_by_staff_id UUID REFERENCES activeclinic.staff_members(id),
  approved_at TIMESTAMPTZ,
  
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(tenant_id, facility_id, arrangement_number),
  CHECK (status IN ('pending', 'approved', 'rejected', 'active', 'completed', 'defaulted', 'cancelled')),
  CHECK (installment_frequency IN ('weekly', 'biweekly', 'monthly', 'custom'))
);

CREATE INDEX idx_payment_arrangements_tenant_patient ON activeclinic.payment_arrangements(tenant_id, patient_id);
CREATE INDEX idx_payment_arrangements_facility ON activeclinic.payment_arrangements(facility_id);
CREATE INDEX idx_payment_arrangements_status ON activeclinic.payment_arrangements(status);

COMMENT ON TABLE activeclinic.payment_arrangements IS 'Payment plan agreements (PRODUCT_DECISION: basic support only)';

-- Tenant isolation is enforced in application services (organization_id/tenant_id scoping).
-- Do not enable RLS without policies — that blocks the foundation role used in tests.

-- ============================================================================
-- VALIDATION FUNCTIONS (optional helpers)
-- ============================================================================

-- Function to check payment allocation doesn't exceed payment amount
CREATE OR REPLACE FUNCTION activeclinic.validate_payment_allocation()
RETURNS TRIGGER AS $$
DECLARE
  v_payment_amount BIGINT;
  v_total_allocated BIGINT;
BEGIN
  -- Get payment amount
  SELECT amount_minor INTO v_payment_amount
  FROM activeclinic.payments
  WHERE id = NEW.payment_id;
  
  -- Calculate total allocated (including new allocation)
  SELECT COALESCE(SUM(allocated_amount_minor), 0) INTO v_total_allocated
  FROM activeclinic.payment_allocations
  WHERE payment_id = NEW.payment_id;
  
  IF v_total_allocated > v_payment_amount THEN
    RAISE EXCEPTION 'Total allocated amount (%) exceeds payment amount (%)', v_total_allocated, v_payment_amount;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_payment_allocation
  AFTER INSERT OR UPDATE ON activeclinic.payment_allocations
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.validate_payment_allocation();

-- ============================================================================
-- SEED DATA (optional: default charge categories)
-- ============================================================================

-- Categories for charge catalogue
-- INSERT INTO activeclinic.charge_catalogue_items will be done via application
-- or separate seed script per tenant/facility

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON SCHEMA activeclinic IS 'ActiveClinic P07 billing/cashier schema added: 018_billing_cashier.sql';
