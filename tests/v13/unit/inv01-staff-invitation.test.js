"use strict";

/**
 * INV-01 — invitation, password, role, tenant, and session-failure contracts.
 * These do not execute a hosted login and do not mark the journey closed.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  acceptInvitation,
  inviteBlessBoardStaff,
  validatePassword,
  actorMayInvite,
  STATUS,
} = require("../../../src/blessboard/services/inviteBlessBoardStaff");
const {
  establishBlessBoardSession,
  STATUS: SESSION_STATUS,
} = require("../../../src/blessboard/services/establishBlessBoardSession");
const {
  preferCatalogueSessionRole,
} = require("../../../src/blessboard/services/blessBoardCatalogueLogin");
const {
  defaultTenantPostLoginPath,
} = require("../../../src/blessboard/http/tenantLoginHelpers");

const ROOT = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const CHURCH = "33333333-3333-4333-8333-333333333333";
const BRANCH = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";
const ACTOR = "66666666-6666-4666-8666-666666666666";

function queryClient(handler) {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return handler(sql, params);
    },
    release() {},
  };
  return {
    calls,
    async connect() {
      return client;
    },
  };
}

function invitationRow(overrides) {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    organization_id: ORG,
    church_id: CHURCH,
    branch_id: null,
    email_normalized: "staff@example.org",
    email_display: "staff@example.org",
    phone_normalized: null,
    phone_display: null,
    display_name: "Staff Invitee",
    role_key: "organisation_administrator",
    token_hash: "hash",
    status: "pending",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    invited_by_user_id: ACTOR,
    accepted_user_id: null,
    accepted_at: null,
    revoked_at: null,
    revoked_by_user_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("INV-01 staff invitation and first-login contracts", () => {
  it("accepts a matching password and rejects a short or mismatched one", () => {
    const ok = validatePassword("correct-horse", "correct-horse");
    assert.equal(ok.ok, true);
    assert.equal(ok.value, "correct-horse");
    assert.equal(validatePassword("short", "short").ok, false);
    assert.equal(validatePassword("correct-horse", "other-horse").ok, false);
  });

  it("rejects an invalid, expired, or replayed invitation before creating a user", async () => {
    const missing = queryClient(() => ({ rows: [] }));
    const invalid = await acceptInvitation(missing, {
      token: "not-a-real-invitation",
      password: "correct-horse",
      passwordConfirm: "correct-horse",
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.status, STATUS.NOT_FOUND);
    assert.ok(missing.calls.some((c) => c.sql.startsWith("ROLLBACK")));

    const replay = queryClient((sql) => {
      if (sql.includes("token_hash")) return { rows: [invitationRow({ status: "accepted" })] };
      return { rows: [] };
    });
    const replayed = await acceptInvitation(replay, {
      token: "already-used",
      password: "correct-horse",
      passwordConfirm: "correct-horse",
    });
    assert.equal(replayed.ok, false);
    assert.equal(replayed.status, STATUS.NOT_FOUND);
    assert.equal(replay.calls.some((c) => c.sql.includes("status = 'accepted'")), false);

    const expired = queryClient((sql) => {
      if (sql.includes("token_hash")) {
        return { rows: [invitationRow({ expires_at: new Date(Date.now() - 1000).toISOString() })] };
      }
      if (sql.includes("status = 'expired'")) return { rows: [{ id: "expired", status: "expired" }] };
      return { rows: [] };
    });
    const expiredResult = await acceptInvitation(expired, {
      token: "expired-token",
      password: "correct-horse",
      passwordConfirm: "correct-horse",
    });
    assert.equal(expiredResult.ok, false);
    assert.equal(expiredResult.status, STATUS.EXPIRED);
    assert.ok(expired.calls.some((c) => c.sql.includes("status = 'expired'")));
    assert.ok(expired.calls.some((c) => c.sql.startsWith("COMMIT")));
  });

  it("refuses platform administrator invites and branch-admin escalation", async () => {
    let connected = false;
    const db = {
      async connect() {
        connected = true;
        throw new Error("invitation role check must not open a database");
      },
    };
    const escalated = await inviteBlessBoardStaff(db, {
      organizationId: ORG,
      churchId: CHURCH,
      actorUserId: ACTOR,
      email: "new.staff@example.org",
      displayName: "New Staff",
      roleKey: "platform_administrator",
    });
    assert.equal(escalated.ok, false);
    assert.equal(escalated.status, STATUS.FORBIDDEN);
    assert.equal(escalated.reason, "role_escalation");
    assert.equal(connected, false);

    const branchActor = actorMayInvite(
      [
        {
          role_key: "branch_administrator",
          organization_id: ORG,
          church_id: CHURCH,
          branch_id: BRANCH,
        },
      ],
      { organizationId: ORG, churchId: CHURCH, branchId: BRANCH, roleKey: "organisation_administrator" }
    );
    assert.equal(branchActor.ok, false);
    assert.equal(branchActor.reason, "role_escalation");
  });

  it("binds the session to the invited tenant and fails closed when persistence fails", async () => {
    const user = {
      id: USER,
      email_normalized: "staff@example.org",
      email_display: "staff@example.org",
      password_hash: "hash",
      status: "active",
      display_name: "Staff Invitee",
      password_change_required: false,
    };
    const assignment = {
      id: "88888888-8888-4888-8888-888888888888",
      user_id: USER,
      organization_id: ORG,
      church_id: CHURCH,
      role_id: "99999999-9999-4999-8999-999999999999",
      role_key: "organisation_administrator",
      scope_type: "church",
      scope_id: CHURCH,
      status: "active",
      is_sensitive: false,
    };

    let created = 0;
    const okDb = queryClient((sql) => {
      if (sql.includes("FROM blessboard.users")) return { rows: [user] };
      if (sql.includes("user_role_assignments")) return { rows: [assignment] };
      return { rows: [] };
    });
    const signedIn = await establishBlessBoardSession(okDb, {
      userId: USER,
      deploymentCode: "blessboard-org-testing",
      requireOrganizationId: ORG,
      createSession: async () => {
        created += 1;
        return { ok: true, rawToken: "session-raw", session: { id: "session-1" } };
      },
    });
    assert.equal(signedIn.ok, true);
    assert.equal(signedIn.rawToken, "session-raw");
    assert.equal(signedIn.tenantContext.organizationId, ORG);
    assert.equal(signedIn.tenantContext.churchId, CHURCH);
    assert.equal(signedIn.preferredRoleKey, "organisation_administrator");
    assert.equal(created, 1);
    assert.ok(okDb.calls.some((c) => c.sql.startsWith("COMMIT")));

    const failed = queryClient((sql) => {
      if (sql.includes("FROM blessboard.users")) return { rows: [user] };
      if (sql.includes("user_role_assignments")) return { rows: [assignment] };
      return { rows: [] };
    });
    const denied = await establishBlessBoardSession(failed, {
      userId: USER,
      deploymentCode: "blessboard-org-testing",
      requireOrganizationId: ORG,
      createSession: async () => ({ ok: false, code: "persist_failed" }),
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, SESSION_STATUS.SESSION_CREATE_FAILED);
    assert.equal(denied.session, null);
    assert.equal(denied.rawToken, undefined);
    assert.ok(failed.calls.some((c) => c.sql.startsWith("ROLLBACK")));
    assert.equal(failed.calls.some((c) => c.sql.startsWith("COMMIT")), false);

    const foreign = queryClient((sql) => {
      if (sql.includes("FROM blessboard.users")) return { rows: [user] };
      if (sql.includes("user_role_assignments")) return { rows: [assignment] };
      return { rows: [] };
    });
    const wrongTenant = await establishBlessBoardSession(foreign, {
      userId: USER,
      deploymentCode: "blessboard-org-testing",
      requireOrganizationId: OTHER_ORG,
      createSession: async () => {
        throw new Error("wrong tenant must not create a session");
      },
    });
    assert.equal(wrongTenant.ok, false);
    assert.equal(wrongTenant.status, SESSION_STATUS.NO_ACTIVE_ROLE);
  });

  it("keeps multi-role portal choice and the fail-closed session save", () => {
    const preferred = preferCatalogueSessionRole(
      [
        { role_key: "branch_administrator", organization_id: ORG, church_id: CHURCH, branch_id: BRANCH },
        { role_key: "organisation_administrator", organization_id: ORG, church_id: CHURCH },
      ],
      ORG
    );
    assert.equal(preferred.role_key, "organisation_administrator");
    assert.equal(
      defaultTenantPostLoginPath([
        { role_key: "organisation_administrator" },
        { role_key: "branch_administrator" },
      ]),
      "/account"
    );
    const login = read("src/services/church/runTenantUnifiedLogin.js");
    assert.match(login, /AUTH_SESSION_SAVE_FAILED/);
    assert.match(login, /Unable to complete sign-in/);
    const persistence = read("tests/church-unified-login-session-persistence.test.js");
    assert.match(persistence, /never redirects/);
    const server = read("src/platform/http/v5FoundationServer.js");
    const postAt = server.indexOf('app.post("/login"');
    const rejectAt = server.indexOf("Sign-in must continue on the BlessBoard home site.", postAt);
    const authAt = server.indexOf("authenticateBlessBoardUser", postAt);
    assert.ok(postAt > 0 && rejectAt > postAt && authAt > rejectAt);
    const acceptPage = read("views/blessboard/v5/invite/accept.ejs");
    assert.match(acceptPage, /href="\/login"/);
    const acceptRoutes = read("src/blessboard/http/inviteAcceptRoutes.js");
    assert.doesNotMatch(acceptRoutes, /issueAuthenticatedSessionCookie/);
    const logout = server.slice(server.indexOf('app.post("/logout"'));
    assert.match(logout, /logoutAuthenticatedBrowserSession/);
    const assignments = read("src/blessboard/repositories/blessBoardRbacRepository.js");
    assert.match(assignments, /a\.status = 'active'/);
  });
});
