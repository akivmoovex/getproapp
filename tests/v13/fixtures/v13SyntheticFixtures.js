"use strict";

/**
 * Deterministic synthetic fixtures for a future disposable V13 database.
 * apply* functions refuse to run unless both write flags are set and the
 * connection string passes the local disposable-database guard.
 */

const { dbWritesAuthorized } = require("../helpers/v13DbWriteGate");
const {
  assertV13CiDatabaseUrl,
  assertV13CiEnvironmentIdentity,
} = require("../helpers/v13CiDatabaseGuard");

const SYNTHETIC_PASSWORD = "V13-synthetic-qa-password";
const DEPLOYMENT_CODE = "moovex-platform-testing";

function churchPlan(suffix, displayName) {
  const key = `v13d19-${suffix}`;
  return {
    key,
    tenant: {
      organizationKey: key,
      displayName,
      legalName: displayName,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: key,
      deploymentCode: DEPLOYMENT_CODE,
      skipDomain: true,
      skipDefaultSubscription: true,
    },
    church: {
      organizationKey: key,
      churchKey: key,
      displayName,
      legalName: displayName,
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "Headquarters",
      timezone: "Africa/Lusaka",
      countryCode: "ZM",
    },
    admin: {
      email: `admin-${suffix}@v13d19.example`,
      displayName: `${displayName} Admin`,
      roleKey: "church_system_administrator",
    },
    member: {
      fullName: `${displayName} Member`,
      email: `member-${suffix}@v13d19.example`,
      phone: suffix === "church-a" ? "+260977000111" : "+260977000112",
      phoneCountry: "ZM",
      phoneNational: suffix === "church-a" ? "977000111" : "977000112",
      dateOfBirth: "1990-01-15",
    },
    staffInvite: {
      email: `staff-${suffix}@v13d19.example`,
      displayName: `${displayName} Staff`,
      roleKey: "ministry_leader",
    },
  };
}

function buildBlessBoardFixturePlan() {
  return {
    product: "blessboard",
    synthetic: true,
    password: SYNTHETIC_PASSWORD,
    deploymentCode: DEPLOYMENT_CODE,
    churches: [
      churchPlan("church-a", "V13 D19 Church A"),
      churchPlan("church-b", "V13 D19 Church B"),
    ],
  };
}

function buildActiveClinicFixturePlan() {
  return {
    product: "activeclinic",
    synthetic: true,
    password: SYNTHETIC_PASSWORD,
    deploymentCode: DEPLOYMENT_CODE,
    clinics: [
      {
        key: "v13d19-clinic-a",
        clinicName: "V13 D19 Clinic A",
        facilityName: "V13 D19 Facility A",
        adminEmail: "admin-a@v13d19.example",
        staffEmail: "staff-a@v13d19.example",
        receptionistEmail: "reception-a@v13d19.example",
      },
      {
        key: "v13d19-clinic-b",
        clinicName: "V13 D19 Clinic B",
        facilityName: "V13 D19 Facility B",
        adminEmail: "admin-b@v13d19.example",
        staffEmail: "staff-b@v13d19.example",
        receptionistEmail: "reception-b@v13d19.example",
      },
    ],
    patient: {
      firstName: "Pat",
      lastName: "Ient",
      phone: "+260977000222",
      email: "patient-a@v13d19.example",
    },
    service: {
      serviceKey: "v13d19-consult",
      displayName: "V13 D19 Consultation",
      defaultDurationMinutes: 30,
      requiresAssignedStaff: true,
    },
    slot: {
      startsAt: "2026-12-01T09:00:00.000Z",
      endsAt: "2026-12-01T09:30:00.000Z",
      timezone: "Africa/Lusaka",
    },
    denial: {
      roleKey: "activeclinic_receptionist",
      route: "/app/billing",
      permission: "activeclinic.billing.view",
    },
  };
}

