/**
 * Shared admin route helpers (no Router). Used by split admin modules — keep behavior identical to legacy admin.js.
 */

const slugify = require("slugify");
const { isSuperAdmin } = require("../../auth");
const { canManageTenantUsers } = require("../../auth/roles");
const { TENANT_ZM } = require("../../tenants/tenantIds");
const {
  parseGalleryAdminText,
  parseGalleryJson,
  galleryToAdminText,
} = require("../../companies/companyProfile");
const { enrichCompanyWithCategory } = require("../../companies/companyPageRender");

/** True when the admin view is embedded (Settings hub iframe or super-admin inline panel). Preserved via hidden `embed` on POST. */
function isEmbedRequest(req) {
  const q = req.query && (req.query.embed === "1" || req.query.embed === "true");
  const b = req.body && (req.body.embed === "1" || req.body.embed === "true");
  return !!(q || b);
}

/**
 * Append `embed=1` to redirects so iframe loads stay chrome-less (fixes “ghost” full admin header after POST).
 * @param {import('express').Request} req
 * @param {string} pathWithQuery
 */
function redirectWithEmbed(req, pathWithQuery) {
  if (!isEmbedRequest(req)) return pathWithQuery;
  if (/[?&]embed=1(?:&|$)/.test(pathWithQuery)) return pathWithQuery;
  const sep = pathWithQuery.includes("?") ? "&" : "?";
  return `${pathWithQuery}${sep}embed=1`;
}

function getAdminTenantId(req) {
  const u = req.session && req.session.adminUser;
  if (!u) return TENANT_ZM;
  if (isSuperAdmin(u.role)) {
    const tid = req.session.adminTenantScope;
    if (tid != null && Number(tid) > 0) return Number(tid);
    /** Super admin without an explicit “Act as region” still needs a tenant for Professions / Companies — default to Zambia. */
    return TENANT_ZM;
  }
  const t = u.tenantId;
  return t != null && Number(t) > 0 ? Number(t) : TENANT_ZM;
}

function getCategoriesForSelect(db, tenantId) {
  return db
    .prepare("SELECT id, slug, name FROM categories WHERE tenant_id = ? ORDER BY sort ASC, name ASC")
    .all(tenantId);
}

function uniqueCompanySubdomainForTenant(dbConn, desiredTenantId, desiredSlug) {
  const tid = Number(desiredTenantId);
  let base = slugify(String(desiredSlug || "listing"), { lower: true, strict: true, trim: true }).slice(0, 60) || "listing";
  let sub = base;
  let n = 1;
  while (dbConn.prepare("SELECT 1 FROM companies WHERE tenant_id = ? AND subdomain = ?").get(tid, sub)) {
    sub = `${base}-${n++}`.slice(0, 80);
  }
  return sub;
}

function parseEditMode(req) {
  return req.query.edit === "1" || req.query.edit === "true" || req.query.mode === "edit";
}

/** Serialize current filters for links (drops edit/mode). */
function filterSuffixFromQuery(req) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query || {})) {
    if (k === "edit" || k === "mode") continue;
    if (v !== undefined && v !== null && String(v) !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `&${s}` : "";
}

function mergeDraftCompanyForPreview(db, baseRow, draft) {
  const d = draft || {};
  const gallerySource =
    d.gallery_text !== undefined ? String(d.gallery_text) : galleryToAdminText(parseGalleryJson(baseRow.gallery_json));

  let category_id = baseRow.category_id;
  if (d.category_id !== undefined) {
    const s = String(d.category_id).trim();
    category_id = s === "" ? null : Number(s);
    if (category_id != null && Number.isNaN(category_id)) category_id = null;
  }

  let years_experience = baseRow.years_experience;
  if (d.years_experience !== undefined) {
    const y = String(d.years_experience).trim();
    if (y === "") years_experience = null;
    else {
      const n = Number(y);
      years_experience = Number.isNaN(n) ? null : n;
    }
  }

  const merged = {
    ...baseRow,
    name: d.name !== undefined ? String(d.name).trim() : baseRow.name,
    subdomain: d.subdomain !== undefined ? String(d.subdomain).trim().toLowerCase() : baseRow.subdomain,
    category_id,
    headline: d.headline !== undefined ? String(d.headline).trim() : baseRow.headline,
    about: d.about !== undefined ? String(d.about).trim() : baseRow.about,
    services: d.services !== undefined ? String(d.services).trim() : baseRow.services,
    phone: d.phone !== undefined ? String(d.phone).trim() : baseRow.phone,
    email: d.email !== undefined ? String(d.email).trim() : baseRow.email,
    location: d.location !== undefined ? String(d.location).trim() : baseRow.location,
    featured_cta_label:
      d.featured_cta_label !== undefined ? String(d.featured_cta_label).trim() || "Call us" : baseRow.featured_cta_label,
    featured_cta_phone:
      d.featured_cta_phone !== undefined ? String(d.featured_cta_phone).trim() : baseRow.featured_cta_phone,
    years_experience,
    service_areas: d.service_areas !== undefined ? String(d.service_areas).trim() : baseRow.service_areas,
    hours_text: d.hours_text !== undefined ? String(d.hours_text).trim() : baseRow.hours_text,
    logo_url: d.logo_url !== undefined ? String(d.logo_url).trim() : baseRow.logo_url,
    gallery_json: JSON.stringify(parseGalleryAdminText(gallerySource)),
  };
  return enrichCompanyWithCategory(db, merged);
}

function requireManageUsers(req, res, next) {
  if (!req.session.adminUser) return res.redirect("/admin/login");
  if (!canManageTenantUsers(req.session.adminUser.role)) {
    return res.status(403).type("text").send("User management requires tenant manager or super admin.");
  }
  return next();
}

function normalizeCrmAttachmentUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.length > 2000) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.href;
  } catch {
    return "";
  }
}

function safeCrmRedirect(req, defaultPath) {
  const next = String((req.body && req.body.next) || "").trim();
  if (
    next.startsWith("/admin/crm") &&
    next.length < 512 &&
    !next.includes("//") &&
    !next.includes("\n") &&
    !next.includes("\r")
  ) {
    return next;
  }
  return defaultPath;
}

module.exports = {
  isEmbedRequest,
  redirectWithEmbed,
  getAdminTenantId,
  getCategoriesForSelect,
  uniqueCompanySubdomainForTenant,
  parseEditMode,
  filterSuffixFromQuery,
  mergeDraftCompanyForPreview,
  requireManageUsers,
  normalizeCrmAttachmentUrl,
  safeCrmRedirect,
};
