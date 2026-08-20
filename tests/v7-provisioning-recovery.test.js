"use strict";

/**
 * Partial-provision recovery: detect failed stage, persist it, and retry
 * without duplicating org / identity / facility / departments / website.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  PRODUCT,
  LIFECYCLE,
  STAGE,
  toCanonicalLifecycle,
  inspectOrganizationProvisioningCompleteness,
  listUnifiedRegistrations,
} = require("../src/platform/registration");
const {
  createClinicRegistrationApplication,
} = require("../src/activeclinic/services/activeClinicPublicOnboardingService");
const {
  approveAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/approveClinicRegistrationService");
const {
  evaluateStaffEligibility,
} = require("../src/activeclinic/services/activeClinicLoginEligibility");
const { DEFAULT_DEPARTMENT_SPECS } = require("../src/activeclinic/services/activeClinicDepartmentService");
const { CODE_ACTIVECLINIC_ORG_V6 } = require("../src/platform/config/deploymentProfiles");
const {
  submitChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationService");
const {
  validatePlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");

const PASSWORD = "TestPassword99!";
const DEPT_KEYS = DEFAULT_DEPARTMENT_SPECS.map((spec) => spec.key);

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 920000000;

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

async function count(sql, params) {
  const row = await pool.query(sql, params);
  return Number(row.rows[0].n);
}

async function createPendingClinic(overrides) {
  stamp += 1;
  const payload = {
    clinicName: `Recovery Clinic ${stamp}`,
    contactName: "Clinic Administrator",
    contactEmail: `recovery-clinic-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka Province",
    city: "Lusaka",
    address: "1 Independence Avenue",
    countryCode: "ZM",
    notes: "provisioning recovery",
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
    orgs: await count(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE id = $1`,
      [organizationId]
    ),
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
  };
}

describe("V7 provisioning recovery", () => {
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

  it("maps website_pending and active-but-incomplete to provision_failed", () => {
    assert.equal(
      toCanonicalLifecycle(PRODUCT.ACTIVECLINIC, {
        status: "active",
        provisioning_status: "website_pending",
      }),
      LIFECYCLE.PROVISION_FAILED
    );
    assert.equal(
      toCanonicalLifecycle(PRODUCT.ACTIVECLINIC, {
        status: "active",
        provisioning_status: "failed",
        last_provision_stage: STAGE.DEFAULT_DEPARTMENTS,
      }),
      LIFECYCLE.PROVISION_FAILED
    );
    assert.equal(
      toCanonicalLifecycle(PRODUCT.ACTIVECLINIC, {
        status: "active",
        provisioning_status: "provisioned",
      }),
      LIFECYCLE.ACTIVE
    );
    assert.equal(
      toCanonicalLifecycle(PRODUCT.BLESSBOARD, {
        application_status: "active",
        provisioning_status: "provisioning_failed",
        organization_id: "00000000-0000-4000-8000-000000000001",
      }),
      LIFECYCLE.PROVISION_FAILED
    );
  });

  it("inspector reports each incomplete ActiveClinic stage from fixtures", async () => {
    const calls = [];
    const replies = {
      organization: { id: "org-1", organization_key: "clinic-1", status: "active" },
      hco: { id: "hco-1", status: "active" },
      staff: { id: "staff-1", platform_identity_id: "id-1", status: "active" },
      role: { id: "role-1" },
      facility: { id: "fac-1", facility_key: "hq", status: "active" },
      membership: { id: "mem-1" },
      departments: { n: 8 },
      website: { id: "web-1", status: "coming_soon" },
      content: { n: 12 },
    };
    const db = {
      async query(sql) {
        calls.push(sql);
        const text = String(sql);
        if (text.includes("FROM platform.organizations")) {
          return { rows: replies.organization ? [replies.organization] : [] };
        }
        if (text.includes("FROM activeclinic.healthcare_organizations")) {
          return { rows: replies.hco ? [replies.hco] : [] };
        }
        if (text.includes("FROM activeclinic.staff_members")) {
          return { rows: replies.staff ? [replies.staff] : [] };
        }
        if (text.includes("FROM activeclinic.staff_role_assignments")) {
          return { rows: replies.role ? [replies.role] : [] };
        }
        if (text.includes("FROM activeclinic.facilities")) {
          return { rows: replies.facility ? [replies.facility] : [] };
        }
        if (text.includes("FROM activeclinic.staff_facility_assignments")) {
          return { rows: replies.membership ? [replies.membership] : [] };
        }
        if (text.includes("FROM activeclinic.departments")) {
          return { rows: replies.departments ? [replies.departments] : [] };
        }
        if (text.includes("FROM platform.website_instances")) {
          return { rows: replies.website ? [replies.website] : [] };
        }
        if (text.includes("FROM platform.website_content")) {
          return { rows: replies.content ? [replies.content] : [] };
        }
        return { rows: [] };
      },
    };

    replies.organization = null;
    let result = await inspectOrganizationProvisioningCompleteness(db, {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: "00000000-0000-4000-8000-000000000001",
      application: { provisioning_status: "failed" },
    });
    assert.equal(result.failedStage, STAGE.ORGANIZATION);

    replies.organization = { id: "org-1", organization_key: "clinic-1", status: "active" };
    replies.staff = null;
    result = await inspectOrganizationProvisioningCompleteness(db, {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: "00000000-0000-4000-8000-000000000001",
      application: { contact_email_normalized: "a@b.c", provisioning_status: "failed" },
    });
    assert.equal(result.failedStage, STAGE.ADMINISTRATOR);

    replies.staff = { id: "staff-1", platform_identity_id: "id-1", status: "active" };
    replies.role = null;
    result = await inspectOrganizationProvisioningCompleteness(db, {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: "00000000-0000-4000-8000-000000000001",
      application: { clinic_admin_staff_id: "staff-1", provisioning_status: "failed" },
    });
    assert.equal(result.failedStage, STAGE.ROLE_ASSIGNMENT);

    replies.role = { id: "role-1" };
    replies.facility = null;
    result = await inspectOrganizationProvisioningCompleteness(db, {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: "00000000-0000-4000-8000-000000000001",
      application: { clinic_admin_staff_id: "staff-1", provisioning_status: "failed" },
    });
    assert.equal(result.failedStage, STAGE.FACILITY_HQ);

    replies.facility = { id: "fac-1", facility_key: "hq", status: "active" };
    replies.membership = null;
    result = await inspectOrganizationProvisioningCompleteness(db, {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: "00000000-0000-4000-8000-000000000001",
      application: { clinic_admin_staff_id: "staff-1", provisioning_status: "failed" },
    });
    assert.equal(result.failedStage, STAGE.MEMBERSHIPS);

    replies.membership = { id: "mem-1" };
    replies.departments = { n: 3 };
    result = await inspectOrganizationProvisioningCompleteness(db, {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: "00000000-0000-4000-8000-000000000001",
      application: { clinic_admin_staff_id: "staff-1", provisioning_status: "failed" },
    });
    assert.equal(result.failedStage, STAGE.DEFAULT_DEPARTMENTS);

    replies.departments = { n: 8 };
    replies.website = null;
    result = await inspectOrganizationProvisioningCompleteness(db, {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: "00000000-0000-4000-8000-000000000001",
      application: { clinic_admin_staff_id: "staff-1", provisioning_status: "website_pending" },
    });
    assert.equal(result.failedStage, STAGE.WEBSITE_INSTANCE);

    replies.website = { id: "web-1", status: "coming_soon" };
    replies.content = { n: 0 };
    result = await inspectOrganizationProvisioningCompleteness(db, {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: "00000000-0000-4000-8000-000000000001",
      application: { clinic_admin_staff_id: "staff-1", provisioning_status: "website_pending" },
    });
    assert.equal(result.failedStage, STAGE.TEMPLATE_CONTENT);

    replies.content = { n: 12 };
    result = await inspectOrganizationProvisioningCompleteness(db, {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: "00000000-0000-4000-8000-000000000001",
      application: { clinic_admin_staff_id: "staff-1", provisioning_status: "website_pending" },
    });
    assert.equal(result.failedStage, STAGE.AUDIT_COMPLETION);

    result = await inspectOrganizationProvisioningCompleteness(db, {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: "00000000-0000-4000-8000-000000000001",
      application: { clinic_admin_staff_id: "staff-1", provisioning_status: "provisioned" },
    });
    assert.equal(result.complete, true);
    assert.equal(result.failedStage, null);
    assert.ok(calls.length > 0);
  });

  const failAfterStages = [
    STAGE.ORGANIZATION,
    STAGE.FACILITY_HQ,
    STAGE.ADMINISTRATOR,
    STAGE.ROLE_ASSIGNMENT,
    STAGE.MEMBERSHIPS,
    STAGE.DEFAULT_DEPARTMENTS,
    STAGE.WEBSITE_INSTANCE,
    STAGE.TEMPLATE_CONTENT,
    STAGE.AUDIT_COMPLETION,
  ];

  for (const stage of failAfterStages) {
    it(`ActiveClinic failAfter ${stage} persists the stage and resume is idempotent`, async () => {
      if (!requireDb()) return;
      const { payload, application } = await createPendingClinic();
      const first = await approveAndProvisionClinicRegistration(
        pool,
        provisionInput(application.id, {
          allowTestFailureInjection: true,
          failAfter: stage,
        })
      );
      assert.ok(first.organizationId, JSON.stringify(first));
      assert.equal(first.failedStage, stage);

      const stored = await pool.query(
        `SELECT organization_id, provisioning_status, last_provision_stage, last_provision_error, status
           FROM activeclinic.clinic_registration_applications WHERE id = $1`,
        [application.id]
      );
      assert.equal(stored.rows[0].organization_id, first.organizationId);
      assert.equal(stored.rows[0].last_provision_stage, stage);
      assert.ok(stored.rows[0].last_provision_error);

      const before = await clinicCounts(first.organizationId, payload.contactEmail);
      const resume = await approveAndProvisionClinicRegistration(
        pool,
        provisionInput(application.id)
      );
      assert.equal(resume.ok, true, JSON.stringify(resume));
      assert.equal(resume.organizationId, first.organizationId);
      const after = await clinicCounts(first.organizationId, payload.contactEmail);
      assert.equal(after.orgs, 1);
      assert.equal(after.identities, before.identities === 0 ? 1 : before.identities);
      assert.equal(after.facilities, 1);
      assert.equal(after.departments, DEPT_KEYS.length);
      assert.equal(after.websites, 1);

      const done = await pool.query(
        `SELECT provisioning_status, last_provision_stage, last_provision_error
           FROM activeclinic.clinic_registration_applications WHERE id = $1`,
        [application.id]
      );
      assert.equal(done.rows[0].provisioning_status, "provisioned");
      assert.equal(done.rows[0].last_provision_stage, null);

      const completeness = await inspectOrganizationProvisioningCompleteness(pool, {
        productCode: PRODUCT.ACTIVECLINIC,
        organizationId: first.organizationId,
        application: { ...application, ...done.rows[0], clinic_admin_staff_id: resume.staffMemberId },
      });
      assert.equal(completeness.complete, true);
    });
  }

  it("unified /admin/registrations read model shows partial stage and retry", async () => {
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
    const rows = await listUnifiedRegistrations(pool, {
      product: PRODUCT.ACTIVECLINIC,
      q: application.clinic_name || "Recovery Clinic",
      limit: 100,
    });
    const row = rows.find((item) => item.id === application.id);
    assert.ok(row, "registration row missing");
    assert.equal(row.canonicalLifecycle, LIFECYCLE.PROVISION_FAILED);
    assert.equal(row.partialProvision, true);
    assert.equal(row.failedStage, STAGE.WEBSITE_INSTANCE);
    assert.equal(row.retryable, true);
    assert.match(String(row.retryHref || ""), /retry-provision/);
  });

  it("login allows website_pending with incomplete flag and denies core-incomplete tenants", async () => {
    if (!requireDb()) return;
    const pendingSite = await createPendingClinic();
    const websitePending = await approveAndProvisionClinicRegistration(
      pool,
      provisionInput(pendingSite.application.id, {
        allowTestFailureInjection: true,
        failAfter: STAGE.WEBSITE_INSTANCE,
      })
    );
    assert.equal(websitePending.failedStage, STAGE.WEBSITE_INSTANCE);
    const identity = await pool.query(
      `SELECT * FROM platform.identities WHERE email_normalized = $1 LIMIT 1`,
      [pendingSite.payload.contactEmail.toLowerCase()]
    );
    const staff = await pool.query(
      `SELECT * FROM activeclinic.staff_members
        WHERE organization_id = $1 AND platform_identity_id = $2 LIMIT 1`,
      [websitePending.organizationId, identity.rows[0].id]
    );
    const eligible = await evaluateStaffEligibility(pool, staff.rows[0], identity.rows[0]);
    assert.equal(eligible.ok, true, JSON.stringify(eligible));
    assert.equal(eligible.provisioningIncomplete, true);
    assert.equal(eligible.failedStage, STAGE.WEBSITE_INSTANCE);

    const pendingCore = await createPendingClinic();
    const orgOnly = await approveAndProvisionClinicRegistration(
      pool,
      provisionInput(pendingCore.application.id, {
        allowTestFailureInjection: true,
        failAfter: STAGE.ORGANIZATION,
      })
    );
    assert.equal(orgOnly.failedStage, STAGE.ORGANIZATION);
    const noStaff = await pool.query(
      `SELECT COUNT(*)::int AS n FROM activeclinic.staff_members WHERE organization_id = $1`,
      [orgOnly.organizationId]
    );
    assert.equal(Number(noStaff.rows[0].n), 0);
  });

  it("BlessBoard retry with existing organization_id does not allocate a second org", async () => {
    if (!requireDb()) return;
    stamp += 1;
    const key = `recvbb${stamp}${crypto.randomBytes(3).toString("hex")}`;
    const body = {
      church_name: `Recovery Church ${stamp} ${key}`,
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
      acceptTerms: "on",
      branch_name: "HQ Campus",
      consent_contact: "on",
    };
    const validation = validatePlatformChurchRegistration(body, { instantFreeEnabled: true });
    assert.equal(validation.ok, true, JSON.stringify(validation));
    const submitted = await submitChurchRegistration(
      pool,
      {
        ip: "203.0.113.40",
        requestId: `recv-${key}`,
        get: () => "recovery-test",
      },
      validation,
      {
        env: { PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging" },
        dataEnvironment: "testing",
        deploymentCode: "blessboard-org-staging",
      }
    );
    assert.equal(submitted.ok, true, JSON.stringify(submitted));
    const appId = submitted.application && submitted.application.id;
    assert.ok(appId);
    const before = await pool.query(
      `SELECT organization_id, provisioning_status, last_provision_stage
         FROM blessboard.platform_church_registration_applications WHERE id = $1`,
      [appId]
    );
    const organizationId = before.rows[0] && before.rows[0].organization_id;
    if (!organizationId) {
      const provisioned = await provisionRegisteredBlessBoardChurch(
        pool,
        {
          applicationId: appId,
          administratorPassword: PASSWORD,
          requestedOrganizationKey: key,
          actorContext: {
            type: "test",
            source: "provisioning_recovery_test",
            dataEnvironment: "testing",
            deploymentCode: "blessboard-org-staging",
          },
        },
        { allowRetry: true }
      );
      assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
    }
    const linked = await pool.query(
      `SELECT organization_id FROM blessboard.platform_church_registration_applications WHERE id = $1`,
      [appId]
    );
    const orgId = linked.rows[0].organization_id;
    assert.ok(orgId);
    await pool.query(
      `UPDATE blessboard.platform_church_registration_applications
          SET provisioning_status = 'provisioning_failed',
              application_status = 'provision_failed',
              last_provision_stage = $2,
              provisioning_error_code = 'provisioning_failed',
              provisioning_error_detail = 'injected website failure',
              provisioning_failed_at = now(),
              provisioned_at = NULL
        WHERE id = $1`,
      [appId, STAGE.WEBSITE_INSTANCE]
    );
    const orgCountBefore = await count(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [key]
    );
    const retry = await provisionRegisteredBlessBoardChurch(
      pool,
      {
        applicationId: appId,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: key,
        actorContext: {
          type: "test",
          source: "provisioning_recovery_test",
          dataEnvironment: "testing",
          deploymentCode: "blessboard-org-staging",
        },
      },
      { allowRetry: true }
    );
    assert.equal(retry.ok, true, JSON.stringify(retry));
    const orgCountAfter = await count(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [key]
    );
    assert.equal(orgCountAfter, orgCountBefore);
    assert.equal(orgCountAfter, 1);
    const users = await count(
      `SELECT COUNT(*)::int AS n FROM blessboard.users WHERE email_normalized = $1`,
      [body.email]
    );
    assert.equal(users, 1);
    const resumed = await pool.query(
      `SELECT organization_id, last_provision_stage, provisioning_status
         FROM blessboard.platform_church_registration_applications WHERE id = $1`,
      [appId]
    );
    assert.equal(resumed.rows[0].organization_id, orgId);
  });
});
