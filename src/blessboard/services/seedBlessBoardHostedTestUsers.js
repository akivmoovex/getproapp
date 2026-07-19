"use strict";

/**
 * Hosted BlessBoard V5 test-user seed (operations).
 * Uses the real application pool (getPgPool) — never ephemeral/mocked DBs.
 *
 * Safety (all required for writes):
 *   DEPLOYMENT_ENV=testing
 *   BLESSBOARD_ALLOW_TEST_USERS=true
 *   DATABASE_IDENTITY_EXPECTED matches platform.database_identity
 *   --confirm
 *   fixture organization data_environment=testing
 *
 * Refuses DEPLOYMENT_ENV=production. NODE_ENV=production is allowed when the above hold.
 */

const bcrypt = require("bcryptjs");
const { provisionPlatformTenant } = require("../../platform/services/provisionPlatformTenant");
const { assignOrganizationPlan } = require("../../platform/services/entitlementService");
const { evaluateBranchCreateLimit } = require("../../platform/services/entitlementService");
const { provisionBlessBoardChurch } = require("./provisionBlessBoardChurch");
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
  checkDatabaseIdentity,
  validateIdentityKey,
} = require("../../../db/scripts/lib/databaseIdentity");
const {
  FIXTURE,
  PERSONAS,
  TEST_PASSWORD,
  discoverCanonicalRoles,
  outputContainsSecrets,
} = require("./seedBlessBoardTestUsers");

const STATUS = Object.freeze({
  OK: "ok",
  DRY_RUN: "dry_run",
  DIAGNOSE: "diagnose",
  REFUSED: "refused",
  MISSING_DATABASE_URL: "missing_database_url",
  MISSING_IDENTITY: "missing_identity",
  IDENTITY_MISMATCH: "identity_mismatch",
  MISSING_TABLES: "missing_tables",
  TRANSACTION_ERROR: "transaction_error",
  VERIFY_FAILED: "verify_failed",
  PROVISION_ERROR: "provision_error",
});

const EXPECTED_EMAILS = Object.freeze([
  "platform-admin@example.test",
  "church-hq-admin@example.test",
  "branch-admin@example.test",
  "member@example.test",
]);

/** Operational path always uses src/db/pg/pool (getPgPool) — never test helpers. */
const OPERATIONAL_POOL_MODULE = "src/db/pg/pool.js";

/**
 * Hosted safety gate (deployment purpose + allow flag — not NODE_ENV alone).
 * @param {NodeJS.ProcessEnv} [env]
 */
