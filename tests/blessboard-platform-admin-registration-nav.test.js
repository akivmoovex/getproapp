"use strict";

/**
 * Phase2 Batch 1 — Platform Admin Registration Applications navigation alignment.
 * Focused: single nav item, href, active state on list/detail, no duplicates, auth gate.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { describe, it, before, after } = require("node:test");
const request = require("supertest");

const {
  PLATFORM_ADMIN_NAV,
  PLATFORM_ADMIN_MOBILE_TABS,
} = require("../src/platform/http/platformAdminNav");
const { buildPlatformAdminShellLocals } = require("../src/platform/http/platformAdminShellLocals");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { provisionRegisteredBlessBoardChurch } = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "off",
    ...overrides,
  };
}

function countLabelInNavSection(html, sectionAttr, label) {
  const sectionRe = new RegExp(`${sectionAttr}[\\s\\S]*?<\\/(?:nav|div)>`, "i");
  const section = html.match(sectionRe);
  if (!section) return 0;
  const re = new RegExp(`>\\s*${label}\\s*<`, "g");
  return (section[0].match(re) || []).length;
}

function activeRegistrationLink(html, sectionAttr) {
  const sectionRe = new RegExp(`${sectionAttr}[\\s\\S]*?<\\/(?:nav|div)>`, "i");
  const section = html.match(sectionRe);
  assert.ok(section, `missing nav section ${sectionAttr}`);
  const linkRe =
    /<a[^>]*href="\/admin\/registration-applications"[^>]*>[\s\S]*?Registration Applications[\s\S]*?<\/a>/i;
  const link = section[0].match(linkRe);
  assert.ok(link, "Registration Applications link missing in section");
  return link[0];
}

describe("platform-admin registration nav config", () => {
  it("defines exactly one Registration Applications nav item after Organizations", () => {
    const regItems = PLATFORM_ADMIN_NAV.filter(
      (item) => item.key === "registration-applications"
    );
    assert.equal(regItems.length, 1);
    assert.equal(regItems[0].label, "Registration Applications");
    assert.equal(regItems[0].href, "/admin/registration-applications");
    assert.equal(regItems[0].icon, "app_registration");
    assert.equal(regItems[0].nav, true);
    assert.equal(regItems[0].enabled, true);

    const orgIdx = PLATFORM_ADMIN_NAV.findIndex((i) => i.key === "organizations");
    const regIdx = PLATFORM_ADMIN_NAV.findIndex(
      (i) => i.key === "registration-applications"
    );
    assert.ok(orgIdx >= 0);
    assert.equal(regIdx, orgIdx + 1);
  });

  it("includes registration in mobile tab keys without duplicating", () => {
    const hits = PLATFORM_ADMIN_MOBILE_TABS.filter(
      (k) => k === "registration-applications"
    );
    assert.equal(hits.length, 1);
    const orgIdx = PLATFORM_ADMIN_MOBILE_TABS.indexOf("organizations");
    const regIdx = PLATFORM_ADMIN_MOBILE_TABS.indexOf("registration-applications");
    assert.equal(regIdx, orgIdx + 1);
  });

  it("shell locals expose a single registration nav item and mobile tab", () => {
    const res = {
      cookie() {},
      setHeader() {},
    };
    const req = { platformAdminContext: { roleLabel: "Platform admin" } };
    const locals = buildPlatformAdminShellLocals(req, res, {
      env: baseEnv({ DEPLOYMENT_ENV: "testing" }),
      isProduction: false,
      activeNav: "registration-applications",
    });
    const navHits = locals.navItems.filter(
      (i) => i.key === "registration-applications"
    );
    assert.equal(navHits.length, 1);
    assert.equal(navHits[0].href, "/admin/registration-applications");
    const tabHits = locals.mobileTabs.filter(
      (i) => i && i.key === "registration-applications"
    );
    assert.equal(tabHits.length, 1);
    assert.equal(locals.activeNav, "registration-applications");
  });

  it("shell fallback markup includes Registration Applications once", () => {
    const start = fs.readFileSync(
      path.join(__dirname, "../views/blessboard/v5/partials/platform-admin-shell-start.ejs"),
      "utf8"
    );
    const fallbackHits = start.match(/key:\s*'registration-applications'/g);
    assert.equal((fallbackHits || []).length, 1);
    assert.match(start, /href: '\/admin\/registration-applications'/);
    assert.match(start, /activeNav === item\.key/);
  });

  it("preserves core Platform Admin nav keys", () => {
    const keys = PLATFORM_ADMIN_NAV.map((i) => i.key);
    for (const required of [
      "home",
      "organizations",
      "registration-applications",
      "plans",
      "subscriptions",
      "domains",
      "deployments",
      "settings",
      "account",
    ]) {
      assert.ok(keys.includes(required), `missing ${required}`);
    }
  });

  it("list and detail routes set activeNav registration-applications", () => {
    const routes = fs.readFileSync(
      path.join(__dirname, "../src/platform/http/platformAdminRoutes.js"),
      "utf8"
    );
    const listBlock = routes.match(
      /\/admin\/registration-applications"[\s\S]*?shellLocals\(req, res, "([^"]+)"/
    );
    assert.ok(listBlock, "list route shellLocals missing");
    assert.equal(listBlock[1], "registration-applications");

    const detailBlock = routes.match(
      /\/admin\/registration-applications\/:id"[\s\S]*?shellLocals\(req, res, "([^"]+)"/
    );
    assert.ok(detailBlock, "detail route shellLocals missing");
    assert.equal(detailBlock[1], "registration-applications");
  });
});

describe("platform-admin registration nav HTTP", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let users = {};
  let fixtures = {};

  function requireDb(t) {
    if (skipSuite) {
      t.skip(`Local PostgreSQL unavailable: ${skipReason}`);
      return false;
    }
    return true;
  }

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      async function makeUser(email, displayName) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      users.platform = await makeUser("reg-nav-pa@example.org", "Reg Nav Platform Admin");
      users.hq = await makeUser("reg-nav-hq@example.org", "Reg Nav HQ Admin");
      users.member = await makeUser("reg-nav-member@example.org", "Reg Nav Member");

      const key = uniq("regnav");
      const application = await appRepo.createApplication(pool, {
        church_name: `Reg Nav Church ${key}`,
        country: "Kenya",
        city: "Nairobi",
        contact_name: "Reg Nav Contact",
        contact_email: `${key}@example.org`,
        contact_phone: "+254700111333",
        role_in_church: "Administrator",
        selected_plan: "foundation",
        consent_terms: true,
      });
      const provisioned = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: application.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: key,
        requestId: "reg-nav-fixture",
        actorContext: {
          type: "test",
          source: "phase2-nav",
          dataEnvironment: "testing",
          deploymentCode: "blessboard-org-v5",
        },
      });
      assert.equal(provisioned.ok, true, provisioned.message);
      fixtures.organizationKey = provisioned.records.organizationKey;
      fixtures.organizationId = provisioned.records.organizationId;

      fixtures.submittedApp = await appRepo.createApplication(pool, {
        church_name: "Nav Alignment Enquiry Church",
        country: "Zambia",
        city: "Lusaka",
        contact_name: "Nav Contact",
        contact_email: "nav-alignment@example.com",
        contact_phone: "+260971000222",
        role_in_church: "Pastor",
        selected_plan: "foundation",
        consent_terms: true,
      });

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "reg-nav-pa@example.org",
            organizationKey: fixtures.organizationKey,
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "reg-nav-hq@example.org",
            organizationKey: fixtures.organizationKey,
            roleKey: "church_hq_admin",
            churchKey: fixtures.organizationKey,
          })
        ).ok,
        true
      );

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  async function cookieFor(user) {
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-v5",
      userId: user.id,
      organizationId: fixtures.organizationId || null,
      churchId: null,
      branchId: null,
    });
    assert.equal(created.ok, true, created.code);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  it("platform admin sees Registration Applications in desktop and mobile nav", async (t) => {
    if (!requireDb(t)) return;
    const cookie = await cookieFor(users.platform);
    const res = await request(app)
      .get("/admin/registration-applications")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(res.status, 200);

    assert.equal(
      countLabelInNavSection(res.text, 'data-bb-nav="desktop"', "Registration Applications"),
      1
    );
    assert.equal(
      countLabelInNavSection(res.text, 'data-bb-nav="mobile-links"', "Registration Applications"),
      1
    );

    assert.match(res.text, /href="\/admin\/registration-applications"/);
    assert.match(res.text, /href="\/admin\/organizations"/);
    assert.match(res.text, /href="\/admin\/plans"/);
    assert.match(res.text, /href="\/admin\/account"/);
  });

  it("Registration Applications is active on the list route", async (t) => {
    if (!requireDb(t)) return;
    const cookie = await cookieFor(users.platform);
    const res = await request(app)
      .get("/admin/registration-applications")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-page="registration-applications"/);

    for (const section of ['data-bb-nav="desktop"', 'data-bb-nav="mobile-links"']) {
      const link = activeRegistrationLink(res.text, section);
      assert.match(link, /is-active/);
      assert.match(link, /aria-current="page"/);
    }
  });

  it("Registration Applications is active on the application detail route", async (t) => {
    if (!requireDb(t)) return;
    assert.ok(fixtures.submittedApp && fixtures.submittedApp.id);
    const cookie = await cookieFor(users.platform);
    const res = await request(app)
      .get(`/admin/registration-applications/${fixtures.submittedApp.id}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-page="registration-applications"/);
    assert.match(res.text, /data-bb-pa-registration-application-detail="1"/);

    for (const section of ['data-bb-nav="desktop"', 'data-bb-nav="mobile-links"']) {
      const link = activeRegistrationLink(res.text, section);
      assert.match(link, /is-active/);
      assert.match(link, /aria-current="page"/);
    }
  });

  it("unauthorized users do not gain Platform Admin registration access", async (t) => {
    if (!requireDb(t)) return;
    const loggedOut = await request(app)
      .get("/admin/registration-applications")
      .set("Host", "blessboard.org")
      .set("Accept", "text/html");
    assert.equal(loggedOut.status, 303);
    assert.match(loggedOut.headers.location || "", /\/login/);

    const hqCookie = await cookieFor(users.hq);
    const hq = await request(app)
      .get("/admin/registration-applications")
      .set("Host", "blessboard.org")
      .set("Cookie", hqCookie);
    assert.equal(hq.status, 403);

    const memberCookie = await cookieFor(users.member);
    const member = await request(app)
      .get("/admin/registration-applications")
      .set("Host", "blessboard.org")
      .set("Cookie", memberCookie);
    assert.equal(member.status, 403);
  });
});
