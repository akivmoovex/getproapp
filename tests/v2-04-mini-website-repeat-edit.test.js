"use strict";

/**
 * V2.04 — MINI_WEBSITE_REPEAT_EDIT_CONFLICT final gate.
 * Same browser session: edit → save → edit → save must not false-conflict.
 * Genuine concurrent edits must still conflict.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
  foundationDbUnavailableSkipReason,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  createPageSection,
  updatePublicPage,
} = require("../src/blessboard/services/publicContentAdminService");
const { CODE_ACTIVECLINIC_ORG_V6 } = require("../src/platform/config/deploymentProfiles");
const {
  registerActiveClinicWebsiteTemplate,
  ACTIVECLINIC_TEMPLATE_ID,
  ACTIVECLINIC_TEMPLATE_VERSION,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const { provisionWebsiteInstance } = require("../src/platform/website/provisionService");
const { PUBLISH_POLICY } = require("../src/platform/website/publishPolicy");
const contentService = require("../src/platform/website/contentService");
const { PERMISSIONS } = require("../src/platform/website/permissions");
const { saveInlineFieldDraft } = require("../src/blessboard/services/websiteInlineDraftService");
const instanceRepo = require("../src/platform/website/instanceRepository");

const BB_PASSWORD = "repeat-edit-bb-pass!";
const MINIMAL_BB = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
});

let pool = null;
let skipReason = null;
let stamp = 0;

function requireDb() {
  return Boolean(pool) && !skipReason;
}

function extractCsrf(res) {
  const html = String(res.text || "");
  const meta = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (meta) return meta[1];
  const attr = html.match(/data-bb-csrf="([^"]+)"/);
  if (attr) return attr[1];
  const acAttr = html.match(/data-website-csrf-token="([^"]+)"/);
  if (acAttr) return acAttr[1];
  const field = html.match(new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"`));
  return field ? field[1] : issueCsrfToken(MINIMAL_BB);
}

function mergeCookies(session, pageRes) {
  const parts = [session];
  const set = pageRes && pageRes.headers && pageRes.headers["set-cookie"];
  if (Array.isArray(set)) parts.push(...set);
  else if (set) parts.push(set);
  return parts.join("; ");
}

function msToken(value) {
  return new Date(value).getTime();
}

async function seedBlessBoardHttpContext() {
  stamp += 1;
  const orgKey = `repeat-bb-${stamp}`;
  const org = await provisionPlatformTenant(pool, {
    organizationKey: orgKey,
    displayName: `Repeat BB ${stamp}`,
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: orgKey,
    hostname: `${orgKey}.blessboard.org`,
    domainType: "canonical",
    deploymentCode: "blessboard-org-staging",
    isPrimary: true,
  });
  assert.equal(org.ok, true, org.message);
  const organizationId = org.records.organization.id;
  const church = await provisionBlessBoardChurch(pool, {
    organizationKey: orgKey,
    churchKey: orgKey,
    displayName: `Repeat Church ${stamp}`,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "HQ",
  });
  assert.equal(church.ok, true, church.message);
  const churchId = church.records.church.id;
  await ensureChurchSettingsInitialized(pool, churchId);
  await updateChurchSettings(pool, churchId, {
    websiteStatus: "published",
    publicName: `Repeat Church ${stamp}`,
    primaryEmail: `hq-${stamp}@example.test`,
    primaryPhone: "+260971000099",
  });
  await provisionEmptyPublicPages(pool, { churchId, branchId: null });
  const home = await pool.query(
    `SELECT id FROM blessboard.public_pages
      WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL LIMIT 1`,
    [churchId]
  );
  await updatePublicPage(pool, home.rows[0].id, { status: "published" });
  await createPageSection(pool, {
    pageId: home.rows[0].id,
    sectionKey: "hero",
    sectionType: "hero",
    heading: "Original Hero",
    bodyText: "Original body",
    status: "published",
    sortOrder: 0,
  });
  const user = await createBlessBoardUser(pool, {
    email: `repeat-bb-${stamp}@example.test`,
    displayName: "Repeat BB",
    password: BB_PASSWORD,
  });
  assert.equal(user.ok, true, user.message);
  assert.equal(
    (
      await assignBlessBoardRole(pool, {
        email: user.user.email,
        roleKey: "church_hq_admin",
        organizationKey: orgKey,
        churchKey: orgKey,
      })
    ).ok,
    true
  );
  const session = await createV5Session(pool, {
    deploymentCode: "blessboard-org-staging",
    userId: user.user.id,
    organizationId,
    churchId,
    branchId: church.records.hqBranch.id,
  });
  assert.equal(session.ok, true, session.message || session.code);
  return {
    orgKey,
    organizationId,
    churchId,
    branchId: church.records.hqBranch.id,
    userId: user.user.id,
    sessionCookie: `${DEFAULT_V5_COOKIE}=${session.rawToken}`,
  };
}

async function seedActiveClinicInstance() {
  stamp += 1;
  registerActiveClinicWebsiteTemplate();
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `repeat-ac-${stamp}`,
    displayName: `Repeat AC ${stamp}`,
    productKey: "activeclinic",
    productTenantKey: `repeat-ac-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true);
  const provisioned = await provisionWebsiteInstance(pool, {
    organizationId: org.records.organization.id,
    templateId: ACTIVECLINIC_TEMPLATE_ID,
    templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
    slug: `repeat-ac-${stamp}`,
    status: "coming_soon",
    publishPolicy: PUBLISH_POLICY.TENANT_PUBLISH,
  });
  assert.equal(provisioned.ok, true);
  return {
    organizationId: org.records.organization.id,
    instance: provisioned.instance,
  };
}

describe("V2.04 mini-website repeat edit — static contract", () => {
  it("keeps conflict UX and shared-key token sync helpers", () => {
    const inline = fs.readFileSync(
      path.join(__dirname, "../public/platform/website-inline-edit.js"),
      "utf8"
    );
    assert.match(inline, /This field was updated elsewhere\. Reload and try again\./);
    assert.match(inline, /function applyFieldUpdatedAt/);
    assert.match(inline, /function normalizeUpdatedAtToken/);
    assert.match(inline, /querySelectorAll\('\[data-website-key="/);
    assert.match(inline, /data-website-updated-at/);
    assert.match(inline, /expectedUpdatedAt/);

    const routes = fs.readFileSync(
      path.join(__dirname, "../src/blessboard/http/blessboardWebsiteEditorRoutes.js"),
      "utf8"
    );
    assert.match(routes, /skipEngineWrite:\s*true/);
    assert.match(routes, /engineContent:\s*engineSaved\.content/);
    assert.match(routes, /getWebsiteContentRow/);

    const overlay = fs.readFileSync(
      path.join(__dirname, "../src/blessboard/services/websiteInlineDraftService.js"),
      "utf8"
    );
    assert.match(overlay, /skipEngineWrite === true/);
    assert.match(overlay, /expectedUpdatedAt: input\.expectedUpdatedAt/);
  });
});

describe("V2.04 mini-website repeat edit", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason =
        err && err.message
          ? foundationDbUnavailableSkipReason(err.message)
          : foundationDbUnavailableSkipReason(String(err));
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("documents stale token when engine row is written twice per save", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ctx = await seedBlessBoardHttpContext();
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: ctx.organizationId,
      productCode: "blessboard",
    });
    assert.ok(instance);
    const key = "home.hero.heading";
    const first = await contentService.saveWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: instance.id,
      contentKey: key,
      value: "Revision A",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    assert.equal(first.ok, true);
    const staleToken = first.content.updatedAt;
    await contentService.saveWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: instance.id,
      contentKey: key,
      value: "Revision A",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    const conflict = await contentService.saveWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: instance.id,
      contentKey: key,
      value: "Revision B",
      grantedPermissions: [PERMISSIONS.EDIT],
      expectedUpdatedAt: staleToken,
    });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, "conflict");
  });

  it("BB overlay dual-write skips second engine mutation", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ctx = await seedBlessBoardHttpContext();
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: ctx.organizationId,
      productCode: "blessboard",
    });
    assert.ok(instance);
    const key = "home.hero.heading";
    const engineSaved = await contentService.saveWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: instance.id,
      contentKey: key,
      value: "Once",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    assert.equal(engineSaved.ok, true);
    await saveInlineFieldDraft(pool, {
      organizationId: ctx.organizationId,
      churchId: ctx.churchId,
      branchId: ctx.branchId,
      editorUserId: ctx.userId,
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      newValue: "Once",
      grantedPermissions: [PERMISSIONS.EDIT],
      skipEngineWrite: true,
      engineContent: engineSaved.content,
    });
    const row = await contentService.getWebsiteContentRow(
      pool,
      instance.id,
      ctx.organizationId,
      key
    );
    assert.equal(msToken(row.updatedAt), msToken(engineSaved.content.updatedAt));
  });

  it("BB HTTP: V1→V2→V3→V4 sequential saves without false conflict", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ctx = await seedBlessBoardHttpContext();
    const app = createV5FoundationApp({ getPool: () => pool, env: MINIMAL_BB });
    const host = `${ctx.orgKey}.blessboard.org`;
    const edit = await request(app)
      .get(`/c/${ctx.orgKey}?website_edit=1&website_mode=draft`)
      .set("Host", host)
      .set("Cookie", ctx.sessionCookie);
    assert.equal(edit.status, 200);
    const csrf = extractCsrf(edit);
    assert.ok(csrf);
    const cookie = mergeCookies(ctx.sessionCookie, edit);
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: ctx.organizationId,
      productCode: "blessboard",
    });
    assert.ok(instance);

    const values = [`V1 ${stamp}`, `V2 ${stamp}`, `V3 ${stamp}`, `V4 ${stamp}`];
    let expected = null;
    let lastBody = null;
    for (let i = 0; i < values.length; i += 1) {
      const payload = {
        [CSRF_FIELD]: csrf,
        contentKey: "home.hero.heading",
        value: values[i],
      };
      if (expected) payload.expectedUpdatedAt = expected;
      const save = await request(app)
        .post(`/c/${ctx.orgKey}/website/drafts`)
        .set("Host", host)
        .set("Cookie", cookie)
        .set("X-CSRF-Token", csrf)
        .set("Accept", "application/json")
        .send(payload);
      assert.equal(save.status, 200, `BB_SAVE_${i + 1} ${JSON.stringify(save.body)}`);
      assert.equal(save.body.ok, true);
      assert.notEqual(save.body.code, "conflict");
      assert.equal(save.body.published, false);
      assert.equal(save.body.content.draftValue, values[i]);

      const fresh = await contentService.getWebsiteContentRow(
        pool,
        instance.id,
        ctx.organizationId,
        "home.hero.heading"
      );
      assert.equal(msToken(save.body.content.updatedAt), msToken(fresh.updatedAt));
      expected = save.body.content.updatedAt;
      lastBody = save.body;
    }
    assert.equal(lastBody.content.draftValue, values[3]);
  });

  it("BB HTTP: true concurrent edit still conflicts (stale second session)", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ctx = await seedBlessBoardHttpContext();
    const app = createV5FoundationApp({ getPool: () => pool, env: MINIMAL_BB });
    const host = `${ctx.orgKey}.blessboard.org`;
    const edit = await request(app)
      .get(`/c/${ctx.orgKey}?website_edit=1&website_mode=draft`)
      .set("Host", host)
      .set("Cookie", ctx.sessionCookie);
    const csrf = extractCsrf(edit);
    const cookie = mergeCookies(ctx.sessionCookie, edit);

    const baseline = await request(app)
      .post(`/c/${ctx.orgKey}/website/drafts`)
      .set("Host", host)
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .set("Accept", "application/json")
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.heading", value: `T1 ${stamp}` });
    assert.equal(baseline.status, 200);
    const t1 = baseline.body.content.updatedAt;

    const sessionA = await request(app)
      .post(`/c/${ctx.orgKey}/website/drafts`)
      .set("Host", host)
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.hero.heading",
        value: `T2-session-A ${stamp}`,
        expectedUpdatedAt: t1,
      });
    assert.equal(sessionA.status, 200, JSON.stringify(sessionA.body));
    assert.equal(sessionA.body.ok, true);

    const sessionB = await request(app)
      .post(`/c/${ctx.orgKey}/website/drafts`)
      .set("Host", host)
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.hero.heading",
        value: `stale-session-B ${stamp}`,
        expectedUpdatedAt: t1,
      });
    assert.equal(sessionB.status, 409, JSON.stringify(sessionB.body));
    assert.equal(sessionB.body.ok, false);
    assert.equal(sessionB.body.code, "conflict");
  });

  it("BB HTTP: multi-field sequential A→B→A without reload", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ctx = await seedBlessBoardHttpContext();
    const app = createV5FoundationApp({ getPool: () => pool, env: MINIMAL_BB });
    const host = `${ctx.orgKey}.blessboard.org`;
    const edit = await request(app)
      .get(`/c/${ctx.orgKey}?website_edit=1&website_mode=draft`)
      .set("Host", host)
      .set("Cookie", ctx.sessionCookie);
    const csrf = extractCsrf(edit);
    const cookie = mergeCookies(ctx.sessionCookie, edit);

    const saveA1 = await request(app)
      .post(`/c/${ctx.orgKey}/website/drafts`)
      .set("Host", host)
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.hero.heading",
        value: `FieldA-1 ${stamp}`,
      });
    assert.equal(saveA1.status, 200, JSON.stringify(saveA1.body));

    const saveB = await request(app)
      .post(`/c/${ctx.orgKey}/website/drafts`)
      .set("Host", host)
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.hero.bodyText",
        value: `FieldB-1 ${stamp}`,
      });
    assert.equal(saveB.status, 200, JSON.stringify(saveB.body));

    const saveA2 = await request(app)
      .post(`/c/${ctx.orgKey}/website/drafts`)
      .set("Host", host)
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.hero.heading",
        value: `FieldA-2 ${stamp}`,
        expectedUpdatedAt: saveA1.body.content.updatedAt,
      });
    assert.equal(saveA2.status, 200, JSON.stringify(saveA2.body));
    assert.equal(saveA2.body.content.draftValue, `FieldA-2 ${stamp}`);
  });

  it("AC service: V1→V2→V3 sequential saves + true concurrent conflict", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ac = await seedActiveClinicInstance();
    const key = "home.hero.title";
    const values = ["AC V1", "AC V2", "AC V3"];
    let expected = null;
    let last = null;
    for (let i = 0; i < values.length; i += 1) {
      const saved = await contentService.saveWebsiteDraft(pool, {
        organizationId: ac.organizationId,
        instanceId: ac.instance.id,
        expectedProductCode: "activeclinic",
        contentKey: key,
        value: values[i],
        grantedPermissions: [PERMISSIONS.EDIT],
        expectedUpdatedAt: expected,
      });
      assert.equal(saved.ok, true, `AC_SAVE_${i + 1} ${JSON.stringify(saved)}`);
      const fresh = await contentService.getWebsiteContentRow(
        pool,
        ac.instance.id,
        ac.organizationId,
        key
      );
      const responseToken = JSON.parse(JSON.stringify(saved.content)).updatedAt;
      assert.equal(msToken(responseToken), msToken(fresh.updatedAt));
      expected = responseToken;
      last = saved;
    }
    assert.equal(last.content.draftValue, "AC V3");

    const t1 = expected;
    const sessionA = await contentService.saveWebsiteDraft(pool, {
      organizationId: ac.organizationId,
      instanceId: ac.instance.id,
      expectedProductCode: "activeclinic",
      contentKey: key,
      value: "AC T2",
      grantedPermissions: [PERMISSIONS.EDIT],
      expectedUpdatedAt: t1,
    });
    assert.equal(sessionA.ok, true);

    const sessionB = await contentService.saveWebsiteDraft(pool, {
      organizationId: ac.organizationId,
      instanceId: ac.instance.id,
      expectedProductCode: "activeclinic",
      contentKey: key,
      value: "AC stale",
      grantedPermissions: [PERMISSIONS.EDIT],
      expectedUpdatedAt: t1,
    });
    assert.equal(sessionB.ok, false);
    assert.equal(sessionB.code, "conflict");
  });

  it("client shared-key token sync contract is wired", () => {
    const inline = fs.readFileSync(
      path.join(__dirname, "../public/platform/website-inline-edit.js"),
      "utf8"
    );
    // Simulate the normalize + apply contract used after save.
    function normalizeUpdatedAtToken(value) {
      if (value == null) return null;
      if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
      const text = String(value).trim();
      if (!text) return null;
      const parsed = new Date(text);
      return isNaN(parsed.getTime()) ? text : parsed.toISOString();
    }
    const raw = "2026-09-29T19:00:00.123Z";
    assert.equal(normalizeUpdatedAtToken(raw), "2026-09-29T19:00:00.123Z");
    assert.equal(normalizeUpdatedAtToken(new Date(raw)), "2026-09-29T19:00:00.123Z");
    assert.match(inline, /applyFieldUpdatedAt\(fieldEl, next\)/);
    assert.match(inline, /rememberFieldUpdatedAt/);
  });
});
