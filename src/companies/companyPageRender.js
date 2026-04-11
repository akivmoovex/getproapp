const QRCode = require("qrcode");
const { getTenantByIdAsync, DEFAULT_TENANT_SLUG } = require("../tenants");
const { TENANT_ZM } = require("../tenants/tenantIds");
const { getTenantContactSupportAsync } = require("../tenants/tenantContactSupport");
const { getClientCountryCode } = require("../platform/host");
const { PRODUCT_NAME } = require("../platform/branding");
const { buildProviderMiniSiteSeo } = require("./providerSeoFallback");
const { getSeoLocale } = require("../seo/seoLocale");
const { getSeoVoiceProfile } = require("../seo/seoVoice");
const { getCtaVoiceProfile } = require("../seo/ctaVoice");
const { buildCompanyJsonLd } = require("./companyJsonLd");
const {
  parseGalleryJson,
  formatReviewDateLabel,
  buildCompanyMiniSiteUrl,
  companyMiniSiteLabel,
} = require("./companyProfile");
const { getPgPool } = require("../db/pg");
const reviewsRepo = require("../db/pg/reviewsRepo");
const categoriesRepo = require("../db/pg/categoriesRepo");

function tenantHomeHrefFromPrefix(prefix) {
  if (!prefix) return "/";
  const p = String(prefix);
  if (p.startsWith("http")) return `${p.replace(/\/$/, "")}/`;
  return `${p}/`;
}

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

function toAbsoluteUrl(req, href) {
  const h = String(href || "").trim();
  if (!h) return "";
  if (h.startsWith("http://") || h.startsWith("https://")) return h;
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();
  if (!host) return "";
  const pathPart = h.startsWith("/") ? h : `/${h}`;
  return `${proto}://${host}${pathPart}`;
}

function buildMediaCarouselItems(company) {
  const galleryItems = parseGalleryJson(company.gallery_json);
  const logoUrl = String(company.logo_url || "").trim();
  const mediaCarouselItems = [];
  if (logoUrl) {
    mediaCarouselItems.push({ url: logoUrl, caption: "", kind: "logo" });
  }
  for (const g of galleryItems) {
    mediaCarouselItems.push({
      url: g.url,
      caption: g.caption || "",
      kind: "gallery",
    });
  }
  return { galleryItems, mediaCarouselItems };
}

function computeReviewStatsFromRows(reviewsRaw) {
  const reviews = reviewsRaw.map((r) => ({
    ...r,
    dateLabel: formatReviewDateLabel(r.created_at),
  }));
  const n = reviews.length;
  let avg_rating = null;
  if (n > 0) {
    const sum = reviews.reduce((a, r) => a + Number(r.rating), 0);
    avg_rating = Math.round((sum / n) * 100) / 100;
  }
  const star_distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) {
    const k = Math.min(5, Math.max(1, Math.round(Number(r.rating))));
    star_distribution[k] = (star_distribution[k] || 0) + 1;
  }
  const star_distribution_total = Object.values(star_distribution).reduce((a, b) => a + b, 0);
  return {
    reviews,
    avg_rating,
    review_count: n,
    star_distribution,
    star_distribution_total,
  };
}

/**
 * Same rows as legacy SQLite query (newest first, limit 60); averages still computed in JS via computeReviewStatsFromRows.
 * @param {import("pg").Pool} pool
 * @param {object} company
 */
async function loadCompanyProfileExtrasFromPg(pool, company) {
  const reviewsRaw = await reviewsRepo.listForCompanyProfile(pool, company.id, 60);
  const stats = computeReviewStatsFromRows(reviewsRaw);
  const { galleryItems, mediaCarouselItems } = buildMediaCarouselItems(company);
  return {
    ...stats,
    galleryItems,
    mediaCarouselItems,
  };
}

/**
 * @param {object[]} reviewOverride - draft reviews { id?, rating, body, author_name, created_at? }
 */
function loadCompanyProfileExtrasFromOverride(company, reviewOverride) {
  const reviewsRaw = (reviewOverride || []).map((r) => ({
    id: r.id,
    rating: Number(r.rating),
    body: String(r.body || ""),
    author_name: String(r.author_name || ""),
    created_at: r.created_at || new Date().toISOString(),
  }));
  const stats = computeReviewStatsFromRows(reviewsRaw);
  const { galleryItems, mediaCarouselItems } = buildMediaCarouselItems(company);
  return {
    ...stats,
    galleryItems,
    mediaCarouselItems,
  };
}

