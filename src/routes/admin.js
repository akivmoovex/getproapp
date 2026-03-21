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

function getAdminTenantId(req) {
  const u = req.session && req.session.adminUser;
  if (!u) return 1;
  if (isSuperAdmin(u.role)) {
    const tid = req.session.adminTenantScope;
    if (tid != null && Number(tid) > 0) return Number(tid);
    return null;
  }
  const t = u.tenantId;
  return t != null && Number(t) > 0 ? Number(t) : 1;
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

function seedCategoriesFromTenant(db, destTenantId, srcTenantId) {
  const n = db.prepare("SELECT COUNT(*) AS c FROM categories WHERE tenant_id = ?").get(destTenantId).c;
  if (n > 0) return;
  const rows = db.prepare("SELECT slug, name, sort FROM categories WHERE tenant_id = ? ORDER BY sort ASC").all(srcTenantId);
  const ins = db.prepare(
    "INSERT INTO categories (tenant_id, slug, name, sort, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
  );
  for (const r of rows) {
    ins.run(destTenantId, r.slug, r.name, r.sort);
  }
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
      if (p.startsWith("/categories") || p.startsWith("/companies")) {
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

  router.post("/super/tenants", requireSuperAdmin, (req, res) => {
    const slug = String(req.body.slug || "")
      .trim()
      .toLowerCase();
    const name = String(req.body.name || "").trim();
    const stage = normalizeStage(req.body.stage || STAGES.PARTNER_COLLECTION);
    if (!slug || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
      return res.status(400).send("Invalid slug.");
    }
    if (!name) return res.status(400).send("Name is required.");
    const maxRow = db.prepare("SELECT MAX(id) AS m FROM tenants").get();
    const nextId = (maxRow && maxRow.m ? Number(maxRow.m) : 0) + 1;
    try {
      db.prepare("INSERT INTO tenants (id, slug, name, stage) VALUES (?, ?, ?, ?)").run(nextId, slug, name, stage);
      seedCategoriesFromTenant(db, nextId, 1);
      return res.redirect("/admin/super");
    } catch (e) {
      return res.status(400).send(`Could not create tenant: ${e.message}`);
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

  // —— Tenant user management ——
  router.get("/users", requireManageUsers, (req, res) => {
    const tid = getAdminTenantId(req);
    const users = db
      .prepare("SELECT id, username, role, created_at FROM admin_users WHERE tenant_id = ? ORDER BY username")
      .all(tid);
    return res.render("admin/users", { users, tenantId: tid });
  });

  router.get("/users/new", requireManageUsers, (req, res) => {
    const tid = getAdminTenantId(req);
    return res.render("admin/user_form", { error: null, tenantId: tid });
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
      db.prepare("INSERT INTO admin_users (username, password_hash, role, tenant_id) VALUES (?, ?, ?, ?)").run(
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
    return res.render("admin/company_form", {
      company: null,
      categories,
      baseDomain: process.env.BASE_DOMAIN || "getproapp.org",
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
    return res.render("admin/company_form", { company, categories, baseDomain: process.env.BASE_DOMAIN || "getproapp.org" });
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

    return res.render("admin/leads", {
      leads,
      companies,
      selectedCompanyId: companyId,
      role: req.session.adminUser.role,
      isViewer: isTenantViewer(req.session.adminUser.role),
    });
  });

  return router;
};
