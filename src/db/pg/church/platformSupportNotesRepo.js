"use strict";

const auditLogsRepo = require("./auditLogsRepo");
const organizationsRepo = require("./organizationsRepo");
const platformProvisioningRepo = require("./platformProvisioningRepo");
const platformMemberSupportRepo = require("./platformMemberSupportRepo");
const { notePreview } = require("../../../church/platformSupportNotesValidation");
const { shouldApplyQueryFilter } = require("../../../church/platformSupportNotesSearchValidation");

const NOTE_SELECT = `
  SELECT n.*,
         u.username AS created_by_username,
         u.display_name AS created_by_display_name
  FROM public.church_platform_support_notes n
  LEFT JOIN public.admin_users u ON u.id = n.created_by_platform_admin_id
`;

const NOTE_LIST_FROM = `
  FROM public.church_platform_support_notes n
  LEFT JOIN public.admin_users u ON u.id = n.created_by_platform_admin_id
  LEFT JOIN public.church_organizations o ON o.id = n.organization_id
  LEFT JOIN public.church_branches b ON b.id = n.branch_id
  LEFT JOIN public.church_organizations o_ent
    ON n.entity_type = 'organization' AND o_ent.id = n.entity_id
  LEFT JOIN public.church_branches b_ent
    ON n.entity_type = 'branch' AND b_ent.id = n.entity_id
  LEFT JOIN public.church_hq_admins ha
    ON n.entity_type = 'hq_admin' AND ha.id = n.entity_id
  LEFT JOIN public.church_branch_admins ba
    ON n.entity_type = 'branch_admin' AND ba.id = n.entity_id
  LEFT JOIN public.church_members m
    ON n.entity_type = 'member' AND m.id = n.entity_id
  LEFT JOIN public.church_ministry_leaders ml_ent
    ON n.entity_type = 'ministry_leader' AND ml_ent.id = n.entity_id
`;

const NOTE_LIST_SELECT = `
  SELECT n.*,
         u.username AS created_by_username,
         u.display_name AS created_by_display_name,
         o.name AS organization_name,
         b.name AS branch_name,
         CASE
           WHEN n.entity_type = 'organization' THEN o_ent.name
           WHEN n.entity_type = 'branch' THEN b_ent.name
           WHEN n.entity_type = 'hq_admin' THEN ha.full_name
           WHEN n.entity_type = 'branch_admin' THEN ba.full_name
           WHEN n.entity_type = 'member' THEN m.full_name
           WHEN n.entity_type = 'ministry_leader' THEN ml_ent.full_name
           ELSE NULL
         END AS entity_label
  ${NOTE_LIST_FROM}
`;

