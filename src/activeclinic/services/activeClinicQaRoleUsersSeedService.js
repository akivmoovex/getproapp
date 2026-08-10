"use strict";

/**
 * Idempotent ActiveClinic QA role-user provisioning (activeclinic-demo only).
 * Testing/demo databases only. Does not alter Julflona or RBAC matrices.
 */

const {
  createStaffMember,
  linkStaffMemberToIdentity,
  listStaffMembersByOrganization,
  updateStaffMemberProfile,
} = require("./activeClinicStaffService");
const { assignStaffToFacility } = require("./activeClinicStaffFacilityService");
const {
  assignStaffRole,
  listStaffRoleAssignments,
  resolveEffectivePermissions,
} = require("./activeClinicAuthorizationService");
const {
  createPlatformIdentity,
} = require("../../platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
  validatePasswordPolicy,
} = require("../../platform/services/platformIdentityCredentialService");
const identityRepo = require("../../platform/repositories/platformIdentityRepository");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const {
  evaluateStaffEligibility,
} = require("./activeClinicLoginEligibility");
const { buildActiveClinicNavigation } = require("./activeClinicNavigation");
const {
  DEMO_CLINIC_KEY,
  REQUESTED_QA_PASSWORD,
  RECOMMENDED_QA_PASSWORD,
  QA_ROLE_USERS,
  PRESERVED_DEMO_EMAILS,
  POSITIVE_PERMISSION_BY_ROLE,
  NEGATIVE_PERMISSION_BY_ROLE,
} = require("./activeClinicQaRoleUsersSpec");
const { ALLOWED_SEED_ENVIRONMENTS } = require("./activeClinicDemoClinicSpec");

const RESULT = Object.freeze({
  OK: "ok",
  REFUSED: "QA_ROLE_USERS_SEED_REFUSED",
  PASSWORD_REJECTED: "QA_PASSWORD_REJECTED_BY_EXISTING_POLICY",
  DEMO_CLINIC_NOT_FOUND: "ACTIVECLINIC_DEMO_CLINIC_NOT_FOUND",
  EMAIL_CONFLICT: "QA_ROLE_EMAIL_CONFLICT",
  INVALID_INPUT: "invalid_input",
  ABORT_DATABASE_IDENTITY_UNKNOWN: "ABORT_WITH_DATABASE_IDENTITY_UNKNOWN",
  ABORT_ENVIRONMENT: "ABORT_WITH_ENVIRONMENT_REFUSED",
});

const PASSWORD_MIN_LENGTH = 10;

async function readDatabaseIdentity(db) {
  const r = await db.query(
    `SELECT environment_code, identity_key, host_fingerprint
       FROM platform.database_identity
      LIMIT 1`
  );
  return r.rows[0] || null;
}

async function assertSafeQaEnvironment(db, opts = {}) {
  const identity = await readDatabaseIdentity(db);
  if (!identity || !identity.identity_key || !identity.environment_code) {
    return {
      ok: false,
      code: RESULT.ABORT_DATABASE_IDENTITY_UNKNOWN,
      message: "ABORT_WITH_DATABASE_IDENTITY_UNKNOWN",
      identity: null,
    };
  }
  const env = String(identity.environment_code).trim().toLowerCase();
  if (!ALLOWED_SEED_ENVIRONMENTS.includes(env) || env === "production") {
    return {
      ok: false,
      code: RESULT.ABORT_ENVIRONMENT,
      message: `QA_ROLE_USERS_SEED_REFUSED environment_code=${env}`,
      identity,
    };
  }
  if (opts.requireIdentityKey) {
    const expected = String(opts.requireIdentityKey).trim();
    if (expected && expected !== identity.identity_key) {
      return {
        ok: false,
        code: RESULT.ABORT_DATABASE_IDENTITY_UNKNOWN,
        message: "ABORT_WITH_DATABASE_IDENTITY_UNKNOWN",
        identity,
      };
    }
  }
  return { ok: true, code: RESULT.OK, identity };
}

async function findIdentityByEmail(db, emailNormalized) {
  const rows = await identityRepo.findIdentitiesByNormalizedContact(db, {
    emailNormalized,
  });
  return rows[0] || null;
}

