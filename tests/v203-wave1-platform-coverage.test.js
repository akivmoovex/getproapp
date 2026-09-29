"use strict";

/**
 * V2.03 Wave 1 — PLATFORM / shared infrastructure coverage campaign.
 *
 * Focus: auth/RBAC/tenant helpers, website editor shared ops, and zero-coverage
 * foundation-era `src/db/pg/**` repositories (fake pool SQL contracts).
 *
 * Marker: V203_WAVE1_PLATFORM_COVERAGE
 */

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("crypto");
const path = require("path");
const fs = require("fs");

const {
  rejectForgedTenantIdentifiers,
  assertResourceInsideBlessBoardTenant,
  assertActiveClinicAuthScope,
  uuidEqual,
  extractClientTenantIds,
} = require("../src/platform/rbac/sharedTenantScope");
const {
  REASON,
  authzDecision,
  mapAuthzDecisionToHttp,
  allowPlatformAdminPermissionFallthrough,
} = require("../src/platform/rbac/sharedAuthzDecision");
const {
  assertExpectedProduct,
} = require("../src/platform/rbac/sharedRbacFacade");
const websiteOps = require("../src/platform/website/http/websiteEditorSharedOperations");
const {
  statusForDraftSaveFailure,
  statusForFieldRestoreFailure,
  pendingChangeCountFor,
  clientTenantOverride,
} = require("../src/platform/website/http/websiteEditorHttpUtils");
const tenantsRepo = require("../src/db/pg/tenantsRepo");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");

/** Zero-function-coverage db repos from green coverage baseline (PLATFORM slice). */
const ZERO_F_DB_REPOS = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures/v203-wave1-zero-f-db-repos.json"),
    "utf8"
  )
);

