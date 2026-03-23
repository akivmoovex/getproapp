const path = require("path");
const fs = require("fs");
const express = require("express");
const { getTenantById, DEFAULT_TENANT_SLUG } = require("../tenants");
const { TENANT_ZM } = require("../tenantIds");
const { getTenantCitiesForClient, getJoinCityWatermarkRotate } = require("../tenantCities");
const { israelComingSoonEnabled } = require("../israelComingSoon");
const { attachReviewStatsToCompanies } = require("../reviewStats");
const { buildCompanyPageLocals } = require("../companyPageRender");
const { getTenantContactSupport } = require("../tenantContactSupport");

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

function tenantHomeHrefFromPrefix(prefix) {
  if (!prefix) return "/";
  const p = String(prefix);
  if (p.startsWith("http")) return `${p.replace(/\/$/, "")}/`;
  return `${p}/`;
}

/** Directory / join links from a company one-pager (subdomain) must target regional *.BASE hosts. */
function platformTenantPrefixForSlug(slug) {
  const scheme = process.env.PUBLIC_SCHEME || "https";
  const base = (process.env.BASE_DOMAIN || "").trim();
  if (!base) return slug === DEFAULT_TENANT_SLUG ? "" : `/${slug}`;
  if (slug === DEFAULT_TENANT_SLUG) return `${scheme}://zm.${base}`;
  return `${scheme}://${slug}.${base}`;
}

function directoryHrefFromTenantPrefix(prefix) {
  if (!prefix) return "/directory";
  if (prefix.startsWith("http")) return `${prefix.replace(/\/$/, "")}/directory`;
  return `${String(prefix).replace(/\/$/, "")}/directory`;
}

/** Path segments that must not be treated as company mini-site slugs (first path segment). */
const MINI_SITE_RESERVED_SEGMENTS = new Set([
  "directory",
  "join",
  "company",
  "category",
  "admin",
  "api",
  "healthz",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "getpro-admin",
  "global",
  "demo",
  "il",
  "zm",
  "zw",
  "bw",
  "za",
  "na",
]);