function evaluateHostedSeedSafety(env) {
  const e = env && typeof env === "object" ? env : process.env;
  const deploymentEnv = String(e.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  const allowTestUsers =
    String(e.BLESSBOARD_ALLOW_TEST_USERS || "")
      .trim()
      .toLowerCase() === "true";
  const nodeEnv = String(e.NODE_ENV || "")
    .trim()
    .toLowerCase();

  if (deploymentEnv === "production") {
    return {
      ok: false,
      status: STATUS.REFUSED,
      message: "refused_deployment_production",
      detail: "DEPLOYMENT_ENV=production forbids test-user seeding.",
    };
  }
  if (deploymentEnv !== "testing") {
    return {
      ok: false,
      status: STATUS.REFUSED,
      message: "refused_deployment_env",
      detail: "DEPLOYMENT_ENV=testing is required.",
    };
  }
  if (!allowTestUsers) {
    return {
      ok: false,
      status: STATUS.REFUSED,
      message: "refused_allow_flag",
      detail: "BLESSBOARD_ALLOW_TEST_USERS=true is required.",
    };
  }
  return { ok: true, deploymentEnv, allowTestUsers, nodeEnv };
}

/**
 * @param {{ query: Function }} db
 */
async function probeRuntimeIdentity(db) {
  const runtime = await db.query(`
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      inet_server_addr()::text AS server_address,
      inet_server_port() AS server_port,
      current_schema() AS current_schema
  `);
  const row = runtime.rows[0] || {};
  const regs = await db.query(`
    SELECT
      to_regclass('blessboard.users')::text AS users_table,
      to_regclass('blessboard.user_roles')::text AS user_roles_table,
      to_regclass('blessboard.organizations')::text AS blessboard_organizations_table,
      to_regclass('platform.organizations')::text AS platform_organizations_table,
      to_regclass('blessboard.churches')::text AS churches_table,
      to_regclass('blessboard.branches')::text AS branches_table,
      to_regclass('blessboard.members')::text AS members_table,
      to_regclass('platform.database_identity')::text AS database_identity_table
  `);
  const t = regs.rows[0] || {};
  const requiredOk = Boolean(
    t.users_table &&
      t.user_roles_table &&
      t.platform_organizations_table &&
      t.churches_table &&
      t.branches_table &&
      t.members_table &&
      t.database_identity_table
  );
  return {
    databaseName: row.database_name || null,
    databaseUser: row.database_user || null,
    serverAddressMasked: maskServerAddress(row.server_address),
    serverPort: row.server_port != null ? Number(row.server_port) : null,
    currentSchema: row.current_schema || null,
    tables: {
      "blessboard.users": Boolean(t.users_table),
      "blessboard.user_roles": Boolean(t.user_roles_table),
      "blessboard.organizations": Boolean(t.blessboard_organizations_table),
      "platform.organizations": Boolean(t.platform_organizations_table),
      "blessboard.churches": Boolean(t.churches_table),
      "blessboard.branches": Boolean(t.branches_table),
      "blessboard.members": Boolean(t.members_table),
      "platform.database_identity": Boolean(t.database_identity_table),
    },
    requiredTablesPresent: requiredOk,
    note:
      "Organizations live in platform.organizations (blessboard.organizations regclass is expected null).",
  };
}

function maskServerAddress(addr) {
  if (addr == null || addr === "") return "(null)";
  const s = String(addr);
  if (s.includes(":")) {
    // IPv6 — keep first hextet only
    const parts = s.split(":");
    return `${parts[0]}:***`;
  }
  const parts = s.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.***`;
  return s.length <= 4 ? "***" : `${s.slice(0, 2)}***`;
}

/**
 * @param {{ query: Function }} db
 * @param {string} expectedIdentityKey
 */
async function requireMatchingIdentity(db, expectedIdentityKey) {
  const keyCheck = validateIdentityKey(expectedIdentityKey);
  if (!keyCheck.ok) {
    return {
      ok: false,
      status: STATUS.MISSING_IDENTITY,
      message: "missing_or_invalid_DATABASE_IDENTITY_EXPECTED",
      expected: null,
      actual: null,
      match: false,
    };
  }
  const checked = await checkDatabaseIdentity(db, { identityKey: keyCheck.key });
  const actual = checked.row && checked.row.identity_key ? String(checked.row.identity_key) : null;
  if (!checked.ok) {
    return {
      ok: false,
      status:
        checked.code === "identity_key_mismatch" ? STATUS.IDENTITY_MISMATCH : STATUS.MISSING_IDENTITY,
      message: checked.message || checked.code,
      expected: keyCheck.key,
      actual,
      match: false,
      environmentCode: checked.row && checked.row.environment_code,
    };
  }
  return {
    ok: true,
    expected: keyCheck.key,
    actual,
    match: true,
    environmentCode: checked.row.environment_code,
    databaseName: checked.row.database_name,
    hostFingerprint: checked.row.host_fingerprint,
  };
}

/**
 * @param {{ query: Function }} db
 */
async function readFixtureSnapshot(db) {
  const users = await db.query(
    `SELECT email_normalized, status, display_name
       FROM blessboard.users
      WHERE email_normalized = ANY($1::text[])
      ORDER BY email_normalized`,
    [EXPECTED_EMAILS.slice()]
  );
  const org = await authRepo.findOrganizationByKey(db, FIXTURE.organizationKey);
  let church = null;
  let hq = null;
  let campus = null;
  if (org) {
    church = await catalogueRepo.findChurchByKey(db, FIXTURE.churchKey);
    if (church) {
      hq = await catalogueRepo.findHqBranch(db, church.id);
      campus = await catalogueRepo.findBranchByChurchAndKey(
        db,
        church.id,
        FIXTURE.campusBranchKey
      );
    }
  }
  const existingEmails = new Set(users.rows.map((r) => r.email_normalized));
  return {
    users: users.rows.map((r) => ({
      email: r.email_normalized,
      status: r.status,
      displayName: r.display_name,
    })),
    missingUsers: EXPECTED_EMAILS.filter((e) => !existingEmails.has(e)),
    organization: org
      ? {
          key: org.organization_key,
          status: org.status,
          dataEnvironment: org.data_environment,
        }
      : null,
    hqBranch: hq
      ? { key: hq.branch_key, status: hq.status, type: hq.branch_type }
      : null,
    campusBranch: campus
      ? { key: campus.branch_key, status: campus.status, type: campus.branch_type }
      : null,
  };
}

/**
 * @param {{ query: Function }} db
 */
async function verifyExpectedUsers(db) {
  const detail = await db.query(
    `SELECT
        u.id,
        u.display_name,
        u.email_normalized,
        u.status AS user_status,
        ur.role_key,
        ur.status AS role_status
       FROM blessboard.users u
       LEFT JOIN blessboard.user_roles ur
         ON ur.user_id = u.id AND ur.status = 'active'
      WHERE u.email_normalized = ANY($1::text[])
      ORDER BY u.email_normalized, ur.role_key`,
    [EXPECTED_EMAILS.slice()]
  );
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM blessboard.users
      WHERE email_normalized = ANY($1::text[])`,
    [EXPECTED_EMAILS.slice()]
  );
  const count = countRes.rows[0] ? Number(countRes.rows[0].n) : 0;
  const byEmail = {};
  for (const row of detail.rows) {
    const email = row.email_normalized;
    if (!byEmail[email]) {
      byEmail[email] = {
        id: row.id,
        displayName: row.display_name,
        status: row.user_status,
        roles: [],
      };
    }
    if (row.role_key) {
      byEmail[email].roles.push({ roleKey: row.role_key, status: row.role_status });
    }
  }
  const checks = {
    platform_admin:
      byEmail["platform-admin@example.test"] &&
      byEmail["platform-admin@example.test"].status === "active" &&
      byEmail["platform-admin@example.test"].roles.some((r) => r.roleKey === "platform_admin"),
    church_hq_admin:
      byEmail["church-hq-admin@example.test"] &&
      byEmail["church-hq-admin@example.test"].status === "active" &&
      byEmail["church-hq-admin@example.test"].roles.some((r) => r.roleKey === "church_hq_admin"),
    branch_admin:
      byEmail["branch-admin@example.test"] &&
      byEmail["branch-admin@example.test"].status === "active" &&
      byEmail["branch-admin@example.test"].roles.some((r) => r.roleKey === "branch_admin"),
    member:
      byEmail["member@example.test"] &&
      byEmail["member@example.test"].status === "active",
    countIsFour: count === 4,
  };
  const ok = Object.values(checks).every(Boolean);
  return { ok, count, checks, byEmail, rows: detail.rows.map(sanitizeVerifyRow) };
}

