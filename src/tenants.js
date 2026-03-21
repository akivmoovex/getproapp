/**
 * Path-based tenants: Zambia at site root (/), Israel at /il.
 * Legacy /zm/* URLs redirect to /* (canonical).
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

module.exports = {
  TENANTS,
  DEFAULT_TENANT_SLUG,
  getTenantBySlug,
  getTenantById,
  attachTenant,
  isValidZambiaPhoneLocal,
  isValidIsraelPhoneLocal,
  isValidPhoneForTenant,
};