function mapNoteRow(row) {
  if (!row) return row;
  const displayName = String(row.created_by_display_name || "").trim();
  const username = String(row.created_by_username || "").trim();
  return {
    id: row.id,
    organization_id: row.organization_id,
    branch_id: row.branch_id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    note_body: row.note_body,
    visibility: row.visibility,
    created_by_platform_admin_id: row.created_by_platform_admin_id,
    created_by_label: displayName || username || (row.created_by_platform_admin_id ? `Admin #${row.created_by_platform_admin_id}` : "Platform admin"),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function defaultReturnToForEntity(resolved) {
  return buildSupportNoteEntityLink(resolved);
}

function buildSupportNoteEntityLink(note) {
  if (!note) return "/admin/church";
  switch (note.entity_type) {
    case "organization":
      return `/admin/church/organizations/${note.entity_id}`;
    case "branch":
      return `/admin/church/branches/${note.entity_id}`;
    case "hq_admin":
      return `/admin/church/organizations/${note.organization_id}/hq-admins/${note.entity_id}`;
    case "branch_admin":
      return `/admin/church/branches/${note.branch_id}/admins/${note.entity_id}`;
    case "member":
      return `/admin/church/members/${note.entity_id}`;
    case "ministry_leader":
      return `/admin/church/ministry-leaders/${note.entity_id}`;
    default:
      return "/admin/church";
  }
}

function mapListNoteRow(row) {
  const base = mapNoteRow(row);
  return {
    ...base,
    organization_name: row.organization_name || null,
    branch_name: row.branch_name || null,
    entity_label: row.entity_label || `${row.entity_type} #${row.entity_id}`,
    entity_link: buildSupportNoteEntityLink(row),
    note_preview: notePreview(row.note_body),
  };
}

function buildSearchWhere(filters, params) {
  const clauses = [];

  if (filters.q && shouldApplyQueryFilter(filters.q)) {
    params.push(`%${filters.q}%`);
    clauses.push(`n.note_body ILIKE $${params.length}`);
  }
  if (filters.entity_type && filters.entity_type !== "all") {
    params.push(filters.entity_type);
    clauses.push(`n.entity_type = $${params.length}`);
  }
  if (filters.organization_id) {
    params.push(filters.organization_id);
    clauses.push(`n.organization_id = $${params.length}`);
  }
  if (filters.branch_id) {
    params.push(filters.branch_id);
    clauses.push(`n.branch_id = $${params.length}`);
  }
  if (filters.created_by_platform_admin_id) {
    params.push(filters.created_by_platform_admin_id);
    clauses.push(`n.created_by_platform_admin_id = $${params.length}`);
  }
  if (filters.date_from) {
    params.push(filters.date_from);
    clauses.push(`n.created_at >= $${params.length}::date`);
  }
  if (filters.date_to) {
    params.push(filters.date_to);
    clauses.push(`n.created_at < ($${params.length}::date + interval '1 day')`);
  }

  return clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} entityType
 * @param {number} entityId
 * @returns {Promise<object | null>}
 */
async function resolveSupportNoteEntity(pool, entityType, entityId) {
  const id = Number(entityId);
  if (!Number.isFinite(id) || id <= 0) return null;

  switch (entityType) {
    case "organization": {
      const org = await organizationsRepo.findOrganizationByIdForPlatform(pool, id);
      if (!org) return null;
      return {
        entity_type: entityType,
        entity_id: id,
        organization_id: org.id,
        branch_id: null,
        entity_label: org.name,
      };
    }
    case "branch": {
      const branch = await platformProvisioningRepo.findChurchBranchById(pool, id);
      if (!branch) return null;
      return {
        entity_type: entityType,
        entity_id: id,
        organization_id: branch.organization_id,
        branch_id: branch.id,
        entity_label: branch.name,
      };
    }
    case "hq_admin": {
      const r = await pool.query(
        `SELECT ha.id, ha.full_name, ha.organization_id, o.name AS organization_name
         FROM public.church_hq_admins ha
         INNER JOIN public.church_organizations o ON o.id = ha.organization_id
         WHERE ha.id = $1
         LIMIT 1`,
        [id]
      );
      const row = r.rows[0];
      if (!row) return null;
      return {
        entity_type: entityType,
        entity_id: id,
        organization_id: row.organization_id,
        branch_id: null,
        entity_label: row.full_name,
      };
    }
    case "branch_admin": {
      const r = await pool.query(
        `SELECT ba.id, ba.full_name, ba.organization_id, ba.branch_id,
                b.name AS branch_name
         FROM public.church_branch_admins ba
         INNER JOIN public.church_branches b ON b.id = ba.branch_id
         WHERE ba.id = $1
         LIMIT 1`,
        [id]
      );
      const row = r.rows[0];
      if (!row) return null;
      return {
        entity_type: entityType,
        entity_id: id,
        organization_id: row.organization_id,
        branch_id: row.branch_id,
        entity_label: row.full_name,
      };
    }
    case "member": {
      const member = await platformMemberSupportRepo.findMemberForPlatformAction(pool, id);
      if (!member) return null;
      return {
        entity_type: entityType,
        entity_id: id,
        organization_id: member.organization_id,
        branch_id: member.branch_id,
        entity_label: member.full_name,
      };
    }
    case "ministry_leader": {
      const r = await pool.query(
        `SELECT l.id, l.full_name, l.organization_id, l.branch_id
         FROM public.church_ministry_leaders l
         WHERE l.id = $1
         LIMIT 1`,
        [id]
      );
      const row = r.rows[0];
      if (!row) return null;
      return {
        entity_type: entityType,
        entity_id: id,
        organization_id: row.organization_id,
        branch_id: row.branch_id,
        entity_label: row.full_name,
      };
    }
    default:
      return null;
  }
}

async function recordSupportNoteAudit(client, entry) {
  await auditLogsRepo.insertAuditLog(client, {
    organization_id: entry.organizationId ?? null,
    branch_id: entry.branchId ?? null,
    actor_type: "platform_admin",
    actor_id: entry.platformAdminId ?? null,
    actor_label: "Platform admin",
    action: "platform_support_note_added",
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    target_label: entry.entityLabel,
    metadata_json: {
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      organization_id: entry.organizationId ?? null,
      branch_id: entry.branchId ?? null,
      note_preview: notePreview(entry.noteBody),
      action_source: "platform_support_notes",
    },
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @param {number | null} platformAdminId
 */
async function createSupportNote(pool, fields, platformAdminId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const resolved = await resolveSupportNoteEntity(client, fields.entity_type, fields.entity_id);
    if (!resolved) {
      throw Object.assign(new Error("Entity not found."), { code: "NOT_FOUND" });
    }

    const noteBody = String(fields.note_body || "").trim().slice(0, 2000);
    const r = await client.query(
      `INSERT INTO public.church_platform_support_notes (
         organization_id, branch_id, entity_type, entity_id, note_body,
         visibility, created_by_platform_admin_id
       ) VALUES ($1, $2, $3, $4, $5, 'platform_only', $6)
       RETURNING *`,
      [
        resolved.organization_id,
        resolved.branch_id,
        resolved.entity_type,
        resolved.entity_id,
        noteBody,
        platformAdminId || null,
      ]
    );
    const note = mapNoteRow(r.rows[0]);

    await recordSupportNoteAudit(client, {
      organizationId: resolved.organization_id,
      branchId: resolved.branch_id,
      entityType: resolved.entity_type,
      entityId: resolved.entity_id,
      entityLabel: resolved.entity_label,
      noteBody,
      platformAdminId,
    });

    await client.query("COMMIT");
    return { note, resolved };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} entityType
 * @param {number} entityId
 * @param {{ limit?: number }} [opts]
 */
async function listSupportNotesForEntity(pool, entityType, entityId, opts = {}) {
  const id = Number(entityId);
  if (!Number.isFinite(id) || id <= 0) return [];
  let limit = Number(opts.limit);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  if (limit > 50) limit = 50;

  const r = await pool.query(
    `${NOTE_SELECT}
     WHERE n.entity_type = $1 AND n.entity_id = $2
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT $3`,
    [entityType, id, limit]
  );
  return r.rows.map(mapNoteRow);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ limit?: number }} [opts]
 */
async function listRecentSupportNotesForOrganization(pool, organizationId, opts = {}) {
  const id = Number(organizationId);
  if (!Number.isFinite(id) || id <= 0) return [];
  let limit = Number(opts.limit);
  if (!Number.isFinite(limit) || limit < 1) limit = 10;
  if (limit > 50) limit = 50;

  const r = await pool.query(
    `${NOTE_SELECT}
     WHERE n.organization_id = $1
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT $2`,
    [id, limit]
  );
  return r.rows.map(mapNoteRow);
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} entityType
 * @param {number} entityId
 */
async function countSupportNotesForEntity(pool, entityType, entityId) {
  const id = Number(entityId);
  if (!Number.isFinite(id) || id <= 0) return 0;
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_platform_support_notes
     WHERE entity_type = $1 AND entity_id = $2`,
    [entityType, id]
  );
  return r.rows[0]?.count ?? 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {Array<{ entity_type: string, entity_id: number }>} entities
 * @returns {Promise<Record<string, number>>}
 */
async function countSupportNotesByEntity(pool, entities) {
  if (!entities || entities.length === 0) return {};
  const params = [];
  const tuples = [];
  for (const entity of entities) {
    params.push(entity.entity_type, entity.entity_id);
    tuples.push(`($${params.length - 1}, $${params.length})`);
  }
  const r = await pool.query(
    `SELECT entity_type, entity_id, COUNT(*)::int AS count
     FROM public.church_platform_support_notes
     WHERE (entity_type, entity_id) IN (${tuples.join(", ")})
     GROUP BY entity_type, entity_id`,
    params
  );
  const map = {};
  for (const row of r.rows) {
    map[`${row.entity_type}:${row.entity_id}`] = row.count;
  }
  return map;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} filters
 */
async function countSupportNotes(pool, filters = {}) {
  const params = [];
  const where = buildSearchWhere(filters, params);
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_platform_support_notes n
     ${where}`,
    params
  );
  return r.rows[0]?.count ?? 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} filters
 */
async function listSupportNotes(pool, filters = {}) {
  return searchSupportNotes(pool, filters);
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} filters
 */
async function searchSupportNotes(pool, filters = {}) {
  const page = Number(filters.page) > 0 ? Number(filters.page) : 1;
  let limit = Number(filters.limit);
  if (!Number.isFinite(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;
  const offset = (page - 1) * limit;

  const params = [];
  const where = buildSearchWhere(filters, params);
  params.push(limit, offset);

  const [itemsResult, total] = await Promise.all([
    pool.query(
      `${NOTE_LIST_SELECT}
       ${where}
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
    countSupportNotes(pool, filters),
  ]);

  return {
    items: itemsResult.rows.map(mapListNoteRow),
    total,
    page,
    limit,
    totalPages: total > 0 ? Math.ceil(total / limit) : 0,
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ limit?: number }} [opts]
 */
async function listRecentSupportNotes(pool, opts = {}) {
  let limit = Number(opts.limit);
  if (!Number.isFinite(limit) || limit < 1) limit = 5;
  if (limit > 50) limit = 50;

  const r = await pool.query(
    `${NOTE_LIST_SELECT}
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT $1`,
    [limit]
  );
  return r.rows.map(mapListNoteRow);
}

module.exports = {
  resolveSupportNoteEntity,
  defaultReturnToForEntity,
  buildSupportNoteEntityLink,
  createSupportNote,
  listSupportNotesForEntity,
  listRecentSupportNotesForOrganization,
  countSupportNotesForEntity,
  countSupportNotesByEntity,
  listSupportNotes,
  searchSupportNotes,
  countSupportNotes,
  listRecentSupportNotes,
};
