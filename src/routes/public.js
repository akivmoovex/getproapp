const path = require("path");
const fs = require("fs");
const express = require("express");
const { getTenantById, DEFAULT_TENANT_SLUG } = require("../tenants");
const { TENANT_ZM } = require("../tenantIds");
const { getTenantCitiesForClient, getJoinCityWatermarkRotate } = require("../tenantCities");
const { israelComingSoonEnabled } = require("../israelComingSoon");
const { attachReviewStatsToCompanies } = require("../reviewStats");
const {
  companyProfileHref,
  parseGalleryJson,
  absoluteCompanyProfileUrl,
  formatReviewDateLabel,
} = require("../companyProfile");

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
    getproEmail: process.env.GETPRO_EMAIL || "",
    getproAddress: process.env.GETPRO_ADDRESS || "",
  };
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

module.exports = function publicRoutes({ db }) {
  const router = express.Router();

  function loadCompanyProfileExtras(company) {
    const cid = company.id;
    const reviewsRaw = db
      .prepare(
        `
        SELECT rating, body, author_name, created_at
        FROM reviews
        WHERE company_id = ?
        ORDER BY datetime(created_at) DESC
        LIMIT 60
        `
      )
      .all(cid);

    const reviews = reviewsRaw.map((r) => ({
      ...r,
      dateLabel: formatReviewDateLabel(r.created_at),
    }));

    const avgRow = db
      .prepare(
        `
        SELECT ROUND(AVG(rating), 2) AS avg_rating, COUNT(*) AS n
        FROM reviews WHERE company_id = ?
        `
      )
      .get(cid);

    const distRows = db
      .prepare(
        `
        SELECT CAST(ROUND(rating) AS INTEGER) AS star, COUNT(*) AS n
        FROM reviews WHERE company_id = ?
        GROUP BY CAST(ROUND(rating) AS INTEGER)
        `
      )
      .all(cid);

    const star_distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of distRows) {
      const k = Math.min(5, Math.max(1, Number(r.star)));
      star_distribution[k] = (star_distribution[k] || 0) + Number(r.n);
    }
    const star_distribution_total = Object.values(star_distribution).reduce((a, b) => a + b, 0);

    const galleryItems = parseGalleryJson(company.gallery_json);

    return {
      reviews,
      avg_rating: avgRow && avgRow.n > 0 ? avgRow.avg_rating : null,
      review_count: avgRow ? Number(avgRow.n) : 0,
      star_distribution,
      star_distribution_total,
      galleryItems,
    };
  }

  function renderCompanyPage(req, res, company) {
    const tenant = getTenantById(company.tenant_id, db) || getTenantById(TENANT_ZM, db);
    const tenantUrlPrefix = platformTenantPrefixForSlug(tenant.slug);
    const extras = loadCompanyProfileExtras(company);
    const profileUrl = req.tenant
      ? companyProfileHref(req, company.id)
      : absoluteCompanyProfileUrl(tenant.slug, company.id);

    return res.render("company", {
      company,
      category: company.category_slug ? { slug: company.category_slug, name: company.category_name } : null,
      ...extras,
      baseDomain: process.env.BASE_DOMAIN || "",
      companyUrl: buildCompanyUrl({ baseDomain: process.env.BASE_DOMAIN || "", subdomain: company.subdomain }),
      profileUrl,
      directoryHref: directoryHrefFromTenantPrefix(tenantUrlPrefix),
      tenant,
      tenantUrlPrefix,
      tenantHomeHref: tenantHomeHrefFromPrefix(tenantUrlPrefix),
      regionChoices: req.regionChoices || [],
      ...platformSupport(),
    });
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
        ...platformSupport(),
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
      ...platformSupport(),
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
        SELECT c.*
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

    companies = attachReviewStatsToCompanies(db, companies);

    return res.render("directory", {
      categories,
      selectedCategory: selected,
      searchQuery: searchOk ? searchRaw : "",
      cityQuery: cityOk ? cityRaw : "",
      companies,
      baseDomain: process.env.BASE_DOMAIN || "",
      buildCompanyUrl,
      companyProfileHref: (cid) => companyProfileHref(req, cid),
      ...tenantLocals(req),
      ...platformSupport(),
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

    const companiesWithReviews = attachReviewStatsToCompanies(db, companies);

    const categories = db
      .prepare("SELECT * FROM categories WHERE tenant_id = ? ORDER BY sort ASC, name ASC")
      .all(tenantId);
    return res.render("category", {
      category,
      categories,
      companies: companiesWithReviews,
      baseDomain: process.env.BASE_DOMAIN || "",
      buildCompanyUrl,
      companyProfileHref: (cid) => companyProfileHref(req, cid),
      ...tenantLocals(req),
      ...platformSupport(),
    });
  });

  router.get("/company/:id", (req, res) => {
    const tenantId = req.tenant.id;
    const id = Number(req.params.id);
    if (!id || id < 1) {
      res.status(404);
      return res.render("not_found", {
        slug: String(req.params.id || ""),
        kind: "company",
        ...tenantLocals(req),
        ...platformSupport(),
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
        ...platformSupport(),
      });
    }
    return renderCompanyPage(req, res, company);
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
      ...platformSupport(),
    });
  });

  function renderCompanyHome(req, res) {
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
        ...platformSupport(),
      });
    }

    return renderCompanyPage(req, res, company);
  }

  return { router, renderCompanyHome };
};
