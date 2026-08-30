"use strict";

/**
 * V1 hardening: BlessBoard public publish must dual-write the shared engine
 * version/audit, and engine-bridge failures must be visible (not silent).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const {
  publishChurchWebsite,
  publishInitialFoundationWebsite,
  acknowledgeWebsitePreview,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const instanceRepo = require("../src/platform/website/instanceRepository");
const { listRecentWebsiteChanges } = require("../src/platform/website/recentChangesService");
const {
  EVENT,
  logBlessBoardEngineBridgeFailure,
} = require("../src/platform/website-engine/blessboardEngineBridgeLog");
const bridge = require("../src/platform/website-engine/blessboardBridge");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";

let pool;
let skipReason = null;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

async function provisionChurch() {
  const key = uniq("bbdw");
  const row = await appRepo.createApplication(pool, {
    church_name: `DualWrite ${key}`,
    country: "Zambia",
    city: "Lusaka",
    contact_name: "Site Admin",
    contact_email: `${key}@example.org`,
    contact_phone: `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
    selected_plan: "foundation",
    consent_terms: true,
    branch_name: "Main Campus",
  });
  const result = await provisionRegisteredBlessBoardChurch(pool, {
    applicationId: row.id,
    administratorPassword: PASSWORD,
    requestId: `req-${key}`,
    actorContext: {
      type: "test",
      source: "unit",
      dataEnvironment: "testing",
      deploymentCode: "blessboard-org-staging",
    },
  });
  assert.equal(result.ok, true, result.message || result.status);
  return result.records;
}

describe("v7 BlessBoard publish engine bridge", () => {
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
      skipReason = err && err.message ? String(err.message) : "no_foundation_db";
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("emits structured dual-write failure logs without secrets", () => {
    const lines = [];
    const orig = console.error;
    console.error = (msg) => {
      lines.push(String(msg));
    };
    try {
      const payload = logBlessBoardEngineBridgeFailure({
        operation: "publishFromLegacy",
        organizationId: "11111111-1111-4111-8111-111111111111",
        instanceId: "22222222-2222-4222-8222-222222222222",
        actorIdentityId: "33333333-3333-4333-8333-333333333333",
        cmsPublicationVersionId: "44444444-4444-4444-8444-444444444444",
        engineCode: "website_instance_not_found",
        errorClass: "website_instance_not_found",
        password: "should-not-appear",
        token: "should-not-appear",
      });
      assert.equal(payload.event, EVENT);
      assert.equal(payload.outcome, "failure");
      assert.equal(payload.productCode, "blessboard");
      assert.ok(payload.timestamp);
      assert.equal(payload.organizationId, "11111111-1111-4111-8111-111111111111");
      assert.equal(payload.instanceId, "22222222-2222-4222-8222-222222222222");
      assert.equal(payload.actorIdentityId, "33333333-3333-4333-8333-333333333333");
      assert.equal(payload.engineCode, "website_instance_not_found");
      assert.equal(payload.errorClass, "website_instance_not_found");
      assert.equal(payload.password, undefined);
      assert.equal(payload.token, undefined);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.event, EVENT);
      assert.doesNotMatch(lines[0], /should-not-appear/);
    } finally {
      console.error = orig;
    }
  });

  it("every public BlessBoard publish entry point calls publishFromLegacy", () => {
    const root = path.join(__dirname, "..");
    const publishService = fs.readFileSync(
      path.join(root, "src/blessboard/services/churchWebsitePublishService.js"),
      "utf8"
    );
    assert.match(publishService, /publishFromLegacy/);
    const callers = [
      "src/blessboard/http/blessboardWebsiteEditorRoutes.js",
      "src/blessboard/services/websiteDraftPublishService.js",
      "src/blessboard/services/websiteChangeSubmissionService.js",
      "src/blessboard/services/websitePublicationVersionService.js",
      "src/blessboard/services/configureDemoChurch.js",
      "src/platform/website-engine/lifecycleOrchestrator.js",
    ];
    for (const rel of callers) {
      const src = fs.readFileSync(path.join(root, rel), "utf8");
      assert.match(
        src,
        /publishChurchWebsite/,
        `${rel} must publish through publishChurchWebsite`
      );
    }
    const initial = fs.readFileSync(
      path.join(root, "src/blessboard/services/churchWebsitePublishService.js"),
      "utf8"
    );
    assert.match(initial, /publishInitialFoundationWebsite/);
    assert.doesNotMatch(
      initial.slice(initial.indexOf("async function publishInitialFoundationWebsite")),
      /Shared-engine backfill must not fail registration/
    );
  });

  it("HQ settings source cannot promote a draft site to published", async () => {
    if (!requireDb()) return;
    const rec = await provisionChurch();
    const blocked = await updateChurchSettings(pool, rec.churchId, {
      publicName: "Still Draft Church",
      websiteStatus: "published",
      defaultTimezone: "Africa/Lusaka",
      defaultCountryCode: "ZM",
      source: "hq_settings",
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "website_publish_via_hub");
    const status = await pool.query(
      `SELECT website_status FROM blessboard.church_settings WHERE church_id = $1`,
      [rec.churchId]
    );
    assert.equal(status.rows[0].website_status, "draft");
  });

  it("registration leaves the first website unpublished and HQ publish writes an engine version into recent changes", async () => {
    if (!requireDb()) return;
    const rec = await provisionChurch();
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: rec.organizationId,
      productCode: "blessboard",
      scopeRef: null,
    });
    assert.ok(instance);
    assert.equal(instance.status, "coming_soon");
    assert.equal(String(instance.lifecycleStatus || ""), "provisional");
    const settings = await pool.query(
      `SELECT website_status FROM blessboard.church_settings WHERE church_id = $1`,
      [rec.churchId]
    );
    assert.equal(settings.rows[0].website_status, "draft");
    const livePages = await pool.query(
      `SELECT count(*)::int AS n FROM blessboard.public_pages
        WHERE church_id = $1 AND status = 'published'`,
      [rec.churchId]
    );
    assert.equal(livePages.rows[0].n, 0);

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
    const versions = await pool.query(
      `SELECT id, version_number, editor_identity_id, changed_keys
         FROM platform.website_versions
        WHERE instance_id = $1
        ORDER BY version_number DESC
        LIMIT 1`,
      [instance.id]
    );
    assert.equal(versions.rows.length, 1);
    const recent = await listRecentWebsiteChanges(pool, {
      organizationId: rec.organizationId,
      limit: 20,
    });
    assert.equal(recent.ok, true);
    const versionRow = (recent.changes || []).find(
      (row) => row.kind === "version" && String(row.instanceId) === String(instance.id)
    );
    assert.ok(versionRow, "recent changes missing engine version");
    assert.equal(versionRow.productCode, "blessboard");
    assert.equal(String(versionRow.organizationId), String(rec.organizationId));
    assert.ok(versionRow.versionNumber >= 1);
    const identity = versions.rows[0].editor_identity_id
      ? await pool.query(`SELECT id FROM platform.identities WHERE id = $1 LIMIT 1`, [
          versions.rows[0].editor_identity_id,
        ])
      : { rows: [] };
    assert.equal(
      identity.rows.length,
      0,
      "BlessBoard actor is a blessboard.users id, not platform.identities"
    );
    if (versions.rows[0].editor_identity_id) {
      const user = await pool.query(`SELECT id FROM blessboard.users WHERE id = $1 LIMIT 1`, [
        versions.rows[0].editor_identity_id,
      ]);
      assert.equal(user.rows.length, 1);
    }
  });

  it("engine dual-write failure rolls back CMS publish and logs", async () => {
    if (!requireDb()) return;
    const rec = await provisionChurch();
    await acknowledgeWebsitePreview(pool, {
      organizationId: rec.organizationId,
      actorUserId: rec.administratorUserId,
    });
    const orig = bridge.publishFromLegacy;
    const lines = [];
    const origErr = console.error;
    console.error = (msg) => {
      lines.push(String(msg));
    };
    bridge.publishFromLegacy = async () => ({ ok: false, code: "forced_bridge_failure", version: null });
    try {
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
      assert.equal(published.ok, false);
      const livePages = await pool.query(
        `SELECT count(*)::int AS n FROM blessboard.public_pages
          WHERE church_id = $1 AND status = 'published'`,
        [rec.churchId]
      );
      assert.equal(livePages.rows[0].n, 0);
      const settings = await pool.query(
        `SELECT website_status FROM blessboard.church_settings WHERE church_id = $1`,
        [rec.churchId]
      );
      assert.equal(settings.rows[0].website_status, "draft");
      assert.ok(
        lines.some((line) => line.includes("forced_bridge_failure") || line.includes("WEBSITE_ENGINE_PUBLISH")),
        "expected structured engine-bridge failure log"
      );
    } finally {
      bridge.publishFromLegacy = orig;
      console.error = origErr;
    }
  });

  it("publishInitialFoundationWebsite(publish:true) fails closed when the engine bridge fails", async () => {
    if (!requireDb()) return;
    const rec = await provisionChurch();
    const orig = bridge.publishFromLegacy;
    bridge.publishFromLegacy = async () => ({ ok: false, code: "forced_bridge_failure", version: null });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await assert.rejects(
        () =>
          publishInitialFoundationWebsite(client, {
            churchId: rec.churchId,
            organizationId: rec.organizationId,
            organizationKey: rec.organizationKey,
            publicName: "Repair Church",
            actorUserId: rec.administratorUserId,
            publish: true,
            source: "test",
          }),
        (err) => err && err.code === "WEBSITE_ENGINE_PUBLISH"
      );
      await client.query("ROLLBACK");
    } finally {
      bridge.publishFromLegacy = orig;
      client.release();
    }
  });
});
