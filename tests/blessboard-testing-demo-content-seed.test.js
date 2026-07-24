"use strict";

/**
 * BlessBoard V5 testing website demo content seed — safety + idempotency.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const content = require("../src/blessboard/services/publicContentAdminService");
const contentRepo = require("../src/blessboard/repositories/publicContentRepository");
const {
  evaluateTestingDemoContentEnvironment,
  seedTestingWebsiteDemoContent,
  STATUS,
  ALLOW_ENV,
} = require("../src/blessboard/services/testingWebsiteDemoContentService");
const spec = require("../src/blessboard/services/testingWebsiteDemoContentSpec");

const ROOT = path.resolve(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const ORG = "automated-test-church";
const CHURCH = "automated-test-church";
const HOST = "automated-test.blessboard.test";
const DEPLOY = "blessboard-org-v5";
const ACTOR = "church-hq-admin@example.test";

function runCli(args, envExtra = {}) {
  return spawnSync(
    process.execPath,
    [path.join(ROOT, "db/scripts/blessboard-testing-demo-content-seed.js"), ...args],
    {
      env: { ...process.env, ...envExtra },
      encoding: "utf8",
    }
  );
}

function parseJsonStdout(result) {
  const text = String(result.stdout || "").trim();
  assert.ok(text, `expected JSON stdout; stderr=${result.stderr}`);
  return JSON.parse(text);
}

describe("testing website demo content — environment gate", () => {
  it("refuses DEPLOYMENT_ENV=production", () => {
    const r = evaluateTestingDemoContentEnvironment({
      NODE_ENV: "development",
      DEPLOYMENT_ENV: "production",
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, STATUS.REFUSED_PRODUCTION);
  });

  it("refuses NODE_ENV=production without DEPLOYMENT_ENV=testing", () => {
    const r = evaluateTestingDemoContentEnvironment({
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "",
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, STATUS.REFUSED_PRODUCTION);
  });

  it("allows Hostinger-style NODE_ENV=production + DEPLOYMENT_ENV=testing", () => {
    const r = evaluateTestingDemoContentEnvironment({
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "testing",
    });
    assert.equal(r.ok, true);
  });

  it("allows NODE_ENV=test", () => {
    const r = evaluateTestingDemoContentEnvironment({ NODE_ENV: "test" });
    assert.equal(r.ok, true);
  });

  it(`allows ${ALLOW_ENV}=true in non-production`, () => {
    const r = evaluateTestingDemoContentEnvironment({
      NODE_ENV: "development",
      [ALLOW_ENV]: "true",
    });
    assert.equal(r.ok, true);
  });
});

describe("testing website demo content — spec safety", () => {
  it("giving instructions contain no real financial details", () => {
    assert.equal(spec.assertNoRealFinancialDetails(spec.GIVING.method.instructions), true);
    assert.ok(/TEST ONLY|DEMO-00-0000/i.test(spec.GIVING.method.instructions));
    assert.ok(!/IBAN|SWIFT|visa|mastercard/i.test(spec.GIVING.method.instructions));
  });

  it("events stay future-relative to d0", () => {
    const d0 = new Date("2026-07-24T00:00:00.000Z");
    const dates = spec.relativeDates(d0);
    for (const ev of dates.events) {
      assert.ok(new Date(ev.startsAt).getTime() > d0.getTime(), ev.title);
    }
  });

  it("seed sources do not touch V4 public.tenants / public.session", () => {
    const files = [
      "src/blessboard/services/testingWebsiteDemoContentService.js",
      "src/blessboard/services/testingWebsiteDemoContentSpec.js",
      "db/scripts/blessboard-testing-demo-content-seed.js",
    ];
    for (const rel of files) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      const codeOnly = text
        .split("\n")
        .filter((line) => !/^\s*(\*|\/\/)/.test(line) && !/^\s*\/\*/.test(line))
        .join("\n");
      assert.equal(/\bpublic\.tenants\b/.test(codeOnly), false, rel);
      assert.equal(/\bpublic\.session\b/.test(codeOnly), false, rel);
    }
  });
});

