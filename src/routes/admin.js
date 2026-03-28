const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const slugify = require("slugify");
const {
  requireAdmin,
  requireSuperAdmin,
  requireDirectoryEditor,
  requireNotViewer,
  requireClientProjectIntakeAccess,
  requireClientProjectIntakeMutate,
  authenticateAdmin,
  isSuperAdmin,
  isTenantViewer,
} = require("../auth");
const {
  canManageTenantUsers,
  normalizeRole,
  ROLES,
  canEditDirectoryData,
  canAccessCrm,
  canMutateCrm,
  canClaimCrmTasks,
  canAccessTenantSettings,
  canAccessSettingsHub,
  canAccessClientProjectIntake,
  canMutateClientProjectIntake,
} = require("../roles");
const { STAGES, normalizeStage } = require("../tenantStages");
const { TENANT_ZM } = require("../tenantIds");
const {
  DEFAULT_CALLCENTER_PHONE,
  DEFAULT_SUPPORT_HELP_PHONE,
  DEFAULT_WHATSAPP_PHONE,
  DEFAULT_CALLCENTER_EMAIL,
} = require("../tenantContactSupport");
const {
  parseGalleryAdminText,
  parseGalleryJson,
  galleryToAdminText,
  buildCompanyMiniSiteUrl,
  companyMiniSiteLabel,
  absoluteCompanyProfileUrl,
} = require("../companyProfile");
const { isValidPhoneForTenant } = require("../tenants");
const { LEAD_STATUSES, normalizeLeadStatus, leadStatusLabel } = require("../leadStatuses");
const { ADMIN_COMPANY_LEAD_SELECT, mapAdminCompanyLeadRow } = require("../leadCompanyRequestViewModel");
const {
  buildIntakeProjectStatusList,
  summarizeAssignmentStatuses,
  sortToggleHref,
  buildProjectStatusHref,
} = require("../adminIntakeProjectStatus");
const { buildCompanyPageLocals, enrichCompanyWithCategory, platformTenantPrefixForSlug } = require("../companyPageRender");
const { listAllByKind, getById } = require("../contentPages");
const { CRM_TASK_STATUSES, normalizeCrmTaskStatus, crmTaskStatusLabel } = require("../crmTaskStatuses");
const { insertCrmAudit } = require("../crmAudit");
const { resolveSessionAfterLogin, upsertMembership, adminUserIsInTenant } = require("../adminUserTenants");
const { getTenantCitiesForClient } = require("../tenantCities");
const clientIntake = require("../clientProjectIntake");

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
  return (
    req.query.edit === "1" || req.query.edit === "true" || req.query.mode === "edit"
  );
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

