#!/usr/bin/env node
"use strict";

/**
 * Phase-1 READ-ONLY production automated smoke.
 * - GET/browse only; no form submits, no login, no writes.
 * - Requires production env via run-with-blessboard-env.sh production
 *
 * Usage:
 *   scripts/local/run-with-blessboard-env.sh production \
 *     node scripts/local/v7-production-readonly-smoke.js
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");
const { Pool } = require("pg");
const { chromium } = require("playwright");
const { requireDatabaseUrl } = require("../../db/scripts/lib/databaseUrl");
const { buildFoundationPoolConfig } = require("../../db/scripts/lib/foundationPool");
const { checkDatabaseIdentity } = require("../../db/scripts/lib/databaseIdentity");

const EXPECTED_SHA_FULL = "3c2cd0384b09e7483e2feef6bd376e126eff7ea9";
const EXPECTED_SHA12 = EXPECTED_SHA_FULL.slice(0, 12);
const EXPECTED_DEPLOYMENT = "moovex-platform-production";
const EXPECTED_ENV = "production";
const EXPECTED_IDENTITY = "moovex-platform-v7";

const AC_BASE = "https://activeclinic.org";
const BB_BASE = "https://blessboard.com";

const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "mobile-390", width: 390, height: 844 },
];

const AC_ROUTES = [
  "/",
  "/login",
  "/register-clinic",
  "/clinics",
  "/book",
  "/terms",
  "/privacy",
];

const BB_ROUTES = [
  "/",
  "/login",
  "/register-church",
  "/directory",
  "/find-a-church",
  "/terms",
  "/privacy",
];

const AC_STATIC = [
  "/activeclinic/acw-platform.css?v=v7-minisite-align-2",
  "/activeclinic/ac-public.css?v=v7-minisite-align-2",
  "/activeclinic/ac-tokens.css?v=v7-minisite-align-2",
];

const BB_STATIC = [
  "/blessboard/v5/apex.css",
  "/blessboard/v5/design-system.css",
  "/blessboard/v5/design-tokens.css",
];

const REDIRECT_URLS = [
  "http://activeclinic.org",
  "https://activeclinic.org",
  "https://www.activeclinic.org",
  "http://blessboard.com",
  "https://blessboard.com",
  "https://www.blessboard.com",
];

const SECRET_SNIPPETS = [
  "postgres://",
  "postgresql://",
  "DATABASE_URL",
  "SESSION_SECRET",
  "BEGIN RSA PRIVATE",
  "-----BEGIN PRIVATE",
];

/** Avoid false positives from password form fields / toggle attrs. */
function findSecretLeaks(html) {
  const text = String(html || "");
  const hits = SECRET_SNIPPETS.filter((s) => text.includes(s));
  // Real credential assignment patterns only (not name="password" / toggle-password="password")
  if (/(?:^|[\s;,{])(?:api[_-]?key|secret|access_token|session_secret)\s*[:=]\s*['"][^'"]{8,}/im.test(text)) {
    hits.push("credential_assignment_pattern");
  }
  return hits;
}

const EXTERNAL_IGNORE = [
  /google-analytics|googletagmanager|facebook\.net|doubleclick|hotjar|sentry\.io/i,
  /fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/i,
];

function shaMatches(expected, hosted) {
  const e = String(expected || "").trim().toLowerCase();
  const h = String(hosted || "").trim().toLowerCase();
  if (!e || !h) return false;
  if (e === h) return true;
  if (e.startsWith(h) || h.startsWith(e)) return true;
  return e.slice(0, 12) === h.slice(0, 12);
}

function fetchRaw(urlString, { method = "GET", maxRedirects = 0, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const lib = url.protocol === "http:" ? http : https;
    const req = lib.request(
      url,
      {
        method,
        headers: {
          "user-agent": "getpro-production-readonly-smoke/1.0",
          accept: "*/*",
          ...headers,
        },
        timeout: 20000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
            url: urlString,
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`timeout ${urlString}`));
    });
    req.on("error", reject);
    req.end();
  });
}

async function followRedirects(startUrl, { maxHops = 8 } = {}) {
  const chain = [];
  let current = startUrl;
  for (let i = 0; i <= maxHops; i += 1) {
    const res = await fetchRaw(current, { method: "GET", maxRedirects: 0 });
    const location = res.headers.location || null;
    chain.push({
      url: current,
      status: res.status,
      location,
      contentType: res.headers["content-type"] || null,
    });
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    return {
      startUrl,
      finalUrl: current,
      finalStatus: res.status,
      hops: chain.length - 1,
      chain,
      loop: false,
      bodySnippet: res.body.toString("utf8").slice(0, 200),
    };
  }
  return {
    startUrl,
    finalUrl: current,
    finalStatus: null,
    hops: chain.length,
    chain,
    loop: true,
    bodySnippet: "",
  };
}

