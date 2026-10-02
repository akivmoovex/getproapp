"use strict";

/**
 * PROMPT 31 — HQ /hq/membership review queue must not fall through to foundation 503.
 * Empty / populated / unauthorized + pastoral-note non-leakage.
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
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  submitMemberRegistration,
  approveMemberRegistration,
} = require("../src/blessboard/services/memberRegistrationService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "HqMembershipQa99!";
const HOST = "hq-membership.blessboard.test";

let pool;
let skipReason = null;
let app;
let org;
let church;
let hqBranch;
let campus;
let users = {};
let pendingRegId = null;

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

async function sessionCookieFor(user, opts) {
  const created = await createV5Session(pool, {
    deploymentCode: "blessboard-org-staging",
    userId: user.id,
    organizationId: (opts && opts.organizationId) || org.id,
    churchId: (opts && opts.churchId) || church.id,
  });
  assert.equal(created.ok, true, created.message);
  return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
}

describe("V8 HQ membership review route", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl, direction: "up" });
      await ensureDatabaseIdentity(pool, { identityKey: IDENTITY_KEY });

      const key = uniq("hm");
      const prov = await provisionPlatformTenant(pool, {
        organizationKey: key,
        displayName: `Org ${key}`,
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: key,
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(prov.ok, true, prov.message);
      org = prov.records.organization;

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
      church = ch.records.church;
      hqBranch = ch.records.hqBranch;

      campus = hqBranch;

      async function makeUser(email, displayName) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      users.hq = await makeUser(`hq.${key}@example.invalid`, "HQ Admin");
      users.branch = await makeUser(`branch.${key}@example.invalid`, "Branch Admin");
      users.stranger = await makeUser(`stranger.${key}@example.invalid`, "No Role");

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: `hq.${key}@example.invalid`,
            organizationKey: key,
            roleKey: "church_hq_admin",
            churchKey: key,
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: `branch.${key}@example.invalid`,
            organizationKey: key,
            roleKey: "branch_admin",
            churchKey: key,
            branchKey: "hq",
          })
        ).ok,
        true
      );

      const submitted = await submitMemberRegistration(pool, {
        churchId: church.id,
        branchId: campus.id,
        firstName: "Pending",
        lastName: "Applicant",
        preferredName: "Pen",
        email: `pending.${key}@example.invalid`,
        phone: "+260977001031",
      });
      assert.equal(submitted.ok, true, submitted.reason || submitted.status);
      pendingRegId = submitted.registration.id;

      await pool.query(
        `UPDATE blessboard.member_registrations
            SET pastoral_notes = $2, pastoral_notes_updated_at = now()
          WHERE id = $1`,
        [pendingRegId, "SECRET_PASTORAL_NOTE_HQ_MEMBERSHIP"]
      );

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
    } catch (err) {
      skipReason =
        err && err.stack
          ? String(err.stack).slice(0, 500)
          : String(err && err.message ? err.message : err);
      console.error("hq-membership-route setup failed:", skipReason);
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("unauthenticated GET /hq/membership redirects to login (not 503)", async () => {
    requireDb();
    const res = await request(app)
      .get("/hq/membership")
      .set("Host", HOST)
      .set("Accept", "text/html");
    assert.notEqual(res.status, 503);
    assert.ok(res.status === 302 || res.status === 303 || res.status === 401);
    if (res.status === 302 || res.status === 303) {
      assert.match(String(res.headers.location || ""), /\/login/);
    }
  });

  it("unauthorized user cannot open /hq/membership", async () => {
    requireDb();
    const cookie = await sessionCookieFor(users.stranger);
    const res = await request(app)
      .get("/hq/membership")
      .set("Host", HOST)
      .set("Cookie", cookie);
    assert.notEqual(res.status, 503);
    assert.ok(res.status === 403 || res.status === 302 || res.status === 303);
    assert.doesNotMatch(String(res.text || ""), /SECRET_PASTORAL_NOTE/);
  });

  it("HQ empty-state queue returns 200 (not foundation unavailable)", async () => {
    requireDb();
    const cookie = await sessionCookieFor(users.hq);
    const res = await request(app)
      .get("/hq/membership?status=withdrawn")
      .set("Host", HOST)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /not yet available in BlessBoard/i);
    assert.match(res.text, /Registration oversight|Membership review|bb-hq-reg/i);
  });

  it("HQ populated queue + detail without pastoral leakage", async () => {
    requireDb();
    const cookie = await sessionCookieFor(users.hq);
    const queue = await request(app)
      .get("/hq/membership")
      .set("Host", HOST)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.equal(queue.status, 200);
    assert.match(queue.text, /Pending|Applicant|Pen/i);
    assert.doesNotMatch(queue.text, /SECRET_PASTORAL_NOTE|pastoral_notes/i);

    const detail = await request(app)
      .get(`/hq/membership/registrations/${pendingRegId}`)
      .set("Host", HOST)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Pending|Applicant/i);
    assert.doesNotMatch(detail.text, /SECRET_PASTORAL_NOTE|pastoral_notes|pastoralNotes/i);
  });

  it("branch admin can open branch membership queue and decide review", async () => {
    requireDb();
    const cookie = await sessionCookieFor(users.branch);
    const queue = await request(app)
      .get("/branch-admin/membership")
      .set("Host", HOST)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.equal(queue.status, 200);
    assert.doesNotMatch(queue.text, /not yet available in BlessBoard/i);
    assert.doesNotMatch(queue.text, /SECRET_PASTORAL_NOTE/i);

    const detail = await request(app)
      .get(`/branch-admin/membership/registrations/${pendingRegId}`)
      .set("Host", HOST)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.equal(detail.status, 200);
    assert.doesNotMatch(detail.text, /SECRET_PASTORAL_NOTE/i);

    const decided = await approveMemberRegistration(pool, {
      registrationId: pendingRegId,
      actorUserId: users.branch.id,
      reviewNotes: "Approved in membership route QA",
    });
    assert.equal(decided.ok, true, decided.reason || decided.status);
  });

  it("preserves HQ vs branch permissions on membership paths", async () => {
    requireDb();
    const hqCookie = await sessionCookieFor(users.hq);
    const brCookie = await sessionCookieFor(users.branch);

    const hqOnBranch = await request(app)
      .get("/branch-admin/membership")
      .set("Host", HOST)
      .set("Cookie", hqCookie)
      .set("Accept", "text/html");
    // HQ may or may not have branch shell access depending on primary branch;
    // must never be foundation 503.
    assert.notEqual(hqOnBranch.status, 503);

    const brOnHq = await request(app)
      .get("/hq/membership")
      .set("Host", HOST)
      .set("Cookie", brCookie)
      .set("Accept", "text/html");
    assert.notEqual(brOnHq.status, 503);
    // Branch admin without church-scoped members.view should be denied or scoped.
    assert.ok([200, 403, 302, 303].includes(brOnHq.status));
  });
});
