"use strict";

function serializeClientRow(row) {
  if (!row) return row;
  const o = { ...row };
  for (const k of ["created_at", "updated_at", "phone_verified_at"]) {
    if (o[k] instanceof Date) o[k] = o[k].toISOString().replace("T", " ").slice(0, 19);
  }
  return o;
}

/**
 * @param {import("pg").Pool} pool
 */
async function getByIdAndTenant(pool, id, tenantId) {
  const r = await pool.query(`SELECT * FROM public.intake_clients WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return r.rows[0] ? serializeClientRow(r.rows[0]) : null;
}

async function findByPhoneNorm(pool, tenantId, phoneNorm) {
  const r = await pool.query(
    `SELECT * FROM public.intake_clients WHERE tenant_id = $1 AND phone_normalized = $2`,
    [tenantId, phoneNorm]
  );
  return r.rows[0] ? serializeClientRow(r.rows[0]) : null;
}

async function findByNrzNorm(pool, tenantId, nrzNorm) {
  const r = await pool.query(
    `SELECT * FROM public.intake_clients WHERE tenant_id = $1 AND nrz_normalized = $2`,
    [tenantId, nrzNorm]
  );
  return r.rows[0] ? serializeClientRow(r.rows[0]) : null;
}

async function findClientCodeByExtRef(pool, tenantId, extRef) {
  const r = await pool.query(
    `SELECT client_code FROM public.intake_clients WHERE tenant_id = $1 AND external_client_reference = $2 LIMIT 1`,
    [tenantId, extRef]
  );
  return r.rows[0] ?? null;
}

async function getIdByTenantAndClientCode(pool, tenantId, clientCode) {
  const r = await pool.query(
    `SELECT id FROM public.intake_clients WHERE tenant_id = $1 AND client_code = $2`,
    [tenantId, clientCode]
  );
  return r.rows[0] ?? null;
}

/**
 * @returns {Promise<number>} new id
 */
async function insertClient(pool, p) {
  const r = await pool.query(
    `INSERT INTO public.intake_clients (
      tenant_id, client_code, external_client_reference, full_name, phone, phone_normalized, whatsapp_phone,
      nrz_number, nrz_normalized, address_street, address_house_number, address_apartment_number,
      updated_by_admin_user_id, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
    RETURNING id`,
    [
      p.tenantId,
      p.clientCode,
      p.externalClientReference,
      p.fullName,
      p.phone,
      p.phoneNormalized,
      p.whatsappPhone,
      p.nrzNumber,
      p.nrzNormalized,
      p.addressStreet,
      p.addressHouseNumber,
      p.addressApartmentNumber,
      p.updatedByAdminUserId,
    ]
  );
  return Number(r.rows[0].id);
}

async function updateAddressFromProjectForm(pool, p) {
  await pool.query(
    `UPDATE public.intake_clients SET
      address_street = $1, address_house_number = $2, address_apartment_number = $3,
      updated_by_admin_user_id = $4, updated_at = now()
     WHERE id = $5 AND tenant_id = $6`,
    [
      p.street,
      p.houseNumber,
      p.apartmentNumber,
      p.updatedByAdminUserId,
      p.clientId,
      p.tenantId,
    ]
  );
}

async function setPhoneVerified(pool, adminUserId, clientId, tenantId) {
  await pool.query(
    `UPDATE public.intake_clients SET phone_verified_at = now(), updated_by_admin_user_id = $1, updated_at = now()
     WHERE id = $2 AND tenant_id = $3`,
    [adminUserId, clientId, tenantId]
  );
}

module.exports = {
  getByIdAndTenant,
  findByPhoneNorm,
  findByNrzNorm,
  findClientCodeByExtRef,
  getIdByTenantAndClientCode,
  insertClient,
  updateAddressFromProjectForm,
  setPhoneVerified,
  serializeClientRow,
};
