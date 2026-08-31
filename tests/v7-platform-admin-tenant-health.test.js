"use strict";

/**
 * Platform Admin tenant-health dashboard: live inspect + safe idempotent retry.
 * Isolated local foundation DB only. Does not deploy.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  PRODUCT,
  STAGE,
  presentTenantHealthSummary,
  loadTenantHealthSummary,
  retryTenantProvisioningIfUnhealthy,
  listUnifiedRegistrations,
} = require("../src/platform/registration");
const {
  createClinicRegistrationApplication,
} = require("../src/activeclinic/services/activeClinicPublicOnboardingService");
const {
  approveAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/approveClinicRegistrationService");
const { DEFAULT_DEPARTMENT_SPECS } = require("../src/activeclinic/services/activeClinicDepartmentService");
const { CODE_ACTIVECLINIC_ORG_V6 } = require("../src/platform/config/deploymentProfiles");

const PASSWORD = "TestPassword99!";
const DEPT_KEYS = DEFAULT_DEPARTMENT_SPECS.map((spec) => spec.key);
const ROOT = path.join(__dirname, "..");

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 930000000;

function readRel(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

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

function checkMap(health) {
  const map = {};
  for (const row of health.checks || []) map[row.key] = row.value;
  return map;
}

async function count(sql, params) {
  const row = await pool.query(sql, params);
  return Number(row.rows[0].n);
}

async function createPendingClinic(overrides) {
  stamp += 1;
  const payload = {
    clinicName: `Health Clinic ${stamp}`,
    contactName: "Clinic Administrator",
    contactEmail: `health-clinic-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka",
    city: "Lusaka",
    address: "1 Independence Avenue",
    countryCode: "ZM",
    notes: "tenant health",
    password: PASSWORD,
    passwordConfirm: PASSWORD,
    acceptTerms: "on",
    ...overrides,
  };
  const created = await createClinicRegistrationApplication(pool, payload);
  assert.equal(created.ok, true, JSON.stringify(created));
  return { payload, application: created.application };
}

function provisionInput(applicationId, extra) {
  return {
    applicationId,
    dataEnvironment: "testing",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    ...extra,
  };
}

async function clinicCounts(organizationId, email) {
  return {
    orgs: await count(`SELECT COUNT(*)::int AS n FROM platform.organizations WHERE id = $1`, [
      organizationId,
    ]),
    identities: await count(
      `SELECT COUNT(*)::int AS n FROM platform.identities WHERE email_normalized = $1`,
      [String(email || "").toLowerCase()]
    ),
    facilities: await count(
      `SELECT COUNT(*)::int AS n FROM activeclinic.facilities
        WHERE organization_id = $1 AND facility_key = 'hq'`,
      [organizationId]
    ),
    departments: await count(
      `SELECT COUNT(*)::int AS n FROM activeclinic.departments
        WHERE organization_id = $1 AND department_key = ANY($2::text[])`,
      [organizationId, DEPT_KEYS.slice()]
    ),
    websites: await count(
      `SELECT COUNT(*)::int AS n FROM platform.website_instances
        WHERE organization_id = $1 AND product_code = 'activeclinic' AND status <> 'archived'`,
      [organizationId]
    ),
    roles: await count(
      `SELECT COUNT(*)::int AS n FROM activeclinic.staff_role_assignments
        WHERE organization_id = $1 AND status = 'active'`,
      [organizationId]
    ),
  };
}

describe("V7 Platform Admin tenant health", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("extends existing PA screens with compact health and safe retry", () => {
    const partial = readRel("views/blessboard/v5/partials/tenant-health-summary.ejs");
    assert.match(partial, /data-bb-pa-tenant-health="1"/);
    assert.match(partial, /data-bb-pa-health-row="<%= row.key %>"/);
    assert.match(partial, /data-bb-pa-retry-provision="1"/);
    assert.match(partial, /Retry missing stages/);

    const org = readRel("views/blessboard/v5/platform-admin/organization-detail.ejs");
    assert.match(org, /tenant-health-summary/);
    assert.match(org, /#pa-org-tenant-health/);
    assert.match(org, /already_healthy/);

    const clinic = readRel("views/blessboard/v5/platform-admin/clinic-registration-detail.ejs");
    assert.match(clinic, /tenant-health-summary/);
    assert.match(clinic, /data-ac-clinic-reg-identity="1"/);

    const church = readRel("views/blessboard/v5/platform-admin/registration-application-detail.ejs");
    assert.match(church, /tenant-health-summary/);
    assert.match(church, /already_healthy/);

    const queue = readRel("views/blessboard/v5/platform-admin/registrations.ejs");
    assert.match(queue, /<th>Health<\/th>/);
    assert.match(queue, /data-bb-pa-health-status=/);
    assert.match(queue, /colspan="10"/);

    const css = readRel("public/blessboard/v5/platform-admin.css");
    assert.match(css, /\.bb-pa-tenant-health__dl/);
    const shell = readRel("views/blessboard/v5/partials/platform-admin-shell-start.ejs");
    assert.match(shell, /platform-admin.css\?v=62/);

    const routes = readRel("src/platform/http/platformAdminRoutes.js");
    assert.match(routes, /\/admin\/organizations\/:organizationKey\/retry-provision/);
    const unified = readRel("src/platform/http/platformRegistrationAdminRoutes.js");
    assert.match(unified, /retryTenantProvisioningIfUnhealthy/);
    assert.doesNotMatch(unified, /resumeOrganizationProvisioning/);
  });

  it("presents compact health for a website failure", () => {
    const summary = presentTenantHealthSummary(
      {
        complete: false,
        failedStage: STAGE.WEBSITE_INSTANCE,
        stages: {
          [STAGE.ORGANIZATION]: true,
          [STAGE.ADMINISTRATOR]: true,
          [STAGE.ROLE_ASSIGNMENT]: true,
          [STAGE.FACILITY_HQ]: true,
          [STAGE.MEMBERSHIPS]: true,
          [STAGE.DEFAULT_DEPARTMENTS]: true,
          [STAGE.WEBSITE_INSTANCE]: false,
          [STAGE.TEMPLATE_CONTENT]: false,
          [STAGE.AUDIT_COMPLETION]: false,
        },
        details: {
          organizationStatus: "active",
          websitePublication: "missing",
          departmentsApplicable: true,
        },
      },
      {
        productCode: PRODUCT.ACTIVECLINIC,
        application: {
          id: "00000000-0000-4000-8000-000000000001",
          organization_id: "00000000-0000-4000-8000-000000000002",
          provisioning_status: "website_pending",
          last_provision_error: "incompatible publish_policy schema",
        },
      }
    );
    const map = checkMap(summary);
    assert.equal(map.organization, "ACTIVE");
    assert.equal(map.administrator, "OK");
    assert.equal(map.facility, "OK");
    assert.equal(map.departments, "OK");
    assert.equal(map.website, "FAILED");
    assert.equal(map.reason, "incompatible publish_policy schema");
    assert.equal(map.failed_stage, STAGE.WEBSITE_INSTANCE);
    assert.equal(summary.retryEligible, true);
    assert.match(String(summary.retryHref || ""), /retry-provision/);
  });

  it("healthy tenant shows OK checks and refuses destructive retry", async () => {
    if (!requireDb()) return;
    const { payload, application } = await createPendingClinic();
    const provisioned = await approveAndProvisionClinicRegistration(
      pool,
      provisionInput(application.id)
    );
    assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
    const health = await loadTenantHealthSummary(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      applicationId: application.id,
    });
    const map = checkMap(health);
    assert.equal(health.complete, true);
    assert.equal(health.retryEligible, false);
    assert.equal(map.organization, "ACTIVE");
    assert.equal(map.administrator, "OK");
    assert.equal(map.roles, "OK");
    assert.equal(map.facility, "OK");
    assert.equal(map.memberships, "OK");
    assert.equal(map.departments, "OK");
    assert.equal(map.website, "OK");
    assert.ok(map.website_publication === "PUBLIC" || map.website_publication === "UNPUBLISHED");
    assert.equal(map.failed_stage, undefined);

    const before = await clinicCounts(provisioned.organizationId, payload.contactEmail);
    const retry = await retryTenantProvisioningIfUnhealthy(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      applicationId: application.id,
    });
    assert.equal(retry.ok, false);
    assert.equal(retry.code, "already_healthy");
    const after = await clinicCounts(provisioned.organizationId, payload.contactEmail);
    assert.deepEqual(after, before);
  });

  it("website failure is visible and retryable", async () => {
    if (!requireDb()) return;
    const { application } = await createPendingClinic();
    const first = await approveAndProvisionClinicRegistration(
      pool,
      provisionInput(application.id, {
        allowTestFailureInjection: true,
        failAfter: STAGE.WEBSITE_INSTANCE,
      })
    );
    assert.equal(first.failedStage, STAGE.WEBSITE_INSTANCE);
    const health = await loadTenantHealthSummary(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      applicationId: application.id,
    });
    const map = checkMap(health);
    assert.equal(health.complete, false);
    assert.equal(health.retryEligible, true);
    assert.equal(map.organization, "ACTIVE");
    assert.equal(map.administrator, "OK");
    assert.equal(map.facility, "OK");
    assert.equal(map.departments, "OK");
    assert.equal(map.website, "FAILED");
    assert.equal(health.failedStage, STAGE.WEBSITE_INSTANCE);
    assert.match(String(health.lastProvisioningError || ""), /website_instance|injected_failure/);

    const rows = await listUnifiedRegistrations(pool, {
      product: PRODUCT.ACTIVECLINIC,
      q: application.clinic_name || "Health Clinic",
      limit: 100,
    });
    const row = rows.find((item) => item.id === application.id);
    assert.ok(row);
    assert.equal(row.healthStatus, "FAILED");
  });

  it("role failure is visible and retry-eligible without rebuilding healthy resources", async () => {
    if (!requireDb()) return;
    const { payload, application } = await createPendingClinic();
    const first = await approveAndProvisionClinicRegistration(
      pool,
      provisionInput(application.id, {
        allowTestFailureInjection: true,
        failAfter: STAGE.ROLE_ASSIGNMENT,
      })
    );
    assert.ok(first.organizationId, JSON.stringify(first));
    await pool.query(
      `DELETE FROM activeclinic.staff_role_assignments WHERE organization_id = $1`,
      [first.organizationId]
    );
    const health = await loadTenantHealthSummary(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      applicationId: application.id,
    });
    const map = checkMap(health);
    assert.equal(health.complete, false);
    assert.equal(map.organization, "ACTIVE");
    assert.equal(map.administrator, "OK");
    assert.equal(map.roles, "FAILED");
    assert.equal(health.failedStage, STAGE.ROLE_ASSIGNMENT);
    assert.equal(health.retryEligible, true);
    assert.match(String(health.lastProvisioningError || ""), /role_assignment|injected_failure/);
    const before = await clinicCounts(first.organizationId, payload.contactEmail);
    assert.equal(before.orgs, 1);
    assert.equal(before.roles, 0);
  });

  it("partially provisioned tenant shows earlier checks OK and later FAILED", async () => {
    if (!requireDb()) return;
    const { application } = await createPendingClinic();
    const first = await approveAndProvisionClinicRegistration(
      pool,
      provisionInput(application.id, {
        allowTestFailureInjection: true,
        failAfter: STAGE.ORGANIZATION,
      })
    );
    assert.equal(first.failedStage, STAGE.ORGANIZATION);
    const health = await loadTenantHealthSummary(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      applicationId: application.id,
    });
    const map = checkMap(health);
    assert.equal(health.complete, false);
    assert.equal(map.organization, "ACTIVE");
    assert.equal(map.administrator, "FAILED");
    assert.equal(map.roles, "FAILED");
    assert.equal(map.facility, "FAILED");
    assert.equal(map.memberships, "FAILED");
    assert.equal(map.departments, "FAILED");
    assert.equal(map.website, "FAILED");
    assert.equal(health.failedStage, STAGE.ADMINISTRATOR);
    assert.equal(health.retryEligible, true);
    assert.match(String(health.lastProvisioningError || ""), /organization|injected_failure/);
  });

  it("recovered tenant is complete and a second retry is already_healthy", async () => {
    if (!requireDb()) return;
    const { payload, application } = await createPendingClinic();
    const first = await approveAndProvisionClinicRegistration(
      pool,
      provisionInput(application.id, {
        allowTestFailureInjection: true,
        failAfter: STAGE.WEBSITE_INSTANCE,
      })
    );
    assert.equal(first.failedStage, STAGE.WEBSITE_INSTANCE);
    const before = await clinicCounts(first.organizationId, payload.contactEmail);
    assert.equal(before.websites, 0);

    const retry = await retryTenantProvisioningIfUnhealthy(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      applicationId: application.id,
      dataEnvironment: "testing",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    });
    assert.equal(retry.ok, true, JSON.stringify(retry));
    const recovered = await loadTenantHealthSummary(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      applicationId: application.id,
    });
    const map = checkMap(recovered);
    assert.equal(recovered.complete, true);
    assert.equal(recovered.retryEligible, false);
    assert.equal(map.website, "OK");
    assert.equal(map.failed_stage, undefined);

    const mid = await clinicCounts(first.organizationId, payload.contactEmail);
    assert.equal(mid.orgs, 1);
    assert.equal(mid.facilities, 1);
    assert.equal(mid.websites, 1);

    const second = await retryTenantProvisioningIfUnhealthy(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      applicationId: application.id,
    });
    assert.equal(second.ok, false);
    assert.equal(second.code, "already_healthy");
    const after = await clinicCounts(first.organizationId, payload.contactEmail);
    assert.deepEqual(after, mid);
  });
});
