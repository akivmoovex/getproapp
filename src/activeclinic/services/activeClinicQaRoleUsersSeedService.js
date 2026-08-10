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
  updatePlatformIdentityPhone,
} = require("../../platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
  validatePasswordPolicy,
  verifyPlatformIdentityPassword,
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
  resolveIdentityForLogin,
} = require("./authenticateActiveClinicIdentity");
const {
  normalizeRegistrationPhone,
} = require("../../blessboard/services/normalizeRegistrationPhone");
const {
  normalizeActiveClinicPhone,
} = require("./normalizeActiveClinicContact");
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
  PHONE_REJECTED: "QA_PHONE_FORMAT_REJECTED_BY_EXISTING_POLICY",
  PHONE_CONFLICT: "QA_PHONE_OWNED_BY_OTHER_IDENTITY",
  DEMO_CLINIC_NOT_FOUND: "ACTIVECLINIC_DEMO_CLINIC_NOT_FOUND",
  EMAIL_CONFLICT: "QA_ROLE_EMAIL_CONFLICT",
  INVALID_INPUT: "invalid_input",
  ABORT_DATABASE_IDENTITY_UNKNOWN: "ABORT_WITH_DATABASE_IDENTITY_UNKNOWN",
  ABORT_ENVIRONMENT: "ABORT_WITH_ENVIRONMENT_REFUSED",
});

const PASSWORD_MIN_LENGTH = 10;

/** DEMO PHONE — DO NOT SEND (SMS/WhatsApp/OTP). Login resolution only. */
const QA_PHONE_DELIVERY_NOTE = "DEMO PHONE — DO NOT SEND";

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

/**
 * Validate QA phone with login normalizer + ActiveClinic staff E.164 helper.
 * Does not weaken either policy.
 */
function assessQaPhone(rawPhone) {
  const loginPhone = normalizeRegistrationPhone(rawPhone);
  if (!loginPhone.ok) {
    return {
      ok: false,
      code: RESULT.PHONE_REJECTED,
      message: "QA_PHONE_FORMAT_REJECTED_BY_EXISTING_POLICY",
      reason: loginPhone.error || "login_phone_invalid",
      acceptedFormat: "E.164 e.g. +260970000001 (Zambia national forms also normalize for login)",
    };
  }
  const staffPhone = normalizeActiveClinicPhone(loginPhone.normalized);
  if (!staffPhone.ok) {
    return {
      ok: false,
      code: RESULT.PHONE_REJECTED,
      message: "QA_PHONE_FORMAT_REJECTED_BY_EXISTING_POLICY",
      reason: staffPhone.code,
      acceptedFormat: "E.164 required for ActiveClinic staff contact (+260…)",
    };
  }
  return {
    ok: true,
    normalized: loginPhone.normalized,
    display: staffPhone.display,
  };
}

function assessAllQaPhones() {
  const seen = new Set();
  for (const user of QA_ROLE_USERS) {
    const assessed = assessQaPhone(user.phone);
    if (!assessed.ok) {
      return { ok: false, ...assessed, username: user.username, phone: user.phone };
    }
    if (seen.has(assessed.normalized)) {
      return {
        ok: false,
        code: RESULT.PHONE_REJECTED,
        message: "QA_PHONE_FORMAT_REJECTED_BY_EXISTING_POLICY",
        reason: "duplicate_phone_in_spec",
        phone: assessed.normalized,
        username: user.username,
      };
    }
    seen.add(assessed.normalized);
  }
  return { ok: true };
}

async function ensureQaIdentityPhone(db, identityId, phoneNormalized, phoneDisplay) {
  const owners = await identityRepo.findIdentitiesByNormalizedContact(db, {
    phoneNormalized,
  });
  const foreign = owners.find((row) => String(row.id) !== String(identityId));
  if (foreign) {
    return {
      ok: false,
      code: RESULT.PHONE_CONFLICT,
      message: "QA_PHONE_OWNED_BY_OTHER_IDENTITY",
      phone: phoneNormalized,
      conflictIdentityId: foreign.id,
      conflictEmail: foreign.email_normalized || null,
    };
  }

  const identity = await identityRepo.findIdentityById(db, identityId);
  if (!identity) {
    return { ok: false, code: "identity_not_found", message: "identity_not_found" };
  }

  if (identity.phone_normalized === phoneNormalized) {
    return {
      ok: true,
      phoneOutcome: "already_correct",
      phone: phoneNormalized,
    };
  }

  const updated = await updatePlatformIdentityPhone(db, {
    identityId,
    primaryPhone: phoneDisplay || phoneNormalized,
    phoneNormalized,
    phoneVerifiedAt: new Date().toISOString(),
  });
  if (!updated.ok) {
    return {
      ok: false,
      code: updated.code,
      message: updated.code,
      phone: phoneNormalized,
    };
  }
  return {
    ok: true,
    phoneOutcome: identity.phone_normalized ? "phone_replaced" : "phone_assigned",
    phone: phoneNormalized,
  };
}

