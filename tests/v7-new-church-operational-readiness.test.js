"use strict";

/**
 * BlessBoard V7 — operational readiness immediately after church registration.
 * Provisions a disposable church on isolated foundation Postgres, then audits
 * HQ dashboard / website / members / staff / branches / roles / settings /
 * plan / public site / editor / publish / history / restore as the registering
 * church HQ administrator.
 * Does not invent members or church operational data. Does not deploy.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  submitChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationService");
const {
  validatePlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  PRODUCT_CODE,
  buildPublicOrganizationWebsitePath,
  buildPublicWebsiteEditPath,
} = require("../src/platform/website/publicWebsiteUrl");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "ChurchReadyPass12!";
const BB_HOST = "blessboard.org";
const MINIMAL_BB = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
});

const EXPECTED_NAV_KEYS = Object.freeze([
  "home",
  "branches",
  "registrations",
  "members",
  "member-journey",
  "staff-access",
  "roles",
  "settings",
  "content",
  "broadcasts",
  "announcements",
  "participation",
  "attendance",
  "giving",
  "resources",
  "forms",
  "requests",
  "reports",
  "audit",
  "account",
]);

const OPERATIONAL_PATHS = Object.freeze([
  "/hq",
  "/hq/website",
  "/hq/content",
  "/hq/members",
  "/hq/settings/staff-access",
  "/hq/branches",
  "/hq/roles",
  "/hq/settings",
  "/hq/website/publish/review",
  "/hq/website/version-history",
  "/hq/website/publishing-history",
  "/hq/account",
  "/hq/registrations",
  "/hq/reports",
]);

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 950000000;
let ipSeq = 80;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function churchBody(overrides) {
  stamp += 1;
  const key = `readybb${stamp}${crypto.randomBytes(3).toString("hex")}`;
  return {
    church_name: `Ready Church ${stamp} ${key}`,
    country: "Zambia",
    city: "Lusaka",
    contact_name: "Church Administrator",
    role_in_church: "Pastor",
    phone: nextPhone(),
    email: `${key}@example.org`,
    selected_plan: "foundation",
    organization_key: key,
    password: PASSWORD,
    password_confirm: PASSWORD,
    branch_name: "HQ Campus",
    consent_contact: "on",
    ...overrides,
  };
}

function fakeReq() {
  ipSeq += 1;
  return {
    ip: `203.0.113.${ipSeq % 250}`,
    requestId: `bb-ready-${Date.now()}-${ipSeq}`,
    get: () => "bb-ready-test-agent",
  };
}

async function submitChurch(body) {
  const validation = validatePlatformChurchRegistration(body, { instantFreeEnabled: true });
  assert.equal(validation.ok, true, JSON.stringify(validation));
  return submitChurchRegistration(pool, fakeReq(), validation, {
    env: { PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging" },
    dataEnvironment: "testing",
    deploymentCode: "blessboard-org-staging",
  });
}

function attrValues(html, attr) {
  const re = new RegExp(`${attr}="([^"]*)"`, "g");
  const values = [];
  let match = re.exec(html);
  while (match) {
    values.push(match[1]);
    match = re.exec(html);
  }
  return values;
}

function hrefsForAttr(html, attr) {
  const re = new RegExp(
    `${attr}="([^"]*)"[^>]*href="([^"]*)"|href="([^"]*)"[^>]*${attr}="([^"]*)"`,
    "g"
  );
  const found = [];
  let match = re.exec(html);
  while (match) {
    const key = match[1] || match[4];
    const href = match[2] || match[3];
    found.push({ key, href });
    match = re.exec(html);
  }
  return found;
}

function assertWorkingHref(href, context) {
  assert.ok(href, `missing href for ${context}`);
  assert.notEqual(href, "#", `dead href # for ${context}`);
  assert.notEqual(href.trim(), "", `empty href for ${context}`);
  assert.match(href, /^\//, `non-app href for ${context}: ${href}`);
}

async function getNoFollow(app, cookie, path) {
  return request(app)
    .get(path)
    .set("Host", BB_HOST)
    .set("Cookie", cookie)
    .redirects(0);
}

async function getPage(app, cookie, path, options) {
  const allowOnboarding = options && options.allowOnboarding === true;
  const chain = [path];
  let res = await getNoFollow(app, cookie, path);
  for (let i = 0; i < 6 && res.status === 303; i += 1) {
    const loc = String(res.headers.location || "");
    assert.ok(loc, `redirect from ${chain[chain.length - 1]} missing Location`);
    const nextPath = loc.startsWith("http")
      ? `${new URL(loc).pathname}${new URL(loc).search}`
      : loc;
    chain.push(nextPath);
    if (!allowOnboarding && nextPath.includes("/hq/onboarding")) {
      assert.fail(`unexpected onboarding redirect for ${path} via ${chain.join(" -> ")}`);
    }
    res = await getNoFollow(app, cookie, nextPath);
  }
  return { res, chain };
}

describe("v7 new church operational readiness", () => {
  before(async () => {
    try {
      process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-org-staging";
      process.env.DEPLOYMENT_ENV = "testing";
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no foundation db";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("brand-new church HQ admin can open every provisioned surface without 403/404/500", async () => {
    if (!requireDb()) return;
    const body = churchBody();
    const result = await submitChurch(body);
    assert.equal(result.ok, true, JSON.stringify(result));
    const organizationId = result.records.organizationId;
    const organizationKey = result.records.organizationKey || body.organization_key;
    const churchId = result.records.churchId || (result.records.church && result.records.church.id);
    const adminUserId = result.records.administratorUserId;
    const branchId = result.records.branchId || (result.records.hqBranch && result.records.hqBranch.id);
    assert.ok(organizationId);
    assert.ok(organizationKey);
    assert.ok(churchId);
    assert.ok(adminUserId);

    const roles = await pool.query(
      `SELECT role_key FROM blessboard.user_roles
        WHERE user_id = $1 AND organization_id = $2 AND status = 'active'`,
      [adminUserId, organizationId]
    );
    const roleKeys = roles.rows.map((row) => row.role_key);
    assert.ok(roleKeys.includes("church_hq_admin"));

    const settings = await pool.query(
      `SELECT public_name, website_status, primary_email, default_timezone, default_country_code
         FROM blessboard.church_settings WHERE church_id = $1`,
      [churchId]
    );
    assert.equal(settings.rowCount, 1);
    assert.ok(String(settings.rows[0].public_name || "").trim(), "missing church public name");
    assert.ok(String(settings.rows[0].primary_email || "").trim(), "missing church contact email");
    assert.equal(settings.rows[0].default_timezone, "Africa/Lusaka");
    assert.equal(String(settings.rows[0].default_country_code || "").toUpperCase(), "ZM");
    assert.equal(settings.rows[0].website_status, "draft");

    const hq = await pool.query(
      `SELECT id, branch_key, is_primary, status, country_code, timezone
         FROM blessboard.branches WHERE church_id = $1`,
      [churchId]
    );
    assert.equal(hq.rowCount, 1);
    assert.equal(hq.rows[0].is_primary, true);
    assert.equal(hq.rows[0].status, "active");
    assert.equal(hq.rows[0].country_code, "ZM");
    assert.equal(hq.rows[0].timezone, "Africa/Lusaka");

    const subscription = await pool.query(
      `SELECT os.status, p.plan_key, p.display_name
         FROM platform.organization_subscriptions os
         JOIN platform.plans p ON p.id = os.plan_id
        WHERE os.organization_id = $1`,
      [organizationId]
    );
    assert.equal(subscription.rowCount, 1);
    assert.ok(String(subscription.rows[0].plan_key || "").trim(), "missing plan");
    assert.equal(subscription.rows[0].status, "active");

    const members = await pool.query(
      `SELECT count(*)::int AS n FROM blessboard.members WHERE church_id = $1`,
      [churchId]
    );
    assert.equal(members.rows[0].n, 0, "registration must not invent congregation members");

    const app = createV5FoundationApp({
      getPool: () => pool,
      env: MINIMAL_BB,
      apexHosts: new Set([BB_HOST, `www.${BB_HOST}`]),
    });
    const session = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: adminUserId,
      organizationId,
      churchId,
      branchId: branchId || hq.rows[0].id,
    });
    assert.equal(session.ok, true, session.message || session.code);
    const cookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;

    const home = await getPage(app, cookie, "/hq");
    assert.equal(home.res.status, 200, home.res.text && home.res.text.slice(0, 240));
    assert.match(home.res.text, /data-bb-shell="hq-admin"/);
    assert.match(home.res.text, /data-bb-hq-dashboard="1"/);
    assert.doesNotMatch(home.res.text, /data-bb-console-onboarding="onboarding_required"/);
    assert.match(home.res.text, /data-bb-quick-action="members"/);
    assert.match(home.res.text, /data-bb-quick-action="website"/);
    assert.match(home.res.text, /data-bb-quick-action="staff-access"/);
    assert.match(home.res.text, /data-bb-console-link="plan"/);

    const navKeys = attrValues(home.res.text, "data-bb-nav-key");
    for (const key of EXPECTED_NAV_KEYS) {
      assert.ok(navKeys.includes(key), `nav missing ${key}: ${navKeys.join(",")}`);
    }
    assert.ok(!navKeys.includes("executive"), "Foundation HQ must not see Network executive reports");
    assert.ok(!navKeys.includes("governance"), "Foundation HQ must not see Network governance");

    const navHrefs = hrefsForAttr(home.res.text, "data-bb-nav-key");
    for (const item of navHrefs) {
      assertWorkingHref(item.href, `nav:${item.key}`);
    }

    const quickHrefs = hrefsForAttr(home.res.text, "data-bb-quick-action");
    const quickKeys = quickHrefs.map((row) => row.key);
    for (const key of ["members", "website", "staff-access", "settings", "branches"]) {
      assert.ok(quickKeys.includes(key), `dashboard missing quick action ${key}: ${quickKeys.join(",")}`);
    }
    for (const item of quickHrefs) {
      assertWorkingHref(item.href, `quick:${item.key}`);
    }

    const consoleLinks = hrefsForAttr(home.res.text, "data-bb-console-link");
    for (const link of consoleLinks) {
      assertWorkingHref(link.href, `console:${link.key}`);
    }

    const destinations = new Map();
    function remember(href) {
      const raw = String(href || "").split("#")[0];
      if (!raw || !raw.startsWith("/hq")) return;
      destinations.set(raw.split("?")[0], raw);
    }
    remember("/hq");
    for (const item of navHrefs) remember(item.href);
    for (const item of quickHrefs) remember(item.href);
    for (const link of consoleLinks) remember(link.href);
    for (const path of OPERATIONAL_PATHS) remember(path);

    for (const [path, href] of destinations) {
      const loaded = await getPage(app, cookie, href);
      assert.notEqual(loaded.res.status, 403, `${path} returned 403`);
      assert.notEqual(loaded.res.status, 404, `${path} returned 404`);
      assert.notEqual(
        loaded.res.status,
        500,
        `${path} returned 500: ${(loaded.res.text || "").slice(0, 240)}`
      );
      assert.equal(
        loaded.res.status,
        200,
        `${path} expected 200, got ${loaded.res.status} via ${loaded.chain.join(" -> ")}`
      );
      assert.doesNotMatch(
        loaded.res.text || "",
        /data-bb-phase4-advanced-website-feature-locked="1"/,
        `${path} rendered a Network lock screen`
      );
    }

    const membersPage = await getPage(app, cookie, "/hq/members");
    assert.equal(membersPage.res.status, 200);
    assert.match(membersPage.res.text, /data-bb-member-total="0"|data-bb-member-empty="catalog"/);
    assert.doesNotMatch(membersPage.res.text, /data-bb-member-row="1"/);

    const staff = await getPage(app, cookie, "/hq/settings/staff-access");
    assert.equal(staff.res.status, 200);
    assert.match(staff.res.text, /data-bb-staff-access="1"/);
    assert.match(staff.res.text, /href="\/hq\/settings\/staff-access\/invite/);

    const settingsPage = await getPage(app, cookie, "/hq/settings");
    assert.equal(settingsPage.res.status, 200);
    assert.match(settingsPage.res.text, /data-bb-hq-current-plan="1"/);
    assert.match(settingsPage.res.text, /data-bb-hq-subscription="1"/);
    assert.match(settingsPage.res.text, /href="\/hq\/website"/);
    assert.match(settingsPage.res.text, /href="\/hq\/content"/);
    const planBlock = settingsPage.res.text.match(
      /data-bb-hq-current-plan="1"[\s\S]*?<dd>([^<]+)<\/dd>/
    );
    assert.ok(planBlock && String(planBlock[1]).trim() && planBlock[1].trim() !== "—", "settings missing current plan");
    const subBlock = settingsPage.res.text.match(
      /data-bb-hq-subscription="1"[\s\S]*?<dd>([^<]+)<\/dd>/
    );
    assert.ok(subBlock && /active/i.test(subBlock[1]), `settings missing subscription status: ${subBlock && subBlock[1]}`);

    const website = await getPage(app, cookie, "/hq/website");
    assert.equal(website.res.status, 200);
    assert.match(website.res.text, /data-bb-hq-website="1"|data-bb-website-settings-ux="1"/);
    assert.match(website.res.text, /data-bb-website-action="history"|href="\/hq\/website\/version-history"/);
    assert.match(website.res.text, /href="\/hq\/website\/publish\/review"|data-bb-website-action="publish"/);
    assert.match(website.res.text, /data-bb-edit-website="1"|href="\/hq\/content"/);

    const editor = await getPage(app, cookie, "/hq/content");
    assert.equal(editor.res.status, 200, editor.res.text && editor.res.text.slice(0, 240));

    const history = await getPage(app, cookie, "/hq/website/version-history");
    assert.equal(history.res.status, 200);
    assert.match(history.res.text, /data-bb-phase3-website-version-history="1"/);
    assert.doesNotMatch(history.res.text, /data-bb-phase4-advanced-website-feature-locked="1"/);
    const restoreHref = (history.res.text.match(/href="(\/hq\/website\/version-history\/[^"]+\/restore)"/) || [])[1];
    assert.ok(restoreHref, "version history has no restore action after initial publish");
    const restore = await getPage(app, cookie, restoreHref);
    assert.equal(restore.res.status, 200, restore.res.text && restore.res.text.slice(0, 240));
    assert.match(restore.res.text, /data-bb-phase3-restore-website-version="1"/);

    const publicPath = buildPublicOrganizationWebsitePath({
      product: PRODUCT_CODE.BLESSBOARD,
      organizationKey,
    });
    assert.equal(publicPath, `/c/${organizationKey}`);
    const publicSite = await request(app).get(publicPath).set("Host", BB_HOST);
    assert.equal(publicSite.status, 200, publicSite.text && publicSite.text.slice(0, 240));
    assert.match(publicSite.text, /data-bb-shell="tenant-public"/);

    const editPath = buildPublicWebsiteEditPath({
      product: PRODUCT_CODE.BLESSBOARD,
      organizationKey,
    });
    const publicEditor = await request(app)
      .get(editPath)
      .set("Host", BB_HOST)
      .set("Cookie", cookie);
    assert.equal(publicEditor.status, 200, publicEditor.text && publicEditor.text.slice(0, 400));
    assert.match(publicEditor.text, /data-bb-inline-start="1"/);
  });
});
