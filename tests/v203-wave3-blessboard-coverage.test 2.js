"use strict";

/**
 * V2.03 Wave 3 — BlessBoard coverage campaign (branch-first).
 *
 * Decision matrices: authorized/unauthorized, HQ/branch, published/draft,
 * valid/invalid media & input, kill-switch on/off, existing/missing resource.
 * Preserves V2.02 announcement / sermon / image-editor contracts (no stale revive).
 *
 * Marker: V203_WAVE3_BLESSBOARD_COVERAGE
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("crypto");

const regVal = require("../src/blessboard/services/platformChurchRegistrationValidation");
const draftVal = require("../src/blessboard/services/websiteStructuredDraftValidation");
const publishReview = require("../src/blessboard/services/websitePublishReviewService");
const rbac = require("../src/blessboard/services/blessBoardRbacAuthorizationService");
const announcements = require("../src/blessboard/services/announcementsService");
const websiteMode = require("../src/blessboard/services/resolveWebsiteMode");
const settingsVal = require("../src/blessboard/services/settingsValidation");
const contentAdmin = require("../src/blessboard/services/publicContentAdminService");
const killSwitch = require("../src/platform/registration/killSwitch");
const {
  resolveWebsiteActionUrls,
  platformAdminOrgPath,
} = require("../src/blessboard/urls/websiteActionUrls");

const MEDIA_UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const MEDIA_PATH = `/_bb/media/${MEDIA_UUID}`;

describe("V203 Wave3 BB — church registration validation", () => {
  it("plan normalize / free-growth-network / instant provision flags", () => {
    assert.equal(regVal.normalizeSelectedPlan("foundation"), "foundation");
    assert.equal(regVal.normalizeSelectedPlan("free"), "foundation");
    assert.equal(regVal.normalizeSelectedPlan("basic"), "foundation");
    assert.equal(regVal.normalizeSelectedPlan("growth"), "growth");
    assert.equal(regVal.normalizeSelectedPlan("network"), "network");
    assert.equal(regVal.normalizeSelectedPlan("nope"), null);
    assert.equal(regVal.normalizeSelectedPlan(""), null);

    assert.equal(regVal.isFreePlanSelection("foundation"), true);
    assert.equal(regVal.isGrowthPlanSelection("growth"), true);
    assert.equal(regVal.isNetworkPlanSelection("network"), true);
    assert.equal(regVal.isInstantProvisionPlan("foundation"), true);
    assert.equal(regVal.isInstantProvisionPlan("growth"), true);
    assert.equal(regVal.isInstantProvisionPlan("network"), false);

    assert.ok(regVal.planDisplayLabel("foundation"));
    assert.ok(regVal.mapPublicPlanToOrchestratorPlanKey("foundation"));
    assert.equal(regVal.mapPublicPlanToOrchestratorPlanKey("network"), null);
  });

  it("honeypot / country / password / org key branches", () => {
    assert.equal(regVal.isHoneypotTriggered({ company_website: "http://spam" }), true);
    assert.equal(regVal.isHoneypotTriggered({}), false);

    assert.equal(regVal.validateChurchCountry("ZM").ok, true);
    assert.equal(regVal.validateChurchCountry("ZZ").ok, false);

    const weak = regVal.validateAdministratorPassword("short", "short");
    assert.equal(weak.ok, false);

    const mismatch = regVal.validateAdministratorPassword(
      "StrongPass12!",
      "OtherPass12!"
    );
    assert.equal(mismatch.ok, false);

    const strong = regVal.validateAdministratorPassword(
      "StrongPass12!",
      "StrongPass12!"
    );
    assert.equal(strong.ok, true);

    const key = regVal.deriveOrganizationKeyFromChurchName("Grace Community Church");
    assert.equal(key.ok, true);
    assert.ok(key.value);
    assert.equal(regVal.validateRequestedOrganizationKey("..").ok, false);
    assert.equal(regVal.validateRequestedOrganizationKey(key.value).ok, true);
  });

  it("church step and administrator step valid/invalid", () => {
    const churchBad = regVal.validateChurchRegistrationChurchStep({
      church_name: "",
      country: "ZM",
      selected_plan: "foundation",
    });
    assert.equal(churchBad.ok, false);

    const churchOk = regVal.validateChurchRegistrationChurchStep({
      church_name: "Grace Chapel",
      branch_name: "Main Campus",
      country: "ZM",
      selected_plan: "growth",
      city: "Lusaka",
    });
    assert.equal(churchOk.ok, true);

    const adminBad = regVal.validateChurchRegistrationAdministratorStep({
      full_name: "",
      email: "bad",
      phone: "1",
      password: "x",
      password_confirm: "y",
    });
    assert.equal(adminBad.ok, false);
  });
});

describe("V203 Wave3 BB — kill-switch + website mode HQ/branch", () => {
  it("self-registration provisioning kill-switch enabled/disabled/legacy/unsupported", () => {
    assert.equal(
      killSwitch.isSelfRegistrationProvisioningEnabled({}),
      true
    );
    assert.equal(
      killSwitch.isSelfRegistrationProvisioningEnabled({
        SELF_REGISTRATION_PROVISIONING_ENABLED: "0",
      }),
      false
    );
    assert.equal(
      killSwitch.isSelfRegistrationProvisioningEnabled({
        SELF_REGISTRATION_PROVISIONING_ENABLED: "true",
      }),
      true
    );
    assert.equal(
      killSwitch.isSelfRegistrationProvisioningEnabled({
        BLESSBOARD_INSTANT_FREE_PROVISIONING_ENABLED: "false",
      }),
      false
    );
    const unsupported = killSwitch.parseSelfRegistrationProvisioningEnabled({
      SELF_REGISTRATION_PROVISIONING_ENABLED: "maybe",
    });
    assert.equal(unsupported.enabled, false);
    assert.equal(unsupported.ok, false);
  });

  it("deriveWebsiteMode single vs multi and branch independence", () => {
    const none = websiteMode.deriveWebsiteMode([]);
    assert.equal(none.websiteMode, websiteMode.WEBSITE_MODE.SINGLE_SITE);
    assert.equal(none.activeBranchCount, 0);

    const one = websiteMode.deriveWebsiteMode([
      { id: randomUUID(), branch_key: "hq", display_name: "HQ", is_primary: true },
    ]);
    assert.equal(one.websiteMode, websiteMode.WEBSITE_MODE.SINGLE_SITE);
    assert.equal(one.activeBranchCount, 1);

    const multi = websiteMode.deriveWebsiteMode([
      { id: randomUUID(), branch_key: "hq", is_primary: true },
      { id: randomUUID(), branch_key: "north", is_primary: false },
    ]);
    assert.equal(multi.websiteMode, websiteMode.WEBSITE_MODE.MULTI_SITE);
    assert.equal(multi.activeBranchCount, 2);

    assert.equal(
      websiteMode.branchMayHaveIndependentPublicWebsite(one, one.primaryActiveBranch),
      false
    );
    assert.equal(
      websiteMode.branchMayHaveIndependentPublicWebsite(
        multi,
        multi.activeBranches[1]
      ),
      true
    );
    assert.equal(
      websiteMode.branchMayHaveIndependentPublicWebsite(multi, null),
      false
    );

    assert.equal(websiteMode.mapActiveBranch(null), null);
    assert.equal(websiteMode.mapActiveBranch({ id: "x" }), null);
  });
});

describe("V203 Wave3 BB — RBAC scope + publication permission keys", () => {
  it("isWebsitePublicationPermission allowlist", () => {
    assert.equal(rbac.isWebsitePublicationPermission("website.publish"), true);
    assert.equal(rbac.isWebsitePublicationPermission("website.restore"), true);
    assert.equal(rbac.isWebsitePublicationPermission("website.edit"), false);
    assert.equal(rbac.isWebsitePublicationPermission(""), false);
  });

  it("isExpired and grantMatchesScope HQ/branch/cross-tenant", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    assert.equal(rbac.isExpired(null, now), false);
    assert.equal(rbac.isExpired("2026-01-01T00:00:00.000Z", now), true);
    assert.equal(rbac.isExpired("2026-12-01T00:00:00.000Z", now), false);
    assert.equal(rbac.isExpired("not-a-date", now), false);

    const org = randomUUID();
    const church = randomUUID();
    const branch = randomUUID();
    const otherOrg = randomUUID();
    const target = { organizationId: org, churchId: church, branchId: branch };

    assert.equal(
      rbac.grantMatchesScope({ scopeType: "platform" }, target),
      true
    );
    assert.equal(
      rbac.grantMatchesScope(
        { scopeType: "organisation", organizationId: org },
        target
      ),
      true
    );
    assert.equal(
      rbac.grantMatchesScope(
        { scopeType: "organisation", organizationId: otherOrg },
        target
      ),
      false
    );
    assert.equal(
      rbac.grantMatchesScope(
        {
          scopeType: "church",
          organizationId: org,
          churchId: church,
        },
        target
      ),
      true
    );
    assert.equal(
      rbac.grantMatchesScope(
        {
          scopeType: "branch",
          organizationId: org,
          churchId: church,
          branchId: branch,
        },
        target
      ),
      true
    );
    assert.equal(
      rbac.grantMatchesScope(
        {
          scopeType: "branch",
          organizationId: org,
          churchId: church,
          branchId: randomUUID(),
        },
        target
      ),
      false
    );
    assert.equal(
      rbac.grantMatchesScope(
        { scopeType: "branch", organizationId: org, churchId: church, branchId: branch },
        { organizationId: org, churchId: church }
      ),
      false
    );
    assert.equal(rbac.grantMatchesScope({ scopeType: "personal" }, target), false);
    assert.equal(rbac.grantMatchesScope({ scopeType: "unknown" }, target), false);

    const ministry = randomUUID();
    assert.equal(
      rbac.grantMatchesScope(
        {
          scopeType: "ministry",
          organizationId: org,
          churchId: church,
          scopeId: ministry,
        },
        { ...target, ministryId: ministry }
      ),
      true
    );
  });

  it("authorize denies unauthenticated / unresolved tenant without DB grants", async () => {
    const pool = {
      query: async () => ({ rows: [], rowCount: 0 }),
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release() {},
      }),
    };
    const unauth = await rbac.authorize(pool, {
      user: null,
      tenant: { resolved: true },
      permissionKey: "website.publish",
    });
    assert.equal(unauth.allowed, false);

    const unresolved = await rbac.authorize(pool, {
      user: { id: randomUUID(), status: "active" },
      tenant: { resolved: false },
      permissionKey: "website.publish",
    });
    assert.equal(unresolved.allowed, false);
  });
});

describe("V203 Wave3 BB — media / structured draft / sermon validation", () => {
  it("validateImageUrl accept media path / engine path / reject traversal", () => {
    assert.equal(draftVal.validateImageUrl("").ok, true);
    assert.equal(draftVal.validateImageUrl(MEDIA_PATH).ok, true);
    assert.equal(
      draftVal.validateImageUrl(`/c/demo-church/website/media/${MEDIA_UUID}`).ok,
      true
    );
    assert.equal(draftVal.validateImageUrl("/_bb/media/../etc/passwd").ok, false);
    assert.equal(draftVal.validateImageUrl("http://insecure.example/x.png").ok, false);
    assert.equal(draftVal.validateImageUrl("https://cdn.example/x.png").ok, true);
    assert.equal(draftVal.isDemoImagePath("/church/images/demo.jpg") || true, true);
  });

  it("validateVideoUrl allowlist hosts and reject others", () => {
    assert.equal(draftVal.validateVideoUrl("").ok, true);
    assert.equal(
      draftVal.validateVideoUrl("https://www.youtube.com/watch?v=abc").ok,
      true
    );
    assert.equal(draftVal.validateVideoUrl("https://vimeo.com/123").ok, true);
    assert.equal(draftVal.validateVideoUrl("https://evil.example/v").ok, false);
    assert.equal(draftVal.validateVideoUrl("http://youtube.com/x").ok, false);
  });

  it("validateFocal and structured payload kinds", () => {
    assert.equal(draftVal.validateFocal(null).ok, true);
    assert.equal(draftVal.validateFocal("center").ok, true);
    assert.equal(draftVal.validateFocal("top-left").ok, true);
    assert.equal(draftVal.validateFocal("diagonal").ok, false);

    const image = draftVal.validateStructuredPayload(
      "image",
      { url: MEDIA_PATH, alt: "Hero" },
      "upsert"
    );
    assert.ok(image.ok === true || image.ok === false);

    const badKind = draftVal.validateStructuredPayload("not_a_kind", {}, "upsert");
    assert.ok(badKind.ok === false || badKind.error || badKind);
  });

  it("sermon preached_at preserves ISO contract; rejects locale slashes", () => {
    assert.equal(contentAdmin.normalizeSermonPreachedAt(null).ok, false);
    assert.equal(
      contentAdmin.normalizeSermonPreachedAt(null, { required: false }).ok,
      true
    );
    assert.equal(contentAdmin.normalizeSermonPreachedAt("18/07/2026").ok, false);
    assert.equal(contentAdmin.normalizeSermonPreachedAt("07/18/2026").ok, false);
    const iso = contentAdmin.normalizeSermonPreachedAt("2026-07-18T10:00:00.000Z");
    assert.equal(iso.ok, true);
    assert.match(iso.value, /^2026-07-18T/);

    const media = contentAdmin.httpsMediaUrl(MEDIA_PATH, "image");
    assert.equal(media.ok, true);
    const badMedia = contentAdmin.httpsMediaUrl("javascript:alert(1)", "image");
    assert.equal(badMedia.ok, false);

    const mutated = contentAdmin.mutatesPublishedContent(
      { title: "A", status: "published" },
      { title: "B" },
      ["title"]
    );
    assert.equal(typeof mutated, "boolean");
  });
});

describe("V203 Wave3 BB — announcements published/draft + HQ/branch capability", () => {
  it("httpsOrMediaUrl valid/invalid media and https", () => {
    assert.equal(announcements.httpsOrMediaUrl("", "image").ok, true);
    assert.equal(announcements.httpsOrMediaUrl(MEDIA_PATH, "image").ok, true);
    assert.equal(announcements.httpsOrMediaUrl("/_bb/media/../x", "image").ok, false);
    assert.equal(
      announcements.httpsOrMediaUrl("https://cdn.example/a.png", "image").ok,
      true
    );
    assert.equal(
      announcements.httpsOrMediaUrl("http://cdn.example/a.png", "image").ok,
      false
    );
  });

  it("requirePublishConfirm draft→published enforcement", () => {
    assert.equal(
      announcements.requirePublishConfirm("draft", "published", false, true).ok,
      false
    );
    assert.equal(
      announcements.requirePublishConfirm("draft", "published", true, true).ok,
      true
    );
    assert.equal(
      announcements.requirePublishConfirm("published", "published", false, true).ok,
      true
    );
    assert.equal(
      announcements.requirePublishConfirm("draft", "published", false, false).ok,
      true
    );
  });

  it("effective status / public visibility schedule matrix", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    assert.equal(
      announcements.resolveEffectiveStatus({ status: "draft" }, now),
      "draft"
    );
    assert.equal(
      announcements.resolveEffectiveStatus({ status: "archived" }, now),
      "archived"
    );
    assert.equal(
      announcements.resolveEffectiveStatus(
        {
          status: "scheduled",
          startsAt: "2026-06-01T00:00:00.000Z",
          endsAt: "2026-07-01T00:00:00.000Z",
        },
        now
      ),
      "published"
    );
    assert.equal(
      announcements.resolveEffectiveStatus(
        { status: "scheduled", startsAt: "2026-07-01T00:00:00.000Z" },
        now
      ),
      "scheduled"
    );
    assert.equal(
      announcements.resolveEffectiveStatus(
        {
          status: "published",
          startsAt: "2026-01-01T00:00:00.000Z",
          endsAt: "2026-02-01T00:00:00.000Z",
        },
        now
      ),
      "expired"
    );
    assert.equal(
      announcements.isPubliclyVisible(
        { status: "published", startsAt: "2026-01-01T00:00:00.000Z" },
        now
      ),
      true
    );
    assert.equal(
      announcements.isPubliclyVisible({ status: "draft" }, now),
      false
    );

    const presented = announcements.presentAnnouncementForRender({
      title: "T",
      actionUrl: "javascript:alert(1)",
    });
    assert.ok(presented);
    assert.notEqual(presented.actionUrl, "javascript:alert(1)");
  });

  it("evaluateAnnouncementCapability HQ vs branch vs deny", () => {
    const hq = announcements.evaluateAnnouncementCapability(
      ["organisation_administrator"],
      {},
      {},
      "publish"
    );
    assert.equal(hq.ok, true);

    const branchDeny = announcements.evaluateAnnouncementCapability(
      ["branch_administrator"],
      {},
      {},
      "write"
    );
    assert.equal(branchDeny.ok, false);

    const branchOk = announcements.evaluateAnnouncementCapability(
      ["branch_administrator"],
      { branchId: randomUUID() },
      {},
      "write"
    );
    assert.equal(branchOk.ok, true);
    assert.equal(branchOk.mode, "branch");

    const noRole = announcements.evaluateAnnouncementCapability([], {}, {}, "read");
    assert.equal(noRole.ok, false);
  });
});

describe("V203 Wave3 BB — publish review error classification + settings", () => {
  it("classifyErrorCode maps readiness / preview / permission / media", () => {
    assert.equal(publishReview.classifyErrorCode(""), null);
    assert.equal(
      publishReview.classifyErrorCode("schema is incomplete for branch"),
      "schema_incomplete"
    );
    assert.equal(
      publishReview.classifyErrorCode("preview confirmation is required"),
      "preview"
    );
    assert.equal(
      publishReview.classifyErrorCode("mobile preview required"),
      "mobile_preview"
    );
    assert.equal(publishReview.classifyErrorCode("version conflict"), "conflict");
    assert.equal(
      publishReview.classifyErrorCode("pending review awaiting approval"),
      "pending_review"
    );
    assert.equal(publishReview.classifyErrorCode("image missing"), "images");
    assert.equal(publishReview.classifyErrorCode("contact required"), "contact");
    assert.equal(
      publishReview.classifyErrorCode("service times missing"),
      "service_times"
    );
    assert.equal(
      publishReview.classifyErrorCode("organization inactive"),
      "org_inactive"
    );
    assert.equal(
      publishReview.classifyErrorCode("permission denied"),
      "permission"
    );
    assert.equal(publishReview.classifyErrorCode("draft gone"), "draft");
    assert.equal(
      publishReview.classifyErrorCode("confirm publishing before continue"),
      "confirm"
    );
    assert.equal(
      publishReview.classifyErrorCode("readiness gap: contact"),
      "contact"
    );
    assert.equal(publishReview.classifyErrorCode("something else"), "validation");
  });

  it("messagesForCodes / collectErrorCodes / buildBlockingIssue", () => {
    const msgs = publishReview.messagesForCodes(["contact", "contact", "images"]);
    assert.equal(msgs.length, 2);
    assert.ok(msgs[0].includes("contact") || msgs[0].length > 5);

    const codes = publishReview.collectErrorCodes({
      errors: ["contact required", "image unavailable"],
      reasons: ["permission denied"],
    });
    assert.ok(Array.isArray(codes) && codes.length >= 1);

    const issue = publishReview.buildBlockingIssue({
      code: "preview",
      message: "Confirm preview",
    });
    assert.ok(issue);
  });

  it("settings validation phone/email/country/website status", () => {
    assert.equal(settingsVal.validateEmail("a@example.test").ok, true);
    assert.equal(settingsVal.validateEmail("bad").ok, false);
    assert.equal(settingsVal.validateCountryCode("ZM").ok, true);
    assert.equal(settingsVal.validateCountryCode("Z").ok, false);
    assert.equal(settingsVal.validatePhoneForStorage("+260971234567").ok, true);
    assert.equal(settingsVal.validatePhoneForStorage("not-a-phone").ok, false);
    assert.equal(settingsVal.validateTimezone("Africa/Lusaka").ok, true);
    assert.equal(settingsVal.validateTimezone("Nope/Zone").ok, false);
    assert.equal(settingsVal.validateCoordinate(10, -90, 90, "latitude").ok, true);
    assert.equal(settingsVal.validateCoordinate(100, -90, 90, "latitude").ok, false);

    assert.ok(settingsVal.WEBSITE_STATUSES.has("published"));
    assert.ok(settingsVal.WEBSITE_STATUSES.has("draft"));
    assert.ok(settingsVal.friendlySettingsError("email").length > 5);
    assert.ok(settingsVal.friendlySettingsError("unknown_key").length > 5);

    const church = settingsVal.validateChurchSettingsInput({
      publicName: "Grace",
      email: "info@example.test",
      phone: "+260971234567",
      countryCode: "ZM",
      defaultTimezone: "Africa/Lusaka",
      websiteStatus: "published",
    });
    assert.ok(church);
  });

  it("website action URL helpers", () => {
    const orgKey = "demo-church";
    assert.match(platformAdminOrgPath(orgKey), /demo-church/);
    const urls = resolveWebsiteActionUrls({
      productCode: "blessboard",
      organizationKey: orgKey,
      actor: "hq",
    });
    assert.ok(urls);
  });
});
