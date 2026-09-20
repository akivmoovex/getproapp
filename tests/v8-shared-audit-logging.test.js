"use strict";

/**
 * V8 shared platform audit logging — event model, redaction, access, critical writes.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../src/platform/config/deploymentProfiles");
const {
  sanitizeAuditMetadata,
  recordAuditEvent,
  FORBIDDEN_METADATA_KEYS,
} = require("../src/platform/services/auditEventService");
const {
  SHARED_AUDIT_ACTION,
  SHARED_AUDIT_ENTITY,
  SHARED_AUDIT_OUTCOME,
  SHARED_AUDIT_PRODUCT,
  buildSharedAuditEvent,
  auditEventFingerprint,
  recordSharedPlatformAudit,
  recordCriticalPlatformAudit,
  authorizeAuditLogAccess,
  listSharedPlatformAuditEvents,
  redactAuditMetadata,
} = require("../src/platform/audit");
const { recordLifecycleAudit, ACTION } = require("../src/platform/registration/lifecycleAudit");

let pool = null;
let skipReason = null;
let stamp = 0;

async function seedOrg(suffix) {
  stamp += 1;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `v8audit_${suffix}_${stamp}`,
    displayName: `V8 Audit ${suffix}`,
    productKey: "activeclinic",
    productTenantKey: `v8audit-${suffix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  return {
    organizationId: org.records.organization.id,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  };
}

describe("V8 shared audit — redaction and event model", () => {
  it("redacts passwords, OTPs, tokens, and patient clinical fields", () => {
    assert.ok(FORBIDDEN_METADATA_KEYS.includes("password"));
    assert.ok(FORBIDDEN_METADATA_KEYS.includes("otp"));
    assert.ok(FORBIDDEN_METADATA_KEYS.includes("session_secret"));
    assert.ok(FORBIDDEN_METADATA_KEYS.includes("clinical_notes"));

    const sanitized = sanitizeAuditMetadata({
      password: "secret-value",
      otp: "123456",
      session_token: "tok",
      clinical_notes: "patient diagnosis text",
      patient_name: "Ada",
      product_code: "activeclinic",
      role_key: "admin",
      request_id: "corr-1",
      status: "ok",
    });
    assert.equal(sanitized.ok, true);
    assert.equal(sanitized.metadata.password, undefined);
    assert.equal(sanitized.metadata.otp, undefined);
    assert.equal(sanitized.metadata.session_token, undefined);
    assert.equal(sanitized.metadata.clinical_notes, undefined);
    assert.equal(sanitized.metadata.patient_name, undefined);
    assert.equal(sanitized.metadata.product_code, "activeclinic");
    assert.equal(sanitized.metadata.role_key, "admin");
    assert.ok(sanitized.redactedKeys.includes("password"));
    assert.ok(sanitized.redactedKeys.includes("otp"));

    const dual = redactAuditMetadata({ email: "a@b.co", facility_key: "main" });
    assert.equal(dual.ok, true);
    assert.equal(dual.metadata.email, undefined);
    assert.equal(dual.metadata.facility_key, "main");
  });

  it("builds shared envelopes with actor/tenant/target/outcome", () => {
    const envelope = buildSharedAuditEvent({
      actionKey: SHARED_AUDIT_ACTION.ROLE_ASSIGNED,
      outcome: SHARED_AUDIT_OUTCOME.SUCCESS,
      productCode: SHARED_AUDIT_PRODUCT.BLESSBOARD,
      organizationId: "11111111-1111-4111-8111-111111111111",
      churchId: "22222222-2222-4222-8222-222222222222",
      branchId: "33333333-3333-4333-8333-333333333333",
      actorUserId: "44444444-4444-4444-8444-444444444444",
      actorType: "hq_admin",
      entityType: SHARED_AUDIT_ENTITY.ROLE,
      entityId: "55555555-5555-4555-8555-555555555555",
      metadata: { role_key: "branch_admin" },
    });
    assert.equal(envelope.actionKey, SHARED_AUDIT_ACTION.ROLE_ASSIGNED);
    assert.equal(envelope.productCode, "blessboard");
    assert.equal(envelope.tenant.organizationId, "11111111-1111-4111-8111-111111111111");
    assert.equal(envelope.tenant.branchId, "33333333-3333-4333-8333-333333333333");
    assert.equal(envelope.actor.userId, "44444444-4444-4444-8444-444444444444");
    assert.equal(envelope.target.entityType, "role");
    assert.equal(envelope.critical, true);
    assert.ok(envelope.timestamp);

    const a = auditEventFingerprint(envelope);
    const b = auditEventFingerprint(envelope);
    assert.equal(a, b);
  });

  it("denies unauthorized audit log access and allows platform admin", () => {
    const denied = authorizeAuditLogAccess({
      organizationId: "11111111-1111-4111-8111-111111111111",
      grantedPermissions: ["website.edit"],
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "forbidden");

    const mismatch = authorizeAuditLogAccess({
      organizationId: "11111111-1111-4111-8111-111111111111",
      requestedOrganizationId: "22222222-2222-4222-8222-222222222222",
      grantedPermissions: ["audit.view"],
    });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, "tenant_mismatch");

    const admin = authorizeAuditLogAccess({
      isPlatformAdmin: true,
      organizationId: "11111111-1111-4111-8111-111111111111",
    });
    assert.equal(admin.ok, true);
  });
});

describe("V8 shared audit — persistence", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
      pool = null;
    }
  });

  after(async () => {
    if (pool && typeof pool.end === "function") await pool.end().catch(() => {});
  });

  function requireDb() {
    return Boolean(pool) && !skipReason;
  }

  it("records success and failure events with actor/tenant attribution", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ctx = await seedOrg("attr");
    const actorUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const facilityId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    const ok = await recordSharedPlatformAudit(pool, {
      deploymentCode: ctx.deploymentCode,
      organizationId: ctx.organizationId,
      facilityId,
      actorUserId,
      productCode: SHARED_AUDIT_PRODUCT.ACTIVECLINIC,
      actionKey: SHARED_AUDIT_ACTION.AUTH_LOGIN_SUCCESS,
      entityType: SHARED_AUDIT_ENTITY.SESSION,
      outcome: SHARED_AUDIT_OUTCOME.SUCCESS,
      metadata: { facility_key: "main", status: "ok" },
    });
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(ok.event.organizationId, ctx.organizationId);
    assert.equal(ok.event.actorUserId, actorUserId);
    assert.equal(ok.event.facilityId, facilityId);
    assert.equal(ok.event.productCode, "activeclinic");
    assert.equal(ok.event.outcome, "success");

    const fail = await recordSharedPlatformAudit(pool, {
      deploymentCode: ctx.deploymentCode,
      organizationId: ctx.organizationId,
      actorUserId,
      productCode: SHARED_AUDIT_PRODUCT.ACTIVECLINIC,
      actionKey: SHARED_AUDIT_ACTION.AUTH_LOGIN_FAILURE,
      entityType: SHARED_AUDIT_ENTITY.SESSION,
      outcome: SHARED_AUDIT_OUTCOME.FAILURE,
      metadata: { reason_code: "bad_credentials" },
    });
    assert.equal(fail.ok, true);
    assert.equal(fail.event.outcome, "failure");
    assert.equal(fail.event.metadata.password, undefined);
  });

  it("records BB/AC website and registration lifecycle without leaking secrets", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ctx = await seedOrg("lifecycle");
    const published = await recordSharedPlatformAudit(pool, {
      deploymentCode: ctx.deploymentCode,
      organizationId: ctx.organizationId,
      productCode: SHARED_AUDIT_PRODUCT.BLESSBOARD,
      actionKey: SHARED_AUDIT_ACTION.WEBSITE_PUBLISHED,
      entityType: SHARED_AUDIT_ENTITY.WEBSITE,
      entityId: ctx.organizationId,
      outcome: SHARED_AUDIT_OUTCOME.SUCCESS,
      metadata: {
        website_action: "publish",
        password: "must-not-store",
        otp: "999999",
      },
    });
    assert.equal(published.ok, true);
    assert.equal(published.event.metadata.password, undefined);
    assert.equal(published.event.metadata.otp, undefined);
    assert.equal(published.event.metadata.website_action, "publish");
    assert.ok((published.redactedKeys || []).includes("password"));

    const life = await recordLifecycleAudit(pool, {
      deploymentCode: ctx.deploymentCode,
      organizationId: ctx.organizationId,
      actionKey: ACTION.APPROVED,
      productCode: "activeclinic",
      applicationId: ctx.organizationId,
      actorType: "platform_admin",
      metadata: { token: "raw-token-value" },
    });
    assert.equal(life.recorded, true, JSON.stringify(life));
  });

  it("surfaces critical audit write failures instead of concealing them", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ctx = await seedOrg("critical");
    const bad = await recordCriticalPlatformAudit(pool, {
      deploymentCode: "not-a-real-deployment-code",
      organizationId: ctx.organizationId,
      actionKey: SHARED_AUDIT_ACTION.ROLE_ASSIGNED,
      entityType: SHARED_AUDIT_ENTITY.ROLE,
      outcome: SHARED_AUDIT_OUTCOME.SUCCESS,
      productCode: SHARED_AUDIT_PRODUCT.PLATFORM,
    });
    assert.equal(bad.ok, false);
    assert.ok(bad.reason);

    const good = await recordCriticalPlatformAudit(pool, {
      deploymentCode: ctx.deploymentCode,
      organizationId: ctx.organizationId,
      actionKey: SHARED_AUDIT_ACTION.ROLE_ASSIGNED,
      entityType: SHARED_AUDIT_ENTITY.ROLE,
      entityId: ctx.organizationId,
      outcome: SHARED_AUDIT_OUTCOME.SUCCESS,
      productCode: SHARED_AUDIT_PRODUCT.PLATFORM,
      metadata: { role_key: "owner" },
    });
    assert.equal(good.ok, true, JSON.stringify(good));
  });

  it("lists events for authorized readers and blocks unauthorized", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ctx = await seedOrg("list");
    await recordSharedPlatformAudit(pool, {
      deploymentCode: ctx.deploymentCode,
      organizationId: ctx.organizationId,
      actionKey: SHARED_AUDIT_ACTION.ADMIN_STATE_CHANGED,
      entityType: SHARED_AUDIT_ENTITY.ORGANIZATION,
      entityId: ctx.organizationId,
      productCode: SHARED_AUDIT_PRODUCT.PLATFORM,
      outcome: SHARED_AUDIT_OUTCOME.SUCCESS,
      metadata: { status: "updated" },
    });

    const blocked = await listSharedPlatformAuditEvents(pool, {
      organizationId: ctx.organizationId,
      grantedPermissions: [],
      limit: 10,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "forbidden");
    assert.deepEqual(blocked.events, []);

    const listed = await listSharedPlatformAuditEvents(pool, {
      organizationId: ctx.organizationId,
      isPlatformAdmin: true,
      limit: 10,
    });
    assert.equal(listed.ok, true);
    assert.ok((listed.events || []).length >= 1);
  });

  it("supports concurrent audit inserts without duplicate misleading payloads", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ctx = await seedOrg("concurrent");
    const base = {
      deploymentCode: ctx.deploymentCode,
      organizationId: ctx.organizationId,
      productCode: SHARED_AUDIT_PRODUCT.ACTIVECLINIC,
      actionKey: SHARED_AUDIT_ACTION.VERIFY_EMAIL_COMPLETED,
      entityType: SHARED_AUDIT_ENTITY.IDENTITY,
      entityId: ctx.organizationId,
      outcome: SHARED_AUDIT_OUTCOME.SUCCESS,
      metadata: { verification_channel: "email", dedupe_key: "verify-1" },
    };
    const results = await Promise.all([
      recordSharedPlatformAudit(pool, base),
      recordSharedPlatformAudit(pool, {
        ...base,
        metadata: { verification_channel: "email", dedupe_key: "verify-2" },
      }),
      recordSharedPlatformAudit(pool, {
        ...base,
        actionKey: SHARED_AUDIT_ACTION.VERIFY_FAILED,
        outcome: SHARED_AUDIT_OUTCOME.FAILURE,
        metadata: { verification_channel: "email", reason_code: "expired" },
      }),
    ]);
    assert.ok(results.every((r) => r.ok));
    const fingerprints = results.map((r) =>
      auditEventFingerprint({
        actionKey: r.event.actionKey,
        outcome: r.event.outcome,
        organizationId: r.event.organizationId,
        entityType: r.event.entityType,
        entityId: r.event.entityId,
        actorUserId: r.event.actorUserId,
      })
    );
    assert.equal(new Set(fingerprints).size >= 2, true);
  });

  it("preserves V7 recordAuditEvent contract for legacy callers", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ctx = await seedOrg("legacy");
    const legacy = await recordAuditEvent(pool, {
      deploymentCode: ctx.deploymentCode,
      organizationId: ctx.organizationId,
      actionKey: "platform.team.invite",
      entityType: "user",
      outcome: "success",
      metadata: { status: "sent", password: "nope" },
    });
    assert.equal(legacy.ok, true);
    assert.equal(legacy.event.actionKey, "platform.team.invite");
    assert.equal(legacy.event.metadata.password, undefined);
  });
});
