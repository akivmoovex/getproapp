const express = require("express");
const slugify = require("slugify");
const { requireAdmin, authenticateAdmin } = require("../auth");

function getAdminTenantId(req) {
  const t = req.session && req.session.adminUser && req.session.adminUser.tenantId;
  const n = Number(t);
  return n > 0 ? n : 1;
}

function getCategoriesForSelect(db, tenantId) {
  return db
    .prepare("SELECT id, slug, name FROM categories WHERE tenant_id = ? ORDER BY sort ASC, name ASC")
    .all(tenantId);
}

module.exports = function adminRoutes({ db }) {
  const router = express.Router();

  router.get("/login", (req, res) => {
    if (req.session && req.session.adminUser) return res.redirect("/admin/dashboard");
    return res.render("admin/login", { error: null });
  });

  router.post("/login", async (req, res) => {
    const { username = "", password = "" } = req.body || {};
    const user = await authenticateAdmin({ db, username, password });
    if (!user) return res.render("admin/login", { error: "Invalid username or password." });

    req.session.adminUser = {
      id: user.id,
      username: user.username,
      tenantId: user.tenant_id != null ? user.tenant_id : 1,
    };
    return res.redirect("/admin/dashboard");
  });

  router.post("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/admin/login"));
  });

  router.use((req, res, next) => {
    if (!req.path.startsWith("/login")) return requireAdmin(req, res, next);
    return next();
  });

  router.get("/dashboard", (req, res) => {
    const tid = getAdminTenantId(req);
    const categoriesCount = db.prepare("SELECT COUNT(*) AS c FROM categories WHERE tenant_id = ?").get(tid).c;
    const companiesCount = db.prepare("SELECT COUNT(*) AS c FROM companies WHERE tenant_id = ?").get(tid).c;
    const leadsCount = db.prepare("SELECT COUNT(*) AS c FROM leads WHERE tenant_id = ?").get(tid).c;

    const latestLeads = db
      .prepare(
        `
        SELECT l.*, c.name AS company_name, cat.slug AS company_category_slug
        FROM leads l
        INNER JOIN companies c ON c.id = l.company_id
        LEFT JOIN categories cat ON cat.id = c.category_id
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
    });
  });

  // Categories
  router.get("/categories", (req, res) => {
    const tid = getAdminTenantId(req);
    const categories = db
      .prepare("SELECT * FROM categories WHERE tenant_id = ? ORDER BY sort ASC, name ASC")
      .all(tid);
    return res.render("admin/categories", { categories });
  });

  router.get("/categories/new", (_req, res) => {
    return res.render("admin/category_form", { category: null });
  });

  router.post("/categories", (req, res) => {
    const { name = "", slug = "" } = req.body || {};
    const cleanName = String(name).trim();
    const cleanSlug = String(slug || "").trim() ? String(slug).trim().toLowerCase() : slugify(cleanName);

    if (!cleanName) return res.status(400).send("Category name is required.");
    if (!cleanSlug) return res.status(400).send("Category slug is required.");

    try {
      const tid = getAdminTenantId(req);
      db.prepare("INSERT INTO categories (tenant_id, slug, name) VALUES (?, ?, ?)").run(tid, cleanSlug, cleanName);
      return res.redirect("/admin/categories");
    } catch (e) {
      return res.status(400).send(`Could not create category: ${e.message}`);
    }
  });

  router.get("/categories/:id/edit", (req, res) => {
    const tid = getAdminTenantId(req);
    const category = db.prepare("SELECT * FROM categories WHERE id = ? AND tenant_id = ?").get(req.params.id, tid);
    if (!category) return res.status(404).send("Category not found");
    return res.render("admin/category_form", { category });
  });

  router.post("/categories/:id", (req, res) => {
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
      return res.redirect("/admin/categories");
    } catch (e) {
      return res.status(400).send(`Could not update category: ${e.message}`);
    }
  });

  router.post("/categories/:id/delete", (req, res) => {
    const catId = Number(req.params.id);
    if (!catId) return res.status(400).send("Invalid id");
    const tid = getAdminTenantId(req);
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

  // Companies
  router.get("/companies", (req, res) => {
    const tid = getAdminTenantId(req);
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

  router.get("/companies/new", (req, res) => {
    const tid = getAdminTenantId(req);
    const categories = getCategoriesForSelect(db, tid);
    return res.render("admin/company_form", { company: null, categories, baseDomain: process.env.BASE_DOMAIN || "getproapp.org" });
  });

  router.post("/companies", (req, res) => {
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

  router.get("/companies/:id/edit", (req, res) => {
    const tid = getAdminTenantId(req);
    const company = db.prepare("SELECT * FROM companies WHERE id = ? AND tenant_id = ?").get(req.params.id, tid);
    if (!company) return res.status(404).send("Company not found");
    const categories = getCategoriesForSelect(db, tid);
    return res.render("admin/company_form", { company, categories, baseDomain: process.env.BASE_DOMAIN || "getproapp.org" });
  });

  router.post("/companies/:id", (req, res) => {
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

  router.post("/companies/:id/delete", (req, res) => {
    const companyId = Number(req.params.id);
    if (!companyId) return res.status(400).send("Invalid id");
    const tid = getAdminTenantId(req);
    try {
      db.prepare("DELETE FROM leads WHERE company_id = ? AND tenant_id = ?").run(companyId, tid);
      db.prepare("DELETE FROM companies WHERE id = ? AND tenant_id = ?").run(companyId, tid);
      return res.redirect("/admin/companies");
    } catch (e) {
      return res.status(400).send(`Could not delete company: ${e.message}`);
    }
  });

  // Leads
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

    return res.render("admin/leads", { leads, companies, selectedCompanyId: companyId });
  });

  return router;
};

