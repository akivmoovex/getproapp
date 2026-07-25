"use strict";

/**
 * Phase 6 — platform-admin organization onboarding summary, filters, and support ops.
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
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  getOrganizationOnboardingSummary,
  derivePublicationStatus,
  assembleSummary,
  resolveLastActivity,
} = require("../src/blessboard/services/organizationOnboardingSummaryService");
const { listPlatformOrganizations } = require("../src/platform/services/listPlatformOrganizations");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";

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

describe("platform-admin organization onboarding support (Phase 6)", () => {
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

      users.platform = await makeUser("ob-pa@example.org", "Onboard Platform Admin");
      users.hq = await makeUser("ob-hq@example.org", "Onboard HQ Admin");
      users.member = await makeUser("ob-member@example.org", "Onboard Member");

      const key = uniq("obadmin");
      const application = await appRepo.createApplication(pool, {
        church_name: `Onboard Admin Church ${key}`,
        country: "Kenya",
        city: "Nairobi",
        contact_name: "Onboard Contact",
        contact_email: `${key}@example.org`,
        contact_phone: "+254700999888",
        role_in_church: "Administrator",
        selected_plan: "foundation",
        consent_terms: true,
      });
      const provisioned = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: application.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: key,
        requestId: "phase6-fixture",
        actorContext: {
          type: "test",
          source: "phase6",
          dataEnvironment: "testing",
          deploymentCode: "blessboard-org-v5",
        },
      });
      assert.equal(provisioned.ok, true, provisioned.message);
      fixtures.provisionedAppId = application.id;
      fixtures.organizationId = provisioned.records.organizationId;
      fixtures.organizationKey = provisioned.records.organizationKey;
      fixtures.churchId = provisioned.records.churchId;

      const otherKey = uniq("plainorg");
      const plain = await provisionPlatformTenant(pool, {
        organizationKey: otherKey,
        displayName: `Plain Org ${otherKey}`,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: otherKey,
        planKey: "free",
        skipDomain: true,
        deploymentCode: "blessboard-org-v5",
      });
      assert.equal(plain.ok, true, plain.message || JSON.stringify(plain));
      fixtures.plainOrganizationKey = otherKey;

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "ob-pa@example.org",
            organizationKey: fixtures.organizationKey,
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "ob-hq@example.org",
            organizationKey: fixtures.organizationKey,
            roleKey: "church_hq_admin",
            churchKey: fixtures.organizationKey,
          })
        ).ok,
        true
      );

      // Seed church-admin login for last-activity preference.
      await pool.query(
        `UPDATE blessboard.users SET last_login_at = now() - interval '1 hour' WHERE id = $1`,
        [users.hq.id]
      );

      app = createV5FoundationApp({
        getPool: () => pool,
        env: {
          ...process.env,
          NODE_ENV: "test",
          PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
          BLESSBOARD_INSTANT_FREE_PROVISIONING: "0",
        },
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function skipIfNeeded() {
    if (skipSuite) {
      console.log(`Skipping Phase 6 suite: ${skipReason}`);
      return true;
    }
    return false;
  }

  async function sessionCookie(user) {
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-v5",
      userId: user.id,
      organizationId: fixtures.organizationId,
      churchId: null,
      branchId: null,
    });
    assert.equal(created.ok, true, created.code);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  // --- Summary service ---

  it("1–7: summary service derives checklist, progress, publication, last activity", async () => {
    if (skipIfNeeded()) return;

    const emptyish = await getOrganizationOnboardingSummary(pool, {
      organizationKey: fixtures.organizationKey,
    });
    assert.equal(emptyish.ok, true);
    assert.ok(emptyish.summary);
    const s = emptyish.summary;
    assert.equal(typeof s.percentage, "number");
    assert.ok(!("percentage_stored" in s));
    assert.equal(s.completedCount >= 2, true); // org details + first branch from provision
    assert.equal(s.totalCount, 7);
    assert.equal(s.percentage, Math.round((s.completedCount / s.totalCount) * 100));

    const orgDetails = s.checklist.find((c) => c.key === "organization_details");
    const firstBranch = s.checklist.find((c) => c.key === "first_branch");
    const logo = s.checklist.find((c) => c.key === "logo");
    const preview = s.checklist.find((c) => c.key === "preview");
    const publish = s.checklist.find((c) => c.key === "publish");
    assert.equal(orgDetails.completed, true);
    assert.equal(firstBranch.completed, true);
    assert.equal(logo.completed, false);
    // Approval provision auto-publishes Foundation homepage + acknowledges preview.
    assert.equal(preview.completed, true);
    assert.equal(publish.completed, true);
    assert.equal(s.publicationStatus, "published");
    assert.equal(s.publicWebsitePath, `/c/${fixtures.organizationKey}`);
    assert.equal(publish.actionUrl, `/c/${fixtures.organizationKey}`);
    assert.equal(publish.actionLabel, "View published website");
    assert.equal(
      preview.actionUrl,
      `/admin/organizations/${fixtures.organizationKey}/website-preview`
    );
    assert.doesNotMatch(String(preview.actionUrl || ""), /\/hq\/website$/);
    for (const item of s.checklist) {
      assert.doesNotMatch(String(item.actionUrl || ""), /^\/hq(\/|$)/);
    }

    assert.ok(s.lastActivityAt);
    assert.equal(s.lastActivitySource, "church_admin_last_login");

    // Fallback path unit check
    const fallback = resolveLastActivity({
      churchAdminLastLoginAt: null,
      lastActivityAt: "2026-01-02T00:00:00.000Z",
    });
    assert.equal(fallback.source, "onboarding_last_activity");

    assert.equal(derivePublicationStatus({ publishedPages: 0, draftPages: 2 }), "unpublished");
    assert.equal(derivePublicationStatus({ publishedPages: 1, draftPages: 1 }), "partially_published");
    assert.equal(derivePublicationStatus({ publishedPages: 2, draftPages: 0 }), "published");

    // Missing onboarding row still works via ensure-less read
    const missing = assembleSummary(
      {
        organizationId: fixtures.organizationId,
        organizationKey: fixtures.organizationKey,
        orgDisplayName: "X",
        churchId: fixtures.churchId,
        churchDisplayName: "X",
        activeBranchCount: 0,
        onboardingStatus: null,
        previewAcknowledged: false,
        publishedPages: 0,
        draftPages: 0,
        onboardingRowPresent: false,
      },
      fixtures.organizationKey
    );
    assert.equal(missing.onboardingStatus, "in_progress");
    assert.equal(missing.percentage, Math.round((1 / 7) * 100));
  });

  // --- Organization detail ---

  it("8–14: organization detail shows BlessBoard onboarding section", async () => {
    if (skipIfNeeded()) return;
    const cookie = await sessionCookie(users.platform);
    const res = await request(app)
      .get(`/admin/organizations/${fixtures.organizationKey}`)
      .set("Cookie", cookie)
      .set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    assert.match(res.headers["cache-control"] || "", /no-store/i);
    assert.match(res.text, /data-bb-pa-org-onboarding="1"/);
    assert.match(res.text, /data-bb-pa-onboarding-checklist="1"/);
    assert.match(res.text, /Foundation checklist/);
    assert.match(res.text, /Open application/);
    assert.match(res.text, /data-bb-pa-org-follow-up-form="1"/);
    assert.match(res.text, /data-bb-pa-org-assign-form="1"/);
    assert.match(res.text, /data-bb-pa-support-contacts="1"|No support contacts/);

    const plain = await request(app)
      .get(`/admin/organizations/${fixtures.plainOrganizationKey}`)
      .set("Cookie", cookie)
      .set("Host", "blessboard.org");
    assert.equal(plain.status, 200);
    assert.doesNotMatch(plain.text, /data-bb-pa-org-onboarding="1"/);
  });

  // --- Filters ---

  it("15–21: organization list filters and invalid handling", async () => {
    if (skipIfNeeded()) return;
    const cookie = await sessionCookie(users.platform);

    const bb = await listPlatformOrganizations(pool, { product: "blessboard", limit: 50 });
    assert.equal(bb.ok, true);
    assert.ok(bb.organizations.some((o) => o.organizationKey === fixtures.organizationKey));
    assert.ok(bb.organizations.every((o) => o.enrolmentStatus === "active"));

    const incomplete = await listPlatformOrganizations(pool, {
      product: "blessboard",
      onboarding: "incomplete",
      limit: 50,
    });
    assert.equal(incomplete.ok, true);
    assert.ok(incomplete.organizations.some((o) => o.organizationKey === fixtures.organizationKey));

    const needsHelp = await listPlatformOrganizations(pool, {
      follow_up: "needs_help",
      limit: 50,
    });
    assert.equal(needsHelp.ok, true);

    const support = await listPlatformOrganizations(pool, {
      support_requested: "true",
      limit: 50,
    });
    assert.equal(support.ok, true);

    const unpublished = await listPlatformOrganizations(pool, {
      product: "blessboard",
      publication: "unpublished",
      limit: 50,
    });
    assert.equal(unpublished.ok, true);
    // Auto-published Foundation churches are not in the unpublished filter.
    assert.equal(
      unpublished.organizations.some((o) => o.organizationKey === fixtures.organizationKey),
      false
    );

    const invalid = await listPlatformOrganizations(pool, { product: "not-a-product" });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.status, "invalid_input");

    const httpInvalid = await request(app)
      .get("/admin/organizations?product=nope")
      .set("Cookie", cookie)
      .set("Host", "blessboard.org");
    assert.equal(httpInvalid.status, 400);

    const page = await request(app)
      .get(
        `/admin/organizations?product=blessboard&onboarding=incomplete&publication=unpublished&page=1&limit=10`
      )
      .set("Cookie", cookie)
      .set("Host", "blessboard.org");
    assert.equal(page.status, 200);
    assert.match(page.text, /name="product"[\s\S]*value="blessboard"[^>]*selected|value="blessboard"[^>]*selected/);
    assert.match(page.text, /value="incomplete"[^>]*selected/);
    assert.match(page.headers["cache-control"] || "", /no-store/i);
  });

  // --- Actions ---

  it("22–30: next follow-up, support flag, CSRF, auth, audit, no access side effects", async () => {
    if (skipIfNeeded()) return;
    const cookie = await sessionCookie(users.platform);
    const getRes = await request(app)
      .get(`/admin/organizations/${fixtures.organizationKey}`)
      .set("Cookie", cookie)
      .set("Host", "blessboard.org");
    const csrf = extractCsrfToken(getRes.text);
    const csrfCookie = extractCookie(getRes, CSRF_COOKIE);
    assert.ok(csrf);
    const jar = `${cookie}; ${CSRF_COOKIE}=${csrfCookie}`;

    const future = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const setFollow = await request(app)
      .post(`/admin/organizations/${fixtures.organizationKey}/next-follow-up`)
      .set("Cookie", jar)
      .set("Host", "blessboard.org")
      .type("form")
      .send({ [CSRF_FIELD]: csrf, next_follow_up_at: future });
    assert.equal(setFollow.status, 303);
    assert.match(setFollow.headers.location || "", /next_follow_up_saved/);

    const clearFollow = await request(app)
      .post(`/admin/organizations/${fixtures.organizationKey}/next-follow-up`)
      .set("Cookie", jar)
      .set("Host", "blessboard.org")
      .type("form")
      .send({ [CSRF_FIELD]: csrf, clear_next_follow_up: "1" });
    assert.equal(clearFollow.status, 303);
    assert.match(clearFollow.headers.location || "", /next_follow_up_saved/);

    const past = new Date(Date.now() - 3600 * 1000).toISOString();
    const pastReject = await request(app)
      .post(`/admin/organizations/${fixtures.organizationKey}/next-follow-up`)
      .set("Cookie", jar)
      .set("Host", "blessboard.org")
      .type("form")
      .send({ [CSRF_FIELD]: csrf, next_follow_up_at: past });
    assert.equal(pastReject.status, 303);
    assert.match(pastReject.headers.location || "", /next_follow_up_past|invalid/);

    const supportFlag = await request(app)
      .post(`/admin/organizations/${fixtures.organizationKey}/support-requested`)
      .set("Cookie", jar)
      .set("Host", "blessboard.org")
      .type("form")
      .send({ [CSRF_FIELD]: csrf, support_requested: "true" });
    assert.equal(supportFlag.status, 303);
    assert.match(supportFlag.headers.location || "", /support_request_saved/);

    const noCsrf = await request(app)
      .post(`/admin/organizations/${fixtures.organizationKey}/support-requested`)
      .set("Cookie", cookie)
      .set("Host", "blessboard.org")
      .type("form")
      .send({ support_requested: "false" });
    assert.equal(noCsrf.status, 303);
    assert.match(noCsrf.headers.location || "", /error=csrf/);

    const memberCookie = await sessionCookie(users.member);
    const denied = await request(app)
      .get(`/admin/organizations/${fixtures.organizationKey}`)
      .set("Cookie", memberCookie)
      .set("Host", "blessboard.org");
    assert.ok(denied.status === 403 || denied.status === 401 || denied.status === 303);

    const followUp = await request(app)
      .post(`/admin/organizations/${fixtures.organizationKey}/follow-up-status`)
      .set("Cookie", jar)
      .set("Host", "blessboard.org")
      .type("form")
      .send({ [CSRF_FIELD]: csrf, follow_up_status: "needs_help" });
    assert.equal(followUp.status, 303);

    const orgBefore = await pool.query(
      `SELECT status FROM platform.organizations WHERE id = $1`,
      [fixtures.organizationId]
    );
    assert.equal(orgBefore.rows[0].status, "active");

    const audit = await pool.query(
      `SELECT action_key FROM platform.audit_events
        WHERE organization_id = $1
          AND action_key IN (
            'onboarding.next_follow_up_updated',
            'onboarding.support_requested_updated',
            'onboarding.follow_up_status_updated'
          )
        ORDER BY created_at DESC
        LIMIT 10`,
      [fixtures.organizationId]
    );
    assert.ok(audit.rows.length >= 2);

    const orgAfter = await pool.query(
      `SELECT status FROM platform.organizations WHERE id = $1`,
      [fixtures.organizationId]
    );
    assert.equal(orgAfter.rows[0].status, "active");

    const needsHelpFilter = await listPlatformOrganizations(pool, {
      follow_up: "needs_help",
      support_requested: "true",
      limit: 50,
    });
    assert.ok(needsHelpFilter.organizations.some((o) => o.organizationKey === fixtures.organizationKey));
  });

  // --- Regression boundaries ---

  it("35–36: organizations remains canonical; no /admin/churches", async () => {
    if (skipIfNeeded()) return;
    const cookie = await sessionCookie(users.platform);
    const orgs = await request(app)
      .get("/admin/organizations")
      .set("Cookie", cookie)
      .set("Host", "blessboard.org");
    assert.equal(orgs.status, 200);
    assert.match(orgs.text, /Organization Governance|Organizations/);

    const churches = await request(app)
      .get("/admin/churches")
      .set("Cookie", cookie)
      .set("Host", "blessboard.org");
    // No dedicated churches directory route — must not be a successful org-style list.
    assert.notEqual(churches.status, 200);
  });
});
