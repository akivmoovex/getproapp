"use strict";

/**
 * Prompt 11E — phone-first authentication with email fallback.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcryptjs");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { authenticateBlessBoardUser } = require("../src/blessboard/services/authenticateBlessBoardUser");
const {
  PHONE_LOGIN_STATUS,
  resolvePhoneLoginStatus,
} = require("../src/blessboard/services/phoneLoginStatus");
const { renderLoginPage } = require("../src/blessboard/http/renderTenantLandingPage");

const IDENTITY_KEY = "blessboard-platform-v5";
const DEPLOYMENT = "blessboard-org-staging";
const PASSWORD = "correct-horse-battery-staple";

describe("blessboard phone-first authentication (11E)", () => {
  it("login UI prioritizes phone wording", () => {
    const html = renderLoginPage({ csrfToken: "tok", loginMode: "phone" });
    assert.match(html, /data-gp-auth-identifier="1"/);
    assert.match(html, /data-gp-auth-id-tab="phone"/);
    assert.match(html, /data-gp-auth-id-tab="email"/);
    assert.match(html, /phone_national/);
    assert.match(html, /Welcome Back/i);
    assert.match(html, /gp-auth-feature-panel/);
  });

  it("resolvePhoneLoginStatus covers missing/unverified/verified", () => {
    assert.equal(resolvePhoneLoginStatus({}), PHONE_LOGIN_STATUS.PHONE_MISSING);
    assert.equal(
      resolvePhoneLoginStatus({ phone_normalized: "+260971234567" }),
      PHONE_LOGIN_STATUS.PHONE_UNVERIFIED
    );
    assert.equal(
      resolvePhoneLoginStatus({
        phone_normalized: "+260971234567",
        phone_verified_at: new Date(),
      }),
      PHONE_LOGIN_STATUS.PHONE_VERIFIED
    );
  });

  describe("authenticate", () => {
    let pool;
    let org;
    let church;
    let phoneUserId;
    let emailOnlyId;

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
        organizationKey: "phone-login-11e",
        displayName: "Phone Login Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "phone-login-11e",
        hostname: "phone-login-11e.blessboard.org",
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(prov.ok, true, prov.message);
      org = prov.records.organization;

      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "phone-login-11e",
        churchKey: "phone-login-11e",
        displayName: "Phone Login Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
        countryCode: "ZM",
      });
      assert.equal(ch.ok, true, ch.message);
      church = ch.records.church;

      const hash = await bcrypt.hash(PASSWORD, 4);

      const phoneUser = await pool.query(
        `INSERT INTO blessboard.users
           (email_normalized, email_display, display_name, password_hash, status,
            phone_normalized, phone_display)
         VALUES ('phone-user@example.test', 'phone-user@example.test', 'Phone User', $1, 'active',
                 '+260978881111', '0978881111')
         RETURNING id`,
        [hash]
      );
      phoneUserId = phoneUser.rows[0].id;
      await pool.query(
        `INSERT INTO blessboard.user_roles
           (user_id, organization_id, church_id, role_key, status)
         VALUES ($1, $2, $3, 'church_hq_admin', 'active')`,
        [phoneUserId, org.id, church.id]
      );
      await pool.query(
        `INSERT INTO blessboard.organization_staff_phones
           (organization_id, phone_normalized, user_id)
         VALUES ($1, '+260978881111', $2)`,
        [org.id, phoneUserId]
      );

      const emailOnly = await pool.query(
        `INSERT INTO blessboard.users
           (email_normalized, email_display, display_name, password_hash, status)
         VALUES ('email-only@example.test', 'email-only@example.test', 'Email Only', $1, 'active')
         RETURNING id`,
        [hash]
      );
      emailOnlyId = emailOnly.rows[0].id;
      await pool.query(
        `INSERT INTO blessboard.user_roles
           (user_id, organization_id, church_id, role_key, status)
         VALUES ($1, $2, $3, 'church_hq_admin', 'active')`,
        [emailOnlyId, org.id, church.id]
      );
    });

    after(async () => {
      if (pool) await pool.end();
    });

    it("logs in with local and international phone formats", async () => {
      for (const id of ["0978881111", "+260 97 888 1111", "+260978881111"]) {
        const auth = await authenticateBlessBoardUser(pool, {
          identifier: id,
          password: PASSWORD,
          deploymentCode: DEPLOYMENT,
          country: "ZM",
        });
        assert.equal(auth.ok, true, `${id} -> ${auth.message || auth.status}`);
        assert.equal(String(auth.user.id), String(phoneUserId));
        assert.equal(auth.phoneStatus, PHONE_LOGIN_STATUS.PHONE_UNVERIFIED);
      }
    });

    it("supports email fallback for existing users and prompts phone migration", async () => {
      const auth = await authenticateBlessBoardUser(pool, {
        email: "email-only@example.test",
        password: PASSWORD,
        deploymentCode: DEPLOYMENT,
      });
      assert.equal(auth.ok, true, auth.message);
      assert.equal(String(auth.user.id), String(emailOnlyId));
      assert.equal(auth.phoneStatus, PHONE_LOGIN_STATUS.PHONE_MISSING);
      assert.equal(auth.phoneMigrationPrompt.code, "add_phone");
    });

    it("rejects wrong password and invalid identifier without tenant enumeration", async () => {
      const badPw = await authenticateBlessBoardUser(pool, {
        identifier: "0978881111",
        password: "wrong-password-value-xx",
        deploymentCode: DEPLOYMENT,
      });
      assert.equal(badPw.ok, false);
      assert.equal(badPw.message, "invalid_credentials");

      const missing = await authenticateBlessBoardUser(pool, {
        identifier: "0970000000",
        password: PASSWORD,
        deploymentCode: DEPLOYMENT,
      });
      assert.equal(missing.ok, false);
      assert.equal(missing.message, "invalid_credentials");
    });

    it("fails closed when the same phone matches multiple global users", async () => {
      const hash = await bcrypt.hash(PASSWORD, 4);
      await pool.query(
        `INSERT INTO blessboard.users
           (email_normalized, email_display, display_name, password_hash, status,
            phone_normalized, phone_display)
         VALUES ('dup-phone@example.test', 'dup-phone@example.test', 'Dup Phone', $1, 'active',
                 '+260978881111', '0978881111')`,
        [hash]
      );
      const auth = await authenticateBlessBoardUser(pool, {
        identifier: "+260978881111",
        password: PASSWORD,
        deploymentCode: DEPLOYMENT,
      });
      assert.equal(auth.ok, false);
      assert.equal(auth.message, "invalid_credentials");
    });
  });
});
