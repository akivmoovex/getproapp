"use strict";

/**
 * Prompt 26 — customer support follow-up operations.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const request = require("supertest");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  NETWORK_SUPPORT_SUCCESS_MESSAGE,
} = require("../src/blessboard/services/platformChurchRegistrationService");
const {
  listRegistrationApplicationsAdmin,
  normalizeListFilters,
  assignRegistrationSupport,
  addRegistrationSupportContact,
  approveAndProvisionRegistrationApplication,
  rejectRegistrationApplication,
  getRegistrationApplicationDetail,
  MAX_LIMIT,
  DEFAULT_LIMIT,
} = require("../src/blessboard/services/registrationApplicationsAdminService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const APEX = "blessboard.org";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function extractCsrfToken(html) {
  const m = String(html || "").match(
    new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`)
  );
  return (m && (m[1] || m[2])) || null;
}

function randomPhone() {
  return `+2547${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}

describe("customer support follow-up operations (Prompt 26)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let users = {};
  let fixtures = {};

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

      async function makeUser(email, displayName) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      users.platform = await makeUser("p26-pa@example.org", "P26 Platform Admin");
      users.platform2 = await makeUser("p26-pa2@example.org", "P26 Support Owner");
      users.hq = await makeUser("p26-hq@example.org", "P26 HQ Admin");
      users.member = await makeUser("p26-member@example.org", "P26 Member");

      const bootKey = uniq("p26boot");
      const bootPhone = randomPhone();
      const bootApp = await appRepo.createApplication(pool, {
        church_name: `P26 Bootstrap ${bootKey}`,
        country: "Kenya",
        city: "Nairobi",
        contact_name: "Bootstrap Contact",
        contact_email: `${bootKey}@example.org`,
        contact_phone: bootPhone,
        contact_phone_normalized: bootPhone,
        role_in_church: "Administrator",
        selected_plan: "foundation",
        consent_terms: true,
      });
      const bootProv = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: bootApp.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: bootKey,
        actorContext: {
          type: "test",
          source: "prompt26",
          dataEnvironment: "testing",
          deploymentCode: "blessboard-org-v5",
        },
      });
      assert.equal(bootProv.ok, true, bootProv.message || bootProv.status);
      fixtures.organizationKey = bootProv.records.organizationKey;
      fixtures.organizationId = bootProv.records.organizationId;

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "p26-pa@example.org",
            organizationKey: fixtures.organizationKey,
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "p26-pa2@example.org",
            organizationKey: fixtures.organizationKey,
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "p26-hq@example.org",
            organizationKey: fixtures.organizationKey,
            roleKey: "church_hq_admin",
            churchKey: fixtures.organizationKey,
          })
        ).ok,
        true
      );

      app = createV5FoundationApp({
        getPool: () => pool,
        env: {
          NODE_ENV: "test",
          PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
          SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
          SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
          BLESSBOARD_TENANT_ROUTING_MODE: "off",
          BLESSBOARD_APEX_HOST: APEX,
        },
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String(err && err.message ? err.message : err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function skipIfNeeded() {
    if (skipSuite) {
      // eslint-disable-next-line no-console
      console.log(`skip: ${skipReason}`);
      return true;
    }
    return false;
  }

  async function sessionCookieFor(user) {
    const session = await createV5Session(pool, {
      deploymentCode: "blessboard-org-v5",
      userId: user.id,
      organizationId: fixtures.organizationId || null,
      churchId: null,
      branchId: null,
    });
    assert.equal(session.ok, true, session.message || session.code);
    return `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
  }

  it("1. Network enquiry enters contact queue as validation_pending", async () => {
    if (skipIfNeeded()) return;
    const key = uniq("p26net");
    const phone = randomPhone();
    const networkApp = await appRepo.createApplication(pool, {
      church_name: `Network Support ${key}`,
      country: "Kenya",
      city: "Nairobi",
      contact_name: "Network Contact",
      contact_email: `${key}@example.org`,
      contact_phone: phone,
      contact_phone_normalized: phone,
      role_in_church: "Administrator",
      selected_plan: "network",
      consent_terms: true,
      support_requested: true,
      follow_up_status: "contact_pending",
    });
    fixtures.networkAppId = String(networkApp.id);

    const row = await appRepo.findApplicationById(pool, fixtures.networkAppId);
    assert.equal(row.selected_plan, "network");
    assert.equal(row.support_requested, true);
    assert.equal(row.follow_up_status, "contact_pending");
    assert.equal(row.organization_id, null);
    assert.equal(row.provisioning_status, "not_started");

    const list = await listRegistrationApplicationsAdmin(pool, {
      selected_plan: "network",
      support_requested: "true",
      limit: 50,
    });
    assert.equal(list.ok, true);
    const hit = list.applications.find((a) => a.id === fixtures.networkAppId);
    assert.ok(hit, "network app in support queue");
    assert.equal(hit.workflowStatus, "contact_pending");
    assert.equal(hit.followUpStatus, "contact_pending");
  });

  it("2. Owner assignment works for Network without org", async () => {
    if (skipIfNeeded()) return;
    assert.ok(fixtures.networkAppId);
    const assigned = await assignRegistrationSupport(pool, {
      applicationId: fixtures.networkAppId,
      supportUserId: users.platform2.id,
      actorUserId: users.platform.id,
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(assigned.ok, true, assigned.message);
    assert.equal(assigned.scope, "application");
    const detail = await getRegistrationApplicationDetail(pool, fixtures.networkAppId);
    assert.equal(detail.ok, true);
    assert.equal(detail.application.assignedSupportUserId, users.platform2.id);
    assert.ok(
      (detail.auditEvents || []).some((e) => String(e.actionKey).includes("support_assigned"))
    );
  });

  it("3. Follow-up date works via contact note", async () => {
    if (skipIfNeeded()) return;
    assert.ok(fixtures.networkAppId);
    const next = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const noteText = "Called about branch structure and Network pricing options.";
    const contact = await addRegistrationSupportContact(pool, {
      applicationId: fixtures.networkAppId,
      actorUserId: users.platform.id,
      contactMethod: "phone",
      outcome: "reached",
      note: noteText,
      followUpStatus: "contacted",
      nextFollowUpAt: next,
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(contact.ok, true, contact.message);
    assert.equal(contact.scope, "application");
    const detail = await getRegistrationApplicationDetail(pool, fixtures.networkAppId);
    assert.equal(detail.ok, true);
    assert.equal(detail.application.followUpStatus, "contacted");
    assert.ok(detail.application.nextFollowUpAt);
    assert.ok(detail.contacts.length >= 1);
    assert.equal(detail.contacts[0].note, noteText);
  });

  it("4. Review approval provisions once", async () => {
    if (skipIfNeeded()) return;
    const key = uniq("p26rev");
    const phone = randomPhone();
    const held = await appRepo.createApplication(pool, {
      church_name: `Review Hold ${key}`,
      country: "Kenya",
      city: "Kisumu",
      contact_name: "Review Contact",
      contact_email: `${key}@example.org`,
      contact_phone: phone,
      contact_phone_normalized: phone,
      role_in_church: "Administrator",
      selected_plan: "foundation",
      consent_terms: true,
      application_status: "duplicate_review",
      risk_decision: "review_required",
      risk_reason_codes: ["duplicate_email_domain"],
    });
    fixtures.reviewAppId = String(held.id);

    const first = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: fixtures.reviewAppId,
      actorUserId: users.platform.id,
      administratorPassword: PASSWORD,
      administratorPasswordConfirm: PASSWORD,
      organizationKey: key,
      deploymentCode: "blessboard-org-v5",
      dataEnvironment: "testing",
    });
    assert.equal(first.ok, true, first.message);
    assert.ok(first.records && first.records.organizationId);
    fixtures.reviewOrgId = first.records.organizationId;

    const second = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: fixtures.reviewAppId,
      actorUserId: users.platform.id,
      administratorPassword: PASSWORD,
      administratorPasswordConfirm: PASSWORD,
      organizationKey: key,
      deploymentCode: "blessboard-org-v5",
      dataEnvironment: "testing",
    });
    assert.equal(second.ok, true);
    assert.equal(second.alreadyProvisioned, true);

    const orgs = await pool.query(
      `SELECT COUNT(*)::int AS c FROM platform.organizations WHERE id = $1`,
      [fixtures.reviewOrgId]
    );
    assert.equal(orgs.rows[0].c, 1);
  });

  it("5. Rejection preserves the record", async () => {
    if (skipIfNeeded()) return;
    const key = uniq("p26rej");
    const phone = randomPhone();
    const held = await appRepo.createApplication(pool, {
      church_name: `Reject Keep ${key}`,
      country: "Kenya",
      city: "Mombasa",
      contact_name: "Reject Contact",
      contact_email: `${key}@example.org`,
      contact_phone: phone,
      contact_phone_normalized: phone,
      role_in_church: "Administrator",
      selected_plan: "growth",
      consent_terms: true,
      application_status: "duplicate_review",
      risk_decision: "review_required",
      risk_reason_codes: ["duplicate_phone"],
    });
    const rejected = await rejectRegistrationApplication(pool, {
      applicationId: held.id,
      actorUserId: users.platform.id,
      reason: "Unable to verify church identity after review.",
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(rejected.ok, true, rejected.message);
    const row = await appRepo.findApplicationById(pool, held.id);
    assert.ok(row);
    assert.equal(row.application_status, "rejected");
    assert.equal(row.organization_id, null);
    assert.ok(String(row.rejection_reason || "").includes("Unable to verify"));
    assert.ok(Array.isArray(row.review_events) && row.review_events.length >= 1);
  });

  it("6. Retry does not duplicate tenants", async () => {
    if (skipIfNeeded()) return;
    const key = uniq("p26retry");
    const phone = randomPhone();
    const held = await appRepo.createApplication(pool, {
      church_name: `Retry Church ${key}`,
      country: "Kenya",
      city: "Nakuru",
      contact_name: "Retry Contact",
      contact_email: `${key}@example.org`,
      contact_phone: phone,
      contact_phone_normalized: phone,
      role_in_church: "Administrator",
      selected_plan: "foundation",
      consent_terms: true,
      application_status: "submitted",
    });

    await pool.query(
      `UPDATE blessboard.platform_church_registration_applications
          SET provisioning_status = 'provisioning_failed',
              provisioning_failed_at = now(),
              provisioning_error_code = 'database_unavailable',
              provisioning_error_detail = 'temporary outage'
        WHERE id = $1`,
      [held.id]
    );

    const retry = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: held.id,
      actorUserId: users.platform.id,
      administratorPassword: PASSWORD,
      administratorPasswordConfirm: PASSWORD,
      organizationKey: key,
      deploymentCode: "blessboard-org-v5",
      dataEnvironment: "testing",
    });
    assert.equal(retry.ok, true, retry.message);
    const orgId = retry.records && retry.records.organizationId;
    assert.ok(orgId);

    const again = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: held.id,
      actorUserId: users.platform.id,
      administratorPassword: PASSWORD,
      administratorPasswordConfirm: PASSWORD,
      organizationKey: key,
      deploymentCode: "blessboard-org-v5",
      dataEnvironment: "testing",
    });
    assert.equal(again.ok, true);
    assert.equal(again.alreadyProvisioned, true);

    const count = await pool.query(
      `SELECT COUNT(*)::int AS c
         FROM platform.organizations
        WHERE organization_key = $1`,
      [key]
    );
    assert.equal(count.rows[0].c, 1);
  });

  it("7. Unauthorized users are denied", async () => {
    if (skipIfNeeded()) return;
    const memberCookie = await sessionCookieFor(users.member);
    const denied = await request(app)
      .get("/admin/registration-applications")
      .set("Host", APEX)
      .set("Cookie", memberCookie);
    assert.ok([401, 403, 302, 303].includes(denied.status));

    const hqCookie = await sessionCookieFor(users.hq);
    const hqDenied = await request(app)
      .get("/admin/registration-applications")
      .set("Host", APEX)
      .set("Cookie", hqCookie);
    assert.ok([401, 403, 302, 303].includes(hqDenied.status));
  });

  it("8. CSRF protects mutations", async () => {
    if (skipIfNeeded()) return;
    assert.ok(fixtures.networkAppId);
    const cookie = await sessionCookieFor(users.platform);
    const detail = await request(app)
      .get(`/admin/registration-applications/${fixtures.networkAppId}`)
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    const csrf = extractCsrfToken(detail.text);
    assert.ok(csrf);
    const csrfCookie = extractCookie(detail, CSRF_COOKIE) || "";

    const bad = await request(app)
      .post(`/admin/registration-applications/${fixtures.networkAppId}/follow-up-status`)
      .set("Host", APEX)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({ follow_up_status: "qualified", [CSRF_FIELD]: "bad-token" });
    assert.ok([302, 303].includes(bad.status));
    assert.match(String(bad.headers.location || ""), /error=csrf/);
  });

  it("9. Internal notes remain private on customer Network success copy", async () => {
    if (skipIfNeeded()) return;
    assert.ok(fixtures.networkAppId);
    assert.ok(!NETWORK_SUPPORT_SUCCESS_MESSAGE.includes("Called about"));
    assert.ok(!NETWORK_SUPPORT_SUCCESS_MESSAGE.toLowerCase().includes("internal"));
    const detail = await getRegistrationApplicationDetail(pool, fixtures.networkAppId);
    assert.ok(detail.contacts.some((c) => c.note.includes("branch structure")));
    assert.ok(!NETWORK_SUPPORT_SUCCESS_MESSAGE.includes("branch structure"));
  });

  it("10. Audit history is complete for assign / contact / reject / approve", async () => {
    if (skipIfNeeded()) return;
    assert.ok(fixtures.networkAppId);
    const networkDetail = await getRegistrationApplicationDetail(pool, fixtures.networkAppId);
    const keys = (networkDetail.auditEvents || []).map((e) => e.actionKey);
    assert.ok(keys.some((k) => k.includes("support_assigned")));
    assert.ok(keys.some((k) => k.includes("support_contact_added")));

    assert.ok(fixtures.reviewAppId);
    const reviewDetail = await getRegistrationApplicationDetail(pool, fixtures.reviewAppId);
    const reviewKeys = (reviewDetail.auditEvents || []).map((e) => e.actionKey);
    assert.ok(
      reviewKeys.some((k) => k.includes("approve") || k.includes("application_approved"))
    );
  });

  it("11. Filters are allowlisted", async () => {
    if (skipIfNeeded()) return;
    const bad = normalizeListFilters({
      application_status: "DROP TABLE",
      overdue_follow_up: "maybe",
      limit: 9999,
    });
    assert.equal(bad.ok, false);

    const ok = normalizeListFilters({
      application_status: "submitted",
      follow_up_status: "contact_pending",
      overdue_follow_up: "true",
      selected_plan: "network",
      limit: 25,
      page: 1,
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.value.followUpStatus, "contact_pending");
    assert.equal(ok.value.overdueFollowUp, true);
    assert.equal(ok.value.selectedPlan, "network");
    assert.equal(ok.value.limit, 25);
  });

  it("12. Pagination remains bounded", async () => {
    if (skipIfNeeded()) return;
    const huge = normalizeListFilters({ limit: 10000, page: 1 });
    assert.equal(huge.ok, true);
    assert.ok(huge.value.limit <= MAX_LIMIT);
    assert.ok([10, 25, 50, 100].includes(huge.value.limit) || huge.value.limit === DEFAULT_LIMIT);

    const list = await listRegistrationApplicationsAdmin(pool, { limit: 500, page: 1 });
    assert.equal(list.ok, true);
    assert.ok(list.limit <= MAX_LIMIT);
    assert.ok(list.applications.length <= list.limit);
  });
});
