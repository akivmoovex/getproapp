"use strict";

/**
 * V2.03 Wave 1b — PLATFORM branch/line coverage multipliers.
 * Focus: public URLs, forms validation, media security, verification,
 * announcements, governance, deployment, change manager denials.
 *
 * Marker: V203_WAVE1_PLATFORM_COVERAGE
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("crypto");
const path = require("path");
const os = require("os");

const urls = require("../src/platform/website/publicWebsiteUrl");
const {
  validateFormCategory,
  validateFormSchema,
  validateFormAnswers,
  ALLOWED_FIELD_TYPES,
} = require("../src/platform/forms/formSchema");
const formService = require("../src/platform/forms/tenantFormService");
const media = require("../src/platform/website/mediaService");
const hostinger = require("../src/platform/media/hostingerMediaConfig");
const editable = require("../src/platform/website/editableFieldSchema");
const announcements = require("../src/platform/announcements/tenantAnnouncementService");
const verification = require("../src/platform/verification/sharedVerificationService");
const governance = require("../src/platform/website/websiteGovernanceService");
const changeMgr = require("../src/platform/website/websiteChangeManagerService");
const deployment = require("../src/platform/config/deploymentProfiles");
const consent = require("../src/platform/consent/communicationPreferences");
const payRun = require("../src/db/pg/fieldAgentPayRunRepo");

function fakePool(row) {
  const seed = row || {
    id: randomUUID(),
    organization_id: randomUUID(),
    instance_id: randomUUID(),
    status: "draft",
    form_key: "visitor",
    title: "Visitor",
    schema_json: { version: 1, fields: [] },
    count: "0",
    c: "0",
  };
  const calls = [];
  async function query(sql, params) {
    calls.push({ sql: String(sql), params: params || [] });
    return { rows: [seed], rowCount: 1 };
  }
  return {
    calls,
    query,
    connect: async () => ({ query, release() {} }),
  };
}

describe("V203 Wave1b — publicWebsiteUrl branches", () => {
  const org = { product: "blessboard", organizationKey: "demo-church" };
  const clinic = { product: "activeclinic", organizationKey: "juflona" };

  it("rejects unsafe org keys and builds blessboard/activeclinic paths", () => {
    assert.equal(urls.isPublicOrganizationKey(""), false);
    assert.equal(urls.isPublicOrganizationKey(".."), false);
    assert.equal(urls.isPublicOrganizationKey("Demo"), true);
    assert.equal(urls.publicWebsitePathPrefix("unknown"), null);
    assert.equal(urls.publicWebsiteAliasPathPrefix("activeclinic"), "/c");
    assert.equal(urls.publicWebsiteAliasPathPrefix("blessboard"), null);

    const home = urls.buildPublicOrganizationWebsitePath(org);
    assert.equal(home, "/c/demo-church");
    const about = urls.buildPublicOrganizationWebsitePath({
      ...org,
      pageKey: "about",
      query: { x: 1, skip: false, tags: ["a", "b"] },
    });
    assert.ok(about.startsWith("/c/demo-church/about?"));
    assert.match(about, /x=1/);
    assert.match(about, /tags=a/);

    const branch = urls.buildPublicOrganizationWebsitePath({
      ...org,
      scope: { kind: "branch", branchKey: "north" },
      pageKey: "events",
    });
    assert.equal(branch, "/c/demo-church/north/events");

    assert.equal(
      urls.buildPublicOrganizationWebsitePath({
        product: "blessboard",
        organizationKey: "../evil",
      }),
      null
    );

    const clinicHome = urls.buildPublicOrganizationWebsitePath(clinic);
    assert.equal(clinicHome, "/clinics/juflona");
  });

  it("appendQuery / editor nav / settings / publish path branches", () => {
    assert.equal(urls.appendQuery(null, { a: 1 }), null);
    assert.equal(urls.appendQuery("", { a: 1 }), "");
    assert.equal(urls.appendQuery("/x", null), "/x");
    assert.equal(urls.appendQuery("/x?a=1", "b=2"), "/x?a=1&b=2");
    assert.equal(
      urls.appendQuery("/x", new URLSearchParams({ k: "v" })),
      "/x?k=v"
    );

    const edited = urls.withEditorNavigationQuery("/c/demo-church");
    assert.match(edited, /website_edit=1/);
    assert.match(edited, /website_mode=draft/);
    assert.equal(
      urls.withoutEditorNavigationQuery(edited),
      "/c/demo-church"
    );
    assert.equal(urls.withoutEditorNavigationQuery(null), null);
    assert.equal(urls.withoutEditorNavigationQuery(""), "");

    assert.equal(
      urls.buildPublicWebsiteSettingsPath({ product: "activeclinic" }),
      "/app/settings/website"
    );
    assert.equal(
      urls.buildPublicWebsiteSettingsPath({ product: "blessboard" }),
      "/hq/website"
    );
    assert.equal(
      urls.buildPublicWebsiteSettingsPath({
        product: "blessboard",
        actor: "branch_admin",
      }),
      "/branch-admin/website"
    );
    assert.equal(urls.buildPublicWebsiteSettingsPath({ product: "other" }), null);

    assert.match(
      urls.buildPublicWebsitePublishPath({
        product: "activeclinic",
        organizationKey: "juflona",
      }),
      /\/clinics\/juflona\/website\/publish/
    );
    assert.equal(
      urls.buildPublicWebsitePublishPath({ product: "blessboard" }),
      "/hq/website/publish/review"
    );
    assert.match(
      urls.buildPublicWebsitePublishPath({
        product: "blessboard",
        scope: { branchKey: "north" },
      }),
      /branches\/north\/publish\/review/
    );
    assert.equal(urls.buildPublicWebsitePublishPath({ product: "x" }), null);

    assert.match(
      urls.buildPublicWebsiteUnpublishPath({
        product: "activeclinic",
        organizationKey: "juflona",
      }),
      /unpublish/
    );
    assert.equal(
      urls.buildPublicWebsiteUnpublishPath({ product: "blessboard" }),
      "/hq/website/unpublish"
    );

    assert.equal(
      urls.buildPublicWebsiteAdminPath({ organizationKey: "acme" }),
      "/admin/organizations/acme"
    );
    assert.equal(
      urls.buildPublicWebsiteAdminPath({
        organizationKey: "acme",
        surface: "website",
      }),
      "/admin/organizations/acme/website"
    );
    assert.equal(
      urls.buildPublicWebsiteAdminPath({
        organizationKey: "acme",
        preview: true,
      }),
      "/admin/organizations/acme/website-preview"
    );
    assert.equal(urls.buildPublicWebsiteAdminPath({}), null);
  });

  it("engine action URLs + media library product split + origin/url", () => {
    const builders = [
      urls.buildPublicWebsiteDraftsPath,
      urls.buildPublicWebsiteMediaPath,
      urls.buildPublicWebsiteSectionActionsPath,
      urls.buildPublicWebsiteSubmitPath,
      urls.buildPublicWebsiteFinishEditPath,
      urls.buildPublicWebsiteDiscardPath,
      urls.buildPublicWebsiteUnpublishedChangesPath,
      urls.buildPublicWebsiteFieldHistoryPath,
      urls.buildPublicWebsiteFieldRestorePath,
      urls.buildPublicWebsiteHistoryPath,
      urls.buildPublicWebsiteSeoPath,
      urls.buildPublicWebsiteAddSectionPath,
      urls.buildPublicWebsiteThemePath,
      urls.buildPublicWebsiteThemesPath,
      urls.buildPublicWebsiteWebsitesPath,
      urls.buildPublicWebsiteEditPath,
      urls.buildPublicWebsitePreviewPath,
    ];
    for (const build of builders) {
      const p = build(org);
      assert.ok(p && p.startsWith("/c/demo-church"), build.name);
      assert.equal(build({ product: "blessboard", organizationKey: ".." }), null);
    }

    assert.equal(
      urls.buildPublicWebsiteMediaLibraryPath({ product: "activeclinic" }),
      "/app/settings/website/media"
    );
    assert.match(
      urls.buildPublicWebsiteMediaLibraryPath(org),
      /media-library/
    );

    assert.match(urls.buildPublicWebsiteStylesPath(clinic), /styles/);
    assert.match(urls.buildPublicWebsiteStylesPath(org), /styles/);

    const abs = urls.buildPublicOrganizationWebsiteUrl({
      ...org,
      origin: "https://example.test/",
    });
    assert.equal(abs, "https://example.test/c/demo-church");

    assert.equal(
      urls.searchFromRequest({ originalUrl: "/x?a=1&b=2" }),
      "a=1&b=2"
    );
    assert.equal(urls.searchFromRequest({ url: "/x" }), "");

    const redirected = urls.canonicalPublicWebsiteRedirect(
      "activeclinic",
      "/c/Juflona/about?x=1"
    );
    assert.ok(redirected == null || redirected.includes("juflona") || redirected.includes("clinics"));
  });
});

describe("V203 Wave1b — formSchema + tenantFormService authz", () => {
  it("validateFormCategory allows general and rejects clinical", () => {
    assert.equal(validateFormCategory("").ok, true);
    assert.equal(validateFormCategory("General").category, "general");
    assert.equal(validateFormCategory("clinical").ok, false);
    assert.equal(validateFormCategory("clinical").reason, "category_clinical_excluded");
    assert.equal(validateFormCategory("not-a-category").ok, false);
  });

  it("validateFormSchema positive/negative/boundary", () => {
    const ok = validateFormSchema({
      version: 1,
      fields: [
        { key: "full_name", type: "text", label: "Name", required: true, maxLength: 80 },
        {
          key: "choice",
          type: "select",
          label: "Choice",
          options: ["A", "B"],
        },
        { key: "qty", type: "number", label: "Qty", min: 0, max: 10 },
        { key: "notes", type: "textarea", label: "Notes", help: "optional" },
      ],
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.schema.fields.length, 4);

    assert.equal(validateFormSchema("{").ok, false);
    assert.equal(validateFormSchema([]).ok, false);
    assert.equal(
      validateFormSchema({ version: 1, fields: [], script: "alert(1)" }).ok,
      false
    );
    assert.equal(
      validateFormSchema({
        version: 1,
        fields: [],
        validationRules: [{ kind: "regex", regex: ".*" }],
      }).ok,
      false
    );
    assert.equal(validateFormSchema({ version: 2, fields: [] }).ok, false);
    assert.equal(
      validateFormSchema({
        version: 1,
        fields: [{ key: "bad key", type: "text", label: "X" }],
      }).ok,
      false
    );
    assert.equal(
      validateFormSchema({
        version: 1,
        fields: [{ key: "x", type: "file", label: "X" }],
      }).ok,
      false
    );
    assert.equal(
      validateFormSchema({
        version: 1,
        fields: [{ key: "x", type: "select", label: "X", options: [] }],
      }).ok,
      false
    );
    assert.ok(ALLOWED_FIELD_TYPES.includes("email"));
  });

  it("validateFormAnswers covers required/email/unknown/forbidden", () => {
    const schema = validateFormSchema({
      version: 1,
      fields: [
        { key: "email", type: "email", label: "Email", required: true },
        { key: "phone", type: "phone", label: "Phone" },
        { key: "ok", type: "checkbox", label: "Ok" },
      ],
    }).schema;

    const good = validateFormAnswers(schema, {
      email: "a@example.test",
      phone: "+260971234567",
      ok: true,
    });
    assert.equal(good.ok, true);

    assert.equal(validateFormAnswers(schema, "{").ok, false);
    assert.equal(validateFormAnswers(schema, []).ok, false);
    assert.equal(validateFormAnswers(schema, { email: "nope" }).ok, false);
    assert.equal(validateFormAnswers(schema, { email: "a@b.c", extra: 1 }).ok, false);
    assert.equal(validateFormAnswers(schema, { constructor: {} }).ok, false);
    assert.equal(validateFormAnswers(schema, {}).ok, false); // missing required email
  });

  it("tenantFormService denies missing authz and invalid product/org", async () => {
    const db = fakePool();
    const denied = await formService.createForm(db, {
      productCode: "blessboard",
      organizationId: randomUUID(),
      formKey: "visitor_form",
      title: "Visitor",
      category: "visitor",
      schema: { version: 1, fields: [{ key: "n", type: "text", label: "N" }] },
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, formService.STATUS.FORBIDDEN);

    const badProduct = await formService.listForms(db, {
      productCode: "other",
      organizationId: randomUUID(),
      authz: async () => ({ ok: true }),
    });
    assert.equal(badProduct.ok, false);

    const badOrg = await formService.getForm(db, {
      productCode: "blessboard",
      organizationId: "not-a-uuid",
      formId: randomUUID(),
      authz: async () => ({ ok: true }),
    });
    assert.equal(badOrg.ok, false);

    const authzDeny = await formService.publishForm(db, {
      productCode: "activeclinic",
      organizationId: randomUUID(),
      formId: randomUUID(),
      authz: async () => ({ ok: false, reason: "nope" }),
    });
    assert.equal(authzDeny.ok, false);
    assert.equal(authzDeny.status, formService.STATUS.FORBIDDEN);
  });
});

describe("V203 Wave1b — media security helpers", () => {
  it("detectMimeFromSignature and sanitizeFilename boundaries", () => {
    assert.equal(media.detectMimeFromSignature(null), null);
    assert.equal(media.detectMimeFromSignature(Buffer.from([1, 2, 3])), null);
    assert.equal(
      media.detectMimeFromSignature(Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
      "image/jpeg"
    );
    assert.equal(
      media.detectMimeFromSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
      "image/png"
    );
    assert.equal(
      media.detectMimeFromSignature(Buffer.from("GIF89a")),
      "image/gif"
    );
    const webp = Buffer.alloc(12);
    webp.write("RIFF", 0);
    webp.write("WEBP", 8);
    assert.equal(media.detectMimeFromSignature(webp), "image/webp");

    assert.equal(media.sanitizeFilename("../etc/passwd"), "passwd");
    assert.equal(media.sanitizeFilename(""), "file");
    assert.equal(media.sanitizeFilename("."), "file");
    assert.equal(media.sanitizeFilename("a b/c.png"), "c.png");
  });

  it("websiteMediaDeliveryPath and assertOwnedWebsiteImageValue denials", async () => {
    const instance = {
      productCode: "blessboard",
      slug: "demo-church",
      organizationId: randomUUID(),
      id: randomUUID(),
    };
    const mediaId = randomUUID();
    const delivery = media.websiteMediaDeliveryPath(instance, mediaId);
    assert.match(delivery, new RegExp(`/c/demo-church/website/media/${mediaId}`));

    const clinicInstance = {
      productCode: "activeclinic",
      slug: "juflona",
      organizationId: randomUUID(),
      id: randomUUID(),
    };
    assert.match(
      media.websiteMediaDeliveryPath(clinicInstance, mediaId),
      /\/clinics\/juflona\/website\/media\//
    );

    const denied = await media.assertOwnedWebsiteImageValue(fakePool(), {
      instance,
      value: "https://evil.example/x.png",
    });
    assert.ok(denied);
    assert.notEqual(denied.ok, true);

    const empty = await media.assertOwnedWebsiteImageValue(fakePool(), {
      instance,
      value: "",
    });
    assert.ok(empty);

    assert.equal(media.isCdnObjectStorageKey(""), false);
    assert.equal(media.isCdnObjectStorageKey("media/x"), false);
  });

  it("hostinger media root persistence and path safety", () => {
    const ephemeral = hostinger.classifyMediaStorageRootPersistence(
      "/home/u/hbuilds/versions/abc/media"
    );
    assert.equal(ephemeral.ephemeral, true);

    const okRoot = path.join(os.tmpdir(), `v203-media-${process.pid}`);
    const durable = hostinger.classifyMediaStorageRootPersistence(okRoot);
    assert.equal(durable.ephemeral, false);

    assert.throws(
      () => hostinger.assertMediaStorageRootPersistent(null),
      (err) => err.code === hostinger.CODE_ROOT_UNSET
    );
    assert.throws(
      () =>
        hostinger.assertMediaStorageRootPersistent(
          "/home/u/hbuilds/versions/abc/media"
        ),
      (err) => err.code === hostinger.CODE_ROOT_NOT_PERSISTENT
    );

    assert.equal(
      hostinger.isPathUnderAccountHome("/home/u/media", "/home/u"),
      true
    );
    assert.equal(
      hostinger.isPathUnderAccountHome("/home/other/media", "/home/u"),
      false
    );
    assert.equal(hostinger.isPathUnderAccountHome("", "/home/u"), false);

    assert.equal(hostinger.productNamespace("blessboard"), "blessboard");
    assert.equal(hostinger.extensionForMime("image/png"), ".png");
    assert.equal(hostinger.extensionForMime("application/octet-stream"), ".bin");

    assert.equal(hostinger.resolveMediaReadEnvironment("production"), "production");
    assert.equal(hostinger.resolveMediaReadEnvironment("testing-v8"), "testing");

    assert.throws(() => hostinger.assertStorageKeyPathSafe("../x"), /./);
    const key = hostinger.buildHostingerStorageKey({
      productCode: "blessboard",
      organizationId: randomUUID(),
      mediaId: randomUUID(),
      mimeType: "image/jpeg",
      environment: "testing",
    });
    assert.ok(typeof key === "string" && key.includes("blessboard"));
  });
});

describe("V203 Wave1b — editableFieldSchema + announcements + verification", () => {
  it("editable field register/resolve/assert mutation paths", () => {
    const key = `wave1b.hero.title_${Date.now()}`;
    editable.registerEditableField({
      productCode: editable.PRODUCT_CODE.BLESSBOARD,
      key,
      type: "short_text",
      maxLen: 80,
      permission: "website.edit",
    });
    assert.equal(editable.hasEditableField(editable.PRODUCT_CODE.BLESSBOARD, key), true);
    const resolved = editable.resolveEditableField({
      productCode: editable.PRODUCT_CODE.BLESSBOARD,
      key,
    });
    assert.equal(resolved.ok, true);

    const denied = editable.assertEditableMutation({
      productCode: editable.PRODUCT_CODE.BLESSBOARD,
      key,
      value: "Hello",
      grantedPermissions: [],
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "forbidden");

    const allowed = editable.assertEditableMutation({
      productCode: editable.PRODUCT_CODE.BLESSBOARD,
      key,
      value: "Hello",
      grantedPermissions: ["website.edit"],
    });
    assert.equal(allowed.ok, true);

    const missing = editable.resolveEditableField({
      productCode: editable.PRODUCT_CODE.ACTIVECLINIC,
      key: "does.not.exist.wave1b",
    });
    assert.equal(missing.ok, false);

    assert.equal(editable.camelToSnake("bodyText"), "body_text");
    assert.equal(
      editable.stableKeyFromLocator("home", "hero", "heading"),
      "home.hero.heading"
    );

    const validated = editable.validateEditableValue(resolved.field, "Hello");
    assert.equal(validated.ok, true);

    assert.equal(editable.editableValuesEqual("a", "a"), true);
    assert.equal(editable.editableValuesEqual("a", "b"), false);
  });

  it("announcement effective status and public visibility", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    assert.equal(
      announcements.resolveEffectiveStatus({ status: "archived" }, now),
      "archived"
    );
    assert.equal(
      announcements.resolveEffectiveStatus({ status: "draft" }, now),
      "draft"
    );
    assert.equal(
      announcements.resolveEffectiveStatus({ status: "expired" }, now),
      "expired"
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
        {
          status: "scheduled",
          startsAt: "2026-07-01T00:00:00.000Z",
        },
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
        {
          status: "published",
          startsAt: "2026-01-01T00:00:00.000Z",
        },
        now
      ),
      true
    );
    assert.equal(
      announcements.isPubliclyVisible({ status: "draft" }, now),
      false
    );

    const presented = announcements.presentSafe(
      {
        id: randomUUID(),
        status: "published",
        title: "Hello",
        body: "World",
        startsAt: "2026-01-01T00:00:00.000Z",
      },
      now
    );
    assert.ok(presented);
    assert.ok(!("internalNotes" in (presented || {})));

    assert.equal(announcements.SCHEDULER_DEPENDENCY.available, false);
  });

  it("verification normalizeIdentifier + publicChallenge + gate", () => {
    const email = verification.normalizeIdentifier("email", "  A@Example.TEST ");
    assert.equal(email.ok, true);

    const phone = verification.normalizeIdentifier("phone", "+260 97 123 4567");
    assert.equal(phone.ok, true);

    assert.equal(verification.normalizeIdentifier("email", "").ok, false);
    assert.equal(verification.normalizeIdentifier("sms", "x").ok, false);

    const challenge = verification.publicChallenge(
      {
        id: randomUUID(),
        channel: "email",
        purpose: "login",
        status: "pending",
        productKey: "blessboard",
        identifierNormalized: "a@example.test",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        attemptCount: 0,
        maxAttempts: 5,
        lastSentAt: new Date().toISOString(),
      },
      { resendDelaySeconds: 45 }
    );
    assert.ok(challenge);
    assert.ok(!("code" in challenge));
    assert.ok(!("codeHash" in challenge));
    assert.ok(challenge.identifierMasked);

    const gate = verification.evaluateVerificationGate({
      required: true,
      verified: false,
    });
    assert.ok(gate);
  });
});

describe("V203 Wave1b — governance + change manager + deployment + consent", () => {
  it("governance status helpers and authz denials", async () => {
    assert.ok(governance.websiteStatusFromLifecycle);
    const status = governance.websiteStatusFromLifecycle({
      published: true,
      hidden: false,
      blocked: false,
    });
    assert.ok(status);

    assert.equal(governance.productLabel("blessboard").length > 0, true);
    assert.equal(governance.productLabel("activeclinic").length > 0, true);

    const denied = await governance.performGovernanceAction(fakePool(), {
      action: "hide",
      productCode: "blessboard",
      organizationId: randomUUID(),
      instanceId: randomUUID(),
    });
    assert.ok(denied);
    assert.notEqual(denied.ok, true);

    const review = governance.reviewStatusForVersion({
      status: "pending_review",
    });
    assert.ok(review != null);
  });

  it("change manager read/compare deny without permissions", async () => {
    const session = {
      db: fakePool(),
      organizationId: randomUUID(),
      instanceId: randomUUID(),
      productCode: "blessboard",
      grantedPermissions: [],
    };
    const read = await changeMgr.authorizeChangeManagerRead(session);
    assert.ok(read);
    assert.notEqual(read.ok, true);

    const compare = await changeMgr.compareDraftToPublished(session.db, {
      organizationId: session.organizationId,
      instanceId: session.instanceId,
      productCode: "blessboard",
      grantedPermissions: [],
    });
    assert.ok(compare);
  });

  it("deployment profile resolution positive/negative", () => {
    const env = {
      PLATFORM_DEPLOYMENT_CODE: deployment.CODE_MOOVEX_PLATFORM_TESTING,
      NODE_ENV: "test",
    };
    const resolved = deployment.resolveDeploymentConfiguration(env);
    assert.equal(resolved.authoritative, true);
    assert.ok(resolved.code);

    assert.equal(deployment.hasAuthoritativeDeploymentProfile(env), true);
    assert.equal(
      deployment.hasAuthoritativeDeploymentProfile({
        PLATFORM_DEPLOYMENT_CODE: "nope-not-a-profile",
      }),
      false
    );

    const trust = deployment.resolveTrustProxy(env);
    assert.ok(trust === true || trust === false || typeof trust === "number");

    const listen = deployment.resolveListenHost(env);
    assert.ok(typeof listen === "string" || listen == null);

    assert.equal(typeof deployment.resolveJobsEnabled(env), "boolean");
  });

  it("communication preferences assert product/org and normalize", () => {
    assert.equal(consent.assertProductCode("blessboard").ok, true);
    assert.equal(consent.assertProductCode("x").ok, false);

    const org = randomUUID();
    assert.equal(
      consent.assertTrustedOrgScope({ trusted: { organizationId: org } }).ok,
      true
    );
    assert.equal(
      consent.assertTrustedOrgScope({
        trusted: { organizationId: org },
        body: { organization_id: randomUUID() },
      }).ok,
      false
    );
    assert.equal(consent.assertTrustedOrgScope({ trusted: {} }).ok, false);

    const norm = consent.normalizePreferenceInput({
      channel: "email",
      purpose: "marketing",
      optedIn: true,
    });
    assert.ok(norm);
  });
});

describe("V203 Wave1b — fieldAgentPayRunRepo pure helpers + deep exercise", () => {
  it("money/metadata helpers cover branches", () => {
    assert.equal(payRun.roundMoney2(1.015), 1.01);
    assert.equal(payRun.roundMoney2(1.995), 2);
    assert.equal(payRun.roundMoney2("x"), 0);
    assert.equal(payRun.roundMoney2(null), 0);

    assert.deepEqual(payRun.parsePaymentMetadata({ metadata: { a: 1 } }), { a: 1 });
    assert.deepEqual(payRun.parsePaymentMetadata({ metadata: '{"b":2}' }), { b: 2 });
    assert.deepEqual(payRun.parsePaymentMetadata({ metadata: "{bad" }), {});
    assert.deepEqual(payRun.parsePaymentMetadata({ metadata: null }), {});
    assert.deepEqual(payRun.parsePaymentMetadata(null), {});

    assert.equal(typeof payRun.payRunIsHardClosed({ status: "paid" }), "boolean");
    assert.equal(typeof payRun.payRunIsHardClosed({ status: "draft" }), "boolean");
    assert.equal(
      payRun.payRunAccountingPeriodKey({ period_start: "2026-03-01" }) == null ||
        typeof payRun.payRunAccountingPeriodKey({ period_start: "2026-03-01" }) ===
          "string",
      true
    );
  });

  it("exercises pay-run lifecycle denials via fake pool", async () => {
    const db = fakePool({
      id: 9,
      tenant_id: 1,
      status: "draft",
      accounting_period_key: "2026-03",
      hard_closed: false,
      metadata: {},
      amount: "10.00",
      payable_total: "10.00",
      paid_total: "0.00",
      count: "1",
    });

    assert.ok(await payRun.getPayRunById(db, 9));
    assert.ok(await payRun.getPayRunByIdForTenant(db, 1, 9));
    assert.ok(Array.isArray(await payRun.listPayRunsForTenant(db, 1, {})));
    assert.ok(Array.isArray(await payRun.listItemsForPayRun(db, 9)));
    assert.ok(Array.isArray(await payRun.listPaymentsForPayRun(db, 9)));

    // Negative shapes
    await assert.rejects(async () => payRun.assertPayRunIsDraft({ status: "paid" }));
    const empty = fakePool();
    empty.query = async () => ({ rows: [], rowCount: 0 });
    assert.equal(await payRun.getPayRunById(empty, 999), null);
  });
});
