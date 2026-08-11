"use strict";

/**
 * V7 canonical + legacy deployment profile catalogue.
 * Merged into DEPLOYMENT_PROFILES by deploymentProfiles.js (single runtime registry).
 */

const RUNTIME_V5_FOUNDATION = "v5-foundation";
const RUNTIME_LEGACY_REDIRECT = "legacy-redirect";

const CODE_COM_PRODUCTION = "blessboard-com-production";
const CODE_ORG_STAGING = "blessboard-org-staging";
const CODE_BLESSBOARD_PRONLINE_TESTING = "blessboard-pronline-testing";
const CODE_BLESSBOARD_ORG_LEGACY_REDIRECT = "blessboard-org-legacy-redirect";
const CODE_ACTIVECLINIC_ORG_V6 = "activeclinic-org-v6";
const CODE_ACTIVECLINIC_ORG_PRODUCTION = "activeclinic-org-production";
const CODE_ACTIVECLINIC_PRONLINE_TESTING = "activeclinic-pronline-testing";
const CODE_GETPROAPP_ORG_PRODUCTION = "getproapp-org-production";
const CODE_GETPRO_PRONLINE_TESTING = "getpro-pronline-testing";
const CODE_NETRAZ_ORG_PRODUCTION = "netraz-org-production";
const CODE_NETRAZ_PRONLINE_TESTING = "netraz-pronline-testing";
const CODE_MOOVEX_ORG_PRODUCTION = "moovex-org-production";
const CODE_MOOVEX_PLATFORM_TESTING = "moovex-platform-testing";
const CODE_MOOVEX_PLATFORM_PRODUCTION = "moovex-platform-production";

/** Canonical identity key shared by testing + production platform DBs (env code differs). */
const MOOVEX_PLATFORM_IDENTITY_KEY = "moovex-platform-v7";

/** @deprecated Prefer CODE_ORG_STAGING */
const CODE_ORG_V5 = "blessboard-org-v5";
/** @deprecated Prefer CODE_COM_PRODUCTION */
const CODE_COM_V4 = "blessboard-com-v4";

const COOKIE_COM = "blessboard_com_sid";
const COOKIE_ORG = "blessboard_org_sid";
const COOKIE_BLESSBOARD_PRONLINE = "blessboard_pronline_sid";
const COOKIE_ACTIVECLINIC_ORG = "activeclinic_org_sid";
const COOKIE_ACTIVECLINIC_PRONLINE = "activeclinic_pronline_sid";
const COOKIE_GETPROAPP_ORG = "getproapp_org_sid";
const COOKIE_GETPRO_PRONLINE = "getpro_pronline_sid";
const COOKIE_NETRAZ_ORG = "netraz_org_sid";
const COOKIE_NETRAZ_PRONLINE = "netraz_pronline_sid";
const COOKIE_MOOVEX_ORG = "moovex_org_sid";

const CSRF_COOKIE_COM = "blessboard_org_csrf";
const CSRF_COOKIE_ORG = "blessboard_org_csrf";
const CSRF_COOKIE_BLESSBOARD_PRONLINE = "blessboard_pronline_csrf";
const CSRF_COOKIE_ACTIVECLINIC_ORG = "activeclinic_org_csrf";
const CSRF_COOKIE_ACTIVECLINIC_PRONLINE = "activeclinic_pronline_csrf";
const CSRF_COOKIE_GETPROAPP_ORG = "getproapp_org_csrf";
const CSRF_COOKIE_GETPRO_PRONLINE = "getpro_pronline_csrf";
const CSRF_COOKIE_NETRAZ_ORG = "netraz_org_csrf";
const CSRF_COOKIE_NETRAZ_PRONLINE = "netraz_pronline_csrf";
const CSRF_COOKIE_MOOVEX_ORG = "moovex_org_csrf";

