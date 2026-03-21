const { resolveHostname } = require("./host");

/**
 * Host-based tenants: apex + regional subdomains (ISO-style ccTLD hints: zm, il, bw, …).
 * Legacy zam.* redirects to zm.* (canonical Zambia host).
 */
const TENANTS = {
  zm: {
    id: 1,
    slug: "zm",
    name: "Zambia",
    defaultLocale: "en-ZM",
    themeClass: "tenant-zm",
    flagEmoji: "🇿🇲",
  },
  il: {
    id: 2,
    slug: "il",
    name: "Israel",
    defaultLocale: "he-IL",
    themeClass: "tenant-il",
    flagEmoji: "🇮🇱",
  },
  bw: {
    id: 3,
    slug: "bw",
    name: "Botswana",
    defaultLocale: "en-BW",
    themeClass: "tenant-bw",
    flagEmoji: "🇧🇼",
  },
  zw: {
    id: 4,
    slug: "zw",
    name: "Zimbabwe",
    defaultLocale: "en-ZW",
    themeClass: "tenant-zw",
    flagEmoji: "🇿🇼",
  },
  za: {
    id: 5,
    slug: "za",
    name: "South Africa",
    defaultLocale: "en-ZA",
    themeClass: "tenant-za",
    flagEmoji: "🇿🇦",
  },
  na: {
    id: 6,
    slug: "na",
    name: "Namibia",
    defaultLocale: "en-NA",
    themeClass: "tenant-na",
    flagEmoji: "🇳🇦",
  },
};

/** Order shown in the top bar and region picker. */
const PLATFORM_REGION_SLUGS = ["zm", "il", "bw", "zw", "za", "na"];

const DEFAULT_TENANT_SLUG = "zm";

const RESERVED_PLATFORM_SUBDOMAINS = new Set(PLATFORM_REGION_SLUGS);

function buildRegionChoices(base, scheme) {
  if (!base) return [];
  return PLATFORM_REGION_SLUGS.map((slug) => {
    const t = TENANTS[slug];
    if (!t) return null;
    return {
      slug,
      name: t.name,
      flag: t.flagEmoji,
      href: `${scheme}://${slug}.${base}`,
    };
  }).filter(Boolean);
}

function getTenantBySlug(slug) {
  if (!slug) return null;
  const s = String(slug).toLowerCase().trim();
  return TENANTS[s] || null;
}

function getTenantById(id) {
  const n = Number(id);
  if (!n) return null;
  return Object.values(TENANTS).find((t) => t.id === n) || null;
}

function attachTenant(slug, options = {}) {
  return (req, res, next) => {
    const t = getTenantBySlug(slug);
    if (!t) {
      res.status(404);
      return res.type("text").send("Unknown region");
    }
    req.tenant = t;
    req.tenantSlug = t.slug;
    const prefix = options.urlPrefix !== undefined ? options.urlPrefix : `/${t.slug}`;
    req.tenantUrlPrefix = prefix;
    res.locals.tenant = t;
    res.locals.tenantUrlPrefix = prefix;
    next();
  };
}

/** Zambia mobile without country code: 9 digits starting with 7 or 9 (no +260/260). */
function isValidZambiaPhoneLocal(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length !== 9) return false;
  return /^[79]/.test(d);
}

/** Israel mobile without +972: 9 digits, usually starts with 5 for mobile. */
function isValidIsraelPhoneLocal(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 9 && /^5[0-9]/.test(d)) return true;
  if (d.length === 10 && d.startsWith("0") && /^05[0-9]/.test(d)) return true;
  return false;
}

function isValidPhoneForTenant(tenantSlug, raw) {
  if (tenantSlug === "zm") return isValidZambiaPhoneLocal(raw);
  if (tenantSlug === "il") return isValidIsraelPhoneLocal(raw);
  const d = String(raw || "").replace(/\D/g, "");
  return d.length >= 8;
}

/**
 * Sets req.tenant for apex + regional platform hosts. Skips company subdomains (next() without tenant).
 */
function attachTenantByHost(req, res, next) {
  const scheme = process.env.PUBLIC_SCHEME || "https";
  const base = (process.env.BASE_DOMAIN || "").toLowerCase().trim();
  const host = resolveHostname(req);

  req.regionChoices = buildRegionChoices(base, scheme);
  res.locals.regionChoices = req.regionChoices;
  req.regionZmUrl = base ? `${scheme}://zm.${base}` : "";
  req.regionIlUrl = base ? `${scheme}://il.${base}` : "";
  res.locals.regionZmUrl = req.regionZmUrl;
  res.locals.regionIlUrl = req.regionIlUrl;

  const sub = req.subdomain;
  if (sub && !RESERVED_PLATFORM_SUBDOMAINS.has(sub)) {
    return next();
  }

  const isLocal =
    !host || host === "localhost" || host === "127.0.0.1" || host.startsWith("localhost:");

  if (!base || isLocal) {
    const t = getTenantBySlug(DEFAULT_TENANT_SLUG);
    req.tenant = t;
    req.tenantSlug = t.slug;
    req.tenantUrlPrefix = "";
    req.isApexHost = true;
    res.locals.tenant = t;
    res.locals.tenantUrlPrefix = "";
    res.locals.isApexHost = true;
    return next();
  }

  const isApex = host === base || host === `www.${base}`;
  if (isApex) {
    const t = getTenantBySlug(DEFAULT_TENANT_SLUG);
    req.tenant = t;
    req.tenantSlug = t.slug;
    req.tenantUrlPrefix = "";
    req.isApexHost = true;
    res.locals.tenant = t;
    res.locals.tenantUrlPrefix = "";
    res.locals.isApexHost = true;
    return next();
  }

  for (const slug of PLATFORM_REGION_SLUGS) {
    if (sub === slug || host === `${slug}.${base}`) {
      const t = getTenantBySlug(slug);
      req.tenant = t;
      req.tenantSlug = t.slug;
      req.tenantUrlPrefix = "";
      req.isApexHost = false;
      res.locals.tenant = t;
      res.locals.tenantUrlPrefix = "";
      res.locals.isApexHost = false;
      return next();
    }
  }

  return next();
}

module.exports = {
  TENANTS,
  PLATFORM_REGION_SLUGS,
  DEFAULT_TENANT_SLUG,
  RESERVED_PLATFORM_SUBDOMAINS,
  buildRegionChoices,
  getTenantBySlug,
  getTenantById,
  attachTenant,
  attachTenantByHost,
  isValidZambiaPhoneLocal,
  isValidIsraelPhoneLocal,
  isValidPhoneForTenant,
};