async function ensureOneQaUser(db, ctx, user, password, options = {}) {
  const email = String(user.email).trim().toLowerCase();
  const phoneAssessed = assessQaPhone(user.phone);
  if (!phoneAssessed.ok) {
    return { ok: false, ...phoneAssessed, email, username: user.username };
  }
  const phoneNormalized = phoneAssessed.normalized;
  const phoneDisplay = phoneAssessed.display;

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

  const phoneOwners = await identityRepo.findIdentitiesByNormalizedContact(db, {
    phoneNormalized,
  });
  if (!identity) {
    if (phoneOwners.length > 0) {
      return {
        ok: false,
        code: RESULT.PHONE_CONFLICT,
        message: "QA_PHONE_OWNED_BY_OTHER_IDENTITY",
        phone: phoneNormalized,
        email,
        username: user.username,
        conflictEmail: phoneOwners[0].email_normalized || null,
      };
    }
  }

  let identityCreated = false;
  if (!identity) {
    const created = await createPlatformIdentity(db, {
      primaryEmail: email,
      emailNormalized: email,
      emailVerifiedAt: new Date().toISOString(),
      primaryPhone: phoneDisplay,
      phoneNormalized,
      phoneVerifiedAt: new Date().toISOString(),
      status: "active",
      mustChangePassword: false,
    });
    if (!created.ok) {
      return { ok: false, code: created.code, message: created.code, email };
    }
    identity = created.identity;
    identityCreated = true;
  }

  const identityId = identity.id;
  const phoneEnsure = await ensureQaIdentityPhone(
    db,
    identityId,
    phoneNormalized,
    phoneDisplay
  );
  if (!phoneEnsure.ok) {
    return { ok: false, ...phoneEnsure, email, username: user.username };
  }

  const staffList = await listStaffMembersByOrganization(db, {
    organizationId: ctx.organization.id,
  });
  let staffMember =
    (staffList.staffMembers || []).find(
      (s) =>
        s.platformIdentityId === identityId ||
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
      phone: phoneNormalized,
      jobTitle: user.jobTitle,
      employmentType: "permanent",
      status: "active",
      platformIdentityId: identityId,
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
        platformIdentityId: identityId,
      });
      if (!linked.ok) {
        return { ok: false, code: linked.code, message: linked.code, email };
      }
    } else if (String(staffMember.platformIdentityId) !== String(identityId)) {
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
        phone: phoneNormalized,
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
      : await identityRepo.findIdentityById(db, identityId);
  const hasPassword = Boolean(identityRow && identityRow.password_hash);
  let passwordOutcome = "unchanged";
  if (identityCreated || options.resetPasswords === true || !hasPassword) {
    const set = await setPlatformIdentityPassword(db, {
      identityId,
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
    phone: phoneNormalized,
    displayName: user.displayName,
    roleKey: user.roleKey,
    scopeType: user.scopeType,
    facilityId: ctx.facility.id,
    facilityKey: ctx.facility.key,
    facilityDisplayName: ctx.facility.displayName,
    staffMemberId: staffMember.id,
    identityId,
    passwordOutcome,
    phoneOutcome: identityCreated ? "phone_assigned" : phoneEnsure.phoneOutcome,
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

  const byEmail = await identityRepo.findIdentitiesByNormalizedContact(db, {
    emailNormalized: provisioned.email,
  });
  const byPhone = await identityRepo.findIdentitiesByNormalizedContact(db, {
    phoneNormalized: provisioned.phone,
  });
  const emailIdentityId = byEmail[0] && byEmail[0].id;
  const phoneIdentityId = byPhone[0] && byPhone[0].id;
  const emailPhoneMatch =
    byEmail.length === 1 &&
    byPhone.length === 1 &&
    String(emailIdentityId) === String(phoneIdentityId) &&
    String(emailIdentityId) === String(provisioned.identityId);

  const phoneResolve = await resolveIdentityForLogin(db, {
    identifier: provisioned.phone,
  });
  const phoneResolveOk =
    phoneResolve.ok === true &&
    phoneResolve.kind === "phone" &&
    String(phoneResolve.identityRow.id) === String(provisioned.identityId);

  let passwordVerifyOk = null;
  if (provisioned.verifyPassword) {
    const pw = await verifyPlatformIdentityPassword(db, {
      identityId: provisioned.identityId,
      password: provisioned.verifyPassword,
    });
    passwordVerifyOk = pw.ok === true;
  }

  return {
    username: provisioned.username,
    email: provisioned.email,
    phone: provisioned.phone,
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
    identityPhone: identity && identity.phone_normalized,
    staffPhone: staff && staff.phone_normalized,
    staffPhoneMatches: staff && staff.phone_normalized === provisioned.phone,
    emailPhoneMatch,
    phoneResolveOk,
    passwordVerifyOk,
  };
}

async function countQaArtifacts(db, organizationId) {
  const emails = QA_ROLE_USERS.map((u) => u.email);
  const phones = QA_ROLE_USERS.map((u) => assessQaPhone(u.phone).normalized).filter(
    Boolean
  );
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
  const phoneOwners = await db.query(
    `SELECT count(DISTINCT phone_normalized)::int AS n
       FROM platform.identities
      WHERE phone_normalized = ANY($1::text[])`,
    [phones]
  );
  return {
    identities: identities.rows[0].n,
    staff: staff.rows[0].n,
    activeRoleAssignments: roles.rows[0].n,
    distinctQaPhones: phoneOwners.rows[0].n,
  };
}

async function snapshotPreservedDemoUsers(db, organizationId) {
  const r = await db.query(
    `SELECT email_normalized, display_name, status, platform_identity_id,
            phone_normalized
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
    phone: row.phone_normalized,
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

  const phoneGate = assessAllQaPhones();
  if (!phoneGate.ok) {
    return {
      ok: false,
      code: RESULT.PHONE_REJECTED,
      message: phoneGate.message,
      reason: phoneGate.reason,
      acceptedFormat: phoneGate.acceptedFormat,
      username: phoneGate.username || null,
      phone: phoneGate.phone || null,
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
      phoneDeliveryNote: QA_PHONE_DELIVERY_NOTE,
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
        phone: one.phone || user.phone,
        users,
        identity: envGate.identity,
      };
    }
    users.push(one);
  }

  const representativePasswordCheck = new Set([
    "demo_organization_admin",
    "demo_receptionist",
    "demo_clinician",
    "demo_lab_technician",
    "demo_cashier",
    "demo_staff",
  ]);

  const verifications = [];
  for (const u of users) {
    verifications.push(
      await verifyQaUser(db, ctx, {
        ...u,
        verifyPassword: representativePasswordCheck.has(u.username)
          ? passwordGate.password
          : null,
      })
    );
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
        AND (
          s.email_normalized = ANY($1::text[])
          OR s.phone_normalized = ANY($2::text[])
        )`,
    [
      QA_ROLE_USERS.map((u) => u.email),
      QA_ROLE_USERS.map((u) => assessQaPhone(u.phone).normalized),
    ]
  );
  const julflonaPhones = await db.query(
    `SELECT count(*)::int AS n
       FROM platform.identities i
       JOIN activeclinic.staff_members s ON s.platform_identity_id = i.id
       JOIN platform.organizations o ON o.id = s.organization_id
      WHERE o.organization_key = 'julflona-clinic'
        AND i.phone_normalized = ANY($1::text[])`,
    [QA_ROLE_USERS.map((u) => assessQaPhone(u.phone).normalized)]
  );

  const phoneUpdated = users.filter(
    (u) =>
      u.phoneOutcome === "phone_assigned" || u.phoneOutcome === "phone_replaced"
  ).length;
  const phoneAlreadyCorrect = users.filter(
    (u) => u.phoneOutcome === "already_correct"
  ).length;

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
    julflonaQaPhoneIdentityCount: julflonaPhones.rows[0].n,
    loginReadyCount: verifications.filter((v) => v.LOGIN_READY).length,
    emailPhoneMatchCount: verifications.filter((v) => v.emailPhoneMatch).length,
    phoneResolveOkCount: verifications.filter((v) => v.phoneResolveOk).length,
    phoneUpdated,
    phoneAlreadyCorrect,
    phoneConflicts: 0,
    passwordPolicyAccepted: true,
    passwordMustChange: false,
    phoneDeliveryNote: QA_PHONE_DELIVERY_NOTE,
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
  QA_PHONE_DELIVERY_NOTE,
  assessPassword,
  assessQaPhone,
  assessAllQaPhones,
  ensureQaIdentityPhone,
  seedActiveClinicQaRoleUsers,
  resolveDemoClinicContext,
  verifyQaUser,
  countQaArtifacts,
};
