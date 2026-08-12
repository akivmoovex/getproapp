"use strict";

/**
 * Idempotent BlessBoard QA role-user provisioning (demo-church only).
 * Testing databases only. Does not widen RBAC matrices or touch production.
 */

const bcrypt = require("bcryptjs");
const {
  DEMO_ORGANIZATION_KEY,
  DEMO_CHURCH_KEY,
  DEMO_CAMPUS_BRANCH_KEY,
  QA_PASSWORD,
  QA_PHONE_START,
  EXISTING_USER_PHONE_START,
  LEGACY_LOGIN_ROLES,
  classifyCatalogueRole,
  resolveQaAssignmentPlan,
  formatQaPhone,
  qaEmailForRole,
  qaDisplayName,
} = require("./blessBoardQaRoleUsersSpec");
const { createBlessBoardUser, BCRYPT_ROUNDS } = require("./createBlessBoardUser");
const { assignBlessBoardRole } = require("./assignBlessBoardRole");
const { resetBlessBoardUserPassword } = require("./resetBlessBoardUserPassword");
const { authenticateBlessBoardUser } = require("./authenticateBlessBoardUser");
const { normalizeRegistrationPhone } = require("./normalizeRegistrationPhone");
const authRepo = require("../repositories/blessBoardAuthRepository");
const rbacRepo = require("../repositories/blessBoardRbacRepository");
const {
  listEffectivePermissions,
} = require("./blessBoardRbacAuthorizationService");

const RESULT = Object.freeze({
  OK: "ok",
  REFUSED: "QA_ROLE_USERS_SEED_REFUSED",
  PASSWORD_REJECTED: "QA_PASSWORD_REJECTED_BY_EXISTING_POLICY",
  PHONE_REJECTED: "QA_PHONE_FORMAT_REJECTED_BY_EXISTING_POLICY",
  PHONE_CONFLICT: "QA_PHONE_OWNED_BY_OTHER_IDENTITY",
  DEMO_NOT_FOUND: "BLESSBOARD_DEMO_CHURCH_NOT_FOUND",
  EMAIL_CONFLICT: "QA_ROLE_EMAIL_CONFLICT",
  INVALID_INPUT: "invalid_input",
  ABORT_DATABASE_IDENTITY_UNKNOWN: "ABORT_WITH_DATABASE_IDENTITY_UNKNOWN",
  ABORT_ENVIRONMENT: "ABORT_WITH_ENVIRONMENT_REFUSED",
});

const ALLOWED_SEED_ENVIRONMENTS = Object.freeze(["testing", "demo"]);
const QA_PHONE_DELIVERY_NOTE = "DEMO PHONE — DO NOT SEND";
const DEPLOYMENT_CODE_FALLBACK = "blessboard-org-staging";