const ALL_PRODUCT_FOREIGN_TLDS = Object.freeze([
  "blessboard.com",
  "www.blessboard.com",
  "blessboard.org",
  "www.blessboard.org",
  "blessboard.pronline.org",
  "activeclinic.org",
  "www.activeclinic.org",
  "activeclinic.pronline.org",
  "getproapp.org",
  "www.getproapp.org",
  "getproapp.pronline.org",
  "getpro.pronline.org",
  "netraz.org",
  "www.netraz.org",
  "netraz.pronline.org",
  "moovex.org",
  "www.moovex.org",
  "funsong.org",
  "www.funsong.org",
]);

function foreignExcept(keepHosts) {
  const keep = new Set(keepHosts.map((h) => String(h).toLowerCase()));
  return Object.freeze(ALL_PRODUCT_FOREIGN_TLDS.filter((h) => !keep.has(h)));
}

/**
 * @param {object} input
 */
function defineProfile(input) {
  const apex = Object.freeze([...(input.apexDomains || [])]);
  const foreign = Object.freeze([...(input.foreignTlds || [])]);
  return Object.freeze({
    deploymentCode: input.deploymentCode,
    productCode: input.productCode,
    brand: input.brand || null,
    siteType: input.siteType || "product",
    profileStatus: input.profileStatus || "canonical",
    replacementCode: input.replacementCode || null,
    /** "profile" = product from deployment; "hostname" = product from canonical host allowlist */
    productSelection: input.productSelection || "profile",
    expectedIdentityKey: input.expectedIdentityKey || null,
    deploymentEnvironment: input.deploymentEnvironment,
    runtimeMode: input.runtimeMode,
    authoritative: input.authoritative !== false,
    canonicalDomain: input.canonicalDomain,
    publicOrigin: input.publicOrigin,
    adminOrigin: input.adminOrigin || input.publicOrigin,
    apexDomains: apex,
    churchHostDomain: input.churchHostDomain || input.canonicalDomain,
    sessionCookieName: input.sessionCookieName,
    csrfCookieName: input.csrfCookieName,
    expectedDatabaseEnvironment: input.expectedDatabaseEnvironment,
    jobsEnabled: Boolean(input.jobsEnabled),
    trustProxy: input.trustProxy == null ? 1 : input.trustProxy,
    listenHost: input.listenHost || "0.0.0.0",
    hostContextMode: input.hostContextMode || "off",
    allowTestUsersByDefault: Boolean(input.allowTestUsersByDefault),
    foreignTlds: foreign,
    brandSubtitle: input.brandSubtitle || null,
    brandSubtitleVariant: input.brandSubtitleVariant || null,
    defaultCountry: input.defaultCountry || "ZM",
    redirectTargetOrigin: input.redirectTargetOrigin || null,
    redirectEnabledByDefault: Boolean(input.redirectEnabledByDefault),
  });
}

const PROFILE_COM_PRODUCTION = defineProfile({
  deploymentCode: CODE_COM_PRODUCTION,
  productCode: "blessboard",
  brand: "BlessBoard",
  profileStatus: "transitional",
  replacementCode: CODE_MOOVEX_PLATFORM_PRODUCTION,
  productSelection: "profile",
  deploymentEnvironment: "production",
  runtimeMode: RUNTIME_V5_FOUNDATION,
  canonicalDomain: "blessboard.com",
  publicOrigin: "https://blessboard.com",
  apexDomains: ["blessboard.com", "www.blessboard.com"],
  sessionCookieName: COOKIE_COM,
  csrfCookieName: CSRF_COOKIE_COM,
  expectedDatabaseEnvironment: "production",
  jobsEnabled: true,
  hostContextMode: "off",
  foreignTlds: foreignExcept(["blessboard.com", "www.blessboard.com"]),
  brandSubtitle: "Powered by GetPro",
  brandSubtitleVariant: "production-partner",
  defaultCountry: "ZM",
});