module.exports = function adminRoutes({ db }) {
  const router = express.Router();
  const projectIntakeUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: clientIntake.MAX_IMAGE_BYTES, files: 5 },
  });

  router.use((req, res, next) => {
    const em = req.query.embed === "1" || req.query.embed === "true";
    res.locals.embed = em;
    res.locals.bodyEmbedClass = em ? " admin-app--embed" : "";
    next();
  });

  router.get("/login", (req, res) => {
    if (req.session && req.session.adminUser) return res.redirect("/admin/dashboard");
    return res.render("admin/login", { error: null, cancelHref: "/getpro-admin" });
  });

  router.post("/login", async (req, res) => {
    const { username = "", password = "" } = req.body || {};
    const user = await authenticateAdmin({ db, username, password });
    if (!user) return res.render("admin/login", { error: "Invalid username or password.", cancelHref: "/getpro-admin" });

    req.session.adminTenantScope = null;
    req.session.adminTenantMemberships = undefined;
    if (isSuperAdmin(user.role)) {
      req.session.adminUser = {
        id: user.id,
        username: user.username,
        role: user.role || ROLES.TENANT_EDITOR,
        tenantId: user.tenant_id,
      };
    } else {
      const resolved = resolveSessionAfterLogin(db, user);
      req.session.adminUser = {
        id: user.id,
        username: user.username,
        role: resolved.role,
        tenantId: resolved.tenantId,
      };
      req.session.adminTenantMemberships = resolved.memberships;
    }
    if (isSuperAdmin(user.role)) {
      /** Default region for directory tools: env override → demo → global → zm. Global is apex-only and usually has no listings — demo holds sample data. */
      const envSlug = (process.env.GETPRO_SUPER_ADMIN_DEFAULT_TENANT_SLUG || "").trim().toLowerCase();
      let scopeRow = null;
      if (envSlug) {
        scopeRow = db.prepare("SELECT id FROM tenants WHERE slug = ? AND stage = ?").get(envSlug, STAGES.ENABLED);
      }
      if (!scopeRow) {
        scopeRow = db.prepare("SELECT id FROM tenants WHERE slug = 'demo' AND stage = ?").get(STAGES.ENABLED);
      }
      if (!scopeRow) {
        scopeRow = db.prepare("SELECT id FROM tenants WHERE slug = 'global' AND stage = ?").get(STAGES.ENABLED);
      }
      if (!scopeRow) {
        scopeRow = db.prepare("SELECT id FROM tenants WHERE slug = 'zm' AND stage = ?").get(STAGES.ENABLED);
      }
      if (scopeRow && scopeRow.id) {
        req.session.adminTenantScope = scopeRow.id;
        return res.redirect("/admin/dashboard");
      }
      return res.redirect("/admin/super");
    }
    return res.redirect("/admin/dashboard");
  });

  router.post("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/admin/login"));
  });

  router.use((req, res, next) => {
    if (!req.path.startsWith("/login")) return requireAdmin(req, res, next);
    return next();
  });

  /** Keep session tenant in sync with membership rows (multi-region managers). */
  router.use((req, res, next) => {
    if (!req.session || !req.session.adminUser || isSuperAdmin(req.session.adminUser.role)) {
      return next();
    }
    const u = req.session.adminUser;
    const mems = req.session.adminTenantMemberships || [];
    if (mems.length > 0) {
      const ok = mems.some((m) => Number(m.tenantId) === Number(u.tenantId));
      if (!ok) {
        const first = mems[0];
        u.tenantId = first.tenantId;
        u.role = first.role;
      }
    }
    return next();
  });

  router.post("/tenant-scope", (req, res) => {
    const u = req.session && req.session.adminUser;
    if (!u) return res.redirect("/admin/login");
    if (isSuperAdmin(u.role)) {
      return res.redirect(String(req.body.redirect || "/admin/dashboard"));
    }
    const tid = Number(req.body.tenant_id);
    if (!tid || tid <= 0) return res.status(400).send("Invalid region.");
    const mems = req.session.adminTenantMemberships || [];
    const match = mems.find((m) => Number(m.tenantId) === tid);
    if (!match) return res.status(400).send("You do not have access to that region.");
    u.tenantId = tid;
    u.role = match.role;
    const redir = String(req.body.redirect || "/admin/dashboard").trim();
    const safe = redir.startsWith("/admin") && !redir.includes("//") ? redir : "/admin/dashboard";
    req.session.save(() => res.redirect(safe));
  });

  router.use((req, res, next) => {
    if (!req.session.adminUser) return next();
    if (isTenantViewer(req.session.adminUser.role)) {
      const p = req.path;
      if (
        p.startsWith("/categories") ||
        p.startsWith("/companies") ||
        p.startsWith("/cities")
      ) {
        return res.redirect("/admin/leads");
      }
    }
    return next();
  });

  router.use((req, res, next) => {
    if (!req.session.adminUser) {
      return next();
    }
    const u = req.session.adminUser;
    const tid = getAdminTenantId(req);
    res.locals.adminNav = {
      role: u.role,
      isViewer: isTenantViewer(u.role),
      isSuper: isSuperAdmin(u.role),
      canEditDirectory: canEditDirectoryData(u.role),
      canManageUsers: canManageTenantUsers(u.role),
      tenantScoped: tid != null,
      canAccessCrm: canAccessCrm(u.role),
      canMutateCrm: canMutateCrm(u.role),
      canClaimCrmTasks: canClaimCrmTasks(u.role),
      canAccessTenantSettings: canAccessTenantSettings(u.role),
      canAccessSettingsHub: canAccessSettingsHub(u.role),
      canAccessProjectIntake: canAccessClientProjectIntake(u.role),
      canMutateProjectIntake: canMutateClientProjectIntake(u.role),
    };
    if (isSuperAdmin(u.role)) {
      const tn = db.prepare("SELECT id, slug, name FROM tenants WHERE id = ?").get(tid);
      res.locals.adminScopeTenant = tn || null;
      res.locals.adminScopeIsSession =
        req.session.adminTenantScope != null && Number(req.session.adminTenantScope) > 0;
      res.locals.adminRegionSwitch = null;
    } else {
      res.locals.adminScopeTenant = null;
      res.locals.adminScopeIsSession = false;
      const mems = req.session.adminTenantMemberships || [];
      if (mems.length > 1) {
        const ids = [...new Set(mems.map((m) => Number(m.tenantId)))].filter((n) => Number.isFinite(n) && n > 0);
        if (ids.length > 0) {
          const ph = ids.map(() => "?").join(",");
          const rows = db.prepare(`SELECT id, slug, name FROM tenants WHERE id IN (${ph})`).all(...ids);
          const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
          res.locals.adminRegionSwitch = {
            currentId: Number(u.tenantId),
            options: mems.map((m) => {
              const id = Number(m.tenantId);
              const r = byId[id];
              return {
                id,
                name: r ? r.name : `Region ${id}`,
                slug: r ? r.slug : "",
              };
            }),
          };
        } else {
          res.locals.adminRegionSwitch = null;
        }
      } else {
        res.locals.adminRegionSwitch = null;
      }
    }
    return next();
  });

  // —— Super admin ——
  router.get("/super", requireSuperAdmin, (req, res) => {
    const tenants = db.prepare("SELECT * FROM tenants ORDER BY id ASC").all();
    const need = req.query.need === "tenant";
    const selectedTenantId =
      req.session.adminTenantScope != null && Number(req.session.adminTenantScope) > 0
        ? Number(req.session.adminTenantScope)
        : null;
    return res.render("admin/super", {
      tenants,
      needTenant: need,
      stages: STAGES,
      selectedTenantId,
    });
  });

  router.post("/super/scope", requireSuperAdmin, (req, res) => {
    const tid = req.body.tenant_id != null ? Number(req.body.tenant_id) : null;
    if (tid && tid > 0) {
      const row = db.prepare("SELECT id FROM tenants WHERE id = ?").get(tid);
      if (!row) return res.status(400).send("Invalid tenant.");
      req.session.adminTenantScope = tid;
    } else {
      req.session.adminTenantScope = null;
    }
    req.session.save(() => res.redirect(req.body.redirect || "/admin/dashboard"));
  });

  function seedCategoriesFromTenant(dbConn, destTenantId, srcTenantId) {
    const n = dbConn.prepare("SELECT COUNT(*) AS c FROM categories WHERE tenant_id = ?").get(destTenantId).c;
    if (n > 0) return;
    const rows = dbConn
      .prepare("SELECT slug, name, sort FROM categories WHERE tenant_id = ? ORDER BY sort ASC")
      .all(srcTenantId);
    const ins = dbConn.prepare(
      "INSERT INTO categories (tenant_id, slug, name, sort, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
    );
    for (const r of rows) {
      ins.run(destTenantId, r.slug, r.name, r.sort);
    }
  }

  function deleteTenantScopedData(dbConn, tenantId) {
    const tid = Number(tenantId);
    dbConn.prepare("DELETE FROM leads WHERE tenant_id = ?").run(tid);
    dbConn.prepare("DELETE FROM companies WHERE tenant_id = ?").run(tid);
    dbConn.prepare("DELETE FROM categories WHERE tenant_id = ?").run(tid);
    dbConn.prepare("DELETE FROM callback_interests WHERE tenant_id = ?").run(tid);
    dbConn.prepare("DELETE FROM professional_signups WHERE tenant_id = ?").run(tid);
    dbConn.prepare("DELETE FROM tenant_cities WHERE tenant_id = ?").run(tid);

    const affectedIds = new Set();
    dbConn
      .prepare("SELECT admin_user_id AS id FROM admin_user_tenant_roles WHERE tenant_id = ?")
      .all(tid)
      .forEach((r) => affectedIds.add(Number(r.id)));
    dbConn
      .prepare("SELECT id FROM admin_users WHERE tenant_id = ?")
      .all(tid)
      .forEach((r) => affectedIds.add(Number(r.id)));

    dbConn.prepare("DELETE FROM admin_user_tenant_roles WHERE tenant_id = ?").run(tid);

    for (const uid of affectedIds) {
      if (!uid) continue;
      const next = dbConn
        .prepare("SELECT tenant_id, role FROM admin_user_tenant_roles WHERE admin_user_id = ? ORDER BY tenant_id ASC LIMIT 1")
        .get(uid);
      if (next) {
        dbConn.prepare("UPDATE admin_users SET tenant_id = ?, role = ? WHERE id = ?").run(next.tenant_id, next.role, uid);
      } else {
        dbConn.prepare("DELETE FROM admin_users WHERE id = ?").run(uid);
      }
    }

    dbConn.prepare("DELETE FROM tenants WHERE id = ?").run(tid);
  }

  router.get("/super/tenants/new", requireSuperAdmin, (req, res) => {
    return res.render("admin/super_tenant_form", {
      tenant: null,
      stages: STAGES,
      error: null,
      baseDomain: process.env.BASE_DOMAIN || "",
    });
  });

  router.post("/super/tenants", requireSuperAdmin, (req, res) => {
    const slug = String(req.body.slug || "")
      .trim()
      .toLowerCase();
    const name = String(req.body.name || "").trim();
    const stage = normalizeStage(req.body.stage || STAGES.PARTNER_COLLECTION);
    if (!slug || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
      return res.status(400).send("Invalid short code (use letters, numbers, hyphens).");
    }
    if (!name) return res.status(400).send("Name is required.");
    const reserved = new Set(["www", "admin", "api", "static", "mail", "app"]);
    if (reserved.has(slug)) return res.status(400).send("This short code is reserved.");
    const dup = db.prepare("SELECT id FROM tenants WHERE slug = ?").get(slug);
    if (dup) return res.status(400).send("This short code is already in use.");
    const maxRow = db.prepare("SELECT MAX(id) AS m FROM tenants").get();
    const nextId = (maxRow && maxRow.m ? Number(maxRow.m) : 0) + 1;
    const callcenter_phone = String(req.body.callcenter_phone || "").trim() || DEFAULT_CALLCENTER_PHONE;
    const support_help_phone = String(req.body.support_help_phone || "").trim() || DEFAULT_SUPPORT_HELP_PHONE;
    const whatsapp_phone = String(req.body.whatsapp_phone || "").trim() || DEFAULT_WHATSAPP_PHONE;
    const callcenter_email = String(req.body.callcenter_email || "").trim() || DEFAULT_CALLCENTER_EMAIL;
    try {
      db.prepare(
        "INSERT INTO tenants (id, slug, name, stage, callcenter_phone, support_help_phone, whatsapp_phone, callcenter_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(nextId, slug, name, stage, callcenter_phone, support_help_phone, whatsapp_phone, callcenter_email);
      seedCategoriesFromTenant(db, nextId, TENANT_ZM);
      return res.redirect("/admin/super");
    } catch (e) {
      return res.status(400).send(`Could not create region: ${e.message}`);
    }
  });

  router.get("/super/tenants/:id/edit", requireSuperAdmin, (req, res) => {
    const id = Number(req.params.id);
    const tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(id);
    if (!tenant) return res.status(404).send("Region not found");
    return res.render("admin/super_tenant_form", {
      tenant,
      stages: STAGES,
      error: null,
      baseDomain: process.env.BASE_DOMAIN || "",
    });
  });

  router.post("/super/tenants/:id", requireSuperAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).send("Invalid id.");
    const name = String(req.body.name || "").trim();
    const slug = String(req.body.slug || "")
      .trim()
      .toLowerCase();
    const stage = normalizeStage(req.body.stage || STAGES.PARTNER_COLLECTION);
    if (!name) return res.status(400).send("Name is required.");
    if (!slug || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
      return res.status(400).send("Invalid short code.");
    }
    const dup = db.prepare("SELECT id FROM tenants WHERE slug = ? AND id != ?").get(slug, id);
    if (dup) return res.status(400).send("This short code is already in use.");
    const callcenter_phone = String(req.body.callcenter_phone || "").trim() || DEFAULT_CALLCENTER_PHONE;
    const support_help_phone = String(req.body.support_help_phone || "").trim() || DEFAULT_SUPPORT_HELP_PHONE;
    const whatsapp_phone = String(req.body.whatsapp_phone || "").trim() || DEFAULT_WHATSAPP_PHONE;
    const callcenter_email = String(req.body.callcenter_email || "").trim() || DEFAULT_CALLCENTER_EMAIL;
    const r = db
      .prepare(
        "UPDATE tenants SET name = ?, slug = ?, stage = ?, callcenter_phone = ?, support_help_phone = ?, whatsapp_phone = ?, callcenter_email = ? WHERE id = ?"
      )
      .run(name, slug, stage, callcenter_phone, support_help_phone, whatsapp_phone, callcenter_email, id);
    if (r.changes === 0) return res.status(404).send("Region not found");
    return res.redirect("/admin/super");
  });

  router.post("/super/tenants/:id/delete", requireSuperAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!id || id === 1) return res.status(400).send("Cannot delete this region.");
    const row = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(id);
    if (!row) return res.status(404).send("Region not found");
    if (row.slug === "global") return res.status(400).send("Cannot delete the global region.");
    try {
      db.exec("PRAGMA foreign_keys = OFF");
      const tx = db.transaction(() => deleteTenantScopedData(db, id));
      tx();
      db.exec("PRAGMA foreign_keys = ON");
      return res.redirect("/admin/super");
    } catch (e) {
      return res.status(400).send(`Could not delete: ${e.message}`);
    }
  });

  router.post("/super/tenants/:id/stage", requireSuperAdmin, (req, res) => {
    const id = Number(req.params.id);
    const stage = normalizeStage(req.body.stage);
    if (!id) return res.status(400).send("Invalid id.");
    const r = db.prepare("UPDATE tenants SET stage = ? WHERE id = ?").run(stage, id);
    if (r.changes === 0) return res.status(404).send("Tenant not found.");
    return res.redirect("/admin/super");
  });

  function getGlobalAndZmTenantIds(db) {
    const g = db.prepare("SELECT id FROM tenants WHERE slug = 'global'").get();
    const z = db.prepare("SELECT id FROM tenants WHERE slug = 'zm'").get();
    return { globalId: g ? g.id : null, zmId: z ? z.id : null };
  }

  function superUsersListQuery(db, filter) {
    const { globalId, zmId } = getGlobalAndZmTenantIds(db);
    const base = `
      SELECT u.id, u.username, u.role, u.enabled, u.tenant_id, u.created_at,
             t.slug AS tenant_slug, t.name AS tenant_name
      FROM admin_users u
      LEFT JOIN tenants t ON u.tenant_id = t.id
    `;
    const orderBy = " ORDER BY COALESCE(t.slug, ''), u.username ASC";
    const f = String(filter || "all").toLowerCase();
    if (f === "global_zm" || f === "gz") {
      const ids = [globalId, zmId].filter((x) => x != null);
      const parts = [];
      const params = [];
      if (ids.length) {
        parts.push(`u.tenant_id IN (${ids.map(() => "?").join(",")})`);
        params.push(...ids);
      }
      parts.push(`(u.role = ? AND u.tenant_id IS NULL)`);
      params.push(ROLES.SUPER_ADMIN);
      const where = parts.join(" OR ");
      return db.prepare(base + " WHERE " + where + orderBy).all(...params);
    }
    if (f === "global" && globalId) {
      return db
        .prepare(base + " WHERE u.tenant_id = ? OR (u.role = ? AND u.tenant_id IS NULL)" + orderBy)
        .all(globalId, ROLES.SUPER_ADMIN);
    }
    if (f === "zm" && zmId) {
      return db.prepare(base + " WHERE u.tenant_id = ?" + orderBy).all(zmId);
    }
    return db.prepare(base + orderBy).all();
  }

  router.get("/super/users/new", requireSuperAdmin, (req, res) => {
    const tenants = db.prepare("SELECT id, slug, name, stage FROM tenants ORDER BY id ASC").all();
    return res.render("admin/super_user_form", {
      error: null,
      tenants,
      roles: [ROLES.SUPER_ADMIN, ROLES.TENANT_MANAGER, ROLES.TENANT_EDITOR, ROLES.TENANT_AGENT, ROLES.TENANT_VIEWER],
    });
  });

  router.post("/super/users", requireSuperAdmin, requireNotViewer, async (req, res) => {
    const username = String(req.body.username || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    const role = normalizeRole(req.body.role);
    const tenantIdRaw = req.body.tenant_id;
    const tenantId =
      tenantIdRaw === "" || tenantIdRaw === undefined || tenantIdRaw === null
        ? null
        : Number(tenantIdRaw);

    if (!username) return res.status(400).send("Username required.");
    if (password.length < 8) return res.status(400).send("Password must be at least 8 characters.");

    if (role === ROLES.SUPER_ADMIN) {
      if (tenantId != null) return res.status(400).send("Super admin must have no tenant (leave region blank).");
    } else {
      if (tenantId == null || !Number.isFinite(tenantId) || tenantId <= 0) {
        return res.status(400).send("Select a tenant for non–super-admin roles.");
      }
      const tr = db.prepare("SELECT id FROM tenants WHERE id = ?").get(tenantId);
      if (!tr) return res.status(400).send("Invalid tenant.");
    }

    if (
      ![ROLES.SUPER_ADMIN, ROLES.TENANT_MANAGER, ROLES.TENANT_EDITOR, ROLES.TENANT_AGENT, ROLES.TENANT_VIEWER].includes(
        role
      )
    ) {
      return res.status(400).send("Invalid role.");
    }

    const hash = await bcrypt.hash(password, 12);
    try {
      const info = db.prepare("INSERT INTO admin_users (username, password_hash, role, tenant_id, enabled) VALUES (?, ?, ?, ?, 1)").run(
        username,
        hash,
        role,
        tenantId
      );
      if (role !== ROLES.SUPER_ADMIN && tenantId != null && Number(tenantId) > 0) {
        upsertMembership(db, Number(info.lastInsertRowid), Number(tenantId), role);
      }
      return res.redirect("/admin/super/users?edit=1");
    } catch (e) {
      return res.status(400).send(`Could not create user: ${e.message}`);
    }
  });

  router.get("/super/users/:id/edit", requireSuperAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).send("Invalid id.");
    const row = db.prepare("SELECT * FROM admin_users WHERE id = ?").get(id);
    if (!row) return res.status(404).send("User not found.");
    const tenants = db.prepare("SELECT id, slug, name, stage FROM tenants ORDER BY id ASC").all();
    let tenantName = "";
    let tenantSlug = "";
    if (row.tenant_id) {
      const tr = db.prepare("SELECT name, slug FROM tenants WHERE id = ?").get(row.tenant_id);
      if (tr) {
        tenantName = tr.name;
        tenantSlug = tr.slug;
      }
    }
    const currentTenantLabel =
      row.tenant_id == null
        ? "— (super admin — no tenant)"
        : tenantName
          ? `${tenantName} (${tenantSlug})`
          : `Tenant id ${row.tenant_id} (name not found)`;
    const saved = req.query.saved === "1" || req.query.saved === "true";
    return res.render("admin/super_user_edit", {
      user: row,
      error: null,
      saved,
      tenants,
      roles: [ROLES.SUPER_ADMIN, ROLES.TENANT_MANAGER, ROLES.TENANT_EDITOR, ROLES.TENANT_AGENT, ROLES.TENANT_VIEWER],
      currentUserId: req.session.adminUser.id,
      currentTenantLabel,
    });
  });

  router.post("/super/users/:id", requireSuperAdmin, requireNotViewer, async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).send("Invalid id.");
    const target = db.prepare("SELECT * FROM admin_users WHERE id = ?").get(id);
    if (!target) return res.status(404).send("User not found.");

    const username = String(req.body.username || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    const role = normalizeRole(req.body.role);
    const tenantIdRaw = req.body.tenant_id;
    const tenantId =
      tenantIdRaw === "" || tenantIdRaw === undefined || tenantIdRaw === null
        ? null
        : Number(tenantIdRaw);
    const enabled = req.body.enabled === "1" || req.body.enabled === "on" ? 1 : 0;

    if (!username) return res.status(400).send("Username required.");
    if (role === ROLES.SUPER_ADMIN) {
      if (tenantId != null) return res.status(400).send("Super admin must have no tenant.");
    } else {
      if (tenantId == null || !Number.isFinite(tenantId) || tenantId <= 0) {
        return res.status(400).send("Select a tenant for non–super-admin roles.");
      }
      const tr = db.prepare("SELECT id FROM tenants WHERE id = ?").get(tenantId);
      if (!tr) return res.status(400).send("Invalid tenant.");
    }
    if (
      ![ROLES.SUPER_ADMIN, ROLES.TENANT_MANAGER, ROLES.TENANT_EDITOR, ROLES.TENANT_AGENT, ROLES.TENANT_VIEWER].includes(
        role
      )
    ) {
      return res.status(400).send("Invalid role.");
    }
    if (target.id === req.session.adminUser.id && enabled === 0) {
      return res.status(400).send("You cannot disable your own account.");
    }
    if (password && password.length < 8) return res.status(400).send("Password must be at least 8 characters.");

    const superEnabled = db
      .prepare("SELECT COUNT(*) AS c FROM admin_users WHERE role = ? AND enabled = 1")
      .get(ROLES.SUPER_ADMIN).c;
    if (
      target.role === ROLES.SUPER_ADMIN &&
      (role !== ROLES.SUPER_ADMIN || enabled === 0) &&
      Number(superEnabled) <= 1
    ) {
      return res.status(400).send("Cannot remove or disable the last super admin.");
    }

    let sql = "UPDATE admin_users SET username = ?, role = ?, tenant_id = ?, enabled = ?";
    const params = [username, role, tenantId, enabled];
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      sql += ", password_hash = ?";
      params.push(hash);
    }
    sql += " WHERE id = ?";
    params.push(id);

    try {
      const r = db.prepare(sql).run(...params);
      if (r.changes === 0) return res.status(404).send("User not found.");
      db.prepare("DELETE FROM admin_user_tenant_roles WHERE admin_user_id = ?").run(id);
      if (role !== ROLES.SUPER_ADMIN && tenantId != null && Number(tenantId) > 0) {
        upsertMembership(db, id, Number(tenantId), role);
      }
      return res.redirect(redirectWithEmbed(req, `/admin/super/users/${id}/edit?saved=1`));
    } catch (e) {
      return res.status(400).send(`Could not update user: ${e.message}`);
    }
  });

  router.post("/super/users/:id/delete", requireSuperAdmin, requireNotViewer, (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).send("Invalid id.");
    const target = db.prepare("SELECT * FROM admin_users WHERE id = ?").get(id);
    if (!target) return res.status(404).send("User not found.");
    if (target.id === req.session.adminUser.id) return res.status(400).send("Cannot delete your own account.");
    const superCount = db.prepare("SELECT COUNT(*) AS c FROM admin_users WHERE role = ?").get(ROLES.SUPER_ADMIN).c;
    if (target.role === ROLES.SUPER_ADMIN && Number(superCount) <= 1) {
      return res.status(400).send("Cannot delete the last super admin.");
    }
    try {
      const r = db.prepare("DELETE FROM admin_users WHERE id = ?").run(id);
      if (r.changes === 0) return res.status(404).send("User not found.");
      return res.redirect("/admin/super/users?edit=1");
    } catch (e) {
      return res.status(400).send(`Could not delete user: ${e.message}`);
    }
  });

  router.get("/super/users", requireSuperAdmin, (req, res) => {
    let allUsers = superUsersListQuery(db, "all");
    const username = String(req.query.u_username || "").trim().toLowerCase();
    const tenant = String(req.query.u_tenant || "").trim().toLowerCase();
    const role = String(req.query.u_role || "").trim().toLowerCase();
    const status = String(req.query.u_status || "").trim().toLowerCase();
    if (username) {
      allUsers = allUsers.filter((u) => u.username.toLowerCase().includes(username));
    }
    if (tenant) {
      allUsers = allUsers.filter((u) => {
        const label =
          u.tenant_id == null ? "super admin" : (u.tenant_name || u.tenant_slug || String(u.tenant_id));
        return String(label).toLowerCase().includes(tenant);
      });
    }
    if (role) {
      allUsers = allUsers.filter((u) => (u.role || "").toLowerCase().includes(role));
    }
    if (status === "enabled") allUsers = allUsers.filter((u) => u.enabled !== 0);
    if (status === "disabled") allUsers = allUsers.filter((u) => u.enabled === 0);

    const editMode = parseEditMode(req);
    const filterSuffix = filterSuffixFromQuery(req);
    return res.render("admin/super_users", {
      allUsers,
      editMode,
      filterSuffix,
      userFilters: {
        u_username: req.query.u_username || "",
        u_tenant: req.query.u_tenant || "",
        u_role: req.query.u_role || "",
        u_status: req.query.u_status || "",
      },
      seedDemoNote: process.env.SEED_BUILTIN_USERS !== "0",
    });
  });

  // —— Tenant user management ——
  router.get("/users", requireManageUsers, (req, res) => {
    const tid = getAdminTenantId(req);
    const users = db
      .prepare(
        `SELECT DISTINCT u.id, u.username, u.enabled, u.created_at,
            COALESCE(m.role, u.role) AS role
         FROM admin_users u
         LEFT JOIN admin_user_tenant_roles m ON m.admin_user_id = u.id AND m.tenant_id = ?
         WHERE m.tenant_id IS NOT NULL OR u.tenant_id = ?
         ORDER BY u.username COLLATE NOCASE ASC`
      )
      .all(tid, tid);
    return res.render("admin/users", { users, tenantId: tid });
  });

  router.get("/users/new", requireManageUsers, (req, res) => {
    const tid = getAdminTenantId(req);
    return res.render("admin/user_form", { error: null, tenantId: tid, user: null });
  });

  router.post("/users", requireManageUsers, requireNotViewer, async (req, res) => {
    const tid = getAdminTenantId(req);
    const username = String(req.body.username || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    const role = normalizeRole(req.body.role);
    if (!username) return res.status(400).send("Username required.");
    if (password.length < 8) return res.status(400).send("Password must be at least 8 characters.");
    if (
      role === ROLES.SUPER_ADMIN ||
      (role === ROLES.TENANT_MANAGER && !isSuperAdmin(req.session.adminUser.role))
    ) {
      return res.status(400).send("Invalid role for this action.");
    }
    if (![ROLES.TENANT_MANAGER, ROLES.TENANT_EDITOR, ROLES.TENANT_AGENT, ROLES.TENANT_VIEWER].includes(role)) {
      return res.status(400).send("Invalid role.");
    }
    const hash = await bcrypt.hash(password, 12);
    try {
      const info = db.prepare("INSERT INTO admin_users (username, password_hash, role, tenant_id, enabled) VALUES (?, ?, ?, ?, 1)").run(
        username,
        hash,
        role,
        tid
      );
      upsertMembership(db, Number(info.lastInsertRowid), Number(tid), role);
      return res.redirect(redirectWithEmbed(req, "/admin/users"));
    } catch (e) {
      return res.status(400).send(`Could not create user: ${e.message}`);
    }
  });

  function loadTenantAdminUser(req, id) {
    const tid = getAdminTenantId(req);
    const row = db
      .prepare(
        `SELECT u.* FROM admin_users u
         WHERE u.id = ?
           AND (
             u.tenant_id = ?
             OR EXISTS (SELECT 1 FROM admin_user_tenant_roles m WHERE m.admin_user_id = u.id AND m.tenant_id = ?)
           )`
      )
      .get(id, tid, tid);
    if (!row) return null;
    const m = db.prepare("SELECT role FROM admin_user_tenant_roles WHERE admin_user_id = ? AND tenant_id = ?").get(id, tid);
    if (m && m.role) row.role = m.role;
    return row;
  }

  router.get("/users/:id/edit", requireManageUsers, (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).send("Invalid id.");
    const row = loadTenantAdminUser(req, id);
    if (!row) return res.status(404).send("User not found.");
    if (row.role === ROLES.SUPER_ADMIN) return res.status(403).send("Cannot edit super admin here.");
    const tid = getAdminTenantId(req);
    const saved = req.query.saved === "1" || req.query.saved === "true";
    return res.render("admin/user_edit", {
      user: row,
      error: null,
      saved,
      tenantId: tid,
      currentUserId: req.session.adminUser.id,
    });
  });

  router.post("/users/:id", requireManageUsers, requireNotViewer, async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).send("Invalid id.");
    const target = loadTenantAdminUser(req, id);
    if (!target) return res.status(404).send("User not found.");
    if (target.role === ROLES.SUPER_ADMIN) return res.status(403).send("Cannot edit super admin here.");

    const username = String(req.body.username || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    const role = normalizeRole(req.body.role);
    const enabled = req.body.enabled === "1" || req.body.enabled === "on" ? 1 : 0;

    if (!username) return res.status(400).send("Username required.");
    if (
      role === ROLES.SUPER_ADMIN ||
      (role === ROLES.TENANT_MANAGER && !isSuperAdmin(req.session.adminUser.role))
    ) {
      return res.status(400).send("Invalid role for this action.");
    }
    if (![ROLES.TENANT_MANAGER, ROLES.TENANT_EDITOR, ROLES.TENANT_AGENT, ROLES.TENANT_VIEWER].includes(role)) {
      return res.status(400).send("Invalid role.");
    }
    if (target.id === req.session.adminUser.id && enabled === 0) {
      return res.status(400).send("You cannot disable your own account.");
    }
    if (password && password.length < 8) return res.status(400).send("Password must be at least 8 characters.");

    const scopedTid = getAdminTenantId(req);
    let sql = "UPDATE admin_users SET username = ?, role = ?, enabled = ?";
    const params = [username, role, enabled];
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      sql += ", password_hash = ?";
      params.push(hash);
    }
    sql += " WHERE id = ?";
    params.push(id);

    try {
      const r = db.prepare(sql).run(...params);
      if (r.changes === 0) return res.status(404).send("User not found.");
      upsertMembership(db, id, Number(scopedTid), role);
      if (req.session.adminUser && Number(req.session.adminUser.id) === Number(id)) {
        req.session.adminUser.role = role;
      }
      return res.redirect(redirectWithEmbed(req, `/admin/users/${id}/edit?saved=1`));
    } catch (e) {
      return res.status(400).send(`Could not update user: ${e.message}`);
    }
  });

  router.post("/users/:id/delete", requireManageUsers, requireNotViewer, (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).send("Invalid id.");
    const target = loadTenantAdminUser(req, id);
    if (!target) return res.status(404).send("User not found.");
    if (target.role === ROLES.SUPER_ADMIN) return res.status(403).send("Cannot delete super admin here.");
    if (target.id === req.session.adminUser.id) return res.status(400).send("Cannot delete your own account.");
    const scopedTid = getAdminTenantId(req);
    try {
      db.prepare("DELETE FROM admin_user_tenant_roles WHERE admin_user_id = ? AND tenant_id = ?").run(id, scopedTid);
      const remaining = db.prepare("SELECT COUNT(*) AS c FROM admin_user_tenant_roles WHERE admin_user_id = ?").get(id).c;
      if (Number(remaining) === 0) {
        const r = db.prepare("DELETE FROM admin_users WHERE id = ?").run(id);
        if (r.changes === 0) return res.status(404).send("User not found.");
      } else {
        const next = db
          .prepare("SELECT tenant_id, role FROM admin_user_tenant_roles WHERE admin_user_id = ? ORDER BY tenant_id ASC LIMIT 1")
          .get(id);
        if (next) {
          db.prepare("UPDATE admin_users SET tenant_id = ?, role = ? WHERE id = ?").run(next.tenant_id, next.role, id);
        }
      }
      return res.redirect(redirectWithEmbed(req, "/admin/users"));
    } catch (e) {
      return res.status(400).send(`Could not delete user: ${e.message}`);
    }
  });

  router.get("/dashboard", (req, res) => {
    const u = req.session.adminUser;
    const tid = getAdminTenantId(req);

    const categoriesCount = Number(db.prepare("SELECT COUNT(*) AS c FROM categories WHERE tenant_id = ?").get(tid).c);
    const companiesCount = Number(db.prepare("SELECT COUNT(*) AS c FROM companies WHERE tenant_id = ?").get(tid).c);
    const leadsCount = Number(db.prepare("SELECT COUNT(*) AS c FROM leads WHERE tenant_id = ?").get(tid).c);

    const leadStatusRaw = db
      .prepare("SELECT status, COUNT(*) AS c FROM leads WHERE tenant_id = ? GROUP BY status")
      .all(tid);
    const leadMerged = {};
    for (const row of leadStatusRaw) {
      const st = normalizeLeadStatus(row.status);
      leadMerged[st] = (leadMerged[st] || 0) + Number(row.c);
    }
    const leadsByStatus = LEAD_STATUSES.map((st) => ({
      status: st,
      label: leadStatusLabel(st),
      count: leadMerged[st] || 0,
    }));
    const leadsStatusDen = Math.max(1, leadsByStatus.reduce((a, x) => a + x.count, 0));

    const dayCounts = db
      .prepare(
        `SELECT date(created_at) AS d, COUNT(*) AS c FROM leads WHERE tenant_id = ? AND date(created_at) >= date('now', '-6 days') GROUP BY date(created_at)`
      )
      .all(tid);
    const dayMap = Object.fromEntries(dayCounts.map((r) => [r.d, Number(r.c)]));
    const leadsLast7Days = [];
    let maxDay = 0;
    for (let i = 6; i >= 0; i--) {
      const dStr = db.prepare(`SELECT date('now', ?) AS d`).get(`-${i} days`).d;
      const count = dayMap[dStr] || 0;
      if (count > maxDay) maxDay = count;
      const dt = new Date(`${dStr}T12:00:00`);
      leadsLast7Days.push({
        date: dStr,
        count,
        label: dt.toLocaleDateString("en", { weekday: "short" }),
      });
    }
    const leadsLast7Max = Math.max(1, maxDay);

    let crmSnapshot = null;
    if (canAccessCrm(u.role)) {
      const crmRaw = db
        .prepare("SELECT status, COUNT(*) AS c FROM crm_tasks WHERE tenant_id = ? GROUP BY status")
        .all(tid);
      const crmMerged = {};
      for (const row of crmRaw) {
        const st = normalizeCrmTaskStatus(row.status);
        crmMerged[st] = (crmMerged[st] || 0) + Number(row.c);
      }
      const crmByStatus = CRM_TASK_STATUSES.map((st) => ({
        status: st,
        label: crmTaskStatusLabel(st),
        count: crmMerged[st] || 0,
      }));
      const crmTotal = crmByStatus.reduce((a, x) => a + x.count, 0);
      crmSnapshot = { total: crmTotal, byStatus: crmByStatus, den: Math.max(1, crmTotal) };
    }

    const latestLeads = db
      .prepare(
        `
        SELECT ${ADMIN_COMPANY_LEAD_SELECT}
        FROM leads l
        INNER JOIN companies c ON c.id = l.company_id
        WHERE l.tenant_id = ?
        ORDER BY l.created_at DESC
        LIMIT 10
        `
      )
      .all(tid)
      .map(mapAdminCompanyLeadRow)
      .filter(Boolean);

    return res.render("admin/dashboard", {
      categoriesCount,
      companiesCount,
      leadsCount,
      latestLeads,
      leadsByStatus,
      leadsStatusDen,
      leadsLast7Days,
      leadsLast7Max,
      crmSnapshot,
      baseDomain: process.env.BASE_DOMAIN || "",
      role: u.role,
      isViewer: isTenantViewer(u.role),
      canAccessCrm: canAccessCrm(u.role),
    });
  });

  router.get("/settings", (req, res) => {
    const u = req.session.adminUser;
    if (!u) return res.redirect("/admin/login");
    if (!canAccessSettingsHub(u.role)) {
      return res.status(403).type("text").send("Access denied.");
    }
    const tid = getAdminTenantId(req);
    return res.render("admin/settings_hub", {
      activeNav: "settings",
      tenantIdForSettings: tid,
      isSuper: isSuperAdmin(u.role),
      canEditDirectory: canEditDirectoryData(u.role),
      canManageUsers: canManageTenantUsers(u.role),
      canAccessTenantSettings: canAccessTenantSettings(u.role),
    });
  });

  function contentKindLabel(kind) {
    if (kind === "guide") return "Pro guides";
    if (kind === "faq") return "Questions & answers";
    return "Articles";
  }

  function tenantPublicPrefixForAdmin(req) {
    const tid = getAdminTenantId(req);
    const t = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    if (!t || !t.slug) return "";
    return platformTenantPrefixForSlug(t.slug);
  }

  function contentPreviewPath(kind, slug) {
    const seg = kind === "article" ? "articles" : kind === "guide" ? "guides" : "answers";
    return `/${seg}/${encodeURIComponent(slug)}?preview=1`;
  }

  router.get("/content/new", requireDirectoryEditor, (req, res) => {
    const kind = String(req.query.kind || "article").toLowerCase();
    if (!["article", "guide", "faq"].includes(kind)) return res.status(400).send("Invalid kind.");
    return res.render("admin/content_form", {
      activeNav: "settings",
      kind,
      kindLabel: contentKindLabel(kind),
      row: null,
      editMode: true,
      embed: isEmbedRequest(req),
      publicPreviewUrl: "",
    });
  });

  router.get("/content", requireDirectoryEditor, (req, res) => {
    const kind = String(req.query.kind || "article").toLowerCase();
    if (!["article", "guide", "faq"].includes(kind)) return res.status(400).send("Invalid kind.");
    const tid = getAdminTenantId(req);
    const items = listAllByKind(db, tid, kind);
    return res.render("admin/content_list", {
      activeNav: "settings",
      kind,
      kindLabel: contentKindLabel(kind),
      items,
      editMode: parseEditMode(req),
      embed: isEmbedRequest(req),
    });
  });

  router.get("/content/:id", requireDirectoryEditor, (req, res) => {
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id.");
    const tid = getAdminTenantId(req);
    const row = getById(db, tid, id);
    if (!row) return res.status(404).send("Content not found.");
    const prefix = tenantPublicPrefixForAdmin(req);
    const previewPath = contentPreviewPath(row.kind, row.slug);
    const publicPreviewUrl = prefix ? `${String(prefix).replace(/\/$/, "")}${previewPath}` : previewPath;
    return res.render("admin/content_form", {
      activeNav: "settings",
      kind: row.kind,
      kindLabel: contentKindLabel(row.kind),
      row,
      editMode: parseEditMode(req),
      embed: isEmbedRequest(req),
      publicPreviewUrl,
    });
  });

  router.post("/content", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const kind = String(req.body.kind || "").toLowerCase();
    if (!["article", "guide", "faq"].includes(kind)) return res.status(400).send("Invalid kind.");
    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).send("Title is required.");
    let slug = String(req.body.slug || "").trim().toLowerCase();
    if (!slug) slug = slugify(title, { lower: true, strict: true });
    const excerpt = String(req.body.excerpt || "").trim();
    const body = String(req.body.body || "").trim();
    const hero_image_url = String(req.body.hero_image_url || "").trim();
    const hero_image_alt = String(req.body.hero_image_alt || "").trim();
    const seo_title = String(req.body.seo_title || "").trim();
    const seo_description = String(req.body.seo_description || "").trim();
    const sort_order = Number(req.body.sort_order || 0) || 0;
    const published = req.body.published === "1" || req.body.published === "on" ? 1 : 0;
    const tid = getAdminTenantId(req);
    try {
      const info = db
        .prepare(
          `
        INSERT INTO content_pages (
          tenant_id, kind, slug, title, excerpt, body, hero_image_url, hero_image_alt,
          seo_title, seo_description, published, sort_order, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `
        )
        .run(
          tid,
          kind,
          slug,
          title,
          excerpt,
          body,
          hero_image_url,
          hero_image_alt,
          seo_title || title,
          seo_description || excerpt,
          published,
          sort_order
        );
      const newId = Number(info.lastInsertRowid);
      return res.redirect(redirectWithEmbed(req, `/admin/content/${newId}?edit=1`));
    } catch (e) {
      return res.status(400).send(e.message || "Could not create content.");
    }
  });

  router.post("/content/:id", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id.");
    const tid = getAdminTenantId(req);
    const existing = getById(db, tid, id);
    if (!existing) return res.status(404).send("Not found.");
    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).send("Title is required.");
    let slug = String(req.body.slug || "").trim().toLowerCase();
    if (!slug) slug = slugify(title, { lower: true, strict: true });
    const excerpt = String(req.body.excerpt || "").trim();
    const body = String(req.body.body || "").trim();
    const hero_image_url = String(req.body.hero_image_url || "").trim();
    const hero_image_alt = String(req.body.hero_image_alt || "").trim();
    const seo_title = String(req.body.seo_title || "").trim();
    const seo_description = String(req.body.seo_description || "").trim();
    const sort_order = Number(req.body.sort_order || 0) || 0;
    const published = req.body.published === "1" || req.body.published === "on" ? 1 : 0;
    try {
      db.prepare(
        `
        UPDATE content_pages SET
          slug = ?, title = ?, excerpt = ?, body = ?, hero_image_url = ?, hero_image_alt = ?,
          seo_title = ?, seo_description = ?, published = ?, sort_order = ?, updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
        `
      ).run(
        slug,
        title,
        excerpt,
        body,
        hero_image_url,
        hero_image_alt,
        seo_title || title,
        seo_description || excerpt,
        published,
        sort_order,
        id,
        tid
      );
      return res.redirect(redirectWithEmbed(req, `/admin/content/${id}?edit=1`));
    } catch (e) {
      return res.status(400).send(e.message || "Could not update content.");
    }
  });

  router.post("/content/:id/publish", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id.");
    const tid = getAdminTenantId(req);
    const row = getById(db, tid, id);
    if (!row) return res.status(404).send("Not found.");
    const published = row.published ? 0 : 1;
    db.prepare("UPDATE content_pages SET published = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").run(
      published,
      id,
      tid
    );
    return res.redirect(redirectWithEmbed(req, `/admin/content/${id}?edit=1`));
  });

  router.post("/content/:id/delete", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id.");
    const tid = getAdminTenantId(req);
    const r = db.prepare("DELETE FROM content_pages WHERE id = ? AND tenant_id = ?").run(id, tid);
    if (r.changes === 0) return res.status(404).send("Not found.");
    const kind = String(req.body.kind || "article").toLowerCase();
    const k = ["article", "guide", "faq"].includes(kind) ? kind : "article";
    return res.redirect(redirectWithEmbed(req, `/admin/content?kind=${encodeURIComponent(k)}&edit=1`));
  });

  router.get("/settings/tenants", (req, res) => {
    const u = req.session.adminUser;
    if (!u) return res.redirect("/admin/login");
    if (!isSuperAdmin(u.role)) {
      if (!canAccessTenantSettings(u.role)) {
        return res.status(403).type("text").send("Access denied.");
      }
      const tid = getAdminTenantId(req);
      if (tid) return res.redirect(`/admin/settings/tenant/${tid}`);
      return res.status(403).type("text").send("Access denied.");
    }
    const tenants = db.prepare("SELECT * FROM tenants ORDER BY name COLLATE NOCASE ASC, id ASC").all();
    return res.render("admin/tenant_settings_list", {
      activeNav: "settings",
      tenants,
    });
  });

  router.get("/settings/tenant/:id", (req, res) => {
    const u = req.session.adminUser;
    if (!u) return res.redirect("/admin/login");
    if (!canAccessTenantSettings(u.role)) {
      return res.status(403).type("text").send("Access denied.");
    }
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id.");
    const adminTid = getAdminTenantId(req);
    if (!isSuperAdmin(u.role) && id !== adminTid) {
      return res.status(403).type("text").send("You can only edit your region.");
    }
    const tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(id);
    if (!tenant) return res.status(404).send("Region not found.");
    const saved = req.query.saved === "1" || req.query.saved === "true";
    return res.render("admin/tenant_settings_detail", {
      activeNav: "settings",
      tenant,
      isSuper: isSuperAdmin(u.role),
      saved,
    });
  });

  router.post("/settings/tenant/:id", (req, res) => {
    const u = req.session.adminUser;
    if (!u) return res.redirect("/admin/login");
    if (!canAccessTenantSettings(u.role)) {
      return res.status(403).type("text").send("Access denied.");
    }
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id.");
    const adminTid = getAdminTenantId(req);
    if (!isSuperAdmin(u.role) && id !== adminTid) {
      return res.status(403).type("text").send("You can only edit your region.");
    }
    const row = db.prepare("SELECT id FROM tenants WHERE id = ?").get(id);
    if (!row) return res.status(404).send("Region not found.");

    const callcenter_phone = String(req.body.callcenter_phone || "").trim() || DEFAULT_CALLCENTER_PHONE;
    const support_help_phone = String(req.body.support_help_phone || "").trim() || DEFAULT_SUPPORT_HELP_PHONE;
    const whatsapp_phone = String(req.body.whatsapp_phone || "").trim() || DEFAULT_WHATSAPP_PHONE;
    const callcenter_email = String(req.body.callcenter_email || "").trim() || DEFAULT_CALLCENTER_EMAIL;

    try {
      db.prepare(
        `UPDATE tenants SET callcenter_phone = ?, support_help_phone = ?, whatsapp_phone = ?, callcenter_email = ? WHERE id = ?`
      ).run(callcenter_phone, support_help_phone, whatsapp_phone, callcenter_email, id);
    } catch (e) {
      return res.status(400).send(e.message || "Could not save");
    }
    return res.redirect(redirectWithEmbed(req, `/admin/settings/tenant/${id}?saved=1`));
  });

  router.get("/categories", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    const allCategories = db
      .prepare("SELECT * FROM categories WHERE tenant_id = ? ORDER BY sort ASC, name ASC")
      .all(tid);
    let categories = allCategories;
    const qn = String(req.query.q_name || "").trim().toLowerCase();
    const qs = String(req.query.q_slug || "").trim().toLowerCase();
    const qc = String(req.query.q_created || "").trim().toLowerCase();
    if (qn) categories = categories.filter((c) => c.name.toLowerCase().includes(qn));
    if (qs) categories = categories.filter((c) => (c.slug || "").toLowerCase().includes(qs));
    if (qc) {
      categories = categories.filter((c) => String(c.created_at || "").toLowerCase().includes(qc));
    }
    const hasActiveFilters = !!(qn || qs || qc);
    const editMode = parseEditMode(req);
    const filterSuffix = filterSuffixFromQuery(req);
    return res.render("admin/categories", {
      categories,
      totalCategoryCount: allCategories.length,
      hasActiveFilters,
      editMode,
      filterSuffix,
      filters: {
        q_name: req.query.q_name || "",
        q_slug: req.query.q_slug || "",
        q_created: req.query.q_created || "",
      },
    });
  });

  router.get("/categories/new", requireDirectoryEditor, (req, res) => {
    return res.render("admin/category_form", { category: null });
  });

  router.post("/categories", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const { name = "", slug = "" } = req.body || {};
    const cleanName = String(name).trim();
    const cleanSlug = String(slug || "").trim() ? String(slug).trim().toLowerCase() : slugify(cleanName);

    if (!cleanName) return res.status(400).send("Category name is required.");
    if (!cleanSlug) return res.status(400).send("Category slug is required.");

    try {
      const tid = getAdminTenantId(req);
      db.prepare("INSERT INTO categories (tenant_id, slug, name) VALUES (?, ?, ?)").run(tid, cleanSlug, cleanName);
      return res.redirect(redirectWithEmbed(req, "/admin/categories?edit=1"));
    } catch (e) {
      return res.status(400).send(`Could not create category: ${e.message}`);
    }
  });

  router.get("/categories/:id/edit", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    const category = db.prepare("SELECT * FROM categories WHERE id = ? AND tenant_id = ?").get(req.params.id, tid);
    if (!category) return res.status(404).send("Category not found");
    return res.render("admin/category_form", { category });
  });

  router.post("/categories/:id", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const { name = "", slug = "" } = req.body || {};
    const cleanName = String(name).trim();
    const cleanSlug = String(slug || "").trim() ? String(slug).trim().toLowerCase() : slugify(cleanName);

    if (!cleanName) return res.status(400).send("Category name is required.");
    if (!cleanSlug) return res.status(400).send("Category slug is required.");

    try {
      const tid = getAdminTenantId(req);
      const r = db
        .prepare("UPDATE categories SET slug = ?, name = ? WHERE id = ? AND tenant_id = ?")
        .run(cleanSlug, cleanName, req.params.id, tid);
      if (r.changes === 0) return res.status(404).send("Category not found");
      return res.redirect(redirectWithEmbed(req, "/admin/categories?edit=1"));
    } catch (e) {
      return res.status(400).send(`Could not update category: ${e.message}`);
    }
  });

  router.post("/categories/:id/delete", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const catId = Number(req.params.id);
    if (!catId) return res.status(400).send("Invalid id");
    const tid = getAdminTenantId(req);
    const inTx = db.transaction(() => {
      db.prepare("UPDATE companies SET category_id = NULL WHERE category_id = ? AND tenant_id = ?").run(catId, tid);
      db.prepare("DELETE FROM categories WHERE id = ? AND tenant_id = ?").run(catId, tid);
    });
    try {
      inTx();
      return res.redirect(redirectWithEmbed(req, "/admin/categories?edit=1"));
    } catch (e) {
      return res.status(400).send(`Could not delete category: ${e.message}`);
    }
  });

  router.get("/cities", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    let cities = db
      .prepare("SELECT * FROM tenant_cities WHERE tenant_id = ? ORDER BY name COLLATE NOCASE ASC")
      .all(tid);
    const qn = String(req.query.q_name || "").trim().toLowerCase();
    const qen = String(req.query.q_enabled || "").trim().toLowerCase();
    const qb = String(req.query.q_big || "").trim().toLowerCase();
    if (qn) cities = cities.filter((c) => c.name.toLowerCase().includes(qn));
    if (qen === "yes") cities = cities.filter((c) => c.enabled);
    if (qen === "no") cities = cities.filter((c) => !c.enabled);
    if (qb === "yes") cities = cities.filter((c) => c.big_city);
    if (qb === "no") cities = cities.filter((c) => !c.big_city);
    const editMode = parseEditMode(req);
    const filterSuffix = filterSuffixFromQuery(req);
    return res.render("admin/cities", {
      cities,
      editMode,
      filterSuffix,
      filters: {
        q_name: req.query.q_name || "",
        q_enabled: req.query.q_enabled || "",
        q_big: req.query.q_big || "",
      },
    });
  });

  router.post("/cities", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).send("City name is required.");
    const enabled = req.body.enabled === "1" || req.body.enabled === "on" ? 1 : 0;
    const bigCity = req.body.big_city === "1" || req.body.big_city === "on" ? 1 : 0;
    const tid = getAdminTenantId(req);
    try {
      db.prepare("INSERT INTO tenant_cities (tenant_id, name, enabled, big_city) VALUES (?, ?, ?, ?)").run(
        tid,
        name,
        enabled,
        bigCity
      );
      return res.redirect(redirectWithEmbed(req, "/admin/cities?edit=1"));
    } catch (e) {
      return res.status(400).send(`Could not add city: ${e.message}`);
    }
  });

  router.post("/cities/:id", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const cleanName = String(req.body.name || "").trim();
    if (!cleanName) return res.status(400).send("City name is required.");
    const enabled = req.body.enabled === "1" || req.body.enabled === "on" ? 1 : 0;
    const bigCity = req.body.big_city === "1" || req.body.big_city === "on" ? 1 : 0;
    const tid = getAdminTenantId(req);
    const r = db
      .prepare("UPDATE tenant_cities SET name = ?, enabled = ?, big_city = ? WHERE id = ? AND tenant_id = ?")
      .run(cleanName, enabled, bigCity, req.params.id, tid);
    if (r.changes === 0) return res.status(404).send("City not found");
    return res.redirect(redirectWithEmbed(req, "/admin/cities?edit=1"));
  });

  router.post("/cities/:id/delete", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const tid = getAdminTenantId(req);
    db.prepare("DELETE FROM tenant_cities WHERE id = ? AND tenant_id = ?").run(req.params.id, tid);
    return res.redirect(redirectWithEmbed(req, "/admin/cities?edit=1"));
  });

  router.get("/companies", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    let companies = db
      .prepare(
        `
        SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
        FROM companies c
        LEFT JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
        WHERE c.tenant_id = ?
        ORDER BY c.updated_at DESC
        `
      )
      .all(tid);
    const qn = String(req.query.q_name || "").trim().toLowerCase();
    const qs = String(req.query.q_subdomain || "").trim().toLowerCase();
    const qc = String(req.query.q_category || "").trim().toLowerCase();
    const qu = String(req.query.q_updated || "").trim().toLowerCase();
    if (qn) companies = companies.filter((c) => c.name.toLowerCase().includes(qn));
    if (qs) companies = companies.filter((c) => (c.subdomain || "").toLowerCase().includes(qs));
    if (qc) {
      companies = companies.filter((c) => (c.category_name || "").toLowerCase().includes(qc));
    }
    if (qu) {
      companies = companies.filter((c) => String(c.updated_at || "").toLowerCase().includes(qu));
    }
    const editMode = parseEditMode(req);
    const filterSuffix = filterSuffixFromQuery(req);
    const tsCompanies = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    const baseDomain = (process.env.BASE_DOMAIN || "").trim();
    const scheme = process.env.PUBLIC_SCHEME || "https";
    const tenantSlug = tsCompanies && tsCompanies.slug ? String(tsCompanies.slug) : "";
    const companiesWithUrls = companies.map((c) => {
      const sub = String(c.subdomain || "").trim();
      const miniSitePublicUrl =
        baseDomain && tenantSlug && sub
          ? `${scheme}://${tenantSlug}.${baseDomain}/${encodeURIComponent(sub)}`
          : "";
      return { ...c, miniSitePublicUrl };
    });
    const saved = req.query.saved === "1" || req.query.saved === "true";
    return res.render("admin/companies", {
      companies: companiesWithUrls,
      baseDomain,
      adminTenantSlug: tenantSlug,
      editMode,
      filterSuffix,
      saved,
      filters: {
        q_name: req.query.q_name || "",
        q_subdomain: req.query.q_subdomain || "",
        q_category: req.query.q_category || "",
        q_updated: req.query.q_updated || "",
      },
    });
  });

  router.get("/companies/new", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    const categories = getCategoriesForSelect(db, tid);
    const ts = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    const baseForUrls = (process.env.BASE_DOMAIN || "").trim() || "getproapp.org";
    const tenantSlug = ts ? String(ts.slug) : "";
    const saved = req.query.saved === "1" || req.query.saved === "true";
    return res.render("admin/company_form", {
      company: null,
      categories,
      baseDomain: baseForUrls,
      adminTenantSlug: tenantSlug,
      galleryAdminText: "",
      miniSiteUrl: "",
      miniSiteLabel: "",
      directoryProfileUrl: "",
      miniSiteExampleLabel: tenantSlug ? companyMiniSiteLabel(tenantSlug, "your-company-slug", baseForUrls) : "",
      error: null,
      saved,
    });
  });

  router.get("/companies/:id/workspace", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    const cid = Number(req.params.id);
    if (!cid || cid < 1) return res.status(400).send("Invalid id");
    const company = db
      .prepare(
        `
        SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
        FROM companies c
        LEFT JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
        WHERE c.id = ? AND c.tenant_id = ?
        `
      )
      .get(cid, tid);
    if (!company) return res.status(404).send("Company not found");
    const categories = getCategoriesForSelect(db, tid);
    const tsEdit = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    const galleryAdminText = galleryToAdminText(parseGalleryJson(company.gallery_json));
    const baseForUrls = (process.env.BASE_DOMAIN || "").trim() || "getproapp.org";
    const tenantSlug = tsEdit ? String(tsEdit.slug) : "";
    const miniSiteUrl = buildCompanyMiniSiteUrl(tenantSlug, company.subdomain, baseForUrls);
    const miniSiteLabel = companyMiniSiteLabel(tenantSlug, company.subdomain, baseForUrls);
    const directoryProfileUrl = absoluteCompanyProfileUrl(tenantSlug, company.id);
    return res.render("admin/company_workspace", {
      company,
      categories,
      galleryAdminText,
      baseDomain: baseForUrls,
      adminTenantSlug: tenantSlug,
      miniSiteUrl,
      miniSiteLabel,
      directoryProfileUrl,
      previewFramePath: `/admin/companies/${cid}/preview-frame`,
    });
  });

  router.get("/companies/:id/preview-frame", requireDirectoryEditor, async (req, res, next) => {
    try {
      const tid = getAdminTenantId(req);
      const cid = Number(req.params.id);
      if (!cid || cid < 1) return res.status(400).type("text").send("Invalid id");
      const company = db
        .prepare(
          `
          SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
          FROM companies c
          LEFT JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
          WHERE c.id = ? AND c.tenant_id = ?
          `
        )
        .get(cid, tid);
      if (!company) return res.status(404).type("text").send("Not found");
      const locals = await buildCompanyPageLocals(req, db, company);
      return res.render("company", locals);
    } catch (e) {
      return next(e);
    }
  });

  router.post("/companies/:id/preview-draft", requireDirectoryEditor, async (req, res, next) => {
    try {
      const tid = getAdminTenantId(req);
      const cid = Number(req.params.id);
      if (!cid || cid < 1) return res.status(400).json({ error: "Invalid id" });
      const baseRow = db
        .prepare(
          `
          SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
          FROM companies c
          LEFT JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
          WHERE c.id = ? AND c.tenant_id = ?
          `
        )
        .get(cid, tid);
      if (!baseRow) return res.status(404).json({ error: "Company not found" });
      const draft = req.body && req.body.company ? req.body.company : {};
      const merged = mergeDraftCompanyForPreview(db, baseRow, draft);
      const locals = await buildCompanyPageLocals(req, db, merged, {});
      return res.render("company", locals, (err, html) => {
        if (err) return next(err);
        return res.type("html").send(html);
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post("/companies/:id/publish", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const tid = getAdminTenantId(req);
    const cid = Number(req.params.id);
    if (!cid || cid < 1) return res.status(400).json({ error: "Invalid id" });
    const row = db.prepare("SELECT * FROM companies WHERE id = ? AND tenant_id = ?").get(cid, tid);
    if (!row) return res.status(404).json({ error: "Company not found" });

    const d = (req.body && req.body.company) || {};

    const cleanName = d.name != null ? String(d.name).trim() : row.name;
    const cleanSubdomain = d.subdomain != null ? String(d.subdomain).trim().toLowerCase() : row.subdomain;
    if (!cleanName) return res.status(400).json({ error: "Company name is required." });
    if (!cleanSubdomain) return res.status(400).json({ error: "Company subdomain is required." });

    let catId = row.category_id;
    if (d.category_id !== undefined) {
      const s = String(d.category_id).trim();
      catId = s === "" ? null : Number(s);
      if (catId != null && Number.isNaN(catId)) catId = null;
    }
    if (catId) {
      const okCat = db.prepare("SELECT id FROM categories WHERE id = ? AND tenant_id = ?").get(catId, tid);
      if (!okCat) return res.status(400).json({ error: "Invalid category for this tenant." });
    }

    const tenantSlugRowUp = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    const phoneVal = d.phone !== undefined ? String(d.phone).trim() : row.phone;
    const fpVal = d.featured_cta_phone !== undefined ? String(d.featured_cta_phone).trim() : row.featured_cta_phone;
    if (tenantSlugRowUp && tenantSlugRowUp.slug === "zm") {
      if (phoneVal && !isValidPhoneForTenant("zm", phoneVal)) {
        return res.status(400).json({ error: "Phone must be a Zambian number: 0 followed by 9 digits (10 digits total)." });
      }
      if (fpVal && !isValidPhoneForTenant("zm", fpVal)) {
        return res.status(400).json({ error: "CTA phone must be a Zambian number: 0 followed by 9 digits (10 digits total)." });
      }
    }

    let yearsExpUp = row.years_experience;
    if (d.years_experience !== undefined) {
      const yoeRawUp = String(d.years_experience).trim();
      if (yoeRawUp === "") yearsExpUp = null;
      else {
        yearsExpUp = Number(yoeRawUp);
        if (Number.isNaN(yearsExpUp) || yearsExpUp < 0 || yearsExpUp > 999) {
          return res.status(400).json({ error: "Years in business must be a number between 0 and 999." });
        }
      }
    }

    const galleryJsonUp = JSON.stringify(
      parseGalleryAdminText(d.gallery_text !== undefined ? String(d.gallery_text) : galleryToAdminText(parseGalleryJson(row.gallery_json)))
    );

    try {
      db.transaction(() => {
        db.prepare(
          `
          UPDATE companies
          SET
            subdomain = ?,
            name = ?,
            category_id = ?,
            headline = ?,
            about = ?,
            services = ?,
            phone = ?,
            email = ?,
            location = ?,
            featured_cta_label = ?,
            featured_cta_phone = ?,
            years_experience = ?,
            service_areas = ?,
            hours_text = ?,
            gallery_json = ?,
            logo_url = ?,
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
          `
        ).run(
          cleanSubdomain,
          cleanName,
          catId,
          d.headline !== undefined ? String(d.headline).trim() : row.headline,
          d.about !== undefined ? String(d.about).trim() : row.about,
          d.services !== undefined ? String(d.services).trim() : row.services,
          phoneVal,
          d.email !== undefined ? String(d.email).trim() : row.email,
          d.location !== undefined ? String(d.location).trim() : row.location,
          d.featured_cta_label !== undefined
            ? String(d.featured_cta_label).trim() || "Call us"
            : row.featured_cta_label,
          fpVal,
          yearsExpUp,
          d.service_areas !== undefined ? String(d.service_areas).trim() : row.service_areas,
          d.hours_text !== undefined ? String(d.hours_text).trim() : row.hours_text,
          galleryJsonUp,
          d.logo_url !== undefined ? String(d.logo_url).trim() : row.logo_url,
          cid,
          tid
        );
      })();

      const saved = db
        .prepare(
          `
          SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
          FROM companies c
          LEFT JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
          WHERE c.id = ? AND c.tenant_id = ?
          `
        )
        .get(cid, tid);
      const reviewsOut = db
        .prepare(`SELECT id, rating, body, author_name, created_at FROM reviews WHERE company_id = ? ORDER BY datetime(created_at) DESC`)
        .all(cid);
      const galleryAdminTextOut = galleryToAdminText(parseGalleryJson(saved.gallery_json));
      return res.json({ ok: true, company: saved, reviews: reviewsOut, galleryAdminText: galleryAdminTextOut });
    } catch (e) {
      return res.status(400).json({ error: e.message || "Could not save" });
    }
  });

  router.post("/companies", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const {
      name = "",
      subdomain = "",
      category_id = "",
      headline = "",
      about = "",
      services = "",
      phone = "",
      email = "",
      location = "",
      featured_cta_label = "Call us",
      featured_cta_phone = "",
      years_experience = "",
      service_areas = "",
      hours_text = "",
      gallery_text = "",
      logo_url = "",
    } = req.body || {};

    const cleanName = String(name).trim();
    const cleanSubdomain = String(subdomain).trim().toLowerCase();
    if (!cleanName) return res.status(400).send("Company name is required.");
    if (!cleanSubdomain) return res.status(400).send("Company subdomain is required.");

    const catId = category_id ? Number(category_id) : null;
    const tid = getAdminTenantId(req);
    if (catId) {
      const okCat = db.prepare("SELECT id FROM categories WHERE id = ? AND tenant_id = ?").get(catId, tid);
      if (!okCat) return res.status(400).send("Invalid category for this tenant.");
    }

    const tenantSlugRow = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    if (tenantSlugRow && tenantSlugRow.slug === "zm") {
      const p = String(phone || "").trim();
      const fp = String(featured_cta_phone || "").trim();
      if (p && !isValidPhoneForTenant("zm", p)) {
        return res
          .status(400)
          .send("Phone must be a Zambian number: 0 followed by 9 digits (10 digits total).");
      }
      if (fp && !isValidPhoneForTenant("zm", fp)) {
        return res
          .status(400)
          .send("CTA phone must be a Zambian number: 0 followed by 9 digits (10 digits total).");
      }
    }

    const yoeRaw = String(years_experience || "").trim();
    const yearsExp = yoeRaw === "" ? null : Number(yoeRaw);
    if (yearsExp != null && (Number.isNaN(yearsExp) || yearsExp < 0 || yearsExp > 999)) {
      return res.status(400).send("Years in business must be a number between 0 and 999.");
    }
    const galleryJson = JSON.stringify(parseGalleryAdminText(gallery_text));

    try {
      db.prepare(
        `
        INSERT INTO companies
          (subdomain, name, category_id, headline, about, services, phone, email, location, featured_cta_label, featured_cta_phone, tenant_id, updated_at,
           years_experience, service_areas, hours_text, gallery_json, logo_url)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'),
           ?, ?, ?, ?, ?)
        `
      ).run(
        cleanSubdomain,
        cleanName,
        catId,
        String(headline || "").trim(),
        String(about || "").trim(),
        String(services || "").trim(),
        String(phone || "").trim(),
        String(email || "").trim(),
        String(location || "").trim(),
        String(featured_cta_label || "").trim() || "Call us",
        String(featured_cta_phone || "").trim(),
        tid,
        yearsExp,
        String(service_areas || "").trim(),
        String(hours_text || "").trim(),
        galleryJson,
        String(logo_url || "").trim()
      );
      return res.redirect(redirectWithEmbed(req, "/admin/companies?edit=1&saved=1"));
    } catch (e) {
      return res.status(400).send(`Could not create company: ${e.message}`);
    }
  });

  router.get("/companies/:id/edit", requireDirectoryEditor, (req, res) => {
    return res.redirect(redirectWithEmbed(req, `/admin/companies/${encodeURIComponent(req.params.id)}/workspace`));
  });

  router.post("/companies/:id", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const {
      name = "",
      subdomain = "",
      category_id = "",
      headline = "",
      about = "",
      services = "",
      phone = "",
      email = "",
      location = "",
      featured_cta_label = "Call us",
      featured_cta_phone = "",
      years_experience = "",
      service_areas = "",
      hours_text = "",
      gallery_text = "",
      logo_url = "",
    } = req.body || {};

    const cleanName = String(name).trim();
    const cleanSubdomain = String(subdomain).trim().toLowerCase();
    if (!cleanName) return res.status(400).send("Company name is required.");
    if (!cleanSubdomain) return res.status(400).send("Company subdomain is required.");

    const catId = category_id ? Number(category_id) : null;
    const tid = getAdminTenantId(req);
    if (catId) {
      const okCat = db.prepare("SELECT id FROM categories WHERE id = ? AND tenant_id = ?").get(catId, tid);
      if (!okCat) return res.status(400).send("Invalid category for this tenant.");
    }

    const tenantSlugRowUp = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    if (tenantSlugRowUp && tenantSlugRowUp.slug === "zm") {
      const p = String(phone || "").trim();
      const fp = String(featured_cta_phone || "").trim();
      if (p && !isValidPhoneForTenant("zm", p)) {
        return res
          .status(400)
          .send("Phone must be a Zambian number: 0 followed by 9 digits (10 digits total).");
      }
      if (fp && !isValidPhoneForTenant("zm", fp)) {
        return res
          .status(400)
          .send("CTA phone must be a Zambian number: 0 followed by 9 digits (10 digits total).");
      }
    }

    const yoeRawUp = String(years_experience || "").trim();
    const yearsExpUp = yoeRawUp === "" ? null : Number(yoeRawUp);
    if (yearsExpUp != null && (Number.isNaN(yearsExpUp) || yearsExpUp < 0 || yearsExpUp > 999)) {
      return res.status(400).send("Years in business must be a number between 0 and 999.");
    }
    const galleryJsonUp = JSON.stringify(parseGalleryAdminText(gallery_text));

    try {
      const r = db.prepare(
        `
        UPDATE companies
        SET
          subdomain = ?,
          name = ?,
          category_id = ?,
          headline = ?,
          about = ?,
          services = ?,
          phone = ?,
          email = ?,
          location = ?,
          featured_cta_label = ?,
          featured_cta_phone = ?,
          years_experience = ?,
          service_areas = ?,
          hours_text = ?,
          gallery_json = ?,
          logo_url = ?,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
        `
      ).run(
        cleanSubdomain,
        cleanName,
        catId,
        String(headline || "").trim(),
        String(about || "").trim(),
        String(services || "").trim(),
        String(phone || "").trim(),
        String(email || "").trim(),
        String(location || "").trim(),
        String(featured_cta_label || "").trim() || "Call us",
        String(featured_cta_phone || "").trim(),
        yearsExpUp,
        String(service_areas || "").trim(),
        String(hours_text || "").trim(),
        galleryJsonUp,
        String(logo_url || "").trim(),
        req.params.id,
        tid
      );
      if (r.changes === 0) return res.status(404).send("Company not found");
      return res.redirect(redirectWithEmbed(req, "/admin/companies?edit=1&saved=1"));
    } catch (e) {
      return res.status(400).send(`Could not update company: ${e.message}`);
    }
  });

  router.post("/companies/:id/delete", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const companyId = Number(req.params.id);
    if (!companyId) return res.status(400).send("Invalid id");
    const tid = getAdminTenantId(req);
    try {
      db.prepare("DELETE FROM leads WHERE company_id = ? AND tenant_id = ?").run(companyId, tid);
      db.prepare("DELETE FROM companies WHERE id = ? AND tenant_id = ?").run(companyId, tid);
      return res.redirect(redirectWithEmbed(req, "/admin/companies?edit=1"));
    } catch (e) {
      return res.status(400).send(`Could not delete company: ${e.message}`);
    }
  });

  /** Company leads: optional `company_id` filter is an explicit admin choice, not inferred from category/city. */
  router.get("/leads", (req, res) => {
    const tid = getAdminTenantId(req);

    let leads = [];
    let companies = [];
    let selectedCompanyId = null;
    const companyId = req.query.company_id ? Number(req.query.company_id) : null;
    selectedCompanyId = companyId;
    companies = db
      .prepare("SELECT id, name, subdomain FROM companies WHERE tenant_id = ? ORDER BY name ASC")
      .all(tid);

    if (companyId) {
      leads = db
        .prepare(
          `
          SELECT ${ADMIN_COMPANY_LEAD_SELECT}
          FROM leads l
          INNER JOIN companies c ON c.id = l.company_id
          WHERE l.company_id = ? AND l.tenant_id = ? AND c.tenant_id = ?
          ORDER BY l.created_at DESC
          `
        )
        .all(companyId, tid, tid)
        .map(mapAdminCompanyLeadRow)
        .filter(Boolean);
    } else {
      leads = db
        .prepare(
          `
          SELECT ${ADMIN_COMPANY_LEAD_SELECT}
          FROM leads l
          INNER JOIN companies c ON c.id = l.company_id
          WHERE l.tenant_id = ?
          ORDER BY l.created_at DESC
          LIMIT 200
          `
        )
        .all(tid)
        .map(mapAdminCompanyLeadRow)
        .filter(Boolean);
    }

    const partnerCallbacks = db
      .prepare(
        `
        SELECT id, phone, name, context, interest_label, created_at
        FROM callback_interests
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 200
        `
      )
      .all(tid);

    const partnerSignups = db
      .prepare(
        `
        SELECT id, profession, city, name, phone, vat_or_pacra, created_at,
               COALESCE(converted_company_id, 0) AS converted_company_id
        FROM professional_signups
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 200
        `
      )
      .all(tid);

    return res.render("admin/leads", {
      leads,
      companies,
      selectedCompanyId,
      partnerCallbacks,
      partnerSignups,
      role: req.session.adminUser.role,
      isViewer: isTenantViewer(req.session.adminUser.role),
      leadStatusLabel,
    });
  });

  router.get("/leads/:id/edit", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const lead = mapAdminCompanyLeadRow(
      db
        .prepare(
          `
          SELECT ${ADMIN_COMPANY_LEAD_SELECT}
          FROM leads l
          INNER JOIN companies c ON c.id = l.company_id
          WHERE l.id = ? AND l.tenant_id = ? AND c.tenant_id = ?
          `
        )
        .get(id, tid, tid)
    );
    if (!lead) return res.status(404).send("Lead not found");
    const comments = db
      .prepare(
        `SELECT id, body, created_at FROM lead_comments WHERE lead_id = ? ORDER BY datetime(created_at) ASC, id ASC`
      )
      .all(id);
    const saved = req.query.saved === "1" || req.query.saved === "true";
    return res.render("admin/lead_edit", {
      lead,
      comments,
      leadStatuses: LEAD_STATUSES,
      currentStatus: normalizeLeadStatus(lead.status),
      activeNav: "leads",
      saved,
    });
  });

  router.post("/leads/:id", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const tid = getAdminTenantId(req);
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const row = db.prepare("SELECT id FROM leads WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!row) return res.status(404).send("Lead not found");

    const status = normalizeLeadStatus(req.body && req.body.status);
    const comment = String((req.body && req.body.comment) || "").trim();

    try {
      db.transaction(() => {
        db.prepare(`UPDATE leads SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`).run(
          status,
          id,
          tid
        );
        if (comment) {
          db.prepare(`INSERT INTO lead_comments (lead_id, body) VALUES (?, ?)`).run(id, comment.slice(0, 4000));
        }
      })();
    } catch (e) {
      return res.status(400).send(e.message || "Could not save");
    }
    return res.redirect(redirectWithEmbed(req, `/admin/leads/${id}/edit?saved=1`));
  });

  router.get("/partner-signups/:id", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const signup = db.prepare("SELECT * FROM professional_signups WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!signup) return res.status(404).send("Join signup not found.");
    const conv = signup.converted_company_id != null ? Number(signup.converted_company_id) : 0;
    let convertedCompany = null;
    if (conv > 0) {
      convertedCompany = db.prepare("SELECT id, name, subdomain FROM companies WHERE id = ? AND tenant_id = ?").get(conv, tid);
    }
    const categories = getCategoriesForSelect(db, tid);
    const defaultSub = uniqueCompanySubdomainForTenant(db, tid, signup.name || signup.profession || "listing");
    return res.render("admin/partner_signup_convert", {
      signup,
      categories,
      defaultSub,
      convertedCompany,
      activeNav: "leads",
    });
  });

  router.post("/partner-signups/:id/convert-to-company", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const tid = getAdminTenantId(req);
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const signup = db.prepare("SELECT * FROM professional_signups WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!signup) return res.status(404).send("Join signup not found.");
    const conv = signup.converted_company_id != null ? Number(signup.converted_company_id) : 0;
    if (conv > 0) return res.status(400).send("This signup was already converted.");

    const body = req.body || {};
    const cleanName = String(body.name || signup.name || "").trim();
    let cleanSubdomain = String(body.subdomain || "").trim().toLowerCase();
    if (!cleanName) return res.status(400).send("Company name is required.");
    if (!cleanSubdomain) cleanSubdomain = uniqueCompanySubdomainForTenant(db, tid, cleanName);
    else cleanSubdomain = slugify(cleanSubdomain, { lower: true, strict: true, trim: true }).slice(0, 80);

    const catId = body.category_id ? Number(body.category_id) : null;
    if (catId) {
      const okCat = db.prepare("SELECT id FROM categories WHERE id = ? AND tenant_id = ?").get(catId, tid);
      if (!okCat) return res.status(400).send("Invalid category for this tenant.");
    }

    const headline = String(body.headline || signup.profession || cleanName).trim().slice(0, 500);
    const about = String(body.about || "").trim();
    const services = String(body.services || signup.profession || "").trim();
    const phone = String(body.phone || signup.phone || "").trim();
    const email = String(body.email || "").trim();
    const location = String(body.location || signup.city || "").trim();
    const featured_cta_label = String(body.featured_cta_label || "Call us").trim() || "Call us";
    const featured_cta_phone = String(body.featured_cta_phone || signup.phone || "").trim();
    const service_areas = String(body.service_areas || "").trim();
    const hours_text = String(body.hours_text || "").trim();
    const logo_url = String(body.logo_url || "").trim();
    const gallery_text = String(body.gallery_text || "").trim();

    const tenantSlugRow = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    if (tenantSlugRow && tenantSlugRow.slug === "zm") {
      if (phone && !isValidPhoneForTenant("zm", phone)) {
        return res.status(400).send("Phone must be a Zambian number: 0 followed by 9 digits (10 digits total).");
      }
      if (featured_cta_phone && !isValidPhoneForTenant("zm", featured_cta_phone)) {
        return res.status(400).send("CTA phone must be a Zambian number: 0 followed by 9 digits (10 digits total).");
      }
    }

    const yoeRaw = String(body.years_experience || "").trim();
    const yearsExp = yoeRaw === "" ? null : Number(yoeRaw);
    if (yearsExp != null && (Number.isNaN(yearsExp) || yearsExp < 0 || yearsExp > 999)) {
      return res.status(400).send("Years in business must be a number between 0 and 999.");
    }

    const galleryJson = JSON.stringify(parseGalleryAdminText(gallery_text));
    const dup = db.prepare("SELECT 1 FROM companies WHERE tenant_id = ? AND subdomain = ?").get(tid, cleanSubdomain);
    if (dup) return res.status(400).send("That mini-site slug is already in use for this region.");

    let newCompanyId = null;
    try {
      db.transaction(() => {
        const r = db
          .prepare(
            `
            INSERT INTO companies
              (subdomain, name, category_id, headline, about, services, phone, email, location, featured_cta_label, featured_cta_phone, tenant_id, updated_at,
               years_experience, service_areas, hours_text, gallery_json, logo_url)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'),
               ?, ?, ?, ?, ?)
            `
          )
          .run(
            cleanSubdomain,
            cleanName,
            catId,
            headline,
            about,
            services,
            phone,
            email,
            location,
            featured_cta_label,
            featured_cta_phone,
            tid,
            yearsExp,
            service_areas,
            hours_text,
            galleryJson,
            logo_url
          );
        newCompanyId = Number(r.lastInsertRowid);
        const hasConv = db.prepare("PRAGMA table_info(professional_signups)").all().some((c) => c.name === "converted_company_id");
        if (hasConv) {
          db.prepare("UPDATE professional_signups SET converted_company_id = ? WHERE id = ? AND tenant_id = ?").run(
            newCompanyId,
            id,
            tid
          );
        }
      })();
    } catch (e) {
      return res.status(400).send(e.message || "Could not create company");
    }
    return res.redirect(redirectWithEmbed(req, `/admin/companies/${newCompanyId}/workspace`));
  });

  function requireCrmAccess(req, res, next) {
    if (!req.session.adminUser) return res.redirect("/admin/login");
    if (!canAccessCrm(req.session.adminUser.role)) {
      return res.status(403).type("text").send("CRM is not available for your role.");
    }
    return next();
  }

  function getTenantUsersForCrm(dbConn, tenantId) {
    const tid = Number(tenantId);
    return dbConn
      .prepare(
        `SELECT DISTINCT u.id, u.username
         FROM admin_users u
         LEFT JOIN admin_user_tenant_roles m ON m.admin_user_id = u.id AND m.tenant_id = ?
         WHERE COALESCE(u.enabled, 1) = 1 AND (m.tenant_id IS NOT NULL OR u.tenant_id = ?)
         ORDER BY u.username COLLATE NOCASE ASC`
      )
      .all(tid, tid);
  }

  function loadCrmTaskDetailData(req, rawId) {
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const role = req.session.adminUser.role;
    const superU = isSuperAdmin(role);
    const id = Number(rawId);
    if (!id || id < 1) return null;
    const task = db
      .prepare(
        `
        SELECT t.*, o.username AS owner_username, c.username AS creator_username
        FROM crm_tasks t
        LEFT JOIN admin_users o ON o.id = t.owner_id
        LEFT JOIN admin_users c ON c.id = t.created_by_id
        WHERE t.id = ? AND t.tenant_id = ?
        `
      )
      .get(id, tid);
    if (!task) return null;
    const isOwner = task.owner_id != null && Number(task.owner_id) === Number(uid);
    const canEdit = canMutateCrm(role) && (isOwner || superU);
    const showClaim =
      canClaimCrmTasks(role) &&
      task.owner_id == null &&
      normalizeCrmTaskStatus(task.status) === "new";

    const comments = db
      .prepare(
        `
        SELECT c.*, u.username AS author_username
        FROM crm_task_comments c
        LEFT JOIN admin_users u ON u.id = c.user_id
        WHERE c.task_id = ? AND c.tenant_id = ?
        ORDER BY datetime(c.created_at) ASC, c.id ASC
        `
      )
      .all(id, tid);

    const tenantUsersForReassign = superU ? getTenantUsersForCrm(db, tid) : [];

    const auditLogs = db
      .prepare(
        `
        SELECT a.*, u.username AS actor_username
        FROM crm_audit_logs a
        LEFT JOIN admin_users u ON u.id = a.user_id
        WHERE a.task_id = ? AND a.tenant_id = ?
        ORDER BY datetime(a.created_at) DESC, a.id DESC
        `
      )
      .all(id, tid);

    return {
      activeNav: "crm",
      task,
      comments,
      auditLogs,
      crmTaskStatusLabel,
      CRM_TASK_STATUSES,
      currentStatus: normalizeCrmTaskStatus(task.status),
      canEdit,
      isOwner,
      showClaim,
      canMutateCrm: canMutateCrm(role),
      canClaimCrmTasks: canClaimCrmTasks(role),
      isSuperCrm: superU,
      tenantUsersForReassign,
    };
  }

  router.get("/crm", requireCrmAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const role = req.session.adminUser.role;
    const superU = isSuperAdmin(role);

    const rows = db
      .prepare(
        `
        SELECT t.*, u.username AS owner_username
        FROM crm_tasks t
        LEFT JOIN admin_users u ON u.id = t.owner_id
        WHERE t.tenant_id = ?
        ORDER BY datetime(t.updated_at) DESC
        `
      )
      .all(tid);

    for (const t of rows) {
      t.canDrag =
        canMutateCrm(role) &&
        (superU ||
          (!t.owner_id && normalizeCrmTaskStatus(t.status) === "new" && canClaimCrmTasks(role)) ||
          (t.owner_id != null && Number(t.owner_id) === Number(uid)));
    }

    const tasksByStatus = {};
    for (const s of CRM_TASK_STATUSES) tasksByStatus[s] = [];
    for (const t of rows) {
      const st = normalizeCrmTaskStatus(t.status);
      if (tasksByStatus[st]) tasksByStatus[st].push(t);
    }

    let crmTenantUsers = getTenantUsersForCrm(db, tid);
    if (!crmTenantUsers.length) {
      const uname = req.session.adminUser.username || "You";
      crmTenantUsers = [{ id: uid, username: uname }];
    }

    const unassignedTasks = rows.filter(
      (t) => t.owner_id == null && normalizeCrmTaskStatus(t.status) === "new"
    );

    return res.render("admin/crm", {
      activeNav: "crm",
      tasksByStatus,
      unassignedTasks,
      CRM_TASK_STATUSES,
      crmTaskStatusLabel,
      canMutateCrm: canMutateCrm(role),
      canClaimCrmTasks: canClaimCrmTasks(role),
      isSuperCrm: superU,
      currentUserId: uid,
      currentUsername: req.session.adminUser.username || "",
      crmTenantUsers,
    });
  });

  router.get("/crm/tasks/:id/panel", requireCrmAccess, (req, res) => {
    const data = loadCrmTaskDetailData(req, req.params.id);
    if (!data) return res.status(404).type("text").send("Not found");
    return res.render("admin/crm_task_panel", { ...data, overlayMode: true });
  });

  router.get("/crm/tasks/:id", requireCrmAccess, (req, res) => {
    const data = loadCrmTaskDetailData(req, req.params.id);
    if (!data) return res.status(404).send("Task not found");
    return res.render("admin/crm_task_detail", { ...data, overlayMode: false });
  });

  router.post("/crm/tasks", requireCrmAccess, (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const title = String((req.body && req.body.title) || "").trim().slice(0, 200);
    const description = String((req.body && req.body.description) || "").trim().slice(0, 8000);
    const attachment_url = normalizeCrmAttachmentUrl(req.body && req.body.attachment_url);
    if (!title) return res.status(400).send("Title is required.");

    const rawOwner = req.body && req.body.owner_id;
    let ownerId = null;
    if (rawOwner !== "" && rawOwner !== undefined && rawOwner !== null) {
      const n = Number(rawOwner);
      if (n && n > 0) ownerId = n;
    }
    if (ownerId != null) {
      if (!adminUserIsInTenant(db, ownerId, tid)) return res.status(400).send("Invalid assignee.");
    }
    const status = ownerId != null ? "in_progress" : "new";

    let taskId;
    try {
      db.transaction(() => {
        const r = db
          .prepare(
            `
            INSERT INTO crm_tasks (tenant_id, title, description, status, owner_id, created_by_id, attachment_url, source_type, source_ref_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', NULL)
            `
          )
          .run(tid, title, description, status, ownerId, uid, attachment_url);
        taskId = Number(r.lastInsertRowid);
        insertCrmAudit(db, {
          tenantId: tid,
          taskId,
          userId: uid,
          actionType: "task_created",
          details: JSON.stringify({
            title,
            attachment_url: attachment_url || undefined,
            owner_id: ownerId,
            status,
          }),
        });
      })();
    } catch (e) {
      return res.status(400).send(e.message || "Could not create task");
    }
    return res.redirect("/admin/crm");
  });

  router.post("/crm/tasks/:id/fields", requireCrmAccess, (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id.");
    const task = db.prepare("SELECT * FROM crm_tasks WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!task) return res.status(404).send("Not found.");
    const role = req.session.adminUser.role;
    const superU = isSuperAdmin(role);
    const isOwner = task.owner_id != null && Number(task.owner_id) === Number(uid);
    if (!superU && !isOwner) return res.status(403).type("text").send("Forbidden.");
    const title = String((req.body && req.body.title) || "").trim().slice(0, 200);
    const description = String((req.body && req.body.description) || "").trim().slice(0, 8000);
    const attachment_url = normalizeCrmAttachmentUrl(req.body && req.body.attachment_url);
    if (!title) return res.status(400).send("Title is required.");
    try {
      db.transaction(() => {
        db.prepare(
          `UPDATE crm_tasks SET title = ?, description = ?, attachment_url = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
        ).run(title, description, attachment_url, id, tid);
        insertCrmAudit(db, {
          tenantId: tid,
          taskId: id,
          userId: uid,
          actionType: "task_fields_updated",
          details: JSON.stringify({ title }),
        });
      })();
    } catch (e) {
      return res.status(400).send(e.message || "Could not save");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });

  router.post("/crm/tasks/:id/claim", requireCrmAccess, (req, res) => {
    if (!canClaimCrmTasks(req.session.adminUser.role)) {
      return res.status(403).type("text").send("You cannot claim tasks.");
    }
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const task = db.prepare("SELECT * FROM crm_tasks WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!task) return res.status(404).send("Not found");
    if (task.owner_id != null) return res.status(400).send("Task already assigned.");
    try {
      db.transaction(() => {
        db.prepare(
          `
          UPDATE crm_tasks SET owner_id = ?, status = 'in_progress', updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
          `
        ).run(uid, id, tid);
        insertCrmAudit(db, {
          tenantId: tid,
          taskId: id,
          userId: uid,
          actionType: "assignment",
          details: JSON.stringify({ owner_id: uid, action: "claim" }),
        });
      })();
    } catch (e) {
      return res.status(400).send(e.message || "Could not claim");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });

  router.post("/crm/tasks/:id/status", requireCrmAccess, (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    const status = normalizeCrmTaskStatus(req.body && req.body.status);
    const task = db.prepare("SELECT * FROM crm_tasks WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!task) return res.status(404).send("Not found");
    if (task.owner_id == null || Number(task.owner_id) !== Number(uid)) {
      if (!isSuperAdmin(req.session.adminUser.role)) {
        return res.status(403).type("text").send("Only the task owner can change status.");
      }
    }
    const prev = task.status;
    try {
      db.transaction(() => {
        db.prepare(
          `UPDATE crm_tasks SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
        ).run(status, id, tid);
        insertCrmAudit(db, {
          tenantId: tid,
          taskId: id,
          userId: uid,
          actionType: "status_change",
          details: JSON.stringify({ from: prev, to: status }),
        });
      })();
    } catch (e) {
      return res.status(400).send(e.message || "Could not update");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });

  router.post("/crm/tasks/:id/move", requireCrmAccess, (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) {
      return res.status(403).json({ error: "Read-only access." });
    }
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const role = req.session.adminUser.role;
    const superU = isSuperAdmin(role);
    const id = Number(req.params.id);
    const newStatus = normalizeCrmTaskStatus(req.body && req.body.status);
    if (!id || id < 1) return res.status(400).json({ error: "Invalid id" });

    const task = db.prepare("SELECT * FROM crm_tasks WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!task) return res.status(404).json({ error: "Not found" });

    const prev = normalizeCrmTaskStatus(task.status);
    if (prev === newStatus) return res.json({ ok: true });

    if (!superU) {
      if (!task.owner_id) {
        if (prev !== "new") return res.status(403).json({ error: "Forbidden" });
        if (newStatus === "new") return res.json({ ok: true });
        if (!canClaimCrmTasks(role)) return res.status(403).json({ error: "Cannot claim" });
      } else if (Number(task.owner_id) !== Number(uid)) {
        return res.status(403).json({ error: "Only the owner can move this task" });
      }
    }

    let nextOwnerId = task.owner_id;
    if (newStatus === "new") {
      if (superU) {
        nextOwnerId = null;
      } else if (task.owner_id) {
        return res.status(403).json({ error: "Cannot move to unassigned pool" });
      }
    } else if (!task.owner_id) {
      nextOwnerId = uid;
    }

    try {
      db.transaction(() => {
        db.prepare(
          `UPDATE crm_tasks SET status = ?, owner_id = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
        ).run(newStatus, nextOwnerId, id, tid);
        insertCrmAudit(db, {
          tenantId: tid,
          taskId: id,
          userId: uid,
          actionType: "status_change",
          details: JSON.stringify({ from: prev, to: newStatus, via: "kanban" }),
        });
        if (!task.owner_id && nextOwnerId) {
          insertCrmAudit(db, {
            tenantId: tid,
            taskId: id,
            userId: uid,
            actionType: "assignment",
            details: JSON.stringify({ owner_id: nextOwnerId, action: "claim_kanban" }),
          });
        }
        if (task.owner_id && nextOwnerId == null) {
          insertCrmAudit(db, {
            tenantId: tid,
            taskId: id,
            userId: uid,
            actionType: "assignment",
            details: JSON.stringify({ from_owner_id: task.owner_id, action: "unassign_kanban" }),
          });
        }
      })();
    } catch (e) {
      return res.status(400).json({ error: e.message || "Could not move" });
    }
    return res.json({ ok: true });
  });

  router.post("/crm/tasks/:id/reassign", requireCrmAccess, (req, res) => {
    if (!isSuperAdmin(req.session.adminUser.role)) {
      return res.status(403).type("text").send("Only super admin can reassign.");
    }
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const raw = req.body && req.body.owner_id;
    const newOwnerId =
      raw === "" || raw === undefined || raw === null ? null : Number(raw);
    if (newOwnerId != null && (!newOwnerId || newOwnerId < 1)) {
      return res.status(400).send("Invalid user.");
    }

    const task = db.prepare("SELECT * FROM crm_tasks WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!task) return res.status(404).send("Not found");

    if (newOwnerId != null) {
      if (!adminUserIsInTenant(db, newOwnerId, tid)) return res.status(400).send("User not in this tenant.");
    }

    const prevOwner = task.owner_id;
    let nextStatus = normalizeCrmTaskStatus(task.status);
    if (newOwnerId == null) {
      nextStatus = "new";
    } else if (nextStatus === "new") {
      nextStatus = "in_progress";
    }

    try {
      db.transaction(() => {
        db.prepare(
          `UPDATE crm_tasks SET owner_id = ?, status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
        ).run(newOwnerId, nextStatus, id, tid);
        insertCrmAudit(db, {
          tenantId: tid,
          taskId: id,
          userId: uid,
          actionType: "assignment",
          details: JSON.stringify({ from_owner_id: prevOwner, to_owner_id: newOwnerId }),
        });
      })();
    } catch (e) {
      return res.status(400).send(e.message || "Could not reassign");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });

  router.post("/crm/tasks/:id/comments", requireCrmAccess, (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) {
      return res.status(403).type("text").send("Read-only access.");
    }
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    const body = String((req.body && req.body.body) || "").trim().slice(0, 4000);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    if (!body) return res.status(400).send("Comment is required.");

    const task = db.prepare("SELECT id FROM crm_tasks WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!task) return res.status(404).send("Not found");

    try {
      db.prepare(
        `INSERT INTO crm_task_comments (tenant_id, task_id, user_id, body) VALUES (?, ?, ?, ?)`
      ).run(tid, id, uid, body);
      insertCrmAudit(db, {
        tenantId: tid,
        taskId: id,
        userId: uid,
        actionType: "comment",
        details: JSON.stringify({ length: body.length }),
      });
    } catch (e) {
      return res.status(400).send(e.message || "Could not save comment");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });

  // —— Client / project intake (“New Project”) ——
  function intakeCityAllowed(dbConn, tenantId, cityName) {
    const names = getTenantCitiesForClient(dbConn, tenantId).map((c) => String(c.name).trim());
    const c = String(cityName || "").trim();
    return names.includes(c);
  }

  function intakeOtpBannerLocals() {
    const b = clientIntake.getIntakeOtpOperationalBanner();
    return b ? { intakeOtpBanner: b } : {};
  }

  function redirectProjectIntakeUploadError(req, res, err) {
    const clientId = Number((req.body && req.body.client_id) || 0);
    const base =
      clientId > 0
        ? `/admin/project-intake/project/new?clientId=${clientId}&error=`
        : "/admin/project-intake?error=";
    let msg = "Upload could not be processed. Use JPEG, PNG, WebP, or GIF and try again.";
    if (err.code === "LIMIT_FILE_SIZE") {
      msg = "Each image must be 5 MB or smaller. Choose smaller files or fewer images and try again.";
    } else if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
      msg = "You can attach up to 5 images. Remove extra files and try again.";
    } else if (err instanceof multer.MulterError) {
      msg = "Upload was rejected. Check image type and size, then try again.";
    }
    return res.redirect(redirectWithEmbed(req, base + encodeURIComponent(msg)));
  }

  function intakeMulterProjectImages(req, res, next) {
    projectIntakeUpload.array("images", 5)(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        return redirectProjectIntakeUploadError(req, res, err);
      }
      return next(err);
    });
  }

  function renderProjectIntakeSearch(req, res, { phone, nrz, searched, foundClient, notice, error }) {
    const tid = getAdminTenantId(req);
    return res.render("admin/project_intake_search", {
      activeNav: "project_intake",
      navTitle: "New project",
      phone,
      nrz,
      searched,
      foundClient,
      notice: String(notice || "").trim().slice(0, 500),
      error: String(error || "").trim().slice(0, 500),
      tenantId: tid,
      ...intakeOtpBannerLocals(),
    });
  }

  router.get("/project-intake", requireClientProjectIntakeAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const phone = String((req.query && req.query.phone) || "").trim();
    const nrz = String((req.query && req.query.nrz) || "").trim();
    let foundClient = null;
    let searched = false;
    if (phone || nrz) {
      searched = true;
      foundClient = clientIntake.findClientBySearch(db, tid, { phone, nrz });
    }
    return renderProjectIntakeSearch(req, res, {
      phone,
      nrz,
      searched,
      foundClient,
      notice: (req.query && req.query.notice) || "",
      error: (req.query && req.query.error) || "",
    });
  });

  /** POST search: same tenant-scoped lookup as GET; does not require mutation (viewers may search). */
  router.post("/project-intake/search", requireClientProjectIntakeAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const b = req.body || {};
    const phone = String(b.phone || "").trim();
    const nrz = String(b.nrz || "").trim();
    let foundClient = null;
    const searched = !!(phone || nrz);
    if (searched) {
      foundClient = clientIntake.findClientBySearch(db, tid, { phone, nrz });
    }
    return renderProjectIntakeSearch(req, res, {
      phone,
      nrz,
      searched,
      foundClient,
      notice: "",
      error: "",
    });
  });

  router.get("/project-intake/clients/new", requireClientProjectIntakeAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const phone = String((req.query && req.query.phone) || "").trim();
    const nrz = String((req.query && req.query.nrz) || "").trim();
    return res.render("admin/project_intake_client_new", {
      activeNav: "project_intake",
      navTitle: "New client",
      tenantId: tid,
      form: {
        full_name: "",
        phone: phone || "",
        whatsapp_phone: "",
        nrz_number: nrz || "",
        address_street: "",
        address_house_number: "",
        address_apartment_number: "",
      },
      error: String((req.query && req.query.error) || "").trim().slice(0, 500),
      otpNotice: String((req.query && req.query.otp_notice) || "").trim().slice(0, 500),
    });
  });

  router.post("/project-intake/clients", requireClientProjectIntakeAccess, requireClientProjectIntakeMutate, (req, res) => {
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const b = req.body || {};
    const external_client_reference = String(b.external_client_reference || "").trim().slice(0, 120);
    const full_name = String(b.full_name || "").trim().slice(0, 200);
    let phone = String(b.phone || "").trim();
    let whatsapp_phone = String(b.whatsapp_phone || "").trim();
    const whatsapp_same = b.whatsapp_same === "1" || b.whatsapp_same === "on" || b.whatsapp_same === true;
    if (whatsapp_same) whatsapp_phone = phone;
    const nrzRaw = String(b.nrz_number || "").trim();
    const address_street = String(b.address_street || "").trim().slice(0, 200);
    const address_house_number = String(b.address_house_number || "").trim().slice(0, 40);
    const address_apartment_number = String(b.address_apartment_number || "").trim().slice(0, 40);
    const send_otp_after = b.send_otp_after === "1" || b.send_otp_after === "on";

    if (!full_name) {
      return res.redirect(redirectWithEmbed(req, "/admin/project-intake/clients/new?error=" + encodeURIComponent("Name is required.")));
    }
    const pv = clientIntake.validatePhonesForTenant(db, tid, phone, whatsapp_phone);
    if (!pv.ok) {
      return res.redirect(redirectWithEmbed(req, "/admin/project-intake/clients/new?error=" + encodeURIComponent(pv.error)));
    }
    phone = pv.phone;
    whatsapp_phone = pv.whatsapp || "";
    const nrzCheck = clientIntake.validateNrz(nrzRaw);
    if (!nrzCheck.ok) {
      return res.redirect(redirectWithEmbed(req, "/admin/project-intake/clients/new?error=" + encodeURIComponent(nrzCheck.error)));
    }
    const phoneNorm = clientIntake.normalizeDigits(phone);
    const nrzNorm = nrzCheck.value;

    const duplicateClient = clientIntake.findClientBySearch(db, tid, { phone, nrz: nrzRaw });
    if (duplicateClient) {
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/project-intake/project/new?clientId=${duplicateClient.id}&notice=` +
            encodeURIComponent(
              `Existing client reused — no duplicate was created. Client code ${duplicateClient.client_code} (${duplicateClient.full_name}). Continue with the project form below.`
            )
        )
      );
    }

    let client_code;
    try {
      client_code = clientIntake.nextSequentialCode(db, tid, "client");
    } catch (e) {
      return res.status(400).send(e.message || "Could not allocate client code.");
    }

    try {
      db.prepare(
        `INSERT INTO intake_clients (
          tenant_id, client_code, external_client_reference, full_name, phone, phone_normalized, whatsapp_phone,
          nrz_number, nrz_normalized, address_street, address_house_number, address_apartment_number,
          updated_by_admin_user_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(
        tid,
        client_code,
        external_client_reference,
        full_name,
        phone,
        phoneNorm,
        whatsapp_phone,
        nrzRaw,
        nrzNorm,
        address_street,
        address_house_number,
        address_apartment_number,
        uid
      );
    } catch (e) {
      const msg = String(e.message || "");
      if (msg.includes("UNIQUE")) {
        const again = clientIntake.findClientBySearch(db, tid, { phone, nrz: nrzRaw });
        if (again) {
          return res.redirect(
            redirectWithEmbed(
              req,
              `/admin/project-intake/project/new?clientId=${again.id}&notice=` +
                encodeURIComponent(
                  `Existing client reused (${again.client_code}). Another request may have created this record first—we opened their profile instead of duplicating.`
                )
            )
          );
        }
        if (external_client_reference) {
          const extDup = db
            .prepare(
              "SELECT client_code FROM intake_clients WHERE tenant_id = ? AND external_client_reference = ? LIMIT 1"
            )
            .get(tid, external_client_reference);
          const dupMsg = extDup
            ? `That external reference is already used by client ${extDup.client_code} in this region. Enter a different reference or search by phone/NRZ to open that client.`
            : "That external client reference is already in use in this region. Use a different reference or search for the existing client.";
          return res.redirect(
            redirectWithEmbed(req, "/admin/project-intake/clients/new?error=" + encodeURIComponent(dupMsg))
          );
        }
        return res.redirect(
          redirectWithEmbed(req, "/admin/project-intake/clients/new?error=" + encodeURIComponent("Could not create client. Try again or search for an existing client."))
        );
      }
      return res.status(400).send(msg || "Could not create client.");
    }

    const row = db
      .prepare("SELECT id FROM intake_clients WHERE tenant_id = ? AND client_code = ?")
      .get(tid, client_code);

    if (send_otp_after && phoneNorm) {
      const recent = clientIntake.countRecentOtpSends(db, tid, phoneNorm);
      let otpNotice = "";
      let otpOk = "0";
      if (recent >= 5) {
        otpNotice =
          "Send OTP: rate limit reached (max 5 sends per phone per hour). The client was saved — try again later.";
        otpOk = "0";
      } else {
        const code = clientIntake.generateOtpDigits();
        const send = clientIntake.sendOtpPlaceholder({ phoneDisplay: phone, code });
        if (send.sent) {
          const exp = db.prepare(`SELECT datetime('now', '+10 minutes') AS e`).get().e;
          db.prepare(
            `INSERT INTO intake_phone_otp (tenant_id, client_id, phone_normalized, code_hash, purpose, expires_at, max_attempts)
             VALUES (?, ?, ?, ?, 'phone_verify', ?, 5)`
          ).run(tid, row.id, phoneNorm, clientIntake.hashOtpCode(code, tid, phoneNorm), exp);
          if (send.devMode) {
            otpNotice =
              "OTP issued successfully. This environment does not send SMS — check the server log for the verification code, then enter it below.";
            otpOk = "1";
          } else {
            otpNotice =
              "OTP sent by SMS. The client should receive the verification code shortly — ask them to enter it below.";
            otpOk = "1";
          }
        } else {
          otpNotice =
            "We could not send an OTP: " + (send.error || "SMS is not available in this environment.");
          otpOk = "0";
        }
      }
      const otpQ = "&otp_notice=" + encodeURIComponent(otpNotice) + "&otp_ok=" + otpOk;
      return res.redirect(redirectWithEmbed(req, `/admin/project-intake/project/new?clientId=${row.id}${otpQ}`));
    }

    if (send_otp_after && !phoneNorm) {
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/project-intake/project/new?clientId=${row.id}&otp_notice=` +
            encodeURIComponent(
              "We could not send an OTP: the phone number could not be normalized. The client was saved — fix the number and use Send OTP on the project page."
            ) +
            "&otp_ok=0"
        )
      );
    }

    return res.redirect(redirectWithEmbed(req, `/admin/project-intake/project/new?clientId=${row.id}`));
  });

  router.get("/project-intake/project/new", requireClientProjectIntakeAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const clientId = Number(req.query.clientId);
    if (!clientId || clientId < 1) {
      return res.redirect(redirectWithEmbed(req, "/admin/project-intake?error=" + encodeURIComponent("Missing client.")));
    }
    const client = db.prepare("SELECT * FROM intake_clients WHERE id = ? AND tenant_id = ?").get(clientId, tid);
    if (!client) return res.status(404).send("Client not found.");
    const cities = getTenantCitiesForClient(db, tid);
    const budget = clientIntake.getBudgetMetaForTenant(db, tid);
    return res.render("admin/project_intake_project", {
      activeNav: "project_intake",
      navTitle: "New project",
      client,
      cities,
      budget,
      error: String((req.query && req.query.error) || "").trim().slice(0, 500),
      otp_notice: String((req.query && req.query.otp_notice) || "").trim().slice(0, 500),
      otp_notice_ok:
        req.query && req.query.otp_ok === "1" ? true : req.query && req.query.otp_ok === "0" ? false : null,
      notice: String((req.query && req.query.notice) || "").trim().slice(0, 500),
      ...intakeOtpBannerLocals(),
    });
  });

  router.post(
    "/project-intake/projects",
    requireClientProjectIntakeAccess,
    requireClientProjectIntakeMutate,
    intakeMulterProjectImages,
    async (req, res) => {
      const tid = getAdminTenantId(req);
      const b = req.body || {};
      const clientId = Number(b.client_id);
      const client = db.prepare("SELECT * FROM intake_clients WHERE id = ? AND tenant_id = ?").get(clientId, tid);
      if (!client) return res.status(404).send("Client not found.");

      const city = String(b.city || "").trim();
      if (!city || !intakeCityAllowed(db, tid, city)) {
        return res.redirect(
          redirectWithEmbed(
            req,
            `/admin/project-intake/project/new?clientId=${clientId}&error=` + encodeURIComponent("Choose a valid city from the list.")
          )
        );
      }
      const neighborhood = String(b.neighborhood || "").trim().slice(0, 120);
      const street_name = String(b.street_name || "").trim().slice(0, 200);
      const house_number = String(b.house_number || "").trim().slice(0, 40);
      const apartment_number = String(b.apartment_number || "").trim().slice(0, 40);
      const client_address_street = String(b.client_address_street || "").trim().slice(0, 200);
      const client_address_house_number = String(b.client_address_house_number || "").trim().slice(0, 40);
      const client_address_apartment_number = String(b.client_address_apartment_number || "").trim().slice(0, 40);
      const budgetRaw = String(b.estimated_budget || "").trim();
      const budgetVal = budgetRaw === "" ? null : Number(budgetRaw);
      if (budgetRaw !== "" && (Number.isNaN(budgetVal) || budgetVal < 0)) {
        return res.redirect(
          redirectWithEmbed(
            req,
            `/admin/project-intake/project/new?clientId=${clientId}&error=` + encodeURIComponent("Budget must be a non-negative number.")
          )
        );
      }
      const budgetMeta = clientIntake.getBudgetMetaForTenant(db, tid);
      const uid = req.session.adminUser.id;

      let project_code;
      try {
        project_code = clientIntake.nextSequentialCode(db, tid, "project");
      } catch (e) {
        return res.status(400).send(e.message || "Could not allocate project code.");
      }

      let projectId;
      try {
        const info = db
          .prepare(
            `INSERT INTO intake_client_projects (
              tenant_id, client_id, project_code,
              client_full_name_snapshot, client_phone_snapshot,
              city, neighborhood, street_name, house_number, apartment_number,
              client_address_street, client_address_house_number, client_address_apartment_number,
              estimated_budget_value, estimated_budget_currency, status,
              created_by_admin_user_id, updated_by_admin_user_id, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, datetime('now'))`
          )
          .run(
            tid,
            clientId,
            project_code,
            String(client.full_name || ""),
            String(client.phone || ""),
            city,
            neighborhood,
            street_name,
            house_number,
            apartment_number,
            client_address_street,
            client_address_house_number,
            client_address_apartment_number,
            budgetVal,
            budgetMeta.code,
            uid,
            uid
          );
        projectId = Number(info.lastInsertRowid);
      } catch (e) {
        return res.status(400).send(e.message || "Could not save project.");
      }

      try {
        db.prepare(
          `UPDATE intake_clients SET
            address_street = ?, address_house_number = ?, address_apartment_number = ?,
            updated_by_admin_user_id = ?, updated_at = datetime('now')
           WHERE id = ? AND tenant_id = ?`
        ).run(
          client_address_street,
          client_address_house_number,
          client_address_apartment_number,
          uid,
          clientId,
          tid
        );
      } catch (e) {
        return res.status(400).send(e.message || "Could not update client address.");
      }

      const files = req.files && Array.isArray(req.files) ? req.files : [];
      if (files.length > 5) {
        return res.redirect(
          redirectWithEmbed(
            req,
            `/admin/project-intake/project/new?clientId=${clientId}&error=` + encodeURIComponent("Maximum 5 images.")
          )
        );
      }

      try {
        const relPaths = await clientIntake.processAndSaveProjectImages(tid, projectId, files);
        const ins = db.prepare(
          `INSERT INTO intake_project_images (tenant_id, project_id, image_path, sort_order) VALUES (?, ?, ?, ?)`
        );
        let ord = 0;
        for (const rel of relPaths) {
          ins.run(tid, projectId, rel, ord++);
        }
      } catch (e) {
        return res.redirect(
          redirectWithEmbed(
            req,
            `/admin/project-intake/project/new?clientId=${clientId}&error=` +
              encodeURIComponent(e.message || "Image processing failed.")
          )
        );
      }

      return res.redirect(redirectWithEmbed(req, `/admin/project-intake/success?projectId=${projectId}`));
    }
  );

  router.get("/project-intake/success", requireClientProjectIntakeAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const projectId = Number(req.query.projectId);
    if (!projectId || projectId < 1) return res.redirect(redirectWithEmbed(req, "/admin/project-intake"));
    const project = db
      .prepare(
        `SELECT p.*, c.client_code,
            COALESCE(NULLIF(trim(p.client_full_name_snapshot), ''), c.full_name) AS client_name,
            COALESCE(NULLIF(trim(p.client_phone_snapshot), ''), c.phone) AS client_phone,
            c.external_client_reference
         FROM intake_client_projects p
         JOIN intake_clients c ON c.id = p.client_id AND c.tenant_id = p.tenant_id
         WHERE p.id = ? AND p.tenant_id = ?`
      )
      .get(projectId, tid);
    if (!project) return res.status(404).send("Project not found.");
    const images = db
      .prepare(
        `SELECT id, image_path, sort_order FROM intake_project_images WHERE tenant_id = ? AND project_id = ? ORDER BY sort_order ASC, id ASC`
      )
      .all(tid, projectId);
    const budget = clientIntake.getBudgetMetaForTenant(db, tid);
    return res.render("admin/project_intake_success", {
      activeNav: "project_intake",
      navTitle: "Project saved",
      project,
      images,
      budget,
      projectStatusLabel: clientIntake.intakeProjectStatusLabel(project.status),
    });
  });

  router.get("/project-intake/files/:id", requireClientProjectIntakeAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id.");
    const row = db.prepare("SELECT * FROM intake_project_images WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!row) return res.status(404).send("Not found.");
    const abs = clientIntake.safeAbsoluteImagePath(row.image_path);
    if (!abs || !fs.existsSync(abs)) return res.status(404).send("File missing.");
    return res.type("jpeg").sendFile(path.resolve(abs));
  });

  router.post("/project-intake/otp/send", requireClientProjectIntakeAccess, requireClientProjectIntakeMutate, (req, res) => {
    const tid = getAdminTenantId(req);
    const clientId = Number((req.body && req.body.client_id) || 0);
    if (!clientId || clientId < 1) return res.status(400).send("Invalid client.");
    const client = db.prepare("SELECT * FROM intake_clients WHERE id = ? AND tenant_id = ?").get(clientId, tid);
    if (!client) return res.status(404).send("Client not found.");
    const phoneNorm = String(client.phone_normalized || "").trim();
    if (!phoneNorm) return res.status(400).send("Client has no phone on file.");

    const recent = clientIntake.countRecentOtpSends(db, tid, phoneNorm);
    if (recent >= 5) {
      return res.redirect(
        redirectWithEmbed(
          req,
          "/admin/project-intake/project/new?clientId=" +
            clientId +
            "&otp_notice=" +
            encodeURIComponent(
              "Send OTP: rate limit reached (max 5 sends per phone per hour). Try again later."
            ) +
            "&otp_ok=0"
        )
      );
    }

    const code = clientIntake.generateOtpDigits();
    const send = clientIntake.sendOtpPlaceholder({ phoneDisplay: client.phone, code });
    if (!send.sent) {
      const next =
        "/admin/project-intake/project/new?clientId=" +
        clientId +
        "&otp_notice=" +
        encodeURIComponent(
          "We could not send an OTP: " + (send.error || "No verification code was created.")
        ) +
        "&otp_ok=0";
      return res.redirect(redirectWithEmbed(req, next));
    }
    const exp = db.prepare(`SELECT datetime('now', '+10 minutes') AS e`).get().e;
    db.prepare(
      `INSERT INTO intake_phone_otp (tenant_id, client_id, phone_normalized, code_hash, purpose, expires_at, max_attempts)
       VALUES (?, ?, ?, ?, 'phone_verify', ?, 5)`
    ).run(tid, clientId, phoneNorm, clientIntake.hashOtpCode(code, tid, phoneNorm), exp);

    const okMsg = send.devMode
      ? "OTP issued successfully. This environment does not send SMS — check the server log for the code, then enter it below."
      : "OTP sent by SMS. The client should receive the code shortly — enter it below to verify.";
    const next =
      "/admin/project-intake/project/new?clientId=" +
      clientId +
      "&otp_notice=" +
      encodeURIComponent(okMsg) +
      "&otp_ok=1";
    return res.redirect(redirectWithEmbed(req, next));
  });

  router.post("/project-intake/otp/verify", requireClientProjectIntakeAccess, requireClientProjectIntakeMutate, (req, res) => {
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const clientId = Number((req.body && req.body.client_id) || 0);
    const code = String((req.body && req.body.otp_code) || "").trim();
    if (!clientId || clientId < 1) return res.status(400).send("Invalid client.");
    if (!/^\d{6}$/.test(code)) {
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/project-intake/project/new?clientId=${clientId}&otp_notice=` +
            encodeURIComponent("Enter the 6-digit code from the SMS or server log, then try again.")
        )
      );
    }
    const client = db.prepare("SELECT * FROM intake_clients WHERE id = ? AND tenant_id = ?").get(clientId, tid);
    if (!client) return res.status(404).send("Client not found.");
    const phoneNorm = String(client.phone_normalized || "").trim();

    const row = db
      .prepare(
        `SELECT * FROM intake_phone_otp
         WHERE tenant_id = ? AND client_id = ? AND phone_normalized = ? AND verified_at IS NULL
         AND datetime(expires_at) > datetime('now')
         ORDER BY id DESC LIMIT 1`
      )
      .get(tid, clientId, phoneNorm);
    if (!row) {
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/project-intake/project/new?clientId=${clientId}&otp_notice=` +
            encodeURIComponent("No active OTP for this client’s current phone. Send a code first.") +
            "&otp_ok=0"
        )
      );
    }
    if (String(row.phone_normalized || "") !== phoneNorm) {
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/project-intake/project/new?clientId=${clientId}&otp_notice=` +
            encodeURIComponent("OTP does not match this client’s phone on file.") +
            "&otp_ok=0"
        )
      );
    }
    const attempts = Number(row.attempts) + 1;
    if (attempts > Number(row.max_attempts)) {
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/project-intake/project/new?clientId=${clientId}&otp_notice=` +
            encodeURIComponent("Too many failed attempts. Request a new code.") +
            "&otp_ok=0"
        )
      );
    }
    const ok = clientIntake.verifyOtpCodeHash(code, row.code_hash, tid, row.phone_normalized);
    if (!ok) {
      db.prepare(`UPDATE intake_phone_otp SET attempts = ? WHERE id = ? AND tenant_id = ?`).run(attempts, row.id, tid);
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/project-intake/project/new?clientId=${clientId}&otp_notice=` +
            encodeURIComponent("Incorrect code. Check the number and try again.") +
            "&otp_ok=0"
        )
      );
    }
    db.prepare(`UPDATE intake_phone_otp SET attempts = ?, verified_at = datetime('now') WHERE id = ? AND tenant_id = ?`).run(
      attempts,
      row.id,
      tid
    );
    db.prepare(
      `UPDATE intake_clients SET phone_verified_at = datetime('now'), updated_by_admin_user_id = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
    ).run(uid, clientId, tid);
    return res.redirect(
      redirectWithEmbed(
        req,
        `/admin/project-intake/project/new?clientId=${clientId}&otp_notice=` +
          encodeURIComponent("Phone verified successfully.") +
          "&otp_ok=1"
      )
    );
  });

  router.get("/projects", requireClientProjectIntakeAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const projects = db
      .prepare(
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
          p.status,
          p.created_at,
          p.updated_at,
          (SELECT COUNT(*) FROM intake_project_assignments a WHERE a.tenant_id = p.tenant_id AND a.project_id = p.id) AS assignment_count
        FROM intake_client_projects p
        INNER JOIN intake_clients c ON c.id = p.client_id AND c.tenant_id = p.tenant_id
        WHERE p.tenant_id = ?
        ORDER BY datetime(p.created_at) DESC
        LIMIT 400`
      )
      .all(tid);
    const budget = clientIntake.getBudgetMetaForTenant(db, tid);
    return res.render("admin/projects_list", {
      activeNav: "projects",
      navTitle: "Intake projects",
      projects,
      budget,
      intakeProjectStatusLabel: clientIntake.intakeProjectStatusLabel,
    });
  });

  router.get("/projects/:id", requireClientProjectIntakeAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const pid = Number(req.params.id);
    if (!pid || pid < 1) return res.status(400).send("Invalid id.");
    const project = db
      .prepare(
        `SELECT p.*, c.client_code, c.full_name AS client_live_name, c.phone AS client_live_phone, c.external_client_reference
         FROM intake_client_projects p
         INNER JOIN intake_clients c ON c.id = p.client_id AND c.tenant_id = p.tenant_id
         WHERE p.id = ? AND p.tenant_id = ?`
      )
      .get(pid, tid);
    if (!project) return res.status(404).send("Project not found.");
    const images = db
      .prepare(
        `SELECT id, image_path, sort_order FROM intake_project_images WHERE tenant_id = ? AND project_id = ? ORDER BY sort_order ASC, id ASC`
      )
      .all(tid, pid);
    const assignments = db
      .prepare(
        `SELECT a.id, a.company_id, a.status, a.created_at, a.responded_at, a.response_note, c.name AS company_name, c.subdomain AS company_subdomain
         FROM intake_project_assignments a
         INNER JOIN companies c ON c.id = a.company_id AND c.tenant_id = a.tenant_id
         WHERE a.project_id = ? AND a.tenant_id = ?
         ORDER BY datetime(a.created_at) DESC`
      )
      .all(pid, tid);
    const companies = db
      .prepare(`SELECT id, name, subdomain FROM companies WHERE tenant_id = ? ORDER BY name ASC`)
      .all(tid);
    const assignedIds = new Set(assignments.map((a) => Number(a.company_id)));
    const assignableCompanies = companies.filter((c) => !assignedIds.has(Number(c.id)));
    const budget = clientIntake.getBudgetMetaForTenant(db, tid);
    const error = String((req.query && req.query.error) || "").trim().slice(0, 400);
    const notice = String((req.query && req.query.notice) || "").trim().slice(0, 400);
    return res.render("admin/intake_project_detail", {
      activeNav: "projects",
      navTitle: `Project ${project.project_code}`,
      project,
      images,
      assignments,
      assignableCompanies,
      budget,
      projectStatusLabel: clientIntake.intakeProjectStatusLabel(project.status),
      error: error || null,
      notice: notice || null,
      intakeFileBase: "/admin/project-intake/files/",
    });
  });

  router.post(
    "/projects/:id/assignments",
    requireClientProjectIntakeAccess,
    requireClientProjectIntakeMutate,
    (req, res) => {
      const tid = getAdminTenantId(req);
      const pid = Number(req.params.id);
      const companyId = Number((req.body && req.body.company_id) || 0);
      const uid = req.session.adminUser.id;
      if (!pid || pid < 1 || !companyId || companyId < 1) {
        return res.redirect(`/admin/projects/${pid}?error=` + encodeURIComponent("Choose a company."));
      }
      const project = db.prepare("SELECT id FROM intake_client_projects WHERE id = ? AND tenant_id = ?").get(pid, tid);
      if (!project) return res.status(404).send("Project not found.");
      const company = db.prepare("SELECT id FROM companies WHERE id = ? AND tenant_id = ?").get(companyId, tid);
      if (!company) {
        return res.redirect(`/admin/projects/${pid}?error=` + encodeURIComponent("Company not in this region."));
      }
      try {
        db.prepare(
          `INSERT INTO intake_project_assignments (tenant_id, project_id, company_id, assigned_by_admin_user_id, status, updated_at)
           VALUES (?, ?, ?, ?, 'pending', datetime('now'))`
        ).run(tid, pid, companyId, uid);
      } catch (e) {
        const msg = String(e.message || "");
        if (msg.includes("UNIQUE")) {
          return res.redirect(`/admin/projects/${pid}?error=` + encodeURIComponent("That company is already assigned."));
        }
        return res.status(400).send(msg || "Could not assign.");
      }
      return res.redirect(`/admin/projects/${pid}?notice=` + encodeURIComponent("Assignment added."));
    }
  );

  router.post(
    "/projects/:id/assignments/:assignmentId/delete",
    requireClientProjectIntakeAccess,
    requireClientProjectIntakeMutate,
    (req, res) => {
      const tid = getAdminTenantId(req);
      const pid = Number(req.params.id);
      const aid = Number(req.params.assignmentId);
      const row = db
        .prepare(`SELECT id FROM intake_project_assignments WHERE id = ? AND tenant_id = ? AND project_id = ?`)
        .get(aid, tid, pid);
      if (!row) return res.status(404).send("Assignment not found.");
      db.prepare(`DELETE FROM intake_project_assignments WHERE id = ? AND tenant_id = ?`).run(aid, tid);
      return res.redirect(`/admin/projects/${pid}?notice=` + encodeURIComponent("Assignment removed."));
    }
  );

  router.get("/companies/:id/portal-users", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    const cid = Number(req.params.id);
    const company = db.prepare("SELECT id, name, subdomain FROM companies WHERE id = ? AND tenant_id = ?").get(cid, tid);
    if (!company) return res.status(404).send("Company not found.");
    const users = db
      .prepare(
        `SELECT id, full_name, username, phone_normalized, is_active, created_at FROM company_personnel_users WHERE tenant_id = ? AND company_id = ? ORDER BY id ASC`
      )
      .all(tid, cid);
    const error = String((req.query && req.query.error) || "").trim().slice(0, 400);
    const notice = String((req.query && req.query.notice) || "").trim().slice(0, 400);
    return res.render("admin/company_portal_users", {
      activeNav: "companies",
      navTitle: "Portal users",
      company,
      users,
      error: error || null,
      notice: notice || null,
    });
  });

  router.post("/companies/:id/portal-users", requireDirectoryEditor, requireNotViewer, async (req, res) => {
    const tid = getAdminTenantId(req);
    const cid = Number(req.params.id);
    const company = db.prepare("SELECT id FROM companies WHERE id = ? AND tenant_id = ?").get(cid, tid);
    if (!company) return res.status(404).send("Company not found.");
    const full_name = String((req.body && req.body.full_name) || "").trim().slice(0, 200);
    let username = String((req.body && req.body.username) || "").trim().toLowerCase().slice(0, 60);
    if (username && !/^[a-z0-9_]+$/.test(username)) {
      return res.redirect(`/admin/companies/${cid}/portal-users?error=` + encodeURIComponent("Username may contain letters, digits, and underscores only."));
    }
    const phone = String((req.body && req.body.phone) || "").trim();
    const password = String((req.body && req.body.password) || "");
    const tsRow = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    const slug = tsRow ? String(tsRow.slug) : "zm";
    if (!full_name || !password) {
      return res.redirect(`/admin/companies/${cid}/portal-users?error=` + encodeURIComponent("Name and password are required."));
    }
    const phoneNorm = phone ? clientIntake.normalizeDigits(phone) : "";
    if (!username && !phoneNorm) {
      return res.redirect(`/admin/companies/${cid}/portal-users?error=` + encodeURIComponent("Enter a phone number or a username."));
    }
    if (phoneNorm && !isValidPhoneForTenant(slug, phone)) {
      return res.redirect(`/admin/companies/${cid}/portal-users?error=` + encodeURIComponent("Invalid phone for this region."));
    }
    let passwordHash;
    try {
      passwordHash = await bcrypt.hash(password, 11);
    } catch (e) {
      return res.status(500).send("Could not hash password.");
    }
    try {
      db.prepare(
        `INSERT INTO company_personnel_users (tenant_id, company_id, full_name, username, phone_normalized, password_hash, is_active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`
      ).run(tid, cid, full_name, username || "", phoneNorm, passwordHash);
    } catch (e) {
      if (String(e.message || "").includes("UNIQUE")) {
        return res.redirect(
          `/admin/companies/${cid}/portal-users?error=` +
            encodeURIComponent("That phone or username is already registered for portal login in this region.")
        );
      }
      return res.status(400).send(String(e.message || "Could not create user."));
    }
    return res.redirect(`/admin/companies/${cid}/portal-users?notice=` + encodeURIComponent("Portal user created."));
  });

  router.get("/project-status", requireClientProjectIntakeAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const q = req.query || {};
    const { rows, companies, cities, sort, dir, filters } = buildIntakeProjectStatusList(db, tid, q);
    const budget = clientIntake.getBudgetMetaForTenant(db, tid);
    const rowsView = rows.map((r) => ({
      ...r,
      assign_summary: summarizeAssignmentStatuses(r.assign_statuses_raw),
    }));
    return res.render("admin/intake_project_status", {
      activeNav: "project_status",
      navTitle: "Order / project status",
      rows: rowsView,
      companies,
      cities,
      sort,
      dir,
      filters,
      budget,
      intakeProjectStatusLabel: clientIntake.intakeProjectStatusLabel,
      sortToggleHref: (col) => sortToggleHref(filters, col, sort, dir),
      resetHref: buildProjectStatusHref({}, "created_at", "desc"),
    });
  });

  return router;
};