function buildAc05EvidencePlan() {
  return {
    product: "activeclinic",
    synthetic: true,
    persisted: false,
    middleware: ["requireApex", "requirePlatformAdmin"],
    routes: {
      shell: { method: "GET", path: "/admin" },
      page: { method: "GET", path: "/admin/settings/test-database" },
      preview: { method: "GET", path: "/admin/settings/test-database/preview" },
    },
    administrator: {
      email: "platform-admin@v13d19.example",
      userId: "11111111-1111-4111-8111-111111111111",
      roleKey: "platform_administrator",
      scopeType: "platform",
    },
    lowerPrivilege: {
      email: "tenant-reader@v13d19.example",
      userId: "22222222-2222-4222-8222-222222222222",
      roleKey: null,
      scopeType: null,
    },
    refusedAssignment: {
      roleKey: "organisation_administrator",
      organizationKey: "v13d19-clinic-a",
      churchKey: null,
      expected: "invalid_input:church_hq_admin_scope",
    },
    facilityDimension: "none",
  };
}

function buildAppointmentConcurrencyPlan() {
  return {
    product: "activeclinic",
    synthetic: true,
    persisted: false,
    capacity: null,
    slot: {
      startsAt: "2026-12-01T09:00:00.000Z",
      endsAt: "2026-12-01T09:30:00.000Z",
      timezone: "Africa/Lusaka",
    },
    clinics: [
      { key: "v13d19-clinic-a", facilityName: "V13 D19 Facility A" },
      { key: "v13d19-clinic-b", facilityName: "V13 D19 Facility B" },
    ],
    staffMemberId: "abababab-abab-4aba-8aba-abababababab",
    existingConflict: "assigned_staff_overlap",
    missingProtection: "slot_capacity_lock",
  };
}

function assertSyntheticPlan(plan) {
  if (!plan || plan.synthetic !== true) {
    throw new Error("V13_FIXTURE: plan is not marked synthetic");
  }
  if (plan.password === "1234" || /sk_live|AKIA|BEGIN PRIVATE KEY/i.test(plan.password)) {
    throw new Error("V13_FIXTURE: refusing a real or fixed OTP secret");
  }
  const blob = JSON.stringify(plan);
  if (/blessboard\.com|pronline\.org|hostinger|amazonaws\.com/i.test(blob)) {
    throw new Error("V13_FIXTURE: plan contains a production host");
  }
  return plan;
}

function assertApplyPermitted(connectionString, env) {
  if (!dbWritesAuthorized(env)) {
    const error = new Error("V13_FIXTURE_HOLD: database apply is not authorized");
    error.code = "V13_FIXTURE_HOLD";
    throw error;
  }
  assertV13CiDatabaseUrl(connectionString);
  assertV13CiEnvironmentIdentity(env);
}

async function applyBlessBoardFixtures(db, connectionString, env) {
  assertApplyPermitted(connectionString, env);
  const plan = assertSyntheticPlan(buildBlessBoardFixturePlan());
  const { provisionPlatformTenant } = require("../../../src/platform/services/provisionPlatformTenant");
  const { provisionBlessBoardChurch } = require("../../../src/blessboard/services/provisionBlessBoardChurch");
  const authRepo = require("../../../src/blessboard/repositories/blessBoardAuthRepository");
  const { assignBlessBoardRole } = require("../../../src/blessboard/services/assignBlessBoardRole");
  const bcrypt = require("bcryptjs");
  const passwordHash = await bcrypt.hash(plan.password, 12);
  const created = [];
  for (const church of plan.churches) {
    const tenant = await provisionPlatformTenant(db, church.tenant);
    if (!tenant.ok) {
      throw new Error(`tenant ${church.key}: ${tenant.status || ""} ${tenant.message || ""}`);
    }
    const provisioned = await provisionBlessBoardChurch(db, church.church);
    if (!provisioned.ok) {
      throw new Error(`church ${church.key}: ${provisioned.status || ""} ${provisioned.message || ""}`);
    }
    const user = await authRepo.insertUser(db, {
      emailNormalized: church.admin.email,
      emailDisplay: church.admin.email,
      passwordHash,
      displayName: church.admin.displayName,
      status: "active",
    });
    const role = await assignBlessBoardRole(
      db,
      {
        userId: user.id,
        email: church.admin.email,
        organizationKey: church.tenant.organizationKey,
        roleKey: church.admin.roleKey,
        churchKey: church.church.churchKey,
      },
      { env: env || process.env }
    );
    if (!role.ok) {
      throw new Error(`role ${church.key}: ${role.status || ""} ${role.message || ""}`);
    }
    created.push({
      key: church.key,
      organizationId: provisioned.records.organization.id,
      churchId: provisioned.records.church.id,
      branchId: provisioned.records.hqBranch.id,
      adminUserId: user.id,
      adminEmail: church.admin.email,
    });
  }
  return { plan, created };
}