async function findStaffLinkedToIdentity(db, identityId) {
  const r = await db.query(
    `SELECT s.id, s.organization_id, o.organization_key
       FROM activeclinic.staff_members s
       JOIN platform.organizations o ON o.id = s.organization_id
      WHERE s.platform_identity_id = $1`,
    [identityId]
  );
  return r.rows;
}

async function resolveDemoClinicContext(db) {
  const org = await db.query(
    `SELECT id, organization_key, display_name, status, data_environment
       FROM platform.organizations
      WHERE organization_key = $1
      LIMIT 1`,
    [DEMO_CLINIC_KEY]
  );
  if (!org.rows[0] || org.rows[0].status !== "active") {
    return { ok: false, code: RESULT.DEMO_CLINIC_NOT_FOUND };
  }
  const organization = org.rows[0];
  if (
    organization.data_environment &&
    !["demo", "testing"].includes(String(organization.data_environment))
  ) {
    return {
      ok: false,
      code: RESULT.REFUSED,
      message: "QA_ROLE_USERS_SEED_REFUSED organization_not_demo",
    };
  }

  const hco = await db.query(
    `SELECT id, public_name, status
       FROM activeclinic.healthcare_organizations
      WHERE organization_id = $1
      LIMIT 1`,
    [organization.id]
  );
  if (!hco.rows[0] || hco.rows[0].status !== "active") {
    return { ok: false, code: RESULT.DEMO_CLINIC_NOT_FOUND };
  }

  const facility = await db.query(
    `SELECT id, facility_key, display_name, status
       FROM activeclinic.facilities
      WHERE organization_id = $1
        AND status = 'active'
      ORDER BY
        CASE WHEN facility_key = 'lusaka' THEN 0 ELSE 1 END,
        created_at ASC
      LIMIT 1`,
    [organization.id]
  );
  if (!facility.rows[0]) {
    return {
      ok: false,
      code: RESULT.DEMO_CLINIC_NOT_FOUND,
      message: "no_primary_facility",
    };
  }

  return {
    ok: true,
    organization: {
      id: organization.id,
      key: organization.organization_key,
      displayName: organization.display_name,
      dataEnvironment: organization.data_environment,
    },
    healthcareOrganizationId: hco.rows[0].id,
    facility: {
      id: facility.rows[0].id,
      key: facility.rows[0].facility_key,
      displayName: facility.rows[0].display_name,
    },
  };
}

function assessPassword(password) {
  const policy = validatePasswordPolicy(password);
  if (!policy.ok) {
    return {
      ok: false,
      code: RESULT.PASSWORD_REJECTED,
      message: "QA_PASSWORD_REJECTED_BY_EXISTING_POLICY",
      passwordMinLength: PASSWORD_MIN_LENGTH,
      passwordMaxLength: 200,
      requestedPasswordLength: password != null ? String(password).length : 0,
      recommendedPassword: RECOMMENDED_QA_PASSWORD,
      recommendedPasswordLength: RECOMMENDED_QA_PASSWORD.length,
    };
  }
  return { ok: true, password: policy.value };
}

