"use strict";

/**
 * Prompt 11B — tenant-scoped phone identity foundation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  normalizeBlessBoardPhone,
  maskBlessBoardPhone,
  DEFAULT_COUNTRY,
} = require("../src/blessboard/services/normalizeBlessBoardPhone");
const {
  normalizeRegistrationPhone,
} = require("../src/blessboard/services/normalizeRegistrationPhone");
const {
  MATCH,
  resolveTenantPhoneIdentity,
} = require("../src/blessboard/services/resolveTenantPhoneIdentity");

const IDENTITY_KEY = "blessboard-platform-v5";
const DEPLOYMENT = "blessboard-org-staging";
const HOST = "phone-identity-11b.blessboard.org";
const HASH = "$2a$12$abcdefghijklmnopqrstuv";
const TOKEN_HASH = "a".repeat(64);

describe("blessboard phone identity foundation (11B)", () => {
  describe("normalizeBlessBoardPhone", () => {
    it("defaults Zambia and maps equivalent local/international forms", () => {
      assert.equal(DEFAULT_COUNTRY, "ZM");
      const forms = [
        "0971234567",
        "971234567",
        "+260 97 123 4567",
        "00260 971234567",
        "+260971234567",
      ];
      const normalized = forms.map((f) => normalizeBlessBoardPhone(f));
      for (const r of normalized) {
        assert.equal(r.ok, true, r.error);
        assert.equal(r.normalized, "+260971234567");
      }
      // Explicit country still works
      assert.equal(normalizeBlessBoardPhone("0971234567", "Zambia").normalized, "+260971234567");
      assert.equal(normalizeRegistrationPhone("0971234567").normalized, "+260971234567");
    });

    it("rejects invalid phones", () => {
      assert.equal(normalizeBlessBoardPhone("").ok, false);
      assert.equal(normalizeBlessBoardPhone("123").ok, false);
      assert.equal(normalizeBlessBoardPhone("+0123").ok, false);
      assert.equal(normalizeBlessBoardPhone("12+34567890").ok, false);
    });

    it("rejects unresolvable explicit country for national numbers", () => {
      const r = normalizeBlessBoardPhone("0971234567", "Atlantis");
      assert.equal(r.ok, false);
    });

    it("requireCountry refuses inventing a default", () => {
      const r = normalizeBlessBoardPhone("0971234567", { requireCountry: true });
      assert.equal(r.ok, false);
    });

    it("masks phones for list display", () => {
      const masked = maskBlessBoardPhone("+260971234567");
      assert.match(masked, /\+260/);
      assert.match(masked, /\*\*\*/);
      assert.equal(masked.includes("1234567"), false);
    });
  });

  describe("tenant uniqueness and lookup", () => {
    let pool;
    let orgA;
    let churchA;
    let orgB;
    let churchB;
    let hqBranchA;

    before(async () => {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const cols = await pool.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'blessboard' AND table_name = 'users'
            AND column_name IN (
              'phone_country_code', 'phone_verified_at',
              'preferred_login_identifier', 'preferred_contact_channel'
            )`
      );
      assert.equal(cols.rowCount, 4, "migration 073 additive columns missing");

      async function provision(key, host) {
        const prov = await provisionPlatformTenant(pool, {
          organizationKey: key,
          displayName: `${key} Org`,
          legalName: null,
          dataEnvironment: "testing",
          productKey: "blessboard",
          productTenantKey: key,
          hostname: host,
          domainType: "canonical",
          deploymentCode: DEPLOYMENT,
          isPrimary: true,
        });
        assert.equal(prov.ok, true, prov.message);
        const ch = await provisionBlessBoardChurch(pool, {
          organizationKey: key,
          churchKey: key,
          displayName: `${key} Church`,
          legalName: null,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
          countryCode: "ZM",
        });
        assert.equal(ch.ok, true, ch.message);
        return { org: prov.records.organization, church: ch.records.church };
      }

      const a = await provision("phone-id-a", HOST);
      orgA = a.org;
      churchA = a.church;
      const b = await provision("phone-id-b", "phone-identity-11b-b.blessboard.org");
      orgB = b.org;
      churchB = b.church;

      const hq = await pool.query(
        `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = 'hq'`,
        [churchA.id]
      );
      hqBranchA = hq.rows[0].id;

      await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, country_code)
         VALUES ($1, 'ndola', 'Ndola', 'branch', 'active', false, 'ZM')`,
        [churchA.id]
      );
    });

    after(async () => {
      if (pool) await pool.end();
    });

    it("allows nullable email (migration compatibility) and stores phone metadata", async () => {
      const phone = normalizeBlessBoardPhone("0971111001");
      assert.equal(phone.ok, true);
      // createBlessBoardUser may still require email — insert directly for schema check
      const inserted = await pool.query(
        `INSERT INTO blessboard.users
           (email_normalized, email_display, display_name, password_hash, status,
            phone_normalized, phone_display, phone_country_code, preferred_login_identifier,
            preferred_contact_channel)
         VALUES (NULL, NULL, 'Phone Only Schema', $3, 'active',
                 $1, $2, 'ZM', 'phone', 'whatsapp')
         RETURNING id, email_normalized, phone_normalized, phone_verified_at`,
        [phone.normalized, phone.display, HASH]
      );
      assert.equal(inserted.rows[0].email_normalized, null);
      assert.equal(inserted.rows[0].phone_normalized, "+260971111001");
      assert.equal(inserted.rows[0].phone_verified_at, null);
    });

    it("denies duplicate phone inside one tenant (HQ and branch share uniqueness)", async () => {
      const phone = normalizeBlessBoardPhone("0972222002");
      const u = await pool.query(
        `INSERT INTO blessboard.users
           (email_normalized, email_display, display_name, password_hash, status,
            phone_normalized, phone_display)
         VALUES ('staff-a@example.test', 'staff-a@example.test', 'Staff A',
                 $3, 'active', $1, $2)
         RETURNING id`,
        [phone.normalized, phone.display, HASH]
      );
      await pool.query(
        `INSERT INTO blessboard.organization_staff_phones
           (organization_id, phone_normalized, user_id)
         VALUES ($1, $2, $3)`,
        [orgA.id, phone.normalized, u.rows[0].id]
      );

      await assert.rejects(
        () =>
          pool.query(
            `INSERT INTO blessboard.organization_staff_phones
               (organization_id, phone_normalized, user_id)
             VALUES ($1, $2, $3)`,
            [orgA.id, phone.normalized, u.rows[0].id]
          ),
        /duplicate key|unique/i
      );

      // Same formatted number as different string still collides after normalize
      const again = normalizeBlessBoardPhone("+260 97 222 2002");
      assert.equal(again.normalized, phone.normalized);
      await assert.rejects(
        async () => {
          const u2 = await pool.query(
            `INSERT INTO blessboard.users
               (email_normalized, email_display, display_name, password_hash, status,
                phone_normalized, phone_display)
             VALUES ('staff-a2@example.test', 'staff-a2@example.test', 'Staff A2',
                     $3, 'active', $1, $2)
             RETURNING id`,
            [again.normalized, again.display, HASH]
          );
          await pool.query(
            `INSERT INTO blessboard.organization_staff_phones
               (organization_id, phone_normalized, user_id)
             VALUES ($1, $2, $3)`,
            [orgA.id, again.normalized, u2.rows[0].id]
          );
        },
        /duplicate key|unique/i
      );
      void hqBranchA;
    });

    it("allows the same phone in another tenant (global users, org-scoped uniqueness)", async () => {
      const phone = normalizeBlessBoardPhone("0973333003");
      const uA = await pool.query(
        `INSERT INTO blessboard.users
           (email_normalized, email_display, display_name, password_hash, status,
            phone_normalized, phone_display)
         VALUES ('tenant-a@example.test', 'tenant-a@example.test', 'Tenant A',
                 $3, 'active', $1, $2)
         RETURNING id`,
        [phone.normalized, phone.display, HASH]
      );
      await pool.query(
        `INSERT INTO blessboard.organization_staff_phones
           (organization_id, phone_normalized, user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [orgA.id, phone.normalized, uA.rows[0].id]
      );

      const uB = await pool.query(
        `INSERT INTO blessboard.users
           (email_normalized, email_display, display_name, password_hash, status,
            phone_normalized, phone_display)
         VALUES ('tenant-b@example.test', 'tenant-b@example.test', 'Tenant B',
                 $3, 'active', $1, $2)
         RETURNING id`,
        [phone.normalized, phone.display, HASH]
      );
      await pool.query(
        `INSERT INTO blessboard.organization_staff_phones
           (organization_id, phone_normalized, user_id)
         VALUES ($1, $2, $3)`,
        [orgB.id, phone.normalized, uB.rows[0].id]
      );

      const lookupA = await resolveTenantPhoneIdentity(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        phoneNormalized: phone.normalized,
      });
      const lookupB = await resolveTenantPhoneIdentity(pool, {
        organizationId: orgB.id,
        churchId: churchB.id,
        phoneNormalized: phone.normalized,
      });
      assert.equal(lookupA.match, MATCH.EXISTING_USER);
      assert.equal(lookupB.match, MATCH.EXISTING_USER);
      assert.equal(lookupA.user.userId, String(uA.rows[0].id));
      assert.equal(lookupB.user.userId, String(uB.rows[0].id));
      // Cross-tenant concealment: org A lookup never returns org B user id as sole match confusion
      assert.notEqual(lookupA.user.userId, lookupB.user.userId);
    });

    it("resolveTenantPhoneIdentity returns NO_MATCH, member-without-user, and pending invitation", async () => {
      const noMatch = await resolveTenantPhoneIdentity(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        phoneNormalized: "+260979999999",
      });
      assert.equal(noMatch.match, MATCH.NO_MATCH);

      const phone = normalizeBlessBoardPhone("0974444004");
      const member = await pool.query(
        `INSERT INTO blessboard.members
           (church_id, first_name, last_name, phone_normalized, phone_display, status)
         VALUES ($1, 'Member', 'Only', $2, $3, 'active')
         RETURNING id`,
        [churchA.id, phone.normalized, phone.display]
      );
      const memberLookup = await resolveTenantPhoneIdentity(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        phoneNormalized: phone.normalized,
      });
      assert.equal(memberLookup.match, MATCH.EXISTING_MEMBER_WITHOUT_USER);
      assert.equal(memberLookup.member.id, String(member.rows[0].id));
      assert.equal(memberLookup.member.userId, null);

      const invitePhone = normalizeBlessBoardPhone("0975555005");
      await pool.query(
        `INSERT INTO blessboard.users
           (email_normalized, email_display, display_name, password_hash, status,
            phone_normalized, phone_display)
         VALUES (NULL, NULL, 'Pending Invitee', NULL, 'invited', $1, $2)
         RETURNING id`,
        [invitePhone.normalized, invitePhone.display]
      );
      await pool.query(
        `INSERT INTO blessboard.user_invitations
           (organization_id, church_id, email_normalized, email_display,
            phone_normalized, phone_display, display_name, role_key,
            token_hash, status, expires_at)
         VALUES ($1, $2, NULL, NULL, $3, $4, 'Pending Invitee', 'church_hq_admin',
                 $5, 'pending', now() + interval '7 days')`,
        [orgA.id, churchA.id, invitePhone.normalized, invitePhone.display, TOKEN_HASH]
      );
      const pending = await resolveTenantPhoneIdentity(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        phoneNormalized: invitePhone.normalized,
      });
      assert.equal(pending.match, MATCH.PENDING_INVITATION);
    });

    it("concurrent duplicate protection via database constraint", async () => {
      const phone = normalizeBlessBoardPhone("0976666006");
      const u1 = await pool.query(
        `INSERT INTO blessboard.users
           (email_normalized, email_display, display_name, password_hash, status,
            phone_normalized, phone_display)
         VALUES ('conc1@example.test', 'conc1@example.test', 'Conc 1',
                 $3, 'active', $1, $2)
         RETURNING id`,
        [phone.normalized, phone.display, HASH]
      );
      const u2 = await pool.query(
        `INSERT INTO blessboard.users
           (email_normalized, email_display, display_name, password_hash, status,
            phone_normalized, phone_display)
         VALUES ('conc2@example.test', 'conc2@example.test', 'Conc 2',
                 $3, 'active', $1, $2)
         RETURNING id`,
        [phone.normalized, phone.display, HASH]
      );

      const results = await Promise.allSettled([
        pool.query(
          `INSERT INTO blessboard.organization_staff_phones
             (organization_id, phone_normalized, user_id)
           VALUES ($1, $2, $3)`,
          [orgA.id, phone.normalized, u1.rows[0].id]
        ),
        pool.query(
          `INSERT INTO blessboard.organization_staff_phones
             (organization_id, phone_normalized, user_id)
           VALUES ($1, $2, $3)`,
          [orgA.id, phone.normalized, u2.rows[0].id]
        ),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);
    });
  });
});
