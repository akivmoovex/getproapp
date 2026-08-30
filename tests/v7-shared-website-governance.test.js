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
} = require("../src/platform/website/websiteGovernanceService");
const { categorizeDiffItem } = require("../src/platform/website/reviewDiff");
const lifecycleService = require("../src/platform/website/lifecycleService");
const editSessionService = require("../src/platform/website/editSessionService");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const rbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_FIELD, getCsrfCookieName } = require("../src/platform/http/v5Csrf");

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
    assert.equal(categorizeDiffItem({ contentKey: "home.hero.title", contentType: "short_text" }), "text");
    assert.equal(categorizeDiffItem({ contentKey: "home.hero.image", contentType: "image" }), "image");
    assert.equal(categorizeDiffItem({ contentKey: "home.nav.items", contentType: "structured" }), "navigation");
    assert.equal(categorizeDiffItem({ contentKey: "home.seo.title", contentType: "short_text" }), "seo");
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
});
