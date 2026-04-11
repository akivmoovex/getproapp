const path = require("path");
const fs = require("fs");
const express = require("express");
const { getTenantByIdAsync, DEFAULT_TENANT_SLUG } = require("../tenants");
const { TENANT_ZM } = require("../tenants/tenantIds");
const {
  getTenantCitiesForClientAsync,
  getJoinCityWatermarkRotateAsync,
} = require("../tenants/tenantCities");
const { israelComingSoonEnabled } = require("../tenants/israelComingSoon");
const { attachReviewStatsToCompanies } = require("../companies/reviewStats");
const { buildCompanyPageLocals } = require("../companies/companyPageRender");
const { getTenantContactSupportAsync } = require("../tenants/tenantContactSupport");
const { formatBodyToHtml, canonicalUrlForTenant, absolutePublicUrl, escapeHtml } = require("../content/contentPages");
const { buildSitemapXml, buildRobotsTxt } = require("../companies/seoPublic");
const { canPreviewDraft } = require("../content/adminPreview");
const { PRODUCT_NAME } = require("../platform/branding");
const { getPgPool } = require("../db/pg");
const phoneRulesService = require("../phone/phoneRulesService");
const categoriesRepo = require("../db/pg/categoriesRepo");
const companiesRepo = require("../db/pg/companiesRepo");
const contentPagesRepo = require("../db/pg/contentPagesRepo");
const { homepageOperationalHref } = require("../lib/marketingOperationalUrls");
const { getClientCountryCode } = require("../platform/host");
const { buildPublicGeoLocals, logPublicGeoDebug } = require("../lib/buildPublicGeoLocals");
const {
  slugifySegment,
  resolveCitySlugToLabel,
  mergeCityNamesForLanding,
  buildServicesExploreLinks,
} = require("../lib/servicesLanding");
const { getSeoLocale, regionLabelForSeo, buildHreflangAlternates } = require("../seo/seoLocale");
const { getSeoVoiceProfile } = require("../seo/seoVoice");
const { getCtaVoiceProfile } = require("../seo/ctaVoice");
const seoCopy = require("../seo/seoCopy");
const { applySeasonalTrendingBoost, resolveGeoRulesSourceLabel } = require("../config/seasonalCategoryBoosts");