describe("testing website demo content — seed apply", () => {
  /** @type {import('pg').Pool|null} */
  let pool = null;
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
      const plat = await provisionPlatformTenant(pool, {
        organizationKey: ORG,
        displayName: spec.DEFAULT_DISPLAY_NAME,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: ORG,
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: DEPLOY,
        isPrimary: true,
        dryRun: false,
      });
      assert.equal(plat.ok, true, plat.message || plat.status);
      const church = await provisionBlessBoardChurch(pool, {
        organizationKey: ORG,
        churchKey: CHURCH,
        displayName: spec.DEFAULT_DISPLAY_NAME,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
        timezone: "UTC",
        dryRun: false,
      });
      assert.equal(church.ok, true, church.message || church.status);
      const user = await createBlessBoardUser(pool, {
        email: ACTOR,
        displayName: "HQ Admin Test",
        password: "TestPassword123!",
      });
      assert.equal(user.ok, true, user.message || user.status);
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("production env refuses inside seed service", async (t) => {
    if (skipSuite) return t.skip(skipReason);
    const refused = await seedTestingWebsiteDemoContent(pool, {
      dryRun: false,
      organizationKey: ORG,
      churchKey: CHURCH,
      env: { NODE_ENV: "production", DEPLOYMENT_ENV: "production" },
    });
    assert.equal(refused.ok, false);
    assert.equal(refused.status, STATUS.REFUSED_PRODUCTION);
  });

  it("apply seeds all expected content types (idempotent fill)", async (t) => {
    if (skipSuite) return t.skip(skipReason);
    const first = await seedTestingWebsiteDemoContent(pool, {
      dryRun: false,
      organizationKey: ORG,
      churchKey: CHURCH,
      actorEmail: ACTOR,
      d0: "2026-07-24T00:00:00.000Z",
      env: { NODE_ENV: "test", DEPLOYMENT_ENV: "testing" },
    });
    assert.equal(first.ok, true, first.message || first.detail);
    assert.ok(first.categories.leader >= 3);
    assert.ok(first.categories.ministry >= 4);
    assert.ok(first.categories.event >= 3);
    assert.ok(first.categories.sermon >= 4);
    assert.ok(first.categories.contact >= 3);
    assert.ok(first.categories.giving >= 1);
    assert.ok(first.categories.announcement >= 1);
    assert.ok(first.categories.service_times >= 1);

    const churchId = (
      await pool.query(`SELECT id FROM blessboard.churches WHERE church_key=$1`, [CHURCH])
    ).rows[0].id;
    const leaders = await content.listAdminLeaders(pool, { churchId });
    assert.ok(leaders.items.length >= 3);

    const home = await content.getAdminPageBundle(pool, {
      churchId,
      branchId: null,
      pageKey: "home",
    });
    const hero = (home.sections || []).find((s) => s.sectionKey === "hero");
    assert.ok(hero);
    assert.equal(hero.heading, spec.HERO.heading);
    assert.ok(hero.mediaUrl && hero.mediaUrl.includes("/church/images/"));

    const about = await content.getAdminPageBundle(pool, {
      churchId,
      branchId: null,
      pageKey: "about",
    });
    const keys = new Set((about.sections || []).map((s) => s.sectionKey));
    assert.ok(keys.has("mission"));
    assert.ok(keys.has("vision"));
    assert.ok(keys.has("values"));

    for (const startsAt of first.dates.eventStartsAt) {
      assert.ok(new Date(startsAt).getTime() > new Date("2026-07-24T00:00:00.000Z").getTime());
    }

    const giving = await content.listAdminGivingMethods(pool, { churchId });
    const gm = giving.items.find((i) => i.label === spec.GIVING.method.label);
    assert.ok(gm);
    assert.equal(spec.assertNoRealFinancialDetails(gm.instructions), true);
  });

  it("second apply is idempotent and does not duplicate", async (t) => {
    if (skipSuite) return t.skip(skipReason);
    const churchId = (
      await pool.query(`SELECT id FROM blessboard.churches WHERE church_key=$1`, [CHURCH])
    ).rows[0].id;
    const hqId = (
      await pool.query(
        `SELECT id FROM blessboard.branches WHERE church_id=$1 AND branch_key='hq'`,
        [churchId]
      )
    ).rows[0].id;
    const beforeLeaders = await content.listAdminLeaders(pool, { churchId });
    const beforeEvents = await content.listAdminEvents(pool, { churchId, branchId: hqId });

    const second = await seedTestingWebsiteDemoContent(pool, {
      dryRun: false,
      organizationKey: ORG,
      churchKey: CHURCH,
      actorEmail: ACTOR,
      d0: "2026-07-24T00:00:00.000Z",
      env: { NODE_ENV: "test", DEPLOYMENT_ENV: "testing" },
    });
    assert.equal(second.ok, true);
    assert.ok(
      (second.actions || []).every((a) => a.status !== STATUS.ERROR),
      JSON.stringify(second.actions.filter((a) => a.status === STATUS.ERROR))
    );

    const afterLeaders = await content.listAdminLeaders(pool, { churchId });
    assert.equal(afterLeaders.items.length, beforeLeaders.items.length);

    const afterEvents = await content.listAdminEvents(pool, { churchId, branchId: hqId });
    assert.equal(afterEvents.items.length, beforeEvents.items.length);
  });

  it("does not overwrite user-owned section by default", async (t) => {
    if (skipSuite) return t.skip(skipReason);
    const churchId = (
      await pool.query(`SELECT id FROM blessboard.churches WHERE church_key=$1`, [CHURCH])
    ).rows[0].id;
    const about = await content.getAdminPageBundle(pool, {
      churchId,
      branchId: null,
      pageKey: "about",
    });
    const mission = (about.sections || []).find((s) => s.sectionKey === "mission");
    assert.ok(mission);

    await contentRepo.updateSection(pool, mission.id, {
      heading: "User Mission Statement",
      bodyText: "This was written by a real admin and must be preserved.",
      layoutMetadata: { custom: true },
      status: "published",
    });

    const again = await seedTestingWebsiteDemoContent(pool, {
      dryRun: false,
      organizationKey: ORG,
      churchKey: CHURCH,
      actorEmail: ACTOR,
      env: { NODE_ENV: "test", DEPLOYMENT_ENV: "testing" },
    });
    assert.equal(again.ok, true);
    const skipped = (again.actions || []).find(
      (a) => a.record === "section.about.mission" && a.status === STATUS.SKIPPED
    );
    assert.ok(skipped, "expected mission section skip");

    const about2 = await content.getAdminPageBundle(pool, {
      churchId,
      branchId: null,
      pageKey: "about",
    });
    const mission2 = (about2.sections || []).find((s) => s.sectionKey === "mission");
    assert.equal(mission2.heading, "User Mission Statement");
    assert.equal(mission2.bodyText, "This was written by a real admin and must be preserved.");
  });

  it("refresh-demo-content updates demo-owned rows only", async (t) => {
    if (skipSuite) return t.skip(skipReason);
    const churchId = (
      await pool.query(`SELECT id FROM blessboard.churches WHERE church_key=$1`, [CHURCH])
    ).rows[0].id;
    const home = await content.getAdminPageBundle(pool, {
      churchId,
      branchId: null,
      pageKey: "home",
    });
    const hero = (home.sections || []).find((s) => s.sectionKey === "hero");
    assert.ok(hero);
    await contentRepo.updateSection(pool, hero.id, {
      layoutMetadata: spec.demoLayoutMetadata("section:home:hero"),
      heading: "Stale Demo Hero",
      bodyText: "Stale body",
      status: "published",
    });

    const refreshed = await seedTestingWebsiteDemoContent(pool, {
      dryRun: false,
      refreshDemoContent: true,
      organizationKey: ORG,
      churchKey: CHURCH,
      actorEmail: ACTOR,
      env: { NODE_ENV: "test", DEPLOYMENT_ENV: "testing" },
    });
    assert.equal(refreshed.ok, true);
    const heroAction = (refreshed.actions || []).find((a) => a.record === "section.home.hero");
    assert.ok(heroAction);
    assert.ok(
      heroAction.status === STATUS.REFRESHED || heroAction.status === STATUS.APPLIED,
      heroAction.status
    );

    const home2 = await content.getAdminPageBundle(pool, {
      churchId,
      branchId: null,
      pageKey: "home",
    });
    const hero2 = (home2.sections || []).find((s) => s.sectionKey === "hero");
    assert.equal(hero2.heading, spec.HERO.heading);

    const about = await content.getAdminPageBundle(pool, {
      churchId,
      branchId: null,
      pageKey: "about",
    });
    const mission = (about.sections || []).find((s) => s.sectionKey === "mission");
    assert.equal(mission.heading, "User Mission Statement");
  });

  it("never issues destructive DELETE against content tables in service source", () => {
    const text = fs.readFileSync(
      path.join(ROOT, "src/blessboard/services/testingWebsiteDemoContentService.js"),
      "utf8"
    );
    assert.equal(/\bDELETE\s+FROM\s+blessboard\./i.test(text), false);
    assert.equal(/\bTRUNCATE\b/i.test(text), false);
  });
});

describe("testing website demo content — CLI", () => {
  it("diagnose without DATABASE_URL fails safely", () => {
    const result = runCli(["--diagnose", `--organization-key=${ORG}`], {
      DATABASE_URL: "",
      GETPRO_DATABASE_URL: "",
      DEPLOYMENT_ENV: "testing",
      DATABASE_IDENTITY_EXPECTED: "",
    });
    assert.notEqual(result.status, 0);
    const json = parseJsonStdout(result);
    assert.equal(json.ok, false);
    assert.equal(json.writes, false);
  });
});
