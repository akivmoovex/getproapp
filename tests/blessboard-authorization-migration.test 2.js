"use strict";

/**
 * Prompt 7 authorization migration — permission gates + legacy compatibility.
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
  authorize,
  listEffectivePermissions,
} = require("../src/blessboard/services/blessBoardRbacAuthorizationService");
const {
  requireActorPermission,
} = require("../src/blessboard/services/requireActorPermission");
const {
  resolvePublishCapability,
} = require("../src/blessboard/services/websiteDraftReviewService");
const rbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");
const { makeResolvedTenantContext } = require("./helpers/blessboardV5Fixtures");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";

describe("blessboard authorization migration", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let orgA;
  let churchA;
  let branchA;
  let tenantA;
  let actorHq;
  let actorMember;
  let actorEditor;
  let actorPublisher;

  function requireDb() {
    if (skipSuite) assert.fail(`Setup unavailable: ${skipReason}`);
  }

  before(async () => {
    process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-org-staging";
    process.env.DEPLOYMENT_ENV = "testing";
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const platform = await provisionPlatformTenant(pool, {
        organizationKey: "authz-mig-a",
        displayName: "Authz Mig Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "authz-mig-a",
        hostname: "authz-mig-a.blessboard.org",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(platform.ok, true, platform.message);
      orgA = platform.records.organization;

      const church = await provisionBlessBoardChurch(pool, {
        organizationKey: "authz-mig-a",
        churchKey: "authz-mig-a",
        displayName: "Authz Mig Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(church.ok, true, church.message);
      churchA = church.records.church;
      branchA = church.records.hqBranch;
      tenantA = makeResolvedTenantContext({
        organization: orgA,
        church: churchA,
        primaryBranch: branchA,
      });

      async function makeUser(email, name) {
        const created = await createBlessBoardUser(pool, {
          email,
          password: PASSWORD,
          displayName: name,
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      actorHq = await makeUser("hq@authz-mig.test", "HQ");
      actorMember = await makeUser("member@authz-mig.test", "Member");
      actorEditor = await makeUser("editor@authz-mig.test", "Editor");
      actorPublisher = await makeUser("publisher@authz-mig.test", "Publisher");

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "hq@authz-mig.test",
            organizationKey: "authz-mig-a",
            roleKey: "church_hq_admin",
            churchKey: "authz-mig-a",
          })
        ).ok,
        true
      );

      async function assignCatalogue(userId, roleKey) {
        const role = await rbacRepo.findRoleByKey(pool, roleKey);
        assert.ok(role, roleKey);
        await rbacRepo.insertAssignment(pool, {
          userId,
          organizationId: orgA.id,
          churchId: churchA.id,
          roleId: role.id,
          scopeType: "church",
          scopeId: churchA.id,
          assignedByUserId: actorHq.id,
          assignmentOrigin: "system",
          assignmentReason: "authz migration test",
        });
      }

      await assignCatalogue(actorEditor.id, "website_editor");
      await assignCatalogue(actorPublisher.id, "website_publisher");
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("legacy HQ receives announcements.view via compatibility mapping", async () => {
    requireDb();
    const authz = await authorize(pool, {
      actor: { userId: actorHq.id },
      permission: "announcements.view",
      tenantContext: tenantA,
      resourceContext: {
        organizationId: orgA.id,
        churchId: churchA.id,
      },
    });
    assert.equal(authz.allowed, true, authz.reasonCode);
  });

  it("member without role is denied attendance.view", async () => {
    requireDb();
    const authz = await authorize(pool, {
      actor: { userId: actorMember.id },
      permission: "attendance.view",
      tenantContext: tenantA,
      resourceContext: {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
      },
    });
    assert.equal(authz.allowed, false);
  });

  it("unknown permission key denies", async () => {
    requireDb();
    const authz = await authorize(pool, {
      actor: { userId: actorHq.id },
      permission: "not.a.real.permission",
      tenantContext: tenantA,
      resourceContext: { organizationId: orgA.id, churchId: churchA.id },
    });
    assert.equal(authz.allowed, false);
  });

  it("website.edit does not imply website.publish for website_editor", async () => {
    requireDb();
    const edit = await authorize(pool, {
      actor: { userId: actorEditor.id },
      permission: "website.edit",
      tenantContext: tenantA,
      resourceContext: { organizationId: orgA.id, churchId: churchA.id },
    });
    assert.equal(edit.allowed, true, edit.reasonCode);
    const publish = await authorize(pool, {
      actor: { userId: actorEditor.id },
      permission: "website.publish",
      tenantContext: tenantA,
      resourceContext: { organizationId: orgA.id, churchId: churchA.id },
    });
    assert.equal(publish.allowed, false);
    const cap = resolvePublishCapability({ canPublish: false, actorRole: null, settings: null });
    assert.equal(cap.action, "forbidden");
  });

  it("website_publisher may publish", async () => {
    requireDb();
    const publish = await authorize(pool, {
      actor: { userId: actorPublisher.id },
      permission: "website.publish",
      tenantContext: tenantA,
      resourceContext: { organizationId: orgA.id, churchId: churchA.id },
    });
    assert.equal(publish.allowed, true, publish.reasonCode);
    const cap = resolvePublishCapability({
      canPublish: true,
      actorRole: "church_hq_admin",
      settings: { hqDirectPublishEnabled: true },
    });
    assert.equal(cap.action, "publish");
  });

  it("requireActorPermission denies forged member for finance", async () => {
    requireDb();
    const denied = await requireActorPermission(pool, {
      actorUserId: actorMember.id,
      tenant: tenantA,
      permission: "finance.transactions.view",
      branchId: branchA.id,
    });
    assert.equal(denied.ok, false);
  });

  it("HQ effective permissions include roles.view and website.publish", async () => {
    requireDb();
    const listed = await listEffectivePermissions(pool, {
      actor: { userId: actorHq.id },
      tenantContext: tenantA,
      resourceContext: { organizationId: orgA.id, churchId: churchA.id },
    });
    assert.ok(listed.permissions.includes("roles.view"));
    assert.ok(listed.permissions.includes("website.publish"));
    assert.ok(listed.permissions.includes("announcements.publish"));
  });

  it("attendance.record authorizeActor path requires permission", async () => {
    requireDb();
    const ok = await requireActorPermission(pool, {
      actorUserId: actorHq.id,
      tenant: tenantA,
      permission: "attendance.record",
      branchId: branchA.id,
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.mode, "hq");
  });
});
