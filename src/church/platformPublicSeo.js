"use strict";

const {
  BLESSBOARD_NAME,
  BLESSBOARD_PUBLIC_URL,
  blessboardDocumentTitle,
  blessboardDefaultOgImageUrl,
} = require("./branding");
const { BLESSBOARD_REGISTER_CHURCH_PATH } = require("./platformPublicContent");

const BLESSBOARD_OG_IMAGE_URL = blessboardDefaultOgImageUrl();

/** @type {Record<string, { path: string, pageTitle: string, metaDescription: string, changefreq?: string, priority?: string, breadcrumbLabel?: string }>} */
const PLATFORM_PUBLIC_SEO = {
  home: {
    path: "/",
    pageTitle: "Find and connect with your church",
    metaDescription:
      "BlessBoard is a church management platform for members, leaders, and administrators — church websites, member portals, and multi-branch church management in one place.",
    changefreq: "weekly",
    priority: "1.0",
  },
  features: {
    path: "/features",
    pageTitle: "Features",
    metaDescription:
      "BlessBoard features for church websites, member portals, branch administration, and HQ multi-branch tools — practical church administration tools in one connected platform.",
    changefreq: "monthly",
    priority: "0.9",
    breadcrumbLabel: "Features",
  },
  pricing: {
    path: "/pricing",
    pageTitle: "Pricing",
    metaDescription:
      "BlessBoard pricing — Free, Growth, Professional, and Partner plans for churches. Per-staff billing on paid tiers with contact-led onboarding.",
    changefreq: "monthly",
    priority: "0.85",
    breadcrumbLabel: "Pricing",
  },
  "for-churches": {
    path: "/for-churches",
    pageTitle: "For Churches",
    metaDescription:
      "BlessBoard for pastors and church administrators — publish a church website, engage members, and manage branch operations with church software designed for real ministry teams.",
    changefreq: "monthly",
    priority: "0.9",
    breadcrumbLabel: "For Churches",
  },
  "multi-branch": {
    path: "/multi-branch",
    pageTitle: "Multi-Branch Churches",
    metaDescription:
      "Multi-branch church management on BlessBoard — HQ oversight, branch administration, and consistent public identity across every location.",
    changefreq: "monthly",
    priority: "0.85",
    breadcrumbLabel: "Multi-Branch",
  },
  churches: {
    path: "/churches",
    pageTitle: "Find a Church",
    metaDescription:
      "Find your church on BlessBoard — search congregations, open the right branch homepage, and sign in to your church member portal.",
    changefreq: "daily",
    priority: "0.9",
    breadcrumbLabel: "Find a Church",
  },
  about: {
    path: "/about",
    pageTitle: "About BlessBoard",
    metaDescription:
      "About BlessBoard — a church management platform being introduced with churches in Zambia and designed to support congregations across multiple locations and countries.",
    changefreq: "monthly",
    priority: "0.8",
    breadcrumbLabel: "About",
  },
  contact: {
    path: "/contact",
    pageTitle: "Contact BlessBoard",
    metaDescription:
      "Contact BlessBoard about platform access, onboarding, multi-branch setup, or general questions about our church management platform.",
    changefreq: "monthly",
    priority: "0.75",
    breadcrumbLabel: "Contact",
  },
  "register-church": {
    path: BLESSBOARD_REGISTER_CHURCH_PATH,
    pageTitle: "Register Your Church",
    metaDescription:
      "Request BlessBoard access for your church. BlessBoard is onboarding selected congregations — contact the team to discuss access and setup.",
    changefreq: "monthly",
    priority: "0.85",
    breadcrumbLabel: "Register Your Church",
  },
  faq: {
    path: "/faq",
    pageTitle: "FAQ",
    metaDescription:
      "BlessBoard frequently asked questions for visitors, members, and church administrators — finding your church, member access, and administrator login.",
    changefreq: "monthly",
    priority: "0.7",
    breadcrumbLabel: "FAQ",
  },
  demo: {
    path: "/demo",
    pageTitle: "See BlessBoard in action",
    metaDescription:
      "Explore the BlessBoard demo church public website — homepage, leadership, ministries, events, and sermons.",
    changefreq: "monthly",
    priority: "0.75",
    breadcrumbLabel: "Demo",
  },
  privacy: {
    path: "/privacy",
    pageTitle: "Privacy Policy",
    metaDescription:
      "BlessBoard privacy practices for blessboard.com and church tenant sites — data handling, cookies, and contact information.",
    changefreq: "yearly",
    priority: "0.5",
    breadcrumbLabel: "Privacy Policy",
  },
  terms: {
    path: "/terms",
    pageTitle: "Terms of Service",
    metaDescription: "BlessBoard terms of service for platform use, church sites, and member accounts.",
    changefreq: "yearly",
    priority: "0.5",
    breadcrumbLabel: "Terms of Service",
  },
  security: {
    path: "/security",
    pageTitle: "Security and Data Information",
    metaDescription:
      "BlessBoard security overview — role-based access, sessions, password handling, and public form protections.",
    changefreq: "yearly",
    priority: "0.55",
    breadcrumbLabel: "Security",
  },
  support: {
    path: "/support",
    pageTitle: "Support",
    metaDescription:
      "Help using BlessBoard — find your church, member access, administrator login, and password assistance.",
    changefreq: "monthly",
    priority: "0.65",
    breadcrumbLabel: "Support",
  },
};

