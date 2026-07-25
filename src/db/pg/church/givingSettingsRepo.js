"use strict";

const SELECT_COLUMNS = `
  id, organization_id, branch_id,
  bank_name, account_name, account_number, branch_code, swift_code,
  mobile_money_provider_1, mobile_money_number_1, mobile_money_name_1,
  mobile_money_provider_2, mobile_money_number_2, mobile_money_name_2,
  giving_categories_json, giving_instructions, qr_code_label,
  finance_contact_name, finance_contact_phone,
  status, updated_by_admin_id, created_at, updated_at
`;

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function getGivingSettingsForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
     FROM public.church_giving_settings
     WHERE branch_id = $1
     LIMIT 1`,
    [branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function getPublishedGivingSettingsForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
     FROM public.church_giving_settings
     WHERE branch_id = $1 AND status = 'published'
     LIMIT 1`,
    [branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function upsertGivingSettingsForBranch(pool, branchId, fields) {
  const text = (value) => (value == null ? "" : String(value));
  const optionalText = (value) => (value == null || value === "" ? null : String(value));
  const r = await pool.query(
    `INSERT INTO public.church_giving_settings (
       organization_id, branch_id,
       bank_name, account_name, account_number, branch_code, swift_code,
       mobile_money_provider_1, mobile_money_number_1, mobile_money_name_1,
       mobile_money_provider_2, mobile_money_number_2, mobile_money_name_2,
       giving_categories_json, giving_instructions, qr_code_label,
       finance_contact_name, finance_contact_phone,
       status, updated_by_admin_id
     ) VALUES (
       $1, $2,
       $3, $4, $5, $6, $7,
       $8, $9, $10,
       $11, $12, $13,
       $14::jsonb, $15, $16,
       $17, $18,
       'draft', $19
     )
     ON CONFLICT (branch_id) DO UPDATE SET
       bank_name = EXCLUDED.bank_name,
       account_name = EXCLUDED.account_name,
       account_number = EXCLUDED.account_number,
       branch_code = EXCLUDED.branch_code,
       swift_code = EXCLUDED.swift_code,
       mobile_money_provider_1 = EXCLUDED.mobile_money_provider_1,
       mobile_money_number_1 = EXCLUDED.mobile_money_number_1,
       mobile_money_name_1 = EXCLUDED.mobile_money_name_1,
       mobile_money_provider_2 = EXCLUDED.mobile_money_provider_2,
       mobile_money_number_2 = EXCLUDED.mobile_money_number_2,
       mobile_money_name_2 = EXCLUDED.mobile_money_name_2,
       giving_categories_json = EXCLUDED.giving_categories_json,
       giving_instructions = EXCLUDED.giving_instructions,
       qr_code_label = EXCLUDED.qr_code_label,
       finance_contact_name = EXCLUDED.finance_contact_name,
       finance_contact_phone = EXCLUDED.finance_contact_phone,
       status = 'draft',
       updated_by_admin_id = EXCLUDED.updated_by_admin_id,
       updated_at = now()
     RETURNING ${SELECT_COLUMNS}`,
    [
      fields.organization_id,
      branchId,
      text(fields.bank_name),
      text(fields.account_name),
      text(fields.account_number),
      text(fields.branch_code),
      optionalText(fields.swift_code),
      text(fields.mobile_money_provider_1),
      text(fields.mobile_money_number_1),
      text(fields.mobile_money_name_1),
      optionalText(fields.mobile_money_provider_2),
      optionalText(fields.mobile_money_number_2),
      optionalText(fields.mobile_money_name_2),
      JSON.stringify(fields.giving_categories_json || []),
      text(fields.giving_instructions),
      optionalText(fields.qr_code_label),
      optionalText(fields.finance_contact_name),
      optionalText(fields.finance_contact_phone),
      fields.updated_by_admin_id || null,
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function publishGivingSettingsForBranch(pool, branchId, adminId) {
  const r = await pool.query(
    `UPDATE public.church_giving_settings
     SET status = 'published',
         updated_by_admin_id = $1,
         updated_at = now()
     WHERE branch_id = $2
     RETURNING ${SELECT_COLUMNS}`,
    [adminId, branchId]
  );
  return r.rows[0] ?? null;
}

module.exports = {
  getGivingSettingsForBranch,
  getPublishedGivingSettingsForBranch,
  upsertGivingSettingsForBranch,
  publishGivingSettingsForBranch,
};
