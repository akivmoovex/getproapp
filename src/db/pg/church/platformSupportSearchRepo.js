"use strict";

const { normalizePhone } = require("./membersRepo");

const ORG_BRANCH_STATUSES = new Set(["active", "suspended", "archived"]);
const ADMIN_STATUSES = new Set(["active", "inactive"]);
const MEMBER_STATUSES = new Set(["pending", "verified", "rejected", "inactive"]);

function ilikePattern(q) {
  return `%${String(q || "").trim()}%`;
}

function statusApplies(entityKind, status) {
  if (!status || status === "all") return true;
  if (entityKind === "organization" || entityKind === "branch") {
    return ORG_BRANCH_STATUSES.has(status);
  }
  if (entityKind === "hq_admin" || entityKind === "branch_admin") {
    return ADMIN_STATUSES.has(status);
  }
  if (entityKind === "member") {
    return MEMBER_STATUSES.has(status);
  }
  return false;
}

function appendStatusFilter(clauses, params, statusColumn, status, entityKind) {
  if (!status || status === "all" || !statusApplies(entityKind, status)) return;
  params.push(status);
  clauses.push(`${statusColumn} = $${params.length}`);
}

function phoneMatchClause(params, q, columns) {
  const phoneNorm = normalizePhone(q);
  if (!phoneNorm) return "";
  params.push(phoneNorm);
  return columns.map((col) => `${col} = $${params.length}`).join(" OR ");
}

function mapOrganization(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    plan_code: row.plan_code || "free",
    country: row.country,
    city: row.city,
    primary_contact_name: row.primary_contact_name,
    primary_contact_phone: row.primary_contact_phone,
    primary_contact_email: row.primary_contact_email,
    link: `/admin/church/organizations/${row.id}`,
  };
}

function mapBranch(row) {
  const hostSlug = row.host_slug || row.slug;
  return {
    id: row.id,
    name: row.name,
    host_slug: hostSlug,
    status: row.status,
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    city: row.city,
    country: row.country,
    link: `/admin/church/branches/${row.id}`,
  };
}

function mapHqAdmin(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    username: row.username,
    status: row.status,
    role: row.role,
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    link: `/admin/church/organizations/${row.organization_id}/hq-admins/${row.id}`,
  };
}

function mapBranchAdmin(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    username: row.username,
    status: row.status,
    role: row.role,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    host_slug: row.host_slug || row.branch_slug,
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    link: `/admin/church/branches/${row.branch_id}/admins/${row.id}`,
  };
}

function mapMember(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    host_slug: row.host_slug || row.branch_slug,
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    link: `/admin/church/members/${row.id}`,
    manage_note: null,
  };
}

async function searchOrganizations(pool, q, status, limit) {
  if (!statusApplies("organization", status)) {
    return { items: [], total: 0 };
  }
  const pattern = ilikePattern(q);
  const params = [pattern];
  const matchParts = [
    "lower(o.name) LIKE lower($1)",
    "lower(o.slug) LIKE lower($1)",
    "lower(COALESCE(o.country, '')) LIKE lower($1)",
    "lower(COALESCE(o.city, '')) LIKE lower($1)",
    "lower(COALESCE(o.primary_contact_name, '')) LIKE lower($1)",
    "lower(COALESCE(o.primary_contact_phone, '')) LIKE lower($1)",
    "lower(COALESCE(o.primary_contact_email, '')) LIKE lower($1)",
  ];
  const clauses = [`(${matchParts.join(" OR ")})`];
  appendStatusFilter(clauses, params, "o.status", status, "organization");
  params.push(limit);

  const r = await pool.query(
    `SELECT o.id, o.name, o.slug, o.status, o.plan_code, o.country, o.city,
            o.primary_contact_name, o.primary_contact_phone, o.primary_contact_email,
            COUNT(*) OVER()::int AS total_count
     FROM public.church_organizations o
     WHERE ${clauses.join(" AND ")}
     ORDER BY o.name ASC, o.id ASC
     LIMIT $${params.length}`,
    params
  );
  const total = r.rows[0] ? r.rows[0].total_count : 0;
  return { items: r.rows.map(mapOrganization), total };
}

