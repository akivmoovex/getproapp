#!/usr/bin/env node
"use strict";

/**
 * Local-only rehearsal of demo:v5 dataset tool against an ephemeral foundation DB.
 * Never uses process.env.DATABASE_URL from the operator shell/.env (hosted trap).
 * Does not print connection strings or passwords.
 *
 * Usage (local Postgres required):
 *   node scripts/rehearse-demo-v5-dataset-local.js
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { Client } = require("pg");

const {
  resetFoundationDatabase,
  createFoundationPool,
  cleanupCreatedFoundationDatabases,
} = require("../tests/helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { sanitizeHostFingerprint } = require("../db/scripts/lib/hostFingerprint");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const content = require("../src/blessboard/services/publicContentAdminService");
const catalogueRepo = require("../src/blessboard/repositories/blessBoardCatalogueRepository");
const {
  DEMO_TAG,
  LEADER,
  MINISTRY,
  EVENT,
  SERMON,
  CONTACT_CHANNEL,
  GIVING_METHOD,
  ANNOUNCEMENT,
  RESOURCE,
  FORM,
  ATTENDANCE,
  GIVING_ENTRY,
  SECTION_KEY,
} = require("../src/blessboard/services/demoMinimumDatasetSpec");

const ROOT = path.resolve(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const ORG = "rehearsal-demo";
const CHURCH = "rehearsal-demo";
const HOST = "rehearsal-demo.blessboard.test";
const DEPLOY = "blessboard-org-v5";
const ACTOR_EMAIL = "demo.hq+rehearsal@example.test";
const PA_EMAIL = "demo.pa+rehearsal@example.test";
const BA_EMAIL = "demo.ba+rehearsal@example.test";

function assertNoSecrets(text) {
  const s = String(text || "");
  if (/postgres(ql)?:\/\//i.test(s)) throw new Error("secret_leak:postgres_url");
  if (/password\s*=/i.test(s)) throw new Error("secret_leak:password");
}

function cleanEnv(databaseUrl) {
  return {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || "",
    USER: process.env.USER || "",
    LOGNAME: process.env.LOGNAME || "",
    TMPDIR: process.env.TMPDIR || "",
    LANG: process.env.LANG || "en_US.UTF-8",
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
    // Intentionally omit GETPRO_DATABASE_URL and any hosted URLs from the shell.
  };
}

function runDemoCli(databaseUrl, args) {
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, "db/scripts/demo-v5-dataset.js"), ...args],
    { env: cleanEnv(databaseUrl), encoding: "utf8" }
  );
  assertNoSecrets(result.stdout || "");
  assertNoSecrets(result.stderr || "");
  let report = null;
  try {
    report = JSON.parse(String(result.stdout || "").trim());
  } catch {
    report = null;
  }
  return {
    exitCode: result.status == null ? 1 : result.status,
    report,
    stderr: String(result.stderr || "").slice(0, 500),
  };
}

function summarizeActions(actions) {
  const by = {};
  for (const a of actions || []) {
    const s = a.status || "unknown";
    by[s] = (by[s] || 0) + 1;
  }
  return { total: (actions || []).length, by_status: by };
}

function conflictCount(actions) {
  return (actions || []).filter((a) => a.status === "conflict").length;
}

async function probeLocalPostgres() {
  const adminUrl =
    process.env.FOUNDATION_ADMIN_DATABASE_URL ||
    process.env.DATABASE_URL_ADMIN ||
    "postgresql://localhost:5432/postgres";
  // Refuse if admin URL looks like a remote hosted host.
  try {
    const u = new URL(String(adminUrl).replace(/^postgresql:/i, "postgres:"));
    const host = String(u.hostname || "").toLowerCase();
    if (host && host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
      return {
        ok: false,
        reason: "admin_host_not_local",
        host_fingerprint: sanitizeHostFingerprint(adminUrl),
      };
    }
  } catch {
    return { ok: false, reason: "admin_url_unparseable" };
  }
  const client = new Client({ connectionString: adminUrl });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return { ok: true, host_fingerprint: sanitizeHostFingerprint(adminUrl) };
  } catch (err) {
    return {
      ok: false,
      reason: "local_postgres_unreachable",
      detail: err && err.message ? String(err.message).slice(0, 120) : null,
    };
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

async function verifyCatalogue(pool) {
  const identity = await pool.query(
    `SELECT identity_key, environment_code, database_name FROM platform.database_identity LIMIT 1`
  );
  const deployment = await pool.query(
    `SELECT deployment_code, status FROM platform.deployments WHERE deployment_code = $1`,
    [DEPLOY]
  );
  const org = await catalogueRepo.findOrganizationByKey(pool, ORG);
  const enrolment = org
    ? await pool.query(
        `SELECT op.status, op.product_tenant_key
           FROM platform.organization_products op
           JOIN platform.products p ON p.id = op.product_id
          WHERE op.organization_id = $1 AND p.product_key = 'blessboard'
          LIMIT 1`,
        [org.id]
      )
    : { rows: [] };
  const domain = org
    ? await pool.query(
        `SELECT hostname, deployment_id AS deployment_code, status, is_primary
           FROM platform.domains
          WHERE organization_id = $1 AND hostname = $2
          LIMIT 1`,
        [org.id, HOST]
      )
    : { rows: [] };
  const church = await catalogueRepo.findChurchByKey(pool, CHURCH);
  const hq = church ? await catalogueRepo.findHqBranch(pool, church.id) : null;
  const primary = church
    ? await pool.query(
        `SELECT branch_key, is_primary, branch_type, status FROM blessboard.branches
          WHERE church_id = $1 AND is_primary = true LIMIT 1`,
        [church.id]
      )
    : { rows: [] };
  const sub = org
    ? await pool.query(
        `SELECT p.plan_key, s.status
           FROM platform.organization_subscriptions s
           JOIN platform.plans p ON p.id = s.plan_id
          WHERE s.organization_id = $1 AND s.product_key = 'blessboard'
          ORDER BY s.created_at DESC
          LIMIT 1`,
        [org.id]
      )
    : { rows: [] };
  const legacy = await pool.query(
    `SELECT to_regclass('public.tenants') AS tenants, to_regclass('public.session') AS session`
  );

  return {
    identity_key: identity.rows[0] && identity.rows[0].identity_key,
    environment_code: identity.rows[0] && identity.rows[0].environment_code,
    database_name: identity.rows[0] && identity.rows[0].database_name,
    deployment: deployment.rows[0] || null,
    organization_key: org && org.organization_key,
    organization_status: org && org.status,
    enrolment: enrolment.rows[0] || null,
    domain: domain.rows[0] || null,
    church_key: church && church.church_key,
    hq_branch_key: hq && hq.branch_key,
    hq_branch_type: hq && hq.branch_type,
    primary_branch: primary.rows[0] || null,
    package_entitlement: sub.rows[0] || null,
    legacy_tenants: Boolean(legacy.rows[0] && legacy.rows[0].tenants),
    legacy_session: Boolean(legacy.rows[0] && legacy.rows[0].session),
  };
}

async function verifyUsers(pool) {
  const r = await pool.query(
    `SELECT u.email_normalized, u.status, r.role_key, r.status AS role_status
       FROM blessboard.users u
       LEFT JOIN blessboard.user_roles r ON r.user_id = u.id AND r.status = 'active'
      WHERE u.email_normalized = ANY($1::text[])
      ORDER BY u.email_normalized, r.role_key`,
    [[ACTOR_EMAIL, PA_EMAIL, BA_EMAIL]]
  );
  return r.rows.map((row) => ({
    email: row.email_normalized,
    user_status: row.status,
    role_key: row.role_key,
    role_status: row.role_status,
  }));
}

async function verifyContent(pool) {
  const church = await catalogueRepo.findChurchByKey(pool, CHURCH);
  const churchId = church.id;
  const pages = await pool.query(
    `SELECT page_key, title, status,
            (layout_metadata->>'bb_demo')::boolean AS bb_demo
       FROM blessboard.public_pages
      WHERE church_id = $1
      ORDER BY page_key`,
    [churchId]
  );
  const sections = await pool.query(
    `SELECT p.page_key, s.section_key, s.status
       FROM blessboard.page_sections s
       JOIN blessboard.public_pages p ON p.id = s.page_id
      WHERE p.church_id = $1 AND s.section_key = $2
      ORDER BY p.page_key`,
    [churchId, SECTION_KEY]
  );
  const leaders = await content.listAdminLeaders(pool, { churchId });
  const ministries = await content.listAdminMinistries(pool, { churchId });
  const events = await content.listAdminEvents(pool, { churchId });
  const sermons = await content.listAdminSermons(pool, { churchId });
  const contacts = await content.listAdminContactChannels(pool, { churchId });
  const givingMethods = await content.listAdminGivingMethods(pool, { churchId });

  const ops = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM blessboard.announcements WHERE church_id = $1 AND title = $2) AS announcements,
       (SELECT COUNT(*)::int FROM blessboard.resources WHERE church_id = $1 AND title = $3) AS resources,
       (SELECT COUNT(*)::int FROM blessboard.forms WHERE church_id = $1 AND title = $4) AS forms,
       (SELECT COUNT(*)::int FROM blessboard.attendance_events WHERE church_id = $1 AND title = $5) AS attendance_events,
       (SELECT COUNT(*)::int FROM blessboard.giving_entries WHERE church_id = $1 AND reference = $6) AS giving_entries`,
    [churchId, ANNOUNCEMENT.title, RESOURCE.title, FORM.title, ATTENDANCE.title, GIVING_ENTRY.reference]
  );

  function countExact(items, field, value) {
    return (items || []).filter((it) => String(it[field]) === String(value)).length;
  }

  return {
    pages: pages.rows,
    demo_sections: sections.rows.length,
    leader_count: countExact(leaders.items, "displayName", LEADER.displayName),
    ministry_count: countExact(ministries.items, "name", MINISTRY.name),
    event_count: countExact(events.items, "title", EVENT.title),
    sermon_count: countExact(sermons.items, "title", SERMON.title),
    contact_count: countExact(contacts.items, "label", CONTACT_CHANNEL.label),
    giving_method_count: countExact(givingMethods.items, "label", GIVING_METHOD.label),
    ops: ops.rows[0],
    duplicates: {
      leader: countExact(leaders.items, "displayName", LEADER.displayName) > 1,
      ministry: countExact(ministries.items, "name", MINISTRY.name) > 1,
      event: countExact(events.items, "title", EVENT.title) > 1,
      announcement: Number(ops.rows[0].announcements) > 1,
      giving_entry: Number(ops.rows[0].giving_entries) > 1,
    },
  };
}

async function softCleanupDemoContent(pool) {
  const church = await catalogueRepo.findChurchByKey(pool, CHURCH);
  const churchId = church.id;
  const updated = {};

  const pageUp = await pool.query(
    `UPDATE blessboard.public_pages
        SET status = 'archived', updated_at = now()
      WHERE church_id = $1
        AND (
          title LIKE '%[Demo]%'
          OR COALESCE((layout_metadata->>'bb_demo')::boolean, false) = true
        )
      RETURNING page_key`,
    [churchId]
  );
  updated.pages_archived = pageUp.rowCount;

  const sectionUp = await pool.query(
    `UPDATE blessboard.page_sections s
        SET status = 'archived', updated_at = now()
       FROM blessboard.public_pages p
      WHERE s.page_id = p.id AND p.church_id = $1 AND s.section_key = $2
      RETURNING s.id`,
    [churchId, SECTION_KEY]
  );
  updated.sections_archived = sectionUp.rowCount;

  for (const [table, col, val] of [
    ["leaders", "display_name", LEADER.displayName],
    ["ministries", "name", MINISTRY.name],
    ["events", "title", EVENT.title],
    ["sermons", "title", SERMON.title],
    ["contact_channels", "label", CONTACT_CHANNEL.label],
    ["giving_methods", "label", GIVING_METHOD.label],
  ]) {
    const r = await pool.query(
      `UPDATE blessboard.${table}
          SET status = 'archived', updated_at = now()
        WHERE church_id = $1 AND ${col} = $2 AND status <> 'archived'
        RETURNING id`,
      [churchId, val]
    );
    updated[`${table}_archived`] = r.rowCount;
  }

  const ann = await pool.query(
    `UPDATE blessboard.announcements
        SET status = 'archived', updated_at = now()
      WHERE church_id = $1 AND title = $2 AND status <> 'archived'
      RETURNING id`,
    [churchId, ANNOUNCEMENT.title]
  );
  updated.announcements_archived = ann.rowCount;

  const res = await pool.query(
    `UPDATE blessboard.resources
        SET status = 'archived', updated_at = now()
      WHERE church_id = $1 AND title = $2 AND status <> 'archived'
      RETURNING id`,
    [churchId, RESOURCE.title]
  );
  updated.resources_archived = res.rowCount;

  const forms = await pool.query(
    `UPDATE blessboard.forms
        SET status = 'archived', updated_at = now()
      WHERE church_id = $1 AND title = $2 AND status <> 'archived'
      RETURNING id`,
    [churchId, FORM.title]
  );
  updated.forms_archived = forms.rowCount;

  // Attendance/giving: leave labeled demo rows (no hard delete); mark notes for identification.
  updated.attendance_events_left = (
    await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.attendance_events WHERE church_id = $1 AND title = $2`,
      [churchId, ATTENDANCE.title]
    )
  ).rows[0].n;
  updated.giving_entries_left = (
    await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.giving_entries WHERE church_id = $1 AND reference = $2`,
      [churchId, GIVING_ENTRY.reference]
    )
  ).rows[0].n;

  updated.marker = DEMO_TAG;
  updated.method = "soft_archive_demo_marked_rows";
  return updated;
}

async function provisionPersonas(pool) {
  const disposablePassword = `Rehearse-${crypto.randomBytes(18).toString("base64url")}-9`;
  const users = [
    { email: ACTOR_EMAIL, displayName: "Demo HQ (Rehearsal)", role: "church_hq_admin", churchKey: CHURCH },
    { email: PA_EMAIL, displayName: "Demo PA (Rehearsal)", role: "platform_admin" },
    {
      email: BA_EMAIL,
      displayName: "Demo BA (Rehearsal)",
      role: "branch_admin",
      churchKey: CHURCH,
      branchKey: "hq",
    },
  ];
  const results = [];
  for (const u of users) {
    const created = await createBlessBoardUser(pool, {
      email: u.email,
      displayName: u.displayName,
      password: disposablePassword,
    });
    if (!created.ok && created.status !== "already_exists") {
      results.push({ email: u.email, ok: false, step: "create", status: created.status || created.message });
      continue;
    }
    const assigned = await assignBlessBoardRole(pool, {
      email: u.email,
      organizationKey: ORG,
      roleKey: u.role,
      churchKey: u.churchKey || null,
      branchKey: u.branchKey || null,
    });
    results.push({
      email: u.email,
      ok: Boolean(assigned.ok || String(assigned.status || "").includes("already")),
      role: u.role,
      create_status: created.status,
      assign_status: assigned.status,
    });
  }
  // Password never returned or logged.
  return results;
}

function mdEscape(v) {
  return String(v == null ? "" : v).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function buildMarkdown(evidence) {
  const rows = evidence.stages
    .map(
      (s) =>
        `| ${mdEscape(s.stage)} | ${mdEscape(s.command)} | ${mdEscape(s.result)} | ${mdEscape(s.records)} | ${mdEscape(s.conflicts)} | ${mdEscape(s.evidence)} |`
    )
    .join("\n");

  return `# BlessBoard V5 — Demo dataset local rehearsal

**Date:** ${evidence.date}  
**Mode:** Local disposable foundation only — **not** hosted production / hosted V5  
**Companions:** [\`V5_DEMO_DATASET_TOOL.md\`](./V5_DEMO_DATASET_TOOL.md) · [\`V5_DEMO_MINIMUM_DATASET.md\`](./V5_DEMO_MINIMUM_DATASET.md)

**Environment type:** ${evidence.environment_type}  
**Identity key:** \`${evidence.identity_key}\`  
**Deployment:** \`${evidence.deployment}\`  
**Org / church / host keys:** \`${ORG}\` / \`${CHURCH}\` / \`${HOST}\`  
**Admin host fingerprint:** \`${evidence.admin_host_fingerprint || "n/a"}\`  
**Ephemeral DB name pattern:** \`blessboard_ft_*\` (exact name omitted from docs; DB dropped after rehearsal)

No credentials, passwords, or database URLs are recorded in this file.

---

## Stage table

| Stage | Command | Result | Records | Conflicts | Evidence |
|-------|---------|--------|---------|-----------|----------|
${rows}

---

## Verification checklist

| Check | Result | Evidence |
|-------|--------|----------|
| Database identity | ${evidence.verify.identity_ok ? "PASS" : "FAIL"} | \`${evidence.catalogue.identity_key}\` / \`${evidence.catalogue.environment_code}\` |
| Deployment | ${evidence.verify.deployment_ok ? "PASS" : "FAIL"} | \`${JSON.stringify(evidence.catalogue.deployment)}\` |
| Organization | ${evidence.verify.org_ok ? "PASS" : "FAIL"} | \`${evidence.catalogue.organization_key}\` status=\`${evidence.catalogue.organization_status}\` |
| Enrolment | ${evidence.verify.enrolment_ok ? "PASS" : "FAIL"} | \`${JSON.stringify(evidence.catalogue.enrolment)}\` |
| Domain | ${evidence.verify.domain_ok ? "PASS" : "FAIL"} | hostname=\`${HOST}\` deployment=\`${evidence.catalogue.domain && evidence.catalogue.domain.deployment_code}\` |
| Church | ${evidence.verify.church_ok ? "PASS" : "FAIL"} | \`${evidence.catalogue.church_key}\` |
| HQ branch | ${evidence.verify.hq_ok ? "PASS" : "FAIL"} | key=\`${evidence.catalogue.hq_branch_key}\` type=\`${evidence.catalogue.hq_branch_type}\` |
| Primary branch | ${evidence.verify.primary_ok ? "PASS" : "FAIL"} | \`${JSON.stringify(evidence.catalogue.primary_branch)}\` |
| Users and roles | ${evidence.verify.users_ok ? "PASS" : "FAIL"} | ${evidence.users.length} role rows for PA/HQ/BA personas |
| Public content | ${evidence.verify.content_ok ? "PASS" : "FAIL"} | pages=${evidence.content.pages.filter((p) => p.bb_demo).length} demo; leader/ministry/event present |
| Operational content | ${evidence.verify.ops_ok ? "PASS" : "FAIL"} | \`${JSON.stringify(evidence.content.ops)}\` |
| Package entitlement | ${evidence.verify.entitlement_ok ? "PASS" : "FAIL"} | \`${JSON.stringify(evidence.catalogue.package_entitlement)}\` |
| No duplicate records | ${evidence.verify.no_duplicates ? "PASS" : "FAIL"} | \`${JSON.stringify(evidence.content.duplicates)}\` |
| No legacy table use | ${evidence.verify.no_legacy ? "PASS" : "FAIL"} | tenants=${evidence.catalogue.legacy_tenants} session=${evidence.catalogue.legacy_session} |

---

## Idempotency

- **First apply:** ${evidence.first_apply_summary}
- **Second apply:** ${evidence.second_apply_summary}
- **Verdict:** ${evidence.idempotency_verdict}

---

## Cleanup / rollback rehearsal

- **Supported method:** soft-archive demo-marked CMS/ops rows (titles containing \`[Demo]\`, \`layout_metadata.bb_demo\`, \`section_key=demo_body\`, giving reference \`bb-demo-v5:*\`).
- **Hard delete:** not used (no DELETE SQL teardown CLI).
- **Result:** ${evidence.cleanup_summary}
- **Ephemeral DB:** ${evidence.db_dropped ? "dropped after rehearsal" : "not dropped"}

---

## Defects found

${evidence.defects.length ? evidence.defects.map((d) => `- ${d}`).join("\n") : "- None observed during this local rehearsal."}

---

## Readiness for supervised hosted use

${evidence.hosted_readiness}

---

## Notes

- Operator \`.env\` may point at hosted Supabase; this rehearsal **did not** use that URL.
- Personas used disposable \`@example.test\` emails; passwords were generated in-memory and never written to disk.
- Ops content requires \`--actor-email\` of an existing staff user (created via approved \`createBlessBoardUser\` / role assign services during rehearsal).
`;
}

async function main() {
  const evidence = {
    date: "2026-07-19",
    environment_type: "local_ephemeral_foundation",
    identity_key: IDENTITY_KEY,
    deployment: DEPLOY,
    admin_host_fingerprint: null,
    stages: [],
    catalogue: {},
    content: { pages: [], ops: {}, duplicates: {} },
    users: [],
    verify: {},
    first_apply_summary: "n/a",
    second_apply_summary: "n/a",
    idempotency_verdict: "n/a",
    cleanup_summary: "n/a",
    db_dropped: false,
    defects: [],
    hosted_readiness: "BLOCKED pending rehearsal completion",
  };

  const probe = await probeLocalPostgres();
  evidence.admin_host_fingerprint = probe.host_fingerprint || null;
  if (!probe.ok) {
    evidence.environment_type = "unavailable";
    evidence.stages.push({
      stage: "0. Environment probe",
      command: "local Postgres admin connect (localhost only)",
      result: "BLOCKED BY TEST ENVIRONMENT",
      records: "0",
      conflicts: "n/a",
      evidence: probe.reason + (probe.detail ? ` (${probe.detail})` : ""),
    });
    evidence.hosted_readiness =
      "BLOCKED BY TEST ENVIRONMENT — no disposable local Postgres; do not rehearse against hosted.";
    evidence.defects.push(`Local Postgres unavailable: ${probe.reason}`);
    const outBlocked = path.join(ROOT, "docs/testing/V5_DEMO_DATASET_LOCAL_REHEARSAL.md");
    fs.writeFileSync(outBlocked, buildMarkdown(evidence), "utf8");
    assertNoSecrets(fs.readFileSync(outBlocked, "utf8"));
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: false,
          blocked: true,
          reason: probe.reason,
          doc: "docs/testing/V5_DEMO_DATASET_LOCAL_REHEARSAL.md",
        },
        null,
        2
      )
    );
    process.exit(2);
  }

  let databaseUrl = null;
  let pool = null;

  try {
    databaseUrl = await resetFoundationDatabase();
    const dbName =
      (databaseUrl && databaseUrl.split("/").pop()) || "blessboard_ft_unknown";
    // Store only safe name pattern evidence (blessboard_ft_*), never full URL.
    if (!/^blessboard_ft_/.test(dbName) && dbName !== "blessboard_foundation_test") {
      throw new Error("unexpected_non_ephemeral_db_name");
    }

    pool = createFoundationPool(databaseUrl);
    await migrate({ connectionString: databaseUrl });
    await ensureDatabaseIdentity(pool, {
      connectionString: databaseUrl,
      identityKey: IDENTITY_KEY,
      environmentCode: "testing",
    });

    evidence.stages.push({
      stage: "0. Bootstrap ephemeral foundation",
      command: "resetFoundationDatabase + migrate + ensureDatabaseIdentity",
      result: "PASS",
      records: "foundation schemas + seeds + identity",
      conflicts: "none",
      evidence: `db_name_prefix=blessboard_ft_; identity=${IDENTITY_KEY}`,
    });

    // 1. Plan
    const planArgs = [
      "--organization-key",
      ORG,
      "--church-key",
      CHURCH,
      "--deployment",
      DEPLOY,
      "--hostname",
      HOST,
      "--display-name",
      "Rehearsal Demo Congregation [Demo]",
      "--environment",
      "testing",
      "--hq-branch-key",
      "hq",
      "--hq-branch-name",
      "Headquarters",
    ];
    const plan = runDemoCli(databaseUrl, planArgs);
    evidence.stages.push({
      stage: "1. Plan",
      command: "npm run demo:v5:plan -- (dry-run default)",
      result: plan.exitCode === 0 && plan.report && plan.report.ok ? "PASS" : "FAIL",
      records: plan.report ? JSON.stringify(summarizeActions(plan.report.actions)) : "n/a",
      conflicts: String(conflictCount(plan.report && plan.report.actions)),
      evidence: `mode=${plan.report && plan.report.mode}; status=${plan.report && plan.report.status}`,
    });
    if (!(plan.exitCode === 0 && plan.report && plan.report.ok)) {
      evidence.defects.push("Plan stage failed");
    }

    // 2. Explicit dry-run
    const dry = runDemoCli(databaseUrl, ["--dry-run", ...planArgs]);
    evidence.stages.push({
      stage: "2. Dry run",
      command: "demo:v5 with --dry-run",
      result: dry.exitCode === 0 && dry.report && dry.report.ok && dry.report.mode === "dry_run" ? "PASS" : "FAIL",
      records: dry.report ? JSON.stringify(summarizeActions(dry.report.actions)) : "n/a",
      conflicts: String(conflictCount(dry.report && dry.report.actions)),
      evidence: `requires_confirm=${dry.report && dry.report.requires_confirm}`,
    });

    // Personas require org/church (created on first apply). Order:
    // plan → dry-run → first apply (CMS) → personas → ops apply → second apply → cleanup

    // 3. First apply (catalogue + CMS; ops skipped without actor)
    const first = runDemoCli(databaseUrl, ["--confirm", ...planArgs]);
    const firstSummary = summarizeActions(first.report && first.report.actions);
    evidence.first_apply_summary = `ok=${first.report && first.report.ok}; ${JSON.stringify(firstSummary)}`;
    evidence.stages.push({
      stage: "3. Apply with confirmation (CMS)",
      command: "npm run demo:v5:apply -- --confirm …",
      result: first.exitCode === 0 && first.report && first.report.ok ? "PASS" : "FAIL",
      records: JSON.stringify(firstSummary),
      conflicts: String(conflictCount(first.report && first.report.actions)),
      evidence: `status=${first.report && first.report.status}; cleanup_index=${
        first.report && first.report.cleanup_index && first.report.cleanup_index.length
      }`,
    });
    if (!(first.exitCode === 0 && first.report && first.report.ok)) {
      evidence.defects.push(`First apply failed: ${first.report && first.report.message}`);
    }

    // 3b. Personas via approved credential process (after catalogue exists)
    const personas = await provisionPersonas(pool);
    evidence.stages.push({
      stage: "3b. Persona provision (approved user/role services)",
      command: "createBlessBoardUser + assignBlessBoardRole (in-process; password not logged)",
      result: personas.every((p) => p.ok) ? "PASS" : "FAIL",
      records: personas.map((p) => `${p.email}:${p.role}:${p.assign_status}`).join("; "),
      conflicts: "none",
      evidence: `persona_count=${personas.length}`,
    });
    if (!personas.every((p) => p.ok)) {
      evidence.defects.push("Persona provision incomplete");
    }

    // 3c. Ops apply with actor
    const opsApply = runDemoCli(databaseUrl, [
      "--confirm",
      ...planArgs,
      "--actor-email",
      ACTOR_EMAIL,
    ]);
    evidence.stages.push({
      stage: "3c. Apply ops with --actor-email",
      command: "demo:v5:apply -- --confirm … --actor-email …",
      result: opsApply.exitCode === 0 && opsApply.report && opsApply.report.ok ? "PASS" : "FAIL",
      records: JSON.stringify(summarizeActions(opsApply.report && opsApply.report.actions)),
      conflicts: String(conflictCount(opsApply.report && opsApply.report.actions)),
      evidence: `status=${opsApply.report && opsApply.report.status}`,
    });
    if (!(opsApply.exitCode === 0 && opsApply.report && opsApply.report.ok)) {
      evidence.defects.push(`Ops apply failed: ${opsApply.report && opsApply.report.message}`);
    }

    // 4. Verification
    evidence.catalogue = await verifyCatalogue(pool);
    evidence.users = await verifyUsers(pool);
    evidence.content = await verifyContent(pool);

    evidence.verify = {
      identity_ok: evidence.catalogue.identity_key === IDENTITY_KEY,
      deployment_ok:
        evidence.catalogue.deployment &&
        evidence.catalogue.deployment.deployment_code === DEPLOY &&
        evidence.catalogue.deployment.status === "active",
      org_ok: evidence.catalogue.organization_key === ORG,
      enrolment_ok:
        evidence.catalogue.enrolment && evidence.catalogue.enrolment.status === "active",
      domain_ok:
        evidence.catalogue.domain &&
        evidence.catalogue.domain.status === "active" &&
        evidence.catalogue.domain.deployment_code === DEPLOY,
      church_ok: evidence.catalogue.church_key === CHURCH,
      hq_ok: evidence.catalogue.hq_branch_key === "hq" && evidence.catalogue.hq_branch_type === "hq",
      primary_ok:
        evidence.catalogue.primary_branch &&
        evidence.catalogue.primary_branch.branch_key === "hq" &&
        evidence.catalogue.primary_branch.is_primary === true,
      users_ok: evidence.users.filter((u) => u.role_key).length >= 3,
      content_ok:
        evidence.content.pages.filter((p) => p.bb_demo && p.status === "published").length >= 8 &&
        evidence.content.leader_count === 1 &&
        evidence.content.ministry_count === 1 &&
        evidence.content.event_count === 1 &&
        evidence.content.sermon_count === 1 &&
        evidence.content.contact_count === 1 &&
        evidence.content.giving_method_count === 1,
      ops_ok:
        evidence.content.ops.announcements === 1 &&
        evidence.content.ops.resources === 1 &&
        evidence.content.ops.forms === 1 &&
        evidence.content.ops.attendance_events === 1 &&
        evidence.content.ops.giving_entries === 1,
      entitlement_ok:
        evidence.catalogue.package_entitlement &&
        evidence.catalogue.package_entitlement.plan_key === "free" &&
        evidence.catalogue.package_entitlement.status === "active",
      no_duplicates: !Object.values(evidence.content.duplicates).some(Boolean),
      no_legacy: !evidence.catalogue.legacy_tenants && !evidence.catalogue.legacy_session,
    };

    const verifyPass = Object.values(evidence.verify).every(Boolean);
    evidence.stages.push({
      stage: "4. Verification",
      command: "SQL + service list checks (identity/domain/content/ops/entitlement/legacy)",
      result: verifyPass ? "PASS" : "FAIL",
      records: `demo_pages=${evidence.content.pages.filter((p) => p.bb_demo).length}; ops=${JSON.stringify(evidence.content.ops)}`,
      conflicts: "n/a",
      evidence: JSON.stringify(evidence.verify),
    });
    if (!verifyPass) {
      const failed = Object.entries(evidence.verify)
        .filter(([, v]) => !v)
        .map(([k]) => k);
      evidence.defects.push(`Verification failed: ${failed.join(", ")}`);
    }

    // 5. Second apply
    const second = runDemoCli(databaseUrl, [
      "--confirm",
      ...planArgs,
      "--actor-email",
      ACTOR_EMAIL,
    ]);
    const secondSummary = summarizeActions(second.report && second.report.actions);
    evidence.second_apply_summary = `ok=${second.report && second.report.ok}; ${JSON.stringify(secondSummary)}`;
    const already = (second.report && second.report.actions) || [];
    const entityDupRisk = ["leader", "ministry", "event", "announcement", "giving_entry"].every((rec) =>
      already.some((a) => a.record === rec && a.status === "already_present")
    );
    evidence.idempotency_verdict = entityDupRisk
      ? "PASS — second apply reported already_present for core demo entities; no duplicates"
      : "REVIEW — second apply did not mark all core entities already_present";
    if (!entityDupRisk) evidence.defects.push("Idempotency: expected already_present on second apply");

    const contentAfter = await verifyContent(pool);
    if (Object.values(contentAfter.duplicates).some(Boolean)) {
      evidence.defects.push("Duplicates detected after second apply");
      evidence.idempotency_verdict = "FAIL — duplicates present after second apply";
    }

    evidence.stages.push({
      stage: "5. Second apply",
      command: "npm run demo:v5:apply -- --confirm (repeat)",
      result: second.exitCode === 0 && second.report && second.report.ok && entityDupRisk ? "PASS" : "FAIL",
      records: JSON.stringify(secondSummary),
      conflicts: String(conflictCount(second.report && second.report.actions)),
      evidence: evidence.idempotency_verdict,
    });

    // 6. Cleanup rehearsal
    const cleanup = await softCleanupDemoContent(pool);
    evidence.cleanup_summary = JSON.stringify(cleanup);
    evidence.stages.push({
      stage: "6. Cleanup / rollback rehearsal",
      command: "soft-archive demo-marked pages/sections/entities (no hard DELETE)",
      result: cleanup.pages_archived > 0 ? "PASS" : "FAIL",
      records: JSON.stringify(cleanup),
      conflicts: "none",
      evidence: "attendance/giving left labeled; ephemeral DB will be dropped",
    });
    if (!(cleanup.pages_archived > 0)) {
      evidence.defects.push("Cleanup did not archive demo pages");
    }

    evidence.hosted_readiness = evidence.defects.length
      ? `NOT READY for supervised hosted use until defects are resolved (${evidence.defects.length} defect(s)). Local tool path is exercised; hosted still requires explicit CONFIRM HOSTED WRITE + identity/deployment gates.`
      : "CONDITIONALLY READY for **supervised** hosted use: local plan/dry-run/apply/idempotency/cleanup succeeded. Hosted still requires operator confirmation phrase, correct hosted identity, unset GETPRO_DATABASE_URL, and a disposable/approved org key — do not point at production congregations.";
  } catch (err) {
    evidence.defects.push(`Rehearsal exception: ${err && err.message ? err.message.slice(0, 200) : String(err)}`);
    evidence.hosted_readiness = "BLOCKED — rehearsal threw before completion";
    evidence.stages.push({
      stage: "error",
      command: "n/a",
      result: "FAIL",
      records: "n/a",
      conflicts: "n/a",
      evidence: err && err.message ? String(err.message).slice(0, 200) : "error",
    });
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch {
        /* ignore */
      }
    }
    try {
      if (typeof cleanupCreatedFoundationDatabases === "function") {
        await cleanupCreatedFoundationDatabases();
        evidence.db_dropped = true;
      }
    } catch {
      evidence.db_dropped = false;
    }
  }

  const outPath = path.join(ROOT, "docs/testing/V5_DEMO_DATASET_LOCAL_REHEARSAL.md");
  const md = buildMarkdown(evidence);
  assertNoSecrets(md);
  fs.writeFileSync(outPath, md, "utf8");

  const safeOut = {
    ok: evidence.defects.length === 0,
    blocked: false,
    environment_type: evidence.environment_type,
    stages_completed: evidence.stages.map((s) => s.stage),
    first_apply: evidence.first_apply_summary,
    second_apply: evidence.second_apply_summary,
    idempotency: evidence.idempotency_verdict,
    cleanup: evidence.cleanup_summary,
    defects: evidence.defects,
    hosted_readiness: evidence.hosted_readiness,
    doc: "docs/testing/V5_DEMO_DATASET_LOCAL_REHEARSAL.md",
  };
  assertNoSecrets(JSON.stringify(safeOut));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(safeOut, null, 2));
  process.exit(evidence.defects.length ? 1 : 0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      ok: false,
      blocked: true,
      reason: err && err.message ? String(err.message).slice(0, 200) : "fatal",
    })
  );
  process.exit(2);
});