/** Marketing pages included in the apex sitemap (stable URLs only). */
const SITEMAP_PAGE_KEYS = [
  "home",
  "features",
  "pricing",
  "for-churches",
  "multi-branch",
  "churches",
  "about",
  "contact",
  "register-church",
  "faq",
  "demo",
  "privacy",
  "terms",
  "security",
  "support",
];

function escapeXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Canonical BlessBoard apex URL (non-www, https).
 * @param {string} [pathname]
 */
function blessboardApexCanonicalUrl(pathname = "/") {
  const base = BLESSBOARD_PUBLIC_URL.replace(/\/$/, "");
  const path = String(pathname || "/");
  if (path === "/") return `${base}/`;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Resolve SEO config key from route locals.
 * @param {Record<string, unknown>} locals
 */
function resolveSeoPageKey(locals) {
  if (locals.seoPageKey && PLATFORM_PUBLIC_SEO[locals.seoPageKey]) {
    return String(locals.seoPageKey);
  }
  const active = locals.activePage ? String(locals.activePage) : "";
  if (active && PLATFORM_PUBLIC_SEO[active]) return active;
  return null;
}

/**
 * @param {string} origin
 * @param {{ name: string, path: string }[]} crumbs
 */
function buildBreadcrumbListJsonLd(origin, crumbs) {
  if (!crumbs || crumbs.length < 2) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${origin.replace(/\/$/, "")}${crumb.path === "/" ? "/" : crumb.path}`,
    })),
  };
}

function buildOrganizationJsonLd(origin) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BLESSBOARD_NAME,
    url: origin,
    logo: BLESSBOARD_OG_IMAGE_URL,
  };
}

function buildWebSiteJsonLd(origin) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: BLESSBOARD_NAME,
    url: origin,
    potentialAction: {
      "@type": "SearchAction",
      target: `${origin.replace(/\/$/, "")}/churches?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * @param {string} pageKey
 * @param {string} origin
 */
function buildBreadcrumbsForPage(pageKey, origin) {
  const config = PLATFORM_PUBLIC_SEO[pageKey];
  if (!config || pageKey === "home") return [];
  const label = config.breadcrumbLabel || config.pageTitle;
  return [
    { name: "Home", path: "/" },
    { name: label, path: config.path },
  ];
}

/**
 * @param {Record<string, unknown>} locals
 */
function buildPlatformStructuredData(locals) {
  const origin = blessboardApexCanonicalUrl("/").replace(/\/$/, "");
  const pageKey = resolveSeoPageKey(locals);
  const graphs = [];

  if (pageKey === "home") {
    graphs.push(buildOrganizationJsonLd(origin));
    graphs.push(buildWebSiteJsonLd(origin));
  } else if (pageKey) {
    const breadcrumbLd = buildBreadcrumbListJsonLd(origin, buildBreadcrumbsForPage(pageKey, origin));
    if (breadcrumbLd) graphs.push(breadcrumbLd);
  }

  return graphs;
}

/**
 * Attach SEO fields to BlessBoard apex public page locals.
 * @param {Record<string, unknown>} locals
 * @param {import('express').Request | null} [_req]
 */
function mergePlatformPublicSeo(locals, _req = null) {
  if (!locals || !locals.isVerticalApex) return locals;

  const pageKey = resolveSeoPageKey(locals);
  const config = pageKey ? PLATFORM_PUBLIC_SEO[pageKey] : null;

  const pageTitle =
    (config && config.pageTitle) ||
    (typeof locals.pageTitle === "string" && locals.pageTitle.trim()) ||
    BLESSBOARD_NAME;
  const metaDescription =
    (config && config.metaDescription) ||
    (typeof locals.metaDescription === "string" && locals.metaDescription.trim()) ||
    "";

  const canonicalPath =
    (typeof locals.canonicalPath === "string" && locals.canonicalPath) ||
    (config && config.path) ||
    "/";
  const canonicalUrl = blessboardApexCanonicalUrl(canonicalPath);

  const structuredData = buildPlatformStructuredData({
    ...locals,
    seoPageKey: pageKey,
    pageTitle,
    metaDescription,
  });

  return {
    ...locals,
    pageTitle,
    metaDescription,
    seoTitle: blessboardDocumentTitle(pageTitle),
    seoDescription: metaDescription,
    canonicalUrl,
    ogUrl: canonicalUrl,
    ogImage: BLESSBOARD_OG_IMAGE_URL,
    ogType: "website",
    robotsMeta: locals.noindex ? undefined : "index, follow",
    noindex: Boolean(locals.noindex),
    structuredDataJsonLd: structuredData,
  };
}

function buildBlessboardApexSitemapXml() {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const key of SITEMAP_PAGE_KEYS) {
    const config = PLATFORM_PUBLIC_SEO[key];
    if (!config) continue;
    lines.push("  <url>");
    lines.push(`    <loc>${escapeXml(blessboardApexCanonicalUrl(config.path))}</loc>`);
    if (config.changefreq) lines.push(`    <changefreq>${config.changefreq}</changefreq>`);
    if (config.priority) lines.push(`    <priority>${config.priority}</priority>`);
    lines.push("  </url>");
  }

  lines.push("</urlset>");
  return lines.join("\n");
}

function buildBlessboardApexRobotsTxt() {
  const sitemapUrl = blessboardApexCanonicalUrl("/sitemap.xml");
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /branch/",
    "Disallow: /hq/",
    "Disallow: /member/",
    "Disallow: /leader/",
    "Disallow: /login",
    "Disallow: /register",
    "",
    `Sitemap: ${sitemapUrl}`,
    "",
  ].join("\n");
}

function requireVerticalApex(req, res, next) {
  const ctx = req.churchContext;
  if (!ctx || ctx.kind !== "vertical-apex") {
    return next("router");
  }
  return next();
}

function registerPlatformPublicSeoRoutes(router) {
  router.get("/sitemap.xml", requireVerticalApex, (req, res) => {
    res.type("application/xml");
    res.send(buildBlessboardApexSitemapXml());
  });

  router.get("/robots.txt", requireVerticalApex, (req, res) => {
    res.type("text/plain");
    res.send(buildBlessboardApexRobotsTxt());
  });
}

module.exports = {
  BLESSBOARD_OG_IMAGE_URL,
  PLATFORM_PUBLIC_SEO,
  SITEMAP_PAGE_KEYS,
  escapeXml,
  blessboardApexCanonicalUrl,
  resolveSeoPageKey,
  mergePlatformPublicSeo,
  buildPlatformStructuredData,
  buildBlessboardApexSitemapXml,
  buildBlessboardApexRobotsTxt,
  registerPlatformPublicSeoRoutes,
};
