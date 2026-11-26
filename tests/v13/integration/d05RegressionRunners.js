"use strict";

/**
 * D05 remaining regression bodies. Callers skip these unless disposable
 * database writes are authorized. Host headers are in-process routing keys.
 *
 * AC-PUB-01 covers the supported disabled booking state only.
 * PENDING_PRODUCT_SCOPE: enabled public booking and coupon confirmation are
 * not product behavior and are not asserted here.
 */

const assert = require("node:assert/strict");
const crypto = require("crypto");
const request = require("supertest");

const {
  assertV13CiDatabaseUrl,
  assertV13CiEnvironmentIdentity,
} = require("../helpers/v13CiDatabaseGuard");
const { cleanupBlessBoardFixtures } = require("../fixtures/v13SyntheticFixtures");
const { CSRF_FIELD } = require("../../../src/platform/http/v5Csrf");
const { createV5FoundationApp } = require("../../../src/platform/http/v5FoundationServer");
const { createV5Session } = require("../../../src/platform/session/createV5Session");
const { DEFAULT_V5_COOKIE } = require("../../../src/platform/session/v5SessionCookie");
const { provisionPlatformTenant } = require("../../../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../../../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../../../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../../../src/blessboard/services/assignBlessBoardRole");
const { provisionWebsiteInstance } = require("../../../src/platform/website/provisionService");
const {
  createMoovexPlatformRuntimeApp,
  buildDefaultProductApps,
} = require("../../../src/platform/http/moovexPlatformRuntimeServer");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  resetDeploymentProfileWarningsForTests,
} = require("../../../src/platform/config/deploymentProfiles");

const BB_DEPLOYMENT = "blessboard-org-staging";
const AC_HOST = "activeclinic.pronline.org";
const SESSION_SECRET = "test-session-secret-at-least-32-chars!!";
const PASSWORD = "V13-Member-Old-9!";
const CLINIC_PASSWORD = "clinic-admin-pass-12";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function assertDisposable(connectionString, env) {
  assertV13CiDatabaseUrl(connectionString);
  assertV13CiEnvironmentIdentity(env);
}

function stamp() {
  return `${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
}

function absorbCookies(jar, res) {
  const raw = res && res.headers ? res.headers["set-cookie"] : [];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    const part = String(line).split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function hidden(html, name) {
  const text = String(html || "");
  const named = text.match(new RegExp(`name="${name}" value="([^"]*)"`))
    || text.match(new RegExp(`name='${name}' value='([^']*)'`));
  if (named) return named[1];
  if (name === "_csrf") {
    const data = text.match(/data-csrf-token="([^"]*)"/);
    if (data) return data[1];
  }
  return "";
}

function issuedCsrf(res) {
  const jar = absorbCookies({}, res);
  const token = hidden(res.text, CSRF_FIELD);
  const cookieName = Object.keys(jar).find((name) => /csrf/i.test(name));
  const cookieToken = cookieName ? decodeURIComponent(jar[cookieName]) : "";
  assert.ok(cookieToken, "response must set a CSRF cookie");
  assert.ok(token, "response must render a CSRF field");
  assert.equal(cookieToken, token);
  return { jar, token };
}

function testingEnv(extra) {
  const env = { ...extra };
  delete env.BLESSBOARD_OTP_EXPOSE_TEST_CODE;
  delete env.RESEND_API_KEY;
  delete env.TWILIO_AUTH_TOKEN;
  delete env.TWILIO_ACCOUNT_SID;
  delete env.INFOBIP_API_KEY;
  env.NODE_ENV = "test";
  env.DEPLOYMENT_ENV = "testing";
  env.DATABASE_IDENTITY_ENV = "testing";
  env.SESSION_SECRET = SESSION_SECRET;
  return env;
}

async function withProcessDeployment(code, fn) {
  const previous = process.env.PLATFORM_DEPLOYMENT_CODE;
  process.env.PLATFORM_DEPLOYMENT_CODE = code;
  try {
    return await fn();
  } finally {
    if (previous == null) delete process.env.PLATFORM_DEPLOYMENT_CODE;
    else process.env.PLATFORM_DEPLOYMENT_CODE = previous;
  }
}

async function provisionChurch(pool, id, host) {
  const tenant = await provisionPlatformTenant(pool, {
    organizationKey: id,
    displayName: `D05 ${id}`,
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: id,
    hostname: host,
    domainType: "canonical",
    deploymentCode: BB_DEPLOYMENT,
    isPrimary: true,
  });
  assert.equal(tenant.ok, true, tenant.message || tenant.status);
  const created = await provisionBlessBoardChurch(pool, {
    organizationKey: id,
    churchKey: id,
    displayName: `D05 ${id}`,
    legalName: null,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "Headquarters",
  });
  assert.equal(created.ok, true, created.message || created.status);
  require("../../../src/blessboard/website/blessboardChurchTemplate").registerBlessBoardWebsiteTemplate();
  const website = await provisionWebsiteInstance(pool, {
    organizationId: tenant.records.organization.id,
    templateId: "blessboard_church",
    templateVersion: 1,
    slug: id,
    status: "published",
    actorIdentityId: null,
  });
  assert.equal(website.ok, true, website.code || website.message);
  await pool.query(
    `INSERT INTO blessboard.church_settings (church_id, public_name, website_status, primary_email)
     VALUES ($1, $2, 'published', $3)
     ON CONFLICT (church_id) DO UPDATE
       SET website_status = 'published',
           primary_email = EXCLUDED.primary_email,
           updated_at = now()`,
    [created.records.church.id, `D05 ${id}`, `office.${id}@example.invalid`]
  );
  const { provisionEmptyPublicPages } = require("../../../src/blessboard/services/publicContentAdminService");
  const pages = await provisionEmptyPublicPages(pool, { churchId: created.records.church.id });
  assert.equal(pages.ok, true, pages.reason || pages.message || "public pages were not provisioned");
  const admin = await createBlessBoardUser(pool, {
    email: `admin.${id}@example.invalid`,
    displayName: "D05 Admin",
    password: PASSWORD,
  });
  assert.equal(admin.ok, true, admin.message);
  const role = await assignBlessBoardRole(pool, {
    email: admin.user.email,
    organizationKey: id,
    roleKey: "church_hq_admin",
    churchKey: id,
  });
  assert.equal(role.ok, true, role.message || role.status);
  return {
    key: id,
    host,
    organizationId: tenant.records.organization.id,
    churchId: created.records.church.id,
    branchId: created.records.hqBranch.id,
    adminUserId: admin.user.id,
  };
}

