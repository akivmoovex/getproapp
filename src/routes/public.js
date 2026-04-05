const path = require("path");
const fs = require("fs");
const express = require("express");
const { getTenantById, DEFAULT_TENANT_SLUG } = require("../tenants");
const { TENANT_ZM } = require("../tenants/tenantIds");
const { getTenantCitiesForClient, getJoinCityWatermarkRotate } = require("../tenants/tenantCities");
const { israelComingSoonEnabled } = require("../tenants/israelComingSoon");
const { attachReviewStatsToCompanies } = require("../companies/reviewStats");
const { buildCompanyPageLocals } = require("../companies/companyPageRender");
const { getTenantContactSupport } = require("../tenants/tenantContactSupport");
const {
  formatBodyToHtml,
  listPublishedByKind,
  getBySlug,
  getRowBySlug,
  canonicalUrlForTenant,
  absolutePublicUrl,
  escapeHtml,
} = require("../content/contentPages");
const { buildSitemapXml, buildRobotsTxt } = require("../companies/seoPublic");
const { canPreviewDraft } = require("../content/adminPreview");
const { PRODUCT_NAME } = require("../platform/branding");
const {
  buildCompanyDirectoryFtsMatch,
  companySearchFtsReady,
} = require("../companies/companySearchFts");

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

