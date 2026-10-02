"use strict";

/**
 * Phase2 Prompt 034 — registration email verification token service (stub repo, no Postgres).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const crypto = require("crypto");

const {
  TOKEN_TTL_MS,
  RESEND_COOLDOWN_MS,
  SUMMARY_STATUSES,
  createVerificationToken,
  consumeVerificationToken,
  getVerificationStatus,
  normalizeVerificationEmail,
} = require("../src/blessboard/services/registrationEmailVerificationService");
const { hashSessionToken } = require("../src/platform/session/sessionToken");

const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date("2026-07-24T12:00:00.000Z");

function makeRawToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function createStubRepo(seedRows = []) {
  /** @type {object[]} */
  const rows = seedRows.map((r) => ({ ...r }));
  const calls = {
    create: [],
    findByHash: [],
    findLatest: [],
    invalidate: [],
    markVerified: [],
  };

  return {
    calls,
    rows,
    async findLatestRegistrationEmailVerificationToken(_client, applicationId) {
      calls.findLatest.push(applicationId);
      const list = rows
        .filter((r) => String(r.application_id) === String(applicationId))
        .sort((a, b) => {
          const ta = new Date(a.created_at).getTime();
          const tb = new Date(b.created_at).getTime();
          if (tb !== ta) return tb - ta;
          return String(b.id).localeCompare(String(a.id));
        });
      return list[0] || null;
    },
    async invalidateActiveRegistrationEmailVerificationTokens(
      _client,
      applicationId,
      opts = {}
    ) {
      calls.invalidate.push({ applicationId, opts });
      const out = [];
      for (const row of rows) {
        if (String(row.application_id) === String(applicationId) && row.status === "sent") {
          row.status = "replaced";
          row.invalidated_at = opts.invalidatedAt || NOW;
          row.invalidation_reason = opts.reason || "superseded";
          out.push({ ...row });
        }
      }
      return out;
    },
    async createRegistrationEmailVerificationToken(_client, fields) {
      calls.create.push({ ...fields });
      assert.ok(fields.tokenHash);
      assert.equal(Object.prototype.hasOwnProperty.call(fields, "rawToken"), false);
      assert.doesNotMatch(JSON.stringify(fields), /rawToken|plaintext/i);
      const row = {
        id: crypto.randomUUID(),
        application_id: fields.applicationId,
        email: fields.email,
        email_normalized: fields.emailNormalized,
        token_hash: fields.tokenHash,
        status: fields.status || "sent",
        sent_at: fields.sentAt,
        expires_at: fields.expiresAt,
        verified_at: null,
        invalidated_at: null,
        invalidation_reason: null,
        created_by_user_id: fields.createdByUserId || null,
        created_at: fields.sentAt,
      };
      rows.push(row);
      return { ...row };
    },
    async findRegistrationEmailVerificationTokenByHash(_client, tokenHash) {
      calls.findByHash.push(tokenHash);
      return rows.find((r) => r.token_hash === tokenHash) || null;
    },
    async markRegistrationEmailVerificationTokenVerified(_client, tokenId, opts = {}) {
      calls.markVerified.push({ tokenId, opts });
      const row = rows.find((r) => r.id === tokenId);
      if (!row || row.status !== "sent") return null;
      const verifiedAt = opts.verifiedAt || NOW;
      if (new Date(row.expires_at).getTime() <= new Date(verifiedAt).getTime()) return null;
      row.status = "verified";
      row.verified_at = verifiedAt;
      return { ...row };
    },
  };
}

function fakeClient() {
  return {
    query: async (sql) => {
      const s = String(sql || "").trim().toUpperCase();
      if (s === "BEGIN" || s === "COMMIT" || s === "ROLLBACK") return { rows: [] };
      throw new Error(`unexpected sql in stub client: ${sql}`);
    },
  };
}

