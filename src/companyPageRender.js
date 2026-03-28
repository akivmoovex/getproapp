const QRCode = require("qrcode");
const { getTenantById, DEFAULT_TENANT_SLUG } = require("./tenants");
const { TENANT_ZM } = require("./tenantIds");
const { getTenantContactSupport } = require("./tenantContactSupport");
const {
  parseGalleryJson,
  formatReviewDateLabel,
  buildCompanyMiniSiteUrl,
  companyMiniSiteLabel,
} = require("./companyProfile");

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

function loadCompanyProfileExtrasFromDb(db, company) {
  const cid = company.id;
  const reviewsRaw = db
    .prepare(
      `
      SELECT id, rating, body, author_name, created_at
      FROM reviews
      WHERE company_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT 60
      `
    )
    .all(cid);

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

function enrichCompanyWithCategory(db, company) {
  const tid = company.tenant_id;
  const cat = company.category_id
    ? db.prepare("SELECT slug, name FROM categories WHERE id = ? AND tenant_id = ?").get(company.category_id, tid)
    : null;
  return {
    ...company,
    category_slug: cat ? cat.slug : company.category_slug || null,
    category_name: cat ? cat.name : company.category_name || null,
  };
}

/**
 * Async locals for views/company.ejs (public pages + admin preview).
 * @param {object} [options.reviewOverride] - if set, use instead of DB reviews
 */
async function buildCompanyPageLocals(req, db, company, options = {}) {
  const { reviewOverride, companyPortalReadOnly, companyPortalLayout, companyPortalPersonnel, activeCompanyNav } =
    options;
  const tenant = getTenantById(company.tenant_id, db) || getTenantById(TENANT_ZM, db);
  const tenantUrlPrefix = platformTenantPrefixForSlug(tenant.slug);
  const extras = reviewOverride
    ? loadCompanyProfileExtrasFromOverride(company, reviewOverride)
    : loadCompanyProfileExtrasFromDb(db, company);

  const baseDomain = process.env.BASE_DOMAIN || "";
  const companyUrl = buildCompanyMiniSiteUrl(tenant.slug, company.subdomain, baseDomain);
  const miniSiteLabel = companyMiniSiteLabel(tenant.slug, company.subdomain, baseDomain);

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

  return {
    company,
    category: company.category_slug ? { slug: company.category_slug, name: company.category_name } : null,
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
    ...getTenantContactSupport(db, company.tenant_id),
    companyPortalReadOnly: !!companyPortalReadOnly,
    companyPortalLayout: !!companyPortalLayout,
    companyPortalPersonnel: companyPortalPersonnel || null,
    activeCompanyNav: activeCompanyNav || "",
  };
}

module.exports = {
  buildCompanyPageLocals,
  enrichCompanyWithCategory,
  loadCompanyProfileExtrasFromDb,
  tenantHomeHrefFromPrefix,
  platformTenantPrefixForSlug,
};
