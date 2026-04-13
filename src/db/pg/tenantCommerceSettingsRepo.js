"use strict";

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function getByTenantId(pool, tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return null;
  const r = await pool.query(
    `SELECT tenant_id, currency, currency_name, currency_symbol, deal_price_percentage, minimum_credit_balance, starting_credit_balance,
            minimum_review_rating, field_agent_sp_commission_percent, field_agent_ec_commission_percent,
            field_agent_sp_high_rating_bonus_percent, field_agent_sp_rating_low_threshold, field_agent_sp_rating_high_threshold, updated_at
     FROM public.tenant_commerce_settings
     WHERE tenant_id = $1`,
    [tid]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {{
 *   currency?: string,
 *   currency_name?: string,
 *   currency_symbol?: string,
 *   deal_price_percentage?: number,
 *   minimum_credit_balance?: number,
 *   starting_credit_balance?: number,
 *   minimum_review_rating?: number,
 *   field_agent_sp_commission_percent?: number | null,
 *   field_agent_ec_commission_percent?: number | null,
 *   field_agent_sp_high_rating_bonus_percent?: number | null,
 *   field_agent_sp_rating_low_threshold?: number | null,
 *   field_agent_sp_rating_high_threshold?: number | null,
 * }} patch
 */
async function upsert(pool, tenantId, patch) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return false;
  const currency = patch.currency != null ? String(patch.currency).trim().slice(0, 12) : "ZMW";
  const currency_name = patch.currency_name != null ? String(patch.currency_name).trim().slice(0, 80) : "";
  const currency_symbol = patch.currency_symbol != null ? String(patch.currency_symbol).trim().slice(0, 16) : "";
  const deal_price_percentage =
    patch.deal_price_percentage != null && Number.isFinite(Number(patch.deal_price_percentage))
      ? Number(patch.deal_price_percentage)
      : 3;
  const minimum_credit_balance =
    patch.minimum_credit_balance != null && Number.isFinite(Number(patch.minimum_credit_balance))
      ? Number(patch.minimum_credit_balance)
      : 0;
  const starting_credit_balance =
    patch.starting_credit_balance != null && Number.isFinite(Number(patch.starting_credit_balance))
      ? Number(patch.starting_credit_balance)
      : 250;
  const minimum_review_rating =
    patch.minimum_review_rating != null && Number.isFinite(Number(patch.minimum_review_rating))
      ? Number(patch.minimum_review_rating)
      : 3;

  const needExistingRow =
    !Object.prototype.hasOwnProperty.call(patch, "field_agent_sp_commission_percent") ||
    !Object.prototype.hasOwnProperty.call(patch, "field_agent_ec_commission_percent") ||
    !Object.prototype.hasOwnProperty.call(patch, "field_agent_sp_high_rating_bonus_percent") ||
    !Object.prototype.hasOwnProperty.call(patch, "field_agent_sp_rating_low_threshold") ||
    !Object.prototype.hasOwnProperty.call(patch, "field_agent_sp_rating_high_threshold");
  const existingRow = needExistingRow ? await getByTenantId(pool, tid) : null;

  let field_agent_sp_commission_percent = null;
  if (Object.prototype.hasOwnProperty.call(patch, "field_agent_sp_commission_percent")) {
    const raw = patch.field_agent_sp_commission_percent;
    if (raw === null || raw === undefined) {
      field_agent_sp_commission_percent = null;
    } else if (typeof raw === "string" && String(raw).trim() === "") {
      field_agent_sp_commission_percent = null;
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        throw new Error("Field agent SP commission percent must be between 0 and 100, or empty.");
      }
      field_agent_sp_commission_percent = n;
    }
  } else {
    const v = existingRow && existingRow.field_agent_sp_commission_percent;
    if (v != null && v !== "" && Number.isFinite(Number(v))) {
      field_agent_sp_commission_percent = Number(v);
    }
  }

  let field_agent_ec_commission_percent = null;
  if (Object.prototype.hasOwnProperty.call(patch, "field_agent_ec_commission_percent")) {
    const rawEc = patch.field_agent_ec_commission_percent;
    if (rawEc === null || rawEc === undefined) {
      field_agent_ec_commission_percent = null;
    } else if (typeof rawEc === "string" && String(rawEc).trim() === "") {
      field_agent_ec_commission_percent = null;
    } else {
      const n = Number(rawEc);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        throw new Error("Field agent EC commission percent must be between 0 and 100, or empty.");
      }
      field_agent_ec_commission_percent = n;
    }
  } else {
    const ve = existingRow && existingRow.field_agent_ec_commission_percent;
    if (ve != null && ve !== "" && Number.isFinite(Number(ve))) {
      field_agent_ec_commission_percent = Number(ve);
    }
  }

  let field_agent_sp_high_rating_bonus_percent = null;
  if (Object.prototype.hasOwnProperty.call(patch, "field_agent_sp_high_rating_bonus_percent")) {
    const rawBr = patch.field_agent_sp_high_rating_bonus_percent;
    if (rawBr === null || rawBr === undefined) {
      field_agent_sp_high_rating_bonus_percent = null;
    } else if (typeof rawBr === "string" && String(rawBr).trim() === "") {
      field_agent_sp_high_rating_bonus_percent = null;
    } else {
      const n = Number(rawBr);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        throw new Error("Field agent SP high-rating bonus percent must be between 0 and 100, or empty.");
      }
      field_agent_sp_high_rating_bonus_percent = n;
    }
  } else {
    const vb = existingRow && existingRow.field_agent_sp_high_rating_bonus_percent;
    if (vb != null && vb !== "" && Number.isFinite(Number(vb))) {
      field_agent_sp_high_rating_bonus_percent = Number(vb);
    }
  }

  let field_agent_sp_rating_low_threshold = null;
  if (Object.prototype.hasOwnProperty.call(patch, "field_agent_sp_rating_low_threshold")) {
    const rawL = patch.field_agent_sp_rating_low_threshold;
    if (rawL === null || rawL === undefined) {
      field_agent_sp_rating_low_threshold = null;
    } else if (typeof rawL === "string" && String(rawL).trim() === "") {
      field_agent_sp_rating_low_threshold = null;
    } else {
      const n = Number(rawL);
      if (!Number.isFinite(n) || n < 0 || n > 5) {
        throw new Error("Field agent SP low rating threshold must be between 0 and 5, or empty.");
      }
      field_agent_sp_rating_low_threshold = n;
    }
  } else {
    const vl = existingRow && existingRow.field_agent_sp_rating_low_threshold;
    if (vl != null && vl !== "" && Number.isFinite(Number(vl))) {
      field_agent_sp_rating_low_threshold = Number(vl);
    }
  }

  let field_agent_sp_rating_high_threshold = null;
  if (Object.prototype.hasOwnProperty.call(patch, "field_agent_sp_rating_high_threshold")) {
    const rawH = patch.field_agent_sp_rating_high_threshold;
    if (rawH === null || rawH === undefined) {
      field_agent_sp_rating_high_threshold = null;
    } else if (typeof rawH === "string" && String(rawH).trim() === "") {
      field_agent_sp_rating_high_threshold = null;
    } else {
      const n = Number(rawH);
      if (!Number.isFinite(n) || n < 0 || n > 5) {
        throw new Error("Field agent SP high rating threshold must be between 0 and 5, or empty.");
      }
      field_agent_sp_rating_high_threshold = n;
    }
  } else {
    const vh = existingRow && existingRow.field_agent_sp_rating_high_threshold;
    if (vh != null && vh !== "" && Number.isFinite(Number(vh))) {
      field_agent_sp_rating_high_threshold = Number(vh);
    }
  }

  if (
    field_agent_sp_rating_low_threshold != null &&
    field_agent_sp_rating_high_threshold != null &&
    field_agent_sp_rating_high_threshold < field_agent_sp_rating_low_threshold
  ) {
    throw new Error("Field agent SP high rating threshold must be greater than or equal to the low threshold.");
  }

  await pool.query(
    `INSERT INTO public.tenant_commerce_settings
      (tenant_id, currency, currency_name, currency_symbol, deal_price_percentage, minimum_credit_balance, starting_credit_balance, minimum_review_rating,
       field_agent_sp_commission_percent, field_agent_ec_commission_percent, field_agent_sp_high_rating_bonus_percent,
       field_agent_sp_rating_low_threshold, field_agent_sp_rating_high_threshold, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
     ON CONFLICT (tenant_id) DO UPDATE SET
       currency = EXCLUDED.currency,
       currency_name = EXCLUDED.currency_name,
       currency_symbol = EXCLUDED.currency_symbol,
       deal_price_percentage = EXCLUDED.deal_price_percentage,
       minimum_credit_balance = EXCLUDED.minimum_credit_balance,
       starting_credit_balance = EXCLUDED.starting_credit_balance,
       minimum_review_rating = EXCLUDED.minimum_review_rating,
       field_agent_sp_commission_percent = EXCLUDED.field_agent_sp_commission_percent,
       field_agent_ec_commission_percent = EXCLUDED.field_agent_ec_commission_percent,
       field_agent_sp_high_rating_bonus_percent = EXCLUDED.field_agent_sp_high_rating_bonus_percent,
       field_agent_sp_rating_low_threshold = EXCLUDED.field_agent_sp_rating_low_threshold,
       field_agent_sp_rating_high_threshold = EXCLUDED.field_agent_sp_rating_high_threshold,
       updated_at = now()`,
    [
      tid,
      currency,
      currency_name,
      currency_symbol,
      deal_price_percentage,
      minimum_credit_balance,
      starting_credit_balance,
      minimum_review_rating,
      field_agent_sp_commission_percent,
      field_agent_ec_commission_percent,
      field_agent_sp_high_rating_bonus_percent,
      field_agent_sp_rating_low_threshold,
      field_agent_sp_rating_high_threshold,
    ]
  );
  return true;
}

module.exports = {
  getByTenantId,
  upsert,
};
