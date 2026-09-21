"use strict";

/**
 * PROMPT 32 — path-public QA church routing under existing /c/:organizationKey.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
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
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  publishInitialFoundationWebsite,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  publishActivityRegistrationForm,
} = require("../src/blessboard/services/activityRegistrationService");
const {
  createAnnouncement,
} = require("../src/blessboard/services/announcementsService");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");

const IDENTITY_KEY = "blessboard-platform-v5";
const HOST = "path-public-qa.blessboard.test";
const PASSWORD = "PathPublicQa99!";

let pool;
let skipReason = null;
let app;
let orgKey;
let org;
let church;
let announcementId;
let otherOrgKey;

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    ...overrides,
  };
}

describe("V8 QA church path-public routing", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl, direction: "up" });
      await ensureDatabaseIdentity(pool, { identityKey: IDENTITY_KEY });

      orgKey = uniq("bb-v8qa");
      otherOrgKey = uniq("bb-other");

      async function seed(key) {
        const prov = await provisionPlatformTenant(pool, {
          organizationKey: key,
          displayName: `Org ${key}`,
          legalName: null,
          dataEnvironment: "testing",
          productKey: "blessboard",
          productTenantKey: key,
          hostname: `${key}.blessboard.test`,
          domainType: "canonical",
          deploymentCode: "blessboard-org-staging",
          isPrimary: true,
          skipDomain: true,
        });
        assert.equal(prov.ok, true, prov.message);
        const ch = await provisionBlessBoardChurch(pool, {
          organizationKey: key,
          churchKey: key,
          displayName: `Church ${key}`,
          legalName: null,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true, ch.message);
        return {
          organization: prov.records.organization,
          church: ch.records.church,
        };
      }

      const primary = await seed(orgKey);
      org = primary.organization;
      church = primary.church;
      await seed(otherOrgKey);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const published = await publishInitialFoundationWebsite(client, {
          churchId: church.id,
          organizationId: org.id,
          organizationKey: orgKey,
          publicName: `Church ${orgKey}`,
          publish: true,
          source: "v8-path-public-test",
        });
        assert.equal(published.ok, true, published.reason || published.status);
        await client.query("COMMIT");
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      } finally {
        client.release();
      }

      const visitor = await publishActivityRegistrationForm(pool, {
        kind: "visitor",
        organizationId: org.id,
        churchId: church.id,
        authz: async () => ({ ok: true }),
      });
      assert.equal(visitor.ok, true, visitor.reason || visitor.status);

      const hqUser = await createBlessBoardUser(pool, {
        email: `hq.${orgKey}@example.invalid`,
        displayName: "HQ",
        password: PASSWORD,
      });
      assert.equal(hqUser.ok, true, hqUser.message);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: `hq.${orgKey}@example.invalid`,
            organizationKey: orgKey,
            roleKey: "church_hq_admin",
            churchKey: orgKey,
          })
        ).ok,
        true
      );

      const created = await createAnnouncement(pool, {
        churchId: church.id,
        actorUserId: hqUser.user.id,
        title: "Path public QA announcement",
        body: "Visible on path-public detail.",
        audiences: ["public"],
        status: "published",
        confirmPublish: true,
      });
      assert.equal(created.ok, true, created.reason || created.status);
      announcementId = created.item.id;

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
    } catch (err) {
      skipReason =
        err && err.stack
          ? String(err.stack).slice(0, 600)
          : String(err && err.message ? err.message : err);
      console.error("path-public setup failed:", skipReason);
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("resolves church home under /c/:organizationKey", async () => {
    requireDb();
    const res = await request(app)
      .get(`/c/${orgKey}`)
      .set("Host", HOST)
      .redirects(2);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /not yet available in BlessBoard/i);
    assert.match(res.text, new RegExp(orgKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  });

  it("serves membership register and visitor form on path-public URLs", async () => {
    requireDb();
    const register = await request(app)
      .get(`/c/${orgKey}/register`)
      .set("Host", HOST)
      .set("Accept", "text/html");
    assert.equal(register.status, 200);
    assert.match(register.text, /data-bb-membership|bb-auth-form--register|First name/i);
    assert.match(register.text, new RegExp(`/c/${orgKey}/register`));

    const visit = await request(app)
      .get(`/c/${orgKey}/visit`)
      .set("Host", HOST)
      .set("Accept", "text/html");
    assert.equal(visit.status, 200);
    assert.match(visit.text, /data-bb-activity="visitor"|Plan a visit|Visitor/i);
    assert.match(visit.text, new RegExp(`/c/${orgKey}/visit`));
  });

  it("serves public announcement detail under /c/:org/announcements/:id", async () => {
    requireDb();
    const list = await request(app)
      .get(`/c/${orgKey}/hq/announcements`)
      .set("Host", HOST)
      .set("Accept", "text/html");
    assert.equal(list.status, 200);

    const detail = await request(app)
      .get(`/c/${orgKey}/announcements/${announcementId}`)
      .set("Host", HOST)
      .set("Accept", "text/html");
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Path public QA announcement/);
  });

  it("denies unknown org and does not leak cross-tenant announcement", async () => {
    requireDb();
    const missing = await request(app)
      .get("/c/does-not-exist-zzzz")
      .set("Host", HOST);
    assert.equal(missing.status, 404);

    const cross = await request(app)
      .get(`/c/${otherOrgKey}/announcements/${announcementId}`)
      .set("Host", HOST)
      .set("Accept", "text/html");
    assert.ok(cross.status === 404 || cross.status === 200);
    if (cross.status === 200) {
      assert.doesNotMatch(cross.text, /Path public QA announcement/);
    }
  });
});