async function searchBranches(pool, q, status, limit) {
  if (!statusApplies("branch", status)) {
    return { items: [], total: 0 };
  }
  const pattern = ilikePattern(q);
  const params = [pattern];
  const matchParts = [
    "lower(b.name) LIKE lower($1)",
    "lower(COALESCE(NULLIF(trim(b.host_slug), ''), b.slug)) LIKE lower($1)",
    "lower(COALESCE(b.city, '')) LIKE lower($1)",
    "lower(COALESCE(b.country, '')) LIKE lower($1)",
    "lower(COALESCE(b.pastor_name, '')) LIKE lower($1)",
    "lower(COALESCE(b.contact_phone, '')) LIKE lower($1)",
    "lower(COALESCE(b.contact_email, '')) LIKE lower($1)",
    "lower(o.name) LIKE lower($1)",
  ];
  const clauses = [`(${matchParts.join(" OR ")})`];
  appendStatusFilter(clauses, params, "b.status", status, "branch");
  params.push(limit);

  const r = await pool.query(
    `SELECT b.id, b.name, b.slug, b.host_slug, b.status, b.city, b.country,
            b.organization_id, o.name AS organization_name,
            COUNT(*) OVER()::int AS total_count
     FROM public.church_branches b
     INNER JOIN public.church_organizations o ON o.id = b.organization_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY b.name ASC, b.id ASC
     LIMIT $${params.length}`,
    params
  );
  const total = r.rows[0] ? r.rows[0].total_count : 0;
  return { items: r.rows.map(mapBranch), total };
}

async function searchHqAdmins(pool, q, status, limit) {
  if (!statusApplies("hq_admin", status)) {
    return { items: [], total: 0 };
  }
  const pattern = ilikePattern(q);
  const params = [pattern];
  const matchParts = [
    "lower(ha.full_name) LIKE lower($1)",
    "lower(COALESCE(ha.email, '')) LIKE lower($1)",
    "lower(COALESCE(ha.phone, '')) LIKE lower($1)",
    "lower(COALESCE(ha.username, '')) LIKE lower($1)",
    "lower(o.name) LIKE lower($1)",
  ];
  const phoneClause = phoneMatchClause(params, q, ["ha.phone_normalized"]);
  if (phoneClause) matchParts.push(phoneClause);
  const clauses = [`(${matchParts.join(" OR ")})`];
  appendStatusFilter(clauses, params, "ha.status", status, "hq_admin");
  params.push(limit);

  const r = await pool.query(
    `SELECT ha.id, ha.full_name, ha.email, ha.phone, ha.username, ha.status, ha.role,
            ha.organization_id, o.name AS organization_name,
            COUNT(*) OVER()::int AS total_count
     FROM public.church_hq_admins ha
     INNER JOIN public.church_organizations o ON o.id = ha.organization_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY ha.full_name ASC, ha.id ASC
     LIMIT $${params.length}`,
    params
  );
  const total = r.rows[0] ? r.rows[0].total_count : 0;
  return { items: r.rows.map(mapHqAdmin), total };
}

async function searchBranchAdmins(pool, q, status, limit) {
  if (!statusApplies("branch_admin", status)) {
    return { items: [], total: 0 };
  }
  const pattern = ilikePattern(q);
  const params = [pattern];
  const matchParts = [
    "lower(ba.full_name) LIKE lower($1)",
    "lower(COALESCE(ba.email, '')) LIKE lower($1)",
    "lower(COALESCE(ba.phone, '')) LIKE lower($1)",
    "lower(COALESCE(ba.username, '')) LIKE lower($1)",
    "lower(b.name) LIKE lower($1)",
    "lower(COALESCE(NULLIF(trim(b.host_slug), ''), b.slug)) LIKE lower($1)",
    "lower(o.name) LIKE lower($1)",
  ];
  const phoneClause = phoneMatchClause(params, q, ["ba.phone_normalized"]);
  if (phoneClause) matchParts.push(phoneClause);
  const clauses = [`(${matchParts.join(" OR ")})`];
  appendStatusFilter(clauses, params, "ba.status", status, "branch_admin");
  params.push(limit);

  const r = await pool.query(
    `SELECT ba.id, ba.full_name, ba.email, ba.phone, ba.username, ba.status, ba.role,
            ba.branch_id, ba.organization_id,
            b.name AS branch_name, b.slug AS branch_slug, b.host_slug,
            o.name AS organization_name,
            COUNT(*) OVER()::int AS total_count
     FROM public.church_branch_admins ba
     INNER JOIN public.church_branches b ON b.id = ba.branch_id
     INNER JOIN public.church_organizations o ON o.id = ba.organization_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY ba.full_name ASC, ba.id ASC
     LIMIT $${params.length}`,
    params
  );
  const total = r.rows[0] ? r.rows[0].total_count : 0;
  return { items: r.rows.map(mapBranchAdmin), total };
}

