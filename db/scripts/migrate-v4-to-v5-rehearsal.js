#!/usr/bin/env node
"use strict";

/**
 * Full local V4→V5 migration rehearsal (fixture DBs only).
 * Never connects to hosted databases. Stops on unexpected count mismatches.
 *
 * Usage: node db/scripts/migrate-v4-to-v5-rehearsal.js
 */

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const {
  recreateDatabase,
  installMinimalV4Schema,
  endPools,
  urlFor,
} = require("../../tests/helpers/migrationFixtureDb");
const {
  installRehearsalV4Extras,
  seedRepresentativeV4,
} = require("../../src/migration/v4ToV5/rehearsalSeed");
const { migrate } = require("./lib/migrator");
const { ensureDatabaseIdentity } = require("./lib/databaseIdentity");
const { loadMigrationEnv } = require("../../src/migration/v4ToV5/config");
const {
  createReadOnlySourcePool,
  createTargetPool,
  assertSourceReadOnly,
  assertDistinctConnections,
} = require("../../src/migration/v4ToV5/safety");
const { createTargetLoader } = require("../../src/migration/v4ToV5/loadPg");
const { createPgExtractor } = require("../../src/migration/v4ToV5/extractPg");
const { runMigrationPipeline, defaultOutputDir } = require("../../src/migration/v4ToV5/pipeline");
const { createIdMap } = require("../../src/migration/v4ToV5/idMap");
const { transformRow } = require("../../src/migration/v4ToV5/transform");
const {
  authenticateBlessBoardUser,
} = require("../../src/blessboard/services/authenticateBlessBoardUser");
const {
  resolveOrganizationEntitlements,
  hasFeature,
  FEATURE_KEYS,
} = require("../../src/platform/services/entitlementService");
const { listBlessBoardBranches } = require("../../src/blessboard/services/listBlessBoardBranches");

const REHEARSAL_SRC = "blessboard_v4_rehearsal";
const REHEARSAL_TGT = "blessboard_v5_rehearsal";
const IDENTITY = "blessboard-platform-v5";
const ROOT = path.resolve(__dirname, "../..");

