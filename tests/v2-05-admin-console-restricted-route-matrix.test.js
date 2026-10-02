"use strict";

/**
 * V2.05 / V5 — Admin Console restricted route matrix.
 *
 * Prove modules hidden from restricted-role nav are also denied server-side
 * (403 / documented safe redirect). No duplicated role catalogues — uses
 * assignStaffRole / assignBlessBoardRole / catalogue RBAC + resolveEffectivePermissions
 * + shared nav builders.
 *
 * Documented safe deny redirects:
 * - AC: /app, /app/select-facility, /app/select-organization, /login
 * - BB: /hq, /account, /member, /login, /branch*
 * Never 500/503. Never 200 with the protected module page active.
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
const { expectIsolationDenied } = require("./helpers/authzNegativeHelpers");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const { createFacility } = require("../src/activeclinic/services/facilityService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  resolveEffectivePermissions,
  RECEPTIONIST,
  WEBSITE_EDITOR,
  FACILITY_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { ENV_KEY } = require("../src/blessboard/config/instantFreeProvisioningEnabled");
const {
  provisionBlessBoardChurch,
} = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  createBlessBoardUser,
} = require("../src/blessboard/services/createBlessBoardUser");
const {
  assignBlessBoardRole,
} = require("../src/blessboard/services/assignBlessBoardRole");
const rbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");
const {
  NAV_ITEMS,
  buildActiveClinicNavigation,
} = require("../src/activeclinic/services/activeClinicNavigation");
const { HQ_ADMIN_NAV } = require("../src/blessboard/http/hqAdminNav");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "RestrictRoute-Matrix-99!";
const AC_HOST = "activeclinic.org";
const BB_APEX = "blessboard.org";

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  SESSION_SECRET: "a".repeat(48),
});

const MINIMAL_BB = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
  [ENV_KEY]: "1",
});

const AC_FULL_ROUTES = Object.freeze(
  NAV_ITEMS.map((i) => ({ key: i.key, href: i.href, label: i.label }))
);
const BB_FULL_ROUTES = Object.freeze(
  HQ_ADMIN_NAV.filter((i) => i.nav && i.enabled && i.href).map((i) => ({
    key: i.key,
    href: i.href,
    label: i.label,
  }))
);

/**
 * Nav-hidden modules that may still soft-render a read-only page when the actor
 * holds a weaker view permission (facility.view) but not manage grants.
 * Documented: must not expose create/archive management affordances.
 */
const AC_SOFT_VIEW_KEYS = Object.freeze(new Set(["facilities", "rooms"]));

const AC_SAFE_DENY_REDIRECTS = Object.freeze([
  "/app",
  "/app/",
  "/app/select-facility",
  "/app/select-organization",
  "/login",
]);

const BB_SAFE_DENY_REDIRECTS = Object.freeze([
  "/hq",
  "/hq/",
  "/account",
  "/member",
  "/login",
  "/branch",
]);

let pool;
let databaseUrl;
let skipReason = null;
let deniedRouteCount = 0;
const rolesCovered = [];

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}${crypto.randomBytes(3).toString("hex")}`.slice(0, 24);
}

function nextPhone() {
  return `+26097${String(Date.now()).slice(-7)}`;
}

function locationPath(location) {
  const raw = String(location || "");
  if (!raw) return "";
  try {
    if (raw.startsWith("http")) return new URL(raw).pathname;
  } catch {
    /* ignore */
  }
  return raw.split("?")[0];
}

function isSafeDenyRedirect(pathname, product) {
  const path = String(pathname || "");
  if (!path) return false;
  const allowed = product === "ac" ? AC_SAFE_DENY_REDIRECTS : BB_SAFE_DENY_REDIRECTS;
  if (allowed.some((p) => path === p || path.startsWith(`${p}/`) || (p === "/branch" && path.startsWith("/branch")))) {
    return true;
  }
  return false;
}

function scrapeNavKeys(html, product) {
  const attr = product === "ac" ? "data-ac-nav-key" : "data-bb-nav-key";
  const keys = new Set();
  const re = new RegExp(`${attr}="([^"]+)"`, "gi");
  let m;
  while ((m = re.exec(String(html || "")))) {
    keys.add(m[1]);
  }
  return keys;
}

function assertNoProtectedModulePage(html, deniedKey, product) {
  const text = String(html || "");
  if (product === "ac") {
    const page = (text.match(/data-ac-page="([^"]+)"/) || [])[1];
    assert.notEqual(
      page,
      deniedKey,
      `AC denied route rendered protected page data-ac-page=${deniedKey}`
    );
  } else {
    // Active HQ nav key for the denied module must not claim aria-current.
    const re = new RegExp(
      `data-bb-nav-key="${deniedKey}"[^>]*(?:aria-current="page"|class="[^"]*is-active)|` +
        `(?:aria-current="page"|class="[^"]*is-active)[^>]*data-bb-nav-key="${deniedKey}"`,
      "i"
    );
    assert.doesNotMatch(text, re, `BB denied route marked active for ${deniedKey}`);
  }
}

