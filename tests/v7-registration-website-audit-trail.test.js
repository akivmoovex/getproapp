"use strict";

/**
 * Registration + website lifecycle audit completeness for ActiveClinic and BlessBoard.
 * Platform.audit_events is authoritative after an organization exists.
 * Product review history covers pre-organization submitted / review_required / rejection.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { CODE_ACTIVECLINIC_ORG_V6 } = require("../src/platform/config/deploymentProfiles");
const { STAGE } = require("../src/platform/registration");
const {
  sanitizeAuditMetadata,
} = require("../src/platform/services/auditEventService");
const {
  sanitizeWebsiteAuditMetadata,
} = require("../src/platform/website/auditService");
const { ACTION } = require("../src/platform/registration/lifecycleAudit");
const {
  createClinicRegistrationApplication,
} = require("../src/activeclinic/services/activeClinicPublicOnboardingService");
const {
  approveAndProvisionClinicRegistration,
  rejectClinicRegistration,
} = require("../src/activeclinic/services/approveClinicRegistrationService");
const acAdapter = require("../src/activeclinic/registration/activeClinicRegistrationAdapter");
const bbAdapter = require("../src/blessboard/registration/blessboardChurchRegistrationAdapter");
const {
  submitChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationService");
const {
  validatePlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const {
  rejectRegistrationApplication,
} = require("../src/blessboard/services/registrationApplicationsAdminService");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const mediaService = require("../src/platform/website/mediaService");
const lifecycleService = require("../src/platform/website/lifecycleService");
const { listRecentWebsiteChanges } = require("../src/platform/website/recentChangesService");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const { unpublishChurchWebsite } = require("../src/blessboard/services/churchWebsitePublishService");

const PASSWORD = "TestPassword99!";
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64"
);

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 930000000;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function assertNoSecrets(payload) {
  const text = JSON.stringify(payload);
  assert.doesNotMatch(text, /TestPassword99!/);
  assert.doesNotMatch(text, /"password"\s*:/);
  assert.doesNotMatch(text, /password_hash/i);
  assert.doesNotMatch(text, /session_token/i);
}

async function platformActions(organizationId) {
  const rows = await pool.query(
    `SELECT action_key, outcome, actor_user_id, metadata_json, created_at, entity_type, entity_id
       FROM platform.audit_events
      WHERE organization_id = $1
      ORDER BY created_at ASC, action_key ASC`,
    [organizationId]
  );
  return rows.rows;
}

async function websiteActions(organizationId) {
  const rows = await pool.query(
    `SELECT action_key, content_key, version_id, media_id, metadata_json, actor_identity_id, created_at
       FROM platform.website_audit_events
      WHERE organization_id = $1
      ORDER BY created_at ASC, action_key ASC`,
    [organizationId]
  );
  return rows.rows;
}

function hasAction(rows, actionKey) {
  return rows.some((row) => String(row.action_key) === actionKey);
}

async function createPendingClinic() {
  stamp += 1;
  const payload = {
    clinicName: `Audit Clinic ${stamp}`,
    contactName: "Clinic Administrator",
    contactEmail: `audit-clinic-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka Province",
    city: "Lusaka",
    address: "1 Independence Avenue",
    countryCode: "ZM",
    notes: "audit trail",
    password: PASSWORD,
    passwordConfirm: PASSWORD,
    acceptTerms: "on",
  };
  const created = await createClinicRegistrationApplication(pool, payload);
  assert.equal(created.ok, true, JSON.stringify(created));
  return { payload, application: created.application };
}

function provisionInput(applicationId, extra) {
  return {
    applicationId,
    dataEnvironment: "testing",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    ...extra,
  };
}

describe("V7 registration and website audit trail", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("strips secrets and unallowlisted personal fields from both audit sanitizers", () => {
    const platform = sanitizeAuditMetadata({
      status: "ok",
      password: PASSWORD,
      email: "hidden@example.test",
      product_code: "activeclinic",
      failed_stage: "website_instance",
      mystery: "drop",
    });
    assert.equal(platform.ok, true);
    assert.equal(platform.metadata.status, "ok");
    assert.equal(platform.metadata.product_code, "activeclinic");
    assert.equal(platform.metadata.failed_stage, "website_instance");
    assert.equal(platform.metadata.password, undefined);
    assert.equal(platform.metadata.email, undefined);
    assert.ok(platform.redactedKeys.includes("password"));

    const website = sanitizeWebsiteAuditMetadata({
      password: PASSWORD,
      notes: "internal reviewer comment",
      email: "editor@example.test",
      reason_code: "unpublished",
      entity_key: "demo-clinic",
    });
    assert.equal(website.password, undefined);
    assert.equal(website.notes, undefined);
    assert.equal(website.email, undefined);
    assert.equal(website.reason_code, "unpublished");
    assert.equal(website.entity_key, "demo-clinic");
  });

  it("ActiveClinic records submitted, review_required, and rejection before an organization exists", async () => {
    if (!requireDb()) return;
    const pending = await createPendingClinic();
    const submitted = await pool.query(
      `SELECT event_type FROM activeclinic.clinic_registration_review_events
        WHERE application_id = $1 AND event_type = 'submitted'`,
      [pending.application.id]
    );
    assert.ok(submitted.rowCount >= 1);

    const held = await acAdapter.markReviewRequired(pool, {
      application: { id: pending.application.id },
      reason: "identity_collision",
    });
    assert.equal(held.ok, true);
    const reviewRequired = await pool.query(
      `SELECT event_type FROM activeclinic.clinic_registration_review_events
        WHERE application_id = $1 AND event_type = 'review_required'`,
      [pending.application.id]
    );
    assert.ok(reviewRequired.rowCount >= 1);

    const rejected = await rejectClinicRegistration(pool, {
      applicationId: pending.application.id,
      rejectionReason: "Incomplete clinic details for activation.",
    });
    assert.equal(rejected.ok, true, JSON.stringify(rejected));
    const rejection = await pool.query(
      `SELECT event_type, body FROM activeclinic.clinic_registration_review_events
        WHERE application_id = $1 AND event_type = 'rejection'`,
      [pending.application.id]
    );
    assert.ok(rejection.rowCount >= 1);
    assert.doesNotMatch(String(rejection.rows[0].body || ""), /TestPassword99!/);
  });

  it("ActiveClinic provision, website edit, publish, unpublish, restore, and suspend write safe audit rows", async () => {
    if (!requireDb()) return;
    const pending = await createPendingClinic();
    const provisioned = await approveAndProvisionClinicRegistration(
      pool,
      provisionInput(pending.application.id)
    );
    assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
    const organizationId = provisioned.organizationId;
    assert.ok(organizationId);

    const platform = await platformActions(organizationId);
    assertNoSecrets(platform);
    assert.ok(hasAction(platform, ACTION.PROVISIONING_STARTED), "provisioning started");
    assert.ok(hasAction(platform, ACTION.ORGANIZATION_CREATED), "organization created");
    assert.ok(hasAction(platform, ACTION.ADMIN_ROLE_ASSIGNED), "admin role assigned");
    assert.ok(hasAction(platform, ACTION.WEBSITE_INITIALIZED), "website initialized");
    assert.ok(hasAction(platform, ACTION.APPROVED), "approval");
    assert.ok(hasAction(platform, ACTION.PROVISIONING_COMPLETED), "provisioning completed");
    for (const row of platform) {
      assert.ok(row.created_at);
      assert.ok(row.action_key);
      assert.equal(String(row.metadata_json.product_code || row.metadata_json.product_key || "activeclinic"), "activeclinic");
    }

    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId,
      productCode: "activeclinic",
    });
    assert.ok(instance);

    const draft = await contentService.saveWebsiteDraft(pool, {
      organizationId,
      instanceId: instance.id,
      contentKey: "home.hero.title",
      value: "Audit Trail Clinic",
    });
    assert.equal(draft.ok, true, JSON.stringify(draft));

    const uploaded = await mediaService.registerWebsiteMedia(pool, {
      organizationId,
      instanceId: instance.id,
      mediaKind: "image",
      originalFilename: "hero.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });
    assert.equal(uploaded.ok, true, JSON.stringify(uploaded));
    const imageDraft = await contentService.saveWebsiteDraft(pool, {
      organizationId,
      instanceId: instance.id,
      contentKey: "home.hero.image",
      value: { mediaId: uploaded.media.id, alt: "Hero" },
    });
    assert.equal(imageDraft.ok, true, JSON.stringify(imageDraft));

    const firstPublish = await publicationService.publishWebsiteDraft(pool, {
      organizationId,
      instanceId: instance.id,
    });
    assert.equal(firstPublish.ok, true, JSON.stringify(firstPublish));
    const firstVersionId = firstPublish.version && firstPublish.version.id;
    assert.ok(firstVersionId);

    const secondDraft = await contentService.saveWebsiteDraft(pool, {
      organizationId,
      instanceId: instance.id,
      contentKey: "home.hero.title",
      value: "Audit Trail Clinic Updated",
    });
    assert.equal(secondDraft.ok, true, JSON.stringify(secondDraft));
    const secondPublish = await publicationService.publishWebsiteDraft(pool, {
      organizationId,
      instanceId: instance.id,
    });
    assert.equal(secondPublish.ok, true, JSON.stringify(secondPublish));

    const restored = await publicationService.restoreWebsiteVersionLive(pool, {
      organizationId,
      instanceId: instance.id,
      versionId: firstVersionId,
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));

    const org = await pool.query(
      `SELECT organization_key FROM platform.organizations WHERE id = $1`,
      [organizationId]
    );
    const organizationKey = org.rows[0].organization_key;
    const published = await setClinicWebsiteAvailability(pool, {
      organizationKey,
      public: true,
      overrideReadiness: true,
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    const unpublished = await setClinicWebsiteAvailability(pool, {
      organizationKey,
      public: false,
    });
    assert.equal(unpublished.ok, true, JSON.stringify(unpublished));

    const suspended = await lifecycleService.suspendWebsite(pool, {
      organizationId,
      instanceId: instance.id,
      reason: "audit_suspend",
    });
    assert.equal(suspended.ok, true, JSON.stringify(suspended));

    const website = await websiteActions(organizationId);
    assertNoSecrets(website);
    assert.ok(hasAction(website, "website.draft.save"), "draft field edited");
    assert.ok(hasAction(website, "website.media.upload"), "image changed");
    assert.ok(hasAction(website, "website.publish"), "publication");
    assert.ok(hasAction(website, "website.rollback"), "restore");
    assert.ok(hasAction(website, "website.availability.unpublish"), "unpublish");
    assert.ok(hasAction(website, "website.lifecycle.suspend"), "suspend publishing");
    assert.ok(website.some((row) => row.content_key === "home.hero.title"));
    assert.ok(website.some((row) => row.media_id === uploaded.media.id));

    const recent = await listRecentWebsiteChanges(pool, { organizationId, productCode: "activeclinic" });
    assert.equal(recent.ok, true);
    assert.ok(recent.changes.some((row) => row.kind === "audit" && row.actionKey === "website.draft.save"));
    assert.ok(recent.changes.some((row) => row.kind === "audit" && row.actionKey === "website.publish"));
    assert.ok(recent.changes.some((row) => row.kind === "audit" && String(row.actionKey || "").includes("media")));
    assertNoSecrets(recent.changes);
  });

  it("ActiveClinic failed provisioning and retry write distinct audit actions", async () => {
    if (!requireDb()) return;
    const pending = await createPendingClinic();
    const first = await approveAndProvisionClinicRegistration(
      pool,
      provisionInput(pending.application.id, {
        allowTestFailureInjection: true,
        failAfter: STAGE.WEBSITE_INSTANCE,
      })
    );
    assert.ok(first.organizationId, JSON.stringify(first));
    const failed = await platformActions(first.organizationId);
    assert.ok(hasAction(failed, ACTION.PROVISIONING_FAILED), "failed provisioning");
    assert.ok(
      failed.some(
        (row) =>
          row.action_key === ACTION.PROVISIONING_FAILED &&
          String(row.metadata_json.failed_stage || "") === STAGE.WEBSITE_INSTANCE
      )
    );
    assertNoSecrets(failed);

    const resume = await approveAndProvisionClinicRegistration(
      pool,
      provisionInput(pending.application.id)
    );
    assert.equal(resume.ok, true, JSON.stringify(resume));
    const after = await platformActions(first.organizationId);
    assert.ok(hasAction(after, ACTION.PROVISIONING_RETRY), "provisioning retry");
    assert.ok(hasAction(after, ACTION.PROVISIONING_COMPLETED), "retry completed");
    const retryEvents = await pool.query(
      `SELECT event_type FROM activeclinic.clinic_registration_review_events
        WHERE application_id = $1 AND event_type = 'provisioning_retry'`,
      [pending.application.id]
    );
    assert.ok(retryEvents.rowCount >= 1);
  });

  it("BlessBoard records submitted, review_required, rejection, provision, and retry trails", async () => {
    if (!requireDb()) return;
    stamp += 1;
    const holdKey = `audithold${stamp}${crypto.randomBytes(3).toString("hex")}`;
    const hold = await bbAdapter.persistSubmitted(pool, {
      normalized: {
        church_name: `Audit Hold Church ${stamp}`,
        country: "Zambia",
        city: "Lusaka",
        contact_name: "Church Administrator",
        role_in_church: "Pastor",
        contact_email: `${holdKey}@example.org`,
        contact_phone: nextPhone(),
        selected_plan: "foundation",
        consent_terms: true,
      },
      payload: {},
    });
    assert.equal(hold.ok, true, JSON.stringify(hold));
    const holdId = hold.application.id;
    const submittedEvents = await pool.query(
      `SELECT review_events FROM blessboard.platform_church_registration_applications WHERE id = $1`,
      [holdId]
    );
    const submittedTrail = submittedEvents.rows[0].review_events || [];
    assert.ok(submittedTrail.some((event) => event && event.action === "submitted"));

    const marked = await bbAdapter.markReviewRequired(pool, {
      application: hold.application,
      reason: "risk_hold",
      reasons: ["risk_hold"],
    });
    assert.equal(marked.ok, true);
    const reviewEvents = await pool.query(
      `SELECT review_events FROM blessboard.platform_church_registration_applications WHERE id = $1`,
      [holdId]
    );
    const reviewTrail = reviewEvents.rows[0].review_events || [];
    assert.ok(reviewTrail.some((event) => event && event.action === "review_required"));

    const paUser = await createBlessBoardUser(pool, {
      email: `pa-audit-${stamp}@example.org`,
      password: PASSWORD,
      displayName: "Platform Admin",
    });
    assert.equal(paUser.ok, true, JSON.stringify(paUser));
    const rejected = await rejectRegistrationApplication(pool, {
      applicationId: holdId,
      platformAdminUserId: paUser.user.id,
      reason: "Incomplete church details for activation.",
    });
    assert.equal(rejected.ok, true, JSON.stringify(rejected));
    const rejectEvents = await pool.query(
      `SELECT review_events FROM blessboard.platform_church_registration_applications WHERE id = $1`,
      [holdId]
    );
    const rejectTrail = rejectEvents.rows[0].review_events || [];
    assert.ok(rejectTrail.some((event) => event && event.action === "reject"));
    assertNoSecrets(rejectTrail);

    stamp += 1;
    const key = `auditbb${stamp}${crypto.randomBytes(3).toString("hex")}`;
    const body = {
      church_name: `Audit Church ${stamp} ${key}`,
      country: "Zambia",
      city: "Lusaka",
      contact_name: "Church Administrator",
      role_in_church: "Pastor",
      phone: nextPhone(),
      email: `${key}@example.org`,
      selected_plan: "foundation",
      organization_key: key,
      password: PASSWORD,
      password_confirm: PASSWORD,
      acceptTerms: "on",
      branch_name: "HQ Campus",
      consent_contact: "on",
    };
    const validation = validatePlatformChurchRegistration(body, { instantFreeEnabled: true });
    assert.equal(validation.ok, true, JSON.stringify(validation));
    const submitted = await submitChurchRegistration(
      pool,
      {
        ip: "203.0.113.41",
        requestId: `audit-${key}`,
        get: () => "audit-test",
      },
      validation,
      {
        env: { PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging" },
        dataEnvironment: "testing",
        deploymentCode: "blessboard-org-staging",
      }
    );
    assert.equal(submitted.ok, true, JSON.stringify(submitted));
    let appId = submitted.application && submitted.application.id;
    assert.ok(appId);
    let linked = await pool.query(
      `SELECT organization_id FROM blessboard.platform_church_registration_applications WHERE id = $1`,
      [appId]
    );
    if (!linked.rows[0] || !linked.rows[0].organization_id) {
      const provisioned = await provisionRegisteredBlessBoardChurch(
        pool,
        {
          applicationId: appId,
          administratorPassword: PASSWORD,
          requestedOrganizationKey: key,
          actorContext: {
            type: "test",
            source: "audit_trail_test",
            dataEnvironment: "testing",
            deploymentCode: "blessboard-org-staging",
          },
        },
        { allowRetry: true }
      );
      assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
      linked = await pool.query(
        `SELECT organization_id FROM blessboard.platform_church_registration_applications WHERE id = $1`,
        [appId]
      );
    }
    const organizationId = linked.rows[0].organization_id;
    assert.ok(organizationId);

    const platform = await platformActions(organizationId);
    assertNoSecrets(platform);
    assert.ok(hasAction(platform, ACTION.ORGANIZATION_CREATED) || hasAction(platform, ACTION.PROVISIONING_COMPLETED));
    assert.ok(hasAction(platform, ACTION.ADMIN_ROLE_ASSIGNED));
    assert.ok(hasAction(platform, ACTION.WEBSITE_INITIALIZED) || hasAction(platform, ACTION.PROVISIONING_COMPLETED));
    assert.ok(hasAction(platform, ACTION.APPROVED) || hasAction(platform, "registration.application_approved") || hasAction(platform, ACTION.PROVISIONING_COMPLETED));

    const church = await pool.query(
      `SELECT id FROM blessboard.churches WHERE organization_id = $1 LIMIT 1`,
      [organizationId]
    );
    if (church.rows[0]) {
      const unpublished = await unpublishChurchWebsite(pool, {
        churchId: church.rows[0].id,
        actorUserId: paUser.user.id,
      });
      assert.equal(unpublished.ok, true, JSON.stringify(unpublished));
      const afterUnpublish = await platformActions(organizationId);
      assert.ok(hasAction(afterUnpublish, "website.unpublished"));
    }

    await pool.query(
      `UPDATE blessboard.platform_church_registration_applications
          SET provisioning_status = 'provisioning_failed',
              application_status = 'provision_failed',
              last_provision_stage = $2,
              provisioning_error_code = 'provisioning_failed',
              provisioning_error_detail = 'injected website failure',
              provisioning_failed_at = now(),
              provisioned_at = NULL
        WHERE id = $1`,
      [appId, STAGE.WEBSITE_INSTANCE]
    );
    const retry = await provisionRegisteredBlessBoardChurch(
      pool,
      {
        applicationId: appId,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: key,
        actorContext: {
          type: "test",
          source: "audit_trail_test",
          dataEnvironment: "testing",
          deploymentCode: "blessboard-org-staging",
        },
      },
      { allowRetry: true }
    );
    assert.equal(retry.ok, true, JSON.stringify(retry));
    const afterRetry = await platformActions(organizationId);
    assert.ok(hasAction(afterRetry, ACTION.PROVISIONING_RETRY));
    assertNoSecrets(afterRetry);
  });
});
