-- Round-robin FIFO pointer for automatic CRM task assignment to CSR users (per tenant).
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.crm_csr_fifo_state (
  tenant_id INTEGER PRIMARY KEY REFERENCES public.tenants (id) ON DELETE CASCADE,
  last_assigned_admin_user_id INTEGER REFERENCES public.admin_users (id)
);
