"use strict";

/**
 * Per-tenant phone rule columns on `public.tenants` (Super Admin–editable).
 */

async function getPhoneRulesByTenantId(pool, tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return null;
  const r = await pool.query(
    `SELECT id, slug,
            phone_strict_validation,
            phone_regex,
            phone_default_country_code,
            phone_normalization_mode
     FROM public.tenants
     WHERE id = $1`,
    [tid]
  );
  return r.rows[0] ?? null;
}

async function updatePhoneRules(pool, tenantId, fields) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return false;
  const u = await pool.query(
    `UPDATE public.tenants SET
      phone_strict_validation = $1,
      phone_regex = $2,
      phone_default_country_code = $3,
      phone_normalization_mode = $4
     WHERE id = $5`,
    [
      Boolean(fields.phone_strict_validation),
      String(fields.phone_regex ?? ""),
      String(fields.phone_default_country_code ?? ""),
      String(fields.phone_normalization_mode ?? "generic_digits"),
      tid,
    ]
  );
  return u.rowCount > 0;
}

module.exports = {
  getPhoneRulesByTenantId,
  updatePhoneRules,
};
