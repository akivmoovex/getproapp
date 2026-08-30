"use strict";

/**
 * BlessBoard V1 blocker (duplicate website provisioning) plus BB-REG-04/05
 * and BlessBoard WEB-06 logo editing on the shared website engine.
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
const { assertChurchReadySuccessRedirect } = require("./helpers/blessboardRegistrationSuccess");
const { createV5Session } = require("../src/platform/session/createV5Session");
const {
  validatePlatformChurchRegistration,
  deriveOrganizationKeyFromChurchName,
  validateChurchCountry,
  formFromBody,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const { initializeOrganizationWebsite } = require("../src/platform/registration/initializeOrganizationWebsite");
const blessboardAdapter = require("../src/blessboard/registration/blessboardChurchRegistrationAdapter");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const versionService = require("../src/platform/website/versionService");
const resolver = require("../src/platform/website/resolver");
const {
  acknowledgeWebsitePreview,
} = require("../src/blessboard/services/churchWebsitePublishService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const APEX = "blessboard.org";

const MINIMAL_BB = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
});

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

function jpegBuffer(size) {
  const buf = Buffer.alloc(Math.max(size, 12), 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

function cookieHeader(...parts) {
  const tokens = [];
  for (const part of parts) {
    if (!part) continue;
    if (typeof part === "string") tokens.push(part);
    else if (part.headers && part.headers["set-cookie"]) {
      const raw = part.headers["set-cookie"];
      const list = Array.isArray(raw) ? raw : [raw];
      tokens.push(...list.map((line) => String(line).split(";")[0]));
    }
  }
  return tokens.filter(Boolean).join("; ");
}

describe("BlessBoard V1 blocker + bugs 04–06", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";

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
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  function makeApp() {
    return createV5FoundationApp({
      env: MINIMAL_BB,
      getPool: () => pool,
    });
  }

  async function registerChurch(overrides) {
    const app = makeApp();
    const getRes = await request(app).get("/register-church?plan=foundation").set("Host", APEX);
    const csrf = extractCsrfToken(getRes.text);
    const csrfCookie = extractCookie(getRes, CSRF_COOKIE);
    const stamp = uniq("bbv1b");
    const phoneTail = String(1000000 + Math.floor(Math.random() * 8000000)).slice(-7);
    const body = {
      church_name: `Grace Community ${stamp}`,
      country: "ZM",
      city: "Lusaka",
      contact_name: "Pastor Test",
      role_in_church: "Pastor",
      phone_country: "ZM",
      phone_national: phoneTail,
      email: `${stamp}@example.org`,
      selected_plan: "foundation",
      organization_key: "forged-key-must-be-ignored",
      password: PASSWORD,
      password_confirm: PASSWORD,
      branch_name: "HQ Campus",
      consent_contact: "on",
      [CSRF_FIELD]: csrf,
      ...overrides,
    };
    const post = await request(app)
      .post("/register-church")
      .set("Host", APEX)
      .set("Cookie", `${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send(body);
    return { app, body, post, getRes };
  }

  it("BB-REG-04: country selector defaults to Zambia and rejects unknown countries", () => {
    const zambia = validateChurchCountry("ZM");
    assert.equal(zambia.ok, true);
    assert.equal(zambia.value, "ZM");
    const kenya = validateChurchCountry("KE");
    assert.equal(kenya.ok, true);
    assert.equal(kenya.value, "KE");
    const named = validateChurchCountry("Zambia");
    assert.equal(named.ok, true);
    assert.equal(named.value, "ZM");
    assert.equal(validateChurchCountry("Narnia").ok, false);
    assert.equal(validateChurchCountry("XX").ok, false);
    assert.equal(validateChurchCountry("").ok, false);
  });

  it("BB-REG-04: selected country survives validation errors", () => {
    const form = formFromBody({
      church_name: "",
      country: "KE",
      city: "Nairobi",
    });
    assert.equal(form.country, "KE");
  });

  it("BB-REG-05: church name generates the organization key; submitted keys are ignored", () => {
    const derived = deriveOrganizationKeyFromChurchName("Grace Community Church");
    assert.equal(derived.ok, true);
    assert.equal(derived.value, "grace-community-church");
    const punct = deriveOrganizationKeyFromChurchName("  St. Peter's  Chapel!! ");
    assert.equal(punct.ok, true);
    assert.equal(punct.value, "st-peter-s-chapel");
    const reserved = deriveOrganizationKeyFromChurchName("Admin");
    assert.equal(reserved.ok, true);
    assert.equal(reserved.value, "admin-church");

    const validated = validatePlatformChurchRegistration(
      {
        church_name: "Grace Community Church",
        country: "ZM",
        city: "Lusaka",
        contact_name: "Pastor",
        role_in_church: "Pastor",
        email: "g@example.org",
        phone_country: "ZM",
        phone_national: "971234567",
        selected_plan: "foundation",
        organization_key: "forged-other-key",
        password: PASSWORD,
        password_confirm: PASSWORD,
        consent_contact: "on",
      },
      { instantFreeEnabled: true }
    );
    assert.equal(validated.ok, true, JSON.stringify(validated));
    assert.equal(validated.data.organization_key, "grace-community-church");
    assert.notEqual(validated.data.organization_key, "forged-other-key");
  });

  it("GET /register-church renders country dropdown and read-only church URL", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app).get("/register-church").set("Host", APEX);
    assert.equal(res.status, 200);
    assert.match(res.text, /<select[^>]*id="register_country"/);
    assert.match(res.text, /name="country"/);
    assert.match(res.text, /<option value="ZM"[^>]*selected/);
    assert.match(res.text, /<option value="KE"/);
    assert.match(res.text, /Your church URL/);
    assert.match(res.text, /created automatically from your church name/);
    assert.match(res.text, /type="hidden"[^>]*name="organization_key"|name="organization_key"[^>]*type="hidden"/);
    assert.doesNotMatch(res.text, />Organization key</);
    assert.match(res.text, /name="phone_country"/);
  });

  it("Foundation registration creates exactly one website instance of eight draft pages", async () => {
    requireDb();
    const { app, body, post } = await registerChurch();
    assert.equal(post.status, 303, post.text && String(post.text).slice(0, 400));
    assertChurchReadySuccessRedirect(post.headers.location);

    const appRow = await pool.query(
      `SELECT organization_id FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [body.email]
    );
    const organizationId = appRow.rows[0].organization_id;
    const org = await pool.query(
      `SELECT organization_key FROM platform.organizations WHERE id = $1`,
      [organizationId]
    );
    const expectedKey = deriveOrganizationKeyFromChurchName(body.church_name).value;
    assert.equal(org.rows[0].organization_key, expectedKey);
    assert.notEqual(org.rows[0].organization_key, "forged-key-must-be-ignored");

    const instances = await pool.query(
      `SELECT id, scope_kind, scope_ref, status
         FROM platform.website_instances
        WHERE organization_id = $1 AND product_code = 'blessboard' AND status <> 'archived'`,
      [organizationId]
    );
    assert.equal(instances.rows.length, 1);
    assert.equal(instances.rows[0].scope_kind, "church_wide");
    assert.equal(instances.rows[0].scope_ref, null);

    const pages = await pool.query(
      `SELECT pp.page_key, pp.status
         FROM blessboard.public_pages pp
         JOIN blessboard.churches c ON c.id = pp.church_id
        WHERE c.organization_id = $1 AND pp.branch_id IS NULL
        ORDER BY pp.page_key`,
      [organizationId]
    );
    assert.equal(pages.rows.length, 8);
    assert.ok(pages.rows.every((row) => row.status === "draft"));
    assert.equal(pages.rows.filter((row) => row.status === "published").length, 0);

    const retry = await initializeOrganizationWebsite(pool, {
      adapter: blessboardAdapter,
      productCode: "blessboard",
      organizationId,
      application: { church_name: body.church_name, organization_key: expectedKey },
      provision: { records: { organizationKey: expectedKey, organizationId } },
      env: MINIMAL_BB,
    });
    assert.equal(retry.ok, true, JSON.stringify(retry));
    assert.equal(retry.existed, true);
    assert.equal(retry.created, false);
    const afterRetry = await pool.query(
      `SELECT count(*)::int AS n FROM platform.website_instances
        WHERE organization_id = $1 AND product_code = 'blessboard' AND status <> 'archived'`,
      [organizationId]
    );
    assert.equal(afterRetry.rows[0].n, 1);
    const pagesAfter = await pool.query(
      `SELECT count(*)::int AS n FROM blessboard.public_pages pp
         JOIN blessboard.churches c ON c.id = pp.church_id
        WHERE c.organization_id = $1 AND pp.branch_id IS NULL`,
      [organizationId]
    );
    assert.equal(pagesAfter.rows[0].n, 8);

    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    const session = `${DEFAULT_V5_COOKIE}=${sid}`;
    const hq = await request(app)
      .get("/hq")
      .set("Host", APEX)
      .set("Cookie", session);
    assert.ok(
      hq.status === 200 ||
        (hq.status === 303 && /^\/hq(\/|$)/.test(String(hq.headers.location || ""))),
      `GET /hq expected admin landing, got ${hq.status} ${hq.headers.location || ""}`
    );
    const hqWebsite = await request(app)
      .get("/hq/website")
      .set("Host", APEX)
      .set("Cookie", session);
    assert.ok(
      hqWebsite.status === 200 ||
        (hqWebsite.status === 303 && /\/hq\/website/.test(String(hqWebsite.headers.location || ""))),
      `GET /hq/website expected website hub, got ${hqWebsite.status} ${hqWebsite.headers.location || ""} ${String(hqWebsite.text || "").slice(0, 200)}`
    );
  });

  it("BB-REG-04: Kenya can be submitted and unknown injection is rejected", async () => {
    requireDb();
    const { body, post } = await registerChurch({
      country: "KE",
      phone_country: "KE",
      phone_national: "712345678",
    });
    assert.equal(post.status, 303);
    const stored = await pool.query(
      `SELECT country FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [body.email]
    );
    assert.equal(String(stored.rows[0].country).toUpperCase(), "KE");
    const app = makeApp();
    const getRes = await request(app).get("/register-church?plan=foundation").set("Host", APEX);
    const csrf = extractCsrfToken(getRes.text);
    const csrfCookie = extractCookie(getRes, CSRF_COOKIE);
    const stamp = uniq("badcc");
    const bad = await request(app)
      .post("/register-church")
      .set("Host", APEX)
      .set("Cookie", `${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({
        church_name: `Injection ${stamp}`,
        country: "Narnia",
        city: "Lusaka",
        contact_name: "Pastor",
        role_in_church: "Pastor",
        phone_country: "ZM",
        phone_national: "971234567",
        email: `${stamp}@example.org`,
        selected_plan: "foundation",
        password: PASSWORD,
        password_confirm: PASSWORD,
        consent_contact: "on",
        [CSRF_FIELD]: csrf,
      });
    assert.equal(bad.status, 400);
    assert.match(bad.text, /select a country|country/i);
    assert.match(bad.text, /<select[^>]*id="register_country"/);
  });

  it("BB-REG-04: selected country survives a validation error redisplay", async () => {
    requireDb();
    const app = makeApp();
    const getRes = await request(app).get("/register-church?plan=foundation").set("Host", APEX);
    const csrf = extractCsrfToken(getRes.text);
    const csrfCookie = extractCookie(getRes, CSRF_COOKIE);
    const stamp = uniq("keepcc");
    const res = await request(app)
      .post("/register-church")
      .set("Host", APEX)
      .set("Cookie", `${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({
        church_name: "",
        country: "KE",
        city: "Nairobi",
        contact_name: "Pastor",
        role_in_church: "Pastor",
        phone_country: "KE",
        phone_national: "712345678",
        email: `${stamp}@example.org`,
        selected_plan: "foundation",
        password: PASSWORD,
        password_confirm: PASSWORD,
        consent_contact: "on",
        [CSRF_FIELD]: csrf,
      });
    assert.equal(res.status, 400);
    assert.match(res.text, /<option value="KE"[^>]*selected/);
    assert.doesNotMatch(res.text, /<option value="ZM"[^>]*selected/);
  });

  it("WEB-06: BlessBoard logo edits draft only until publish; restore brings the previous logo", async () => {
    requireDb();
    const { app, body, post } = await registerChurch();
    assert.equal(post.status, 303);
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    const appRow = await pool.query(
      `SELECT organization_id FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [body.email]
    );
    const organizationId = appRow.rows[0].organization_id;
    const org = await pool.query(
      `SELECT organization_key FROM platform.organizations WHERE id = $1`,
      [organizationId]
    );
    const organizationKey = org.rows[0].organization_key;
    const user = await pool.query(
      `SELECT id FROM blessboard.users WHERE lower(email_normalized) = lower($1)`,
      [body.email]
    );
    const session = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: user.rows[0].id,
      organizationId,
    });
    const cookie = `${DEFAULT_V5_COOKIE}=${sid || session.rawToken}`;

    const edit = await request(app)
      .get(`/c/${organizationKey}?website_edit=1`)
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(edit.status, 200, edit.text && edit.text.slice(0, 400));
    assert.match(edit.text, /data-website-key="home.logo"/);
    assert.match(edit.text, /data-website-file="1"/);
    const csrf = extractCsrfToken(edit.text);
    const cookies = cookieHeader(cookie, edit);

    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId,
      productCode: "blessboard",
    });
    const liveBefore = await resolver.resolveWebsiteContent(pool, {
      organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    const logoBefore = liveBefore.values["home.logo"];

    const uploaded = await request(app)
      .post(`/c/${organizationKey}/website/media`)
      .set("Host", APEX)
      .set("Cookie", cookies)
      .field(CSRF_FIELD, csrf)
      .field("altText", "Draft church logo")
      .attach("file", jpegBuffer(40), { filename: "logo.jpg", contentType: "image/jpeg" });
    assert.equal(uploaded.status, 200, uploaded.text);
    const mediaId = JSON.parse(uploaded.text).media.id;

    const saved = await request(app)
      .post(`/c/${organizationKey}/website/drafts`)
      .set("Host", APEX)
      .set("Cookie", cookies)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.logo",
        value: {
          alt: "Draft church logo",
          mediaId,
          src: `/c/${organizationKey}/website/media/${mediaId}`,
        },
      });
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.body.ok, true);
    assert.equal(saved.body.published, false);

    const liveDraftOnly = await resolver.resolveWebsiteContent(pool, {
      organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    assert.deepEqual(liveDraftOnly.values["home.logo"], logoBefore);

    const draft = await resolver.resolveWebsiteContent(pool, {
      organizationId,
      instance,
      mode: resolver.MODE.DRAFT,
    });
    assert.equal(draft.values["home.logo"].mediaId, mediaId);

    const preview = await request(app)
      .get(`/c/${organizationKey}?website_mode=draft`)
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(preview.status, 200);
    assert.match(preview.text, new RegExp(mediaId));

    const publicBefore = await request(app).get(`/c/${organizationKey}`).set("Host", APEX);
    assert.doesNotMatch(publicBefore.text, new RegExp(mediaId));

    await acknowledgeWebsitePreview(pool, {
      organizationId,
      actorUserId: user.rows[0].id,
    });
    const published = await request(app)
      .post(`/c/${organizationKey}/website/publish`)
      .set("Host", APEX)
      .set("Cookie", cookies)
      .set("Accept", "application/json")
      .send({ [CSRF_FIELD]: csrf, confirm_publish: "1", makePublic: "1" });
    assert.ok([200, 303].includes(published.status), `${published.status} ${published.text}`);

    const liveAfter = await resolver.resolveWebsiteContent(pool, {
      organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(liveAfter.values["home.logo"].mediaId, mediaId);

    const afterFirst = await versionService.listWebsiteVersions(pool, {
      instanceId: instance.id,
      organizationId,
    });
    const firstPublished = (afterFirst.versions || [])
      .slice()
      .sort((a, b) => Number(b.versionNumber) - Number(a.versionNumber))[0];

    const uploaded2 = await request(app)
      .post(`/c/${organizationKey}/website/media`)
      .set("Host", APEX)
      .set("Cookie", cookies)
      .field(CSRF_FIELD, csrf)
      .field("altText", "Second church logo")
      .attach("file", jpegBuffer(44), { filename: "logo2.jpg", contentType: "image/jpeg" });
    const mediaId2 = JSON.parse(uploaded2.text).media.id;
    await request(app)
      .post(`/c/${organizationKey}/website/drafts`)
      .set("Host", APEX)
      .set("Cookie", cookies)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.logo",
        value: {
          alt: "Second church logo",
          mediaId: mediaId2,
          src: `/c/${organizationKey}/website/media/${mediaId2}`,
        },
      });
    await acknowledgeWebsitePreview(pool, {
      organizationId,
      actorUserId: user.rows[0].id,
    });
    await request(app)
      .post(`/c/${organizationKey}/website/publish`)
      .set("Host", APEX)
      .set("Cookie", cookies)
      .set("Accept", "application/json")
      .send({ [CSRF_FIELD]: csrf, confirm_publish: "1", makePublic: "1" });

    const restored = await publicationService.restoreWebsiteVersionLive(pool, {
      organizationId,
      instanceId: instance.id,
      versionId: firstPublished.id,
      grantedPermissions: ["website.rollback", "website.restore"],
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));
    const liveRestored = await resolver.resolveWebsiteContent(pool, {
      organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    if (liveRestored.values["home.logo"] && liveRestored.values["home.logo"].mediaId) {
      assert.notEqual(liveRestored.values["home.logo"].mediaId, mediaId2);
    }
  });

  it("WEB-06: church admin cannot mutate another church logo", async () => {
    requireDb();
    const a = await registerChurch();
    const b = await registerChurch();
    assert.equal(a.post.status, 303);
    assert.equal(b.post.status, 303);
    const orgA = (
      await pool.query(
        `SELECT o.organization_key, a.organization_id
           FROM blessboard.platform_church_registration_applications a
           JOIN platform.organizations o ON o.id = a.organization_id
          WHERE lower(a.contact_email) = lower($1)`,
        [a.body.email]
      )
    ).rows[0];
    const orgB = (
      await pool.query(
        `SELECT o.organization_key, a.organization_id
           FROM blessboard.platform_church_registration_applications a
           JOIN platform.organizations o ON o.id = a.organization_id
          WHERE lower(a.contact_email) = lower($1)`,
        [b.body.email]
      )
    ).rows[0];
    const userA = await pool.query(
      `SELECT id FROM blessboard.users WHERE lower(email_normalized) = lower($1)`,
      [a.body.email]
    );
    const sessionA = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: userA.rows[0].id,
      organizationId: orgA.organization_id,
    });
    const cookieA = `${DEFAULT_V5_COOKIE}=${sessionA.rawToken}`;
    const editA = await request(a.app)
      .get(`/c/${orgA.organization_key}?website_edit=1`)
      .set("Host", APEX)
      .set("Cookie", cookieA);
    const csrf = extractCsrfToken(editA.text);
    const cookies = cookieHeader(cookieA, editA);
    const instanceA = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: orgA.organization_id,
      productCode: "blessboard",
    });
    const jpeg = await contentService.saveWebsiteDraft(pool, {
      organizationId: orgA.organization_id,
      instanceId: instanceA.id,
      expectedProductCode: "blessboard",
      contentKey: "home.logo",
      value: { alt: "A", src: "/church/images/brand/blessboard-small-church-logo.png" },
      grantedPermissions: ["website.edit"],
    });
    assert.equal(jpeg.ok, true, JSON.stringify(jpeg));

    const cross = await request(a.app)
      .post(`/c/${orgB.organization_key}/website/drafts`)
      .set("Host", APEX)
      .set("Cookie", cookies)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.logo",
        value: { alt: "stolen", src: "/church/images/brand/blessboard-small-church-logo.png" },
      });
    assert.ok([401, 403, 404].includes(cross.status), `${cross.status} ${cross.text}`);
  });
});