async function ensureOneQaUser(db, ctx, user, password, options = {}) {
  const email = String(user.email).trim().toLowerCase();
  let identity = await findIdentityByEmail(db, email);
  const linkedForeign = identity
    ? (await findStaffLinkedToIdentity(db, identity.id)).find(
        (row) => row.organization_id !== ctx.organization.id
      )
    : null;
  if (linkedForeign) {
    return {
      ok: false,
      code: RESULT.EMAIL_CONFLICT,
      message: "QA_ROLE_EMAIL_CONFLICT",
      email,
      conflictOrganizationKey: linkedForeign.organization_key,
    };
  }

  let identityCreated = false;
  if (!identity) {
    const created = await createPlatformIdentity(db, {
      primaryEmail: email,
      emailNormalized: email,
      emailVerifiedAt: new Date().toISOString(),
      status: "active",
      mustChangePassword: false,
    });
    if (!created.ok) {
      return { ok: false, code: created.code, message: created.code, email };
    }
    identity = created.identity;
    identityCreated = true;
  }

  const staffList = await listStaffMembersByOrganization(db, {
    organizationId: ctx.organization.id,
  });
  let staffMember =
    (staffList.staffMembers || []).find(
      (s) =>
        s.platformIdentityId === identity.id ||
        (s.emailNormalized && s.emailNormalized === email)
    ) || null;

  if (!staffMember) {
    const createdStaff = await createStaffMember(db, {
      organizationId: ctx.organization.id,
      healthcareOrganizationId: ctx.healthcareOrganizationId,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      email,
      phone: user.phone,
      jobTitle: user.jobTitle,
      employmentType: "permanent",
      status: "active",
      platformIdentityId: identity.id,
    });
    if (!createdStaff.ok) {
      return {
        ok: false,
        code: createdStaff.code,
        message: createdStaff.code,
        email,
      };
    }
    staffMember = createdStaff.staffMember;
  } else {
    if (!staffMember.platformIdentityId) {
      const linked = await linkStaffMemberToIdentity(db, {
        id: staffMember.id,
        organizationId: ctx.organization.id,
        platformIdentityId: identity.id,
      });
      if (!linked.ok) {
        return { ok: false, code: linked.code, message: linked.code, email };
      }
    } else if (String(staffMember.platformIdentityId) !== String(identity.id)) {
      return {
        ok: false,
        code: RESULT.EMAIL_CONFLICT,
        message: "QA_ROLE_STAFF_IDENTITY_CONFLICT",
        email,
      };
    }
    await updateStaffMemberProfile(db, {
      id: staffMember.id,
      organizationId: ctx.organization.id,
      patch: {
        email,
        jobTitle: user.jobTitle,
        displayName: user.displayName,
      },
    });
  }

  const facilityAssign = await assignStaffToFacility(db, {
    organizationId: ctx.organization.id,
    staffMemberId: staffMember.id,
    facilityId: ctx.facility.id,
    isPrimary: user.scopeType === "facility",
  });
  if (
    !facilityAssign.ok &&
    facilityAssign.code !== "facility_assignment_exists"
  ) {
    return {
      ok: false,
      code: facilityAssign.code,
      message: facilityAssign.code,
      email,
    };
  }

  const roles = await listStaffRoleAssignments(db, {
    staffMemberId: staffMember.id,
    organizationId: ctx.organization.id,
  });
  const hasRole = (roles.assignments || []).some(
    (a) =>
      a.roleKey === user.roleKey &&
      a.scopeType === user.scopeType &&
      (user.scopeType === "organisation" ||
        String(a.facilityId) === String(ctx.facility.id))
  );
  if (!hasRole) {
    const assigned = await assignStaffRole(db, {
      organizationId: ctx.organization.id,
      staffMemberId: staffMember.id,
      roleKey: user.roleKey,
      scopeType: user.scopeType,
      facilityId: user.scopeType === "facility" ? ctx.facility.id : null,
      assignmentOrigin: "system",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    if (!assigned.ok && assigned.code !== "role_assignment_exists") {
      return {
        ok: false,
        code: assigned.code,
        message: assigned.code,
        email,
      };
    }
  }

  const identityRow =
    identity.password_hash !== undefined
      ? identity
      : await identityRepo.findIdentityById(db, identity.id);
  const hasPassword = Boolean(identityRow && identityRow.password_hash);
  let passwordOutcome = "unchanged";
  if (identityCreated || options.resetPasswords === true || !hasPassword) {
    const set = await setPlatformIdentityPassword(db, {
      identityId: identity.id,
      password,
      mustChangePassword: false,
    });
    if (!set.ok) {
      return { ok: false, code: set.code, message: set.code, email };
    }
    passwordOutcome = identityCreated ? "qa_password_set" : "qa_password_reset";
  }

  return {
    ok: true,
    username: user.username,
    email,
    displayName: user.displayName,
    roleKey: user.roleKey,
    scopeType: user.scopeType,
    facilityId: ctx.facility.id,
    facilityKey: ctx.facility.key,
    facilityDisplayName: ctx.facility.displayName,
    staffMemberId: staffMember.id,
    identityId: identity.id,
    passwordOutcome,
    legacyNote: user.legacyNote || null,
  };
}

async function verifyQaUser(db, ctx, provisioned) {
  const identity = await identityRepo.findIdentityById(db, provisioned.identityId);
  const staff = (
    await db.query(`SELECT * FROM activeclinic.staff_members WHERE id = $1`, [
      provisioned.staffMemberId,
    ])
  ).rows[0];
  const elig = await evaluateStaffEligibility(db, staff, identity);
  const perms = await resolveEffectivePermissions(db, {
    organizationId: ctx.organization.id,
    staffMemberId: provisioned.staffMemberId,
    facilityId: ctx.facility.id,
  });
  const set = new Set(perms.permissions || []);
  const allowKey = POSITIVE_PERMISSION_BY_ROLE[provisioned.roleKey];
  const denyKey = NEGATIVE_PERMISSION_BY_ROLE[provisioned.roleKey];
  const nav = buildActiveClinicNavigation(perms.permissions || []);
  return {
    username: provisioned.username,
    email: provisioned.email,
    roleKey: provisioned.roleKey,
    scopeType: provisioned.scopeType,
    facility: provisioned.facilityDisplayName,
    permissionCount: (perms.permissions || []).length,
    LOGIN_READY: elig.ok === true,
    eligibilityCode: elig.code,
    positivePermission: allowKey,
    positiveOk: allowKey ? set.has(allowKey) : false,
    negativePermission: denyKey,
    negativeOk: denyKey ? !set.has(denyKey) : false,
    navModules: (nav.items || []).map((i) => i.key),
    labView: set.has("activeclinic.lab.view"),
    radiologyView: set.has("activeclinic.radiology.view"),
    refund: set.has("activeclinic.payment.refund"),
    reverse: set.has("activeclinic.payment.reverse"),
    charge: set.has("activeclinic.billing.charge"),
    collect: set.has("activeclinic.payment.collect"),
    assignAccess: set.has("activeclinic.staff.assign_access"),
  };
}

async function countQaArtifacts(db, organizationId) {
  const emails = QA_ROLE_USERS.map((u) => u.email);
  const identities = await db.query(
    `SELECT count(*)::int AS n FROM platform.identities
      WHERE email_normalized = ANY($1::text[])`,
    [emails]
  );
  const staff = await db.query(
    `SELECT count(*)::int AS n FROM activeclinic.staff_members
      WHERE organization_id = $1
        AND email_normalized = ANY($2::text[])`,
    [organizationId, emails]
  );
  const roles = await db.query(
    `SELECT count(*)::int AS n
       FROM activeclinic.staff_role_assignments a
       JOIN activeclinic.staff_members s ON s.id = a.staff_member_id
      WHERE s.organization_id = $1
        AND s.email_normalized = ANY($2::text[])
        AND a.status = 'active'
        AND a.revoked_at IS NULL`,
    [organizationId, emails]
  );
  return {
    identities: identities.rows[0].n,
    staff: staff.rows[0].n,
    activeRoleAssignments: roles.rows[0].n,
  };
}

async function snapshotPreservedDemoUsers(db, organizationId) {
  const r = await db.query(
    `SELECT email_normalized, display_name, status, platform_identity_id
       FROM activeclinic.staff_members
      WHERE organization_id = $1
        AND email_normalized = ANY($2::text[])
      ORDER BY email_normalized`,
    [organizationId, PRESERVED_DEMO_EMAILS]
  );
  return r.rows.map((row) => ({
    email: row.email_normalized,
    displayName: row.display_name,
    status: row.status,
    hasIdentity: Boolean(row.platform_identity_id),
  }));
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   dryRun?: boolean,
 *   confirm?: boolean,
 *   password?: string|null,
 *   resetPasswords?: boolean,
 *   requireIdentityKey?: string|null,
 * }} [options]
 */
async function seedActiveClinicQaRoleUsers(db, options = {}) {
  if (options.confirm !== true && options.dryRun !== true) {
    return {
      ok: false,
      code: RESULT.REFUSED,
      message: "QA_ROLE_USERS_SEED_REFUSED missing --confirm or dryRun",
    };
  }

  const envGate = await assertSafeQaEnvironment(db, {
    requireIdentityKey: options.requireIdentityKey || null,
  });
  if (!envGate.ok) {
    return {
      ok: false,
      code:
        envGate.code === RESULT.ABORT_ENVIRONMENT
          ? RESULT.REFUSED
          : envGate.code,
      message: envGate.message,
      identity: envGate.identity,
    };
  }

  const passwordInput =
    options.password != null && String(options.password).length
      ? String(options.password)
      : REQUESTED_QA_PASSWORD;
  const passwordGate = assessPassword(passwordInput);
  if (!passwordGate.ok) {
    return {
      ok: false,
      code: RESULT.PASSWORD_REJECTED,
      message: passwordGate.message,
      passwordPolicy: {
        minLength: passwordGate.passwordMinLength,
        maxLength: passwordGate.passwordMaxLength,
        requestedLength: passwordGate.requestedPasswordLength,
        recommendedPassword: passwordGate.recommendedPassword,
      },
      identity: envGate.identity,
      usersCreated: 0,
    };
  }

  const ctx = await resolveDemoClinicContext(db);
  if (!ctx.ok) {
    return { ok: false, code: ctx.code, message: ctx.message || ctx.code };
  }

  const beforePreserved = await snapshotPreservedDemoUsers(
    db,
    ctx.organization.id
  );
  const beforeCounts = await countQaArtifacts(db, ctx.organization.id);

  if (options.dryRun === true) {
    return {
      ok: true,
      code: RESULT.OK,
      mode: "dry-run",
      identity: envGate.identity,
      organization: ctx.organization,
      facility: ctx.facility,
      wouldProvision: QA_ROLE_USERS.length,
      beforeCounts,
      preservedDemoUsers: beforePreserved,
    };
  }

  const users = [];
  for (const user of QA_ROLE_USERS) {
    const one = await ensureOneQaUser(db, ctx, user, passwordGate.password, {
      resetPasswords: options.resetPasswords === true,
    });
    if (!one.ok) {
      return {
        ok: false,
        code: one.code,
        message: one.message,
        failedUsername: user.username,
        users,
        identity: envGate.identity,
      };
    }
    users.push(one);
  }

  const verifications = [];
  for (const u of users) {
    verifications.push(await verifyQaUser(db, ctx, u));
  }

  const afterPreserved = await snapshotPreservedDemoUsers(
    db,
    ctx.organization.id
  );
  const afterCounts = await countQaArtifacts(db, ctx.organization.id);
  const julflona = await db.query(
    `SELECT count(*)::int AS n
       FROM activeclinic.staff_members s
       JOIN platform.organizations o ON o.id = s.organization_id
      WHERE o.organization_key = 'julflona-clinic'
        AND s.email_normalized = ANY($1::text[])`,
    [QA_ROLE_USERS.map((u) => u.email)]
  );

  return {
    ok: true,
    code: RESULT.OK,
    mode: "apply",
    identity: envGate.identity,
    organization: ctx.organization,
    facility: ctx.facility,
    users,
    verifications,
    beforeCounts,
    afterCounts,
    preservedDemoUsersBefore: beforePreserved,
    preservedDemoUsersAfter: afterPreserved,
    julflonaQaEmailStaffCount: julflona.rows[0].n,
    loginReadyCount: verifications.filter((v) => v.LOGIN_READY).length,
    passwordPolicyAccepted: true,
    passwordMustChange: false,
  };
}

module.exports = {
  RESULT,
  PASSWORD_MIN_LENGTH,
  REQUESTED_QA_PASSWORD,
  RECOMMENDED_QA_PASSWORD,
  QA_ROLE_USERS,
  PRESERVED_DEMO_EMAILS,
  POSITIVE_PERMISSION_BY_ROLE,
  NEGATIVE_PERMISSION_BY_ROLE,
  assessPassword,
  seedActiveClinicQaRoleUsers,
  resolveDemoClinicContext,
  verifyQaUser,
  countQaArtifacts,
};
