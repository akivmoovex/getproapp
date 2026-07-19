"use strict";

/**
 * Idempotent BlessBoard V5 test-user seed (non-production only).
 *
 * Canonical staff roles come from blessboard.user_roles CHECK + assignBlessBoardRole.
 * Member access is a separate identity (blessboard.members + memberships), not a role_key.
 * ministry_leader is not a V5 login role (deferred; see migration 022).
 *
 * Temporary shared testing password is hashed via bcrypt; plaintext is never stored.
 * Length below createBlessBoardUser policy is intentional for fixtures — uses passwordHash path.
 */

const bcrypt = require("bcryptjs");
const { provisionPlatformTenant } = require("../../platform/services/provisionPlatformTenant");
const { assignOrganizationPlan } = require("../../platform/services/entitlementService");
const { provisionBlessBoardChurch } = require("./provisionBlessBoardChurch");
const { createBlessBoardBranch } = require("./createBlessBoardBranch");
const {
  createBlessBoardUser,
  normalizeEmail,
  BCRYPT_ROUNDS,
} = require("./createBlessBoardUser");
const { assignBlessBoardRole } = require("./assignBlessBoardRole");
const authRepo = require("../repositories/blessBoardAuthRepository");
const catalogueRepo = require("../repositories/blessBoardCatalogueRepository");
const memberRepo = require("../repositories/memberIdentityRepository");
const {
  openProvisioningSession,
  resolveManageTransactionOption,
} = require("../../platform/db/provisioningTransaction");

const STATUS = Object.freeze({
  OK: "ok",
  DRY_RUN: "dry_run",
  REFUSED_PRODUCTION: "refused_production",
  REFUSED_ENVIRONMENT: "refused_environment",
  INVALID_INPUT: "invalid_input",
  TRANSACTION_ERROR: "transaction_error",
  PROVISION_ERROR: "provision_error",
});

/** Temporary shared testing password — testing only; never for production. */
const TEST_PASSWORD = "12345678";

const PRODUCTION_OVERRIDE_ENV = "BLESSBOARD_ALLOW_TEST_USERS_IN_PRODUCTION";

/**
 * user_roles.role_key values enforced by DB CHECK and assignBlessBoardRole.
 * @type {readonly string[]}
 */
const USER_ROLE_KEYS = Object.freeze(["platform_admin", "church_hq_admin", "branch_admin"]);

/**
 * Access personas provisioned by this seed (staff roles + member identity).
 * @type {readonly string[]}
 */
const CANONICAL_PERSONA_KEYS = Object.freeze([
  "platform_admin",
  "church_hq_admin",
  "branch_admin",
  "member",
]);

/**
 * Roles known in product conversation but not creatable as V5 login roles.
 * @type {readonly { key: string, reason: string }[]}
 */
const UNSUPPORTED_LOGIN_ROLES = Object.freeze([
  {
    key: "ministry_leader",
    reason:
      "V5 has no ministry_leader login role (leader recommendation deferred; blessboard.leaders is CMS-only).",
  },
]);

const FIXTURE = Object.freeze({
  organizationKey: "automated-test-church",
  organizationDisplayName: "BlessBoard Automated Test Church",
  churchKey: "automated-test-church",
  churchDisplayName: "BlessBoard Automated Test Church",
  dataEnvironment: "testing",
  hqBranchKey: "hq",
  hqBranchName: "Headquarters",
  campusBranchKey: "test-main",
  campusBranchName: "Test Main Branch",
  hostname: "automated-test.blessboard.test",
  productTenantKey: "automated-test-church",
  deploymentCode: "blessboard-org-v5",
  planKey: "growth",
});

const PERSONAS = Object.freeze([
  {
    key: "platform_admin",
    kind: "staff_role",
    roleKey: "platform_admin",
    email: "platform-admin@example.test",
    displayName: "Platform Admin Test",
    portal: "Apex /admin",
    scope: { churchKey: null, branchKey: null },
  },
  {
    key: "church_hq_admin",
    kind: "staff_role",
    roleKey: "church_hq_admin",
    email: "church-hq-admin@example.test",
    displayName: "Church HQ Admin Test",
    portal: "Tenant /hq",
    scope: { churchKey: FIXTURE.churchKey, branchKey: null },
  },
  {
    key: "branch_admin",
    kind: "staff_role",
    roleKey: "branch_admin",
    email: "branch-admin@example.test",
    displayName: "Branch Admin Test",
    portal: "Tenant /branch-admin (test-main)",
    scope: { churchKey: FIXTURE.churchKey, branchKey: FIXTURE.campusBranchKey },
  },
  {
    key: "member",
    kind: "member_identity",
    roleKey: null,
    email: "member@example.test",
    displayName: "Member Test",
    portal: "Tenant /member",
    // Primary membership on HQ so tenant hostname (primary branch) grants /member.
    scope: { churchKey: FIXTURE.churchKey, branchKey: FIXTURE.hqBranchKey },
  },
]);