const PROFILE_ORG_STAGING = defineProfile({
  deploymentCode: CODE_ORG_STAGING,
  productCode: "blessboard",
  brand: "BlessBoard",
  profileStatus: "legacy",
  replacementCode: CODE_BLESSBOARD_PRONLINE_TESTING,
  deploymentEnvironment: "testing",
  runtimeMode: RUNTIME_V5_FOUNDATION,
  canonicalDomain: "blessboard.org",
  publicOrigin: "https://blessboard.org",
  apexDomains: ["blessboard.org", "www.blessboard.org"],
  sessionCookieName: COOKIE_ORG,
  csrfCookieName: CSRF_COOKIE_ORG,
  expectedDatabaseEnvironment: "testing",
  jobsEnabled: false,
  hostContextMode: "diagnostic",
  foreignTlds: foreignExcept(["blessboard.org", "www.blessboard.org"]),
  brandSubtitle: "Demo Only",
  brandSubtitleVariant: "demo",
  defaultCountry: "ZM",
});

const PROFILE_BLESSBOARD_PRONLINE_TESTING = defineProfile({
  deploymentCode: CODE_BLESSBOARD_PRONLINE_TESTING,
  productCode: "blessboard",
  brand: "BlessBoard",
  profileStatus: "transitional",
  replacementCode: CODE_MOOVEX_PLATFORM_TESTING,
  productSelection: "profile",
  deploymentEnvironment: "testing",
  runtimeMode: RUNTIME_V5_FOUNDATION,
  canonicalDomain: "blessboard.pronline.org",
  publicOrigin: "https://blessboard.pronline.org",
  apexDomains: ["blessboard.pronline.org"],
  sessionCookieName: COOKIE_BLESSBOARD_PRONLINE,
  csrfCookieName: CSRF_COOKIE_BLESSBOARD_PRONLINE,
  expectedDatabaseEnvironment: "testing",
  jobsEnabled: false,
  hostContextMode: "diagnostic",
  foreignTlds: foreignExcept(["blessboard.pronline.org"]),
  brandSubtitle: "Testing",
  brandSubtitleVariant: "demo",
  defaultCountry: "ZM",
});

/** Prepared redirect-only profile — do not configure on Hostinger until cutover. */
const PROFILE_BLESSBOARD_ORG_LEGACY_REDIRECT = defineProfile({
  deploymentCode: CODE_BLESSBOARD_ORG_LEGACY_REDIRECT,
  productCode: "blessboard",
  brand: "BlessBoard",
  profileStatus: "prepared",
  deploymentEnvironment: "production",
  runtimeMode: RUNTIME_LEGACY_REDIRECT,
  canonicalDomain: "blessboard.org",
  publicOrigin: "https://blessboard.org",
  apexDomains: ["blessboard.org", "www.blessboard.org"],
  sessionCookieName: "blessboard_org_redirect_sid",
  csrfCookieName: "blessboard_org_redirect_csrf",
  expectedDatabaseEnvironment: "production",
  jobsEnabled: false,
  hostContextMode: "off",
  foreignTlds: foreignExcept(["blessboard.org", "www.blessboard.org"]),
  brandSubtitle: null,
  brandSubtitleVariant: null,
  defaultCountry: "ZM",
  redirectTargetOrigin: "https://blessboard.com",
  redirectEnabledByDefault: true,
});

const PROFILE_ACTIVECLINIC_ORG_V6 = defineProfile({
  deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  productCode: "activeclinic",
  brand: "ActiveClinic",
  profileStatus: "legacy",
  replacementCode: CODE_ACTIVECLINIC_PRONLINE_TESTING,
  deploymentEnvironment: "testing",
  runtimeMode: RUNTIME_V5_FOUNDATION,
  canonicalDomain: "activeclinic.org",
  publicOrigin: "https://activeclinic.org",
  apexDomains: ["activeclinic.org", "www.activeclinic.org"],
  sessionCookieName: COOKIE_ACTIVECLINIC_ORG,
  csrfCookieName: CSRF_COOKIE_ACTIVECLINIC_ORG,
  expectedDatabaseEnvironment: "testing",
  jobsEnabled: false,
  hostContextMode: "diagnostic",
  foreignTlds: foreignExcept(["activeclinic.org", "www.activeclinic.org"]),
  brandSubtitle: "Juflona Pilot",
  brandSubtitleVariant: "demo",
  defaultCountry: "ZM",
});

