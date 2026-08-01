"use strict";

/**
 * Deployment-scoped V5 session unit tests.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { readV5Session } = require("../src/platform/session/readV5Session");
const { revokeV5Session } = require("../src/platform/session/revokeV5Session");
const {
  hashSessionToken,
  generateSessionToken,
  SESSION_TTL_MS,
} = require("../src/platform/session/sessionToken");
const {
  setV5SessionCookie,
  clearV5SessionCookie,
  DEFAULT_V5_COOKIE,
} = require("../src/platform/session/v5SessionCookie");

describe("platform v5 sessions", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let userId;

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      const user = await createBlessBoardUser(pool, {
        email: "session@example.org",
        displayName: "Session User",
        password: "session-password-ok",
      });
      userId = user.user.id;
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("creates hashed session scoped to deployment", async () => {
    requireDb();
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId,
      ip: "203.0.113.10",
      userAgent: "test-agent",
    });
    assert.equal(created.ok, true);
    assert.ok(created.rawToken);
    const row = await pool.query(
      `SELECT session_token_hash, ip_hash, user_agent_hash, deployment_code
         FROM platform.deployment_sessions WHERE id = $1`,
      [created.session.id]
    );
    assert.equal(row.rows[0].session_token_hash, hashSessionToken(created.rawToken));
    assert.notEqual(row.rows[0].ip_hash, "203.0.113.10");
    assert.equal(row.rows[0].deployment_code, "blessboard-org-staging");

    const ok = await readV5Session(pool, {
      rawToken: created.rawToken,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(ok.ok, true);

    const mismatch = await readV5Session(pool, {
      rawToken: created.rawToken,
      deploymentCode: "blessboard-com-production",
    });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, "deployment_mismatch");
  });

  it("rejects expired and revoked sessions", async () => {
    requireDb();
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId,
    });
    await pool.query(
      `UPDATE platform.deployment_sessions
          SET created_at = now() - interval '2 hours',
              last_seen_at = now() - interval '2 hours',
              expires_at = now() - interval '1 minute'
        WHERE id = $1`,
      [created.session.id]
    );
    const expired = await readV5Session(pool, {
      rawToken: created.rawToken,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(expired.code, "expired");

    const created2 = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId,
    });
    await revokeV5Session(pool, {
      rawToken: created2.rawToken,
      deploymentCode: "blessboard-org-staging",
    });
    const revoked = await readV5Session(pool, {
      rawToken: created2.rawToken,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(revoked.code, "revoked");
  });

  it("inactive deployment cannot create sessions", async () => {
    requireDb();
    await pool.query(
      `UPDATE platform.deployments SET status = 'inactive' WHERE deployment_code = 'blessboard-org-staging'`
    );
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId,
    });
    assert.equal(created.ok, false);
    assert.equal(created.code, "inactive_deployment");
    await pool.query(
      `UPDATE platform.deployments SET status = 'active' WHERE deployment_code = 'blessboard-org-staging'`
    );
  });

  it("session tokens have intended entropy and SHA-256 hex hashes", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    assert.notEqual(a.rawToken, b.rawToken);
    assert.equal(a.tokenHash, hashSessionToken(a.rawToken));
    assert.match(a.tokenHash, /^[a-f0-9]{64}$/);
    assert.notEqual(a.rawToken, a.tokenHash);
    // 32 bytes → base64url is typically 43 chars without padding
    assert.ok(a.rawToken.length >= 40, `expected ≥40 char token, got ${a.rawToken.length}`);
    assert.equal(SESSION_TTL_MS, 12 * 60 * 60 * 1000);
  });

  it("session cookie helpers are host-only with HttpOnly, SameSite=Lax, Path=/, Secure in production", () => {
    const cookies = [];
    const res = {
      cookie(name, value, opts) {
        cookies.push({ name, value, opts });
      },
      clearCookie(name, opts) {
        cookies.push({ name, value: null, opts, clear: true });
      },
    };

    setV5SessionCookie(res, "raw-token-value", {
      env: { NODE_ENV: "production", SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE },
    });
    assert.equal(cookies.length, 1);
    assert.equal(cookies[0].name, DEFAULT_V5_COOKIE);
    assert.equal(cookies[0].opts.httpOnly, true);
    assert.equal(cookies[0].opts.secure, true);
    assert.equal(cookies[0].opts.sameSite, "lax");
    assert.equal(cookies[0].opts.path, "/");
    assert.equal(cookies[0].opts.maxAge, SESSION_TTL_MS);
    assert.equal(Object.prototype.hasOwnProperty.call(cookies[0].opts, "domain"), false);

    cookies.length = 0;
    setV5SessionCookie(res, "raw-token-value", {
      env: { NODE_ENV: "test", SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE },
    });
    assert.equal(cookies[0].opts.secure, false);
    assert.equal(Object.prototype.hasOwnProperty.call(cookies[0].opts, "domain"), false);

    cookies.length = 0;
    clearV5SessionCookie(res, {
      env: { NODE_ENV: "production", SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE },
    });
    assert.equal(cookies[0].clear, true);
    assert.equal(cookies[0].opts.httpOnly, true);
    assert.equal(cookies[0].opts.secure, true);
    assert.equal(cookies[0].opts.sameSite, "lax");
    assert.equal(cookies[0].opts.path, "/");
    assert.equal(Object.prototype.hasOwnProperty.call(cookies[0].opts, "domain"), false);
  });
});
