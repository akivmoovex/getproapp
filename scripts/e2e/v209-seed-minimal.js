"use strict";

const { URL } = require("node:url");
const { Pool } = require("pg");
const {
  provisionPlatformTenant,
} = require("../../src/platform/services/provisionPlatformTenant");
const {
  provisionBlessBoardChurch,
} = require("../../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../../src/blessboard/services/assignBlessBoardRole");
const blessBoardRbacRepository = require("../../src/blessboard/repositories/blessBoardRbacRepository");
const { createPlatformIdentity } = require("../../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
} = require("../../src/platform/services/platformIdentityCredentialService");
const {
  createHealthcareOrganization,
} = require("../../src/activeclinic/services/healthcareOrganizationService");
const { createStaffMember } = require("../../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffRole,
  ORGANIZATION_ADMIN,
} = require("../../src/activeclinic/services/activeClinicAuthorizationService");
const { CODE_ORG_STAGING, CODE_ACTIVECLINIC_ORG_V6 } = require("../../src/platform/config/deploymentProfiles");

const BB_PASSWORD = process.env.E2E_BB_ADMIN_PASSWORD || "V209-local-BB-admin!";
const BB_MEMBER_PASSWORD = process.env.E2E_BB_MEMBER_PASSWORD || "V209-local-BB-member!";
const AC_PASSWORD = process.env.E2E_AC_ADMIN_PASSWORD || "V209-local-AC-admin!";

