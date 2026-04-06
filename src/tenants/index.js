const { resolveHostname, getClientCountryCode } = require("../platform/host");
const { STAGES } = require("./tenantStages");
const { getOrSet, metaTtlMs, stageTtlMs } = require("./tenantMetadataCache");

/**
 * Static display metadata (theme + flag). DB `tenants` row supplies id, name, stage.
 */
const TID = require("./tenantIds");

const TENANTS = {
  /** Apex marketing home (not shown in region picker). */
  global: {
    id: TID.TENANT_GLOBAL,
    slug: "global",
    name: "Global",
    defaultLocale: "en",
    themeClass: "tenant-global",
    flagEmoji: "🌐",
  },
  /** Staging / internal demo tenant (`demo.*`); enabled by default but omitted from the region picker. */
  demo: {
    id: TID.TENANT_DEMO,
    slug: "demo",
    name: "Demo",
    defaultLocale: "en",
    themeClass: "tenant-demo",
    flagEmoji: "🧪",
  },
  il: {
    id: TID.TENANT_IL,
    slug: "il",
    name: "Israel",
    defaultLocale: "he-IL",
    themeClass: "tenant-il",
    flagEmoji: "🇮🇱",
  },
  zm: {
    id: TID.TENANT_ZM,
    slug: "zm",
    name: "Zambia",
    defaultLocale: "en-ZM",
    themeClass: "tenant-zm",
    flagEmoji: "🇿🇲",
  },
  zw: {
    id: TID.TENANT_ZW,
    slug: "zw",
    name: "Zimbabwe",
    defaultLocale: "en-ZW",
    themeClass: "tenant-zw",
    flagEmoji: "🇿🇼",
  },
  bw: {
    id: TID.TENANT_BW,
    slug: "bw",
    name: "Botswana",
    defaultLocale: "en-BW",
    themeClass: "tenant-bw",
    flagEmoji: "🇧🇼",
  },
  za: {
    id: TID.TENANT_ZA,
    slug: "za",
    name: "South Africa",
    defaultLocale: "en-ZA",
    themeClass: "tenant-za",
    flagEmoji: "🇿🇦",
  },
  na: {
    id: TID.TENANT_NA,
    slug: "na",
    name: "Namibia",
    defaultLocale: "en-NA",
    themeClass: "tenant-na",
    flagEmoji: "🇳🇦",
  },
};

const PLATFORM_REGION_SLUGS = ["global", "demo", "zm", "il", "bw", "zw", "za", "na"];

const DEFAULT_TENANT_SLUG = "zm";

const RESERVED_PLATFORM_SUBDOMAINS = new Set(PLATFORM_REGION_SLUGS);

function getTenantBySlug(slug) {
  if (!slug) return null;
  const s = String(slug).toLowerCase().trim();
  return TENANTS[s] || null;
}

function getTenantById(id, db) {
  const n = Number(id);
  if (!n) return null;
  const fromStatic = Object.values(TENANTS).find((t) => t.id === n);
  if (fromStatic) return fromStatic;
  if (db) {
    const row = getOrSet(`tenant:slug-by-id:${n}`, metaTtlMs(), () =>
      db.prepare("SELECT slug FROM tenants WHERE id = ?").get(n)
    );
    if (row && row.slug) return getTenantRowMerged(row.slug, db);
  }
  return null;
}

/** Merge DB row with static theme/flag when present. */
function getTenantRowMerged(slug, db) {
  const s = String(slug || "").toLowerCase().trim();
  return getOrSet(`tenant:merged:${s}`, metaTtlMs(), () => {
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
  });
}