const PROFILE_ACTIVECLINIC_ORG_PRODUCTION = defineProfile({
  deploymentCode: CODE_ACTIVECLINIC_ORG_PRODUCTION,
  productCode: "activeclinic",
  brand: "ActiveClinic",
  profileStatus: "transitional",
  replacementCode: CODE_MOOVEX_PLATFORM_PRODUCTION,
  productSelection: "profile",
  deploymentEnvironment: "production",
  runtimeMode: RUNTIME_V5_FOUNDATION,
  canonicalDomain: "activeclinic.org",
  publicOrigin: "https://activeclinic.org",
  apexDomains: ["activeclinic.org", "www.activeclinic.org"],
  sessionCookieName: "activeclinic_org_prod_sid",
  csrfCookieName: "activeclinic_org_prod_csrf",
  expectedDatabaseEnvironment: "production",
  jobsEnabled: true,
  hostContextMode: "off",
  foreignTlds: foreignExcept(["activeclinic.org", "www.activeclinic.org"]),
  brandSubtitle: "Powered by GetPro",
  brandSubtitleVariant: "production-partner",
  defaultCountry: "ZM",
});

const PROFILE_ACTIVECLINIC_PRONLINE_TESTING = defineProfile({
  deploymentCode: CODE_ACTIVECLINIC_PRONLINE_TESTING,
  productCode: "activeclinic",
  brand: "ActiveClinic",
  profileStatus: "transitional",
  replacementCode: CODE_MOOVEX_PLATFORM_TESTING,
  productSelection: "profile",
  deploymentEnvironment: "testing",
  runtimeMode: RUNTIME_V5_FOUNDATION,
  canonicalDomain: "activeclinic.pronline.org",
  publicOrigin: "https://activeclinic.pronline.org",
  apexDomains: ["activeclinic.pronline.org"],
  sessionCookieName: COOKIE_ACTIVECLINIC_PRONLINE,
  csrfCookieName: CSRF_COOKIE_ACTIVECLINIC_PRONLINE,
  expectedDatabaseEnvironment: "testing",
  jobsEnabled: false,
  hostContextMode: "diagnostic",
  foreignTlds: foreignExcept(["activeclinic.pronline.org"]),
  brandSubtitle: "Testing",
  brandSubtitleVariant: "demo",
  defaultCountry: "ZM",
});

const PROFILE_GETPROAPP_ORG_PRODUCTION = defineProfile({
  deploymentCode: CODE_GETPROAPP_ORG_PRODUCTION,
  productCode: "getpro",
  brand: "GetPro",
  profileStatus: "transitional",
  replacementCode: CODE_MOOVEX_PLATFORM_PRODUCTION,
  productSelection: "profile",
  deploymentEnvironment: "production",
  runtimeMode: RUNTIME_V5_FOUNDATION,
  canonicalDomain: "getproapp.org",
  publicOrigin: "https://getproapp.org",
  apexDomains: ["getproapp.org", "www.getproapp.org"],
  sessionCookieName: COOKIE_GETPROAPP_ORG,
  csrfCookieName: CSRF_COOKIE_GETPROAPP_ORG,
  expectedDatabaseEnvironment: "production",
  jobsEnabled: true,
  hostContextMode: "off",
  foreignTlds: foreignExcept(["getproapp.org", "www.getproapp.org"]),
  brandSubtitle: null,
  brandSubtitleVariant: null,
  defaultCountry: "ZM",
});

const PROFILE_GETPRO_PRONLINE_TESTING = defineProfile({
  deploymentCode: CODE_GETPRO_PRONLINE_TESTING,
  productCode: "getpro",
  brand: "GetPro",
  profileStatus: "transitional",
  replacementCode: CODE_MOOVEX_PLATFORM_TESTING,
  productSelection: "profile",
  deploymentEnvironment: "testing",
  runtimeMode: RUNTIME_V5_FOUNDATION,
  canonicalDomain: "getproapp.pronline.org",
  publicOrigin: "https://getproapp.pronline.org",
  apexDomains: ["getproapp.pronline.org", "getpro.pronline.org"],
  sessionCookieName: COOKIE_GETPRO_PRONLINE,
  csrfCookieName: CSRF_COOKIE_GETPRO_PRONLINE,
  expectedDatabaseEnvironment: "testing",
  jobsEnabled: false,
  hostContextMode: "diagnostic",
  foreignTlds: foreignExcept(["getproapp.pronline.org", "getpro.pronline.org"]),
  brandSubtitle: "Testing",
  brandSubtitleVariant: "demo",
  defaultCountry: "ZM",
});