function databaseUrl() {
  const raw = String(process.env.E2E_DATABASE_URL || "").trim();
  if (!raw) throw new Error("E2E_DATABASE_URL is required");
  const url = new URL(raw);
  const host = String(url.hostname || "").toLowerCase();
  const db = String(url.pathname || "").slice(1).toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error("E2E_DATABASE_URL must be local");
  if (!/(e2e|test)/.test(db)) throw new Error("E2E database name must contain e2e or test");
  if (/supabase|prod|production|shared/.test(`${host}/${db}`)) throw new Error("unsafe E2E database");
  return raw;
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl() });
  try {
    const bbEmail = process.env.E2E_BB_ADMIN_EMAIL || "v209-e2e-bb-admin@example.test";
    const acEmail = process.env.E2E_AC_ADMIN_EMAIL || "v209-e2e-ac-admin@example.test";
    const bbTenant = await provisionPlatformTenant(pool, {
      organizationKey: "v209-e2e-bb",
      displayName: "V209 E2E BlessBoard",
      productKey: "blessboard",
      productTenantKey: "v209-e2e-bb",
      deploymentCode: CODE_ORG_STAGING,
      dataEnvironment: "testing",
      skipDomain: true,
    });
    if (!bbTenant.ok) throw new Error(`BB tenant: ${bbTenant.message}`);
    const bbChurch = await provisionBlessBoardChurch(pool, {
      organizationKey: "v209-e2e-bb",
      churchKey: "v209-e2e-bb",
      displayName: "V209 E2E BlessBoard",
      legalName: "V209 E2E BlessBoard",
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "V209 E2E HQ",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    if (!bbChurch.ok) throw new Error(`BB church: ${bbChurch.message || bbChurch.status}`);
    const bbUser = await createBlessBoardUser(pool, {
      email: bbEmail,
      displayName: "V209 E2E BB Admin",
      password: BB_PASSWORD,
    });
    if (!bbUser.ok) throw new Error(`BB user: ${bbUser.message || bbUser.status}`);
    const bbRole = await assignBlessBoardRole(pool, {
      email: bbEmail,
      organizationKey: "v209-e2e-bb",
      churchKey: "v209-e2e-bb",
      roleKey: "church_hq_admin",
    });
    if (!bbRole.ok) throw new Error(`BB role: ${bbRole.message || bbRole.status}`);
    const bbMemberEmail = process.env.E2E_BB_MEMBER_EMAIL || "v209-e2e-bb-member@example.test";
    const bbMember = await createBlessBoardUser(pool, {
      email: bbMemberEmail,
      displayName: "V209 E2E BB Member",
      password: BB_MEMBER_PASSWORD,
    });
    if (!bbMember.ok) throw new Error(`BB member: ${bbMember.message || bbMember.status}`);
    const bbMemberIdentityResult = await createPlatformIdentity(pool, {
      primaryEmail: bbMemberEmail,
      emailNormalized: bbMemberEmail.toLowerCase(),
      primaryPhone: "+260971209002",
      phoneNormalized: "+260971209002",
      emailVerifiedAt: new Date().toISOString(),
      phoneVerifiedAt: new Date().toISOString(),
    });
    let bbMemberIdentity = bbMemberIdentityResult.identity;
    if (!bbMemberIdentity && bbMemberIdentityResult.code === "duplicate_email") {
      const existingIdentity = await pool.query(
        `SELECT id FROM platform.identities WHERE email_normalized = $1`,
        [bbMemberEmail.toLowerCase()]
      );
      bbMemberIdentity = existingIdentity.rows[0];
    }
    if (!bbMemberIdentity) throw new Error(`BB member identity: ${bbMemberIdentityResult.message || bbMemberIdentityResult.code}`);
    await setPlatformIdentityPassword(pool, {
      identityId: bbMemberIdentity.id,
      password: BB_MEMBER_PASSWORD,
    });
    await pool.query(
      `UPDATE blessboard.users SET platform_identity_id = $1 WHERE id = $2`,
      [bbMemberIdentity.id, bbMember.user.id]
    );
    const memberRole = await blessBoardRbacRepository.findRoleByKey(pool, "registration_officer");
    const memberOrg = await pool.query(
      `SELECT id FROM platform.organizations WHERE organization_key = $1 LIMIT 1`,
      ["v209-e2e-bb"]
    );
    const memberChurch = await pool.query(
      `SELECT id FROM blessboard.churches WHERE church_key = $1 LIMIT 1`,
      ["v209-e2e-bb"]
    );
    const existingMemberRole = await pool.query(
      `SELECT id FROM blessboard.user_role_assignments
        WHERE user_id = $1 AND organization_id = $2 AND role_id = $3 AND status = 'active'`,
      [bbMember.user.id, memberOrg.rows[0].id, memberRole.id]
    );
    await pool.query(
      `UPDATE blessboard.user_role_assignments
          SET status = 'revoked', revoked_at = now(), revocation_reason = 'v209_e2e_member_role_correction'
        WHERE user_id = $1 AND organization_id = $2 AND status = 'active'
          AND role_id <> $3`,
      [bbMember.user.id, memberOrg.rows[0].id, memberRole.id]
    );
    if (!existingMemberRole.rowCount) {
      await blessBoardRbacRepository.insertAssignment(pool, {
        userId: bbMember.user.id,
        organizationId: memberOrg.rows[0].id,
        churchId: memberChurch.rows[0].id,
        roleId: memberRole.id,
        scopeType: "church",
        scopeId: memberChurch.rows[0].id,
        assignmentOrigin: "system",
        assignmentReason: "v209_e2e_member",
      });
    }

    const acTenant = await provisionPlatformTenant(pool, {
      organizationKey: "v209-e2e-ac",
      displayName: "V209 E2E ActiveClinic",
      productKey: "activeclinic",
      productTenantKey: "v209-e2e-ac",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      skipDomain: true,
    });
    if (!acTenant.ok) throw new Error(`AC tenant: ${acTenant.message}`);
    const acHco = await createHealthcareOrganization(pool, {
      organizationId: acTenant.records.organization.id,
      legalName: "V209 E2E ActiveClinic",
      publicName: "V209 E2E ActiveClinic",
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    let healthcareOrganization = acHco.healthcareOrganization;
    if (!acHco.ok && acHco.code !== "healthcare_organization_exists") {
      throw new Error(`AC clinic: ${acHco.message || acHco.code}`);
    }
    if (!healthcareOrganization) {
      const existingHco = await pool.query(
        `SELECT id FROM activeclinic.healthcare_organizations WHERE organization_id = $1`,
        [acTenant.records.organization.id]
      );
      healthcareOrganization = existingHco.rows[0];
    }
    const acIdentity = await createPlatformIdentity(pool, {
      primaryEmail: acEmail,
      primaryPhone: "+260971209001",
      phoneNormalized: "+260971209001",
      emailNormalized: acEmail,
      emailVerifiedAt: new Date().toISOString(),
      phoneVerifiedAt: new Date().toISOString(),
    });
    let identity = acIdentity.identity;
    if (!identity && acIdentity.code === "duplicate_email") {
      const existingIdentity = await pool.query(
        `SELECT id FROM platform.platform_identities WHERE email_normalized = $1`,
        [acEmail.toLowerCase()]
      );
      identity = existingIdentity.rows[0];
    }
    if (!identity) throw new Error(`AC identity: ${acIdentity.message || acIdentity.code}`);
    await setPlatformIdentityPassword(pool, {
      identityId: identity.id,
      password: AC_PASSWORD,
    });
    const staff = await createStaffMember(pool, {
      organizationId: acTenant.records.organization.id,
      healthcareOrganizationId: healthcareOrganization.id,
      firstName: "V209",
      lastName: "E2E Admin",
      employmentType: "permanent",
      status: "active",
      phone: "+260971209001",
      platformIdentityId: identity.id,
      jobTitle: "Clinic Administrator",
    });
    let staffMember = staff.staffMember;
    if (!staff.ok && !["staff_member_exists", "duplicate_staff_identity"].includes(staff.code)) {
      throw new Error(`AC staff: ${staff.message || staff.code}`);
    }
    if (!staffMember) {
      const existingStaff = await pool.query(
        `SELECT id FROM activeclinic.staff_members WHERE platform_identity_id = $1`,
        [identity.id]
      );
      staffMember = existingStaff.rows[0];
    }
    if (!staffMember) throw new Error("AC staff: existing staff member not found");
    const role = await assignStaffRole(pool, {
      organizationId: acTenant.records.organization.id,
      staffMemberId: staffMember.id,
      roleKey: ORGANIZATION_ADMIN || "organization_admin",
      scopeType: "organisation",
      assignmentOrigin: "system",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    if (!role.ok && role.code !== "role_assignment_exists") {
      throw new Error(`AC role: ${role.message || role.code}`);
    }
    console.log(JSON.stringify({ ok: true, bbChurch: bbChurch.church?.id || null, bbAdmin: bbUser.user?.id || null, bbMember: bbMember.user?.id || null, acClinic: healthcareOrganization.id, acAdmin: identity.id }));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[v209-e2e] ${error.message}`);
  process.exitCode = 1;
});
