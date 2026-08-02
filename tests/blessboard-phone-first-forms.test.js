"use strict";

/**
 * Prompt 11C — phone-first forms, search, masking, and member linking.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  prepareIdentitySearchQuery,
  parsePhoneFirstContact,
  maskBlessBoardPhone,
} = require("../src/blessboard/services/phoneFirstIdentityHelpers");
const {
  submitMemberRegistration,
  linkMemberToUser,
} = require("../src/blessboard/services/memberRegistrationService");
const authRepo = require("../src/blessboard/repositories/blessBoardAuthRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const DEPLOYMENT = "blessboard-org-staging";
const HASH = "$2a$12$abcdefghijklmnopqrstuv";

describe("blessboard phone-first forms and search (11C)", () => {
  it("form field order places phone before email on key screens", () => {
    const files = [
      "views/blessboard/v5/public/register.ejs",
      "views/blessboard/v5/hq/staff-access-invite.ejs",
      "views/blessboard/v5/platform-admin/team-invite.ejs",
      "views/blessboard/v5/hq/member-journey-contacts.ejs",
      "views/blessboard/v5/member/profile.ejs",
    ];
    for (const rel of files) {
      const html = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
      const phoneIdx = html.search(/name=["']phone["']/i);
      const emailIdx = html.search(/name=["']email(?:Display)?["']/i);
      assert.ok(phoneIdx >= 0, `${rel} missing phone field`);
      assert.ok(emailIdx >= 0, `${rel} missing email field`);
      assert.ok(phoneIdx < emailIdx, `${rel} should place phone before email`);
      assert.match(html, /optional/i, `${rel} should mark email optional`);
    }
  });

  it("search helper normalizes phone-like queries", () => {
    for (const q of ["0971234567", "971234567", "+260971234567"]) {
      const s = prepareIdentitySearchQuery(q);
      assert.equal(s.phoneNormalized, "+260971234567");
      assert.equal(s.looksLikePhone, true);
    }
    const email = prepareIdentitySearchQuery("person@example.test");
    assert.equal(email.looksLikeEmail, true);
    assert.equal(email.phoneNormalized, null);
  });

  it("parsePhoneFirstContact requires phone and accepts optional email", () => {
    const missing = parsePhoneFirstContact({ email: "a@example.test" });
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, "phone_required");

    const ok = parsePhoneFirstContact({ phone: "0971234567" });
    assert.equal(ok.ok, true);
    assert.equal(ok.value.phoneNormalized, "+260971234567");
    assert.equal(ok.value.emailNormalized, null);

    const both = parsePhoneFirstContact({
      phone: "+260 97 123 4567",
      email: "Both@Example.TEST",
    });
    assert.equal(both.ok, true);
    assert.equal(both.value.emailNormalized, "both@example.test");
  });

  it("masks phones for list display", () => {
    const masked = maskBlessBoardPhone("+260971234567");
    assert.match(masked, /\*\*\*/);
    assert.equal(masked.includes("1234567"), false);
  });

  describe("registration and linking", () => {
    let pool;
    let org;
    let church;
    let branchId;
    let actorId;

    before(async () => {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const prov = await provisionPlatformTenant(pool, {
        organizationKey: "phone-forms-11c",
        displayName: "Phone Forms Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "phone-forms-11c",
        hostname: "phone-forms-11c.blessboard.org",
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(prov.ok, true, prov.message);
      org = prov.records.organization;

      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "phone-forms-11c",
        churchKey: "phone-forms-11c",
        displayName: "Phone Forms Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
        countryCode: "ZM",
      });
      assert.equal(ch.ok, true, ch.message);
      church = ch.records.church;
      const br = await pool.query(
        `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = 'hq'`,
        [church.id]
      );
      branchId = br.rows[0].id;

      const actor = await pool.query(
        `INSERT INTO blessboard.users
           (email_normalized, email_display, display_name, password_hash, status)
         VALUES ('actor-11c@example.test', 'actor-11c@example.test', 'Actor', $1, 'active')
         RETURNING id`,
        [HASH]
      );
      actorId = actor.rows[0].id;
      await pool.query(
        `INSERT INTO blessboard.user_roles
           (user_id, organization_id, church_id, branch_id, role_key, status)
         VALUES ($1, $2, $3, NULL, 'church_hq_admin', 'active')`,
        [actorId, org.id, church.id]
      );
    });

    after(async () => {
      if (pool) await pool.end();
    });

    it("rejects new member registration without phone", async () => {
      const result = await submitMemberRegistration(pool, {
        churchId: church.id,
        branchId,
        firstName: "No",
        lastName: "Phone",
        email: "nophone@example.test",
      });
      assert.equal(result.ok, false);
      assert.equal(result.reason, "phone_required");
    });

    it("accepts phone-only member registration", async () => {
      const result = await submitMemberRegistration(pool, {
        churchId: church.id,
        branchId,
        firstName: "Phone",
        lastName: "Only",
        phone: "0977777001",
      });
      assert.equal(result.ok, true, result.reason);
      assert.equal(result.registration.phoneNormalized, "+260977777001");
      assert.equal(result.registration.emailNormalized, null);
    });

    it("links member to user by matching phone", async () => {
      const phone = "+260977777002";
      const member = await pool.query(
        `INSERT INTO blessboard.members
           (church_id, first_name, last_name, phone_normalized, phone_display, status)
         VALUES ($1, 'Link', 'Member', $2, $2, 'active')
         RETURNING id`,
        [church.id, phone]
      );
      const user = await pool.query(
        `INSERT INTO blessboard.users
           (email_normalized, email_display, display_name, password_hash, status,
            phone_normalized, phone_display)
         VALUES ('link-user@example.test', 'link-user@example.test', 'Link User', $1, 'active', $2, $2)
         RETURNING id`,
        [HASH, phone]
      );

      const linked = await linkMemberToUser(pool, {
        memberId: member.rows[0].id,
        actorUserId: actorId,
        userId: user.rows[0].id,
        tenant: {
          resolved: true,
          organization: { id: org.id },
          church: { id: church.id },
        },
      });
      assert.equal(linked.ok, true, linked.reason);
      const check = await authRepo.findUserByPhone(pool, phone);
      assert.ok(check);
      const m = await pool.query(`SELECT user_id FROM blessboard.members WHERE id = $1`, [
        member.rows[0].id,
      ]);
      assert.equal(String(m.rows[0].user_id), String(user.rows[0].id));
    });
  });
});