async function adminCookie(pool, church) {
  const session = await createV5Session(pool, {
    deploymentCode: BB_DEPLOYMENT,
    userId: church.adminUserId,
    organizationId: church.organizationId,
    churchId: church.churchId,
  });
  assert.equal(session.ok, true, session.message);
  return `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
}

async function withChurches(pool, connectionString, env, count, fn) {
  assertDisposable(connectionString, env);
  return withProcessDeployment(BB_DEPLOYMENT, async () => {
    const idBase = `d05${stamp()}`.slice(0, 40);
    const churches = [];
    const app = createV5FoundationApp({
      getPool: () => pool,
      enableDiagnosticHostContext: false,
      env: testingEnv({
        PLATFORM_DEPLOYMENT_CODE: BB_DEPLOYMENT,
        SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
        BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
        BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
        BLESSBOARD_TENANT_HOST_ALLOWLIST: "*",
        BLESSBOARD_INSTANT_FREE_PROVISIONING_ENABLED: "0",
      }),
    });
    try {
      for (let index = 0; index < count; index += 1) {
        const id = `${idBase}${index}`.slice(0, 48);
        churches.push(await provisionChurch(pool, id, `${id}.local.test`));
      }
      await fn({ app, churches });
    } finally {
      const ids = churches.map((church) => church.organizationId).filter(Boolean);
      if (ids.length) {
        await pool.query(`DELETE FROM platform.domains WHERE organization_id = ANY($1::uuid[])`, [ids]).catch(() => {});
      }
      await cleanupBlessBoardFixtures(pool, connectionString, churches, env);
    }
  });
}

function sessionJar(sessionCookie, csrf) {
  const jar = { ...csrf.jar };
  const name = sessionCookie.slice(0, sessionCookie.indexOf("="));
  jar[name] = sessionCookie.slice(name.length + 1);
  return jar;
}

async function bootClinicApp(pool) {
  resetDeploymentProfileWarningsForTests();
  const env = testingEnv({
    PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
  });
  await pool.query(
    `INSERT INTO platform.deployments (
       deployment_code, application_code, release_version, canonical_domain,
       environment_code, status, jobs_enabled, database_access_mode, session_cookie_name
     ) VALUES (
       $1, 'platform', 'v7', 'local.test',
       'testing', 'active', false, 'read_write', 'moovex_platform_testing_sid'
     )
     ON CONFLICT (deployment_code) DO UPDATE SET
       status = 'active',
       session_cookie_name = EXCLUDED.session_cookie_name,
       updated_at = now()`,
    [CODE_MOOVEX_PLATFORM_TESTING]
  );
  const productApps = buildDefaultProductApps({ env, getPool: () => pool });
  return {
    env,
    app: createMoovexPlatformRuntimeApp({ env, getPool: () => pool, productApps }),
  };
}

async function registerClinic(app, fields) {
  const page = await request(app).get("/register-clinic").set("Host", AC_HOST);
  assert.equal(page.status, 200, page.text.slice(0, 180));
  const csrf = issuedCsrf(page);
  const confirm = await request(app)
    .post("/register-clinic")
    .set("Host", AC_HOST)
    .set("Cookie", cookieHeader(csrf.jar))
    .redirects(0)
    .type("form")
    .send({
      action: "confirm",
      province: "Lusaka",
      city: "Lusaka",
      address: "1 Cairo Road",
      countryCode: "ZM",
      acceptTerms: "on",
      registration_consent: "on",
      password: CLINIC_PASSWORD,
      passwordConfirm: CLINIC_PASSWORD,
      [CSRF_FIELD]: csrf.token,
      ...fields,
    });
  assert.equal(confirm.status, 303, confirm.text.slice(0, 240));
  const jar = absorbCookies({}, confirm);
  if (!Object.keys(jar).some((name) => /sid/i.test(name))) {
    const loginPage = await request(app).get("/login").set("Host", AC_HOST);
    const loginCsrf = issuedCsrf(loginPage);
    const login = await request(app)
      .post("/login")
      .set("Host", AC_HOST)
      .set("Cookie", cookieHeader(loginCsrf.jar))
      .redirects(0)
      .type("form")
      .send({
        identifier: fields.contactEmail,
        password: CLINIC_PASSWORD,
        [CSRF_FIELD]: loginCsrf.token,
      });
    assert.equal(login.status, 303, login.text.slice(0, 180));
    absorbCookies(jar, login);
  }
  return { jar, email: fields.contactEmail };
}

async function ensureActiveClinicWebsite(pool, clinic) {
  const { registerActiveClinicWebsiteTemplate } = require("../../../src/activeclinic/website/activeClinicWebsiteTemplate");
  registerActiveClinicWebsiteTemplate();
  const created = await provisionWebsiteInstance(pool, {
    organizationId: clinic.organizationId,
    templateId: "activeclinic_clinic",
    templateVersion: 1,
    slug: clinic.key,
    status: "published",
  });
  assert.equal(created.ok, true, created.code || "clinic website was not provisioned");
}

async function attachOpenedClinicOperations(pool, clinic, stampId, side) {
  const row = await pool.query(
    `SELECT f.id AS facility_id,
            f.healthcare_organization_id,
            (
              SELECT s.id
                FROM activeclinic.staff_members s
               WHERE s.organization_id = f.organization_id
                 AND s.status = 'active'
               LIMIT 1
            ) AS staff_id
       FROM activeclinic.facilities f
      WHERE f.organization_id = $1
      LIMIT 1`,
    [clinic.organizationId]
  );
  assert.equal(row.rowCount, 1, "registered clinic must have a facility");
  const found = row.rows[0];
  assert.ok(found.staff_id, "registered clinic must have an administrator");
  const { attachRegressionClinicOperations } = require("../fixtures/v13SyntheticFixtures");
  const digits = String(stampId).replace(/\D/g, "").slice(-6).padStart(6, "1");
  const prefix = side === "b" ? "2" : "1";
  await attachRegressionClinicOperations(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: found.healthcare_organization_id,
    facilityId: found.facility_id,
    adminStaffId: found.staff_id,
    spec: {
      publicBookingEnabled: false,
      receptionist: {
        email: `reception-${side}-${stampId}@v13d19.example`,
        phone: `+26097${prefix}${digits}`,
      },
      clinician: {
        email: `clinical-${side}-${stampId}@v13d19.example`,
        phone: `+26096${prefix}${digits}`,
      },
      servicePoint: {
        displayName: `V13 walk-in ${side}`,
        serviceType: "general",
        servicePointKey: `v13d19-walk-in-${side}`,
      },
    },
  });
}

async function clinicIdentity(pool, email) {
  const row = await pool.query(
    `SELECT o.organization_key, o.id
       FROM activeclinic.clinic_registration_applications a
       JOIN platform.organizations o ON o.id = a.organization_id
      WHERE lower(a.contact_email_normalized) = lower($1)
      LIMIT 1`,
    [email]
  );
  assert.equal(row.rowCount, 1, "registered clinic must persist an organization");
  return { key: row.rows[0].organization_key, organizationId: row.rows[0].id };
}

async function openClinic(pool, connectionString, env) {
  assertDisposable(connectionString, env);
  return withProcessDeployment(CODE_MOOVEX_PLATFORM_TESTING, async () => {
    const booted = await bootClinicApp(pool);
    const id = stamp();
    const email = `d05-clinic-${id}@example.invalid`;
    const otherEmail = `d05-other-${id}@example.invalid`;
    const phone = `+26097${String(Date.now()).slice(-7)}`;
    const otherPhone = `+26097${String(Date.now() + 17).slice(-7)}`;
    const first = await registerClinic(booted.app, {
      clinicName: `D05 Clinic ${id}`,
      contactName: "D05 Admin",
      contactEmail: email,
      contactPhone: phone,
    });
    const second = await registerClinic(booted.app, {
      clinicName: `D05 Other ${id}`,
      contactName: "D05 Other",
      contactEmail: otherEmail,
      contactPhone: otherPhone,
    });
    const clinic = await clinicIdentity(pool, email);
    const other = await clinicIdentity(pool, otherEmail);
    await attachOpenedClinicOperations(pool, clinic, id, "a");
    await attachOpenedClinicOperations(pool, other, id, "b");
    await ensureActiveClinicWebsite(pool, clinic);
    await ensureActiveClinicWebsite(pool, other);
    return {
      app: booted.app,
      clinic: { ...clinic, jar: first.jar, email },
      other: { ...other, jar: second.jar, email: otherEmail },
    };
  });
}

async function acGet(app, jar, path) {
  return request(app).get(path).set("Host", AC_HOST).set("Cookie", cookieHeader(jar));
}

async function acCsrf(app, jar, pagePath) {
  const page = await acGet(app, jar, pagePath);
  const token = hidden(page.text, CSRF_FIELD);
  assert.ok(token, `CSRF field missing on ${pagePath} (${page.status})`);
  return { jar: absorbCookies({ ...jar }, page), token, page };
}

async function acPost(app, jar, path, fields, csrfPage) {
  const csrf = await acCsrf(app, jar, csrfPage || path.split("?")[0]);
  return request(app)
    .post(path)
    .set("Host", AC_HOST)
    .set("Cookie", cookieHeader(csrf.jar))
    .redirects(0)
    .type("form")
    .send({ ...(fields || {}), [CSRF_FIELD]: csrf.token });
}

async function runAcWeb08(pool, connectionString, env) {
  const opened = await openClinic(pool, connectionString, env);
  const { app, clinic, other } = opened;
  const heading = `D05 section ${stamp()}`;
  const before = await acGet(app, clinic.jar, "/app/settings/website/sections");
  assert.equal(before.status, 200, before.text.slice(0, 200));
  assert.match(before.text, /Sections/);
  const existing = new Set([...before.text.matchAll(/\/app\/settings\/website\/sections\/([0-9a-f-]{36})/gi)].map((match) => match[1]));
  const added = await acPost(app, clinic.jar, "/app/settings/website/sections", {
    pageId: "tpl_home",
    type: "text",
  });
  assert.equal(added.status, 303);
  const listed = await acGet(app, clinic.jar, "/app/settings/website/sections");
  const createdId = [...listed.text.matchAll(/\/app\/settings\/website\/sections\/([0-9a-f-]{36})/gi)]
    .map((match) => match[1])
    .find((id) => !existing.has(id));
  assert.ok(createdId, "new section must appear in the section list");
  const edited = await acPost(app, clinic.jar, `/app/settings/website/sections/${createdId}`, {
    heading,
    body: "Draft section body",
    visible: "1",
  });
  assert.equal(edited.status, 303);
  const preview = await request(app)
    .get(`/clinics/${clinic.key}?website_mode=draft`)
    .set("Host", AC_HOST)
    .set("Cookie", cookieHeader(clinic.jar));
  assert.equal(preview.status, 200, preview.text.slice(0, 180));
  assert.equal(preview.text.includes(heading), true);
  const liveBefore = await request(app).get(`/clinics/${clinic.key}`).set("Host", AC_HOST);
  assert.equal(liveBefore.text.includes(heading), false);
  const published = await acPost(
    app,
    clinic.jar,
    `/clinics/${clinic.key}/website/publish`,
    {},
    "/app/settings/website/themes"
  );
  assert.ok(published.status < 400, published.text.slice(0, 240));
  const live = await request(app).get(`/clinics/${clinic.key}`).set("Host", AC_HOST);
  assert.equal(live.status, 200);
  assert.equal(live.text.includes(heading), true);
  const foreign = await request(app)
    .post(`/app/settings/website/sections/${createdId}`)
    .set("Host", AC_HOST)
    .set("Cookie", cookieHeader(other.jar))
    .redirects(0)
    .type("form")
    .send({ heading: "Foreign overwrite", visible: "1" });
  assert.ok(foreign.status === 401 || foreign.status === 403 || foreign.status === 404, `other clinic status ${foreign.status}`);
  const still = await request(app).get(`/clinics/${clinic.key}`).set("Host", AC_HOST);
  assert.equal(still.text.includes("Foreign overwrite"), false);
  assert.equal(still.text.includes(heading), true);
  assert.equal(still.text.includes("Draft section body"), true);
  const reloaded = await request(app).get(`/clinics/${clinic.key}`).set("Host", AC_HOST);
  assert.equal(reloaded.text.includes(heading), true);
  const unsafe = await acPost(app, clinic.jar, `/app/settings/website/sections/${createdId}`, {
    heading,
    body: "Draft section body",
    buttonLabel: "Go",
    buttonUrl: "javascript:alert(1)",
    visible: "1",
  });
  assert.equal(unsafe.status, 400);
  assert.match(unsafe.text, /not allowed/);
  const imageExisting = new Set(
    [...listed.text.matchAll(/\/app\/settings\/website\/sections\/([0-9a-f-]{36})/gi)].map((match) => match[1])
  );
  const imageAdded = await acPost(app, clinic.jar, "/app/settings/website/sections", {
    pageId: "tpl_home",
    type: "image_text",
  });
  assert.equal(imageAdded.status, 303);
  const imageListed = await acGet(app, clinic.jar, "/app/settings/website/sections");
  const imageId = [...imageListed.text.matchAll(/\/app\/settings\/website\/sections\/([0-9a-f-]{36})/gi)]
    .map((match) => match[1])
    .find((id) => !imageExisting.has(id));
  assert.ok(imageId, "image section must appear in the section list");
  const imageSrc = "https://example.invalid/v13-synthetic-section.png";
  const imageSaved = await acPost(app, clinic.jar, `/app/settings/website/sections/${imageId}`, {
    heading: `${heading} image`,
    body: "Published image caption",
    imageSrc,
    imageAlt: "Synthetic clinic image",
    visible: "1",
  });
  assert.equal(imageSaved.status, 303, imageSaved.text.slice(0, 240));
  const imageLiveBefore = await request(app).get(`/clinics/${clinic.key}`).set("Host", AC_HOST);
  assert.equal(imageLiveBefore.text.includes("Synthetic clinic image"), false);
  const imagePublished = await acPost(
    app,
    clinic.jar,
    `/clinics/${clinic.key}/website/publish`,
    {},
    "/app/settings/website/themes"
  );
  assert.ok(imagePublished.status < 400, imagePublished.text.slice(0, 240));
  const imageLive = await request(app).get(`/clinics/${clinic.key}`).set("Host", AC_HOST);
  assert.equal(imageLive.text.includes(imageSrc), true);
  assert.equal(imageLive.text.includes("Synthetic clinic image"), true);
  assert.equal(imageLive.text.includes("javascript:"), false);
}

async function runAcWeb09(pool, connectionString, env) {
  const { app, clinic } = await openClinic(pool, connectionString, env);
  const themes = await acGet(app, clinic.jar, "/app/settings/website/themes");
  assert.equal(themes.status, 200, themes.text.slice(0, 200));
  assert.match(themes.text, /ac\.family-wellness-mint|ac\.community|ac\.default/);
  assert.equal(themes.text.includes("bb.contemporary-fellowship"), false);
  const rejected = await acPost(
    app,
    clinic.jar,
    `/clinics/${clinic.key}/website/theme`,
    { themeId: "bb.community" },
    "/app/settings/website/themes"
  );
  assert.equal(rejected.status, 400);
  assert.match(JSON.stringify(rejected.body || rejected.text), /invalid_theme/);
  const saved = await acPost(
    app,
    clinic.jar,
    `/clinics/${clinic.key}/website/theme`,
    { themeId: "ac.family-wellness-mint" },
    "/app/settings/website/themes"
  );
  assert.equal(saved.status, 200, saved.text.slice(0, 200));
  assert.equal(saved.body.published, false);
  assert.equal(saved.body.themeId, "ac.family-wellness-mint");
  const preview = await request(app)
    .get(`/clinics/${clinic.key}?website_mode=draft`)
    .set("Host", AC_HOST)
    .set("Cookie", cookieHeader(clinic.jar));
  assert.match(preview.text, /gp-website-theme--ac-family-wellness-mint|ac\.family-wellness-mint/);
  const published = await acPost(
    app,
    clinic.jar,
    `/clinics/${clinic.key}/website/publish`,
    {},
    "/app/settings/website/themes"
  );
  assert.ok(published.status < 400, published.text.slice(0, 200));
  const live = await request(app).get(`/clinics/${clinic.key}`).set("Host", AC_HOST);
  assert.match(live.text, /gp-website-theme--ac-family-wellness-mint/);
}

async function runAcRec02(pool, connectionString, env) {
  const { app, clinic, other } = await openClinic(pool, connectionString, env);
  const form = await acGet(app, clinic.jar, "/app/patients");
  assert.equal(form.status, 200, form.text.slice(0, 180));
  const created = await acPost(app, clinic.jar, "/app/patients", {
    first_name: "D05",
    last_name: `Walker${String(Date.now()).slice(-6)}`,
    sex_at_registration: "female",
    date_of_birth: "1992-04-04",
    phone_country: "ZM",
    phone_national: `97${String(Date.now()).slice(-7)}`,
    registration_method: "walk_in",
    step: "confirm",
  });
  assert.equal(created.status, 200, created.text.slice(0, 240));
  assert.match(created.text, /Patient created/);
  const number = ((created.text.match(/data-ac-patient-number="1">([^<]+)/) || [])[1] || "").trim();
  assert.match(number, /^AC-[0-9]{4}-[0-9]{6}$/);
  const walkIn = await acGet(app, clinic.jar, "/app/reception/walk-in");
  assert.equal(walkIn.status, 200, walkIn.text.slice(0, 200));
  const option = walkIn.text.match(/<option value="([0-9a-f-]{36})"[^>]*>([^<]+)<\/option>/i);
  assert.ok(option, "walk-in form must list a service point for this clinic");
  const servicePointId = option[1];
  const serviceName = option[2].trim();
  const queued = await acPost(app, clinic.jar, "/app/reception/walk-in", {
    patient_number: number,
    service_point_id: servicePointId,
    check_in_note: "D05 walk-in",
  });
  assert.equal(queued.status, 303, queued.text.slice(0, 200));
  assert.match(String(queued.headers.location), /\/app\/reception\/queue\//);
  const queue = await acGet(app, clinic.jar, queued.headers.location);
  assert.equal(queue.status, 200);
  assert.equal(queue.text.includes(number), true);
  assert.equal(queue.text.includes(serviceName), true);
  const foreignForm = await acGet(app, other.jar, "/app/reception/walk-in");
  assert.equal(foreignForm.text.includes(servicePointId), false);
  const foreignPost = await acPost(app, other.jar, "/app/reception/walk-in", {
    patient_number: number,
    service_point_id: servicePointId,
  });
  assert.notEqual(foreignPost.status, 303);
  assert.match(foreignPost.text, /Patient not found|unavailable|Invalid|required/i);
}

async function runAcRec03(pool, connectionString, env) {
  const { app, clinic, other } = await openClinic(pool, connectionString, env);
  const created = await acPost(app, clinic.jar, "/app/patients", {
    first_name: "D05",
    last_name: `Vitals${String(Date.now()).slice(-6)}`,
    sex_at_registration: "male",
    date_of_birth: "1988-08-08",
    phone_country: "ZM",
    phone_national: `97${String(Date.now()).slice(-7)}`,
    step: "confirm",
  });
  assert.match(created.text, /Patient created/);
  const number = ((created.text.match(/data-ac-patient-number="1">([^<]+)/) || [])[1] || "").trim();
  assert.match(number, /^AC-[0-9]{4}-[0-9]{6}$/);
  const storedPatient = await pool.query(
    `SELECT id FROM activeclinic.patients WHERE organization_id = $1 AND patient_number = $2`,
    [clinic.organizationId, number]
  );
  assert.equal(storedPatient.rowCount, 1, "created patient must persist in this clinic");
  const patientId = storedPatient.rows[0].id;
  const started = await acPost(app, clinic.jar, "/app/clinical/start-encounter", {
    patient_id: patientId,
    encounter_type: "outpatient",
  });
  assert.equal(started.status, 303, started.text.slice(0, 200));
  const encounterId = String(started.headers.location || "").match(/encounter\/([^/?]+)/)[1];
  const sheet = await acGet(app, clinic.jar, `/app/clinical/encounter/${encounterId}/vitals`);
  assert.equal(sheet.status, 200, sheet.text.slice(0, 180));
  assert.match(sheet.text, /Heart rate/);
  const saved = await acPost(app, clinic.jar, `/app/clinical/encounter/${encounterId}/vitals`, {
    observation_type: "heart_rate",
    value_numeric: "72",
    unit: "bpm",
  });
  assert.equal(saved.status, 303);
  assert.match(String(saved.headers.location), /recorded=1/);
  const reloaded = await acGet(app, clinic.jar, `/app/clinical/encounter/${encounterId}/vitals`);
  assert.equal(reloaded.status, 200);
  assert.match(reloaded.text, /72 bpm/);
  const anonymous = await request(app)
    .post(`/app/clinical/encounter/${encounterId}/vitals`)
    .set("Host", AC_HOST)
    .redirects(0)
    .type("form")
    .send({ observation_type: "heart_rate", value_numeric: "140" });
  if (anonymous.status === 303 || anonymous.status === 302) {
    assert.match(String(anonymous.headers.location || ""), /\/login/i);
  } else {
    assert.ok(anonymous.status === 401 || anonymous.status === 403);
  }
  const foreign = await acGet(app, other.jar, `/app/clinical/encounter/${encounterId}/vitals`);
  assert.ok(foreign.status === 403 || foreign.status === 404, `other clinic must not open this encounter (${foreign.status})`);
  const unchanged = await acGet(app, clinic.jar, `/app/clinical/encounter/${encounterId}/vitals`);
  assert.equal(unchanged.text.includes("140 bpm"), false);
  assert.match(unchanged.text, /72 bpm/);
  const observationId = (unchanged.text.match(/vitals\/([0-9a-f-]{36})\/correct/i) || [])[1];
  assert.ok(observationId, "saved vital must offer a correction action");
  const vitalsPath = `/app/clinical/encounter/${encounterId}/vitals`;
  const corrected = await acPost(
    app,
    clinic.jar,
    `${vitalsPath}/${observationId}/correct`,
    {
      observation_type: "heart_rate",
      value_numeric: "80",
      unit: "bpm",
      correction_reason: "entry error",
      patient_id: patientId,
    },
    vitalsPath
  );
  assert.equal(corrected.status, 303, corrected.text.slice(0, 240));
  assert.match(String(corrected.headers.location || ""), /corrected=1/);
  const history = await acGet(app, clinic.jar, `/app/clinical/encounter/${encounterId}/vitals`);
  assert.match(history.text, /72 bpm/);
  assert.match(history.text, /80 bpm/);
  assert.match(history.text, /Superseded/);
  assert.match(history.text, /entry error|Current correction/);
  const stale = await acPost(
    app,
    clinic.jar,
    `${vitalsPath}/${observationId}/correct`,
    {
      observation_type: "heart_rate",
      value_numeric: "90",
      unit: "bpm",
      correction_reason: "late retry",
      patient_id: patientId,
    },
    vitalsPath
  );
  assert.equal(stale.status, 400);
  assert.match(stale.text, /updated by someone else/);
  const foreignCorrect = await acPost(
    app,
    other.jar,
    `${vitalsPath}/${observationId}/correct`,
    {
      observation_type: "heart_rate",
      value_numeric: "99",
      unit: "bpm",
      correction_reason: "wrong clinic",
      patient_id: patientId,
    },
    "/app"
  );
  assert.ok(
    foreignCorrect.status === 400 || foreignCorrect.status === 403 || foreignCorrect.status === 404,
    `other clinic correction status ${foreignCorrect.status}`
  );
  assert.equal(foreignCorrect.text.includes("99 bpm"), false);
  assert.match(foreignCorrect.text, /not found|do not have permission/i);
  const preserved = await acGet(app, clinic.jar, `/app/clinical/encounter/${encounterId}/vitals`);
  assert.equal(preserved.text.includes("99 bpm"), false);
  assert.match(preserved.text, /72 bpm/);
  assert.match(preserved.text, /80 bpm/);
}

async function runAcPub01(pool, connectionString, env) {
  const { app, clinic } = await openClinic(pool, connectionString, env);
  await pool.query(
    `UPDATE activeclinic.healthcare_organizations
        SET website_published = true
      WHERE organization_id = $1
        AND public_booking_enabled = false`,
    [clinic.organizationId]
  );
  const booking = await request(app).get(`/clinics/${clinic.key}/book`).set("Host", AC_HOST);
  assert.equal(booking.status, 403);
  assert.match(booking.text, /Online booking is not enabled/);
  assert.match(booking.text, /does not take live bookings/);
  assert.doesNotMatch(booking.text, /coupon/i);
  assert.doesNotMatch(booking.text, /name="coupon|appointment confirmed/i);
  const posted = await request(app)
    .post(`/clinics/${clinic.key}/book`)
    .set("Host", AC_HOST)
    .type("form")
    .send({ wizardAction: "continue", serviceKey: "consult" });
  assert.equal(posted.status, 403);
  assert.match(posted.text, /Online booking is not enabled/);
  assert.doesNotMatch(posted.text, /appointment confirmed|coupon/i);
  const appointments = await pool.query(
    `SELECT count(*)::int AS n
       FROM activeclinic.appointments
      WHERE organization_id = $1`,
    [clinic.organizationId]
  );
  assert.equal(Number(appointments.rows[0].n), 0);
}

async function postEntity(app, church, session, routeKey, fields) {
  const page = await request(app).get(`/hq/content/${routeKey}`).set("Host", church.host).set("Cookie", session);
  assert.equal(page.status, 200, page.text.slice(0, 200));
  const csrf = issuedCsrf(page);
  return request(app)
    .post(`/hq/content/${routeKey}`)
    .set("Host", church.host)
    .set("Cookie", cookieHeader(sessionJar(session, csrf)))
    .redirects(0)
    .type("form")
    .send({ action: "create", [CSRF_FIELD]: csrf.token, ...fields });
}

async function runBbWeb08(pool, connectionString, env) {
  await withChurches(pool, connectionString, env, 1, async ({ app, churches }) => {
    const church = churches[0];
    const session = await adminCookie(pool, church);
    const themes = await request(app)
      .get("/hq/website/themes")
      .set("Host", church.host)
      .set("Cookie", session)
      .redirects(1);
    assert.equal(themes.status, 200, themes.text.slice(0, 200));
    assert.match(themes.text, /bb\.community|bb\.default|bb\.contemporary-fellowship/);
    assert.equal(themes.text.includes("ac.family-wellness-mint"), false);
    const csrf = issuedCsrf(themes);
    const rejected = await request(app)
      .post("/website/theme")
      .set("Host", church.host)
      .set("Cookie", cookieHeader(sessionJar(session, csrf)))
      .set("Content-Type", "application/json")
      .send({ themeId: "ac.family-wellness-mint", [CSRF_FIELD]: csrf.token });
    assert.equal(rejected.status, 400);
    assert.match(JSON.stringify(rejected.body || rejected.text), /invalid_theme/);
    const fresh = await request(app)
      .get("/hq/website/themes")
      .set("Host", church.host)
      .set("Cookie", session)
      .redirects(1);
    const saveCsrf = issuedCsrf(fresh);
    const saved = await request(app)
      .post("/website/theme")
      .set("Host", church.host)
      .set("Cookie", cookieHeader(sessionJar(session, saveCsrf)))
      .set("Content-Type", "application/json")
      .send({ themeId: "bb.community", [CSRF_FIELD]: saveCsrf.token });
    assert.equal(saved.status, 200, saved.text.slice(0, 200));
    assert.equal(saved.body.published, false);
    assert.equal(saved.body.themeId, "bb.community");
    const preview = await request(app).get("/?website_mode=draft").set("Host", church.host).set("Cookie", session);
    assert.match(preview.text, /gp-website-theme--bb-community|bb\.community/);
    const publishPage = await request(app).get("/hq/website/publish/review").set("Host", church.host).set("Cookie", session);
    const publishCsrf = issuedCsrf(publishPage);
    const published = await request(app)
      .post("/hq/website/publish")
      .set("Host", church.host)
      .set("Cookie", cookieHeader(sessionJar(session, publishCsrf)))
      .redirects(0)
      .type("form")
      .send({
        confirm_publish: "1",
        preview_reviewed: "1",
        mobile_preview_confirmed: "1",
        defer_service_times: "1",
        from_confirmation: "1",
        [CSRF_FIELD]: publishCsrf.token,
      });
    assert.equal(published.status, 303, String(published.headers.location || published.text).slice(0, 240));
    assert.doesNotMatch(String(published.headers.location || ""), /error|not_ready/);
    const live = await request(app).get("/").set("Host", church.host);
    assert.match(live.text, /gp-website-theme--bb-community/);
  });
}

async function runBbWeb09(pool, connectionString, env) {
  await withChurches(pool, connectionString, env, 2, async ({ app, churches }) => {
    const [church, other] = churches;
    const session = await adminCookie(pool, church);
    const title = `D05 sermon ${stamp()}`;
    const draft = await postEntity(app, church, session, "sermons", {
      title,
      speaker_name: "D05 Speaker",
      preached_at: "2026-07-18",
      status: "draft",
    });
    assert.equal(draft.status, 303, draft.text.slice(0, 200));
    const list = await request(app).get("/hq/content/sermons").set("Host", church.host).set("Cookie", session);
    assert.equal(list.status, 200);
    assert.equal(list.text.includes(title), true);
    const hidden = await request(app).get("/sermons").set("Host", church.host);
    assert.equal(hidden.status, 200, hidden.text.slice(0, 160));
    assert.match(hidden.text, /data-bb-sermons="1"/);
    assert.equal(hidden.text.includes(title), false);
    const row = await pool.query(
      `SELECT id, status FROM blessboard.sermons WHERE church_id = $1 AND title = $2`,
      [church.churchId, title]
    );
    assert.equal(row.rowCount, 1);
    assert.equal(row.rows[0].status, "draft");
    const published = await postEntity(app, church, session, "sermons", {
      title: `${title} live`,
      speaker_name: "D05 Speaker",
      preached_at: "2026-07-18",
      status: "published",
      confirm_publish: "1",
    });
    assert.equal(published.status, 303, published.text.slice(0, 200));
    const live = await request(app).get("/sermons").set("Host", church.host);
    assert.equal(live.text.includes(`${title} live`), true);
    const foreign = await request(app).get("/sermons").set("Host", other.host);
    assert.equal(foreign.text.includes(`${title} live`), false);
    const foreignList = await request(app)
      .get("/hq/content/sermons")
      .set("Host", other.host)
      .set("Cookie", await adminCookie(pool, other));
    assert.equal(foreignList.text.includes(`${title} live`), false);
  });
}

async function runBbWeb10(pool, connectionString, env) {
  await withChurches(pool, connectionString, env, 2, async ({ app, churches }) => {
    const [church, other] = churches;
    const session = await adminCookie(pool, church);
    const title = `D05 event ${stamp()}`;
    const draft = await postEntity(app, church, session, "events", {
      title,
      summary: "Draft gathering",
      starts_at: "2026-12-01T09:00",
      ends_at: "2026-12-01T11:00",
      timezone: "Africa/Lusaka",
      location: "Main hall",
      status: "draft",
    });
    assert.equal(draft.status, 303, draft.text.slice(0, 200));
    const list = await request(app).get("/hq/content/events").set("Host", church.host).set("Cookie", session);
    assert.equal(list.text.includes(title), true);
    const hidden = await request(app).get("/events").set("Host", church.host);
    assert.match(hidden.text, /data-bb-events="1"/);
    assert.equal(hidden.text.includes(title), false);
    const stored = await pool.query(
      `SELECT status FROM blessboard.events WHERE church_id = $1 AND title = $2`,
      [church.churchId, title]
    );
    assert.equal(stored.rows[0].status, "draft");
    const published = await postEntity(app, church, session, "events", {
      title: `${title} live`,
      summary: "Public gathering",
      starts_at: "2026-12-02T09:00",
      ends_at: "2026-12-02T11:00",
      timezone: "Africa/Lusaka",
      location: "Main hall",
      status: "published",
      confirm_publish: "1",
    });
    assert.equal(published.status, 303, published.text.slice(0, 200));
    const live = await request(app).get("/events").set("Host", church.host);
    assert.equal(live.text.includes(`${title} live`), true);
    const foreign = await request(app).get("/events").set("Host", other.host);
    assert.equal(foreign.text.includes(`${title} live`), false);
  });
}

async function runBbAnn02(pool, connectionString, env) {
  await withChurches(pool, connectionString, env, 2, async ({ app, churches }) => {
    const [church, other] = churches;
    const session = await adminCookie(pool, church);
    const form = await request(app).get("/hq/announcements/new").set("Host", church.host).set("Cookie", session);
    assert.equal(form.status, 200, form.text.slice(0, 180));
    const csrf = issuedCsrf(form);
    const jar = sessionJar(session, csrf);
    const filename = `d05-notice-${stamp()}.png`;
    const uploaded = await request(app)
      .post("/hq/announcements/media/upload")
      .set("Host", church.host)
      .set("Cookie", cookieHeader(jar))
      .field(CSRF_FIELD, csrf.token)
      .attach("file", PNG, { filename, contentType: "image/png" });
    if (uploaded.status === 403 && uploaded.body && uploaded.body.reason === "media_uploads_disabled") {
      assert.equal(uploaded.body.ok, false);
      assert.equal(String(env.BLESSBOARD_MEDIA_UPLOADS_ENABLED || ""), "");
      return;
    }
    assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));
    assert.equal(uploaded.body.ok, true);
    assert.equal(uploaded.body.originalFilename, filename);
    const rejectedType = await request(app)
      .post("/hq/announcements/media/upload")
      .set("Host", church.host)
      .set("Cookie", cookieHeader(jar))
      .field(CSRF_FIELD, csrf.token)
      .attach("file", Buffer.from("<html>no</html>"), { filename: "note.html", contentType: "text/html" });
    assert.equal(rejectedType.status, 400);
    assert.notEqual(rejectedType.body.ok, true);
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 64);
    oversized.set(PNG.subarray(0, 8), 0);
    const rejectedSize = await request(app)
      .post("/hq/announcements/media/upload")
      .set("Host", church.host)
      .set("Cookie", cookieHeader(jar))
      .field(CSRF_FIELD, csrf.token)
      .attach("file", oversized, { filename: "huge.png", contentType: "image/png" });
    assert.ok(rejectedSize.status === 400 || rejectedSize.status === 413);
    const title = `D05 attachment ${stamp()}`;
    const created = await request(app)
      .post("/hq/announcements")
      .set("Host", church.host)
      .set("Cookie", cookieHeader(jar))
      .redirects(0)
      .type("form")
      .send({
        title,
        body: "Attachment notice",
        status: "draft",
        audience_public: "1",
        media_asset_id: uploaded.body.assetId,
        [CSRF_FIELD]: csrf.token,
      });
    assert.equal(created.status, 303, created.text.slice(0, 200));
    const announcementId = String(created.headers.location).match(/\/hq\/announcements\/([^/?]+)/)[1];
    const detail = await request(app)
      .get(`/hq/announcements/${announcementId}`)
      .set("Host", church.host)
      .set("Cookie", session);
    assert.equal(detail.text.includes(filename), true);
    const row = await pool.query(`SELECT updated_at FROM blessboard.announcements WHERE id = $1`, [announcementId]);
    const publishPage = await request(app)
      .get(`/hq/announcements/${announcementId}/publish`)
      .set("Host", church.host)
      .set("Cookie", session);
    const publishCsrf = issuedCsrf(publishPage);
    const published = await request(app)
      .post(`/hq/announcements/${announcementId}/publish`)
      .set("Host", church.host)
      .set("Cookie", cookieHeader(sessionJar(session, publishCsrf)))
      .redirects(0)
      .type("form")
      .send({
        confirm_publish: "1",
        publish_mode: "now",
        expected_updated_at: new Date(row.rows[0].updated_at).toISOString(),
        [CSRF_FIELD]: publishCsrf.token,
      });
    assert.equal(published.status, 303);
    const live = await request(app).get(`/announcements/${announcementId}`).set("Host", church.host);
    assert.equal(live.status, 200, live.text.slice(0, 180));
    assert.equal(live.text.includes(filename) || live.text.includes(uploaded.body.assetId), true);
    const foreign = await request(app).get(`/announcements/${announcementId}`).set("Host", other.host);
    assert.equal(foreign.text.includes(filename), false);
    const foreignAsset = await request(app)
      .get(`/hq/announcements/media/${uploaded.body.assetId}`)
      .set("Host", other.host)
      .set("Cookie", await adminCookie(pool, other));
    assert.ok(foreignAsset.status === 403 || foreignAsset.status === 404);
  });
}

async function loginClinic(app, email, password) {
  const loginPage = await request(app).get("/login").set("Host", AC_HOST);
  const loginCsrf = issuedCsrf(loginPage);
  const login = await request(app)
    .post("/login")
    .set("Host", AC_HOST)
    .set("Cookie", cookieHeader(loginCsrf.jar))
    .redirects(0)
    .type("form")
    .send({
      identifier: email,
      password: password || CLINIC_PASSWORD,
      [CSRF_FIELD]: loginCsrf.token,
    });
  assert.equal(login.status, 303, login.text.slice(0, 180));
  return absorbCookies({}, login);
}

async function runG224Laboratory(pool, connectionString, env) {
  const { enterLaboratoryResult, RESULT } = require(
    "../../../src/activeclinic/services/activeClinicDiagnosticsService"
  );
  const { assignStaffRole, LAB_TECHNICIAN, CLINICIAN } = require(
    "../../../src/activeclinic/services/activeClinicAuthorizationService"
  );
  const { provisionFacilityStaff, SYNTHETIC_PASSWORD } = require("../fixtures/v13SyntheticFixtures");
  const { app, clinic, other } = await openClinic(pool, connectionString, env);
  const receptionist = await pool.query(
    `SELECT COALESCE(s.email_normalized, i.email_normalized) AS email
       FROM activeclinic.staff_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
       JOIN activeclinic.staff_members s ON s.id = a.staff_member_id
       LEFT JOIN platform.identities i ON i.id = s.platform_identity_id
      WHERE a.organization_id = $1
        AND r.role_key = 'activeclinic_receptionist'
        AND COALESCE(s.email_normalized, i.email_normalized) LIKE 'reception-%'
      LIMIT 1`,
    [clinic.organizationId]
  );
  assert.equal(receptionist.rowCount, 1);
  const receptionistJar = await loginClinic(app, receptionist.rows[0].email, SYNTHETIC_PASSWORD);
  const denied = await acGet(app, receptionistJar, "/app/diagnostics/laboratory/queue");
  assert.equal(denied.status, 403);

  const scope = await pool.query(
    `SELECT f.id AS facility_id,
            f.healthcare_organization_id,
            s.id AS staff_id
       FROM activeclinic.facilities f
       JOIN activeclinic.staff_members s
         ON s.organization_id = f.organization_id
        AND s.status = 'active'
      WHERE f.organization_id = $1
      ORDER BY f.is_primary DESC, f.created_at ASC
      LIMIT 1`,
    [clinic.organizationId]
  );
  assert.equal(scope.rowCount, 1);
  const found = scope.rows[0];
  for (const roleKey of [CLINICIAN, LAB_TECHNICIAN]) {
    const assigned = await assignStaffRole(pool, {
      organizationId: clinic.organizationId,
      staffMemberId: found.staff_id,
      roleKey,
      scopeType: "facility",
      facilityId: found.facility_id,
      assignmentOrigin: "system",
      env,
    });
    assert.equal(assigned.ok, true, assigned.code || roleKey);
  }
  const verifierEmail = `lab-verify-${stamp()}@example.invalid`;
  await provisionFacilityStaff(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: found.healthcare_organization_id,
    facilityId: found.facility_id,
    env,
  }, {
    email: verifierEmail,
    phone: `+26095${String(Date.now()).slice(-7)}`,
    password: CLINIC_PASSWORD,
  }, LAB_TECHNICIAN);

  const jar = await loginClinic(app, clinic.email);
  const created = await acPost(app, jar, "/app/patients", {
    first_name: "Lab",
    last_name: `Result${String(Date.now()).slice(-6)}`,
    sex_at_registration: "female",
    date_of_birth: "1991-03-03",
    phone_country: "ZM",
    phone_national: `97${String(Date.now()).slice(-7)}`,
    step: "confirm",
  });
  assert.match(created.text, /Patient created/);
  const number = ((created.text.match(/data-ac-patient-number="1">([^<]+)/) || [])[1] || "").trim();
  const storedPatient = await pool.query(
    `SELECT id FROM activeclinic.patients WHERE organization_id = $1 AND patient_number = $2`,
    [clinic.organizationId, number]
  );
  assert.equal(storedPatient.rowCount, 1);
  const patientId = storedPatient.rows[0].id;
  const started = await acPost(app, jar, "/app/clinical/start-encounter", {
    patient_id: patientId,
    encounter_type: "outpatient",
  });
  assert.equal(started.status, 303, started.text.slice(0, 200));
  const encounterId = String(started.headers.location).split("/").pop().split("?")[0];
  const ordered = await acPost(app, jar, `/app/clinical/encounter/${encounterId}/order/lab`, {
    test_code: "CBC",
    urgency: "routine",
    reason: "G224 synthetic order",
  }, `/app/clinical/encounter/${encounterId}/order/lab`);
  assert.equal(ordered.status, 303, ordered.text.slice(0, 240));
  const requestRow = await pool.query(
    `SELECT id, request_number, patient_id, status
       FROM activeclinic.laboratory_requests
      WHERE encounter_id = $1 AND organization_id = $2`,
    [encounterId, clinic.organizationId]
  );
  assert.equal(requestRow.rowCount, 1);
  assert.equal(requestRow.rows[0].patient_id, patientId);
  assert.equal(requestRow.rows[0].status, "pending_collection");
  const requestId = requestRow.rows[0].id;
  const requestNumber = requestRow.rows[0].request_number;

  const detail = await acGet(app, jar, `/app/diagnostics/laboratory/request/${requestId}`);
  assert.equal(detail.status, 200, detail.text.slice(0, 200));
  assert.match(detail.text, /Collect specimen/);
  const collected = await acPost(app, jar, `/app/diagnostics/laboratory/request/${requestId}/collect`, {
    specimen_type: "blood",
  });
  assert.equal(collected.status, 303, collected.text.slice(0, 200));
  const specimen = await pool.query(
    `SELECT id, patient_id, status FROM activeclinic.specimens WHERE laboratory_request_id = $1`,
    [requestId]
  );
  assert.equal(specimen.rowCount, 1);
  assert.equal(specimen.rows[0].patient_id, patientId);
  assert.equal(specimen.rows[0].status, "collected");
  const received = await acPost(
    app,
    jar,
    `/app/diagnostics/laboratory/specimen/${specimen.rows[0].id}/receive`,
    { event_note: "G224 received" }
  );
  assert.equal(received.status, 303, received.text.slice(0, 200));
  const afterReceipt = await pool.query(
    `SELECT status FROM activeclinic.laboratory_requests WHERE id = $1`,
    [requestId]
  );
  assert.equal(afterReceipt.rows[0].status, "received");
  const receivedQueue = await acGet(app, jar, "/app/diagnostics/laboratory/queue?status=received");
  assert.match(receivedQueue.text, new RegExp(requestNumber));
  const processingQueue = await acGet(app, jar, "/app/diagnostics/laboratory/queue?status=processing");
  assert.equal(processingQueue.text.includes(requestNumber), false);
  const dashboard = await acGet(app, jar, "/app/diagnostics/laboratory");
  assert.match(dashboard.text, /data-ac-lab-count="received">1</);
  const ready = await acGet(app, jar, `/app/diagnostics/laboratory/request/${requestId}`);
  assert.match(ready.text, /Enter result/);

  const mismatched = await enterLaboratoryResult(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: found.healthcare_organization_id,
    facilityId: found.facility_id,
    laboratoryRequestId: requestId,
    patientId: "00000000-0000-4000-8000-000000000099",
    resultSummary: "wrong patient",
    isCritical: false,
    components: [],
    actor: { staffId: found.staff_id },
  });
  assert.equal(mismatched.code, RESULT.PATIENT_NOT_FOUND);
  const summary = `Hemoglobin recorded ${requestNumber}`;
  const entered = await acPost(app, jar, `/app/diagnostics/laboratory/request/${requestId}/result`, {
    result_summary: summary,
    components: "[]",
  });
  assert.equal(entered.status, 303, entered.text.slice(0, 240));
  const stored = await pool.query(
    `SELECT id, patient_id, status, result_summary, entered_by_staff_id
       FROM activeclinic.laboratory_results
      WHERE laboratory_request_id = $1`,
    [requestId]
  );
  assert.equal(stored.rowCount, 1);
  assert.equal(stored.rows[0].patient_id, patientId);
  assert.equal(stored.rows[0].status, "resulted");
  assert.equal(stored.rows[0].result_summary, summary);
  const recorded = await acGet(app, jar, `/app/diagnostics/laboratory/request/${requestId}`);
  assert.match(recorded.text, /Print result/);
  assert.match(recorded.text, new RegExp(summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const selfVerify = await acPost(
    app,
    jar,
    `/app/diagnostics/laboratory/results/${stored.rows[0].id}/verify`,
    { request_id: requestId },
    `/app/diagnostics/laboratory/request/${requestId}`
  );
  assert.equal(selfVerify.status, 403);

  const verifier = await loginClinic(app, verifierEmail);
  const foreign = await acGet(app, other.jar, `/app/diagnostics/laboratory/request/${requestId}`);
  assert.notEqual(foreign.status, 200);
  assert.equal(foreign.text.includes(summary), false);
  const verified = await acPost(
    app,
    verifier,
    `/app/diagnostics/laboratory/results/${stored.rows[0].id}/verify`,
    { request_id: requestId },
    `/app/diagnostics/laboratory/request/${requestId}`
  );
  assert.equal(verified.status, 303, verified.text.slice(0, 200));
  const finalRequest = await pool.query(
    `SELECT status FROM activeclinic.laboratory_requests WHERE id = $1`,
    [requestId]
  );
  const finalResult = await pool.query(
    `SELECT status, verified_by_staff_id FROM activeclinic.laboratory_results WHERE id = $1`,
    [stored.rows[0].id]
  );
  assert.equal(finalRequest.rows[0].status, "verified");
  assert.equal(finalResult.rows[0].status, "verified");
  assert.notEqual(finalResult.rows[0].verified_by_staff_id, found.staff_id);
  const readBack = await acGet(app, jar, `/app/clinical/encounter/${encounterId}`);
  assert.equal(readBack.status, 200, readBack.text.slice(0, 200));
  assert.match(readBack.text, /data-ac-lab-readback="1"/);
  assert.match(readBack.text, new RegExp(summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

async function runG229Radiology(pool, connectionString, env) {
  const { enterRadiologyReport, RESULT } = require(
    "../../../src/activeclinic/services/activeClinicDiagnosticsService"
  );
  const { assignStaffRole, RADIOLOGY_STAFF, CLINICIAN } = require(
    "../../../src/activeclinic/services/activeClinicAuthorizationService"
  );
  const { provisionFacilityStaff, SYNTHETIC_PASSWORD } = require("../fixtures/v13SyntheticFixtures");
  const { app, clinic, other } = await openClinic(pool, connectionString, env);
  const receptionist = await pool.query(
    `SELECT COALESCE(s.email_normalized, i.email_normalized) AS email
       FROM activeclinic.staff_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
       JOIN activeclinic.staff_members s ON s.id = a.staff_member_id
       LEFT JOIN platform.identities i ON i.id = s.platform_identity_id
      WHERE a.organization_id = $1
        AND r.role_key = 'activeclinic_receptionist'
        AND COALESCE(s.email_normalized, i.email_normalized) LIKE 'reception-%'
      LIMIT 1`,
    [clinic.organizationId]
  );
  assert.equal(receptionist.rowCount, 1);
  const receptionistJar = await loginClinic(app, receptionist.rows[0].email, SYNTHETIC_PASSWORD);
  const denied = await acGet(app, receptionistJar, "/app/diagnostics/radiology/queue");
  assert.equal(denied.status, 403);

  const scope = await pool.query(
    `SELECT f.id AS facility_id,
            f.healthcare_organization_id,
            s.id AS staff_id
       FROM activeclinic.facilities f
       JOIN activeclinic.staff_members s
         ON s.organization_id = f.organization_id
        AND s.status = 'active'
      WHERE f.organization_id = $1
      ORDER BY f.is_primary DESC, f.created_at ASC
      LIMIT 1`,
    [clinic.organizationId]
  );
  assert.equal(scope.rowCount, 1);
  const found = scope.rows[0];
  for (const roleKey of [CLINICIAN, RADIOLOGY_STAFF]) {
    const assigned = await assignStaffRole(pool, {
      organizationId: clinic.organizationId,
      staffMemberId: found.staff_id,
      roleKey,
      scopeType: "facility",
      facilityId: found.facility_id,
      assignmentOrigin: "system",
      env,
    });
    assert.equal(assigned.ok, true, assigned.code || roleKey);
  }
  const verifierEmail = `rad-verify-${stamp()}@example.invalid`;
  await provisionFacilityStaff(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: found.healthcare_organization_id,
    facilityId: found.facility_id,
    env,
  }, {
    email: verifierEmail,
    phone: `+26095${String(Date.now()).slice(-7)}`,
    password: CLINIC_PASSWORD,
  }, RADIOLOGY_STAFF);

  const jar = await loginClinic(app, clinic.email);
  const created = await acPost(app, jar, "/app/patients", {
    first_name: "Rad",
    last_name: `Report${String(Date.now()).slice(-6)}`,
    sex_at_registration: "male",
    date_of_birth: "1988-07-07",
    phone_country: "ZM",
    phone_national: `96${String(Date.now()).slice(-7)}`,
    step: "confirm",
  });
  assert.match(created.text, /Patient created/);
  const number = ((created.text.match(/data-ac-patient-number="1">([^<]+)/) || [])[1] || "").trim();
  const storedPatient = await pool.query(
    `SELECT id FROM activeclinic.patients WHERE organization_id = $1 AND patient_number = $2`,
    [clinic.organizationId, number]
  );
  assert.equal(storedPatient.rowCount, 1);
  const patientId = storedPatient.rows[0].id;
  const started = await acPost(app, jar, "/app/clinical/start-encounter", {
    patient_id: patientId,
    encounter_type: "outpatient",
  });
  assert.equal(started.status, 303, started.text.slice(0, 200));
  const encounterId = String(started.headers.location).split("/").pop().split("?")[0];
  const ordered = await acPost(app, jar, `/app/clinical/encounter/${encounterId}/order/radiology`, {
    imaging_type: "x_ray",
    body_part: "Chest",
    instructions: "G229 synthetic radiology order",
    urgency: "routine",
  }, `/app/clinical/encounter/${encounterId}/order/radiology`);
  assert.equal(ordered.status, 303, ordered.text.slice(0, 240));
  const requestRow = await pool.query(
    `SELECT id, request_number, patient_id, status
       FROM activeclinic.radiology_requests
      WHERE encounter_id = $1 AND organization_id = $2`,
    [encounterId, clinic.organizationId]
  );
  assert.equal(requestRow.rowCount, 1);
  assert.equal(requestRow.rows[0].patient_id, patientId);
  assert.equal(requestRow.rows[0].status, "pending");
  const requestId = requestRow.rows[0].id;
  const requestNumber = requestRow.rows[0].request_number;

  const pendingQueue = await acGet(app, jar, "/app/diagnostics/radiology/queue?status=pending");
  assert.match(pendingQueue.text, new RegExp(requestNumber));
  const reportedQueueEmpty = await acGet(app, jar, "/app/diagnostics/radiology/queue?status=reported");
  assert.equal(reportedQueueEmpty.text.includes(requestNumber), false);
  const dashboard = await acGet(app, jar, "/app/diagnostics/radiology");
  assert.match(dashboard.text, /data-ac-rad-count="pending">1</);
  const detail = await acGet(app, jar, `/app/diagnostics/radiology/request/${requestId}`);
  assert.equal(detail.status, 200, detail.text.slice(0, 200));
  assert.match(detail.text, /Enter report/);

  const mismatched = await enterRadiologyReport(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: found.healthcare_organization_id,
    facilityId: found.facility_id,
    radiologyRequestId: requestId,
    patientId: "00000000-0000-4000-8000-000000000099",
    findings: "wrong patient",
    impression: "deny",
    technique: "plain",
    isCritical: false,
    actor: { staffId: found.staff_id },
  });
  assert.equal(mismatched.code, RESULT.PATIENT_NOT_FOUND);

  const findings = `Chest clear ${requestNumber}`;
  const impression = `No acute finding ${requestNumber}`;
  const entered = await acPost(app, jar, `/app/diagnostics/radiology/request/${requestId}/report`, {
    findings,
    impression,
    technique: "PA chest",
  });
  assert.equal(entered.status, 303, entered.text.slice(0, 240));
  const stored = await pool.query(
    `SELECT id, patient_id, status, findings, impression, reported_by_staff_id
       FROM activeclinic.radiology_reports
      WHERE radiology_request_id = $1`,
    [requestId]
  );
  assert.equal(stored.rowCount, 1);
  assert.equal(stored.rows[0].patient_id, patientId);
  assert.equal(stored.rows[0].status, "reported");
  assert.equal(stored.rows[0].findings, findings);
  const afterReport = await pool.query(
    `SELECT status FROM activeclinic.radiology_requests WHERE id = $1`,
    [requestId]
  );
  assert.equal(afterReport.rows[0].status, "reported");
  const openQueue = await acGet(app, jar, "/app/diagnostics/radiology/queue?status=open");
  assert.equal(openQueue.text.includes(requestNumber), false);
  const reportedQueue = await acGet(app, jar, "/app/diagnostics/radiology/queue?status=reported");
  assert.match(reportedQueue.text, new RegExp(requestNumber));
  const afterDash = await acGet(app, jar, "/app/diagnostics/radiology");
  assert.match(afterDash.text, /data-ac-rad-count="reported">1</);
  const recorded = await acGet(app, jar, `/app/diagnostics/radiology/request/${requestId}`);
  assert.match(recorded.text, /Print report/);
  assert.match(recorded.text, new RegExp(findings.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const selfVerify = await acPost(
    app,
    jar,
    `/app/diagnostics/radiology/reports/${stored.rows[0].id}/verify`,
    { request_id: requestId },
    `/app/diagnostics/radiology/request/${requestId}`
  );
  assert.equal(selfVerify.status, 403);

  const verifier = await loginClinic(app, verifierEmail);
  const foreign = await acGet(app, other.jar, `/app/diagnostics/radiology/request/${requestId}`);
  assert.notEqual(foreign.status, 200);
  assert.equal(foreign.text.includes(findings), false);
  const verified = await acPost(
    app,
    verifier,
    `/app/diagnostics/radiology/reports/${stored.rows[0].id}/verify`,
    { request_id: requestId },
    `/app/diagnostics/radiology/request/${requestId}`
  );
  assert.equal(verified.status, 303, verified.text.slice(0, 200));
  const finalRequest = await pool.query(
    `SELECT status FROM activeclinic.radiology_requests WHERE id = $1`,
    [requestId]
  );
  const finalReport = await pool.query(
    `SELECT status, verified_by_staff_id FROM activeclinic.radiology_reports WHERE id = $1`,
    [stored.rows[0].id]
  );
  assert.equal(finalRequest.rows[0].status, "verified");
  assert.equal(finalReport.rows[0].status, "verified");
  assert.notEqual(finalReport.rows[0].verified_by_staff_id, found.staff_id);
  const readBack = await acGet(app, jar, `/app/clinical/encounter/${encounterId}`);
  assert.equal(readBack.status, 200, readBack.text.slice(0, 200));
  assert.match(readBack.text, /data-ac-rad-readback="1"/);
  assert.match(readBack.text, new RegExp(findings.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

module.exports = {
  runAcWeb08,
  runAcWeb09,
  runAcRec02,
  runAcRec03,
  runAcPub01,
  runBbWeb08,
  runBbWeb09,
  runBbWeb10,
  runBbAnn02,
  runG224Laboratory,
  runG229Radiology,
};
