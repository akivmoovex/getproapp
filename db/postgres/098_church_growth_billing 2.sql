-- BlessBoard Growth billing readiness (no payment provider).
-- Idempotent: safe at startup via ensureChurchSchema.
-- Does not store card details or record fake successful payments.

-- ---------------------------------------------------------------------------
-- Branch billable window
-- ---------------------------------------------------------------------------
ALTER TABLE public.church_branches
  ADD COLUMN IF NOT EXISTS billing_started_at TIMESTAMPTZ;

ALTER TABLE public.church_branches
  ADD COLUMN IF NOT EXISTS billing_ends_at TIMESTAMPTZ;

COMMENT ON COLUMN public.church_branches.billing_started_at IS
  'When the branch became billable (set on Growth activation).';
COMMENT ON COLUMN public.church_branches.billing_ends_at IS
  'End of paid period after deactivation; NULL while actively billable.';

-- ---------------------------------------------------------------------------
-- Organisation billing / collection placeholders (automation off by default)
-- ---------------------------------------------------------------------------
ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS billing_cadence TEXT NOT NULL DEFAULT 'monthly';

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS billing_currency TEXT NOT NULL DEFAULT 'USD';

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS billing_payment_status TEXT NOT NULL DEFAULT 'not_applicable';

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS billing_collection_state TEXT NOT NULL DEFAULT 'ok';

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS billing_grace_started_at TIMESTAMPTZ;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS billing_restricted_at TIMESTAMPTZ;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS billing_suspended_at TIMESTAMPTZ;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS billing_payment_failed_at TIMESTAMPTZ;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS billing_dunning_day INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS billing_dunning_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS billing_payment_provider_enabled BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'church_organizations_billing_cadence_check'
  ) THEN
    ALTER TABLE public.church_organizations
      ADD CONSTRAINT church_organizations_billing_cadence_check
      CHECK (billing_cadence IN ('monthly', 'annual'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'church_organizations_billing_payment_status_check'
  ) THEN
    ALTER TABLE public.church_organizations
      ADD CONSTRAINT church_organizations_billing_payment_status_check
      CHECK (billing_payment_status IN (
        'not_applicable', 'awaiting_provider', 'pending', 'succeeded', 'failed', 'refunded'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'church_organizations_billing_collection_state_check'
  ) THEN
    ALTER TABLE public.church_organizations
      ADD CONSTRAINT church_organizations_billing_collection_state_check
      CHECK (billing_collection_state IN (
        'ok', 'notice', 'reminder', 'final_warning', 'restricted', 'suspended'
      ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Price book + package price history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.church_billing_price_book (
  id BIGSERIAL PRIMARY KEY,
  package_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  label TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  unit_amount_cents INTEGER NOT NULL,
  billing_interval TEXT NOT NULL,
  billable_unit TEXT NOT NULL DEFAULT 'active_branch',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  is_current BOOLEAN NOT NULL DEFAULT true,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_billing_price_book_interval_check
    CHECK (billing_interval IN ('monthly', 'annual')),
  CONSTRAINT church_billing_price_book_amount_check
    CHECK (unit_amount_cents >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_billing_price_book_current
  ON public.church_billing_price_book (package_code, item_code, billing_interval)
  WHERE is_current = true;

CREATE TABLE IF NOT EXISTS public.church_billing_package_price_history (
  id BIGSERIAL PRIMARY KEY,
  package_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  unit_amount_cents INTEGER NOT NULL,
  billing_interval TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ,
  change_reason TEXT,
  price_book_id BIGINT REFERENCES public.church_billing_price_book (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_church_billing_pkg_price_hist_pkg
  ON public.church_billing_package_price_history (package_code, billing_interval, effective_from DESC);

-- Seed Growth branch price (USD 14.90 / active branch / month). Annual list = 12× monthly.
INSERT INTO public.church_billing_price_book (
  package_code, item_code, label, currency, unit_amount_cents, billing_interval, billable_unit, is_current
)
SELECT 'growth', 'active_branch', 'Growth active branch', 'USD', 1490, 'monthly', 'active_branch', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.church_billing_price_book
  WHERE package_code = 'growth' AND item_code = 'active_branch' AND billing_interval = 'monthly' AND is_current
);

INSERT INTO public.church_billing_price_book (
  package_code, item_code, label, currency, unit_amount_cents, billing_interval, billable_unit, is_current
)
SELECT 'growth', 'active_branch', 'Growth active branch (annual list)', 'USD', 1490 * 12, 'annual', 'active_branch', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.church_billing_price_book
  WHERE package_code = 'growth' AND item_code = 'active_branch' AND billing_interval = 'annual' AND is_current
);

INSERT INTO public.church_billing_package_price_history (
  package_code, item_code, currency, unit_amount_cents, billing_interval, effective_from, change_reason, price_book_id
)
SELECT pb.package_code, pb.item_code, pb.currency, pb.unit_amount_cents, pb.billing_interval, pb.effective_from,
       'initial_seed', pb.id
FROM public.church_billing_price_book pb
WHERE pb.package_code = 'growth' AND pb.item_code = 'active_branch'
  AND NOT EXISTS (
    SELECT 1 FROM public.church_billing_package_price_history h
    WHERE h.package_code = pb.package_code
      AND h.item_code = pb.item_code
      AND h.billing_interval = pb.billing_interval
      AND h.change_reason = 'initial_seed'
  );

-- ---------------------------------------------------------------------------
-- Package assignment history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.church_organization_package_history (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  previous_plan_code TEXT,
  new_plan_code TEXT NOT NULL,
  previous_package_code TEXT,
  new_package_code TEXT NOT NULL,
  changed_by_platform_admin_id INTEGER,
  change_reason TEXT,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_church_org_package_history_org
  ON public.church_organization_package_history (organization_id, effective_at DESC);

-- ---------------------------------------------------------------------------
-- Billing periods
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.church_billing_periods (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  cadence TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  CONSTRAINT church_billing_periods_cadence_check CHECK (cadence IN ('monthly', 'annual')),
  CONSTRAINT church_billing_periods_status_check CHECK (status IN ('open', 'closed')),
  CONSTRAINT church_billing_periods_range_check CHECK (period_end >= period_start),
  CONSTRAINT church_billing_periods_unique UNIQUE (organization_id, cadence, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_church_billing_periods_org
  ON public.church_billing_periods (organization_id, period_start DESC);

-- ---------------------------------------------------------------------------
-- Billable active-branch snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.church_billing_branch_snapshots (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  billing_period_id BIGINT
    REFERENCES public.church_billing_periods (id) ON DELETE SET NULL,
  snapshot_key TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  branch_id INTEGER NOT NULL
    REFERENCES public.church_branches (id) ON DELETE CASCADE,
  branch_slug TEXT,
  branch_name TEXT,
  billing_started_at TIMESTAMPTZ,
  billing_ends_at TIMESTAMPTZ,
  billable_from DATE NOT NULL,
  billable_to DATE NOT NULL,
  billable_days INTEGER NOT NULL,
  period_days INTEGER NOT NULL,
  is_prorated BOOLEAN NOT NULL DEFAULT false,
  unit_amount_cents INTEGER NOT NULL,
  line_amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT church_billing_branch_snapshots_days_check CHECK (billable_days >= 0 AND period_days > 0),
  CONSTRAINT church_billing_branch_snapshots_unique
    UNIQUE (organization_id, snapshot_key, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_church_billing_branch_snapshots_org
  ON public.church_billing_branch_snapshots (organization_id, captured_at DESC);

-- ---------------------------------------------------------------------------
-- Credits / discounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.church_billing_credits (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  remaining_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_invoice_id BIGINT,
  CONSTRAINT church_billing_credits_amount_check CHECK (amount_cents > 0),
  CONSTRAINT church_billing_credits_status_check CHECK (status IN ('open', 'applied', 'void'))
);

CREATE TABLE IF NOT EXISTS public.church_billing_discounts (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  discount_type TEXT NOT NULL,
  percent_bps INTEGER,
  amount_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_billing_discounts_type_check
    CHECK (discount_type IN ('percent', 'fixed', 'annual_prepay')),
  CONSTRAINT church_billing_discounts_status_check
    CHECK (status IN ('active', 'exhausted', 'void'))
);

-- ---------------------------------------------------------------------------
-- Draft / issued invoices (payment status is placeholder until provider)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.church_billing_invoices (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  billing_period_id BIGINT
    REFERENCES public.church_billing_periods (id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  invoice_number TEXT,
  cadence TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  credit_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  payment_status TEXT NOT NULL DEFAULT 'awaiting_provider',
  annual_discount_applied BOOLEAN NOT NULL DEFAULT false,
  annual_discount_bps INTEGER NOT NULL DEFAULT 0,
  is_prorated BOOLEAN NOT NULL DEFAULT false,
  billable_branch_count INTEGER NOT NULL DEFAULT 0,
  snapshot_key TEXT,
  line_items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  calculation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_billing_invoices_idempotency UNIQUE (idempotency_key),
  CONSTRAINT church_billing_invoices_status_check
    CHECK (status IN ('draft', 'issued', 'void')),
  CONSTRAINT church_billing_invoices_payment_status_check
    CHECK (payment_status IN (
      'not_applicable', 'awaiting_provider', 'pending', 'succeeded', 'failed', 'refunded'
    )),
  CONSTRAINT church_billing_invoices_cadence_check CHECK (cadence IN ('monthly', 'annual'))
);

CREATE INDEX IF NOT EXISTS idx_church_billing_invoices_org
  ON public.church_billing_invoices (organization_id, period_start DESC);

ALTER TABLE public.church_billing_credits
  DROP CONSTRAINT IF EXISTS church_billing_credits_applied_invoice_fk;
ALTER TABLE public.church_billing_credits
  ADD CONSTRAINT church_billing_credits_applied_invoice_fk
  FOREIGN KEY (applied_invoice_id) REFERENCES public.church_billing_invoices (id)
  ON DELETE SET NULL;
