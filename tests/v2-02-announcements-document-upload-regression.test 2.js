"use strict";

/**
 * V2.02 QA — Announcements document upload HTTP regression.
 *
 * Models the manual QA failure from docs/qa/V2_02_QA_DEFECT_AUDIT.md and the
 * post-fix announcement attachment upload path authorized by announcements.manage
 * (not website.edit). Positive workflow must pass after the product fix.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const request = require("supertest");

const {
  resetFoundationDatabase,
  foundationDbUnavailableSkipReason,
  createFoundationPool,
} = require("./helpers/foundationDb");
const {
  V5_IDENTITY_KEY: IDENTITY_KEY,
  DEFAULT_V5_COOKIE,
  baseV5TestEnv,
  extractSetCookie: extractCookie,
  joinCookieHeader: cookieHeader,
} = require("./helpers/blessboardV5Fixtures");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { CSRF_COOKIE, CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const rbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");
const { insertMediaAsset } = require("../src/blessboard/media/mediaAssetsRepository");
const { createMediaUploadService } = require("../src/blessboard/media/mediaUploadService");
const { listEffectivePermissions } = require("../src/blessboard/services/blessBoardRbacAuthorizationService");

const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "ann-reg-a.blessboard.org";
const HOST_B = "ann-reg-b.blessboard.org";
const PDF_MIN = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");

/** Testing deployment: uploads signed on (website QA), not the default-off kill-switch. */
function testingUploadsOnEnv(mediaRoot, overrides) {
  return baseV5TestEnv({
    BLESSBOARD_MEDIA_FORCE_LOCAL: "1",
    BLESSBOARD_MEDIA_ROOT: mediaRoot,
    BLESSBOARD_MEDIA_UPLOADS_ENABLED: "1",
    DEPLOYMENT_ENV: "testing",
    ...(overrides || {}),
  });
}

function testingUploadsOffEnv(mediaRoot) {
  return testingUploadsOnEnv(mediaRoot, { BLESSBOARD_MEDIA_UPLOADS_ENABLED: "0" });
}

