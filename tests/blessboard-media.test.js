"use strict";

/**
 * BlessBoard V5 media upload: validation, storage keys, ownership, access, cleanup.
 * Uses local filesystem storage only — never contacts hosted Supabase.
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
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const { validateMediaFile, detectMimeFromSignature } = require("../src/blessboard/media/validateMediaFile");
const { generateStorageKey } = require("../src/blessboard/media/generateStorageKey");
const { createMediaUploadService } = require("../src/blessboard/media/mediaUploadService");
const { createLocalFilesystemStorage } = require("../src/blessboard/media/storage/localFilesystemStorage");
const { createMediaStorage } = require("../src/blessboard/media/storage/createMediaStorage");
const { VISIBILITY } = require("../src/blessboard/media/mediaConstants");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "media-a.blessboard.org";
const HOST_B = "media-b.blessboard.org";

/** Minimal valid 1x1 PNG */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const PDF_MIN = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function cookieHeader(...pairs) {
  return pairs.filter(Boolean).join("; ");
}

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    BLESSBOARD_MEDIA_FORCE_LOCAL: "1",
    BLESSBOARD_MEDIA_UPLOADS_ENABLED: "1",
    ...overrides,
  };
}

describe("blessboard media validation (unit)", () => {
  it("accepts PNG by signature and rejects client MIME alone", () => {
    const ok = validateMediaFile({
      buffer: PNG_1X1,
      originalFilename: "photo.png",
      claimedMime: "image/png",
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.mimeType, "image/png");

    const bad = validateMediaFile({
      buffer: Buffer.from("not-an-image"),
      originalFilename: "photo.png",
      claimedMime: "image/png",
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, "signature_unrecognized");
  });

  it("rejects MIME/extension mismatches", () => {
    const mimeMismatch = validateMediaFile({
      buffer: PNG_1X1,
      originalFilename: "photo.png",
      claimedMime: "application/pdf",
    });
    assert.equal(mimeMismatch.ok, false);
    assert.equal(mimeMismatch.reason, "mime_mismatch");

    const extMismatch = validateMediaFile({
      buffer: PNG_1X1,
      originalFilename: "photo.pdf",
      claimedMime: "image/png",
    });
    assert.equal(extMismatch.ok, false);
    assert.equal(extMismatch.reason, "extension_mismatch");
  });

  it("rejects SVG and executable-looking content", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', "utf8");
    const r = validateMediaFile({ buffer: svg, originalFilename: "x.svg", claimedMime: "image/svg+xml" });
    assert.equal(r.ok, false);

    const exe = Buffer.from("MZ\x90\x00fake-pe", "binary");
    const e = validateMediaFile({ buffer: exe, originalFilename: "x.exe", claimedMime: "application/octet-stream" });
    assert.equal(e.ok, false);
  });

  it("enforces size limit", () => {
    const big = Buffer.concat([PNG_1X1, Buffer.alloc(6 * 1024 * 1024)]);
    const r = validateMediaFile({
      buffer: big,
      originalFilename: "big.png",
      claimedMime: "image/png",
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "size_limit");
  });

  it("strips unsafe filenames and detects PDF", () => {
    assert.equal(detectMimeFromSignature(PDF_MIN), "application/pdf");
    const r = validateMediaFile({
      buffer: PDF_MIN,
      originalFilename: "../../etc/passwd.pdf",
      claimedMime: "application/pdf",
    });
    assert.equal(r.ok, true);
    assert.equal(r.originalFilename, "passwd.pdf");
  });

  it("Content-Disposition sanitizes CRLF and quotes from filenames", () => {
    const { sendPrivateMediaDownload } = require("../src/blessboard/http/sendPrivateMediaDownload");
    const headers = {};
    const res = {
      setHeader(name, value) {
        headers[String(name).toLowerCase()] = value;
      },
      status() {
        return this;
      },
      send() {
        return this;
      },
    };
    sendPrivateMediaDownload(res, {
      asset: { originalFilename: 'evil\r\n"file.pdf', mimeType: "application/pdf" },
      buffer: PDF_MIN,
    });
    assert.equal(headers["content-disposition"], 'attachment; filename="evilfile.pdf"');
    assert.equal(headers["x-content-type-options"], "nosniff");
    assert.match(String(headers["cache-control"] || ""), /private/);
  });

  it("generates randomized storage keys without traversal", () => {
    const churchId = crypto.randomUUID();
    const a = generateStorageKey({ churchId, originalFilename: "a.png" });
    const b = generateStorageKey({ churchId, originalFilename: "a.png" });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.notEqual(a.storageKey, b.storageKey);
    assert.match(a.storageKey, new RegExp(`^blessboard/${churchId}/[0-9a-f-]+/a\\.png$`));
    assert.equal(a.storageKey.includes(".."), false);
  });

  it("selects local storage in test even if supabase env present", () => {
    const storage = createMediaStorage({
      NODE_ENV: "test",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "secret-should-not-be-used",
    });
    assert.equal(storage.kind, "local");
  });
});

describe("blessboard media service + http", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let mediaRoot;
  let churchA;
  let orgA;
  let orgB;
  let users = {};
  let mediaService;

  before(async () => {
    try {
      mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bb-media-"));
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      orgA = await provisionPlatformTenant(pool, {
        organizationKey: "media-a",
        displayName: "Media A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "media-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "media-a",
        churchKey: "media-a",
        displayName: "Media Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;

      orgB = await provisionPlatformTenant(pool, {
        organizationKey: "media-b",
        displayName: "Media B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "media-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "media-b",
        churchKey: "media-b",
        displayName: "Media Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);

      async function makeUser(email, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          password: PASSWORD,
          displayName: email,
        });
        assert.equal(created.ok, true, created.reason || created.message || "user create failed");
        const assigned = await assignBlessBoardRole(pool, role);
        assert.equal(assigned.ok, true, assigned.message || assigned.reason || "role assign failed");
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId:
            role.organizationKey === "media-a"
              ? orgA.records.organization.id
              : orgB.records.organization.id,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser("hq-a@media-a.example.test", {
        email: "hq-a@media-a.example.test",
        organizationKey: "media-a",
        roleKey: "church_hq_admin",
        churchKey: "media-a",
      });
      users.hqB = await makeUser("hq-b@media-b.example.test", {
        email: "hq-b@media-b.example.test",
        organizationKey: "media-b",
        roleKey: "church_hq_admin",
        churchKey: "media-b",
      });

      mediaService = createMediaUploadService(baseEnv(), { rootDir: mediaRoot });
      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv({ BLESSBOARD_MEDIA_ROOT: mediaRoot }),
        mediaService,
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
      // eslint-disable-next-line no-console
      console.error("media suite setup failed:", skipReason);
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

  function sessionCookie(userBundle) {
    return `${DEFAULT_V5_COOKIE}=${userBundle.rawToken}`;
  }

  it("uploads via HQ content admin and serves public bytes", async (t) => {
    if (skipIfNeeded(t)) return;
    const sid = sessionCookie(users.hqA);

    const boot = await request(app).get("/hq/content").set("Host", HOST_A).set("Cookie", sid);
    const csrfFromPage = extractCookie(boot, CSRF_COOKIE);
    assert.ok(csrfFromPage, "csrf cookie");

    const up = await request(app)
      .post("/hq/content/media/upload")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(sid, `${CSRF_COOKIE}=${csrfFromPage}`))
      .field(CSRF_FIELD, csrfFromPage)
      .field("visibility", "public")
      .attach("file", PNG_1X1, "leader.png");

    assert.equal(up.status, 200, JSON.stringify(up.body));
    assert.equal(up.body.ok, true);
    assert.match(up.body.deliveryPath, /^\/_bb\/media\//);
    assert.equal(up.body.deduped, false);

    const pub = await request(app).get(up.body.deliveryPath).set("Host", HOST_A);
    assert.equal(pub.status, 200);
    assert.match(String(pub.headers["content-type"] || ""), /image\/png/);
    assert.deepEqual(Buffer.from(pub.body), PNG_1X1);
  });

  it("dedupes duplicate hash within the same church", async (t) => {
    if (skipIfNeeded(t)) return;
    const first = await mediaService.uploadMediaAsset(pool, {
      churchId: churchA.id,
      uploadedByUserId: users.hqA.user.id,
      buffer: PNG_1X1,
      originalFilename: "dup.png",
      visibility: VISIBILITY.PUBLIC,
    });
    assert.equal(first.ok, true);
    const second = await mediaService.uploadMediaAsset(pool, {
      churchId: churchA.id,
      uploadedByUserId: users.hqA.user.id,
      buffer: PNG_1X1,
      originalFilename: "dup2.png",
      visibility: VISIBILITY.PUBLIC,
    });
    assert.equal(second.ok, true);
    assert.equal(second.deduped, true);
    assert.equal(second.asset.id, first.asset.id);
  });

  it("archives an asset and denies public delivery afterward", async (t) => {
    if (skipIfNeeded(t)) return;
    const uploaded = await mediaService.uploadMediaAsset(pool, {
      churchId: churchA.id,
      uploadedByUserId: users.hqA.user.id,
      buffer: PDF_MIN,
      originalFilename: "notes.pdf",
      visibility: VISIBILITY.PUBLIC,
      dedupeByHash: false,
    });
    assert.equal(uploaded.ok, true);
    const archived = await mediaService.archiveMediaAsset(pool, {
      assetId: uploaded.asset.id,
      churchId: churchA.id,
    });
    assert.equal(archived.ok, true);
    assert.equal(archived.asset.status, "archived");

    const pub = await request(app).get(uploaded.deliveryPath).set("Host", HOST_A);
    assert.equal(pub.status, 404);
  });

  it("denies private assets on the public media route", async (t) => {
    if (skipIfNeeded(t)) return;
    const uploaded = await mediaService.uploadMediaAsset(pool, {
      churchId: churchA.id,
      uploadedByUserId: users.hqA.user.id,
      buffer: PDF_MIN,
      originalFilename: "private.pdf",
      visibility: VISIBILITY.PRIVATE,
      dedupeByHash: false,
    });
    assert.equal(uploaded.ok, true);

    const pub = await request(app).get(uploaded.deliveryPath).set("Host", HOST_A);
    assert.equal(pub.status, 403);

    const sid = sessionCookie(users.hqA);
    const admin = await request(app)
      .get(`/hq/content/media/${uploaded.asset.id}`)
      .set("Host", HOST_A)
      .set("Cookie", sid);
    assert.equal(admin.status, 200);
    assert.match(String(admin.headers["content-type"] || ""), /application\/pdf/);
  });

  it("denies cross-tenant public access", async (t) => {
    if (skipIfNeeded(t)) return;
    const uploaded = await mediaService.uploadMediaAsset(pool, {
      churchId: churchA.id,
      uploadedByUserId: users.hqA.user.id,
      buffer: PNG_1X1,
      originalFilename: "tenant.png",
      visibility: VISIBILITY.PUBLIC,
      dedupeByHash: false,
    });
    assert.equal(uploaded.ok, true);

    const other = await request(app).get(uploaded.deliveryPath).set("Host", HOST_B);
    assert.equal(other.status, 403);
  });

  it("rejects HQ upload from a different church session", async (t) => {
    if (skipIfNeeded(t)) return;
    const sid = sessionCookie(users.hqB);
    const boot = await request(app).get("/hq/content").set("Host", HOST_B).set("Cookie", sid);
    const csrf = extractCookie(boot, CSRF_COOKIE);
    assert.ok(csrf);

    const up = await request(app)
      .post("/hq/content/media/upload")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(sid, `${CSRF_COOKIE}=${csrf}`))
      .field(CSRF_FIELD, csrf)
      .attach("file", PNG_1X1, "x.png");
    assert.ok(up.status === 403 || up.status === 401);
  });

  it("rejects upload without valid CSRF", async (t) => {
    if (skipIfNeeded(t)) return;
    const sid = sessionCookie(users.hqA);
    const boot = await request(app).get("/hq/content").set("Host", HOST_A).set("Cookie", sid);
    const csrf = extractCookie(boot, CSRF_COOKIE);
    assert.ok(csrf);

    const up = await request(app)
      .post("/hq/content/media/upload")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(sid, `${CSRF_COOKIE}=${csrf}`))
      .field(CSRF_FIELD, "not-the-real-csrf-token")
      .field("visibility", "public")
      .attach("file", PNG_1X1, "csrf.png");
    assert.equal(up.status, 403);
    assert.equal(up.body.ok, false);
    assert.equal(up.body.reason, "csrf");
  });

  it("picker upload UI keeps safe error copy and never leaks storage paths", () => {
    const pickerJs = fs.readFileSync(
      path.join(__dirname, "..", "public", "blessboard", "v5", "media-picker.js"),
      "utf8"
    );
    assert.match(pickerJs, /aria-live="assertive"/);
    assert.match(pickerJs, /data-bb-media-success/);
    assert.match(pickerJs, /fd\.append\("file"/);
    assert.match(pickerJs, /fd\.append\("_csrf"/);
    assert.match(pickerJs, /JPEG, PNG, WebP, GIF/);
    assert.match(pickerJs, /Please try again\./);
    assert.doesNotMatch(pickerJs, /Upload failed:\s*"\s*\+\s*key/);
    assert.doesNotMatch(pickerJs, /storage_key|storageKey|service_role|bucket\/|\/tmp\//i);
    assert.doesNotMatch(pickerJs, /crop|compress|bulk upload|remote url|unsplash/i);
  });

  it("cleans up storage when metadata insert fails", async (t) => {
    if (skipIfNeeded(t)) return;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bb-media-cleanup-"));
    const local = createLocalFilesystemStorage({ rootDir: root, bucket: "local" });
    let uploads = 0;
    let deletes = 0;
    const tracking = {
      kind: "local",
      async upload(input) {
        uploads += 1;
        return local.upload(input);
      },
      async delete(input) {
        deletes += 1;
        return local.delete(input);
      },
      read: (...a) => local.read(...a),
      resolvePublicUrl: () => null,
      resolveSignedUrl: async () => null,
    };
    const svc = createMediaUploadService(baseEnv(), { storage: tracking });
    const fakeChurch = crypto.randomUUID();
    const result = await svc.uploadMediaAsset(pool, {
      churchId: fakeChurch,
      uploadedByUserId: users.hqA.user.id,
      buffer: PNG_1X1,
      originalFilename: "orphan.png",
      visibility: VISIBILITY.PUBLIC,
      dedupeByHash: false,
    });
    assert.equal(result.ok, false);
    assert.equal(uploads, 1);
    assert.equal(deletes, 1);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("serves the shared Content Library page to browsers and JSON to the picker", async (t) => {
    if (skipIfNeeded(t)) return;
    const sidA = sessionCookie(users.hqA);
    const bootA = await request(app).get("/hq/content").set("Host", HOST_A).set("Cookie", sidA);
    const csrfA = extractCookie(bootA, CSRF_COOKIE);
    assert.ok(csrfA);

    const up = await request(app)
      .post("/hq/content/media/upload")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(sidA, `${CSRF_COOKIE}=${csrfA}`))
      .field(CSRF_FIELD, csrfA)
      .field("visibility", "public")
      .attach("file", PNG_1X1, "library-page.png");
    assert.equal(up.status, 200, JSON.stringify(up.body));
    const assetId = up.body.assetId;
    assert.ok(assetId);

    // Content-hash dedupe may return an earlier identical upload, so resolve the
    // filename the library will actually show.
    const listed = await request(app)
      .get("/hq/content/media?visibility=public&limit=100")
      .set("Host", HOST_A)
      .set("Cookie", sidA)
      .set("Accept", "application/json");
    const asset = (listed.body.assets || []).find((a) => a.id === assetId);
    assert.ok(asset, "uploaded asset must be listed");
    const filename = asset.originalFilename;

    // A browser navigating to the advertised libraryPath must get a real page,
    // not a raw JSON body.
    const page = await request(app)
      .get("/hq/content/media?visibility=public")
      .set("Host", HOST_A)
      .set("Cookie", sidA)
      .set("Accept", "text/html,application/xhtml+xml,*/*;q=0.8");
    assert.equal(page.status, 200);
    assert.match(page.headers["content-type"], /text\/html/);
    assert.match(page.text, /data-bb-page="content-media-library"/);
    assert.match(page.text, /data-gp-library="1"/, "renders the shared library UI");
    assert.match(page.text, /data-gp-library-grid="1"/);
    assert.ok(page.text.includes(`data-gp-library-id="${assetId}"`));
    assert.ok(page.text.includes(filename));
    assert.match(page.text, /website-library\.css/);
    assert.match(page.text, /Content Library/);
    assert.doesNotMatch(page.text, /"ok":\s*true/, "must not be a JSON payload");
    assert.doesNotMatch(page.text, /storageKey|storageBucket|supabase/i);

    // Shared search and type filtering are driven by the query string.
    const searched = await request(app)
      .get(`/hq/content/media?q=${encodeURIComponent(filename)}`)
      .set("Host", HOST_A)
      .set("Cookie", sidA)
      .set("Accept", "text/html");
    assert.equal(searched.status, 200);
    assert.ok(searched.text.includes(`data-gp-library-id="${assetId}"`));

    const missed = await request(app)
      .get("/hq/content/media?q=definitely-not-present")
      .set("Host", HOST_A)
      .set("Cookie", sidA)
      .set("Accept", "text/html");
    assert.equal(missed.status, 200);
    assert.match(missed.text, /data-gp-library-empty="1"/, "renders the no-results state");
    assert.ok(!missed.text.includes(`data-gp-library-id="${assetId}"`));

    // The picker contract is unchanged.
    const asJson = await request(app)
      .get("/hq/content/media?visibility=public")
      .set("Host", HOST_A)
      .set("Cookie", sidA)
      .set("Accept", "application/json");
    assert.equal(asJson.status, 200);
    assert.equal(asJson.body.ok, true);
    assert.ok(Array.isArray(asJson.body.assets));

    // Tenant isolation still holds on the HTML surface.
    const crossHtml = await request(app)
      .get("/hq/content/media")
      .set("Host", HOST_B)
      .set("Cookie", sessionCookie(users.hqB))
      .set("Accept", "text/html");
    assert.equal(crossHtml.status, 200);
    assert.ok(
      !crossHtml.text.includes(assetId),
      "church B must not see church A files"
    );
  });

  it("manages shared media folders over HTTP without ever deleting assets", async (t) => {
    if (skipIfNeeded(t)) return;
    const sidA = sessionCookie(users.hqA);
    const bootA = await request(app).get("/hq/content").set("Host", HOST_A).set("Cookie", sidA);
    const csrfA = extractCookie(bootA, CSRF_COOKIE);
    assert.ok(csrfA);
    const authed = cookieHeader(sidA, `${CSRF_COOKIE}=${csrfA}`);

    const up = await request(app)
      .post("/hq/content/media/upload")
      .set("Host", HOST_A)
      .set("Cookie", authed)
      .field(CSRF_FIELD, csrfA)
      .field("visibility", "public")
      .attach("file", PDF_MIN, "folder-doc.pdf");
    assert.equal(up.status, 200, JSON.stringify(up.body));
    const assetId = up.body.assetId;
    assert.ok(assetId);

    const created = await request(app)
      .post("/hq/content/media/folders")
      .set("Host", HOST_A)
      .set("Cookie", authed)
      .type("form")
      .send({ [CSRF_FIELD]: csrfA, name: "Service Bulletins" });
    assert.equal(created.status, 303, created.text);
    const folderId = /folder=([0-9a-f-]{36})/.exec(created.headers.location || "");
    assert.ok(folderId, `expected a folder id in ${created.headers.location}`);

    // The new folder appears in the rail, and the asset starts Unfiled.
    const page = await request(app)
      .get("/hq/content/media")
      .set("Host", HOST_A)
      .set("Cookie", sidA)
      .set("Accept", "text/html");
    assert.equal(page.status, 200);
    assert.match(page.text, /Service Bulletins/);
    assert.match(page.text, /data-gp-library-folder="all"/);
    assert.match(page.text, /data-gp-library-folder="unfiled"/);
    assert.ok(page.text.includes(`data-gp-library-folder="${folderId[1]}"`));

    const moved = await request(app)
      .post("/hq/content/media/move")
      .set("Host", HOST_A)
      .set("Cookie", authed)
      .type("form")
      .send({ [CSRF_FIELD]: csrfA, mediaId: assetId, folderId: folderId[1] });
    assert.equal(moved.status, 303, moved.text);

    // Viewing the folder shows the asset; Unfiled no longer does.
    const inFolder = await request(app)
      .get(`/hq/content/media?folder=${folderId[1]}`)
      .set("Host", HOST_A)
      .set("Cookie", sidA)
      .set("Accept", "text/html");
    assert.ok(inFolder.text.includes(`data-gp-library-id="${assetId}"`));
    const inUnfiled = await request(app)
      .get("/hq/content/media?folder=unfiled")
      .set("Host", HOST_A)
      .set("Cookie", sidA)
      .set("Accept", "text/html");
    assert.ok(!inUnfiled.text.includes(`data-gp-library-id="${assetId}"`));

    const renamed = await request(app)
      .post("/hq/content/media/folders/rename")
      .set("Host", HOST_A)
      .set("Cookie", authed)
      .type("form")
      .send({ [CSRF_FIELD]: csrfA, folderId: folderId[1], name: "Weekly Bulletins" });
    assert.equal(renamed.status, 303);
    const afterRename = await request(app)
      .get("/hq/content/media")
      .set("Host", HOST_A)
      .set("Cookie", sidA)
      .set("Accept", "text/html");
    assert.match(afterRename.text, /Weekly Bulletins/);
    assert.doesNotMatch(afterRename.text, /Service Bulletins/);

    // Deleting the folder must keep the asset and return it to Unfiled.
    const deleted = await request(app)
      .post("/hq/content/media/folders/delete")
      .set("Host", HOST_A)
      .set("Cookie", authed)
      .type("form")
      .send({ [CSRF_FIELD]: csrfA, folderId: folderId[1] });
    assert.equal(deleted.status, 303, deleted.text);

    const afterDelete = await request(app)
      .get("/hq/content/media?limit=100")
      .set("Host", HOST_A)
      .set("Cookie", sidA)
      .set("Accept", "application/json");
    const survivor = (afterDelete.body.assets || []).find((a) => a.id === assetId);
    assert.ok(survivor, "deleting a folder must never delete the asset");
    assert.equal(survivor.folderId, null, "the asset returns to Unfiled");
    assert.doesNotMatch(afterDelete.text, /Weekly Bulletins/);

    // Folder mutations require CSRF.
    const noCsrf = await request(app)
      .post("/hq/content/media/folders")
      .set("Host", HOST_A)
      .set("Cookie", sidA)
      .type("form")
      .send({ name: "No CSRF" });
    assert.equal(noCsrf.status, 403);
  });

  it("lists church assets and archives via content-admin JSON; denies cross-tenant list", async (t) => {
    if (skipIfNeeded(t)) return;
    const sidA = sessionCookie(users.hqA);
    const bootA = await request(app).get("/hq/content").set("Host", HOST_A).set("Cookie", sidA);
    const csrfA = extractCookie(bootA, CSRF_COOKIE);
    assert.ok(csrfA);

    const up = await request(app)
      .post("/hq/content/media/upload")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(sidA, `${CSRF_COOKIE}=${csrfA}`))
      .field(CSRF_FIELD, csrfA)
      .field("visibility", "public")
      .attach("file", PNG_1X1, "library.png");
    assert.equal(up.status, 200, JSON.stringify(up.body));
    assert.equal(up.body.ok, true);

    const listA = await request(app)
      .get("/hq/content/media?visibility=public&limit=50")
      .set("Host", HOST_A)
      .set("Cookie", sidA)
      .set("Accept", "application/json");
    assert.equal(listA.status, 200);
    assert.equal(listA.body.ok, true);
    assert.ok(Array.isArray(listA.body.assets));
    assert.ok(listA.body.assets.some((a) => a.id === up.body.assetId));
    const row = listA.body.assets.find((a) => a.id === up.body.assetId);
    assert.equal(row.visibility, "public");
    assert.match(row.previewPath, /\/hq\/content\/media\//);
    assert.equal(Object.prototype.hasOwnProperty.call(row, "storageKey"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(row, "storageBucket"), false);
    assert.doesNotMatch(JSON.stringify(listA.body), /supabase|service_role|SECRET/i);

    const page = await request(app)
      .get("/hq/announcements/new")
      .set("Host", HOST_A)
      .set("Cookie", sidA);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-bb-media-picker="1"/);
    assert.match(page.text, /media-picker\.js/);
    assert.match(page.text, /data-visibility="private"/);
    assert.match(page.text, /data-fill="assetId"|data-fill="deliveryPath"/);

    const pickerJs = fs.readFileSync(
      path.join(__dirname, "..", "public", "blessboard", "v5", "media-picker.js"),
      "utf8"
    );
    assert.match(pickerJs, /cfg\.fill === "assetId"/);
    assert.match(pickerJs, /target\.value = asset\.deliveryPath/);
    assert.match(pickerJs, /data-bb-media-library-empty/);
    assert.match(pickerJs, /No church-owned files for this visibility/);
    assert.match(pickerJs, /filteredLibraryAssets/);
    assert.doesNotMatch(pickerJs, /unsplash|pexels|stock.?image/i);

    const sidB = sessionCookie(users.hqB);
    const listCross = await request(app)
      .get("/hq/content/media?visibility=public")
      .set("Host", HOST_B)
      .set("Cookie", sidB)
      .set("Accept", "application/json");
    assert.equal(listCross.status, 200);
    assert.equal(listCross.body.ok, true);
    assert.equal(
      listCross.body.assets.some((a) => a.id === up.body.assetId),
      false,
      "church B must not see church A assets"
    );

    const archived = await request(app)
      .post(`/hq/content/media/${up.body.assetId}/archive`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(sidA, `${CSRF_COOKIE}=${csrfA}`))
      .type("form")
      .send({ [CSRF_FIELD]: csrfA });
    assert.equal(archived.status, 200, JSON.stringify(archived.body));
    assert.equal(archived.body.ok, true);
    assert.equal(archived.body.status, "archived");

    const listAfter = await request(app)
      .get("/hq/content/media?visibility=public")
      .set("Host", HOST_A)
      .set("Cookie", sidA);
    assert.equal(listAfter.status, 200);
    assert.equal(
      listAfter.body.assets.some((a) => a.id === up.body.assetId),
      false
    );
  });

  it("media detail UI renders safe metadata and archive confirmation copy", () => {
    const pickerJs = fs.readFileSync(
      path.join(__dirname, "..", "public", "blessboard", "v5", "media-picker.js"),
      "utf8"
    );
    assert.match(pickerJs, /data-bb-media-detail="1"/);
    assert.match(pickerJs, /data-bb-media-lib-meta/);
    assert.match(pickerJs, /data-bb-media-detail-archive/);
    assert.match(pickerJs, /data-bb-media-detail-usage/);
    assert.match(pickerJs, /Asset detail/);
    assert.match(pickerJs, /Filename/);
    assert.match(pickerJs, /Visibility/);
    assert.match(pickerJs, /formatCreatedAt/);
    assert.match(pickerJs, /Soft-archive removes this from the library/);
    assert.match(pickerJs, /this church only/);
    assert.match(pickerJs, /not permanently deleted/);
    assert.match(pickerJs, /Reference checks beyond soft-archive are not reported/);
    assert.match(pickerJs, /data-bb-media-archive-error/);
    assert.match(pickerJs, /\/media\/" \+ encodeURIComponent\(assetId\) \+ "\/archive"/);
    assert.doesNotMatch(pickerJs, /storage_key|storageKey|storageBucket|bucket\/|service_role/i);
    assert.doesNotMatch(pickerJs, /replace file|crop|rename asset|bulk.?delete|hard.?delete/i);
  });

  it("rejects archive without valid CSRF", async (t) => {
    if (skipIfNeeded(t)) return;
    const sid = sessionCookie(users.hqA);
    const boot = await request(app).get("/hq/content").set("Host", HOST_A).set("Cookie", sid);
    const csrf = extractCookie(boot, CSRF_COOKIE);
    assert.ok(csrf);

    const up = await request(app)
      .post("/hq/content/media/upload")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(sid, `${CSRF_COOKIE}=${csrf}`))
      .field(CSRF_FIELD, csrf)
      .field("visibility", "public")
      .attach("file", PNG_1X1, "archive-csrf.png");
    assert.equal(up.status, 200, JSON.stringify(up.body));

    const archived = await request(app)
      .post(`/hq/content/media/${up.body.assetId}/archive`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(sid, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ [CSRF_FIELD]: "not-the-real-csrf-token" });
    assert.equal(archived.status, 403);
    assert.equal(archived.body.ok, false);
    assert.equal(archived.body.reason, "csrf");
  });

  it("rejects cross-tenant archive of another church asset", async (t) => {
    if (skipIfNeeded(t)) return;
    const sidA = sessionCookie(users.hqA);
    const bootA = await request(app).get("/hq/content").set("Host", HOST_A).set("Cookie", sidA);
    const csrfA = extractCookie(bootA, CSRF_COOKIE);
    assert.ok(csrfA);

    const up = await request(app)
      .post("/hq/content/media/upload")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(sidA, `${CSRF_COOKIE}=${csrfA}`))
      .field(CSRF_FIELD, csrfA)
      .field("visibility", "public")
      .attach("file", PNG_1X1, "cross-archive.png");
    assert.equal(up.status, 200, JSON.stringify(up.body));

    const sidB = sessionCookie(users.hqB);
    const bootB = await request(app).get("/hq/content").set("Host", HOST_B).set("Cookie", sidB);
    const csrfB = extractCookie(bootB, CSRF_COOKIE);
    assert.ok(csrfB);

    const cross = await request(app)
      .post(`/hq/content/media/${up.body.assetId}/archive`)
      .set("Host", HOST_B)
      .set("Cookie", cookieHeader(sidB, `${CSRF_COOKIE}=${csrfB}`))
      .type("form")
      .send({ [CSRF_FIELD]: csrfB });
    assert.equal(cross.status, 404);
    assert.equal(cross.body.ok, false);
    assert.equal(cross.body.reason, "not_found");

    const stillListed = await request(app)
      .get("/hq/content/media?visibility=public")
      .set("Host", HOST_A)
      .set("Cookie", sidA)
      .set("Accept", "application/json");
    assert.equal(stillListed.status, 200);
    assert.ok(
      stillListed.body.assets.some((a) => a.id === up.body.assetId),
      "church A asset must remain active after cross-tenant archive attempt"
    );
  });

  it("soft-archives without hard-delete or fabricated in-use blocking", async (t) => {
    if (skipIfNeeded(t)) return;
    const uploaded = await mediaService.uploadMediaAsset(pool, {
      churchId: churchA.id,
      uploadedByUserId: users.hqA.user.id,
      buffer: PNG_1X1,
      originalFilename: "soft-archive.png",
      visibility: VISIBILITY.PUBLIC,
      dedupeByHash: false,
    });
    assert.equal(uploaded.ok, true);

    const archived = await mediaService.archiveMediaAsset(pool, {
      assetId: uploaded.asset.id,
      churchId: churchA.id,
    });
    assert.equal(archived.ok, true);
    assert.equal(archived.asset.status, "archived");
    assert.ok(archived.asset.archivedAt);
    assert.equal(Object.prototype.hasOwnProperty.call(archived, "inUse"), false);

    const again = await mediaService.archiveMediaAsset(pool, {
      assetId: uploaded.asset.id,
      churchId: churchA.id,
    });
    assert.equal(again.ok, false);
    assert.equal(again.reason, "not_found");

    const pickerJs = fs.readFileSync(
      path.join(__dirname, "..", "public", "blessboard", "v5", "media-picker.js"),
      "utf8"
    );
    assert.match(pickerJs, /Reference checks beyond soft-archive are not reported/);
    assert.doesNotMatch(pickerJs, /in_use|dependency count|used by \d+/i);
    // Confirm dialog / detail never surface storage keys in UI source.
    assert.doesNotMatch(pickerJs, /storageKey|storageBucket|storage_key/);
  });

  it("leaves V4 server.legacy.js unchanged (presence check)", () => {
    const legacy = path.join(__dirname, "..", "server.legacy.js");
    assert.equal(fs.existsSync(legacy), true);
    const src = fs.readFileSync(legacy, "utf8");
    assert.equal(src.includes("createMediaUploadService"), false);
    assert.equal(src.includes("blessboard.media_assets"), false);
  });
});
