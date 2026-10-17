"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const request = require("supertest");
const { Pool } = require("pg");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");

const DB = "getpro_v211_test_01";
const HOST = `v211-hq-http-${process.pid}-${crypto.randomBytes(3).toString("hex")}.blessboard.test`;
const env = {
  ...process.env,
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
};

let pool;
let app;
let church;
let branch;
let foreignChurch;
let foreignBranch;
let hq;
let hq2;
let foreignHq;
let branchAdmin;
let setupError = null;

function key() {
  return `v211http${process.pid}${crypto.randomBytes(3).toString("hex")}`;
}

async function cookieFor(user) {
  const session = await createV5Session(pool, {
    deploymentCode: "blessboard-org-staging",
    userId: user.id,
    organizationId: church.organizationId,
    churchId: church.id,
  });
  assert.equal(session.ok, true, session.message);
  return `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
}

function csrf(res) {
  const set = res.headers["set-cookie"] || [];
  const cookie = set.find((v) => v.startsWith("blessboard_org_csrf="));
  assert.ok(cookie, "GET must issue CSRF cookie");
  const token = cookie.split(";")[0].split("=")[1];
  const field = res.text.match(/name="_csrf" value="([^"]+)"/);
  assert.ok(field, "form must contain CSRF field");
  return { cookie, token: field[1] };
}

describe("V211 HQ Add Member real HTTP integration", () => {
  before(async () => {
    try {
    assert.equal(await poolIdentity(), DB);
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL || `postgresql:///${DB}?host=/tmp` });
    const suffix = key();
    const tenant = await provisionPlatformTenant(pool, {
      organizationKey: suffix, displayName: `V211 ${suffix}`, legalName: null,
      dataEnvironment: "testing", productKey: "blessboard", productTenantKey: suffix,
      hostname: HOST, domainType: "canonical", deploymentCode: "blessboard-org-staging", isPrimary: true,
    });
    assert.equal(tenant.ok, true, tenant.message);
    const created = await provisionBlessBoardChurch(pool, {
      organizationKey: suffix, churchKey: suffix, displayName: `Church ${suffix}`,
      legalName: null, dataEnvironment: "testing", hqBranchKey: "hq",
      hqBranchDisplayName: "HQ",
    });
    assert.equal(created.ok, true, created.message);
    church = created.records.church;
    branch = created.records.hqBranch;
    church.organizationId = tenant.records.organization.id;
    const foreignKey = `${suffix}foreign`;
    const foreignTenant = await provisionPlatformTenant(pool, {
      organizationKey: foreignKey, displayName: `V211 ${foreignKey}`, legalName: null,
      dataEnvironment: "testing", productKey: "blessboard", productTenantKey: foreignKey,
      hostname: `foreign-${HOST}`, domainType: "canonical", deploymentCode: "blessboard-org-staging", isPrimary: true,
    });
    assert.equal(foreignTenant.ok, true, foreignTenant.message);
    const foreign = await provisionBlessBoardChurch(pool, {
      organizationKey: foreignKey, churchKey: foreignKey, displayName: `Church ${foreignKey}`,
      legalName: null, dataEnvironment: "testing", hqBranchKey: "hq",
      hqBranchDisplayName: "HQ",
    });
    assert.equal(foreign.ok, true, foreign.message);
    foreignChurch = foreign.records.church;
    foreignChurch.organizationId = foreignTenant.records.organization.id;
    foreignBranch = foreign.records.hqBranch;
    async function user(label) {
      const result = await createBlessBoardUser(pool, {
        email: `${label}.${suffix}@example.invalid`, displayName: label, password: "V211-test-password!",
      });
      assert.equal(result.ok, true, result.message);
      return result.user;
    }
    hq = await user("hq");
    hq2 = await user("hq2");
    branchAdmin = await user("branch");
    assert.equal((await assignBlessBoardRole(pool, {
      email: hq.email, organizationKey: suffix, roleKey: "church_hq_admin", churchKey: suffix,
    })).ok, true);
    const foreignUser = await createBlessBoardUser(pool, {
      email: `foreign-hq.${suffix}@example.invalid`, displayName: "Foreign HQ", password: "V211-test-password!",
    });
    assert.equal(foreignUser.ok, true, foreignUser.message);
    foreignHq = foreignUser.user;
    assert.equal((await assignBlessBoardRole(pool, {
      email: foreignHq.email, organizationKey: foreignKey, roleKey: "church_hq_admin", churchKey: foreignKey,
    })).ok, true);
    assert.equal((await assignBlessBoardRole(pool, {
      email: hq2.email, organizationKey: suffix, roleKey: "church_hq_admin", churchKey: suffix,
    })).ok, true);
    assert.equal((await assignBlessBoardRole(pool, {
      email: branchAdmin.email, organizationKey: suffix, roleKey: "branch_admin",
      churchKey: suffix, branchKey: "hq",
    })).ok, true);
    app = createV5FoundationApp({ getPool: () => pool, env });
    } catch (err) {
      setupError = err;
      if (pool) await pool.end();
      pool = null;
    }
  });

  after(async () => { if (pool) await pool.end(); });

  async function poolIdentity() {
    const check = new Pool({ connectionString: process.env.TEST_DATABASE_URL || `postgresql:///${DB}?host=/tmp` });
    const result = await check.query("select current_database()");
    await check.end();
    return result.rows[0].current_database;
  }

  function requireSetup() {
    if (setupError) return false;
    return true;
  }

  it("serves the real HQ form with tenant, RBAC and CSRF", async (t) => {
    if (!requireSetup()) return t.skip(`fixture setup unavailable: ${setupError.message}`);
    const res = await request(app).get("/hq/members/new").set("Host", HOST)
      .set("Cookie", await cookieFor(hq)).set("Accept", "text/html");
    assert.equal(res.status, 200);
    assert.match(res.text, /Add member/);
    csrf(res);
  });

  it("denies anonymous and branch-only users", async (t) => {
    if (!requireSetup()) return t.skip(`fixture setup unavailable: ${setupError.message}`);
    const anonymous = await request(app).get("/hq/members/new").set("Host", HOST)
      .set("Accept", "text/html");
    assert.ok([302, 303, 401].includes(anonymous.status));
    const denied = await request(app).get("/hq/members/new").set("Host", HOST)
      .set("Cookie", await cookieFor(branchAdmin)).set("Accept", "text/html");
    assert.ok([302, 303, 403].includes(denied.status));
  });

  it("enforces CSRF through the actual HQ POST route", async (t) => {
    if (!requireSetup()) return t.skip(`fixture setup unavailable: ${setupError.message}`);
    const cookie = await cookieFor(hq);
    const page = await request(app).get("/hq/members/new").set("Host", HOST)
      .set("Cookie", cookie).set("Accept", "text/html");
    const issued = csrf(page);
    const post = await request(app).post("/hq/members/new").set("Host", HOST)
      .set("Cookie", [cookie, issued.cookie.split(";")[0]])
      .type("form").send({ full_name: "V211 HTTP Candidate", phone: "+260977000001", branch_id: branch.id, [CSRF_FIELD]: issued.token });
    assert.notEqual(post.status, 403);
    const rejected = await request(app).post("/hq/members/new").set("Host", HOST)
      .set("Cookie", cookie).type("form").send({ full_name: "Candidate", phone: "+260977000002", branch_id: branch.id });
    assert.equal(rejected.status, 403);
  });

  it("executes the real no-match review, confirmation, persistence and replay flow", async () => {
    const cookie = await cookieFor(hq);
    const page = await request(app).get("/hq/members/new").set("Host", HOST)
      .set("Cookie", cookie).set("Accept", "text/html");
    const issued = csrf(page);
    const form = {
      full_name: `V211 Persisted ${process.pid}`,
      email: `persisted.${process.pid}.${Date.now()}@example.invalid`,
      phone: "+260977000009",
      address_line_1: "Synthetic Test Address",
      marital_status: "single",
      next_of_kin_name: "Synthetic Kin",
      next_of_kin_relationship: "sibling",
      branch_id: branch.id,
      [CSRF_FIELD]: issued.token,
    };
    const initial = await request(app).post("/hq/members/new").set("Host", HOST)
      .set("Cookie", [cookie, issued.cookie.split(";")[0]]).type("form").send(form);
    assert.equal(initial.status, 200, initial.text.slice(0, 200));
    assert.match(initial.text, /Review new member/);
    const draft = initial.text.match(/name="draft_token" value="([^"]+)"/);
    assert.ok(draft, "review must contain service-issued draft token");
    const reviewCsrf = csrf(initial);
    const confirmed = await request(app).post("/hq/members/new/review").set("Host", HOST)
      .set("Cookie", [cookie, reviewCsrf.cookie.split(";")[0]]).type("form")
      .send({ draft_token: draft[1], action: "confirm_create", [CSRF_FIELD]: reviewCsrf.token });
    assert.equal(confirmed.status, 303, confirmed.text);
    assert.match(confirmed.headers.location, /^\/hq\/members\/[0-9a-f-]+\/created$/);
    const memberId = confirmed.headers.location.match(/\/members\/([^/]+)\/created$/)[1];
    const created = await request(app).get(confirmed.headers.location).set("Host", HOST)
      .set("Cookie", cookie).set("Accept", "text/html");
    assert.equal(created.status, 200);
    assert.match(created.text, /Portal access is not_activated/);
    const dbMember = await pool.query(
      `select m.id, m.church_id, m.portal_access_status, mbm.branch_id
         from blessboard.members m
         join blessboard.member_branch_memberships mbm on mbm.member_id = m.id
        where m.id = $1`,
      [memberId]
    );
    assert.equal(dbMember.rowCount, 1);
    assert.equal(String(dbMember.rows[0].church_id), String(church.id));
    assert.equal(String(dbMember.rows[0].branch_id), String(branch.id));
    assert.equal(dbMember.rows[0].portal_access_status, "not_activated");
    const replayCsrf = csrf(initial);
    const replay = await request(app).post("/hq/members/new/review").set("Host", HOST)
      .set("Cookie", [cookie, replayCsrf.cookie.split(";")[0]]).type("form")
      .send({ draft_token: draft[1], action: "confirm_create", [CSRF_FIELD]: replayCsrf.token });
    assert.equal(replay.status, 303);
    assert.equal(replay.headers.location, confirmed.headers.location);
    const count = await pool.query(
      "select count(*)::int as count from blessboard.members where id = $1", [memberId]
    );
    assert.equal(count.rows[0].count, 1);
    const directory = await request(app).get("/hq/members").set("Host", HOST)
      .set("Cookie", cookie).set("Accept", "text/html");
    assert.equal(directory.status, 200);
    assert.match(directory.text, /V211 Persisted/);
  });

  it("executes existing-identity matching and rejects cross-actor draft replay", async () => {
    const actorCookie = await cookieFor(hq);
    const page = await request(app).get("/hq/members/new").set("Host", HOST)
      .set("Cookie", actorCookie).set("Accept", "text/html");
    const issued = csrf(page);
    const knownEmail = `persisted.${process.pid}`;
    const existing = await pool.query(
      "select m.id, email_display, phone_display, branch_id from blessboard.members m join blessboard.member_branch_memberships mb on mb.member_id=m.id where m.email_display like $1 order by m.created_at desc limit 1",
      [`persisted.${process.pid}.%@example.invalid`]
    );
    assert.equal(existing.rowCount, 1);
    const matchForm = {
      full_name: "V211 Persisted",
      email: existing.rows[0].email_display,
      phone: existing.rows[0].phone_display,
      address_line_1: "Synthetic Test Address",
      marital_status: "single",
      next_of_kin_name: "Synthetic Kin",
      next_of_kin_relationship: "sibling",
      branch_id: existing.rows[0].branch_id,
      [CSRF_FIELD]: issued.token,
    };
    const matched = await request(app).post("/hq/members/new").set("Host", HOST)
      .set("Cookie", [actorCookie, issued.cookie.split(";")[0]]).type("form").send(matchForm);
    assert.ok([200, 409].includes(matched.status));
    assert.match(matched.text, /match|existing|Review/i);
    const draft = matched.text.match(/name="draft_token" value="([^"]+)"/);
    assert.ok(draft);
    const matchCsrf = csrf(matched);
    const opened = await request(app).post("/hq/members/new/match").set("Host", HOST)
      .set("Cookie", [actorCookie, matchCsrf.cookie.split(";")[0]]).type("form")
      .send({ draft_token: draft[1], action: "open_existing", member_id: existing.rows[0].id, [CSRF_FIELD]: matchCsrf.token });
    assert.equal(opened.status, 303);
    assert.equal(opened.headers.location, `/hq/members/${existing.rows[0].id}`);
    const unauthorized = await request(app).post("/hq/members/new/match").set("Host", HOST)
      .set("Cookie", [await cookieFor(hq2), matchCsrf.cookie.split(";")[0]]).type("form")
      .send({ draft_token: draft[1], action: "different_person", [CSRF_FIELD]: matchCsrf.token });
    assert.equal(unauthorized.status, 403);
  });

  it("rejects foreign branch and foreign tenant fields at the real HQ boundary", async () => {
    const cookie = await cookieFor(hq);
    const attempt = Date.now();
    const page = await request(app).get("/hq/members/new").set("Host", HOST)
      .set("Cookie", cookie).set("Accept", "text/html");
    const issued = csrf(page);
    const response = await request(app).post("/hq/members/new").set("Host", HOST)
      .set("Cookie", [cookie, issued.cookie.split(";")[0]]).type("form").send({
        full_name: `Foreign Attempt ${attempt}`,
        email: `foreign.attempt.${attempt}@example.invalid`,
        phone: "+260977000011",
        address_line_1: "Synthetic Address",
        marital_status: "single",
        next_of_kin_name: "Synthetic Kin",
        next_of_kin_relationship: "sibling",
        branch_id: foreignBranch.id,
        church_id: foreignChurch.id,
        organization_id: foreignChurch.organizationId || "foreign",
        [CSRF_FIELD]: issued.token,
      });
    assert.equal(response.status, 400);
    const leaked = await pool.query(
      "select count(*)::int as count from blessboard.members where church_id = $1 and email_normalized = $2",
      [foreignChurch.id, `foreign.attempt.${attempt}@example.invalid`]
    );
    assert.equal(leaked.rows[0].count, 0);
  });

  it("rejects unsupported match actions and cross-church draft replay", async () => {
    const actorCookie = await cookieFor(hq);
    const page = await request(app).get("/hq/members/new").set("Host", HOST)
      .set("Cookie", actorCookie).set("Accept", "text/html");
    const issued = csrf(page);
    const stamp = Date.now();
    const initial = await request(app).post("/hq/members/new").set("Host", HOST)
      .set("Cookie", [actorCookie, issued.cookie.split(";")[0]]).type("form").send({
        full_name: `Edge Draft ${stamp}`, email: `edge.${stamp}@example.invalid`,
        phone: "+260977000012", address_line_1: "Synthetic Address",
        marital_status: "single", next_of_kin_name: "Synthetic Kin",
        next_of_kin_relationship: "sibling", branch_id: branch.id, [CSRF_FIELD]: issued.token,
      });
    assert.equal(initial.status, 200);
    const draft = initial.text.match(/name="draft_token" value="([^"]+)"/);
    assert.ok(draft);
    const matchToken = csrf(initial);
    const invalid = await request(app).post("/hq/members/new/match").set("Host", HOST)
      .set("Cookie", [actorCookie, matchToken.cookie.split(";")[0]]).type("form")
      .send({ draft_token: draft[1], action: "unsupported", [CSRF_FIELD]: matchToken.token });
    assert.equal(invalid.status, 409);
    const foreignCookie = await cookieFor(foreignHq);
    const foreignPage = await request(app).get("/hq/members/new").set("Host", `foreign-${HOST}`)
      .set("Cookie", foreignCookie).set("Accept", "text/html");
    const foreignCsrf = csrf(foreignPage);
    const replay = await request(app).post("/hq/members/new/match").set("Host", `foreign-${HOST}`)
      .set("Cookie", [foreignCookie, foreignCsrf.cookie.split(";")[0]]).type("form")
      .send({ draft_token: draft[1], action: "different_person", [CSRF_FIELD]: foreignCsrf.token });
    assert.equal(replay.status, 403);
  });
});