function assertSoftViewOnly(html, routeKey, label) {
  const text = String(html || "");
  assert.match(text, /data-ac-page="[^"]+"/);
  assert.doesNotMatch(
    text,
    /data-ac-(?:facility|room)-(?:create|archive|delete)|\/app\/facilities\/new|Add facility|Archive facility/i,
    `${label} soft-view ${routeKey} leaked management affordances`
  );
}

/**
 * @returns {"denied"|"redirect"|"soft_view"}
 */
async function expectProtectedDenied({
  app,
  host,
  cookie,
  route,
  product,
  label,
}) {
  const res = await request(app)
    .get(route.href)
    .set("Host", host)
    .set("Cookie", cookie)
    .redirects(0);

  assert.ok(
    ![500, 503].includes(res.status),
    `${label} must not 500/503 (got ${res.status})`
  );

  if ([401, 403, 404].includes(res.status)) {
    assertNoProtectedModulePage(res.text, route.key, product);
    deniedRouteCount += 1;
    return "denied";
  }

  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const next = locationPath(res.headers.location);
    assert.ok(
      isSafeDenyRedirect(next, product),
      `${label} unsafe deny redirect ${next} from ${route.href}`
    );
    assert.notEqual(next, route.href, `${label} redirect loop to self`);
    const followed = await request(app)
      .get(next)
      .set("Host", host)
      .set("Cookie", cookie)
      .redirects(2);
    assert.ok(![500, 503].includes(followed.status), `${label} follow ${next}`);
    if (followed.status === 200) {
      assertNoProtectedModulePage(followed.text, route.key, product);
    } else {
      expectIsolationDenied(followed, `${label} follow`);
    }
    deniedRouteCount += 1;
    return "redirect";
  }

  if (
    product === "ac" &&
    res.status === 200 &&
    AC_SOFT_VIEW_KEYS.has(route.key)
  ) {
    assertSoftViewOnly(res.text, route.key, label);
    deniedRouteCount += 1;
    return "soft_view";
  }

  assert.fail(
    `${label} unexpectedly allowed ${route.href} with status ${res.status}`
  );
}

function makeAcApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
  });
}

function makeBbApp() {
  return createV5FoundationApp({
    env: MINIMAL_BB,
    getPool: () => pool,
  });
}

async function provisionAcClinic(stamp) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `ac_rr_${stamp}`,
    displayName: `Restrict AC ${stamp}`,
    productKey: "activeclinic",
    productTenantKey: `ac-rr-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: `${stamp} Legal`,
    publicName: `${stamp} Clinic`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `f-${stamp}`,
    displayName: "Main Facility",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true);
  return {
    organizationId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    stamp,
  };
}

async function seedAcStaff(clinic, roleKey, label) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `${label}.${phone.slice(-8)}@restrict.test`,
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true, JSON.stringify(identity));
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: clinic.hcoId,
    firstName: label,
    lastName: "Restrict",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: label,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: clinic.organizationId,
    staffMemberId: staff.staffMember.id,
    facilityId: clinic.facilityId,
    isPrimary: true,
  });
  const role = await assignStaffRole(pool, {
    organizationId: clinic.organizationId,
    staffMemberId: staff.staffMember.id,
    roleKey,
    scopeType: "facility",
    facilityId: clinic.facilityId,
    assignmentOrigin: "system",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(role.ok, true, JSON.stringify(role));

  const perms = await resolveEffectivePermissions(pool, {
    organizationId: clinic.organizationId,
    staffMemberId: staff.staffMember.id,
    platformIdentityId: identity.identity.id,
    facilityId: clinic.facilityId,
  });
  assert.equal(perms.ok, true, JSON.stringify(perms));

  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identity.identity.id,
    organizationId: clinic.organizationId,
    contextJson: { selectedFacilityId: clinic.facilityId },
  });
  assert.equal(session.ok, true, JSON.stringify(session));

  return {
    roleKey,
    permissions: perms.permissions || [],
    cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`,
    nav: buildActiveClinicNavigation(perms.permissions || [], "home"),
  };
}

