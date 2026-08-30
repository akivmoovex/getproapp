"use strict";

/**
 * Complete new-tenant provisioning audit for a brand-new clinic and church.
 * Local/ephemeral foundation Postgres only. Retries the provision flow and
 * asserts no duplicate org, admin, facility/HQ, departments, website, or
 * template content.
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
  PRODUCT,
  LIFECYCLE,
  initializeOrganizationWebsite,
} = require("../src/platform/registration");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const {
  approveAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/approveClinicRegistrationService");
const { ORGANIZATION_ADMIN } = require("../src/activeclinic/services/activeClinicAuthorizationService");
const { DEFAULT_DEPARTMENT_SPECS, ensureDefaultDepartments } = require("../src/activeclinic/services/activeClinicDepartmentService");
const acAdapter = require("../src/activeclinic/registration/activeClinicRegistrationAdapter");
const bbAdapter = require("../src/blessboard/registration/blessboardChurchRegistrationAdapter");
const {
  submitChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationService");
const {
  validatePlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const {
  seedTenantOwnedWebsiteTemplateContent,
} = require("../src/blessboard/services/seedTenantWebsiteTemplateContent");
const { PUBLIC_PAGE_KEYS } = require("../src/blessboard/services/publicContentConstants");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const { authorizeWebsiteInstance } = require("../src/platform/website/authorizeWebsite");
const { PERMISSIONS } = require("../src/platform/website/permissions");
const {
  PRODUCT_CODE,
  buildPublicOrganizationWebsitePath,
  buildPublicWebsiteEditPath,
} = require("../src/platform/website/publicWebsiteUrl");
const { CODE_ACTIVECLINIC_ORG_V6, COOKIE_ACTIVECLINIC_ORG } = require("../src/platform/config/deploymentProfiles");
const { createActiveClinicFoundationApp } = require("../src/activeclinic/http/activeClinicFoundationServer");
const { createPlatformIdentitySession } = require("../src/platform/session/createDeploymentSession");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 910000000;
let ipSeq = 70;

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

function clinicPayload(overrides) {
  stamp += 1;
  return {
    clinicName: `NTP Clinic ${stamp}`,
    contactName: "Clinic Administrator",
    contactEmail: `ntp-clinic-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka Province",
    city: "Lusaka",
    address: "1 Independence Avenue",
    countryCode: "ZM",
    notes: "new tenant provisioning audit",
    password: "clinic-admin-pass-12",
    passwordConfirm: "clinic-admin-pass-12",
    acceptTerms: "on",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    dataEnvironment: "testing",
    env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    ...overrides,
  };
}

function churchBody(overrides) {
  stamp += 1;
  const key = `ntpch${stamp}${crypto.randomBytes(3).toString("hex")}`;
  return {
    church_name: `NTP Church ${stamp} ${key}`,
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
    requestId: `ntp-${Date.now()}-${ipSeq}`,
    get: () => "ntp-test-agent",
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

async function count(sql, params) {
  const row = await pool.query(sql, params);
  return Number(row.rows[0].n);
}

describe("v7 new tenant provisioning audit", () => {
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

  it("brand-new clinic: org, admin, memberships, lifecycle, onboarding, website, editor", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const result = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.canonicalLifecycle, LIFECYCLE.ACTIVE);
    assert.equal(result.onboarding && result.onboarding.state, LIFECYCLE.ONBOARDING);
    assert.ok(result.organizationId);
    assert.ok(result.identityId);
    assert.ok(result.staffMemberId);
    assert.ok(result.facility && result.facility.id);
    assert.ok(result.healthcareOrganization && result.healthcareOrganization.id);

    const org = await pool.query(
      `SELECT id, organization_key, status, display_name
         FROM platform.organizations WHERE id = $1`,
      [result.organizationId]
    );
    assert.equal(org.rowCount, 1);
    assert.equal(org.rows[0].status, "active");
    const slug = org.rows[0].organization_key;
    assert.equal(result.slug, slug);

    const identity = await pool.query(
      `SELECT id, status, email_normalized FROM platform.identities WHERE id = $1`,
      [result.identityId]
    );
    assert.equal(identity.rowCount, 1);
    assert.equal(identity.rows[0].status, "active");
    assert.equal(identity.rows[0].email_normalized, payload.contactEmail);

    const staff = await pool.query(
      `SELECT id, platform_identity_id, status
         FROM activeclinic.staff_members
        WHERE organization_id = $1 AND platform_identity_id = $2`,
      [result.organizationId, result.identityId]
    );
    assert.equal(staff.rowCount, 1);
    assert.equal(staff.rows[0].status, "active");

    const roles = await pool.query(
      `SELECT r.role_key
         FROM activeclinic.staff_role_assignments a
         JOIN blessboard.roles r ON r.id = a.role_id
        WHERE a.organization_id = $1 AND a.staff_member_id = $2 AND a.status = 'active'`,
      [result.organizationId, result.staffMemberId]
    );
    assert.ok(roles.rows.some((row) => row.role_key === ORGANIZATION_ADMIN));

    const memberships = await pool.query(
      `SELECT count(*)::int AS n
         FROM activeclinic.staff_facility_assignments
        WHERE organization_id = $1 AND staff_member_id = $2 AND status = 'active'`,
      [result.organizationId, result.staffMemberId]
    );
    assert.equal(memberships.rows[0].n, 1);

    const appRow = await pool.query(
      `SELECT status, provisioning_status FROM activeclinic.clinic_registration_applications WHERE id = $1`,
      [result.application.id]
    );
    assert.equal(appRow.rows[0].status, "active");
    assert.equal(appRow.rows[0].provisioning_status, "provisioned");

    const facilities = await pool.query(
      `SELECT id, facility_key, is_primary, status, country_code, timezone
         FROM activeclinic.facilities WHERE organization_id = $1`,
      [result.organizationId]
    );
    assert.equal(facilities.rowCount, 1);
    assert.equal(facilities.rows[0].is_primary, true);
    assert.equal(facilities.rows[0].facility_key, "hq");
    assert.equal(facilities.rows[0].status, "active");
    assert.equal(facilities.rows[0].country_code, "ZM");
    assert.equal(facilities.rows[0].timezone, "Africa/Lusaka");

    const hco = await pool.query(
      `SELECT public_name, country_code, timezone, status
         FROM activeclinic.healthcare_organizations WHERE organization_id = $1`,
      [result.organizationId]
    );
    assert.equal(hco.rowCount, 1);
    assert.equal(hco.rows[0].public_name, payload.clinicName);
    assert.equal(hco.rows[0].country_code, "ZM");
    assert.equal(hco.rows[0].timezone, "Africa/Lusaka");

    const deptKeys = (
      await pool.query(
        `SELECT department_key FROM activeclinic.departments
          WHERE organization_id = $1 ORDER BY department_key`,
        [result.organizationId]
      )
    ).rows.map((row) => row.department_key);
    assert.deepEqual(deptKeys, DEFAULT_DEPARTMENT_SPECS.map((spec) => spec.key).sort());

    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: result.organizationId,
      productCode: "activeclinic",
    });
    assert.ok(instance);
    assert.equal(instance.slug, slug);
    const content = await contentService.listWebsiteContent(pool, instance, result.organizationId);
    const byKey = Object.fromEntries(content.map((row) => [row.contentKey, row.draftValue]));
    assert.equal(byKey["home.hero.title"], payload.clinicName);
    assert.equal(byKey["contact.email"], payload.contactEmail);
    assert.equal(byKey["location.address"], payload.address);
    assert.match(String(byKey["home.hero.subtitle"] || ""), /Welcome to/);
    assert.ok(content.every((row) => row.organizationId === result.organizationId));

    const publicPath = buildPublicOrganizationWebsitePath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: slug,
    });
    assert.equal(publicPath, `/clinics/${slug}`);
    const editPath = buildPublicWebsiteEditPath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: slug,
    });
    assert.equal(editPath, `/clinics/${slug}?website_edit=1&website_mode=draft`);

    const authz = await authorizeWebsiteInstance(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      grantedPermissions: [PERMISSIONS.EDIT, PERMISSIONS.VIEW],
      permission: PERMISSIONS.EDIT,
    });
    assert.equal(authz.ok, true, JSON.stringify(authz));

    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: result.identityId,
      organizationId: result.organizationId,
    });
    assert.equal(session.ok, true, JSON.stringify(session));
    const app = createActiveClinicFoundationApp({ getPool: () => pool, env: MINIMAL_AC });
    const edit = await request(app)
      .get(editPath)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`);
    assert.equal(edit.status, 200);
    assert.match(edit.text, /data-website-start="1"/);
    assert.match(edit.text, /data-website-chrome/);

    const retry = await approveAndProvisionClinicRegistration(pool, {
      applicationId: result.application.id,
      dataEnvironment: "testing",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(retry.ok, true, JSON.stringify(retry));
    assert.equal(retry.alreadyProvisioned || retry.organizationId === result.organizationId, true);

    const websiteAgain = await initializeOrganizationWebsite(pool, {
      adapter: acAdapter,
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: result.organizationId,
      application: result.application,
      provision: result,
    });
    assert.equal(websiteAgain.created, false);
    assert.equal(websiteAgain.existed, true);

    const deptsAgain = await ensureDefaultDepartments(pool, {
      organizationId: result.organizationId,
      healthcareOrganizationId: result.healthcareOrganization.id,
      facilityId: result.facility.id,
    });
    assert.equal(deptsAgain.ok, true);
    assert.equal(deptsAgain.created, 0);

    const duplicateSubmit = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(duplicateSubmit.ok, false);
    assert.equal(duplicateSubmit.code, "duplicate_application");

    assert.equal(await count(`SELECT count(*)::int AS n FROM platform.organizations WHERE id = $1`, [result.organizationId]), 1);
    assert.equal(
      await count(
        `SELECT count(*)::int AS n FROM platform.identities WHERE email_normalized = $1`,
        [payload.contactEmail]
      ),
      1
    );
    assert.equal(
      await count(
        `SELECT count(*)::int AS n FROM activeclinic.staff_members WHERE organization_id = $1 AND platform_identity_id = $2`,
        [result.organizationId, result.identityId]
      ),
      1
    );
    assert.equal(
      await count(`SELECT count(*)::int AS n FROM activeclinic.facilities WHERE organization_id = $1`, [
        result.organizationId,
      ]),
      1
    );
    assert.equal(
      await count(`SELECT count(*)::int AS n FROM activeclinic.departments WHERE organization_id = $1`, [
        result.organizationId,
      ]),
      DEFAULT_DEPARTMENT_SPECS.length
    );
    assert.equal(
      await count(
        `SELECT count(*)::int AS n FROM platform.website_instances WHERE organization_id = $1 AND product_code = 'activeclinic' AND status <> 'archived'`,
        [result.organizationId]
      ),
      1
    );
    const contentCount = await count(
      `SELECT count(*)::int AS n FROM platform.website_content WHERE instance_id = $1 AND content_key = 'home.hero.title'`,
      [instance.id]
    );
    assert.equal(contentCount, 1);
  });

  it("brand-new church: org, admin, HQ, plan, lifecycle, onboarding, website, editor", async () => {
    if (!requireDb()) return;
    const body = churchBody();
    const result = await submitChurch(body);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.canonicalLifecycle, LIFECYCLE.ACTIVE);
    const organizationId = result.records.organizationId;
    const organizationKey = result.records.organizationKey || body.organization_key;
    const churchId = result.records.churchId || (result.records.church && result.records.church.id);
    const adminUserId = result.records.administratorUserId;
    assert.ok(organizationId);
    assert.ok(churchId);
    assert.ok(adminUserId);

    const org = await pool.query(
      `SELECT id, organization_key, status FROM platform.organizations WHERE id = $1`,
      [organizationId]
    );
    assert.equal(org.rowCount, 1);
    assert.equal(org.rows[0].status, "active");
    assert.equal(org.rows[0].organization_key, organizationKey);

    const admin = await pool.query(
      `SELECT id, status, email_normalized FROM blessboard.users WHERE id = $1`,
      [adminUserId]
    );
    assert.equal(admin.rowCount, 1);
    assert.equal(admin.rows[0].email_normalized, body.email.toLowerCase());
    assert.equal(admin.rows[0].status, "active");

    const roles = await pool.query(
      `SELECT role_key FROM blessboard.user_roles
        WHERE user_id = $1 AND organization_id = $2 AND status = 'active'
        ORDER BY role_key`,
      [adminUserId, organizationId]
    );
    const roleKeys = roles.rows.map((row) => row.role_key);
    assert.ok(roleKeys.includes("church_hq_admin"));
    assert.ok(roleKeys.includes("branch_admin"));

    const churches = await pool.query(
      `SELECT id FROM blessboard.churches WHERE organization_id = $1`,
      [organizationId]
    );
    assert.equal(churches.rowCount, 1);

    const hq = await pool.query(
      `SELECT id, branch_key, branch_type, is_primary, status, display_name, country_code
         FROM blessboard.branches WHERE church_id = $1`,
      [churchId]
    );
    assert.equal(hq.rowCount, 1);
    assert.equal(hq.rows[0].branch_key, "hq");
    assert.equal(hq.rows[0].branch_type, "hq");
    assert.equal(hq.rows[0].is_primary, true);
    assert.equal(hq.rows[0].status, "active");
    assert.equal(hq.rows[0].display_name, body.branch_name);
    assert.equal(hq.rows[0].country_code, "ZM");

    const subscription = await pool.query(
      `SELECT os.status, p.plan_key
         FROM platform.organization_subscriptions os
         JOIN platform.plans p ON p.id = os.plan_id
        WHERE os.organization_id = $1`,
      [organizationId]
    );
    assert.equal(subscription.rowCount, 1);
    assert.equal(subscription.rows[0].plan_key, "free");
    assert.equal(subscription.rows[0].status, "active");

    const settings = await pool.query(
      `SELECT public_name, website_status, primary_email
         FROM blessboard.church_settings WHERE church_id = $1`,
      [churchId]
    );
    assert.equal(settings.rowCount, 1);
    assert.equal(settings.rows[0].public_name, body.church_name);
    assert.equal(settings.rows[0].website_status, "draft");
    assert.equal(String(settings.rows[0].primary_email || "").toLowerCase(), body.email.toLowerCase());

    const onboarding = await pool.query(
      `SELECT onboarding_status, follow_up_status
         FROM blessboard.organization_onboarding WHERE organization_id = $1`,
      [organizationId]
    );
    assert.equal(onboarding.rowCount, 1);
    assert.equal(onboarding.rows[0].onboarding_status, "in_progress");
    assert.ok(["new", "self_onboarding"].includes(onboarding.rows[0].follow_up_status));

    const appRow = await pool.query(
      `SELECT application_status, provisioning_status
         FROM blessboard.platform_church_registration_applications WHERE id = $1`,
      [result.application.id]
    );
    assert.equal(appRow.rows[0].application_status, "active");
    assert.equal(appRow.rows[0].provisioning_status, "provisioned");

    const pages = await pool.query(
      `SELECT page_key, status FROM blessboard.public_pages
        WHERE church_id = $1 AND branch_id IS NULL AND status <> 'archived'
        ORDER BY page_key`,
      [churchId]
    );
    assert.deepEqual(
      pages.rows.map((row) => row.page_key).sort(),
      PUBLIC_PAGE_KEYS.slice().sort()
    );
    const hero = await pool.query(
      `SELECT count(*)::int AS n
         FROM blessboard.page_sections ps
         JOIN blessboard.public_pages pp ON pp.id = ps.page_id
        WHERE pp.church_id = $1 AND pp.page_key = 'home' AND ps.section_key = 'hero'`,
      [churchId]
    );
    assert.equal(hero.rows[0].n, 1);
    const welcome = await pool.query(
      `SELECT heading, body_text
         FROM blessboard.page_sections ps
         JOIN blessboard.public_pages pp ON pp.id = ps.page_id
        WHERE pp.church_id = $1 AND pp.page_key = 'home' AND ps.section_key = 'welcome'`,
      [churchId]
    );
    assert.equal(welcome.rowCount, 1);
    assert.match(
      String(welcome.rows[0].body_text || welcome.rows[0].heading || ""),
      new RegExp(body.church_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );

    const sites = await pool.query(
      `SELECT id, slug, status, publish_policy, lifecycle_status
         FROM platform.website_instances
        WHERE organization_id = $1 AND product_code = 'blessboard' AND status <> 'archived'`,
      [organizationId]
    );
    assert.equal(sites.rowCount, 1);
    assert.equal(sites.rows[0].status, "coming_soon");
    assert.equal(sites.rows[0].publish_policy, "TENANT_PUBLISH");
    const publicPath = buildPublicOrganizationWebsitePath({
      product: PRODUCT_CODE.BLESSBOARD,
      organizationKey,
    });
    assert.equal(publicPath, `/c/${organizationKey}`);
    const editPath = buildPublicWebsiteEditPath({
      product: PRODUCT_CODE.BLESSBOARD,
      organizationKey,
    });
    assert.equal(editPath, `/c/${organizationKey}?website_edit=1`);

    const session = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: adminUserId,
      organizationId,
    });
    assert.equal(session.ok, true, session.message || session.code);
    const bbApp = createV5FoundationApp({
      getPool: () => pool,
      env: {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
        BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
        BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
      },
    });
    const edit = await request(bbApp)
      .get(editPath)
      .set("Host", "blessboard.org")
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${session.rawToken}`);
    assert.equal(edit.status, 200);
    assert.match(edit.text, /data-bb-inline-start="1"/);

    const retry = await provisionRegisteredBlessBoardChurch(
      pool,
      {
        applicationId: result.application.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: organizationKey,
        actorContext: {
          type: "public_self_registration",
          source: "register_church",
          dataEnvironment: "testing",
          deploymentCode: "blessboard-org-staging",
        },
      },
      { allowRetry: true }
    );
    assert.equal(retry.ok, true, JSON.stringify(retry));
    assert.equal(retry.alreadyProvisioned, true);

    const websiteAgain = await initializeOrganizationWebsite(pool, {
      adapter: bbAdapter,
      productCode: PRODUCT.BLESSBOARD,
      organizationId,
      application: result.application,
      provision: result,
    });
    assert.equal(websiteAgain.created, false);
    assert.equal(websiteAgain.existed, true);

    const seedAgain = await seedTenantOwnedWebsiteTemplateContent(pool, {
      churchId,
      publicName: body.church_name,
      primaryEmail: body.email,
      city: body.city,
    });
    assert.equal(seedAgain.ok, true);
    assert.equal(seedAgain.created, 0);

    const resubmit = await submitChurch(body);
    assert.equal(resubmit.ok, true, JSON.stringify(resubmit));
    assert.equal(resubmit.alreadyProvisioned || resubmit.records.organizationId === organizationId, true);

    assert.equal(await count(`SELECT count(*)::int AS n FROM platform.organizations WHERE id = $1`, [organizationId]), 1);
    assert.equal(
      await count(`SELECT count(*)::int AS n FROM blessboard.users WHERE id = $1`, [adminUserId]),
      1
    );
    assert.equal(
      await count(`SELECT count(*)::int AS n FROM blessboard.churches WHERE organization_id = $1`, [
        organizationId,
      ]),
      1
    );
    assert.equal(
      await count(`SELECT count(*)::int AS n FROM blessboard.branches WHERE church_id = $1`, [churchId]),
      1
    );
    assert.equal(
      await count(
        `SELECT count(*)::int AS n FROM platform.website_instances WHERE organization_id = $1 AND product_code = 'blessboard' AND status <> 'archived'`,
        [organizationId]
      ),
      1
    );
    assert.equal(
      await count(
        `SELECT count(*)::int AS n
           FROM blessboard.page_sections ps
           JOIN blessboard.public_pages pp ON pp.id = ps.page_id
          WHERE pp.church_id = $1 AND pp.page_key = 'home' AND ps.section_key = 'hero'`,
        [churchId]
      ),
      1
    );
    assert.equal(
      await count(`SELECT count(*)::int AS n FROM blessboard.organization_onboarding WHERE organization_id = $1`, [
        organizationId,
      ]),
      1
    );
  });
});