async function searchMembers(pool, q, status, limit) {
  if (!statusApplies("member", status)) {
    return { items: [], total: 0 };
  }
  const pattern = ilikePattern(q);
  const params = [pattern];
  const matchParts = [
    "lower(m.full_name) LIKE lower($1)",
    "lower(COALESCE(m.email, '')) LIKE lower($1)",
    "lower(COALESCE(m.phone, '')) LIKE lower($1)",
    "lower(b.name) LIKE lower($1)",
    "lower(COALESCE(NULLIF(trim(b.host_slug), ''), b.slug)) LIKE lower($1)",
    "lower(o.name) LIKE lower($1)",
  ];
  const phoneClause = phoneMatchClause(params, q, ["m.phone_normalized"]);
  if (phoneClause) matchParts.push(phoneClause);
  const clauses = [`(${matchParts.join(" OR ")})`];
  appendStatusFilter(clauses, params, "m.status", status, "member");
  params.push(limit);

  const r = await pool.query(
    `SELECT m.id, m.full_name, m.email, m.phone, m.status,
            m.branch_id, m.organization_id,
            b.name AS branch_name, b.slug AS branch_slug, b.host_slug,
            o.name AS organization_name,
            COUNT(*) OVER()::int AS total_count
     FROM public.church_members m
     INNER JOIN public.church_branches b ON b.id = m.branch_id
     INNER JOIN public.church_organizations o ON o.id = m.organization_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY m.full_name ASC, m.id ASC
     LIMIT $${params.length}`,
    params
  );
  const total = r.rows[0] ? r.rows[0].total_count : 0;
  return { items: r.rows.map(mapMember), total };
}

function mapMinistryLeader(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    role: row.role,
    ministry_id: row.ministry_id,
    ministry_name: row.ministry_name,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    host_slug: row.host_slug || row.branch_slug,
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    link: `/admin/church/ministry-leaders/${row.id}`,
  };
}

async function searchMinistryLeaders(pool, q, status, limit) {
  if (status !== "all" && status !== "active" && status !== "inactive") {
    return { items: [], total: 0 };
  }
  const pattern = ilikePattern(q);
  const params = [pattern];
  const matchParts = [
    "lower(l.full_name) LIKE lower($1)",
    "lower(COALESCE(l.email, '')) LIKE lower($1)",
    "lower(COALESCE(l.phone, '')) LIKE lower($1)",
    "lower(COALESCE(m.name, '')) LIKE lower($1)",
    "lower(b.name) LIKE lower($1)",
    "lower(COALESCE(NULLIF(trim(b.host_slug), ''), b.slug)) LIKE lower($1)",
    "lower(o.name) LIKE lower($1)",
  ];
  const phoneClause = phoneMatchClause(params, q, ["l.phone_normalized"]);
  if (phoneClause) matchParts.push(phoneClause);
  const clauses = [`(${matchParts.join(" OR ")})`];
  if (status !== "all") {
    params.push(status);
    clauses.push(`l.status = $${params.length}`);
  }
  params.push(limit);

  const r = await pool.query(
    `SELECT l.id, l.full_name, l.email, l.phone, l.status, l.role, l.ministry_id,
            l.branch_id, l.organization_id,
            m.name AS ministry_name,
            b.name AS branch_name, b.slug AS branch_slug, b.host_slug,
            o.name AS organization_name,
            COUNT(*) OVER()::int AS total_count
     FROM public.church_ministry_leaders l
     INNER JOIN public.church_branches b ON b.id = l.branch_id
     INNER JOIN public.church_organizations o ON o.id = l.organization_id
     LEFT JOIN public.church_ministries m ON m.id = l.ministry_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY l.full_name ASC, l.id ASC
     LIMIT $${params.length}`,
    params
  );
  const total = r.rows[0] ? r.rows[0].total_count : 0;
  return { items: r.rows.map(mapMinistryLeader), total };
}

