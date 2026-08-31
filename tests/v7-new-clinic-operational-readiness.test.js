"use strict";

/**
 * ActiveClinic V7 — operational readiness immediately after registration.
 * Provisions a disposable clinic on isolated foundation Postgres, then
 * audits dashboard / nav / modules as the registering organization admin.
 * Does not invent clinical data. Does not deploy.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const {
  DEFAULT_DEPARTMENT_SPECS,
  MODULE_HREF_BY_TYPE,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  MODULE_DEPARTMENT_REQUIREMENTS,
} = require("../src/activeclinic/services/activeClinicModuleAvailability");
const { ORGANIZATION_ADMIN } = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const { createPlatformIdentitySession } = require("../src/platform/session/createDeploymentSession");
const { CODE_ACTIVECLINIC_ORG_V6, COOKIE_ACTIVECLINIC_ORG } = require("../src/platform/config/deploymentProfiles");

const IDENTITY_KEY = "blessboard-platform-v5";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

const EXPECTED_NAV_KEYS = Object.freeze([
  "home",
  "patients",
  "appointments",
  "reception",
  "booking_requests",
  "clinical",
  "pharmacy",
  "diagnostics",
  "billing",
  "staff",
  "facilities",
  "access",
  "website",
  "settings",
]);

const OPERATIONAL_PATHS = Object.freeze([
  "/app",
  "/app/patients",
  "/app/appointments",
  "/app/reception",
  "/app/booking-requests",
  "/app/clinical",
  "/app/pharmacy",
  "/app/diagnostics",
  "/app/diagnostics/laboratory",
  "/app/diagnostics/radiology",
  "/app/billing",
  "/app/access",
  "/app/facilities",
  "/app/staff",
  "/app/settings",
  "/app/settings/website",
  "/app/settings/organization",
  "/app/settings/clinic-setup/departments",
  "/app/settings/clinic-setup/regional",
  "/app/settings/account",
  "/app/settings/facilities",
  "/app/select-facility",
]);

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 940000000;

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

function clinicPayload() {
  stamp += 1;
  return {
    clinicName: `Ready Clinic ${stamp}`,
    contactName: "Clinic Administrator",
    contactEmail: `ready-clinic-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka",
    city: "Lusaka",
    address: "1 Independence Avenue",
    countryCode: "ZM",
    notes: "new clinic operational readiness audit",
    password: "clinic-admin-pass-12",
    passwordConfirm: "clinic-admin-pass-12",
    acceptTerms: "on",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    dataEnvironment: "testing",
    env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
  };
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
  return request(app).get(path).set("Cookie", cookie).redirects(0);
}

async function getPage(app, cookie, path, options) {
  const allowSelectFacility = Boolean(options && options.allowSelectFacility);
  const allowOnboarding = options && options.allowOnboarding !== false;
  const chain = [path];
  let res = await getNoFollow(app, cookie, path);
  for (let i = 0; i < 6 && res.status === 303; i += 1) {
    const loc = String(res.headers.location || "");
    assert.ok(loc, `redirect from ${chain[chain.length - 1]} missing Location`);
    const nextPath = loc.startsWith("http")
      ? `${new URL(loc).pathname}${new URL(loc).search}`
      : loc;
    chain.push(nextPath);
    if (!allowSelectFacility && nextPath.includes("/app/select-facility")) {
      assert.fail(
        `unexpected facility-select redirect for ${path} via ${chain.join(" -> ")}`
      );
    }
    if (!allowOnboarding && nextPath.includes("/app/onboarding")) {
      assert.fail(`unexpected onboarding redirect for ${path} via ${chain.join(" -> ")}`);
    }
    res = await getNoFollow(app, cookie, nextPath);
  }
  return { res, chain };
}

describe("v7 new clinic operational readiness", () => {
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
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no foundation db";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("default departments map to working modules; records/procedure stay optional", () => {
    for (const spec of DEFAULT_DEPARTMENT_SPECS) {
      const href = MODULE_HREF_BY_TYPE[spec.type];
      assert.ok(href, `default department ${spec.type} has no module href`);
      assert.match(href, /^\/app\//, `default department ${spec.type} href ${href}`);
    }
    assert.equal(MODULE_HREF_BY_TYPE.records, null);
    assert.equal(MODULE_HREF_BY_TYPE.procedure, null);
    assert.equal(MODULE_DEPARTMENT_REQUIREMENTS.appointments, "reception");
    assert.ok(MODULE_DEPARTMENT_REQUIREMENTS.clinical.includes("opd"));
    assert.equal(MODULE_DEPARTMENT_REQUIREMENTS.pharmacy, "pharmacy");
    assert.equal(MODULE_DEPARTMENT_REQUIREMENTS.laboratory, "laboratory");
    assert.equal(MODULE_DEPARTMENT_REQUIREMENTS.radiology, "radiology");
    assert.equal(MODULE_DEPARTMENT_REQUIREMENTS.billing, "billing");
    assert.equal(MODULE_DEPARTMENT_REQUIREMENTS.patients, null);
    assert.equal(MODULE_DEPARTMENT_REQUIREMENTS.settings, null);
    assert.equal(MODULE_DEPARTMENT_REQUIREMENTS.access, null);
    assert.equal(MODULE_DEPARTMENT_REQUIREMENTS.facilities, null);
  });

  it("brand-new clinic admin can open every provisioned module without 403/404/500", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const result = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(result.organizationId);
    assert.ok(result.identityId);
    assert.ok(result.facility && result.facility.id);

    const roles = await pool.query(
      `SELECT r.role_key
         FROM activeclinic.staff_role_assignments a
         JOIN blessboard.roles r ON r.id = a.role_id
        WHERE a.organization_id = $1 AND a.staff_member_id = $2 AND a.status = 'active'`,
      [result.organizationId, result.staffMemberId]
    );
    assert.ok(roles.rows.some((row) => row.role_key === ORGANIZATION_ADMIN));

    const hco = await pool.query(
      `SELECT public_name, legal_name, organization_type, country_code, timezone, status
         FROM activeclinic.healthcare_organizations WHERE organization_id = $1`,
      [result.organizationId]
    );
    assert.equal(hco.rowCount, 1);
    assert.ok(String(hco.rows[0].organization_type || "").trim(), "missing default organization_type");
    assert.ok(String(hco.rows[0].legal_name || "").trim(), "missing legal name");
    assert.ok(String(hco.rows[0].country_code || "").trim(), "missing country");
    assert.ok(String(hco.rows[0].timezone || "").trim(), "missing timezone");

    const facility = await pool.query(
      `SELECT id, facility_key, is_primary, status, phone_display, phone_normalized
         FROM activeclinic.facilities WHERE organization_id = $1`,
      [result.organizationId]
    );
    assert.equal(facility.rowCount, 1);
    assert.equal(facility.rows[0].is_primary, true);
    assert.equal(facility.rows[0].status, "active");
    assert.ok(
      String(facility.rows[0].phone_display || facility.rows[0].phone_normalized || "").trim(),
      "missing facility phone (required setup never completes)"
    );

    const assignments = await pool.query(
      `SELECT count(*)::int AS n
         FROM activeclinic.staff_facility_assignments
        WHERE organization_id = $1 AND staff_member_id = $2 AND status = 'active'`,
      [result.organizationId, result.staffMemberId]
    );
    assert.equal(assignments.rows[0].n, 1, "missing facility scope assignment");

    const depts = await pool.query(
      `SELECT department_key, department_type, status
         FROM activeclinic.departments
        WHERE organization_id = $1
        ORDER BY department_key`,
      [result.organizationId]
    );
    const types = depts.rows.map((row) => row.department_type).sort();
    assert.deepEqual(
      types,
      DEFAULT_DEPARTMENT_SPECS.map((spec) => spec.type).sort()
    );
    assert.ok(depts.rows.every((row) => row.status === "active"));

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: result.identityId,
      organizationId: result.organizationId,
    });
    assert.equal(session.ok, true, JSON.stringify(session));
    const cookie = `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;

    const home = await getPage(app, cookie, "/app");
    assert.equal(home.res.status, 200, home.res.text && home.res.text.slice(0, 240));
    assert.doesNotMatch(home.res.text, /data-ac-dashboard-notice="select-facility"/);
    assert.match(home.res.text, /Facility context/);
    assert.doesNotMatch(
      home.res.text,
      /<dt>Facility context<\/dt>\s*<dd>Not selected<\/dd>/
    );

    const navKeys = attrValues(home.res.text, "data-ac-nav-key");
    for (const key of EXPECTED_NAV_KEYS) {
      assert.ok(navKeys.includes(key), `nav missing ${key}: ${navKeys.join(",")}`);
    }
    assert.ok(!navKeys.includes("cashier"), "org admin must not see cashier write module");

    const navHrefs = hrefsForAttr(home.res.text, "data-ac-nav-key");
    for (const item of navHrefs) {
      assertWorkingHref(item.href, `nav:${item.key}`);
    }

    const tiles = hrefsForAttr(home.res.text, "data-ac-dashboard-tile");
    assert.ok(tiles.length > 0, "dashboard has no tiles");
    const tileKeys = tiles.map((t) => t.key);
    for (const key of [
      "patients",
      "appointments",
      "reception",
      "clinical",
      "pharmacy",
      "diagnostics",
      "billing",
      "access",
      "facilities",
      "settings",
      "website",
    ]) {
      assert.ok(tileKeys.includes(key), `dashboard missing tile ${key}: ${tileKeys.join(",")}`);
    }
    assert.ok(!tileKeys.includes("cashier"));
    for (const tile of tiles) {
      assertWorkingHref(tile.href, `tile:${tile.key}`);
    }

    const consoleLinks = hrefsForAttr(home.res.text, "data-ac-console-link");
    for (const link of consoleLinks) {
      assertWorkingHref(link.href, `console:${link.key}`);
    }

    const setupHrefs = [];
    const setupRe = /data-ac-setup-item="([^"]*)"[^>]*>[\s\S]*?href="([^"]+)"/g;
    let setupMatch = setupRe.exec(home.res.text);
    while (setupMatch) {
      setupHrefs.push({ key: setupMatch[1], href: setupMatch[2] });
      setupMatch = setupRe.exec(home.res.text);
    }
    for (const item of setupHrefs) {
      assertWorkingHref(item.href, `setup:${item.key}`);
    }

    const destinations = new Map();
    function remember(href) {
      const path = String(href || "").split("?")[0];
      if (path && path.startsWith("/app")) destinations.set(path, href);
    }
    remember("/app");
    for (const item of navHrefs) remember(item.href);
    for (const tile of tiles) remember(tile.href);
    for (const link of consoleLinks) remember(link.href);
    for (const item of setupHrefs) remember(item.href);
    for (const path of OPERATIONAL_PATHS) remember(path);
    for (const spec of DEFAULT_DEPARTMENT_SPECS) {
      remember(MODULE_HREF_BY_TYPE[spec.type]);
    }

    for (const [path, href] of destinations) {
      const allowSelect = path.includes("/app/select-facility");
      const loaded = await getPage(app, cookie, href, { allowSelectFacility: allowSelect });
      assert.notEqual(loaded.res.status, 403, `${path} returned 403`);
      assert.notEqual(loaded.res.status, 404, `${path} returned 404`);
      assert.notEqual(loaded.res.status, 500, `${path} returned 500: ${(loaded.res.text || "").slice(0, 240)}`);
      assert.equal(
        loaded.res.status,
        200,
        `${path} expected 200, got ${loaded.res.status} via ${loaded.chain.join(" -> ")}`
      );
    }

    const settings = await getPage(app, cookie, "/app/settings");
    assert.equal(settings.res.status, 200);
    const settingsCards = hrefsForAttr(settings.res.text, "data-ac-settings-card");
    assert.ok(settingsCards.length > 0, "settings overview has no cards");
    for (const card of settingsCards) {
      assertWorkingHref(card.href, `settings-card:${card.key}`);
      const cardPage = await getPage(app, cookie, card.href);
      assert.equal(
        cardPage.res.status,
        200,
        `settings card ${card.key} -> ${card.href} status ${cardPage.res.status}`
      );
    }

    const deptPage = await getPage(app, cookie, "/app/settings/clinic-setup/departments");
    assert.equal(deptPage.res.status, 200);
    const deptModules = hrefsForAttr(deptPage.res.text, "data-ac-department-module");
    const deptTypes = new Set(deptModules.map((row) => row.key));
    for (const spec of DEFAULT_DEPARTMENT_SPECS) {
      assert.ok(deptTypes.has(spec.type), `departments page missing module link for ${spec.type}`);
    }
    for (const row of deptModules) {
      assertWorkingHref(row.href, `department-module:${row.key}`);
      const modulePage = await getPage(app, cookie, row.href);
      assert.equal(
        modulePage.res.status,
        200,
        `department ${row.key} href ${row.href} status ${modulePage.res.status}`
      );
    }

    const diagnostics = await getPage(app, cookie, "/app/diagnostics");
    assert.equal(diagnostics.res.status, 200);
    assert.match(diagnostics.res.text, /data-ac-diagnostics-link="laboratory"/);
    assert.match(diagnostics.res.text, /data-ac-diagnostics-link="radiology"/);
    assert.doesNotMatch(diagnostics.res.text, /data-ac-diagnostics-empty="1"/);

    const cashier = await getNoFollow(app, cookie, "/app/cashier");
    assert.equal(cashier.status, 403, "org admin must not open cashier write module");

    const patients = await getPage(app, cookie, "/app/patients");
    assert.equal(patients.res.status, 200);
    assert.doesNotMatch(patients.res.text, /data-ac-patient-id=/);

    const appointments = await getPage(app, cookie, "/app/appointments");
    assert.equal(appointments.res.status, 200);
    const clinical = await getPage(app, cookie, "/app/clinical");
    assert.equal(clinical.res.status, 200);
    const pharmacy = await getPage(app, cookie, "/app/pharmacy");
    assert.equal(pharmacy.res.status, 200);
    const billing = await getPage(app, cookie, "/app/billing");
    assert.equal(billing.res.status, 200);
    const website = await getPage(app, cookie, "/app/settings/website");
    assert.equal(website.res.status, 200);
  });
});