/** Suggested chips for empty directory / category states (no duplicate city; exclude selected category). */
function buildEmptyStateSuggestions(categories, selectedSlug, cityQ) {
  const lists = loadSearchLists();
  const norm = (s) => String(s || "").trim().toLowerCase();
  const cityNorm = norm(cityQ);
  const selected = String(selectedSlug || "").trim();
  const emptyAltCategories = (categories || [])
    .filter((c) => c && c.slug && c.slug !== selected)
    .slice(0, 5);
  const emptyAltCities = (lists.cities || [])
    .filter((c) => !cityNorm || norm(c) !== cityNorm)
    .slice(0, 5);
  return { emptyAltCategories, emptyAltCities };
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
  "articles",
  "guides",
  "answers",
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

  // PERF: Tiny in-process cache for homepage query results to reduce TTFB.
  // Safe: short TTL, per-tenant, caches only public lists (not user-specific).
  const HOME_CACHE_TTL_MS = 60 * 1000;
  const homeCache = new Map(); // tenantId -> { ts, categories, contentArticles, contentGuides, contentFaqs }

  function platformSupport(req) {
    const tid = req.tenant && req.tenant.id;
    return getTenantContactSupport(db, tid);
  }

  async function renderCompanyPage(req, res, company) {
    const locals = await buildCompanyPageLocals(req, db, company);
    const canonicalUrl = canonicalUrlForTenant(req, `/company/${company.id}`);
    const seoTitle = `${company.name} | ${locals.category ? locals.category.name + " · " : ""}${PRODUCT_NAME}`;
    const seoDescription = `${(company.headline || company.name || "").replace(/"/g, "")} · Verified directory listing on ${PRODUCT_NAME}.`;
    const lb = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: company.name,
      url: canonicalUrl,
    };
    if (company.headline) lb.description = company.headline;
    if (company.phone) lb.telephone = company.phone;
    if (company.email) lb.email = company.email;
    if (company.location) {
      lb.address = { "@type": "PostalAddress", streetAddress: company.location };
    }
    return res.render("company", {
      ...locals,
      canonicalUrl,
      seoTitle,
      seoDescription,
      ogUrl: canonicalUrl,
      jsonLdCompany: JSON.stringify(lb),
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
        ...platformSupport(req),
      });
    }
    next();
  });

  function resolveContentRow(req, kind, slug) {
    const tenantId = req.tenant.id;
    const preview =
      (req.query.preview === "1" || req.query.preview === "true") && canPreviewDraft(req, tenantId);
    if (preview) {
      return getRowBySlug(db, tenantId, kind, slug) || null;
    }
    return getBySlug(db, tenantId, kind, slug) || null;
  }

  router.get("/", async (req, res) => {
    const tenantId = req.tenant.id;
    const now = Date.now();
    let cached = homeCache.get(tenantId);
    if (!cached || now - cached.ts > HOME_CACHE_TTL_MS) {
      cached = {
        ts: now,
        categories: db
          .prepare("SELECT * FROM categories WHERE tenant_id = ? ORDER BY sort ASC, name ASC")
          .all(tenantId),
        contentArticles: listPublishedByKind(db, tenantId, "article"),
        contentGuides: listPublishedByKind(db, tenantId, "guide"),
        contentFaqs: listPublishedByKind(db, tenantId, "faq"),
      };
      homeCache.set(tenantId, cached);
    }

    const canonicalUrl = canonicalUrlForTenant(req, "/");
    const seoTitle = `${req.tenant.name || PRODUCT_NAME} · Trusted professional directory`;
    const seoDescription =
      "Find trusted professionals near you. Search by service and city, compare profiles, and contact the right business quickly.";
    const orgJsonLd = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: req.tenant.name || PRODUCT_NAME,
      url: canonicalUrl,
    };

    return res.render("index", {
      categories: cached.categories,
      baseDomain: process.env.BASE_DOMAIN || "",
      seoTitle,
      seoDescription,
      canonicalUrl,
      ogUrl: canonicalUrl,
      ogImage: absolutePublicUrl(req, "/images/hero/home-hero-960.webp"),
      orgJsonLd: JSON.stringify(orgJsonLd),
      contentArticles: cached.contentArticles,
      contentGuides: cached.contentGuides,
      contentFaqs: cached.contentFaqs,
      ...tenantLocals(req),
      ...platformSupport(req),
      showRegionPickerUi: false,
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
      const ftsReady = companySearchFtsReady(db);
      const ftsMatch = ftsReady && searchQ ? buildCompanyDirectoryFtsMatch(searchQ) : null;
      const useFts = Boolean(ftsMatch);

      function runDirectorySearch(useFtsInner) {
        const parts = [`c.tenant_id = ?`];
        const params = [tenantId];
        if (searchQ) {
          if (useFtsInner) {
            parts.push(`companies_fts MATCH ?`);
            params.push(ftsMatch);
          } else {
            parts.push(
              `(c.name LIKE ? COLLATE NOCASE OR c.headline LIKE ? COLLATE NOCASE OR c.about LIKE ? COLLATE NOCASE)`
            );
            const p = `%${searchQ}%`;
            params.push(p, p, p);
          }
        }
        if (cityQ) {
          parts.push(`c.location LIKE ? COLLATE NOCASE`);
          params.push(`%${cityQ}%`);
        }
        const where = parts.join(" AND ");
        const joinFts = useFtsInner ? `INNER JOIN companies_fts ON companies_fts.rowid = c.id` : "";
        const orderSql = useFtsInner ? `ORDER BY bm25(companies_fts) ASC, c.name ASC` : `ORDER BY c.name ASC`;
        return db
          .prepare(
            `
          SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
          FROM companies c
          ${joinFts}
          LEFT JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
          WHERE ${where}
          ${orderSql}
          LIMIT 48
          `
          )
          .all(...params);
      }

      try {
        companies = runDirectorySearch(useFts);
      } catch (err) {
        if (useFts && searchQ) {
          companies = runDirectorySearch(false);
        } else {
          throw err;
        }
      }
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

    const canonicalUrl = canonicalUrlForTenant(req, "/directory");
    let seoTitle = `Directory | ${req.tenant.name || PRODUCT_NAME}`;
    let seoDescription = `Browse verified professionals in ${req.tenant.name || PRODUCT_NAME}. Search by service and city or explore categories.`;
    if (selected) {
      const catRow = (categories || []).find((c) => c.slug === selected);
      if (catRow) {
        seoTitle = `${catRow.name} · Directory | ${req.tenant.name || PRODUCT_NAME}`;
        seoDescription = `Find ${String(catRow.name).toLowerCase()} and related professionals. Compare profiles and contact businesses in the directory.`;
      }
    } else if (searchQ || cityQ) {
      seoTitle = `Search results · Directory | ${req.tenant.name || PRODUCT_NAME}`;
      seoDescription = `Directory search for services and professionals${cityQ ? ` in ${cityQ}` : ""}.`;
    }

    return res.render("directory", {
      categories,
      selectedCategory: selected,
      /* When filtering by category, show raw q in the field (e.g. category name from home) even if not in service whitelist — SQL uses category slug only. */
      searchQuery: selected ? searchRaw : searchOk ? searchRaw : "",
      cityQuery: cityOk ? cityRaw : "",
      companies,
      baseDomain: process.env.BASE_DOMAIN || "",
      companyMiniSiteHref: (sub) => `/${encodeURIComponent(String(sub || "").trim())}`,
      seoTitle,
      seoDescription,
      canonicalUrl,
      ogUrl: canonicalUrl,
      ...buildEmptyStateSuggestions(categories, selected, cityOk ? cityRaw : ""),
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

    const canonicalUrl = canonicalUrlForTenant(req, `/category/${category.slug}`);
    const seoTitle = `${category.name} · Directory | ${req.tenant.name || PRODUCT_NAME}`;
    const seoDescription = `Browse ${category.name} professionals — verified listings, profiles, and direct contact on ${PRODUCT_NAME}.`;

    return res.render("category", {
      category,
      categories,
      companies: companiesWithReviews,
      baseDomain: process.env.BASE_DOMAIN || "",
      companyMiniSiteHref: (sub) => `/${encodeURIComponent(String(sub || "").trim())}`,
      seoTitle,
      seoDescription,
      canonicalUrl,
      ogUrl: canonicalUrl,
      ...buildEmptyStateSuggestions(categories, category.slug, ""),
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
    const canonicalUrl = canonicalUrlForTenant(req, "/join");
    return res.render("join", {
      baseDomain: process.env.BASE_DOMAIN || "",
      joinTenantCities,
      joinCityWatermarkRotate,
      seoTitle: `List your business | ${req.tenant.name || PRODUCT_NAME}`,
      seoDescription: `Create a verified profile on ${PRODUCT_NAME} so customers can find your services, view your details, and send lead requests.`,
      canonicalUrl,
      ogUrl: canonicalUrl,
      ...tenantLocals(req),
      ...platformSupport(req),
    });
  });

  // Internal UI component pattern library (dev reference).
  // Intentionally not linked in public navigation.
  router.get("/ui-demo", (req, res) => {
    const canonicalUrl = canonicalUrlForTenant(req, "/ui-demo");
    return res.render("ui_demo", {
      seoTitle: `UI Demo · ${req.tenant.name || PRODUCT_NAME}`,
      seoDescription: `Visual reference for the ${PRODUCT_NAME} web component system (Buttons / Cards / Inputs).`,
      canonicalUrl,
      ogUrl: canonicalUrl,
      ...tenantLocals(req),
      ...platformSupport(req),
    });
  });

  /** Internal design-system playground (Storybook-style); not product UI. */
  router.get("/ui", (req, res) => {
    const canonicalUrl = canonicalUrlForTenant(req, "/ui");
    return res.render("ui_docs", {
      seoTitle: `Design system · ${req.tenant.name || PRODUCT_NAME}`,
      seoDescription: "Internal UI playground for components, states, and theme validation.",
      canonicalUrl,
      ogUrl: canonicalUrl,
      noindex: true,
      docsSearchCategories: [
        { slug: "builders", name: "Builders" },
        { slug: "plumbing", name: "Plumbing" },
        { slug: "electrical", name: "Electrical" },
      ],
      ...tenantLocals(req),
      ...platformSupport(req),
    });
  });

  router.get("/sitemap.xml", (req, res) => {
    res.type("application/xml");
    res.send(buildSitemapXml(req, db));
  });

  router.get("/robots.txt", (req, res) => {
    res.type("text/plain");
    res.send(buildRobotsTxt(req));
  });

  function renderContentIndex(req, res, kind, label) {
    const tenantId = req.tenant.id;
    const items = listPublishedByKind(db, tenantId, kind);
    const seg = kind === "article" ? "articles" : kind === "guide" ? "guides" : "answers";
    const canonicalUrl = canonicalUrlForTenant(req, `/${seg}`);
    const seoTitle = `${label} | ${req.tenant.name || PRODUCT_NAME}`;
    const seoDescription = `Browse ${label.toLowerCase()} on ${PRODUCT_NAME} — guides and answers for customers and professionals.`;
    return res.render("content_index_public", {
      kind,
      seg,
      label,
      items,
      seoTitle,
      seoDescription,
      canonicalUrl,
      ogUrl: canonicalUrl,
      ...tenantLocals(req),
      ...platformSupport(req),
    });
  }

  router.get("/articles", (req, res) => renderContentIndex(req, res, "article", "Articles & topics"));
  router.get("/guides", (req, res) => renderContentIndex(req, res, "guide", "Pro guides"));
  router.get("/answers", (req, res) => renderContentIndex(req, res, "faq", "Questions & answers"));

  function absoluteMediaUrl(req, raw) {
    const u = String(raw || "").trim();
    if (!u) return "";
    if (u.startsWith("http://") || u.startsWith("https://")) return u;
    return absolutePublicUrl(req, u.startsWith("/") ? u : `/${u}`);
  }

  router.get("/articles/:slug", (req, res) => {
    const tenantId = req.tenant.id;
    const slug = String(req.params.slug || "").trim();
    const row = resolveContentRow(req, "article", slug);
    if (!row) {
      res.status(404);
      return res.render("not_found", {
        slug,
        kind: "article",
        ...tenantLocals(req),
        ...platformSupport(req),
      });
    }
    const preview =
      (req.query.preview === "1" || req.query.preview === "true") && canPreviewDraft(req, tenantId);
    const canonicalUrl = canonicalUrlForTenant(req, `/articles/${encodeURIComponent(row.slug)}`);
    const bodyHtml = formatBodyToHtml(row.body);
    const seoTitle = row.seo_title || row.title;
    const seoDescription = row.seo_description || row.excerpt || "";
    const hero = row.hero_image_url || "/images/hero/home-hero-960.webp";
    const articleJsonLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: row.title,
      dateModified: row.updated_at,
      author: { "@type": "Organization", name: req.tenant.name || PRODUCT_NAME },
    };
    return res.render("content_article", {
      segment: "articles",
      segmentLabel: "Articles & topics",
      segmentIndexHref: `${req.tenantUrlPrefix || ""}/articles`,
      row,
      bodyHtml,
      seoTitle,
      seoDescription,
      canonicalUrl,
      ogUrl: canonicalUrl,
      ogImage: absoluteMediaUrl(req, hero),
      heroImage: hero,
      jsonLdArticle: JSON.stringify(articleJsonLd),
      previewBanner: !!(preview && !row.published),
      ...tenantLocals(req),
      ...platformSupport(req),
    });
  });

  router.get("/guides/:slug", (req, res) => {
    const tenantId = req.tenant.id;
    const slug = String(req.params.slug || "").trim();
    const row = resolveContentRow(req, "guide", slug);
    if (!row) {
      res.status(404);
      return res.render("not_found", {
        slug,
        kind: "guide",
        ...tenantLocals(req),
        ...platformSupport(req),
      });
    }
    const preview =
      (req.query.preview === "1" || req.query.preview === "true") && canPreviewDraft(req, tenantId);
    const canonicalUrl = canonicalUrlForTenant(req, `/guides/${encodeURIComponent(row.slug)}`);
    const bodyHtml = formatBodyToHtml(row.body);
    const seoTitle = row.seo_title || row.title;
    const seoDescription = row.seo_description || row.excerpt || "";
    const hero = row.hero_image_url || "/images/hero/home-hero-960.webp";
    const guideJsonLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: row.title,
      dateModified: row.updated_at,
      author: { "@type": "Organization", name: req.tenant.name || PRODUCT_NAME },
    };
    return res.render("content_article", {
      segment: "guides",
      segmentLabel: "Pro guides",
      segmentIndexHref: `${req.tenantUrlPrefix || ""}/guides`,
      row,
      bodyHtml,
      seoTitle,
      seoDescription,
      canonicalUrl,
      ogUrl: canonicalUrl,
      ogImage: absoluteMediaUrl(req, hero),
      heroImage: hero,
      jsonLdArticle: JSON.stringify(guideJsonLd),
      previewBanner: !!(preview && !row.published),
      ...tenantLocals(req),
      ...platformSupport(req),
    });
  });

  router.get("/answers/:slug", (req, res) => {
    const tenantId = req.tenant.id;
    const slug = String(req.params.slug || "").trim();
    const row = resolveContentRow(req, "faq", slug);
    if (!row) {
      res.status(404);
      return res.render("not_found", {
        slug,
        kind: "faq",
        ...tenantLocals(req),
        ...platformSupport(req),
      });
    }
    const preview =
      (req.query.preview === "1" || req.query.preview === "true") && canPreviewDraft(req, tenantId);
    const canonicalUrl = canonicalUrlForTenant(req, `/answers/${encodeURIComponent(row.slug)}`);
    const seoTitle = row.seo_title || row.title;
    const seoDescription = row.seo_description || row.excerpt || row.body.slice(0, 200);
    const faqJsonLd = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: row.title,
          acceptedAnswer: { "@type": "Answer", text: row.body.replace(/\s+/g, " ").trim().slice(0, 8000) },
        },
      ],
    };
    return res.render("content_faq", {
      row,
      answerHtml: formatBodyToHtml(row.body) || `<p>${escapeHtml(row.body)}</p>`,
      seoTitle,
      seoDescription,
      canonicalUrl,
      ogUrl: canonicalUrl,
      jsonLdFaq: JSON.stringify(faqJsonLd),
      previewBanner: !!(preview && !row.published),
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
