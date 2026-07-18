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
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_MEDIA_FORCE_LOCAL: "1",
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
        deploymentCode: "blessboard-org-v5",
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
        deploymentCode: "blessboard-org-v5",
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
          deploymentCode: "blessboard-org-v5",
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
      t.skip(`setup failed: ${skipReason}`);
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

  it("leaves V4 server.legacy.js unchanged (presence check)", () => {
    const legacy = path.join(__dirname, "..", "server.legacy.js");
    assert.equal(fs.existsSync(legacy), true);
    const src = fs.readFileSync(legacy, "utf8");
    assert.equal(src.includes("createMediaUploadService"), false);
    assert.equal(src.includes("blessboard.media_assets"), false);
  });
});
