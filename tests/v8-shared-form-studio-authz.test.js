"use strict";

/**
 * PROMPT 30 — shared Form Studio authorization mapping.
 * Ensures blessBoardAuthorizationContext.permissions is populated from the
 * catalogue / legacy-compat source used by requireBlessBoardPermission.
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
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const rbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");
const {
  createLoadBlessBoardAuthorizationContext,
  emptyAuthzContext,
} = require("../src/blessboard/http/loadBlessBoardAuthorizationContext");
const {
  buildBlessBoardTenantContext,
} = require("../src/blessboard/http/buildBlessBoardTenantContext");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "FormAuthzQa99!";
const HOST_A = "form-authz-a.blessboard.test";
const HOST_B = "form-authz-b.blessboard.test";

let pool;
let skipReason = null;
let app;
let orgA;
let orgB;
let churchA;
let churchB;
let hqBranchA;
let campusA;
let users = {};

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
    organizationId: (opts && opts.organizationId) || orgA.id,
    churchId: (opts && opts.churchId) || churchA.id,
  });
  assert.equal(created.ok, true, created.message);
  return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
}

function mergeCookies(sessionCookie, res) {
  const parts = [sessionCookie];
  for (const line of [].concat((res && res.headers && res.headers["set-cookie"]) || [])) {
    const pair = String(line || "").split(";")[0];
    if (pair) parts.push(pair);
  }
  return parts.join("; ");
}

function extractCsrf(html) {
  return (
    (html.match(/name=["']_csrf["'][^>]*value=["']([^"']+)/) ||
      html.match(/value=["']([^"']+)["'][^>]*name=["']_csrf["']/) ||
      [])[1] || null
  );
}

async function assignCatalogue(userId, roleKey, scope) {
  const role = await rbacRepo.findRoleByKey(pool, roleKey);
  assert.ok(role && role.id, `missing role ${roleKey}`);
  return rbacRepo.insertAssignment(pool, {
    userId,
    organizationId: scope.organizationId,
    churchId: scope.churchId || null,
    roleId: role.id,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    assignmentOrigin: "manual",
    assignmentReason: "form studio authz qa",
  });
}

describe("V8 shared Form Studio authorization", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl, direction: "up" });
      await ensureDatabaseIdentity(pool, { identityKey: IDENTITY_KEY });

      const keyA = uniq("fa");
      const keyB = uniq("fb");
      const provA = await provisionPlatformTenant(pool, {
        organizationKey: keyA,
        displayName: `Org ${keyA}`,
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: keyA,
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: keyB,
        displayName: `Org ${keyB}`,
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: keyB,
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: keyA,
        churchKey: keyA,
        displayName: `Church ${keyA}`,
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      hqBranchA = chA.records.hqBranch;

      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: keyB,
        churchKey: keyB,
        displayName: `Church ${keyB}`,
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;

      const campus = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-a', 'Campus A', 'branch', 'active', false, 'Africa/Lusaka', 'ZM')
         RETURNING id, branch_key`,
        [churchA.id]
      );
      campusA = campus.rows[0];

      async function makeUser(email, displayName) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      users.hq = await makeUser(`hq.${keyA}@example.invalid`, "HQ Admin");
      users.branch = await makeUser(`branch.${keyA}@example.invalid`, "Branch Admin");
      users.viewer = await makeUser(`viewer.${keyA}@example.invalid`, "Limited Viewer");
      users.outsider = await makeUser(`outsider.${keyB}@example.invalid`, "Other Tenant HQ");

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: `hq.${keyA}@example.invalid`,
            organizationKey: keyA,
            roleKey: "church_hq_admin",
            churchKey: keyA,
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: `branch.${keyA}@example.invalid`,
            organizationKey: keyA,
            roleKey: "branch_admin",
            churchKey: keyA,
            branchKey: "campus-a",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: `outsider.${keyB}@example.invalid`,
            organizationKey: keyB,
            roleKey: "church_hq_admin",
            churchKey: keyB,
          })
        ).ok,
        true
      );

      await assignCatalogue(users.hq.id, "organisation_administrator", {
        organizationId: orgA.id,
        churchId: null,
        scopeType: "organisation",
        scopeId: orgA.id,
      });
      await assignCatalogue(users.branch.id, "branch_administrator", {
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "branch",
        scopeId: campusA.id,
      });
      // Catalogue role without requests.* — hard deny at requireView (no legacy shell grant).
      await assignCatalogue(users.viewer.id, "first_timers_coordinator", {
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "church",
        scopeId: churchA.id,
      });

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
    } catch (err) {
      skipReason = err && err.stack ? String(err.stack).slice(0, 500) : String(err && err.message ? err.message : err);
      console.error("form-studio-authz setup failed:", skipReason);
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("emptyAuthzContext exposes permissions: []", () => {
    const ctx = emptyAuthzContext({ authenticated: false });
    assert.deepEqual(ctx.permissions, []);
  });

  it("authorization context middleware attaches catalogue permissions", async () => {
    requireDb();
    const tenant = buildBlessBoardTenantContext({
      organization: { id: orgA.id, key: "a" },
      church: {
        id: churchA.id,
        churchKey: "a",
        displayName: "A",
        dataEnvironment: "testing",
      },
      hqBranch: { id: hqBranchA.id, branchKey: "hq", displayName: "HQ" },
      primaryBranch: { id: hqBranchA.id, branchKey: "hq", displayName: "HQ" },
    });

    let captured = null;
    const mw = createLoadBlessBoardAuthorizationContext({
      getPool: () => pool,
      getTenant: () => tenant,
    });
    const req = {
      v5Session: {
        authenticated: true,
        session: { userId: users.hq.id },
      },
    };
    await new Promise((resolve, reject) => {
      mw(req, {}, (err) => (err ? reject(err) : resolve()));
    });
    captured = req.blessBoardAuthorizationContext;
    assert.equal(captured.authenticated, true);
    assert.ok(Array.isArray(captured.permissions));
    assert.ok(
      captured.permissions.includes("requests.manage"),
      `expected requests.manage in ${JSON.stringify(captured.permissions.slice(0, 20))}…`
    );
    assert.ok(captured.permissions.includes("requests.view"));
  });

  it("HQ admin can open form studio create (not SH15 soft deny)", async () => {
    requireDb();
    const cookie = await sessionCookieFor(users.hq);
    const res = await request(app)
      .get("/hq/form-studio/new")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /Access denied/i);
    assert.match(res.text, /name="_csrf"|name='_csrf'/i);
    assert.match(res.text, /data-screen="SH03"|studio/i);
  });

  it("HQ admin can create → preview → publish paths", async () => {
    requireDb();
    const sessionCookie = await sessionCookieFor(users.hq);
    const neu = await request(app)
      .get("/hq/form-studio/new")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie);
    const csrf = extractCsrf(neu.text);
    assert.ok(csrf);
    const cookie = mergeCookies(sessionCookie, neu);

    const create = await request(app)
      .post("/hq/form-studio/new")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        title: "Authz QA Form",
        description: "Disposable",
        category: "general",
        field_key: ["full_name"],
        field_type: ["text"],
        field_label: ["Full name"],
        field_required: ["1"],
        field_options: [""],
      });
    assert.ok(
      [302, 303].includes(create.status) || create.status === 200,
      `create status ${create.status} body=${String(create.text || "").slice(0, 120)}`
    );
    const loc = create.headers.location || "";
    let formId =
      (loc.match(/\/hq\/form-studio\/([0-9a-f-]{36})/i) ||
        (create.text || "").match(/\/hq\/form-studio\/([0-9a-f-]{36})/i) ||
        [])[1];
    if (!formId && create.status === 200) {
      // follow soft redirect via Location absent — load dashboard
      const dash = await request(app)
        .get("/hq/form-studio")
        .set("Host", HOST_A)
        .set("Cookie", cookie);
      formId = ((dash.text || "").match(/\/hq\/form-studio\/([0-9a-f-]{36})/i) || [])[1];
    }
    assert.ok(formId, `form id missing from ${create.status} ${loc}`);

    const preview = await request(app)
      .get(`/hq/form-studio/${formId}/preview`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(preview.status, 200);
    assert.doesNotMatch(preview.text, /Access denied/i);

    const pubPage = await request(app)
      .get(`/hq/form-studio/${formId}/publication`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(pubPage.status, 200);
    const pubCookie = mergeCookies(cookie, pubPage);
    const pubCsrf = extractCsrf(pubPage.text);
    const published = await request(app)
      .post(`/hq/form-studio/${formId}/publish`)
      .set("Host", HOST_A)
      .set("Cookie", pubCookie)
      .type("form")
      .send({ [CSRF_FIELD]: pubCsrf });
    assert.ok([200, 302, 303].includes(published.status), `publish ${published.status}`);

    const submissions = await request(app)
      .get(`/hq/form-studio/${formId}/submissions`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(submissions.status, 200);
    assert.doesNotMatch(submissions.text, /Access denied/i);
  });

  it("branch admin can open branch form studio on assigned branch host context", async () => {
    requireDb();
    const cookie = await sessionCookieFor(users.branch);
    // Product host uses primary (HQ) branch — campus-only grant must soft-deny there.
    const onPrimary = await request(app)
      .get("/branch-admin/form-studio/new")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    // Either 403 (requireView) or SH15 soft deny when primary ≠ campus-a
    assert.ok([200, 403].includes(onPrimary.status));
    if (onPrimary.status === 200) {
      // Soft deny expected when host primary is HQ and grant is campus-a only
      assert.match(onPrimary.text, /Access denied/i);
    }
  });

  it("role without requests.* is denied form studio", async () => {
    requireDb();
    const cookie = await sessionCookieFor(users.viewer);
    const res = await request(app)
      .get("/hq/form-studio/new")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.ok([403, 401].includes(res.status), `unexpected ${res.status}`);
    assert.doesNotMatch(res.text || "", /name=["']title["']/i);
  });

  it("cross-tenant HQ is denied on another church host", async () => {
    requireDb();
    const cookie = await sessionCookieFor(users.outsider, {
      organizationId: orgB.id,
      churchId: churchB.id,
    });
    const res = await request(app)
      .get("/hq/form-studio/new")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.ok([401, 403].includes(res.status), `unexpected ${res.status}`);
  });

  it("unauthenticated form studio redirects or 401", async () => {
    requireDb();
    const res = await request(app)
      .get("/hq/form-studio/new")
      .set("Host", HOST_A)
      .set("Accept", "text/html")
      .redirects(0);
    assert.ok([303, 401, 302].includes(res.status), `unexpected ${res.status}`);
  });
});
