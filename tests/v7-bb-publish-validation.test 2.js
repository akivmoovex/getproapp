"use strict";

/**
 * BlessBoard publish validation — pending submissions, editor error codes, demo fixture repair.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
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
const {
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const {
  provisionEmptyPublicPages,
  createPageSection,
  updatePublicPage,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  updateChurchSettings,
  ensureChurchSettingsInitialized,
} = require("../src/blessboard/services/blessBoardSettingsService");
const submissionRepo = require("../src/blessboard/repositories/websiteChangeSubmissionRepository");
const {
  publishChurchWebsite,
  evaluatePublishReadiness,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  validateWebsitePublication,
} = require("../src/blessboard/services/websitePublicationValidationService");
const {
  collectErrorCodes,
  classifyErrorCode,
} = require("../src/blessboard/services/websitePublishReviewService");
const {
  clearDemoChurchPublishBlockers,
} = require("../src/blessboard/services/configureDemoChurch");

const ROOT = path.join(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V7 BlessBoard publish validation contracts", () => {
  it("editor publish route maps validation failures to specific error codes", () => {
    const routes = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    assert.match(routes, /collectErrorCodes/);
    assert.match(routes, /validationErrors/);
    assert.doesNotMatch(
      routes,
      /publish\/error\?codes=\$\{encodeURIComponent\(published\.reason/
    );
  });

  it("hosted QA script uses current login_email field contract", () => {
    const qa = read("scripts/local/bb-platform-01-hosted-qa.js");
    assert.match(qa, /login_email/);
    assert.doesNotMatch(qa, /locator\('input\[name="email"\]'\)/);
  });

  it("validation service exposes structured issue codes", () => {
    const code = classifyErrorCode(
      "1 submission(s) are still pending review and block publication."
    );
    assert.equal(code, "pending_review");
  });

  it("collectErrorCodes preserves pending_review instead of generic validation_failed", () => {
    const codes = collectErrorCodes({
      errors: ["1 submission(s) are still pending review and block publication."],
      reason: "validation_failed",
    });
    assert.deepEqual(codes, ["pending_review"]);
  });
});

describe("V7 BlessBoard publish validation behavior", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let org;
  let church;
  let branch;
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

      org = await provisionPlatformTenant(pool, {
        organizationKey: "pubval-org",
        displayName: "Publish Validation Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "pubval-org",
        hostname: "pubval-org.blessboard.test",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(org.ok, true, org.message);

      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "pubval-org",
        churchKey: "pubval-org",
        displayName: "Publish Validation Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(ch.ok, true, ch.message);
      church = ch.records.church;
      branch = ch.records.hqBranch;
      await repairWebsiteFoundation(pool, { churchId: church.id });
      await ensureChurchSettingsInitialized(pool, church.id);
      await updateChurchSettings(pool, church.id, {
        websiteStatus: "published",
        publicName: "Publish Validation Church",
        primaryEmail: "hq@pubval-org.example.test",
      });
      await provisionEmptyPublicPages(pool, { churchId: church.id, branchId: null });
      const home = await pool.query(
        `SELECT id FROM blessboard.public_pages
          WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL LIMIT 1`,
        [church.id]
      );
      await updatePublicPage(pool, home.rows[0].id, { status: "published" });
      await createPageSection(pool, {
        pageId: home.rows[0].id,
        sectionKey: "hero",
        sectionType: "hero",
        heading: "Welcome",
        bodyText: "",
        status: "published",
        sortOrder: 0,
      });

      const created = await createBlessBoardUser(pool, {
        email: "pubval-hq@example.test",
        displayName: "PubVal HQ",
        password: "correct-horse-battery-staple",
      });
      assert.equal(created.ok, true, created.message);
      await assignBlessBoardRole(pool, {
        email: "pubval-hq@example.test",
        organizationKey: "pubval-org",
        roleKey: "church_hq_admin",
        churchKey: "pubval-org",
      });
      users.hq = created.user;
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("new Foundation church publishes when no pending branch submissions exist", async () => {
    requireDb();
    const validation = await validateWebsitePublication(pool, {
      organizationId: org.records.organization.id,
      churchId: church.id,
      deferServiceTimes: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
      relaxReadinessGaps: true,
    });
    assert.equal(validation.publishable, true, JSON.stringify(validation.errors));
    const published = await publishChurchWebsite(pool, {
      organizationId: org.records.organization.id,
      churchId: church.id,
      actorUserId: users.hq.id,
      confirmPublish: true,
      deferServiceTimes: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
      forcePublishVersion: true,
    });
    assert.equal(published.ok, true, published.reason || published.status);
  });

  it("pending branch submission blocks HQ publish with pending_review code", async () => {
    requireDb();
    await submissionRepo.insertSubmission(pool, {
      organizationId: org.records.organization.id,
      branchId: branch.id,
      title: "Pending branch QA",
      pageKey: "home",
      changeType: "Content Update",
      currentContent: {},
      proposedContent: { heading: "Branch draft" },
      status: "pending_review",
      submittedBy: users.hq.id,
    });
    const validation = await validateWebsitePublication(pool, {
      organizationId: org.records.organization.id,
      churchId: church.id,
      deferServiceTimes: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
      relaxReadinessGaps: true,
    });
    assert.equal(validation.publishable, false);
    assert.ok(validation.errorCodes.includes("pending_review"));
    const blocked = await publishChurchWebsite(pool, {
      organizationId: org.records.organization.id,
      churchId: church.id,
      actorUserId: users.hq.id,
      confirmPublish: true,
      deferServiceTimes: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
      forcePublishVersion: true,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "validation_failed");
    const draftCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.website_inline_field_drafts WHERE church_id = $1`,
      [church.id]
    );
    assert.ok(Number(draftCount.rows[0].n) >= 0, "draft rows remain queryable after failed publish");
  });

  it("clearDemoChurchPublishBlockers withdraws stale pending submissions", async () => {
    requireDb();
    const cleared = await clearDemoChurchPublishBlockers(pool, org.records.organization.id);
    assert.ok(cleared.withdrawnPending >= 1);
    const validation = await validateWebsitePublication(pool, {
      organizationId: org.records.organization.id,
      churchId: church.id,
      deferServiceTimes: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
      relaxReadinessGaps: true,
    });
    assert.equal(validation.publishable, true, JSON.stringify(validation.errors));
  });

  it("empty optional hero body does not block publish validation", async () => {
    requireDb();
    const readiness = await evaluatePublishReadiness(pool, {
      churchId: church.id,
      deferServiceTimes: true,
    });
    assert.equal(readiness.ok, true);
    const validation = await validateWebsitePublication(pool, {
      organizationId: org.records.organization.id,
      churchId: church.id,
      deferServiceTimes: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
      relaxReadinessGaps: true,
    });
    assert.equal(validation.publishable, true);
  });
});
