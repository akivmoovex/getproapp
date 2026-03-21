const path = require("path");
const fs = require("fs");
const express = require("express");
const { getTenantById } = require("../tenants");

function loadSearchLists() {
  const p = path.join(__dirname, "../../public/data/search-lists.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function isWhitelistedService(value) {
  if (!value) return true;
  const v = String(value).trim().toLowerCase();
  return loadSearchLists().services.some((s) => s.toLowerCase() === v);
}

function isWhitelistedCity(value) {
  if (!value) return true;
  const v = String(value).trim().toLowerCase();
  return loadSearchLists().cities.some((c) => c.toLowerCase() === v);
}

function buildCompanyUrl({ baseDomain, subdomain }) {
  if (!baseDomain) return "#";
  const scheme = process.env.PUBLIC_SCHEME || "https";
  return `${scheme}://${subdomain}.${baseDomain}/`;
}

function platformSupport() {
  return {
    getproPhone: process.env.CALL_CENTER_PHONE || "",
    getproEmail:
      process.env.GETPRO_EMAIL || process.env.PRO_ONLINE_EMAIL || process.env.NETRA_EMAIL || "",
    getproAddress:
      process.env.GETPRO_ADDRESS || process.env.PRO_ONLINE_ADDRESS || process.env.NETRA_ADDRESS || "",
  };
}

module.exports = function publicRoutes({ db }) {
  const router = express.Router();

  function tenantLocals(req) {
    const t = req.tenant;
    const prefix = req.tenantUrlPrefix || `/${t.slug}`;
    return {
      tenant: t,
      tenantUrlPrefix: prefix,
    };
  }

  router.get("/", async (req, res) => {
    const categories = db.prepare("SELECT * FROM categories ORDER BY sort ASC, name ASC").all();
    const { tenant, tenantUrlPrefix } = tenantLocals(req);

    return res.render("index", {
      categories,
      baseDomain: process.env.BASE_DOMAIN || "",
      tenant,
      tenantUrlPrefix,
      ...platformSupport(),
    });
  });

  router.get("/directory", async (req, res) => {
    const tenantId = req.tenant.id;
    const categories = db.prepare("SELECT * FROM categories ORDER BY sort ASC, name ASC").all();

    const selected = req.query.category ? String(req.query.category) : null;
    const searchRaw = req.query.q ? String(req.query.q).trim() : "";
    const cityRaw = req.query.city ? String(req.query.city).trim() : "";
    const searchOk = !searchRaw || isWhitelistedService(searchRaw);
    const cityOk = !cityRaw || isWhitelistedCity(cityRaw);
    const searchQ = searchOk ? searchRaw.replace(/[%_\\]/g, "") : "";
    const cityQ = cityOk ? cityRaw.replace(/[%_\\]/g, "") : "";

    let companies = [];
    if (selected) {
      let sql = `
        SELECT c.*
        FROM companies c
        INNER JOIN categories cat ON cat.id = c.category_id
        WHERE cat.slug = ? AND c.tenant_id = ?
      `;
      const params = [selected, tenantId];
      if (cityQ) {
        sql += ` AND c.location LIKE ? COLLATE NOCASE`;
        params.push(`%${cityQ}%`);
      }
      sql += ` ORDER BY c.name ASC`;
      companies = db.prepare(sql).all(...params);
    } else if (searchQ || cityQ) {
      const parts = [`tenant_id = ?`];
      const params = [tenantId];
      if (searchQ) {
        parts.push(
          `(name LIKE ? COLLATE NOCASE OR headline LIKE ? COLLATE NOCASE OR about LIKE ? COLLATE NOCASE)`
        );
        const p = `%${searchQ}%`;
        params.push(p, p, p);
      }
      if (cityQ) {
        parts.push(`location LIKE ? COLLATE NOCASE`);
        params.push(`%${cityQ}%`);
      }
      const where = parts.join(" AND ");
      companies = db
        .prepare(
          `
          SELECT * FROM companies
          WHERE ${where}
          ORDER BY name ASC
          LIMIT 48
          `
        )
        .all(...params);
    } else {
      companies = db
        .prepare("SELECT * FROM companies WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 24")
        .all(tenantId);
    }

    const { tenant, tenantUrlPrefix } = tenantLocals(req);

    return res.render("directory", {
      categories,
      selectedCategory: selected,
      searchQuery: searchOk ? searchRaw : "",
      cityQuery: cityOk ? cityRaw : "",
      companies,
      baseDomain: process.env.BASE_DOMAIN || "",
      buildCompanyUrl,
      tenant,
      tenantUrlPrefix,
      ...platformSupport(),
    });
  });

  router.get("/category/:categorySlug", async (req, res) => {
    const tenantId = req.tenant.id;
    const categorySlug = req.params.categorySlug;
    const category = db.prepare("SELECT * FROM categories WHERE slug = ?").get(categorySlug);
    if (!category) {
      res.status(404);
      const { tenant, tenantUrlPrefix } = tenantLocals(req);
      return res.render("not_found", {
        slug: categorySlug,
        kind: "category",
        tenant,
        tenantUrlPrefix,
        ...platformSupport(),
      });
    }

    const companies = db
      .prepare(
        `
        SELECT *
        FROM companies
        WHERE category_id = ? AND tenant_id = ?
        ORDER BY name ASC
        `
      )
      .all(category.id, tenantId);

    const categories = db.prepare("SELECT * FROM categories ORDER BY sort ASC, name ASC").all();
    const { tenant, tenantUrlPrefix } = tenantLocals(req);

    return res.render("category", {
      category,
      categories,
      companies,
      baseDomain: process.env.BASE_DOMAIN || "",
      buildCompanyUrl,
      tenant,
      tenantUrlPrefix,
      ...platformSupport(),
    });
  });

  router.get("/join", (req, res) => {
    const { tenant, tenantUrlPrefix } = tenantLocals(req);
    return res.render("join", {
      baseDomain: process.env.BASE_DOMAIN || "",
      tenant,
      tenantUrlPrefix,
      ...platformSupport(),
    });
  });

  function renderCompanyHome(req, res) {
    const company = db
      .prepare(
        `
        SELECT c.*, cat.id AS category_id, cat.slug AS category_slug, cat.name AS category_name
        FROM companies c
        LEFT JOIN categories cat ON cat.id = c.category_id
        WHERE c.subdomain = ?
        `
      )
      .get(req.subdomain);

    if (!company) {
      res.status(404);
      return res.render("not_found", {
        subdomain: req.subdomain,
        tenant: getTenantById(1),
        tenantUrlPrefix: "/zm",
        ...platformSupport(),
      });
    }

    const tenant = getTenantById(company.tenant_id) || getTenantById(1);
    const tenantUrlPrefix = `/${tenant.slug}`;

    return res.render("company", {
      company,
      category: company.category_id ? { slug: company.category_slug, name: company.category_name } : null,
      baseDomain: process.env.BASE_DOMAIN || "",
      companyUrl: buildCompanyUrl({ baseDomain: process.env.BASE_DOMAIN || "", subdomain: company.subdomain }),
      tenant,
      tenantUrlPrefix,
      ...platformSupport(),
    });
  }

  return { router, renderCompanyHome };
};