async function getRecentOrganizations(pool, limit) {
  const r = await pool.query(
    `SELECT id, name, slug, status, plan_code, country, city,
            primary_contact_name, primary_contact_phone, primary_contact_email
     FROM public.church_organizations
     ORDER BY created_at DESC, id DESC
     LIMIT $1`,
    [limit]
  );
  return r.rows.map(mapOrganization);
}

async function getRecentBranches(pool, limit) {
  const r = await pool.query(
    `SELECT b.id, b.name, b.slug, b.host_slug, b.status, b.city, b.country,
            b.organization_id, o.name AS organization_name
     FROM public.church_branches b
     INNER JOIN public.church_organizations o ON o.id = b.organization_id
     ORDER BY b.created_at DESC, b.id DESC
     LIMIT $1`,
    [limit]
  );
  return r.rows.map(mapBranch);
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ q?: string, type?: string, status?: string, limit?: number }} opts
 */
async function searchChurchPlatformSupport(pool, opts = {}) {
  const q = String(opts.q || "").trim().slice(0, 100);
  const type = String(opts.type || "all").trim().toLowerCase();
  const status = String(opts.status || "all").trim().toLowerCase();
  let limit = Number(opts.limit);
  if (!Number.isFinite(limit) || limit < 1) limit = 10;
  if (limit > 25) limit = 25;

  const emptyResults = {
    organizations: { items: [], total: 0 },
    branches: { items: [], total: 0 },
    hq_admins: { items: [], total: 0 },
    branch_admins: { items: [], total: 0 },
    members: { items: [], total: 0 },
    ministry_leaders: { items: [], total: 0 },
  };

  if (!q) {
    const recentLimit = Math.min(limit, 8);
    return {
      q: "",
      type,
      status,
      limit,
      searchRan: false,
      tooShort: false,
      recent: {
        organizations: await getRecentOrganizations(pool, recentLimit),
        branches: await getRecentBranches(pool, recentLimit),
      },
      results: emptyResults,
      totals: { all: 0 },
    };
  }

  if (q.length < 2) {
    return {
      q,
      type,
      status,
      limit,
      searchRan: false,
      tooShort: true,
      recent: { organizations: [], branches: [] },
      results: emptyResults,
      totals: { all: 0 },
    };
  }

  const results = { ...emptyResults };
  const groups =
    type === "all"
      ? ["organizations", "branches", "hq_admins", "branch_admins", "members", "ministry_leaders"]
      : [type];

  if (groups.includes("organizations")) {
    results.organizations = await searchOrganizations(pool, q, status, limit);
  }
  if (groups.includes("branches")) {
    results.branches = await searchBranches(pool, q, status, limit);
  }
  if (groups.includes("hq_admins")) {
    results.hq_admins = await searchHqAdmins(pool, q, status, limit);
  }
  if (groups.includes("branch_admins")) {
    results.branch_admins = await searchBranchAdmins(pool, q, status, limit);
  }
  if (groups.includes("members")) {
    results.members = await searchMembers(pool, q, status, limit);
  }
  if (groups.includes("ministry_leaders")) {
    results.ministry_leaders = await searchMinistryLeaders(pool, q, status, limit);
  }

  const totals = {
    organizations: results.organizations.total,
    branches: results.branches.total,
    hq_admins: results.hq_admins.total,
    branch_admins: results.branch_admins.total,
    members: results.members.total,
    ministry_leaders: results.ministry_leaders.total,
    all:
      results.organizations.total +
      results.branches.total +
      results.hq_admins.total +
      results.branch_admins.total +
      results.members.total +
      results.ministry_leaders.total,
  };

  return {
    q,
    type,
    status,
    limit,
    searchRan: true,
    tooShort: false,
    recent: { organizations: [], branches: [] },
    results,
    totals,
  };
}

module.exports = {
  searchChurchPlatformSupport,
};