async function fetchJson(url) {
  const res = await fetchRaw(url);
  const text = res.body.toString("utf8");
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_err) {
    json = null;
  }
  return { status: res.status, headers: res.headers, json, text };
}

function scorecardBlank() {
  return {
    runtime_health: "PENDING",
    routes_tested: 0,
    desktop: "PENDING",
    mobile_390: "PENDING",
    routing: "PENDING",
    assets: "PENDING",
    console_errors: "PENDING",
    failed_requests: "PENDING",
    security_cookies: "PENDING",
    overall: "PENDING",
  };
}

async function readCustomerCounts(pool) {
  const q = async (sql) => {
    try {
      const r = await pool.query(sql);
      return Number(r.rows[0].n);
    } catch (err) {
      return { error: err.message };
    }
  };
  return {
    organizations: await q(`SELECT count(*)::int AS n FROM platform.organizations`),
    blessboard_users: await q(`SELECT count(*)::int AS n FROM blessboard.users`),
    activeclinic_staff: await q(`SELECT count(*)::int AS n FROM activeclinic.staff_members`),
    ac_registration_applications: await q(
      `SELECT count(*)::int AS n FROM activeclinic.clinic_registration_applications`
    ),
    bb_registration_applications: await q(
      `SELECT count(*)::int AS n FROM blessboard.platform_church_registration_applications`
    ),
    patients: await q(`SELECT count(*)::int AS n FROM activeclinic.patients`),
    appointments: await q(`SELECT count(*)::int AS n FROM activeclinic.appointments`),
    bookings: await (async () => {
      const exists = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'activeclinic' AND table_name = 'patient_bookings'
        ) AS ok`);
      if (!exists.rows[0].ok) {
        // No separate public bookings table; appointments is the booking entity.
        return { note: "patient_bookings_table_absent_use_appointments", count: null };
      }
      return q(`SELECT count(*)::int AS n FROM activeclinic.patient_bookings`);
    })(),
  };
}

async function inspectKnownGaps(pool) {
  const gaps = [];

  const dep = await pool.query(
    `SELECT deployment_code, application_code, status, environment_code, canonical_domain, jobs_enabled
       FROM platform.deployments
      WHERE deployment_code = $1`,
    [EXPECTED_DEPLOYMENT]
  );
  if (!dep.rows.length) {
    gaps.push({
      id: "missing_moovex_platform_production_row",
      title: "missing moovex-platform-production row in platform.deployments",
      classification: "NONBLOCKING_DEBT",
      evidence: "row absent; runtime healthz still reports deploymentCode=moovex-platform-production from env/config",
      runtime_impact: "Hosted healthz OK with schemaCompatible=true; row used by admin/ops tooling and some identity helpers",
    });
  } else {
    gaps.push({
      id: "moovex_platform_production_row",
      title: "moovex-platform-production row present",
      classification: "OK",
      evidence: dep.rows[0],
      runtime_impact: "none",
    });
  }

  const staging = await pool.query(
    `SELECT deployment_code, application_code, status, environment_code, canonical_domain, jobs_enabled
       FROM platform.deployments
      WHERE deployment_code = 'blessboard-org-staging'`
  );
  if (staging.rows.length && String(staging.rows[0].status || "").toLowerCase() === "active") {
    gaps.push({
      id: "active_blessboard_org_staging",
      title: "active blessboard-org-staging",
      classification: "NONBLOCKING_DEBT",
      evidence: staging.rows[0],
      runtime_impact:
        "Legacy testing/staging profile row remains active in shared DB; production hostnames resolve via moovex-platform-production and did not serve staging shell in smoke",
    });
  } else if (staging.rows.length) {
    gaps.push({
      id: "blessboard_org_staging",
      title: "blessboard-org-staging present but not active",
      classification: "NONBLOCKING_DEBT",
      evidence: staging.rows[0],
      runtime_impact: "none observed",
    });
  } else {
    gaps.push({
      id: "blessboard_org_staging_absent",
      title: "blessboard-org-staging row absent",
      classification: "OK",
      evidence: null,
      runtime_impact: "none",
    });
  }

  // Stale db:verify:foundation — REQUIRED_DEPLOYMENTS still expects legacy codes and
  // does not list moovex-platform-production. Read allowlist from module without mutating.
  let foundationNote = null;
  try {
    const fv = require("../../db/scripts/lib/foundationVerify");
    foundationNote = {
      required_deployments_includes_moovex_production: Array.isArray(fv.REQUIRED_DEPLOYMENTS)
        ? fv.REQUIRED_DEPLOYMENTS.includes(EXPECTED_DEPLOYMENT)
        : "REQUIRED_DEPLOYMENTS_not_exported",
      note: "verify-foundation allowlist still centered on legacy deployment codes; stale vs V7 unified production profile",
    };
  } catch (err) {
    foundationNote = { error: err.message };
  }
  gaps.push({
    id: "stale_db_verify_foundation",
    title: "stale db:verify:foundation",
    classification: "NONBLOCKING_DEBT",
    evidence: foundationNote,
    runtime_impact: "CLI verify may fail or warn on production; does not affect hosted request serving",
  });

  return gaps;
}

function classifyExternal(url) {
  return EXTERNAL_IGNORE.some((re) => re.test(url));
}

async function probePage(context, base, path, product) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const badStatuses = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(String(msg.text() || "").slice(0, 500));
    }
  });
  page.on("pageerror", (err) => {
    pageErrors.push(String(err && err.message ? err.message : err).slice(0, 500));
  });
  page.on("requestfailed", (req) => {
    const url = req.url();
    if (classifyExternal(url)) return;
    failedRequests.push({
      url: url.slice(0, 300),
      failure: req.failure() && req.failure().errorText,
      resourceType: req.resourceType(),
    });
  });
  page.on("response", (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (classifyExternal(url)) return;
    badStatuses.push({ url: url.slice(0, 300), status, resourceType: res.request().resourceType() });
  });

  const target = new URL(path, base).toString();
  let navError = null;
  let response = null;
  try {
    response = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(700);
  } catch (err) {
    navError = String(err && err.message ? err.message : err);
  }

  const finalUrl = page.url();
  const title = await page.title().catch(() => "");
  const heading = await page
    .evaluate(() => {
      const h1 = document.querySelector("h1");
      if (h1 && h1.innerText) return h1.innerText.trim().slice(0, 200);
      const main = document.querySelector("main h2, [role='main'] h2, .hero h2, h2");
      return main && main.innerText ? main.innerText.trim().slice(0, 200) : "";
    })
    .catch(() => "");

  const identity = await page
    .evaluate((expectedProduct) => {
      const html = document.documentElement.outerHTML || "";
      const text = document.body ? document.body.innerText || "" : "";
      const brand =
        document.documentElement.getAttribute("data-brand") ||
        document.body?.getAttribute("data-brand") ||
        document.querySelector("[data-brand]")?.getAttribute("data-brand") ||
        "";
      const hasTestingBanner = /testing environment|hosted testing|pronline\.org testing|DEPLOYMENT_ENV=testing/i.test(
        html + text
      );
      const hasPronline = /\.pronline\.org/i.test(html);
      const hasLocalhost = /localhost|127\.0\.0\.1/i.test(html);
      const hasAc = /ActiveClinic/i.test(html) || /activeclinic/i.test(brand);
      const hasBb = /BlessBoard/i.test(html) || /blessboard/i.test(brand);
      const acShell = !!document.querySelector(".acw-platform, .ac-public, [data-product='activeclinic']");
      const bbShell = !!document.querySelector(".bb-platform, .church-body--apex, [data-product='blessboard'], .bb-apex");
      return {
        brand,
        hasTestingBanner,
        hasPronline,
        hasLocalhost,
        hasAc,
        hasBb,
        acShell,
        bbShell,
        titleHasAc: /ActiveClinic/i.test(document.title || ""),
        titleHasBb: /BlessBoard/i.test(document.title || ""),
        expectedProduct,
      };
    }, product)
    .catch((err) => ({ error: String(err.message || err) }));

  const overflow = await page
    .evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        overflowPx: Math.max(0, doc.scrollWidth - doc.clientWidth),
      };
    })
    .catch(() => null);

  const cookies = await context.cookies(finalUrl).catch(() => []);
  const htmlSample = await page.content().catch(() => "");
  const secretHits = findSecretLeaks(htmlSample);

  const status = response ? response.status() : 0;
  await page.close().catch(() => {});

  return {
    path,
    status,
    finalUrl,
    title,
    heading,
    consoleErrors,
    pageErrors,
    failedRequests,
    badStatuses,
    overflow,
    identity,
    cookies,
    secretHits,
    navError,
  };
}

async function checkAssets(base, paths) {
  const out = [];
  for (const path of paths) {
    const url = new URL(path, base).toString();
    const res = await fetchRaw(url);
    out.push({
      path,
      status: res.status,
      contentType: res.headers["content-type"] || null,
      bytes: res.body.length,
      ok: res.status === 200 && res.body.length > 20,
    });
  }
  return out;
}

function cookieIssues(cookies, productHost) {
  const issues = [];
  for (const c of cookies) {
    const name = String(c.name || "");
    const domain = String(c.domain || "");
    if (/debug|testing|qa_fixture|dev_/i.test(name)) {
      issues.push(`debug_or_testing_cookie:${name}`);
    }
    if (c.secure !== true && productHost.startsWith("https://")) {
      // Some CDN cookies may be host-only on redirect hops; flag session-like names
      if (/sess|session|sid|connect\.sid|gp_/i.test(name)) {
        issues.push(`insecure_session_cookie:${name}`);
      }
    }
    if (/sess|session|sid|connect\.sid/i.test(name) && c.httpOnly !== true) {
      issues.push(`session_not_httponly:${name}`);
    }
    if (domain === ".com" || domain === ".org" || domain === "com" || domain === "org") {
      issues.push(`overbroad_domain:${name}@${domain}`);
    }
    // spanning both tlds
    if (/\.com$/i.test(domain) && /activeclinic\.org/i.test(productHost)) {
      issues.push(`cross_tld_cookie_on_ac:${name}@${domain}`);
    }
    if (/\.org$/i.test(domain) && /blessboard\.com/i.test(productHost)) {
      issues.push(`cross_tld_cookie_on_bb:${name}@${domain}`);
    }
  }
  return issues;
}

function summarizeRouteFailures(results, product) {
  const failures = [];
  for (const r of results) {
    if (r.navError) failures.push(`${r.path}: navError ${r.navError}`);
    if (r.status >= 500) failures.push(`${r.path}: HTTP ${r.status}`);
    if (r.identity?.hasTestingBanner) failures.push(`${r.path}: testing banner`);
    if (r.identity?.hasPronline) failures.push(`${r.path}: .pronline.org reference`);
    if (r.identity?.hasLocalhost) failures.push(`${r.path}: localhost reference`);
    if (product === "activeclinic") {
      if (r.identity?.bbShell && !r.identity?.acShell) failures.push(`${r.path}: BlessBoard shell bleed`);
      if (!r.identity?.hasAc && !r.identity?.titleHasAc && r.status === 200) {
        // allow legal pages that still brand in title
        failures.push(`${r.path}: missing ActiveClinic branding`);
      }
    }
    if (product === "blessboard") {
      if (r.identity?.acShell && !r.identity?.bbShell) failures.push(`${r.path}: ActiveClinic shell bleed`);
      if (!r.identity?.hasBb && !r.identity?.titleHasBb && r.status === 200) {
        failures.push(`${r.path}: missing BlessBoard branding`);
      }
    }
    if (r.secretHits?.length) failures.push(`${r.path}: secret snippets ${r.secretHits.join(",")}`);
    if (r.overflow && r.overflow.overflowPx > 8) {
      failures.push(`${r.path}: horizontal overflow ${r.overflow.overflowPx}px`);
    }
  }
  return failures;
}

async function main() {
  if (String(process.env.PLATFORM_DEPLOYMENT_CODE || "") !== EXPECTED_DEPLOYMENT) {
    console.error("Refusing: PLATFORM_DEPLOYMENT_CODE must be moovex-platform-production");
    process.exit(2);
  }
  if (String(process.env.DEPLOYMENT_ENV || "").toLowerCase() !== "production") {
    console.error("Refusing: DEPLOYMENT_ENV must be production");
    process.exit(2);
  }

  const report = {
    kind: "PRODUCTION_AUTOMATED_READONLY_SMOKE",
    startedAt: new Date().toISOString(),
    expectedSha: EXPECTED_SHA_FULL,
    phase: "READ_ONLY",
    runtimeHealth: null,
    runtimeHealthPass: false,
    activeclinic: { scorecard: scorecardBlank(), routes: {}, assets: [], security: {} },
    blessboard: { scorecard: scorecardBlank(), routes: {}, assets: [], security: {} },
    redirects: [],
    hostnameRouting: null,
    hostnameRoutingPass: false,
    countsBefore: null,
    countsAfter: null,
    zeroWrite: null,
    knownGaps: [],
    blockers: [],
    p1: [],
    p2: [],
    verdict: null,
    nextAction: null,
  };

  const pool = new Pool(buildFoundationPoolConfig(requireDatabaseUrl(), { max: 3 }));

  try {
    const identity = await checkDatabaseIdentity(pool, { identityKey: EXPECTED_IDENTITY });
    report.dbIdentity = {
      ok: identity.ok === true,
      identity_key: identity.row && identity.row.identity_key,
      environment_code: identity.row && identity.row.environment_code,
    };
    if (
      !identity.ok ||
      String(identity.row.identity_key) !== EXPECTED_IDENTITY ||
      String(identity.row.environment_code).toLowerCase() !== "production"
    ) {
      report.blockers.push("DATABASE_IDENTITY_MISMATCH");
    }

    report.countsBefore = await readCustomerCounts(pool);
    report.knownGaps = await inspectKnownGaps(pool);

    // 1) Runtime health
    const acHealth = await fetchJson(`${AC_BASE}/healthz`);
    const bbHealth = await fetchJson(`${BB_BASE}/healthz`);
    const healthChecks = [];
    for (const [label, h] of [
      ["activeclinic.org", acHealth],
      ["blessboard.com", bbHealth],
    ]) {
      const j = h.json || {};
      const issues = [];
      if (h.status !== 200) issues.push(`HTTP ${h.status}`);
      if (!j || typeof j !== "object") issues.push("non-JSON");
      if (j.environment !== EXPECTED_ENV) issues.push(`environment=${j.environment}`);
      if (j.deploymentCode !== EXPECTED_DEPLOYMENT) issues.push(`deploymentCode=${j.deploymentCode}`);
      if (!shaMatches(EXPECTED_SHA_FULL, j.gitSha)) issues.push(`gitSha=${j.gitSha}`);
      if (j.schemaCompatible !== true) issues.push(`schemaCompatible=${j.schemaCompatible}`);
      if (j.expectedIdentityKey !== EXPECTED_IDENTITY) {
        issues.push(`expectedIdentityKey=${j.expectedIdentityKey}`);
      }
      if (j.expectedDatabaseEnvironment !== "production") {
        issues.push(`expectedDatabaseEnvironment=${j.expectedDatabaseEnvironment}`);
      }
      healthChecks.push({
        host: label,
        status: h.status,
        gitSha: j.gitSha || null,
        deploymentCode: j.deploymentCode || null,
        environment: j.environment || null,
        schemaCompatible: j.schemaCompatible,
        expectedIdentityKey: j.expectedIdentityKey || null,
        expectedDatabaseEnvironment: j.expectedDatabaseEnvironment || null,
        issues,
        pass: issues.length === 0,
      });
    }
    report.runtimeHealth = { checks: healthChecks };
    report.runtimeHealthPass = healthChecks.every((c) => c.pass);
    report.hostedShaAc = healthChecks[0].gitSha;
    report.hostedShaBb = healthChecks[1].gitSha;
    report.activeclinic.scorecard.runtime_health = healthChecks[0].pass ? "PASS" : "FAIL";
    report.blessboard.scorecard.runtime_health = healthChecks[1].pass ? "PASS" : "FAIL";
    if (!report.runtimeHealthPass) {
      report.blockers.push("PRODUCTION_RUNTIME_HEALTH_FAIL");
    }

    // 5) Redirects (before browser) + security headers sample
    for (const url of REDIRECT_URLS) {
      const chain = await followRedirects(url);
      const issues = [];
      if (chain.loop) issues.push("redirect_loop");
      if (/\.pronline\.org/i.test(JSON.stringify(chain.chain))) issues.push("pronline_redirect");
      const finalHost = (() => {
        try {
          return new URL(chain.finalUrl).hostname;
        } catch (_e) {
          return "";
        }
      })();
      if (/activeclinic/i.test(url) && /blessboard/i.test(finalHost)) issues.push("cross_product_redirect");
      if (/blessboard/i.test(url) && /activeclinic/i.test(finalHost)) issues.push("cross_product_redirect");
      if (/^http:\/\//i.test(url) && !/^https:\/\//i.test(chain.finalUrl) && chain.finalStatus === 200) {
        issues.push("https_not_enforced");
      }
      // www serves content (no redirect to apex) — record as gap note, not hard fail unless wrong product
      const isWww = /:\/\/www\./i.test(url);
      if (isWww && chain.hops === 0 && chain.finalStatus === 200) {
        chain.wwwApexCanonical = false;
      }
      report.redirects.push({ ...chain, issues, pass: issues.length === 0 && !chain.loop });
    }

    if (report.redirects.some((r) => r.wwwApexCanonical === false)) {
      report.p2.push({
        id: "www_no_apex_redirect",
        detail: "https://www.* serves 200 without redirecting to apex; product identity is correct on both hosts",
        classification: "NONBLOCKING_DEBT",
      });
    }

    // Assets
    report.activeclinic.assets = await checkAssets(AC_BASE, AC_STATIC);
    report.blessboard.assets = await checkAssets(BB_BASE, BB_STATIC);

    // Browser probes
    const browser = await chromium.launch({ headless: true });
    try {
      for (const product of [
        { key: "activeclinic", base: AC_BASE, routes: AC_ROUTES },
        { key: "blessboard", base: BB_BASE, routes: BB_ROUTES },
      ]) {
        const byVp = {};
        for (const vp of VIEWPORTS) {
          const ctx = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            userAgent:
              "Mozilla/5.0 (compatible; GetProProductionReadonlySmoke/1.0; +https://getproapp.org)",
          });
          const results = [];
          for (const route of product.routes) {
            results.push(await probePage(ctx, product.base, route, product.key));
          }
          // Collect cookies from last navigation context
          const allCookies = await ctx.cookies();
          const secIssues = cookieIssues(allCookies, product.base);
          // Sample response headers via fetch on home
          const homeHeaders = await fetchRaw(product.base + "/");
          const headerNotes = {
            csp: homeHeaders.headers["content-security-policy"] || null,
            setCookie: homeHeaders.headers["set-cookie"] || null,
            strictTransport: homeHeaders.headers["strict-transport-security"] || null,
            xPoweredBy: homeHeaders.headers["x-powered-by"] || null,
          };
          if (headerNotes.xPoweredBy) secIssues.push(`x-powered-by:${headerNotes.xPoweredBy}`);

          byVp[vp.label] = {
            results,
            failures: summarizeRouteFailures(results, product.key),
            consoleErrorCount: results.reduce((n, r) => n + (r.consoleErrors?.length || 0), 0),
            pageErrorCount: results.reduce((n, r) => n + (r.pageErrors?.length || 0), 0),
            failedRequestCount: results.reduce((n, r) => n + (r.failedRequests?.length || 0), 0),
            badStatusCount: results.reduce((n, r) => n + (r.badStatuses?.length || 0), 0),
            security: { cookies: allCookies.map((c) => ({
              name: c.name,
              domain: c.domain,
              secure: c.secure,
              httpOnly: c.httpOnly,
              sameSite: c.sameSite,
            })), issues: secIssues, headers: headerNotes },
          };
          await ctx.close();
        }
        report[product.key].routes = byVp;
      }
    } finally {
      await browser.close();
    }

    // Cross-product routing scorecard
    const acHome = report.activeclinic.routes.desktop?.results?.find((r) => r.path === "/");
    const bbHome = report.blessboard.routes.desktop?.results?.find((r) => r.path === "/");
    const routingIssues = [];
    if (!acHome || !acHome.identity?.hasAc) routingIssues.push("AC home missing ActiveClinic branding");
    if (acHome?.identity?.bbShell && !acHome?.identity?.acShell) routingIssues.push("AC home BlessBoard shell");
    if (!bbHome || !bbHome.identity?.hasBb) routingIssues.push("BB home missing BlessBoard branding");
    if (bbHome?.identity?.acShell && !bbHome?.identity?.bbShell) routingIssues.push("BB home ActiveClinic shell");
    if (acHome && !/activeclinic\.org/i.test(acHome.finalUrl)) routingIssues.push("AC final host wrong");
    if (bbHome && !/blessboard\.com/i.test(bbHome.finalUrl)) routingIssues.push("BB final host wrong");
    // Product-specific routes must not cross
    const acOnBb = report.blessboard.routes.desktop?.results?.find((r) => r.path === "/register-church");
    const bbReg = acOnBb;
    if (bbReg && bbReg.identity?.acShell && !bbReg.identity?.bbShell) {
      routingIssues.push("register-church served AC shell");
    }
    const acReg = report.activeclinic.routes.desktop?.results?.find((r) => r.path === "/register-clinic");
    if (acReg && acReg.identity?.bbShell && !acReg.identity?.acShell) {
      routingIssues.push("register-clinic served BB shell");
    }
    // Login titles
    const acLogin = report.activeclinic.routes.desktop?.results?.find((r) => r.path === "/login");
    const bbLogin = report.blessboard.routes.desktop?.results?.find((r) => r.path === "/login");
    if (acLogin && !/ActiveClinic/i.test(acLogin.title || "")) routingIssues.push("AC login title");
    if (bbLogin && !/BlessBoard/i.test(bbLogin.title || "")) routingIssues.push("BB login title");

    report.hostnameRouting = { issues: routingIssues, acTitle: acHome?.title, bbTitle: bbHome?.title };
    report.hostnameRoutingPass = routingIssues.length === 0;

    // Scorecards
    for (const product of ["activeclinic", "blessboard"]) {
      const sc = report[product].scorecard;
      const desk = report[product].routes.desktop;
      const mob = report[product].routes["mobile-390"];
      sc.routes_tested = (desk?.results?.length || 0) + (mob?.results?.length || 0);
      sc.desktop = desk && desk.failures.length === 0 ? "PASS" : "FAIL";
      sc.mobile_390 = mob && mob.failures.length === 0 ? "PASS" : "FAIL";
      sc.routing = report.hostnameRoutingPass ? "PASS" : "FAIL";
      const assetsOk = (report[product].assets || []).every((a) => a.ok);
      sc.assets = assetsOk ? "PASS" : "FAIL";
      const consoleBad = (desk?.results || [])
        .concat(mob?.results || [])
        .reduce((n, r) => {
          const expectedDocFail =
            (product === "activeclinic" && r.path === "/book" && r.status === 404) ||
            (product === "blessboard" && r.path === "/find-a-church" && r.status >= 500);
          const ce = (r.consoleErrors || []).filter((msg) => {
            if (expectedDocFail && /status of (404|503)/i.test(msg)) return false;
            return true;
          });
          return n + ce.length + (r.pageErrors?.length || 0);
        }, 0);
      sc.console_errors = consoleBad === 0 ? "PASS" : "FAIL";
      const failReq = (desk?.failedRequestCount || 0) + (mob?.failedRequestCount || 0) +
        (desk?.badStatusCount || 0) + (mob?.badStatusCount || 0);
      // Page-level 404 for intentional missing routes still counted in badStatuses for document —
      // filter document navigations already recorded in route status; resource failures only.
      const resourceFails =
        (desk?.results || []).reduce((n, r) => n + (r.failedRequests?.length || 0) + (r.badStatuses || []).filter((b) => b.resourceType !== "document").length, 0) +
        (mob?.results || []).reduce((n, r) => n + (r.failedRequests?.length || 0) + (r.badStatuses || []).filter((b) => b.resourceType !== "document").length, 0);
      sc.failed_requests = resourceFails === 0 ? "PASS" : "FAIL";
      // silence unused
      void failReq;
      const secIssues = [
        ...(desk?.security?.issues || []),
        ...(mob?.security?.issues || []),
      ];
      sc.security_cookies = secIssues.length === 0 ? "PASS" : "FAIL";
      report[product].security = { desktop: desk?.security, mobile: mob?.security };

      // Known expected soft failures to classify as gaps not hard fail:
      // AC /book 404 (no apex book route), BB /find-a-church 503 (V5 stub)
    }

    // Annotate known route gaps
    const acBook = report.activeclinic.routes.desktop?.results?.find((r) => r.path === "/book");
    const bbFind = report.blessboard.routes.desktop?.results?.find((r) => r.path === "/find-a-church");
    if (acBook && acBook.status === 404) {
      report.p1.push({
        id: "ac_apex_book_404",
        detail: "GET /book returns 404; booking is tenant-scoped at /clinics/:clinicKey/book and no published clinic exists yet",
      });
    }
    if (bbFind && bbFind.status >= 500) {
      report.p2.push({
        id: "bb_find_a_church_503",
        detail: "GET /find-a-church returns 503 'not yet available in BlessBoard V5'; canonical directory is /directory (200)",
      });
    }

    // Soften scorecards: remove expected known gaps from desktop/mobile failures for overall product pass
    function softFailFilter(product, failures) {
      return (failures || []).filter((f) => {
        if (product === "activeclinic" && f.startsWith("/book:")) return false;
        if (product === "blessboard" && f.startsWith("/find-a-church:")) return false;
        return true;
      });
    }
    for (const product of ["activeclinic", "blessboard"]) {
      const desk = report[product].routes.desktop;
      const mob = report[product].routes["mobile-390"];
      const deskSoft = softFailFilter(product, desk?.failures);
      const mobSoft = softFailFilter(product, mob?.failures);
      report[product].routes.desktopSoftFailures = deskSoft;
      report[product].routes.mobileSoftFailures = mobSoft;
      report[product].scorecard.desktop = deskSoft.length === 0 ? "PASS" : "FAIL";
      report[product].scorecard.mobile_390 = mobSoft.length === 0 ? "PASS" : "FAIL";
    }

    // Zero-write confirmation
    report.countsAfter = await readCustomerCounts(pool);
    const deltas = {};
    let zeroOk = true;
    for (const key of Object.keys(report.countsBefore)) {
      const before = report.countsBefore[key];
      const after = report.countsAfter[key];
      if (typeof before === "number" && typeof after === "number") {
        deltas[key] = after - before;
        if (deltas[key] !== 0) zeroOk = false;
      } else if (before && typeof before === "object" && before.note) {
        deltas[key] = { before, after };
      } else {
        deltas[key] = { before, after };
        if (JSON.stringify(before) !== JSON.stringify(after)) zeroOk = false;
      }
    }
    report.zeroWrite = {
      deltas,
      confirmed: zeroOk,
      label: zeroOk ? "READONLY_SMOKE_ZERO_CUSTOMER_WRITES_CONFIRMED" : "READONLY_SMOKE_ZERO_CUSTOMER_WRITES_FAILED",
    };
    if (!zeroOk) report.blockers.push("CUSTOMER_WRITE_DETECTED");

    // Classify gap rows into scorecard note
    for (const g of report.knownGaps) {
      if (g.classification === "BLOCKER") report.blockers.push(g.id);
      else if (g.classification === "FIX_BEFORE_PUBLIC_RELEASE") report.p1.push(g);
      else if (g.classification === "NONBLOCKING_DEBT") report.p2.push(g);
    }

    // Redirect pass?
    const redirectFail = report.redirects.filter((r) => !r.pass);
    if (redirectFail.length) {
      report.p1.push({
        id: "redirect_issues",
        detail: redirectFail.map((r) => ({ start: r.startUrl, issues: r.issues, chain: r.chain })),
      });
    }

    // Overall product scorecards
    for (const product of ["activeclinic", "blessboard"]) {
      const sc = report[product].scorecard;
      const hard =
        sc.runtime_health === "FAIL" ||
        sc.desktop === "FAIL" ||
        sc.mobile_390 === "FAIL" ||
        sc.routing === "FAIL" ||
        sc.assets === "FAIL" ||
        sc.console_errors === "FAIL" ||
        sc.failed_requests === "FAIL" ||
        sc.security_cookies === "FAIL";
      sc.overall = hard ? "FAIL" : "PASS";
    }

    const hardBlockers = report.blockers.filter((b) => b !== "PRODUCTION_RUNTIME_HEALTH_FAIL" || !report.runtimeHealthPass);
    const anyProductFail =
      report.activeclinic.scorecard.overall === "FAIL" || report.blessboard.scorecard.overall === "FAIL";
    const hasGaps = report.p1.length > 0 || report.p2.length > 0 || !!acBook?.status || !!bbFind;

    if (!report.runtimeHealthPass || !report.zeroWrite.confirmed || hardBlockers.includes("DATABASE_IDENTITY_MISMATCH") || hardBlockers.includes("CUSTOMER_WRITE_DETECTED")) {
      report.verdict = "PRODUCTION_AUTOMATED_SMOKE_FAILED";
      report.nextAction = "Fix blockers listed in F, redeploy if SHA/runtime mismatch, then re-run this read-only smoke.";
    } else if (anyProductFail || redirectFail.length || !report.hostnameRoutingPass) {
      report.verdict = "PRODUCTION_AUTOMATED_SMOKE_FAILED";
      report.nextAction = "Fix route/routing/asset/console failures in scorecards, then re-run this read-only smoke.";
    } else if (hasGaps) {
      report.verdict = "PRODUCTION_AUTOMATED_SMOKE_PASS_WITH_GAPS";
      report.nextAction =
        "Run controlled production write QA using one dedicated ActiveClinic production QA organization and one dedicated BlessBoard production QA organization.";
    } else {
      report.verdict = "PRODUCTION_AUTOMATED_SMOKE_PASS";
      report.nextAction =
        "Run controlled production write QA using one dedicated ActiveClinic production QA organization and one dedicated BlessBoard production QA organization.";
    }

    report.finishedAt = new Date().toISOString();
    report.labels = {
      runtime: report.runtimeHealthPass ? "PRODUCTION_RUNTIME_HEALTH_PASS" : "PRODUCTION_RUNTIME_HEALTH_FAIL",
      routing: report.hostnameRoutingPass ? "PRODUCTION_HOSTNAME_ROUTING_PASS" : "PRODUCTION_HOSTNAME_ROUTING_FAIL",
      zeroWrite: report.zeroWrite.label,
      verdict: report.verdict,
    };

    console.log(JSON.stringify(report, null, 2));
    process.exit(report.verdict === "PRODUCTION_AUTOMATED_SMOKE_FAILED" ? 4 : 0);
  } catch (err) {
    console.error(JSON.stringify({
      verdict: "PRODUCTION_AUTOMATED_SMOKE_FAILED",
      error: err && err.message ? err.message : String(err),
      stack: err && err.stack ? err.stack.split("\n").slice(0, 8) : null,
    }, null, 2));
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
}

main();
