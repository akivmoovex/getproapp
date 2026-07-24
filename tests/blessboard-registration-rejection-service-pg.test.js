"use strict";

/**
 * Phase2 Prompt 068 — rejection service PostgreSQL-backed tests (skips when DB unavailable).
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
  rejectRegistrationApplication,
} = require("../src/blessboard/services/registrationApplicationsAdminService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function randomPhone() {
  return `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
}

describe("rejectRegistrationApplication PostgreSQL (Prompt 068)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let adminUser;

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
        email: `${uniq("rej-admin")}@example.org`,
        displayName: "Rejection Admin",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
      adminUser = created.user;
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

  it("rejects with category, notice, metadata, and honest sending_unavailable", async (t) => {
    if (!requireDb(t)) return;

    const phone = randomPhone();
    const app = await repo.createApplication(pool, {
      church_name: `Reject Upgrade ${uniq("church")}`,
      country: "Zambia",
      city: "Lusaka",
      contact_name: "Pastor Reject",
      contact_email: `${uniq("rej")}@example.org`,
      contact_phone: phone,
      contact_phone_normalized: phone,
      role_in_church: "Pastor",
      selected_plan: "foundation",
      consent_terms: true,
      application_status: "submitted",
    });

    const result = await rejectRegistrationApplication(pool, {
      applicationId: app.id,
      platformAdminUserId: adminUser.id,
      rejectionCategory: "church_identity_not_confirmed",
      internalDecisionNote: "Could not confirm church identity on call.",
      applicantExplanation:
        "We could not confirm your church identity with the information provided.",
      reapplicationAllowed: true,
      notifyApplicant: true,
    });

    assert.equal(result.ok, true, result.message);
    assert.equal(result.alreadyRejected, false);
    assert.equal(result.rejectionCategory, "church_identity_not_confirmed");
    assert.equal(result.reapplicationAllowed, true);
    assert.equal(result.rejectionNotificationStatus, "sending_unavailable");
    assert.equal(result.delivery.status, "sending_unavailable");
    assert.ok(result.rejectionNotice);
    assert.equal(result.rejectionNotice.communicationType, "rejection_notice");

    const row = await repo.findApplicationById(pool, app.id);
    assert.equal(row.application_status, "rejected");
    assert.equal(
      row.rejection_reason,
      "Could not confirm church identity on call."
    );
    assert.equal(row.rejection_category, "church_identity_not_confirmed");
    assert.equal(row.reapplication_allowed, true);
    assert.equal(row.rejection_notification_status, "sending_unavailable");
    assert.ok(Array.isArray(row.review_events) && row.review_events.length >= 1);
    const rejectEvent = row.review_events[row.review_events.length - 1];
    assert.equal(rejectEvent.action, "reject");
    assert.equal(rejectEvent.rejection_category, "church_identity_not_confirmed");
    assert.equal(rejectEvent.notification_status, "sending_unavailable");

    const notices = await repo.listRegistrationApplicationCommunications(pool, app.id, {
      communicationType: "rejection_notice",
    });
    assert.equal(notices.length, 1);
    assert.match(String(notices[0].applicant_message), /could not confirm your church identity/i);
    assert.match(String(notices[0].internal_note), /Could not confirm church identity on call/);
    assert.equal(notices[0].delivery_status, "sending_unavailable");
    assert.notEqual(notices[0].applicant_message, notices[0].internal_note);
  });

  it("legacy reason-only reject still works without metadata notice", async (t) => {
    if (!requireDb(t)) return;

    const phone = randomPhone();
    const app = await repo.createApplication(pool, {
      church_name: `Legacy Reject ${uniq("church")}`,
      country: "Zambia",
      city: "Ndola",
      contact_name: "Legacy Contact",
      contact_email: `${uniq("legacy")}@example.org`,
      contact_phone: phone,
      contact_phone_normalized: phone,
      role_in_church: "Administrator",
      selected_plan: "growth",
      consent_terms: true,
      application_status: "duplicate_review",
    });

    const result = await rejectRegistrationApplication(pool, {
      applicationId: app.id,
      actorUserId: adminUser.id,
      reason: "Unable to verify church leadership details",
    });
    assert.equal(result.ok, true, result.message);

    const row = await repo.findApplicationById(pool, app.id);
    assert.equal(row.application_status, "rejected");
    assert.match(String(row.rejection_reason), /Unable to verify/);
    assert.equal(row.rejection_category, null);
    assert.equal(row.rejection_notification_status, null);

    const notices = await repo.listRegistrationApplicationCommunications(pool, app.id, {
      communicationType: "rejection_notice",
    });
    assert.equal(notices.length, 0);
  });
});