function loadSearchLists() {
  const p = path.join(__dirname, "../../public/data/search-lists.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * Merge static autocomplete labels with tenant category names (dedupe, case-insensitive; static list order first).
 * @param {string[]} staticServices
 * @param {string[]} categoryNames
 * @returns {string[]}
 */
function mergeSearchServiceLists(staticServices, categoryNames) {
  const base = Array.isArray(staticServices) ? staticServices : [];
  const out = base.slice();
  const seen = new Set(out.map((s) => String(s).trim().toLowerCase()).filter(Boolean));
  for (const raw of categoryNames || []) {
    const n = String(raw || "").trim();
    if (!n) continue;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

/**
 * @param {string} value
 * @param {string[]|undefined} tenantCategoryNames optional names from `public.categories` for this tenant
 */
function isWhitelistedService(value, tenantCategoryNames) {
  if (!value) return true;
  const v = String(value).trim().toLowerCase();
  if (loadSearchLists().services.some((s) => s.toLowerCase() === v)) return true;
  if (Array.isArray(tenantCategoryNames) && tenantCategoryNames.some((n) => String(n).trim().toLowerCase() === v)) {
    return true;
  }
  return false;
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

function absoluteMediaUrl(req, raw) {
  const u = String(raw || "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return absolutePublicUrl(req, u.startsWith("/") ? u : `/${u}`);
}

function buildDirectoryItemListJsonLd(req, companies) {
  const list = (companies || []).slice(0, 24);
  if (!list.length) return "";
  const itemListElement = list.map((c, i) => ({
    "@type": "ListItem",
    position: i + 1,
    item: {
      "@type": "LocalBusiness",
      name: c.name,
      url: canonicalUrlForTenant(req, `/company/${c.id}`),
    },
  }));
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: list.length,
    itemListElement,
  });
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
  "about",
  "terms",
  "getpro-admin",
  "global",
  "demo",
  "il",
  "zm",
  "zw",
  "bw",
  "za",
  "na",
  "field-agent",
  "services",
]);

module.exports = function publicRoutes() {
  const router = express.Router();

  async function loadCategoriesList(tenantId) {
    const pool = getPgPool();
    return categoriesRepo.listByTenantId(pool, tenantId);
  }

  // PERF: Tiny in-process cache for homepage query results to reduce TTFB.
  // Safe: short TTL, per-tenant, caches only public lists (not user-specific).
  const HOME_CACHE_TTL_MS = 60 * 1000;
  const homeCache = new Map(); // `${tenantId}:${locale}` -> { ts, categories, contentArticles, contentGuides, contentFaqs }

  function contentLocale(req) {
    const t = req.tenant;
    if (t && t.defaultLocale) return String(t.defaultLocale);
    return "en";
  }

  async function platformSupportAsync(req) {
    const tid = req.tenant && req.tenant.id;
    const pool = getPgPool();
    return getTenantContactSupportAsync(pool, tid);
  }

  async function renderCompanyPage(req, res, company) {
    const locals = await buildCompanyPageLocals(req, company);
    const co = locals.company;
    const canonicalUrl = canonicalUrlForTenant(req, `/company/${co.id}`);
    const logoU = co.logo_url && String(co.logo_url).trim();
    const ogImage = logoU ? absoluteMediaUrl(req, logoU) : "";
    return res.render("company", {
      ...locals,
      ...tenantLocals(req),
      canonicalUrl,
      ogUrl: canonicalUrl,
      ogImage,
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
    const seoLocale = getSeoLocale(req);
    const seoVoice = getSeoVoiceProfile(req);
    const ctaVoice = getCtaVoiceProfile(req);
    return {
      tenant: t,
      tenantUrlPrefix: prefix,
      tenantHomeHref: tenantHomeHrefFromPrefix(prefix),
      isApexHost: !!req.isApexHost,
      showRegionPickerUi,
      regionZmUrl: req.regionZmUrl || "",
      regionIlUrl: req.regionIlUrl || "",
      regionChoices: req.regionChoices || [],
      seoLocale,
      seoVoice,
      ctaVoice,
      htmlLang: seoLocale === "he" ? "he" : "en",
      htmlDir: seoLocale === "he" ? "rtl" : "ltr",
      hreflangAlternates: buildHreflangAlternates(req, req.path || "/"),
    };
  }

  router.use(async (req, res, next) => {
    if (israelComingSoonEnabled() && req.tenant && req.tenant.slug === "il") {
      const scheme = process.env.PUBLIC_SCHEME || "https";
      const base = (process.env.BASE_DOMAIN || "").trim();
      const apexUrl = base ? `${scheme}://${base}` : "/";
      return res.render("coming_soon_il", {
        ...tenantLocals(req),
        apexUrl,
        apexHostLabel: base || "Home",
        ...(await platformSupportAsync(req)),
      });
    }
    next();
  });

  async function resolveContentRowAsync(req, kind, slug) {
    const tenantId = req.tenant.id;
    const loc = contentLocale(req);
    const preview =
      (req.query.preview === "1" || req.query.preview === "true") && canPreviewDraft(req, tenantId);
    const pool = getPgPool();
    if (preview) {
      return (await contentPagesRepo.getRowBySlug(pool, tenantId, kind, slug, loc)) || null;
    }
    return (await contentPagesRepo.getBySlugPublished(pool, tenantId, kind, slug, loc)) || null;
  }

  router.get("/", async (req, res) => {
    const tenantId = req.tenant.id;
    const loc = contentLocale(req);
    const cc = getClientCountryCode(req) || "XX";
    const seoLocale = getSeoLocale(req);
    const cacheKey = `${tenantId}:${loc}:${cc}:${seoLocale}`;
    const now = Date.now();
    let cached = homeCache.get(cacheKey);
    if (!cached || now - cached.ts > HOME_CACHE_TTL_MS) {
      const pool = getPgPool();
      const [contentArticles, contentGuides, contentFaqs] = await Promise.all([
        contentPagesRepo.listPublishedByKind(pool, tenantId, "article", loc),
        contentPagesRepo.listPublishedByKind(pool, tenantId, "guide", loc),
        contentPagesRepo.listPublishedByKind(pool, tenantId, "faq", loc),
      ]);
      cached = {
        ts: now,
        categories: await loadCategoriesList(tenantId),
        contentArticles,
        contentGuides,
        contentFaqs,
      };
      homeCache.set(cacheKey, cached);
    }

    const canonicalUrl = canonicalUrlForTenant(req, "/");
    const platformName = req.tenant.name || PRODUCT_NAME;
    const countryLabelSeo = regionLabelForSeo(cc, seoLocale);
    const voice = getSeoVoiceProfile(req);
    const homeSeo = seoCopy.homePage(seoLocale, {
      brandName: platformName,
      countryOrTenant: countryLabelSeo || "",
      voice,
    });
    const seoTitle = homeSeo.title;
    const seoDescription = homeSeo.description;
    const orgJsonLd = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: platformName,
      url: canonicalUrl,
    };

    const geoLocals = buildPublicGeoLocals(req);
    logPublicGeoDebug(req, geoLocals);

    const _tenantLocals = tenantLocals(req);
    return res.render("index", {
      categories: cached.categories,
      baseDomain: process.env.BASE_DOMAIN || "",
      seoTitle,
      seoDescription,
      canonicalUrl,
      ogUrl: canonicalUrl,
      ogType: "website",
      ogImage: absolutePublicUrl(req, "/images/hero/home-hero-960.webp"),
      orgJsonLd: JSON.stringify(orgJsonLd),
      contentArticles: cached.contentArticles,
      contentGuides: cached.contentGuides,
      contentFaqs: cached.contentFaqs,
      /** Homepage-only; other routes do not pass this — use opsHref in shared partials. */
      homepageOpsHref: (p) => homepageOperationalHref(req, p),
      servicesExploreLinks: buildServicesExploreLinks(cached.categories, _tenantLocals.tenantUrlPrefix),
      ...geoLocals,
      ..._tenantLocals,
      ...(await platformSupportAsync(req)),
      showRegionPickerUi: false,
    });
  });

  /** Public search typeahead: categories + providers with mini-site (tenant-scoped, no auth). */
  function publicTenantPathForSuggestions(req, relPath) {
    const p = relPath.startsWith("/") ? relPath : `/${relPath}`;
    const base = req.tenantUrlPrefix != null ? String(req.tenantUrlPrefix).replace(/\/$/, "") : "";
    if (!base) return p;
    if (base.startsWith("http")) return `${base}${p}`;
    return `${base}${p}`;
  }

  /** Tenant-scoped service labels for autocomplete: static JSON + DB category names + trending categories (by listing count). */
  router.get("/data/tenant-search-lists.json", async (req, res, next) => {
    try {
      const tenantId = req.tenant && req.tenant.id;
      const base = loadSearchLists();
      if (!tenantId) {
        res
          .type("application/json")
          .set("Cache-Control", "public, max-age=300")
          .send(JSON.stringify({ ...base, trendingCategories: [] }));
        return;
      }
      const pool = getPgPool();
      const [categories, topCatCandidates] = await Promise.all([
        categoriesRepo.listByTenantId(pool, tenantId),
        categoriesRepo.listTopByCompanyCount(pool, tenantId, 20),
      ]);
      const names = (categories || []).map((c) => c.name).filter(Boolean);
      const services = mergeSearchServiceLists(base.services, names);
      const trendingDebug =
        req.query && String(req.query.trending_debug || "") === "1" && process.env.NODE_ENV !== "production";
      const boosted = applySeasonalTrendingBoost(topCatCandidates || [], {
        tenantSlug: req.tenant && req.tenant.slug,
        countryCode: getClientCountryCode(req) || "",
        month: new Date().getMonth() + 1,
        debug: trendingDebug,
      });
      const trendingTop = boosted.slice(0, 5);
      const trendingCategories = trendingTop.map((c) => ({
        name: c.name,
        slug: c.slug,
        url: publicTenantPathForSuggestions(req, `/category/${encodeURIComponent(c.slug)}`),
      }));
      /** @type {Record<string, unknown>} */
      const payload = { services, cities: base.cities, trendingCategories };
      if (trendingDebug) {
        const ccDbg = getClientCountryCode(req) || "";
        payload.trendingBoostContext = {
          month: new Date().getMonth() + 1,
          country_code: ccDbg || "XX",
          geo_rules_source: resolveGeoRulesSourceLabel(req.tenant && req.tenant.slug, ccDbg),
        };
        payload.trendingCategoriesDebug = boosted.map((c) => ({
          slug: c.slug,
          name: c.name,
          country: ccDbg || "XX",
          base_score: c.listing_count,
          geo_seasonal_boost: c.geo_seasonal_boost,
          fallback_seasonal_boost: c.fallback_seasonal_boost,
          seasonal_boost: c.seasonal_boost,
          final_score: c.final_score,
        }));
      }
      res.type("application/json").set("Cache-Control", "public, max-age=120").send(JSON.stringify(payload));
    } catch (e) {
      next(e);
    }
  });

  router.get("/data/search-suggestions.json", async (req, res, next) => {
    try {
      const tenantId = req.tenant && req.tenant.id;
      const raw = req.query.q != null ? String(req.query.q) : "";
      const term = raw.trim().replace(/[%_\\]/g, "");
      if (!tenantId || term.length < 2) {
        res.type("application/json").set("Cache-Control", "no-store");
        res.send(JSON.stringify({ categories: [], providers: [] }));
        return;
      }
      const pool = getPgPool();
      const [catRows, provRows] = await Promise.all([
        categoriesRepo.suggestByNameIlike(pool, tenantId, term, 5),
        companiesRepo.suggestByNameForPublicSearch(pool, tenantId, term, 5),
      ]);
      const categories = catRows.map((c) => ({
        label: c.name,
        slug: c.slug,
        url: publicTenantPathForSuggestions(req, `/category/${encodeURIComponent(c.slug)}`),
      }));
      const providers = provRows.map((c) => ({
        name: c.name,
        slug: c.subdomain,
        url: publicTenantPathForSuggestions(req, `/${encodeURIComponent(c.subdomain)}`),
      }));
      res.type("application/json").set("Cache-Control", "no-store");
      res.send(JSON.stringify({ categories, providers }));
    } catch (e) {
      next(e);
    }
  });

  router.get("/directory", async (req, res) => {
    const tenantId = req.tenant.id;
    const pool = getPgPool();
    const categories = await loadCategoriesList(tenantId);
    const tenantCategoryNames = (categories || []).map((c) => c.name).filter(Boolean);

    const selected = req.query.category ? String(req.query.category) : null;
    const searchRaw = req.query.q ? String(req.query.q).trim() : "";
    const cityRaw = req.query.city ? String(req.query.city).trim() : "";
    const searchOk = !searchRaw || isWhitelistedService(searchRaw, tenantCategoryNames);
    const cityOk = !cityRaw || isWhitelistedCity(cityRaw);
    const searchQ = searchOk ? searchRaw.replace(/[%_\\]/g, "") : "";
    const cityQ = cityOk ? cityRaw.replace(/[%_\\]/g, "") : "";
    const homeFeatured =
      req.query.home_featured === "1" || String(req.query.home_featured || "").toLowerCase() === "true";

    let mergedCityNamesForServices = null;
    if (!homeFeatured && selected && cityQ && !searchQ) {
      mergedCityNamesForServices = mergeCityNamesForLanding(await getTenantCitiesForClientAsync(pool, tenantId));
      const cityLabel = resolveCitySlugToLabel(slugifySegment(cityRaw), mergedCityNamesForServices);
      if (cityLabel && categories.some((c) => c.slug === selected)) {
        return res.redirect(
          301,
          `/services/${encodeURIComponent(selected)}/${encodeURIComponent(slugifySegment(cityLabel))}`
        );
      }
    }

    let companies = [];
    /** Homepage Search + footer Start Search use `home_featured=1` — must stay featured-only even with category/q/city (see listDirectoryFeatured*). */
    if (homeFeatured) {
      const cityLike = cityQ ? `%${cityQ}%` : null;
      const searchPattern = searchQ ? `%${searchQ}%` : null;
      const cityPattern = cityQ ? `%${cityQ}%` : null;
      if (selected) {
        companies = await companiesRepo.listDirectoryFeaturedByCategorySlug(pool, tenantId, selected, cityLike);
      } else if (searchQ || cityQ) {
        companies = await companiesRepo.listDirectoryFeaturedSearchIlike(
          pool,
          tenantId,
          searchPattern,
          cityPattern,
          48
        );
      } else {
        companies = await companiesRepo.listDirectoryHomeFeatured(pool, tenantId, 48);
      }
    } else if (selected) {
      const cityLike = cityQ ? `%${cityQ}%` : null;
      companies = await companiesRepo.listDirectoryByCategorySlug(pool, tenantId, selected, cityLike);
    } else if (searchQ || cityQ) {
      const searchPattern = searchQ ? `%${searchQ}%` : null;
      const cityPattern = cityQ ? `%${cityQ}%` : null;
      companies = await companiesRepo.listDirectorySearchIlike(pool, tenantId, searchPattern, cityPattern, 48);
    } else {
      companies = await companiesRepo.listDirectoryDefault(pool, tenantId, 24);
    }

    const phoneRulesPublic = await phoneRulesService.getPublicPhoneRulesForTenant(pool, tenantId);

    companies = await attachReviewStatsToCompanies(companies);

    const platformName = req.tenant.name || PRODUCT_NAME;
    const ccDir = getClientCountryCode(req) || "XX";
    const seoLocale = getSeoLocale(req);
    const voice = getSeoVoiceProfile(req);
    const countryLabelSeo = regionLabelForSeo(ccDir, seoLocale);
    const locationLabel = cityQ || countryLabelSeo || platformName;

    let canonicalUrl;
    let noindex = false;
    if (homeFeatured) {
      canonicalUrl = canonicalUrlForTenant(req, "/directory");
      noindex = true;
    } else if (selected && cityQ && !searchQ) {
      const namesForCanon =
        mergedCityNamesForServices ||
        mergeCityNamesForLanding(await getTenantCitiesForClientAsync(pool, tenantId));
      const resolvedCanon = resolveCitySlugToLabel(slugifySegment(cityRaw), namesForCanon);
      if (resolvedCanon) {
        canonicalUrl = canonicalUrlForTenant(
          req,
          `/services/${encodeURIComponent(selected)}/${encodeURIComponent(slugifySegment(resolvedCanon))}`
        );
      } else {
        canonicalUrl = canonicalUrlForTenant(req, `/category/${encodeURIComponent(selected)}`);
      }
    } else if (selected) {
      canonicalUrl = canonicalUrlForTenant(req, `/category/${encodeURIComponent(selected)}`);
    } else if (searchQ || cityQ) {
      canonicalUrl = canonicalUrlForTenant(req, "/directory");
      noindex = true;
    } else {
      canonicalUrl = canonicalUrlForTenant(req, "/directory");
    }

    let seoTitle;
    let seoDescription;
    let directoryPageH1;
    if (homeFeatured) {
      const catRow = selected ? (categories || []).find((c) => c.slug === selected) : null;
      const featuredCatName = catRow ? catRow.name : "";
      const featuredOpts = {
        categoryName: selected && featuredCatName ? featuredCatName : "",
        city: cityQ || "",
        voice,
      };
      const featuredSeo =
        companies && companies.length
          ? seoCopy.directoryFeatured(seoLocale, platformName, featuredOpts)
          : seoCopy.directoryFeaturedEmpty(seoLocale, platformName, featuredOpts);
      seoTitle = featuredSeo.title;
      seoDescription = featuredSeo.description;
    } else if (selected) {
      const catRow = (categories || []).find((c) => c.slug === selected);
      const catName = catRow ? catRow.name : selected;
      if (cityQ && !searchQ) {
        const d = seoCopy.directoryCategoryCity(seoLocale, {
          catName,
          cityQ,
          platformName,
          voice,
        });
        seoTitle = d.title;
        seoDescription = d.description;
        directoryPageH1 = d.h1;
      } else {
        const d = seoCopy.directoryCategoryOnly(seoLocale, {
          catName,
          platformName,
          voice,
        });
        seoTitle = d.title;
        seoDescription = d.description;
      }
    } else if (searchQ || cityQ) {
      if (!searchQ && cityQ) {
        const d = seoCopy.directoryCityPage(seoLocale, { city: cityQ, brandName: platformName, voice });
        seoTitle = d.title;
        seoDescription = d.description;
      } else {
        const qPart = searchQ ? String(searchQ) : "services";
        const d = seoCopy.directorySearch(seoLocale, { qPart, platformName, cityQ, locationLabel, voice });
        seoTitle = d.title;
        seoDescription = d.description;
      }
    } else {
      const d = seoCopy.directoryMain(seoLocale, platformName, voice);
      seoTitle = d.title;
      seoDescription = d.description;
    }

    const jsonLdDirectory = !noindex ? buildDirectoryItemListJsonLd(req, companies) : "";
    const defaultOg = absolutePublicUrl(req, "/images/hero/home-hero-960.webp");

    const geoLocals = buildPublicGeoLocals(req);
    logPublicGeoDebug(req, geoLocals);

    return res.render("directory", {
      categories,
      phoneRulesPublic,
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
      ogImage: defaultOg,
      ogType: "website",
      noindex,
      jsonLdDirectory,
      ...buildEmptyStateSuggestions(categories, selected, cityOk ? cityRaw : ""),
      directoryFeaturedOnly: homeFeatured,
      directoryPageH1,
      ...geoLocals,
      ...tenantLocals(req),
      ...(await platformSupportAsync(req)),
    });
  });

  router.get("/services/:categorySlug/:citySlug", async (req, res, next) => {
    try {
      const tenantId = req.tenant.id;
      const categorySlug = String(req.params.categorySlug || "").trim().toLowerCase();
      const citySlug = String(req.params.citySlug || "").trim().toLowerCase();
      if (
        !categorySlug ||
        !citySlug ||
        !/^[a-z0-9-]+$/.test(categorySlug) ||
        !/^[a-z0-9-]+$/.test(citySlug)
      ) {
        res.status(404);
        return res.render("not_found", {
          slug: `${categorySlug}/${citySlug}`,
          kind: "services",
          ...tenantLocals(req),
          ...(await platformSupportAsync(req)),
        });
      }
      const pool = getPgPool();
      const category = await categoriesRepo.getBySlugAndTenantId(pool, categorySlug, tenantId);
      if (!category) {
        res.status(404);
        return res.render("not_found", {
          slug: categorySlug,
          kind: "category",
          ...tenantLocals(req),
          ...(await platformSupportAsync(req)),
        });
      }
      const tenantCities = await getTenantCitiesForClientAsync(pool, tenantId);
      const cityNames = mergeCityNamesForLanding(tenantCities);
      const cityLabel = resolveCitySlugToLabel(citySlug, cityNames);
      if (!cityLabel) {
        res.status(404);
        return res.render("not_found", {
          slug: citySlug,
          kind: "city",
          ...tenantLocals(req),
          ...(await platformSupportAsync(req)),
        });
      }
      const cityLike = `%${cityLabel.replace(/[%_\\]/g, "")}%`;
      let companies = await companiesRepo.listDirectoryByCategorySlug(pool, tenantId, category.slug, cityLike);
      const phoneRulesPublic = await phoneRulesService.getPublicPhoneRulesForTenant(pool, tenantId);
      companies = await attachReviewStatsToCompanies(companies);
      const categories = await loadCategoriesList(tenantId);
      const platformName = req.tenant.name || PRODUCT_NAME;
      const seoLocale = getSeoLocale(req);
      const voice = getSeoVoiceProfile(req);
      const landingSeo = seoCopy.servicesLanding(seoLocale, {
        categoryName: category.name,
        city: cityLabel,
        brandName: platformName,
        voice,
      });
      const seoTitle = landingSeo.title;
      const seoDescription = landingSeo.description;
      const canonicalUrl = canonicalUrlForTenant(
        req,
        `/services/${encodeURIComponent(category.slug)}/${encodeURIComponent(slugifySegment(cityLabel))}`
      );
      const defaultOg = absolutePublicUrl(req, "/images/hero/home-hero-960.webp");
      const jsonLdDirectory = buildDirectoryItemListJsonLd(req, companies);
      const geoLocals = buildPublicGeoLocals(req);
      logPublicGeoDebug(req, geoLocals);
      return res.render("directory", {
        categories,
        phoneRulesPublic,
        selectedCategory: category.slug,
        searchQuery: "",
        cityQuery: cityLabel,
        companies,
        baseDomain: process.env.BASE_DOMAIN || "",
        companyMiniSiteHref: (sub) => `/${encodeURIComponent(String(sub || "").trim())}`,
        seoTitle,
        seoDescription,
        canonicalUrl,
        ogUrl: canonicalUrl,
        ogImage: defaultOg,
        ogType: "website",
        noindex: false,
        jsonLdDirectory,
        directoryPageH1: landingSeo.h1,
        ...buildEmptyStateSuggestions(categories, category.slug, cityLabel),
        directoryFeaturedOnly: false,
        ...geoLocals,
        ...tenantLocals(req),
        ...(await platformSupportAsync(req)),
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/category/:categorySlug", async (req, res) => {
    const tenantId = req.tenant.id;
    const categorySlug = req.params.categorySlug;
    const pool = getPgPool();
    const category = await categoriesRepo.getBySlugAndTenantId(pool, categorySlug, tenantId);
    if (!category) {
      res.status(404);
      return res.render("not_found", {
        slug: categorySlug,
        kind: "category",
        ...tenantLocals(req),
        ...(await platformSupportAsync(req)),
      });
    }

    const companies = await companiesRepo.listDirectoryByCategorySlug(pool, tenantId, categorySlug, null);

    const companiesWithReviews = await attachReviewStatsToCompanies(companies);

    const categories = await loadCategoriesList(tenantId);

    const canonicalUrl = canonicalUrlForTenant(req, `/category/${category.slug}`);
    const platformName = req.tenant.name || PRODUCT_NAME;
    const catSeo = seoCopy.categoryPage(getSeoLocale(req), {
      categoryName: category.name,
      brandName: platformName,
      voice: getSeoVoiceProfile(req),
    });
    const seoTitle = catSeo.title;
    const seoDescription = catSeo.description;

    const phoneRulesPublic = await phoneRulesService.getPublicPhoneRulesForTenant(pool, tenantId);

    return res.render("category", {
      category,
      categories,
      phoneRulesPublic,
      companies: companiesWithReviews,
      baseDomain: process.env.BASE_DOMAIN || "",
      companyMiniSiteHref: (sub) => `/${encodeURIComponent(String(sub || "").trim())}`,
      seoTitle,
      seoDescription,
      canonicalUrl,
      ogUrl: canonicalUrl,
      ...buildEmptyStateSuggestions(categories, category.slug, ""),
      ...tenantLocals(req),
      ...(await platformSupportAsync(req)),
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
          ...(await platformSupportAsync(req)),
        });
      }
      const pool = getPgPool();
      const company = await companiesRepo.getWithCategoryByIdAndTenantId(pool, id, tenantId);
      if (!company) {
        res.status(404);
        return res.render("not_found", {
          slug: String(id),
          kind: "company",
          ...tenantLocals(req),
          ...(await platformSupportAsync(req)),
        });
      }
      return await renderCompanyPage(req, res, company);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/join", async (req, res) => {
    const tenantId = req.tenant.id;
    const pool = getPgPool();
    const joinTenantCities = await getTenantCitiesForClientAsync(pool, tenantId);
    const joinCityWatermarkRotate = await getJoinCityWatermarkRotateAsync(pool, tenantId);
    const phoneRulesPublic = await phoneRulesService.getPublicPhoneRulesForTenant(pool, tenantId);
    const canonicalUrl = canonicalUrlForTenant(req, "/join");
    return res.render("join", {
      baseDomain: process.env.BASE_DOMAIN || "",
      joinEmbedModal: req.query.embed === "1" || req.query.embed === "true",
      joinTenantCities,
      joinCityWatermarkRotate,
      phoneRulesPublic,
      seoTitle: `List your business | ${req.tenant.name || PRODUCT_NAME}`,
      seoDescription: `Create a verified profile on ${PRODUCT_NAME} so customers can find your services, view your details, and send lead requests.`,
      canonicalUrl,
      ogUrl: canonicalUrl,
      ogType: "website",
      noindex: true,
      ...tenantLocals(req),
      ...(await platformSupportAsync(req)),
    });
  });

  // Internal UI component pattern library (dev reference).
  // Intentionally not linked in public navigation.
  router.get("/ui-demo", async (req, res) => {
    const canonicalUrl = canonicalUrlForTenant(req, "/ui-demo");
    return res.render("ui_demo", {
      seoTitle: `UI Demo · ${req.tenant.name || PRODUCT_NAME}`,
      seoDescription: `Visual reference for the ${PRODUCT_NAME} web component system (Buttons / Cards / Inputs).`,
      canonicalUrl,
      ogUrl: canonicalUrl,
      ...tenantLocals(req),
      ...(await platformSupportAsync(req)),
    });
  });

  /** Internal design-system playground (Storybook-style); not product UI. */
  router.get("/ui", async (req, res, next) => {
    try {
      const tenantId = req.tenant && req.tenant.id;
      let docsSearchCategories = [];
      if (tenantId) {
        const cats = await loadCategoriesList(tenantId);
        docsSearchCategories = (cats || []).map((c) => ({ slug: c.slug, name: c.name }));
      }
      const canonicalUrl = canonicalUrlForTenant(req, "/ui");
      return res.render("ui_docs", {
        seoTitle: `Design system · ${req.tenant.name || PRODUCT_NAME}`,
        seoDescription: "Internal UI playground for components, states, and theme validation.",
        canonicalUrl,
        ogUrl: canonicalUrl,
        noindex: true,
        docsSearchCategories,
        ...tenantLocals(req),
        ...(await platformSupportAsync(req)),
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/sitemap.xml", async (req, res) => {
    res.type("application/xml");
    res.send(await buildSitemapXml(req));
  });

  router.get("/robots.txt", (req, res) => {
    res.type("text/plain");
    res.send(buildRobotsTxt(req));
  });

  router.get("/about", async (req, res, next) => {
    try {
      const canonicalUrl = canonicalUrlForTenant(req, "/about");
      const seoTitle = `About | ${req.tenant.name || PRODUCT_NAME}`;
      const seoDescription = `About ${PRODUCT_NAME} — directory platform.`;
      return res.render("about", {
        seoTitle,
        seoDescription,
        canonicalUrl,
        ogUrl: canonicalUrl,
        ...tenantLocals(req),
        ...(await platformSupportAsync(req)),
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/terms", async (req, res, next) => {
    try {
      const tenantId = req.tenant.id;
      const row = await resolveContentRowAsync(req, "eula", "eula");
      const canonicalUrl = canonicalUrlForTenant(req, "/terms");
      let bodyHtml = "";
      let seoTitle = `Terms of use | ${req.tenant.name || PRODUCT_NAME}`;
      let seoDescription = `Terms of use and end-user license for ${req.tenant.name || PRODUCT_NAME}.`;
      let previewBanner = false;
      if (row) {
        bodyHtml = formatBodyToHtml(row.body);
        seoTitle = row.seo_title || row.title || seoTitle;
        seoDescription = row.seo_description || row.excerpt || seoDescription;
        const preview =
          (req.query.preview === "1" || req.query.preview === "true") && canPreviewDraft(req, tenantId);
        previewBanner = !!(preview && !row.published);
      }
      return res.render("terms", {
        row: row || null,
        bodyHtml,
        seoTitle,
        seoDescription,
        canonicalUrl,
        ogUrl: canonicalUrl,
        previewBanner,
        ...tenantLocals(req),
        ...(await platformSupportAsync(req)),
      });
    } catch (e) {
      next(e);
    }
  });

  async function renderContentIndex(req, res, kind, label) {
    const tenantId = req.tenant.id;
    const pool = getPgPool();
    const items = await contentPagesRepo.listPublishedByKind(pool, tenantId, kind, contentLocale(req));
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
      ...(await platformSupportAsync(req)),
    });
  }

  router.get("/articles", async (req, res, next) => {
    try {
      await renderContentIndex(req, res, "article", "Articles & topics");
    } catch (e) {
      next(e);
    }
  });
  router.get("/guides", async (req, res, next) => {
    try {
      await renderContentIndex(req, res, "guide", "Pro guides");
    } catch (e) {
      next(e);
    }
  });
  router.get("/answers", async (req, res, next) => {
    try {
      await renderContentIndex(req, res, "faq", "Questions & answers");
    } catch (e) {
      next(e);
    }
  });

  router.get("/articles/:slug", async (req, res) => {
    const tenantId = req.tenant.id;
    const slug = String(req.params.slug || "").trim();
    const row = await resolveContentRowAsync(req, "article", slug);
    if (!row) {
      res.status(404);
      return res.render("not_found", {
        slug,
        kind: "article",
        ...tenantLocals(req),
        ...(await platformSupportAsync(req)),
      });
    }
    const preview =
      (req.query.preview === "1" || req.query.preview === "true") && canPreviewDraft(req, tenantId);
    const canonicalUrl = canonicalUrlForTenant(req, `/articles/${encodeURIComponent(row.slug)}`);
    const bodyHtml = formatBodyToHtml(row.body);
    const brandName = req.tenant.name || PRODUCT_NAME;
    const articleSeo = seoCopy.articlePage(getSeoLocale(req), { articleTitle: row.title, brandName });
    const seoTitle = articleSeo.title;
    const seoDescription = articleSeo.description;
    const hero = row.hero_image_url || "/images/hero/home-hero-960.webp";
    const articleJsonLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: row.title,
      url: canonicalUrl,
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
      ...(await platformSupportAsync(req)),
    });
  });

  router.get("/guides/:slug", async (req, res) => {
    const tenantId = req.tenant.id;
    const slug = String(req.params.slug || "").trim();
    const row = await resolveContentRowAsync(req, "guide", slug);
    if (!row) {
      res.status(404);
      return res.render("not_found", {
        slug,
        kind: "guide",
        ...tenantLocals(req),
        ...(await platformSupportAsync(req)),
      });
    }
    const preview =
      (req.query.preview === "1" || req.query.preview === "true") && canPreviewDraft(req, tenantId);
    const canonicalUrl = canonicalUrlForTenant(req, `/guides/${encodeURIComponent(row.slug)}`);
    const bodyHtml = formatBodyToHtml(row.body);
    const brandName = req.tenant.name || PRODUCT_NAME;
    const guideSeo = seoCopy.articlePage(getSeoLocale(req), { articleTitle: row.title, brandName });
    const seoTitle = guideSeo.title;
    const seoDescription = guideSeo.description;
    const hero = row.hero_image_url || "/images/hero/home-hero-960.webp";
    const guideJsonLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: row.title,
      url: canonicalUrl,
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
      ...(await platformSupportAsync(req)),
    });
  });

  router.get("/answers/:slug", async (req, res) => {
    const tenantId = req.tenant.id;
    const slug = String(req.params.slug || "").trim();
    const row = await resolveContentRowAsync(req, "faq", slug);
    if (!row) {
      res.status(404);
      return res.render("not_found", {
        slug,
        kind: "faq",
        ...tenantLocals(req),
        ...(await platformSupportAsync(req)),
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
      ...(await platformSupportAsync(req)),
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
      const pool = getPgPool();
      const company = await companiesRepo.getWithCategoryBySubdomainAndTenantId(pool, seg, tenantId);
      if (!company) {
        res.status(404);
        return res.render("not_found", {
          slug: seg,
          kind: "mini-site",
          ...tenantLocals(req),
          ...(await platformSupportAsync(req)),
        });
      }
      return await renderCompanyPage(req, res, company);
    } catch (e) {
      return next(e);
    }
  });

  async function renderCompanyHome(req, res) {
    const pool = getPgPool();
    const company = await companiesRepo.getWithCategoryBySubdomain(pool, req.subdomain);

    if (!company) {
      res.status(404);
      const scheme = process.env.PUBLIC_SCHEME || "https";
      const base = (process.env.BASE_DOMAIN || "").trim();
      const tp = base ? `${scheme}://zm.${base}` : "";
      const tenant = await getTenantByIdAsync(pool, TENANT_ZM);
      const supportLocals = await getTenantContactSupportAsync(pool, TENANT_ZM);
      return res.render("not_found", {
        subdomain: req.subdomain,
        tenant,
        tenantUrlPrefix: tp,
        tenantHomeHref: tenantHomeHrefFromPrefix(tp),
        regionChoices: req.regionChoices || [],
        ...supportLocals,
      });
    }

    return renderCompanyPage(req, res, company);
  }

  return { router, renderCompanyHome };
};
