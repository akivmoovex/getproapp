/**
 * Super admin /super*.
 */
const bcrypt = require("bcryptjs");
const { requireSuperAdmin, requireNotViewer } = require("../../auth");
const { normalizeRole, ROLES } = require("../../auth/roles");
const { STAGES, normalizeStage } = require("../../tenants/tenantStages");
const { TENANT_ZM } = require("../../tenants/tenantIds");
const {
  DEFAULT_CALLCENTER_PHONE,
  DEFAULT_SUPPORT_HELP_PHONE,
  DEFAULT_WHATSAPP_PHONE,
  DEFAULT_CALLCENTER_EMAIL,
} = require("../../tenants/tenantContactSupport");
const { upsertMembership } = require("../../auth/adminUserTenants");
const { redirectWithEmbed, parseEditMode, filterSuffixFromQuery } = require("./adminShared");

module.exports = function registerAdminSuperRoutes(router, deps) {
  const { db } = deps;
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
};