async function readDatabaseIdentity(db) {
  const r = await db.query(
    `SELECT environment_code, identity_key, database_instance_id, host_fingerprint
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
  const expected = opts.requireIdentityKey != null ? String(opts.requireIdentityKey).trim() : "";
  if (expected && expected !== String(identity.identity_key)) {
    return {
      ok: false,
      code: RESULT.REFUSED,
      message: `identity_mismatch expected=${expected} actual=${identity.identity_key}`,
      identity,
    };
  }
  return { ok: true, identity };
}

async function loadDemoTenant(db) {
  const org = await authRepo.findOrganizationByKey(db, DEMO_ORGANIZATION_KEY);
  if (!org || String(org.status) !== "active") return null;
  const church = await authRepo.findChurchByKey(db, DEMO_CHURCH_KEY);
  if (!church || String(church.status) !== "active") return null;
  if (String(church.organization_id) !== String(org.id)) return null;
  const hq = await authRepo.findBranchByChurchAndKey(db, church.id, "hq");
  const campus = await authRepo.findBranchByChurchAndKey(
    db,
    church.id,
    DEMO_CAMPUS_BRANCH_KEY
  );
  return { org, church, hq, campus };
}

async function listCatalogueRoles(db) {
  const r = await db.query(
    `SELECT id, role_key, display_name, role_category, is_system, is_sensitive, is_active,
            (SELECT COUNT(*)::int FROM blessboard.role_permissions rp WHERE rp.role_id = blessboard.roles.id) AS permission_count
       FROM blessboard.roles
      ORDER BY role_category, role_key`
  );
  return r.rows.map((row) => ({
    id: row.id,
    roleKey: row.role_key,
    displayName: row.display_name,
    roleCategory: row.role_category,
    isSystem: row.is_system === true,
    isSensitive: row.is_sensitive === true,
    isActive: row.is_active === true,
    permissionCount: row.permission_count,
    classification: classifyCatalogueRole(row),
  }));
}

async function listUsersWithBlessBoardRoles(db) {
  const r = await db.query(
    `SELECT u.id, u.email_normalized, u.display_name, u.status,
            u.phone_normalized, u.phone_display, u.phone_country_code,
            u.password_change_required, u.sign_in_locked_until,
            COALESCE(
              (SELECT array_agg(DISTINCT ur.role_key ORDER BY ur.role_key)
                 FROM blessboard.user_roles ur
                WHERE ur.user_id = u.id AND ur.status = 'active'),
              ARRAY[]::text[]
            ) AS legacy_roles,
            COALESCE(
              (SELECT array_agg(DISTINCT r.role_key ORDER BY r.role_key)
                 FROM blessboard.user_role_assignments ura
                 JOIN blessboard.roles r ON r.id = ura.role_id
                WHERE ura.user_id = u.id
                  AND ura.status = 'active'
                  AND ura.revoked_at IS NULL),
              ARRAY[]::text[]
            ) AS catalogue_roles
       FROM blessboard.users u
      WHERE u.id IN (
              SELECT user_id FROM blessboard.user_roles WHERE status = 'active'
              UNION
              SELECT user_id FROM blessboard.user_role_assignments
               WHERE status = 'active' AND revoked_at IS NULL
            )
      ORDER BY u.email_normalized`
  );
  return r.rows;
}

function validateQaPassword(password) {
  const value = password != null ? String(password) : "";
  if (!value || value.length < 10 || value.length > 200) {
    return {
      ok: false,
      code: RESULT.PASSWORD_REJECTED,
      passwordPolicy: {
        minLength: 10,
        maxLength: 200,
        requestedLength: value.length,
      },
    };
  }
  return { ok: true, value };
}

function normalizeQaPhoneOrThrow(phone) {
  const result = normalizeRegistrationPhone(phone, "ZM");
  if (!result.ok) {
    const err = new Error(RESULT.PHONE_REJECTED);
    err.code = RESULT.PHONE_REJECTED;
    err.detail = result.error;
    throw err;
  }
  return result;
}

async function findPhoneOwner(db, phoneNormalized, exceptUserId) {
  const r = await db.query(
    `SELECT id, email_normalized
       FROM blessboard.users
      WHERE phone_normalized = $1
        AND ($2::uuid IS NULL OR id <> $2)
      LIMIT 2`,
    [phoneNormalized, exceptUserId || null]
  );
  return r.rows[0] || null;
}

async function allocateFreeQaPhone(db, startIndex, exceptUserId) {
  let index = startIndex;
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const candidate = formatQaPhone(index);
    const norm = normalizeQaPhoneOrThrow(candidate);
    const owner = await findPhoneOwner(db, norm.normalized, exceptUserId);
    if (!owner) {
      return { index, ...norm };
    }
    index += 1;
  }
  const err = new Error(RESULT.PHONE_CONFLICT);
  err.code = RESULT.PHONE_CONFLICT;
  throw err;
}

async function upsertUserPhone(db, { userId, organizationId, phoneNormalized, phoneDisplay }) {
  await db.query(
    `UPDATE blessboard.users
        SET phone_normalized = $2,
            phone_display = $3,
            phone_country_code = 'ZM',
            updated_at = now()
      WHERE id = $1`,
    [userId, phoneNormalized, phoneDisplay || phoneNormalized]
  );
  // One staff phone per (org, user); PK is (org, phone).
  await db.query(
    `DELETE FROM blessboard.organization_staff_phones
      WHERE organization_id = $1
        AND user_id = $2
        AND phone_normalized IS DISTINCT FROM $3`,
    [organizationId, userId, phoneNormalized]
  );
  await db.query(
    `INSERT INTO blessboard.organization_staff_phones
       (organization_id, phone_normalized, user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (organization_id, phone_normalized)
     DO UPDATE SET user_id = EXCLUDED.user_id`,
    [organizationId, phoneNormalized, userId]
  );
}

async function ensureCatalogueAssignment(db, {
  userId,
  organizationId,
  churchId,
  roleKey,
  scopeType,
  scopeId,
  actorUserId,
  dryRun,
}) {
  const role = await rbacRepo.findRoleByKey(db, roleKey);
  if (!role || !role.isActive) {
    return { ok: false, reason: "role_missing" };
  }
  const existing = await db.query(
    `SELECT id FROM blessboard.user_role_assignments
      WHERE user_id = $1
        AND role_id = $2
        AND organization_id = $3
        AND scope_type = $4
        AND status = 'active'
        AND revoked_at IS NULL
      LIMIT 1`,
    [userId, role.id, organizationId, scopeType]
  );
  if (existing.rows[0]) {
    return { ok: true, status: "already_assigned", assignmentId: existing.rows[0].id };
  }
  if (dryRun) {
    return { ok: true, status: "dry_run_would_assign" };
  }
  const inserted = await rbacRepo.insertAssignment(db, {
    userId,
    organizationId,
    churchId: scopeType === "organisation" ? null : churchId,
    roleId: role.id,
    scopeType,
    scopeId: scopeId || null,
    assignedByUserId: actorUserId || null,
    assignmentOrigin: "system",
    assignmentReason: "blessboard_qa_role_users_seed",
    expiresAt: null,
  });
  await rbacRepo.insertAssignmentEvent(db, {
    assignmentId: inserted.id,
    organizationId,
    actorUserId: actorUserId || null,
    eventKey: "rbac.assignment.created",
    previousStatus: null,
    newStatus: "active",
    reason: "blessboard_qa_role_users_seed",
    metadata: { source: "blessboard_qa_role_users_seed", roleKey },
  });
  return { ok: true, status: "assigned", assignmentId: inserted.id };
}

async function verifyLogin(db, { email, phone, password, deploymentCode, organizationId }) {
  // Real authenticateBlessBoardUser path (including deployment-scoped session create).
  // Temporary verify sessions are revoked immediately so LOGIN_READY matches browser login.
  const { revokeV5Session } = require("../../platform/session/revokeV5Session");
  const emailUser = await authRepo.findUserByEmail(db, email);
  if (!emailUser || String(emailUser.status) !== "active") {
    return {
      emailOk: false,
      phoneOk: false,
      identityMatch: false,
      wrongPasswordRejected: true,
      LOGIN_READY: false,
      emailStatus: "user_inactive_or_missing",
    };
  }
  const phoneNorm = normalizeRegistrationPhone(phone, "ZM");
  const phoneUser =
    phoneNorm.ok ? await authRepo.findUserByPhone(db, phoneNorm.normalized) : null;
  const identityMatch = Boolean(
    phoneUser && String(phoneUser.id) === String(emailUser.id)
  );
  const passwordOk = await bcrypt.compare(password, emailUser.password_hash);
  const wrongRejected = !(await bcrypt.compare(`${password}x`, emailUser.password_hash));
  const roles = await authRepo.listActiveRolesForUser(db, emailUser.id);
  const applicable = roles.filter((r) => {
    if (String(r.role_key) === "platform_admin") return true;
    if (!organizationId) return true;
    return String(r.organization_id || "") === String(organizationId);
  });
  const hasLoginRole = applicable.length > 0;
  const locked =
    emailUser.sign_in_locked_until &&
    new Date(emailUser.sign_in_locked_until).getTime() > Date.now();
  const mustChange = emailUser.password_change_required === true;

  let authOk = false;
  let authStatus = null;
  let authMessage = null;
  let phoneAuthOk = false;
  if (passwordOk && hasLoginRole && !locked && !mustChange) {
    const auth = await authenticateBlessBoardUser(db, {
      identifier: email,
      password,
      deploymentCode,
      requireOrganizationId: organizationId || null,
    });
    authOk = auth && auth.ok === true;
    authStatus = auth && auth.status;
    authMessage = auth && auth.message;
    if (auth && auth.ok && auth.rawToken) {
      await revokeV5Session(db, { rawToken: auth.rawToken, deploymentCode });
    }
    if (identityMatch) {
      const phoneAuth = await authenticateBlessBoardUser(db, {
        identifier: phone,
        password,
        deploymentCode,
        requireOrganizationId: organizationId || null,
      });
      phoneAuthOk = phoneAuth && phoneAuth.ok === true;
      if (phoneAuth && phoneAuth.ok && phoneAuth.rawToken) {
        await revokeV5Session(db, { rawToken: phoneAuth.rawToken, deploymentCode });
      }
    }
  }

  const emailOk = passwordOk && hasLoginRole && !locked && !mustChange && authOk;
  const phoneOk = identityMatch && emailOk && phoneAuthOk;
  return {
    emailOk,
    phoneOk,
    identityMatch,
    wrongPasswordRejected: wrongRejected,
    emailStatus: authStatus || (emailOk ? "authenticated" : "not_ready"),
    phoneStatus: phoneOk ? "authenticated" : "not_ready",
    authMessage: authMessage || null,
    LOGIN_READY: emailOk && phoneOk && identityMatch && wrongRejected,
  };
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   dryRun?: boolean,
 *   confirm?: boolean,
 *   password?: string,
 *   resetPasswords?: boolean,
 *   requireIdentityKey?: string,
 *   deploymentCode?: string,
 * }} [options]
 */
async function seedBlessBoardQaRoleUsers(db, options = {}) {
  const dryRun = options.dryRun !== false && options.confirm !== true;
  const passwordInput = options.password != null ? options.password : QA_PASSWORD;
  const resetPasswords = options.resetPasswords !== false;
  const deploymentCode = String(
    options.deploymentCode || process.env.PLATFORM_DEPLOYMENT_CODE || DEPLOYMENT_CODE_FALLBACK
  )
    .trim()
    .toLowerCase() || DEPLOYMENT_CODE_FALLBACK;

  const envGate = await assertSafeQaEnvironment(db, {
    requireIdentityKey: options.requireIdentityKey,
  });
  if (!envGate.ok) {
    return {
      ok: false,
      code: envGate.code,
      message: envGate.message,
      identity: envGate.identity,
    };
  }

  const passwordCheck = validateQaPassword(passwordInput);
  if (!passwordCheck.ok) {
    return {
      ok: false,
      code: RESULT.PASSWORD_REJECTED,
      message: RESULT.PASSWORD_REJECTED,
      passwordPolicy: passwordCheck.passwordPolicy,
    };
  }
  const password = passwordCheck.value;

  const demo = await loadDemoTenant(db);
  if (!demo) {
    return {
      ok: false,
      code: RESULT.DEMO_NOT_FOUND,
      message: RESULT.DEMO_NOT_FOUND,
      identity: envGate.identity,
    };
  }

  const catalogueRoles = await listCatalogueRoles(db);
  const humanAssignable = catalogueRoles.filter((r) => r.classification === "HUMAN_ASSIGNABLE");
  const excluded = catalogueRoles.filter((r) => r.classification !== "HUMAN_ASSIGNABLE");

  const existingRoleUsers = await listUsersWithBlessBoardRoles(db);
  const beforeCounts = {
    roleUsers: existingRoleUsers.length,
    withPhone: existingRoleUsers.filter((u) => u.phone_normalized).length,
    withoutPhone: existingRoleUsers.filter((u) => !u.phone_normalized).length,
  };

  function exclusionReason(role) {
    if (role.roleCategory === "activeclinic") {
      return "ActiveClinic product role — out of BlessBoard QA scope";
    }
    if (role.roleKey === "member") return "Member portal identity; not a staff login role";
    if (role.roleKey === "visitor") return "Excluded from staff-access assignable catalogue";
    if (role.roleKey === "platform_administrator") {
      return "Platform catalogue role; covered by legacy platform_admin login user";
    }
    if (role.classification === "INACTIVE") return "Inactive role";
    return "Not human-assignable for BlessBoard staff QA";
  }

  const report = {
    ok: true,
    code: RESULT.OK,
    mode: dryRun ? "dry-run" : "apply",
    identity: {
      identityKey: envGate.identity.identity_key,
      environmentCode: envGate.identity.environment_code,
      databaseInstanceId: envGate.identity.database_instance_id,
    },
    organization: {
      key: DEMO_ORGANIZATION_KEY,
      id: demo.org.id,
      churchKey: DEMO_CHURCH_KEY,
      churchId: demo.church.id,
      hqBranchId: demo.hq && demo.hq.id,
      campusBranchId: demo.campus && demo.campus.id,
    },
    phoneDeliveryNote: QA_PHONE_DELIVERY_NOTE,
    deploymentCode,
    roleCatalogue: catalogueRoles.map((r) => ({
      roleKey: r.roleKey,
      displayName: r.displayName,
      classification: r.classification,
      permissionCount: r.permissionCount,
      scope: r.roleCategory,
    })),
    excludedRoles: excluded.map((r) => ({
      roleKey: r.roleKey,
      classification: r.classification,
      reason: exclusionReason(r),
    })),
    existingUsers: [],
    createdUsers: [],
    verifications: [],
    coverage: [],
    beforeCounts,
    phonesAssigned: 0,
    phonesKept: 0,
    passwordsReset: 0,
    usersCreated: 0,
    roleAssignmentsCreated: 0,
    roleAssignmentsRemoved: 0,
    permissionsChanged: 0,
  };

  // --- Existing role users: phones + passwords ---
  let existingPhoneIndex = EXISTING_USER_PHONE_START;
  for (const user of existingRoleUsers) {
    const row = {
      id: user.id,
      email: user.email_normalized,
      displayName: user.display_name,
      status: user.status,
      legacyRoles: user.legacy_roles || [],
      catalogueRoles: user.catalogue_roles || [],
      previousPhone: user.phone_normalized || null,
      phone: user.phone_normalized || null,
      phoneAction: "keep",
      passwordReset: "skipped",
      login: null,
    };

    let phoneNormalized = user.phone_normalized || null;
    let phoneDisplay = user.phone_display || null;
    if (phoneNormalized) {
      const norm = normalizeRegistrationPhone(phoneNormalized, "ZM");
      if (norm.ok && norm.normalized !== phoneNormalized) {
        phoneNormalized = norm.normalized;
        phoneDisplay = norm.display;
        row.phoneAction = "normalize";
      } else if (!norm.ok) {
        phoneNormalized = null;
      } else {
        report.phonesKept += 1;
      }
    }
    if (!phoneNormalized) {
      const allocated = await allocateFreeQaPhone(db, existingPhoneIndex, user.id);
      existingPhoneIndex = allocated.index + 1;
      phoneNormalized = allocated.normalized;
      phoneDisplay = allocated.display;
      row.phoneAction = "assign";
      report.phonesAssigned += 1;
      if (!dryRun) {
        // Prefer demo-church org for staff phone registry when user has a role there;
        // otherwise first legacy org from user_roles.
        const orgRow = await db.query(
          `SELECT organization_id FROM blessboard.user_roles
            WHERE user_id = $1 AND status = 'active'
            ORDER BY CASE WHEN organization_id = $2 THEN 0 ELSE 1 END
            LIMIT 1`,
          [user.id, demo.org.id]
        );
        const organizationId = (orgRow.rows[0] && orgRow.rows[0].organization_id) || demo.org.id;
        await upsertUserPhone(db, {
          userId: user.id,
          organizationId,
          phoneNormalized,
          phoneDisplay,
        });
      }
    } else if (row.phoneAction === "normalize" && !dryRun) {
      const orgRow = await db.query(
        `SELECT organization_id FROM blessboard.user_roles
          WHERE user_id = $1 AND status = 'active' LIMIT 1`,
        [user.id]
      );
      const organizationId = (orgRow.rows[0] && orgRow.rows[0].organization_id) || demo.org.id;
      await upsertUserPhone(db, {
        userId: user.id,
        organizationId,
        phoneNormalized,
        phoneDisplay,
      });
      report.phonesAssigned += 1;
    }

    row.phone = phoneNormalized;

    if (resetPasswords && String(user.status) === "active") {
      if (dryRun) {
        row.passwordReset = "dry_run_would_reset";
      } else {
        const reset = await resetBlessBoardUserPassword(
          db,
          {
            email: user.email_normalized,
            password,
            dryRun: false,
            deploymentCode,
          },
          { manageTransaction: true }
        );
        if (reset.ok) {
          await db.query(
            `UPDATE blessboard.users
                SET password_change_required = false,
                    sign_in_locked_until = NULL,
                    updated_at = now()
              WHERE id = $1`,
            [user.id]
          );
          row.passwordReset = "reset";
          report.passwordsReset += 1;
        } else {
          row.passwordReset = `failed:${reset.status || reset.message}`;
        }
      }
    }

    if (!dryRun && row.passwordReset === "reset" && row.phone) {
      const isPlatform = (user.legacy_roles || []).includes("platform_admin");
      let orgForLogin = null;
      if (!isPlatform) {
        const orgRow = await db.query(
          `SELECT organization_id FROM blessboard.user_roles
            WHERE user_id = $1 AND status = 'active'
            ORDER BY CASE WHEN organization_id = $2 THEN 0 ELSE 1 END
            LIMIT 1`,
          [user.id, demo.org.id]
        );
        orgForLogin = orgRow.rows[0] ? orgRow.rows[0].organization_id : demo.org.id;
      }
      row.login = await verifyLogin(db, {
        email: user.email_normalized,
        phone: row.phone,
        password,
        deploymentCode,
        organizationId: orgForLogin,
      });
    }

    report.existingUsers.push(row);
  }

  // Actor for assignment events: prefer platform admin test user
  let actorUserId = null;
  const platformAdmin = await authRepo.findUserByEmail(db, "platform-admin@example.test");
  if (platformAdmin) actorUserId = platformAdmin.id;

  // --- Create missing catalogue QA users ---
  let qaPhoneIndex = QA_PHONE_START;
  for (const role of humanAssignable) {
    const email = qaEmailForRole(role.roleKey);
    const plan = resolveQaAssignmentPlan(role.roleKey, role.roleCategory);
    let user = await authRepo.findUserByEmail(db, email);
    let created = false;

    let phoneNorm = null;
    if (user && user.phone_normalized) {
      const existingPhone = normalizeRegistrationPhone(user.phone_normalized, "ZM");
      if (existingPhone.ok) phoneNorm = existingPhone;
    }
    if (!phoneNorm) {
      const allocated = await allocateFreeQaPhone(db, qaPhoneIndex, user ? user.id : null);
      qaPhoneIndex = allocated.index + 1;
      phoneNorm = { ok: true, normalized: allocated.normalized, display: allocated.display };
    }

    if (user) {
      if (!dryRun) {
        if (!user.phone_normalized || user.phone_normalized !== phoneNorm.normalized) {
          await upsertUserPhone(db, {
            userId: user.id,
            organizationId: demo.org.id,
            phoneNormalized: phoneNorm.normalized,
            phoneDisplay: phoneNorm.display,
          });
          report.phonesAssigned += 1;
        } else {
          report.phonesKept += 1;
        }
        if (resetPasswords && String(user.status) === "active") {
          await resetBlessBoardUserPassword(
            db,
            { email, password, dryRun: false, deploymentCode },
            { manageTransaction: true }
          );
          await db.query(
            `UPDATE blessboard.users
                SET password_change_required = false,
                    sign_in_locked_until = NULL,
                    updated_at = now()
              WHERE id = $1`,
            [user.id]
          );
          report.passwordsReset += 1;
        }
      }
    } else {
      if (dryRun) {
        report.createdUsers.push({
          roleKey: role.roleKey,
          email,
          phone: phoneNorm.normalized,
          status: "dry_run_would_create",
          legacyBaseline: plan.legacyRoleKey,
          catalogueScope: plan.catalogueScopeType,
        });
        continue;
      }
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const createdUser = await createBlessBoardUser(
        db,
        {
          email,
          displayName: qaDisplayName(role.displayName),
          passwordHash,
        },
        { manageTransaction: true }
      );
      if (!createdUser.ok && createdUser.status !== "already_exists") {
        return {
          ok: false,
          code: RESULT.EMAIL_CONFLICT,
          message: createdUser.message || createdUser.status,
          failedRole: role.roleKey,
          identity: envGate.identity,
        };
      }
      user = await authRepo.findUserByEmail(db, email);
      if (!user) {
        return {
          ok: false,
          code: RESULT.EMAIL_CONFLICT,
          message: "user_create_failed",
          failedRole: role.roleKey,
        };
      }
      await upsertUserPhone(db, {
        userId: user.id,
        organizationId: demo.org.id,
        phoneNormalized: phoneNorm.normalized,
        phoneDisplay: phoneNorm.display,
      });
      created = true;
      report.usersCreated += 1;
      report.phonesAssigned += 1;
    }

    // Baseline legacy role
    const assignInput = {
      email,
      organizationKey: DEMO_ORGANIZATION_KEY,
      roleKey: plan.legacyRoleKey,
      churchKey: plan.legacyRoleKey === "platform_admin" ? null : DEMO_CHURCH_KEY,
      branchKey: plan.legacyRoleKey === "branch_admin" ? plan.branchKey : null,
      dryRun: false,
    };
    const legacyAssign = await assignBlessBoardRole(db, assignInput, {
      manageTransaction: true,
    });
    if (!legacyAssign.ok && legacyAssign.status !== "already_assigned") {
      return {
        ok: false,
        code: "legacy_role_assign_failed",
        message: legacyAssign.message || legacyAssign.status,
        failedRole: role.roleKey,
      };
    }

    let scopeId = null;
    if (plan.catalogueScopeType === "church") scopeId = demo.church.id;
    if (plan.catalogueScopeType === "organisation") scopeId = demo.org.id;
    if (plan.catalogueScopeType === "branch") {
      if (!demo.campus) {
        return {
          ok: false,
          code: RESULT.DEMO_NOT_FOUND,
          message: "demo_campus_branch_missing",
        };
      }
      scopeId = demo.campus.id;
    }

    const catAssign = await ensureCatalogueAssignment(db, {
      userId: user.id,
      organizationId: demo.org.id,
      churchId: demo.church.id,
      roleKey: role.roleKey,
      scopeType: plan.catalogueScopeType,
      scopeId,
      actorUserId,
      dryRun: false,
    });
    if (!catAssign.ok) {
      return {
        ok: false,
        code: "catalogue_assign_failed",
        message: catAssign.reason,
        failedRole: role.roleKey,
      };
    }
    if (catAssign.status === "assigned") report.roleAssignmentsCreated += 1;

    const login = await verifyLogin(db, {
      email,
      phone: phoneNorm.normalized,
      password,
      deploymentCode,
      organizationId: demo.org.id,
    });

    const tenantContext = {
      resolved: true,
      organization: { id: demo.org.id },
      church: { id: demo.church.id },
      primaryBranch: demo.hq ? { id: demo.hq.id } : null,
    };
    const effective = await listEffectivePermissions(db, {
      actor: { userId: user.id },
      tenantContext,
      resourceContext: {
        organizationId: demo.org.id,
        churchId: demo.church.id,
        branchId: plan.catalogueScopeType === "branch" ? scopeId : null,
      },
    });

    const entry = {
      roleKey: role.roleKey,
      displayName: role.displayName,
      email,
      phone: phoneNorm.normalized,
      name: qaDisplayName(role.displayName),
      created,
      legacyBaseline: plan.legacyRoleKey,
      baselineReason: plan.baselineReason,
      catalogueScope: plan.catalogueScopeType,
      permissionCount: (effective.permissions || []).length,
      login,
      LOGIN_READY: login.LOGIN_READY === true,
    };
    report.createdUsers.push(entry);
    report.verifications.push(entry);
  }

  // Coverage matrix
  for (const legacy of LEGACY_LOGIN_ROLES) {
    const holders = existingRoleUsers.filter((u) =>
      (u.legacy_roles || []).includes(legacy.roleKey)
    );
    const qa = holders[0] || null;
    const matchedExisting = report.existingUsers.find(
      (u) => qa && u.email === qa.email_normalized
    );
    report.coverage.push({
      roleKey: legacy.roleKey,
      humanAssignable: true,
      kind: "legacy_login",
      qaUser: qa ? qa.email_normalized : null,
      phone: matchedExisting ? matchedExisting.phone : qa && qa.phone_normalized,
      email: qa ? qa.email_normalized : null,
      loginReady: matchedExisting && matchedExisting.login
        ? matchedExisting.login.LOGIN_READY
        : null,
      permissionCount: null,
    });
  }

  for (const role of humanAssignable) {
    const created = report.createdUsers.find((u) => u.roleKey === role.roleKey);
    report.coverage.push({
      roleKey: role.roleKey,
      humanAssignable: true,
      kind: "catalogue",
      qaUser: created ? created.email : qaEmailForRole(role.roleKey),
      phone: created ? created.phone : null,
      email: created ? created.email : qaEmailForRole(role.roleKey),
      loginReady: created ? created.LOGIN_READY : dryRun ? null : false,
      permissionCount: role.permissionCount,
    });
  }

  for (const role of excluded) {
    report.coverage.push({
      roleKey: role.roleKey,
      humanAssignable: false,
      kind: "excluded",
      classification: role.classification,
      qaUser: null,
      phone: null,
      email: null,
      loginReady: null,
      permissionCount: role.permissionCount,
    });
  }

  const afterUsers = dryRun ? existingRoleUsers : await listUsersWithBlessBoardRoles(db);
  report.afterCounts = {
    roleUsers: afterUsers.length,
    withPhone: afterUsers.filter((u) => u.phone_normalized).length,
    withoutPhone: afterUsers.filter((u) => !u.phone_normalized).length,
  };

  const loginReadyCount = report.coverage.filter(
    (c) => c.humanAssignable && c.kind === "catalogue" && c.loginReady === true
  ).length;
  report.loginReadyCatalogueCount = loginReadyCount;
  report.humanAssignableCatalogueCount = humanAssignable.length;
  report.legacyLoginReadyCount = report.coverage.filter(
    (c) => c.kind === "legacy_login" && c.loginReady === true
  ).length;

  if (!dryRun) {
    const catalogueNotReady = report.coverage.filter(
      (c) => c.humanAssignable && c.kind === "catalogue" && c.loginReady !== true
    );
    if (catalogueNotReady.length) {
      report.ok = false;
      report.code = "LOGIN_READY_INCOMPLETE";
      report.message = `catalogue_login_ready ${loginReadyCount}/${humanAssignable.length}`;
      report.notReady = catalogueNotReady.map((c) => c.roleKey);
    }
  }

  return report;
}

module.exports = {
  RESULT,
  ALLOWED_SEED_ENVIRONMENTS,
  QA_PHONE_DELIVERY_NOTE,
  seedBlessBoardQaRoleUsers,
  assertSafeQaEnvironment,
  listCatalogueRoles,
  classifyCatalogueRole,
  QA_PASSWORD,
};
