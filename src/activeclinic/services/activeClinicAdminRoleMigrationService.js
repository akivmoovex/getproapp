"use strict";

/**
 * Idempotent migration of known ActiveClinic tenant administrators
 * from narrowed facility_admin → organization_admin (Prompt 3).
 *
 * Uses assignStaffRole / revokeRoleAssignment — does not weaken canGrantRole.
 * assignmentOrigin = migration (trusted ops path).
 */

const identityRepo = require("../../platform/repositories/platformIdentityRepository");
const staffRepo = require("../repositories/staffMemberRepository");
const accessRepo = require("../repositories/staffAccessRepository");
const {
  assignStaffRole,
  listStaffRoleAssignments,
  resolveEffectivePermissions,
  ORGANIZATION_ADMIN,
  FACILITY_ADMIN,
} = require("./activeClinicAuthorizationService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const {
  evaluateStaffEligibility,
} = require("./activeClinicLoginEligibility");
const { isIdentityUsable } = require("../../platform/services/platformIdentityService");

const RESULT = Object.freeze({
  OK: "ok",
  NOT_FOUND: "admin_not_found",
  RELATIONSHIP_MISMATCH: "relationship_mismatch",
  ASSIGN_FAILED: "organization_admin_assign_failed",
  REVOKE_FAILED: "facility_admin_revoke_failed",
  VERIFICATION_FAILED: "verification_failed",
  INVALID_INPUT: "invalid_input",
});

const TARGET_ADMINS = Object.freeze([
  {
    key: "demo",
    emailNormalized: "demo.admin@activeclinic.example",
    organizationKey: "activeclinic-demo",
  },
  {
    key: "julflona",
    emailNormalized: "julflona@gmail.com",
    organizationKey: "julflona-clinic",
  },
]);

const REQUIRED_ADMIN_PERMS = Object.freeze([
  "activeclinic.access",
  "activeclinic.organization.view",
  "activeclinic.organization.manage",
  "activeclinic.facility.view",
  "activeclinic.facility.create",
  "activeclinic.facility.update",
  "activeclinic.facility.archive",
  "activeclinic.staff.view",
  "activeclinic.staff.create",
  "activeclinic.staff.update",
  "activeclinic.staff.archive",
  "activeclinic.staff.invite",
  "activeclinic.staff.assign_facility",
  "activeclinic.staff.assign_access",
  "activeclinic.staff.manage_credentials",
  "activeclinic.audit.view",
]);

const FORBIDDEN_ADMIN_PERMS = Object.freeze([
  "activeclinic.triage.record",
  "activeclinic.nursing_intake.record",
  "activeclinic.consultation.record",
  "activeclinic.consultation.sign",
  "activeclinic.diagnosis.record",
  "activeclinic.clinical_order.create",
  "activeclinic.pharmacy.review",
  "activeclinic.pharmacy.dispense",
  "activeclinic.diagnostics.collect",
  "activeclinic.diagnostics.result",
  "activeclinic.diagnostics.verify",
  "activeclinic.billing.charge",
  "activeclinic.payment.collect",
  "activeclinic.payment.refund",
  "activeclinic.payment.reverse",
  "activeclinic.cashier.open_session",
  "activeclinic.cashier.close_session",
  "activeclinic.cashier.manage",
  "activeclinic.cashier.reconcile",
]);

/**
 * Resolve a trusted admin target by email + organization key.
 * @param {{ query: Function }} db
 * @param {{ emailNormalized: string, organizationKey: string, key: string }} target
 */
