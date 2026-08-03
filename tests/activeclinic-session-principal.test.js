"use strict";

/**
 * ActiveClinic V6 — session & auth-transfer principal migration (AC-V6-07).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const {
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  linkIdentityToProductProfile,
} = require("../src/platform/services/identityProductProfileService");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { readV5Session } = require("../src/platform/session/readV5Session");
const {
  createDeploymentSession,
  createBlessBoardSession,
  createPlatformIdentitySession,
  RESULT: SESSION_WRITE_RESULT,
} = require("../src/platform/session/createDeploymentSession");
const {
  resolveDeploymentSessionPrincipal,
  RESULT: PRINCIPAL_RESULT,
} = require("../src/platform/session/resolveDeploymentSessionPrincipal");
const {
  revokeV5Session,
  revokeSessionsByBlessBoardUser,
  revokeSessionsByPlatformIdentity,
} = require("../src/platform/session/revokeV5Session");
const {
  createActiveClinicLoginTransferRequest,
  issueActiveClinicLoginRedeemCode,
  redeemActiveClinicLoginTransfer,
  PURPOSE_ACTIVECLINIC_LOGIN,
} = require("../src/platform/services/platformIdentityAuthTransferService");
const {
  createTenantLoginTransferRequest,
  PURPOSE_TENANT_LOGIN,
} = require("../src/platform/services/authTransferService");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_ORG_STAGING,
  COOKIE_ACTIVECLINIC_ORG,
  COOKIE_ORG,
  getDeploymentProfile,
} = require("../src/platform/config/deploymentProfiles");

let pool;
let databaseUrl;
let skipReason = null;

async function bbUser(stamp, suffix) {
  const created = await createBlessBoardUser(pool, {
    email: `sess_${stamp}_${suffix}@example.test`,
    displayName: `Session ${suffix}`,
    password: `Pw-${stamp}-${suffix}`,
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  return created.user;
}

async function acOrg(stamp) {
  const result = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `ac_sess_${stamp}`,
    displayName: "AC Session Org",
    productKey: "activeclinic",
    productTenantKey: `ac-sess-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.records.organization;
}

describe("ActiveClinic session principal migration (AC-V6-07)", () => {
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
      assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
    }
  }

  it("database constraints: principal presence, indexes, and transfer columns", async () => {
    requireDb();
    const check = await pool.query(
      `SELECT 1 FROM pg_constraint
        WHERE conname = 'deployment_sessions_principal_present'`
    );
    assert.equal(check.rowCount, 1);

    const idx = await pool.query(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'platform'
          AND tablename = 'deployment_sessions'
          AND indexname IN (
            'deployment_sessions_platform_identity_id_idx',
            'deployment_sessions_deployment_identity_idx',
            'deployment_sessions_user_id_idx'
          )`
    );
    assert.equal(idx.rowCount, 3);

    const col = await pool.query(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'auth_transfers'
          AND column_name IN ('platform_identity_id', 'church_id', 'user_id')
        ORDER BY column_name`
    );
    assert.equal(col.rowCount, 3);
    const byName = Object.fromEntries(
      (
        await pool.query(
          `SELECT column_name, is_nullable FROM information_schema.columns
            WHERE table_schema = 'platform'
              AND table_name = 'auth_transfers'
              AND column_name IN ('platform_identity_id', 'church_id', 'user_id')`
        )
      ).rows.map((r) => [r.column_name, r.is_nullable])
    );
    assert.equal(byName.platform_identity_id, "YES");
    assert.equal(byName.church_id, "YES");
    assert.equal(byName.user_id, "YES");

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO platform.deployment_sessions
             (session_token_hash, deployment_code, user_id, platform_identity_id, expires_at)
           VALUES (repeat('a', 64), $1, NULL, NULL, now() + interval '1 hour')`,
          [CODE_ORG_STAGING]
        ),
      /principal_present|check constraint/i
    );
  });

  it("accepts BlessBoard legacy, linked, and ActiveClinic identity session rows", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const user = await bbUser(stamp, "legacy");
    const identity = await createPlatformIdentity(pool, {
      primaryEmail: `id_${stamp}@example.test`,
    });
    assert.equal(identity.ok, true);

    const legacy = await createBlessBoardSession(pool, {
      deploymentCode: CODE_ORG_STAGING,
      userId: user.id,
    });
    assert.equal(legacy.ok, true, JSON.stringify(legacy));
    assert.equal(legacy.session.user_id, user.id);
    assert.equal(legacy.session.platform_identity_id, null);

    await linkIdentityToProductProfile(pool, {
      identityId: identity.identity.id,
      productKey: "blessboard",
      productProfileId: user.id,
    });
    const linked = await createBlessBoardSession(pool, {
      deploymentCode: CODE_ORG_STAGING,
      userId: user.id,
      platformIdentityId: identity.identity.id,
    });
    assert.equal(linked.ok, true, JSON.stringify(linked));
    assert.equal(linked.session.platform_identity_id, identity.identity.id);

    const acIdentity = await createPlatformIdentity(pool, {
      primaryEmail: `ac_${stamp}@example.test`,
    });
    const org = await acOrg(stamp);
    const acSession = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: acIdentity.identity.id,
      organizationId: org.id,
    });
    assert.equal(acSession.ok, true, JSON.stringify(acSession));
    assert.equal(acSession.session.user_id, null);
    assert.equal(acSession.session.platform_identity_id, acIdentity.identity.id);
  });

  it("rejects conflicting dual principals and blessboard-only on ActiveClinic", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const user = await bbUser(stamp, "conflict");
    const identity = await createPlatformIdentity(pool, {
      primaryEmail: `conf_${stamp}@example.test`,
    });
    const mismatched = await createDeploymentSession(pool, {
      deploymentCode: CODE_ORG_STAGING,
      principalType: "linked",
      blessboardUserId: user.id,
      platformIdentityId: identity.identity.id,
    });
    assert.equal(mismatched.ok, false);
    assert.equal(mismatched.code, SESSION_WRITE_RESULT.CONFLICTING_PRINCIPAL);

    const bbOnAc = await createDeploymentSession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      principalType: "blessboard_user",
      blessboardUserId: user.id,
    });
    assert.equal(bbOnAc.ok, false);
    assert.equal(bbOnAc.code, SESSION_WRITE_RESULT.INVALID_BLESSBOARD_ONLY);

    const acOnBb = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ORG_STAGING,
      platformIdentityId: identity.identity.id,
    });
    assert.equal(acOnBb.ok, false);
    assert.equal(acOnBb.code, SESSION_WRITE_RESULT.PRODUCT_MISMATCH);
  });

  it("resolver: legacy, linked, identity-only, denials", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const user = await bbUser(stamp, "resolve");
    const identity = await createPlatformIdentity(pool, {
      primaryEmail: `res_${stamp}@example.test`,
    });

    const legacy = await resolveDeploymentSessionPrincipal(
      pool,
      { user_id: user.id, platform_identity_id: null },
      { deploymentApplicationCode: "blessboard" }
    );
    assert.equal(legacy.ok, true);
    assert.equal(legacy.principal.principalType, "blessboard_user");
    assert.ok(legacy.principal.blessboardUser);

    await linkIdentityToProductProfile(pool, {
      identityId: identity.identity.id,
      productKey: "blessboard",
      productProfileId: user.id,
    });
    const linked = await resolveDeploymentSessionPrincipal(
      pool,
      { user_id: user.id, platform_identity_id: identity.identity.id },
      { deploymentApplicationCode: "blessboard" }
    );
    assert.equal(linked.ok, true);
    assert.equal(linked.principal.principalType, "linked");

    const other = await createPlatformIdentity(pool, {
      primaryEmail: `other_${stamp}@example.test`,
    });
    const ambiguous = await resolveDeploymentSessionPrincipal(
      pool,
      { user_id: user.id, platform_identity_id: other.identity.id },
      { deploymentApplicationCode: "blessboard" }
    );
    assert.equal(ambiguous.ok, false);
    assert.equal(ambiguous.code, PRINCIPAL_RESULT.AMBIGUOUS_PRINCIPAL);

    const missing = await resolveDeploymentSessionPrincipal(pool, {
      user_id: null,
      platform_identity_id: null,
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, PRINCIPAL_RESULT.MISSING_PRINCIPAL);

    const acId = await createPlatformIdentity(pool, {
      primaryEmail: `acres_${stamp}@example.test`,
    });
    const acOk = await resolveDeploymentSessionPrincipal(
      pool,
      { user_id: null, platform_identity_id: acId.identity.id },
      { deploymentApplicationCode: "activeclinic" }
    );
    assert.equal(acOk.ok, true);
    assert.equal(acOk.principal.principalType, "platform_identity");
    assert.equal(acOk.principal.blessboardUser, null);

    const wrongProduct = await resolveDeploymentSessionPrincipal(
      pool,
      { user_id: null, platform_identity_id: acId.identity.id },
      { deploymentApplicationCode: "blessboard" }
    );
    assert.equal(wrongProduct.ok, false);
    assert.equal(wrongProduct.code, PRINCIPAL_RESULT.PRODUCT_MISMATCH);

    const bbOnAc = await resolveDeploymentSessionPrincipal(
      pool,
      { user_id: user.id, platform_identity_id: null },
      { deploymentApplicationCode: "activeclinic" }
    );
    assert.equal(bbOnAc.ok, false);

    const suspended = await createPlatformIdentity(pool, {
      status: "suspended",
      primaryEmail: `susp_sess_${stamp}@example.test`,
    });
    const disabled = await resolveDeploymentSessionPrincipal(
      pool,
      { user_id: null, platform_identity_id: suspended.identity.id },
      { deploymentApplicationCode: "activeclinic" }
    );
    assert.equal(disabled.ok, false);
    assert.equal(disabled.code, PRINCIPAL_RESULT.IDENTITY_DISABLED);
  });

  it("readV5Session supports platform-identity sessions without blessboard.users", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const acId = await createPlatformIdentity(pool, {
      primaryEmail: `read_${stamp}@example.test`,
    });
    const org = await acOrg(`${stamp}r`);
    const created = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: acId.identity.id,
      organizationId: org.id,
    });
    assert.equal(created.ok, true);

    const read = await readV5Session(pool, {
      rawToken: created.rawToken,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      touch: true,
    });
    assert.equal(read.ok, true, JSON.stringify(read));
    assert.equal(read.session.principalType, "platform_identity");
    assert.equal(read.session.userId, null);
    assert.equal(read.session.user, null);
    assert.equal(read.session.platformIdentityId, acId.identity.id);

    const user = await bbUser(stamp, "readbb");
    const bbCreated = await createV5Session(pool, {
      deploymentCode: CODE_ORG_STAGING,
      userId: user.id,
    });
    const bbRead = await readV5Session(pool, {
      rawToken: bbCreated.rawToken,
      deploymentCode: CODE_ORG_STAGING,
    });
    assert.equal(bbRead.ok, true);
    assert.equal(bbRead.session.principalType, "blessboard_user");
    assert.equal(bbRead.session.user.id, user.id);
  });

  it("cookie names remain deployment-specific", async () => {
    requireDb();
    const bbProfile = getDeploymentProfile({
      PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING,
    });
    const acProfile = getDeploymentProfile({
      PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(bbProfile.sessionCookieName, COOKIE_ORG);
    assert.equal(acProfile.sessionCookieName, COOKIE_ACTIVECLINIC_ORG);
    assert.notEqual(bbProfile.sessionCookieName, acProfile.sessionCookieName);
  });

  it("revocation is deployment-scoped by default", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const user = await bbUser(stamp, "rev");
    const identity = await createPlatformIdentity(pool, {
      primaryEmail: `rev_${stamp}@example.test`,
    });
    await linkIdentityToProductProfile(pool, {
      identityId: identity.identity.id,
      productKey: "blessboard",
      productProfileId: user.id,
    });

    const bbSess = await createBlessBoardSession(pool, {
      deploymentCode: CODE_ORG_STAGING,
      userId: user.id,
      platformIdentityId: identity.identity.id,
    });
    const org = await acOrg(`${stamp}v`);
    const acSess = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: identity.identity.id,
      organizationId: org.id,
    });
    assert.equal(bbSess.ok, true);
    assert.equal(acSess.ok, true);

    const revAc = await revokeSessionsByPlatformIdentity(pool, {
      platformIdentityId: identity.identity.id,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(revAc.revokedCount, 1);

    const bbStill = await readV5Session(pool, {
      rawToken: bbSess.rawToken,
      deploymentCode: CODE_ORG_STAGING,
    });
    assert.equal(bbStill.ok, true);

    const acGone = await readV5Session(pool, {
      rawToken: acSess.rawToken,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(acGone.ok, false);

    const revBb = await revokeSessionsByBlessBoardUser(pool, {
      userId: user.id,
      deploymentCode: CODE_ORG_STAGING,
    });
    assert.equal(revBb.revokedCount, 1);

    const tokenRev = await revokeV5Session(pool, {
      rawToken: "unused",
      deploymentCode: CODE_ORG_STAGING,
    });
    assert.equal(tokenRev.ok, true);
  });

  it("disabled identity cannot use an existing ActiveClinic session", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const identity = await createPlatformIdentity(pool, {
      primaryEmail: `dis_${stamp}@example.test`,
    });
    const org = await acOrg(`${stamp}d`);
    const created = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: identity.identity.id,
      organizationId: org.id,
    });
    assert.equal(created.ok, true);

    await pool.query(
      `UPDATE platform.identities
          SET status = 'suspended', suspended_at = now()
        WHERE id = $1`,
      [identity.identity.id]
    );

    const read = await readV5Session(pool, {
      rawToken: created.rawToken,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(read.ok, false);
    assert.equal(read.code, "inactive_identity");
  });

  it("ActiveClinic auth transfer: create, redeem once, deny cross-product and expiry", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const org = await acOrg(`${stamp}t`);
    const identity = await createPlatformIdentity(pool, {
      primaryEmail: `xfer_${stamp}@example.test`,
    });

    const pending = await createActiveClinicLoginTransferRequest(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      hostname: "activeclinic.org",
      organizationId: org.id,
    });
    assert.equal(pending.ok, true, JSON.stringify(pending));
    assert.equal(pending.transfer.purpose, PURPOSE_ACTIVECLINIC_LOGIN);
    assert.equal(pending.transfer.churchId, null);
    assert.equal(pending.transfer.userId, null);

    const issued = await issueActiveClinicLoginRedeemCode(pool, {
      rawRequestToken: pending.rawToken,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: identity.identity.id,
    });
    assert.equal(issued.ok, true, JSON.stringify(issued));
    assert.equal(issued.transfer.platformIdentityId, identity.identity.id);

    const redeemed = await redeemActiveClinicLoginTransfer(pool, {
      rawToken: issued.rawToken,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      hostname: "activeclinic.org",
      organizationId: org.id,
    });
    assert.equal(redeemed.ok, true, JSON.stringify(redeemed));
    assert.ok(redeemed.rawSessionToken);

    const again = await redeemActiveClinicLoginTransfer(pool, {
      rawToken: issued.rawToken,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      hostname: "activeclinic.org",
      organizationId: org.id,
    });
    assert.equal(again.ok, false);
    assert.equal(again.status, "consumed");

    const cross = await createActiveClinicLoginTransferRequest(pool, {
      deploymentCode: CODE_ORG_STAGING,
      hostname: "blessboard.org",
      organizationId: org.id,
    });
    assert.equal(cross.ok, false);

    const bbPending = await createTenantLoginTransferRequest(pool, {
      deploymentCode: CODE_ORG_STAGING,
      hostname: "demo.blessboard.org",
      organizationId: org.id,
      churchId: "00000000-0000-4000-8000-000000000001",
    });
    // May fail on church FK — either invalid_input/lookup_error is fine; purpose must stay BB-only.
    if (bbPending.ok) {
      assert.equal(bbPending.transfer.purpose, PURPOSE_TENANT_LOGIN);
    }

    const expiredPending = await createActiveClinicLoginTransferRequest(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      hostname: "activeclinic.org",
      organizationId: org.id,
    });
    assert.equal(expiredPending.ok, true);
    await pool.query(
      `UPDATE platform.auth_transfers
          SET created_at = now() - interval '10 minutes',
              expires_at = now() - interval '1 minute'
        WHERE id = $1`,
      [expiredPending.transfer.id]
    );
    const expiredIssue = await issueActiveClinicLoginRedeemCode(pool, {
      rawRequestToken: expiredPending.rawToken,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: identity.identity.id,
    });
    assert.equal(expiredIssue.ok, false);
    assert.equal(expiredIssue.status, "expired");
  });

  it("mismatched linked dual principal is denied at read time", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const user = await bbUser(stamp, "misread");
    const identity = await createPlatformIdentity(pool, {
      primaryEmail: `mis_${stamp}@example.test`,
    });
    // Force-insert conflicting dual principal (bypass writer) to assert resolver denial.
    const tokenHash = "b".repeat(64);
    await pool.query(
      `INSERT INTO platform.deployment_sessions
         (session_token_hash, deployment_code, user_id, platform_identity_id, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '1 hour')`,
      [tokenHash, CODE_ORG_STAGING, user.id, identity.identity.id]
    );
    const principal = await resolveDeploymentSessionPrincipal(
      pool,
      { user_id: user.id, platform_identity_id: identity.identity.id },
      { deploymentApplicationCode: "blessboard" }
    );
    assert.equal(principal.ok, false);
    assert.equal(principal.code, PRINCIPAL_RESULT.AMBIGUOUS_PRINCIPAL);
  });
});