const PROFILE_NETRAZ_ORG_PRODUCTION = defineProfile({
  deploymentCode: CODE_NETRAZ_ORG_PRODUCTION,
  productCode: "ngo",
  brand: "Netraz",
  profileStatus: "transitional",
  replacementCode: CODE_MOOVEX_PLATFORM_PRODUCTION,
  productSelection: "profile",
  deploymentEnvironment: "production",
  runtimeMode: RUNTIME_V5_FOUNDATION,
  canonicalDomain: "netraz.org",
  publicOrigin: "https://netraz.org",
  apexDomains: ["netraz.org", "www.netraz.org"],
  sessionCookieName: COOKIE_NETRAZ_ORG,
  csrfCookieName: CSRF_COOKIE_NETRAZ_ORG,
  expectedDatabaseEnvironment: "production",
  jobsEnabled: true,
  hostContextMode: "off",
  foreignTlds: foreignExcept(["netraz.org", "www.netraz.org"]),
  brandSubtitle: "Powered by GetPro",
  brandSubtitleVariant: "production-partner",
  defaultCountry: "ZM",
});

const PROFILE_NETRAZ_PRONLINE_TESTING = defineProfile({
  deploymentCode: CODE_NETRAZ_PRONLINE_TESTING,
  productCode: "ngo",
  brand: "Netraz",
  profileStatus: "transitional",
  replacementCode: CODE_MOOVEX_PLATFORM_TESTING,
  productSelection: "profile",
  deploymentEnvironment: "testing",
  runtimeMode: RUNTIME_V5_FOUNDATION,
  canonicalDomain: "netraz.pronline.org",
  publicOrigin: "https://netraz.pronline.org",
  apexDomains: ["netraz.pronline.org"],
  sessionCookieName: COOKIE_NETRAZ_PRONLINE,
  csrfCookieName: CSRF_COOKIE_NETRAZ_PRONLINE,
  expectedDatabaseEnvironment: "testing",
  jobsEnabled: false,
  hostContextMode: "diagnostic",
  foreignTlds: foreignExcept(["netraz.pronline.org"]),
  brandSubtitle: "Testing",
  brandSubtitleVariant: "demo",
  defaultCountry: "ZM",
});

/** Corporate parent site — not a tenant product. */
const PROFILE_MOOVEX_ORG_PRODUCTION = defineProfile({
  deploymentCode: CODE_MOOVEX_ORG_PRODUCTION,
  productCode: "platform",
  brand: "Moovex",
  siteType: "corporate",
  profileStatus: "transitional",
  replacementCode: CODE_MOOVEX_PLATFORM_PRODUCTION,
  productSelection: "profile",
  deploymentEnvironment: "production",
  runtimeMode: RUNTIME_V5_FOUNDATION,
  canonicalDomain: "moovex.org",
  publicOrigin: "https://moovex.org",
  apexDomains: ["moovex.org", "www.moovex.org"],
  sessionCookieName: COOKIE_MOOVEX_ORG,
  csrfCookieName: CSRF_COOKIE_MOOVEX_ORG,
  expectedDatabaseEnvironment: "production",
  jobsEnabled: false,
  hostContextMode: "off",
  foreignTlds: foreignExcept(["moovex.org", "www.moovex.org"]),
  brandSubtitle: null,
  brandSubtitleVariant: null,
  defaultCountry: "ZM",
});

/**
 * Unified Moovex platform runtimes — environment only; product from hostname allowlist.
 * Shared identity_key moovex-platform-v7; testing vs production are separate DBs.
 */
