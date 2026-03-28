/**
 * Tenant-scoped intake project status list: server-side sort/filter (whitelisted only)
 * and conservative pagination.
 */

const SORT_MAP = {
  project_code: "p.project_code",
  city: "p.city",
  estimated_budget_value: "p.estimated_budget_value",
  status: "p.status",
  created_at: "p.created_at",
  updated_at: "p.updated_at",
};

const ASSIGNMENT_STATUS_FILTER = new Set(["pending", "interested", "declined", "callback_requested"]);

const PAGE_SIZE = 50;
const MAX_PAGE = 500;

function escapeLike(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * @param {number} tenantId
 * @param {Record<string, string | undefined>} q raw req.query
 */
function buildIntakeProjectStatusQueryParts(tenantId, q) {
  const tid = Number(tenantId);
  const sortKey = SORT_MAP[q.sort] ? q.sort : "created_at";
  const dir = String(q.dir || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const orderCol = SORT_MAP[sortKey];

  const params = [tid];
  const where = ["p.tenant_id = ?"];

  const qtext = String(q.q || "").trim();
  if (qtext) {
    const esc = escapeLike(qtext);
    const like = `%${esc}%`;
    where.push("(p.project_code LIKE ? ESCAPE '\\' OR c.client_code LIKE ? ESCAPE '\\')");
    params.push(like, like);
  }

  const projectStatus = String(q.project_status || "").trim().toLowerCase();
  if (projectStatus) {
    where.push("lower(trim(p.status)) = ?");
    params.push(projectStatus);
  }

  const city = String(q.city || "").trim();
  if (city) {
    where.push("trim(p.city) = ?");
    params.push(city);
  }

  const asg = String(q.assignment_status || "").trim().toLowerCase();
  if (asg && ASSIGNMENT_STATUS_FILTER.has(asg)) {
    where.push(
      `EXISTS (SELECT 1 FROM intake_project_assignments a0 WHERE a0.project_id = p.id AND a0.tenant_id = p.tenant_id AND lower(trim(a0.status)) = ?)`
    );
    params.push(asg);
  }

  const companyId = Number(q.company_id);
  if (companyId > 0) {
    where.push(
      `EXISTS (SELECT 1 FROM intake_project_assignments a1 WHERE a1.project_id = p.id AND a1.tenant_id = p.tenant_id AND a1.company_id = ?)`
    );
    params.push(companyId);
  }

  const df = String(q.date_from || "").trim();
  if (df) {
    where.push(`date(p.created_at) >= date(?)`);
    params.push(df);
  }
  const dt = String(q.date_to || "").trim();
  if (dt) {
    where.push(`date(p.created_at) <= date(?)`);
    params.push(dt);
  }

  const whereSql = where.join(" AND ");

  const filters = {
    q: qtext,
    project_status: projectStatus,
    assignment_status: asg && ASSIGNMENT_STATUS_FILTER.has(asg) ? asg : "",
    city,
    company_id: companyId > 0 ? String(companyId) : "",
    date_from: df,
    date_to: dt,
  };

  return { tid, whereSql, params, filters, sortKey, dir, orderCol };
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} tenantId
 * @param {Record<string, string | undefined>} q raw req.query
 */
function buildIntakeProjectStatusList(db, tenantId, q) {
  const { tid, whereSql, params, filters, sortKey, dir, orderCol } = buildIntakeProjectStatusQueryParts(
    tenantId,
    q
  );

  const countSql = `
    SELECT COUNT(*) AS c
    FROM intake_client_projects p
    INNER JOIN intake_clients c ON c.id = p.client_id AND c.tenant_id = p.tenant_id
    WHERE ${whereSql}
  `;
  const totalRow = db.prepare(countSql).get(...params);
  const total = totalRow && totalRow.c != null ? Number(totalRow.c) : 0;

  const maxPage = Math.max(1, Math.min(MAX_PAGE, Math.ceil(total / PAGE_SIZE) || 1));
  let page = parseInt(String(q.page || "1"), 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (page > maxPage) page = maxPage;
  const offset = (page - 1) * PAGE_SIZE;

  const dataSql = `
    SELECT
      p.id,
      p.project_code,
      c.client_code,
      COALESCE(NULLIF(trim(p.client_full_name_snapshot), ''), c.full_name) AS client_display_name,
      p.city,
      p.neighborhood,
      p.estimated_budget_value,
      p.estimated_budget_currency,
      p.status AS project_status,
      p.created_at,
      p.updated_at,
      (SELECT COUNT(*) FROM intake_project_assignments ax WHERE ax.project_id = p.id AND ax.tenant_id = p.tenant_id) AS assign_count,
      (SELECT group_concat(ax2.status, ',') FROM intake_project_assignments ax2 WHERE ax2.project_id = p.id AND ax2.tenant_id = p.tenant_id) AS assign_statuses_raw
    FROM intake_client_projects p
    INNER JOIN intake_clients c ON c.id = p.client_id AND c.tenant_id = p.tenant_id
    WHERE ${whereSql}
    ORDER BY ${orderCol} ${dir}, p.id DESC
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(dataSql).all(...params, PAGE_SIZE, offset);

  const companies = db
    .prepare(`SELECT id, name, subdomain FROM companies WHERE tenant_id = ? ORDER BY name ASC`)
    .all(tid);

  const cities = db
    .prepare(
      `SELECT DISTINCT trim(p.city) AS city FROM intake_client_projects p WHERE p.tenant_id = ? AND length(trim(p.city)) > 0 ORDER BY city ASC`
    )
    .all(tid)
    .map((r) => r.city);

  const filtersOut = {
    ...filters,
    page: page > 1 ? String(page) : "",
  };

  return {
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    maxPage,
    companies,
    cities,
    sort: sortKey,
    dir: dir.toLowerCase(),
    filters: filtersOut,
  };
}

function summarizeAssignmentStatuses(raw) {
  const s = String(raw || "");
  if (!s.trim()) return "—";
  const counts = {};
  for (const x of s.split(",")) {
    const k = String(x || "").trim().toLowerCase() || "unknown";
    counts[k] = (counts[k] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([k, n]) => `${k} (${n})`)
    .join(", ");
}

/**
 * @param {Record<string, string>} filters
 */
function buildProjectStatusHref(filters, sort, dir) {
  const p = new URLSearchParams();
  if (filters.q) p.set("q", filters.q);
  if (filters.project_status) p.set("project_status", filters.project_status);
  if (filters.assignment_status) p.set("assignment_status", filters.assignment_status);
  if (filters.city) p.set("city", filters.city);
  if (filters.company_id) p.set("company_id", filters.company_id);
  if (filters.date_from) p.set("date_from", filters.date_from);
  if (filters.date_to) p.set("date_to", filters.date_to);
  const pg = Number(filters.page);
  if (Number.isFinite(pg) && pg > 1) p.set("page", String(Math.floor(pg)));
  p.set("sort", sort);
  p.set("dir", dir);
  const qs = p.toString();
  return `/admin/project-status${qs ? `?${qs}` : ""}`;
}

/**
 * Sorting resets to page 1.
 * @param {Record<string, string>} filters
 */
function sortToggleHref(filters, sortKey, currentSort, currentDir) {
  const nextDir =
    currentSort === sortKey && String(currentDir || "").toLowerCase() === "desc" ? "asc" : "desc";
  const f = { ...filters };
  delete f.page;
  return buildProjectStatusHref(f, sortKey, nextDir);
}

module.exports = {
  buildIntakeProjectStatusList,
  summarizeAssignmentStatuses,
  ASSIGNMENT_STATUS_FILTER,
  SORT_MAP,
  buildProjectStatusHref,
  sortToggleHref,
};