/**
 * @param {import("pg").Pool} pool
 */
async function enrichCompanyWithCategoryAsync(pool, company) {
  if (!company) return company;
  const tid = company.tenant_id;
  const cat = company.category_id
    ? await categoriesRepo.getByIdAndTenantId(pool, company.category_id, tid)
    : null;
  return {
    ...company,
    category_slug: cat ? cat.slug : company.category_slug || null,
    category_name: cat ? cat.name : company.category_name || null,
  };
}

/**
 * Async locals for views/company.ejs (public pages + admin preview + company portal minisite).
 * @param {object} [options.reviewOverride] - if set, use instead of DB reviews
 */
async function buildCompanyPageLocals(req, company, options = {}) {
  const {
    reviewOverride,
    companyPortalReadOnly,
    companyPortalLayout,
    companyPortalPersonnel,
    activeCompanyNav,
    providerPortalBasePath,
  } = options;
  const pool = getPgPool();
  const co = await enrichCompanyWithCategoryAsync(pool, company);
  const tenant =
    (await getTenantByIdAsync(pool, co.tenant_id)) || (await getTenantByIdAsync(pool, TENANT_ZM));
  const tenantUrlPrefix = platformTenantPrefixForSlug(tenant.slug);
  const extras = reviewOverride
    ? loadCompanyProfileExtrasFromOverride(company, reviewOverride)
    : await loadCompanyProfileExtrasFromPg(pool, company);

  const baseDomain = process.env.BASE_DOMAIN || "";
  const companyUrl = buildCompanyMiniSiteUrl(tenant.slug, co.subdomain, baseDomain);
  const miniSiteLabel = companyMiniSiteLabel(tenant.slug, co.subdomain, baseDomain);

  const miniQrTarget = companyUrl && companyUrl !== "#" ? toAbsoluteUrl(req, companyUrl) : "";

  const qrOpts = { margin: 1, width: 168, errorCorrectionLevel: "M" };
  let qrMiniSiteDataUrl = "";
  try {
    if (miniQrTarget) {
      qrMiniSiteDataUrl = await QRCode.toDataURL(miniQrTarget, qrOpts);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[getpro] QR generation failed:", e.message);
  }

  const supportLocals = await getTenantContactSupportAsync(pool, co.tenant_id);

  const categoryObj = co.category_slug ? { slug: co.category_slug, name: co.category_name } : null;
  const providerSeo = buildProviderMiniSiteSeo({
    company: co,
    category: categoryObj,
    tenantName: tenant.name,
    productName: PRODUCT_NAME,
    reviewCount: extras.review_count,
    avgRating: extras.avg_rating,
    clientCountryCode: getClientCountryCode(req),
    seoLocale: getSeoLocale(req),
    seoVoice: getSeoVoiceProfile(req),
    ctaVoice: getCtaVoiceProfile(req),
  });

  const pageLocals = {
    company: co,
    category: categoryObj,
    ...extras,
    baseDomain,
    companyUrl,
    miniSiteLabel,
    qrMiniSiteDataUrl,
    directoryHref: directoryHrefFromTenantPrefix(tenantUrlPrefix),
    tenant,
    tenantUrlPrefix,
    tenantHomeHref: tenantHomeHrefFromPrefix(tenantUrlPrefix),
    regionChoices: req.regionChoices || [],
    ...supportLocals,
    companyPortalReadOnly: !!companyPortalReadOnly,
    companyPortalLayout: !!companyPortalLayout,
    companyPortalPersonnel: companyPortalPersonnel || null,
    activeCompanyNav: activeCompanyNav || "",
    providerPortalBasePath: providerPortalBasePath || "/company",
    seoTitle: providerSeo.seoTitle,
    seoDescription: providerSeo.seoDescription,
    showProviderSeoIntro: providerSeo.showProviderSeoIntro,
    providerSeoIntro: providerSeo.providerSeoIntro,
    providerSchemaDescription: providerSeo.providerSchemaDescription,
    providerSeoUsedAuto: providerSeo.providerSeoUsedAuto,
  };
  pageLocals.jsonLdCompany = buildCompanyJsonLd(req, pageLocals);
  return pageLocals;
}

module.exports = {
  buildCompanyPageLocals,
  enrichCompanyWithCategoryAsync,
  platformTenantPrefixForSlug,
};
