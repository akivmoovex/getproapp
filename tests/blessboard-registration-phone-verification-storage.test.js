"use strict";

/**
 * Prompt 026 — registration phone verification attempt storage (migration + repository).
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
  normalizeRegistrationPhone,
} = require("../src/blessboard/services/normalizeRegistrationPhone");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function randomPhone() {
  return `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
}

describe("registration phone verification storage (Prompt 026)", () => {
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
        email: `${uniq("phone-verify-admin")}@example.org`,
        displayName: "Phone Verify Admin",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
      adminUser = created.user;

      const phone = randomPhone();
      application = await repo.createApplication(pool, {
        church_name: "Phone Verify Church",
        country: "Zambia",
        city: "Lusaka",
        contact_name: "Pastor Verify",
        contact_email: `${uniq("pv")}@example.org`,
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

  it("migration creates the table", async (t) => {
    if (!requireDb(t)) return;
    const r = await pool.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'blessboard'
          AND table_name = 'registration_phone_verification_attempts'`
    );
    assert.equal(r.rowCount, 1);
  });

  it("foreign keys reference applications and users", async (t) => {
    if (!requireDb(t)) return;
    const fks = await pool.query(
      `SELECT
         tc.constraint_name,
         kcu.column_name,
         ccu.table_schema AS foreign_table_schema,
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
        AND tc.table_name = 'registration_phone_verification_attempts'
        AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY kcu.column_name`
    );
    const byCol = Object.fromEntries(fks.rows.map((row) => [row.column_name, row]));
    assert.equal(byCol.application_id.foreign_table_name, "platform_church_registration_applications");
    assert.equal(byCol.application_id.delete_rule, "RESTRICT");
    assert.equal(byCol.created_by_user_id.foreign_table_name, "users");
    assert.equal(byCol.created_by_user_id.delete_rule, "RESTRICT");
  });

  it("allowed-value constraints exist", async (t) => {
    if (!requireDb(t)) return;
    const checks = await pool.query(
      `SELECT conname
         FROM pg_constraint
        WHERE conrelid = 'blessboard.registration_phone_verification_attempts'::regclass
          AND contype = 'c'
        ORDER BY conname`
    );
    const names = checks.rows.map((r) => r.conname);
    assert.ok(names.includes("reg_phone_verify_attempts_outcome_check"));
    assert.ok(names.includes("reg_phone_verify_attempts_identity_status_check"));
    assert.ok(names.includes("reg_phone_verify_attempts_authority_status_check"));
    assert.ok(names.includes("reg_phone_verify_attempts_verification_result_check"));
    assert.ok(names.includes("reg_phone_verify_attempts_verification_reason_required"));
  });

  it("defaults statuses to not_checked / pending", async (t) => {
    if (!requireDb(t)) return;
    const phone = randomPhone();
    const row = await repo.createPhoneVerificationAttempt(pool, {
      applicationId: application.id,
      phoneNumberCalled: phone,
      country: "Zambia",
      attemptedAt: new Date(),
      outcome: "answered",
      createdByUserId: adminUser.id,
    });
    assert.equal(row.applicant_identity_status, "not_checked");
    assert.equal(row.applicant_authority_status, "not_checked");
    assert.equal(row.verification_result, "pending");
    assert.equal(row.verification_reason, null);
  });

  it("requires verification reason for verified result", async (t) => {
    if (!requireDb(t)) return;
    await assert.rejects(
      () =>
        repo.createPhoneVerificationAttempt(pool, {
          applicationId: application.id,
          phoneNumberCalled: randomPhone(),
          country: "Zambia",
          attemptedAt: new Date(),
          outcome: "answered",
          verificationResult: "verified",
          createdByUserId: adminUser.id,
        }),
      /verification_reason_required/
    );

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.registration_phone_verification_attempts (
             application_id, phone_number_called, phone_number_normalized,
             attempted_at, outcome, verification_result, created_by_user_id
           ) VALUES ($1, $2, $3, now(), 'answered', 'verified', $4)`,
          [application.id, "+260971111111", "+260971111111", adminUser.id]
        ),
      (err) => String(err.constraint || err.message).includes("verification_reason")
    );
  });

  it("requires verification reason for failed result", async (t) => {
    if (!requireDb(t)) return;
    await assert.rejects(
      () =>
        repo.createPhoneVerificationAttempt(pool, {
          applicationId: application.id,
          phoneNumberCalled: randomPhone(),
          country: "Zambia",
          attemptedAt: new Date(),
          outcome: "wrong_number",
          verificationResult: "failed",
          createdByUserId: adminUser.id,
        }),
      /verification_reason_required/
    );
  });

  it("pending result may omit reason", async (t) => {
    if (!requireDb(t)) return;
    const row = await repo.createPhoneVerificationAttempt(pool, {
      applicationId: application.id,
      phoneNumberCalled: randomPhone(),
      country: "Zambia",
      attemptedAt: new Date(),
      outcome: "no_answer",
      verificationResult: "pending",
      createdByUserId: adminUser.id,
    });
    assert.equal(row.verification_result, "pending");
    assert.equal(row.verification_reason, null);
  });

  it("stores original and normalized phone", async (t) => {
    if (!requireDb(t)) return;
    const original = "097 222 3333";
    const expected = normalizeRegistrationPhone(original, "Zambia");
    assert.equal(expected.ok, true);
    const row = await repo.createPhoneVerificationAttempt(pool, {
      applicationId: application.id,
      phoneNumberCalled: original,
      country: "Zambia",
      attemptedAt: new Date(),
      outcome: "answered",
      createdByUserId: adminUser.id,
    });
    assert.equal(row.phone_number_called, original);
    assert.equal(row.phone_number_normalized, expected.normalized);
  });

  it("inserts an attempt and returns the created record", async (t) => {
    if (!requireDb(t)) return;
    const beforeApp = await repo.getRegistrationApplicationById(pool, application.id);
    const row = await repo.createPhoneVerificationAttempt(pool, {
      applicationId: application.id,
      phoneNumberCalled: randomPhone(),
      country: "Zambia",
      attemptedAt: new Date("2026-07-20T10:00:00.000Z"),
      outcome: "callback_requested",
      applicantIdentityStatus: "confirmed",
      applicantAuthorityStatus: "not_confirmed",
      verificationResult: "failed",
      verificationReason: "Could not confirm authority",
      notes: "Asked for callback tomorrow",
      followUpAt: new Date("2026-07-21T09:00:00.000Z"),
      contactPersonName: "Jane",
      contactPersonRole: "Secretary",
      createdByUserId: adminUser.id,
    });
    assert.ok(row.id);
    assert.equal(row.application_id, application.id);
    assert.equal(row.outcome, "callback_requested");
    assert.equal(row.applicant_identity_status, "confirmed");
    assert.equal(row.applicant_authority_status, "not_confirmed");
    assert.equal(row.verification_result, "failed");
    assert.equal(row.verification_reason, "Could not confirm authority");
    assert.equal(row.notes, "Asked for callback tomorrow");
    assert.equal(row.contact_person_name, "Jane");
    assert.equal(row.created_by_user_id, adminUser.id);
    assert.ok(row.created_at);

    const afterApp = await repo.getRegistrationApplicationById(pool, application.id);
    assert.equal(afterApp.updated_at.toISOString(), beforeApp.updated_at.toISOString());
    assert.equal(afterApp.follow_up_status, beforeApp.follow_up_status);
  });

  it("lists attempts newest first and preserves multiple attempts", async (t) => {
    if (!requireDb(t)) return;
    const phoneA = randomPhone();
    const phoneB = randomPhone();
    const phoneC = randomPhone();
    const multiApp = await repo.createApplication(pool, {
      church_name: "Multi Attempt Church",
      country: "Zambia",
      city: "Ndola",
      contact_name: "Pastor Multi",
      contact_email: `${uniq("multi")}@example.org`,
      contact_phone: phoneA,
      contact_phone_normalized: phoneA,
      role_in_church: "Pastor",
      selected_plan: "foundation",
      consent_terms: true,
    });

    const older = await repo.createPhoneVerificationAttempt(pool, {
      applicationId: multiApp.id,
      phoneNumberCalled: phoneA,
      country: "Zambia",
      attemptedAt: new Date("2026-07-01T08:00:00.000Z"),
      outcome: "no_answer",
      createdByUserId: adminUser.id,
    });
    const newer = await repo.createPhoneVerificationAttempt(pool, {
      applicationId: multiApp.id,
      phoneNumberCalled: phoneB,
      country: "Zambia",
      attemptedAt: new Date("2026-07-02T08:00:00.000Z"),
      outcome: "answered",
      createdByUserId: adminUser.id,
    });
    const newest = await repo.createPhoneVerificationAttempt(pool, {
      applicationId: multiApp.id,
      phoneNumberCalled: phoneC,
      country: "Zambia",
      attemptedAt: new Date("2026-07-03T08:00:00.000Z"),
      outcome: "unavailable",
      createdByUserId: adminUser.id,
    });

    const listed = await repo.listPhoneVerificationAttempts(pool, multiApp.id);
    assert.equal(listed.length, 3);
    assert.equal(listed[0].id, newest.id);
    assert.equal(listed[1].id, newer.id);
    assert.equal(listed[2].id, older.id);
    assert.ok(!Object.prototype.hasOwnProperty.call(listed[0], "created_by_email"));
    assert.ok(!Object.prototype.hasOwnProperty.call(listed[0], "created_by_display_name"));
  });

  it("rejects invalid outcome", async (t) => {
    if (!requireDb(t)) return;
    await assert.rejects(
      () =>
        repo.createPhoneVerificationAttempt(pool, {
          applicationId: application.id,
          phoneNumberCalled: randomPhone(),
          country: "Zambia",
          attemptedAt: new Date(),
          outcome: "reached",
          createdByUserId: adminUser.id,
        }),
      /invalid_phone_verification_outcome/
    );
  });

  it("rejects invalid identity status", async (t) => {
    if (!requireDb(t)) return;
    await assert.rejects(
      () =>
        repo.createPhoneVerificationAttempt(pool, {
          applicationId: application.id,
          phoneNumberCalled: randomPhone(),
          country: "Zambia",
          attemptedAt: new Date(),
          outcome: "answered",
          applicantIdentityStatus: "true",
          createdByUserId: adminUser.id,
        }),
      /invalid_applicant_identity_status/
    );
  });

  it("rejects invalid authority status", async (t) => {
    if (!requireDb(t)) return;
    await assert.rejects(
      () =>
        repo.createPhoneVerificationAttempt(pool, {
          applicationId: application.id,
          phoneNumberCalled: randomPhone(),
          country: "Zambia",
          attemptedAt: new Date(),
          outcome: "answered",
          applicantAuthorityStatus: "false",
          createdByUserId: adminUser.id,
        }),
      /invalid_applicant_authority_status/
    );
  });

  it("rejects invalid verification result", async (t) => {
    if (!requireDb(t)) return;
    await assert.rejects(
      () =>
        repo.createPhoneVerificationAttempt(pool, {
          applicationId: application.id,
          phoneNumberCalled: randomPhone(),
          country: "Zambia",
          attemptedAt: new Date(),
          outcome: "answered",
          verificationResult: "success",
          createdByUserId: adminUser.id,
        }),
      /invalid_verification_result/
    );
  });

  it("rejects missing application ID", async (t) => {
    if (!requireDb(t)) return;
    await assert.rejects(
      () =>
        repo.createPhoneVerificationAttempt(pool, {
          phoneNumberCalled: randomPhone(),
          country: "Zambia",
          attemptedAt: new Date(),
          outcome: "answered",
          createdByUserId: adminUser.id,
        }),
      /application_id_required/
    );
    await assert.rejects(
      () => repo.listPhoneVerificationAttempts(pool, ""),
      /application_id_required/
    );
  });

  it("returns empty array when no attempts exist", async (t) => {
    if (!requireDb(t)) return;
    const phone = randomPhone();
    const emptyApp = await repo.createApplication(pool, {
      church_name: "Empty Attempts Church",
      country: "Zambia",
      city: "Kitwe",
      contact_name: "Pastor Empty",
      contact_email: `${uniq("empty")}@example.org`,
      contact_phone: phone,
      contact_phone_normalized: phone,
      role_in_church: "Pastor",
      selected_plan: "foundation",
      consent_terms: true,
    });
    const listed = await repo.listPhoneVerificationAttempts(pool, emptyApp.id);
    assert.deepEqual(listed, []);
  });

  it("uses parameterized queries", async (t) => {
    if (!requireDb(t)) return;
    const calls = [];
    const wrappingClient = {
      query(sql, params) {
        calls.push({ sql: String(sql), params });
        return pool.query(sql, params);
      },
    };
    const phone = "097 444 5555";
    await repo.createPhoneVerificationAttempt(wrappingClient, {
      applicationId: application.id,
      phoneNumberCalled: phone,
      country: "Zambia",
      attemptedAt: new Date("2026-07-04T12:00:00.000Z"),
      outcome: "information_inconsistent",
      verificationResult: "failed",
      verificationReason: "Name mismatch",
      notes: "injected'; DROP TABLE students;--",
      createdByUserId: adminUser.id,
    });
    assert.ok(calls.length >= 1);
    const insertCall = calls.find((c) =>
      /INSERT INTO blessboard\.registration_phone_verification_attempts/i.test(c.sql)
    );
    assert.ok(insertCall);
    assert.match(insertCall.sql, /\$1/);
    assert.ok(Array.isArray(insertCall.params));
    assert.equal(insertCall.params.includes(application.id), true);
    assert.equal(insertCall.sql.includes("DROP TABLE"), false);
    assert.equal(insertCall.sql.includes(phone), false);

    calls.length = 0;
    await repo.listPhoneVerificationAttempts(wrappingClient, application.id);
    const listCall = calls.find((c) =>
      /FROM blessboard\.registration_phone_verification_attempts/i.test(c.sql)
    );
    assert.ok(listCall);
    assert.match(listCall.sql, /\$1/);
    assert.equal(listCall.params[0], application.id);
  });
});