/**
 * Discover canonical V5 roles / personas for reporting (no DB).
 */
function discoverCanonicalRoles() {
  return {
    userRoleKeys: [...USER_ROLE_KEYS],
    personas: CANONICAL_PERSONA_KEYS.slice(),
    unsupportedLoginRoles: UNSUPPORTED_LOGIN_ROLES.map((r) => ({ ...r })),
    sources: [
      "db/migrations/blessboard/005_create_user_roles.sql (role_key CHECK)",
      "src/blessboard/services/assignBlessBoardRole.js (ROLE_KEYS)",
      "src/blessboard/services/authorizeBlessBoardTenantAccess.js",
      "db/migrations/blessboard/020_create_members_memberships_registrations.sql",
      "db/migrations/blessboard/022_create_participation.sql (ministry_leader deferred)",
    ],
  };
}

/**
 * Environment gate for creating weak shared test passwords.
 * @param {NodeJS.ProcessEnv} [env]
 */
function evaluateTestUserEnvironment(env) {
  const e = env && typeof env === "object" ? env : process.env;
  const nodeEnv = String(e.NODE_ENV || "")
    .trim()
    .toLowerCase();
  const deploymentEnv = String(e.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  const allowTestUsers = String(e.BLESSBOARD_ALLOW_TEST_USERS || "")
    .trim()
    .toLowerCase() === "true";
  const productionOverride =
    String(e[PRODUCTION_OVERRIDE_ENV] || "")
      .trim()
      .toLowerCase() === "true";

  if (nodeEnv === "production" && !productionOverride) {
    return {
      ok: false,
      status: STATUS.REFUSED_PRODUCTION,
      message: "refused_production",
      detail: `NODE_ENV=production requires ${PRODUCTION_OVERRIDE_ENV}=true (not enabled by default).`,
    };
  }

  const nonProductionSignal =
    nodeEnv === "test" || deploymentEnv === "testing" || allowTestUsers || productionOverride;

  if (!nonProductionSignal) {
    return {
      ok: false,
      status: STATUS.REFUSED_ENVIRONMENT,
      message: "refused_environment",
      detail:
        "Require NODE_ENV=test, DEPLOYMENT_ENV=testing, or BLESSBOARD_ALLOW_TEST_USERS=true.",
    };
  }

  return {
    ok: true,
    nodeEnv,
    deploymentEnv,
    allowTestUsers,
    productionOverride,
  };
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function outputContainsSecrets(text) {
  const s = String(text || "");
  if (/postgres(ql)?:\/\//i.test(s)) return true;
  // bcrypt modular crypt: $2a$/$2b$/$2y$ + cost + 22-char salt + 31-char hash
  if (/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/.test(s)) return true;
  if (/password_hash/i.test(s) && /\$2[aby]\$/.test(s)) return true;
  if (/session[_-]?secret|csrf|api[_-]?key/i.test(s) && /[=:]\s*\S{8,}/i.test(s)) return true;
  return false;
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {object} [input]
 * @param {{ manageTransaction?: boolean }} [options]
 */
async function seedBlessBoardTestUsers(db, input, options) {
  const raw = input && typeof input === "object" ? input : {};
  const dryRun = Boolean(raw.dryRun);
  const resetPasswords = Boolean(raw.resetPasswords);
  const envCheck = evaluateTestUserEnvironment(raw.env || process.env);
  if (!envCheck.ok) {
    return {
      ok: false,
      status: envCheck.status,
      message: envCheck.message,
      detail: envCheck.detail,
      dryRun,
      discovered: discoverCanonicalRoles(),
      plan: null,
      result: null,
    };
  }

  const discovered = discoverCanonicalRoles();
  const plan = {
    organization: {
      key: FIXTURE.organizationKey,
      displayName: FIXTURE.organizationDisplayName,
      environment: FIXTURE.dataEnvironment,
      hostname: FIXTURE.hostname,
      planKey: FIXTURE.planKey,
    },
    branches: [
      { key: FIXTURE.hqBranchKey, name: FIXTURE.hqBranchName, type: "hq" },
      { key: FIXTURE.campusBranchKey, name: FIXTURE.campusBranchName, type: "branch" },
    ],
    users: PERSONAS.map((p) => ({
      key: p.key,
      email: normalizeEmail(p.email),
      displayName: p.displayName,
      kind: p.kind,
      roleKey: p.roleKey,
      portal: p.portal,
    })),
    unsupported: discovered.unsupportedLoginRoles,
    resetPasswords,
  };

  // --- inspect existing state (read-only for dry-run preview) ---
  const organization = await authRepo.findOrganizationByKey(db, FIXTURE.organizationKey);
  let church = null;
  let hqBranch = null;
  let campusBranch = null;
  if (organization) {
    church = await catalogueRepo.findChurchByKey(db, FIXTURE.churchKey);
    if (church) {
      hqBranch = await catalogueRepo.findHqBranch(db, church.id);
      campusBranch = await catalogueRepo.findBranchByChurchAndKey(
        db,
        church.id,
        FIXTURE.campusBranchKey
      );
    }
  }

  const userPlans = [];
  for (const persona of PERSONAS) {
    const email = normalizeEmail(persona.email);
    const existing = await authRepo.findUserByEmail(db, email);
    let roleExists = false;
    let memberExists = false;
    if (existing && persona.kind === "staff_role" && organization) {
      if (persona.roleKey === "platform_admin") {
        const pa = await authRepo.findRole(db, {
          userId: existing.id,
          organizationId: organization.id,
          churchId: null,
          branchId: null,
          roleKey: "platform_admin",
        });
        roleExists = Boolean(pa && String(pa.status) === "active");
      } else if (persona.roleKey === "church_hq_admin" && church) {
        const hq = await authRepo.findRole(db, {
          userId: existing.id,
          organizationId: organization.id,
          churchId: church.id,
          branchId: null,
          roleKey: "church_hq_admin",
        });
        roleExists = Boolean(hq && String(hq.status) === "active");
      } else if (persona.roleKey === "branch_admin" && church && campusBranch) {
        const ba = await authRepo.findRole(db, {
          userId: existing.id,
          organizationId: organization.id,
          churchId: church.id,
          branchId: campusBranch.id,
          roleKey: "branch_admin",
        });
        roleExists = Boolean(ba && String(ba.status) === "active");
      }
    }
    if (existing && persona.kind === "member_identity" && church && hqBranch) {
      const member = await memberRepo.findActiveMemberByUserId(db, {
        churchId: church.id,
        userId: existing.id,
      });
      if (member) {
        const membership = await memberRepo.findMembership(db, member.id, hqBranch.id);
        memberExists =
          Boolean(membership) && membership.membershipStatus === "active";
      }
    }
    userPlans.push({
      key: persona.key,
      email,
      displayName: persona.displayName,
      userAction: existing ? "reuse" : "create",
      roleAction:
        persona.kind === "staff_role"
          ? roleExists
            ? "already_assigned"
            : "assign"
          : null,
      memberAction:
        persona.kind === "member_identity"
          ? memberExists
            ? "already_linked"
            : "link_member"
          : null,
      passwordAction: existing && resetPasswords ? "reset" : existing ? "unchanged" : "set",
      portal: persona.portal,
    });
  }

  const infraPlan = {
    organization: organization ? "reuse" : "create",
    church: church ? "reuse" : "create",
    hqBranch: hqBranch ? "reuse" : "create",
    campusBranch: campusBranch ? "reuse" : "create",
    planUpgrade: "ensure_growth",
  };

  if (dryRun) {
    return {
      ok: true,
      status: STATUS.DRY_RUN,
      message: "dry_run",
      dryRun: true,
      discovered,
      plan,
      preview: {
        infrastructure: infraPlan,
        users: userPlans,
        writes: false,
      },
      result: null,
      warning:
        "TEMPORARY SHARED TESTING PASSWORD — testing only; replace or delete these accounts before production.",
    };
  }

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

  // --- writes ---
  const created = {
    organization: false,
    church: false,
    hqBranch: false,
    campusBranch: false,
    users: [],
    roles: [],
    members: [],
    passwordsReset: [],
  };

  const orgProv = await provisionPlatformTenant(db, {
    organizationKey: FIXTURE.organizationKey,
    displayName: FIXTURE.organizationDisplayName,
    legalName: null,
    dataEnvironment: FIXTURE.dataEnvironment,
    productKey: "blessboard",
    productTenantKey: FIXTURE.productTenantKey,
    hostname: FIXTURE.hostname,
    domainType: "canonical",
    deploymentCode: FIXTURE.deploymentCode,
    isPrimary: true,
  });
  if (!orgProv.ok) {
    return {
      ok: false,
      status: STATUS.PROVISION_ERROR,
      message: `organization:${orgProv.message || orgProv.status}`,
      dryRun: false,
      discovered,
      plan,
      result: null,
    };
  }
  created.organization = Boolean(orgProv.created && orgProv.created.organization);
  const orgRecord = orgProv.records && orgProv.records.organization;
  if (!orgRecord) {
    return {
      ok: false,
      status: STATUS.PROVISION_ERROR,
      message: "organization_missing_after_provision",
      dryRun: false,
      discovered,
      plan,
      result: null,
    };
  }

  const planAssign = await assignOrganizationPlan(db, {
    organizationId: orgRecord.id,
    productKey: "blessboard",
    planKey: FIXTURE.planKey,
  });
  if (!planAssign.ok) {
    return {
      ok: false,
      status: STATUS.PROVISION_ERROR,
      message: `plan:${planAssign.reason || planAssign.status}`,
      dryRun: false,
      discovered,
      plan,
      result: null,
    };
  }

  const churchProv = await provisionBlessBoardChurch(db, {
    organizationKey: FIXTURE.organizationKey,
    churchKey: FIXTURE.churchKey,
    displayName: FIXTURE.churchDisplayName,
    legalName: null,
    dataEnvironment: FIXTURE.dataEnvironment,
    hqBranchKey: FIXTURE.hqBranchKey,
    hqBranchDisplayName: FIXTURE.hqBranchName,
  });
  if (!churchProv.ok) {
    return {
      ok: false,
      status: STATUS.PROVISION_ERROR,
      message: `church:${churchProv.message || churchProv.status}`,
      dryRun: false,
      discovered,
      plan,
      result: null,
    };
  }
  created.church = Boolean(churchProv.created && churchProv.created.church);
  created.hqBranch = Boolean(churchProv.created && churchProv.created.hqBranch);
  const churchRecord = churchProv.records && churchProv.records.church;
  const hqRecord = churchProv.records && churchProv.records.hqBranch;
  if (!churchRecord || !hqRecord) {
    return {
      ok: false,
      status: STATUS.PROVISION_ERROR,
      message: "church_or_hq_missing_after_provision",
      dryRun: false,
      discovered,
      plan,
      result: null,
    };
  }

  let campus = await catalogueRepo.findBranchByChurchAndKey(
    db,
    churchRecord.id,
    FIXTURE.campusBranchKey
  );
  if (!campus) {
    const branchCreate = await createBlessBoardBranch(db, {
      churchId: churchRecord.id,
      organizationId: orgRecord.id,
      branchKey: FIXTURE.campusBranchKey,
      displayName: FIXTURE.campusBranchName,
      timezone: "UTC",
      countryCode: null,
    });
    if (!branchCreate.ok) {
      return {
        ok: false,
        status: STATUS.PROVISION_ERROR,
        message: `branch:${branchCreate.reason || branchCreate.status}`,
        dryRun: false,
        discovered,
        plan,
        result: null,
      };
    }
    campus = branchCreate.branch;
    created.campusBranch = true;
  }

  const resolved = resolveManageTransactionOption(db, options);
  if (!resolved.ok) {
    return {
      ok: false,
      status: STATUS.TRANSACTION_ERROR,
      message: resolved.message,
      dryRun: false,
      discovered,
      plan,
      result: null,
    };
  }

  let session = null;
  try {
    session = await openProvisioningSession(resolved);
    const client = session.client;

    for (const persona of PERSONAS) {
      const email = normalizeEmail(persona.email);
      let user = await authRepo.findUserByEmail(client, email);
      if (!user) {
        const createdUser = await createBlessBoardUser(
          client,
          {
            email,
            displayName: persona.displayName,
            passwordHash,
          },
          { manageTransaction: false }
        );
        if (!createdUser.ok) {
          await session.rollbackIfManaged();
          return {
            ok: false,
            status: STATUS.PROVISION_ERROR,
            message: `user:${createdUser.message || createdUser.status}`,
            dryRun: false,
            discovered,
            plan,
            result: null,
          };
        }
        user = {
          id: createdUser.user.id,
          email_normalized: createdUser.user.email,
          display_name: createdUser.user.displayName,
          status: createdUser.user.status,
        };
        created.users.push(email);
      } else if (resetPasswords) {
        await authRepo.updateUserPasswordHash(client, user.id, passwordHash);
        created.passwordsReset.push(email);
      }

      if (persona.kind === "staff_role") {
        const assignInput = {
          email,
          organizationKey: FIXTURE.organizationKey,
          roleKey: persona.roleKey,
          churchKey: persona.scope.churchKey,
          branchKey: persona.scope.branchKey,
        };
        const assigned = await assignBlessBoardRole(client, assignInput, {
          manageTransaction: false,
        });
        if (!assigned.ok) {
          await session.rollbackIfManaged();
          return {
            ok: false,
            status: STATUS.PROVISION_ERROR,
            message: `role:${assigned.message || assigned.status}`,
            dryRun: false,
            discovered,
            plan,
            result: null,
          };
        }
        if (assigned.status === "assigned") {
          created.roles.push({ email, roleKey: persona.roleKey });
        }
      }

      if (persona.kind === "member_identity") {
        let member = await memberRepo.findActiveMemberByUserId(client, {
          churchId: churchRecord.id,
          userId: user.id,
        });
        if (!member) {
          const existingByEmail = await memberRepo.findLiveMemberByEmail(
            client,
            churchRecord.id,
            email
          );
          if (existingByEmail) {
            if (!existingByEmail.userId) {
              member = await memberRepo.updateMemberUserId(client, {
                memberId: existingByEmail.id,
                userId: user.id,
              });
            } else {
              member = existingByEmail;
            }
            if (member && String(member.status) !== "active") {
              member = await memberRepo.updateMemberStatus(client, {
                memberId: member.id,
                status: "active",
              });
            }
          } else {
            const parts = String(persona.displayName).split(/\s+/);
            const firstName = parts[0] || "Member";
            const lastName = parts.slice(1).join(" ") || "Test";
            member = await memberRepo.insertMember(client, {
              churchId: churchRecord.id,
              userId: user.id,
              firstName,
              lastName,
              preferredName: persona.displayName,
              emailNormalized: email,
              emailDisplay: email,
              phoneNormalized: null,
              phoneDisplay: null,
              status: "active",
            });
            created.members.push(email);
          }
        }
        if (!member) {
          await session.rollbackIfManaged();
          return {
            ok: false,
            status: STATUS.PROVISION_ERROR,
            message: "member_create_failed",
            dryRun: false,
            discovered,
            plan,
            result: null,
          };
        }
        let membership = await memberRepo.findMembership(client, member.id, hqRecord.id);
        if (!membership) {
          membership = await memberRepo.insertMembership(client, {
            memberId: member.id,
            branchId: hqRecord.id,
            membershipStatus: "active",
            isPrimary: true,
            joinedAt: new Date().toISOString(),
          });
        } else if (membership.membershipStatus !== "active") {
          await client.query(
            `UPDATE blessboard.member_branch_memberships
                SET membership_status = 'active', updated_at = now()
              WHERE id = $1`,
            [membership.id]
          );
        }
      }
    }

    await session.commitIfManaged();
  } catch (err) {
    if (session) await session.safeRollbackOnError();
    return {
      ok: false,
      status: STATUS.TRANSACTION_ERROR,
      message: "transaction_error",
      detail: err && err.message ? String(err.message) : "error",
      dryRun: false,
      discovered,
      plan,
      result: null,
    };
  } finally {
    if (session) session.releaseIfOwned();
  }

  const loginTable = PERSONAS.map((p) => ({
    role: p.key,
    email: normalizeEmail(p.email),
    temporaryPassword: TEST_PASSWORD,
    expectedPortal: p.portal,
  }));

  return {
    ok: true,
    status: STATUS.OK,
    message: "seeded",
    dryRun: false,
    discovered,
    plan,
    result: {
      organizationKey: FIXTURE.organizationKey,
      churchKey: FIXTURE.churchKey,
      hqBranchKey: FIXTURE.hqBranchKey,
      campusBranchKey: FIXTURE.campusBranchKey,
      hostname: FIXTURE.hostname,
      created,
      loginTable,
    },
    warning:
      "TEMPORARY SHARED TESTING PASSWORD (12345678) — testing only; replace or delete these accounts before production launch.",
  };
}

module.exports = {
  STATUS,
  TEST_PASSWORD,
  PRODUCTION_OVERRIDE_ENV,
  USER_ROLE_KEYS,
  CANONICAL_PERSONA_KEYS,
  UNSUPPORTED_LOGIN_ROLES,
  FIXTURE,
  PERSONAS,
  discoverCanonicalRoles,
  evaluateTestUserEnvironment,
  outputContainsSecrets,
  seedBlessBoardTestUsers,
};