function buildRegionChoicesFromDb(db, base, scheme) {
  if (!base) return [];
  const b = String(base).trim().toLowerCase();
  const sch = String(scheme || "https");
  return getOrSet(`tenant:region-choices:${b}:${sch}`, metaTtlMs(), () => {
    const rows = db
      .prepare(
        `
        SELECT slug, name FROM tenants
        WHERE stage = ? AND slug != 'global' AND slug != 'demo'
        ORDER BY id ASC
        `
      )
      .all(STAGES.ENABLED);
    return rows.map((row) => {
      const meta = TENANTS[row.slug];
      return {
        slug: row.slug,
        name: row.name || meta?.name || row.slug,
        flag: meta?.flagEmoji || "🌐",
        href: `${sch}://${row.slug}.${b}`,
      };
    });
  });
}

/** Cached SELECT stage BY id — short TTL; used for enabled-gate only. */
function getCachedTenantStageById(db, tenantId) {
  const n = Number(tenantId);
  if (!n) return null;
  return getOrSet(`tenant:stage:id:${n}`, stageTtlMs(), () =>
    db.prepare("SELECT stage FROM tenants WHERE id = ?").get(n)
  );
}

/** Cached slug existence for platform vs company subdomain routing. */
function getCachedTenantSlugExists(db, slug) {
  const s = String(slug || "").toLowerCase().trim();
  if (!s) return false;
  return getOrSet(`tenant:exists:${s}`, metaTtlMs(), () => {
    const row = db.prepare("SELECT 1 FROM tenants WHERE slug = ?").get(s);
    return !!row;
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

/** Zambian national format: leading 0 plus nine digits (10 digits total). */
function isValidZambiaPhoneLocal(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  return d.length === 10 && /^0\d{9}$/.test(d);
}

/** Only Zambia (`zm`) enforces a phone pattern; all other tenants accept any non-empty string the UI sends. */
function isValidPhoneForTenant(tenantSlug, raw) {
  if (tenantSlug === "zm") return isValidZambiaPhoneLocal(raw);
  return true;
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
      const globalRow = getOrSet("tenant:stage:slug:global", stageTtlMs(), () =>
        db.prepare("SELECT stage FROM tenants WHERE slug = ?").get("global")
      );
      const zmRow = getOrSet("tenant:stage:slug:zm", stageTtlMs(), () =>
        db.prepare("SELECT stage FROM tenants WHERE slug = ?").get("zm")
      );
      const country = getClientCountryCode(req);

      let slug = DEFAULT_TENANT_SLUG;
      let zambiaGeoHome = false;

      if (country === "ZM" && zmRow && zmRow.stage === STAGES.ENABLED) {
        slug = "zm";
        zambiaGeoHome = true;
      } else if (globalRow && globalRow.stage === STAGES.ENABLED) {
        slug = "global";
      } else if (!zmRow || zmRow.stage !== STAGES.ENABLED) {
        const first = getOrSet("tenant:first-enabled-non-demo", metaTtlMs(), () =>
          db
            .prepare(
              `
            SELECT slug FROM tenants
            WHERE stage = ? AND slug != 'global' AND slug != 'demo'
            ORDER BY id ASC LIMIT 1
            `
            )
            .get(STAGES.ENABLED)
        );
        if (first && first.slug) slug = first.slug;
      } else {
        slug = "zm";
      }

      const t = getTenantRowMerged(slug, db);
      req.tenant = t;
      req.tenantSlug = t.slug;

      if (zambiaGeoHome) {
        req.tenantUrlPrefix = base ? `${scheme}://zm.${base}` : "";
        req.isApexHost = false;
      } else {
        req.tenantUrlPrefix = "";
        req.isApexHost = true;
      }

      res.locals.tenant = t;
      res.locals.tenantUrlPrefix = req.tenantUrlPrefix;
      res.locals.isApexHost = req.isApexHost;
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

    const rows = getOrSet("tenant:slugs:ordered", metaTtlMs(), () =>
      db.prepare("SELECT slug FROM tenants ORDER BY id").all()
    );
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
  getCachedTenantStageById,
  getCachedTenantSlugExists,
  attachTenant,
  createAttachTenantByHost,
  isValidZambiaPhoneLocal,
  isValidPhoneForTenant,
};
