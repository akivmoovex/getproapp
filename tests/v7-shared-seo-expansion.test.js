"use strict";

/**
 * V1 SEO expansion — shared website-engine SEO layer.
 *
 * Covers the shared model and discovery builders, then asserts both products
 * (BlessBoard and ActiveClinic) resolve and emit the supported meta tags
 * through that shared layer rather than product-local logic.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const seoModel = require("../src/platform/website/seoModel");
const seoDiscovery = require("../src/platform/website/seoDiscovery");

const ROOT = path.join(__dirname, "..");
const readRepoFile = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ————————————————————————————————————————————————————————————————
// Shared SEO model
// ————————————————————————————————————————————————————————————————

test("shared SEO model declares every V1 field", () => {
  assert.deepEqual(
    [...seoModel.SEO_FIELDS],
    [
      "title",
      "description",
      "canonicalUrl",
      "ogTitle",
      "ogDescription",
      "ogImageUrl",
      "robots",
      "sitemapInclude",
    ]
  );
});

test("meta text collapses whitespace, strips angle brackets, and truncates", () => {
  assert.equal(seoModel.metaText("  Hello   world  ", 80), "Hello world");
  assert.equal(seoModel.metaText("a <script>x</script> b", 80), "a scriptx/script b");
  const long = seoModel.metaText("x".repeat(200), 20);
  assert.equal(long.length, 20);
  assert.ok(long.endsWith("…"));
});

test("canonical URLs accept only absolute https", () => {
  assert.equal(
    seoModel.absoluteHttpsUrl("https://example.org/clinics/demo"),
    "https://example.org/clinics/demo"
  );
  assert.equal(seoModel.absoluteHttpsUrl("http://example.org/x"), null);
  assert.equal(seoModel.absoluteHttpsUrl("javascript:alert(1)"), null);
  assert.equal(seoModel.absoluteHttpsUrl("/relative/path"), null);
  assert.equal(seoModel.absoluteHttpsUrl("https://localhost/x"), null);
  assert.equal(seoModel.absoluteHttpsUrl(`https://e.org/${"x".repeat(600)}`), null);
});

test("share images accept https or same-site paths but never traversal", () => {
  assert.equal(seoModel.shareImageUrl("/media/a.png"), "/media/a.png");
  assert.equal(seoModel.shareImageUrl("https://cdn.example.org/a.png"), "https://cdn.example.org/a.png");
  assert.equal(seoModel.shareImageUrl("//evil.example/a.png"), null);
  assert.equal(seoModel.shareImageUrl("/media/../../secret"), null);
});

test("robots normalisation accepts booleans, directives, and rejects noise", () => {
  assert.equal(seoModel.normalizeRobots("noindex"), "noindex");
  assert.equal(seoModel.normalizeRobots("index, follow"), "index");
  assert.equal(seoModel.normalizeRobots(true), "noindex");
  assert.equal(seoModel.normalizeRobots(false), "index");
  assert.equal(seoModel.normalizeRobots("banana"), null);
  assert.equal(seoModel.normalizeRobots(null), null);
});

test("robots governance fails closed: tenant index cannot override env or lifecycle", () => {
  const envLocked = seoModel.resolveRobots({
    dataEnvironment: "testing",
    publishState: "published",
    robotsOverride: "index",
  });
  assert.equal(envLocked.noindex, true);
  assert.equal(envLocked.locked, true);
  assert.equal(envLocked.reason, "environment");

  const unpublished = seoModel.resolveRobots({
    dataEnvironment: "production",
    publishState: "draft",
    robotsOverride: "index",
  });
  assert.equal(unpublished.noindex, true);
  assert.equal(unpublished.reason, "not_published");

  const governance = seoModel.resolveRobots({
    dataEnvironment: "production",
    publishState: "published",
    forceNoindex: true,
    robotsOverride: "index",
  });
  assert.equal(governance.noindex, true);
  assert.equal(governance.reason, "governance");

  const tenantOptOut = seoModel.resolveRobots({
    dataEnvironment: "production",
    publishState: "published",
    robotsOverride: "noindex",
  });
  assert.equal(tenantOptOut.noindex, true);
  assert.equal(tenantOptOut.locked, false);
  assert.equal(tenantOptOut.reason, "tenant");

  const open = seoModel.resolveRobots({
    dataEnvironment: "production",
    publishState: "published",
  });
  assert.equal(open.noindex, false);
});

test("buildWebsiteSeo derives og and twitter values from resolved title and description", () => {
  const seo = seoModel.buildWebsiteSeo({
    siteName: "Grace Chapel",
    pageLabel: "About",
    computedUrl: "https://example.org/c/grace/about",
    fallbackTitle: "About · Grace Chapel",
    fallbackDescription: "Who we are.",
    dataEnvironment: "production",
    publishState: "published",
  });

  assert.equal(seo.title, "About · Grace Chapel");
  assert.equal(seo.ogTitle, "About · Grace Chapel");
  assert.equal(seo.twitterTitle, "About · Grace Chapel");
  assert.equal(seo.ogDescription, "Who we are.");
  assert.equal(seo.twitterDescription, "Who we are.");
  assert.equal(seo.canonicalUrl, "https://example.org/c/grace/about");
  assert.equal(seo.ogUrl, seo.canonicalUrl);
  assert.equal(seo.ogType, "website");
  assert.equal(seo.ogSiteName, "Grace Chapel");
  assert.equal(seo.robots, "index, follow");
  assert.equal(seo.includeInSitemap, true);
  assert.equal(seo.twitterCard, "summary");
});

test("buildWebsiteSeo prefers explicit overrides over product fallbacks", () => {
  const seo = seoModel.buildWebsiteSeo({
    siteName: "Grace Chapel",
    computedUrl: "https://example.org/c/grace/about",
    fallbackTitle: "About · Grace Chapel",
    fallbackDescription: "Who we are.",
    titleOverride: "Visit Grace Chapel",
    descriptionOverride: "Sunday services at 9 and 11.",
    ogTitleOverride: "Come as you are",
    ogDescriptionOverride: "Everyone welcome.",
    ogImageUrl: "https://cdn.example.org/share.png",
    canonicalUrlOverride: "https://grace.example.org/about",
    dataEnvironment: "production",
    publishState: "published",
  });

  assert.equal(seo.title, "Visit Grace Chapel");
  assert.equal(seo.description, "Sunday services at 9 and 11.");
  assert.equal(seo.ogTitle, "Come as you are");
  assert.equal(seo.ogDescription, "Everyone welcome.");
  assert.equal(seo.canonicalUrl, "https://grace.example.org/about");
  assert.equal(seo.ogUrl, "https://grace.example.org/about");
  assert.equal(seo.ogImageUrl, "https://cdn.example.org/share.png");
  assert.equal(seo.twitterCard, "summary_large_image");
  assert.equal(seo.twitterImageUrl, "https://cdn.example.org/share.png");
});

test("an invalid canonical override falls back to the computed URL", () => {
  const seo = seoModel.buildWebsiteSeo({
    computedUrl: "https://example.org/c/grace",
    canonicalUrlOverride: "http://attacker.example/x",
    dataEnvironment: "production",
    publishState: "published",
  });
  assert.equal(seo.canonicalUrl, "https://example.org/c/grace");
});

test("sitemap inclusion follows noindex and the tenant opt-out", () => {
  const noindexed = seoModel.buildWebsiteSeo({
    computedUrl: "https://example.org/c/grace",
    dataEnvironment: "production",
    publishState: "published",
    robotsOverride: "noindex",
    sitemapIncludeOverride: true,
  });
  assert.equal(noindexed.includeInSitemap, false, "noindex must never be listed in sitemap");

  const optedOut = seoModel.buildWebsiteSeo({
    computedUrl: "https://example.org/c/grace",
    dataEnvironment: "production",
    publishState: "published",
    sitemapIncludeOverride: false,
  });
  assert.equal(optedOut.includeInSitemap, false);
  assert.equal(optedOut.noindex, false, "sitemap opt-out is not a robots directive");
});

test("title suffix is applied once and never duplicated", () => {
  const seo = seoModel.buildWebsiteSeo({
    fallbackTitle: "Book a consultation",
    titleSuffix: "ActiveClinic",
    dataEnvironment: "production",
    publishState: "published",
  });
  assert.equal(seo.title, "Book a consultation · ActiveClinic");

  const already = seoModel.buildWebsiteSeo({
    fallbackTitle: "Juflona · ActiveClinic",
    titleSuffix: "ActiveClinic",
    dataEnvironment: "production",
    publishState: "published",
  });
  assert.equal(already.title, "Juflona · ActiveClinic");
});

test("no tenant identifiers or hard-coded tenant values live in the shared model", () => {
  const source = readRepoFile("src/platform/website/seoModel.js");
  for (const banned of ["demo-church", "juflona", "activeclinic.pronline", "blessboard.com"]) {
    assert.ok(
      !source.toLowerCase().includes(banned),
      `shared SEO model must not hard-code tenant value ${banned}`
    );
  }
});

// ————————————————————————————————————————————————————————————————
// Shared discovery output
// ————————————————————————————————————————————————————————————————

test("sitemap XML escapes, dedupes, and supports lastmod", () => {
  const xml = seoDiscovery.buildSitemapXml([
    "https://example.org/c/grace?a=1&b=2",
    "https://example.org/c/grace?a=1&b=2",
    { loc: "https://example.org/c/grace/about", lastmod: "2026-08-01T10:00:00Z" },
  ]);

  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.ok(xml.includes("a=1&amp;b=2"));
  assert.ok(!xml.includes("a=1&b=2"), "raw ampersands would be invalid XML");
  assert.equal(xml.match(/<loc>/g).length, 2, "duplicate URLs collapse");
  assert.ok(xml.includes("<lastmod>2026-08-01</lastmod>"));
});

test("empty sitemaps stay valid XML", () => {
  const xml = seoDiscovery.buildSitemapXml([]);
  assert.ok(xml.includes("<urlset"));
  assert.ok(!xml.includes("<loc>"));
});

test("robots.txt allows crawling with a sitemap directive and blocks admin surfaces", () => {
  const txt = seoDiscovery.buildRobotsTxt({
    allow: true,
    sitemapUrl: "https://example.org/c/grace/sitemap.xml",
  });
  assert.ok(txt.includes("User-agent: *"));
  assert.ok(txt.includes("Allow: /"));
  assert.ok(txt.includes("Disallow: /hq/"));
  assert.ok(txt.includes("Disallow: /app/"));
  assert.ok(txt.includes("Sitemap: https://example.org/c/grace/sitemap.xml"));
});

test("robots.txt disallows everything when the site is not indexable", () => {
  const txt = seoDiscovery.buildRobotsTxt({ allow: false, sitemapUrl: "https://e.org/s.xml" });
  assert.ok(txt.includes("Disallow: /"));
  assert.ok(!txt.includes("Allow: /"));
  assert.ok(!txt.includes("Sitemap:"), "a blocked site must not advertise a sitemap");
});

// ————————————————————————————————————————————————————————————————
// BlessBoard
// ————————————————————————————————————————————————————————————————

const { buildTenantPublicSeo } = require("../src/blessboard/http/tenantPublicSeo");

test("BlessBoard SEO is produced by the shared model", () => {
  const source = readRepoFile("src/blessboard/http/tenantPublicSeo.js");
  assert.ok(
    source.includes('require("../../platform/website/seoModel")'),
    "BlessBoard must delegate to the shared SEO model"
  );
  assert.ok(
    source.includes("seoModel.buildWebsiteSeo("),
    "BlessBoard must not re-derive tag values locally"
  );
});

test("BlessBoard tenant SEO emits the full shared tag set", () => {
  const seo = buildTenantPublicSeo({
    hostname: "grace.example.org",
    pageKey: "about",
    publicName: "Grace Chapel",
    pageTitle: "About",
    description: "Who we are.",
    dataEnvironment: "production",
    websiteStatus: "published",
    pathPrefix: "",
  });

  assert.equal(seo.title, "About · Grace Chapel");
  assert.equal(seo.canonicalUrl, "https://grace.example.org/about");
  assert.equal(seo.ogUrl, seo.canonicalUrl);
  assert.equal(seo.ogSiteName, "Grace Chapel");
  assert.equal(seo.ogType, "website");
  assert.equal(seo.twitterTitle, seo.ogTitle);
  assert.equal(seo.twitterDescription, seo.ogDescription);
  assert.equal(seo.robots, "index, follow");
  assert.equal(seo.includeInSitemap, true);
});

test("BlessBoard path-mode canonical keeps the organization prefix", () => {
  const seo = buildTenantPublicSeo({
    hostname: "blessboard.example.org",
    pageKey: "sermons",
    publicName: "Grace Chapel",
    dataEnvironment: "production",
    websiteStatus: "published",
    pathPrefix: "/c/grace",
  });
  assert.equal(seo.canonicalUrl, "https://blessboard.example.org/c/grace/sermons");
});

test("BlessBoard honours canonical, robots, and sitemap overrides", () => {
  const seo = buildTenantPublicSeo({
    hostname: "grace.example.org",
    pageKey: "home",
    publicName: "Grace Chapel",
    dataEnvironment: "production",
    websiteStatus: "published",
    canonicalUrlOverride: "https://grace.example.org/welcome",
    robotsOverride: "noindex",
    sitemapIncludeOverride: false,
  });
  assert.equal(seo.canonicalUrl, "https://grace.example.org/welcome");
  assert.equal(seo.robots, "noindex, nofollow");
  assert.equal(seo.includeInSitemap, false);
});

test("BlessBoard non-production and unpublished sites stay noindex", () => {
  for (const input of [
    { dataEnvironment: "testing", websiteStatus: "published" },
    { dataEnvironment: "production", websiteStatus: "draft" },
    { dataEnvironment: "production", websiteStatus: "published", branchInactive: true },
    { dataEnvironment: "production", websiteStatus: "published", forceNoindex: true },
  ]) {
    const seo = buildTenantPublicSeo({
      hostname: "grace.example.org",
      pageKey: "home",
      publicName: "Grace Chapel",
      robotsOverride: "index",
      ...input,
    });
    assert.equal(seo.robots, "noindex, nofollow", JSON.stringify(input));
    assert.equal(seo.includeInSitemap, false, JSON.stringify(input));
  }
});

test("BlessBoard public head renders every shared SEO tag", () => {
  const shell = readRepoFile("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
  const required = [
    "<title><%= seo.title %></title>",
    'name="description" content="<%= seo.description %>"',
    'name="robots" content="<%= seo.robots %>"',
    'rel="canonical" href="<%= seo.canonicalUrl %>"',
    'property="og:type" content="<%= seo.ogType %>"',
    'property="og:title" content="<%= seo.ogTitle %>"',
    'property="og:description" content="<%= seo.ogDescription %>"',
    'property="og:url" content="<%= seo.ogUrl %>"',
    'property="og:site_name" content="<%= seo.ogSiteName %>"',
    'property="og:image" content="<%= seo.ogImageUrl %>"',
    'name="twitter:card" content="<%= seo.twitterCard %>"',
    'name="twitter:title" content="<%= seo.twitterTitle %>"',
    'name="twitter:description" content="<%= seo.twitterDescription %>"',
    'name="twitter:image" content="<%= seo.twitterImageUrl %>"',
  ];
  for (const snippet of required) {
    assert.ok(shell.includes(snippet), `BlessBoard head must emit ${snippet}`);
  }
});

test("BlessBoard settings registry exposes the new SEO keys", () => {
  const registry = require("../src/blessboard/services/websiteSettingKeyRegistry");
  const keys = registry.SETTING_KEYS || Object.keys(registry.KEY_DEFINITIONS || {});
  const source = readRepoFile("src/blessboard/services/websiteSettingKeyRegistry.js");
  for (const key of ["seo.canonical_url", "seo.robots", "seo.sitemap_include"]) {
    assert.ok(source.includes(`"${key}"`), `registry must declare ${key}`);
    if (Array.isArray(keys)) {
      assert.ok(keys.includes(key), `${key} must be a recognised setting key`);
    }
  }
});

test("BlessBoard SEO editor group offers the new fields", () => {
  const view = require("../src/blessboard/services/branchWebsiteSettingsEditorView");
  const source = readRepoFile("src/blessboard/services/branchWebsiteSettingsEditorView.js");
  assert.ok(source.includes('"seo.canonical_url"'));
  assert.ok(source.includes('"seo.robots"'));
  assert.ok(source.includes('"seo.sitemap_include"'));
  assert.ok(view, "editor view module must load");
});

test("BlessBoard sitemap excludes opted-out branches", () => {
  const {
    buildTenantPublicDiscoveryUrls,
  } = require("../src/blessboard/http/tenantPublicDiscovery");

  const all = buildTenantPublicDiscoveryUrls({
    hostname: "blessboard.example.org",
    routingMode: "path",
    organizationKey: "grace",
    websiteMode: "multi_site",
    activeBranches: [{ key: "lusaka" }, { key: "ndola" }],
  });
  assert.ok(all.some((u) => u.includes("/branches/lusaka")));
  assert.ok(all.some((u) => u.includes("/branches/ndola")));

  const filtered = buildTenantPublicDiscoveryUrls({
    hostname: "blessboard.example.org",
    routingMode: "path",
    organizationKey: "grace",
    websiteMode: "multi_site",
    activeBranches: [{ key: "lusaka" }, { key: "ndola" }],
    excludeBranchKeys: new Set(["ndola"]),
  });
  assert.ok(filtered.some((u) => u.includes("/branches/lusaka")));
  assert.ok(
    !filtered.some((u) => u.includes("/branches/ndola")),
    "an excluded branch must not appear in the sitemap"
  );
  assert.ok(filtered.length < all.length);
});

test("BlessBoard tenant discovery treats robots.txt as a public surface", () => {
  const paths = require("../src/blessboard/http/tenantPublicPaths");
  assert.equal(paths.isTenantPublicActionPath("/robots.txt"), true);
  assert.equal(paths.isTenantPublicActionPath("/sitemap.xml"), true);
});

test("BlessBoard sitemap XML comes from the shared discovery builder", () => {
  const source = readRepoFile("src/blessboard/http/tenantPublicDiscovery.js");
  assert.ok(source.includes('require("../../platform/website/seoDiscovery")'));
});

// ————————————————————————————————————————————————————————————————
// ActiveClinic
// ————————————————————————————————————————————————————————————————

const {
  buildActiveClinicPublicSeo,
  pageKeyFromTemplate,
} = require("../src/activeclinic/website/activeClinicPublicSeo");

const clinicFixture = (overrides) =>
  Object.assign(
    {
      clinicKey: "demo-clinic",
      publicName: "Demo Medical Centre",
      websiteDisplayName: "Demo Medical Centre",
      seoTitle: null,
      seoDescription: "Family care in the city centre.",
      seoImageUrl: null,
      seoImageAlt: "",
      dataEnvironment: "production",
      websiteContent: {},
    },
    overrides || {}
  );

const reqFixture = { get: (name) => (String(name).toLowerCase() === "host" ? "clinics.example.org" : "") };

test("ActiveClinic template registers every V1 SEO key", () => {
  const source = readRepoFile("src/activeclinic/website/activeClinicWebsiteTemplate.js");
  for (const key of [
    "seo.title",
    "seo.description",
    "seo.image",
    "seo.canonical_url",
    "seo.robots",
    "seo.sitemap_include",
  ]) {
    assert.ok(source.includes(`"${key}"`), `template must declare ${key}`);
  }
});

test("ActiveClinic SEO keys are editable engine content fields", () => {
  const schema = require("../src/platform/website/editableFieldSchema");
  schema.ensureProductFieldsRegistered("activeclinic");
  for (const key of ["seo.canonical_url", "seo.robots", "seo.sitemap_include"]) {
    assert.equal(
      schema.hasEditableField("activeclinic", key),
      true,
      `${key} must pass the engine editable-field gate`
    );
  }
});

test("ActiveClinic SEO settings group includes the new keys", () => {
  const cmsService = require("../src/activeclinic/website/clinicWebsiteCmsService");
  const keys = cmsService.SETTINGS_KEYS.seo;
  assert.ok(keys.includes("seo.canonical_url"));
  assert.ok(keys.includes("seo.robots"));
  assert.ok(keys.includes("seo.sitemap_include"));
});

test("ActiveClinic page keys derive from the view template", () => {
  assert.equal(pageKeyFromTemplate("tenant/home"), "home");
  assert.equal(pageKeyFromTemplate("tenant/doctors"), "doctors");
  assert.equal(pageKeyFromTemplate(""), "home");
});

test("ActiveClinic now emits a canonical URL and og:url", () => {
  const seo = buildActiveClinicPublicSeo({
    req: reqFixture,
    clinic: clinicFixture(),
    instance: { status: "published" },
    template: "tenant/doctors",
    pageTitle: "Our doctors",
  });

  assert.equal(seo.canonicalUrl, "https://clinics.example.org/clinics/demo-clinic/doctors");
  assert.equal(seo.ogUrl, seo.canonicalUrl);
  assert.equal(seo.title, "Our doctors · ActiveClinic");
  assert.equal(seo.ogTitle, seo.title);
  assert.equal(seo.ogSiteName, "Demo Medical Centre");
  assert.equal(seo.robots, "index, follow");
  assert.equal(seo.includeInSitemap, true);
});

test("ActiveClinic home canonical has no trailing page segment", () => {
  const seo = buildActiveClinicPublicSeo({
    req: reqFixture,
    clinic: clinicFixture(),
    instance: { status: "published" },
    template: "tenant/home",
    pageTitle: "Demo Medical Centre",
  });
  assert.equal(seo.canonicalUrl, "https://clinics.example.org/clinics/demo-clinic");
});

test("ActiveClinic reads canonical, robots, and sitemap overrides from engine content", () => {
  const seo = buildActiveClinicPublicSeo({
    req: reqFixture,
    clinic: clinicFixture({
      websiteContent: {
        "seo.canonical_url": "https://demo-clinic.example.org/",
        "seo.robots": "noindex",
        "seo.sitemap_include": false,
      },
    }),
    instance: { status: "published" },
    template: "tenant/home",
    pageTitle: "Demo Medical Centre",
  });

  assert.equal(seo.canonicalUrl, "https://demo-clinic.example.org/");
  assert.equal(seo.robots, "noindex, nofollow");
  assert.equal(seo.includeInSitemap, false);
});

test("ActiveClinic drafts, previews, and non-production data stay noindex", () => {
  const draft = buildActiveClinicPublicSeo({
    req: reqFixture,
    clinic: clinicFixture({ websiteContent: { "seo.robots": "index" } }),
    instance: { status: "draft" },
    template: "tenant/home",
  });
  assert.equal(draft.robots, "noindex, nofollow");

  const preview = buildActiveClinicPublicSeo({
    req: reqFixture,
    clinic: clinicFixture(),
    instance: { status: "published" },
    template: "tenant/home",
    isPreview: true,
  });
  assert.equal(preview.robots, "noindex, nofollow");

  const testingEnv = buildActiveClinicPublicSeo({
    req: reqFixture,
    clinic: clinicFixture({ dataEnvironment: "testing" }),
    instance: { status: "published" },
    template: "tenant/home",
  });
  assert.equal(testingEnv.robots, "noindex, nofollow");

  const explicitRobots = buildActiveClinicPublicSeo({
    req: reqFixture,
    clinic: clinicFixture(),
    instance: { status: "published" },
    template: "tenant/home",
    robots: "noindex",
  });
  assert.equal(explicitRobots.robots, "noindex, nofollow");
});

test("ActiveClinic share image drives the twitter card type", () => {
  const withImage = buildActiveClinicPublicSeo({
    req: reqFixture,
    clinic: clinicFixture({
      seoImageUrl: "https://cdn.example.org/share.png",
      seoImageAlt: "Clinic reception",
    }),
    instance: { status: "published" },
    template: "tenant/home",
  });
  assert.equal(withImage.twitterCard, "summary_large_image");
  assert.equal(withImage.twitterImageUrl, "https://cdn.example.org/share.png");
  assert.equal(withImage.ogImageAlt, "Clinic reception");

  const withoutImage = buildActiveClinicPublicSeo({
    req: reqFixture,
    clinic: clinicFixture(),
    instance: { status: "published" },
    template: "tenant/home",
  });
  assert.equal(withoutImage.twitterCard, "summary");
  assert.equal(withoutImage.twitterImageUrl, null);
});

test("ActiveClinic public shell renders SEO tags from the shared model", () => {
  const shell = readRepoFile("views/activeclinic/layouts/public-shell.ejs");
  const required = [
    "<title><%= seo.title %></title>",
    'name="description" content="<%= seo.description %>"',
    'rel="canonical" href="<%= seo.canonicalUrl %>"',
    'name="robots" content="<%= seo.robots %>"',
    'property="og:title" content="<%= seo.ogTitle %>"',
    'property="og:description" content="<%= seo.ogDescription %>"',
    'property="og:type" content="<%= seo.ogType %>"',
    'property="og:url" content="<%= seo.ogUrl %>"',
    'property="og:site_name" content="<%= seo.ogSiteName %>"',
    'name="twitter:card" content="<%= seo.twitterCard %>"',
    'name="twitter:title" content="<%= seo.twitterTitle %>"',
  ];
  for (const snippet of required) {
    assert.ok(shell.includes(snippet), `ActiveClinic head must emit ${snippet}`);
  }
});

test("ActiveClinic SEO settings form exposes the new controls", () => {
  const view = readRepoFile("views/activeclinic/app/website-cms-seo.ejs");
  assert.ok(view.includes('name="seoCanonicalUrl"'));
  assert.ok(view.includes('name="seoRobots"'));
  assert.ok(view.includes('name="seoSitemapInclude"'));
  // Mobile usability: no fixed pixel widths introduced on the new controls.
  assert.ok(!/style="[^"]*width:\s*\d+px/.test(view), "settings form must stay fluid");
});

test("ActiveClinic SEO save writes drafts only", () => {
  const routes = readRepoFile("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
  assert.ok(routes.includes('key: "seo.canonical_url"'));
  assert.ok(routes.includes('key: "seo.robots"'));
  assert.ok(routes.includes('key: "seo.sitemap_include"'));

  const cms = readRepoFile("src/activeclinic/website/clinicWebsiteCmsService.js");
  assert.ok(
    cms.includes("saveWebsiteDraft"),
    "SEO settings must persist through the draft-only engine write path"
  );
  assert.ok(
    !cms.includes("published_value"),
    "the CMS service must never write published values directly"
  );
});

test("SEO drafts never touch published content in the shared engine", () => {
  const contentService = readRepoFile("src/platform/website/contentService.js");
  // saveWebsiteDraft must insert a NULL published_value and only update draft_value.
  const insertBlock = contentService.slice(
    contentService.indexOf("INSERT INTO platform.website_content"),
    contentService.indexOf("RETURNING *")
  );
  assert.ok(insertBlock.includes("NULL"), "new draft rows must not publish themselves");
  assert.ok(insertBlock.includes("draft_value = EXCLUDED.draft_value"));
  assert.ok(
    !insertBlock.includes("published_value = EXCLUDED"),
    "a draft save must never promote published_value"
  );
});

test("ActiveClinic exposes sitemap.xml and robots.txt for clinic sites", () => {
  const routes = readRepoFile("src/activeclinic/http/activeClinicPublicRoutes.js");
  assert.ok(routes.includes('app.get("/clinics/:clinicKey/sitemap.xml"'));
  assert.ok(routes.includes('app.get("/clinics/:clinicKey/robots.txt"'));
  assert.ok(
    routes.indexOf('app.get("/clinics/:clinicKey/sitemap.xml"') <
      routes.indexOf('app.get("/clinics/:clinicKey", async'),
    "discovery routes must be registered before the catch-all clinic home route"
  );
  assert.ok(routes.includes("buildSitemapXml"));
  assert.ok(routes.includes("buildRobotsTxt"));
});

test("existing public URLs and routing are preserved", () => {
  const urls = require("../src/platform/website/publicWebsiteUrl");
  assert.equal(urls.PRODUCT_PUBLIC_PREFIX.activeclinic, "/clinics");
  assert.equal(urls.PRODUCT_PUBLIC_PREFIX.blessboard, "/c");
  assert.equal(
    urls.buildPublicOrganizationWebsitePath({
      product: "activeclinic",
      organizationKey: "demo-clinic",
      pageKey: "doctors",
    }),
    "/clinics/demo-clinic/doctors"
  );
});