function sanitizeVerifyRow(row) {
  return {
    display_name: row.display_name,
    email_normalized: row.email_normalized,
    user_status: row.user_status,
    role_key: row.role_key,
    role_status: row.role_status,
    // id omitted from public logs by default — keep internal for service consumers
    id: row.id,
  };
}

/**
 * Insert campus branch without nested BEGIN/COMMIT (outer TX owns the connection).
 * @param {{ query: Function }} client
 */
async function ensureCampusBranchInTx(client, { churchId, organizationId }) {
  const existing = await catalogueRepo.findBranchByChurchAndKey(
    client,
    churchId,
    FIXTURE.campusBranchKey
  );
  if (existing) return { branch: existing, created: false };
  const gate = await evaluateBranchCreateLimit(client, { organizationId });
  if (!gate.ok) {
    const err = new Error(`branch_limit:${gate.reason || gate.status}`);
    err.code = "BRANCH_LIMIT";
    throw err;
  }
  const { rows } = await client.query(
    `INSERT INTO blessboard.branches
       (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
     VALUES ($1, $2, $3, 'branch', 'active', false, 'UTC', NULL)
     RETURNING id, church_id, branch_key, display_name, branch_type, status, is_primary`,
    [churchId, FIXTURE.campusBranchKey, FIXTURE.campusBranchName]
  );
  return { branch: rows[0], created: true };
}

