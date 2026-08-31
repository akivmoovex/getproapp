"use strict";

/**
 * BB PLATFORM 01 — registration wording, success URL, slug collisions, phone login.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const request = require("supertest");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  withOrganizationKeySuffix,
  slugifyOrganizationKey,
} = require("../src/blessboard/services/organizationKey");
const {
  allocateUniqueOrganizationKey,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const { authenticateBlessBoardUser } = require("../src/blessboard/services/authenticateBlessBoardUser");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const APEX = "blessboard.org";
const DEPLOYMENT = "blessboard-org-staging";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
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

function extractCsrfToken(html) {
  const m = String(html || "").match(
    new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`)
  );
  return (m && (m[1] || m[2])) || null;
}

describe("blessboard platform 01 — organization key suffixes", () => {
  it("allocates hyphenated -02, -03 collision suffixes", () => {
    assert.equal(withOrganizationKeySuffix("grace-church", 1), "grace-church");
    assert.equal(withOrganizationKeySuffix("grace-church", 2), "grace-church-02");
    assert.equal(withOrganizationKeySuffix("grace-church", 3), "grace-church-03");
    assert.equal(withOrganizationKeySuffix("grace-church", 10), "grace-church-10");
    assert.equal(slugifyOrganizationKey("  Grace   Church!! "), "grace-church");
    assert.equal(slugifyOrganizationKey("St. Peter's"), "st-peter-s");
  });
});

describe("blessboard platform 01 — registration + success", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";

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
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  function makeApp() {
    return createV5FoundationApp({
      env: {
        NODE_ENV: "test",
        DEPLOYMENT_ENV: "testing",
        PLATFORM_DEPLOYMENT_CODE: DEPLOYMENT,
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
        BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
        BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
      },
      getPool: () => pool,
    });
  }

  async function registerChurch(overrides = {}) {
    const app = makeApp();
    const getRes = await request(app).get("/register-church?plan=foundation").set("Host", APEX);
    const csrf = extractCsrfToken(getRes.text);
    const csrfCookie = extractCookie(getRes, CSRF_COOKIE);
    const stamp = uniq("bbp01");
    const phoneTail = String(970000000 + Math.floor(Math.random() * 9000000)).slice(0, 9);
    const body = {
      church_name: overrides.church_name || `Grace Church ${stamp}`,
      country: "ZM",
      city: "Lusaka",
      contact_name: "Pastor Test",
      role_in_church: "Pastor",
      phone_country: "ZM",
      phone_national: overrides.phone_national || phoneTail,
      email: overrides.email || `${stamp}@example.org`,
      selected_plan: "foundation",
      password: PASSWORD,
      password_confirm: PASSWORD,
      branch_name: "HQ Campus",
      consent_contact: "on",
      [CSRF_FIELD]: csrf,
      ...overrides,
    };
    const post = await request(app)
      .post("/register-church")
      .set("Host", APEX)
      .set("Cookie", `${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send(body);
    return { app, body, post, phoneE164: null };
  }

  it("register form uses V1 website setup copy", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app).get("/register-church?plan=foundation").set("Host", APEX);
    assert.equal(res.status, 200);
    assert.match(res.text, /Website setup/);
    assert.match(res.text, /free DIY mini-website/i);
    assert.match(res.text, /Your church website/);
    assert.match(res.text, /Created as a draft/i);
    assert.match(res.text, /will not be public until you publish/i);
    assert.doesNotMatch(res.text, /preview only/i);
    assert.match(res.text, /Foundation workspaces activate immediately and include the free church mini-website/i);
  });

  it("success screen resolves canonical church URL from stored ref", async () => {
    requireDb();
    const { app, body, post } = await registerChurch({ church_name: "Grace Community Church" });
    assert.equal(post.status, 303, post.text && String(post.text).slice(0, 400));
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    const success = await request(app)
      .get(post.headers.location)
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`);
    assert.equal(success.status, 200);
    assert.match(success.text, /Your church website/);
    assert.match(success.text, /Draft — not published yet/);
    assert.match(success.text, /Build your website/);
    assert.match(success.text, /data-bb-copy-website-url="1"/);
    assert.match(success.text, /\/c\/grace-community-church/);

    const refMatch = String(post.headers.location || "").match(/ref=([^&]+)/);
    assert.ok(refMatch, "success redirect must include ref");
    const ref = decodeURIComponent(refMatch[1]);
    const stored = await pool.query(
      `SELECT public_registration_reference, organization_id
         FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [body.email]
    );
    assert.equal(stored.rows[0].public_registration_reference, ref);
    const org = await pool.query(
      `SELECT organization_key FROM platform.organizations WHERE id = $1`,
      [stored.rows[0].organization_id]
    );
    assert.equal(org.rows[0].organization_key, "grace-community-church");
    assert.match(success.text, new RegExp(`/c/${org.rows[0].organization_key}`));
  });

  it("manipulated ref does not leak another tenant URL without matching session", async () => {
    requireDb();
    const a = await registerChurch({ church_name: "Alpha Chapel" });
    const b = await registerChurch({ church_name: "Beta Chapel" });
    const refB = String(b.post.headers.location || "").match(/ref=([^&]+)/)[1];
    const sidA = extractCookie(a.post, DEFAULT_V5_COOKIE);
    const leaked = await request(a.app)
      .get(`/register-church/success?ref=${encodeURIComponent(refB)}&ready=1`)
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sidA}`);
    assert.equal(leaked.status, 200);
    assert.doesNotMatch(leaked.text, /\/c\/beta-chapel/);
    assert.doesNotMatch(leaked.text, /data-bb-registration-website-url/);
  });

  it("collision-safe slug allocation uses -02 then -03", async () => {
    requireDb();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const first = await allocateUniqueOrganizationKey(client, {
        churchName: "Grace Church",
        exactPreferred: false,
      });
      await client.query(
        `INSERT INTO platform.organizations (id, organization_key, display_name, status, data_environment)
         VALUES (gen_random_uuid(), $1, 'Taken', 'active', 'testing')`,
        [first]
      );
      const second = await allocateUniqueOrganizationKey(client, {
        churchName: "Grace Church",
        exactPreferred: false,
      });
      await client.query(
        `INSERT INTO platform.organizations (id, organization_key, display_name, status, data_environment)
         VALUES (gen_random_uuid(), $1, 'Taken 2', 'active', 'testing')`,
        [second]
      );
      const third = await allocateUniqueOrganizationKey(client, {
        churchName: "Grace Church",
        exactPreferred: false,
      });
      await client.query("ROLLBACK");
      assert.equal(first, "grace-church");
      assert.equal(second, "grace-church-02");
      assert.equal(third, "grace-church-03");
    } finally {
      client.release();
    }
  });

  it("new administrator can log in by email and normalized phone", async () => {
    requireDb();
    const { body } = await registerChurch();
    const emailAuth = await authenticateBlessBoardUser(pool, {
      identifier: body.email,
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(emailAuth.ok, true, emailAuth.message);

    const storedPhone = await pool.query(
      `SELECT contact_phone_normalized FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [body.email]
    );
    const normalized = storedPhone.rows[0].contact_phone_normalized;
    assert.ok(normalized, "registration should store normalized phone");

    const phoneAuth = await authenticateBlessBoardUser(pool, {
      identifier: normalized,
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(phoneAuth.ok, true, phoneAuth.message);

    const localPhoneAuth = await authenticateBlessBoardUser(pool, {
      identifier: normalized.replace("+260", "0"),
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
      country: "ZM",
    });
    assert.equal(localPhoneAuth.ok, true, localPhoneAuth.message);

    const user = await pool.query(
      `SELECT phone_normalized FROM blessboard.users WHERE lower(email_normalized) = lower($1)`,
      [body.email]
    );
    assert.equal(user.rows[0].phone_normalized, normalized);
  });
});
