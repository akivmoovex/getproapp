const express = require("express");

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

  router.get("/", async (req, res) => {
    const categories = db
      .prepare("SELECT * FROM categories ORDER BY sort ASC, name ASC")
      .all();

    if (!req.subdomain) {
      return res.render("index", {
        categories,
        baseDomain: process.env.BASE_DOMAIN || "",
        ...platformSupport(),
      });
    }

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
        ...platformSupport(),
      });
    }

    return res.render("company", {
      company,
      category: company.category_id ? { slug: company.category_slug, name: company.category_name } : null,
      baseDomain: process.env.BASE_DOMAIN || "",
      companyUrl: buildCompanyUrl({ baseDomain: process.env.BASE_DOMAIN || "", subdomain: company.subdomain }),
      ...platformSupport(),
    });
  });

  router.get("/directory", async (req, res) => {
    const categories = db
      .prepare("SELECT * FROM categories ORDER BY sort ASC, name ASC")
      .all();

    const selected = req.query.category ? String(req.query.category) : null;
    const searchRaw = req.query.q ? String(req.query.q).trim() : "";
    const searchQ = searchRaw.replace(/[%_\\]/g, "");

    let companies = [];
    if (selected) {
      companies = db
        .prepare(
          `
          SELECT c.*
          FROM companies c
          INNER JOIN categories cat ON cat.id = c.category_id
          WHERE cat.slug = ?
          ORDER BY c.name ASC
          `
        )
        .all(selected);
    } else if (searchQ) {
      companies = db
        .prepare(
          `
          SELECT * FROM companies
          WHERE name LIKE ? COLLATE NOCASE OR headline LIKE ? COLLATE NOCASE OR about LIKE ? COLLATE NOCASE
          ORDER BY name ASC
          LIMIT 48
          `
        )
        .all(`%${searchQ}%`, `%${searchQ}%`, `%${searchQ}%`);
    } else {
      companies = db.prepare("SELECT * FROM companies ORDER BY updated_at DESC LIMIT 24").all();
    }

    return res.render("directory", {
      categories,
      selectedCategory: selected,
      searchQuery: searchRaw,
      companies,
      baseDomain: process.env.BASE_DOMAIN || "",
      buildCompanyUrl,
      ...platformSupport(),
    });
  });

  router.get("/category/:categorySlug", async (req, res) => {
    const categorySlug = req.params.categorySlug;
    const category = db.prepare("SELECT * FROM categories WHERE slug = ?").get(categorySlug);
    if (!category) {
      res.status(404);
      return res.render("not_found", {
        slug: categorySlug,
        kind: "category",
        ...platformSupport(),
      });
    }

    const companies = db
      .prepare(
        `
        SELECT *
        FROM companies
        WHERE category_id = ?
        ORDER BY name ASC
        `
      )
      .all(category.id);

    const categories = db
      .prepare("SELECT * FROM categories ORDER BY sort ASC, name ASC")
      .all();

    return res.render("category", {
      category,
      categories,
      companies,
      baseDomain: process.env.BASE_DOMAIN || "",
      buildCompanyUrl,
      ...platformSupport(),
    });
  });

  return router;
};
