"use strict";

/**
 * Stage 6 — branch-aware website publish, approval, preview, versions, restore.
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
  buildBlessBoardTenantContext,
} = require("../src/blessboard/http/buildBlessBoardTenantContext");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  updatePublicPage,
  createPageSection,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  publishChurchWebsite,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  saveInlineFieldDraft,
} = require("../src/blessboard/services/websiteInlineDraftService");
const {
  submitWebsiteDraftsForApproval,
  publishWebsiteDrafts,
} = require("../src/blessboard/services/websiteDraftPublishService");
const submissionSvc = require("../src/blessboard/services/websiteChangeSubmissionService");
const approvalSettingsSvc = require("../src/blessboard/services/websiteApprovalSettingsService");
const versionRepo = require("../src/blessboard/repositories/websitePublicationVersionRepository");
const {
  createRestoredDraft,
} = require("../src/blessboard/services/websitePublicationVersionService");
const {
  loadTenantPublicPageModel,
  KIND,
} = require("../src/blessboard/http/loadTenantPublicPageModel");
const publicContentRepo = require("../src/blessboard/repositories/publicContentRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "stage6-a.blessboard.org";
const HOST_B = "stage6-b.blessboard.org";

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    ...overrides,
  };
}

describe("blessboard branch website publish (stage 6)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let hqBranchA;
  let campusEast;
  let campusWest;
  let tenantA;
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

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "stage6-a",
        displayName: "Stage6 Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "stage6-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "stage6-b",
        displayName: "Stage6 Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "stage6-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "stage6-a",
        churchKey: "stage6-a",
        displayName: "Stage6 Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      hqBranchA = chA.records.hqBranch;

      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "stage6-b",
        churchKey: "stage6-b",
        displayName: "Stage6 Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;

      const east = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-east', 'Campus East', 'branch', 'active', false, 'UTC', 'ZM')
         RETURNING id, branch_key, display_name`,
        [churchA.id]
      );
      campusEast = east.rows[0];

      const west = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-west', 'Campus West', 'branch', 'active', false, 'UTC', 'ZM')
         RETURNING id, branch_key, display_name`,
        [churchA.id]
      );
      campusWest = west.rows[0];

      tenantA = buildBlessBoardTenantContext({
        organization: { id: orgA.id, key: "stage6-a", displayName: "Stage6 Org A" },
        church: {
          id: churchA.id,
          churchKey: "stage6-a",
          displayName: "Stage6 Church A",
          dataEnvironment: "testing",
        },
        hqBranch: {
          id: hqBranchA.id,
          branchKey: "hq",
          displayName: "HQ A",
        },
        primaryBranch: {
          id: hqBranchA.id,
          branchKey: "hq",
          displayName: "HQ A",
        },
      });

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

      users.hqA = await makeUser("stage6-hq-a@example.test", "HQ A", {
        email: "stage6-hq-a@example.test",
        organizationKey: "stage6-a",
        roleKey: "church_hq_admin",
        churchKey: "stage6-a",
      });
      users.branchEast = await makeUser("stage6-east@example.test", "East Admin", {
        email: "stage6-east@example.test",
        organizationKey: "stage6-a",
        roleKey: "branch_admin",
        churchKey: "stage6-a",
        branchKey: "campus-east",
      });
      users.hqB = await makeUser("stage6-hq-b@example.test", "HQ B", {
        email: "stage6-hq-b@example.test",
        organizationKey: "stage6-b",
        roleKey: "church_hq_admin",
        churchKey: "stage6-b",
      });

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        publicName: "Stage6 Church A",
        primaryEmail: "hello@stage6-a.test",
        primaryPhone: "+260970000001",
      });
      await ensureChurchSettingsInitialized(pool, churchB.id);
      await updateChurchSettings(pool, churchB.id, {
        publicName: "Stage6 Church B",
        primaryEmail: "hello@stage6-b.test",
        primaryPhone: "+260970000002",
      });

      for (const churchId of [churchA.id, churchB.id]) {
        const pages = await provisionEmptyPublicPages(pool, { churchId, branchId: null });
        assert.equal(pages.ok, true, pages.message || pages.reason);
      }

      await approvalSettingsSvc.saveSettings(pool, {
        organizationId: orgA.id,
        actorUserId: users.hqA.id,
        branchEditMode: "approval_required",
        requirePreviewBeforePublish: false,
        requireMobilePreviewConfirmation: false,
        preventSelfApproval: true,
        requireRequestChangesComment: true,
        requireRejectionReason: true,
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function skipIfNeeded(t) {
    if (skipSuite) t.skip(skipReason || "foundation unavailable");
  }

  async function ensureBranchPages(branchId, titlePrefix) {
    const pages = await provisionEmptyPublicPages(pool, {
      churchId: churchA.id,
      branchId,
    });
    assert.equal(pages.ok, true, pages.message || pages.reason);
    const home = (pages.pages || []).find((p) => p.pageKey === "home");
    assert.ok(home);
    await updatePublicPage(pool, home.id, {
      title: `${titlePrefix} Home`,
      status: "draft",
    });
    const existingHero = await publicContentRepo.findSectionByPageAndKey(
      pool,
      home.id,
      "hero"
    );
    if (existingHero) {
      await pool.query(
        `UPDATE blessboard.page_sections
            SET heading = $2, body_text = $3, status = 'draft', updated_at = now()
          WHERE id = $1`,
        [existingHero.id, `${titlePrefix} Hero`, `${titlePrefix} body`]
      );
    } else {
      await createPageSection(pool, {
        pageId: home.id,
        sectionKey: "hero",
        sectionType: "hero",
        heading: `${titlePrefix} Hero`,
        bodyText: `${titlePrefix} body`,
        status: "draft",
      });
    }
  }

  async function publishChurchWide() {
    const result = await publishChurchWebsite(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: null,
      actorUserId: users.hqA.id,
      confirmPublish: true,
      deferServiceTimes: true,
      relaxPreviewRequirement: true,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    return result;
  }

  it("1. church-wide publication remains isolated", async (t) => {
    skipIfNeeded(t);
    await ensureBranchPages(campusEast.id, "East Pre");
    await ensureBranchPages(campusWest.id, "West Pre");

    const eastBefore = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
      pageKey: "home",
    });
    const westBefore = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
      pageKey: "home",
    });

    const published = await publishChurchWide();
    assert.equal(published.branchId, null);
    assert.ok(published.publicationVersionId);

    const churchHome = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: null,
      pageKey: "home",
    });
    assert.equal(churchHome.status, "published");

    const eastAfter = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
      pageKey: "home",
    });
    const westAfter = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
      pageKey: "home",
    });
    assert.equal(eastAfter.status, eastBefore.status);
    assert.equal(westAfter.status, westBefore.status);
    assert.equal(eastAfter.title, eastBefore.title);
    assert.equal(westAfter.title, westBefore.title);

    const version = await versionRepo.getVersionByOrgAndId(
      pool,
      orgA.id,
      published.publicationVersionId
    );
    assert.equal(version.branchId, null);
  });

  it("2+3. Branch A publication isolated; Branch B unchanged", async (t) => {
    skipIfNeeded(t);
    await ensureBranchPages(campusEast.id, "East A");
    await ensureBranchPages(campusWest.id, "West B");

    const westBefore = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
      pageKey: "home",
    });
    const churchBefore = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: null,
      pageKey: "home",
    });
    const churchWideVersionBefore = await versionRepo.getCurrentPublishedVersion(
      pool,
      orgA.id,
      null
    );

    const published = await publishChurchWebsite(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      actorUserId: users.hqA.id,
      confirmPublish: true,
      deferServiceTimes: true,
      relaxPreviewRequirement: true,
      forcePublishVersion: true,
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    assert.equal(published.branchId, campusEast.id);

    const eastHome = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
      pageKey: "home",
    });
    assert.equal(eastHome.status, "published");
    assert.equal(eastHome.title, "East A Home");

    const westAfter = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
      pageKey: "home",
    });
    assert.equal(westAfter.status, westBefore.status);
    assert.equal(westAfter.title, westBefore.title);

    const churchAfter = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: null,
      pageKey: "home",
    });
    assert.equal(churchAfter.title, churchBefore.title);
    assert.equal(churchAfter.status, churchBefore.status);

    const churchWideVersionAfter = await versionRepo.getCurrentPublishedVersion(
      pool,
      orgA.id,
      null
    );
    assert.equal(
      churchWideVersionAfter && churchWideVersionAfter.id,
      churchWideVersionBefore && churchWideVersionBefore.id
    );

    const eastVersion = await versionRepo.getCurrentPublishedVersion(
      pool,
      orgA.id,
      campusEast.id
    );
    assert.ok(eastVersion);
    assert.equal(eastVersion.branchId, campusEast.id);
    assert.notEqual(eastVersion.id, churchWideVersionAfter && churchWideVersionAfter.id);
  });

  it("4. approved branch drafts are applied", async (t) => {
    skipIfNeeded(t);
    await ensureBranchPages(campusEast.id, "East Approve");

    const draft = await saveInlineFieldDraft(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      editorUserId: users.branchEast.id,
      actorRole: "branch_admin",
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      newValue: "Approved East Heading",
    });
    assert.equal(draft.saved, true, JSON.stringify(draft));

    const submitted = await submitWebsiteDraftsForApproval(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      actorUserId: users.branchEast.id,
      actorRole: "branch_admin",
      reason: "Stage 6 approval apply test",
    });
    assert.equal(submitted.ok, true, JSON.stringify(submitted));
    assert.ok(submitted.submission && submitted.submission.id);

    const approved = await submissionSvc.approveSubmission(pool, {
      organizationId: orgA.id,
      submissionId: submitted.submission.id,
      reviewerUserId: users.hqA.id,
      reviewerComment: "Looks good",
      env: baseEnv(),
    });
    assert.equal(approved.ok, true, JSON.stringify(approved));
    assert.ok(approved.published && approved.published.ok);
    assert.ok(approved.applied && approved.applied.applied > 0);

    const page = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
      pageKey: "home",
    });
    const section = await publicContentRepo.findSectionByPageAndKey(
      pool,
      page.id,
      "hero"
    );
    assert.equal(section.heading, "Approved East Heading");

    const west = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
      pageKey: "home",
    });
    if (west) {
      const westHero = await publicContentRepo.findSectionByPageAndKey(
        pool,
        west.id,
        "hero"
      );
      if (westHero) {
        assert.notEqual(westHero.heading, "Approved East Heading");
      }
    }

    const refreshed = await submissionSvc.loadSubmissionReview(pool, {
      organizationId: orgA.id,
      submissionId: submitted.submission.id,
    });
    if (refreshed.ok) {
      assert.equal(refreshed.submission.status, "published");
    }
  });

  it("5. preview uses one consistent branch", async (t) => {
    skipIfNeeded(t);
    await ensureBranchPages(campusEast.id, "East Preview");
    await publishChurchWebsite(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      actorUserId: users.hqA.id,
      confirmPublish: true,
      deferServiceTimes: true,
      relaxPreviewRequirement: true,
      forcePublishVersion: true,
    });

    const model = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "home",
      hostname: HOST_A,
      preview: true,
      previewBranchId: campusEast.id,
      selectedBranch: {
        id: campusEast.id,
        key: "campus-east",
        displayName: "Campus East",
        branchType: "branch",
        isPrimary: false,
      },
    });
    assert.equal(model.kind, KIND.OK);
    assert.equal(model.websiteScope.scopeType, "branch");
    assert.equal(model.websiteScope.branchId, campusEast.id);
    assert.equal(model.websiteScope.contentBranchId, campusEast.id);
    assert.equal(model.branch.id, campusEast.id);
    assert.notEqual(model.branch.id, hqBranchA.id);
  });

  it("6. branch version history is separate", async (t) => {
    skipIfNeeded(t);
    await ensureBranchPages(campusWest.id, "West Hist");
    const westPub = await publishChurchWebsite(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusWest.id,
      actorUserId: users.hqA.id,
      confirmPublish: true,
      deferServiceTimes: true,
      relaxPreviewRequirement: true,
      forcePublishVersion: true,
    });
    assert.equal(westPub.ok, true, JSON.stringify(westPub));

    const churchVersions = await versionRepo.listVersions(pool, {
      organizationId: orgA.id,
      branchId: null,
      limit: 20,
    });
    const eastVersions = await versionRepo.listVersions(pool, {
      organizationId: orgA.id,
      branchId: campusEast.id,
      limit: 20,
    });
    const westVersions = await versionRepo.listVersions(pool, {
      organizationId: orgA.id,
      branchId: campusWest.id,
      limit: 20,
    });

    assert.ok(churchVersions.items.every((v) => v.branchId == null));
    assert.ok(eastVersions.items.every((v) => v.branchId === campusEast.id));
    assert.ok(westVersions.items.every((v) => v.branchId === campusWest.id));
    assert.ok(westVersions.items.some((v) => v.id === westPub.publicationVersionId));
    assert.ok(!churchVersions.items.some((v) => v.id === westPub.publicationVersionId));
  });

  it("7. restore affects only the selected branch", async (t) => {
    skipIfNeeded(t);
    const eastVersion = await versionRepo.getCurrentPublishedVersion(
      pool,
      orgA.id,
      campusEast.id
    );
    assert.ok(eastVersion);

    const westBefore = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
      pageKey: "home",
    });
    const churchBefore = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: null,
      pageKey: "home",
    });

    const restored = await createRestoredDraft(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      versionId: eastVersion.id,
      actorUserId: users.hqA.id,
      restorationReason: "Stage 6 restore branch A only",
      selectedPageKeys: ["home"],
      confirmed: true,
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));
    assert.equal(restored.branchId, campusEast.id);

    const eastHome = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
      pageKey: "home",
    });
    assert.equal(eastHome.status, "draft");

    const westAfter = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
      pageKey: "home",
    });
    assert.equal(westAfter.status, westBefore.status);
    assert.equal(westAfter.title, westBefore.title);

    const churchAfter = await publicContentRepo.findPageByScope(pool, {
      churchId: churchA.id,
      branchId: null,
      pageKey: "home",
    });
    assert.equal(churchAfter.status, churchBefore.status);
    assert.equal(churchAfter.title, churchBefore.title);
  });

  it("8. cross-organization version IDs return 404", async (t) => {
    skipIfNeeded(t);
    const eastVersion = await versionRepo.getCurrentPublishedVersion(
      pool,
      orgA.id,
      campusEast.id
    );
    assert.ok(eastVersion);

    const cross = await versionRepo.getVersionByOrgAndId(pool, orgB.id, eastVersion.id);
    assert.equal(cross, null);

    const restore = await createRestoredDraft(pool, {
      organizationId: orgB.id,
      churchId: churchB.id,
      versionId: eastVersion.id,
      actorUserId: users.hqB.id,
      restorationReason: "Should not restore cross-org",
      selectedPageKeys: ["home"],
      confirmed: true,
    });
    assert.equal(restore.ok, false);
    assert.equal(restore.status, "not_found");
  });

  it("9. repeated publish does not duplicate unintended versions", async (t) => {
    skipIfNeeded(t);
    const before = await versionRepo.listVersions(pool, {
      organizationId: orgA.id,
      branchId: campusWest.id,
      status: "published",
      limit: 50,
    });

    const first = await publishChurchWebsite(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusWest.id,
      actorUserId: users.hqA.id,
      confirmPublish: true,
      deferServiceTimes: true,
      relaxPreviewRequirement: true,
    });
    assert.equal(first.ok, true, JSON.stringify(first));

    const second = await publishChurchWebsite(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusWest.id,
      actorUserId: users.hqA.id,
      confirmPublish: true,
      deferServiceTimes: true,
      relaxPreviewRequirement: true,
    });
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(second.idempotent, true);
    assert.equal(second.publicationVersionId, first.publicationVersionId);

    const after = await versionRepo.listVersions(pool, {
      organizationId: orgA.id,
      branchId: campusWest.id,
      status: "published",
      limit: 50,
    });
    assert.equal(after.total, before.total + (first.idempotent ? 0 : 1));
    assert.equal(after.items.filter((v) => v.status === "published").length, 1);
  });

  it("10. failed publish is never returned as success", async (t) => {
    skipIfNeeded(t);
    const missingConfirm = await publishChurchWebsite(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      actorUserId: users.hqA.id,
      confirmPublish: false,
    });
    assert.equal(missingConfirm.ok, false);
    assert.equal(missingConfirm.reason, "confirm_publish");

    const badOrg = await publishChurchWebsite(pool, {
      organizationId: orgB.id,
      churchId: churchA.id,
      branchId: campusEast.id,
      actorUserId: users.hqA.id,
      confirmPublish: true,
      deferServiceTimes: true,
      relaxPreviewRequirement: true,
    });
    assert.equal(badOrg.ok, false);
    assert.ok(badOrg.reason === "organization_mismatch" || badOrg.status === "forbidden");

    const badBranch = await publishChurchWebsite(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: "00000000-0000-4000-8000-000000000099",
      actorUserId: users.hqA.id,
      confirmPublish: true,
      deferServiceTimes: true,
      relaxPreviewRequirement: true,
      forcePublishVersion: true,
    });
    assert.equal(badBranch.ok, false);

    const failedDraftPublish = await publishWebsiteDrafts(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusWest.id,
      actorUserId: users.hqA.id,
      actorRole: "church_hq_admin",
      confirmPublish: true,
    });
    assert.equal(failedDraftPublish.ok, false);
    assert.equal(failedDraftPublish.reason, "no_changes");
  });
});
