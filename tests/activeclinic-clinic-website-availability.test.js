"use strict";

/**
 * Clinic website availability is independent of content approval.
 * Platform Admin Publish/Unpublish toggles healthcare_organizations.website_published.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { createClinicRegistrationApplication } = require("../src/activeclinic/services/activeClinicPublicOnboardingService");
const { approveAndProvisionClinicRegistration } = require("../src/activeclinic/services/approveClinicRegistrationService");
const {
  setClinicWebsiteAvailability,
  getClinicWebsiteAvailability,
  ACTION,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const submissionService = require("../src/platform/website/submissionService");
const contentService = require("../src/platform/website/contentService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_FIELD, getCsrfCookieName } = require("../src/platform/http/v5Csrf");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CODE_ORG_STAGING,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { createPlatformIdentitySession } = require("../src/platform/session/createDeploymentSession");

const PASSWORD = "activeclinic-pass-12";
const AC_ENV = {
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  SESSION_SECRET: "a".repeat(48),
};
const BB_ENV = {
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING,
  SESSION_SECRET: "a".repeat(48),
};

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 981000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

function makeAcApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: { ...AC_ENV, DATABASE_URL: databaseUrl },
    log: () => {},
  });
}

function makeBbApp() {
  return createV5FoundationApp({
    getPool: () => pool,
    env: { ...BB_ENV, DATABASE_URL: databaseUrl },
    log: () => {},
  });
}

function extractCsrf(res, env) {
  const cookies = [].concat((res.headers && res.headers["set-cookie"]) || []);
  const name = getCsrfCookieName(env);
  const raw = cookies.find((c) => String(c).startsWith(`${name}=`)) || "";
  const match = String(raw).match(new RegExp(`${name}=([^;]+)`));
  if (match) return decodeURIComponent(match[1]);
  const html = String(res.text || "");
  const m = html.match(new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"`));
  return (m && m[1]) || "";
}

function cookieJar(sessionCookie, res) {
  const parts = [sessionCookie];
  for (const line of [].concat((res && res.headers && res.headers["set-cookie"]) || [])) {
    parts.push(String(line).split(";")[0]);
  }
  return parts.filter(Boolean).join("; ");
}

async function fillAndApproveContent(orgId, instanceId, actorIdentityId) {
  const keys = {
    "home.hero.title": "Rehearsal QA Clinic Live",
    "home.hero.subtitle": "Community primary care",
    "about.story.body": "About our QA clinic.",
    "location.hours": "Mon-Fri 08:00-17:00",
    "location.address": "Lusaka",
    "contact.phone": "+260970000099",
  };
  for (const [contentKey, value] of Object.entries(keys)) {
    const saved = await contentService.saveWebsiteDraft(pool, {
      organizationId: orgId,
      instanceId,
      contentKey,
      value,
      actorIdentityId,
    });
    assert.equal(saved.ok, true, JSON.stringify(saved));
  }
  const submitted = await submissionService.submitWebsiteChanges(pool, {
    organizationId: orgId,
    instanceId,
    actorIdentityId,
  });
  assert.equal(submitted.ok, true, JSON.stringify(submitted));
  const decided = await submissionService.decideWebsiteSubmission(pool, {
    organizationId: orgId,
    submissionId: submitted.submission.id,
    decision: "approve",
    rowVersion: submitted.submission.rowVersion,
    overrideReadiness: true,
    actorIdentityId,
  });
  assert.equal(decided.ok, true, JSON.stringify(decided));
  return decided;
}

describe("clinic website availability", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("F08 website_pending recovery leaves the clinic unpublished", async () => {
    if (!requireDb()) return;
    const created = await createClinicRegistrationApplication(pool, {
      clinicName: "Pending Recover Clinic",
      contactName: "Pat Recover",
      contactEmail: `pend-${Date.now()}@example.test`,
      contactPhone: nextPhone(),
      province: "Lusaka Province",
      city: "Lusaka",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    const pending = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.application.id,
      dataEnvironment: "testing",
      websiteTemplateVersion: 999,
    });
    assert.equal(pending.code, "website_pending");
    const recovered = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.application.id,
      dataEnvironment: "testing",
    });
    assert.equal(recovered.ok, true, JSON.stringify(recovered));
    assert.ok(recovered.instance);
    const orgId = recovered.organizationId;
    const counts = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM activeclinic.healthcare_organizations WHERE organization_id = $1) AS hcos,
         (SELECT count(*)::int FROM activeclinic.facilities WHERE organization_id = $1) AS facilities,
         (SELECT count(*)::int FROM activeclinic.staff_members WHERE organization_id = $1) AS staff,
         (SELECT count(*)::int FROM platform.website_instances WHERE organization_id = $1 AND product_code = 'activeclinic') AS instances,
         (SELECT count(*)::int FROM platform.website_content WHERE organization_id = $1) AS content,
         (SELECT website_published FROM activeclinic.healthcare_organizations WHERE organization_id = $1 LIMIT 1) AS published`,
      [orgId]
    );
    assert.equal(counts.rows[0].hcos, 1);
    assert.equal(counts.rows[0].facilities, 1);
    assert.ok(counts.rows[0].staff >= 1);
    assert.equal(counts.rows[0].instances, 1);
    assert.ok(counts.rows[0].content > 0);
    assert.equal(counts.rows[0].published, false);
  });

  it("F07 content approval does not make the clinic public; PA publish/unpublish does", async () => {
    if (!requireDb()) return;
    const stamp = Date.now().toString(36);
    const created = await createClinicRegistrationApplication(pool, {
      clinicName: `Availability Clinic ${stamp}`,
      contactName: "Ava Admin",
      contactEmail: `avail-${stamp}@example.test`,
      contactPhone: nextPhone(),
      province: "Lusaka Province",
      city: "Lusaka",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    const approved = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.application.id,
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, true, JSON.stringify(approved));
    const orgId = approved.organizationId;
    const slug = approved.slug;
    const orgKey = slug;
    const instanceId = approved.instance.id;

    const beforeApprove = await pool.query(
      `SELECT website_published FROM activeclinic.healthcare_organizations WHERE organization_id = $1`,
      [orgId]
    );
    assert.equal(beforeApprove.rows[0].website_published, false);

    const blocked = await setClinicWebsiteAvailability(pool, {
      organizationKey: orgKey,
      public: true,
      env: AC_ENV,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "approved_version_required");

    await fillAndApproveContent(orgId, instanceId, null);
    const afterContent = await pool.query(
      `SELECT website_published FROM activeclinic.healthcare_organizations WHERE organization_id = $1`,
      [orgId]
    );
    assert.equal(afterContent.rows[0].website_published, false);

    const acApp = makeAcApp();
    const anonBefore = await request(acApp).get(`/clinics/${slug}`);
    assert.equal(anonBefore.status, 403);
    assert.doesNotMatch(anonBefore.text, /data-website-chrome/);
    assert.doesNotMatch(anonBefore.text, /Rehearsal QA Clinic Live/);

    const tooSoon = await setClinicWebsiteAvailability(pool, {
      organizationKey: orgKey,
      public: true,
      env: AC_ENV,
    });
    assert.equal(tooSoon.ok, true);
    assert.equal(tooSoon.websitePublished, true);

    const state = await getClinicWebsiteAvailability(pool, { organizationKey: orgKey, env: AC_ENV });
    assert.equal(state.healthcareOrganization.websitePublished, true);
    assert.ok(state.latestApprovedVersion);
    assert.equal(state.latestApprovedVersion.status, "published");

    const anonLive = await request(acApp).get(`/clinics/${slug}`);
    assert.equal(anonLive.status, 200);
    assert.match(anonLive.text, /Rehearsal QA Clinic Live/);
    assert.doesNotMatch(anonLive.text, /data-website-chrome/);

    const unpublished = await setClinicWebsiteAvailability(pool, {
      organizationKey: orgKey,
      public: false,
      env: AC_ENV,
    });
    assert.equal(unpublished.ok, true);
    assert.equal(unpublished.websitePublished, false);
    const anonHidden = await request(acApp).get(`/clinics/${slug}`);
    assert.equal(anonHidden.status, 403);

    const versionsAfter = await pool.query(
      `SELECT count(*)::int AS n FROM platform.website_versions WHERE instance_id = $1`,
      [instanceId]
    );
    assert.ok(versionsAfter.rows[0].n >= 1);
    const contentAfter = await pool.query(
      `SELECT count(*)::int AS n FROM platform.website_content WHERE instance_id = $1`,
      [instanceId]
    );
    assert.ok(contentAfter.rows[0].n > 0);

    const republished = await setClinicWebsiteAvailability(pool, {
      organizationKey: orgKey,
      public: true,
      env: AC_ENV,
    });
    assert.equal(republished.ok, true);
    const anonAgain = await request(acApp).get(`/clinics/${slug}`);
    assert.equal(anonAgain.status, 200);

    const audit = await pool.query(
      `SELECT action_key, metadata_json FROM platform.website_audit_events
        WHERE organization_id = $1 AND action_key LIKE 'website.availability.%'
        ORDER BY created_at ASC`,
      [orgId]
    );
    const keys = audit.rows.map((r) => r.action_key);
    assert.ok(keys.includes(ACTION.PUBLISH));
    assert.ok(keys.includes(ACTION.UNPUBLISH));
    assert.equal(audit.rows[0].metadata_json.previous, false);
    assert.equal(audit.rows[0].metadata_json.next, true);

    const bbApp = makeBbApp();
    const unauth = await request(bbApp)
      .post(`/admin/organizations/${orgKey}/website/unpublish`)
      .send({ [CSRF_FIELD]: "x" });
    assert.ok(unauth.status === 401 || unauth.status === 303, String(unauth.status));

    const page = await request(bbApp).get(`/admin/organizations/${orgKey}/website`);
    assert.ok(page.status === 401 || page.status === 303, String(page.status));

    const paUser = await createBlessBoardUser(pool, {
      email: `pa-${stamp}@example.org`,
      password: PASSWORD,
      displayName: "Platform Admin",
    });
    assert.equal(paUser.ok, true, JSON.stringify(paUser));
    await pool.query(
      `INSERT INTO blessboard.user_roles (user_id, organization_id, role_key, status)
       VALUES ($1, $2, 'platform_admin', 'active')`,
      [paUser.user.id, orgId]
    );
    const session = await createV5Session(pool, {
      deploymentCode: CODE_ORG_STAGING,
      userId: paUser.user.id,
      organizationId: orgId,
    });
    assert.equal(session.ok, true, JSON.stringify(session));
    const paCookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
    const manage = await request(bbApp)
      .get(`/admin/organizations/${orgKey}/website`)
      .set("Host", "blessboard.org")
      .set("Cookie", paCookie);
    assert.equal(manage.status, 200, manage.text.slice(0, 400));
    assert.match(manage.text, /data-website-availability="public"/);
    assert.match(manage.text, /data-website-availability-form="unpublish"/);
    const csrf = extractCsrf(manage, BB_ENV);
    assert.ok(csrf);

    const noCsrf = await request(bbApp)
      .post(`/admin/organizations/${orgKey}/website/unpublish`)
      .set("Host", "blessboard.org")
      .set("Cookie", paCookie)
      .type("form")
      .send({});
    assert.equal(noCsrf.status, 303);
    assert.match(String(noCsrf.headers.location || ""), /error=csrf/);

    const staffIdent = await pool.query(
      `SELECT platform_identity_id FROM activeclinic.staff_members WHERE id = $1`,
      [approved.staffMemberId]
    );
    const clinicAdminIdentityId = staffIdent.rows[0] && staffIdent.rows[0].platform_identity_id;
    assert.ok(clinicAdminIdentityId);
    const clinicAdminSession = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: clinicAdminIdentityId,
      organizationId: orgId,
    });
    assert.equal(clinicAdminSession.ok, true, JSON.stringify(clinicAdminSession));
    const clinicAdminCookie = `${COOKIE_ACTIVECLINIC_ORG}=${clinicAdminSession.rawToken}`;
    const editorToggle = await request(bbApp)
      .post(`/admin/organizations/${orgKey}/website/unpublish`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookieJar(clinicAdminCookie, manage))
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.ok(
      editorToggle.status === 401 || editorToggle.status === 303,
      String(editorToggle.status)
    );
    const stillPublic = await pool.query(
      `SELECT website_published FROM activeclinic.healthcare_organizations WHERE organization_id = $1`,
      [orgId]
    );
    assert.equal(stillPublic.rows[0].website_published, true);

    const manageUnpub = await request(bbApp)
      .get(`/admin/organizations/${orgKey}/website`)
      .set("Host", "blessboard.org")
      .set("Cookie", paCookie);
    const csrfUnpub = extractCsrf(manageUnpub, BB_ENV);
    const unpub = await request(bbApp)
      .post(`/admin/organizations/${orgKey}/website/unpublish`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookieJar(paCookie, manageUnpub))
      .type("form")
      .send({ [CSRF_FIELD]: csrfUnpub });
    assert.equal(unpub.status, 303);
    assert.match(String(unpub.headers.location || ""), /notice=unpublished/);
    const afterUnpub = await request(acApp).get(`/clinics/${slug}`);
    assert.equal(afterUnpub.status, 403);

    const manage2 = await request(bbApp)
      .get(`/admin/organizations/${orgKey}/website`)
      .set("Host", "blessboard.org")
      .set("Cookie", paCookie);
    const csrf2 = extractCsrf(manage2, BB_ENV);
    const pub = await request(bbApp)
      .post(`/admin/organizations/${orgKey}/website/publish`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookieJar(paCookie, manage2))
      .type("form")
      .send({ [CSRF_FIELD]: csrf2 });
    assert.equal(pub.status, 303);
    assert.match(String(pub.headers.location || ""), /notice=published/);
    const afterPub = await request(acApp).get(`/clinics/${slug}`);
    assert.equal(afterPub.status, 200);

    const forged = await setClinicWebsiteAvailability(pool, {
      organizationKey: "does-not-exist",
      public: true,
      env: AC_ENV,
    });
    assert.equal(forged.ok, false);
    assert.equal(forged.code, "clinic_not_found");
  });
});
