const { resolveHostname } = require("./host");
const { STAGES } = require("./tenantStages");

/**
 * Static display metadata (theme + flag). DB `tenants` row supplies id, name, stage.
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

const PLATFORM_REGION_SLUGS = ["zm", "il", "bw", "zw", "za", "na"];

const DEFAULT_TENANT_SLUG = "zm";

const RESERVED_PLATFORM_SUBDOMAINS = new Set(PLATFORM_REGION_SLUGS);

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

/** Merge DB row with static theme/flag when present. */
function getTenantRowMerged(slug, db) {
  const s = String(slug || "").toLowerCase().trim();
  const row = db.prepare("SELECT id, slug, name FROM tenants WHERE slug = ?").get(s);
  if (!row) return getTenantBySlug(s);
  const meta = TENANTS[row.slug];
  return {
    id: row.id,
    slug: row.slug,
    name: row.name || meta?.name || row.slug,
    defaultLocale: meta?.defaultLocale || "en",
    themeClass: meta?.themeClass || `tenant-${row.slug}`,
    flagEmoji: meta?.flagEmoji || "🌐",
  };
}

function buildRegionChoicesFromDb(db, base, scheme) {
  if (!base) return [];
  const rows = db
    .prepare("SELECT slug, name FROM tenants WHERE stage = ? ORDER BY id ASC")
    .all(STAGES.ENABLED);
  return rows.map((row) => {
    const meta = TENANTS[row.slug];
    return {
      slug: row.slug,
      name: row.name || meta?.name || row.slug,
      flag: meta?.flagEmoji || "🌐",
      href: `${scheme}://${row.slug}.${base}`,
    };
  });
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

function isValidZambiaPhoneLocal(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length !== 9) return false;
  return /^[79]/.test(d);
}

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

function createAttachTenantByHost(db) {
  return function attachTenantByHost(req, res, next) {
    const scheme = process.env.PUBLIC_SCHEME || "https";
    const base = (process.env.BASE_DOMAIN || "").toLowerCase().trim();
    const host = resolveHostname(req);

    const sub = req.subdomain;
    if (sub && !req.isPlatformTenant) {
      return next();
    }

    const isLocal =
      !host || host === "localhost" || host === "127.0.0.1" || host.startsWith("localhost:");

    function setApexTenant() {
      const zmRow = db.prepare("SELECT stage FROM tenants WHERE slug = ?").get("zm");
      let slug = DEFAULT_TENANT_SLUG;
      if (!zmRow || zmRow.stage !== STAGES.ENABLED) {
        const first = db
          .prepare("SELECT slug FROM tenants WHERE stage = ? ORDER BY id ASC LIMIT 1")
          .get(STAGES.ENABLED);
        if (first && first.slug) slug = first.slug;
      }
      const t = getTenantRowMerged(slug, db);
      req.tenant = t;
      req.tenantSlug = t.slug;
      req.tenantUrlPrefix = "";
      req.isApexHost = true;
      res.locals.tenant = t;
      res.locals.tenantUrlPrefix = "";
      res.locals.isApexHost = true;
    }

    if (!base || isLocal) {
      setApexTenant();
      return next();
    }

    const isApex = host === base || host === `www.${base}`;
    if (isApex) {
      setApexTenant();
      return next();
    }

    const rows = db.prepare("SELECT slug FROM tenants ORDER BY id").all();
    for (const { slug } of rows) {
      if (sub === slug || host === `${slug}.${base}`) {
        const t = getTenantRowMerged(slug, db);
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
  };
}

module.exports = {
  TENANTS,
  PLATFORM_REGION_SLUGS,
  DEFAULT_TENANT_SLUG,
  RESERVED_PLATFORM_SUBDOMAINS,
  getTenantBySlug,
  getTenantById,
  getTenantRowMerged,
  buildRegionChoicesFromDb,
  attachTenant,
  createAttachTenantByHost,
  isValidZambiaPhoneLocal,
  isValidIsraelPhoneLocal,
  isValidPhoneForTenant,
};
