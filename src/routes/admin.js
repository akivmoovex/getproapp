const express = require("express");
const slugify = require("slugify");
const { requireAdmin, authenticateAdmin } = require("../auth");

function getCategoriesForSelect(db) {
  return db.prepare("SELECT id, slug, name FROM categories ORDER BY sort ASC, name ASC").all();
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

    req.session.adminUser = { id: user.id, username: user.username };
    return res.redirect("/admin/dashboard");
  });

  router.post("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/admin/login"));
  });

  router.use((req, res, next) => {
    if (!req.path.startsWith("/login")) return requireAdmin(req, res, next);
    return next();
  });

  router.get("/dashboard", (_req, res) => {
    const categoriesCount = db.prepare("SELECT COUNT(*) AS c FROM categories").get().c;
    const companiesCount = db.prepare("SELECT COUNT(*) AS c FROM companies").get().c;
    const leadsCount = db.prepare("SELECT COUNT(*) AS c FROM leads").get().c;

    const latestLeads = db
      .prepare(
        `
        SELECT l.*, c.name AS company_name, cat.slug AS company_category_slug
        FROM leads l
        INNER JOIN companies c ON c.id = l.company_id
        LEFT JOIN categories cat ON cat.id = c.category_id
        ORDER BY l.created_at DESC
        LIMIT 10
        `
      )
      .all();

    return res.render("admin/dashboard", {
      categoriesCount,
      companiesCount,
      leadsCount,
      latestLeads,
      baseDomain: process.env.BASE_DOMAIN || "",
    });
  });

  // Categories
  router.get("/categories", (_req, res) => {
    const categories = db.prepare("SELECT * FROM categories ORDER BY sort ASC, name ASC").all();
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
      db.prepare("INSERT INTO categories (slug, name) VALUES (?, ?)").run(cleanSlug, cleanName);
      return res.redirect("/admin/categories");
    } catch (e) {
      return res.status(400).send(`Could not create category: ${e.message}`);
    }
  });

  router.get("/categories/:id/edit", (req, res) => {
    const category = db.prepare("SELECT * FROM categories WHERE id = ?").get(req.params.id);
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
      db.prepare("UPDATE categories SET slug = ?, name = ? WHERE id = ?").run(cleanSlug, cleanName, req.params.id);
      return res.redirect("/admin/categories");
    } catch (e) {
      return res.status(400).send(`Could not update category: ${e.message}`);
    }
  });

  router.post("/categories/:id/delete", (req, res) => {
    const catId = Number(req.params.id);
    if (!catId) return res.status(400).send("Invalid id");
    const inTx = db.transaction(() => {
      db.prepare("UPDATE companies SET category_id = NULL WHERE category_id = ?").run(catId);
      db.prepare("DELETE FROM categories WHERE id = ?").run(catId);
    });
    try {
      inTx();
      return res.redirect("/admin/categories");
    } catch (e) {
      return res.status(400).send(`Could not delete category: ${e.message}`);
    }
  });

  // Companies
  router.get("/companies", (_req, res) => {
    const companies = db
      .prepare(
        `
        SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
        FROM companies c
        LEFT JOIN categories cat ON cat.id = c.category_id
        ORDER BY c.updated_at DESC
        `
      )
      .all();
    return res.render("admin/companies", { companies, baseDomain: process.env.BASE_DOMAIN || "" });
  });

  router.get("/companies/new", (_req, res) => {
    const categories = getCategoriesForSelect(db);
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

    try {
      db.prepare(
        `
        INSERT INTO companies
          (subdomain, name, category_id, headline, about, services, phone, email, location, featured_cta_label, featured_cta_phone, updated_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
        String(featured_cta_phone || "").trim()
      );
      return res.redirect("/admin/companies");
    } catch (e) {
      return res.status(400).send(`Could not create company: ${e.message}`);
    }
  });

  router.get("/companies/:id/edit", (req, res) => {
    const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(req.params.id);
    if (!company) return res.status(404).send("Company not found");
    const categories = getCategoriesForSelect(db);
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

    try {
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
          updated_at = datetime('now')
        WHERE id = ?
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
        req.params.id
      );
      return res.redirect("/admin/companies");
    } catch (e) {
      return res.status(400).send(`Could not update company: ${e.message}`);
    }
  });

  router.post("/companies/:id/delete", (req, res) => {
    const companyId = Number(req.params.id);
    if (!companyId) return res.status(400).send("Invalid id");
    try {
      db.prepare("DELETE FROM leads WHERE company_id = ?").run(companyId);
      db.prepare("DELETE FROM companies WHERE id = ?").run(companyId);
      return res.redirect("/admin/companies");
    } catch (e) {
      return res.status(400).send(`Could not delete company: ${e.message}`);
    }
  });

  // Leads
  router.get("/leads", (req, res) => {
    const companyId = req.query.company_id ? Number(req.query.company_id) : null;
    const companies = db.prepare("SELECT id, name, subdomain FROM companies ORDER BY name ASC").all();

    let leads;
    if (companyId) {
      leads = db
        .prepare(
          `
          SELECT l.*, c.name AS company_name, c.subdomain AS company_subdomain
          FROM leads l
          INNER JOIN companies c ON c.id = l.company_id
          WHERE l.company_id = ?
          ORDER BY l.created_at DESC
          `
        )
        .all(companyId);
    } else {
      leads = db
        .prepare(
          `
          SELECT l.*, c.name AS company_name, c.subdomain AS company_subdomain
          FROM leads l
          INNER JOIN companies c ON c.id = l.company_id
          ORDER BY l.created_at DESC
          LIMIT 200
          `
        )
        .all();
    }

    return res.render("admin/leads", { leads, companies, selectedCompanyId: companyId });
  });

  return router;
};