const PROFILE_MOOVEX_PLATFORM_TESTING = defineProfile({
  deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
  productCode: "platform",
  brand: "Moovex Platform",
  siteType: "platform",
  profileStatus: "canonical",
  productSelection: "hostname",
  expectedIdentityKey: MOOVEX_PLATFORM_IDENTITY_KEY,
  deploymentEnvironment: "testing",
  runtimeMode: RUNTIME_V5_FOUNDATION,
  canonicalDomain: "pronline.org",
  publicOrigin: "https://pronline.org",
  apexDomains: [
    "pronline.org",
    "www.pronline.org",
    "blessboard.pronline.org",
    "activeclinic.pronline.org",
    "getproapp.pronline.org",
    "getpro.pronline.org",
    "netraz.pronline.org",
    "moovex.pronline.org",
  ],
  churchHostDomain: "blessboard.pronline.org",
  sessionCookieName: "moovex_platform_testing_sid",
  csrfCookieName: "moovex_platform_testing_csrf",
  expectedDatabaseEnvironment: "testing",
  jobsEnabled: false,
  hostContextMode: "diagnostic",
  foreignTlds: foreignExcept([
    "pronline.org",
    "www.pronline.org",
    "blessboard.pronline.org",
    "activeclinic.pronline.org",
    "getproapp.pronline.org",
    "getpro.pronline.org",
    "netraz.pronline.org",
    "moovex.pronline.org",
  ]),
  brandSubtitle: "Testing Platform",
  brandSubtitleVariant: "demo",
  defaultCountry: "ZM",
});

const PROFILE_MOOVEX_PLATFORM_PRODUCTION = defineProfile({
  deploymentCode: CODE_MOOVEX_PLATFORM_PRODUCTION,
  productCode: "platform",
  brand: "Moovex Platform",
  siteType: "platform",
  profileStatus: "canonical",
  productSelection: "hostname",
  expectedIdentityKey: MOOVEX_PLATFORM_IDENTITY_KEY,
  deploymentEnvironment: "production",
  runtimeMode: RUNTIME_V5_FOUNDATION,
  canonicalDomain: "moovex.org",
  publicOrigin: "https://moovex.org",
  apexDomains: [
    "blessboard.com",
    "www.blessboard.com",
    "activeclinic.org",
    "www.activeclinic.org",
    "getproapp.org",
    "www.getproapp.org",
    "netraz.org",
    "www.netraz.org",
    "moovex.org",
    "www.moovex.org",
  ],
  churchHostDomain: "blessboard.com",
  sessionCookieName: "moovex_platform_production_sid",
  csrfCookieName: "moovex_platform_production_csrf",
  expectedDatabaseEnvironment: "production",
  jobsEnabled: true,
  hostContextMode: "off",
  foreignTlds: foreignExcept([
    "blessboard.com",
    "www.blessboard.com",
    "activeclinic.org",
    "www.activeclinic.org",
    "getproapp.org",
    "www.getproapp.org",
    "netraz.org",
    "www.netraz.org",
    "moovex.org",
    "www.moovex.org",
  ]),
  brandSubtitle: null,
  brandSubtitleVariant: null,
  defaultCountry: "ZM",
});

/** @type {Readonly<Record<string, object>>} */
const CANONICAL_DEPLOYMENT_PROFILES = Object.freeze({
  [CODE_COM_PRODUCTION]: PROFILE_COM_PRODUCTION,
  [CODE_ORG_STAGING]: PROFILE_ORG_STAGING,
  [CODE_BLESSBOARD_PRONLINE_TESTING]: PROFILE_BLESSBOARD_PRONLINE_TESTING,
  [CODE_BLESSBOARD_ORG_LEGACY_REDIRECT]: PROFILE_BLESSBOARD_ORG_LEGACY_REDIRECT,
  [CODE_ACTIVECLINIC_ORG_V6]: PROFILE_ACTIVECLINIC_ORG_V6,
  [CODE_ACTIVECLINIC_ORG_PRODUCTION]: PROFILE_ACTIVECLINIC_ORG_PRODUCTION,
  [CODE_ACTIVECLINIC_PRONLINE_TESTING]: PROFILE_ACTIVECLINIC_PRONLINE_TESTING,
  [CODE_GETPROAPP_ORG_PRODUCTION]: PROFILE_GETPROAPP_ORG_PRODUCTION,
  [CODE_GETPRO_PRONLINE_TESTING]: PROFILE_GETPRO_PRONLINE_TESTING,
  [CODE_NETRAZ_ORG_PRODUCTION]: PROFILE_NETRAZ_ORG_PRODUCTION,
  [CODE_NETRAZ_PRONLINE_TESTING]: PROFILE_NETRAZ_PRONLINE_TESTING,
  [CODE_MOOVEX_ORG_PRODUCTION]: PROFILE_MOOVEX_ORG_PRODUCTION,
  [CODE_MOOVEX_PLATFORM_TESTING]: PROFILE_MOOVEX_PLATFORM_TESTING,
  [CODE_MOOVEX_PLATFORM_PRODUCTION]: PROFILE_MOOVEX_PLATFORM_PRODUCTION,
});