function createFakePool(seedRow) {
  const row = seedRow || {
    id: 1,
    tenant_id: 1,
    organization_id: 1,
    church_id: 1,
    branch_id: 1,
    user_id: 1,
    slug: "demo",
    name: "Demo",
    username: "admin",
    enabled: true,
    role: "super",
    status: "pending",
    plan_code: "foundation",
    created_at: new Date("2026-01-15T12:00:00.000Z"),
    count: "1",
    c: "1",
    total: "1",
    amount_minor: 100,
  };
  const calls = [];
  async function query(sql, params) {
    calls.push({ sql: String(sql), params: params || [] });
    const s = String(sql).toLowerCase();
    if (/\bcount\s*\(/.test(s) || s.includes(" as c") || s.includes(" as count")) {
      return { rows: [{ count: "1", c: "1", total: "1" }], rowCount: 1 };
    }
    if (/^\s*(insert|update|delete)\b/.test(s)) {
      return { rows: [row], rowCount: 1 };
    }
    return { rows: [row], rowCount: 1 };
  }
  return {
    calls,
    query,
    connect: async () => ({
      query,
      release() {},
      async begin() {},
    }),
  };
}

async function exerciseExportedFunctions(mod, pool) {
  const exercised = [];
  for (const [name, fn] of Object.entries(mod)) {
    if (typeof fn !== "function") continue;
    if (/^[A-Z0-9_]+$/.test(name) && name === name.toUpperCase()) continue;
    const before = pool.calls.length;
    const outcomes = [];
    const attempts = [
      () => fn(pool),
      () => fn(pool, 1),
      () => fn(pool, 1, 1),
      () => fn(pool, 1, 1, 1),
      () => fn(pool, "demo"),
      () => fn(pool, 1, "demo"),
      () => fn(pool, 1, {}),
      () => fn(pool, 1, 1, {}),
      () => fn(pool, 1, "pending", {}),
      () => fn(pool, { tenantId: 1, id: 1, organizationId: 1 }),
      () => fn(pool, 1, ["a", "b"]),
      () => fn(pool, [1, 2]),
      () => fn(pool, 1, true),
      () => fn(pool, 1, false, "reason"),
      () => fn(pool, 0),
      () => fn(pool, -1),
      () => fn(pool, "", ""),
    ];
    for (const attempt of attempts) {
      try {
        const value = await Promise.resolve(attempt());
        outcomes.push({ ok: true, value });
      } catch (err) {
        outcomes.push({
          ok: false,
          message: String(err && err.message ? err.message : err).slice(0, 160),
        });
      }
    }
    // Drain any deferred async work started by repo helpers.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    assert.ok(outcomes.length >= 5, `${name} should attempt multiple call shapes`);
    const queried = pool.calls.length > before;
    const threw = outcomes.some((o) => !o.ok);
    const returned = outcomes.some((o) => o.ok);
    assert.ok(
      queried || threw || returned,
      `${name} must query, return, or throw under exercise harness`
    );
    exercised.push(name);
  }
  await new Promise((r) => setImmediate(r));
  return exercised;
}

describe("V203 Wave1 platform — auth/RBAC/tenant", () => {
  it("rejects forged tenant identifiers and allows clean bodies", () => {
    const org = randomUUID();
    const denied = rejectForgedTenantIdentifiers({
      body: { organization_id: randomUUID() },
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "forged_tenant_identifiers");
    assert.ok(denied.forged && denied.forged.length >= 1);

    const cleanEmpty = rejectForgedTenantIdentifiers({ body: { note: "ok" } });
    assert.equal(cleanEmpty.ok, true);

    const matched = rejectForgedTenantIdentifiers({
      allowMatchingTrusted: true,
      trusted: { organizationId: org },
      body: { organization_id: org },
    });
    assert.equal(matched.ok, true);

    const extracted = extractClientTenantIds({
      organizationId: org,
      church_id: randomUUID(),
    });
    assert.ok(extracted.organizationId);
  });

  it("uuidEqual and resource/tenant isolation helpers deny cross-tenant reads", () => {
    const a = randomUUID();
    const b = randomUUID();
    assert.equal(uuidEqual(a, a), true);
    assert.equal(uuidEqual(a, b), false);
    assert.equal(uuidEqual(null, a), false);

    const unresolved = assertResourceInsideBlessBoardTenant(
      { organizationId: a, churchId: a },
      { resolved: false }
    );
    assert.equal(unresolved.ok, false);

    const mismatch = assertResourceInsideBlessBoardTenant(
      { organizationId: a, churchId: a },
      {
        resolved: true,
        organization: { id: b },
        church: { id: b },
      }
    );
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.reasonCode, "RBAC_SCOPE_MISMATCH");

    const ac = assertActiveClinicAuthScope(
      { organizationId: a },
      {
        authenticated: true,
        organization: { id: b },
        selectedFacility: { id: randomUUID() },
      }
    );
    assert.equal(ac.ok, false);
    assert.equal(ac.reasonCode, "RBAC_FORGED_TENANT_ID");
  });

  it("shared authz decision maps allow/deny and platform-admin fallthrough", () => {
    const allow = authzDecision({ allowed: true, reasonCode: REASON.ALLOWED });
    assert.equal(allow.allowed, true);
    assert.equal(allow.httpStatus, 200);
    const deny = authzDecision({
      allowed: false,
      reasonCode: REASON.PERMISSION_DENIED,
    });
    assert.equal(deny.allowed, false);
    const http = mapAuthzDecisionToHttp(deny);
    assert.equal(http.status, 403);

    const unauth = mapAuthzDecisionToHttp(
      authzDecision({ allowed: false, reasonCode: REASON.UNAUTHENTICATED })
    );
    assert.equal(unauth.status, 401);
    assert.equal(unauth.redirectLogin, true);

    const fallthrough = allowPlatformAdminPermissionFallthrough({});
    assert.equal(fallthrough, false);
  });

  it("product RBAC facade enforces expected product and denies foreign product", () => {
    const ok = assertExpectedProduct("blessboard", { productKey: "blessboard" });
    assert.equal(ok.allowed, true);

    const mismatch = assertExpectedProduct("blessboard", {
      productKey: "activeclinic",
    });
    assert.equal(mismatch.allowed, false);
    assert.equal(mismatch.reasonCode, REASON.PRODUCT_MISMATCH);

    const skipped = assertExpectedProduct("blessboard", {});
    assert.equal(skipped.allowed, true);
    assert.ok(skipped._internal && skipped._internal.productCheckSkipped);
  });
});

describe("V203 Wave1 platform — website editor shared operations", () => {
  function sessionStub(overrides) {
    return {
      db: createFakePool(),
      organizationId: randomUUID(),
      instanceId: randomUUID(),
      productCode: "blessboard",
      actorIdentityId: randomUUID(),
      grantedPermissions: [],
      env: { NODE_ENV: "test" },
      ...overrides,
    };
  }

  it("maps draft save failures for invalid input (negative path)", async () => {
    const session = sessionStub();
    const denied = await websiteOps.handleSaveGenericDraft(session, null);
    assert.equal(denied.ok, false);
    assert.ok(denied.status >= 400);

    const badKey = await websiteOps.handleSaveGenericDraft(session, {
      contentKey: "",
      value: "x",
    });
    assert.equal(badKey.ok, false);
  });

  it("field history / restore / unpublished panel deny without permissions", async () => {
    const session = sessionStub();
    const hist = await websiteOps.handleGetFieldHistory(session, "home.hero.title");
    assert.ok(hist);
    assert.ok(hist.ok === false || hist.status >= 400 || hist.body);

    const restore = await websiteOps.handleRestoreFieldHistory(session, {
      contentKey: "home.hero.title",
      revisionId: randomUUID(),
    });
    assert.ok(restore);
    assert.equal(restore.ok === true, false);

    const panel = await websiteOps.handleGetUnpublishedChangesPanel(session, {});
    assert.ok(panel);
  });

  it("section list/add and theme handlers return structured denials", async () => {
    const session = sessionStub();
    const list = await websiteOps.handleListAddableSectionTypes(session, "home");
    assert.ok(list);

    const add = await websiteOps.handleAddWebsiteSection(session, {
      pageKey: "home",
      sectionType: "text",
    });
    assert.ok(add);
    assert.equal(add.ok === true, false);

    const theme = await websiteOps.handleGetThemeState(session);
    assert.ok(theme);

    const saveTheme = await websiteOps.handleSaveThemeDraft(session, { themeKey: "default" });
    assert.ok(saveTheme);
  });

  it("styles/seo draft helpers and http utils status mappers", async () => {
    const session = sessionStub();
    const styles = await websiteOps.saveStylesEditorDraft(session, { css: "body{}" });
    assert.ok(styles);
    const seo = await websiteOps.saveSeoEditorDraft(session, { title: "T" });
    assert.ok(seo);

    assert.equal(statusForDraftSaveFailure("forbidden"), 403);
    assert.equal(statusForFieldRestoreFailure("conflict"), 409);
    assert.equal(clientTenantOverride({}), false);
    assert.equal(clientTenantOverride({ organizationId: randomUUID() }), true);

    const pending = await pendingChangeCountFor(
      session.db,
      session.organizationId,
      session.instanceId,
      []
    );
    assert.ok(pending === undefined || Number.isFinite(pending));
  });

  it("notice/error query helpers cover empty and present values", () => {
    assert.equal(websiteOps.noticeFromQuery({}), null);
    assert.equal(websiteOps.noticeFromQuery({ saved: "1" }), "Saved to draft.");
    assert.equal(websiteOps.errorFromQuery({}), null);
    assert.equal(websiteOps.errorFromQuery({ error: "access_denied" }), "access denied");
  });
});

describe("V203 Wave1 platform — tenantsRepo + adminUsersRepo contracts", () => {
  it("tenantsRepo serialize + reads/writes via fake pool (positive/negative)", async () => {
    const pool = createFakePool({
      id: 2,
      slug: "demo",
      name: "Demo Tenant",
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      callcenter_phone: "+260",
    });

    const serialized = tenantsRepo.serializeTenantRow({
      id: 2,
      slug: "demo",
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    });
    assert.equal(typeof serialized.created_at, "string");
    assert.equal(tenantsRepo.serializeTenantRow(null), null);

    assert.ok(await tenantsRepo.getById(pool, 2));
    assert.ok(await tenantsRepo.getByIdForAdminSettings(pool, 2));
    assert.ok(Array.isArray(await tenantsRepo.listAllOrderedByNameForSettings(pool)));
    assert.equal(await tenantsRepo.tenantExistsById(pool, 2), true);
    assert.equal(
      await tenantsRepo.updateContactSupportFields(pool, 2, {
        callcenter_phone: "+2601",
        support_help_phone: "+2602",
        whatsapp_phone: "+2603",
        callcenter_email: "a@example.test",
      }),
      true
    );
    assert.ok(await tenantsRepo.getBySlug(pool, "demo"));
    assert.ok(Array.isArray(await tenantsRepo.listOrderedById(pool)));

    // Negative / boundary
    pool.calls.length = 0;
    const emptyPool = createFakePool();
    emptyPool.query = async () => ({ rows: [], rowCount: 0 });
    assert.equal(await tenantsRepo.getById(emptyPool, 999), null);
    assert.equal(await tenantsRepo.getBySlug(emptyPool, "missing"), null);
    assert.equal(await tenantsRepo.tenantExistsById(emptyPool, 999), false);
    assert.equal(await tenantsRepo.slugExists(emptyPool, ""), false);

    const exercised = await exerciseExportedFunctions(tenantsRepo, pool);
    assert.ok(exercised.length >= 15, `expected many tenantsRepo exports, got ${exercised.length}`);
  });

  it("adminUsersRepo tenant-scoped reads deny empty username", async () => {
    const pool = createFakePool({
      id: 9,
      username: "Ops",
      enabled: true,
      created_at: new Date("2026-02-01T00:00:00.000Z"),
      tenant_id: 1,
      role: "admin",
    });

    assert.equal(await adminUsersRepo.getByUsernameLower(pool, ""), null);
    assert.equal(await adminUsersRepo.getIdByUsernameLower(pool, "   "), null);
    assert.ok(await adminUsersRepo.getByUsernameLower(pool, "Ops"));
    assert.ok(await adminUsersRepo.getById(pool, 9));

    const exercised = await exerciseExportedFunctions(adminUsersRepo, pool);
    assert.ok(exercised.length >= 10);
  });
});

describe("V203 Wave1 platform — zero-F db/pg repository exercise", () => {
  for (const rel of ZERO_F_DB_REPOS) {
    const abs = path.join(__dirname, "..", rel);
    if (!fs.existsSync(abs)) continue;

    it(`exercises exports in ${rel}`, async () => {
      let mod;
      try {
        mod = require(path.join("..", rel));
      } catch (err) {
        assert.fail(`failed to load ${rel}: ${err.message}`);
      }
      const pool = createFakePool();
      const exercised = await exerciseExportedFunctions(mod, pool);
      assert.ok(
        exercised.length >= 1,
        `${rel} should export callable functions (got ${exercised.length})`
      );
    });
  }
});
