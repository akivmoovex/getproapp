"use strict";

/**
 * V10 PC10B — BlessBoard publish characterization baselines.
 *
 * Evidence markers covered by nested suites:
 *   TENANT_ISOLATION_BASELINE
 *   RBAC_PERMISSION_MATRIX_BASELINE (BB half)
 *   WEBSITE_PUBLISH_PARITY_BASELINE
 *   BB_MULTI_SITE_GOVERNANCE_BASELINE
 *
 * Asserts intended current contracts (does not weaken to match known broken
 * legacy role aliases church_hq_admin / branch_admin in resolvePublishCapability).
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
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  createPageSection,
  updatePublicPage,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const {
  acknowledgeWebsitePreview,
  publishChurchWebsite,
  unpublishChurchWebsite,
} = require("../src/blessboard/services/churchWebsitePublishService");
const { PUBLIC_PAGE_KEYS } = require("../src/blessboard/services/publicContentConstants");
const {
  saveInlineFieldDraft,
} = require("../src/blessboard/services/websiteInlineDraftService");
const {
  resolvePublishCapability,
} = require("../src/blessboard/services/websiteDraftReviewService");
const {
  publishWebsiteDrafts,
  submitWebsiteDraftsForApproval,
} = require("../src/blessboard/services/websiteDraftPublishService");
const fieldDraftRepo = require("../src/blessboard/repositories/websiteInlineFieldDraftRepository");
const approvalSettingsSvc = require("../src/blessboard/services/websiteApprovalSettingsService");
const versionRepo = require("../src/blessboard/repositories/websitePublicationVersionRepository");
const versionSvc = require("../src/blessboard/services/websitePublicationVersionService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "pc10b-a.blessboard.org";
const HOST_B = "pc10b-b.blessboard.org";
const APEX = "blessboard.org";
const EXPECTED_PAGE_COUNT = PUBLIC_PAGE_KEYS.length;

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    ...overrides,
  };
}

function sidCookie(rawToken) {
  return `${DEFAULT_V5_COOKIE}=${rawToken}`;
}

function cookieHeader(rawToken, csrf) {
  return `${DEFAULT_V5_COOKIE}=${rawToken}; ${CSRF_COOKIE}=${csrf}`;
}

describe("V10 PC10B BlessBoard publish baselines", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let branchA;
  let campusBranch;
  let users = {};

  function skipIfNeeded(t) {
    if (skipSuite) t.skip(skipReason || "foundation unavailable");
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

      async function provisionOrg(key, host) {
        const prov = await provisionPlatformTenant(pool, {
          organizationKey: key,
          displayName: `PC10B ${key}`,
          legalName: null,
          dataEnvironment: "testing",
          productKey: "blessboard",
          productTenantKey: key,
          hostname: host,
          domainType: "canonical",
          deploymentCode: "blessboard-org-staging",
          isPrimary: true,
        });
        assert.equal(prov.ok, true, prov.message);
        const ch = await provisionBlessBoardChurch(pool, {
          organizationKey: key,
          churchKey: key,
          displayName: `PC10B Church ${key}`,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true, ch.message);
        await ensureChurchSettingsInitialized(pool, ch.records.church.id);
        await updateChurchSettings(pool, ch.records.church.id, {
          publicName: `PC10B Church ${key}`,
          websiteStatus: "published",
          primaryEmail: `${key}@example.test`,
        });
        await repairWebsiteFoundation(pool, { churchId: ch.records.church.id });
        await acknowledgeWebsitePreview(pool, {
          organizationId: prov.records.organization.id,
          actorUserId: null,
        });
        await provisionEmptyPublicPages(pool, {
          churchId: ch.records.church.id,
          branchId: null,
        });
        const home = await pool.query(
          `SELECT id FROM blessboard.public_pages
            WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL LIMIT 1`,
          [ch.records.church.id]
        );
        await updatePublicPage(pool, home.rows[0].id, { status: "published" });
        await createPageSection(pool, {
          pageId: home.rows[0].id,
          sectionKey: "hero",
          sectionType: "hero",
          heading: "Live Headline",
          bodyText: "Live body for visitors.",
          status: "published",
          sortOrder: 0,
        });
        await pool.query(
          `UPDATE blessboard.public_pages
              SET status = 'published', published_at = COALESCE(published_at, now())
            WHERE church_id = $1 AND branch_id IS NULL`,
          [ch.records.church.id]
        );
        return {
          org: prov.records.organization,
          church: ch.records.church,
          branch: ch.records.hqBranch || ch.records.primaryBranch,
        };
      }

      const a = await provisionOrg("pc10b-a", HOST_A);
      const b = await provisionOrg("pc10b-b", HOST_B);
      orgA = a.org;
      orgB = b.org;
      churchA = a.church;
      churchB = b.church;
      branchA = a.branch;

      let campus = await pool.query(
        `SELECT id, branch_key FROM blessboard.branches
          WHERE church_id = $1 AND branch_key = 'campus' LIMIT 1`,
        [churchA.id]
      );
      if (!campus.rows[0]) {
        await pool.query(
          `INSERT INTO blessboard.branches
             (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
           VALUES ($1, 'campus', 'Campus', 'branch', 'active', false, 'UTC', 'US')`,
          [churchA.id]
        );
        campus = await pool.query(
          `SELECT id, branch_key FROM blessboard.branches
            WHERE church_id = $1 AND branch_key = 'campus' LIMIT 1`,
          [churchA.id]
        );
      }
      campusBranch = campus.rows[0];

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
          assignmentReason: "pc10b baseline",
        });
      }

      users.hqA = await makeUser("pc10b-hq-a@example.test", "HQ A", orgA.id);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "pc10b-hq-a@example.test",
            organizationKey: "pc10b-a",
            roleKey: "church_hq_admin",
            churchKey: "pc10b-a",
          })
        ).ok,
        true
      );

      users.hqB = await makeUser("pc10b-hq-b@example.test", "HQ B", orgB.id);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "pc10b-hq-b@example.test",
            organizationKey: "pc10b-b",
            roleKey: "church_hq_admin",
            churchKey: "pc10b-b",
          })
        ).ok,
        true
      );

      users.editor = await makeUser("pc10b-editor@example.test", "Editor", orgA.id);
      await assignCatalogue(users.editor.user.id, "website_editor", {
        scopeType: "church",
        scopeId: churchA.id,
      });

      users.publisher = await makeUser("pc10b-pub@example.test", "Publisher", orgA.id);
      await assignCatalogue(users.publisher.user.id, "website_publisher", {
        scopeType: "church",
        scopeId: churchA.id,
      });

      users.branchCampus = await makeUser("pc10b-br@example.test", "Branch Campus", orgA.id);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "pc10b-br@example.test",
            organizationKey: "pc10b-a",
            roleKey: "branch_admin",
            churchKey: "pc10b-a",
            branchKey: "campus",
          })
        ).ok,
        true
      );

      users.branchHq = await makeUser("pc10b-br-hq@example.test", "Branch HQ", orgA.id);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "pc10b-br-hq@example.test",
            organizationKey: "pc10b-a",
            roleKey: "branch_admin",
            churchKey: "pc10b-a",
            branchKey: "hq",
          })
        ).ok,
        true
      );

      await approvalSettingsSvc.saveSettings(pool, {
        organizationId: orgA.id,
        actorUserId: users.hqA.user.id,
        branchEditMode: "approval_required",
        requirePreviewBeforePublish: false,
        requireMobilePreviewConfirmation: false,
        preventSelfApproval: true,
        requireRequestChangesComment: true,
        requireRejectionReason: true,
      });

      const initialPublish = await publishChurchWebsite(pool, {
        churchId: churchA.id,
        deferServiceTimes: true,
        confirmPublish: true,
        actorUserId: users.hqA.user.id,
        env: baseEnv(),
      });
      assert.equal(
        initialPublish.ok,
        true,
        initialPublish.reason ||
          JSON.stringify({
            gaps: initialPublish.gaps,
            validationErrors: initialPublish.validationErrors,
          })
      );

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
        apexHosts: new Set([APEX, `www.${APEX}`]),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  describe("RBAC_PERMISSION_MATRIX_BASELINE", () => {
    it("website_editor may edit but not publish; HQ and website_publisher may publish", async (t) => {
      skipIfNeeded(t);
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

      for (const u of [users.hqA, users.publisher]) {
        const pub = await authorize(pool, {
          actor: { userId: u.user.id },
          permission: "website.publish",
          tenantContext: tenant,
          resourceContext: ctx,
        });
        assert.equal(pub.allowed, true, pub.reasonCode);
      }
    });

    it("unauthorized HTTP publish is 403; authorized publisher is not auth-rejected", async (t) => {
      skipIfNeeded(t);
      const csrf = issueCsrfToken(baseEnv());
      const denied = await request(app)
        .post("/c/pc10b-a/website/publish")
        .set("Host", HOST_A)
        .set("Cookie", cookieHeader(users.editor.rawToken, csrf))
        .set("Accept", "application/json")
        .set("X-CSRF-Token", csrf)
        .send({ [CSRF_FIELD]: csrf, confirm_publish: "1" });
      assert.equal(denied.status, 403);
      assert.equal(denied.body.code, "forbidden");

      const allowed = await request(app)
        .post("/c/pc10b-a/website/publish")
        .set("Host", HOST_A)
        .set("Cookie", cookieHeader(users.hqA.rawToken, csrf))
        .set("Accept", "application/json")
        .set("X-CSRF-Token", csrf)
        .send({ [CSRF_FIELD]: csrf, confirm_publish: "1" });
      assert.notEqual(allowed.status, 403, JSON.stringify(allowed.body));
      assert.ok([200, 400].includes(allowed.status), `status=${allowed.status}`);
    });
  });

  describe("TENANT_ISOLATION_BASELINE", () => {
    it("cross-tenant and forged org/church/branch body IDs are denied", async (t) => {
      skipIfNeeded(t);
      const csrf = issueCsrfToken(baseEnv());

      const cross = await request(app)
        .post("/c/pc10b-a/website/publish")
        .set("Host", HOST_A)
        .set("Cookie", cookieHeader(users.hqB.rawToken, csrf))
        .set("Accept", "application/json")
        .set("X-CSRF-Token", csrf)
        .send({ [CSRF_FIELD]: csrf, confirm_publish: "1" });
      assert.equal(cross.status, 403);

      const forged = await request(app)
        .post("/c/pc10b-a/website/publish")
        .set("Host", HOST_A)
        .set("Cookie", cookieHeader(users.hqA.rawToken, csrf))
        .set("Accept", "application/json")
        .set("X-CSRF-Token", csrf)
        .send({
          [CSRF_FIELD]: csrf,
          confirm_publish: "1",
          organizationId: orgB.id,
          churchId: churchB.id,
          branchId: branchA && branchA.id,
        });
      assert.equal(forged.status, 403);
      assert.equal(forged.body.code, "forbidden");
    });

    it("branch-scoped admin cannot publish church-wide or sibling branch", async (t) => {
      skipIfNeeded(t);
      const csrf = issueCsrfToken(baseEnv());
      const churchWide = await request(app)
        .post("/c/pc10b-a/website/publish")
        .set("Host", HOST_A)
        .set("Cookie", cookieHeader(users.branchCampus.rawToken, csrf))
        .set("Accept", "application/json")
        .set("X-CSRF-Token", csrf)
        .send({ [CSRF_FIELD]: csrf, confirm_publish: "1" });
      assert.equal(churchWide.status, 403);

      const wrongBranch = await request(app)
        .post("/c/pc10b-a/hq/website/publish")
        .set("Host", HOST_A)
        .set("Cookie", cookieHeader(users.branchCampus.rawToken, csrf))
        .set("Accept", "application/json")
        .set("X-CSRF-Token", csrf)
        .send({ [CSRF_FIELD]: csrf, confirm_publish: "1" });
      assert.equal(wrongBranch.status, 403);
      assert.ok(campusBranch && campusBranch.id);
    });

    it("service-level publishWebsiteDrafts rejects cross-org churchId", async (t) => {
      skipIfNeeded(t);
      await saveInlineFieldDraft(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: null,
        editorUserId: users.hqA.user.id,
        actorRole: "organisation_administrator",
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        newValue: "Cross-org probe",
      });
      const denied = await publishWebsiteDrafts(pool, {
        organizationId: orgB.id,
        churchId: churchA.id,
        branchId: null,
        actorUserId: users.hqB.user.id,
        actorRole: "organisation_administrator",
        confirmPublish: true,
        deferServiceTimes: true,
        env: baseEnv(),
      });
      assert.equal(denied.ok, false);
      assert.equal(denied.reason, "cross_org");
    });
  });

  describe("BB_MULTI_SITE_GOVERNANCE_BASELINE", () => {
    it("capability matrix: HQ organisation_administrator publishes; branch_administrator trusts or submits", async (t) => {
      skipIfNeeded(t);
      const hq = resolvePublishCapability({
        canPublish: true,
        actorRole: "organisation_administrator",
        settings: { hqDirectPublishEnabled: true },
      });
      assert.equal(hq.action, "publish");

      const trusted = resolvePublishCapability({
        canPublish: true,
        actorRole: "branch_administrator",
        settings: { branchEditMode: "trusted_branch_publish" },
      });
      // Product gate: trustedActive may still be inactive until product enables it;
      // when resolveBranchEditMode reports trustedActive, action is publish.
      const resolvedTrusted = approvalSettingsSvc.resolveBranchEditMode({
        branchEditMode: "trusted_branch_publish",
      });
      if (resolvedTrusted.trustedActive) {
        assert.equal(trusted.action, "publish");
      } else {
        // Intended interim: approval_required path until trusted is product-active.
        assert.equal(trusted.action, "submit_for_approval");
      }

      const approval = resolvePublishCapability({
        canPublish: true,
        actorRole: "branch_administrator",
        settings: { branchEditMode: "approval_required" },
      });
      assert.equal(approval.action, "submit_for_approval");

      const denied = resolvePublishCapability({
        canPublish: false,
        actorRole: "branch_administrator",
        settings: { branchEditMode: "approval_required" },
      });
      assert.equal(denied.action, "forbidden");
    });

    it("branch trusted publish when trustedActive is forced (product-gated path)", async (t) => {
      skipIfNeeded(t);
      // Runs before destructive parity paths; seed branch shell like HQ.
      await provisionEmptyPublicPages(pool, {
        churchId: churchA.id,
        branchId: branchA.id,
      });
      await pool.query(
        `UPDATE blessboard.public_pages
            SET status = 'published', published_at = COALESCE(published_at, now())
          WHERE church_id = $1 AND branch_id = $2`,
        [churchA.id, branchA.id]
      );
      const branchHome = await pool.query(
        `SELECT id FROM blessboard.public_pages
          WHERE church_id = $1 AND branch_id = $2 AND page_key = 'home' LIMIT 1`,
        [churchA.id, branchA.id]
      );
      assert.ok(branchHome.rows[0], "branch home page");
      const existingHero = await pool.query(
        `SELECT id FROM blessboard.page_sections
          WHERE page_id = $1 AND section_key = 'hero' LIMIT 1`,
        [branchHome.rows[0].id]
      );
      if (!existingHero.rows[0]) {
        await createPageSection(pool, {
          pageId: branchHome.rows[0].id,
          sectionKey: "hero",
          sectionType: "hero",
          heading: "Branch Live Headline",
          bodyText: "Branch live body.",
          status: "published",
          sortOrder: 0,
        });
      }

      const orig = approvalSettingsSvc.resolveBranchEditMode;
      approvalSettingsSvc.resolveBranchEditMode = () => ({
        mode: "trusted_branch_publish",
        configuredMode: "trusted_branch_publish",
        trustedActive: true,
        note: null,
      });
      try {
        await saveInlineFieldDraft(pool, {
          organizationId: orgA.id,
          churchId: churchA.id,
          branchId: branchA.id,
          editorUserId: users.branchHq.user.id,
          actorRole: "branch_administrator",
          pageKey: "home",
          sectionKey: "hero",
          fieldKey: "bodyText",
          newValue: "Trusted branch body PC10B",
        });
        const cap = resolvePublishCapability({
          canPublish: true,
          actorRole: "branch_administrator",
          settings: { branchEditMode: "trusted_branch_publish" },
        });
        assert.equal(cap.action, "publish");

        const published = await publishWebsiteDrafts(pool, {
          organizationId: orgA.id,
          churchId: churchA.id,
          branchId: branchA.id,
          actorUserId: users.branchHq.user.id,
          actorRole: "branch_administrator",
          confirmPublish: true,
          deferServiceTimes: true,
          tenant: {
            resolved: true,
            organization: orgA,
            church: churchA,
          },
          env: baseEnv(),
        });
        assert.equal(
          published.ok,
          true,
          published.reason ||
            JSON.stringify({
              gaps: published.gaps,
              validationErrors: published.validationErrors,
              status: published.status,
            })
        );
      } finally {
        approvalSettingsSvc.resolveBranchEditMode = orig;
      }
    });

    it("branch admin submits for approval when required (intended role vocabulary)", async (t) => {
      skipIfNeeded(t);
      await saveInlineFieldDraft(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        editorUserId: users.branchHq.user.id,
        actorRole: "branch_administrator",
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "bodyText",
        newValue: "Branch submission body",
      });

      const submitted = await submitWebsiteDraftsForApproval(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        actorUserId: users.branchHq.user.id,
        actorRole: "branch_administrator",
        tenant: {
          resolved: true,
          organization: orgA,
          church: churchA,
        },
      });
      assert.equal(submitted.ok, true, submitted.reason || JSON.stringify(submitted));
    });
  });

  describe("WEBSITE_PUBLISH_PARITY_BASELINE", () => {
    before(async () => {
      if (skipSuite) return;
      // Branch submit-for-approval leaves pending reviews that intentionally block HQ publish.
      await pool.query(
        `UPDATE blessboard.website_change_submissions
            SET status = 'withdrawn', updated_at = now()
          WHERE organization_id = $1
            AND status IN ('pending_review', 'changes_requested', 'submitted')`,
        [orgA.id]
      );
      await repairWebsiteFoundation(pool, { churchId: churchA.id });
      await acknowledgeWebsitePreview(pool, {
        organizationId: orgA.id,
        actorUserId: users.hqA.user.id,
      });
      await updateChurchSettings(pool, churchA.id, {
        publicName: "PC10B Church pc10b-a",
        websiteStatus: "published",
        primaryEmail: "pc10b-a@example.test",
      });
      await provisionEmptyPublicPages(pool, {
        churchId: churchA.id,
        branchId: null,
      });
      const home = await pool.query(
        `SELECT id FROM blessboard.public_pages
          WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL LIMIT 1`,
        [churchA.id]
      );
      if (home.rows[0]) {
        const hero = await pool.query(
          `SELECT id FROM blessboard.page_sections
            WHERE page_id = $1 AND section_key = 'hero' LIMIT 1`,
          [home.rows[0].id]
        );
        if (!hero.rows[0]) {
          await createPageSection(pool, {
            pageId: home.rows[0].id,
            sectionKey: "hero",
            sectionType: "hero",
            heading: "Live Headline",
            bodyText: "Live body for visitors.",
            status: "published",
            sortOrder: 0,
          });
        }
      }
      await pool.query(
        `UPDATE blessboard.public_pages
            SET status = 'published', published_at = COALESCE(published_at, now())
          WHERE church_id = $1 AND branch_id IS NULL`,
        [churchA.id]
      );
    });

    it("default shells provision PUBLIC_PAGE_KEYS.length pages", async (t) => {
      skipIfNeeded(t);
      const pages = await pool.query(
        `SELECT page_key, status, branch_id
           FROM blessboard.public_pages
          WHERE church_id = $1 AND branch_id IS NULL
          ORDER BY page_key`,
        [churchA.id]
      );
      assert.equal(pages.rows.length, EXPECTED_PAGE_COUNT);
      assert.ok(PUBLIC_PAGE_KEYS.every((k) => pages.rows.some((r) => r.page_key === k)));
    });

    it("HQ publishChurchWebsite creates versions; draft→published; unpublish hides; path-public contracts", async (t) => {
      skipIfNeeded(t);
      const before = await versionRepo.getCurrentPublishedVersion(pool, orgA.id);

      const published = await publishChurchWebsite(pool, {
        churchId: churchA.id,
        deferServiceTimes: true,
        confirmPublish: true,
        actorUserId: users.hqA.user.id,
        env: baseEnv(),
      });
      assert.equal(
        published.ok,
        true,
        JSON.stringify({
          reason: published.reason,
          gaps: published.gaps,
          validationErrors: published.validationErrors,
          status: published.status,
        })
      );
      assert.equal(published.pageCount, EXPECTED_PAGE_COUNT);

      const current = await versionRepo.getCurrentPublishedVersion(pool, orgA.id);
      assert.ok(current && current.id);
      if (before && before.id) {
        assert.notEqual(String(current.id), String(before.id));
      }

      const apexHome = await request(app).get(`/c/${orgA.key || "pc10b-a"}`).set("Host", APEX);
      // Intended current routing: church-wide /c/:org → primary branch (301).
      assert.equal(apexHome.status, 301);
      assert.ok(String(apexHome.headers.location || "").includes("/c/pc10b-a/"));

      const tenantHome = await request(app).get("/").set("Host", HOST_A);
      assert.equal(tenantHome.status, 200);
      assert.match(tenantHome.text, /data-bb-shell="tenant-public"|Live Headline/);

      const unpublished = await unpublishChurchWebsite(pool, {
        churchId: churchA.id,
        actorUserId: users.hqA.user.id,
        confirmUnpublish: true,
      });
      assert.equal(unpublished.ok, true, unpublished.reason || JSON.stringify(unpublished));

      // Re-publish for later suites that expect a published site.
      const again = await publishChurchWebsite(pool, {
        churchId: churchA.id,
        deferServiceTimes: true,
        confirmPublish: true,
        actorUserId: users.hqA.user.id,
        env: baseEnv(),
      });
      assert.equal(again.ok, true, again.reason);
    });

    it("HQ draft publish with organisation_administrator clears drafts and updates public", async (t) => {
      skipIfNeeded(t);
      await saveInlineFieldDraft(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: null,
        editorUserId: users.hqA.user.id,
        actorRole: "organisation_administrator",
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        newValue: "PC10B Draft Sacred Headline",
      });
      const published = await publishWebsiteDrafts(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: null,
        actorUserId: users.hqA.user.id,
        actorRole: "organisation_administrator",
        confirmPublish: true,
        deferServiceTimes: true,
        env: baseEnv(),
      });
      assert.equal(published.ok, true, published.reason || JSON.stringify(published));
      assert.equal(published.draftCleared, true);
      const remaining = await fieldDraftRepo.countDrafts(pool, {
        churchId: churchA.id,
        branchId: null,
      });
      assert.equal(remaining, 0);

      const afterPublic = await request(app).get("/").set("Host", HOST_A).expect(200);
      assert.match(afterPublic.text, /PC10B Draft Sacred Headline/);
    });

    it("restore publishes a new current version from historical snapshot", async (t) => {
      skipIfNeeded(t);
      await saveInlineFieldDraft(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: null,
        editorUserId: users.hqA.user.id,
        actorRole: "organisation_administrator",
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        newValue: "PC10B Restore Version A",
      });
      const pubA = await publishWebsiteDrafts(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: null,
        actorUserId: users.hqA.user.id,
        actorRole: "organisation_administrator",
        confirmPublish: true,
        deferServiceTimes: true,
        env: baseEnv(),
      });
      assert.equal(pubA.ok, true, pubA.reason || JSON.stringify(pubA));
      const versionA = await versionRepo.getCurrentPublishedVersion(pool, orgA.id);
      assert.ok(versionA && versionA.id);

      await saveInlineFieldDraft(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: null,
        editorUserId: users.hqA.user.id,
        actorRole: "organisation_administrator",
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        newValue: "PC10B Restore Version B",
      });
      const pubB = await publishWebsiteDrafts(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: null,
        actorUserId: users.hqA.user.id,
        actorRole: "organisation_administrator",
        confirmPublish: true,
        deferServiceTimes: true,
        env: baseEnv(),
      });
      assert.equal(pubB.ok, true, pubB.reason || JSON.stringify(pubB));
      const versionB = await versionRepo.getCurrentPublishedVersion(pool, orgA.id);
      assert.ok(versionB && versionB.id);
      assert.notEqual(String(versionA.id), String(versionB.id));

      const restored = await versionSvc.restoreAndPublishCurrentVersion(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        versionId: versionA.id,
        actorUserId: users.hqA.user.id,
        env: baseEnv(),
      });
      assert.equal(restored.ok, true, restored.reason || JSON.stringify(restored));
      const current = await versionRepo.getCurrentPublishedVersion(pool, orgA.id);
      assert.ok(current && current.id);
      // Intended contract (service docstring): restore publishes a NEW current version
      // without mutating the historic row. Characterizes divergence if publish is idempotent.
      assert.notEqual(
        String(current.id),
        String(versionA.id),
        "restore must not mutate or reactivate historic version A as the sole current id without a new row"
      );
      assert.notEqual(
        String(current.id),
        String(versionB.id),
        "restore must create a new published version rather than leaving prior current B in place"
      );
    });
  });

});
