"use strict";

/**
 * Prompt 048 — duplicate match query integration (PostgreSQL-gated).
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
  runDuplicateCheck,
  listDuplicateMatches,
  getDuplicateComparison,
} = require("../src/blessboard/services/registrationDuplicateMatchQueryService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function randomPhone() {
  return `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
}

describe("registration duplicate match query integration (Prompt 048)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let subjectApp;
  let candidateApp;
  let platformUser;

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
        email: `${uniq("dup-query-user")}@example.org`,
        displayName: "Dup Query User",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
      platformUser = created.user;

      // Distinct phones: active applications cannot share contact_phone_normalized
      // (platform_church_reg_apps_phone_normalized_active_uidx). Overlap via church name.
      const phoneSubject = randomPhone();
      const phoneCandidate = randomPhone();
      subjectApp = await repo.createApplication(pool, {
        church_name: "Query Subject Church",
        country: "Zambia",
        city: "Lusaka",
        contact_name: "Subject Contact",
        contact_email: platformUser.email_normalized || platformUser.email,
        contact_phone: phoneSubject,
        contact_phone_normalized: phoneSubject,
        role_in_church: "Pastor",
        selected_plan: "foundation",
        consent_terms: true,
      });
      assert.ok(subjectApp && subjectApp.id);

      candidateApp = await repo.createApplication(pool, {
        church_name: "Query Subject Church",
        country: "Zambia",
        city: "Lusaka",
        contact_name: "Candidate Contact",
        contact_email: `${uniq("dup-cand")}@example.org`,
        contact_phone: phoneCandidate,
        contact_phone_normalized: phoneCandidate,
        role_in_church: "Pastor",
        selected_plan: "foundation",
        consent_terms: true,
      });
      assert.ok(candidateApp && candidateApp.id);
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
      t.skip(`Foundation fixture unavailable: ${skipReason}`);
      return false;
    }
    return true;
  }

  it("runDuplicateCheck persists matches and excludes the subject application", async (t) => {
    if (!requireDb(t)) return;
    const result = await runDuplicateCheck(pool, subjectApp.id);
    assert.equal(result.ok, true);
    assert.ok(Array.isArray(result.matches));
    assert.ok(!result.matches.some((m) => m.matchedRecordId === subjectApp.id));

    const phoneOrName = result.matches.find(
      (m) =>
        m.matchedRecordType === "application" && m.matchedRecordId === candidateApp.id
    );
    assert.ok(phoneOrName, "expected candidate application match");
    assert.ok(["strong", "possible"].includes(phoneOrName.riskLevel));

    const userMatch = result.matches.find((m) => m.matchedRecordType === "user");
    if (userMatch) {
      assert.equal(userMatch.candidate.label, "Platform user account");
      assert.equal(userMatch.candidate.email, undefined);
    }

    assert.doesNotMatch(JSON.stringify(result.matches), /password_hash/);
  });

  it("listDuplicateMatches and getDuplicateComparison read stored ledger", async (t) => {
    if (!requireDb(t)) return;
    const listed = await listDuplicateMatches(pool, subjectApp.id);
    assert.equal(listed.ok, true);
    assert.ok(listed.matches.length >= 1);

    const first = listed.matches[0];
    const comparison = await getDuplicateComparison(pool, subjectApp.id, first.id);
    assert.equal(comparison.ok, true);
    assert.equal(comparison.comparison.subject.id, subjectApp.id);
    assert.equal(comparison.match.id, first.id);
    assert.equal(comparison.approvalGateUnchanged, true);
  });
});