describe("registrationEmailVerificationService (Prompt 034, stub repo)", () => {
  it("returns a secure plaintext token once and stores only the hash", async () => {
    const repo = createStubRepo();
    const raw = makeRawToken();
    const hash = hashSessionToken(raw);
    const input = {
      applicationId: APP_ID,
      email: "Pat@Example.COM",
      createdByUserId: ADMIN_ID,
    };
    const frozen = JSON.stringify(input);

    const result = await createVerificationToken(input, {
      repository: repo,
      client: fakeClient(),
      now: () => NOW,
      generateToken: () => ({ rawToken: raw, tokenHash: hash }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.rawToken, raw);
    assert.equal(repo.calls.create.length, 1);
    assert.equal(repo.calls.create[0].tokenHash, hash);
    assert.equal(repo.calls.create[0].emailNormalized, "pat@example.com");
    assert.equal(repo.calls.create[0].email, "Pat@Example.COM");
    assert.doesNotMatch(JSON.stringify(repo.calls.create[0]), new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(!Object.prototype.hasOwnProperty.call(result.token, "tokenHash"));
    assert.ok(!Object.prototype.hasOwnProperty.call(result.token, "rawToken"));
    assert.equal(JSON.stringify(input), frozen);
  });

  it("sets 24-hour expiry from injected clock", async () => {
    const repo = createStubRepo();
    const raw = makeRawToken();
    const result = await createVerificationToken(
      { applicationId: APP_ID, email: "a@example.com" },
      {
        repository: repo,
        client: fakeClient(),
        now: () => NOW,
        generateToken: () => ({ rawToken: raw, tokenHash: hashSessionToken(raw) }),
      }
    );
    assert.equal(result.expiresAt.getTime() - NOW.getTime(), TOKEN_TTL_MS);
    assert.equal(
      new Date(repo.calls.create[0].expiresAt).getTime() - NOW.getTime(),
      TOKEN_TTL_MS
    );
  });

  it("normalizes email with user-grade rules", () => {
    assert.deepEqual(normalizeVerificationEmail("  A.B+x@Example.ORG "), {
      ok: true,
      email: "A.B+x@Example.ORG",
      emailNormalized: "a.b+x@example.org",
    });
    assert.equal(normalizeVerificationEmail("not-an-email").ok, false);
    assert.equal(normalizeVerificationEmail("").ok, false);
  });

  it("invalidates active tokens before replacement", async () => {
    const repo = createStubRepo([
      {
        id: "11111111-1111-4111-8111-111111111111",
        application_id: APP_ID,
        email: "old@example.com",
        email_normalized: "old@example.com",
        token_hash: "a".repeat(64),
        status: "sent",
        sent_at: new Date(NOW.getTime() - RESEND_COOLDOWN_MS - 1000),
        expires_at: new Date(NOW.getTime() + TOKEN_TTL_MS),
        created_at: new Date(NOW.getTime() - RESEND_COOLDOWN_MS - 1000),
      },
    ]);
    const raw = makeRawToken();
    await createVerificationToken(
      { applicationId: APP_ID, email: "new@example.com" },
      {
        repository: repo,
        client: fakeClient(),
        now: () => NOW,
        generateToken: () => ({ rawToken: raw, tokenHash: hashSessionToken(raw) }),
      }
    );
    assert.equal(repo.calls.invalidate.length, 1);
    assert.equal(repo.calls.invalidate[0].opts.reason, "superseded");
    assert.equal(repo.rows[0].status, "replaced");
    assert.equal(repo.rows[1].status, "sent");
  });

  it("rejects create during resend cooldown", async () => {
    const repo = createStubRepo([
      {
        id: "11111111-1111-4111-8111-111111111111",
        application_id: APP_ID,
        email: "a@example.com",
        email_normalized: "a@example.com",
        token_hash: "b".repeat(64),
        status: "sent",
        sent_at: new Date(NOW.getTime() - 1000),
        expires_at: new Date(NOW.getTime() + TOKEN_TTL_MS),
        created_at: new Date(NOW.getTime() - 1000),
      },
    ]);
    const raw = makeRawToken();
    await assert.rejects(
      () =>
        createVerificationToken(
          { applicationId: APP_ID, email: "a@example.com" },
          {
            repository: repo,
            client: fakeClient(),
            now: () => NOW,
            generateToken: () => ({ rawToken: raw, tokenHash: hashSessionToken(raw) }),
          }
        ),
      (err) => err && err.code === "resend_cooldown"
    );
    assert.equal(repo.calls.create.length, 0);
  });

  it("consumes a valid token once", async () => {
    const raw = makeRawToken();
    const hash = hashSessionToken(raw);
    const tokenId = "22222222-2222-4222-8222-222222222222";
    const repo = createStubRepo([
      {
        id: tokenId,
        application_id: APP_ID,
        email: "a@example.com",
        email_normalized: "a@example.com",
        token_hash: hash,
        status: "sent",
        sent_at: NOW,
        expires_at: new Date(NOW.getTime() + TOKEN_TTL_MS),
        created_at: NOW,
      },
    ]);

    const first = await consumeVerificationToken(raw, {
      repository: repo,
      client: fakeClient(),
      now: () => NOW,
    });
    assert.equal(first.ok, true);
    assert.equal(first.code, "verified");
    assert.equal(first.token.status, "verified");

    const second = await consumeVerificationToken(raw, {
      repository: repo,
      client: fakeClient(),
      now: () => NOW,
    });
    assert.equal(second.ok, false);
    assert.equal(second.code, "invalid_token");
    assert.match(second.message, /invalid or has expired/i);
  });

  it("returns generic failure for invalid, expired, and replaced tokens", async () => {
    const raw = makeRawToken();
    const hash = hashSessionToken(raw);

    const missing = await consumeVerificationToken(raw, {
      repository: createStubRepo(),
      client: fakeClient(),
      now: () => NOW,
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "invalid_token");

    const expired = await consumeVerificationToken(raw, {
      repository: createStubRepo([
        {
          id: "33333333-3333-4333-8333-333333333333",
          application_id: APP_ID,
          email: "a@example.com",
          email_normalized: "a@example.com",
          token_hash: hash,
          status: "sent",
          sent_at: new Date(NOW.getTime() - TOKEN_TTL_MS - 1000),
          expires_at: new Date(NOW.getTime() - 1000),
          created_at: new Date(NOW.getTime() - TOKEN_TTL_MS - 1000),
        },
      ]),
      client: fakeClient(),
      now: () => NOW,
    });
    assert.equal(expired.ok, false);
    assert.equal(expired.code, "invalid_token");

    const replaced = await consumeVerificationToken(raw, {
      repository: createStubRepo([
        {
          id: "44444444-4444-4444-8444-444444444444",
          application_id: APP_ID,
          email: "a@example.com",
          email_normalized: "a@example.com",
          token_hash: hash,
          status: "replaced",
          sent_at: NOW,
          expires_at: new Date(NOW.getTime() + TOKEN_TTL_MS),
          invalidated_at: NOW,
          invalidation_reason: "superseded",
          created_at: NOW,
        },
      ]),
      client: fakeClient(),
      now: () => NOW,
    });
    assert.equal(replaced.ok, false);
    assert.equal(replaced.code, "invalid_token");
    assert.doesNotMatch(JSON.stringify(replaced), /application|aaaaaaaa/i);
  });

  it("derives verification status including not_sent and clock-aware expired", async () => {
    const empty = await getVerificationStatus(APP_ID, {
      repository: createStubRepo(),
      client: fakeClient(),
      now: () => NOW,
    });
    assert.equal(empty.status, SUMMARY_STATUSES.NOT_SENT);

    const sent = await getVerificationStatus(APP_ID, {
      repository: createStubRepo([
        {
          id: "55555555-5555-4555-8555-555555555555",
          application_id: APP_ID,
          email: "a@example.com",
          email_normalized: "a@example.com",
          token_hash: "c".repeat(64),
          status: "sent",
          sent_at: NOW,
          expires_at: new Date(NOW.getTime() + TOKEN_TTL_MS),
          created_at: NOW,
        },
      ]),
      client: fakeClient(),
      now: () => NOW,
    });
    assert.equal(sent.status, SUMMARY_STATUSES.SENT);

    const expired = await getVerificationStatus(APP_ID, {
      repository: createStubRepo([
        {
          id: "66666666-6666-4666-8666-666666666666",
          application_id: APP_ID,
          email: "a@example.com",
          email_normalized: "a@example.com",
          token_hash: "d".repeat(64),
          status: "sent",
          sent_at: new Date(NOW.getTime() - TOKEN_TTL_MS - 1),
          expires_at: new Date(NOW.getTime() - 1),
          created_at: new Date(NOW.getTime() - TOKEN_TTL_MS - 1),
        },
      ]),
      client: fakeClient(),
      now: () => NOW,
    });
    assert.equal(expired.status, SUMMARY_STATUSES.EXPIRED);
  });
});
