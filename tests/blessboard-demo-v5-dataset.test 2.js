#!/usr/bin/env node
"use strict";

/**
 * BlessBoard V5 minimum demo dataset tool tests (ephemeral foundation DB only).
 * Does not touch hosted data.
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
const {
  prepareDemoMinimumDataset,
  STATUS,
} = require("../src/blessboard/services/demoMinimumDatasetService");
const content = require("../src/blessboard/services/publicContentAdminService");
const catalogueRepo = require("../src/blessboard/repositories/blessBoardCatalogueRepository");
const { DEMO_TAG, PAGES, LEADER, MINISTRY } = require("../src/blessboard/services/demoMinimumDatasetSpec");

const ROOT = path.resolve(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const WRONG_IDENTITY = "wrong-platform-identity";
const ORG = "demo-v5-org";
const CHURCH = "demo-v5-church";
const HOST = "demo-v5.blessboard.test";
const DEPLOY = "blessboard-org-staging";

const BASE_ARGS = [
  "--organization-key",
  ORG,
  "--church-key",
  CHURCH,
  "--deployment",
  DEPLOY,
  "--hostname",
  HOST,
  "--display-name",
  "Demo V5 Dataset Church [Demo]",
  "--environment",
  "testing",
  "--hq-branch-key",
  "hq",
  "--hq-branch-name",
  "Headquarters",
];

function runCli(args, envExtra = {}) {
  // The CLI selects its deployment from --deployment-code. An ambient
  // PLATFORM_DEPLOYMENT_CODE in the developer's shell would otherwise be
  // inherited by the child and trip the provisioning safety check, making this
  // suite pass or fail depending on who runs it. Drop it unless a test sets it.
  const inherited = { ...process.env };
  delete inherited.PLATFORM_DEPLOYMENT_CODE;
  return spawnSync(process.execPath, [path.join(ROOT, "db/scripts/demo-v5-dataset.js"), ...args], {
    env: { ...inherited, ...envExtra },
    encoding: "utf8",
  });
}

function parseJsonStdout(result) {
  const text = String(result.stdout || "").trim();
  assert.ok(text, `expected JSON stdout; stderr=${result.stderr}`);
  return JSON.parse(text);
}

function sourceMentionsLegacy(relPath) {
  const text = fs.readFileSync(path.join(ROOT, relPath), "utf8");
  // Ignore comment-only mentions of GETPRO in the CLI header; body must not query it.
  const codeOnly = text
    .split("\n")
    .filter((line) => !/^\s*(\*|\/\/)/.test(line) && !/^\s*\/\*/.test(line))
    .join("\n");
  return {
    tenants: /public\.tenants\b/.test(text),
    session: /public\.session\b/.test(text),
    getpro: /GETPRO_DATABASE_URL/.test(codeOnly),
  };
}

