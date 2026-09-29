"use strict";

/**
 * Website Management public catalogue: show/hide canonical doctors and
 * services without duplicating records or bypassing booking rules.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
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
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const publicationService = require("../src/platform/website/publicationService");
const instanceRepo = require("../src/platform/website/instanceRepository");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const { createStaffMember } = require("../src/activeclinic/services/activeClinicStaffService");
const { insertServiceType } = require("../src/activeclinic/repositories/appointmentRepository");
const {
  listPublicServices,
  listWebsiteServices,
} = require("../src/activeclinic/services/activeClinicPublicVisibilityService");
const { createPlatformIdentity } = require("../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  WEBSITE_EDITOR,
  RECEPTIONIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "clinic-admin-pass-12";
const AC_HOST = "activeclinic.org";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let skipReason = null;
let phoneSeq = 880000000;

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function re(value) {
  return new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

function extractCsrf(htmlOrRes) {
  const text = typeof htmlOrRes === "string" ? htmlOrRes : String((htmlOrRes && htmlOrRes.text) || "");
  const meta = text.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (meta) return meta[1];
  const field = text.match(
    new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`)
  );
  return (field && (field[1] || field[2])) || null;
}

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function addCookiePair(map, raw) {
  const first = String(raw || "").split(";")[0];
  const eq = first.indexOf("=");
  if (eq <= 0) return;
  map[first.slice(0, eq)] = first.slice(eq + 1);
}

function mergeCookies(sessionCookie, pageRes, extra) {
  const map = Object.create(null);
  if (sessionCookie) {
    for (const part of String(sessionCookie).split(";")) addCookiePair(map, part.trim());
  }
  const set = pageRes && pageRes.headers && pageRes.headers["set-cookie"];
  const list = Array.isArray(set) ? set : set ? [set] : [];
  for (const line of list) addCookiePair(map, line);
  if (extra) addCookiePair(map, extra);
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function sessionCookie(identityId, orgId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

async function resolveHcoId(clinic) {
  const row = await pool.query(
    `SELECT id FROM activeclinic.healthcare_organizations WHERE organization_id = $1 LIMIT 1`,
    [clinic.organizationId]
  );
  assert.ok(row.rows[0], "missing healthcare organization");
  return row.rows[0].id;
}

async function countRows(table, organizationId) {
  const result = await pool.query(
    `SELECT count(*)::int AS n FROM ${table} WHERE organization_id = $1`,
    [organizationId]
  );
  return result.rows[0].n;
}

async function provisionClinic(overrides) {
  const stamp = uniq("cat");
  const result = await submitAndProvisionClinicRegistration(pool, {
    clinicName: `Catalogue Clinic ${stamp}`,
    contactName: "Website Admin",
    contactEmail: `${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka",
    city: "Lusaka",
    address: "1 Independence Avenue",
    countryCode: "ZM",
    notes: "catalogue",
    password: PASSWORD,
    passwordConfirm: PASSWORD,
    acceptTerms: "on",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    dataEnvironment: "testing",
    env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    ...overrides,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
    organizationId: result.organizationId,
    productCode: "activeclinic",
  });
  if (instance) {
    await publicationService.publishWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      expectedProductCode: "activeclinic",
      actorIdentityId: result.identityId,
      allowEmpty: true,
    });
  }
  await setClinicWebsiteAvailability(pool, {
    organizationKey: result.slug,
    public: true,
    overrideReadiness: true,
    reason: "catalogue_test",
  });
  return { ...result, stamp };
}

async function publishWebsite(clinic) {
  const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
    organizationId: clinic.organizationId,
    productCode: "activeclinic",
  });
  const published = await publicationService.publishWebsiteDraft(pool, {
    organizationId: clinic.organizationId,
    instanceId: instance.id,
    expectedProductCode: "activeclinic",
    actorIdentityId: clinic.identityId,
    allowEmpty: true,
  });
  assert.equal(published.ok, true, JSON.stringify(published));
}

async function insertCanonicalDoctor(clinic, spec) {
  const created = await createStaffMember(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: await resolveHcoId(clinic),
    firstName: spec.firstName,
    lastName: spec.lastName,
    displayName: spec.displayName,
    employmentType: "permanent",
    status: spec.status || "active",
    phone: nextPhone(),
    email: spec.email,
    jobTitle: spec.title || "Physician",
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  return created.staffMember;
}

async function insertCanonicalService(clinic, spec) {
  return insertServiceType(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: await resolveHcoId(clinic),
    serviceKey: spec.serviceKey,
    displayName: spec.displayName,
    description: spec.summary || null,
    defaultDurationMinutes: 30,
    status: spec.status || "active",
  });
}

async function catalogueAction(app, cookie, kind, id, action) {
  const tab = kind === "service" ? "services" : "doctors";
  const page = await request(app)
    .get(`/app/settings/website/catalogue?tab=${tab}`)
    .set("Cookie", cookie);
  assert.equal(page.status, 200, page.text.slice(0, 400));
  const path =
    kind === "service"
      ? `/app/settings/website/catalogue/services/${id}`
      : `/app/settings/website/catalogue/doctors/${id}`;
  return request(app)
    .post(path)
    .set("Cookie", mergeCookies(cookie, page))
    .type("form")
    .send({ [CSRF_FIELD]: extractCsrf(page), action })
    .redirects(0);
}

describe("v7 website public catalogue", { timeout: 180000 }, () => {
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

  it("lets a clinic admin enable, publish, hide, and isolate canonical doctors and services", async () => {
    requireDb();
    const clinic = await provisionClinic();
    const other = await provisionClinic();
    const app = makeApp();
    const cookie = await sessionCookie(clinic.identityId, clinic.organizationId);
    const cookieB = await sessionCookie(other.identityId, other.organizationId);
    const doctorName = `Dr Catalogue ${clinic.stamp}`;
    const serviceName = `Website consult ${clinic.stamp}`;
    const doctor = await insertCanonicalDoctor(clinic, {
      firstName: "Catalogue",
      lastName: clinic.stamp,
      displayName: doctorName,
      title: "Physician",
      email: `doc-${clinic.stamp}@example.invalid`,
    });
    const inactive = await insertCanonicalDoctor(clinic, {
      firstName: "Inactive",
      lastName: clinic.stamp,
      displayName: `Dr Inactive ${clinic.stamp}`,
      title: "Surgeon",
      email: `inactive-${clinic.stamp}@example.invalid`,
      status: "inactive",
    });
    const service = await insertCanonicalService(clinic, {
      serviceKey: `web-consult-${clinic.stamp}`,
      displayName: serviceName,
      summary: "Website listing only",
    });
    const otherDoctor = await insertCanonicalDoctor(other, {
      firstName: "Other",
      lastName: other.stamp,
      displayName: `Dr Other ${other.stamp}`,
      email: `other-doc-${other.stamp}@example.invalid`,
    });
    const otherService = await insertCanonicalService(other, {
      serviceKey: `other-consult-${other.stamp}`,
      displayName: `Other consult ${other.stamp}`,
    });

    const staffBefore = await countRows("activeclinic.staff_members", clinic.organizationId);
    const servicesBefore = await countRows(
      "activeclinic.appointment_service_types",
      clinic.organizationId
    );

    const hub = await request(app).get("/app/settings/website").set("Cookie", cookie);
    assert.equal(hub.status, 200);
    assert.match(hub.text, /data-ac-website-action="catalogue"/);
    assert.match(hub.text, /\/app\/settings\/website\/catalogue/);

    const doctorsPage = await request(app)
      .get("/app/settings/website/catalogue?tab=doctors")
      .set("Cookie", cookie);
    assert.equal(doctorsPage.status, 200, doctorsPage.text.slice(0, 300));
    assert.match(doctorsPage.text, re(doctorName));
    assert.match(doctorsPage.text, /Needs profile information|Show on website|Hidden from website|Visible on website/);
    assert.match(doctorsPage.text, re(`data-ac-catalogue-id="${doctor.id}"`));
    const start = doctorsPage.text.indexOf("data-ac-page-section=\"website-catalogue\"");
    const end = doctorsPage.text.indexOf("</section>", start);
    const catalogueHtml = String(doctorsPage.text).slice(start, end > start ? end : undefined);
    assert.doesNotMatch(catalogueHtml, /\/app\/staff|\/app\/payroll|\/app\/appointments/);

    const showDoctor = await catalogueAction(app, cookie, "doctor", doctor.id, "show");
    assert.equal(showDoctor.status, 303, String(showDoctor.headers.location || showDoctor.text));
    const shownDoctors = await request(app)
      .get("/app/settings/website/catalogue?tab=doctors")
      .set("Cookie", cookie);
    assert.match(shownDoctors.text, /Visible on website/);
    assert.match(
      shownDoctors.text,
      new RegExp(`data-ac-catalogue-id="${doctor.id}"[^>]*data-ac-catalogue-visible="1"`)
    );

    const showInactive = await catalogueAction(app, cookie, "doctor", inactive.id, "show");
    assert.equal(showInactive.status, 303);
    assert.match(String(showInactive.headers.location || ""), /code=inactive/);

    await publishWebsite(clinic);
    const liveDoctors = await request(app).get(`/clinics/${clinic.slug}/doctors`);
    assert.equal(liveDoctors.status, 200, liveDoctors.text.slice(0, 300));
    assert.match(liveDoctors.text, re(doctorName));
    const liveHome = await request(app).get(`/clinics/${clinic.slug}`);
    assert.equal(liveHome.status, 200, liveHome.text.slice(0, 300));
    assert.match(liveHome.text, re(doctorName));
    assert.match(liveHome.text, /ac-doctor-card/);
    const keyRow = await pool.query(
      `SELECT public_profile_key, public_profile_enabled FROM activeclinic.staff_members WHERE id = $1`,
      [doctor.id]
    );
    const staffKey = keyRow.rows[0].public_profile_key;
    assert.equal(keyRow.rows[0].public_profile_enabled, true);
    const liveDoctor = await request(app).get(`/clinics/${clinic.slug}/doctors/${staffKey}`);
    assert.equal(liveDoctor.status, 200, liveDoctor.text.slice(0, 200));

    const hideDoctor = await catalogueAction(app, cookie, "doctor", doctor.id, "hide");
    assert.equal(hideDoctor.status, 303);
    const liveStillShown = await request(app).get(`/clinics/${clinic.slug}/doctors`);
    assert.match(liveStillShown.text, re(doctorName));
    const draftHidden = await request(app)
      .get(`/clinics/${clinic.slug}/doctors?website_mode=draft`)
      .set("Cookie", cookie);
    assert.doesNotMatch(draftHidden.text, re(doctorName));
    await publishWebsite(clinic);
    const liveHidden = await request(app).get(`/clinics/${clinic.slug}/doctors`);
    assert.doesNotMatch(liveHidden.text, re(doctorName));
    const homeHidden = await request(app).get(`/clinics/${clinic.slug}`);
    assert.doesNotMatch(homeHidden.text, re(doctorName));
    const hiddenDetail = await request(app).get(`/clinics/${clinic.slug}/doctors/${staffKey}`);
    assert.equal(hiddenDetail.status, 404);
    const staffAfterHide = await pool.query(
      `SELECT status, public_profile_enabled FROM activeclinic.staff_members WHERE id = $1`,
      [doctor.id]
    );
    assert.equal(staffAfterHide.rows[0].status, "active");
    assert.equal(staffAfterHide.rows[0].public_profile_enabled, true);

    const showService = await catalogueAction(app, cookie, "service", service.id, "show");
    assert.equal(showService.status, 303, String(showService.headers.location || showService.text));
    await publishWebsite(clinic);
    const liveServices = await request(app).get(`/clinics/${clinic.slug}/services`);
    assert.match(liveServices.text, re(serviceName));
    const websiteList = await listWebsiteServices(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: await resolveHcoId(clinic),
    });
    const bookableList = await listPublicServices(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: await resolveHcoId(clinic),
    });
    assert.ok(websiteList.services.some((row) => row.displayName === serviceName));
    assert.equal(
      bookableList.services.some((row) => row.displayName === serviceName),
      false
    );
    const flags = await pool.query(
      `SELECT public_bookable, public_website_visible FROM activeclinic.appointment_service_types WHERE id = $1`,
      [service.id]
    );
    assert.equal(flags.rows[0].public_website_visible, true);
    assert.equal(flags.rows[0].public_bookable, false);
    const serviceDetail = await request(app).get(
      `/clinics/${clinic.slug}/services/${service.service_key}`
    );
    assert.equal(serviceDetail.status, 200);
    assert.match(serviceDetail.text, /Online booking is not available for this service/);

    const hideService = await catalogueAction(app, cookie, "service", service.id, "hide");
    assert.equal(hideService.status, 303);
    await publishWebsite(clinic);
    const liveServicesHidden = await request(app).get(`/clinics/${clinic.slug}/services`);
    assert.doesNotMatch(liveServicesHidden.text, re(serviceName));

    const stealDoctor = await catalogueAction(app, cookieB, "doctor", doctor.id, "show");
    assert.ok([303, 404].includes(stealDoctor.status), String(stealDoctor.status));
    if (stealDoctor.status === 303) {
      assert.match(String(stealDoctor.headers.location || ""), /error=1|code=not_found/);
    }
    const stealService = await catalogueAction(app, cookieB, "service", service.id, "show");
    assert.ok([303, 404].includes(stealService.status), String(stealService.status));
    const otherCatalogue = await request(app)
      .get("/app/settings/website/catalogue?tab=doctors")
      .set("Cookie", cookieB);
    assert.equal(otherCatalogue.status, 200);
    assert.doesNotMatch(otherCatalogue.text, re(doctorName));
    assert.match(otherCatalogue.text, re(otherDoctor.displayName || `Dr Other ${other.stamp}`));
    const otherServices = await request(app)
      .get("/app/settings/website/catalogue?tab=services")
      .set("Cookie", cookieB);
    assert.doesNotMatch(otherServices.text, re(serviceName));
    assert.match(otherServices.text, re(otherService.display_name));

    assert.equal(await countRows("activeclinic.staff_members", clinic.organizationId), staffBefore);
    assert.equal(
      await countRows("activeclinic.appointment_service_types", clinic.organizationId),
      servicesBefore
    );
    const overlay = await pool.query(
      `SELECT c.organization_id, c.draft_value
         FROM platform.website_content c
         JOIN platform.website_instances i ON i.id = c.instance_id
        WHERE i.organization_id = $1
          AND i.product_code = 'activeclinic'
          AND c.content_key = 'cms.library'
        LIMIT 1`,
      [clinic.organizationId]
    );
    assert.equal(overlay.rows[0].organization_id, clinic.organizationId);
    const overlayText = JSON.stringify(overlay.rows[0].draft_value || []);
    assert.match(overlayText, re(staffKey));
    const otherOverlay = await pool.query(
      `SELECT c.organization_id, c.draft_value
         FROM platform.website_content c
         JOIN platform.website_instances i ON i.id = c.instance_id
        WHERE i.organization_id = $1
          AND i.product_code = 'activeclinic'
          AND c.content_key = 'cms.library'
        LIMIT 1`,
      [other.organizationId]
    );
    assert.doesNotMatch(JSON.stringify(otherOverlay.rows[0] && otherOverlay.rows[0].draft_value), re(staffKey));
  });

  it("reuses website.edit for catalogue writes and keeps receptionist out", async () => {
    requireDb();
    const clinic = await provisionClinic();
    const app = makeApp();
    const hcoId = await resolveHcoId(clinic);
    const facility = await pool.query(
      `SELECT id FROM activeclinic.facilities WHERE organization_id = $1 LIMIT 1`,
      [clinic.organizationId]
    );
    const facilityId = facility.rows[0].id;
    async function seedRole(roleKey, email) {
      const phone = nextPhone();
      const identity = await createPlatformIdentity(pool, {
        primaryEmail: email,
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
        healthcareOrganizationId: hcoId,
        firstName: "Role",
        lastName: roleKey.slice(-8),
        employmentType: "permanent",
        status: "active",
        phone,
        platformIdentityId: identity.identity.id,
      });
      assert.equal(staff.ok, true, JSON.stringify(staff));
      await assignStaffToFacility(pool, {
        organizationId: clinic.organizationId,
        staffMemberId: staff.staffMember.id,
        facilityId,
        isPrimary: true,
      });
      const role = await assignStaffRole(pool, {
        organizationId: clinic.organizationId,
        staffMemberId: staff.staffMember.id,
        roleKey,
        scopeType: "facility",
        facilityId,
        assignmentOrigin: "system",
      });
      assert.equal(role.ok, true, JSON.stringify(role));
      return sessionCookie(identity.identity.id, clinic.organizationId);
    }
    const editorCookie = await seedRole(WEBSITE_EDITOR, `editor-${clinic.stamp}@example.invalid`);
    const recCookie = await seedRole(RECEPTIONIST, `rec-${clinic.stamp}@example.invalid`);
    const editorPage = await request(app)
      .get("/app/settings/website/catalogue")
      .set("Cookie", editorCookie);
    assert.equal(editorPage.status, 200);
    assert.doesNotMatch(editorPage.text, /\/app\/staff/);
    const recPage = await request(app)
      .get("/app/settings/website/catalogue")
      .set("Cookie", recCookie);
    assert.equal(recPage.status, 403);
    const anon = await request(app).get("/app/settings/website/catalogue");
    assert.ok([302, 303, 401].includes(anon.status));
  });

  it("walks registration through catalogue publish, hide, and restore without Platform Admin", async () => {
    requireDb();
    const app = makeApp();
    const stamp = uniq("e2e");
    const payload = {
      clinicName: `Catalogue E2E ${stamp}`,
      contactName: "Clinic Admin",
      contactEmail: `${stamp}@clinic.example`,
      contactPhone: nextPhone(),
      province: "Lusaka",
      city: "Lusaka",
      address: "1 Independence Avenue",
      countryCode: "ZM",
      notes: "catalogue e2e",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      acceptTerms: "on",
    };
    const form = await request(app).get("/register-clinic").set("Host", AC_HOST);
    assert.equal(form.status, 200);
    const csrfCookie = extractCookie(form, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const confirm = await request(app)
      .post("/register-clinic")
      .set("Host", AC_HOST)
      .set("Cookie", csrfCookie ? `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfCookie}` : "")
      .redirects(0)
      .type("form")
      .send({ [CSRF_FIELD]: extractCsrf(form) || "", action: "confirm", ...payload });
    assert.equal(confirm.status, 303, confirm.text && confirm.text.slice(0, 400));
    const org = await pool.query(
      `SELECT organization_id FROM activeclinic.clinic_registration_applications
        WHERE contact_email_normalized = $1`,
      [payload.contactEmail.toLowerCase()]
    );
    const organizationId = org.rows[0].organization_id;
    const slug = (
      await pool.query(`SELECT organization_key FROM platform.organizations WHERE id = $1`, [
        organizationId,
      ])
    ).rows[0].organization_key;
    const identityId = (
      await pool.query(`SELECT id FROM platform.identities WHERE email_normalized = $1 LIMIT 1`, [
        payload.contactEmail.toLowerCase(),
      ])
    ).rows[0].id;
    const loginGet = await request(app).get("/login").set("Host", AC_HOST);
    const loginPost = await request(app)
      .post("/login")
      .set("Host", AC_HOST)
      .set("Cookie", extractCookie(loginGet, CSRF_COOKIE_ACTIVECLINIC_ORG)
        ? `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${extractCookie(loginGet, CSRF_COOKIE_ACTIVECLINIC_ORG)}`
        : "")
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(loginGet),
        identifier: payload.contactEmail,
        password: PASSWORD,
      });
    assert.equal(loginPost.status, 303);
    const session = `${COOKIE_ACTIVECLINIC_ORG}=${extractCookie(loginPost, COOKIE_ACTIVECLINIC_ORG)}`;

    const hub = await request(app).get("/app/settings/website").set("Host", AC_HOST).set("Cookie", session);
    assert.equal(hub.status, 200);
    assert.match(hub.text, /Public Catalogue/);

    const branding = await request(app)
      .get("/app/settings/website/branding")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    const brandingSave = await request(app)
      .post("/app/settings/website/branding")
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, branding))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(branding),
        primaryColor: "#0d9488",
        accentColor: "#0f766e",
      });
    assert.equal(brandingSave.status, 303);

    const libraryNew = await request(app)
      .get("/app/settings/website/library/new")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    const faqTitle = `Visit notes ${stamp}`;
    const addFaq = await request(app)
      .post("/app/settings/website/library")
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, libraryNew))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(libraryNew),
        type: "faq",
        websiteOnly: "1",
        title: faqTitle,
        body: "Bring your clinic card.",
        visible: "1",
      });
    assert.equal(addFaq.status, 303, addFaq.text);

    const adminStaff = await pool.query(
      `SELECT id, display_name FROM activeclinic.staff_members
        WHERE organization_id = $1 AND platform_identity_id = $2 LIMIT 1`,
      [organizationId, identityId]
    );
    assert.ok(adminStaff.rows[0], "registered admin staff exists");
    const service = await insertServiceType(pool, {
      organizationId,
      healthcareOrganizationId: (
        await pool.query(
          `SELECT id FROM activeclinic.healthcare_organizations WHERE organization_id = $1 LIMIT 1`,
          [organizationId]
        )
      ).rows[0].id,
      serviceKey: `e2e-consult-${stamp}`,
      displayName: `E2E consult ${stamp}`,
      description: "Canonical service for catalogue e2e",
      status: "active",
    });
    const showAdmin = await catalogueAction(app, session, "doctor", adminStaff.rows[0].id, "show");
    assert.equal(showAdmin.status, 303, String(showAdmin.headers.location || showAdmin.text));
    const showSvc = await catalogueAction(app, session, "service", service.id, "show");
    assert.equal(showSvc.status, 303);

    const createPage = await request(app)
      .get("/app/settings/website/pages/new")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    const createdPage = await request(app)
      .post("/app/settings/website/pages")
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, createPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(createPage),
        title: "Patient notes",
        slug: "patient-notes",
        templateKey: "blank",
        inNav: "1",
      });
    assert.equal(createdPage.status, 303, createdPage.text);

    const preview = await request(app)
      .get(`/clinics/${slug}/doctors?website_mode=draft`)
      .set("Host", AC_HOST)
      .set("Cookie", session);
    assert.equal(preview.status, 200);
    assert.match(preview.text, re(adminStaff.rows[0].display_name));

    const publishPage = await request(app)
      .get("/app/settings/website/publish")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    const publish = await request(app)
      .post(`/clinics/${slug}/website/publish`)
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, publishPage))
      .type("form")
      .send({ [CSRF_FIELD]: extractCsrf(publishPage), makePublic: "1" });
    assert.ok([200, 303].includes(publish.status), `publish ${publish.status}`);

    const liveDoctors = await request(app).get(`/clinics/${slug}/doctors`).set("Host", AC_HOST);
    assert.match(liveDoctors.text, re(adminStaff.rows[0].display_name));
    const liveServices = await request(app).get(`/clinics/${slug}/services`).set("Host", AC_HOST);
    assert.match(liveServices.text, re(`E2E consult ${stamp}`));
    const liveCustom = await request(app)
      .get(`/clinics/${slug}/p/patient-notes`)
      .set("Host", AC_HOST);
    assert.equal(liveCustom.status, 200);

    const hide = await catalogueAction(app, session, "doctor", adminStaff.rows[0].id, "hide");
    assert.equal(hide.status, 303);
    const liveStill = await request(app).get(`/clinics/${slug}/doctors`).set("Host", AC_HOST);
    assert.match(liveStill.text, re(adminStaff.rows[0].display_name));
    const republish = await request(app)
      .post(`/clinics/${slug}/website/publish`)
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, publishPage))
      .type("form")
      .send({ [CSRF_FIELD]: extractCsrf(publishPage), makePublic: "1" });
    assert.ok([200, 303].includes(republish.status));
    const liveGone = await request(app).get(`/clinics/${slug}/doctors`).set("Host", AC_HOST);
    assert.doesNotMatch(liveGone.text, re(adminStaff.rows[0].display_name));

    const versions = await request(app)
      .get(`/clinics/${slug}/website/versions`)
      .set("Host", AC_HOST)
      .set("Cookie", session)
      .set("Accept", "application/json");
    const listed = JSON.parse(versions.text);
    const firstPublished = (listed.versions || [])
      .slice()
      .sort((a, b) => Number(a.versionNumber) - Number(b.versionNumber))[0];
    assert.ok(firstPublished && firstPublished.id, JSON.stringify(listed));
    const history = await request(app)
      .get(`/clinics/${slug}/website/history`)
      .set("Host", AC_HOST)
      .set("Cookie", session);
    const restore = await request(app)
      .post(`/clinics/${slug}/website/versions/${firstPublished.id}/restore`)
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, history))
      .type("form")
      .send({ [CSRF_FIELD]: extractCsrf(history) });
    assert.ok([200, 303].includes(restore.status), `restore ${restore.status}`);
    const publishRestored = await request(app)
      .post(`/clinics/${slug}/website/publish`)
      .set("Host", AC_HOST)
      .set("Cookie", mergeCookies(session, history))
      .type("form")
      .send({ [CSRF_FIELD]: extractCsrf(history), makePublic: "1" });
    assert.ok([200, 303].includes(publishRestored.status));
    const liveRestored = await request(app).get(`/clinics/${slug}/doctors`).set("Host", AC_HOST);
    assert.match(liveRestored.text, re(adminStaff.rows[0].display_name));
  });

  it("lets website editors create, edit, disable, and publish catalogue services", async () => {
    requireDb();
    const clinic = await provisionClinic();
    const app = makeApp();
    const cookie = await sessionCookie(clinic.identityId, clinic.organizationId);
    const name = `Managed Service ${clinic.stamp}`;
    const edited = `Edited Service ${clinic.stamp}`;

    const newPage = await request(app)
      .get("/app/settings/website/catalogue/services/new")
      .set("Cookie", cookie);
    assert.equal(newPage.status, 200, newPage.text.slice(0, 300));
    assert.match(newPage.text, /Add service/);
    assert.match(newPage.text, /name="category"/);
    assert.match(newPage.text, /name="imageMediaId"/);
    assert.doesNotMatch(newPage.text, /name="publicWebsiteVisible"[^>]*checked/);

    const created = await request(app)
      .post("/app/settings/website/catalogue/services/new")
      .set("Cookie", mergeCookies(cookie, newPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(newPage),
        displayName: name,
        description: "Canonical service description",
        publicSummary: "Public summary",
        defaultDurationMinutes: "45",
        publicWebsiteVisible: "1",
      })
      .redirects(0);
    assert.equal(created.status, 303, created.text.slice(0, 400));

    const row = await pool.query(
      `SELECT id, service_key, display_name, status, public_website_visible, public_summary,
              default_duration_minutes
         FROM activeclinic.appointment_service_types
        WHERE organization_id = $1 AND display_name = $2
        LIMIT 1`,
      [clinic.organizationId, name]
    );
    assert.equal(row.rows.length, 1);
    assert.equal(row.rows[0].public_website_visible, true);
    assert.equal(Number(row.rows[0].default_duration_minutes), 45);

    const list = await listWebsiteServices(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: await resolveHcoId(clinic),
    });
    assert.ok(list.services.some((s) => s.displayName === name));

    const editPage = await request(app)
      .get(`/app/settings/website/catalogue/services/${row.rows[0].id}/edit`)
      .set("Cookie", cookie);
    assert.equal(editPage.status, 200);
    const updated = await request(app)
      .post(`/app/settings/website/catalogue/services/${row.rows[0].id}/edit`)
      .set("Cookie", mergeCookies(cookie, editPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(editPage),
        displayName: edited,
        description: "Updated description",
        publicSummary: "Updated summary",
        defaultDurationMinutes: "60",
        publicWebsiteVisible: "1",
        status: "active",
      })
      .redirects(0);
    assert.equal(updated.status, 303);

    const afterEdit = await pool.query(
      `SELECT display_name, public_summary, default_duration_minutes, status
         FROM activeclinic.appointment_service_types WHERE id = $1`,
      [row.rows[0].id]
    );
    assert.equal(afterEdit.rows[0].display_name, edited);
    assert.equal(afterEdit.rows[0].public_summary, "Updated summary");
    assert.equal(Number(afterEdit.rows[0].default_duration_minutes), 60);

    await publishWebsite(clinic);
    const publicPage = await request(app).get(`/clinics/${clinic.slug}/services`);
    assert.match(publicPage.text, re(edited));

    const disabled = await request(app)
      .post(`/app/settings/website/catalogue/services/${row.rows[0].id}/edit`)
      .set("Cookie", mergeCookies(cookie, editPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(editPage),
        displayName: edited,
        description: "Updated description",
        publicSummary: "Updated summary",
        defaultDurationMinutes: "60",
        status: "inactive",
      })
      .redirects(0);
    assert.equal(disabled.status, 303);
    const afterDisable = await pool.query(
      `SELECT status, public_website_visible FROM activeclinic.appointment_service_types WHERE id = $1`,
      [row.rows[0].id]
    );
    assert.equal(afterDisable.rows[0].status, "inactive");
    assert.equal(afterDisable.rows[0].public_website_visible, false);

    await publishWebsite(clinic);
    const publicHidden = await request(app).get(`/clinics/${clinic.slug}/services`);
    assert.doesNotMatch(publicHidden.text, re(edited));

    const underscoreName = `Underscore Service ${clinic.stamp}`;
    const underscoreKey = `general_consultation_${clinic.stamp}`;
    const underscorePage = await request(app)
      .get("/app/settings/website/catalogue/services/new")
      .set("Cookie", cookie);
    const underscoreCreated = await request(app)
      .post("/app/settings/website/catalogue/services/new")
      .set("Cookie", mergeCookies(cookie, underscorePage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(underscorePage),
        displayName: underscoreName,
        serviceKey: underscoreKey,
        description: "Normalized key",
        publicSummary: "Normalized",
        defaultDurationMinutes: "25",
        publicWebsiteVisible: "1",
      })
      .redirects(0);
    assert.equal(underscoreCreated.status, 303, underscoreCreated.text.slice(0, 400));
    const underscoreRow = await pool.query(
      `SELECT service_key, default_duration_minutes
         FROM activeclinic.appointment_service_types
        WHERE organization_id = $1 AND display_name = $2
        LIMIT 1`,
      [clinic.organizationId, underscoreName]
    );
    assert.equal(underscoreRow.rows.length, 1);
    assert.equal(
      underscoreRow.rows[0].service_key,
      underscoreKey.replace(/_/g, "-")
    );
    assert.equal(Number(underscoreRow.rows[0].default_duration_minutes), 25);

    const draftName = `Draft Service ${clinic.stamp}`;
    const draftPage = await request(app)
      .get("/app/settings/website/catalogue/services/new")
      .set("Cookie", cookie);
    const draftCreated = await request(app)
      .post("/app/settings/website/catalogue/services/new")
      .set("Cookie", mergeCookies(cookie, draftPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(draftPage),
        displayName: draftName,
        category: "Diagnostics",
        description: "Draft catalogue service",
        defaultDurationMinutes: "30",
      })
      .redirects(0);
    assert.equal(draftCreated.status, 303, draftCreated.text.slice(0, 400));
    const draftRow = await pool.query(
      `SELECT id, service_key, public_website_visible, public_summary
         FROM activeclinic.appointment_service_types
        WHERE organization_id = $1 AND display_name = $2
        LIMIT 1`,
      [clinic.organizationId, draftName]
    );
    assert.equal(draftRow.rows.length, 1);
    assert.equal(draftRow.rows[0].public_website_visible, false);
    assert.equal(draftRow.rows[0].public_summary, "Diagnostics");
    const draftList = await listWebsiteServices(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: await resolveHcoId(clinic),
    });
    assert.ok(!draftList.services.some((s) => s.displayName === draftName));

    const digitName = `24 Hour Labs ${clinic.stamp}`;
    const digitPage = await request(app)
      .get("/app/settings/website/catalogue/services/new")
      .set("Cookie", cookie);
    const digitCreated = await request(app)
      .post("/app/settings/website/catalogue/services/new")
      .set("Cookie", mergeCookies(cookie, digitPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(digitPage),
        displayName: digitName,
        description: "Leading digits normalized",
        publicWebsiteVisible: "1",
      })
      .redirects(0);
    assert.equal(digitCreated.status, 303, digitCreated.text.slice(0, 400));
    const digitRow = await pool.query(
      `SELECT service_key, public_website_visible
         FROM activeclinic.appointment_service_types
        WHERE organization_id = $1 AND display_name = $2
        LIMIT 1`,
      [clinic.organizationId, digitName]
    );
    assert.equal(digitRow.rows.length, 1);
    assert.match(digitRow.rows[0].service_key, /^[a-z]/);
    assert.equal(digitRow.rows[0].public_website_visible, true);

    const recCookie = await (async () => {
      const hcoId = await resolveHcoId(clinic);
      const facility = await pool.query(
        `SELECT id FROM activeclinic.facilities WHERE organization_id = $1 LIMIT 1`,
        [clinic.organizationId]
      );
      const phone = nextPhone();
      const identity = await createPlatformIdentity(pool, {
        primaryEmail: `rec-svc-${clinic.stamp}@example.invalid`,
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
        organizationId: clinic.organizationId,
        healthcareOrganizationId: hcoId,
        firstName: "Rec",
        lastName: "Svc",
        employmentType: "permanent",
        status: "active",
        phone,
        platformIdentityId: identity.identity.id,
      });
      assert.equal(staff.ok, true);
      await assignStaffToFacility(pool, {
        organizationId: clinic.organizationId,
        staffMemberId: staff.staffMember.id,
        facilityId: facility.rows[0].id,
        isPrimary: true,
      });
      const role = await assignStaffRole(pool, {
        organizationId: clinic.organizationId,
        staffMemberId: staff.staffMember.id,
        roleKey: RECEPTIONIST,
        scopeType: "facility",
        facilityId: facility.rows[0].id,
        assignmentOrigin: "system",
      });
      assert.equal(role.ok, true);
      return sessionCookie(identity.identity.id, clinic.organizationId);
    })();

    const denied = await request(app)
      .post("/app/settings/website/catalogue/services/new")
      .set("Cookie", mergeCookies(recCookie, newPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(newPage),
        displayName: `Denied ${clinic.stamp}`,
        publicWebsiteVisible: "1",
      })
      .redirects(0);
    assert.equal(denied.status, 403);
  });

  it("lets website editors create, edit, unpublish, and delete public doctor profiles without login", async () => {
    requireDb();
    const clinic = await provisionClinic();
    const app = makeApp();
    const cookie = await sessionCookie(clinic.identityId, clinic.organizationId);
    const name = `Dr Managed ${clinic.stamp}`;
    const edited = `Dr Edited ${clinic.stamp}`;

    const newPage = await request(app)
      .get("/app/settings/website/catalogue/doctors/new")
      .set("Cookie", cookie);
    assert.equal(newPage.status, 200, newPage.text.slice(0, 300));
    assert.match(newPage.text, /Add doctor profile/);
    assert.match(newPage.text, /does not create a staff login/);
    assert.match(newPage.text, /name="professionalTitle"/);
    assert.match(newPage.text, /name="qualifications"/);
    assert.doesNotMatch(newPage.text, /name="publicWebsiteVisible"[^>]*checked/);

    const created = await request(app)
      .post("/app/settings/website/catalogue/doctors/new")
      .set("Cookie", mergeCookies(cookie, newPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(newPage),
        publicDisplayName: name,
        specialty: "Cardiologist",
        biography: "Public biography for website visitors.",
        publicWebsiteVisible: "1",
      })
      .redirects(0);
    assert.equal(created.status, 303, created.text.slice(0, 400));

    const row = await pool.query(
      `SELECT id, platform_identity_id, public_display_name, public_title, public_bio,
              public_profile_key, public_profile_enabled, status
         FROM activeclinic.staff_members
        WHERE organization_id = $1 AND public_display_name = $2
        LIMIT 1`,
      [clinic.organizationId, name]
    );
    assert.equal(row.rows.length, 1);
    assert.equal(row.rows[0].platform_identity_id, null);
    assert.equal(row.rows[0].public_profile_enabled, true);
    assert.equal(row.rows[0].public_title, "Cardiologist");
    assert.equal(row.rows[0].public_bio, "Public biography for website visitors.");
    assert.ok(row.rows[0].public_profile_key);

    const catalogue = await request(app)
      .get("/app/settings/website/catalogue?tab=doctors")
      .set("Cookie", cookie);
    assert.match(catalogue.text, re(name));
    assert.match(catalogue.text, /Add doctor profile/);
    assert.match(catalogue.text, re(`/app/settings/website/catalogue/doctors/${row.rows[0].id}/edit`));

    const editPage = await request(app)
      .get(`/app/settings/website/catalogue/doctors/${row.rows[0].id}/edit`)
      .set("Cookie", cookie);
    assert.equal(editPage.status, 200);
    assert.match(editPage.text, /Edit doctor profile/);

    const updated = await request(app)
      .post(`/app/settings/website/catalogue/doctors/${row.rows[0].id}/edit`)
      .set("Cookie", mergeCookies(cookie, editPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(editPage),
        publicDisplayName: edited,
        specialty: "Pediatrician",
        biography: "Updated biography.",
        publicWebsiteVisible: "1",
        status: "active",
      })
      .redirects(0);
    assert.equal(updated.status, 303);

    const afterEdit = await pool.query(
      `SELECT public_display_name, public_title, public_bio, public_profile_enabled, platform_identity_id
         FROM activeclinic.staff_members WHERE id = $1`,
      [row.rows[0].id]
    );
    assert.equal(afterEdit.rows[0].public_display_name, edited);
    assert.equal(afterEdit.rows[0].public_title, "Pediatrician");
    assert.equal(afterEdit.rows[0].public_bio, "Updated biography.");
    assert.equal(afterEdit.rows[0].platform_identity_id, null);

    await publishWebsite(clinic);
    const publicPage = await request(app).get(`/clinics/${clinic.slug}/doctors`);
    assert.match(publicPage.text, re(edited));
    const detail = await request(app).get(
      `/clinics/${clinic.slug}/doctors/${row.rows[0].public_profile_key}`
    );
    assert.equal(detail.status, 200);
    assert.match(detail.text, re(edited));
    assert.match(detail.text, /Updated biography/);

    const unpublished = await request(app)
      .post(`/app/settings/website/catalogue/doctors/${row.rows[0].id}/edit`)
      .set("Cookie", mergeCookies(cookie, editPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(editPage),
        publicDisplayName: edited,
        specialty: "Pediatrician",
        biography: "Updated biography.",
        status: "active",
      })
      .redirects(0);
    assert.equal(unpublished.status, 303);
    const afterHide = await pool.query(
      `SELECT public_profile_enabled FROM activeclinic.staff_members WHERE id = $1`,
      [row.rows[0].id]
    );
    assert.equal(afterHide.rows[0].public_profile_enabled, false);

    await publishWebsite(clinic);
    const publicHidden = await request(app).get(`/clinics/${clinic.slug}/doctors`);
    assert.doesNotMatch(publicHidden.text, re(edited));

    const deleted = await request(app)
      .post(`/app/settings/website/catalogue/doctors/${row.rows[0].id}/delete`)
      .set("Cookie", mergeCookies(cookie, editPage))
      .type("form")
      .send({ [CSRF_FIELD]: extractCsrf(editPage) })
      .redirects(0);
    assert.equal(deleted.status, 303);
    const afterDelete = await pool.query(
      `SELECT status, public_profile_enabled FROM activeclinic.staff_members WHERE id = $1`,
      [row.rows[0].id]
    );
    assert.equal(afterDelete.rows[0].status, "archived");
    assert.equal(afterDelete.rows[0].public_profile_enabled, false);

    const other = await provisionClinic();
    const otherCookie = await sessionCookie(other.identityId, other.organizationId);
    const otherNewPage = await request(app)
      .get("/app/settings/website/catalogue/doctors/new")
      .set("Cookie", otherCookie);
    const steal = await request(app)
      .post("/app/settings/website/catalogue/doctors/new")
      .set("Cookie", mergeCookies(otherCookie, otherNewPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(otherNewPage),
        publicDisplayName: `Dr Steal ${other.stamp}`,
        specialty: "GP",
        publicWebsiteVisible: "1",
      })
      .redirects(0);
    assert.equal(steal.status, 303, steal.text.slice(0, 400));
    const stealRow = await pool.query(
      `SELECT id FROM activeclinic.staff_members
        WHERE organization_id = $1 AND public_display_name = $2 LIMIT 1`,
      [other.organizationId, `Dr Steal ${other.stamp}`]
    );
    assert.equal(stealRow.rows.length, 1);
    const crossEdit = await request(app)
      .post(`/app/settings/website/catalogue/doctors/${stealRow.rows[0].id}/edit`)
      .set("Cookie", mergeCookies(cookie, editPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(editPage),
        publicDisplayName: "Should Not Save",
        specialty: "X",
        publicWebsiteVisible: "1",
      })
      .redirects(0);
    assert.equal(crossEdit.status, 404);

    const recCookie = await (async () => {
      const hcoId = await resolveHcoId(clinic);
      const facility = await pool.query(
        `SELECT id FROM activeclinic.facilities WHERE organization_id = $1 LIMIT 1`,
        [clinic.organizationId]
      );
      const phone = nextPhone();
      const identity = await createPlatformIdentity(pool, {
        primaryEmail: `rec-doc-${clinic.stamp}@example.invalid`,
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
        organizationId: clinic.organizationId,
        healthcareOrganizationId: hcoId,
        firstName: "Rec",
        lastName: "Doc",
        employmentType: "permanent",
        status: "active",
        phone,
        platformIdentityId: identity.identity.id,
      });
      assert.equal(staff.ok, true);
      await assignStaffToFacility(pool, {
        organizationId: clinic.organizationId,
        staffMemberId: staff.staffMember.id,
        facilityId: facility.rows[0].id,
        isPrimary: true,
      });
      const role = await assignStaffRole(pool, {
        organizationId: clinic.organizationId,
        staffMemberId: staff.staffMember.id,
        roleKey: RECEPTIONIST,
        scopeType: "facility",
        facilityId: facility.rows[0].id,
        assignmentOrigin: "system",
      });
      assert.equal(role.ok, true);
      return sessionCookie(identity.identity.id, clinic.organizationId);
    })();

    const denied = await request(app)
      .post("/app/settings/website/catalogue/doctors/new")
      .set("Cookie", mergeCookies(recCookie, newPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(newPage),
        publicDisplayName: `Denied Doc ${clinic.stamp}`,
        specialty: "GP",
        publicWebsiteVisible: "1",
      })
      .redirects(0);
    assert.equal(denied.status, 403);
  });

  it("publishes an existing clinician profile without creating a duplicate staff row", async () => {
    requireDb();
    const clinic = await provisionClinic();
    const app = makeApp();
    const cookie = await sessionCookie(clinic.identityId, clinic.organizationId);
    const hcoId = await resolveHcoId(clinic);
    const phone = nextPhone();
    const staff = await createStaffMember(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: hcoId,
      firstName: "Existing",
      lastName: `Clinician${clinic.stamp}`,
      employmentType: "permanent",
      status: "active",
      phone,
      email: null,
    });
    assert.equal(staff.ok, true, JSON.stringify(staff));
    const staffId = staff.staffMember.id;
    const beforeCount = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.staff_members
        WHERE organization_id = $1 AND healthcare_organization_id = $2 AND status <> 'archived'`,
      [clinic.organizationId, hcoId]
    );

    const newPage = await request(app)
      .get("/app/settings/website/catalogue/doctors/new")
      .set("Cookie", cookie);
    assert.equal(newPage.status, 200);
    assert.match(newPage.text, re(staffId));

    const publicName = `Dr Existing ${clinic.stamp}`;
    const created = await request(app)
      .post("/app/settings/website/catalogue/doctors/new")
      .set("Cookie", mergeCookies(cookie, newPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(newPage),
        existingStaffId: staffId,
        publicDisplayName: publicName,
        professionalTitle: "Consultant",
        specialty: "Internal Medicine",
        qualifications: "MBChB",
        biography: "Existing clinician biography.",
        publicWebsiteVisible: "1",
      })
      .redirects(0);
    assert.equal(created.status, 303, created.text.slice(0, 400));

    const afterCount = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.staff_members
        WHERE organization_id = $1 AND healthcare_organization_id = $2 AND status <> 'archived'`,
      [clinic.organizationId, hcoId]
    );
    assert.equal(afterCount.rows[0].n, beforeCount.rows[0].n);

    const row = await pool.query(
      `SELECT id, public_display_name, public_title, job_title, public_bio, public_profile_enabled,
              public_profile_key, platform_identity_id
         FROM activeclinic.staff_members WHERE id = $1`,
      [staffId]
    );
    assert.equal(row.rows[0].public_display_name, publicName);
    assert.equal(row.rows[0].public_title, "Consultant");
    assert.equal(row.rows[0].job_title, "Internal Medicine");
    assert.match(String(row.rows[0].public_bio || ""), /Qualifications:\s*MBChB/);
    assert.equal(row.rows[0].public_profile_enabled, true);
    assert.ok(row.rows[0].public_profile_key);

    const draftName = `Dr Draft ${clinic.stamp}`;
    const draftPage = await request(app)
      .get("/app/settings/website/catalogue/doctors/new")
      .set("Cookie", cookie);
    const draftCreated = await request(app)
      .post("/app/settings/website/catalogue/doctors/new")
      .set("Cookie", mergeCookies(cookie, draftPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(draftPage),
        publicDisplayName: draftName,
        specialty: "GP",
        biography: "Draft only",
      })
      .redirects(0);
    assert.equal(draftCreated.status, 303);
    const draftRow = await pool.query(
      `SELECT public_profile_enabled FROM activeclinic.staff_members
        WHERE organization_id = $1 AND public_display_name = $2 LIMIT 1`,
      [clinic.organizationId, draftName]
    );
    assert.equal(draftRow.rows[0].public_profile_enabled, false);

    await publishWebsite(clinic);
    const publicDoctors = await request(app).get(`/clinics/${clinic.slug}/doctors`);
    assert.match(publicDoctors.text, re(publicName));
    assert.match(publicDoctors.text, /Internal Medicine/);
    assert.doesNotMatch(publicDoctors.text, re(draftName));
  });

  it("persists doctor photo through edit and renders it on public list and detail", async () => {
    requireDb();
    const clinic = await provisionClinic();
    const app = makeApp();
    const cookie = await sessionCookie(clinic.identityId, clinic.organizationId);
    const name = `Dr Photo ${clinic.stamp}`;
    const photoMediaId = crypto.randomUUID();
    const photoSrc = `/clinics/${clinic.slug}/website/media/${photoMediaId}`;

    const newPage = await request(app)
      .get("/app/settings/website/catalogue/doctors/new")
      .set("Cookie", cookie);
    assert.equal(newPage.status, 200);

    const created = await request(app)
      .post("/app/settings/website/catalogue/doctors/new")
      .set("Cookie", mergeCookies(cookie, newPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(newPage),
        publicDisplayName: name,
        specialty: "Dermatologist",
        biography: "Photo profile biography.",
        publicWebsiteVisible: "1",
        imageMediaId: photoMediaId,
        imageSrc: photoSrc,
        imageAlt: "Portrait of clinic doctor",
      })
      .redirects(0);
    assert.equal(created.status, 303, created.text.slice(0, 400));

    const row = await pool.query(
      `SELECT id, public_profile_key, platform_identity_id
         FROM activeclinic.staff_members
        WHERE organization_id = $1 AND public_display_name = $2
        LIMIT 1`,
      [clinic.organizationId, name]
    );
    assert.equal(row.rows.length, 1);
    assert.equal(row.rows[0].platform_identity_id, null);
    const staffId = row.rows[0].id;
    const staffKey = row.rows[0].public_profile_key;

    const editPage = await request(app)
      .get(`/app/settings/website/catalogue/doctors/${staffId}/edit`)
      .set("Cookie", cookie);
    assert.equal(editPage.status, 200);
    assert.match(editPage.text, re(photoSrc));
    assert.match(editPage.text, re(photoMediaId));

    // Empty image fields match the shared "Remove image" client path and must clear the overlay.
    const cleared = await request(app)
      .post(`/app/settings/website/catalogue/doctors/${staffId}/edit`)
      .set("Cookie", mergeCookies(cookie, editPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(editPage),
        publicDisplayName: name,
        specialty: "Dermatologist",
        biography: "Photo profile biography.",
        publicWebsiteVisible: "1",
        status: "active",
        imageMediaId: "",
        imageSrc: "",
        imageAlt: "",
      })
      .redirects(0);
    assert.equal(cleared.status, 303);

    await publishWebsite(clinic);

    const clearedList = await request(app).get(`/clinics/${clinic.slug}/doctors`);
    assert.equal(clearedList.status, 200);
    assert.match(clearedList.text, re(name));
    assert.doesNotMatch(clearedList.text, re(photoMediaId));

    // Re-save with the prior media id (normal edit form submit) restores the public photo.
    const restoredEdit = await request(app)
      .get(`/app/settings/website/catalogue/doctors/${staffId}/edit`)
      .set("Cookie", cookie);
    assert.equal(restoredEdit.status, 200);
    const restored = await request(app)
      .post(`/app/settings/website/catalogue/doctors/${staffId}/edit`)
      .set("Cookie", mergeCookies(cookie, restoredEdit))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(restoredEdit),
        publicDisplayName: name,
        specialty: "Dermatologist",
        biography: "Photo profile biography.",
        publicWebsiteVisible: "1",
        status: "active",
        imageMediaId: photoMediaId,
        imageSrc: photoSrc,
        imageAlt: "Portrait of clinic doctor",
      })
      .redirects(0);
    assert.equal(restored.status, 303);

    await publishWebsite(clinic);

    const list = await request(app).get(`/clinics/${clinic.slug}/doctors`);
    assert.equal(list.status, 200);
    assert.match(list.text, re(name));
    assert.match(list.text, re(photoMediaId));

    const detail = await request(app).get(`/clinics/${clinic.slug}/doctors/${staffKey}`);
    assert.equal(detail.status, 200);
    assert.match(detail.text, re(name));
    assert.match(detail.text, re(photoMediaId));
    assert.doesNotMatch(detail.text, /ac-doctor-profile__media--fallback/);
  });
});