async function provisionBbChurch(stamp) {
  const orgKey = `bbrr${String(stamp).replace(/[^a-z0-9]/gi, "")}`.slice(0, 24);
  const host = `${orgKey}.blessboard.org`;
  const tenant = await provisionPlatformTenant(pool, {
    organizationKey: orgKey,
    displayName: `Restrict BB ${stamp}`,
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: orgKey,
    hostname: host,
    domainType: "canonical",
    deploymentCode: "blessboard-org-staging",
    isPrimary: true,
  });
  assert.equal(tenant.ok, true, JSON.stringify(tenant));
  const church = await provisionBlessBoardChurch(pool, {
    organizationKey: orgKey,
    churchKey: orgKey,
    displayName: `Restrict Church ${stamp}`,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "HQ",
  });
  assert.equal(church.ok, true, JSON.stringify(church));
  const organizationId = (
    await pool.query(`SELECT id FROM platform.organizations WHERE organization_key=$1`, [orgKey])
  ).rows[0].id;
  const churchId = church.records.church.id;
  const hqBranchId = church.records.hqBranch.id;
  return { orgKey, host, organizationId, churchId, hqBranchId, stamp };
}

async function seedBbUser(church, { email, displayName, roleKey, branchKey, catalogueOnly }) {
  const created = await createBlessBoardUser(pool, {
    email,
    password: PASSWORD,
    displayName,
  });
  assert.equal(created.ok, true, created.message || JSON.stringify(created));

  if (catalogueOnly) {
    const role = await rbacRepo.findRoleByKey(pool, roleKey);
    assert.ok(role, `missing catalogue role ${roleKey}`);
    await rbacRepo.insertAssignment(pool, {
      userId: created.user.id,
      organizationId: church.organizationId,
      churchId: church.churchId,
      roleId: role.id,
      scopeType: "church",
      scopeId: church.churchId,
      assignedByUserId: created.user.id,
      assignmentOrigin: "system",
      assignmentReason: "restricted route matrix",
    });
  } else {
    const assigned = await assignBlessBoardRole(pool, {
      email,
      organizationKey: church.orgKey,
      roleKey,
      churchKey: church.orgKey,
      branchKey: branchKey || null,
    });
    assert.equal(assigned.ok, true, JSON.stringify(assigned));
  }

  const session = await createV5Session(pool, {
    deploymentCode: "blessboard-org-staging",
    userId: created.user.id,
    organizationId: church.organizationId,
    churchId: church.churchId,
    branchId: church.hqBranchId,
  });
  assert.equal(session.ok, true, session.code || JSON.stringify(session));
  return {
    roleKey,
    userId: created.user.id,
    cookie: `${DEFAULT_V5_COOKIE}=${session.rawToken}`,
  };
}

/**
 * Visible vs protected routes for a restricted AC role.
 */
function acDeniedRoutes(nav) {
  const visible = new Set((nav.items || []).map((i) => i.href));
  return AC_FULL_ROUTES.filter((r) => !visible.has(r.href) && r.href !== "/app");
}

/**
 * Visible HQ routes for BB actor (from live /hq HTML when reachable).
 */
async function bbDeniedRoutes(app, host, cookie) {
  const home = await request(app).get("/hq").set("Host", host).set("Cookie", cookie).redirects(0);
  if ([401, 403, 404].includes(home.status)) {
    return BB_FULL_ROUTES.slice();
  }
  if ([301, 302, 303].includes(home.status)) {
    const next = locationPath(home.headers.location);
    if (isSafeDenyRedirect(next, "bb") && next !== "/hq" && next !== "/hq/") {
      return BB_FULL_ROUTES.slice();
    }
  }
  let html = home.text;
  if (home.status !== 200) {
    const followed = await request(app)
      .get("/hq")
      .set("Host", host)
      .set("Cookie", cookie)
      .redirects(3);
    if (followed.status !== 200) return BB_FULL_ROUTES.slice();
    html = followed.text;
  }
  const visibleKeys = scrapeNavKeys(html, "bb");
  return BB_FULL_ROUTES.filter((r) => !visibleKeys.has(r.key) && r.key !== "home");
}

