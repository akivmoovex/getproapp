"use strict";

/**
 * Shared post-publication website governance:
 * Recently Updated console, non-blocking approval, hide/block/revert, CSR grants.
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
const { CODE_ACTIVECLINIC_ORG_V6, CODE_ORG_STAGING } = require("../src/platform/config/deploymentProfiles");
const {
  registerActiveClinicWebsiteTemplate,
  ACTIVECLINIC_TEMPLATE_ID,
  ACTIVECLINIC_TEMPLATE_VERSION,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const { provisionWebsiteInstance } = require("../src/platform/website/provisionService");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const versionService = require("../src/platform/website/versionService");
const resolver = require("../src/platform/website/resolver");
const { listWebsiteAudit } = require("../src/platform/website/auditService");
const { listModerationEvents, ACTION } = require("../src/platform/website/moderationEventService");
const { LIFECYCLE_STATUS } = require("../src/platform/website/lifecycleStatus");
const { PUBLISH_POLICY } = require("../src/platform/website/publishPolicy");
const { PERMISSIONS, hasWebsitePermission } = require("../src/platform/website/permissions");
const {
  REVIEW_STATUS,
  WEBSITE_STATUS,
  websiteStatusFromLifecycle,
  listRecentWebsitePublications,
  resolveApprovedVersions,
  approveWebsiteVersion,
  hideWebsite,
  unhideWebsite,
  blockWebsite,
  unblockWebsite,
  revertToApprovedVersion,
  CANONICAL_ACTIONS,
} = require("../src/platform/website/websiteGovernanceService");
const { categorizeDiffItem, GOVERNANCE_CATEGORIES, buildVersionDiff } = require("../src/platform/website/reviewDiff");
const lifecycleService = require("../src/platform/website/lifecycleService");
const editSessionService = require("../src/platform/website/editSessionService");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const rbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_FIELD, getCsrfCookieName } = require("../src/platform/http/v5Csrf");
const {
  submitChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationService");
const {
  validatePlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const {
  publishChurchWebsite,
  acknowledgeWebsitePreview,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  listPlatformAdminWebsites,
  loadPlatformAdminWebsiteDetail,
} = require("../src/platform/website/platformAdminWebsitesService");
const {
  renderGovernanceVersionPreview,
  PREVIEW_MODE,
} = require("../src/platform/website/governanceVersionPreview");
const instanceRepo = require("../src/platform/website/instanceRepository");
const { createBlessBoardBranch } = require("../src/blessboard/services/createBlessBoardBranch");
const {
  initializeBranchWebsiteFromChurch,
} = require("../src/blessboard/services/initializeBranchWebsiteFromChurch");
const {
  assignOrganizationPlan,
  setOrganizationEntitlementOverride,
  FEATURE_KEYS,
} = require("../src/platform/services/entitlementService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const BB_ENV = {
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING,
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
};

let pool;
let skipReason = null;
let stamp = 0;
let churchIpSeq = 40;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

async function seedClinic(suffix) {
  stamp += 1;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `wsgov_${suffix}_${stamp}`,
    displayName: `Governance ${suffix}`,
    productKey: "activeclinic",
    productTenantKey: `wsgov-${suffix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  registerActiveClinicWebsiteTemplate();
  const provisioned = await provisionWebsiteInstance(pool, {
    organizationId: org.records.organization.id,
    templateId: ACTIVECLINIC_TEMPLATE_ID,
    templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
    slug: `wsgov-${suffix}-${stamp}`,
    status: "coming_soon",
    publishPolicy: PUBLISH_POLICY.AUTO_PUBLISH_WITH_MODERATION,
    lifecycleStatus: LIFECYCLE_STATUS.PROVISIONAL,
  });
  assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
  return {
    organizationId: org.records.organization.id,
    organizationKey: org.records.organization.key,
    instance: provisioned.instance,
  };
}

async function publishTitle(ctx, title) {
  const saved = await publicationService.saveDraftAndMaybePublish(pool, {
    organizationId: ctx.organizationId,
    instanceId: ctx.instance.id,
    contentKey: "home.hero.title",
    value: title,
    actorIdentityId: null,
  });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  await editSessionService.closeOpenSessionsForInstance(pool, {
    organizationId: ctx.organizationId,
    instanceId: ctx.instance.id,
    reason: editSessionService.CLOSE_REASON.FINISH,
  });
  const listed = await versionService.listWebsiteVersions(pool, {
    instanceId: ctx.instance.id,
    organizationId: ctx.organizationId,
  });
  const live = (listed.versions || []).find((row) => row.status === "published") || saved.version;
  return { ...saved, version: live };
}

async function liveTitle(ctx) {
  const resolved = await resolver.resolveWebsiteContent(pool, {
    organizationId: ctx.organizationId,
    instance: ctx.instance,
    mode: resolver.MODE.LIVE,
  });
  return resolved && resolved.values ? resolved.values["home.hero.title"] : null;
}

async function grantPlatformWebsiteRole(userId, organizationId, roleKey) {
  const role = await rbacRepo.findRoleByKey(pool, roleKey);
  assert.ok(role, `missing role ${roleKey}`);
  return rbacRepo.insertAssignment(pool, {
    userId,
    organizationId,
    roleId: role.id,
    scopeType: "platform",
    assignmentOrigin: "manual",
    assignmentReason: "website governance test",
  });
}

function extractCsrf(res, env) {
  const cookies = [].concat((res.headers && res.headers["set-cookie"]) || []);
  const name = getCsrfCookieName(env);
  const raw = cookies.find((c) => String(c).startsWith(`${name}=`)) || "";
  const match = String(raw).match(new RegExp(`${name}=([^;]+)`));
  if (match) return decodeURIComponent(match[1]);
  const html = String(res.text || "");
  const m = html.match(new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"`));
  return (m && m[1]) || "";
}

function cookieJar(sessionCookie, res) {
  const parts = [sessionCookie];
  for (const line of [].concat((res && res.headers && res.headers["set-cookie"]) || [])) {
    parts.push(String(line).split(";")[0]);
  }
  return parts.filter(Boolean).join("; ");
}

describe("shared website governance — mapping", () => {
  it("maps hide/block onto existing lifecycle without a third state", () => {
    assert.equal(websiteStatusFromLifecycle(LIFECYCLE_STATUS.PUBLIC), WEBSITE_STATUS.LIVE);
    assert.equal(websiteStatusFromLifecycle(LIFECYCLE_STATUS.OFFLINE), WEBSITE_STATUS.HIDDEN);
    assert.equal(websiteStatusFromLifecycle(LIFECYCLE_STATUS.SUSPENDED), WEBSITE_STATUS.BLOCKED);
    assert.equal(hasWebsitePermission([PERMISSIONS.REVIEW], PERMISSIONS.APPROVE), false);
    assert.equal(hasWebsitePermission([PERMISSIONS.APPROVE], PERMISSIONS.APPROVE), true);
    assert.equal(CANONICAL_ACTIONS.hide.functionName, "hideWebsite");
    assert.equal(CANONICAL_ACTIONS.block.functionName, "blockWebsite");
    assert.match(CANONICAL_ACTIONS.hide.aliases[0], /\/offline$/);
    assert.match(CANONICAL_ACTIONS.block.aliases[0], /\/suspend$/);
  });

  it("classifies diffs from registry metadata and falls back to other", () => {
    assert.equal(categorizeDiffItem({ contentKey: "home.hero.title", contentType: "short_text" }), "text");
    assert.equal(categorizeDiffItem({ contentKey: "home.hero.image", contentType: "image" }), "image");
    assert.equal(categorizeDiffItem({ contentKey: "home.nav.items", contentType: "structured" }), "section");
    assert.equal(categorizeDiffItem({ contentKey: "totally.unknown.key" }), "other");
    assert.ok(GOVERNANCE_CATEGORIES.includes("other"));
    const template = {
      productCode: "activeclinic",
      keys: {
        "seo.title": { type: "short_text", group: "seo", description: "SEO title" },
        "nav.about.label": { type: "short_text", group: "nav", description: "About" },
        "home.hero.title": { type: "short_text", group: "home", description: "Hero title" },
        "home.hero.image": { type: "image", group: "home", governanceCategory: "image" },
      },
    };
    assert.equal(categorizeDiffItem({ contentKey: "seo.title", contentType: "short_text" }, template), "seo");
    assert.equal(
      categorizeDiffItem({ contentKey: "nav.about.label", contentType: "short_text" }, template),
      "navigation"
    );
    const diff = buildVersionDiff({
      snapshot: { values: { "mystery.field": "new", "home.hero.title": "Hi" } },
      previousSnapshot: { values: { "mystery.field": "old", "home.hero.title": "Hello" } },
      template,
    });
    assert.ok(diff.groups.other.some((item) => item.contentKey === "mystery.field"));
    assert.ok(diff.groups.text.some((item) => item.contentKey === "home.hero.title"));
  });
});

describe("shared website governance", () => {
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
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no foundation db";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("lets the customer publish without approval, then records immutable approval", async () => {
    if (!requireDb()) return;
    const ctx = await seedClinic("approve");
    await lifecycleService.applyLifecycle(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      lifecycleStatus: LIFECYCLE_STATUS.PUBLIC,
      actorIdentityId: null,
    });
    const first = await publishTitle(ctx, "Live Without Approval");
    assert.equal(first.published, true);
    assert.ok(first.version);
    const listed = await listRecentWebsitePublications(pool, { organizationId: ctx.organizationId });
    assert.ok(listed.publications.length >= 1);
    const row = listed.publications[0];
    assert.equal(row.productCode, "activeclinic");
    assert.equal(row.reviewStatus, REVIEW_STATUS.UNREVIEWED);
    assert.equal(row.websiteStatus, WEBSITE_STATUS.LIVE);
    assert.ok(row.publicPath);
    assert.ok(row.currentVersionNumber >= 1);

    const approved = await approveWebsiteVersion(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      versionId: first.version.id,
      actorIdentityId: null,
      actorRole: "csr",
      actorDisplayName: "Support Reviewer",
      note: "Looks good",
    });
    assert.equal(approved.ok, true, JSON.stringify(approved));
    const after = await resolveApprovedVersions(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(after.currentPublished.id, first.version.id);
    assert.equal(after.lastApproved.version.id, first.version.id);
    const relisted = await listRecentWebsitePublications(pool, { organizationId: ctx.organizationId });
    assert.equal(relisted.publications[0].reviewStatus, REVIEW_STATUS.APPROVED);

    const second = await publishTitle(ctx, "Newer Unreviewed Title");
    assert.equal(second.published, true);
    const afterSecond = await resolveApprovedVersions(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(afterSecond.currentPublished.id, second.version.id);
    assert.equal(afterSecond.lastApproved.version.id, first.version.id);
    assert.equal(afterSecond.previousApproved, null);

    await approveWebsiteVersion(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      versionId: second.version.id,
      actorDisplayName: "Support Reviewer",
      note: "Second pass",
    });
    const afterThird = await resolveApprovedVersions(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(afterThird.lastApproved.version.id, second.version.id);
    assert.equal(afterThird.previousApproved.version.id, first.version.id);

    const events = await listModerationEvents(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      limit: 20,
    });
    const approvals = events.events.filter((ev) => ev.actionKey === ACTION.APPROVE_VERSION);
    assert.equal(approvals.length, 2);
    assert.equal(approvals[0].notes, "Second pass");
  });

  it("hides with offline semantics and unhides without dropping content", async () => {
    if (!requireDb()) return;
    const ctx = await seedClinic("hide");
    await lifecycleService.applyLifecycle(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      lifecycleStatus: LIFECYCLE_STATUS.PUBLIC,
    });
    await publishTitle(ctx, "Hide Me");
    const missingReason = await hideWebsite(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(missingReason.ok, false);
    assert.equal(missingReason.code, "reason_required");
    const hidden = await hideWebsite(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      reason: "Reported copy issue",
      actorRole: "csr",
    });
    assert.equal(hidden.ok, true, JSON.stringify(hidden));
    assert.equal(hidden.instance.lifecycleStatus, LIFECYCLE_STATUS.OFFLINE);
    assert.equal(hidden.instance.publishLocked, false);
    assert.equal(websiteStatusFromLifecycle(hidden.instance.lifecycleStatus), WEBSITE_STATUS.HIDDEN);
    assert.match(String(await liveTitle(ctx) || ""), /Hide Me/);
    const drafts = await contentService.listWebsiteContent(pool, hidden.instance, ctx.organizationId);
    assert.ok(drafts.length > 0);
    const restored = await unhideWebsite(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      actorRole: "csr",
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));
    assert.equal(restored.instance.lifecycleStatus, LIFECYCLE_STATUS.PUBLIC);
  });

  it("blocks with suspended semantics, requires reason, and needs explicit unblock", async () => {
    if (!requireDb()) return;
    const ctx = await seedClinic("block");
    await lifecycleService.applyLifecycle(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      lifecycleStatus: LIFECYCLE_STATUS.PUBLIC,
    });
    await publishTitle(ctx, "Block Me");
    const missingReason = await blockWebsite(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(missingReason.code, "reason_required");
    const blocked = await blockWebsite(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      reason: "Policy violation",
      actorRole: "csr",
    });
    assert.equal(blocked.ok, true, JSON.stringify(blocked));
    assert.equal(blocked.instance.lifecycleStatus, LIFECYCLE_STATUS.SUSPENDED);
    assert.equal(blocked.instance.publishLocked, true);
    const publishWhileBlocked = await publicationService.saveDraftAndMaybePublish(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "home.hero.title",
      value: "Should Not Publish",
    });
    assert.ok(
      publishWhileBlocked.ok === false || publishWhileBlocked.published === false,
      "blocked websites must not publish"
    );
    const unblocked = await unblockWebsite(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      actorRole: "csr",
    });
    assert.equal(unblocked.ok, true);
    assert.equal(unblocked.instance.lifecycleStatus, LIFECYCLE_STATUS.PUBLIC);
    assert.equal(unblocked.instance.publishLocked, false);
  });

  it("reverts to an approved version as a new published version and keeps history", async () => {
    if (!requireDb()) return;
    const ctx = await seedClinic("revert");
    await lifecycleService.applyLifecycle(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      lifecycleStatus: LIFECYCLE_STATUS.PUBLIC,
    });
    const v1 = await publishTitle(ctx, "Approved Original");
    await approveWebsiteVersion(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      versionId: v1.version.id,
      actorDisplayName: "Reviewer",
    });
    const v2 = await publishTitle(ctx, "Unwanted Change");
    const versionsBefore = await versionService.listWebsiteVersions(pool, {
      instanceId: ctx.instance.id,
      organizationId: ctx.organizationId,
    });
    const reverted = await revertToApprovedVersion(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      versionId: v1.version.id,
      reason: "Roll back bad copy",
      actorRole: "csr",
    });
    assert.equal(reverted.ok, true, JSON.stringify(reverted));
    assert.ok(reverted.version);
    assert.notEqual(reverted.version.id, v1.version.id);
    assert.notEqual(reverted.version.id, v2.version.id);
    assert.match(String(await liveTitle(ctx) || ""), /Approved Original/);
    const versionsAfter = await versionService.listWebsiteVersions(pool, {
      instanceId: ctx.instance.id,
      organizationId: ctx.organizationId,
    });
    assert.ok(versionsAfter.versions.length > versionsBefore.versions.length);
    assert.ok(versionsAfter.versions.some((row) => row.id === v1.version.id));
    assert.ok(versionsAfter.versions.some((row) => row.id === v2.version.id));
    const audit = await listWebsiteAudit(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      limit: 30,
    });
    assert.ok(audit.events.some((ev) => ev.actionKey === ACTION.REVERT));
  });

  it("allows CSR without platform_admin to review, and splits hide/block/approve grants", async () => {
    if (!requireDb()) return;
    const ctx = await seedClinic("csr");
    await lifecycleService.applyLifecycle(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      lifecycleStatus: LIFECYCLE_STATUS.PUBLIC,
    });
    const published = await publishTitle(ctx, "CSR Review Target");
    const csr = await createBlessBoardUser(pool, {
      email: `csr-gov-${stamp}@example.org`,
      password: PASSWORD,
      displayName: "CSR Reviewer",
    });
    assert.equal(csr.ok, true, JSON.stringify(csr));
    await grantPlatformWebsiteRole(csr.user.id, ctx.organizationId, "platform_website_support");
    const session = await createV5Session(pool, {
      deploymentCode: CODE_ORG_STAGING,
      userId: csr.user.id,
      organizationId: ctx.organizationId,
    });
    assert.equal(session.ok, true, JSON.stringify(session));
    const app = createV5FoundationApp({ getPool: () => pool, env: BB_ENV });
    const cookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;

    const adminHome = await request(app).get("/admin").set("Host", "blessboard.org").set("Cookie", cookie);
    assert.equal(adminHome.status, 403);

    const consolePage = await request(app)
      .get("/admin/recent-website-changes")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(consolePage.status, 200, consolePage.text.slice(0, 400));
    assert.match(consolePage.text, /data-website-governance-console="1"/);
    assert.match(consolePage.text, /Product/);
    assert.match(consolePage.text, /Organization/);
    assert.match(consolePage.text, /Public URL/);
    assert.match(consolePage.text, /Review Status/);
    assert.match(consolePage.text, /Website Status/);

    const detail = await request(app)
      .get(`/admin/recent-website-changes/version/${published.version.id}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(detail.status, 200, detail.text.slice(0, 400));
    assert.match(detail.text, /data-website-governance-review="1"/);
    assert.match(detail.text, /Text changes|Structured changes/);
    assert.doesNotMatch(detail.text, /data-website-governance="approve"/);
    assert.doesNotMatch(detail.text, /data-website-governance="hide"/);
    assert.doesNotMatch(detail.text, /data-website-governance="block"/);

    const csrf = extractCsrf(detail, BB_ENV);
    const jar = cookieJar(cookie, detail);
    const blocked = await request(app)
      .post(`/admin/organizations/${ctx.organizationKey}/website/block`)
      .set("Host", "blessboard.org")
      .set("Cookie", jar)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        reason: "CSR should not block",
        return_to: `/admin/recent-website-changes/version/${published.version.id}`,
      });
    assert.equal(blocked.status, 303);
    assert.match(String(blocked.headers.location || ""), /error=forbidden/);

    await grantPlatformWebsiteRole(csr.user.id, ctx.organizationId, "platform_website_approver");
    await grantPlatformWebsiteRole(csr.user.id, ctx.organizationId, "platform_website_hider");
    const detail2 = await request(app)
      .get(`/admin/recent-website-changes/version/${published.version.id}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.match(detail2.text, /data-website-governance="approve"/);
    assert.match(detail2.text, /data-website-governance="hide"/);
    assert.doesNotMatch(detail2.text, /data-website-governance="block"/);
    const csrf2 = extractCsrf(detail2, BB_ENV);
    const jar2 = cookieJar(cookie, detail2);
    const approved = await request(app)
      .post(`/admin/organizations/${ctx.organizationKey}/website/approve`)
      .set("Host", "blessboard.org")
      .set("Cookie", jar2)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        version_id: published.version.id,
        note: "CSR approved",
        return_to: `/admin/recent-website-changes/version/${published.version.id}`,
      });
    assert.equal(approved.status, 303);
    assert.match(String(approved.headers.location || ""), /notice=approve/);
  });

  it("keeps review status version-specific across publish, skip, revert, hide, and block", async () => {
    if (!requireDb()) return;
    const ctx = await seedClinic("review-state");
    await lifecycleService.applyLifecycle(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      lifecycleStatus: LIFECYCLE_STATUS.PUBLIC,
    });
    const v1 = await publishTitle(ctx, "Version One Approved");
    await approveWebsiteVersion(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      versionId: v1.version.id,
      note: "v1 ok",
    });
    const v2 = await publishTitle(ctx, "Version Two Unreviewed");
    const afterV2 = await resolveApprovedVersions(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(afterV2.currentPublished.id, v2.version.id);
    assert.equal(afterV2.lastApproved.version.id, v1.version.id);
    assert.equal(afterV2.previousApproved, null);
    const listedV2 = await listRecentWebsitePublications(pool, { organizationId: ctx.organizationId });
    assert.equal(listedV2.publications[0].reviewStatus, REVIEW_STATUS.UNREVIEWED);
    await approveWebsiteVersion(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      versionId: v1.version.id,
      note: "repeat v1 must not approve v2",
    });
    const afterRepeat = await resolveApprovedVersions(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(afterRepeat.lastApproved.version.id, v1.version.id);
    assert.notEqual(afterRepeat.lastApproved.version.id, v2.version.id);
    const v3 = await publishTitle(ctx, "Version Three");
    await approveWebsiteVersion(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      versionId: v3.version.id,
      note: "v3 approved; v2 stays unreviewed",
    });
    const afterV3 = await resolveApprovedVersions(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(afterV3.currentPublished.id, v3.version.id);
    assert.equal(afterV3.lastApproved.version.id, v3.version.id);
    assert.equal(afterV3.previousApproved.version.id, v1.version.id);
    assert.ok(!afterV3.approvedHistory.some((row) => row.version.id === v2.version.id));
    const reverted = await revertToApprovedVersion(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      versionId: v1.version.id,
      reason: "Restore approved original",
    });
    assert.equal(reverted.ok, true);
    const afterRevert = await resolveApprovedVersions(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.notEqual(afterRevert.currentPublished.id, v3.version.id);
    assert.equal(afterRevert.lastApproved.version.id, v3.version.id);
    const listedRevert = await listRecentWebsitePublications(pool, { organizationId: ctx.organizationId });
    assert.equal(listedRevert.publications[0].reviewStatus, REVIEW_STATUS.UNREVIEWED);
    const hidden = await hideWebsite(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      reason: "Hide after revert",
    });
    assert.equal(hidden.instance.lifecycleStatus, LIFECYCLE_STATUS.OFFLINE);
    await unhideWebsite(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    const blocked = await blockWebsite(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      reason: "Block after unhide",
    });
    assert.equal(blocked.instance.lifecycleStatus, LIFECYCLE_STATUS.SUSPENDED);
    const unblocked = await unblockWebsite(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(unblocked.instance.lifecycleStatus, LIFECYCLE_STATUS.PUBLIC);
    const events = await listModerationEvents(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      limit: 40,
    });
    const keys = events.events.map((ev) => ev.actionKey);
    assert.ok(keys.includes(ACTION.APPROVE_VERSION));
    assert.ok(keys.includes(ACTION.HIDE));
    assert.ok(keys.includes(ACTION.UNHIDE));
    assert.ok(keys.includes(ACTION.BLOCK));
    assert.ok(keys.includes(ACTION.UNBLOCK));
    assert.ok(keys.includes(ACTION.REVERT));
  });

  it("enforces the platform website role matrix, org-scope denial, CSRF, and tenant isolation", async () => {
    if (!requireDb()) return;
    const ctxA = await seedClinic("iso-a");
    const ctxB = await seedClinic("iso-b");
    await lifecycleService.applyLifecycle(pool, {
      organizationId: ctxA.organizationId,
      instanceId: ctxA.instance.id,
      lifecycleStatus: LIFECYCLE_STATUS.PUBLIC,
    });
    await lifecycleService.applyLifecycle(pool, {
      organizationId: ctxB.organizationId,
      instanceId: ctxB.instance.id,
      lifecycleStatus: LIFECYCLE_STATUS.PUBLIC,
    });
    const publishedA = await publishTitle(ctxA, "Tenant A Live");
    await publishTitle(ctxB, "Tenant B Live");
    const app = createV5FoundationApp({ getPool: () => pool, env: BB_ENV });

    const orgScoped = await createBlessBoardUser(pool, {
      email: `org-review-${stamp}@example.org`,
      password: PASSWORD,
      displayName: "Org Scoped Reviewer",
    });
    const orgRole = await rbacRepo.findRoleByKey(pool, "platform_website_support");
    await rbacRepo.insertAssignment(pool, {
      userId: orgScoped.user.id,
      organizationId: ctxA.organizationId,
      roleId: orgRole.id,
      scopeType: "organisation",
      scopeId: ctxA.organizationId,
      assignmentOrigin: "manual",
      assignmentReason: "invalid org-scoped website.review",
    });
    const orgSession = await createV5Session(pool, {
      deploymentCode: CODE_ORG_STAGING,
      userId: orgScoped.user.id,
      organizationId: ctxA.organizationId,
    });
    const orgCookie = `${DEFAULT_V5_COOKIE}=${orgSession.rawToken}`;
    const orgDenied = await request(app)
      .get("/admin/recent-website-changes")
      .set("Host", "blessboard.org")
      .set("Cookie", orgCookie);
    assert.equal(orgDenied.status, 403);
    assert.match(orgDenied.text, /organization-scoped website\.review/i);
    assert.doesNotMatch(orgDenied.text, /data-website-governance-console="1"/);

    const customer = await createBlessBoardUser(pool, {
      email: `customer-admin-${stamp}@example.org`,
      password: PASSWORD,
      displayName: "Customer Admin",
    });
    const hqRole = await rbacRepo.findRoleByKey(pool, "church_hq_admin");
    if (hqRole) {
      await rbacRepo.insertAssignment(pool, {
        userId: customer.user.id,
        organizationId: ctxA.organizationId,
        roleId: hqRole.id,
        scopeType: "church",
        assignmentOrigin: "manual",
        assignmentReason: "customer self-service",
      });
    }
    const customerSession = await createV5Session(pool, {
      deploymentCode: CODE_ORG_STAGING,
      userId: customer.user.id,
      organizationId: ctxA.organizationId,
    });
    const customerDenied = await request(app)
      .get("/admin/recent-website-changes")
      .set("Host", "blessboard.org")
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${customerSession.rawToken}`);
    assert.equal(customerDenied.status, 403);

    async function sessionFor(roleKeys) {
      const user = await createBlessBoardUser(pool, {
        email: `csr-${roleKeys.join("-")}-${stamp}@example.org`,
        password: PASSWORD,
        displayName: roleKeys.join("+"),
      });
      for (const roleKey of roleKeys) {
        await grantPlatformWebsiteRole(user.user.id, ctxA.organizationId, roleKey);
      }
      const session = await createV5Session(pool, {
        deploymentCode: CODE_ORG_STAGING,
        userId: user.user.id,
        organizationId: ctxA.organizationId,
      });
      return `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
    }

    const supportCookie = await sessionFor(["platform_website_support"]);
    const supportPage = await request(app)
      .get(`/admin/recent-website-changes/version/${publishedA.version.id}`)
      .set("Host", "blessboard.org")
      .set("Cookie", supportCookie);
    assert.equal(supportPage.status, 200);
    assert.match(supportPage.text, /Platform-wide website governance|Recently Updated|Review changes/);
    assert.doesNotMatch(supportPage.text, /data-website-governance="approve"/);
    assert.doesNotMatch(supportPage.text, /data-website-governance="hide"/);
    assert.doesNotMatch(supportPage.text, /data-website-governance="block"/);
    assert.doesNotMatch(supportPage.text, /data-website-governance="revert"/);

    const noCsrf = await request(app)
      .post(`/admin/organizations/${ctxA.organizationKey}/website/hide`)
      .set("Host", "blessboard.org")
      .set("Cookie", supportCookie)
      .type("form")
      .send({ reason: "missing csrf" });
    assert.equal(noCsrf.status, 303);
    assert.match(String(noCsrf.headers.location || ""), /error=csrf/);

    const approverCookie = await sessionFor(["platform_website_support", "platform_website_approver"]);
    const approverPage = await request(app)
      .get(`/admin/recent-website-changes/version/${publishedA.version.id}`)
      .set("Host", "blessboard.org")
      .set("Cookie", approverCookie);
    assert.match(approverPage.text, /data-website-governance="approve"/);
    assert.doesNotMatch(approverPage.text, /data-website-governance="block"/);
    assert.doesNotMatch(approverPage.text, /data-website-governance="hide"/);
    assert.match(approverPage.text, /The website will no longer be publicly visible|Approve version/i);

    const hiderCookie = await sessionFor(["platform_website_support", "platform_website_hider"]);
    const hiderPage = await request(app)
      .get(`/admin/recent-website-changes/version/${publishedA.version.id}`)
      .set("Host", "blessboard.org")
      .set("Cookie", hiderCookie);
    assert.match(hiderPage.text, /data-website-governance="hide"/);
    assert.doesNotMatch(hiderPage.text, /data-website-governance="block"/);
    const hiderCsrf = extractCsrf(hiderPage, BB_ENV);
    const hidden = await request(app)
      .post(`/admin/organizations/${ctxA.organizationKey}/website/hide`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookieJar(hiderCookie, hiderPage))
      .type("form")
      .send({
        [CSRF_FIELD]: hiderCsrf,
        reason: "Hide tenant A only",
        return_to: `/admin/recent-website-changes/version/${publishedA.version.id}`,
      });
    assert.match(String(hidden.headers.location || ""), /notice=hide/);
    const instA = await require("../src/platform/website/instanceRepository").findWebsiteInstanceById(
      pool,
      ctxA.instance.id,
      ctxA.organizationId
    );
    const instB = await require("../src/platform/website/instanceRepository").findWebsiteInstanceById(
      pool,
      ctxB.instance.id,
      ctxB.organizationId
    );
    assert.equal(instA.lifecycleStatus, LIFECYCLE_STATUS.OFFLINE);
    assert.equal(instB.lifecycleStatus, LIFECYCLE_STATUS.PUBLIC);

    const blockerCookie = await sessionFor(["platform_website_support", "platform_website_blocker"]);
    const blockerPage = await request(app)
      .get(`/admin/recent-website-changes/version/${publishedA.version.id}`)
      .set("Host", "blessboard.org")
      .set("Cookie", blockerCookie);
    assert.match(blockerPage.text, /data-website-governance="block"/);
    assert.doesNotMatch(blockerPage.text, /data-website-governance="approve"/);
    assert.match(blockerPage.text, /Public access and customer publishing will be disabled/);

    const restorerCookie = await sessionFor(["platform_website_support", "platform_website_restorer"]);
    const restorerPage = await request(app)
      .get(`/admin/recent-website-changes/version/${publishedA.version.id}`)
      .set("Host", "blessboard.org")
      .set("Cookie", restorerCookie);
    assert.match(restorerPage.text, /data-website-governance="unhide"|data-website-governance="revert"/);
    assert.doesNotMatch(restorerPage.text, /data-website-governance="approve"/);
    assert.doesNotMatch(restorerPage.text, /data-website-governance="hide"/);
    assert.doesNotMatch(restorerPage.text, /data-website-governance="block"/);

    const alias = await request(app)
      .post(`/admin/organizations/${ctxA.organizationKey}/website/offline`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookieJar(hiderCookie, hiderPage))
      .type("form")
      .send({ [CSRF_FIELD]: hiderCsrf, reason: "legacy alias" });
    assert.equal(alias.status, 303);

    const preview = await request(app)
      .get(`/admin/organizations/${ctxA.organizationKey}/website/versions/${publishedA.version.id}/render`)
      .set("Host", "blessboard.org")
      .set("Cookie", supportCookie);
    assert.equal(preview.status, 200);
    assert.match(preview.text, /Governance preview|not a live publication/i);
  });

  async function provisionGovernanceChurch(suffix) {
    stamp += 1;
    const key = `bbgov${suffix}${stamp}`.replace(/[^a-z0-9]/g, "").slice(0, 24);
    const body = {
      church_name: `Gov Church ${suffix} ${stamp}`,
      country: "Zambia",
      city: "Lusaka",
      contact_name: "Church Administrator",
      role_in_church: "Pastor",
      phone: `+2609${String(920010000 + stamp).slice(-8)}`,
      email: `${key}@example.org`,
      selected_plan: "foundation",
      organization_key: key,
      password: PASSWORD,
      password_confirm: PASSWORD,
      branch_name: "HQ Campus",
      consent_contact: "on",
    };
    const validation = validatePlatformChurchRegistration(body, { instantFreeEnabled: true });
    assert.equal(validation.ok, true, JSON.stringify(validation));
    const church = await submitChurchRegistration(
      pool,
      { ip: `203.0.113.${(churchIpSeq += 1) % 250}`, requestId: `bbgov-${stamp}`, get: () => "test" },
      validation,
      {
        env: { PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING },
        dataEnvironment: "testing",
        deploymentCode: CODE_ORG_STAGING,
      }
    );
    assert.equal(church.ok, true, JSON.stringify(church));
    return {
      organizationId: church.records.organizationId || church.records.organization && church.records.organization.id,
      organizationKey: church.records.organizationKey,
      churchId: church.records.churchId || (church.records.church && church.records.church.id),
      administratorUserId:
        church.records.administratorUserId ||
        (church.records.administrator && church.records.administrator.id),
      records: church.records,
    };
  }

  it("lists BlessBoard currentVersionNumber from shared engine versions after registration", async () => {
    if (!requireDb()) return;
    const rec = await provisionGovernanceChurch("list");
    const listed = await listPlatformAdminWebsites(pool, { tab: "overview" });
    const row = listed.websites.find((site) => site.organizationKey === rec.organizationKey);
    assert.ok(row, "church missing from website listing");
    assert.equal(row.productCode, "blessboard");
    assert.ok(row.currentVersionNumber >= 1);
    const detail = await loadPlatformAdminWebsiteDetail(pool, rec.organizationKey);
    assert.equal(detail.ok, true);
    assert.ok(detail.currentVersionNumber >= 1);
    assert.equal(detail.currentVersionNumber, row.currentVersionNumber);
  });

  it("renders BlessBoard historical preview through the public tenant templates", async () => {
    if (!requireDb()) return;
    const rec = await provisionGovernanceChurch("render");
    await acknowledgeWebsitePreview(pool, {
      organizationId: rec.organizationId,
      actorUserId: rec.administratorUserId,
    });
    const published = await publishChurchWebsite(pool, {
      churchId: rec.churchId,
      organizationId: rec.organizationId,
      actorUserId: rec.administratorUserId,
      deferServiceTimes: true,
      confirmPublish: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
      forcePublishVersion: true,
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: rec.organizationId,
      productCode: "blessboard",
      scopeRef: null,
    });
    const listed = await versionService.listWebsiteVersions(pool, {
      instanceId: instance.id,
      organizationId: rec.organizationId,
    });
    const live = (listed.versions || []).find((row) => row.status === "published");
    assert.ok(live);
    const versionsBefore = listed.versions.length;
    const pagesBefore = await pool.query(
      `SELECT count(*)::int AS n FROM blessboard.public_pages WHERE church_id = $1`,
      [rec.churchId]
    );
    const lifecycleBefore = instance.lifecycleStatus;
    const rendered = await renderGovernanceVersionPreview(pool, {
      organizationKey: rec.organizationKey,
      instance,
      version: live,
      snapshot: live.snapshot || {},
    });
    assert.equal(rendered.ok, true, JSON.stringify(rendered));
    assert.equal(rendered.mode, PREVIEW_MODE.FULL_HISTORICAL_WEBSITE_RENDER);
    assert.match(rendered.html, /data-governance-preview-banner="1"/);
    assert.doesNotMatch(rendered.html, /data-governance-component-preview="1"/);
    assert.match(rendered.html, /noindex/i);
    const versionsAfter = await versionService.listWebsiteVersions(pool, {
      instanceId: instance.id,
      organizationId: rec.organizationId,
    });
    assert.equal(versionsAfter.versions.length, versionsBefore);
    const pagesAfter = await pool.query(
      `SELECT count(*)::int AS n FROM blessboard.public_pages WHERE church_id = $1`,
      [rec.churchId]
    );
    assert.equal(pagesAfter.rows[0].n, pagesBefore.rows[0].n);
    const instAfter = await instanceRepo.findWebsiteInstanceById(
      pool,
      instance.id,
      rec.organizationId
    );
    assert.equal(instAfter.lifecycleStatus, lifecycleBefore);
  });

  it("keeps BlessBoard HQ and branch historical previews isolated", async () => {
    if (!requireDb()) return;
    const rec = await provisionGovernanceChurch("branch");
    await assignOrganizationPlan(pool, {
      organizationId: rec.organizationId,
      planKey: "growth",
    });
    await setOrganizationEntitlementOverride(pool, {
      organizationId: rec.organizationId,
      featureKey: FEATURE_KEYS.MAX_BRANCHES,
      featureKind: "limit",
      limitValue: 20,
      reason: "test_governance_branch_preview",
    });
    const second = await createBlessBoardBranch(pool, {
      churchId: rec.churchId,
      organizationId: rec.organizationId,
      displayName: "East Campus",
      branchKey: `east${stamp}`,
      actorUserId: rec.administratorUserId,
    });
    assert.equal(second.ok, true, JSON.stringify(second));
    const branchId = second.branch && second.branch.id ? second.branch.id : second.branchId;
    assert.ok(branchId);
    const initialized = await initializeBranchWebsiteFromChurch(pool, {
      organizationId: rec.organizationId,
      churchId: rec.churchId,
      branchId,
      actorUserId: rec.administratorUserId,
    });
    assert.equal(initialized.ok, true, JSON.stringify(initialized));
    await acknowledgeWebsitePreview(pool, {
      organizationId: rec.organizationId,
      actorUserId: rec.administratorUserId,
    });
    const churchPub = await publishChurchWebsite(pool, {
      churchId: rec.churchId,
      organizationId: rec.organizationId,
      actorUserId: rec.administratorUserId,
      deferServiceTimes: true,
      confirmPublish: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
      forcePublishVersion: true,
    });
    assert.equal(churchPub.ok, true, JSON.stringify(churchPub));
    const branchPub = await publishChurchWebsite(pool, {
      churchId: rec.churchId,
      organizationId: rec.organizationId,
      branchId,
      actorUserId: rec.administratorUserId,
      deferServiceTimes: true,
      confirmPublish: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
      forcePublishVersion: true,
    });
    assert.equal(branchPub.ok, true, JSON.stringify(branchPub));
    const churchInstance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: rec.organizationId,
      productCode: "blessboard",
      scopeRef: null,
    });
    const branchInstance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: rec.organizationId,
      productCode: "blessboard",
      scopeRef: branchId,
    });
    assert.ok(churchInstance);
    assert.ok(branchInstance);
    assert.notEqual(churchInstance.id, branchInstance.id);
    const churchVersions = await versionService.listWebsiteVersions(pool, {
      instanceId: churchInstance.id,
      organizationId: rec.organizationId,
    });
    const branchVersions = await versionService.listWebsiteVersions(pool, {
      instanceId: branchInstance.id,
      organizationId: rec.organizationId,
    });
    const churchLive = (churchVersions.versions || []).find((row) => row.status === "published");
    const branchLive = (branchVersions.versions || []).find((row) => row.status === "published");
    assert.ok(churchLive);
    assert.ok(branchLive);
    const churchHtml = await renderGovernanceVersionPreview(pool, {
      organizationKey: rec.organizationKey,
      instance: churchInstance,
      version: churchLive,
      snapshot: churchLive.snapshot || {},
    });
    const branchHtml = await renderGovernanceVersionPreview(pool, {
      organizationKey: rec.organizationKey,
      instance: branchInstance,
      version: branchLive,
      snapshot: branchLive.snapshot || {},
    });
    assert.equal(churchHtml.ok, true);
    assert.equal(branchHtml.ok, true);
    assert.equal(churchHtml.mode, PREVIEW_MODE.FULL_HISTORICAL_WEBSITE_RENDER);
    assert.equal(branchHtml.mode, PREVIEW_MODE.FULL_HISTORICAL_WEBSITE_RENDER);
    const swapped = await versionService.getWebsiteVersion(pool, {
      versionId: branchLive.id,
      organizationId: rec.organizationId,
      instanceId: churchInstance.id,
    });
    assert.equal(swapped.ok, false);
  });

  it("blocks unauthorized historical preview and cross-org version rendering", async () => {
    if (!requireDb()) return;
    const recA = await provisionGovernanceChurch("seca");
    const recB = await provisionGovernanceChurch("secb");
    await acknowledgeWebsitePreview(pool, {
      organizationId: recA.organizationId,
      actorUserId: recA.administratorUserId,
    });
    const published = await publishChurchWebsite(pool, {
      churchId: recA.churchId,
      organizationId: recA.organizationId,
      actorUserId: recA.administratorUserId,
      deferServiceTimes: true,
      confirmPublish: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
      forcePublishVersion: true,
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    const instanceA = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: recA.organizationId,
      productCode: "blessboard",
      scopeRef: null,
    });
    const versionsA = await versionService.listWebsiteVersions(pool, {
      instanceId: instanceA.id,
      organizationId: recA.organizationId,
    });
    const liveA = (versionsA.versions || []).find((row) => row.status === "published");
    const app = createV5FoundationApp({ getPool: () => pool, env: BB_ENV });
    const support = await createBlessBoardUser(pool, {
      email: `bb-preview-support-${stamp}@example.org`,
      password: PASSWORD,
      displayName: "BB Preview Support",
    });
    await grantPlatformWebsiteRole(support.user.id, recA.organizationId, "platform_website_support");
    const supportSession = await createV5Session(pool, {
      deploymentCode: CODE_ORG_STAGING,
      userId: support.user.id,
      organizationId: recA.organizationId,
    });
    const supportCookie = `${DEFAULT_V5_COOKIE}=${supportSession.rawToken}`;
    const allowed = await request(app)
      .get(`/admin/organizations/${recA.organizationKey}/website/versions/${liveA.id}/render`)
      .set("Host", "blessboard.org")
      .set("Cookie", supportCookie);
    assert.equal(allowed.status, 200);
    assert.match(allowed.text, /data-governance-preview-banner="1"/);
    assert.doesNotMatch(allowed.text, /data-governance-component-preview="1"/);

    const anon = await request(app)
      .get(`/admin/organizations/${recA.organizationKey}/website/versions/${liveA.id}/render`)
      .set("Host", "blessboard.org");
    assert.ok(anon.status === 302 || anon.status === 303 || anon.status === 401 || anon.status === 403);

    const customer = await createBlessBoardUser(pool, {
      email: `bb-preview-customer-${stamp}@example.org`,
      password: PASSWORD,
      displayName: "Customer HQ",
    });
    const hqRole = await rbacRepo.findRoleByKey(pool, "church_hq_admin");
    if (hqRole) {
      await rbacRepo.insertAssignment(pool, {
        userId: customer.user.id,
        organizationId: recA.organizationId,
        roleId: hqRole.id,
        scopeType: "church",
        assignmentOrigin: "manual",
        assignmentReason: "customer self-service",
      });
    }
    const customerSession = await createV5Session(pool, {
      deploymentCode: CODE_ORG_STAGING,
      userId: customer.user.id,
      organizationId: recA.organizationId,
    });
    const customerDenied = await request(app)
      .get(`/admin/organizations/${recA.organizationKey}/website/versions/${liveA.id}/render`)
      .set("Host", "blessboard.org")
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${customerSession.rawToken}`);
    assert.ok(customerDenied.status === 403 || customerDenied.status === 302 || customerDenied.status === 303);

    const orgScoped = await createBlessBoardUser(pool, {
      email: `bb-preview-org-${stamp}@example.org`,
      password: PASSWORD,
      displayName: "Org Scoped Reviewer",
    });
    const orgRole = await rbacRepo.findRoleByKey(pool, "platform_website_support");
    await rbacRepo.insertAssignment(pool, {
      userId: orgScoped.user.id,
      organizationId: recA.organizationId,
      roleId: orgRole.id,
      scopeType: "organisation",
      scopeId: recA.organizationId,
      assignmentOrigin: "manual",
      assignmentReason: "invalid org-scoped website.review",
    });
    const orgSession = await createV5Session(pool, {
      deploymentCode: CODE_ORG_STAGING,
      userId: orgScoped.user.id,
      organizationId: recA.organizationId,
    });
    const orgDenied = await request(app)
      .get(`/admin/organizations/${recA.organizationKey}/website/versions/${liveA.id}/render`)
      .set("Host", "blessboard.org")
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${orgSession.rawToken}`);
    assert.equal(orgDenied.status, 403);

    const cross = await request(app)
      .get(`/admin/organizations/${recB.organizationKey}/website/versions/${liveA.id}/render`)
      .set("Host", "blessboard.org")
      .set("Cookie", supportCookie);
    assert.equal(cross.status, 404);

    const missing = await request(app)
      .get(`/admin/organizations/${recA.organizationKey}/website/versions/00000000-0000-4000-8000-000000000099/render`)
      .set("Host", "blessboard.org")
      .set("Cookie", supportCookie);
    assert.equal(missing.status, 404);
  });

  it("keeps BlessBoard listing, detail, and review state aligned across publish and approve", async () => {
    if (!requireDb()) return;
    const rec = await provisionGovernanceChurch("state");
    await acknowledgeWebsitePreview(pool, {
      organizationId: rec.organizationId,
      actorUserId: rec.administratorUserId,
    });
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: rec.organizationId,
      productCode: "blessboard",
      scopeRef: null,
    });
    const first = await publishChurchWebsite(pool, {
      churchId: rec.churchId,
      organizationId: rec.organizationId,
      actorUserId: rec.administratorUserId,
      deferServiceTimes: true,
      confirmPublish: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
      forcePublishVersion: true,
    });
    assert.equal(first.ok, true, JSON.stringify(first));
    let resolved = await resolveApprovedVersions(pool, {
      organizationId: rec.organizationId,
      instanceId: instance.id,
    });
    assert.ok(resolved.currentPublished);
    assert.ok(resolved.currentPublished.versionNumber >= 1);
    const v1 = resolved.currentPublished;
    await approveWebsiteVersion(pool, {
      organizationId: rec.organizationId,
      instanceId: instance.id,
      versionId: v1.id,
      note: "v1 ok",
    });
    resolved = await resolveApprovedVersions(pool, {
      organizationId: rec.organizationId,
      instanceId: instance.id,
    });
    assert.equal(resolved.currentPublished.id, v1.id);
    assert.equal(resolved.lastApproved.version.id, v1.id);
    const listedApproved = await listPlatformAdminWebsites(pool, { tab: "overview" });
    const approvedRow = listedApproved.websites.find((site) => site.organizationKey === rec.organizationKey);
    assert.equal(approvedRow.reviewStatus, REVIEW_STATUS.APPROVED);
    assert.equal(approvedRow.currentVersionNumber, v1.versionNumber);
    assert.equal(approvedRow.lastApprovedVersionNumber, v1.versionNumber);

    const second = await publishChurchWebsite(pool, {
      churchId: rec.churchId,
      organizationId: rec.organizationId,
      actorUserId: rec.administratorUserId,
      deferServiceTimes: true,
      confirmPublish: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
      forcePublishVersion: true,
    });
    assert.equal(second.ok, true, JSON.stringify(second));
    resolved = await resolveApprovedVersions(pool, {
      organizationId: rec.organizationId,
      instanceId: instance.id,
    });
    assert.notEqual(resolved.currentPublished.id, v1.id);
    assert.equal(resolved.lastApproved.version.id, v1.id);
    const listedUnreviewed = await listPlatformAdminWebsites(pool, { tab: "overview" });
    const unreviewedRow = listedUnreviewed.websites.find(
      (site) => site.organizationKey === rec.organizationKey
    );
    assert.equal(unreviewedRow.reviewStatus, REVIEW_STATUS.UNREVIEWED);
    assert.equal(unreviewedRow.lastApprovedVersionNumber, v1.versionNumber);
    const detail = await loadPlatformAdminWebsiteDetail(pool, rec.organizationKey);
    assert.equal(detail.reviewStatus, REVIEW_STATUS.UNREVIEWED);
    assert.equal(detail.currentVersionNumber, resolved.currentPublished.versionNumber);
  });
});
