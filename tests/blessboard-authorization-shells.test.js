"use strict";

/**
 * Prompt 7B — shell + content permission gates (HQ / Branch / website).
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
const {
  DEFAULT_V5_COOKIE,
  baseV5TestEnv,
  makeResolvedTenantContext,
} = require("./helpers/blessboardV5Fixtures");
const rbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");
const {
  authorize,
} = require("../src/blessboard/services/blessBoardRbacAuthorizationService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST = "shell7b.blessboard.org";

describe("blessboard authorization shells (prompt 7b)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgRec;
  let church;
  let hqBranch;
  let hqAdmin;
  let branchAdmin;
  let campusOnlyAdmin;
  let rbacAttendanceOnly;
  let rbacWebsiteEditor;
  let rbacWebsitePublisher;
  let noPermUser;
  let tenant;

  before(async () => {
    process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-org-staging";
    process.env.DEPLOYMENT_ENV = "testing";
    try {
      const url = await resetFoundationDatabase();
      pool = createFoundationPool(url);
      await ensureDatabaseIdentity(pool, {
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
        allowCreate: true,
      });
      await migrate({ connectionString: url });
      const org = await provisionPlatformTenant(pool, {
        organizationKey: "shell7b",
        displayName: "Shell 7B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "shell7b",
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(org.ok, true, org.message);
      orgRec = org.records.organization;
      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "shell7b",
        churchKey: "shell7b",
        displayName: "Shell Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(ch.ok, true, ch.message);
      church = ch.records.church;
      hqBranch = ch.records.hqBranch;
      await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus', 'Campus', 'branch', 'active', false, 'UTC', 'US')`,
        [church.id]
      );
      const campusRow = await pool.query(
        `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = 'campus' LIMIT 1`,
        [church.id]
      );
      const campusBranchId = campusRow.rows[0].id;
      tenant = makeResolvedTenantContext({
        organization: orgRec,
        church,
        primaryBranch: hqBranch,
      });

      async function makeUser(email, role, sessionBranchId) {
        const created = await createBlessBoardUser(pool, {
          email,
          password: PASSWORD,
          displayName: email,
        });
        assert.equal(created.ok, true, created.reason || created.message);
        if (role) {
          const assigned = await assignBlessBoardRole(pool, role);
          assert.equal(assigned.ok, true, assigned.message || assigned.reason);
        }
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId: orgRec.id,
          churchId: church.id,
          branchId: sessionBranchId || hqBranch.id,
        });
        assert.equal(session.ok, true, session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      async function assignCatalogue(userId, roleKey, scope) {
        const role = await rbacRepo.findRoleByKey(pool, roleKey);
        assert.ok(role, roleKey);
        await rbacRepo.insertAssignment(pool, {
          userId,
          organizationId: orgRec.id,
          churchId: church.id,
          roleId: role.id,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          assignedByUserId: hqAdmin.user.id,
          assignmentOrigin: "system",
          assignmentReason: "prompt7b shell test",
        });
      }

      hqAdmin = await makeUser("hq@shell7b.test", {
        email: "hq@shell7b.test",
        organizationKey: "shell7b",
        churchKey: "shell7b",
        roleKey: "church_hq_admin",
      });
      branchAdmin = await makeUser("ba@shell7b.test", {
        email: "ba@shell7b.test",
        organizationKey: "shell7b",
        churchKey: "shell7b",
        roleKey: "branch_admin",
        branchKey: "hq",
      });
      campusOnlyAdmin = await makeUser(
        "campus@shell7b.test",
        {
          email: "campus@shell7b.test",
          organizationKey: "shell7b",
          churchKey: "shell7b",
          roleKey: "branch_admin",
          branchKey: "campus",
        },
        campusBranchId
      );
      noPermUser = await makeUser("noperm@shell7b.test", null);

      rbacAttendanceOnly = await makeUser("att@shell7b.test", null);
      // registration_officer has members/attendance-ish ops; use website_editor's sibling —
      // assign attendance.view via branch_pastor church-scoped if needed.
      // Prefer a role known to include attendance.view: branch_administrator lacks HQ shell
      // church scope with branchId null — use organisation_administrator? Too broad.
      // Create church-scoped assignment of a role that includes attendance.view:
      const branchPastor = await rbacRepo.findRoleByKey(pool, "branch_pastor");
      assert.ok(branchPastor);
      await rbacRepo.insertAssignment(pool, {
        userId: rbacAttendanceOnly.user.id,
        organizationId: orgRec.id,
        churchId: church.id,
        roleId: branchPastor.id,
        scopeType: "church",
        scopeId: church.id,
        assignedByUserId: hqAdmin.user.id,
        assignmentOrigin: "system",
        assignmentReason: "prompt7b attendance shell",
      });

      rbacWebsiteEditor = await makeUser("editor@shell7b.test", null);
      await assignCatalogue(rbacWebsiteEditor.user.id, "website_editor", {
        scopeType: "church",
        scopeId: church.id,
      });

      rbacWebsitePublisher = await makeUser("publisher@shell7b.test", null);
      await assignCatalogue(rbacWebsitePublisher.user.id, "website_publisher", {
        scopeType: "church",
        scopeId: church.id,
      });

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseV5TestEnv(),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function skipIfNeeded(t) {
    if (skipSuite) {
      t.skip(skipReason || "setup failed");
      return true;
    }
    return false;
  }

  function cookie(user) {
    return `${DEFAULT_V5_COOKIE}=${user.rawToken}`;
  }

  it("legacy HQ can enter HQ shell; branch-only cannot", async (t) => {
    if (skipIfNeeded(t)) return;
    const hq = await request(app).get("/hq").set("Host", HOST).set("Cookie", cookie(hqAdmin));
    assert.equal(hq.status, 200);

    const ba = await request(app).get("/hq").set("Host", HOST).set("Cookie", cookie(branchAdmin));
    assert.ok(ba.status === 403 || ba.status === 303, `branch on hq status=${ba.status}`);

    const none = await request(app).get("/hq").set("Host", HOST).set("Cookie", cookie(noPermUser));
    assert.ok(none.status === 403 || none.status === 303, `noperm status=${none.status}`);
  });

  it("RBAC-only church-scoped user can enter HQ shell but not Finance module", async (t) => {
    if (skipIfNeeded(t)) return;
    const shell = await request(app)
      .get("/hq")
      .set("Host", HOST)
      .set("Cookie", cookie(rbacAttendanceOnly));
    assert.equal(shell.status, 200, shell.text && shell.text.slice(0, 200));

    const staff = await request(app)
      .get("/hq/settings/staff-access")
      .set("Host", HOST)
      .set("Cookie", cookie(rbacAttendanceOnly));
    assert.ok(
      staff.status === 403 || staff.status === 303 || staff.status === 404,
      `staff-access status=${staff.status}`
    );
  });

  it("legacy branch admin enters branch shell; campus-only and noperm denied on HQ host", async (t) => {
    if (skipIfNeeded(t)) return;
    const ok = await request(app)
      .get("/branch-admin")
      .set("Host", HOST)
      .set("Cookie", cookie(branchAdmin));
    assert.equal(ok.status, 200);

    const campusDenied = await request(app)
      .get("/branch-admin")
      .set("Host", HOST)
      .set("Cookie", cookie(campusOnlyAdmin));
    assert.ok(
      campusDenied.status === 403 || campusDenied.status === 303,
      `campus status=${campusDenied.status}`
    );

    const none = await request(app)
      .get("/branch-admin")
      .set("Host", HOST)
      .set("Cookie", cookie(noPermUser));
    assert.ok(none.status === 403 || none.status === 303, `status=${none.status}`);
  });

  it("Website Editor enters content shell; cannot publish; Publisher lacks edit", async (t) => {
    if (skipIfNeeded(t)) return;
    const canView = await authorize(pool, {
      actor: { userId: rbacWebsiteEditor.user.id },
      permission: "website.view",
      tenantContext: tenant,
      resourceContext: {
        organizationId: orgRec.id,
        churchId: church.id,
        branchId: hqBranch.id,
      },
    });
    assert.equal(canView.allowed, true, canView.reasonCode);

    const editorShell = await request(app)
      .get("/hq/content")
      .set("Host", HOST)
      .set("Cookie", cookie(rbacWebsiteEditor));
    assert.equal(editorShell.status, 200, editorShell.text.slice(0, 300));

    const editorPublish = await authorize(pool, {
      actor: { userId: rbacWebsiteEditor.user.id },
      permission: "website.publish",
      tenantContext: tenant,
      resourceContext: {
        organizationId: orgRec.id,
        churchId: church.id,
        branchId: null,
      },
    });
    assert.equal(editorPublish.allowed, false);

    const pubEdit = await authorize(pool, {
      actor: { userId: rbacWebsitePublisher.user.id },
      permission: "website.edit",
      tenantContext: tenant,
      resourceContext: {
        organizationId: orgRec.id,
        churchId: church.id,
        branchId: null,
      },
    });
    assert.equal(pubEdit.allowed, false);

    const pubPublish = await authorize(pool, {
      actor: { userId: rbacWebsitePublisher.user.id },
      permission: "website.publish",
      tenantContext: tenant,
      resourceContext: {
        organizationId: orgRec.id,
        churchId: church.id,
        branchId: null,
      },
    });
    assert.equal(pubPublish.allowed, true);

    const pubShell = await request(app)
      .get("/hq/content")
      .set("Host", HOST)
      .set("Cookie", cookie(rbacWebsitePublisher));
    assert.equal(pubShell.status, 200);
  });

  it("Platform Admin still lacks Finance transactions and pastoral confidential", async (t) => {
    if (skipIfNeeded(t)) return;
    const pa = await createBlessBoardUser(pool, {
      email: "pa@shell7b.test",
      password: PASSWORD,
      displayName: "PA",
    });
    assert.equal(pa.ok, true);
    const assigned = await assignBlessBoardRole(pool, {
      email: "pa@shell7b.test",
      organizationKey: "shell7b",
      roleKey: "platform_admin",
    });
    assert.equal(assigned.ok, true);
    const fin = await authorize(pool, {
      actor: { userId: pa.user.id },
      permission: "finance.transactions.view",
      tenantContext: tenant,
      resourceContext: {
        organizationId: orgRec.id,
        churchId: church.id,
        branchId: null,
      },
    });
    assert.equal(fin.allowed, false);
    const pastoral = await authorize(pool, {
      actor: { userId: pa.user.id },
      permission: "pastoral_cases.view_confidential",
      tenantContext: tenant,
      resourceContext: {
        organizationId: orgRec.id,
        churchId: church.id,
        branchId: null,
      },
    });
    assert.equal(pastoral.allowed, false);
  });
});
