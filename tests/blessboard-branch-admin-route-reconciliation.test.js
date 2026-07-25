"use strict";

/**
 * Classic /branch-admin dashboard + module reconciliation (V5 Foundation).
 * Phase 6 /branch/* is a separate church vertical — must not be the apex redirect target.
 */

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { describe, it, before, after } = require("node:test");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { createV5Session } = require("../src/platform/session/createV5Session");
const {
  BRANCH_ADMIN_NAV,
  BRANCH_ADMIN_MODULES,
} = require("../src/blessboard/http/branchAdminNav");
const { buildBranchMobileNav } = require("../src/blessboard/http/adminMobileNavGroups");

const DEPLOYMENT = "blessboard-org-v5";
const PASSWORD = "TestPassword99!";
const APEX = "blessboard.org";
const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: DEPLOYMENT,
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    ...overrides,
  };
}

const MODULE_PATHS = [
  "/branch-admin/registrations",
  "/branch-admin/members",
  "/branch-admin/announcements",
  "/branch-admin/attendance",
  "/branch-admin/giving",
  "/branch-admin/participation",
  "/branch-admin/resources",
  "/branch-admin/forms",
  "/branch-admin/requests",
];

describe("branch-admin route reconciliation (static contracts)", () => {
  it("dashboard Quick Actions point only to live /branch-admin destinations", () => {
    const dash = read("views/blessboard/v5/branch-admin/dashboard.ejs");
    assert.match(dash, /href: '\/branch-admin\/members'/);
    assert.match(dash, /href: '\/branch-admin\/giving'/);
    assert.match(dash, /href: '\/branch-admin\/announcements'/);
    assert.match(dash, /href: '\/branch-admin\/attendance'/);
    assert.match(dash, /href: '\/branch-admin\/registrations'/);
    assert.doesNotMatch(dash, /href: '\/branch\/(members|giving-summary|announcements|attendance)'/);
    assert.doesNotMatch(dash, /\/branch-admin\/reports/);
  });

  it("nav and modules keep Reports non-clickable and do not invent Phase 6 URLs", () => {
    const reportsNav = BRANCH_ADMIN_NAV.find((i) => i.key === "reports");
    assert.equal(reportsNav, undefined);
    const reportsMod = BRANCH_ADMIN_MODULES.find((i) => i.key === "reports");
    assert.ok(reportsMod);
    assert.equal(reportsMod.enabled, false);
    assert.equal(reportsMod.href, null);

    for (const item of BRANCH_ADMIN_NAV) {
      if (!item.enabled || !item.href) continue;
      assert.match(item.href, /^\/branch-admin(\/|$)/);
      assert.doesNotMatch(item.href, /^\/branch\//);
    }
    for (const mod of BRANCH_ADMIN_MODULES) {
      if (!mod.enabled || !mod.href) continue;
      assert.match(mod.href, /^\/branch-admin(\/|$)/);
    }
  });

  it("desktop nav and mobile drawer share the same enabled destinations", () => {
    const navItems = BRANCH_ADMIN_NAV.filter((item) => item.nav && item.enabled);
    const mobile = buildBranchMobileNav(navItems, "home");
    const desktopHrefs = new Set(navItems.map((i) => i.href));
    const mobileHrefs = new Set([
      ...mobile.primary.map((i) => i.href),
      ...mobile.sections.flatMap((s) => s.items.map((i) => i.href)),
      ...mobile.account.map((i) => i.href),
    ]);
    assert.deepEqual([...mobileHrefs].sort(), [...desktopHrefs].sort());
    assert.ok(!mobile.sections.some((s) => !s.items.length));
  });

  it("branch module routers use unlessTenant (apex session tenants allowed)", () => {
    const files = [
      "src/blessboard/http/announcementAdminRoutes.js",
      "src/blessboard/http/attendanceAdminRoutes.js",
      "src/blessboard/http/givingAdminRoutes.js",
      "src/blessboard/http/participationAdminRoutes.js",
      "src/blessboard/http/formsRequestsAdminRoutes.js",
      "src/blessboard/http/branchRegistrationAdminRoutes.js",
    ];
    for (const rel of files) {
      const src = read(rel);
      assert.match(src, /mode:\s*"unlessTenant"/, rel);
      assert.doesNotMatch(src, /mode:\s*variant\s*===\s*"hq"\s*\?\s*"unlessTenant"\s*:\s*"hard"/, rel);
    }
  });

  it("V5 foundation still blocks Church Phase 6 /branch/* paths", () => {
    const server = read("src/platform/http/v5FoundationServer.js");
    assert.match(server, /if \(pathOnly\.startsWith\("\/branch"\)\) return true;/);
    assert.match(server, /pathOnly === "\/branch-admin"/);
  });
});

describe("branch-admin route reconciliation (apex runtime)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app = null;
  let fixtures = {};

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });

      const orgKey = uniq("barec");
      const branchEmail = `br-${orgKey}@example.org`;
      const memberEmail = `mem-${orgKey}@example.org`;

      const bootApp = await appRepo.createApplication(pool, {
        church_name: `BA Rec Church ${orgKey}`,
        country: "Kenya",
        city: "Nairobi",
        contact_name: "HQ",
        contact_email: `${uniq("boot")}@example.org`,
        contact_phone: `+2547${String(Date.now()).slice(-7)}`,
        contact_phone_normalized: `+2547${String(Date.now()).slice(-7)}`,
        selected_plan: "foundation",
        consent_terms: true,
      });
      const provisioned = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: bootApp.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: orgKey,
        actorContext: {
          type: "test",
          source: "branch-admin-reconciliation",
          dataEnvironment: "testing",
          deploymentCode: DEPLOYMENT,
        },
      });
      assert.equal(provisioned.ok, true, provisioned.message || provisioned.status);

      const branchUser = await createBlessBoardUser(pool, {
        email: branchEmail,
        password: PASSWORD,
        displayName: "Branch Admin",
      });
      assert.equal(branchUser.ok, true, branchUser.message);

      const memberUser = await createBlessBoardUser(pool, {
        email: memberEmail,
        password: PASSWORD,
        displayName: "Plain Member",
      });
      assert.equal(memberUser.ok, true, memberUser.message);

      const branchRole = await assignBlessBoardRole(pool, {
        email: branchEmail,
        organizationKey: orgKey,
        roleKey: "branch_admin",
        churchKey: orgKey,
        branchKey: "hq",
      });
      assert.equal(branchRole.ok, true, branchRole.message);

      fixtures = {
        orgKey,
        organizationId: provisioned.records.organizationId,
        churchId: provisioned.records.churchId,
        branchId: provisioned.records.branchId,
        branchUserId: branchUser.user.id,
        memberUserId: memberUser.user.id,
      };

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
        apexHosts: new Set([APEX, `www.${APEX}`]),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String(err && err.message ? err.message : err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function cookieFor(userId, organizationId, branchId) {
    const created = await createV5Session(pool, {
      deploymentCode: DEPLOYMENT,
      userId,
      organizationId,
      churchId: fixtures.churchId,
      branchId: branchId || null,
    });
    assert.equal(created.ok, true, created.code || created.message);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  it("dashboard Quick Actions resolve to contentful module pages on apex", async () => {
    requireDb();
    const cookie = await cookieFor(
      fixtures.branchUserId,
      fixtures.organizationId,
      fixtures.branchId
    );
    const dash = await request(app).get("/branch-admin").set("Cookie", cookie).set("Host", APEX);
    assert.equal(dash.status, 200);
    assert.match(dash.text, /href="\/branch-admin\/members"[^>]*data-bb-quick-action="members"/);
    assert.match(dash.text, /href="\/branch-admin\/giving"[^>]*data-bb-quick-action="giving"/);
    assert.match(dash.text, /href="\/branch-admin\/announcements"[^>]*data-bb-quick-action="broadcast"/);
    assert.match(dash.text, /data-bb-module="reports"[^>]*data-bb-module-enabled="0"|data-bb-module-enabled="0"[^>]*data-bb-module="reports"/);
    assert.doesNotMatch(dash.text, /href="\/branch-admin\/reports"/);

    const markers = {
      "/branch-admin/registrations": /Verification queue|Registrations|No pending|empty|data-bb-/i,
      "/branch-admin/members": /data-bb-member-directory|Member directory|No members/i,
      "/branch-admin/announcements": /Announcements|data-bb-ann|No announcements|empty/i,
      "/branch-admin/attendance": /Attendance|data-bb-|No attendance|empty/i,
      "/branch-admin/giving": /Giving|data-bb-|No giving|empty/i,
      "/branch-admin/participation": /Participation|data-bb-participation|No published/i,
      "/branch-admin/resources": /Resources|data-bb-resources|No resources/i,
      "/branch-admin/forms": /Forms|data-bb-forms|No forms/i,
      "/branch-admin/requests": /Requests|data-bb-request|No requests|empty/i,
    };

    for (const p of MODULE_PATHS) {
      const res = await request(app).get(p).set("Cookie", cookie).set("Host", APEX);
      assert.equal(res.status, 200, `${p} => ${res.status}`);
      assert.match(res.text, /data-bb-shell="branch-admin"/, p);
      assert.match(res.text, /<main[\s>]/i, p);
      assert.doesNotMatch(res.text, /This page is not yet available/i, p);
      assert.match(res.text, markers[p], p);
      const key = p.split("/").pop();
      assert.match(
        res.text,
        new RegExp(`href="/branch-admin/${key}"[^>]*aria-current="page"|aria-current="page"[^>]*href="/branch-admin/${key}"`),
        `${p} active nav`
      );
    }
  });

  it("unauthorized users cannot reach modules via apex session cookie alone", async () => {
    requireDb();
    const cookie = await cookieFor(fixtures.memberUserId, fixtures.organizationId, fixtures.branchId);
    for (const p of ["/branch-admin", "/branch-admin/members", "/branch-admin/giving"]) {
      const res = await request(app).get(p).set("Cookie", cookie).set("Host", APEX);
      assert.notEqual(res.status, 200, p);
      assert.ok([401, 403, 303].includes(res.status) || res.status >= 400, `${p} => ${res.status}`);
    }
  });

  it("Church Phase 6 /branch paths stay unavailable on V5 foundation", async () => {
    requireDb();
    const cookie = await cookieFor(
      fixtures.branchUserId,
      fixtures.organizationId,
      fixtures.branchId
    );
    for (const p of [
      "/branch/members",
      "/branch/attendance",
      "/branch/giving-summary",
      "/branch/dashboard",
    ]) {
      const res = await request(app).get(p).set("Cookie", cookie).set("Host", APEX);
      assert.notEqual(res.status, 200, p);
      assert.ok(res.status === 503 || res.status === 404, `${p} => ${res.status}`);
    }
  });

  it("unauthenticated module hits redirect to login (no client JS redirect)", async () => {
    requireDb();
    const res = await request(app)
      .get("/branch-admin/members")
      .set("Host", APEX)
      .set("Accept", "text/html")
      .redirects(0);
    assert.equal(res.status, 303);
    assert.match(String(res.headers.location || ""), /\/login\?next=/);
  });
});
