"use strict";

/**
 * Focused tests for BlessBoard V5 password-reset service + CLI.
 * Does not create platform_admin during suite bootstrap beyond explicit fixtures.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const bcrypt = require("bcryptjs");

const {
  resetFoundationDatabase,
  createFoundationPool,
  foundationDbUnavailableSkipReason,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { authenticateBlessBoardUser } = require("../src/blessboard/services/authenticateBlessBoardUser");
const {
  resetBlessBoardUserPassword,
  STATUS,
  BCRYPT_ROUNDS,
} = require("../src/blessboard/services/resetBlessBoardUserPassword");
const authRepo = require("../src/blessboard/repositories/blessBoardAuthRepository");

const ROOT = path.resolve(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const DEPLOYMENT = "blessboard-org-v5";
const OLD_PASSWORD = "old-password-ten";
const NEW_PASSWORD = "new-password-twelve";
const WEAK_PASSWORD = "short";

const CLI = path.join(ROOT, "db/scripts/blessboard-user-password-reset.js");
const CREATE_CLI = path.join(ROOT, "db/scripts/blessboard-user-create.js");
const ROLE_CLI = path.join(ROOT, "db/scripts/blessboard-user-role-assign.js");

function runCli(args, { input, databaseUrl, extraEnv } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    input: input != null ? String(input) : undefined,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
      GETPRO_DATABASE_URL: "",
      ...(extraEnv || {}),
    },
    encoding: "utf8",
  });
}

function parseMachine(stdout) {
  const text = String(stdout || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  assert.ok(start >= 0 && end > start, `expected JSON machine report, got: ${text.slice(0, 400)}`);
  return JSON.parse(text.slice(start, end + 1));
}

function assertNoSecretLeak(result, secrets) {
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
  for (const secret of secrets) {
    if (!secret) continue;
    assert.doesNotMatch(combined, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(combined, /\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{22,}/);
  assert.doesNotMatch(combined, /postgresql:\/\/|postgres:\/\//i);
}

describe("blessboard v5 user password reset", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let targetUserId;
  let otherUserId;

  function requireDb(t) {
    if (skipSuite) {
      t.skip(foundationDbUnavailableSkipReason(skipReason));
      return false;
    }
    return true;
  }

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
      await provisionPlatformTenant(pool, {
        organizationKey: "pw-reset-org",
        displayName: "PW Reset Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "pw-reset-org",
        hostname: "pw-reset.blessboard.org",
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      await provisionBlessBoardChurch(pool, {
        organizationKey: "pw-reset-org",
        churchKey: "pw-reset-org",
        displayName: "PW Reset Org",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });

      const target = await createBlessBoardUser(pool, {
        email: "Platform.Admin@Example.ORG",
        displayName: "Platform Admin",
        password: OLD_PASSWORD,
      });
      assert.equal(target.ok, true, target.message);
      targetUserId = target.user.id;

      const role = await assignBlessBoardRole(pool, {
        email: "platform.admin@example.org",
        organizationKey: "pw-reset-org",
        roleKey: "platform_admin",
      });
      assert.equal(role.ok, true, role.message);

      const other = await createBlessBoardUser(pool, {
        email: "other@example.org",
        displayName: "Other User",
        password: OLD_PASSWORD,
      });
      assert.equal(other.ok, true, other.message);
      otherUserId = other.user.id;
      const otherRole = await assignBlessBoardRole(pool, {
        email: "other@example.org",
        organizationKey: "pw-reset-org",
        roleKey: "church_hq_admin",
        churchKey: "pw-reset-org",
      });
      assert.equal(otherRole.ok, true, otherRole.message);

    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("uses bcrypt cost 12 matching user creation", () => {
    assert.equal(BCRYPT_ROUNDS, 12);
  });

  it("preview (dry-run) performs no write", async (t) => {
    if (!requireDb(t)) return;
    const before = await authRepo.findUserByEmail(pool, "platform.admin@example.org");
    const result = await resetBlessBoardUserPassword(pool, {
      email: "Platform.Admin@Example.ORG",
      password: NEW_PASSWORD,
      dryRun: true,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, STATUS.DRY_RUN_WOULD_RESET);
    assert.equal(result.preview.emailNormalized, "platform.admin@example.org");
    assert.equal(result.preview.accountStatus, "active");
    assert.equal(result.preview.hasActivePlatformAdminRole, true);
    assert.equal(result.preview.passwordMeetsPolicy, true);
    assert.equal(result.preview.requiresConfirm, true);
    assert.equal(result.result, null);

    const after = await authRepo.findUserByEmail(pool, "platform.admin@example.org");
    assert.equal(after.password_hash, before.password_hash);
  });

  it("missing confirm path via CLI performs no write", async (t) => {
    if (!requireDb(t)) return;
    const before = await authRepo.findUserByEmail(pool, "platform.admin@example.org");
    const result = runCli(
      ["--email", "platform.admin@example.org", "--password-stdin"],
      { input: NEW_PASSWORD, databaseUrl }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const machine = parseMachine(result.stdout);
    assert.equal(machine.mode, "dry_run");
    assert.equal(machine.status, STATUS.DRY_RUN_WOULD_RESET);
    assertNoSecretLeak(result, [NEW_PASSWORD, OLD_PASSWORD, before.password_hash, databaseUrl]);

    const after = await authRepo.findUserByEmail(pool, "platform.admin@example.org");
    assert.equal(after.password_hash, before.password_hash);
  });

  it("password supplied through argv is rejected", async (t) => {
    if (!requireDb(t)) return;
    const before = await authRepo.findUserByEmail(pool, "platform.admin@example.org");
    const result = runCli(
      ["--email", "platform.admin@example.org", "--password", NEW_PASSWORD, "--confirm"],
      { databaseUrl }
    );
    assert.notEqual(result.status, 0);
    const machine = parseMachine(result.stdout);
    assert.equal(machine.status, STATUS.ARGV_PASSWORD_FORBIDDEN);
    assertNoSecretLeak(result, [NEW_PASSWORD, before.password_hash]);
    const after = await authRepo.findUserByEmail(pool, "platform.admin@example.org");
    assert.equal(after.password_hash, before.password_hash);
  });

  it("unknown email fails safely", async (t) => {
    if (!requireDb(t)) return;
    const result = await resetBlessBoardUserPassword(pool, {
      email: "missing@example.org",
      password: NEW_PASSWORD,
      dryRun: false,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.USER_NOT_FOUND);
    assert.equal(result.preview, null);
  });

  it("inactive user fails safely", async (t) => {
    if (!requireDb(t)) return;
    await createBlessBoardUser(pool, {
      email: "inactive@example.org",
      displayName: "Inactive",
      password: OLD_PASSWORD,
    });
    await pool.query(
      `UPDATE blessboard.users SET status = 'suspended' WHERE email_normalized = 'inactive@example.org'`
    );
    const result = await resetBlessBoardUserPassword(pool, {
      email: "inactive@example.org",
      password: NEW_PASSWORD,
      dryRun: false,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.USER_INACTIVE);
    assert.equal(result.preview.accountStatus, "suspended");
    assert.equal(result.preview.loginEligible, false);
  });

  it("weak password fails safely", async (t) => {
    if (!requireDb(t)) return;
    const before = await authRepo.findUserByEmail(pool, "platform.admin@example.org");
    const result = await resetBlessBoardUserPassword(pool, {
      email: "platform.admin@example.org",
      password: WEAK_PASSWORD,
      dryRun: false,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.WEAK_PASSWORD);
    const after = await authRepo.findUserByEmail(pool, "platform.admin@example.org");
    assert.equal(after.password_hash, before.password_hash);
  });

  it("valid reset changes hash, auth, sessions; secrets stay out of output/audit", async (t) => {
    if (!requireDb(t)) return;

    const targetAuth = await authenticateBlessBoardUser(pool, {
      email: "platform.admin@example.org",
      password: OLD_PASSWORD,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(targetAuth.ok, true, targetAuth.message);
    assert.ok(targetAuth.session);

    const otherAuth = await authenticateBlessBoardUser(pool, {
      email: "other@example.org",
      password: OLD_PASSWORD,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(otherAuth.ok, true, otherAuth.message);
    assert.ok(otherAuth.session);

    const beforeHash = (await authRepo.findUserByEmail(pool, "platform.admin@example.org")).password_hash;
    const targetSessionsBefore = await authRepo.countActiveSessionsForUser(pool, targetUserId);
    const otherSessionsBefore = await authRepo.countActiveSessionsForUser(pool, otherUserId);
    assert.ok(targetSessionsBefore >= 1);
    assert.ok(otherSessionsBefore >= 1);

    const result = runCli(
      ["--email", "platform.admin@example.org", "--password-stdin", "--confirm"],
      { input: NEW_PASSWORD, databaseUrl }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const machine = parseMachine(result.stdout);
    assert.equal(machine.status, STATUS.RESET);
    assert.equal(machine.mode, "write");
    assertNoSecretLeak(result, [NEW_PASSWORD, OLD_PASSWORD, beforeHash, databaseUrl]);

    const after = await authRepo.findUserByEmail(pool, "platform.admin@example.org");
    assert.notEqual(after.password_hash, beforeHash);
    assert.match(after.password_hash, /^\$2[aby]?\$12\$/);
    assert.equal(await bcrypt.compare(NEW_PASSWORD, after.password_hash), true);
    assert.equal(await bcrypt.compare(OLD_PASSWORD, after.password_hash), false);

    const oldAuth = await authenticateBlessBoardUser(pool, {
      email: "platform.admin@example.org",
      password: OLD_PASSWORD,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(oldAuth.ok, false);
    assert.equal(oldAuth.status, "invalid_credentials");

    const newAuth = await authenticateBlessBoardUser(pool, {
      email: "platform.admin@example.org",
      password: NEW_PASSWORD,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(newAuth.ok, true, newAuth.message);

    const targetSessionsAfter = await authRepo.countActiveSessionsForUser(pool, targetUserId);
    // New login creates a fresh session; prior sessions must be revoked.
    const revoked = await pool.query(
      `SELECT COUNT(*)::int AS c FROM platform.deployment_sessions
        WHERE user_id = $1 AND revoked_at IS NOT NULL`,
      [targetUserId]
    );
    assert.ok(Number(revoked.rows[0].c) >= targetSessionsBefore);
    assert.ok(targetSessionsAfter >= 1);

    const otherSessionsAfter = await authRepo.countActiveSessionsForUser(pool, otherUserId);
    assert.equal(otherSessionsAfter, otherSessionsBefore);

    const audit = await pool.query(
      `SELECT action_key, metadata_json
         FROM platform.audit_events
        WHERE action_key = 'user.password_reset'
          AND entity_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [targetUserId]
    );
    assert.equal(audit.rows.length, 1);
    const meta = JSON.stringify(audit.rows[0].metadata_json || {});
    assert.doesNotMatch(meta, new RegExp(NEW_PASSWORD));
    assert.doesNotMatch(meta, new RegExp(OLD_PASSWORD));
    assert.doesNotMatch(meta, /\$2[aby]?\$/);
  });

  it("database failure returns a safe diagnostic", async (t) => {
    if (!requireDb(t)) return;
    const result = runCli(
      ["--email", "platform.admin@example.org", "--password-stdin", "--confirm"],
      {
        input: NEW_PASSWORD,
        databaseUrl: "postgresql://nobody:secret@127.0.0.1:1/nope",
        extraEnv: { DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY },
      }
    );
    assert.notEqual(result.status, 0);
    assertNoSecretLeak(result, [NEW_PASSWORD, "secret"]);
    assert.match(`${result.stdout}\n${result.stderr}`, /database|unreachable|identity|Safe diagnostic/i);
  });

  it("V4 authentication tables and modules are untouched by password-reset tooling", () => {
    const files = [
      "db/scripts/blessboard-user-password-reset.js",
      "src/blessboard/services/resetBlessBoardUserPassword.js",
      "db/scripts/blessboard-user-list-platform-admins.js",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      assert.doesNotMatch(src, /process\.env\.GETPRO_DATABASE_URL/);
      assert.doesNotMatch(src, /require\(["'][^"']*(?:church\/auth|v4Auth|legacyAuth)/i);
      assert.doesNotMatch(src, /UPDATE\s+public\.(users|session)\b/i);
      assert.doesNotMatch(src, /ADMIN_EMAIL|ADMIN_PASSWORD/);
    }
  });

  it("existing create + role-assign CLIs keep dry-run default and stdin password", async (t) => {
    if (!requireDb(t)) return;

    const createDry = spawnSync(
      process.execPath,
      [
        CREATE_CLI,
        "--email",
        "dry-create@example.org",
        "--display-name",
        "Dry Create",
        "--password-stdin",
      ],
      {
        input: OLD_PASSWORD,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
          GETPRO_DATABASE_URL: "",
        },
        encoding: "utf8",
      }
    );
    assert.equal(createDry.status, 0, createDry.stderr || createDry.stdout);
    const createMachine = parseMachine(createDry.stdout);
    assert.equal(createMachine.mode, "dry_run");
    assert.doesNotMatch(`${createDry.stdout}\n${createDry.stderr}`, new RegExp(OLD_PASSWORD));
    const missing = await authRepo.findUserByEmail(pool, "dry-create@example.org");
    assert.equal(missing, null);

    const roleDry = spawnSync(
      process.execPath,
      [
        ROLE_CLI,
        "--email",
        "platform.admin@example.org",
        "--organization-key",
        "pw-reset-org",
        "--role",
        "platform_admin",
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
          GETPRO_DATABASE_URL: "",
        },
        encoding: "utf8",
      }
    );
    assert.equal(roleDry.status, 0, roleDry.stderr || roleDry.stdout);
    const roleMachine = parseMachine(roleDry.stdout);
    assert.equal(roleMachine.mode, "dry_run");

    const idempotent = await assignBlessBoardRole(pool, {
      email: "platform.admin@example.org",
      organizationKey: "pw-reset-org",
      roleKey: "platform_admin",
    });
    assert.equal(idempotent.ok, true, idempotent.message);

    const scopedReject = await assignBlessBoardRole(pool, {
      email: "platform.admin@example.org",
      organizationKey: "pw-reset-org",
      roleKey: "platform_admin",
      churchKey: "pw-reset-org",
    });
    assert.equal(scopedReject.ok, false);
    assert.match(String(scopedReject.message || scopedReject.reason || ""), /platform_admin/);
  });
});