/**
 * @param {{ query: Function }} client
 * @param {object} churchRecord
 * @param {object} campus
 * @param {string} passwordHash
 * @param {boolean} resetPasswords
 */
async function ensureUsersRolesMembersInTx(client, churchRecord, campus, passwordHash, resetPasswords) {
  const created = { users: [], roles: [], members: [], passwordsReset: [] };
  for (const persona of PERSONAS) {
    const email = normalizeEmail(persona.email);
    let user = await authRepo.findUserByEmail(client, email);
    if (!user) {
      const createdUser = await createBlessBoardUser(
        client,
        { email, displayName: persona.displayName, passwordHash },
        { manageTransaction: false }
      );
      if (!createdUser.ok) {
        throw Object.assign(new Error(createdUser.message || createdUser.status), {
          code: "USER_CREATE",
        });
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
      const assigned = await assignBlessBoardRole(
        client,
        {
          email,
          organizationKey: FIXTURE.organizationKey,
          roleKey: persona.roleKey,
          churchKey: persona.scope.churchKey,
          branchKey: persona.scope.branchKey,
        },
        { manageTransaction: false }
      );
      if (!assigned.ok) {
        throw Object.assign(new Error(assigned.message || assigned.status), { code: "ROLE_ASSIGN" });
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
          member = await memberRepo.insertMember(client, {
            churchId: churchRecord.id,
            userId: user.id,
            firstName: parts[0] || "Member",
            lastName: parts.slice(1).join(" ") || "Test",
            preferredName: persona.displayName,
            emailNormalized: email,
            emailDisplay: email,
            status: "active",
          });
          created.members.push(email);
        }
      }
      if (!member) throw Object.assign(new Error("member_create_failed"), { code: "MEMBER" });

      // Hosted fixture: membership on test-main (campus) as requested.
      let membership = await memberRepo.findMembership(client, member.id, campus.id);
      if (!membership) {
        const primaryCount = await memberRepo.countPrimaryMemberships(client, member.id);
        membership = await memberRepo.insertMembership(client, {
          memberId: member.id,
          branchId: campus.id,
          membershipStatus: "active",
          isPrimary: primaryCount === 0,
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
  return created;
}

/**
 * @param {import('pg').Pool} pool
 * @param {object} input
 */
async function runHostedTestUserSeed(pool, input) {
  const raw = input && typeof input === "object" ? input : {};
  const dryRun = Boolean(raw.dryRun);
  const diagnose = Boolean(raw.diagnose);
  const confirm = Boolean(raw.confirm);
  const resetPasswords = Boolean(raw.resetPasswords);
  const env = raw.env || process.env;
  const urlSourceName = String(raw.urlSourceName || "(unknown)");
  const expectedIdentity = String(env.DATABASE_IDENTITY_EXPECTED || "").trim();

  const safety = evaluateHostedSeedSafety(env);
  if (!safety.ok) {
    return {
      ok: false,
      status: safety.status,
      message: safety.message,
      detail: safety.detail,
      operationalPoolModule: OPERATIONAL_POOL_MODULE,
      writes: false,
    };
  }

  if (!pool || typeof pool.query !== "function") {
    return {
      ok: false,
      status: STATUS.MISSING_DATABASE_URL,
      message: "pool_required",
      detail: "Operational seed requires getPgPool() — no ephemeral/mock pool.",
      writes: false,
    };
  }

  const probe = await probeRuntimeIdentity(pool);
  const identity = await requireMatchingIdentity(pool, expectedIdentity);

  const baseMeta = {
    operationalPoolModule: OPERATIONAL_POOL_MODULE,
    repositoryImplementation: "real_v5_postgres",
    nodeEnv: safety.nodeEnv,
    deploymentEnv: safety.deploymentEnv,
    databaseUrlSource: urlSourceName,
    probe,
    identity: {
      expected: identity.expected,
      actual: identity.actual,
      match: identity.match,
      environmentCode: identity.environmentCode || null,
    },
    writes: false,
  };

  if (!probe.requiredTablesPresent) {
    return {
      ok: false,
      status: STATUS.MISSING_TABLES,
      message: "required_v5_tables_missing",
      ...baseMeta,
    };
  }

  if (!identity.ok) {
    return {
      ok: false,
      status: identity.status,
      message: identity.message,
      ...baseMeta,
    };
  }

  const snapshot = await readFixtureSnapshot(pool);
  if (snapshot.organization && String(snapshot.organization.dataEnvironment) !== "testing") {
    // Existing org with wrong env — refuse to attach test users to non-testing org
    if (confirm && !dryRun && !diagnose) {
      return {
        ok: false,
        status: STATUS.REFUSED,
        message: "organization_not_testing",
        detail: `Organization ${FIXTURE.organizationKey} data_environment must be testing.`,
        ...baseMeta,
        snapshot,
      };
    }
  }

  if (diagnose) {
    const totalUsers = await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.users`);
    return {
      ok: true,
      status: STATUS.DIAGNOSE,
      message: "diagnose",
      ...baseMeta,
      diagnose: {
        databaseReachable: true,
        totalV5Users: totalUsers.rows[0] ? Number(totalUsers.rows[0].n) : 0,
        expectedUsers: EXPECTED_EMAILS.map((email) => ({
          email,
          exists: snapshot.users.some((u) => u.email === email),
        })),
        organizationExists: Boolean(snapshot.organization),
        hqExists: Boolean(snapshot.hqBranch),
        campusExists: Boolean(snapshot.campusBranch),
        usesTestOrMockDb: false,
      },
      snapshot,
    };
  }

  if (dryRun || !confirm) {
    return {
      ok: true,
      status: STATUS.DRY_RUN,
      message: "dry_run",
      ...baseMeta,
      preview: {
        targetIdentity: identity.actual,
        existingUsers: snapshot.users,
        missingUsers: snapshot.missingUsers,
        organization: snapshot.organization,
        hqBranch: snapshot.hqBranch,
        campusBranch: snapshot.campusBranch,
        intended: {
          organization: snapshot.organization ? "reuse" : "create",
          hq: snapshot.hqBranch ? "reuse" : "create",
          campus: snapshot.campusBranch ? "reuse" : "create",
          users: snapshot.missingUsers.map((e) => ({ email: e, action: "create" })),
          roleAssignments: PERSONAS.filter((p) => p.kind === "staff_role").map((p) => p.roleKey),
          memberMembershipBranch: FIXTURE.campusBranchKey,
        },
        writes: false,
      },
    };
  }

  // --- confirmed write: single transaction ---
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
  const client = await pool.connect();
  let created = {
    organization: false,
    church: false,
    hqBranch: false,
    campusBranch: false,
    users: [],
    roles: [],
    members: [],
    passwordsReset: [],
  };
  let inTxVerify = null;
  try {
    await client.query("BEGIN");

    const orgProv = await provisionPlatformTenant(
      client,
      {
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
      },
      { manageTransaction: false }
    );
    if (!orgProv.ok) {
      throw Object.assign(new Error(`organization:${orgProv.message || orgProv.status}`), {
        code: "ORG",
      });
    }
    created.organization = Boolean(orgProv.created && orgProv.created.organization);
    const orgRecord = orgProv.records && orgProv.records.organization;
    if (!orgRecord) throw Object.assign(new Error("organization_missing"), { code: "ORG" });
    if (String(orgRecord.data_environment || orgRecord.dataEnvironment || FIXTURE.dataEnvironment) !==
      "testing") {
      // provisionPlatformTenant returns snake_case fields from DB
    }
    const orgEnvCheck = await client.query(
      `SELECT data_environment FROM platform.organizations WHERE id = $1`,
      [orgRecord.id]
    );
    if (
      !orgEnvCheck.rows[0] ||
      String(orgEnvCheck.rows[0].data_environment) !== "testing"
    ) {
      throw Object.assign(new Error("organization_not_testing"), { code: "ORG_ENV" });
    }

    const planAssign = await assignOrganizationPlan(client, {
      organizationId: orgRecord.id,
      productKey: "blessboard",
      planKey: FIXTURE.planKey,
    });
    if (!planAssign.ok) {
      throw Object.assign(new Error(`plan:${planAssign.reason || planAssign.status}`), {
        code: "PLAN",
      });
    }

    const churchProv = await provisionBlessBoardChurch(
      client,
      {
        organizationKey: FIXTURE.organizationKey,
        churchKey: FIXTURE.churchKey,
        displayName: FIXTURE.churchDisplayName,
        legalName: null,
        dataEnvironment: FIXTURE.dataEnvironment,
        hqBranchKey: FIXTURE.hqBranchKey,
        hqBranchDisplayName: FIXTURE.hqBranchName,
      },
      { manageTransaction: false }
    );
    if (!churchProv.ok) {
      throw Object.assign(new Error(`church:${churchProv.message || churchProv.status}`), {
        code: "CHURCH",
      });
    }
    created.church = Boolean(churchProv.created && churchProv.created.church);
    created.hqBranch = Boolean(churchProv.created && churchProv.created.hqBranch);
    const churchRecord = churchProv.records && churchProv.records.church;
    if (!churchRecord) throw Object.assign(new Error("church_missing"), { code: "CHURCH" });

    const campusResult = await ensureCampusBranchInTx(client, {
      churchId: churchRecord.id,
      organizationId: orgRecord.id,
    });
    created.campusBranch = campusResult.created;
    const campus = campusResult.branch;

    const userCreates = await ensureUsersRolesMembersInTx(
      client,
      churchRecord,
      campus,
      passwordHash,
      resetPasswords
    );
    created = { ...created, ...userCreates };

    inTxVerify = await verifyExpectedUsers(client);
    if (!inTxVerify.ok) {
      throw Object.assign(new Error("in_transaction_verify_failed"), { code: "VERIFY" });
    }

    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    const safeMessage = err && err.message ? String(err.message) : "transaction_error";
    return {
      ok: false,
      status: STATUS.TRANSACTION_ERROR,
      message: safeMessage,
      errorClass: err && err.code ? String(err.code) : err && err.name ? String(err.name) : "Error",
      ...baseMeta,
    };
  } finally {
    client.release();
  }

  // Fresh connection post-commit verification (must succeed)
  const fresh = await verifyExpectedUsers(pool);
  if (!fresh.ok) {
    return {
      ok: false,
      status: STATUS.VERIFY_FAILED,
      message: "post_commit_fresh_connection_verify_failed",
      ...baseMeta,
      inTxVerify: {
        count: inTxVerify.count,
        checks: inTxVerify.checks,
      },
      freshVerify: { count: fresh.count, checks: fresh.checks },
    };
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
    message: "seeded_and_verified",
    ...baseMeta,
    writes: true,
    result: {
      organizationKey: FIXTURE.organizationKey,
      hqBranchKey: FIXTURE.hqBranchKey,
      campusBranchKey: FIXTURE.campusBranchKey,
      hostname: FIXTURE.hostname,
      created,
      userCount: fresh.count,
      inTxVerify: { count: inTxVerify.count, checks: inTxVerify.checks },
      freshVerify: { count: fresh.count, checks: fresh.checks },
      loginTable,
    },
    warning:
      "TEMPORARY SHARED TESTING PASSWORD (12345678) — testing only; replace or delete before production launch.",
  };
}

module.exports = {
  STATUS,
  EXPECTED_EMAILS,
  OPERATIONAL_POOL_MODULE,
  TEST_PASSWORD,
  FIXTURE,
  evaluateHostedSeedSafety,
  probeRuntimeIdentity,
  requireMatchingIdentity,
  readFixtureSnapshot,
  verifyExpectedUsers,
  runHostedTestUserSeed,
  discoverCanonicalRoles,
  outputContainsSecrets,
};
