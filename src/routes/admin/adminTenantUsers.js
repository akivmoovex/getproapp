/**
 * Tenant-scoped /users*.
 */
const bcrypt = require("bcryptjs");
const { requireNotViewer, isSuperAdmin } = require("../../auth");
const { normalizeRole, ROLES } = require("../../auth/roles");
const { upsertMembership } = require("../../auth/adminUserTenants");
const { redirectWithEmbed, getAdminTenantId, requireManageUsers } = require("./adminShared");

module.exports = function registerAdminTenantUsersRoutes(router, deps) {
  const { db } = deps;
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
};