module.exports = function publicRoutes({ db }) {
  const router = express.Router();

  function platformSupport(req) {
    const tid = req.tenant && req.tenant.id;
    return getTenantContactSupport(db, tid);
  }

  async function renderCompanyPage(req, res, company) {
    const locals = await buildCompanyPageLocals(req, db, company);
    return res.render("company", locals);
  }

  function tenantLocals(req) {
    const t = req.tenant;
    const prefix =
      req.tenantUrlPrefix !== undefined && req.tenantUrlPrefix !== null
        ? req.tenantUrlPrefix
        : `/${t.slug}`;
    const showRegionPickerUi =
      !!req.isApexHost || (t && t.slug === "global");
    return {
      tenant: t,
      tenantUrlPrefix: prefix,
      tenantHomeHref: tenantHomeHrefFromPrefix(prefix),
      isApexHost: !!req.isApexHost,
      showRegionPickerUi,
      regionZmUrl: req.regionZmUrl || "",
      regionIlUrl: req.regionIlUrl || "",
      regionChoices: req.regionChoices || [],
    };
  }

  router.use((req, res, next) => {
    if (israelComingSoonEnabled() && req.tenant && req.tenant.slug === "il") {
      const scheme = process.env.PUBLIC_SCHEME || "https";
      const base = (process.env.BASE_DOMAIN || "").trim();
      const apexUrl = base ? `${scheme}://${base}` : "/";
      return res.render("coming_soon_il", {
        ...tenantLocals(req),
        apexUrl,
        apexHostLabel: base || "Home",
        ...platformSupport(req),
      });
    }
    next();
  });

  router.get("/", async (req, res) => {
    const tenantId = req.tenant.id;
    const categories = db
      .prepare("SELECT * FROM categories WHERE tenant_id = ? ORDER BY sort ASC, name ASC")
      .all(tenantId);

    return res.render("index", {
      categories,
      baseDomain: process.env.BASE_DOMAIN || "",
      ...tenantLocals(req),
      ...platformSupport(req),
    });
  });

  router.get("/directory", async (req, res) => {
    const tenantId = req.tenant.id;
    const categories = db
      .prepare("SELECT * FROM categories WHERE tenant_id = ? ORDER BY sort ASC, name ASC")
      .all(tenantId);

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
        SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
        FROM companies c
        INNER JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
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
      const parts = [`c.tenant_id = ?`];
      const params = [tenantId];
      if (searchQ) {
        parts.push(
          `(c.name LIKE ? COLLATE NOCASE OR c.headline LIKE ? COLLATE NOCASE OR c.about LIKE ? COLLATE NOCASE)`
        );
        const p = `%${searchQ}%`;
        params.push(p, p, p);
      }
      if (cityQ) {
        parts.push(`c.location LIKE ? COLLATE NOCASE`);
        params.push(`%${cityQ}%`);
      }
      const where = parts.join(" AND ");
      companies = db
        .prepare(
          `
          SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
          FROM companies c
          LEFT JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
          WHERE ${where}
          ORDER BY c.name ASC
          LIMIT 48
          `
        )
        .all(...params);
    } else {
      companies = db
        .prepare(
          `
          SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
          FROM companies c
          LEFT JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
          WHERE c.tenant_id = ?
          ORDER BY c.updated_at DESC
          LIMIT 24
          `
        )
        .all(tenantId);
    }

    companies = attachReviewStatsToCompanies(db, companies);

    return res.render("directory", {
      categories,
      selectedCategory: selected,
      searchQuery: searchOk ? searchRaw : "",
      cityQuery: cityOk ? cityRaw : "",
      companies,
      baseDomain: process.env.BASE_DOMAIN || "",
      companyMiniSiteHref: (sub) => `/${encodeURIComponent(String(sub || "").trim())}`,
      ...tenantLocals(req),
      ...platformSupport(req),
    });
  });

  router.get("/category/:categorySlug", async (req, res) => {
    const tenantId = req.tenant.id;
    const categorySlug = req.params.categorySlug;
    const category = db
      .prepare("SELECT * FROM categories WHERE slug = ? AND tenant_id = ?")
      .get(categorySlug, tenantId);
    if (!category) {
      res.status(404);
      return res.render("not_found", {
        slug: categorySlug,
        kind: "category",
        ...tenantLocals(req),
        ...platformSupport(req),
      });
    }

    const companies = db
      .prepare(
        `
        SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
        FROM companies c
        INNER JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
        WHERE c.category_id = ? AND c.tenant_id = ?
        ORDER BY c.name ASC
        `
      )
      .all(category.id, tenantId);

    const companiesWithReviews = attachReviewStatsToCompanies(db, companies);

    const categories = db
      .prepare("SELECT * FROM categories WHERE tenant_id = ? ORDER BY sort ASC, name ASC")
      .all(tenantId);
    return res.render("category", {
      category,
      categories,
      companies: companiesWithReviews,
      baseDomain: process.env.BASE_DOMAIN || "",
      companyMiniSiteHref: (sub) => `/${encodeURIComponent(String(sub || "").trim())}`,
      ...tenantLocals(req),
      ...platformSupport(req),
    });
  });

  router.get("/company/:id", async (req, res, next) => {
    try {
      const tenantId = req.tenant.id;
      const id = Number(req.params.id);
      if (!id || id < 1) {
        res.status(404);
        return res.render("not_found", {
          slug: String(req.params.id || ""),
          kind: "company",
          ...tenantLocals(req),
          ...platformSupport(req),
        });
      }
      const company = db
        .prepare(
          `
        SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
        FROM companies c
        LEFT JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
        WHERE c.id = ? AND c.tenant_id = ?
        `
        )
        .get(id, tenantId);
      if (!company) {
        res.status(404);
        return res.render("not_found", {
          slug: String(id),
          kind: "company",
          ...tenantLocals(req),
          ...platformSupport(req),
        });
      }
      return await renderCompanyPage(req, res, company);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/join", (req, res) => {
    const tenantId = req.tenant.id;
    const joinTenantCities = getTenantCitiesForClient(db, tenantId);
    const joinCityWatermarkRotate = getJoinCityWatermarkRotate(db, tenantId);
    return res.render("join", {
      baseDomain: process.env.BASE_DOMAIN || "",
      joinTenantCities,
      joinCityWatermarkRotate,
      ...tenantLocals(req),
      ...platformSupport(req),
    });
  });

  /**
   * Company mini-site: /{subdomain} on the regional host (e.g. /demo-lusaka-spark on demo.getproapp.org).
   * Registered after /directory, /join, /company/:id, etc.
   */
  router.get("/:miniSiteSlug", async (req, res, next) => {
    try {
      const seg = String(req.params.miniSiteSlug || "").trim().toLowerCase();
      if (!seg || !/^[a-z0-9-]+$/.test(seg) || MINI_SITE_RESERVED_SEGMENTS.has(seg)) {
        return next();
      }
      const tenantId = req.tenant.id;
      const company = db
        .prepare(
          `
        SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
        FROM companies c
        LEFT JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
        WHERE c.subdomain = ? AND c.tenant_id = ?
        `
        )
        .get(seg, tenantId);
      if (!company) {
        res.status(404);
        return res.render("not_found", {
          slug: seg,
          kind: "mini-site",
          ...tenantLocals(req),
          ...platformSupport(req),
        });
      }
      return await renderCompanyPage(req, res, company);
    } catch (e) {
      return next(e);
    }
  });

  async function renderCompanyHome(req, res) {
    const company = db
      .prepare(
        `
        SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
        FROM companies c
        LEFT JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
        WHERE c.subdomain = ?
        `
      )
      .get(req.subdomain);

    if (!company) {
      res.status(404);
      const scheme = process.env.PUBLIC_SCHEME || "https";
      const base = (process.env.BASE_DOMAIN || "").trim();
      const tp = base ? `${scheme}://zm.${base}` : "";
      return res.render("not_found", {
        subdomain: req.subdomain,
        tenant: getTenantById(TENANT_ZM, db),
        tenantUrlPrefix: tp,
        tenantHomeHref: tenantHomeHrefFromPrefix(tp),
        regionChoices: req.regionChoices || [],
        ...getTenantContactSupport(db, TENANT_ZM),
      });
    }

    return renderCompanyPage(req, res, company);
  }

  return { router, renderCompanyHome };
};