describe("V2.02 announcements document-upload QA regression", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let mediaRoot;
  let appUploadsOn;
  let appUploadsOff;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let branchA;
  let hqAdmin;
  let announcementsManager;
  let outsider;
  let foreignPrivateAssetId;
  let publicAssetId;

  before(async () => {
    try {
      mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bb-ann-reg-"));
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      orgA = await provisionPlatformTenant(pool, {
        organizationKey: "ann-reg-a",
        displayName: "Ann Reg A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "ann-reg-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "ann-reg-a",
        churchKey: "ann-reg-a",
        displayName: "Ann Reg Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      branchA = chA.records.hqBranch;

      orgB = await provisionPlatformTenant(pool, {
        organizationKey: "ann-reg-b",
        displayName: "Ann Reg B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "ann-reg-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "ann-reg-b",
        churchKey: "ann-reg-b",
        displayName: "Ann Reg Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;

      async function makeSessionUser(email, orgRec) {
        const created = await createBlessBoardUser(pool, {
          email,
          password: PASSWORD,
          displayName: email,
        });
        assert.equal(created.ok, true, created.reason || created.message);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId: orgRec.records.organization.id,
        });
        assert.equal(session.ok, true, session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      hqAdmin = await makeSessionUser("hq@ann-reg-a.example.test", orgA);
      const hqRole = await assignBlessBoardRole(pool, {
        email: "hq@ann-reg-a.example.test",
        organizationKey: "ann-reg-a",
        churchKey: "ann-reg-a",
        roleKey: "church_hq_admin",
      });
      assert.equal(hqRole.ok, true, hqRole.message || hqRole.reason);

      // Custom HQ-capable announcements role: announcements.* + HQ signal
      // (organisation.settings.manage) without website.edit.
      announcementsManager = await makeSessionUser("ann-mgr@ann-reg-a.example.test", orgA);
      const roleInsert = await pool.query(
        `INSERT INTO blessboard.roles (
           role_key, display_name, description, role_category,
           is_system, is_sensitive, is_active
         ) VALUES (
           'v2_02_announcements_manager',
           'V2.02 Announcements Manager',
           'Test-only announcements manager without website.edit',
           'communications',
           false, false, true
         )
         ON CONFLICT (role_key) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id`
      );
      const roleRow = { id: roleInsert.rows[0].id };
      assert.ok(roleRow.id, "custom announcements manager role");
      await pool.query(
        `INSERT INTO blessboard.role_permissions (role_id, permission_id)
         SELECT $1::uuid, p.id
           FROM blessboard.permissions p
          WHERE p.permission_key = ANY($2::text[])
         ON CONFLICT DO NOTHING`,
        [
          roleRow.id,
          [
            "announcements.view",
            "announcements.manage",
            "announcements.publish",
            "organisation.settings.manage",
          ],
        ]
      );
      await rbacRepo.insertAssignment(pool, {
        userId: announcementsManager.user.id,
        organizationId: orgA.records.organization.id,
        churchId: churchA.id,
        roleId: roleRow.id,
        scopeType: "church",
        scopeId: churchA.id,
        assignedByUserId: hqAdmin.user.id,
        assignmentOrigin: "system",
        assignmentReason: "v2-02-announcements-regression",
      });

      const effective = await listEffectivePermissions(pool, {
        actor: { userId: announcementsManager.user.id },
        tenantContext: {
          organization: { id: orgA.records.organization.id },
          church: { id: churchA.id },
          primaryBranch: { id: branchA.id },
          hqBranch: { id: branchA.id },
        },
        resourceContext: {
          organizationId: orgA.records.organization.id,
          churchId: churchA.id,
          branchId: null,
        },
      });
      assert.equal(effective.ok, true, effective.reasonCode || effective.reason);
      const perms = new Set(effective.permissions || []);
      assert.ok(perms.has("announcements.manage"), "announcements.manage required");
      assert.ok(perms.has("announcements.publish"), "announcements.publish required");
      assert.ok(
        perms.has("organisation.settings.manage"),
        "HQ signal required for church-wide announcement writes"
      );
      assert.equal(perms.has("website.edit"), false, "must not grant website.edit for this actor");
      assert.equal(perms.has("website.media.upload"), false);

      outsider = await makeSessionUser("member@ann-reg-a.example.test", orgA);

      const foreignSha = crypto.createHash("sha256").update("foreign-ann-pdf").digest("hex");
      const foreign = await insertMediaAsset(pool, {
        churchId: churchB.id,
        branchId: null,
        uploadedByUserId: hqAdmin.user.id,
        storageBucket: "local",
        storageKey: `ann-reg/${foreignSha}`,
        originalFilename: "other.pdf",
        mimeType: "application/pdf",
        sizeBytes: PDF_MIN.length,
        sha256: foreignSha,
        visibility: "private",
      });
      foreignPrivateAssetId = foreign.id;

      const publicSha = crypto.createHash("sha256").update("public-ann-pdf").digest("hex");
      const pub = await insertMediaAsset(pool, {
        churchId: churchA.id,
        branchId: null,
        uploadedByUserId: hqAdmin.user.id,
        storageBucket: "local",
        storageKey: `ann-reg/${publicSha}`,
        originalFilename: "public.pdf",
        mimeType: "application/pdf",
        sizeBytes: PDF_MIN.length,
        sha256: publicSha,
        visibility: "public",
      });
      publicAssetId = pub.id;

      const mediaOn = createMediaUploadService(testingUploadsOnEnv(mediaRoot), { rootDir: mediaRoot });
      appUploadsOn = createV5FoundationApp({
        getPool: () => pool,
        env: testingUploadsOnEnv(mediaRoot),
        mediaService: mediaOn,
      });
      const mediaOff = createMediaUploadService(testingUploadsOffEnv(mediaRoot), { rootDir: mediaRoot });
      appUploadsOff = createV5FoundationApp({
        getPool: () => pool,
        env: testingUploadsOffEnv(mediaRoot),
        mediaService: mediaOff,
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
      // eslint-disable-next-line no-console
      console.error("v2-02 announcements regression setup failed:", skipReason);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
    if (mediaRoot) fs.rmSync(mediaRoot, { recursive: true, force: true });
  });

  function skipIfNeeded(t) {
    if (skipSuite) {
      t.skip(foundationDbUnavailableSkipReason(skipReason));
      return true;
    }
    return false;
  }

  function sid(user) {
    return `${DEFAULT_V5_COOKIE}=${user.rawToken}`;
  }

  async function csrfFor(app, user, pathName) {
    const page = await request(app).get(pathName).set("Host", HOST_A).set("Cookie", sid(user));
    const token = extractCookie(page, CSRF_COOKIE);
    assert.ok(token, `csrf cookie from ${pathName}`);
    return { page, csrf: token, cookie: cookieHeader(sid(user), `${CSRF_COOKIE}=${token}`) };
  }

  function uploadUrlFromForm(html) {
    const match =
      String(html || "").match(/data-upload-url="([^"]+)"/) ||
      String(html || "").match(/data-bb-media-upload-url="([^"]+)"/);
    return match ? match[1] : "";
  }

  it("POSITIVE: announcements manager uploads PDF via UI path, saves, reloads, publishes", async (t) => {
    if (skipIfNeeded(t)) return;

    const { page: newForm, csrf, cookie } = await csrfFor(
      appUploadsOn,
      announcementsManager,
      "/hq/announcements/new"
    );
    assert.equal(newForm.status, 200, "announcement create form must open");
    assert.match(newForm.text, /name="media_asset_id"/);
    assert.match(newForm.text, /data-bb-media-picker|data-bb-media-upload-shared/);
    const uploadUrl = uploadUrlFromForm(newForm.text);
    assert.match(
      uploadUrl,
      /^\/hq\/announcements\/media\/upload$/,
      `announcement UI must use purpose-scoped upload, got ${uploadUrl || "(missing)"}`
    );
    assert.doesNotMatch(uploadUrl, /\/content\/media\/upload/);

    // Same HTTP path the announcement media-upload partial uses (fillField=assetId, visibility=private).
    const upload = await request(appUploadsOn)
      .post(uploadUrl)
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .set("Accept", "application/json")
      .field(CSRF_FIELD, csrf)
      .field("visibility", "private")
      .attach("file", PDF_MIN, {
        filename: "flyer.pdf",
        contentType: "application/pdf",
      });

    assert.equal(
      upload.status,
      200,
      `UI upload path must succeed for announcements managers (got ${upload.status}: ${JSON.stringify(upload.body).slice(0, 240)})`
    );
    assert.equal(upload.body.ok, true, JSON.stringify(upload.body));
    assert.ok(upload.body.assetId, "assetId");
    assert.equal(upload.body.visibility, "private");
    assert.match(String(upload.body.mimeType || ""), /pdf/i);

    const create = await request(appUploadsOn)
      .post("/hq/announcements")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        title: "QA regression flyer",
        body: "Document attachment must persist",
        status: "draft",
        audience_members: "1",
        media_asset_id: upload.body.assetId,
      });
    assert.equal(create.status, 303, `create status ${create.status}`);
    assert.match(String(create.headers.location || ""), /\/hq\/announcements\/[0-9a-f-]{36}/i);
    const annId = String(create.headers.location).split("/").pop().split("?")[0];

    const { page: edit, csrf: csrf2, cookie: cookie2 } = await csrfFor(
      appUploadsOn,
      announcementsManager,
      `/hq/announcements/${annId}/edit`
    );
    assert.equal(edit.status, 200);
    assert.match(edit.text, /QA regression flyer/);
    assert.match(edit.text, /data-bb-ann-attachments="1"|flyer\.pdf|media_asset/i);

    const expectedUpdatedAt =
      (edit.text.match(/name="expected_updated_at"\s+value="([^"]+)"/) || [])[1] || "";
    assert.ok(expectedUpdatedAt, "expected_updated_at");

    const publishPage = await request(appUploadsOn)
      .get(`/hq/announcements/${annId}/publish`)
      .set("Host", HOST_A)
      .set("Cookie", cookie2);
    assert.equal(publishPage.status, 200);
    const pubCsrf = extractCookie(publishPage, CSRF_COOKIE) || csrf2;
    const pubCookie = cookieHeader(sid(announcementsManager), `${CSRF_COOKIE}=${pubCsrf}`);

    const published = await request(appUploadsOn)
      .post(`/hq/announcements/${annId}/publish`)
      .set("Host", HOST_A)
      .set("Cookie", pubCookie)
      .type("form")
      .send({
        [CSRF_FIELD]: pubCsrf,
        confirm_publish: "1",
        publish_mode: "now",
        expected_updated_at: expectedUpdatedAt,
      });
    assert.ok([302, 303].includes(published.status), `publish status ${published.status}`);

    const detail = await request(appUploadsOn)
      .get(`/hq/announcements/${annId}`)
      .set("Host", HOST_A)
      .set("Cookie", sid(announcementsManager));
    assert.equal(detail.status, 200);
    assert.match(detail.text, /published|data-bb-ann-editor-status="published"|Published/i);
    assert.match(detail.text, /flyer\.pdf|attachments/i);
  });

  it("NEGATIVE: unauthorized user cannot upload via announcement media path", async (t) => {
    if (skipIfNeeded(t)) return;
    // Outsider has a session but no announcements/website grants. Issue a valid
    // double-submit CSRF pair so authz (not CSRF) is under test.
    const csrf = issueCsrfToken(testingUploadsOnEnv(mediaRoot));
    const cookie = cookieHeader(sid(outsider), `${CSRF_COOKIE}=${csrf}`);
    const upload = await request(appUploadsOn)
      .post("/hq/announcements/media/upload")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .set("Accept", "application/json")
      .field(CSRF_FIELD, csrf)
      .field("visibility", "private")
      .attach("file", PDF_MIN, { filename: "nope.pdf", contentType: "application/pdf" });
    assert.ok(upload.status === 401 || upload.status === 403, `got ${upload.status}`);
  });

  it("NEGATIVE: kill-switch rejects announcement media upload when disabled", async (t) => {
    if (skipIfNeeded(t)) return;
    const { csrf, cookie } = await csrfFor(
      appUploadsOff,
      announcementsManager,
      "/hq/announcements/new"
    );
    const upload = await request(appUploadsOff)
      .post("/hq/announcements/media/upload")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .set("Accept", "application/json")
      .field(CSRF_FIELD, csrf)
      .field("visibility", "private")
      .attach("file", PDF_MIN, { filename: "killed.pdf", contentType: "application/pdf" });
    assert.equal(upload.status, 403, JSON.stringify(upload.body));
    assert.equal(upload.body.ok, false);
    assert.equal(upload.body.reason, "media_uploads_disabled");
  });

  it("NEGATIVE: cross-tenant private asset cannot be attached on create", async (t) => {
    if (skipIfNeeded(t)) return;
    const { csrf, cookie } = await csrfFor(
      appUploadsOn,
      announcementsManager,
      "/hq/announcements/new"
    );
    const create = await request(appUploadsOn)
      .post("/hq/announcements")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        title: "Cross tenant attach",
        body: "Must reject foreign media",
        status: "draft",
        audience_members: "1",
        media_asset_id: foreignPrivateAssetId,
      });
    assert.ok(
      create.status === 400 || create.status === 403 || create.status === 422,
      `expected rejection, got ${create.status}`
    );
    assert.doesNotMatch(String(create.headers.location || ""), /\/hq\/announcements\/[0-9a-f-]{36}/i);
  });

  it("NEGATIVE: non-private asset is rejected for announcement attachment", async (t) => {
    if (skipIfNeeded(t)) return;
    const { csrf, cookie } = await csrfFor(
      appUploadsOn,
      announcementsManager,
      "/hq/announcements/new"
    );
    const create = await request(appUploadsOn)
      .post("/hq/announcements")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        title: "Public attach rejected",
        body: "Private only",
        status: "draft",
        audience_members: "1",
        media_asset_id: publicAssetId,
      });
    assert.ok(
      create.status === 400 || create.status === 403 || create.status === 422,
      `expected rejection, got ${create.status}`
    );
    assert.doesNotMatch(String(create.headers.location || ""), /\/hq\/announcements\/[0-9a-f-]{36}/i);
  });
});