/**
 * Evidence-based legacy → canonical migration guidance.
 * Aliases still resolve via DEPLOYMENT_CODE_ALIASES where safe for live Hostinger.
 */
const LEGACY_DEPLOYMENT_MIGRATION = Object.freeze([
  Object.freeze({
    legacyProfile: "blessboard-org-v5",
    canonicalV7Profile: "moovex-platform-testing",
    currentAliasTarget: "blessboard-org-staging",
    action: "migrate",
    notes: "Long-term: moovex-platform-testing + hostname blessboard.pronline.org.",
  }),
  Object.freeze({
    legacyProfile: "blessboard-com-v4",
    canonicalV7Profile: "moovex-platform-production",
    currentAliasTarget: "blessboard-com-production",
    action: "migrate",
    notes: "Alias → blessboard-com-production; then moovex-platform-production + hostname.",
  }),
  Object.freeze({
    legacyProfile: "blessboard-org-staging",
    canonicalV7Profile: "moovex-platform-testing",
    currentAliasTarget: null,
    action: "migrate",
    notes: "Leave blessboard.org; use blessboard.pronline.org under moovex-platform-testing.",
  }),
  Object.freeze({
    legacyProfile: "blessboard-pronline-testing",
    canonicalV7Profile: "moovex-platform-testing",
    currentAliasTarget: null,
    action: "migrate",
    notes: "Transitional product profile → unified platform runtime + hostname.",
  }),
  Object.freeze({
    legacyProfile: "blessboard-com-production",
    canonicalV7Profile: "moovex-platform-production",
    currentAliasTarget: null,
    action: "migrate",
    notes: "Transitional product profile → unified platform runtime + hostname.",
  }),
  Object.freeze({
    legacyProfile: "activeclinic-org-v6",
    canonicalV7Profile: "moovex-platform-testing",
    currentAliasTarget: null,
    action: "migrate",
    notes: "Move testing off activeclinic.org domain to activeclinic.pronline.org.",
  }),
  Object.freeze({
    legacyProfile: "activeclinic-pronline-testing",
    canonicalV7Profile: "moovex-platform-testing",
    currentAliasTarget: null,
    action: "migrate",
    notes: "Transitional → hostname-selected ActiveClinic under platform testing.",
  }),
  Object.freeze({
    legacyProfile: "activeclinic-org-production",
    canonicalV7Profile: "moovex-platform-production",
    currentAliasTarget: null,
    action: "migrate",
    notes: "Transitional → hostname-selected ActiveClinic under platform production.",
  }),
  Object.freeze({
    legacyProfile: "getpro-pronline-testing / getproapp-org-production",
    canonicalV7Profile: "moovex-platform-testing / moovex-platform-production",
    currentAliasTarget: null,
    action: "migrate",
    notes: "Transitional GetPro profiles → hostname resolution.",
  }),
  Object.freeze({
    legacyProfile: "netraz-pronline-testing / netraz-org-production",
    canonicalV7Profile: "moovex-platform-testing / moovex-platform-production",
    currentAliasTarget: null,
    action: "migrate",
    notes: "Transitional Netraz profiles → hostname resolution.",
  }),
  Object.freeze({
    legacyProfile: "(unprofiled GetPro / server.legacy.js)",
    canonicalV7Profile: "moovex-platform-production or moovex-platform-testing",
    currentAliasTarget: null,
    action: "migrate",
    notes: "Prefer explicit moovex-platform-* with getpro hostname.",
  }),
]);

