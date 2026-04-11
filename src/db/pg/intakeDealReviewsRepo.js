"use strict";

const reviewsRepo = require("./reviewsRepo");

/**
 * @param {object | null} row
 */
function serializeDealReviewRow(row) {
  if (!row) return row;
  const o = { ...row };
  if (o.created_at instanceof Date) {
    o.created_at = o.created_at.toISOString().replace("T", " ").slice(0, 19);
  }
  if (o.rating != null) o.rating = Number(o.rating);
  return o;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} assignmentId
 * @returns {Promise<{ provider: object | null, client: object | null }>}
 */
async function getPairByAssignment(pool, tenantId, assignmentId) {
  const r = await pool.query(
    `SELECT id, tenant_id, project_id, assignment_id, reviewer_role, rating, body, public_review_id, created_at
     FROM public.intake_deal_reviews
     WHERE tenant_id = $1 AND assignment_id = $2`,
    [tenantId, assignmentId]
  );
  const out = { provider: null, client: null };
  for (const row of r.rows) {
    const s = serializeDealReviewRow(row);
    const role = String(row.reviewer_role || "").toLowerCase();
    if (role === "provider") out.provider = s;
    if (role === "client") out.client = s;
  }
  return out;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} projectId
 */
async function listForProject(pool, tenantId, projectId) {
  const r = await pool.query(
    `
    SELECT r.id, r.assignment_id, r.reviewer_role, r.rating, r.body, r.created_at,
           a.company_id,
           c.name AS company_name,
           c.subdomain AS company_subdomain
    FROM public.intake_deal_reviews r
    INNER JOIN public.intake_project_assignments a
      ON a.id = r.assignment_id AND a.tenant_id = r.tenant_id
    INNER JOIN public.companies c ON c.id = a.company_id AND c.tenant_id = a.tenant_id
    WHERE r.tenant_id = $1 AND r.project_id = $2
    ORDER BY r.assignment_id, r.reviewer_role
    `,
    [tenantId, projectId]
  );
  return r.rows.map((row) => {
    const o = { ...row };
    if (o.created_at instanceof Date) {
      o.created_at = o.created_at.toISOString().replace("T", " ").slice(0, 19);
    }
    if (o.rating != null) o.rating = Number(o.rating);
    return o;
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} projectId
 */
async function listInterestedAssignmentsWithCompany(pool, tenantId, projectId) {
  const r = await pool.query(
    `
    SELECT a.id AS assignment_id, a.company_id, c.name AS company_name, c.subdomain AS company_subdomain
    FROM public.intake_project_assignments a
    INNER JOIN public.companies c ON c.id = a.company_id AND c.tenant_id = a.tenant_id
    WHERE a.tenant_id = $1 AND a.project_id = $2 AND lower(trim(a.status)) = 'interested'
    ORDER BY a.id
    `,
    [tenantId, projectId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} p
 */
async function insertProviderReview(pool, p) {
  const tid = Number(p.tenantId);
  const aid = Number(p.assignmentId);
  const cid = Number(p.companyId);
  const rating = clampRating(p.rating);
  const body = String(p.body || "").trim().slice(0, 4000);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await client.query(
      `
      SELECT a.id AS assignment_id, a.company_id, lower(trim(a.status)) AS ast,
             lower(trim(p.status)) AS pst, p.id AS project_id
      FROM public.intake_project_assignments a
      INNER JOIN public.intake_client_projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
      WHERE a.id = $1 AND a.tenant_id = $2 AND a.company_id = $3
      FOR UPDATE
      `,
      [aid, tid, cid]
    );
    const R = row.rows[0];
    if (!R) {
      await client.query("ROLLBACK");
      return { ok: false, code: "not_found" };
    }
    if (R.ast !== "interested" || R.pst !== "closed") {
      await client.query("ROLLBACK");
      return { ok: false, code: "not_eligible" };
    }
    await client.query(
      `
      INSERT INTO public.intake_deal_reviews (tenant_id, project_id, assignment_id, reviewer_role, rating, body)
      VALUES ($1, $2, $3, 'provider', $4, $5)
      `,
      [tid, R.project_id, aid, rating, body]
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    if (e && e.code === "23505") {
      return { ok: false, code: "duplicate" };
    }
    throw e;
  } finally {
    client.release();
  }
}

function clampRating(raw) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, n));
}

function authorNameFromClientFullName(fullName) {
  const s = String(fullName || "").trim();
  if (!s) return "Verified customer";
  const first = s.split(/\s+/)[0];
  return first.slice(0, 80) || "Verified customer";
}

/**
 * Client rates provider: stores intake row + public.reviews for directory stats.
 * @param {import("pg").Pool} pool
 * @param {object} p
 */
async function insertClientReview(pool, p) {
  const tid = Number(p.tenantId);
  const aid = Number(p.assignmentId);
  const clientId = Number(p.clientId);
  const rating = clampRating(p.rating);
  const body = String(p.body || "").trim().slice(0, 4000);

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const row = await db.query(
      `
      SELECT a.id AS assignment_id, a.company_id, lower(trim(a.status)) AS ast,
             lower(trim(pr.status)) AS pst, pr.id AS project_id, pr.client_id
      FROM public.intake_project_assignments a
      INNER JOIN public.intake_client_projects pr ON pr.id = a.project_id AND pr.tenant_id = a.tenant_id
      WHERE a.id = $1 AND a.tenant_id = $2
      FOR UPDATE
      `,
      [aid, tid]
    );
    const R = row.rows[0];
    if (!R) {
      await db.query("ROLLBACK");
      return { ok: false, code: "not_found" };
    }
    if (Number(R.client_id) !== clientId) {
      await db.query("ROLLBACK");
      return { ok: false, code: "client_mismatch" };
    }
    if (R.ast !== "interested" || R.pst !== "closed") {
      await db.query("ROLLBACK");
      return { ok: false, code: "not_eligible" };
    }
    const authorName = authorNameFromClientFullName(p.clientFullName);
    const publicId = await reviewsRepo.insertOne(db, {
      companyId: Number(R.company_id),
      rating,
      body,
      authorName,
    });
    await db.query(
      `
      INSERT INTO public.intake_deal_reviews (tenant_id, project_id, assignment_id, reviewer_role, rating, body, public_review_id)
      VALUES ($1, $2, $3, 'client', $4, $5, $6)
      `,
      [tid, R.project_id, aid, rating, body, publicId]
    );
    await db.query("COMMIT");
    return { ok: true };
  } catch (e) {
    try {
      await db.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    if (e && e.code === "23505") {
      return { ok: false, code: "duplicate" };
    }
    throw e;
  } finally {
    db.release();
  }
}

/**
 * Validates client identity + closed project + interested assignment for public review form.
 * @returns {Promise<{ ok: boolean, code?: string, projectId?: number, clientId?: number, assignmentId?: number, clientFullName?: string, interestedRows?: object[] }>}
 */
async function resolveClientReviewContext(pool, { tenantId, projectCode, phoneNormalized, assignmentId }) {
  const tid = Number(tenantId);
  const code = String(projectCode || "").trim();
  const pnorm = String(phoneNormalized || "").replace(/\D/g, "");
  if (!code || !pnorm) return { ok: false, code: "missing" };

  const pr = await pool.query(
    `
    SELECT p.id, p.client_id, lower(trim(p.status)) AS pst
    FROM public.intake_client_projects p
    WHERE p.tenant_id = $1 AND upper(trim(p.project_code)) = upper(trim($2))
    `,
    [tid, code]
  );
  const proj = pr.rows[0];
  if (!proj) return { ok: false, code: "not_found" };
  if (proj.pst !== "closed") return { ok: false, code: "not_eligible" };

  const cr = await pool.query(
    `SELECT id, full_name FROM public.intake_clients WHERE id = $1 AND tenant_id = $2 AND phone_normalized = $3`,
    [proj.client_id, tid, pnorm]
  );
  const clientRow = cr.rows[0];
  if (!clientRow) return { ok: false, code: "phone_mismatch" };

  const interested = await listInterestedAssignmentsWithCompany(pool, tid, proj.id);
  if (!interested.length) return { ok: false, code: "no_interested" };

  let aid = assignmentId != null && Number(assignmentId) > 0 ? Number(assignmentId) : null;
  if (interested.length === 1) {
    aid = Number(interested[0].assignment_id);
  } else if (!aid) {
    return { ok: false, code: "pick_provider", interestedRows: interested };
  }
  const allowed = interested.some((r) => Number(r.assignment_id) === aid);
  if (!allowed) return { ok: false, code: "bad_assignment" };

  return {
    ok: true,
    projectId: proj.id,
    clientId: clientRow.id,
    assignmentId: aid,
    clientFullName: clientRow.full_name || "",
    interestedRows: interested,
  };
}

module.exports = {
  getPairByAssignment,
  listForProject,
  listInterestedAssignmentsWithCompany,
  insertProviderReview,
  insertClientReview,
  serializeDealReviewRow,
  resolveClientReviewContext,
};
