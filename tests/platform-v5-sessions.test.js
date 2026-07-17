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
const { hashSessionToken } = require("../src/platform/session/sessionToken");

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
      deploymentCode: "blessboard-org-v5",
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
    assert.equal(row.rows[0].deployment_code, "blessboard-org-v5");

    const ok = await readV5Session(pool, {
      rawToken: created.rawToken,
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(ok.ok, true);

    const mismatch = await readV5Session(pool, {
      rawToken: created.rawToken,
      deploymentCode: "blessboard-com-v4",
    });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, "deployment_mismatch");
  });

  it("rejects expired and revoked sessions", async () => {
    requireDb();
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-v5",
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
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(expired.code, "expired");

    const created2 = await createV5Session(pool, {
      deploymentCode: "blessboard-org-v5",
      userId,
    });
    await revokeV5Session(pool, {
      rawToken: created2.rawToken,
      deploymentCode: "blessboard-org-v5",
    });
    const revoked = await readV5Session(pool, {
      rawToken: created2.rawToken,
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(revoked.code, "revoked");
  });

  it("inactive deployment cannot create sessions", async () => {
    requireDb();
    await pool.query(
      `UPDATE platform.deployments SET status = 'inactive' WHERE deployment_code = 'blessboard-org-v5'`
    );
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-v5",
      userId,
    });
    assert.equal(created.ok, false);
    assert.equal(created.code, "inactive_deployment");
    await pool.query(
      `UPDATE platform.deployments SET status = 'active' WHERE deployment_code = 'blessboard-org-v5'`
    );
  });
});