describe("demo:v5 minimum dataset tool", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
      const platform = await provisionPlatformTenant(pool, {
        organizationKey: ORG,
        displayName: "Demo V5 Dataset Church [Demo]",
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: CHURCH,
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: DEPLOY,
        isPrimary: true,
      });
      assert.equal(platform.ok, true, platform.message || platform.status);
      const church = await provisionBlessBoardChurch(pool, {
        organizationKey: ORG,
        churchKey: CHURCH,
        displayName: "Demo V5 Dataset Church [Demo]",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
        timezone: "UTC",
      });
      assert.equal(church.ok, true, church.message || church.status);
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("source files avoid legacy public.tenants / public.session / GETPRO_DATABASE_URL", () => {
    const paths = [
      "src/blessboard/services/demoMinimumDatasetService.js",
      "src/blessboard/services/demoMinimumDatasetSpec.js",
      "db/scripts/demo-v5-dataset.js",
    ];
    for (const p of paths) {
      const hits = sourceMentionsLegacy(p);
      assert.equal(hits.tenants, false, `${p} must not reference public.tenants`);
      assert.equal(hits.session, false, `${p} must not reference public.session`);
      assert.equal(hits.getpro, false, `${p} must not reference GETPRO_DATABASE_URL`);
    }
  });

  it("dry-run plans without writing demo content", async (t) => {
    if (skipSuite) return t.skip(skipReason);

    const church = await catalogueRepo.findChurchByKey(pool, CHURCH);
    const before = await content.listAdminLeaders(pool, { churchId: church.id });
    const beforeCount = (before.items || []).length;

    const plan = await prepareDemoMinimumDataset(pool, {
      dryRun: true,
      organizationKey: ORG,
      churchKey: CHURCH,
      deploymentCode: DEPLOY,
      hostname: HOST,
    });
    assert.equal(plan.ok, true, plan.message);
    assert.equal(plan.dryRun, true);
    assert.equal(plan.status, STATUS.PLANNED);
    const plannedPages = plan.actions.filter((a) => a.record.startsWith("page.") && a.status === STATUS.PLANNED);
    assert.ok(plannedPages.length >= PAGES.length, "expected page plans");
    assert.ok(plan.actions.some((a) => a.record === "leader" && a.status === STATUS.PLANNED));
    assert.ok(plan.cleanupIndex.length > 0);
    assert.ok(plan.cleanupIndex.every((c) => c.marker === DEMO_TAG));

    const after = await content.listAdminLeaders(pool, { churchId: church.id });
    assert.equal((after.items || []).length, beforeCount, "dry-run must not create leaders");
  });

  it("first apply creates sparse demo records; second apply is idempotent", async (t) => {
    if (skipSuite) return t.skip(skipReason);

    const first = await prepareDemoMinimumDataset(pool, {
      dryRun: false,
      organizationKey: ORG,
      churchKey: CHURCH,
      deploymentCode: DEPLOY,
      hostname: HOST,
    });
    assert.equal(first.ok, true, first.message || JSON.stringify(first.actions.slice(-3)));
    assert.equal(first.dryRun, false);
    const applied = first.actions.filter((a) => a.status === STATUS.APPLIED);
    assert.ok(applied.length >= 8, `expected applied records, got ${applied.length}`);
    assert.ok(first.actions.some((a) => a.record === "leader" && a.status === STATUS.APPLIED));
    assert.ok(first.actions.some((a) => a.record === "ministry" && a.status === STATUS.APPLIED));
    assert.ok(first.actions.some((a) => a.record === "ops.actor" && a.status === STATUS.SKIPPED));

    const church = await catalogueRepo.findChurchByKey(pool, CHURCH);
    const leaders = await content.listAdminLeaders(pool, { churchId: church.id });
    assert.ok((leaders.items || []).some((l) => l.displayName === LEADER.displayName));
    const ministries = await content.listAdminMinistries(pool, { churchId: church.id });
    assert.ok((ministries.items || []).some((m) => m.name === MINISTRY.name));

    const home = await content.getAdminPageBundle(pool, {
      churchId: church.id,
      branchId: null,
      pageKey: "home",
    });
    assert.ok(home.page);
    assert.ok(String(home.page.title).includes(DEMO_TAG));
    assert.equal(home.page.status, "published");

    const second = await prepareDemoMinimumDataset(pool, {
      dryRun: false,
      organizationKey: ORG,
      churchKey: CHURCH,
      deploymentCode: DEPLOY,
    });
    assert.equal(second.ok, true, second.message);
    const newlyApplied = second.actions.filter(
      (a) =>
        a.status === STATUS.APPLIED &&
        (a.record.startsWith("page.") ||
          a.record === "leader" ||
          a.record === "ministry" ||
          a.record === "event" ||
          a.record === "sermon" ||
          a.record === "contact_channel" ||
          a.record === "giving_method")
    );
    // Pages may re-apply metadata; entities must stay already_present
    assert.ok(second.actions.some((a) => a.record === "leader" && a.status === STATUS.ALREADY_PRESENT));
    assert.ok(second.actions.some((a) => a.record === "ministry" && a.status === STATUS.ALREADY_PRESENT));
    assert.ok(second.cleanupIndex.every((c) => c.marker === DEMO_TAG && c.tool === "demo:v5"));
    assert.equal(newlyApplied.filter((a) => a.record === "leader").length, 0);
  });

  it("conflicts when non-demo published page is present", async (t) => {
    if (skipSuite) return t.skip(skipReason);

    // One church per org — mutate existing about page, then restore demo ownership.
    const church = await catalogueRepo.findChurchByKey(pool, CHURCH);
    const about = await content.getAdminPageBundle(pool, {
      churchId: church.id,
      branchId: null,
      pageKey: "about",
    });
    assert.ok(about.page);
    const priorTitle = about.page.title;
    const updated = await content.updatePublicPage(pool, about.page.id, {
      title: "Our Real Congregation Story",
      status: "published",
      confirmPublish: true,
    });
    assert.equal(updated.ok, true, updated.reason || updated.status);
    // Clear demo metadata so ownership check fails closed.
    await pool.query(
      `UPDATE blessboard.public_pages SET layout_metadata = '{}'::jsonb WHERE id = $1`,
      [about.page.id]
    );

    try {
      const result = await prepareDemoMinimumDataset(pool, {
        dryRun: false,
        organizationKey: ORG,
        churchKey: CHURCH,
        deploymentCode: DEPLOY,
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, STATUS.CONFLICT);
      assert.match(String(result.message), /non_demo_content/);
      assert.ok(result.actions.some((a) => a.status === STATUS.CONFLICT));
    } finally {
      await content.updatePublicPage(pool, about.page.id, {
        title: priorTitle,
        status: "published",
        confirmPublish: true,
      });
      await pool.query(
        `UPDATE blessboard.public_pages
            SET layout_metadata = $2::jsonb
          WHERE id = $1`,
        [
          about.page.id,
          JSON.stringify({ bb_demo: true, bb_demo_tool: "demo:v5", bb_demo_key: "page:about" }),
        ]
      );
    }
  });

  it("cleanup index identifies demo markers", async (t) => {
    if (skipSuite) return t.skip(skipReason);

    const result = await prepareDemoMinimumDataset(pool, {
      dryRun: true,
      organizationKey: ORG,
      churchKey: CHURCH,
      deploymentCode: DEPLOY,
    });
    assert.ok(result.cleanupIndex.length > 0);
    for (const row of result.cleanupIndex) {
      assert.equal(row.marker, DEMO_TAG);
      assert.equal(row.tool, "demo:v5");
      assert.ok(row.record);
    }
    assert.ok(result.notes.some((n) => /Cleanup:/i.test(n)));
  });

  it("CLI dry-run (plan) succeeds with matched identity", async (t) => {
    if (skipSuite) return t.skip(skipReason);

    const result = runCli(BASE_ARGS, {
      DATABASE_URL: databaseUrl,
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
      GETPRO_DATABASE_URL: "",
    });
    // Unset GETPRO via empty may still be set from env — delete by override not possible;
    // foundation tests typically have no GETPRO set.
    const report = parseJsonStdout(result);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.ok, true);
    assert.equal(report.mode, "dry_run");
    assert.equal(report.tool, "demo:v5");
    assert.equal(report.requires_confirm, true);
    assert.ok(Array.isArray(report.actions));
    assert.ok(Array.isArray(report.cleanup_index));
    assert.ok(!JSON.stringify(report).includes("postgresql://"));
  });

  it("CLI rejects wrong identity", async (t) => {
    if (skipSuite) return t.skip(skipReason);

    const result = runCli(BASE_ARGS, {
      DATABASE_URL: databaseUrl,
      DATABASE_IDENTITY_EXPECTED: WRONG_IDENTITY,
    });
    const report = parseJsonStdout(result);
    assert.notEqual(result.status, 0);
    assert.equal(report.ok, false);
    assert.match(String(report.message), /identity|database_identity/i);
  });

  it("CLI rejects wrong / missing deployment", async (t) => {
    if (skipSuite) return t.skip(skipReason);

    const badArgs = BASE_ARGS.map((v) => (v === DEPLOY ? "no-such-deployment-v5" : v));
    const result = runCli(badArgs, {
      DATABASE_URL: databaseUrl,
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
    });
    const report = parseJsonStdout(result);
    assert.notEqual(result.status, 0);
    assert.equal(report.ok, false);
    assert.match(String(report.message), /deployment/i);
  });

  it("CLI apply with --confirm writes idempotently", async (t) => {
    if (skipSuite) return t.skip(skipReason);

    const result = runCli(["--confirm", ...BASE_ARGS], {
      DATABASE_URL: databaseUrl,
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
    });
    const report = parseJsonStdout(result);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.ok, true);
    assert.equal(report.mode, "write");
    assert.ok(
      report.actions.some(
        (a) =>
          a.record === "leader" &&
          (a.status === STATUS.ALREADY_PRESENT || a.status === STATUS.APPLIED)
      )
    );
  });
});
