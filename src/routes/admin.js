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
const { isValidPhoneForTenant } = require("../tenants");

function getAdminTenantId(req) {
  const u = req.session && req.session.adminUser;
  if (!u) return TENANT_ZM;
  if (isSuperAdmin(u.role)) {
    const tid = req.session.adminTenantScope;
    if (tid != null && Number(tid) > 0) return Number(tid);
    return null;
  }
  const t = u.tenantId;
  return t != null && Number(t) > 0 ? Number(t) : TENANT_ZM;
}

function getCategoriesForSelect(db, tenantId) {
  return db
    .prepare("SELECT id, slug, name FROM categories WHERE tenant_id = ? ORDER BY sort ASC, name ASC")
    .all(tenantId);
}

function requireManageUsers(req, res, next) {
  if (!req.session.adminUser) return res.redirect("/admin/login");
  if (!canManageTenantUsers(req.session.adminUser.role)) {
    return res.status(403).type("text").send("User management requires tenant manager or super admin.");
  }
  if (isSuperAdmin(req.session.adminUser.role) && getAdminTenantId(req) == null) {
    return res.redirect("/admin/super?need=tenant");
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
      const g = db.prepare("SELECT id FROM tenants WHERE slug = 'global' AND stage = ?").get(STAGES.ENABLED);
      if (g && g.id) {
        req.session.adminTenantScope = g.id;
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
    return next();
  });

  // —— Super admin ——
  router.get("/super", requireSuperAdmin, (req, res) => {
    const tenants = db.prepare("SELECT * FROM tenants ORDER BY id ASC").all();
    const need = req.query.need === "tenant";
    return res.render("admin/super", { tenants, needTenant: need, stages: STAGES });
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
      return res.redirect("/admin/super/users");
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
      return res.redirect("/admin/super/users");
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
      return res.redirect("/admin/super/users");
    } catch (e) {
      return res.status(400).send(`Could not delete user: ${e.message}`);
    }
  });

  router.get("/super/users", requireSuperAdmin, (req, res) => {
    const gzSummary = superUsersListQuery(db, "global_zm");
    const allUsers = superUsersListQuery(db, "all");
    const { globalId, zmId } = getGlobalAndZmTenantIds(db);
    return res.render("admin/super_users", {
      gzSummary,
      allUsers,
      globalId,
      zmId,
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
    if (isSuperAdmin(u.role) && getAdminTenantId(req) == null) {
      return res.redirect("/admin/super");
    }
    const tid = getAdminTenantId(req);
    if (tid == null) return res.redirect("/admin/super");

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
    if (tid == null) return res.redirect("/admin/super");
    const categories = db
      .prepare("SELECT * FROM categories WHERE tenant_id = ? ORDER BY sort ASC, name ASC")
      .all(tid);
    return res.render("admin/categories", { categories });
  });

  router.get("/categories/new", requireDirectoryEditor, (req, res) => {
    if (getAdminTenantId(req) == null) return res.redirect("/admin/super");
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
      if (tid == null) return res.redirect("/admin/super");
      db.prepare("INSERT INTO categories (tenant_id, slug, name) VALUES (?, ?, ?)").run(tid, cleanSlug, cleanName);
      return res.redirect("/admin/categories");
    } catch (e) {
      return res.status(400).send(`Could not create category: ${e.message}`);
    }
  });

  router.get("/categories/:id/edit", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    if (tid == null) return res.redirect("/admin/super");
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
      if (tid == null) return res.redirect("/admin/super");
      const r = db
        .prepare("UPDATE categories SET slug = ?, name = ? WHERE id = ? AND tenant_id = ?")
        .run(cleanSlug, cleanName, req.params.id, tid);
      if (r.changes === 0) return res.status(404).send("Category not found");
      return res.redirect("/admin/categories");
    } catch (e) {
      return res.status(400).send(`Could not update category: ${e.message}`);
    }
  });

  router.post("/categories/:id/delete", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const catId = Number(req.params.id);
    if (!catId) return res.status(400).send("Invalid id");
    const tid = getAdminTenantId(req);
    if (tid == null) return res.redirect("/admin/super");
    const inTx = db.transaction(() => {
      db.prepare("UPDATE companies SET category_id = NULL WHERE category_id = ? AND tenant_id = ?").run(catId, tid);
      db.prepare("DELETE FROM categories WHERE id = ? AND tenant_id = ?").run(catId, tid);
    });
    try {
      inTx();
      return res.redirect("/admin/categories");
    } catch (e) {
      return res.status(400).send(`Could not delete category: ${e.message}`);
    }
  });

  router.get("/cities", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    if (tid == null) return res.redirect("/admin/super");
    const cities = db
      .prepare("SELECT * FROM tenant_cities WHERE tenant_id = ? ORDER BY name COLLATE NOCASE ASC")
      .all(tid);
    return res.render("admin/cities", { cities });
  });

  router.post("/cities", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).send("City name is required.");
    const enabled = req.body.enabled === "1" || req.body.enabled === "on" ? 1 : 0;
    const bigCity = req.body.big_city === "1" || req.body.big_city === "on" ? 1 : 0;
    const tid = getAdminTenantId(req);
    if (tid == null) return res.redirect("/admin/super");
    try {
      db.prepare("INSERT INTO tenant_cities (tenant_id, name, enabled, big_city) VALUES (?, ?, ?, ?)").run(
        tid,
        name,
        enabled,
        bigCity
      );
      return res.redirect("/admin/cities");
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
    if (tid == null) return res.redirect("/admin/super");
    const r = db
      .prepare("UPDATE tenant_cities SET name = ?, enabled = ?, big_city = ? WHERE id = ? AND tenant_id = ?")
      .run(cleanName, enabled, bigCity, req.params.id, tid);
    if (r.changes === 0) return res.status(404).send("City not found");
    return res.redirect("/admin/cities");
  });

  router.post("/cities/:id/delete", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const tid = getAdminTenantId(req);
    if (tid == null) return res.redirect("/admin/super");
    db.prepare("DELETE FROM tenant_cities WHERE id = ? AND tenant_id = ?").run(req.params.id, tid);
    return res.redirect("/admin/cities");
  });

  router.get("/companies", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    if (tid == null) return res.redirect("/admin/super");
    const companies = db
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
    return res.render("admin/companies", { companies, baseDomain: process.env.BASE_DOMAIN || "" });
  });

  router.get("/companies/new", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    if (tid == null) return res.redirect("/admin/super");
    const categories = getCategoriesForSelect(db, tid);
    const ts = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    return res.render("admin/company_form", {
      company: null,
      categories,
      baseDomain: process.env.BASE_DOMAIN || "getproapp.org",
      adminTenantSlug: ts ? ts.slug : "",
    });
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
    } = req.body || {};

    const cleanName = String(name).trim();
    const cleanSubdomain = String(subdomain).trim().toLowerCase();
    if (!cleanName) return res.status(400).send("Company name is required.");
    if (!cleanSubdomain) return res.status(400).send("Company subdomain is required.");

    const catId = category_id ? Number(category_id) : null;
    const tid = getAdminTenantId(req);
    if (tid == null) return res.redirect("/admin/super");

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

    try {
      db.prepare(
        `
        INSERT INTO companies
          (subdomain, name, category_id, headline, about, services, phone, email, location, featured_cta_label, featured_cta_phone, tenant_id, updated_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
        tid
      );
      return res.redirect("/admin/companies");
    } catch (e) {
      return res.status(400).send(`Could not create company: ${e.message}`);
    }
  });

  router.get("/companies/:id/edit", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    if (tid == null) return res.redirect("/admin/super");
    const company = db.prepare("SELECT * FROM companies WHERE id = ? AND tenant_id = ?").get(req.params.id, tid);
    if (!company) return res.status(404).send("Company not found");
    const categories = getCategoriesForSelect(db, tid);
    const tsEdit = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    return res.render("admin/company_form", {
      company,
      categories,
      baseDomain: process.env.BASE_DOMAIN || "getproapp.org",
      adminTenantSlug: tsEdit ? tsEdit.slug : "",
    });
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
    } = req.body || {};

    const cleanName = String(name).trim();
    const cleanSubdomain = String(subdomain).trim().toLowerCase();
    if (!cleanName) return res.status(400).send("Company name is required.");
    if (!cleanSubdomain) return res.status(400).send("Company subdomain is required.");

    const catId = category_id ? Number(category_id) : null;
    const tid = getAdminTenantId(req);
    if (tid == null) return res.redirect("/admin/super");

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
        req.params.id,
        tid
      );
      if (r.changes === 0) return res.status(404).send("Company not found");
      return res.redirect("/admin/companies");
    } catch (e) {
      return res.status(400).send(`Could not update company: ${e.message}`);
    }
  });

  router.post("/companies/:id/delete", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const companyId = Number(req.params.id);
    if (!companyId) return res.status(400).send("Invalid id");
    const tid = getAdminTenantId(req);
    if (tid == null) return res.redirect("/admin/super");
    try {
      db.prepare("DELETE FROM leads WHERE company_id = ? AND tenant_id = ?").run(companyId, tid);
      db.prepare("DELETE FROM companies WHERE id = ? AND tenant_id = ?").run(companyId, tid);
      return res.redirect("/admin/companies");
    } catch (e) {
      return res.status(400).send(`Could not delete company: ${e.message}`);
    }
  });

  router.get("/leads", (req, res) => {
    const tid = getAdminTenantId(req);
    if (tid == null) return res.redirect("/admin/super");
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
