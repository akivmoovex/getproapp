"use strict";

/**
 * Prompt 50 — home service times provisioning, HQ editor, public render.
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
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const {
  approveAndProvisionRegistrationApplication,
  markNetworkValidationComplete,
} = require("../src/blessboard/services/registrationApplicationsAdminService");
const {
  ensureCanonicalServiceTimesSection,
  saveHomeServiceTimes,
  repairHomeContentFoundation,
  SERVICE_TIMES_SECTION_KEY,
} = require("../src/blessboard/services/homeServiceTimesService");
const { createPageSection } = require("../src/blessboard/services/publicContentAdminService");
const { getPublishedPage } = require("../src/blessboard/services/publicContentReadService");
const {
  deleteChurchScopedContent,
} = require("../src/platform/repositories/testingDataResetRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const ADMIN_PASSWORD = "TestPassword99!";
const HOST = "svc-times.blessboard.org";
const DEPLOYMENT = "blessboard-org-v5";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function cookieHeader(...pairs) {
  return pairs.filter(Boolean).join("; ");
}

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: DEPLOYMENT,
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    ...overrides,
  };
}

async function homeFoundation(pool, churchId) {
  const r = await pool.query(
    `SELECT
       EXISTS (
         SELECT 1 FROM blessboard.public_pages
          WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL
       ) AS has_home,
       (
         SELECT COUNT(*)::int FROM blessboard.page_sections s
           JOIN blessboard.public_pages p ON p.id = s.page_id
          WHERE p.church_id = $1
            AND p.page_key = 'home'
            AND p.branch_id IS NULL
            AND s.section_key = 'service_times'
       ) AS service_sections`,
    [churchId]
  );
  return {
    hasHome: Boolean(r.rows[0].has_home),
    serviceSections: r.rows[0].service_sections,
  };
}

describe("blessboard home service times (Prompt 50)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let church;
  let branch;
  let organizationId;
  let users = {};

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

      const org = await provisionPlatformTenant(pool, {
        organizationKey: "svc-times",
        displayName: "Service Times Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "svc-times",
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(org.ok, true, org.message);
      organizationId = org.records.organization.id;

      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "svc-times",
        churchKey: "svc-times",
        displayName: "Service Times Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(ch.ok, true, ch.message);
      church = ch.records.church;
      branch = ch.records.hqBranch;

      async function makeUser(email, displayName, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const session = await createV5Session(pool, {
          deploymentCode: DEPLOYMENT,
          userId: created.user.id,
          organizationId: role.organizationKey === "svc-times" ? organizationId : undefined,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken, id: created.user.id };
      }

      users.hq = await makeUser("hq-svc@example.test", "HQ Admin", {
        email: "hq-svc@example.test",
        organizationKey: "svc-times",
        roleKey: "church_hq_admin",
        churchKey: "svc-times",
      });
      users.branch = await makeUser("branch-svc@example.test", "Branch Admin", {
        email: "branch-svc@example.test",
        organizationKey: "svc-times",
        roleKey: "branch_admin",
        churchKey: "svc-times",
        branchKey: "hq",
      });

      const otherOrg = await provisionPlatformTenant(pool, {
        organizationKey: "svc-other",
        displayName: "Other Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "svc-other",
        hostname: "svc-other.blessboard.org",
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(otherOrg.ok, true);
      await provisionBlessBoardChurch(pool, {
        organizationKey: "svc-other",
        churchKey: "svc-other",
        displayName: "Other Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      users.otherHq = await makeUser("other-hq-svc@example.test", "Other HQ", {
        email: "other-hq-svc@example.test",
        organizationKey: "svc-other",
        roleKey: "church_hq_admin",
        churchKey: "svc-other",
      });
      // Fix other org session organizationId
      const otherSession = await createV5Session(pool, {
        deploymentCode: DEPLOYMENT,
        userId: users.otherHq.id,
        organizationId: otherOrg.records.organization.id,
      });
      users.otherHq.rawToken = otherSession.rawToken;

      await ensureChurchSettingsInitialized(pool, church.id);
      await updateChurchSettings(pool, church.id, {
        publicName: "Service Times Church",
        websiteStatus: "published",
      });

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
        apexHosts: new Set(["blessboard.org", "www.blessboard.org"]),
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

  async function authedGet(url, user, host = HOST) {
    const res = await request(app)
      .get(url)
      .set("Host", host)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${user.rawToken}`));
    const csrf = extractCookie(res, CSRF_COOKIE);
    return { res, csrf };
  }

  async function authedPost(url, user, csrf, fields, host = HOST) {
    return request(app)
      .post(url)
      .set("Host", host)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${user.rawToken}`, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ [CSRF_FIELD]: csrf, ...fields });
  }

  async function insertApplication(overrides = {}) {
    const key = uniq(overrides.prefix || "st");
    const phoneTail = String(1000000 + (Date.now() % 1000000) + Math.floor(Math.random() * 900)).slice(
      -7
    );
    return appRepo.createApplication(pool, {
      church_name: overrides.church_name || `ST Church ${key}`,
      country: "Kenya",
      city: "Nairobi",
      contact_name: overrides.contact_name || "Ada Admin",
      contact_email: overrides.contact_email || `${key}@example.org`,
      contact_phone: `+2547${phoneTail}`,
      contact_phone_normalized: `+2547${phoneTail}`,
      selected_plan: overrides.selected_plan || "foundation",
      consent_terms: true,
      branch_name: "Main Campus",
      ...(overrides.extra || {}),
    });
  }

  it("1–2: auto-provisioned Foundation and Growth churches have a home page + service_times section", async () => {
    requireDb();
    for (const plan of ["foundation", "growth"]) {
      const appRow = await insertApplication({
        prefix: `auto-${plan}`,
        selected_plan: plan,
      });
      const provisioned = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: appRow.id,
        administratorPassword: ADMIN_PASSWORD,
        requestId: `req-auto-${plan}`,
        actorContext: { type: "test", source: "unit", dataEnvironment: "testing" },
      });
      assert.equal(provisioned.ok, true, provisioned.message || provisioned.reason);
      const foundation = await homeFoundation(pool, provisioned.records.churchId);
      assert.equal(foundation.hasHome, true, plan);
      assert.equal(foundation.serviceSections, 1, plan);
    }
  });

  it("3–4: manually approved Foundation and Growth have the same content foundation", async () => {
    requireDb();
    for (const plan of ["foundation", "growth"]) {
      const key = uniq(`man-${plan}`);
      const appRow = await insertApplication({
        prefix: `man-${plan}`,
        selected_plan: plan,
        contact_email: `${key}@example.org`,
      });
      const approved = await approveAndProvisionRegistrationApplication(pool, {
        applicationId: appRow.id,
        actorUserId: users.hq.id,
        organizationKey: key,
        deploymentCode: DEPLOYMENT,
        dataEnvironment: "testing",
      });
      assert.equal(approved.ok, true, approved.message || approved.status);
      const churchId =
        (approved.records && approved.records.churchId) ||
        (
          await pool.query(`SELECT id FROM blessboard.churches WHERE organization_id = $1 LIMIT 1`, [
            approved.records.organizationId,
          ])
        ).rows[0].id;
      const foundation = await homeFoundation(pool, churchId);
      assert.equal(foundation.hasHome, true, plan);
      assert.equal(foundation.serviceSections, 1, plan);
    }
  });

  it("5: Network approve path provisions the same home content foundation", async () => {
    requireDb();
    const key = uniq("net");
    const phoneTail = String(1000000 + (Date.now() % 1000000) + Math.floor(Math.random() * 900)).slice(
      -7
    );
    const appRow = await appRepo.createApplication(pool, {
      church_name: `Network ${key}`,
      country: "Kenya",
      city: "Nairobi",
      contact_name: "Net Admin",
      contact_email: `${key}@example.org`,
      contact_phone: `+2547${phoneTail}`,
      contact_phone_normalized: `+2547${phoneTail}`,
      role_in_church: "Administrator",
      selected_plan: "network",
      support_requested: true,
      follow_up_status: "validation_pending",
      application_status: "submitted",
      consent_terms: true,
    });
    const marked = await markNetworkValidationComplete(pool, {
      applicationId: appRow.id,
      actorUserId: users.hq.id,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(marked.ok, true, marked.message);
    const created = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: appRow.id,
      actorUserId: users.hq.id,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(created.ok, true, created.message || created.status);
    const churchId = (
      await pool.query(`SELECT id FROM blessboard.churches WHERE organization_id = $1 LIMIT 1`, [
        created.records.organizationId,
      ])
    ).rows[0].id;
    const foundation = await homeFoundation(pool, churchId);
    assert.equal(foundation.hasHome, true);
    assert.equal(foundation.serviceSections, 1);
  });

  it("6–8: GET editor works with and without section; empty copy present", async () => {
    requireDb();
    await pool.query(
      `DELETE FROM blessboard.page_sections
        WHERE page_id IN (
          SELECT id FROM blessboard.public_pages
           WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL
        )`,
      [church.id]
    );
    const missing = await authedGet("/hq/content/pages/home", users.hq);
    assert.equal(missing.res.status, 200);
    assert.match(missing.res.text, /No service times have been added yet/);
    assert.match(missing.res.text, /Add service time/);
    assert.match(missing.res.text, /data-bb-service-times-editor="1"/);

    const after = await homeFoundation(pool, church.id);
    assert.equal(after.hasHome, true);
    assert.equal(after.serviceSections, 1);

    const again = await authedGet("/hq/content/pages/home", users.hq);
    assert.equal(again.res.status, 200);
    assert.match(again.res.text, /No service times have been added yet/);
  });

  it("9–12: first save creates one section; second updates; unrelated sections preserved; values persist", async () => {
    requireDb();
    const home = await pool.query(
      `SELECT id FROM blessboard.public_pages
        WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL`,
      [church.id]
    );
    const pageId = home.rows[0].id;
    await createPageSection(pool, {
      pageId,
      sectionKey: "hero",
      sectionType: "hero",
      heading: "Welcome Hero",
      bodyText: "Keep me",
      sortOrder: 1,
      status: "draft",
    });

    const { csrf } = await authedGet("/hq/content/pages/home", users.hq);
    const first = await authedPost("/hq/content/pages/home/service-times", users.hq, csrf, {
      "name[]": "Sunday Worship",
      "day[]": "sunday",
      "start_time[]": "10:00",
      "end_time[]": "11:30",
      "location[]": "Main Hall",
      "note[]": "Family friendly",
      "enabled[]": "1",
    });
    assert.ok([302, 303].includes(first.status), String(first.text).slice(0, 300));

    const sections1 = await pool.query(
      `SELECT section_key, body_text
         FROM blessboard.page_sections WHERE page_id = $1 ORDER BY section_key`,
      [pageId]
    );
    const serviceRows = sections1.rows.filter((r) => r.section_key === "service_times");
    assert.equal(serviceRows.length, 1);
    assert.match(String(serviceRows[0].body_text || ""), /Sunday/);
    assert.ok(sections1.rows.some((r) => r.section_key === "hero" && r.body_text === "Keep me"));

    const { csrf: csrf2 } = await authedGet("/hq/content/pages/home", users.hq);
    const second = await authedPost("/hq/content/pages/home/service-times", users.hq, csrf2, {
      "name[]": ["Sunday Worship", "Midweek Prayer"],
      "day[]": ["sunday", "wednesday"],
      "start_time[]": ["10:00", "19:00"],
      "end_time[]": ["11:30", ""],
      "location[]": ["Main Hall", "Chapel"],
      "note[]": ["", ""],
      "enabled[]": ["1", "1"],
    });
    assert.ok([302, 303].includes(second.status));

    const sections2 = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.page_sections
        WHERE page_id = $1 AND section_key = 'service_times'`,
      [pageId]
    );
    assert.equal(sections2.rows[0].n, 1);

    const { res: editor } = await authedGet("/hq/content/pages/home", users.hq);
    assert.match(editor.text, /Sunday Worship/);
    assert.match(editor.text, /Midweek Prayer/);
  });

  it("13: invalid day or time is rejected", async () => {
    requireDb();
    const { csrf } = await authedGet("/hq/content/pages/home", users.hq);
    const bad = await authedPost("/hq/content/pages/home/service-times", users.hq, csrf, {
      "name[]": "Bad",
      "day[]": "notaday",
      "start_time[]": "10:00",
      "enabled[]": "1",
    });
    assert.equal(bad.status, 400);

    const badTime = await authedPost("/hq/content/pages/home/service-times", users.hq, csrf, {
      "name[]": "Bad",
      "day[]": "sunday",
      "start_time[]": "25:99",
      "enabled[]": "1",
    });
    assert.equal(badTime.status, 400);
  });

  it("14–16: unauthorized org denied; branch admin cannot edit HQ service times; CSRF required", async () => {
    requireDb();
    const denied = await authedGet("/hq/content/pages/home", users.otherHq, HOST);
    assert.ok(denied.res.status === 403 || denied.res.status === 503);

    const branchDenied = await authedGet("/hq/content/pages/home", users.branch);
    assert.equal(branchDenied.res.status, 403);

    const { csrf } = await authedGet("/hq/content/pages/home", users.hq);
    const noCsrf = await request(app)
      .post("/hq/content/pages/home/service-times")
      .set("Host", HOST)
      .set(
        "Cookie",
        cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hq.rawToken}`, `${CSRF_COOKIE}=${csrf}`)
      )
      .type("form")
      .send({
        "name[]": "X",
        "day[]": "sunday",
        "start_time[]": "09:00",
        "enabled[]": "1",
      });
    assert.equal(noCsrf.status, 403);
  });

  it("17–18: public homepage renders enabled service times only", async () => {
    requireDb();
    const saved = await saveHomeServiceTimes(pool, {
      churchId: church.id,
      organizationId,
      actorUserId: users.hq.id,
      entries: [
        {
          name: "Public Sunday",
          day: "sunday",
          startTime: "09:00",
          endTime: null,
          location: "Sanctuary",
          note: null,
          enabled: true,
          sortOrder: 0,
        },
        {
          name: "Hidden Midweek",
          day: "wednesday",
          startTime: "19:00",
          endTime: null,
          location: null,
          note: null,
          enabled: false,
          sortOrder: 1,
        },
      ],
      confirmPublish: true,
    });
    assert.equal(saved.ok, true);

    await pool.query(
      `UPDATE blessboard.public_pages
          SET status = 'published', published_at = now()
        WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL`,
      [church.id]
    );

    const published = await getPublishedPage(pool, { churchId: church.id, pageKey: "home" });
    assert.equal(published.ok, true);
    const st = (published.sections || []).find((s) => s.sectionKey === SERVICE_TIMES_SECTION_KEY);
    assert.ok(st);
    assert.equal(st.status, "published");

    const publicRes = await request(app).get("/").set("Host", HOST);
    assert.equal(publicRes.status, 200);
    assert.match(publicRes.text, /Public Sunday/);
    assert.match(publicRes.text, /data-bb-home-service-times="1"/);
    assert.doesNotMatch(publicRes.text, /Hidden Midweek/);
  });

  it("19: onboarding service-times item becomes complete after save", async () => {
    requireDb();
    const facts = await appRepo.loadOrganizationOnboardingFacts(pool, {
      organizationId,
    });
    assert.ok(facts);
    assert.equal(facts.hasServiceTimesContent, true);
  });

  it("20–21: initializer and repair are idempotent and do not overwrite content", async () => {
    requireDb();
    const before = await pool.query(
      `SELECT body_text
         FROM blessboard.page_sections s
         JOIN blessboard.public_pages p ON p.id = s.page_id
        WHERE p.church_id = $1 AND s.section_key = 'service_times'
        LIMIT 1`,
      [church.id]
    );
    const bodyBefore = before.rows[0].body_text;

    const first = await ensureCanonicalServiceTimesSection(pool, {
      churchId: church.id,
      branchId: null,
    });
    assert.equal(first.ok, true);
    assert.equal(first.created, false);

    const repaired = await repairHomeContentFoundation(pool, {
      churchId: church.id,
      organizationId,
      actorUserId: users.hq.id,
    });
    assert.equal(repaired.ok, true);
    assert.equal(repaired.created, false);

    const after = await pool.query(
      `SELECT body_text
         FROM blessboard.page_sections s
         JOIN blessboard.public_pages p ON p.id = s.page_id
        WHERE p.church_id = $1 AND s.section_key = 'service_times'
        LIMIT 1`,
      [church.id]
    );
    assert.equal(after.rows[0].body_text, bodyBefore);

    const count = await homeFoundation(pool, church.id);
    assert.equal(count.serviceSections, 1);
  });

  it("22: maintenance reset still deletes tenant page and section records", async () => {
    requireDb();
    const orgKey = uniq("rst");
    const disposable = await provisionPlatformTenant(pool, {
      organizationKey: orgKey,
      displayName: "Reset Org",
      legalName: null,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: orgKey,
      hostname: `${orgKey}.blessboard.org`,
      domainType: "canonical",
      deploymentCode: DEPLOYMENT,
      isPrimary: true,
    });
    assert.equal(disposable.ok, true, disposable.message);
    const dch = await provisionBlessBoardChurch(pool, {
      organizationKey: orgKey,
      churchKey: orgKey,
      displayName: "Reset Church",
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "HQ",
    });
    assert.equal(dch.ok, true, dch.message);
    await ensureCanonicalServiceTimesSection(pool, {
      churchId: dch.records.church.id,
      branchId: null,
    });
    const before = await homeFoundation(pool, dch.records.church.id);
    assert.equal(before.hasHome, true);
    assert.equal(before.serviceSections, 1);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await deleteChurchScopedContent(client, [dch.records.church.id]);
      const left = await client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM blessboard.public_pages WHERE church_id = $1) AS pages,
           (SELECT COUNT(*)::int FROM blessboard.page_sections s
              JOIN blessboard.public_pages p ON p.id = s.page_id
             WHERE p.church_id = $1) AS sections`,
        [dch.records.church.id]
      );
      assert.equal(left.rows[0].pages, 0);
      assert.equal(left.rows[0].sections, 0);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("23–24: mobile editor markup remains usable", async () => {
    requireDb();
    const { res } = await authedGet("/hq/content/pages/home", users.hq);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-service-times-editor="1"/);
    assert.match(res.text, /data-bb-service-times-add/);
    assert.doesNotMatch(res.text, /overflow-x:\s*scroll/);
    assert.match(res.text, /bb-hq-nav|data-bb-hq|bb-hq-shell/i);
  });
});
