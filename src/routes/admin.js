const express = require("express");
const bcrypt = require("bcryptjs");
const slugify = require("slugify");
const {
  requireAdmin,
  requireSuperAdmin,
  requireDirectoryEditor,
  requireNotViewer,
  authenticateAdmin,
  isSuperAdmin,
  isTenantViewer,
} = require("../auth");
const { canManageTenantUsers, normalizeRole, ROLES, canEditDirectoryData } = require("../roles");
const { STAGES, normalizeStage } = require("../tenantStages");
const { TENANT_ZM } = require("../tenantIds");
const {
  parseGalleryAdminText,
  parseGalleryJson,
  galleryToAdminText,
  buildCompanyMiniSiteUrl,
  companyMiniSiteLabel,
  absoluteCompanyProfileUrl,
} = require("../companyProfile");
const { isValidPhoneForTenant } = require("../tenants");
const { buildCompanyPageLocals, enrichCompanyWithCategory } = require("../companyPageRender");

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

  router.get("/login", (req, res) => {
    if (req.session && req.session.adminUser) return res.redirect("/admin/dashboard");
    return res.render("admin/login", { error: null, cancelHref: "/getpro-admin" });
  });

  router.post("/login", async (req, res) => {
    const { username = "", password = "" } = req.body || {};
    const user = await authenticateAdmin({ db, username, password });
    if (!user) return res.render("admin/login", { error: "Invalid username or password.", cancelHref: "/getpro-admin" });

    req.session.adminUser = {
      id: user.id,
      username: user.username,
      role: user.role || ROLES.TENANT_EDITOR,
      tenantId: user.tenant_id,
    };
    req.session.adminTenantScope = null;
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

  router.use((req, res, next) => {
    if (!req.session.adminUser) return next();
    if (isTenantViewer(req.session.adminUser.role)) {
      const p = req.path;
      if (p.startsWith("/categories") || p.startsWith("/companies") || p.startsWith("/cities")) {
        return res.redirect("/admin/leads");
      }
    }
    return next();
  });

  router.use((req, res, next) => {
    if (!req.session.adminUser) return next();
    const u = req.session.adminUser;
    const tid = getAdminTenantId(req);
    res.locals.adminNav = {
      role: u.role,
      isViewer: isTenantViewer(u.role),
      isSuper: isSuperAdmin(u.role),
      canEditDirectory: canEditDirectoryData(u.role),
      canManageUsers: canManageTenantUsers(u.role),
      tenantScoped: tid != null,
    };
    if (isSuperAdmin(u.role)) {
      const tn = db.prepare("SELECT id, slug, name FROM tenants WHERE id = ?").get(tid);
      res.locals.adminScopeTenant = tn || null;
      res.locals.adminScopeIsSession =
        req.session.adminTenantScope != null && Number(req.session.adminTenantScope) > 0;
    } else {
      res.locals.adminScopeTenant = null;
      res.locals.adminScopeIsSession = false;
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
    dbConn.prepare("DELETE FROM admin_users WHERE tenant_id = ?").run(tid);
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
    try {
      db.prepare("INSERT INTO tenants (id, slug, name, stage) VALUES (?, ?, ?, ?)").run(nextId, slug, name, stage);
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
    const r = db.prepare("UPDATE tenants SET name = ?, slug = ?, stage = ? WHERE id = ?").run(name, slug, stage, id);
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
      roles: [ROLES.SUPER_ADMIN, ROLES.TENANT_MANAGER, ROLES.TENANT_EDITOR, ROLES.TENANT_VIEWER],
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

    if (![ROLES.SUPER_ADMIN, ROLES.TENANT_MANAGER, ROLES.TENANT_EDITOR, ROLES.TENANT_VIEWER].includes(role)) {
      return res.status(400).send("Invalid role.");
    }

    const hash = await bcrypt.hash(password, 12);
    try {
      db.prepare("INSERT INTO admin_users (username, password_hash, role, tenant_id, enabled) VALUES (?, ?, ?, ?, 1)").run(
        username,
        hash,
        role,
        tenantId
      );
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
    return res.render("admin/super_user_edit", {
      user: row,
      error: null,
      tenants,
      roles: [ROLES.SUPER_ADMIN, ROLES.TENANT_MANAGER, ROLES.TENANT_EDITOR, ROLES.TENANT_VIEWER],
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
    if (![ROLES.SUPER_ADMIN, ROLES.TENANT_MANAGER, ROLES.TENANT_EDITOR, ROLES.TENANT_VIEWER].includes(role)) {
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
      return res.redirect("/admin/super/users?edit=1");
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
        "SELECT id, username, role, enabled, created_at FROM admin_users WHERE tenant_id = ? ORDER BY username"
      )
      .all(tid);
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
    if (![ROLES.TENANT_MANAGER, ROLES.TENANT_EDITOR, ROLES.TENANT_VIEWER].includes(role)) {
      return res.status(400).send("Invalid role.");
    }
    const hash = await bcrypt.hash(password, 12);
    try {
      db.prepare("INSERT INTO admin_users (username, password_hash, role, tenant_id, enabled) VALUES (?, ?, ?, ?, 1)").run(
        username,
        hash,
        role,
        tid
      );
      return res.redirect("/admin/users");
    } catch (e) {
      return res.status(400).send(`Could not create user: ${e.message}`);
    }
  });

  function loadTenantAdminUser(req, id) {
    const tid = getAdminTenantId(req);
    const row = db.prepare("SELECT * FROM admin_users WHERE id = ? AND tenant_id = ?").get(id, tid);
    return row;
  }

  router.get("/users/:id/edit", requireManageUsers, (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).send("Invalid id.");
    const row = loadTenantAdminUser(req, id);
    if (!row) return res.status(404).send("User not found.");
    if (row.role === ROLES.SUPER_ADMIN) return res.status(403).send("Cannot edit super admin here.");
    const tid = getAdminTenantId(req);
    return res.render("admin/user_edit", {
      user: row,
      error: null,
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
    if (![ROLES.TENANT_MANAGER, ROLES.TENANT_EDITOR, ROLES.TENANT_VIEWER].includes(role)) {
      return res.status(400).send("Invalid role.");
    }
    if (target.id === req.session.adminUser.id && enabled === 0) {
      return res.status(400).send("You cannot disable your own account.");
    }
    if (password && password.length < 8) return res.status(400).send("Password must be at least 8 characters.");

    let sql = "UPDATE admin_users SET username = ?, role = ?, enabled = ?";
    const params = [username, role, enabled];
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      sql += ", password_hash = ?";
      params.push(hash);
    }
    sql += " WHERE id = ? AND tenant_id = ?";
    params.push(id, getAdminTenantId(req));

    try {
      const r = db.prepare(sql).run(...params);
      if (r.changes === 0) return res.status(404).send("User not found.");
      return res.redirect("/admin/users");
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
    try {
      const r = db.prepare("DELETE FROM admin_users WHERE id = ? AND tenant_id = ?").run(id, getAdminTenantId(req));
      if (r.changes === 0) return res.status(404).send("User not found.");
      return res.redirect("/admin/users");
    } catch (e) {
      return res.status(400).send(`Could not delete user: ${e.message}`);
    }
  });

  router.get("/dashboard", (req, res) => {
    const u = req.session.adminUser;
    const tid = getAdminTenantId(req);

    const categoriesCount = db.prepare("SELECT COUNT(*) AS c FROM categories WHERE tenant_id = ?").get(tid).c;
    const companiesCount = db.prepare("SELECT COUNT(*) AS c FROM companies WHERE tenant_id = ?").get(tid).c;
    const leadsCount = db.prepare("SELECT COUNT(*) AS c FROM leads WHERE tenant_id = ?").get(tid).c;

    const latestLeads = db
      .prepare(
        `
        SELECT l.*, c.name AS company_name, c.subdomain AS company_subdomain, cat.slug AS company_category_slug
        FROM leads l
        INNER JOIN companies c ON c.id = l.company_id
        LEFT JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
        WHERE l.tenant_id = ?
        ORDER BY l.created_at DESC
        LIMIT 10
        `
      )
      .all(tid);

    return res.render("admin/dashboard", {
      categoriesCount,
      companiesCount,
      leadsCount,
      latestLeads,
      baseDomain: process.env.BASE_DOMAIN || "",
      role: u.role,
      isViewer: isTenantViewer(u.role),
    });
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
      return res.redirect("/admin/categories?edit=1");
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
      return res.redirect("/admin/categories?edit=1");
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
      return res.redirect("/admin/categories?edit=1");
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
      return res.redirect("/admin/cities?edit=1");
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
    return res.redirect("/admin/cities?edit=1");
  });

  router.post("/cities/:id/delete", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const tid = getAdminTenantId(req);
    db.prepare("DELETE FROM tenant_cities WHERE id = ? AND tenant_id = ?").run(req.params.id, tid);
    return res.redirect("/admin/cities?edit=1");
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
    return res.render("admin/companies", {
      companies: companiesWithUrls,
      baseDomain,
      adminTenantSlug: tenantSlug,
      editMode,
      filterSuffix,
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
    });
  });

  function syncCompanyReviews(dbConn, companyId, reviewsPayload) {
    const list = Array.isArray(reviewsPayload) ? reviewsPayload : [];
    const existing = dbConn.prepare("SELECT id FROM reviews WHERE company_id = ?").all(companyId).map((x) => x.id);
    const incomingIds = new Set(
      list.map((r) => r && r.id).filter((id) => id != null && String(id) !== "").map((id) => Number(id))
    );
    for (const eid of existing) {
      if (!incomingIds.has(eid)) {
        dbConn.prepare("DELETE FROM reviews WHERE id = ? AND company_id = ?").run(eid, companyId);
      }
    }
    const ins = dbConn.prepare(
      `INSERT INTO reviews (company_id, rating, body, author_name, created_at) VALUES (?, ?, ?, ?, datetime('now'))`
    );
    const upd = dbConn.prepare(
      `UPDATE reviews SET rating = ?, body = ?, author_name = ? WHERE id = ? AND company_id = ?`
    );
    for (const r of list) {
      let rating = Number(r && r.rating);
      if (!Number.isFinite(rating)) rating = 5;
      rating = Math.min(5, Math.max(1, rating));
      const body = String((r && r.body) || "").trim();
      const author = String((r && r.author_name) || "").trim() || "Customer";
      const rid = r && r.id != null && String(r.id) !== "" ? Number(r.id) : null;
      if (rid && !body) {
        dbConn.prepare("DELETE FROM reviews WHERE id = ? AND company_id = ?").run(rid, companyId);
        continue;
      }
      if (!body && !rid) continue;
      if (rid) {
        upd.run(rating, body, author, rid, companyId);
      } else {
        ins.run(companyId, rating, body, author);
      }
    }
  }

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
    const reviews = db
      .prepare(
        `SELECT id, rating, body, author_name, created_at FROM reviews WHERE company_id = ? ORDER BY datetime(created_at) DESC`
      )
      .all(cid);
    return res.render("admin/company_workspace", {
      company,
      categories,
      galleryAdminText,
      reviews,
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
      const reviews = req.body && req.body.reviews ? req.body.reviews : [];
      const merged = mergeDraftCompanyForPreview(db, baseRow, draft);
      const locals = await buildCompanyPageLocals(req, db, merged, { reviewOverride: reviews });
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
    const reviewsPayload = (req.body && req.body.reviews) || [];

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
        syncCompanyReviews(db, cid, reviewsPayload);
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
      return res.redirect("/admin/companies?edit=1");
    } catch (e) {
      return res.status(400).send(`Could not create company: ${e.message}`);
    }
  });

  router.get("/companies/:id/edit", requireDirectoryEditor, (req, res) => {
    return res.redirect(`/admin/companies/${encodeURIComponent(req.params.id)}/workspace`);
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
      return res.redirect("/admin/companies?edit=1");
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
      return res.redirect("/admin/companies?edit=1");
    } catch (e) {
      return res.status(400).send(`Could not delete company: ${e.message}`);
    }
  });

  router.get("/leads", (req, res) => {
    const tid = getAdminTenantId(req);
    const companyId = req.query.company_id ? Number(req.query.company_id) : null;
    const companies = db
      .prepare("SELECT id, name, subdomain FROM companies WHERE tenant_id = ? ORDER BY name ASC")
      .all(tid);

    let leads;
    if (companyId) {
      leads = db
        .prepare(
          `
          SELECT l.*, c.name AS company_name, c.subdomain AS company_subdomain
          FROM leads l
          INNER JOIN companies c ON c.id = l.company_id
          WHERE l.company_id = ? AND l.tenant_id = ? AND c.tenant_id = ?
          ORDER BY l.created_at DESC
          `
        )
        .all(companyId, tid, tid);
    } else {
      leads = db
        .prepare(
          `
          SELECT l.*, c.name AS company_name, c.subdomain AS company_subdomain
          FROM leads l
          INNER JOIN companies c ON c.id = l.company_id
          WHERE l.tenant_id = ?
          ORDER BY l.created_at DESC
          LIMIT 200
          `
        )
        .all(tid);
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
        SELECT id, profession, city, name, phone, vat_or_pacra, created_at
        FROM professional_signups
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 200
        `
      )
      .all(tid);

    return res.render("admin/leads", {
      leads,
      partnerCallbacks,
      partnerSignups,
      companies,
      selectedCompanyId: companyId,
      role: req.session.adminUser.role,
      isViewer: isTenantViewer(req.session.adminUser.role),
    });
  });

  return router;
};
