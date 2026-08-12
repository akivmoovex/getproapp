"use strict";

/**
 * ActiveClinic V7 Phase 10 — browser/runtime hardening.
 * Route smoke, asset 200s, duplicate IDs, nav links, CSRF/validation, RBAC, product isolation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
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
const {
  createFacility,
} = require("../src/activeclinic/services/facilityService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  ORGANIZATION_ADMIN,
  RECEPTIONIST,
  CLINICIAN,
  PHARMACIST,
  BILLING_OFFICER,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, getCsrfCookieName } = require("../src/platform/http/v5Csrf");

const ROOT = path.join(__dirname, "..");
const PASSWORD = "activeclinic-phase10-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

const CLIENT_JS = [
  "public/activeclinic/ac-a11y.js",
  "public/activeclinic/ac-public.js",
  "public/activeclinic/ac-patient.js",
  "public/activeclinic/ac-auth.js",
  "public/activeclinic/ac-phone-field.js",
  "public/activeclinic/ac-shell-nav.js",
];

const SHELL_ASSETS = [
  "public/activeclinic/ac-tokens.css",
  "public/activeclinic/ac-public.css",
  "public/activeclinic/ac-patient.css",
  "public/activeclinic/ac-auth.css",
  "public/activeclinic/ac-app.css",
  "public/activeclinic/ac-phone-field.css",
  "public/activeclinic/assets/platform/home-hero.jpg",
  "public/activeclinic/assets/clinic-hero-default.jpg",
  "public/activeclinic/assets/doctors/doctor-fallback.svg",
  "public/activeclinic/assets/icons/general.svg",
  "public/activeclinic/assets/icons/procedure.svg",
  "public/activeclinic/assets/icons/lab.svg",
  "public/activeclinic/assets/icons/consultation.svg",
  "public/activeclinic/assets/clinic/julflona-hero.jpg",
];

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 910000000;
let app;
let clinicKey;
let orgId;
let cookies = {};

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function extractCsrf(res) {
  const cookieList = [].concat(res.headers["set-cookie"] || []);
  const name = getCsrfCookieName({ PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 });
  const raw = cookieList.find((c) => String(c).startsWith(`${name}=`)) || "";
  const match = String(raw).match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function duplicateIds(html) {
  const seen = new Map();
  const dups = [];
  const re = /\sid=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    if (seen.has(id)) dups.push(id);
    else seen.set(id, 1);
  }
  return [...new Set(dups)];
}

function localAssetPaths(html) {
  const found = new Set();
  const re = /(?:href|src)=["'](\/activeclinic\/[^"'?]+)[^"']*["']/g;
  let m;
  while ((m = re.exec(html))) found.add(m[1]);
  return [...found];
}

function sameOriginHrefs(html) {
  const found = new Set();
  const re = /href=["'](\/[^"'#?]*)/g;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (href.startsWith("//")) continue;
    found.add(href);
  }
  return [...found];
}

function assertNoServerError(res, route) {
  assert.notEqual(res.status, 500, `${route} returned 500`);
  assert.doesNotMatch(res.text || "", /<pre>|stack trace|TypeError|ReferenceError/i);
}

async function provisionOrg(input) {
  const result = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    ...input,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

async function seedStaff(tenant, opts) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true);
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: tenant.orgId,
    healthcareOrganizationId: tenant.hcoId,
    firstName: opts.firstName || "Phase",
    lastName: opts.lastName || "Ten",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: opts.jobTitle || "Staff",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: tenant.facilityId,
    isPrimary: true,
  });
  await assignStaffRole(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: opts.roleKey,
    scopeType: opts.scopeType || "organisation",
    facilityId: opts.scopeType === "facility" ? tenant.facilityId : null,
  });
  return { identity: identity.identity, staff: staff.staffMember, phone };
}

async function sessionCookie(identityId, organizationId, facilityId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId,
    contextJson: facilityId ? { selectedFacilityId: facilityId } : {},
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

describe("ActiveClinic Phase 10 browser hardening", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
      return;
    }

    const stamp = Date.now().toString(36);
    clinicKey = `julflona-clinic-${stamp}`.slice(0, 64);
    const org = await provisionOrg({
      organizationKey: clinicKey,
      displayName: "Juflona Hospital & Medical Centre",
      productKey: "activeclinic",
      productTenantKey: `juflona-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    orgId = org.records.organization.id;
    const hco = await createHealthcareOrganization(pool, {
      organizationId: orgId,
      legalName: "Juflona Hospital Ltd",
      publicName: "Juflona Hospital & Medical Centre",
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    assert.equal(hco.ok, true);
    await pool.query(
      `UPDATE activeclinic.healthcare_organizations
          SET website_published = true, public_booking_enabled = true,
              website_tagline = $2, website_about = $3
        WHERE id = $1`,
      [hco.healthcareOrganization.id, "Pilot hospital", "Juflona public website for Phase 10."]
    );
    const facility = await createFacility(pool, {
      organizationId: orgId,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityKey: "main",
      displayName: "Main Campus",
      facilityType: "hospital",
      status: "active",
      isPrimary: true,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
      city: "Lusaka",
      province: "Lusaka",
    });
    assert.equal(facility.ok, true);
    await pool.query(
      `UPDATE activeclinic.facilities
          SET show_in_directory = true, website_published = true,
              address_line_1 = $2
        WHERE id = $1`,
      [facility.facility.id, "Great East Road"]
    );
    await ensureDefaultDepartments(pool, {
      organizationId: orgId,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityId: facility.facility.id,
    });
    const tenant = {
      orgId,
      hcoId: hco.healthcareOrganization.id,
      facilityId: facility.facility.id,
    };

    const admin = await seedStaff(tenant, {
      firstName: "Org",
      lastName: "Admin",
      roleKey: ORGANIZATION_ADMIN,
      jobTitle: "Administrator",
    });
    const reception = await seedStaff(tenant, {
      firstName: "Rina",
      lastName: "Reception",
      roleKey: RECEPTIONIST,
      scopeType: "facility",
      jobTitle: "Receptionist",
    });
    const clinician = await seedStaff(tenant, {
      firstName: "Chris",
      lastName: "Clinician",
      roleKey: CLINICIAN,
      scopeType: "facility",
      jobTitle: "Clinician",
    });
    const pharmacist = await seedStaff(tenant, {
      firstName: "Phil",
      lastName: "Pharmacy",
      roleKey: PHARMACIST,
      scopeType: "facility",
      jobTitle: "Pharmacist",
    });
    const billing = await seedStaff(tenant, {
      firstName: "Bella",
      lastName: "Billing",
      roleKey: BILLING_OFFICER,
      scopeType: "facility",
      jobTitle: "Billing officer",
    });

    cookies.admin = await sessionCookie(admin.identity.id, orgId, tenant.facilityId);
    cookies.reception = await sessionCookie(reception.identity.id, orgId, tenant.facilityId);
    cookies.clinician = await sessionCookie(clinician.identity.id, orgId, tenant.facilityId);
    cookies.pharmacy = await sessionCookie(pharmacist.identity.id, orgId, tenant.facilityId);
    cookies.billing = await sessionCookie(billing.identity.id, orgId, tenant.facilityId);

    app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("client JS parses and shell assets exist on disk", () => {
    CLIENT_JS.forEach((rel) => {
      const abs = path.join(ROOT, rel);
      assert.ok(fs.existsSync(abs), `missing ${rel}`);
      new vm.Script(fs.readFileSync(abs, "utf8"), { filename: rel });
    });
    SHELL_ASSETS.forEach((rel) => {
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`);
    });
  });

  it("ActiveClinic CSS/JS did not leak into BlessBoard church templates", () => {
    function walk(dir, acc) {
      if (!fs.existsSync(dir)) return acc;
      fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full, acc);
        else if (/\.(ejs|css|js)$/.test(ent.name)) acc.push(full);
      });
      return acc;
    }
    const churchFiles = walk(path.join(ROOT, "views/church"), []).concat(
      walk(path.join(ROOT, "public/church"), [])
    );
    churchFiles.forEach((file) => {
      const text = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(text, /\/activeclinic\//, file);
      assert.doesNotMatch(text, /ac-tokens\.css|ac-app\.css|ac-public\.css/, file);
      assert.doesNotMatch(text, /data-ac-product="activeclinic"/, file);
    });
    const acViews = walk(path.join(ROOT, "views/activeclinic"), []);
    acViews.forEach((file) => {
      const text = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(text, /\/church\/church\.css/, file);
    });
  });

  it("public, Juflona, booking, portal, and auth routes do not 500", async () => {
    requireDb();
    const routes = [
      "/",
      "/about",
      "/solutions",
      "/clinics",
      "/register-clinic",
      "/login",
      "/forgot-password",
      "/healthz",
      `/clinics/${clinicKey}`,
      `/clinics/${clinicKey}/about`,
      `/clinics/${clinicKey}/doctors`,
      `/clinics/${clinicKey}/services`,
      `/clinics/${clinicKey}/pricing`,
      `/clinics/${clinicKey}/location`,
      `/clinics/${clinicKey}/contact`,
      `/clinics/${clinicKey}/privacy`,
      `/clinics/${clinicKey}/terms`,
      `/clinics/${clinicKey}/patient-information`,
      `/clinics/${clinicKey}/book`,
      `/clinics/${clinicKey}/book/procedures`,
      `/clinics/${clinicKey}/my-booking`,
      `/clinics/${clinicKey}/patient/login`,
      `/clinics/${clinicKey}/patient/register`,
      `/clinics/${clinicKey}/patient/forgot-password`,
    ];
    const pages = [];
    for (const route of routes) {
      const res = await request(app).get(route);
      assertNoServerError(res, route);
      assert.ok(
        [200, 302, 303].includes(res.status),
        `${route} status ${res.status}`
      );
      if (res.status === 200 && String(res.headers["content-type"] || "").includes("html")) {
        pages.push({ route, html: res.text });
      }
    }

    const unknown = await request(app).get("/clinics/no-such-clinic-xyz");
    assert.equal(unknown.status, 404);
    assertNoServerError(unknown, "/clinics/no-such-clinic-xyz");

    const assetHits = new Set();
    for (const page of pages) {
      const dups = duplicateIds(page.html);
      assert.deepEqual(dups, [], `duplicate ids on ${page.route}: ${dups.join(", ")}`);
      assert.doesNotMatch(page.html, /\/church\/church\.css/);
      for (const asset of localAssetPaths(page.html)) assetHits.add(asset);
    }
    for (const asset of assetHits) {
      const res = await request(app).get(asset);
      assert.equal(res.status, 200, `asset ${asset} status ${res.status}`);
    }
  });

  it("primary public and Juflona navigation links are not dead", async () => {
    requireDb();
    const home = await request(app).get("/");
    assert.equal(home.status, 200);
    const tenant = await request(app).get(`/clinics/${clinicKey}`);
    assert.equal(tenant.status, 200);

    const hrefs = new Set([
      ...sameOriginHrefs(home.text),
      ...sameOriginHrefs(tenant.text),
    ]);
    const skip = new Set(["/logout", "/app/offline"]);
    for (const href of hrefs) {
      if (skip.has(href)) continue;
      if (href.startsWith("/app")) continue;
      const res = await request(app).get(href);
      assertNoServerError(res, href);
      assert.notEqual(res.status, 404, `nav link 404: ${href}`);
      assert.ok(
        res.status < 500,
        `nav link ${href} status ${res.status}`
      );
    }
  });

  it("staff hub routes render without 500 and load JS/CSS", async () => {
    requireDb();
    const hubs = [
      "/app",
      "/app/patients",
      "/app/appointments",
      "/app/appointments/calendar",
      "/app/reception",
      "/app/booking-requests",
      "/app/clinical",
      "/app/pharmacy",
      "/app/pharmacy/catalogue",
      "/app/pharmacy/inventory",
      "/app/diagnostics",
      "/app/diagnostics/laboratory",
      "/app/diagnostics/radiology",
      "/app/billing",
      "/app/billing/invoices",
      "/app/billing/catalog",
      "/app/cashier",
      "/app/staff",
      "/app/facilities",
      "/app/access",
      "/app/settings",
      "/app/settings/account",
      "/app/settings/clinic-setup/departments",
    ];
    const pages = [];
    for (const route of hubs) {
      const res = await request(app).get(route).set("Cookie", cookies.admin);
      assertNoServerError(res, route);
      assert.ok(
        [200, 302, 303, 403].includes(res.status),
        `${route} status ${res.status}`
      );
      if (res.status === 200) pages.push({ route, html: res.text });
    }

    const offline = await request(app).get("/app/offline").set("Cookie", cookies.admin);
    assert.equal(offline.status, 503);

    for (const page of pages) {
      const dups = duplicateIds(page.html);
      assert.deepEqual(dups, [], `duplicate ids on ${page.route}: ${dups.join(", ")}`);
      assert.match(page.html, /ac-a11y\.js/);
      assert.doesNotMatch(page.html, /\/church\/church\.css/);
      for (const asset of localAssetPaths(page.html)) {
        const res = await request(app).get(asset);
        assert.equal(res.status, 200, `${page.route} asset ${asset}`);
      }
    }

    const dash = pages.find((p) => p.route === "/app");
    assert.ok(dash);
    const unique = [
      ...new Set(
        [...dash.html.matchAll(/<a[^>]*href="(\/app[^"]*)"[^>]*data-ac-nav-key/g)].map((m) => m[1])
      ),
    ];
    assert.ok(unique.length > 0, "dashboard primary nav should list /app links");
    for (const href of unique) {
      if (href === "/app/offline" || href === "/logout") continue;
      const res = await request(app).get(href).set("Cookie", cookies.admin);
      assertNoServerError(res, href);
      assert.notEqual(res.status, 404, `staff nav 404: ${href}`);
      assert.notEqual(res.status, 403, `staff nav 403 for visible item: ${href}`);
    }
  });

  it("anonymous, patient, and role routes follow expected allow/deny", async () => {
    requireDb();
    const anon = await request(app).get("/app");
    assert.ok([302, 303].includes(anon.status));
    assert.match(anon.headers.location || "", /\/login/);

    const patientDash = await request(app).get(`/clinics/${clinicKey}/patient`);
    assert.ok([302, 303].includes(patientDash.status));

    const allowed = [
      [cookies.reception, "/app/reception", 200],
      [cookies.clinician, "/app/clinical", 200],
      [cookies.pharmacy, "/app/pharmacy", 200],
      [cookies.billing, "/app/billing", 200],
    ];
    for (const [cookie, route, status] of allowed) {
      const res = await request(app).get(route).set("Cookie", cookie);
      assertNoServerError(res, `${route} allowed`);
      assert.equal(res.status, status, `${route} expected ${status} got ${res.status}`);
    }

    const denied = [
      [cookies.reception, "/app/pharmacy"],
      [cookies.reception, "/app/billing"],
      [cookies.clinician, "/app/billing"],
      [cookies.pharmacy, "/app/billing"],
      [cookies.billing, "/app/pharmacy"],
    ];
    for (const [cookie, route] of denied) {
      const res = await request(app).get(route).set("Cookie", cookie);
      assertNoServerError(res, `${route} denied`);
      assert.ok(
        [403, 302, 303].includes(res.status),
        `${route} deny status ${res.status}`
      );
    }
  });

  it("representative POST forms return CSRF/validation rather than 500", async () => {
    requireDb();
    const loginGet = await request(app).get("/login");
    assert.equal(loginGet.status, 200);
    const loginCsrf = extractCsrf(loginGet);
    assert.ok(loginCsrf);

    const noCsrf = await request(app)
      .post("/login")
      .type("form")
      .send({ identifier: "970000001", password: "x" });
    assert.equal(noCsrf.status, 403);
    assertNoServerError(noCsrf, "POST /login no csrf");

    const emptyLogin = await request(app)
      .post("/login")
      .set("Cookie", loginGet.headers["set-cookie"])
      .type("form")
      .send({ [CSRF_FIELD]: loginCsrf, identifier: "", password: "" });
    assert.notEqual(emptyLogin.status, 500);
    assertNoServerError(emptyLogin, "POST /login empty");
    assert.ok([200, 400, 401].includes(emptyLogin.status));

    const regGet = await request(app).get("/register-clinic");
    assert.equal(regGet.status, 200);
    const regCsrf = extractCsrf(regGet);
    const noCsrfReg = await request(app).post("/register-clinic").type("form").send({ clinicName: "X" });
    assert.equal(noCsrfReg.status, 403);
    assertNoServerError(noCsrfReg, "POST /register-clinic no csrf");

    const emptyReg = await request(app)
      .post("/register-clinic")
      .set("Cookie", regGet.headers["set-cookie"])
      .type("form")
      .send({ [CSRF_FIELD]: regCsrf });
    assert.notEqual(emptyReg.status, 500);
    assertNoServerError(emptyReg, "POST /register-clinic empty");
    assert.ok([200, 400].includes(emptyReg.status));

    const contactGet = await request(app).get(`/clinics/${clinicKey}/contact`);
    assert.equal(contactGet.status, 200);
    const contactCsrf = extractCsrf(contactGet);
    const emptyContact = await request(app)
      .post(`/clinics/${clinicKey}/contact`)
      .set("Cookie", contactGet.headers["set-cookie"])
      .type("form")
      .send({ [CSRF_FIELD]: contactCsrf, senderName: "", senderEmail: "", message: "" });
    assert.notEqual(emptyContact.status, 500);
    assertNoServerError(emptyContact, "POST contact empty");
    assert.ok([200, 400].includes(emptyContact.status));
  });
});
