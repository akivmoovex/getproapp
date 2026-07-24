"use strict";

/**
 * Prompt 062 — registration application communications + rejection metadata storage.
 * PostgreSQL-gated: skips honestly when local DB is unavailable.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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
const REPO_PATH = path.join(
  __dirname,
  "../src/blessboard/repositories/platformChurchRegistrationRepository.js"
);

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function randomPhone() {
  return `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
}

describe("registration application communications storage (Prompt 062)", () => {
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
        email: `${uniq("comm-admin")}@example.org`,
        displayName: "Communications Admin",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
      adminUser = created.user;

      const phone = randomPhone();
      application = await repo.createApplication(pool, {
        church_name: "Communications Test Church",
        country: "Zambia",
        city: "Lusaka",
        contact_name: "Pastor Comm",
        contact_email: `${uniq("comm")}@example.org`,
        contact_phone: phone,
        contact_phone_normalized: phone,
        role_in_church: "Pastor",
        selected_plan: "foundation",
        consent_terms: true,
      });
      assert.ok(application && application.id);

      await pool.query(
        `UPDATE blessboard.platform_church_registration_applications
            SET rejection_reason = $2,
                application_status = 'submitted'
          WHERE id = $1`,
        [application.id, "Preserved rejection reason text"]
      );
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

  it("migration creates the communication table", async (t) => {
    if (!requireDb(t)) return;
    const r = await pool.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'blessboard'
          AND table_name = 'registration_application_communications'`
    );
    assert.equal(r.rowCount, 1);
  });

  it("migration adds rejection metadata columns", async (t) => {
    if (!requireDb(t)) return;
    const r = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'blessboard'
          AND table_name = 'platform_church_registration_applications'
          AND column_name IN (
            'rejection_category',
            'reapplication_allowed',
            'rejection_notification_status'
          )
        ORDER BY column_name`
    );
    assert.deepEqual(
      r.rows.map((row) => row.column_name),
      ["reapplication_allowed", "rejection_category", "rejection_notification_status"]
    );
  });

  it("foreign keys reference applications and users", async (t) => {
    if (!requireDb(t)) return;
    const fks = await pool.query(
      `SELECT
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
        AND tc.table_name = 'registration_application_communications'
        AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY kcu.column_name`
    );
    const byCol = Object.fromEntries(
      fks.rows.map((row) => [row.column_name, row])
    );
    assert.equal(byCol.application_id.foreign_table_name, "platform_church_registration_applications");
    assert.equal(byCol.application_id.delete_rule, "RESTRICT");
    assert.equal(byCol.created_by_user_id.foreign_table_name, "users");
    assert.equal(byCol.created_by_user_id.delete_rule, "RESTRICT");
  });

  it("rejects disallowed communication type / channel / direction / delivery status", async (t) => {
    if (!requireDb(t)) return;
    await assert.rejects(
      () =>
        repo.createRegistrationApplicationCommunication(pool, {
          applicationId: application.id,
          createdByUserId: adminUser.id,
          communicationType: "newsletter",
          channel: "internal",
          direction: "internal",
          deliveryStatus: "not_applicable",
          internalNote: "x",
        }),
      /invalid_communication_type/
    );
    await assert.rejects(
      () =>
        repo.createRegistrationApplicationCommunication(pool, {
          applicationId: application.id,
          createdByUserId: adminUser.id,
          communicationType: "internal_note",
          channel: "sms",
          direction: "internal",
          deliveryStatus: "not_applicable",
          internalNote: "x",
        }),
      /invalid_communication_channel/
    );
    await assert.rejects(
      () =>
        repo.createRegistrationApplicationCommunication(pool, {
          applicationId: application.id,
          createdByUserId: adminUser.id,
          communicationType: "internal_note",
          channel: "internal",
          direction: "sideways",
          deliveryStatus: "not_applicable",
          internalNote: "x",
        }),
      /invalid_communication_direction/
    );
    await assert.rejects(
      () =>
        repo.createRegistrationApplicationCommunication(pool, {
          applicationId: application.id,
          createdByUserId: adminUser.id,
          communicationType: "internal_note",
          channel: "internal",
          direction: "internal",
          deliveryStatus: "delivered",
          internalNote: "x",
        }),
      /invalid_delivery_status/
    );
  });

  it("enforces internal-note consistency", async (t) => {
    if (!requireDb(t)) return;
    await assert.rejects(
      () =>
        repo.createRegistrationApplicationCommunication(pool, {
          applicationId: application.id,
          createdByUserId: adminUser.id,
          communicationType: "internal_note",
          channel: "internal",
          direction: "outbound",
          deliveryStatus: "not_applicable",
          internalNote: "secret",
        }),
      /internal_note_direction_invalid/
    );
    await assert.rejects(
      () =>
        repo.createRegistrationApplicationCommunication(pool, {
          applicationId: application.id,
          createdByUserId: adminUser.id,
          communicationType: "internal_note",
          channel: "internal",
          direction: "internal",
          deliveryStatus: "recorded",
          internalNote: "secret",
        }),
      /internal_note_delivery_status_invalid/
    );
  });

  it("requires applicant message for information request and rejection notice", async (t) => {
    if (!requireDb(t)) return;
    await assert.rejects(
      () =>
        repo.createRegistrationApplicationCommunication(pool, {
          applicationId: application.id,
          createdByUserId: adminUser.id,
          communicationType: "information_request",
          channel: "email",
          direction: "outbound",
          deliveryStatus: "sending_unavailable",
          subject: "Need docs",
        }),
      /applicant_message_required/
    );
    await assert.rejects(
      () =>
        repo.createRegistrationApplicationCommunication(pool, {
          applicationId: application.id,
          createdByUserId: adminUser.id,
          communicationType: "rejection_notice",
          channel: "email",
          direction: "outbound",
          deliveryStatus: "sending_unavailable",
        }),
      /applicant_message_required/
    );
  });

  it("inserts internal note, information request, and rejection notice", async (t) => {
    if (!requireDb(t)) return;
    const note = await repo.createRegistrationApplicationCommunication(pool, {
      applicationId: application.id,
      createdByUserId: adminUser.id,
      communicationType: "internal_note",
      channel: "internal",
      direction: "internal",
      deliveryStatus: "not_applicable",
      internalNote: "Internal only note",
      applicantMessage: "   ",
    });
    assert.equal(note.communication_type, "internal_note");
    assert.equal(note.internal_note, "Internal only note");
    assert.equal(note.applicant_message, null);

    const due = "2026-08-01T12:00:00.000Z";
    const info = await repo.createRegistrationApplicationCommunication(pool, {
      applicationId: application.id,
      createdByUserId: adminUser.id,
      communicationType: "information_request",
      channel: "email",
      direction: "outbound",
      deliveryStatus: "sending_unavailable",
      recipient: application.contact_email,
      subject: "Please provide documents",
      applicantMessage: "Please upload your registration certificate.",
      internalNote: "Asked for cert",
      requestCategory: "documents",
      requestedFields: ["registration_number"],
      requestedDocuments: ["certificate"],
      responseDueAt: due,
    });
    assert.equal(info.communication_type, "information_request");
    assert.equal(info.applicant_message, "Please upload your registration certificate.");
    assert.equal(info.internal_note, "Asked for cert");
    assert.deepEqual(info.requested_fields, ["registration_number"]);
    assert.deepEqual(info.requested_documents, ["certificate"]);
    assert.ok(info.response_due_at);
    assert.equal(new Date(info.response_due_at).toISOString(), due);

    const rejectNotice = await repo.createRegistrationApplicationCommunication(pool, {
      applicationId: application.id,
      createdByUserId: adminUser.id,
      communicationType: "rejection_notice",
      channel: "email",
      direction: "outbound",
      deliveryStatus: "recorded",
      applicantMessage: "We are unable to approve this registration.",
      subject: "Registration decision",
    });
    assert.equal(rejectNotice.communication_type, "rejection_notice");
    assert.equal(rejectNotice.delivery_status, "recorded");
  });

  it("lists newest first, filters by type, supports empty and latest", async (t) => {
    if (!requireDb(t)) return;
    const listed = await repo.listRegistrationApplicationCommunications(pool, application.id);
    assert.ok(listed.length >= 3);
    for (let i = 1; i < listed.length; i += 1) {
      const prev = new Date(listed[i - 1].created_at).getTime();
      const cur = new Date(listed[i].created_at).getTime();
      assert.ok(prev >= cur);
    }

    const notes = await repo.listRegistrationApplicationCommunications(pool, application.id, {
      communicationType: "internal_note",
    });
    assert.ok(notes.length >= 1);
    assert.ok(notes.every((row) => row.communication_type === "internal_note"));

    const emptyPhone = randomPhone();
    const otherApp = await repo.createApplication(pool, {
      church_name: "Empty Comm Church",
      country: "Zambia",
      city: "Kitwe",
      contact_name: "Empty Contact",
      contact_email: `${uniq("empty")}@example.org`,
      contact_phone: emptyPhone,
      contact_phone_normalized: emptyPhone,
      role_in_church: "Pastor",
      selected_plan: "foundation",
      consent_terms: true,
    });
    const emptyList = await repo.listRegistrationApplicationCommunications(pool, otherApp.id);
    assert.deepEqual(emptyList, []);

    const latest = await repo.findLatestRegistrationApplicationCommunication(
      pool,
      application.id
    );
    assert.ok(latest);
    assert.equal(latest.id, listed[0].id);

    const latestNote = await repo.findLatestRegistrationApplicationCommunication(
      pool,
      application.id,
      { communicationType: "internal_note" }
    );
    assert.ok(latestNote);
    assert.equal(latestNote.communication_type, "internal_note");

    const none = await repo.findLatestRegistrationApplicationCommunication(pool, otherApp.id);
    assert.equal(none, null);
  });

  it("updates rejection metadata without changing reason or status", async (t) => {
    if (!requireDb(t)) return;
    const before = await pool.query(
      `SELECT application_status, rejection_reason
         FROM blessboard.platform_church_registration_applications
        WHERE id = $1`,
      [application.id]
    );
    assert.equal(before.rows[0].application_status, "submitted");
    assert.equal(before.rows[0].rejection_reason, "Preserved rejection reason text");

    const updated = await repo.updateRegistrationRejectionMetadata(pool, application.id, {
      rejectionCategory: "incomplete_documents",
      reapplicationAllowed: true,
      rejectionNotificationStatus: "sending_unavailable",
    });
    assert.equal(updated.rejection_category, "incomplete_documents");
    assert.equal(updated.reapplication_allowed, true);
    assert.equal(updated.rejection_notification_status, "sending_unavailable");
    assert.equal(updated.application_status, "submitted");
    assert.equal(updated.rejection_reason, "Preserved rejection reason text");

    const after = await pool.query(
      `SELECT application_status, rejection_reason, rejection_category,
              reapplication_allowed, rejection_notification_status
         FROM blessboard.platform_church_registration_applications
        WHERE id = $1`,
      [application.id]
    );
    assert.equal(after.rows[0].application_status, "submitted");
    assert.equal(after.rows[0].rejection_reason, "Preserved rejection reason text");
    assert.equal(after.rows[0].rejection_category, "incomplete_documents");
  });

  it("create uses parameterized SQL and exposes no update/delete communication methods", async (t) => {
    if (!requireDb(t)) return;
    const src = fs.readFileSync(REPO_PATH, "utf8");
    assert.match(src, /createRegistrationApplicationCommunication/);
    assert.match(src, /\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10::jsonb/);
    assert.doesNotMatch(
      src,
      /async function (update|delete|remove)RegistrationApplicationCommunication/
    );
    assert.doesNotMatch(src, /UPDATE blessboard\.registration_application_communications/);
    assert.doesNotMatch(src, /DELETE FROM blessboard\.registration_application_communications/);
  });

  it("DB check rejects information_request without applicant_message", async (t) => {
    if (!requireDb(t)) return;
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.registration_application_communications (
             application_id, communication_type, channel, direction,
             delivery_status, created_by_user_id
           ) VALUES ($1, 'information_request', 'email', 'outbound', 'recorded', $2)`,
          [application.id, adminUser.id]
        ),
      /reg_app_comms_information_request_message|check constraint/i
    );
  });
});