async function resolveTargetAdmin(db, target) {
  const email = String(target.emailNormalized || "").trim().toLowerCase();
  const orgKey = String(target.organizationKey || "").trim().toLowerCase();
  if (!email || !orgKey) {
    return { ok: false, code: RESULT.INVALID_INPUT, target };
  }

  const orgRes = await db.query(
    `SELECT id, organization_key, display_name, status
       FROM platform.organizations
      WHERE organization_key = $1
      LIMIT 1`,
    [orgKey]
  );
  const organization = orgRes.rows[0];
  if (!organization || organization.status !== "active") {
    return {
      ok: false,
      code: RESULT.NOT_FOUND,
      target,
      detail: "organization_missing_or_inactive",
    };
  }

  const rows = await identityRepo.findIdentitiesByNormalizedContact(db, {
    emailNormalized: email,
  });
  if (!rows.length) {
    return { ok: false, code: RESULT.NOT_FOUND, target, detail: "identity_missing" };
  }
  if (rows.length > 1) {
    return {
      ok: false,
      code: RESULT.RELATIONSHIP_MISMATCH,
      target,
      detail: "ambiguous_identity_email",
    };
  }
  const identity = rows[0];
  if (!isIdentityUsable(identity)) {
    return {
      ok: false,
      code: RESULT.RELATIONSHIP_MISMATCH,
      target,
      detail: "identity_not_usable",
    };
  }

  const staffRows = await staffRepo.listByPlatformIdentity(db, identity.id);
  const staffRow = (staffRows || []).find(
    (s) => String(s.organization_id) === String(organization.id)
  );
  if (!staffRow) {
    return {
      ok: false,
      code: RESULT.RELATIONSHIP_MISMATCH,
      target,
      detail: "staff_not_in_expected_organization",
    };
  }
  if (staffRow.status !== "active") {
    return {
      ok: false,
      code: RESULT.RELATIONSHIP_MISMATCH,
      target,
      detail: "staff_not_active",
    };
  }

  const profiles = await identityRepo.listProductProfilesByIdentity(db, identity.id);
  const profile = (profiles || []).find(
    (p) =>
      p.product_key === "activeclinic" &&
      p.status === "active" &&
      String(p.product_profile_id) === String(staffRow.id)
  );
  if (!profile) {
    return {
      ok: false,
      code: RESULT.RELATIONSHIP_MISMATCH,
      target,
      detail: "activeclinic_product_profile_missing",
    };
  }

  const roles = await listStaffRoleAssignments(db, {
    staffMemberId: staffRow.id,
    organizationId: organization.id,
  });

  return {
    ok: true,
    code: RESULT.OK,
    target,
    identity,
    organization: {
      id: organization.id,
      key: organization.organization_key,
      displayName: organization.display_name,
      status: organization.status,
    },
    staffMember: {
      id: staffRow.id,
      status: staffRow.status,
      displayName: staffRow.display_name,
      organizationId: staffRow.organization_id,
      healthcareOrganizationId: staffRow.healthcare_organization_id,
    },
    productProfile: {
      id: profile.id,
      status: profile.status,
      profileType: profile.profile_type,
    },
    roleAssignments: roles.assignments || [],
  };
}

async function snapshotAdminAccess(db, resolved) {
  const staffRow = await staffRepo.findByIdAndOrganization(db, {
    id: resolved.staffMember.id,
    organizationId: resolved.organization.id,
  });
  if (!staffRow) {
    return {
      roleKeys: [],
      permissionCount: 0,
      permissions: [],
      loginReady: false,
      loginCode: "staff_not_found",
      isOrgWideAdmin: false,
      missingRequired: REQUIRED_ADMIN_PERMS.slice(),
      forbiddenPresent: [],
    };
  }

  const perms = await resolveEffectivePermissions(db, {
    organizationId: resolved.organization.id,
    staffMemberId: resolved.staffMember.id,
    platformIdentityId: resolved.identity.id,
    facilityId: null,
  });
  const elig = await evaluateStaffEligibility(db, staffRow, resolved.identity);

  const listed = await listStaffRoleAssignments(db, {
    staffMemberId: resolved.staffMember.id,
    organizationId: resolved.organization.id,
  });
  const roleKeys = (listed.assignments || [])
    .filter((r) => !r.status || r.status === "active")
    .map((r) => r.roleKey);

  return {
    roleKeys,
    permissionCount: (perms.permissions || []).length,
    permissions: perms.permissions || [],
    loginReady: elig.ok === true,
    loginCode: elig.ok ? "LOGIN_READY" : elig.code || "LOGIN_BLOCKED",
    isOrgWideAdmin: Boolean(elig.isNetworkAdmin),
    missingRequired: REQUIRED_ADMIN_PERMS.filter(
      (k) => !(perms.permissions || []).includes(k)
    ),
    forbiddenPresent: FORBIDDEN_ADMIN_PERMS.filter((k) =>
      (perms.permissions || []).includes(k)
    ),
  };
}

function verifyAdminSnapshot(snapshot) {
  const problems = [];
  if (!snapshot.roleKeys.includes(ORGANIZATION_ADMIN)) {
    problems.push("missing_organization_admin");
  }
  if (snapshot.roleKeys.includes(FACILITY_ADMIN)) {
    problems.push("facility_admin_still_active");
  }
  if (!snapshot.loginReady) {
    problems.push(`login_not_ready:${snapshot.loginCode}`);
  }
  if (!snapshot.isOrgWideAdmin) {
    problems.push("missing_org_wide_admin_eligibility");
  }
  if (snapshot.missingRequired.length) {
    problems.push(`missing_perms:${snapshot.missingRequired.join(",")}`);
  }
  if (snapshot.forbiddenPresent.length) {
    problems.push(`forbidden_perms:${snapshot.forbiddenPresent.join(",")}`);
  }
  return {
    ok: problems.length === 0,
    problems,
  };
}

/**
 * Migrate one resolved admin to organization_admin and revoke facility_admin.
 */
