"use strict";

function normalizeIntakeProjectRow(row) {
  if (!row) return row;
  const o = { ...row };
  if (o.intake_auto_allocation_seeded != null) {
    o.intake_auto_allocation_seeded = o.intake_auto_allocation_seeded === true || o.intake_auto_allocation_seeded === 1 ? 1 : 0;
  }
  if (o.intake_auto_allocation_paused != null) {
    o.intake_auto_allocation_paused = o.intake_auto_allocation_paused === true || o.intake_auto_allocation_paused === 1 ? 1 : 0;
  }
  for (const k of ["created_at", "updated_at", "validated_at", "intake_allocation_wave_deadline_at"]) {
    if (o[k] instanceof Date) o[k] = o[k].toISOString().replace("T", " ").slice(0, 19);
  }
  return o;
}

async function getByIdAndTenant(pool, id, tenantId) {
  const r = await pool.query(`SELECT * FROM public.intake_client_projects WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return r.rows[0] ? normalizeIntakeProjectRow(r.rows[0]) : null;
}

async function getIdAndStatus(pool, id, tenantId) {
  const r = await pool.query(`SELECT id, status FROM public.intake_client_projects WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return r.rows[0] ?? null;
}

async function getStatusAndCategory(pool, id, tenantId) {
  const r = await pool.query(
    `SELECT status, intake_category_id FROM public.intake_client_projects WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

async function insertDraftProject(pool, p) {
  const r = await pool.query(
    `INSERT INTO public.intake_client_projects (
      tenant_id, client_id, project_code,
      client_full_name_snapshot, client_phone_snapshot,
      city, neighborhood, street_name, house_number, apartment_number,
      client_address_street, client_address_house_number, client_address_apartment_number,
      estimated_budget_value, estimated_budget_currency, intake_category_id, urgency, status,
      created_by_admin_user_id, updated_by_admin_user_id, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'draft', $18, $18, now())
    RETURNING id`,
    [
      p.tenantId,
      p.clientId,
      p.projectCode,
      p.clientFullNameSnapshot,
      p.clientPhoneSnapshot,
      p.city,
      p.neighborhood,
      p.streetName,
      p.houseNumber,
      p.apartmentNumber,
      p.clientAddressStreet,
      p.clientAddressHouseNumber,
      p.clientAddressApartmentNumber,
      p.estimatedBudgetValue,
      p.estimatedBudgetCurrency,
      p.intakeCategoryId,
      p.urgency,
      p.adminUserId,
    ]
  );
  return Number(r.rows[0].id);
}

async function updateQuickEdit(pool, p) {
  await pool.query(
    `UPDATE public.intake_client_projects SET
      neighborhood = $1, street_name = $2, house_number = $3,
      estimated_budget_value = $4,
      urgency = $5,
      updated_by_admin_user_id = $6, updated_at = now()
     WHERE id = $7 AND tenant_id = $8`,
    [
      p.neighborhood,
      p.streetName,
      p.houseNumber,
      p.budgetVal,
      p.urgency,
      p.adminUserId,
      p.projectId,
      p.tenantId,
    ]
  );
}

async function updatePriceEstimationInternal(pool, p) {
  await pool.query(
    `UPDATE public.intake_client_projects SET
      price_estimation = $1,
      deal_price = $2,
      updated_by_admin_user_id = $3,
      updated_at = now()
     WHERE id = $4 AND tenant_id = $5`,
    [p.priceEstimation, p.dealPrice, p.adminUserId, p.projectId, p.tenantId]
  );
}

async function updateDealValidationStatus(pool, p) {
  const st = String(p.status || "").trim().toLowerCase();
  const pending = st === "pending";
  await pool.query(
    `UPDATE public.intake_client_projects SET
      deal_validation_status = $1,
      validated_by_admin_user_id = CASE WHEN $2 THEN NULL ELSE $3 END,
      validated_at = CASE WHEN $2 THEN NULL ELSE now() END,
      updated_by_admin_user_id = $4,
      updated_at = now()
     WHERE id = $5 AND tenant_id = $6`,
    [st, pending, p.adminUserId, p.adminUserId, p.projectId, p.tenantId]
  );
}

async function updateStatus(pool, p) {
  await pool.query(
    `UPDATE public.intake_client_projects SET status = $1, updated_by_admin_user_id = $2, updated_at = now()
     WHERE id = $3 AND tenant_id = $4`,
    [p.status, p.adminUserId, p.projectId, p.tenantId]
  );
}

async function updatePublished(pool, adminUserId, projectId, tenantId) {
  await pool.query(
    `UPDATE public.intake_client_projects SET status = 'published', updated_by_admin_user_id = $1, updated_at = now()
     WHERE id = $2 AND tenant_id = $3`,
    [adminUserId, projectId, tenantId]
  );
}

async function updateAllocationPaused(pool, projectId, tenantId) {
  await pool.query(
    `UPDATE public.intake_client_projects SET intake_auto_allocation_paused = true WHERE id = $1 AND tenant_id = $2`,
    [projectId, tenantId]
  );
}

/** No category on project: mark seeded + paused (SQLite parity). */
async function markSeededAndPaused(pool, projectId, tenantId) {
  await pool.query(
    `UPDATE public.intake_client_projects SET intake_auto_allocation_seeded = true, intake_auto_allocation_paused = true
     WHERE id = $1 AND tenant_id = $2`,
    [projectId, tenantId]
  );
}

async function updateAllocationSeededPausedNullWave(pool, projectId, tenantId) {
  await pool.query(
    `UPDATE public.intake_client_projects SET
      intake_allocation_wave_deadline_at = NULL,
      intake_allocation_wave_number = 0,
      intake_auto_allocation_seeded = true,
      intake_auto_allocation_paused = true
     WHERE id = $1 AND tenant_id = $2`,
    [projectId, tenantId]
  );
}

async function updateAfterInitialAllocation(pool, p) {
  await pool.query(
    `UPDATE public.intake_client_projects SET
      intake_allocation_wave_deadline_at = $1,
      intake_allocation_wave_number = 1,
      intake_auto_allocation_seeded = true,
      intake_auto_allocation_paused = false
     WHERE id = $2 AND tenant_id = $3`,
    [p.waveDeadlineAt, p.projectId, p.tenantId]
  );
}

async function updateWaveDeadlineAndNumber(pool, p) {
  await pool.query(
    `UPDATE public.intake_client_projects SET intake_allocation_wave_deadline_at = $1, intake_allocation_wave_number = $2
     WHERE id = $3 AND tenant_id = $4`,
    [p.waveDeadlineAt, p.waveNumber, p.projectId, p.tenantId]
  );
}

async function getIntakeAllocationWaveNumber(pool, projectId, tenantId) {
  const r = await pool.query(
    `SELECT intake_allocation_wave_number FROM public.intake_client_projects WHERE id = $1 AND tenant_id = $2`,
    [projectId, tenantId]
  );
  return r.rows[0] ?? null;
}

async function getPausedFlag(pool, projectId, tenantId) {
  const r = await pool.query(
    `SELECT intake_auto_allocation_paused FROM public.intake_client_projects WHERE id = $1 AND tenant_id = $2`,
    [projectId, tenantId]
  );
  if (!r.rows[0]) return null;
  const v = r.rows[0].intake_auto_allocation_paused;
  return { intake_auto_allocation_paused: v === true || v === 1 ? 1 : 0 };
}

async function existsByIdAndTenant(pool, id, tenantId) {
  const r = await pool.query(`SELECT id FROM public.intake_client_projects WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return r.rows.length > 0;
}

async function getDetailWithJoins(pool, projectId, tenantId) {
  const r = await pool.query(
    `SELECT p.*, c.client_code, c.full_name AS client_live_name, c.phone AS client_live_phone, c.external_client_reference,
            cat.name AS intake_category_name,
            COALESCE(NULLIF(trim(v.display_name), ''), v.username, '') AS deal_validated_by_label
     FROM public.intake_client_projects p
     INNER JOIN public.intake_clients c ON c.id = p.client_id AND c.tenant_id = p.tenant_id
     LEFT JOIN public.categories cat ON cat.id = p.intake_category_id AND cat.tenant_id = p.tenant_id
     LEFT JOIN public.admin_users v ON v.id = p.validated_by_admin_user_id
     WHERE p.id = $1 AND p.tenant_id = $2`,
    [projectId, tenantId]
  );
  return r.rows[0] ? normalizeIntakeProjectRow(r.rows[0]) : null;
}

async function getSuccessView(pool, projectId, tenantId) {
  const r = await pool.query(
    `SELECT p.*, c.client_code,
        COALESCE(NULLIF(trim(p.client_full_name_snapshot), ''), c.full_name) AS client_name,
        COALESCE(NULLIF(trim(p.client_phone_snapshot), ''), c.phone) AS client_phone,
        c.external_client_reference
     FROM public.intake_client_projects p
     JOIN public.intake_clients c ON c.id = p.client_id AND c.tenant_id = p.tenant_id
     WHERE p.id = $1 AND p.tenant_id = $2`,
    [projectId, tenantId]
  );
  return r.rows[0] ? normalizeIntakeProjectRow(r.rows[0]) : null;
}

async function listForAdminProjectsPage(pool, tenantId, limit = 400) {
  const r = await pool.query(
    `SELECT
      p.id,
      p.project_code,
      p.client_id,
      c.client_code,
      COALESCE(NULLIF(trim(p.client_full_name_snapshot), ''), c.full_name) AS client_display_name,
      COALESCE(NULLIF(trim(p.client_phone_snapshot), ''), c.phone) AS client_display_phone,
      p.city,
      p.neighborhood,
      p.estimated_budget_value,
      p.estimated_budget_currency,
      p.urgency,
      p.deal_validation_status,
      p.status,
      p.created_at,
      p.updated_at,
      (SELECT COUNT(*)::int FROM public.intake_project_assignments a WHERE a.tenant_id = p.tenant_id AND a.project_id = p.id) AS assignment_count
    FROM public.intake_client_projects p
    INNER JOIN public.intake_clients c ON c.id = p.client_id AND c.tenant_id = p.tenant_id
    WHERE p.tenant_id = $1
    ORDER BY p.created_at DESC
    LIMIT $2`,
    [tenantId, limit]
  );
  return r.rows.map((row) => {
    const o = { ...row };
    for (const k of ["created_at", "updated_at"]) {
      if (o[k] instanceof Date) o[k] = o[k].toISOString().replace("T", " ").slice(0, 19);
    }
    return o;
  });
}

module.exports = {
  normalizeIntakeProjectRow,
  getByIdAndTenant,
  getIdAndStatus,
  getStatusAndCategory,
  insertDraftProject,
  updateQuickEdit,
  updatePriceEstimationInternal,
  updateDealValidationStatus,
  updateStatus,
  updatePublished,
  updateAllocationPaused,
  markSeededAndPaused,
  updateAllocationSeededPausedNullWave,
  updateAfterInitialAllocation,
  updateWaveDeadlineAndNumber,
  getIntakeAllocationWaveNumber,
  getPausedFlag,
  existsByIdAndTenant,
  getDetailWithJoins,
  getSuccessView,
  listForAdminProjectsPage,
};