const ALL_SESSION_COOKIE_NAMES = Object.freeze([
  COOKIE_COM,
  COOKIE_ORG,
  COOKIE_BLESSBOARD_PRONLINE,
  COOKIE_ACTIVECLINIC_ORG,
  COOKIE_ACTIVECLINIC_PRONLINE,
  "activeclinic_org_prod_sid",
  COOKIE_GETPROAPP_ORG,
  COOKIE_GETPRO_PRONLINE,
  COOKIE_NETRAZ_ORG,
  COOKIE_NETRAZ_PRONLINE,
  COOKIE_MOOVEX_ORG,
  "moovex_pronline_sid",
  "moovex_pronline_hub_sid",
  "moovex_platform_testing_sid",
  "moovex_platform_production_sid",
  "blessboard_org_redirect_sid",
  "getpro_sid",
]);

const ALL_CSRF_COOKIE_NAMES = Object.freeze([
  CSRF_COOKIE_COM,
  CSRF_COOKIE_ORG,
  CSRF_COOKIE_BLESSBOARD_PRONLINE,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_PRONLINE,
  "activeclinic_org_prod_csrf",
  CSRF_COOKIE_GETPROAPP_ORG,
  CSRF_COOKIE_GETPRO_PRONLINE,
  CSRF_COOKIE_NETRAZ_ORG,
  CSRF_COOKIE_NETRAZ_PRONLINE,
  CSRF_COOKIE_MOOVEX_ORG,
  "moovex_pronline_csrf",
  "moovex_pronline_hub_csrf",
  "moovex_platform_testing_csrf",
  "moovex_platform_production_csrf",
  "blessboard_org_redirect_csrf",
]);

module.exports = {
  RUNTIME_V5_FOUNDATION,
  RUNTIME_LEGACY_REDIRECT,
  CODE_COM_PRODUCTION,
  CODE_ORG_STAGING,
  CODE_BLESSBOARD_PRONLINE_TESTING,
  CODE_BLESSBOARD_ORG_LEGACY_REDIRECT,
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_ACTIVECLINIC_ORG_PRODUCTION,
  CODE_ACTIVECLINIC_PRONLINE_TESTING,
  CODE_GETPROAPP_ORG_PRODUCTION,
  CODE_GETPRO_PRONLINE_TESTING,
  CODE_NETRAZ_ORG_PRODUCTION,
  CODE_NETRAZ_PRONLINE_TESTING,
  CODE_MOOVEX_ORG_PRODUCTION,
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_MOOVEX_PLATFORM_PRODUCTION,
  MOOVEX_PLATFORM_IDENTITY_KEY,
  CODE_ORG_V5,
  CODE_COM_V4,
  COOKIE_COM,
  COOKIE_ORG,
  COOKIE_BLESSBOARD_PRONLINE,
  COOKIE_ACTIVECLINIC_ORG,
  COOKIE_ACTIVECLINIC_PRONLINE,
  COOKIE_GETPROAPP_ORG,
  COOKIE_GETPRO_PRONLINE,
  COOKIE_NETRAZ_ORG,
  COOKIE_NETRAZ_PRONLINE,
  COOKIE_MOOVEX_ORG,
  CSRF_COOKIE_COM,
  CSRF_COOKIE_ORG,
  CSRF_COOKIE_BLESSBOARD_PRONLINE,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_PRONLINE,
  CSRF_COOKIE_GETPROAPP_ORG,
  CSRF_COOKIE_GETPRO_PRONLINE,
  CSRF_COOKIE_NETRAZ_ORG,
  CSRF_COOKIE_NETRAZ_PRONLINE,
  CSRF_COOKIE_MOOVEX_ORG,
  CANONICAL_DEPLOYMENT_PROFILES,
  LEGACY_DEPLOYMENT_MIGRATION,
  ALL_SESSION_COOKIE_NAMES,
  ALL_CSRF_COOKIE_NAMES,
  defineProfile,
};