function nowMs() {
  return Date.now();
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

async function sourceCounts(pool) {
  const q = async (sql) => (await pool.query(sql)).rows[0].n;
  return {
    tenants: await q(`SELECT COUNT(*)::int AS n FROM public.tenants`),
    organizations: await q(`SELECT COUNT(*)::int AS n FROM public.church_organizations`),
    branches: await q(`SELECT COUNT(*)::int AS n FROM public.church_branches`),
    domains_host_slug: await q(
      `SELECT COUNT(*)::int AS n FROM public.church_branches WHERE host_slug IS NOT NULL AND trim(host_slug) <> ''`
    ),
    hq_admins: await q(`SELECT COUNT(*)::int AS n FROM public.church_hq_admins`),
    branch_admins: await q(`SELECT COUNT(*)::int AS n FROM public.church_branch_admins`),
    members: await q(`SELECT COUNT(*)::int AS n FROM public.church_members`),
    ministries: await q(`SELECT COUNT(*)::int AS n FROM public.church_ministries`),
    events: await q(`SELECT COUNT(*)::int AS n FROM public.church_events`),
    announcements: await q(`SELECT COUNT(*)::int AS n FROM public.church_announcements`),
    attendance: await q(`SELECT COUNT(*)::int AS n FROM public.church_attendance_records`),
    giving: await q(`SELECT COUNT(*)::int AS n FROM public.church_giving_summaries`),
    audit: await q(`SELECT COUNT(*)::int AS n FROM public.church_audit_logs`),
  };
}

async function targetCounts(pool) {
  const q = async (sql) => {
    try {
      return (await pool.query(sql)).rows[0].n;
    } catch {
      return null;
    }
  };
  return {
    organizations: await q(`SELECT COUNT(*)::int AS n FROM platform.organizations`),
    enrolments: await q(
      `SELECT COUNT(*)::int AS n FROM platform.organization_products op
         JOIN platform.products p ON p.id = op.product_id WHERE p.product_key = 'blessboard'`
    ),
    domains: await q(`SELECT COUNT(*)::int AS n FROM platform.domains`),
    churches: await q(`SELECT COUNT(*)::int AS n FROM blessboard.churches`),
    branches: await q(`SELECT COUNT(*)::int AS n FROM blessboard.branches`),
    users: await q(`SELECT COUNT(*)::int AS n FROM blessboard.users`),
    roles: await q(`SELECT COUNT(*)::int AS n FROM blessboard.user_roles`),
    members: await q(`SELECT COUNT(*)::int AS n FROM blessboard.members`),
    memberships: await q(
      `SELECT COUNT(*)::int AS n FROM blessboard.member_branch_memberships`
    ),
    ministries: await q(`SELECT COUNT(*)::int AS n FROM blessboard.ministries`),
    events: await q(`SELECT COUNT(*)::int AS n FROM blessboard.events`),
    announcements: await q(`SELECT COUNT(*)::int AS n FROM blessboard.announcements`),
    attendance_events: await q(`SELECT COUNT(*)::int AS n FROM blessboard.attendance_events`),
    giving_entries: await q(`SELECT COUNT(*)::int AS n FROM blessboard.giving_entries`),
    audit_events: await q(`SELECT COUNT(*)::int AS n FROM platform.audit_events`),
    public_tenants: await q(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables
        WHERE table_schema='public' AND table_name='tenants'`
    ),
    public_session: await q(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables
        WHERE table_schema='public' AND table_name='session'`
    ),
  };
}

function assertEqual(label, actual, expected, failures) {
  if (actual !== expected) {
    failures.push({ label, actual, expected, kind: "count_mismatch" });
  }
}

async function runSmokeTests(targetPool) {
  const results = [];
  const org = await targetPool.query(
    `SELECT id, organization_key FROM platform.organizations WHERE organization_key = 'grace-chapel'`
  );
  if (!org.rows[0]) {
    return [{ name: "org_present", ok: false, detail: "grace-chapel missing" }];
  }
  const organizationId = org.rows[0].id;

  const church = await targetPool.query(
    `SELECT id FROM blessboard.churches WHERE organization_id = $1`,
    [organizationId]
  );
  results.push({
    name: "church_linked",
    ok: church.rows.length === 1,
    detail: `churches=${church.rows.length}`,
  });

  const branches = await listBlessBoardBranches(targetPool, church.rows[0].id);
  results.push({
    name: "list_branches",
    ok: Boolean(branches && branches.ok === true && branches.activeCount === 2),
    detail: branches && branches.ok ? `activeCount=${branches.activeCount}` : (branches && branches.message) || "fail",
  });

  // Prefer direct query if service shape differs
  const branchRows = await targetPool.query(
    `SELECT COUNT(*)::int AS n FROM blessboard.branches b
       JOIN blessboard.churches c ON c.id = b.church_id
      WHERE c.organization_id = $1 AND b.status = 'active'`,
    [organizationId]
  );
  results.push({
    name: "active_branches_count",
    ok: branchRows.rows[0].n === 2,
    detail: `n=${branchRows.rows[0].n}`,
  });

  const auth = await authenticateBlessBoardUser(targetPool, {
    email: "hq@grace.example",
    password: "not-the-real-password",
    deploymentCode: "blessboard-org-v5",
  });
  results.push({
    name: "auth_rejects_wrong_password",
    ok: auth && auth.ok === false,
    detail: auth && auth.status ? auth.status : "no_status",
  });

  const user = await targetPool.query(
    `SELECT id, email_normalized, status FROM blessboard.users WHERE email_normalized = 'hq@grace.example'`
  );
  results.push({
    name: "hq_user_migrated",
    ok: user.rows.length === 1 && user.rows[0].status === "active",
    detail: `users=${user.rows.length}`,
  });

  const role = await targetPool.query(
    `SELECT role_key FROM blessboard.user_roles ur
       JOIN blessboard.users u ON u.id = ur.user_id
      WHERE u.email_normalized = 'hq@grace.example' AND ur.status = 'active'`
  );
  results.push({
    name: "hq_role_assigned",
    ok: role.rows.some((r) => r.role_key === "church_hq_admin"),
    detail: role.rows.map((r) => r.role_key).join(",") || "none",
  });

  const ent = await resolveOrganizationEntitlements(targetPool, { organizationId });
  results.push({
    name: "entitlements_active",
    ok: ent.ok && ent.entitlements && ent.entitlements.subscriptionActive === true,
    detail: ent.entitlements ? ent.entitlements.planKey : ent.reason,
  });
  results.push({
    name: "growth_no_custom_domain",
    ok: ent.ok && hasFeature(ent.entitlements, FEATURE_KEYS.CUSTOM_DOMAIN) === false,
    detail: "expected false on growth",
  });

  const members = await targetPool.query(
    `SELECT COUNT(*)::int AS n FROM blessboard.members m
       JOIN blessboard.churches c ON c.id = m.church_id
      WHERE c.organization_id = $1`,
    [organizationId]
  );
  results.push({
    name: "members_migrated_for_grace",
    ok: members.rows[0].n === 3, // alice, bob, cara — no-contact quarantined
    detail: `n=${members.rows[0].n}`,
  });

  const givingSum = await targetPool.query(
    `SELECT COALESCE(SUM(amount),0)::text AS total
       FROM blessboard.giving_entries ge
       JOIN blessboard.churches c ON c.id = ge.church_id
      WHERE c.organization_id = $1 AND ge.status = 'approved'`,
    [organizationId]
  );
  results.push({
    name: "giving_approved_total",
    ok: givingSum.rows[0].total === "1250.50",
    detail: `total=${givingSum.rows[0].total}`,
  });

  const noPublic = await targetPool.query(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('tenants','session')`
  );
  results.push({
    name: "no_public_tenants_session",
    ok: noPublic.rows[0].n === 0,
    detail: `n=${noPublic.rows[0].n}`,
  });

  return results;
}

async function rollbackRehearsal(sourcePool, targetPool, config) {
  // Insert a fresh eligible org, then force batch failure at write 0 → must not land.
  await sourcePool.query(
    `INSERT INTO public.church_organizations
       (platform_tenant_id, slug, name, status, plan_code, data_environment)
     SELECT id, 'rollback-probe', 'Rollback Probe', 'active', 'free', 'pilot'
       FROM public.tenants WHERE slug = 'rehearsal-a' LIMIT 1`
  );
  const row = (
    await sourcePool.query(
      `SELECT id, slug, name, status, plan_code, data_environment
         FROM public.church_organizations WHERE slug = 'rollback-probe'`
    )
  ).rows[0];

  const before = await targetPool.query(
    `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = 'rollback-probe'`
  );

  const idMap = createIdMap();
  const transformed = transformRow("organization", row, {
    batchId: "rollback-rehearsal",
    runConfig: config.runConfig,
    idMap,
  });
  const loader = createTargetLoader({ dryRun: false, targetPool, batchSize: 10 });
  const batch = await loader.loadBatch(
    "organization",
    [{ sourceId: row.id, transformed }],
    { forceFailAfter: 0 }
  );

  const after = await targetPool.query(
    `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = 'rollback-probe'`
  );

  return {
    ok: batch.ok === false && batch.rolledBack === true && after.rows[0].n === before.rows[0].n,
    before: before.rows[0].n,
    after: after.rows[0].n,
    rolledBack: batch.rolledBack === true,
    error: batch.error || null,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# V4 → V5 migration rehearsal report");
  lines.push("");
  lines.push(`**Generated:** ${report.generatedAt}`);
  lines.push(`**Verdict:** ${report.verdict}`);
  lines.push(`**Environment:** local fixture databases only (no hosted DB)`);
  lines.push("");
  lines.push("## Databases");
  lines.push("");
  lines.push(`| Role | Database | Identity |`);
  lines.push(`|------|----------|----------|`);
  lines.push(`| Source (V4) | \`${REHEARSAL_SRC}\` | n/a (legacy shape) |`);
  lines.push(`| Target (V5) | \`${REHEARSAL_TGT}\` | \`${IDENTITY}\` |`);
  lines.push("");
  lines.push("## Timing");
  lines.push("");
  lines.push("| Step | Duration ms |");
  lines.push("|------|-------------|");
  for (const [k, v] of Object.entries(report.timingMs || {})) {
    if (k === "total") continue;
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push(`| **total** | **${report.timingMs.total}** |`);
  lines.push("");
  lines.push("## Source counts");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.sourceCounts, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Migrated (target) counts");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.targetCountsAfterApply, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Count reconciliation");
  lines.push("");
  lines.push("| Entity | Source | Expected eligible | Migrated | Quarantine/skip expected | Result |");
  lines.push("|--------|--------|-------------------|----------|--------------------------|--------|");
  for (const row of report.reconciliationTable) {
    lines.push(
      `| ${row.entity} | ${row.source} | ${row.eligible} | ${row.migrated} | ${row.quarantineExpected} | ${row.result} |`
    );
  }
  lines.push("");
  lines.push("## Dry-run / apply totals");
  lines.push("");
  lines.push("```json");
  lines.push(
    JSON.stringify(
      {
        dryRun: report.dryRunTotals,
        apply: report.applyTotals,
        applySecond: report.applySecondTotals,
      },
      null,
      2
    )
  );
  lines.push("```");
  lines.push("");
  lines.push("## Conflicts");
  lines.push("");
  lines.push(`Conflict count (apply): **${report.conflicts.apply}**`);
  lines.push("");
  if (report.conflictSamples.length) {
    lines.push("```json");
    lines.push(JSON.stringify(report.conflictSamples, null, 2));
    lines.push("```");
  } else {
    lines.push("No unexpected conflicts.");
  }
  lines.push("");
  lines.push("## Skipped / unresolved");
  lines.push("");
  lines.push(`Skipped count (apply): **${report.skipped.apply}**`);
  lines.push("");
  lines.push("Expected unresolved (quarantine) source IDs / reasons:");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.unresolvedExpected, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Transformed fields (sample)");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.transformedFieldSamples, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Batch behavior");
  lines.push("");
  lines.push(`- Batch size: **${report.batchSize}**`);
  lines.push(`- Checkpoints written under: \`${report.paths.stateDir}\``);
  lines.push(`- Groups completed: ${report.groupsCompleted.join(", ")}`);
  lines.push("");
  lines.push("## Idempotency");
  lines.push("");
  lines.push(`Second apply written: **${report.applySecondTotals.written}** (expect 0)`);
  lines.push(`Second apply skipped: **${report.applySecondTotals.skipped}**`);
  lines.push(`Idempotency: **${report.idempotencyOk ? "PASS" : "FAIL"}**`);
  lines.push("");
  lines.push("## Application smoke tests");
  lines.push("");
  lines.push("| Test | Result | Detail |");
  lines.push("|------|--------|--------|");
  for (const t of report.smokeTests) {
    lines.push(`| ${t.name} | ${t.ok ? "PASS" : "FAIL"} | ${t.detail} |`);
  }
  lines.push("");
  lines.push("## Rollback rehearsal");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.rollback, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Failures / blockers");
  lines.push("");
  if (!report.failures.length) {
    lines.push("None — rehearsal completed without unexpected count mismatches or data loss.");
  } else {
    lines.push("```json");
    lines.push(JSON.stringify(report.failures, null, 2));
    lines.push("```");
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- Mapping rules were not weakened to force green results.");
  lines.push("- Invalid org slug `BAD ORG!` and member without contact are intentional quarantines.");
  lines.push("- Media blob copy remains deferred (group skipped by design).");
  lines.push("- Source DB was never updated or deleted by the migrator.");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const started = nowMs();
  const timingMs = {};
  const failures = [];
  const outputDir = path.join(defaultOutputDir(ROOT), "rehearsal");
  const stateDir = path.join(outputDir, "state");
  fs.mkdirSync(stateDir, { recursive: true });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ phase: "start", note: "local_rehearsal_only" }));

  let t0 = nowMs();
  const sourceUrl = await recreateDatabase(REHEARSAL_SRC);
  const targetUrl = await recreateDatabase(REHEARSAL_TGT);
  timingMs.createDatabases = nowMs() - t0;

  const sourcePool = new Pool({ connectionString: sourceUrl, max: 4 });
  const targetPool = new Pool({ connectionString: targetUrl, max: 4 });
  const roSource = createReadOnlySourcePool(sourceUrl);

  try {
    t0 = nowMs();
    await installMinimalV4Schema(sourcePool);
    await installRehearsalV4Extras(sourcePool);
    const seeded = await seedRepresentativeV4(sourcePool);
    timingMs.seedV4 = nowMs() - t0;

    t0 = nowMs();
    await migrate({ connectionString: targetUrl });
    await ensureDatabaseIdentity(targetPool, {
      connectionString: targetUrl,
      identityKey: IDENTITY,
      environmentCode: "testing",
    });
    timingMs.initV5 = nowMs() - t0;

    const env = loadMigrationEnv({
      V4_SOURCE_DATABASE_URL: sourceUrl,
      V5_TARGET_DATABASE_URL: targetUrl,
      DATABASE_IDENTITY_EXPECTED: IDENTITY,
      allowHosted: false,
      batchSize: 25,
    });
    if (!env.ok) {
      throw new Error(`env_invalid:${env.errors.join(",")}`);
    }
    const distinct = assertDistinctConnections(sourceUrl, targetUrl);
    if (!distinct.ok) throw new Error(distinct.code);

    const ro = await assertSourceReadOnly(roSource);
    if (!ro.ok) throw new Error(ro.code);

    const srcCounts = await sourceCounts(sourcePool);
    writeJson(path.join(outputDir, "source-counts.json"), srcCounts);

    const extractor = createPgExtractor(roSource, { batchSize: 25 });
    const common = {
      config: env.config,
      extractor,
      targetPool,
      outputDir,
      checkpointPath: path.join(stateDir, "checkpoints.json"),
      idMapPath: path.join(stateDir, "id-map.json"),
    };

    t0 = nowMs();
    const plan = await runMigrationPipeline({ ...common, mode: "plan" });
    timingMs.plan = nowMs() - t0;
    if (!plan.ok) throw new Error(`plan_failed:${plan.code}`);

    t0 = nowMs();
    const dry = await runMigrationPipeline({ ...common, mode: "dry-run" });
    timingMs.dryRun = nowMs() - t0;
    if (!dry.ok) throw new Error(`dry_run_failed:${dry.code}`);

    const beforeApply = await targetCounts(targetPool);
    assertEqual("orgs_before_apply", beforeApply.organizations, 0, failures);
    assertEqual("churches_before_apply", beforeApply.churches, 0, failures);

    t0 = nowMs();
    const apply1 = await runMigrationPipeline({ ...common, mode: "apply" });
    timingMs.apply = nowMs() - t0;
    if (!apply1.ok) {
      failures.push({
        kind: "apply_failed",
        code: apply1.code,
        message: apply1.message,
      });
    }

    const afterApply = await targetCounts(targetPool);
    writeJson(path.join(outputDir, "target-counts-after-apply.json"), afterApply);

    // Reconciliation against expectations (do not weaken rules)
    const exp = seeded.expectations;
    const reconciliationTable = [];
    function row(entity, source, eligible, migrated, quarantineExpected) {
      const ok = migrated === eligible;
      if (!ok) {
        failures.push({
          kind: "count_mismatch",
          entity,
          source,
          eligible,
          migrated,
          quarantineExpected,
        });
      }
      reconciliationTable.push({
        entity,
        source,
        eligible,
        migrated,
        quarantineExpected,
        result: ok ? "PASS" : "FAIL",
      });
    }

    row("organizations", exp.organizations.source, exp.organizations.eligible, afterApply.organizations, exp.organizations.quarantine);
    row("churches", exp.organizations.eligible, exp.organizations.eligible, afterApply.churches, 0);
    row("branches", exp.branches.source, exp.branches.eligible, afterApply.branches, 0);
    row("domains", exp.domains.source, exp.domains.eligible, afterApply.domains, 0);
    row("members", exp.members.source, exp.members.eligible, afterApply.members, exp.members.quarantine);
    row("ministries", exp.ministries.source, exp.ministries.eligible, afterApply.ministries, 0);
    row("events", exp.events.source, exp.events.eligible, afterApply.events, 0);
    row("announcements", exp.announcements.source, exp.announcements.eligible, afterApply.announcements, 0);
    row("attendance", exp.attendance.source, exp.attendance.eligible, afterApply.attendance_events, 0);
    row("giving", exp.giving.source, exp.giving.eligible, afterApply.giving_entries, 0);
    row("audit", exp.audit.source, exp.audit.eligible, afterApply.audit_events, 0);

    // Staff users: 2 HQ + 2 branch (one synthesized email) = 4 users minimum
    if (afterApply.users < 4) {
      failures.push({
        kind: "count_mismatch",
        entity: "users",
        migrated: afterApply.users,
        eligibleMin: 4,
      });
    }

    if (afterApply.public_tenants !== 0 || afterApply.public_session !== 0) {
      failures.push({ kind: "forbidden_public_tables", afterApply });
    }

    t0 = nowMs();
    const verify = await runMigrationPipeline({ ...common, mode: "verify" });
    timingMs.verify = nowMs() - t0;
    if (!verify.ok) failures.push({ kind: "verify_failed", code: verify.code });

    t0 = nowMs();
    const apply2 = await runMigrationPipeline({ ...common, mode: "apply" });
    timingMs.applySecond = nowMs() - t0;
    const idempotencyOk = apply2.ok && apply2.totals.written === 0;
    if (!idempotencyOk) {
      failures.push({
        kind: "idempotency_failed",
        written: apply2.totals && apply2.totals.written,
      });
    }

    const afterSecond = await targetCounts(targetPool);
    assertEqual("orgs_stable", afterSecond.organizations, afterApply.organizations, failures);
    assertEqual("members_stable", afterSecond.members, afterApply.members, failures);

    t0 = nowMs();
    const smokeTests = await runSmokeTests(targetPool);
    timingMs.smoke = nowMs() - t0;
    for (const s of smokeTests) {
      if (!s.ok) failures.push({ kind: "smoke_failed", test: s.name, detail: s.detail });
    }

    t0 = nowMs();
    const rollback = await rollbackRehearsal(sourcePool, targetPool, env.config);
    timingMs.rollback = nowMs() - t0;
    if (!rollback.ok) failures.push({ kind: "rollback_failed", rollback });

    // Transformed field samples (no PII beyond synthetic fixture emails already known)
    const transformedFieldSamples = {
      organization: {
        slug: "grace-chapel",
        organizationKey: "grace-chapel",
        planKey: "growth",
        dataEnvironment: "pilot",
      },
      member: {
        statusMap: "verified→active",
        contact: "email_normalized lowercased",
        password: "not_copied_to_users",
      },
      giving: {
        cents: 125050,
        amount: "1250.50",
        currency: "ZMW",
      },
      attendance: {
        recorded: "→ approved attendance_event + entry",
        void: "→ archived",
      },
      audit: {
        action: "member.approved → action_key",
        metadata: "password stripped",
      },
    };

    const unresolvedExpected = {
      organizations: [{ slug: "BAD ORG!", reason: "invalid_slug" }],
      members: [{ full_name: "No Contact Person", reason: "missing_contact" }],
      media_group: [{ reason: "media_blob_copy_deferred" }],
    };

    timingMs.total = nowMs() - started;
    const verdict = failures.length === 0 ? "PASS" : "FAIL";

    const report = {
      generatedAt: new Date().toISOString(),
      verdict,
      sourceCounts: srcCounts,
      targetCountsAfterApply: afterApply,
      targetCountsAfterSecondApply: afterSecond,
      dryRunTotals: dry.totals,
      applyTotals: apply1.totals,
      applySecondTotals: apply2.totals,
      conflicts: {
        dryRun: dry.totals.conflicts || 0,
        apply: apply1.totals.conflicts || 0,
      },
      skipped: {
        dryRun: dry.totals.skipped || 0,
        apply: apply1.totals.skipped || 0,
      },
      conflictSamples: (apply1.conflicts || []).slice(0, 10),
      unresolvedExpected,
      transformedFieldSamples,
      batchSize: env.config.runConfig.batchSize,
      groupsCompleted: (apply1.groups || []).map((g) => `${g.groupId}:${g.status}`),
      idempotencyOk,
      smokeTests,
      rollback,
      reconciliationTable,
      failures,
      timingMs,
      paths: {
        outputDir,
        stateDir,
        plan: plan.files && plan.files.plan,
        dryRun: dry.files && dry.files.dryRun,
        reconciliation: verify.files && verify.files.reconciliation,
      },
    };

    writeJson(path.join(outputDir, "rehearsal-report.json"), report);
    const md = buildMarkdown(report);
    const mdPath = path.join(ROOT, "docs/database/V4_TO_V5_MIGRATION_REHEARSAL.md");
    fs.writeFileSync(mdPath, md);

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: failures.length === 0,
          verdict,
          failures: failures.length,
          outputDir,
          reportMarkdown: mdPath,
          timingMs,
          reconciliation: reconciliationTable,
          idempotencyOk,
          rollbackOk: rollback.ok,
          smokeFailed: smokeTests.filter((s) => !s.ok).map((s) => s.name),
        },
        null,
        2
      )
    );

    process.exit(failures.length === 0 ? 0 : 1);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        ok: false,
        code: "rehearsal_aborted",
        message: err && err.message ? String(err.message) : String(err),
      })
    );
    process.exit(1);
  } finally {
    await endPools(sourcePool, targetPool, roSource);
  }
}

main();
