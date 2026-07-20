"use strict";

/**
 * Prompt 21 — church website preview + site publish/unpublish.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const { createV5Session } = require("../src/platform/session/createV5Session");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const {
  evaluatePublishReadiness,
  publishChurchWebsite,
  unpublishChurchWebsite,
  acknowledgeWebsitePreview,
  STATUS: PUBLISH_STATUS,
  GAP,
} = require("../src/blessboard/services/churchWebsitePublishService");
const { provisionEmptyPublicPages } = require("../src/blessboard/services/publicContentAdminService");
const {
  resolveOrganizationEntitlements,
  hasFeature,
  FEATURE_KEYS,
} = require("../src/platform/services/entitlementService");
const { getOrganizationOnboardingSummary } = require("../src/blessboard/services/organizationOnboardingSummaryService");

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
    new RegExp(
      `name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`
    )
  );
  return (m && (m[1] || m[2])) || null;
}

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    ...overrides,
  };
}

describe("blessboard church website preview and publish", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;

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
      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
        apexHosts: new Set([APEX, `www.${APEX}`]),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function provisionPlan(selectedPlan) {
    const key = uniq(selectedPlan === "growth" ? "grw" : "fnd");
    const row = await appRepo.createApplication(pool, {
      church_name: `Website ${key}`,
      country: "Zambia",
      city: "Lusaka",
      contact_name: "Site Admin",
      contact_email: `${key}@example.org`,
      contact_phone: `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
      selected_plan: selectedPlan,
      consent_terms: true,
      branch_name: "Main Campus",
    });
    const result = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: row.id,
      administratorPassword: PASSWORD,
      requestId: `req-${key}`,
      actorContext: { type: "test", source: "unit", dataEnvironment: "testing" },
    });
    assert.equal(result.ok, true, result.message || result.status);
    return result.records;
  }

  async function sessionCookieFor(userId, organizationId) {
    const created = await createV5Session(pool, {
      userId,
      organizationId: organizationId || null,
      deploymentCode: "blessboard-org-v5",
      userAgent: "website-publish-test",
      ipAddress: "127.0.0.1",
    });
    assert.equal(created.ok, true, created.message || created.code);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  async function primaryHostnameForOrg(organizationId) {
    const r = await pool.query(
      `SELECT hostname FROM platform.domains
        WHERE organization_id = $1 AND status = 'active'
        ORDER BY CASE WHEN is_primary THEN 0 ELSE 1 END, hostname
        LIMIT 1`,
      [organizationId]
    );
    return r.rows[0] ? r.rows[0].hostname : null;
  }

  it("1–2. Foundation and Growth churches get previewable draft shells without duplicates", async () => {
    requireDb();
    for (const plan of ["foundation", "growth"]) {
      const rec = await provisionPlan(plan);
      const pages = await pool.query(
        `SELECT page_key, status, branch_id
           FROM blessboard.public_pages
          WHERE church_id = $1
          ORDER BY page_key`,
        [rec.churchId]
      );
      assert.equal(pages.rows.length, 8);
      assert.ok(pages.rows.every((p) => p.status === "draft" && p.branch_id == null));

      const again = await provisionEmptyPublicPages(pool, { churchId: rec.churchId });
      assert.equal(again.ok, true);
      assert.equal(again.createdCount, 0);

      const settings = await pool.query(
        `SELECT website_status, primary_email, primary_phone
           FROM blessboard.church_settings WHERE church_id = $1`,
        [rec.churchId]
      );
      assert.equal(settings.rows[0].website_status, "draft");
      assert.ok(settings.rows[0].primary_email || settings.rows[0].primary_phone);

      const setup = await request(app)
        .get(`/c/${rec.organizationKey}`)
        .set("Host", APEX);
      assert.equal(setup.status, 200);
      assert.match(setup.text, /coming soon|being prepared/i);
      assert.match(setup.headers["x-robots-tag"] || "", /noindex/i);
      assert.doesNotMatch(setup.text, new RegExp(rec.churchId, "i"));

      const sid = await sessionCookieFor(rec.administratorUserId, rec.organizationId);
      // Path-provisioned orgs have no domain — preview requires a tenant host.
      // Attach a temporary canonical domain for authenticated HQ preview.
      let host = await primaryHostnameForOrg(rec.organizationId);
      if (!host) {
        host = `${rec.organizationKey}.blessboard.org`;
        const prod = await pool.query(
          `SELECT id FROM platform.products WHERE product_key = 'blessboard' LIMIT 1`
        );
        await pool.query(
          `INSERT INTO platform.domains
             (organization_id, product_id, deployment_id, hostname, domain_type, status, is_primary)
           VALUES ($1, $2, 'blessboard-org-v5', $3, 'canonical', 'active', true)`,
          [rec.organizationId, prod.rows[0].id, host]
        );
      }
      const preview = await request(app)
        .get("/hq/content/preview/home")
        .set("Host", host)
        .set("Cookie", sid);
      assert.equal(preview.status, 200);
      assert.match(preview.text, /Preview/i);
      assert.match(preview.text, /noindex|Preview/i);
      assert.doesNotMatch(preview.text, new RegExp(rec.churchId, "i"));
    }
  });

  it("3. Unauthorized users cannot preview another church", async () => {
    requireDb();
    const a = await provisionPlan("foundation");
    const b = await provisionPlan("foundation");
    const depCode = "blessboard-org-v5";
    const prod = await pool.query(
      `SELECT id FROM platform.products WHERE product_key = 'blessboard' LIMIT 1`
    );
    const hostA = `${a.organizationKey}.blessboard.org`;
    const hostB = `${b.organizationKey}.blessboard.org`;
    await pool.query(
      `INSERT INTO platform.domains
         (organization_id, product_id, deployment_id, hostname, domain_type, status, is_primary)
       VALUES ($1, $2, $3, $4, 'canonical', 'active', true),
              ($5, $2, $3, $6, 'canonical', 'active', true)`,
      [a.organizationId, prod.rows[0].id, depCode, hostA, b.organizationId, hostB]
    );

    const sidA = await sessionCookieFor(a.administratorUserId, a.organizationId);
    const cross = await request(app)
      .get("/hq/content/preview/home")
      .set("Host", hostB)
      .set("Cookie", sidA);
    assert.ok([401, 403, 303].includes(cross.status), `status ${cross.status}`);
    assert.doesNotMatch(String(cross.text || ""), /Website A|Preview/i);
  });

  it("4–7. Readiness gates, atomic publish, onboarding, idempotent republish", async () => {
    requireDb();
    const rec = await provisionPlan("foundation");

    // Remove contact to force a readiness gap.
    await pool.query(
      `UPDATE blessboard.church_settings
          SET primary_email = NULL, primary_phone = NULL
        WHERE church_id = $1`,
      [rec.churchId]
    );
    const blocked = await evaluatePublishReadiness(pool, { churchId: rec.churchId });
    assert.equal(blocked.ok, true);
    assert.equal(blocked.ready, false);
    assert.ok(blocked.gaps.includes(GAP.CONTACT_METHOD));
    assert.ok(blocked.gaps.includes(GAP.SERVICE_TIMES));

    const noOptionalBlock = await evaluatePublishReadiness(pool, {
      churchId: rec.churchId,
      deferServiceTimes: true,
    });
    assert.ok(noOptionalBlock.gaps.includes(GAP.CONTACT_METHOD));
    assert.ok(!noOptionalBlock.gaps.includes(GAP.SERVICE_TIMES));
    assert.ok(!noOptionalBlock.gaps.includes("leadership"));
    assert.ok(!noOptionalBlock.gaps.includes("sermons"));

    await pool.query(
      `UPDATE blessboard.church_settings
          SET primary_email = 'ready@example.org'
        WHERE church_id = $1`,
      [rec.churchId]
    );

    const notConfirmed = await publishChurchWebsite(pool, {
      churchId: rec.churchId,
      deferServiceTimes: true,
      confirmPublish: false,
      actorUserId: rec.administratorUserId,
    });
    assert.equal(notConfirmed.ok, false);
    assert.equal(notConfirmed.reason, "confirm_publish");

    const published = await publishChurchWebsite(pool, {
      churchId: rec.churchId,
      deferServiceTimes: true,
      confirmPublish: true,
      actorUserId: rec.administratorUserId,
    });
    assert.equal(published.ok, true, published.reason);
    assert.equal(published.pageCount, 8);

    const pageStatuses = await pool.query(
      `SELECT status, COUNT(*)::int AS n
         FROM blessboard.public_pages
        WHERE church_id = $1 AND branch_id IS NULL
        GROUP BY status`,
      [rec.churchId]
    );
    const byStatus = Object.fromEntries(pageStatuses.rows.map((r) => [r.status, r.n]));
    assert.equal(byStatus.published, 8);
    assert.equal(byStatus.draft || 0, 0);

    const site = await pool.query(
      `SELECT website_status FROM blessboard.church_settings WHERE church_id = $1`,
      [rec.churchId]
    );
    assert.equal(site.rows[0].website_status, "published");

    const onboarding = await pool.query(
      `SELECT preview_acknowledged, onboarding_status
         FROM blessboard.organization_onboarding WHERE organization_id = $1`,
      [rec.organizationId]
    );
    assert.equal(onboarding.rows[0].preview_acknowledged, true);
    assert.ok(["in_progress", "completed"].includes(onboarding.rows[0].onboarding_status));

    const summary = await getOrganizationOnboardingSummary(pool, {
      organizationKey: rec.organizationKey,
    });
    assert.equal(summary.ok, true);
    const previewItem = summary.summary.checklist.find((c) => c.key === "preview");
    const publishItem = summary.summary.checklist.find((c) => c.key === "publish");
    assert.equal(previewItem.completed, true);
    assert.equal(publishItem.completed, true);

    const audit = await pool.query(
      `SELECT action_key FROM platform.audit_events
        WHERE organization_id = $1 AND action_key = 'website.published'
        ORDER BY created_at DESC LIMIT 1`,
      [rec.organizationId]
    );
    assert.equal(audit.rows.length, 1);

    const again = await publishChurchWebsite(pool, {
      churchId: rec.churchId,
      deferServiceTimes: true,
      confirmPublish: true,
      actorUserId: rec.administratorUserId,
    });
    assert.equal(again.ok, true);
    assert.equal(again.pageCount, 8);

    const pageCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.public_pages WHERE church_id = $1`,
      [rec.churchId]
    );
    assert.equal(pageCount.rows[0].n, 8);
  });

  it("8–10. Public path available after publish; nav resolves; unpublish hides content", async () => {
    requireDb();
    const rec = await provisionPlan("growth");
    await pool.query(
      `UPDATE blessboard.church_settings
          SET primary_email = 'live@example.org'
        WHERE church_id = $1`,
      [rec.churchId]
    );
    const published = await publishChurchWebsite(pool, {
      churchId: rec.churchId,
      deferServiceTimes: true,
      confirmPublish: true,
      actorUserId: rec.administratorUserId,
    });
    assert.equal(published.ok, true);

    const home = await request(app).get(`/c/${rec.organizationKey}`).set("Host", APEX);
    assert.equal(home.status, 200);
    assert.match(home.text, /data-bb-shell="tenant-public"/);
    assert.doesNotMatch(home.text, /Website coming soon/i);
    assert.doesNotMatch(home.text, /data-bb-shell="tenant-public-setup"/);

    const paths = [
      "/about",
      "/leadership",
      "/ministries",
      "/events",
      "/sermons",
      "/contact",
      "/giving",
    ];
    for (const p of paths) {
      const res = await request(app)
        .get(`/c/${rec.organizationKey}${p}`)
        .set("Host", APEX);
      assert.equal(res.status, 200, p);
      assert.match(res.text, /bb-tp-nav/);
      assert.match(res.text, new RegExp(`href="/c/${rec.organizationKey}${p}"`));
      assert.doesNotMatch(res.text, new RegExp(rec.churchId, "i"));
      assert.doesNotMatch(res.text, /broken|undefined/i);
    }

    const unpublished = await unpublishChurchWebsite(pool, {
      churchId: rec.churchId,
      actorUserId: rec.administratorUserId,
    });
    assert.equal(unpublished.ok, true);

    const after = await request(app).get(`/c/${rec.organizationKey}/about`).set("Host", APEX);
    assert.equal(after.status, 200);
    assert.match(after.text, /Website coming soon|being prepared and is not public/i);
    assert.match(after.text, /data-bb-shell="tenant-public-setup"/);

    const pagesRemain = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.public_pages WHERE church_id = $1`,
      [rec.churchId]
    );
    assert.equal(pagesRemain.rows[0].n, 8);

    const domains = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.domains WHERE organization_id = $1`,
      [rec.organizationId]
    );
    assert.equal(domains.rows[0].n, 0);

    const audit = await pool.query(
      `SELECT action_key FROM platform.audit_events
        WHERE organization_id = $1 AND action_key = 'website.unpublished'`,
      [rec.organizationId]
    );
    assert.ok(audit.rows.length >= 1);
  });

  it("11–12. HQ publish CSRF + plan entitlements enforced centrally (no plan keys in view logic)", async () => {
    requireDb();
    const rec = await provisionPlan("foundation");
    const prod = await pool.query(
      `SELECT id FROM platform.products WHERE product_key = 'blessboard' LIMIT 1`
    );
    const host = `${rec.organizationKey}.blessboard.org`;
    await pool.query(
      `INSERT INTO platform.domains
         (organization_id, product_id, deployment_id, hostname, domain_type, status, is_primary)
       VALUES ($1, $2, 'blessboard-org-v5', $3, 'canonical', 'active', true)`,
      [rec.organizationId, prod.rows[0].id, host]
    );

    const ent = await resolveOrganizationEntitlements(pool, {
      organizationId: rec.organizationId,
      productKey: "blessboard",
    });
    assert.equal(ent.ok, true);
    assert.equal(hasFeature(ent.entitlements, FEATURE_KEYS.CUSTOM_DOMAIN), false);

    await pool.query(
      `INSERT INTO platform.domains
         (organization_id, product_id, deployment_id, hostname, domain_type, status, is_primary)
       VALUES ($1, $2, 'blessboard-org-v5', $3, 'custom', 'active', false)`,
      [rec.organizationId, prod.rows[0].id, `www.${rec.organizationKey}.example`]
    );

    const readiness = await evaluatePublishReadiness(pool, {
      churchId: rec.churchId,
      deferServiceTimes: true,
    });
    assert.ok(readiness.gaps.includes(GAP.CUSTOM_DOMAIN_ENTITLEMENT));
    assert.equal(readiness.entitlements.customDomain, false);

    // Remove unauthorized custom domain so publish can proceed via path policy.
    await pool.query(
      `DELETE FROM platform.domains WHERE organization_id = $1 AND domain_type = 'custom'`,
      [rec.organizationId]
    );

    const sid = await sessionCookieFor(rec.administratorUserId, rec.organizationId);
    const boot = await request(app).get("/hq/website").set("Host", host).set("Cookie", sid);
    assert.equal(boot.status, 200);
    assert.doesNotMatch(boot.text, /if\s*\(\s*planKey\s*===|foundation\s*\?\s*|growth\s*\?\s*/i);
    const csrf = extractCsrfToken(boot.text);
    const csrfCookie = extractCookie(boot, CSRF_COOKIE);
    assert.ok(csrf && csrfCookie);

    const noCsrf = await request(app)
      .post("/hq/website/publish")
      .set("Host", host)
      .set("Cookie", sid)
      .type("form")
      .send({
        confirm_publish: "1",
        defer_service_times: "1",
      });
    assert.equal(noCsrf.status, 403);

    await acknowledgeWebsitePreview(pool, {
      organizationId: rec.organizationId,
      actorUserId: rec.administratorUserId,
    });

    const okPublish = await request(app)
      .post("/hq/website/publish")
      .set("Host", host)
      .set("Cookie", `${sid}; ${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        confirm_publish: "1",
        defer_service_times: "1",
      });
    assert.ok([302, 303].includes(okPublish.status), `status ${okPublish.status}`);

    const site = await pool.query(
      `SELECT website_status FROM blessboard.church_settings WHERE church_id = $1`,
      [rec.churchId]
    );
    assert.equal(site.rows[0].website_status, "published");
  });
});
