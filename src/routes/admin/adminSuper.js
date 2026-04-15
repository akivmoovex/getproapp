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
const { upsertMembershipAsync } = require("../../auth/adminUserTenants");
const { redirectWithEmbed, parseEditMode, filterSuffixFromQuery } = require("./adminShared");
const { getPgPool } = require("../../db/pg");
const adminUsersRepo = require("../../db/pg/adminUsersRepo");
const adminUserTenantRolesRepo = require("../../db/pg/adminUserTenantRolesRepo");
const tenantsRepo = require("../../db/pg/tenantsRepo");
const categoriesRepo = require("../../db/pg/categoriesRepo");
const tenantScopedDeleteRepo = require("../../db/pg/tenantScopedDeleteRepo");

module.exports = function registerAdminSuperRoutes(router) {
  // —— Super admin ——
  router.get("/super", requireSuperAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const rows = await tenantsRepo.listOrderedById(pool);
      const tenants = rows.map((r) => tenantsRepo.serializeTenantRow(r));
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
    } catch (e) {
      return next(e);
    }
  });

  router.post("/super/scope", requireSuperAdmin, async (req, res, next) => {
    try {
      const tid = req.body.tenant_id != null ? Number(req.body.tenant_id) : null;
      if (tid && tid > 0) {
        const pool = getPgPool();
        const ok = await tenantsRepo.tenantExistsById(pool, tid);
        if (!ok) return res.status(400).send("Invalid tenant.");
        req.session.adminTenantScope = tid;
      } else {
        req.session.adminTenantScope = null;
      }
      req.session.save((err) => {
        if (err) return next(err);
        res.redirect(req.body.redirect || "/admin/dashboard");
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/super/tenants/new", requireSuperAdmin, (req, res) => {
    return res.render("admin/super_tenant_form", {
      tenant: null,
      stages: STAGES,
      error: null,
      baseDomain: process.env.BASE_DOMAIN || "",
    });
  });

  router.post("/super/tenants", requireSuperAdmin, async (req, res) => {
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
    const pool = getPgPool();
    try {
      const dup = await tenantsRepo.slugExists(pool, slug);
      if (dup) return res.status(400).send("This short code is already in use.");
      const nextId = await tenantsRepo.getNextTenantId(pool);
      const callcenter_phone = String(req.body.callcenter_phone || "").trim() || DEFAULT_CALLCENTER_PHONE;
      const support_help_phone = String(req.body.support_help_phone || "").trim() || DEFAULT_SUPPORT_HELP_PHONE;
      const whatsapp_phone = String(req.body.whatsapp_phone || "").trim() || DEFAULT_WHATSAPP_PHONE;
      const callcenter_email = String(req.body.callcenter_email || "").trim() || DEFAULT_CALLCENTER_EMAIL;
      await tenantsRepo.insertWithExplicitId(pool, {
        id: nextId,
        slug,
        name,
        stage,
        callcenter_phone,
        support_help_phone,
        whatsapp_phone,
        callcenter_email,
      });
      await categoriesRepo.copyFromTenantIfDestEmpty(pool, nextId, TENANT_ZM);
      return res.redirect("/admin/super");
    } catch (e) {
      return res.status(400).send(`Could not create region: ${e.message}`);
    }
  });

  router.get("/super/tenants/:id/edit", requireSuperAdmin, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const pool = getPgPool();
      const row = await tenantsRepo.getById(pool, id);
      if (!row) return res.status(404).send("Region not found");
      const tenant = tenantsRepo.serializeTenantRow(row);
      return res.render("admin/super_tenant_form", {
        tenant,
        stages: STAGES,
        error: null,
        baseDomain: process.env.BASE_DOMAIN || "",
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post("/super/tenants/:id", requireSuperAdmin, async (req, res) => {
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
    const pool = getPgPool();
    const dup = await tenantsRepo.slugExistsExcludingId(pool, slug, id);
    if (dup) return res.status(400).send("This short code is already in use.");
    const callcenter_phone = String(req.body.callcenter_phone || "").trim() || DEFAULT_CALLCENTER_PHONE;
    const support_help_phone = String(req.body.support_help_phone || "").trim() || DEFAULT_SUPPORT_HELP_PHONE;
    const whatsapp_phone = String(req.body.whatsapp_phone || "").trim() || DEFAULT_WHATSAPP_PHONE;
    const callcenter_email = String(req.body.callcenter_email || "").trim() || DEFAULT_CALLCENTER_EMAIL;
    const ok = await tenantsRepo.updateSuperTenantForm(pool, id, {
      name,
      slug,
      stage,
      callcenter_phone,
      support_help_phone,
      whatsapp_phone,
      callcenter_email,
    });
    if (!ok) return res.status(404).send("Region not found");
    return res.redirect("/admin/super");
  });

  router.post("/super/tenants/:id/delete", requireSuperAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!id || id === 1) return res.status(400).send("Cannot delete this region.");
    const pool = getPgPool();
    try {
      const row = await tenantsRepo.getIdSlugById(pool, id);
      if (!row) return res.status(404).send("Region not found");
      if (row.slug === "global") return res.status(400).send("Cannot delete the global region.");
      await tenantScopedDeleteRepo.deleteTenantScopedData(pool, id);
      return res.redirect("/admin/super");
    } catch (e) {
      return res.status(400).send(`Could not delete: ${e.message}`);
    }
  });

  router.post("/super/tenants/:id/stage", requireSuperAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const stage = normalizeStage(req.body.stage);
    if (!id) return res.status(400).send("Invalid id.");
    const pool = getPgPool();
    const ok = await tenantsRepo.updateStageById(pool, id, stage);
    if (!ok) return res.status(404).send("Tenant not found.");
    return res.redirect("/admin/super");
  });

  router.get("/super/users/new", requireSuperAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tenants = (await tenantsRepo.listOrderedById(pool)).map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        stage: t.stage,
      }));
      return res.render("admin/super_user_form", {
        error: null,
        tenants,
        roles: [
          ROLES.SUPER_ADMIN,
          ROLES.TENANT_MANAGER,
          ROLES.CSR,
          ROLES.TENANT_EDITOR,
          ROLES.TENANT_AGENT,
          ROLES.TENANT_VIEWER,
          ROLES.FINANCE_VIEWER,
          ROLES.FINANCE_OPERATOR,
          ROLES.FINANCE_MANAGER,
        ],
      });
    } catch (e) {
      return next(e);
    }
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
    }

    const pool = getPgPool();
    if (role !== ROLES.SUPER_ADMIN) {
      const ok = await adminUsersRepo.tenantExistsById(pool, tenantId);
      if (!ok) return res.status(400).send("Invalid tenant.");
    }

    if (
      ![
        ROLES.SUPER_ADMIN,
        ROLES.TENANT_MANAGER,
        ROLES.CSR,
        ROLES.TENANT_EDITOR,
        ROLES.TENANT_AGENT,
        ROLES.TENANT_VIEWER,
        ROLES.FINANCE_VIEWER,
        ROLES.FINANCE_OPERATOR,
        ROLES.FINANCE_MANAGER,
      ].includes(role)
    ) {
      return res.status(400).send("Invalid role.");
    }

    const hash = await bcrypt.hash(password, 12);
    try {
      const newId = await adminUsersRepo.insertUser(pool, {
        username,
        passwordHash: hash,
        role,
        tenantId,
        displayName: "",
      });
      if (role !== ROLES.SUPER_ADMIN && tenantId != null && Number(tenantId) > 0) {
        await upsertMembershipAsync(pool, newId, Number(tenantId), role);
      }
      return res.redirect("/admin/super/users?edit=1");
    } catch (e) {
      return res.status(400).send(`Could not create user: ${e.message}`);
    }
  });

  router.get("/super/users/:id/edit", requireSuperAdmin, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).send("Invalid id.");
      const pool = getPgPool();
      const row = await adminUsersRepo.getById(pool, id);
      const tenants = (await tenantsRepo.listOrderedById(pool)).map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        stage: t.stage,
      }));
      if (!row) return res.status(404).send("User not found.");
      let tenantName = "";
      let tenantSlug = "";
      if (row.tenant_id) {
        const tr = await adminUsersRepo.getTenantNameSlug(pool, row.tenant_id);
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
        roles: [
          ROLES.SUPER_ADMIN,
          ROLES.TENANT_MANAGER,
          ROLES.CSR,
          ROLES.TENANT_EDITOR,
          ROLES.TENANT_AGENT,
          ROLES.TENANT_VIEWER,
          ROLES.FINANCE_VIEWER,
          ROLES.FINANCE_OPERATOR,
          ROLES.FINANCE_MANAGER,
        ],
        currentUserId: req.session.adminUser.id,
        currentTenantLabel,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post("/super/users/:id", requireSuperAdmin, requireNotViewer, async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).send("Invalid id.");
    const pool = getPgPool();
    const target = await adminUsersRepo.getById(pool, id);
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
      const okTenant = await adminUsersRepo.tenantExistsById(pool, tenantId);
      if (!okTenant) return res.status(400).send("Invalid tenant.");
    }
    if (
      ![
        ROLES.SUPER_ADMIN,
        ROLES.TENANT_MANAGER,
        ROLES.CSR,
        ROLES.TENANT_EDITOR,
        ROLES.TENANT_AGENT,
        ROLES.TENANT_VIEWER,
        ROLES.FINANCE_VIEWER,
        ROLES.FINANCE_OPERATOR,
        ROLES.FINANCE_MANAGER,
      ].includes(role)
    ) {
      return res.status(400).send("Invalid role.");
    }
    if (target.id === req.session.adminUser.id && enabled === 0) {
      return res.status(400).send("You cannot disable your own account.");
    }
    if (password && password.length < 8) return res.status(400).send("Password must be at least 8 characters.");

    const superEnabled = await adminUsersRepo.countByRoleAndEnabled(pool, ROLES.SUPER_ADMIN, true);
    if (
      target.role === ROLES.SUPER_ADMIN &&
      (role !== ROLES.SUPER_ADMIN || enabled === 0) &&
      Number(superEnabled) <= 1
    ) {
      return res.status(400).send("Cannot remove or disable the last super admin.");
    }

    const passwordHash = password ? await bcrypt.hash(password, 12) : null;

    try {
      const ok = await adminUsersRepo.updateSuperConsoleUser(pool, id, {
        username,
        role,
        tenantId,
        enabledNum: enabled,
        passwordHash,
      });
      if (!ok) return res.status(404).send("User not found.");
      await adminUserTenantRolesRepo.deleteAllForUser(pool, id);
      if (role !== ROLES.SUPER_ADMIN && tenantId != null && Number(tenantId) > 0) {
        await upsertMembershipAsync(pool, id, Number(tenantId), role);
      }
      return res.redirect(redirectWithEmbed(req, `/admin/super/users/${id}/edit?saved=1`));
    } catch (e) {
      return res.status(400).send(`Could not update user: ${e.message}`);
    }
  });

  router.post("/super/users/:id/delete", requireSuperAdmin, requireNotViewer, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).send("Invalid id.");
      const pool = getPgPool();
      const target = await adminUsersRepo.getById(pool, id);
      if (!target) return res.status(404).send("User not found.");
      if (target.id === req.session.adminUser.id) return res.status(400).send("Cannot delete your own account.");
      const superCount = await adminUsersRepo.countByRoleAndEnabled(pool, ROLES.SUPER_ADMIN, false);
      if (target.role === ROLES.SUPER_ADMIN && Number(superCount) <= 1) {
        return res.status(400).send("Cannot delete the last super admin.");
      }
      const deleted = await adminUsersRepo.deleteById(pool, id);
      if (!deleted) return res.status(404).send("User not found.");
      return res.redirect("/admin/super/users?edit=1");
    } catch (e) {
      return next(e);
    }
  });

  router.get("/super/users", requireSuperAdmin, async (req, res, next) => {
    try {
      const pool = getPgPool();
      let allUsers = await adminUsersRepo.listForSuperConsole(pool, "all");
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
    } catch (e) {
      return next(e);
    }
  });
};
