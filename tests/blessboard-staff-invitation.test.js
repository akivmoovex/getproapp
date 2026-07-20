"use strict";

/**
 * Prompt 24 — tenant user invitation and activation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

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
  inviteBlessBoardStaff,
  acceptInvitation,
  revokeInvitation,
  getInvitationForAccept,
  STATUS: INVITE_STATUS,
} = require("../src/blessboard/services/inviteBlessBoardStaff");
const {
  setOrganizationEntitlementOverride,
  FEATURE_KEYS,
} = require("../src/platform/services/entitlementService");
const { authenticateBlessBoardUser } = require("../src/blessboard/services/authenticateBlessBoardUser");
const { hashSessionToken } = require("../src/platform/session/sessionToken");

const IDENTITY_KEY = "blessboard-platform-v5";
const DEPLOYMENT = "blessboard-org-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST = "invite-a.blessboard.org";

describe("blessboard staff invitation and activation", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let org;
  let church;
  let hqBranchId;
  let users = {};

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const prov = await provisionPlatformTenant(pool, {
        organizationKey: "invite-a",
        displayName: "Invite Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "invite-a",
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(prov.ok, true, prov.message);
      org = prov.records.organization;

      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "invite-a",
        churchKey: "invite-a",
        displayName: "Invite Church A",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(ch.ok, true, ch.message);
      church = ch.records.church;

      const hq = await pool.query(
        `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = 'hq'`,
        [church.id]
      );
      hqBranchId = hq.rows[0].id;

      async function makeUser(email, displayName, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        return created.user;
      }

      users.hq = await makeUser("hq-invite@example.org", "HQ Invite", {
        email: "hq-invite@example.org",
        organizationKey: "invite-a",
        roleKey: "church_hq_admin",
        churchKey: "invite-a",
      });
      users.ba = await makeUser("ba-invite@example.org", "BA Invite", {
        email: "ba-invite@example.org",
        organizationKey: "invite-a",
        roleKey: "branch_admin",
        churchKey: "invite-a",
        branchKey: "hq",
      });
      users.pa = await makeUser("pa-invite@example.org", "PA Invite", {
        email: "pa-invite@example.org",
        organizationKey: "invite-a",
        roleKey: "platform_admin",
      });
      users.existing = await makeUser("existing@example.org", "Existing User", {
        email: "existing@example.org",
        organizationKey: "invite-a",
        roleKey: "branch_admin",
        churchKey: "invite-a",
        branchKey: "hq",
      });

      app = createV5FoundationApp({
        getPool: () => pool,
        env: {
          NODE_ENV: "test",
          PLATFORM_DEPLOYMENT_CODE: DEPLOYMENT,
          SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
          SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
          BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
          BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
        },
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("1. invite new user", async () => {
    requireDb();
    const invited = await inviteBlessBoardStaff(pool, {
      actorUserId: users.hq.id,
      organizationId: org.id,
      churchId: church.id,
      email: "newbie@example.org",
      displayName: "Newbie Admin",
      roleKey: "church_hq_admin",
    });
    assert.equal(invited.ok, true, invited.reason);
    assert.ok(invited.rawToken);
    assert.equal(invited.delivery, "copy_once");

    const user = await pool.query(
      `SELECT status, password_hash FROM blessboard.users WHERE email_normalized = 'newbie@example.org'`
    );
    assert.equal(user.rows[0].status, "invited");
    assert.equal(user.rows[0].password_hash, null);

    const accepted = await acceptInvitation(pool, {
      token: invited.rawToken,
      password: "new-password-ok",
    });
    assert.equal(accepted.ok, true, accepted.reason || accepted.message);

    const after = await pool.query(
      `SELECT status, password_hash FROM blessboard.users WHERE email_normalized = 'newbie@example.org'`
    );
    assert.equal(after.rows[0].status, "active");
    assert.ok(after.rows[0].password_hash);

    const role = await pool.query(
      `SELECT role_key, status FROM blessboard.user_roles
        WHERE user_id = $1 AND organization_id = $2 AND role_key = 'church_hq_admin'`,
      [accepted.user.id, org.id]
    );
    assert.equal(role.rows[0].status, "active");
  });

  it("2. invite existing identity (role only)", async () => {
    requireDb();
    // Create a second org user identity already active without this church HQ role
    const other = await createBlessBoardUser(pool, {
      email: "multi-org@example.org",
      displayName: "Multi Org",
      password: PASSWORD,
    });
    assert.equal(other.ok, true);

    const invited = await inviteBlessBoardStaff(pool, {
      actorUserId: users.hq.id,
      organizationId: org.id,
      churchId: church.id,
      email: "multi-org@example.org",
      displayName: "Multi Org",
      roleKey: "branch_admin",
      branchKey: "hq",
    });
    assert.equal(invited.ok, true, invited.reason);

    const beforeRoles = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_roles WHERE user_id = $1`,
      [other.user.id]
    );

    const accepted = await acceptInvitation(pool, { token: invited.rawToken });
    assert.equal(accepted.ok, true, accepted.message);

    const afterRoles = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_roles WHERE user_id = $1 AND status = 'active'`,
      [other.user.id]
    );
    assert.equal(afterRoles.rows[0].n, beforeRoles.rows[0].n + 1);

    const usersCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.users WHERE email_normalized = 'multi-org@example.org'`
    );
    assert.equal(usersCount.rows[0].n, 1);
  });

  it("3. duplicate invitation resends (invalidates prior token)", async () => {
    requireDb();
    const first = await inviteBlessBoardStaff(pool, {
      actorUserId: users.hq.id,
      organizationId: org.id,
      churchId: church.id,
      email: "resend@example.org",
      displayName: "Resend",
      roleKey: "branch_admin",
      branchKey: "hq",
    });
    assert.equal(first.ok, true, first.reason);
    const firstToken = first.rawToken;

    const second = await inviteBlessBoardStaff(pool, {
      actorUserId: users.hq.id,
      organizationId: org.id,
      churchId: church.id,
      email: "resend@example.org",
      displayName: "Resend",
      roleKey: "branch_admin",
      branchKey: "hq",
    });
    assert.equal(second.ok, true, second.reason);
    assert.equal(second.invitation.resent, true);
    assert.notEqual(second.rawToken, firstToken);

    const old = await getInvitationForAccept(pool, firstToken);
    assert.equal(old.ok, false);

    const neu = await acceptInvitation(pool, {
      token: second.rawToken,
      password: "resend-password",
    });
    assert.equal(neu.ok, true, neu.message);
  });

  it("4. user/staff limit enforced", async () => {
    requireDb();
    const staffCount = await pool.query(
      `SELECT COUNT(DISTINCT user_id)::int AS n FROM blessboard.user_roles
        WHERE organization_id = $1 AND status = 'active'
          AND role_key IN ('platform_admin', 'church_hq_admin', 'branch_admin')`,
      [org.id]
    );
    const pending = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_invitations
        WHERE organization_id = $1 AND status = 'pending' AND expires_at > now()`,
      [org.id]
    );
    const currentSeats = staffCount.rows[0].n + pending.rows[0].n;
    const ov = await setOrganizationEntitlementOverride(pool, {
      organizationId: org.id,
      featureKey: FEATURE_KEYS.MAX_STAFF_ACCOUNTS,
      featureKind: "limit",
      limitValue: currentSeats,
      reason: "prompt24_limit_test",
      createdByUserId: users.pa.id,
    });
    assert.equal(ov.ok, true, ov.reason);

    const blocked = await inviteBlessBoardStaff(pool, {
      actorUserId: users.hq.id,
      organizationId: org.id,
      churchId: church.id,
      email: "over-limit@example.org",
      displayName: "Over Limit",
      roleKey: "branch_admin",
      branchKey: "hq",
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, INVITE_STATUS.LIMIT_EXCEEDED);
    assert.match(String(blocked.message || ""), /limit|Upgrade/i);

    await setOrganizationEntitlementOverride(pool, {
      organizationId: org.id,
      featureKey: FEATURE_KEYS.MAX_STAFF_ACCOUNTS,
      featureKind: "limit",
      limitValue: null,
      reason: "prompt24_restore_unlimited",
      createdByUserId: users.pa.id,
    });
  });

  it("5. concurrent invitations cannot exceed limit", async () => {
    requireDb();
    const staffCount = await pool.query(
      `SELECT COUNT(DISTINCT user_id)::int AS n FROM blessboard.user_roles
        WHERE organization_id = $1 AND status = 'active'
          AND role_key IN ('platform_admin', 'church_hq_admin', 'branch_admin')`,
      [org.id]
    );
    const pending = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_invitations
        WHERE organization_id = $1 AND status = 'pending' AND expires_at > now()`,
      [org.id]
    );
    const currentSeats = staffCount.rows[0].n + pending.rows[0].n;
    await setOrganizationEntitlementOverride(pool, {
      organizationId: org.id,
      featureKey: FEATURE_KEYS.MAX_STAFF_ACCOUNTS,
      featureKind: "limit",
      limitValue: currentSeats + 1,
      reason: "prompt24_race_cap",
      createdByUserId: users.pa.id,
    });

    const [a, b] = await Promise.all([
      inviteBlessBoardStaff(pool, {
        actorUserId: users.hq.id,
        organizationId: org.id,
        churchId: church.id,
        email: "race-a@example.org",
        displayName: "Race A",
        roleKey: "branch_admin",
        branchKey: "hq",
      }),
      inviteBlessBoardStaff(pool, {
        actorUserId: users.hq.id,
        organizationId: org.id,
        churchId: church.id,
        email: "race-b@example.org",
        displayName: "Race B",
        roleKey: "branch_admin",
        branchKey: "hq",
      }),
    ]);
    const ok = [a, b].filter((r) => r.ok);
    const denied = [a, b].filter((r) => !r.ok);
    assert.equal(ok.length, 1);
    assert.equal(denied.length, 1);
    assert.equal(denied[0].status, INVITE_STATUS.LIMIT_EXCEEDED);

    await setOrganizationEntitlementOverride(pool, {
      organizationId: org.id,
      featureKey: FEATURE_KEYS.MAX_STAFF_ACCOUNTS,
      featureKind: "limit",
      limitValue: null,
      reason: "prompt24_race_restore",
      createdByUserId: users.pa.id,
    });
  });

  it("6. role and branch scope enforced", async () => {
    requireDb();
    const baEscalation = await inviteBlessBoardStaff(pool, {
      actorUserId: users.ba.id,
      organizationId: org.id,
      churchId: church.id,
      email: "ba-escalate@example.org",
      displayName: "BA Escalate",
      roleKey: "church_hq_admin",
    });
    assert.equal(baEscalation.ok, false);
    assert.equal(baEscalation.status, INVITE_STATUS.FORBIDDEN);

    const baOk = await inviteBlessBoardStaff(pool, {
      actorUserId: users.ba.id,
      organizationId: org.id,
      churchId: church.id,
      branchId: hqBranchId,
      email: "ba-peer@example.org",
      displayName: "BA Peer",
      roleKey: "branch_admin",
    });
    assert.equal(baOk.ok, true, baOk.reason);

    const platformEscalation = await inviteBlessBoardStaff(pool, {
      actorUserId: users.hq.id,
      organizationId: org.id,
      churchId: church.id,
      email: "pa-via-hq@example.org",
      displayName: "PA Via HQ",
      roleKey: "platform_admin",
    });
    assert.equal(platformEscalation.ok, false);
    assert.equal(platformEscalation.status, INVITE_STATUS.FORBIDDEN);
  });

  it("7. token expiration and single use", async () => {
    requireDb();
    const invited = await inviteBlessBoardStaff(pool, {
      actorUserId: users.hq.id,
      organizationId: org.id,
      churchId: church.id,
      email: "expire@example.org",
      displayName: "Expire",
      roleKey: "branch_admin",
      branchKey: "hq",
    });
    assert.equal(invited.ok, true);

    await pool.query(
      `UPDATE blessboard.user_invitations
          SET expires_at = now() - interval '1 minute', updated_at = now()
        WHERE token_hash = $1`,
      [hashSessionToken(invited.rawToken)]
    );
    const expired = await acceptInvitation(pool, {
      token: invited.rawToken,
      password: "expire-password",
    });
    assert.equal(expired.ok, false);
    assert.equal(expired.status, INVITE_STATUS.EXPIRED);

    const once = await inviteBlessBoardStaff(pool, {
      actorUserId: users.hq.id,
      organizationId: org.id,
      churchId: church.id,
      email: "once@example.org",
      displayName: "Once",
      roleKey: "branch_admin",
      branchKey: "hq",
    });
    assert.equal(once.ok, true);
    const first = await acceptInvitation(pool, {
      token: once.rawToken,
      password: "once-password1",
    });
    assert.equal(first.ok, true, first.message);
    const second = await acceptInvitation(pool, {
      token: once.rawToken,
      password: "once-password2",
    });
    assert.equal(second.ok, false);
  });

  it("8. revocation works", async () => {
    requireDb();
    const invited = await inviteBlessBoardStaff(pool, {
      actorUserId: users.hq.id,
      organizationId: org.id,
      churchId: church.id,
      email: "revoke-me@example.org",
      displayName: "Revoke Me",
      roleKey: "branch_admin",
      branchKey: "hq",
    });
    assert.equal(invited.ok, true);
    const revoked = await revokeInvitation(pool, {
      invitationId: invited.invitation.id,
      actorUserId: users.hq.id,
      organizationId: org.id,
      churchId: church.id,
    });
    assert.equal(revoked.ok, true, revoked.reason);
    const accept = await acceptInvitation(pool, {
      token: invited.rawToken,
      password: "revoke-password",
    });
    assert.equal(accept.ok, false);
  });

  it("9. suspended church blocks accepted user", async () => {
    requireDb();
    const invited = await inviteBlessBoardStaff(pool, {
      actorUserId: users.hq.id,
      organizationId: org.id,
      churchId: church.id,
      email: "suspended-accept@example.org",
      displayName: "Suspended Accept",
      roleKey: "branch_admin",
      branchKey: "hq",
    });
    assert.equal(invited.ok, true);

    await pool.query(
      `UPDATE blessboard.churches SET status = 'suspended', updated_at = now() WHERE id = $1`,
      [church.id]
    );
    const blocked = await acceptInvitation(pool, {
      token: invited.rawToken,
      password: "suspended-password",
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, INVITE_STATUS.ORG_INACTIVE);

    await pool.query(
      `UPDATE blessboard.churches SET status = 'active', updated_at = now() WHERE id = $1`,
      [church.id]
    );
  });

  it("10. unauthorized role escalation fails", async () => {
    requireDb();
    const viaHttp = await inviteBlessBoardStaff(pool, {
      actorUserId: users.ba.id,
      organizationId: org.id,
      churchId: church.id,
      email: "escalation-http@example.org",
      displayName: "Escalation",
      roleKey: "church_hq_admin",
    });
    assert.equal(viaHttp.ok, false);
    assert.equal(viaHttp.status, INVITE_STATUS.FORBIDDEN);
  });

  it("11. audit events are recorded", async () => {
    requireDb();
    const invited = await inviteBlessBoardStaff(pool, {
      actorUserId: users.hq.id,
      organizationId: org.id,
      churchId: church.id,
      email: "audit-invite@example.org",
      displayName: "Audit Invite",
      roleKey: "branch_admin",
      branchKey: "hq",
    });
    assert.equal(invited.ok, true);
    await acceptInvitation(pool, {
      token: invited.rawToken,
      password: "audit-password",
    });

    const created = await pool.query(
      `SELECT outcome FROM platform.audit_events
        WHERE organization_id = $1 AND action_key = 'invitation.created'
        ORDER BY created_at DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(created.rows[0].outcome, "success");

    const accepted = await pool.query(
      `SELECT outcome FROM platform.audit_events
        WHERE organization_id = $1 AND action_key = 'invitation.accepted'
        ORDER BY created_at DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(accepted.rows[0].outcome, "success");

    const roleAssigned = await pool.query(
      `SELECT outcome FROM platform.audit_events
        WHERE organization_id = $1 AND action_key = 'role.assigned'
          AND metadata_json->>'source' = 'invitation'
        ORDER BY created_at DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(roleAssigned.rows[0].outcome, "success");
  });

  it("12. existing login behavior remains intact", async () => {
    requireDb();
    const auth = await authenticateBlessBoardUser(pool, {
      email: "hq-invite@example.org",
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
      requireOrganizationId: org.id,
    });
    assert.equal(auth.ok, true, auth.message);
    assert.equal(auth.status, "authenticated");

    const session = await createV5Session(pool, {
      deploymentCode: DEPLOYMENT,
      userId: users.hq.id,
      organizationId: org.id,
      churchId: church.id,
      branchId: hqBranchId,
    });
    assert.equal(session.ok, true);
    const cookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
    const page = await request(app)
      .get("/hq/roles")
      .set("Host", HOST)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.equal(page.status, 200);
    assert.match(page.text, /Invite staff|data-bb-hq-role-invite/);
  });
});
