/**
 * Tenant-scoped /users*.
 */
const bcrypt = require("bcryptjs");
const { requireNotViewer, isSuperAdmin } = require("../../auth");
const { normalizeRole, ROLES } = require("../../auth/roles");
const { upsertMembershipAsync } = require("../../auth/adminUserTenants");
const { redirectWithEmbed, getAdminTenantId, requireManageUsers } = require("./adminShared");
const { getPgPool } = require("../../db/pg");
const adminUsersRepo = require("../../db/pg/adminUsersRepo");
const adminUserTenantRolesRepo = require("../../db/pg/adminUserTenantRolesRepo");

module.exports = function registerAdminTenantUsersRoutes(router, _deps) {
  // —— Tenant user management ——
  router.get("/users", requireManageUsers, async (req, res, next) => {
    try {
      const tid = getAdminTenantId(req);
      const pool = getPgPool();
      const users = await adminUsersRepo.listUsersForTenantScope(pool, tid);
      return res.render("admin/users", { users, tenantId: tid });
    } catch (e) {
      return next(e);
    }
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
    if (
      ![ROLES.TENANT_MANAGER, ROLES.TENANT_EDITOR, ROLES.TENANT_AGENT, ROLES.TENANT_VIEWER, ROLES.CSR].includes(role)
    ) {
      return res.status(400).send("Invalid role.");
    }
    const hash = await bcrypt.hash(password, 12);
    const pool = getPgPool();
    try {
      const newId = await adminUsersRepo.insertUser(pool, {
        username,
        passwordHash: hash,
        role,
        tenantId: tid,
        displayName: "",
      });
      await upsertMembershipAsync(pool, newId, Number(tid), role);
      return res.redirect(redirectWithEmbed(req, "/admin/users"));
    } catch (e) {
      return res.status(400).send(`Could not create user: ${e.message}`);
    }
  });

  router.get("/users/:id/edit", requireManageUsers, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).send("Invalid id.");
      const tid = getAdminTenantId(req);
      const pool = getPgPool();
      const row = await adminUsersRepo.getUserInTenantScope(pool, id, tid);
      if (!row) return res.status(404).send("User not found.");
      if (row.role === ROLES.SUPER_ADMIN) return res.status(403).send("Cannot edit super admin here.");
      const saved = req.query.saved === "1" || req.query.saved === "true";
      return res.render("admin/user_edit", {
        user: row,
        error: null,
        saved,
        tenantId: tid,
        currentUserId: req.session.adminUser.id,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post("/users/:id", requireManageUsers, requireNotViewer, async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).send("Invalid id.");
    const scopedTid = getAdminTenantId(req);
    const pool = getPgPool();
    const target = await adminUsersRepo.getUserInTenantScope(pool, id, scopedTid);
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
    if (
      ![ROLES.TENANT_MANAGER, ROLES.TENANT_EDITOR, ROLES.TENANT_AGENT, ROLES.TENANT_VIEWER, ROLES.CSR].includes(role)
    ) {
      return res.status(400).send("Invalid role.");
    }
    if (target.id === req.session.adminUser.id && enabled === 0) {
      return res.status(400).send("You cannot disable your own account.");
    }
    if (password && password.length < 8) return res.status(400).send("Password must be at least 8 characters.");

    const passwordHash = password ? await bcrypt.hash(password, 12) : null;

    try {
      const ok = await adminUsersRepo.updateTenantScopedUser(pool, id, {
        username,
        role,
        enabledNum: enabled,
        passwordHash,
      });
      if (!ok) return res.status(404).send("User not found.");
      await upsertMembershipAsync(pool, id, Number(scopedTid), role);
      if (req.session.adminUser && Number(req.session.adminUser.id) === Number(id)) {
        req.session.adminUser.role = role;
      }
      return res.redirect(redirectWithEmbed(req, `/admin/users/${id}/edit?saved=1`));
    } catch (e) {
      return res.status(400).send(`Could not update user: ${e.message}`);
    }
  });

  router.post("/users/:id/delete", requireManageUsers, requireNotViewer, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).send("Invalid id.");
      const scopedTid = getAdminTenantId(req);
      const pool = getPgPool();
      const target = await adminUsersRepo.getUserInTenantScope(pool, id, scopedTid);
      if (!target) return res.status(404).send("User not found.");
      if (target.role === ROLES.SUPER_ADMIN) return res.status(403).send("Cannot delete super admin here.");
      if (target.id === req.session.adminUser.id) return res.status(400).send("Cannot delete your own account.");

      await adminUserTenantRolesRepo.deleteForUserAndTenant(pool, id, scopedTid);
      const remaining = await adminUserTenantRolesRepo.countForUser(pool, id);
      if (Number(remaining) === 0) {
        const ok = await adminUsersRepo.deleteById(pool, id);
        if (!ok) return res.status(404).send("User not found.");
      } else {
        const nextMembership = await adminUserTenantRolesRepo.getFirstMembershipOrderByTenant(pool, id);
        if (nextMembership) {
          await adminUsersRepo.updateRoleTenantHome(pool, id, nextMembership.role, nextMembership.tenant_id);
        }
      }
      return res.redirect(redirectWithEmbed(req, "/admin/users"));
    } catch (e) {
      return next(e);
    }
  });
};