async function migrateResolvedAdmin(db, resolved, options = {}) {
  const dryRun = options.dryRun === true;
  const deploymentCode = options.deploymentCode || CODE_ACTIVECLINIC_ORG_V6;

  const beforeListed = await listStaffRoleAssignments(db, {
    staffMemberId: resolved.staffMember.id,
    organizationId: resolved.organization.id,
  });
  const beforeAssignments = beforeListed.assignments || [];
  const hasOrgAdmin = beforeAssignments.some(
    (a) => a.roleKey === ORGANIZATION_ADMIN && (!a.status || a.status === "active")
  );
  const facilityAdminAssignments = beforeAssignments.filter(
    (a) => a.roleKey === FACILITY_ADMIN && (!a.status || a.status === "active")
  );

  const actions = {
    organizationAdminAssigned: false,
    organizationAdminAlreadyPresent: hasOrgAdmin,
    facilityAdminRevoked: [],
    dryRun,
  };

  if (!dryRun && !hasOrgAdmin) {
    const assigned = await assignStaffRole(db, {
      organizationId: resolved.organization.id,
      staffMemberId: resolved.staffMember.id,
      roleKey: ORGANIZATION_ADMIN,
      scopeType: "organisation",
      assignmentOrigin: "migration",
      deploymentCode,
    });
    if (!assigned.ok && assigned.code !== "role_assignment_exists") {
      return {
        ok: false,
        code: RESULT.ASSIGN_FAILED,
        target: resolved.target,
        assignCode: assigned.code,
        actions,
      };
    }
    actions.organizationAdminAssigned = assigned.ok === true;
  }

  if (!dryRun) {
    for (const assignment of facilityAdminAssignments) {
      const revoked = await accessRepo.revokeRoleAssignment(db, {
        id: assignment.id,
        organizationId: resolved.organization.id,
        revokedByPlatformIdentityId: null,
        revocationReason: "prompt3_org_admin_migration",
      });
      if (!revoked) {
        return {
          ok: false,
          code: RESULT.REVOKE_FAILED,
          target: resolved.target,
          assignmentId: assignment.id,
          actions,
        };
      }
      actions.facilityAdminRevoked.push(assignment.id);
    }
  } else {
    actions.facilityAdminWouldRevoke = facilityAdminAssignments.map((a) => a.id);
  }

  const refreshed = await resolveTargetAdmin(db, resolved.target);
  if (!refreshed.ok) {
    return {
      ok: false,
      code: RESULT.VERIFICATION_FAILED,
      target: resolved.target,
      refresh: refreshed,
      actions,
    };
  }

  const after = await snapshotAdminAccess(db, refreshed);
  const verification = dryRun
    ? { ok: true, problems: [], note: "dry_run_skip_post_verify" }
    : verifyAdminSnapshot(after);

  if (!dryRun && !verification.ok) {
    return {
      ok: false,
      code: RESULT.VERIFICATION_FAILED,
      target: resolved.target,
      organization: refreshed.organization,
      staffMember: refreshed.staffMember,
      beforeRoles: beforeAssignments.map((a) => a.roleKey),
      after,
      verification,
      actions,
    };
  }

  return {
    ok: true,
    code: RESULT.OK,
    target: resolved.target,
    organization: refreshed.organization,
    staffMember: refreshed.staffMember,
    identityId: refreshed.identity.id,
    email: refreshed.identity.email_normalized || refreshed.identity.primary_email,
    beforeRoles: beforeAssignments.map((a) => ({
      roleKey: a.roleKey,
      scopeType: a.scopeType,
      status: a.status,
    })),
    after,
    verification,
    actions,
  };
}

/**
 * Migrate all known tenant admins.
 */
async function migrateActiveClinicTenantAdmins(db, options = {}) {
  const targets = options.targets || TARGET_ADMINS;
  const results = [];
  let ok = true;

  for (const target of targets) {
    const resolved = await resolveTargetAdmin(db, target);
    if (!resolved.ok) {
      ok = false;
      results.push({
        ok: false,
        code: resolved.code,
        target,
        detail: resolved.detail || null,
      });
      continue;
    }
    const migrated = await migrateResolvedAdmin(db, resolved, options);
    if (!migrated.ok) ok = false;
    results.push(migrated);
  }

  return {
    ok,
    code: ok ? RESULT.OK : "migration_incomplete",
    results,
  };
}

module.exports = {
  RESULT,
  TARGET_ADMINS,
  REQUIRED_ADMIN_PERMS,
  FORBIDDEN_ADMIN_PERMS,
  resolveTargetAdmin,
  snapshotAdminAccess,
  verifyAdminSnapshot,
  migrateResolvedAdmin,
  migrateActiveClinicTenantAdmins,
  ORGANIZATION_ADMIN,
  FACILITY_ADMIN,
};
