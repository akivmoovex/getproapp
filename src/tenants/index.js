const { resolveHostname, getClientCountryCode } = require("../platform/host");
const { STAGES } = require("./tenantStages");
const { getOrSet, getOrSetAsync, metaTtlMs, stageTtlMs } = require("./tenantMetadataCache");
const { getPgPool } = require("../db/pg");
const tenantsRepo = require("../db/pg/tenantsRepo");

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

/** Static platform tenants only; use {@link getTenantByIdAsync} for DB-backed ids. */
function getTenantById(id) {
  const n = Number(id);
  if (!n) return null;
  return Object.values(TENANTS).find((t) => t.id === n) || null;
}

/**
 * PostgreSQL-backed tenant resolution by id (Wave 2 public reads). Same merged shape as `getTenantById`.
 * @param {import("pg").Pool} pool
 */
async function getTenantByIdAsync(pool, id) {
  const n = Number(id);
  if (!n) return null;
  const fromStatic = Object.values(TENANTS).find((t) => t.id === n);
  if (fromStatic) return fromStatic;
  if (!pool) return null;
  const slugRow = await getOrSetAsync(`tenant:slug-by-id:${n}`, metaTtlMs(), async () =>
    tenantsRepo.getIdSlugById(pool, n)
  );
  if (!slugRow || !slugRow.slug) return null;
  return getTenantRowMergedAsync(pool, slugRow.slug);
}

/**
 * PostgreSQL-backed merge (Wave 1 cutover). Same shape as `getTenantRowMerged`.
 * @param {import("pg").Pool} pool
 * @param {string} slug
 * @returns {Promise<object>}
 */
async function getTenantRowMergedAsync(pool, slug) {
  const s = String(slug || "").toLowerCase().trim();
  return getOrSetAsync(`tenant:merged:${s}`, metaTtlMs(), async () => {
    const row = await tenantsRepo.getBySlug(pool, s);
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

/**
 * Region picker rows from PostgreSQL (Wave 1).
 * @param {import("pg").Pool} pool
 */
async function buildRegionChoicesFromDbAsync(pool, base, scheme) {
  if (!base) return [];
  const b = String(base).trim().toLowerCase();
  const sch = String(scheme || "https");
  return getOrSetAsync(`tenant:region-choices:${b}:${sch}`, metaTtlMs(), async () => {
    const rows = await tenantsRepo.listEnabledRegionRows(pool, STAGES.ENABLED);
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

/**
 * @param {import("pg").Pool} pool
 */
async function getCachedTenantStageByIdAsync(pool, tenantId) {
  const n = Number(tenantId);
  if (!n) return null;
  return getOrSetAsync(`tenant:stage:id:${n}`, stageTtlMs(), async () => {
    const r = await pool.query(`SELECT stage FROM public.tenants WHERE id = $1`, [n]);
    return r.rows[0] ?? null;
  });
}

/**
 * @param {import("pg").Pool} pool
 */
async function getCachedTenantSlugExistsAsync(pool, slug) {
  const s = String(slug || "").toLowerCase().trim();
  if (!s) return false;
  return getOrSetAsync(`tenant:exists:${s}`, metaTtlMs(), async () => tenantsRepo.slugExists(pool, s));
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

/**
 * Apex home tenant selection when PostgreSQL is the source of truth (Wave 1).
 * @param {import("pg").Pool} pool
 */
async function setApexTenantPg(pool, req, res) {
  const scheme = process.env.PUBLIC_SCHEME || "https";
  const base = (process.env.BASE_DOMAIN || "").toLowerCase().trim();
  const globalRow = await getOrSetAsync("tenant:stage:slug:global", stageTtlMs(), async () => {
    const r = await pool.query(`SELECT stage FROM public.tenants WHERE slug = $1`, ["global"]);
    return r.rows[0] ?? null;
  });
  const zmRow = await getOrSetAsync("tenant:stage:slug:zm", stageTtlMs(), async () => {
    const r = await pool.query(`SELECT stage FROM public.tenants WHERE slug = $1`, ["zm"]);
    return r.rows[0] ?? null;
  });
  const country = getClientCountryCode(req);

  let slug = DEFAULT_TENANT_SLUG;
  let zambiaGeoHome = false;

  if (country === "ZM" && zmRow && zmRow.stage === STAGES.ENABLED) {
    slug = "zm";
    zambiaGeoHome = true;
  } else if (globalRow && globalRow.stage === STAGES.ENABLED) {
    slug = "global";
  } else if (!zmRow || zmRow.stage !== STAGES.ENABLED) {
    const first = await getOrSetAsync("tenant:first-enabled-non-demo", metaTtlMs(), async () =>
      tenantsRepo.firstEnabledNonDemoSlug(pool, STAGES.ENABLED)
    );
    if (first && first.slug) slug = first.slug;
  } else {
    slug = "zm";
  }

  const t = await getTenantRowMergedAsync(pool, slug);
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

function createAttachTenantByHost() {
  return async function attachTenantByHost(req, res, next) {
    try {
      const scheme = process.env.PUBLIC_SCHEME || "https";
      const base = (process.env.BASE_DOMAIN || "").toLowerCase().trim();
      const host = resolveHostname(req);

      const sub = req.subdomain;
      if (sub && !req.isPlatformTenant) {
        return next();
      }

      const isLocal =
        !host || host === "localhost" || host === "127.0.0.1" || host.startsWith("localhost:");

      const pool = getPgPool();
      if (!base || isLocal) {
        await setApexTenantPg(pool, req, res);
        return next();
      }
      const isApex = host === base || host === `www.${base}`;
      if (isApex) {
        await setApexTenantPg(pool, req, res);
        return next();
      }
      const rows = await getOrSetAsync("tenant:slugs:ordered", metaTtlMs(), async () =>
        tenantsRepo.listSlugsOrdered(pool)
      );
      for (const { slug } of rows) {
        if (sub === slug || host === `${slug}.${base}`) {
          const t = await getTenantRowMergedAsync(pool, slug);
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
    } catch (e) {
      return next(e);
    }
  };
}

module.exports = {
  TENANTS,
  PLATFORM_REGION_SLUGS,
  DEFAULT_TENANT_SLUG,
  RESERVED_PLATFORM_SUBDOMAINS,
  getTenantBySlug,
  getTenantById,
  getTenantByIdAsync,
  buildRegionChoicesFromDbAsync,
  getCachedTenantStageByIdAsync,
  getCachedTenantSlugExistsAsync,
  attachTenant,
  createAttachTenantByHost,
  isValidZambiaPhoneLocal,
  isValidPhoneForTenant,
};
