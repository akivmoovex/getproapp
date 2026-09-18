"use strict";

/**
 * BB-BUG-001 / BB-1.1-022 — P0 unauthorized BlessBoard website publish.
 *
 * Restricted catalogue roles (website_editor) paired with the legacy login
 * baseline must not publish via the direct /c/:org/website/publish endpoint.
 * Authorized publishers still publish. Cross-tenant / forged body IDs fail.
 * Save Draft remains available to editors.
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
const { CSRF_FIELD, CSRF_COOKIE, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const rbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");
const {
  authorize,
  listEffectivePermissions,
} = require("../src/blessboard/services/blessBoardRbacAuthorizationService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "p0pub-a.blessboard.org";
const HOST_B = "p0pub-b.blessboard.org";

function baseEnv() {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
    DATABASE_URL: "postgres://unused/local",
    SESSION_SECRET: "a".repeat(40),
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
  };
}

function cookieHeader(rawToken, csrf) {
  return `${DEFAULT_V5_COOKIE}=${rawToken}; ${CSRF_COOKIE}=${csrf}`;
}

describe("BB-BUG-001 P0 BlessBoard publish authorization", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let branchA;
  let branchB;
  let users = {};

  function skipIfNeeded() {
    if (skipSuite) {
      // node:test skip via assert fail message when setup failed
      assert.ok(false, `setup unavailable: ${skipReason}`);
    }
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

      const platformA = await provisionPlatformTenant(pool, {
        organizationKey: "p0pub-a",
        displayName: "P0 Pub A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "p0pub-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(platformA.ok, true, platformA.message);
      orgA = platformA.records.organization;

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "p0pub-a",
        churchKey: "p0pub-a",
        displayName: "P0 Pub Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      branchA = chA.records.hqBranch || chA.records.primaryBranch;

      const platformB = await provisionPlatformTenant(pool, {
        organizationKey: "p0pub-b",
        displayName: "P0 Pub B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "p0pub-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(platformB.ok, true, platformB.message);
      orgB = platformB.records.organization;

      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "p0pub-b",
        churchKey: "p0pub-b",
        displayName: "P0 Pub Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;
      branchB = chB.records.hqBranch || chB.records.primaryBranch;

      async function makeUser(email, displayName, organizationId) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      async function assignCatalogue(userId, roleKey, scope) {
        const role = await rbacRepo.findRoleByKey(pool, roleKey);
        assert.ok(role, roleKey);
        await rbacRepo.insertAssignment(pool, {
          userId,
          organizationId: orgA.id,
          churchId: churchA.id,
          roleId: role.id,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          assignedByUserId: userId,
          assignmentOrigin: "system",
          assignmentReason: "p0 publish auth",
        });
      }

      // Authorized publisher: legacy HQ only (no catalogue restriction).
      users.hq = await makeUser("p0-hq@example.test", "HQ Publisher", orgA.id);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "p0-hq@example.test",
            organizationKey: "p0pub-a",
            roleKey: "church_hq_admin",
            churchKey: "p0pub-a",
          })
        ).ok,
        true
      );

      // Restricted: QA-style dual role — legacy login baseline + website_editor.
      users.editor = await makeUser("p0-editor@example.test", "Restricted Editor", orgA.id);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "p0-editor@example.test",
            organizationKey: "p0pub-a",
            roleKey: "church_hq_admin",
            churchKey: "p0pub-a",
          })
        ).ok,
        true
      );
      await assignCatalogue(users.editor.user.id, "website_editor", {
        scopeType: "church",
        scopeId: churchA.id,
      });

      // Authorized catalogue publisher + legacy baseline.
      users.publisher = await makeUser("p0-publisher@example.test", "Catalogue Publisher", orgA.id);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "p0-publisher@example.test",
            organizationKey: "p0pub-a",
            roleKey: "church_hq_admin",
            churchKey: "p0pub-a",
          })
        ).ok,
        true
      );
      await assignCatalogue(users.publisher.user.id, "website_publisher", {
        scopeType: "church",
        scopeId: churchA.id,
      });

      // Foreign HQ on org B.
      users.hqB = await makeUser("p0-hq-b@example.test", "HQ B", orgB.id);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "p0-hq-b@example.test",
            organizationKey: "p0pub-b",
            roleKey: "church_hq_admin",
            churchKey: "p0pub-b",
          })
        ).ok,
        true
      );

      // Branch admin on A — for cross-branch probe.
      await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus', 'Campus', 'branch', 'active', false, 'UTC', 'US')`,
        [churchA.id]
      );
      const campus = await pool.query(
        `SELECT id, branch_key FROM blessboard.branches
          WHERE church_id = $1 AND branch_key = 'campus' LIMIT 1`,
        [churchA.id]
      );
      const campusBranch = campus.rows[0];
      users.branch = await makeUser("p0-branch@example.test", "Branch Admin", orgA.id);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "p0-branch@example.test",
            organizationKey: "p0pub-a",
            roleKey: "branch_admin",
            churchKey: "p0pub-a",
            branchKey: "campus",
          })
        ).ok,
        true
      );
      users.campusBranch = campusBranch;

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("authorize: dual-role website_editor cannot website.publish; legacy HQ and publisher can", async () => {
    skipIfNeeded();
    const tenant = {
      resolved: true,
      organization: orgA,
      church: churchA,
    };
    const ctx = {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: null,
    };

    const editorPublish = await authorize(pool, {
      actor: { userId: users.editor.user.id },
      permission: "website.publish",
      tenantContext: tenant,
      resourceContext: ctx,
    });
    assert.equal(editorPublish.allowed, false, editorPublish.reasonCode);

    const editorEdit = await authorize(pool, {
      actor: { userId: users.editor.user.id },
      permission: "website.edit",
      tenantContext: tenant,
      resourceContext: ctx,
    });
    assert.equal(editorEdit.allowed, true, editorEdit.reasonCode);

    const listed = await listEffectivePermissions(pool, {
      actor: { userId: users.editor.user.id },
      tenantContext: tenant,
      resourceContext: ctx,
    });
    assert.ok(listed.permissions.includes("website.edit"));
    assert.equal(listed.permissions.includes("website.publish"), false);

    const hqPublish = await authorize(pool, {
      actor: { userId: users.hq.user.id },
      permission: "website.publish",
      tenantContext: tenant,
      resourceContext: ctx,
    });
    assert.equal(hqPublish.allowed, true, hqPublish.reasonCode);

    const publisherPublish = await authorize(pool, {
      actor: { userId: users.publisher.user.id },
      permission: "website.publish",
      tenantContext: tenant,
      resourceContext: ctx,
    });
    assert.equal(publisherPublish.allowed, true, publisherPublish.reasonCode);
  });

  it("unauthorized direct POST /c/:org/website/publish is rejected", async () => {
    skipIfNeeded();
    const csrf = issueCsrfToken(baseEnv());
    const denied = await request(app)
      .post("/c/p0pub-a/website/publish")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(users.editor.rawToken, csrf))
      .set("Accept", "application/json")
      .set("X-CSRF-Token", csrf)
      .send({ [CSRF_FIELD]: csrf, confirm_publish: "1" });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.ok, false);
    assert.equal(denied.body.code, "forbidden");

    const hqDeniedReview = await request(app)
      .post("/hq/website/publish")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(users.editor.rawToken, csrf))
      .set("X-CSRF-Token", csrf)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, confirm_publish: "1" });
    assert.equal(hqDeniedReview.status, 403);
  });

  it("authorized publisher reaches publish (not auth-rejected)", async () => {
    skipIfNeeded();
    const csrf = issueCsrfToken(baseEnv());
    const allowed = await request(app)
      .post("/c/p0pub-a/website/publish")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(users.hq.rawToken, csrf))
      .set("Accept", "application/json")
      .set("X-CSRF-Token", csrf)
      .send({ [CSRF_FIELD]: csrf, confirm_publish: "1" });
    // Auth passed: readiness may still block with 400, never 403.
    assert.notEqual(allowed.status, 403, JSON.stringify(allowed.body));
    assert.ok([200, 400].includes(allowed.status), `status=${allowed.status}`);
    if (allowed.status === 400) {
      assert.notEqual(allowed.body.code, "forbidden");
    }
  });

  it("cross-tenant and forged body IDs are rejected", async () => {
    skipIfNeeded();
    const csrf = issueCsrfToken(baseEnv());

    const cross = await request(app)
      .post("/c/p0pub-a/website/publish")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(users.hqB.rawToken, csrf))
      .set("Accept", "application/json")
      .set("X-CSRF-Token", csrf)
      .send({ [CSRF_FIELD]: csrf, confirm_publish: "1" });
    assert.equal(cross.status, 403);

    const forged = await request(app)
      .post("/c/p0pub-a/website/publish")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(users.hq.rawToken, csrf))
      .set("Accept", "application/json")
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        confirm_publish: "1",
        organizationId: orgB.id,
        churchId: churchB.id,
        branchId: branchB && branchB.id,
      });
    assert.equal(forged.status, 403);
    assert.equal(forged.body.code, "forbidden");
  });

  it("cross-branch publish attempt is rejected for branch-scoped admin", async () => {
    skipIfNeeded();
    const csrf = issueCsrfToken(baseEnv());
    // Church-wide direct publish with branch-only grants must fail.
    const churchWide = await request(app)
      .post("/c/p0pub-a/website/publish")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(users.branch.rawToken, csrf))
      .set("Accept", "application/json")
      .set("X-CSRF-Token", csrf)
      .send({ [CSRF_FIELD]: csrf, confirm_publish: "1" });
    assert.equal(churchWide.status, 403);

    // Sibling/wrong branch key under church A.
    const wrongBranch = await request(app)
      .post("/c/p0pub-a/hq/website/publish")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(users.branch.rawToken, csrf))
      .set("Accept", "application/json")
      .set("X-CSRF-Token", csrf)
      .send({ [CSRF_FIELD]: csrf, confirm_publish: "1" });
    assert.equal(wrongBranch.status, 403);
  });

  it("Save Draft still works for restricted editor; Preview route is not publish", async () => {
    skipIfNeeded();
    const csrf = issueCsrfToken(baseEnv());
    const draft = await request(app)
      .post("/hq/content/api/inline-field")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(users.editor.rawToken, csrf))
      .set("Accept", "application/json")
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Editor draft only",
      });
    assert.equal(draft.status, 200, draft.text);
    assert.equal(draft.body.ok, true);
    assert.equal(draft.body.published, false);

    const preview = await request(app)
      .get("/c/p0pub-a?website_mode=draft")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.editor.rawToken}`);
    assert.ok([200, 301, 302, 303].includes(preview.status));
  });
});
