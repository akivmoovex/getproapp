const { resolveHostname } = require("./host");

/**
 * Host-based tenants: apex + zm.* = Zambia (ISO alpha-2), il.* = Israel.
 * Legacy zam.* redirects to zm.* (canonical Zambia host).
 */
const TENANTS = {
  zm: {
    id: 1,
    slug: "zm",
    name: "Zambia",
    defaultLocale: "en-ZM",
    themeClass: "tenant-zm",
  },
  il: {
    id: 2,
    slug: "il",
    name: "Israel",
    defaultLocale: "he-IL",
    themeClass: "tenant-il",
  },
};

const DEFAULT_TENANT_SLUG = "zm";

/** Subdomains that serve platform tenants (not company one-pagers). ISO-style: zm = Zambia. */
const RESERVED_PLATFORM_SUBDOMAINS = new Set(["zm", "il"]);

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
 * Sets req.tenant for apex + zm/il platform hosts. Skips company subdomains (next() without tenant).
 */
function attachTenantByHost(req, res, next) {
  const sub = req.subdomain;
  if (sub && !RESERVED_PLATFORM_SUBDOMAINS.has(sub)) {
    return next();
  }

  const scheme = process.env.PUBLIC_SCHEME || "https";
  const base = (process.env.BASE_DOMAIN || "").toLowerCase().trim();
  const host = resolveHostname(req);

  req.regionZmUrl = base ? `${scheme}://zm.${base}` : "";
  req.regionIlUrl = base ? `${scheme}://il.${base}` : "";
  res.locals.regionZmUrl = req.regionZmUrl;
  res.locals.regionIlUrl = req.regionIlUrl;

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

  if (sub === "zm" || (base && host === `zm.${base}`)) {
    const t = getTenantBySlug(DEFAULT_TENANT_SLUG);
    req.tenant = t;
    req.tenantSlug = t.slug;
    req.tenantUrlPrefix = "";
    req.isApexHost = false;
    res.locals.tenant = t;
    res.locals.tenantUrlPrefix = "";
    res.locals.isApexHost = false;
    return next();
  }

  if (sub === "il" || (base && host === `il.${base}`)) {
    const t = getTenantBySlug("il");
    req.tenant = t;
    req.tenantSlug = t.slug;
    req.tenantUrlPrefix = "";
    req.isApexHost = false;
    res.locals.tenant = t;
    res.locals.tenantUrlPrefix = "";
    res.locals.isApexHost = false;
    return next();
  }

  return next();
}

module.exports = {
  TENANTS,
  DEFAULT_TENANT_SLUG,
  RESERVED_PLATFORM_SUBDOMAINS,
  getTenantBySlug,
  getTenantById,
  attachTenant,
  attachTenantByHost,
  isValidZambiaPhoneLocal,
  isValidIsraelPhoneLocal,
  isValidPhoneForTenant,
};
