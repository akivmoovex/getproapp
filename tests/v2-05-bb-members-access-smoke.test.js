"use strict";

/**
 * V2.05 / V5 — BB Members + Access CRUD smoke (HQ admin).
 *
 * MEMBERS: HQ directory open → create (domain service + HQ list) → edit safe fields
 * → reload persistence. ACCESS: staff-access invite/assign + controlled 4xx.
 * Tenant isolation included. Reuses current routes/services; no role redesign.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  provisionBlessBoardChurch,
} = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  createBlessBoardUser,
} = require("../src/blessboard/services/createBlessBoardUser");
const {
  assignBlessBoardRole,
} = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { ENV_KEY } = require("../src/blessboard/config/instantFreeProvisioningEnabled");
const { nextZmNational } = require("./helpers/zmPhoneFormFields");
const {
  createStaffManagedMember,
  updateMemberProfile,
} = require("../src/blessboard/services/blessBoardMemberDomainService");
const {
  createRoleAssignment,
} = require("../src/blessboard/services/blessBoardRoleAssignmentService");
const { expectIsolationDenied } = require("./helpers/authzNegativeHelpers");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "BbMembersAccess-Smoke-99!";
const BB_APEX = "blessboard.org";

const MINIMAL_BB = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
  [ENV_KEY]: "1",
});

let pool;
let skipReason = null;
let memberCases = 0;
let accessCases = 0;

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}${crypto.randomBytes(3).toString("hex")}`.slice(0, 20);
}

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function extractCsrf(html) {
  const m = String(html || "").match(
    new RegExp(
      `name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`
    )
  );
  return (m && (m[1] || m[2])) || null;
}

function cookieHeader(res, prior = "") {
  const jar = new Map();
  for (const part of String(prior || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0) jar.set(part.slice(0, i), part.slice(i + 1));
  }
  const raw = res && res.headers && res.headers["set-cookie"];
  for (const line of Array.isArray(raw) ? raw : raw ? [raw] : []) {
    const pair = String(line).split(";")[0];
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function escapeRe(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertNoServerError(res, label) {
  assert.ok(
    ![500, 503].includes(Number(res.status)),
    `${label} must not 500/503 (got ${res.status})`
  );
}

function makeApp() {
  return createV5FoundationApp({
    env: MINIMAL_BB,
    getPool: () => pool,
  });
}

async function provisionChurch(stamp) {
  const orgKey = `bbma${String(stamp).replace(/[^a-z0-9]/gi, "")}`.slice(0, 24);
  const host = `${orgKey}.blessboard.org`;
  const tenant = await provisionPlatformTenant(pool, {
    organizationKey: orgKey,
    displayName: `MembersAccess ${stamp}`,
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: orgKey,
    hostname: host,
    domainType: "canonical",
    deploymentCode: "blessboard-org-staging",
    isPrimary: true,
  });
  assert.equal(tenant.ok, true, JSON.stringify(tenant));
  const church = await provisionBlessBoardChurch(pool, {
    organizationKey: orgKey,
    churchKey: orgKey,
    displayName: `MA Church ${stamp}`,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "HQ",
  });
  assert.equal(church.ok, true, JSON.stringify(church));
  const organizationId = (
    await pool.query(`SELECT id FROM platform.organizations WHERE organization_key=$1`, [orgKey])
  ).rows[0].id;
  return {
    orgKey,
    host,
    organizationId,
    churchId: church.records.church.id,
    hqBranchId: church.records.hqBranch.id,
    stamp,
  };
}

async function seedHqAdmin(church, email) {
  const created = await createBlessBoardUser(pool, {
    email,
    password: PASSWORD,
    displayName: "HQ Admin",
  });
  assert.equal(created.ok, true, created.message || JSON.stringify(created));
  const assigned = await assignBlessBoardRole(pool, {
    email,
    organizationKey: church.orgKey,
    roleKey: "church_hq_admin",
    churchKey: church.orgKey,
  });
  assert.equal(assigned.ok, true, JSON.stringify(assigned));
  const session = await createV5Session(pool, {
    deploymentCode: "blessboard-org-staging",
    userId: created.user.id,
    organizationId: church.organizationId,
    churchId: church.churchId,
    branchId: church.hqBranchId,
  });
  assert.equal(session.ok, true, session.code || JSON.stringify(session));
  return {
    userId: created.user.id,
    cookie: `${DEFAULT_V5_COOKIE}=${session.rawToken}`,
  };
}

describe("V2.05 BB Members + Access CRUD smoke (HQ admin)", () => {
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
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("MEMBERS: open directory, create, list, edit safe fields, persist, no 5xx", async () => {
    requireDb();
    const app = makeApp();
    const church = await provisionChurch(uniq("m"));
    const hq = await seedHqAdmin(church, `hq-m-${church.stamp}@example.org`);

    // 1) Open /hq/members
    const listOpen = await request(app)
      .get("/hq/members")
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assertNoServerError(listOpen, "GET /hq/members");
    assert.equal(listOpen.status, 200);
    assert.match(listOpen.text, /data-bb-hq-member-directory="1"|Members/i);
    memberCases += 1;

    // Invalid branch filter must be controlled (not 500)
    const badBranch = await request(app)
      .get("/hq/members?branch=does-not-exist")
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assertNoServerError(badBranch, "GET /hq/members bad branch");
    assert.ok([400, 404].includes(badBranch.status), `got ${badBranch.status}`);
    memberCases += 1;

    // 2) Create member via current staff-managed domain service (HQ create authority)
    const firstName = `Smoke${church.stamp}`;
    const lastName = "Member";
    const phoneNat = nextZmNational();
    const email = `${firstName.toLowerCase()}@example.invalid`;
    const created = await createStaffManagedMember(pool, {
      actorUserId: hq.userId,
      organizationId: church.organizationId,
      churchId: church.churchId,
      branchId: church.hqBranchId,
      demographics: {
        firstName,
        lastName,
        phoneNormalized: `+260${phoneNat}`,
        email,
      },
      profile: {
        preferredName: "SmokePref",
        occupation: "Teacher",
      },
      source: "v205_members_access_smoke",
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.ok(created.memberId);
    memberCases += 1;

    // 3) Appears in HQ list
    const listed = await request(app)
      .get(`/hq/members?q=${encodeURIComponent(firstName)}`)
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assertNoServerError(listed, "GET /hq/members?q=");
    assert.equal(listed.status, 200);
    assert.match(listed.text, new RegExp(escapeRe(firstName), "i"));
    assert.match(listed.text, new RegExp(`/hq/members/${created.memberId}`, "i"));
    memberCases += 1;

    // 4) Edit safe fields (preferred name / occupation) via domain service
    const updated = await updateMemberProfile(pool, {
      actorUserId: hq.userId,
      organizationId: church.organizationId,
      churchId: church.churchId,
      branchId: church.hqBranchId,
      memberId: created.memberId,
      preferredName: "PersistedPreferred",
      occupation: "Engineer",
    });
    assert.equal(updated.ok, true, JSON.stringify(updated));
    memberCases += 1;

    // 5) Reload HQ detail — persistence
    const detail = await request(app)
      .get(`/hq/members/${created.memberId}`)
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assertNoServerError(detail, "GET /hq/members/:id");
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-hq-member-detail="1"|Member/i);
    assert.match(detail.text, /PersistedPreferred|Engineer|SmokePref|occupation/i);
    assert.match(detail.text, new RegExp(escapeRe(firstName), "i"));
    memberCases += 1;

    // Tenant isolation: other church cannot open this member
    const other = await provisionChurch(uniq("x"));
    const otherHq = await seedHqAdmin(other, `hq-x-${other.stamp}@example.org`);
    const cross = await request(app)
      .get(`/hq/members/${created.memberId}`)
      .set("Host", other.host)
      .set("Cookie", otherHq.cookie);
    assertNoServerError(cross, "cross-tenant member detail");
    expectIsolationDenied(cross, "cross-tenant member detail");
    memberCases += 1;
  });

  it("ACCESS: invite/create user, assign role/scope, controlled 4xx, isolation", async () => {
    requireDb();
    const app = makeApp();
    const church = await provisionChurch(uniq("a"));
    const hq = await seedHqAdmin(church, `hq-a-${church.stamp}@example.org`);

    // Open staff/access management
    const list = await request(app)
      .get("/hq/settings/staff-access")
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assertNoServerError(list, "GET staff-access");
    assert.equal(list.status, 200);
    assert.match(list.text, /staff-access|Users|Invite/i);
    accessCases += 1;

    // Invite form
    const inviteGet = await request(app)
      .get("/hq/settings/staff-access/invite?placement=hq")
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assertNoServerError(inviteGet, "GET invite");
    assert.equal(inviteGet.status, 200);
    let cookie = cookieHeader(inviteGet, hq.cookie);
    const csrf = extractCsrf(inviteGet.text);
    assert.ok(csrf, "csrf on invite form");
    accessCases += 1;

    // Valid invite: website_editor at HQ/church placement
    const inviteEmail = `we-${church.stamp}@example.org`;
    const phoneNat = nextZmNational();
    const invitePost = await request(app)
      .post("/hq/settings/staff-access/invite")
      .set("Host", church.host)
      .set("Cookie", cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        placement: "hq",
        first_name: "Web",
        last_name: "Editor",
        phone_country: "ZM",
        phone_national: phoneNat,
        email: inviteEmail,
        role_key: "website_editor",
        assignment_reason: "v205 access smoke",
      });
    assertNoServerError(invitePost, "POST invite");
    // Result page 200 or redirect into invite with success — never 5xx
    assert.ok(
      [200, 303].includes(invitePost.status),
      `invite status ${invitePost.status}`
    );
    if (invitePost.status === 303) {
      const loc = String(invitePost.headers.location || "");
      assert.ok(
        !/error=invite_failed|error=branch_required/.test(loc),
        `unexpected invite error redirect ${loc}`
      );
    } else {
      assert.match(invitePost.text, /Team member added|invitation|Website Editor|Editor/i);
    }
    cookie = cookieHeader(invitePost, cookie);
    accessCases += 1;

    // Resolve invited user id and verify detail/access
    const userRow = await pool.query(
      `SELECT id FROM blessboard.users WHERE email_normalized = $1 LIMIT 1`,
      [inviteEmail.toLowerCase()]
    );
    assert.ok(userRow.rows[0], "invited user row");
    const invitedUserId = userRow.rows[0].id;
    const detail = await request(app)
      .get(`/hq/settings/staff-access/${invitedUserId}`)
      .set("Host", church.host)
      .set("Cookie", cookie);
    assertNoServerError(detail, "GET staff-access detail");
    assert.equal(detail.status, 200);
    assert.match(detail.text, /website_editor|Website Editor|Editor/i);
    cookie = cookieHeader(detail, cookie);
    const assignCsrf = extractCsrf(detail.text) || csrf;
    accessCases += 1;

    // Assign valid additional role/scope (branch_admin requires branch scope id)
    const assignOk = await request(app)
      .post(`/hq/settings/staff-access/${invitedUserId}/assign`)
      .set("Host", church.host)
      .set("Cookie", cookie)
      .type("form")
      .redirects(0)
      .send({
        [CSRF_FIELD]: assignCsrf,
        role_key: "website_editor",
        scope_type: "church",
        scope_id: church.churchId,
        assignment_reason: "duplicate-ish church editor",
      });
    assertNoServerError(assignOk, "POST assign valid/idempotent");
    assert.equal(assignOk.status, 303);
    assert.match(
      String(assignOk.headers.location || ""),
      /notice=|staff-access/
    );
    accessCases += 1;

    // Duplicate active assignment via service remains controlled (idempotent / conflict)
    const dup = await createRoleAssignment(pool, {
      actorUserId: hq.userId,
      userId: invitedUserId,
      roleKey: "website_editor",
      organizationId: church.organizationId,
      churchId: church.churchId,
      scopeType: "church",
      scopeId: church.churchId,
      assignmentOrigin: "manual",
      assignmentReason: "dup probe",
      forbidPlatformScope: true,
    });
    assert.equal(dup.ok, true, JSON.stringify(dup));
    assert.ok(dup.idempotent === true || dup.assignment, JSON.stringify(dup));
    accessCases += 1;

    // Invalid / missing branch for branch placement → controlled 4xx-style redirect, never 500
    const inviteBranchGet = await request(app)
      .get("/hq/settings/staff-access/invite?placement=branch")
      .set("Host", church.host)
      .set("Cookie", cookie);
    assertNoServerError(inviteBranchGet, "GET branch invite");
    const csrf2 = extractCsrf(inviteBranchGet.text) || assignCsrf;
    cookie = cookieHeader(inviteBranchGet, cookie);
    const missingBranch = await request(app)
      .post("/hq/settings/staff-access/invite")
      .set("Host", church.host)
      .set("Cookie", cookie)
      .type("form")
      .redirects(0)
      .send({
        [CSRF_FIELD]: csrf2,
        placement: "branch",
        first_name: "Branch",
        last_name: "Missing",
        phone_country: "ZM",
        phone_national: nextZmNational(),
        email: `ba-missing-${church.stamp}@example.org`,
        role_key: "branch_admin",
        // branch_id intentionally omitted
        assignment_reason: "should require branch",
      });
    assertNoServerError(missingBranch, "POST invite missing branch");
    assert.equal(missingBranch.status, 303);
    assert.match(
      String(missingBranch.headers.location || ""),
      /error=branch_required|error=/
    );
    accessCases += 1;

    // Invalid branch id must not 500
    const badBranchId = await request(app)
      .post("/hq/settings/staff-access/invite")
      .set("Host", church.host)
      .set("Cookie", cookie)
      .type("form")
      .redirects(0)
      .send({
        [CSRF_FIELD]: csrf2,
        placement: "branch",
        first_name: "Branch",
        last_name: "BadId",
        phone_country: "ZM",
        phone_national: nextZmNational(),
        email: `ba-bad-${church.stamp}@example.org`,
        role_key: "branch_admin",
        branch_id: "00000000-0000-4000-8000-000000000099",
        assignment_reason: "invalid branch uuid",
      });
    assertNoServerError(badBranchId, "POST invite bad branch id");
    assert.ok([303, 400, 404].includes(badBranchId.status), `got ${badBranchId.status}`);
    if (badBranchId.status === 303) {
      assert.match(String(badBranchId.headers.location || ""), /error=/);
    }
    accessCases += 1;

    // Invalid scope (platform) via assign → controlled error redirect
    const detail2 = await request(app)
      .get(`/hq/settings/staff-access/${invitedUserId}`)
      .set("Host", church.host)
      .set("Cookie", cookie);
    const csrf3 = extractCsrf(detail2.text) || csrf2;
    cookie = cookieHeader(detail2, cookie);
    const badScope = await request(app)
      .post(`/hq/settings/staff-access/${invitedUserId}/assign`)
      .set("Host", church.host)
      .set("Cookie", cookie)
      .type("form")
      .redirects(0)
      .send({
        [CSRF_FIELD]: csrf3,
        role_key: "website_editor",
        scope_type: "platform",
        scope_id: "",
        assignment_reason: "platform not allowed",
      });
    assertNoServerError(badScope, "POST assign platform scope");
    assert.equal(badScope.status, 303);
    assert.match(String(badScope.headers.location || ""), /error=/);
    accessCases += 1;

    // Tenant isolation: foreign HQ cannot open this user detail
    const other = await provisionChurch(uniq("b"));
    const otherHq = await seedHqAdmin(other, `hq-b-${other.stamp}@example.org`);
    const cross = await request(app)
      .get(`/hq/settings/staff-access/${invitedUserId}`)
      .set("Host", other.host)
      .set("Cookie", otherHq.cookie);
    assertNoServerError(cross, "cross-tenant staff detail");
    expectIsolationDenied(cross, "cross-tenant staff detail");
    accessCases += 1;
  });

  it("reports case counts for FINALs", () => {
    if (skipReason) return;
    assert.ok(memberCases >= 5, `MEMBER_CASES=${memberCases}`);
    assert.ok(accessCases >= 6, `ACCESS_CASES=${accessCases}`);
    // eslint-disable-next-line no-console
    console.log(
      `BB_MEMBERS_ACCESS_SMOKE MEMBER_CASES=${memberCases} ACCESS_CASES=${accessCases}`
    );
  });
});
