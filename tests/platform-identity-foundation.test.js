"use strict";

/**
 * ActiveClinic V6 — platform identity foundation (AC-V6-04).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  createPlatformIdentity,
  resolvePlatformIdentity,
  RESULT: IDENTITY_RESULT,
} = require("../src/platform/services/platformIdentityService");
const {
  linkIdentityToProductProfile,
  listProductProfilesForIdentity,
  resolveProductProfileForIdentity,
  unlinkIdentityProductProfile,
  RESULT: LINK_RESULT,
} = require("../src/platform/services/identityProductProfileService");
const {
  adaptBlessBoardAuthUser,
  resolveSessionPrincipal,
} = require("../src/blessboard/services/blessBoardIdentityCompatibility");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_ORG_STAGING,
} = require("../src/platform/config/deploymentProfiles");

let pool;
let databaseUrl;
let skipReason = null;

function uuid() {
  return crypto.randomUUID();
}

async function insertLegacyBlessBoardUser(email, password) {
  const created = await createBlessBoardUser(pool, {
    email,
    displayName: "Identity Test User",
    password,
  });
  assert.equal(created.status, "created", JSON.stringify(created));
  return created.user;
}

describe("platform identity foundation (AC-V6-04)", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipReason) {
      assert.fail(`Local PostgreSQL unavailable for foundation tests: ${skipReason}`);
    }
  }

  it("creates a platform identity without product access", async () => {
    requireDb();
    const created = await createPlatformIdentity(pool, {
      primaryEmail: `solo_${Date.now()}@example.test`,
    });
    assert.equal(created.ok, true);
    assert.equal(created.identity.hasPasswordHash, false);

    const listed = await listProductProfilesForIdentity(pool, {
      identityId: created.identity.id,
    });
    assert.equal(listed.ok, true);
    assert.equal(listed.links.length, 0);

    const resolved = await resolvePlatformIdentity(pool, {
      identityId: created.identity.id,
    });
    assert.equal(resolved.ok, true);
  });

  it("allows optional phone and email when requireContact is not set", async () => {
    requireDb();
    const created = await createPlatformIdentity(pool, {});
    assert.equal(created.ok, true);
    assert.equal(created.identity.emailNormalized, null);
    assert.equal(created.identity.phoneNormalized, null);
  });

  it("rejects invalid status and duplicate verified contacts", async () => {
    requireDb();
    const bad = await createPlatformIdentity(pool, { status: "invited" });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, IDENTITY_RESULT.INVALID_STATUS);

    const phone = `+1555${String(Date.now()).slice(-7)}`;
    const first = await createPlatformIdentity(pool, {
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    assert.equal(first.ok, true);

    const dupPhone = await createPlatformIdentity(pool, {
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    assert.equal(dupPhone.ok, false);
    assert.equal(dupPhone.code, IDENTITY_RESULT.DUPLICATE_VERIFIED_PHONE);

    const email = `dup_${Date.now()}@example.test`;
    const e1 = await createPlatformIdentity(pool, {
      emailNormalized: email,
      emailVerifiedAt: new Date().toISOString(),
    });
    assert.equal(e1.ok, true);
    const e2 = await createPlatformIdentity(pool, {
      emailNormalized: email,
      emailVerifiedAt: new Date().toISOString(),
    });
    assert.equal(e2.ok, false);
    assert.equal(e2.code, IDENTITY_RESULT.DUPLICATE_VERIFIED_EMAIL);
  });

  it("links one identity to BlessBoard and ActiveClinic without granting access by existence", async () => {
    requireDb();
    const stamp = Date.now();
    const password = `Pw-${stamp}-abcdef`;
    const bbUser = await insertLegacyBlessBoardUser(`bb_${stamp}@example.test`, password);
    const identity = await createPlatformIdentity(pool, {
      primaryEmail: `id_${stamp}@example.test`,
    });
    assert.equal(identity.ok, true);

    const bbLink = await linkIdentityToProductProfile(pool, {
      identityId: identity.identity.id,
      productKey: "blessboard",
      productProfileId: bbUser.id,
    });
    assert.equal(bbLink.ok, true, JSON.stringify(bbLink));

    const acOrg = await provisionPlatformTenant(pool, {
      organizationKey: `ac_id_${stamp}`,
      displayName: "AC Identity Link Org",
      productKey: "activeclinic",
      productTenantKey: `ac-id-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      skipDomain: true,
    });
    assert.equal(acOrg.ok, true);
    const hco = await createHealthcareOrganization(pool, {
      organizationId: acOrg.records.organization.id,
      legalName: "AC Legal",
      publicName: "AC Public",
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    assert.equal(hco.ok, true);
    const staff = await createStaffMember(pool, {
      organizationId: acOrg.records.organization.id,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      firstName: "Ada",
      lastName: "Clinic",
      employmentType: "permanent",
      status: "invited",
      phone: "+260971111111",
    });
    assert.equal(staff.ok, true, JSON.stringify(staff));

    const acLink = await linkIdentityToProductProfile(pool, {
      identityId: identity.identity.id,
      productKey: "activeclinic",
      productProfileId: staff.staffMember.id,
    });
    assert.equal(acLink.ok, true, JSON.stringify(acLink));

    const both = await listProductProfilesForIdentity(pool, {
      identityId: identity.identity.id,
    });
    assert.equal(both.links.length, 2);

    const resolvedBb = await resolveProductProfileForIdentity(pool, {
      identityId: identity.identity.id,
      productKey: "blessboard",
    });
    assert.equal(resolvedBb.ok, true);
    assert.equal(resolvedBb.link.productProfileId, bbUser.id);

    const acLinks = both.links.filter((l) => l.productKey === "activeclinic");
    assert.equal(acLinks.length, 1);
    assert.equal(acLinks[0].productProfileId, staff.staffMember.id);
  });

  it("rejects duplicate product links and multi-identity profile ownership", async () => {
    requireDb();
    const stamp = Date.now() + 1;
    const bbUser = await insertLegacyBlessBoardUser(`dup_${stamp}@example.test`, `Pw-${stamp}-abcdef`);
    const id1 = await createPlatformIdentity(pool, {});
    const id2 = await createPlatformIdentity(pool, {});
    assert.equal(id1.ok, true);
    assert.equal(id2.ok, true);

    const first = await linkIdentityToProductProfile(pool, {
      identityId: id1.identity.id,
      productKey: "blessboard",
      productProfileId: bbUser.id,
    });
    assert.equal(first.ok, true);

    const otherBb = await insertLegacyBlessBoardUser(`dup2_${stamp}@example.test`, `Pw-${stamp}-xyzabc`);
    const dupProduct = await linkIdentityToProductProfile(pool, {
      identityId: id1.identity.id,
      productKey: "blessboard",
      productProfileId: otherBb.id,
    });
    assert.equal(dupProduct.ok, false);
    assert.equal(dupProduct.code, LINK_RESULT.DUPLICATE_LINK);

    const stolen = await linkIdentityToProductProfile(pool, {
      identityId: id2.identity.id,
      productKey: "blessboard",
      productProfileId: bbUser.id,
    });
    assert.equal(stolen.ok, false);
    assert.equal(stolen.code, LINK_RESULT.PROFILE_ALREADY_LINKED);
  });

  it("keeps BlessBoard password on profile and does not copy hash on link", async () => {
    requireDb();
    const stamp = Date.now() + 2;
    const password = `Pw-${stamp}-hashchk`;
    const bbUser = await insertLegacyBlessBoardUser(`hash_${stamp}@example.test`, password);
    const before = await pool.query(
      `SELECT password_hash, platform_identity_id FROM blessboard.users WHERE id = $1`,
      [bbUser.id]
    );
    const hashBefore = before.rows[0].password_hash;
    assert.ok(hashBefore);
    assert.equal(await bcrypt.compare(password, hashBefore), true);

    const identity = await createPlatformIdentity(pool, {});
    await linkIdentityToProductProfile(pool, {
      identityId: identity.identity.id,
      productKey: "blessboard",
      productProfileId: bbUser.id,
    });

    const after = await pool.query(
      `SELECT u.password_hash AS user_hash, i.password_hash AS identity_hash
         FROM blessboard.users u
         JOIN platform.identities i ON i.id = u.platform_identity_id
        WHERE u.id = $1`,
      [bbUser.id]
    );
    assert.equal(after.rows[0].user_hash, hashBefore);
    assert.equal(after.rows[0].identity_hash, null);
  });

  it("adapts linked and unlinked BlessBoard users without changing login shape", async () => {
    requireDb();
    const stamp = Date.now() + 3;
    const unlinked = await insertLegacyBlessBoardUser(`ul_${stamp}@example.test`, `Pw-${stamp}-unlinked`);
    const unlinkedRow = await pool.query(`SELECT * FROM blessboard.users WHERE id = $1`, [
      unlinked.id,
    ]);
    const adaptedUnlinked = await adaptBlessBoardAuthUser(pool, unlinkedRow.rows[0]);
    assert.equal(adaptedUnlinked.platformUserId, null);
    assert.equal(adaptedUnlinked.linkedProducts.length, 0);
    assert.equal(adaptedUnlinked.user.id, unlinked.id);
    assert.equal(adaptedUnlinked.user.hasPasswordHash, true);

    const linkedUser = await insertLegacyBlessBoardUser(`lk_${stamp}@example.test`, `Pw-${stamp}-linked`);
    const identity = await createPlatformIdentity(pool, {});
    await linkIdentityToProductProfile(pool, {
      identityId: identity.identity.id,
      productKey: "blessboard",
      productProfileId: linkedUser.id,
    });
    const row = await pool.query(`SELECT * FROM blessboard.users WHERE id = $1`, [linkedUser.id]);
    const adaptedLinked = await adaptBlessBoardAuthUser(pool, row.rows[0]);
    assert.equal(adaptedLinked.platformUserId, identity.identity.id);
    assert.ok(adaptedLinked.linkedProducts.some((p) => p.productKey === "blessboard"));
  });

  it("resolves legacy sessions and rejects ambiguous principals", async () => {
    requireDb();
    const stamp = Date.now() + 4;
    const bbUser = await insertLegacyBlessBoardUser(`sess_${stamp}@example.test`, `Pw-${stamp}-session`);
    const session = await createV5Session(pool, {
      deploymentCode: CODE_ORG_STAGING,
      userId: bbUser.id,
    });
    assert.equal(session.ok, true);

    const legacy = await resolveSessionPrincipal(pool, session.session);
    assert.equal(legacy.ok, true);
    assert.equal(legacy.principal.kind, "blessboard_user");

    const identity = await createPlatformIdentity(pool, {});
    const ambiguous = await resolveSessionPrincipal(pool, {
      user_id: bbUser.id,
      platform_identity_id: identity.identity.id,
    });
    assert.equal(ambiguous.ok, false);
    assert.equal(ambiguous.code, "ambiguous_principal");

    await linkIdentityToProductProfile(pool, {
      identityId: identity.identity.id,
      productKey: "blessboard",
      productProfileId: bbUser.id,
    });
    const linked = await resolveSessionPrincipal(pool, {
      user_id: bbUser.id,
      platform_identity_id: identity.identity.id,
    });
    assert.equal(linked.ok, true);
    assert.equal(linked.principal.kind, "linked");

    const col = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'deployment_sessions'
          AND column_name = 'platform_identity_id'`
    );
    assert.equal(col.rowCount, 1);

    // ActiveClinic cookie / deployment isolation remains a deployment concern
    assert.notEqual(CODE_ACTIVECLINIC_ORG_V6, CODE_ORG_STAGING);
  });

  it("denies disabled platform identity on shared resolve path", async () => {
    requireDb();
    const created = await createPlatformIdentity(pool, {
      status: "suspended",
      primaryEmail: `susp_${Date.now()}@example.test`,
    });
    assert.equal(created.ok, true);
    const resolved = await resolvePlatformIdentity(pool, {
      identityId: created.identity.id,
      requireActive: true,
    });
    assert.equal(resolved.ok, false);
    assert.equal(resolved.code, IDENTITY_RESULT.DISABLED);
  });

  it("supports unlink without deleting the identity", async () => {
    requireDb();
    const stamp = Date.now() + 5;
    const bbUser = await insertLegacyBlessBoardUser(`unl_${stamp}@example.test`, `Pw-${stamp}-unlink`);
    const identity = await createPlatformIdentity(pool, {});
    await linkIdentityToProductProfile(pool, {
      identityId: identity.identity.id,
      productKey: "blessboard",
      productProfileId: bbUser.id,
    });
    const unlinked = await unlinkIdentityProductProfile(pool, {
      identityId: identity.identity.id,
      productKey: "blessboard",
    });
    assert.equal(unlinked.ok, true);
    assert.equal(unlinked.link.status, "revoked");

    const still = await resolvePlatformIdentity(pool, {
      identityId: identity.identity.id,
    });
    assert.equal(still.ok, true);

    const user = await pool.query(
      `SELECT platform_identity_id FROM blessboard.users WHERE id = $1`,
      [bbUser.id]
    );
    assert.equal(user.rows[0].platform_identity_id, null);
  });
});
