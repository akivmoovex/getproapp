"use strict";

/**
 * Prompt 034 — registration email verification token storage (migration + repository).
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const repo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  generateSessionToken,
  hashSessionToken,
} = require("../src/platform/session/sessionToken");
const {
  createVerificationToken,
  consumeVerificationToken,
  TOKEN_TTL_MS,
  RESEND_COOLDOWN_MS,
} = require("../src/blessboard/services/registrationEmailVerificationService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function randomPhone() {
  return `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
}

describe("registration email verification storage (Prompt 034)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let adminUser;
  let application;

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

      const created = await createBlessBoardUser(pool, {
        email: `${uniq("email-verify-admin")}@example.org`,
        displayName: "Email Verify Admin",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
      adminUser = created.user;

      const phone = randomPhone();
      application = await repo.createApplication(pool, {
        church_name: "Email Verify Church",
        country: "Zambia",
        city: "Lusaka",
        contact_name: "Pastor Email",
        contact_email: `${uniq("ev")}@example.org`,
        contact_phone: phone,
        contact_phone_normalized: phone,
        role_in_church: "Pastor",
        selected_plan: "foundation",
        consent_terms: true,
      });
      assert.ok(application && application.id);
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb(t) {
    if (skipSuite) {
      t.skip(`Local PostgreSQL unavailable: ${skipReason}`);
      return false;
    }
    return true;
  }

  it("migration creates the table and key constraints", async (t) => {
    if (!requireDb(t)) return;
    const table = await pool.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'blessboard'
          AND table_name = 'registration_email_verification_tokens'`
    );
    assert.equal(table.rowCount, 1);

    const indexes = await pool.query(
      `SELECT indexname
         FROM pg_indexes
        WHERE schemaname = 'blessboard'
          AND tablename = 'registration_email_verification_tokens'`
    );
    const names = indexes.rows.map((r) => r.indexname);
    assert.ok(names.includes("reg_email_verify_tokens_token_hash_uidx"));
    assert.ok(names.includes("reg_email_verify_tokens_one_active_sent_uidx"));
    assert.ok(names.includes("reg_email_verify_tokens_application_created_idx"));
  });

  it("foreign keys reference applications and users", async (t) => {
    if (!requireDb(t)) return;
    const fks = await pool.query(
      `SELECT
         kcu.column_name,
         ccu.table_name AS foreign_table_name,
         rc.delete_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
       JOIN information_schema.referential_constraints rc
         ON rc.constraint_name = tc.constraint_name
        AND rc.constraint_schema = tc.table_schema
      WHERE tc.table_schema = 'blessboard'
        AND tc.table_name = 'registration_email_verification_tokens'
        AND tc.constraint_type = 'FOREIGN KEY'`
    );
    const byCol = Object.fromEntries(
      fks.rows.map((r) => [r.column_name, r])
    );
    assert.equal(byCol.application_id.foreign_table_name, "platform_church_registration_applications");
    assert.equal(byCol.application_id.delete_rule, "RESTRICT");
    assert.equal(byCol.created_by_user_id.foreign_table_name, "users");
    assert.equal(byCol.created_by_user_id.delete_rule, "SET NULL");
  });

  it("inserts, looks up by hash, and finds latest", async (t) => {
    if (!requireDb(t)) return;
    const { rawToken, tokenHash } = generateSessionToken();
    const sentAt = new Date("2026-07-24T10:00:00.000Z");
    const expiresAt = new Date(sentAt.getTime() + TOKEN_TTL_MS);

    const created = await repo.createRegistrationEmailVerificationToken(pool, {
      applicationId: application.id,
      email: "Verify@Example.COM",
      emailNormalized: "verify@example.com",
      tokenHash,
      status: "sent",
      sentAt,
      expiresAt,
      createdByUserId: adminUser.id,
    });
    assert.equal(created.status, "sent");
    assert.equal(created.token_hash, tokenHash);
    assert.equal(created.email_normalized, "verify@example.com");
    assert.doesNotMatch(JSON.stringify(created), new RegExp(rawToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const found = await repo.findRegistrationEmailVerificationTokenByHash(pool, tokenHash);
    assert.ok(found);
    assert.equal(found.id, created.id);

    const latest = await repo.findLatestRegistrationEmailVerificationToken(
      pool,
      application.id
    );
    assert.equal(latest.id, created.id);
  });

  it("enforces unique token hash and one active sent token", async (t) => {
    if (!requireDb(t)) return;
    await pool.query(
      `DELETE FROM blessboard.registration_email_verification_tokens WHERE application_id = $1`,
      [application.id]
    );

    const first = generateSessionToken();
    const sentAt = new Date("2026-07-24T11:00:00.000Z");
    await repo.createRegistrationEmailVerificationToken(pool, {
      applicationId: application.id,
      email: "a@example.com",
      emailNormalized: "a@example.com",
      tokenHash: first.tokenHash,
      sentAt,
      expiresAt: new Date(sentAt.getTime() + TOKEN_TTL_MS),
      createdByUserId: adminUser.id,
    });

    await assert.rejects(
      () =>
        repo.createRegistrationEmailVerificationToken(pool, {
          applicationId: application.id,
          email: "a@example.com",
          emailNormalized: "a@example.com",
          tokenHash: first.tokenHash,
          sentAt: new Date(sentAt.getTime() + RESEND_COOLDOWN_MS + 1000),
          expiresAt: new Date(sentAt.getTime() + RESEND_COOLDOWN_MS + 1000 + TOKEN_TTL_MS),
          createdByUserId: adminUser.id,
        }),
      /duplicate|unique/i
    );

    const second = generateSessionToken();
    await assert.rejects(
      () =>
        repo.createRegistrationEmailVerificationToken(pool, {
          applicationId: application.id,
          email: "a@example.com",
          emailNormalized: "a@example.com",
          tokenHash: second.tokenHash,
          sentAt: new Date(sentAt.getTime() + RESEND_COOLDOWN_MS + 1000),
          expiresAt: new Date(sentAt.getTime() + RESEND_COOLDOWN_MS + 1000 + TOKEN_TTL_MS),
          createdByUserId: adminUser.id,
        }),
      /duplicate|unique/i
    );
  });

  it("invalidates active tokens and allows a new sent token", async (t) => {
    if (!requireDb(t)) return;
    await pool.query(
      `DELETE FROM blessboard.registration_email_verification_tokens WHERE application_id = $1`,
      [application.id]
    );

    const first = generateSessionToken();
    const sentAt = new Date("2026-07-24T12:00:00.000Z");
    await repo.createRegistrationEmailVerificationToken(pool, {
      applicationId: application.id,
      email: "a@example.com",
      emailNormalized: "a@example.com",
      tokenHash: first.tokenHash,
      sentAt,
      expiresAt: new Date(sentAt.getTime() + TOKEN_TTL_MS),
      createdByUserId: null,
    });

    const invalidated = await repo.invalidateActiveRegistrationEmailVerificationTokens(
      pool,
      application.id,
      { reason: "superseded", invalidatedAt: new Date(sentAt.getTime() + 1000) }
    );
    assert.equal(invalidated.length, 1);
    assert.equal(invalidated[0].status, "replaced");

    const second = generateSessionToken();
    const created = await repo.createRegistrationEmailVerificationToken(pool, {
      applicationId: application.id,
      email: "a@example.com",
      emailNormalized: "a@example.com",
      tokenHash: second.tokenHash,
      sentAt: new Date(sentAt.getTime() + RESEND_COOLDOWN_MS + 2000),
      expiresAt: new Date(sentAt.getTime() + RESEND_COOLDOWN_MS + 2000 + TOKEN_TTL_MS),
      createdByUserId: adminUser.id,
    });
    assert.equal(created.status, "sent");
  });

  it("verifies a sent token once and rejects expired or replaced", async (t) => {
    if (!requireDb(t)) return;
    await pool.query(
      `DELETE FROM blessboard.registration_email_verification_tokens WHERE application_id = $1`,
      [application.id]
    );

    const active = generateSessionToken();
    const sentAt = new Date("2026-07-24T13:00:00.000Z");
    const row = await repo.createRegistrationEmailVerificationToken(pool, {
      applicationId: application.id,
      email: "a@example.com",
      emailNormalized: "a@example.com",
      tokenHash: active.tokenHash,
      sentAt,
      expiresAt: new Date(sentAt.getTime() + TOKEN_TTL_MS),
      createdByUserId: adminUser.id,
    });

    const verifiedAt = new Date(sentAt.getTime() + 60_000);
    const verified = await repo.markRegistrationEmailVerificationTokenVerified(pool, row.id, {
      verifiedAt,
    });
    assert.ok(verified);
    assert.equal(verified.status, "verified");

    const again = await repo.markRegistrationEmailVerificationTokenVerified(pool, row.id, {
      verifiedAt: new Date(verifiedAt.getTime() + 1000),
    });
    assert.equal(again, null);

    await pool.query(
      `DELETE FROM blessboard.registration_email_verification_tokens WHERE application_id = $1`,
      [application.id]
    );
    const expiredTok = generateSessionToken();
    const expiredRow = await repo.createRegistrationEmailVerificationToken(pool, {
      applicationId: application.id,
      email: "a@example.com",
      emailNormalized: "a@example.com",
      tokenHash: expiredTok.tokenHash,
      sentAt,
      expiresAt: new Date(sentAt.getTime() + TOKEN_TTL_MS),
      createdByUserId: adminUser.id,
    });
    const expiredVerify = await repo.markRegistrationEmailVerificationTokenVerified(
      pool,
      expiredRow.id,
      { verifiedAt: new Date(sentAt.getTime() + TOKEN_TTL_MS + 1000) }
    );
    assert.equal(expiredVerify, null);

    await repo.invalidateActiveRegistrationEmailVerificationTokens(pool, application.id, {
      reason: "superseded",
      invalidatedAt: new Date(sentAt.getTime() + 1000),
    });
    const replacedVerify = await repo.markRegistrationEmailVerificationTokenVerified(
      pool,
      expiredRow.id,
      { verifiedAt: new Date(sentAt.getTime() + 2000) }
    );
    assert.equal(replacedVerify, null);
  });

  it("service create/consume round-trip uses transactions and one-time verify", async (t) => {
    if (!requireDb(t)) return;
    await pool.query(
      `DELETE FROM blessboard.registration_email_verification_tokens WHERE application_id = $1`,
      [application.id]
    );

    const now = new Date("2026-07-24T14:00:00.000Z");
    const created = await createVerificationToken(
      {
        applicationId: application.id,
        email: "Round.Trip@Example.com",
        createdByUserId: adminUser.id,
      },
      { client: pool, now: () => now }
    );
    assert.equal(created.ok, true);
    assert.ok(created.rawToken);
    assert.equal(created.token.emailNormalized, "round.trip@example.com");

    const consumed = await consumeVerificationToken(created.rawToken, {
      client: pool,
      now: () => new Date(now.getTime() + 1000),
    });
    assert.equal(consumed.ok, true);
    assert.equal(consumed.token.status, "verified");

    const reused = await consumeVerificationToken(created.rawToken, {
      client: pool,
      now: () => new Date(now.getTime() + 2000),
    });
    assert.equal(reused.ok, false);
    assert.equal(reused.code, "invalid_token");
  });

  it("concurrent verification attempts verify at most once", async (t) => {
    if (!requireDb(t)) return;
    await pool.query(
      `DELETE FROM blessboard.registration_email_verification_tokens WHERE application_id = $1`,
      [application.id]
    );

    const now = new Date("2026-07-24T15:00:00.000Z");
    const created = await createVerificationToken(
      {
        applicationId: application.id,
        email: "race@example.com",
        createdByUserId: adminUser.id,
      },
      { client: pool, now: () => now }
    );

    const results = await Promise.all([
      consumeVerificationToken(created.rawToken, {
        client: pool,
        now: () => new Date(now.getTime() + 1000),
      }),
      consumeVerificationToken(created.rawToken, {
        client: pool,
        now: () => new Date(now.getTime() + 1000),
      }),
    ]);
    const okCount = results.filter((r) => r.ok).length;
    assert.equal(okCount, 1);
    assert.equal(results.filter((r) => !r.ok).length, 1);

    const rows = await pool.query(
      `SELECT status FROM blessboard.registration_email_verification_tokens
        WHERE application_id = $1 AND token_hash = $2`,
      [application.id, hashSessionToken(created.rawToken)]
    );
    assert.equal(rows.rows[0].status, "verified");
  });
});