async function applyActiveClinicFixtures(db, connectionString, env) {
  assertApplyPermitted(connectionString, env);
  const plan = assertSyntheticPlan(buildActiveClinicFixturePlan());
  const { provisionHostedAuthQaClinic } = require("../../../src/activeclinic/qa/activeClinicHostedAuthQaFixture");
  const created = [];
  for (const clinic of plan.clinics) {
    const result = await provisionHostedAuthQaClinic(
      db,
      { password: plan.password, passwordConfirm: plan.password },
      env || process.env
    );
    if (!result.ok) {
      throw new Error(`clinic ${clinic.key}: ${result.reason || "provision_failed"}`);
    }
    created.push({
      key: clinic.key,
      organizationId: result.organizationId,
      organizationKey: result.organizationKey,
      adminEmail: result.adminEmail,
      clinicKey: result.clinicKey,
    });
  }
  return { plan, created };
}

async function cleanupBlessBoardFixtures(db, connectionString, created, env) {
  assertApplyPermitted(connectionString, env);
  const churchIds = (created || []).map((row) => row.churchId).filter(Boolean);
  const orgIds = (created || []).map((row) => row.organizationId).filter(Boolean);
  if (!churchIds.length && !orgIds.length) return;
  await db.query("BEGIN");
  try {
    if (churchIds.length) {
      await db.query(
        `DELETE FROM blessboard.announcement_reads
          WHERE announcement_id IN (SELECT id FROM blessboard.announcements WHERE church_id = ANY($1::uuid[]))`,
        [churchIds]
      );
      await db.query(
        `DELETE FROM blessboard.announcement_attachments
          WHERE announcement_id IN (SELECT id FROM blessboard.announcements WHERE church_id = ANY($1::uuid[]))`,
        [churchIds]
      );
      await db.query(
        `DELETE FROM blessboard.announcement_audiences
          WHERE announcement_id IN (SELECT id FROM blessboard.announcements WHERE church_id = ANY($1::uuid[]))`,
        [churchIds]
      );
      await db.query(`DELETE FROM blessboard.announcements WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await db.query(
        `DELETE FROM blessboard.page_sections
          WHERE page_id IN (SELECT id FROM blessboard.public_pages WHERE church_id = ANY($1::uuid[]))`,
        [churchIds]
      );
      await db.query(`DELETE FROM blessboard.public_pages WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await db.query(`DELETE FROM blessboard.events WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await db.query(`DELETE FROM blessboard.sermons WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await db.query(`DELETE FROM blessboard.public_contact_submissions WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await db.query(`DELETE FROM blessboard.member_portal_invitations WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await db.query(`DELETE FROM blessboard.members WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await db.query(`DELETE FROM blessboard.user_invitations WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await db.query(`DELETE FROM blessboard.branches WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await db.query(`DELETE FROM blessboard.churches WHERE id = ANY($1::uuid[])`, [churchIds]);
    }
    if (orgIds.length) {
      await db.query(`DELETE FROM platform.organization_products WHERE organization_id = ANY($1::uuid[])`, [orgIds]);
      await db.query(`DELETE FROM platform.organizations WHERE id = ANY($1::uuid[])`, [orgIds]);
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

module.exports = {
  SYNTHETIC_PASSWORD,
  DEPLOYMENT_CODE,
  buildBlessBoardFixturePlan,
  buildActiveClinicFixturePlan,
  buildAc05EvidencePlan,
  buildAppointmentConcurrencyPlan,
  assertSyntheticPlan,
  assertApplyPermitted,
  applyBlessBoardFixtures,
  applyActiveClinicFixtures,
  cleanupBlessBoardFixtures,
};
