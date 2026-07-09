"use strict";

const SELECT_COLUMNS = `
  id, organization_id, branch_id,
  homepage_hero_title, homepage_hero_subtitle, welcome_message,
  service_times, location_text,
  about_title, about_body, mission_text, vision_text, values_text,
  leadership_json, ministries_json,
  contact_phone, contact_email, office_hours, address, map_embed_placeholder,
  giving_bank_details, giving_mobile_money, giving_categories,
  giving_instructions, giving_qr_placeholder, footer_message,
  status, last_published_at, updated_by_admin_id, created_at, updated_at
`;

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function getWebsiteContentForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
     FROM public.church_branch_website_content
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
async function getPublishedWebsiteContentForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
     FROM public.church_branch_website_content
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
async function upsertWebsiteDraftForBranch(pool, branchId, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_branch_website_content (
       organization_id, branch_id,
       homepage_hero_title, homepage_hero_subtitle, welcome_message,
       service_times, location_text,
       about_title, about_body, mission_text, vision_text, values_text,
       leadership_json, ministries_json,
       contact_phone, contact_email, office_hours, address, map_embed_placeholder,
       giving_bank_details, giving_mobile_money, giving_categories,
       giving_instructions, giving_qr_placeholder, footer_message,
       status, updated_by_admin_id
     ) VALUES (
       $1, $2,
       $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12,
       $13::jsonb, $14::jsonb,
       $15, $16, $17, $18, $19,
       $20, $21, $22, $23, $24, $25,
       'draft', $26
     )
     ON CONFLICT (branch_id) DO UPDATE SET
       homepage_hero_title = EXCLUDED.homepage_hero_title,
       homepage_hero_subtitle = EXCLUDED.homepage_hero_subtitle,
       welcome_message = EXCLUDED.welcome_message,
       service_times = EXCLUDED.service_times,
       location_text = EXCLUDED.location_text,
       about_title = EXCLUDED.about_title,
       about_body = EXCLUDED.about_body,
       mission_text = EXCLUDED.mission_text,
       vision_text = EXCLUDED.vision_text,
       values_text = EXCLUDED.values_text,
       leadership_json = EXCLUDED.leadership_json,
       ministries_json = EXCLUDED.ministries_json,
       contact_phone = EXCLUDED.contact_phone,
       contact_email = EXCLUDED.contact_email,
       office_hours = EXCLUDED.office_hours,
       address = EXCLUDED.address,
       map_embed_placeholder = EXCLUDED.map_embed_placeholder,
       giving_bank_details = EXCLUDED.giving_bank_details,
       giving_mobile_money = EXCLUDED.giving_mobile_money,
       giving_categories = EXCLUDED.giving_categories,
       giving_instructions = EXCLUDED.giving_instructions,
       giving_qr_placeholder = EXCLUDED.giving_qr_placeholder,
       footer_message = EXCLUDED.footer_message,
       status = 'draft',
       updated_by_admin_id = EXCLUDED.updated_by_admin_id,
       updated_at = now()
     RETURNING ${SELECT_COLUMNS}`,
    [
      fields.organization_id,
      branchId,
      fields.homepage_hero_title,
      fields.homepage_hero_subtitle,
      fields.welcome_message,
      fields.service_times,
      fields.location_text,
      fields.about_title,
      fields.about_body,
      fields.mission_text,
      fields.vision_text,
      fields.values_text,
      JSON.stringify(fields.leadership_json || {}),
      JSON.stringify(fields.ministries_json || []),
      fields.contact_phone,
      fields.contact_email,
      fields.office_hours,
      fields.address,
      fields.map_embed_placeholder,
      fields.giving_bank_details,
      fields.giving_mobile_money,
      fields.giving_categories,
      fields.giving_instructions,
      fields.giving_qr_placeholder,
      fields.footer_message,
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
async function publishWebsiteContentForBranch(pool, branchId, adminId) {
  const r = await pool.query(
    `UPDATE public.church_branch_website_content
     SET status = 'published',
         last_published_at = now(),
         updated_by_admin_id = $1,
         updated_at = now()
     WHERE branch_id = $2
     RETURNING ${SELECT_COLUMNS}`,
    [adminId, branchId]
  );
  return r.rows[0] ?? null;
}

module.exports = {
  getWebsiteContentForBranch,
  getPublishedWebsiteContentForBranch,
  upsertWebsiteDraftForBranch,
  publishWebsiteContentForBranch,
};
