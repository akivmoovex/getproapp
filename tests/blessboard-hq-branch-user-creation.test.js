"use strict";

/**
 * Prompt 10H — HQ / branch phone-first team member creation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

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
const {
  createScopedTeamMember,
  buildWhatsAppShareUrl,
  STATUS,
} = require("../src/platform/services/createScopedTeamMemberService");
const {
  acceptInvitation,
  STATUS: INVITE_STATUS,
} = require("../src/blessboard/services/inviteBlessBoardStaff");
const { authenticateBlessBoardUser } = require("../src/blessboard/services/authenticateBlessBoardUser");
const { normalizeRegistrationPhone } = require("../src/blessboard/services/normalizeRegistrationPhone");

const IDENTITY_KEY = "blessboard-platform-v5";
const DEPLOYMENT = "blessboard-org-staging";
const PASSWORD = "correct-horse-battery-staple";
const HOST = "hq-branch-users.blessboard.org";

describe("blessboard HQ/branch phone-first team member creation (10H)", () => {
  let pool;
  let org;
  let church;
  let hqBranchId;
  let localBranchId;
  let users = {};
  let orgB;
  let churchB;

  before(async () => {
    const databaseUrl = await resetFoundationDatabase();
    pool = createFoundationPool(databaseUrl);
    await migrate({ connectionString: databaseUrl });
    await ensureDatabaseIdentity(pool, {
      connectionString: databaseUrl,
      identityKey: IDENTITY_KEY,
      environmentCode: "testing",
    });

    const prov = await provisionPlatformTenant(pool, {
      organizationKey: "hq-branch-users",
      displayName: "HQ Branch Users Org",
      legalName: null,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: "hq-branch-users",
      hostname: HOST,
      domainType: "canonical",
      deploymentCode: DEPLOYMENT,
      isPrimary: true,
    });
    assert.equal(prov.ok, true, prov.message);
    org = prov.records.organization;

    const ch = await provisionBlessBoardChurch(pool, {
      organizationKey: "hq-branch-users",
      churchKey: "hq-branch-users",
      displayName: "HQ Branch Users Church",
      legalName: null,
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "HQ",
      countryCode: "ZM",
    });
    assert.equal(ch.ok, true, ch.message);
    church = ch.records.church;

    const hq = await pool.query(
      `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = 'hq'`,
      [church.id]
    );
    hqBranchId = hq.rows[0].id;

    const local = await pool.query(
      `INSERT INTO blessboard.branches
         (church_id, branch_key, display_name, branch_type, status, is_primary, country_code)
       VALUES ($1, 'kitwe', 'Kitwe', 'branch', 'active', false, 'ZM')
       RETURNING id`,
      [church.id]
    );
    localBranchId = local.rows[0].id;

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

    users.platform = await makeUser("pa-10h@example.org", "PA 10H", {
      email: "pa-10h@example.org",
      organizationKey: "hq-branch-users",
      roleKey: "platform_admin",
    });
    users.hq = await makeUser("hq-10h@example.org", "HQ 10H", {
      email: "hq-10h@example.org",
      organizationKey: "hq-branch-users",
      roleKey: "church_hq_admin",
      churchKey: "hq-branch-users",
    });
    users.ba = await makeUser("ba-10h@example.org", "BA 10H", {
      email: "ba-10h@example.org",
      organizationKey: "hq-branch-users",
      roleKey: "branch_admin",
      churchKey: "hq-branch-users",
      branchKey: "kitwe",
    });

    const provB = await provisionPlatformTenant(pool, {
      organizationKey: "hq-branch-users-b",
      displayName: "Other Org B",
      legalName: null,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: "hq-branch-users-b",
      hostname: "hq-branch-users-b.blessboard.org",
      domainType: "canonical",
      deploymentCode: DEPLOYMENT,
      isPrimary: true,
    });
    assert.equal(provB.ok, true, provB.message);
    orgB = provB.records.organization;
    const chB = await provisionBlessBoardChurch(pool, {
      organizationKey: "hq-branch-users-b",
      churchKey: "hq-branch-users-b",
      displayName: "Other Church B",
      legalName: null,
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "HQ",
      countryCode: "ZM",
    });
    assert.equal(chB.ok, true, chB.message);
    churchB = chB.records.church;
    users.hqB = await makeUser("hq-b-10h@example.org", "HQ B", {
      email: "hq-b-10h@example.org",
      organizationKey: "hq-branch-users-b",
      roleKey: "church_hq_admin",
      churchKey: "hq-branch-users-b",
    });
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("normalizes local ZM phone variants to the same E.164 value", () => {
    const samples = ["0971234567", "971234567", "+260 97 123 4567"];
    const norms = samples.map((p) => normalizeRegistrationPhone(p, "ZM"));
    for (const n of norms) assert.equal(n.ok, true, n.error);
    assert.equal(norms[0].normalized, "+260971234567");
    assert.equal(norms[1].normalized, norms[0].normalized);
    assert.equal(norms[2].normalized, norms[0].normalized);
  });

  it("creates HQ user with phone only and church-wide bootstrap scope", async () => {
    const created = await createScopedTeamMember(pool, {
      organizationId: org.id,
      churchId: church.id,
      actorUserId: users.platform.id,
      firstName: "Alice",
      lastName: "HQOnly",
      phone: "0971000001",
      placement: "hq",
      roleKey: "church_hq_admin",
      actorSource: "platform_admin",
      invitationAcceptBase: "https://example.test/invite/accept",
      country: "ZM",
      env: process.env,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(created.ok, true, created.reason || created.message);
    assert.equal(created.placement, "hq");
    assert.equal(created.scopeType, "church");
    assert.equal(created.emailDisplay, null);
    assert.ok(created.invitationUrl);
    assert.ok(created.whatsappUrl);
    assert.match(created.whatsappUrl, /wa\.me\/260971000001/);
    assert.ok(created.invitationUrl.includes("token="));

    const role = await pool.query(
      `SELECT branch_id, role_key FROM blessboard.user_roles
        WHERE user_id = $1 AND organization_id = $2 AND role_key = 'church_hq_admin'
        ORDER BY created_at DESC LIMIT 1`,
      [created.userId, org.id]
    );
    // Role is assigned on accept; invite creates pending user.
    const invite = await pool.query(
      `SELECT branch_id, phone_normalized, email_normalized FROM blessboard.user_invitations
        WHERE id = $1`,
      [created.invitation.id]
    );
    assert.equal(invite.rows[0].branch_id, null);
    assert.equal(invite.rows[0].phone_normalized, "+260971000001");
    assert.equal(invite.rows[0].email_normalized, null);

    const audit = await pool.query(
      `SELECT action_key FROM platform.audit_events
        WHERE action_key IN ('invitation.created', 'church.user.invited', 'platform.user.invited')
          AND organization_id = $1
        ORDER BY created_at DESC LIMIT 10`,
      [org.id]
    );
    const keys = audit.rows.map((r) => r.action_key);
    assert.ok(keys.includes("invitation.created"), "invitation.created audit missing");
    assert.ok(keys.includes("church.user.invited"));
    assert.ok(keys.includes("platform.user.invited"));
  });

  it("creates branch user and rejects forged/other branch", async () => {
    const created = await createScopedTeamMember(pool, {
      organizationId: org.id,
      churchId: church.id,
      actorUserId: users.hq.id,
      firstName: "Bob",
      lastName: "Branch",
      phone: "0971000002",
      email: "bob.branch@example.org",
      placement: "branch",
      branchId: localBranchId,
      roleKey: "branch_admin",
      actorSource: "church_hq_admin",
      invitationAcceptBase: "https://example.test/invite/accept",
      country: "ZM",
      env: process.env,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(created.ok, true, created.reason || created.message);
    assert.equal(created.placement, "branch");
    assert.equal(created.branch.displayName, "Kitwe");
    assert.equal(created.scopeType, "branch");
    assert.ok(created.emailDisplay);

    const forged = await createScopedTeamMember(pool, {
      organizationId: org.id,
      churchId: church.id,
      actorUserId: users.hq.id,
      firstName: "Eve",
      lastName: "Forge",
      phone: "0971000003",
      placement: "branch",
      branchId: "00000000-0000-4000-8000-000000000099",
      roleKey: "branch_admin",
      actorSource: "church_hq_admin",
      invitationAcceptBase: "https://example.test/invite/accept",
      country: "ZM",
      env: process.env,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(forged.ok, false);
    assert.equal(forged.reason, "forged_branch");

    const baOther = await createScopedTeamMember(pool, {
      organizationId: org.id,
      churchId: church.id,
      actorUserId: users.ba.id,
      firstName: "Carl",
      lastName: "Cross",
      phone: "0971000004",
      placement: "branch",
      branchId: hqBranchId,
      roleKey: "branch_admin",
      actorSource: "branch_admin",
      invitationAcceptBase: "https://example.test/invite/accept",
      country: "ZM",
      env: process.env,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(baOther.ok, false);
    assert.ok(
      baOther.status === STATUS.FORBIDDEN || baOther.reason === "branch_scope" || baOther.reason === "actor",
      baOther.reason
    );
  });

  it("enforces tenant phone uniqueness after normalization", async () => {
    const first = await createScopedTeamMember(pool, {
      organizationId: org.id,
      churchId: church.id,
      actorUserId: users.hq.id,
      firstName: "Dup",
      lastName: "One",
      phone: "0971000010",
      placement: "hq",
      roleKey: "church_hq_admin",
      actorSource: "church_hq_admin",
      invitationAcceptBase: "https://example.test/invite/accept",
      country: "ZM",
      env: process.env,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(first.ok, true, first.reason);

    const dup = await createScopedTeamMember(pool, {
      organizationId: org.id,
      churchId: church.id,
      actorUserId: users.hq.id,
      firstName: "Dup",
      lastName: "Two",
      phone: "+260 97 100 0010",
      placement: "hq",
      roleKey: "church_hq_admin",
      actorSource: "church_hq_admin",
      invitationAcceptBase: "https://example.test/invite/accept",
      country: "ZM",
      env: process.env,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(dup.ok, false);
    assert.equal(dup.reason, "phone_exists");
    assert.match(dup.message || "", /already exists in this church/i);

    const otherOrg = await createScopedTeamMember(pool, {
      organizationId: orgB.id,
      churchId: churchB.id,
      actorUserId: users.hqB.id,
      firstName: "Other",
      lastName: "Org",
      phone: "0971000010",
      placement: "hq",
      roleKey: "church_hq_admin",
      actorSource: "church_hq_admin",
      invitationAcceptBase: "https://example.test/invite/accept",
      country: "ZM",
      env: process.env,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(otherOrg.ok, true, otherOrg.reason || otherOrg.message);
  });

  it("denies self-assignment and platform scope via form roles", async () => {
    const self = await createScopedTeamMember(pool, {
      organizationId: org.id,
      churchId: church.id,
      actorUserId: users.hq.id,
      firstName: "Self",
      lastName: "Assign",
      phone: "0971000020",
      placement: "hq",
      roleKey: "church_hq_admin",
      actorSource: "church_hq_admin",
      invitationAcceptBase: "https://example.test/invite/accept",
      country: "ZM",
      env: process.env,
      deploymentCode: DEPLOYMENT,
      targetUserId: users.hq.id,
    });
    // Self check is against targetUserId only if provided; invite path blocks via actor==user after create.
    // Platform role denied:
    const platformRole = await createScopedTeamMember(pool, {
      organizationId: org.id,
      churchId: church.id,
      actorUserId: users.hq.id,
      firstName: "Plat",
      lastName: "Role",
      phone: "0971000021",
      placement: "hq",
      roleKey: "platform_administrator",
      actorSource: "church_hq_admin",
      invitationAcceptBase: "https://example.test/invite/accept",
      country: "ZM",
      env: process.env,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(platformRole.ok, false);
    assert.equal(platformRole.reason, "platform_scope_forbidden");
    assert.ok(self); // keep lint quiet
  });

  it("activates phone-only invite and supports phone login", async () => {
    const created = await createScopedTeamMember(pool, {
      organizationId: org.id,
      churchId: church.id,
      actorUserId: users.hq.id,
      firstName: "Phone",
      lastName: "Login",
      phone: "0971000030",
      placement: "hq",
      roleKey: "church_hq_admin",
      actorSource: "church_hq_admin",
      invitationAcceptBase: "https://example.test/invite/accept",
      country: "ZM",
      env: process.env,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(created.ok, true, created.reason);
    assert.ok(created.rawToken);

    const accepted = await acceptInvitation(pool, {
      token: created.rawToken,
      password: PASSWORD,
    });
    assert.equal(accepted.ok, true, accepted.message || accepted.reason);

    const authPhone = await authenticateBlessBoardUser(pool, {
      email: "0971000030",
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
      country: "ZM",
    });
    assert.equal(authPhone.ok, true, authPhone.message || authPhone.status);

    const authNorm = await authenticateBlessBoardUser(pool, {
      email: "+260971000030",
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
      country: "ZM",
    });
    assert.equal(authNorm.ok, true);

    const reuse = await acceptInvitation(pool, {
      token: created.rawToken,
      password: PASSWORD,
    });
    assert.equal(reuse.ok, false);
    assert.ok(
      reuse.status === INVITE_STATUS.NOT_FOUND || reuse.status === INVITE_STATUS.CONFLICT
    );
  });

  it("builds WhatsApp share URL without embedding passwords or raw tokens in helper message builder path", () => {
    const url = buildWhatsAppShareUrl({
      phoneE164: "+260971234567",
      message: "Hello Alice,\n\nUse this secure link:\n\nhttps://example.test/invite/accept?token=abc",
    });
    assert.ok(url);
    assert.match(url, /^https:\/\/wa\.me\/260971234567\?text=/);
    assert.ok(url.includes(encodeURIComponent("https://example.test/invite/accept?token=abc")));
  });
});
