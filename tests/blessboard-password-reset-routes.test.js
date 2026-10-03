"use strict";

/**
 * Focused BlessBoard password-recovery route tests:
 * forgot-password email adapter contract + reset-password GET/POST
 * (query and path token forms) without requiring outbound email for reset.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
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
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  requestPasswordReset,
  NEUTRAL_MESSAGE,
  DELIVERY_CODE,
} = require("../src/blessboard/services/passwordResetService");
const {
  createUnavailablePasswordResetEmailAdapter,
} = require("../src/blessboard/services/passwordResetEmailDelivery");
const tokenRepo = require("../src/blessboard/repositories/userActionTokenRepository");
const { hashSessionToken } = require("../src/platform/session/sessionToken");
const { baseV5TestEnv } = require("./helpers/blessboardV5Fixtures");

const IDENTITY_KEY = "blessboard-platform-v5";
const DEPLOYMENT_CODE = "blessboard-org-staging";
const APEX_HOST = "blessboard.org";
const APEX_ORIGIN = "https://blessboard.org";
const PASSWORD = "TestPassword99!";
const NEW_PASSWORD = "ReplacementPass99!";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function createCaptureAdapter() {
  const sent = [];
  return {
    adapter: Object.freeze({
      id: "test_capture",
      sendingAvailable: true,
      async send(envelope) {
        sent.push(envelope);
        return {
          accepted_for_processing: true,
          sendingAvailable: true,
          delivered: true,
          code: "sent",
        };
      },
    }),
    sent,
  };
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

describe("blessboard password reset routes", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let org;
  let church;

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

      const orgKey = uniq("pwreset");
      const tenant = await provisionPlatformTenant(pool, {
        organizationKey: orgKey,
        displayName: `PW Reset Org ${orgKey}`,
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: orgKey,
        hostname: `${orgKey}.${APEX_HOST}`,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT_CODE,
        isPrimary: true,
      });
      assert.equal(tenant.ok, true, tenant.message || tenant.code);

      const churchResult = await provisionBlessBoardChurch(pool, {
        organizationKey: orgKey,
        churchKey: orgKey,
        displayName: `PW Reset Church ${orgKey}`,
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });
      assert.equal(churchResult.ok, true, churchResult.message || churchResult.code);

      org = {
        id: tenant.records.organization.id,
        organization_key: orgKey,
      };
      church = { id: churchResult.records.church.id };

      app = createV5FoundationApp({
        getPool: () => pool,
        enableDiagnosticHostContext: false,
        env: baseV5TestEnv({
          PLATFORM_DEPLOYMENT_CODE: DEPLOYMENT_CODE,
          DEPLOYMENT_ENV: "testing",
          BLESSBOARD_APEX_ORIGIN: APEX_ORIGIN,
          SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
        }),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => null);
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("forgot-password delivery uses email adapter; HTTP remains enumeration-safe without it", async () => {
    requireDb();
    const user = await createBlessBoardUser(pool, {
      email: `${uniq("fp")}@example.com`,
      displayName: "Forgot Transport User",
      password: PASSWORD,
    });
    assert.equal(user.ok, true);

    const withoutAdapter = await requestPasswordReset(pool, {
      email: user.user.email,
      requestIp: "203.0.113.50",
      env: { BLESSBOARD_APEX_ORIGIN: APEX_ORIGIN },
      churchId: church.id,
      organizationId: org.id,
    });
    assert.equal(withoutAdapter.ok, true);
    assert.equal(withoutAdapter.message, NEUTRAL_MESSAGE);
    assert.equal(withoutAdapter.sent, false);
    assert.equal(withoutAdapter.deliveryCode, DELIVERY_CODE.EMAIL_SENDING_UNAVAILABLE);

    const unavailable = await requestPasswordReset(
      pool,
      {
        email: user.user.email,
        requestIp: "203.0.113.51",
        env: { BLESSBOARD_APEX_ORIGIN: APEX_ORIGIN },
        churchId: church.id,
        organizationId: org.id,
      },
      { emailAdapter: createUnavailablePasswordResetEmailAdapter() }
    );
    assert.equal(unavailable.ok, true);
    assert.equal(unavailable.sent, false);
    assert.equal(unavailable.deliveryCode, DELIVERY_CODE.EMAIL_SENDING_UNAVAILABLE);

    const capture = createCaptureAdapter();
    const withAdapter = await requestPasswordReset(
      pool,
      {
        email: user.user.email,
        requestIp: "203.0.113.52",
        env: { BLESSBOARD_APEX_ORIGIN: APEX_ORIGIN },
        churchId: church.id,
        organizationId: org.id,
      },
      { emailAdapter: capture.adapter }
    );
    assert.equal(withAdapter.ok, true);
    assert.equal(withAdapter.sent, true);
    assert.equal(capture.sent.length, 1);
    assert.match(capture.sent[0].text, /\/reset-password\?token=/);

    const page = await request(app).get("/forgot-password").set("Host", APEX_HOST);
    assert.equal(page.status, 200);
    const csrf = extractCsrfToken(page.text);
    const csrfCookie = extractCookie(page, CSRF_COOKIE);
    const posted = await request(app)
      .post("/forgot-password")
      .set("Host", APEX_HOST)
      .set("Cookie", `${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, email: user.user.email });
    assert.equal(posted.status, 200);
    assert.match(posted.text, /If an eligible account exists/);
  });

  it("valid reset token GET/POST via path form does not require email transport", async () => {
    requireDb();
    const user = await createBlessBoardUser(pool, {
      email: `${uniq("path")}@example.com`,
      displayName: "Path Reset User",
      password: PASSWORD,
    });
    assert.equal(user.ok, true);

    const capture = createCaptureAdapter();
    const requested = await requestPasswordReset(
      pool,
      {
        email: user.user.email,
        requestIp: "203.0.113.60",
        env: { BLESSBOARD_APEX_ORIGIN: APEX_ORIGIN },
        churchId: church.id,
        organizationId: org.id,
      },
      { emailAdapter: capture.adapter }
    );
    assert.equal(requested.ok, true);
    assert.equal(requested.sent, true);
    const resetUrl = capture.sent[0].text.match(/\/reset-password\?token=([^\s]+)/);
    assert.ok(resetUrl);
    const rawToken = resetUrl[1];

    const getPath = await request(app)
      .get(`/reset-password/${encodeURIComponent(rawToken)}`)
      .set("Host", APEX_HOST);
    assert.equal(getPath.status, 200);
    assert.doesNotMatch(getPath.text, /not yet available in BlessBoard V5/i);
    assert.match(getPath.text, /data-bb-page="reset-password"/);
    assert.match(getPath.text, /name="password"/);

    const getQuery = await request(app)
      .get(`/reset-password?token=${encodeURIComponent(rawToken)}`)
      .set("Host", APEX_HOST);
    assert.equal(getQuery.status, 200);
    assert.match(getQuery.text, /name="password"/);

    const csrf = extractCsrfToken(getPath.text);
    const csrfCookie = extractCookie(getPath, CSRF_COOKIE);
    assert.ok(csrf && csrfCookie);

    const postPath = await request(app)
      .post(`/reset-password/${encodeURIComponent(rawToken)}`)
      .set("Host", APEX_HOST)
      .set("Cookie", `${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        token: rawToken,
        password: NEW_PASSWORD,
        password_confirm: NEW_PASSWORD,
      });
    assert.equal(postPath.status, 303);
    assert.equal(postPath.headers.location, "/login?reset=1");

    const loginCheck = await bcrypt.compare(
      NEW_PASSWORD,
      (
        await pool.query(`SELECT password_hash FROM blessboard.users WHERE id = $1`, [
          user.user.id,
        ])
      ).rows[0].password_hash
    );
    assert.equal(loginCheck, true);
  });

  it("invalid and expired reset tokens return 400 (not V5 503 stub)", async () => {
    requireDb();
    const junkPath = await request(app)
      .get("/reset-password/not-a-real-token-value-xxxxxx")
      .set("Host", APEX_HOST);
    assert.equal(junkPath.status, 400);
    assert.doesNotMatch(junkPath.text, /not yet available in BlessBoard V5/i);
    assert.match(junkPath.text, /invalid or no longer available/i);

    const junkQuery = await request(app)
      .get("/reset-password?token=not-a-real-token-value-xxxxxx")
      .set("Host", APEX_HOST);
    assert.equal(junkQuery.status, 400);
    assert.match(junkQuery.text, /invalid or no longer available/i);

    const user = await createBlessBoardUser(pool, {
      email: `${uniq("exp")}@example.com`,
      displayName: "Expired Reset User",
      password: PASSWORD,
    });
    assert.equal(user.ok, true);
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const inserted = await tokenRepo.insertActionToken(pool, {
      userId: String(user.user.id),
      purpose: "password_reset",
      tokenHash: hashSessionToken(rawToken),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      organizationId: org.id,
      churchId: church.id,
      metadataJson: { source: "test_expired" },
    });
    await pool.query(
      `UPDATE blessboard.user_action_tokens
          SET created_at = now() - interval '2 minutes',
              expires_at = now() - interval '1 minute'
        WHERE id = $1`,
      [inserted.id]
    );

    const expiredGet = await request(app)
      .get(`/reset-password/${encodeURIComponent(rawToken)}`)
      .set("Host", APEX_HOST);
    assert.equal(expiredGet.status, 400);
    assert.doesNotMatch(expiredGet.text, /not yet available in BlessBoard V5/i);

    const csrfPage = await request(app).get("/forgot-password").set("Host", APEX_HOST);
    const csrf = extractCsrfToken(csrfPage.text);
    const csrfCookie = extractCookie(csrfPage, CSRF_COOKIE);
    const expiredPost = await request(app)
      .post(`/reset-password/${encodeURIComponent(rawToken)}`)
      .set("Host", APEX_HOST)
      .set("Cookie", `${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        token: rawToken,
        password: NEW_PASSWORD,
        password_confirm: NEW_PASSWORD,
      });
    assert.equal(expiredPost.status, 400);
    assert.match(expiredPost.text, /expired|no longer available|Request a new link/i);
  });
});
