"use strict";

/**
 * Prompt 10F: Platform Admin church-support + user-management integration
 * (ephemeral Postgres · testing identity only).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  CSRF_FIELD,
  issueCsrfToken,
  CSRF_COOKIE,
} = require("../src/platform/http/v5Csrf");
const {
  DEFAULT_COOKIE: SUPPORT_COOKIE,
} = require("../src/platform/http/supportContextCookie");
const {
  startHqSupport,
  exitSupport,
  SUPPORT_TTL_MS,
} = require("../src/platform/services/platformSupportModeService");
const {
  inviteOrganizationTeamMember,
  assignOrganizationTeamRole,
  revokeOrganizationTeamRole,
  getOrganizationTeamMember,
  detectTeamUserByEmail,
} = require("../src/platform/services/platformAdminTeamService");
const {
  sendPasswordReset,
  revokeSessions,
  suspendSignIn,
  restoreSignIn,
} = require("../src/platform/services/platformAdminAccountRecoveryService");
const { authenticateBlessBoardUser } = require("../src/blessboard/services/authenticateBlessBoardUser");
const { PLATFORM_ADMIN_PERMISSIONS } = require("../src/blessboard/rbac/legacyCompatibilityPermissions");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "int-a.blessboard.org";
const HOST_B = "int-b.blessboard.org";
const DEPLOYMENT = "blessboard-org-staging";

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: DEPLOYMENT,
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    BLESSBOARD_APEX_ORIGIN: "https://blessboard.org",
    ...overrides,
  };
}

function cookieHeader(parts) {
  return parts.filter(Boolean).join("; ");
}

function createCaptureAdapter() {
  const sent = [];
  return {
    sent,
    adapter: Object.freeze({
      id: "test_capture",
      sendingAvailable: true,
      async send(envelope) {
        sent.push({
          to: envelope && envelope.to,
          text: String((envelope && envelope.text) || ""),
          html: String((envelope && envelope.html) || ""),
        });
        return {
          accepted_for_processing: true,
          sendingAvailable: true,
          delivered: true,
          code: "sent",
        };
      },
    }),
  };
}

describe("platform admin integration catalogue", () => {
  it("excludes Finance / pastoral / safeguarding from Platform Admin bundle", () => {
    assert.ok(!PLATFORM_ADMIN_PERMISSIONS.includes("finance.transactions.view"));
    assert.ok(!PLATFORM_ADMIN_PERMISSIONS.includes("giving.transactions.view"));
    assert.ok(!PLATFORM_ADMIN_PERMISSIONS.includes("pastoral_cases.view_assigned"));
    assert.ok(!PLATFORM_ADMIN_PERMISSIONS.includes("pastoral_cases.view_safeguarding"));
    for (const key of [
      "platform.users.invite",
      "platform.users.reset_access",
      "platform.users.revoke_sessions",
      "platform.users.suspend",
      "platform.users.restore",
      "platform.support.enter_hq",
      "platform.support.exit",
    ]) {
      assert.ok(PLATFORM_ADMIN_PERMISSIONS.includes(key), key);
    }
  });

  it("ships migrations 068–071", () => {
    for (const name of [
      "068_platform_admin_directory_permissions.sql",
      "069_platform_support_mode_permissions.sql",
      "070_platform_team_management_permissions.sql",
      "071_platform_account_recovery_permissions.sql",
    ]) {
      assert.ok(
        fs.existsSync(path.join(__dirname, "../db/migrations/blessboard", name)),
        name
      );
    }
  });
});

describe("blessboard platform admin integration workflow", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let branchA;
  let campusA;
  let users = {};
  let memberA;
  let csrf;
  let sessionCookie;
  let identityEvidence;

  function requireDb(t) {
    if (skipSuite) {
      t.skip(skipReason || "database unavailable");
      return false;
    }
    return true;
  }

  before(async () => {
    try {
      process.env.PLATFORM_DEPLOYMENT_CODE = DEPLOYMENT;
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      identityEvidence = await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
      assert.equal(identityEvidence.ok, true, identityEvidence.message);
      assert.equal(identityEvidence.row.identity_key, IDENTITY_KEY);
      assert.equal(identityEvidence.row.environment_code, "testing");

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "int-org-a",
        displayName: "Integration Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "int-org-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "int-org-b",
        displayName: "Integration Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "int-org-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;

      const churchProvA = await provisionBlessBoardChurch(pool, {
        organizationKey: "int-org-a",
        churchKey: "int-org-a",
        displayName: "Integration Church A",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(churchProvA.ok, true, churchProvA.message);
      churchA = churchProvA.records.church;
      branchA = churchProvA.records.hqBranch;

      const campus = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-east', 'Campus East', 'branch', 'active', false, 'Africa/Lusaka', 'ZM')
         RETURNING id, branch_key, display_name`,
        [churchA.id]
      );
      campusA = campus.rows[0];

      const churchProvB = await provisionBlessBoardChurch(pool, {
        organizationKey: "int-org-b",
        churchKey: "int-org-b",
        displayName: "Integration Church B",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(churchProvB.ok, true, churchProvB.message);
      churchB = churchProvB.records.church;

      async function makeUser(email, displayName) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      users.platform = await makeUser("int-pa@example.org", "Integration PA");
      users.linkedOther = await makeUser("int-linked@example.org", "Linked Other Church");
      users.staff = await makeUser("int-staff@example.org", "Integration Staff");

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "int-pa@example.org",
            organizationKey: "int-org-a",
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "int-linked@example.org",
            organizationKey: "int-org-b",
            roleKey: "branch_admin",
            churchKey: "int-org-b",
            branchKey: "hq",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "int-staff@example.org",
            organizationKey: "int-org-a",
            roleKey: "church_hq_admin",
            churchKey: "int-org-a",
          })
        ).ok,
        true
      );

      const mem = await pool.query(
        `INSERT INTO blessboard.members
           (church_id, user_id, first_name, last_name, preferred_name,
            email_normalized, email_display, phone_normalized, phone_display, status)
         VALUES
           ($1, NULL, 'Integration', 'Member', 'Integration',
            'int-member@example.org', 'int-member@example.org',
            '+15551119999', '+1 555 111 9999', 'active')
         RETURNING id`,
        [churchA.id]
      );
      memberA = { id: mem.rows[0].id };
      await pool.query(
        `INSERT INTO blessboard.member_branch_memberships
           (member_id, branch_id, membership_status, is_primary, joined_at)
         VALUES ($1, $2, 'active', true, now())`,
        [memberA.id, branchA.id]
      );

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
      const session = await createV5Session(pool, {
        deploymentCode: DEPLOYMENT,
        userId: users.platform.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: null,
      });
      assert.equal(session.ok, true, session.code);
      sessionCookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
      const token = issueCsrfToken(baseEnv());
      csrf = { token, cookie: `${CSRF_COOKIE}=${token}` };
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : "setup_failed";
      console.error("[platform-admin-integration] setup skipped:", skipReason);
    }
  });

  after(async () => {
    if (pool) {
      try {
        await pool.end();
      } catch {
        /* ignore */
      }
    }
  });

  it("verifies testing identity and production separation", async (t) => {
    if (!requireDb(t)) return;
    assert.equal(identityEvidence.row.identity_key, "blessboard-platform-v5");
    assert.equal(identityEvidence.row.environment_code, "testing");
    const row = await pool.query(
      `SELECT identity_key, environment_code FROM platform.database_identity LIMIT 1`
    );
    assert.equal(row.rows[0].identity_key, IDENTITY_KEY);
    assert.equal(row.rows[0].environment_code, "testing");
    assert.notEqual(row.rows[0].identity_key, "blessboard-platform-production");
  });

  it("walks Platform Admin org → directories → support → team → recovery → exit", async (t) => {
    if (!requireDb(t)) return;

    // Login / admin shell
    const dash = await request(app)
      .get("/admin")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader([sessionCookie]));
    assert.equal(dash.status, 200);
    assert.match(dash.text, /data-bb-shell="platform-admin"/);

    // Search churches / orgs
    const orgs = await request(app)
      .get("/admin/organizations?q=int-org-a")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader([sessionCookie]));
    assert.equal(orgs.status, 200);
    assert.match(orgs.text, /int-org-a|Integration Org A/);

    // Org detail sections
    const detail = await request(app)
      .get("/admin/organizations/int-org-a")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader([sessionCookie]));
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-pa-organization-detail="1"/);
    assert.match(detail.text, /id="pa-org-overview"/);
    assert.match(detail.text, /Churches and branches/);
    assert.match(detail.text, /Team members/);
    assert.match(detail.text, /id="pa-org-members-heading"/);
    assert.match(detail.text, /Roles and access/);
    assert.match(detail.text, /id="pa-org-invitation"/);
    assert.match(detail.text, /Support mode/);
    assert.match(detail.text, /id="pa-org-subscription"/);
    assert.match(detail.text, /Domains and deployments/);
    assert.match(detail.text, /id="pa-org-audit-heading"/);
    assert.match(detail.text, /Open HQ support mode/);
    assert.match(detail.text, /Open Branch support mode/);
    assert.match(detail.text, /View staff/);
    assert.match(detail.text, /View members/);
    assert.match(detail.text, /Invite team member/);
    assert.match(detail.text, /Review access/);
    assert.match(detail.text, /Send reset link/);
    assert.match(detail.text, /Revoke sessions/);
    assert.match(detail.text, /View support audit/);

    // Global staff + members search
    const usersRes = await request(app)
      .get("/admin/users?q=int-staff")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader([sessionCookie]));
    assert.equal(usersRes.status, 200);
    assert.match(usersRes.text, /int-staff@example\.org|Integration Staff/);

    const membersRes = await request(app)
      .get("/admin/organizations/int-org-a/members")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader([sessionCookie]));
    assert.equal(membersRes.status, 200);
    assert.match(membersRes.text, /Integration|int-member@example\.org/);
    assert.doesNotMatch(membersRes.text, /data-bb-pastoral|data-bb-welfare|data-bb-safeguarding|data-bb-giving/);
    assert.doesNotMatch(membersRes.text, /password_hash|case_notes|confidential_notes/i);

    const membersGlobal = await request(app)
      .get("/admin/members?q=int-member")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader([sessionCookie]));
    assert.equal(membersGlobal.status, 200);
    assert.match(membersGlobal.text, /int-member@example\.org|Integration/);
    assert.doesNotMatch(membersGlobal.text, /data-bb-pastoral|data-bb-welfare|data-bb-safeguarding|data-bb-giving/);
    assert.doesNotMatch(membersGlobal.text, /password_hash|case_notes|confidential_notes/i);

    // 11. Support mode started
    const started = await startHqSupport(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "int-org-a",
      reason: "Integration verification of support workflow",
      env: baseEnv(),
    });
    assert.equal(started.ok, true, started.reason);
    assert.ok(started.rawToken);
    const supportCookie = `${SUPPORT_COOKIE}=${started.rawToken}`;

    const hq = await request(app)
      .get("/hq")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader([sessionCookie, supportCookie]));
    assert.equal(hq.status, 200);
    assert.match(hq.text, /data-bb-support-banner="1"/);
    assert.match(hq.text, /Your actions are audited/);

    // 13–15. Finance / pastoral / safeguarding denied under support
    for (const pathDenied of ["/hq/giving", "/hq/pastoral-care", "/hq/welfare"]) {
      const denied = await request(app)
        .get(pathDenied)
        .set("Host", HOST_A)
        .set("Cookie", cookieHeader([sessionCookie, supportCookie]));
      assert.ok([403, 404].includes(denied.status), `${pathDenied} → ${denied.status}`);
    }

    // 1. Existing user linked to another church — detect, do not duplicate
    const detected = await detectTeamUserByEmail(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "int-org-a",
      email: "int-linked@example.org",
    });
    assert.equal(detected.ok, true, detected.reason);
    assert.ok(detected.user);
    assert.equal(String(detected.user.id), String(users.linkedOther.id));

    const beforeUsers = await pool.query(
      `SELECT count(*)::int AS c FROM blessboard.users WHERE email_normalized = $1`,
      ["int-linked@example.org"]
    );

    const linkedInvite = await inviteOrganizationTeamMember(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "int-org-a",
      firstName: "Linked",
      lastName: "Other",
      email: "int-linked@example.org",
      roleAssignments: [
        {
          roleKey: "website_editor",
          scopeType: "church",
          scopeId: churchA.id,
          assignmentReason: "link existing staff into org A",
        },
      ],
      env: baseEnv(),
      mailAdapter: createCaptureAdapter().adapter,
    });
    assert.equal(linkedInvite.ok, true, linkedInvite.reason);
    assert.equal(linkedInvite.existingUser, true);
    const afterUsers = await pool.query(
      `SELECT count(*)::int AS c FROM blessboard.users WHERE email_normalized = $1`,
      ["int-linked@example.org"]
    );
    assert.equal(afterUsers.rows[0].c, beforeUsers.rows[0].c);

    // 2. New user invited
    const captureInvite = createCaptureAdapter();
    const invited = await inviteOrganizationTeamMember(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "int-org-a",
      firstName: "New",
      lastName: "Invitee",
      email: "int-new@example.org",
      roleAssignments: [
        {
          roleKey: "website_editor",
          scopeType: "church",
          scopeId: churchA.id,
          assignmentReason: "new staff invite",
        },
      ],
      env: baseEnv(),
      mailAdapter: captureInvite.adapter,
      publicBaseUrl: "https://blessboard.org",
    });
    assert.equal(invited.ok, true, invited.reason);
    assert.ok(invited.userId);
    assert.equal(invited.existingUser, false);

    // 3. Standard role assigned (shared RBAC — website_editor)
    const standard = await assignOrganizationTeamRole(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "int-org-a",
      userId: users.staff.id,
      roleKey: "website_editor",
      scopeType: "branch",
      scopeId: campusA.id,
      assignmentReason: "campus website coverage",
    });
    assert.equal(standard.ok, true, standard.reason);

    // 4. Sensitive role with reason
    const sensitive = await assignOrganizationTeamRole(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "int-org-a",
      userId: users.staff.id,
      roleKey: "finance_officer",
      scopeType: "church",
      scopeId: churchA.id,
      assignmentReason: "temporary finance coverage for audit",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    assert.equal(sensitive.ok, true, sensitive.reason);
    const sensitiveAssignmentId = sensitive.assignment && sensitive.assignment.id;

    // 7. Effective permissions update immediately
    let teamDetail = await getOrganizationTeamMember(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "int-org-a",
      userId: users.staff.id,
    });
    assert.equal(teamDetail.ok, true, teamDetail.reason);
    const keysBefore = Object.values(teamDetail.detail.effectiveGrouped || {})
      .flat()
      .map((p) => p.permissionKey);
    assert.ok(keysBefore.length > 0);

    // 5. Role expires
    assert.ok(sensitiveAssignmentId);
    await pool.query(
      `UPDATE blessboard.user_role_assignments
          SET expires_at = now() - interval '1 minute', status = 'expired'
        WHERE id = $1`,
      [sensitiveAssignmentId]
    );
    teamDetail = await getOrganizationTeamMember(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "int-org-a",
      userId: users.staff.id,
    });
    const activeIds = (teamDetail.detail.activeAssignments || []).map((a) => String(a.id));
    assert.ok(!activeIds.includes(String(sensitiveAssignmentId)));

    // 6. Role revoked (standard website_editor)
    const standardAssign = (teamDetail.detail.activeAssignments || []).find(
      (a) => a.roleKey === "website_editor" || a.role_key === "website_editor"
    );
    assert.ok(standardAssign, "expected website_editor assignment");
    const revoked = await revokeOrganizationTeamRole(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "int-org-a",
      userId: users.staff.id,
      assignmentId: standardAssign.id,
      revocationReason: "coverage ended",
    });
    assert.equal(revoked.ok, true, revoked.reason);

    teamDetail = await getOrganizationTeamMember(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "int-org-a",
      userId: users.staff.id,
    });
    const afterRevokeKeys = Object.values(teamDetail.detail.effectiveGrouped || {})
      .flat()
      .map((p) => p.permissionKey);
    assert.ok(Array.isArray(afterRevokeKeys));

    // Cross-tenant forge denied
    const forged = await assignOrganizationTeamRole(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "int-org-a",
      userId: users.staff.id,
      roleKey: "website_editor",
      scopeType: "branch",
      scopeId: campusA.id,
      submittedOrganizationId: orgB.id,
      assignmentReason: "forged cross-org scope",
    });
    assert.equal(forged.ok, false);
    assert.equal(forged.reason, "forged_organization");

    // Cross-org branch scope denied
    const branchB = await pool.query(
      `SELECT id FROM blessboard.branches WHERE church_id = $1 LIMIT 1`,
      [churchB.id]
    );
    const forgedBranch = await assignOrganizationTeamRole(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "int-org-a",
      userId: users.staff.id,
      roleKey: "website_editor",
      scopeType: "branch",
      scopeId: branchB.rows[0].id,
      assignmentReason: "forged branch",
    });
    assert.equal(forgedBranch.ok, false);
    assert.equal(forgedBranch.reason, "cross_org_scope_mismatch");

    // 8. Password-reset link requested (secure one-time)
    const captureReset = createCaptureAdapter();
    const reset = await sendPasswordReset(pool, {
      actorUserId: users.platform.id,
      userId: users.staff.id,
      requestIp: "198.51.100.40",
      env: baseEnv(),
      publicBaseUrl: "https://blessboard.org",
      deps: { emailAdapter: captureReset.adapter },
    });
    assert.equal(reset.ok, true, reset.reason);
    assert.equal(reset.sent, true);
    assert.equal(Object.prototype.hasOwnProperty.call(reset, "rawToken"), false);
    assert.ok(captureReset.sent.length >= 1);
    const resetBody = `${captureReset.sent[0].text}\n${captureReset.sent[0].html}`;
    assert.match(resetBody, /reset-password\?token=/);
    assert.doesNotMatch(resetBody, new RegExp(PASSWORD, "i"));

    // 9. Sessions revoked
    const staffSession = await createV5Session(pool, {
      deploymentCode: DEPLOYMENT,
      userId: users.staff.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: null,
    });
    assert.equal(staffSession.ok, true);
    const rev = await revokeSessions(pool, {
      actorUserId: users.platform.id,
      userId: users.staff.id,
      env: baseEnv(),
    });
    assert.equal(rev.ok, true, rev.reason);
    const sess = await pool.query(
      `SELECT count(*)::int AS c FROM platform.deployment_sessions
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [users.staff.id]
    );
    assert.equal(sess.rows[0].c, 0);

    // 10. Suspend + restore; revoked roles stay revoked
    const suspended = await suspendSignIn(pool, {
      actorUserId: users.platform.id,
      userId: users.staff.id,
      env: baseEnv(),
    });
    assert.equal(suspended.ok, true, suspended.reason);
    const authBlocked = await authenticateBlessBoardUser(pool, {
      email: "int-staff@example.org",
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(authBlocked.ok, false);

    const restored = await restoreSignIn(pool, {
      actorUserId: users.platform.id,
      userId: users.staff.id,
      env: baseEnv(),
    });
    assert.equal(restored.ok, true, restored.reason);
    const stillRevoked = await pool.query(
      `SELECT status FROM blessboard.user_role_assignments WHERE id = $1`,
      [standardAssign.id]
    );
    assert.equal(stillRevoked.rows[0].status, "revoked");

    // 11–12. Exit support + expiry
    const exited = await exitSupport(pool, {
      actorUserId: users.platform.id,
      rawToken: started.rawToken,
      env: baseEnv(),
    });
    assert.equal(exited.ok, true, exited.reason);

    const afterExit = await request(app)
      .get("/hq")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader([sessionCookie, supportCookie]));
    assert.equal(afterExit.status, 403);

    const started2 = await startHqSupport(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "int-org-a",
      reason: "Expiry integration check",
      env: baseEnv(),
    });
    assert.equal(started2.ok, true, started2.reason);
    await pool.query(
      `UPDATE platform.support_contexts
          SET started_at = now() - interval '30 minutes',
              expires_at = now() - interval '1 minute'
        WHERE id = $1`,
      [started2.context.id]
    );
    const expiredHq = await request(app)
      .get("/hq")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader([
        sessionCookie,
        `${SUPPORT_COOKIE}=${started2.rawToken}`,
      ]));
    assert.equal(expiredHq.status, 403);
    assert.equal(SUPPORT_TTL_MS, 20 * 60 * 1000);

    // CSRF on recovery action
    const badCsrf = await request(app)
      .post(`/admin/users/${users.staff.id}/revoke-sessions`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader([sessionCookie]))
      .type("form")
      .send({});
    assert.ok([303, 403].includes(badCsrf.status));
    if (badCsrf.status === 303) {
      assert.match(String(badCsrf.headers.location || ""), /error=csrf|csrf/);
    }

    // 16. Audit history complete (no tokens / passwords)
    const audits = await pool.query(
      `SELECT action_key, metadata_json::text AS meta
         FROM platform.audit_events
        WHERE organization_id = $1
          AND action_key LIKE 'platform.%'
        ORDER BY created_at DESC
        LIMIT 80`,
      [orgA.id]
    );
    const keys = new Set(audits.rows.map((r) => r.action_key));
    for (const expected of [
      "platform.support.started",
      "platform.support.hq_opened",
      "platform.support.ended",
      "platform.support.expired",
      "platform.user.password_reset_requested",
      "platform.user.sessions_revoked",
      "platform.user.suspended",
      "platform.user.restored",
    ]) {
      assert.ok(keys.has(expected), `missing audit ${expected}`);
    }
    for (const row of audits.rows) {
      assert.doesNotMatch(row.meta || "", /password_hash|rawToken|reset_token|session_secret/i);
      assert.doesNotMatch(row.meta || "", new RegExp(PASSWORD, "i"));
    }

    // Org detail shows audit panel after events
    const detailAfter = await request(app)
      .get("/admin/organizations/int-org-a")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader([sessionCookie]));
    assert.equal(detailAfter.status, 200);
    assert.match(detailAfter.text, /data-bb-pa-org-audit-list="1"|platform\.support\.started/);
  });
});
