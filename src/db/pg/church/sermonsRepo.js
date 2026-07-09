"use strict";

const SERMON_SELECT = `
  SELECT s.*
  FROM public.church_sermons s
`;

function formatSermonDate(row) {
  if (!row || !row.sermon_date) return "";
  const d = row.sermon_date instanceof Date ? row.sermon_date : new Date(row.sermon_date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function sermonIcon(category) {
  const c = String(category || "").toLowerCase();
  if (c.includes("study") || c.includes("bible")) return "menu_book";
  if (c.includes("devotional")) return "auto_stories";
  return "play_circle";
}

function mapPublicSermon(row) {
  return {
    id: row.id,
    title: row.title,
    speaker: row.speaker,
    date: formatSermonDate(row),
    category: row.category || "Sermon",
    description: row.description,
    media_url: row.media_url,
    scripture: row.scripture,
    icon: sermonIcon(row.category),
  };
}

async function createSermonForBranch(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_sermons (
       organization_id, branch_id, title, speaker, sermon_date, description,
       media_url, scripture, category, status, sort_order,
       created_by_admin_id, updated_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11, $12, $12)
     RETURNING id`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.title,
      fields.speaker || "",
      fields.sermon_date || null,
      fields.description || "",
      fields.media_url || null,
      fields.scripture || null,
      fields.category || "Sunday Sermon",
      fields.status || "draft",
      fields.sort_order || 0,
      fields.created_by_admin_id || null,
    ]
  );
  return findSermonByIdForBranch(pool, r.rows[0].id, fields.branch_id);
}

async function findSermonByIdForBranch(pool, sermonId, branchId) {
  const r = await pool.query(
    `${SERMON_SELECT} WHERE s.id = $1 AND s.branch_id = $2 LIMIT 1`,
    [sermonId, branchId]
  );
  return r.rows[0] ?? null;
}

async function listSermonsForBranch(pool, branchId, opts = {}) {
  const status = String(opts.status || "").trim();
  const params = [branchId];
  let where = "WHERE s.branch_id = $1";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND s.status = $${params.length}`;
  }
  const r = await pool.query(
    `${SERMON_SELECT} ${where}
     ORDER BY s.sermon_date DESC NULLS LAST, s.sort_order ASC, s.id DESC`,
    params
  );
  return r.rows;
}

async function listPublicSermonsForBranch(pool, branchId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 24, 1), 100);
  const r = await pool.query(
    `${SERMON_SELECT}
     WHERE s.branch_id = $1 AND s.status = 'published'
     ORDER BY s.sermon_date DESC NULLS LAST, s.sort_order ASC, s.id DESC
     LIMIT $2`,
    [branchId, limit]
  );
  return r.rows.map(mapPublicSermon);
}

async function updateSermonForBranch(pool, sermonId, branchId, update) {
  const r = await pool.query(
    `UPDATE public.church_sermons
     SET title = $1,
         speaker = $2,
         sermon_date = $3::date,
         description = $4,
         media_url = $5,
         scripture = $6,
         category = $7,
         status = $8,
         sort_order = $9,
         updated_by_admin_id = $10,
         updated_at = now()
     WHERE id = $11 AND branch_id = $12
     RETURNING id`,
    [
      update.title,
      update.speaker || "",
      update.sermon_date || null,
      update.description || "",
      update.media_url || null,
      update.scripture || null,
      update.category || "Sunday Sermon",
      update.status || "draft",
      update.sort_order || 0,
      update.updated_by_admin_id || null,
      sermonId,
      branchId,
    ]
  );
  if (!r.rows[0]) return null;
  return findSermonByIdForBranch(pool, sermonId, branchId);
}

async function publishSermonForBranch(pool, sermonId, branchId, adminId) {
  const r = await pool.query(
    `UPDATE public.church_sermons
     SET status = 'published', updated_by_admin_id = $1, updated_at = now()
     WHERE id = $2 AND branch_id = $3
     RETURNING id`,
    [adminId, sermonId, branchId]
  );
  if (!r.rows[0]) return null;
  return findSermonByIdForBranch(pool, sermonId, branchId);
}

async function countSermonsForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count FROM public.church_sermons WHERE branch_id = $1`,
    [branchId]
  );
  return r.rows[0]?.count || 0;
}

module.exports = {
  createSermonForBranch,
  findSermonByIdForBranch,
  listSermonsForBranch,
  listPublicSermonsForBranch,
  updateSermonForBranch,
  publishSermonForBranch,
  countSermonsForBranch,
  mapPublicSermon,
  formatSermonDate,
};