describe("V2.05 Admin Console restricted route matrix", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("AC receptionist / website editor / facility admin: hidden modules denied server-side", async () => {
    requireDb();
    const app = makeAcApp();
    const clinic = await provisionAcClinic(uniq("a"));
    const roles = [
      { roleKey: RECEPTIONIST, label: "receptionist" },
      { roleKey: WEBSITE_EDITOR, label: "website_editor" },
      { roleKey: FACILITY_ADMIN, label: "facility_admin" },
    ];

    for (const spec of roles) {
      const actor = await seedAcStaff(clinic, spec.roleKey, spec.label);
      rolesCovered.push(`ac:${spec.roleKey}`);

      // Visible nav must not include denied destinations.
      const denied = acDeniedRoutes(actor.nav);
      const minHidden = spec.roleKey === FACILITY_ADMIN ? 1 : 3;
      assert.ok(
        denied.length >= minHidden,
        `${spec.roleKey} expected >=${minHidden} hidden modules, got ${denied.length}: ${denied
          .map((d) => d.key)
          .join(",")}`
      );

      // Spot-check: receptionist never sees clinical/access/website in nav.
      if (spec.roleKey === RECEPTIONIST) {
        assert.ok(!actor.nav.items.find((i) => i.key === "clinical"));
        assert.ok(!actor.nav.items.find((i) => i.key === "access"));
        assert.ok(!actor.nav.items.find((i) => i.key === "website"));
      }
      if (spec.roleKey === WEBSITE_EDITOR) {
        assert.ok(actor.nav.items.find((i) => i.key === "website"));
        assert.ok(!actor.nav.items.find((i) => i.key === "patients"));
        assert.ok(!actor.nav.items.find((i) => i.key === "billing"));
      }

      const failures = [];
      for (const route of denied) {
        try {
          await expectProtectedDenied({
            app,
            host: AC_HOST,
            cookie: actor.cookie,
            route,
            product: "ac",
            label: `AC ${spec.roleKey} ${route.key}`,
          });
        } catch (err) {
          failures.push(`${route.key} ${route.href}: ${err && err.message}`);
        }
      }
      assert.equal(failures.length, 0, failures.join("\n"));
    }
  });

  it("BB branch admin / website editor / website publisher: HQ-hidden modules denied", async () => {
    requireDb();
    const app = makeBbApp();
    const church = await provisionBbChurch(uniq("b"));

    const actors = [
      await seedBbUser(church, {
        email: `ba-${church.stamp}@example.org`,
        displayName: "Branch Admin",
        roleKey: "branch_admin",
        branchKey: "hq",
      }),
      await seedBbUser(church, {
        email: `we-${church.stamp}@example.org`,
        displayName: "Website Editor",
        roleKey: "website_editor",
        catalogueOnly: true,
      }),
      await seedBbUser(church, {
        email: `wp-${church.stamp}@example.org`,
        displayName: "Website Publisher",
        roleKey: "website_publisher",
        catalogueOnly: true,
      }),
    ];

    for (const actor of actors) {
      rolesCovered.push(`bb:${actor.roleKey}`);
      const denied = await bbDeniedRoutes(app, church.host, actor.cookie);
      assert.ok(
        denied.length >= 2,
        `${actor.roleKey} expected HQ-hidden routes, got ${denied.length}`
      );

      const failures = [];
      for (const route of denied) {
        try {
          await expectProtectedDenied({
            app,
            host: church.host,
            cookie: actor.cookie,
            route,
            product: "bb",
            label: `BB ${actor.roleKey} ${route.key}`,
          });
        } catch (err) {
          failures.push(`${route.key} ${route.href}: ${err && err.message}`);
        }
      }
      assert.equal(failures.length, 0, failures.join("\n"));
    }
  });

  it("tenant isolation: foreign BB session cannot open another church HQ", async () => {
    requireDb();
    const app = makeBbApp();
    const churchA = await provisionBbChurch(uniq("ta"));
    const churchB = await provisionBbChurch(uniq("tb"));
    const editorA = await seedBbUser(churchA, {
      email: `iso-${churchA.stamp}@example.org`,
      displayName: "Editor A",
      roleKey: "website_editor",
      catalogueOnly: true,
    });

    const cross = await request(app)
      .get("/hq")
      .set("Host", churchB.host)
      .set("Cookie", editorA.cookie)
      .redirects(0);
    assert.ok(![500, 503].includes(cross.status));
    if (cross.status === 200) {
      // Must not render church B tenant chrome as an authorized HQ session.
      assert.doesNotMatch(
        cross.text,
        new RegExp(churchB.orgKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
      );
      assert.doesNotMatch(cross.text, /data-gp-admin-console="AdminConsoleShell"/);
    } else {
      expectIsolationDenied(cross, "BB cross-tenant /hq");
    }
    deniedRouteCount += 1;
  });

  it("reports matrix coverage for FINALs", () => {
    if (skipReason) return;
    assert.ok(rolesCovered.length >= 6, `roles=${rolesCovered.join(",")}`);
    assert.ok(deniedRouteCount >= 10, `deniedRouteCount=${deniedRouteCount}`);
    // eslint-disable-next-line no-console
    console.log(
      `ADMIN_CONSOLE_RESTRICTED_ROUTE roles=${rolesCovered.join(",")} DENIED_ROUTES=${deniedRouteCount}`
    );
  });
});
