"use strict";

/**
 * Prompt 047 — registration duplicate match storage (migration + repository).
 * PostgreSQL-gated: skips honestly when local DB is unavailable.
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

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function randomPhone() {
  return `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
}

describe("registration duplicate match storage (Prompt 047)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let adminUser;
  let application;
  let otherApplication;

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
        email: `${uniq("dup-match-admin")}@example.org`,
        displayName: "Duplicate Match Admin",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
      adminUser = created.user;

      const phoneA = randomPhone();
      application = await repo.createApplication(pool, {
        church_name: "Duplicate Subject Church",
        country: "Zambia",
        city: "Lusaka",
        contact_name: "Pastor Subject",
        contact_email: `${uniq("dup-subj")}@example.org`,
        contact_phone: phoneA,
        contact_phone_normalized: phoneA,
        role_in_church: "Pastor",
        selected_plan: "foundation",
        consent_terms: true,
      });
      assert.ok(application && application.id);

      const phoneB = randomPhone();
      otherApplication = await repo.createApplication(pool, {
        church_name: "Duplicate Candidate Church",
        country: "Zambia",
        city: "Ndola",
        contact_name: "Pastor Candidate",
        contact_email: `${uniq("dup-cand")}@example.org`,
        contact_phone: phoneB,
        contact_phone_normalized: phoneB,
        role_in_church: "Pastor",
        selected_plan: "foundation",
        consent_terms: true,
      });
      assert.ok(otherApplication && otherApplication.id);
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

  it("migration creates the normalized table", async (t) => {
    if (!requireDb(t)) return;
    const r = await pool.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'blessboard'
          AND table_name = 'registration_duplicate_matches'`
    );
    assert.equal(r.rowCount, 1);

    const cols = await pool.query(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'blessboard'
          AND table_name = 'registration_duplicate_matches'
        ORDER BY ordinal_position`
    );
    const byName = Object.fromEntries(cols.rows.map((c) => [c.column_name, c.data_type]));
    assert.equal(byName.application_id, "uuid");
    assert.equal(byName.matched_record_type, "text");
    assert.equal(byName.matched_record_id, "uuid");
    assert.equal(byName.score, "integer");
    assert.equal(byName.risk_level, "text");
    assert.equal(byName.evidence_snapshot, "jsonb");
    assert.equal(byName.review_decision, "text");
    assert.equal(byName.review_reason, "text");
    assert.equal(byName.reviewed_by_user_id, "uuid");
    assert.ok(byName.reviewed_at);
    assert.ok(byName.created_at);
  });

  it("replace/recompute upserts matches and lists by score", async (t) => {
    if (!requireDb(t)) return;
    const orgId = crypto.randomUUID();
    const rows = await repo.replaceRegistrationDuplicateMatches(pool, application.id, [
      {
        matchedRecordType: "application",
        matchedRecordId: otherApplication.id,
        score: 20,
        riskLevel: "possible",
        evidenceSnapshot: {
          signals: ["exact_name_city_country"],
          explanation: "Name triple overlap",
        },
      },
      {
        matchedRecordType: "organization",
        matchedRecordId: orgId,
        score: 75,
        riskLevel: "strong",
        evidenceSnapshot: {
          signals: ["church_owned_email"],
          reasons: [{ code: "church_owned_email", weight: 75, message: "Owned email" }],
        },
      },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].matched_record_type, "organization");
    assert.equal(rows[0].score, 75);
    assert.equal(rows[0].risk_level, "strong");
    assert.equal(typeof rows[0].evidence_snapshot, "object");
    assert.ok(!Array.isArray(rows[0].evidence_snapshot));
    assert.equal(rows[0].review_decision, null);
    assert.equal(rows[1].matched_record_type, "application");
    assert.equal(rows[1].matched_record_id, otherApplication.id);

    const listed = await repo.listRegistrationDuplicateMatches(pool, application.id);
    assert.equal(listed.length, 2);
    assert.equal(listed[0].score, 75);
  });

  it("recompute removes undecided matches absent from the new set", async (t) => {
    if (!requireDb(t)) return;
    const keepOrg = crypto.randomUUID();
    await repo.replaceRegistrationDuplicateMatches(pool, application.id, [
      {
        matchedRecordType: "organization",
        matchedRecordId: keepOrg,
        score: 55,
        riskLevel: "strong",
        evidenceSnapshot: { signals: ["exact_phone_overlap"] },
      },
      {
        matchedRecordType: "application",
        matchedRecordId: otherApplication.id,
        score: 12,
        riskLevel: "possible",
        evidenceSnapshot: { signals: ["exact_church_name"] },
      },
    ]);

    const after = await repo.replaceRegistrationDuplicateMatches(pool, application.id, [
      {
        matchedRecordType: "organization",
        matchedRecordId: keepOrg,
        score: 80,
        riskLevel: "strong",
        evidenceSnapshot: { signals: ["exact_registration_number"], score: 80 },
      },
    ]);
    assert.equal(after.length, 1);
    assert.equal(after[0].matched_record_id, keepOrg);
    assert.equal(after[0].score, 80);
    assert.deepEqual(after[0].evidence_snapshot.signals, ["exact_registration_number"]);
  });

  it("loads one match by id", async (t) => {
    if (!requireDb(t)) return;
    const listed = await repo.listRegistrationDuplicateMatches(pool, application.id);
    assert.ok(listed.length >= 1);
    const one = await repo.getRegistrationDuplicateMatchById(pool, listed[0].id, {
      applicationId: application.id,
    });
    assert.ok(one);
    assert.equal(one.id, listed[0].id);
    assert.equal(one.application_id, application.id);

    const missing = await repo.getRegistrationDuplicateMatchById(pool, crypto.randomUUID());
    assert.equal(missing, null);
  });

  it("records an allowlisted review decision without clearing score fields", async (t) => {
    if (!requireDb(t)) return;
    const listed = await repo.listRegistrationDuplicateMatches(pool, application.id);
    assert.ok(listed[0]);
    const decided = await repo.recordRegistrationDuplicateMatchDecision(pool, listed[0].id, {
      applicationId: application.id,
      reviewDecision: "confirmed_duplicate",
      reviewReason: "Operator confirmed same legal entity after phone ownership check.",
      reviewedByUserId: adminUser.id,
      reviewedAt: "2026-07-24T12:00:00.000Z",
    });
    assert.ok(decided);
    assert.equal(decided.review_decision, "confirmed_duplicate");
    assert.match(decided.review_reason, /confirmed same legal entity/i);
    assert.equal(decided.reviewed_by_user_id, adminUser.id);
    assert.ok(decided.reviewed_at);
    assert.equal(decided.score, listed[0].score);
    assert.equal(decided.risk_level, listed[0].risk_level);
  });

  it("preserves decided rows when recompute omits them", async (t) => {
    if (!requireDb(t)) return;
    const before = await repo.listRegistrationDuplicateMatches(pool, application.id);
    const decided = before.find((r) => r.review_decision === "confirmed_duplicate");
    assert.ok(decided);

    const after = await repo.replaceRegistrationDuplicateMatches(pool, application.id, []);
    assert.equal(after.length, 1);
    assert.equal(after[0].id, decided.id);
    assert.equal(after[0].review_decision, "confirmed_duplicate");
  });

  it("rejects invalid decisions, self-matches, and non-object evidence arrays as objects only", async (t) => {
    if (!requireDb(t)) return;

    await assert.rejects(
      () =>
        repo.replaceRegistrationDuplicateMatches(pool, application.id, [
          {
            matchedRecordType: "application",
            matchedRecordId: application.id,
            score: 10,
            riskLevel: "possible",
            evidenceSnapshot: {},
          },
        ]),
      /self_match_not_allowed/
    );

    await assert.rejects(
      () =>
        repo.replaceRegistrationDuplicateMatches(pool, application.id, [
          {
            matchedRecordType: "application",
            matchedRecordId: otherApplication.id,
            score: 10,
            riskLevel: "maybe",
            evidenceSnapshot: {},
          },
        ]),
      /invalid_risk_level/
    );

    const listed = await repo.listRegistrationDuplicateMatches(pool, application.id);
    await assert.rejects(
      () =>
        repo.recordRegistrationDuplicateMatchDecision(pool, listed[0].id, {
          reviewDecision: "merge_now",
          reviewReason: "nope",
          reviewedByUserId: adminUser.id,
        }),
      /invalid_review_decision/
    );

    // Evidence must be object-shaped; array normalizes to {}.
    const rows = await repo.replaceRegistrationDuplicateMatches(pool, application.id, [
      {
        matchedRecordType: "user",
        matchedRecordId: adminUser.id,
        score: 18,
        riskLevel: "possible",
        evidenceSnapshot: ["not", "an", "object"],
      },
    ]);
    const userMatch = rows.find((r) => r.matched_record_type === "user");
    assert.ok(userMatch);
    assert.equal(typeof userMatch.evidence_snapshot, "object");
    assert.ok(!Array.isArray(userMatch.evidence_snapshot));
  });

  it("accepts every allowlisted review decision", async (t) => {
    if (!requireDb(t)) return;
    for (const decision of repo.DUPLICATE_MATCH_REVIEW_DECISIONS) {
      const targetId = crypto.randomUUID();
      const [row] = await repo.replaceRegistrationDuplicateMatches(pool, application.id, [
        {
          matchedRecordType: "organization",
          matchedRecordId: targetId,
          score: 40,
          riskLevel: "strong",
          evidenceSnapshot: { decisionProbe: decision },
        },
      ]);
      const saved = await repo.recordRegistrationDuplicateMatchDecision(pool, row.id, {
        reviewDecision: decision,
        reviewReason: `Decision probe for ${decision}`,
        reviewedByUserId: adminUser.id,
      });
      assert.equal(saved.review_decision, decision);
    }
  });
});
