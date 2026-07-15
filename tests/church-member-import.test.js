"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const {
  parseCsvText,
  stripFormulaInjection,
  rowsToCsv,
  mapHeader,
  normalizeHeader,
} = require("../src/church/memberImportCsv");
const churchMemberImportService = require("../src/services/church/churchMemberImportService");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function csv(headers, rows) {
  return `${headers.join(",")}\n${rows.map((r) => r.join(",")).join("\n")}\n`;
}

test("CSV parse, formula injection, and tenant headers ignored", () => {
  const parsed = parseCsvText('full_name,email,phone\n"Ada, Lovelace",ada@example.com,260971000001\n');
  assert.equal(parsed.headers[0], "full_name");
  assert.equal(parsed.rows[0][0], "Ada, Lovelace");

  assert.equal(stripFormulaInjection("=1+1"), "'=1+1");
  assert.equal(stripFormulaInjection("+cmd"), "'+cmd");
  assert.equal(stripFormulaInjection("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(stripFormulaInjection("safe"), "safe");

  const exported = rowsToCsv(["note"], [{ note: "=HYPERLINK(\"x\")" }]);
  assert.match(exported, /'=HYPERLINK/);
  assert.equal(stripFormulaInjection("=1+2"), "'=1+2");

  assert.equal(mapHeader(normalizeHeader("organization_id")).kind, "forbidden_tenant");
  assert.equal(mapHeader(normalizeHeader("platform_tenant_id")).kind, "forbidden_tenant");
  assert.equal(mapHeader(normalizeHeader("branch_id")).kind, "forbidden_tenant");
  assert.equal(mapHeader(normalizeHeader("full_name")).field, "full_name");
});

test(
  "member import: valid, duplicates, matches, Foundation limit, visitors, malformed, tenant cols, batch idempotency",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("mimp");

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `mi_${suffix}`.slice(0, 40),
      name: `Member Import ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      org.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: `mib_${suffix}`.slice(0, 30),
      host_slug: `mib_${suffix}`.slice(0, 30),
      name: "Import Branch",
      status: "active",
    });

    // Seed existing member for match detection
    await pool.query(
      `INSERT INTO public.church_members (
         organization_id, branch_id, platform_tenant_id,
         email, phone, phone_normalized, full_name, password_hash, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'hash','verified')`,
      [
        org.id,
        branch.id,
        TENANT_ZM,
        `existing_${suffix}@example.com`,
        "260971111111",
        "260971111111",
        `Existing ${suffix}`,
      ]
    );

    // Seed 248 more verified to approach Foundation 250 (249 total with existing)
    await pool.query(
      `INSERT INTO public.church_members (
         organization_id, branch_id, platform_tenant_id,
         full_name, email, phone, phone_normalized, password_hash, status
       )
       SELECT $1, $2, $3,
              'Seat ' || g,
              'seat_' || $4 || '_' || g || '@example.com',
              '26097' || lpad(g::text, 6, '0'),
              '26097' || lpad(g::text, 6, '0'),
              'hash',
              'verified'
       FROM generate_series(1, 248) AS g`,
      [org.id, branch.id, TENANT_ZM, suffix]
    );

    const validCsv = csv(
      ["full_name", "email", "phone", "member_type", "organization_id", "is_admin"],
      [
        [`Visitor One ${suffix}`, `v1_${suffix}@example.com`, "260972000001", "visitor", "99999", ""],
        [`Member One ${suffix}`, `m1_${suffix}@example.com`, "260972000002", "member", "99999", ""],
        [`Member Two ${suffix}`, `m2_${suffix}@example.com`, "260972000003", "member", "88888", "yes"],
        [`Dup Email ${suffix}`, `v1_${suffix}@example.com`, "260972000099", "visitor", "", ""],
        [`Existing Match ${suffix}`, `existing_${suffix}@example.com`, "260979999999", "member", "", ""],
        [`Bad Row`, "not-an-email", "12", "member", "", ""],
      ]
    );

    const batchKey = `batch_${suffix}`;
    const preview1 = await churchMemberImportService.previewMemberImport(pool, {
      organizationId: org.id,
      branchId: branch.id,
      platformTenantId: TENANT_ZM,
      adminId: 1,
      buffer: Buffer.from(validCsv, "utf8"),
      originalFilename: "members.csv",
      batchKey,
    });
    assert.equal(preview1.outcome, "previewed");
    const diagnostic = preview1.diagnostic;
    assert.ok(diagnostic.summary.ignoredTenantColumns.includes("organization_id"));

    const byEmail = (emailPart) =>
      diagnostic.rows.find((r) => String(r.email_normalized || "").includes(emailPart));

    assert.equal(byEmail(`v1_${suffix}`).disposition, "ready");
    assert.equal(byEmail(`v1_${suffix}`).proposed_status, "pending");
    assert.equal(byEmail(`m1_${suffix}`).disposition, "ready");
    assert.equal(byEmail(`m1_${suffix}`).proposed_status, "verified");

    // Only one more seat (249 verified → limit 250). Second member should be over_limit → visitor.
    const m2 = byEmail(`m2_${suffix}`);
    assert.ok(m2.disposition === "over_limit" || m2.proposed_status === "pending");
    assert.ok(diagnostic.impact.recordsRequiringArchiveOrGrowthUpgrade >= 1);
    assert.equal(diagnostic.impact.currentActiveMembers, 249);
    assert.ok(diagnostic.impact.administratorImpact.csvAdministratorFlags >= 1);

    const dup = diagnostic.rows.find((r) => r.disposition === "duplicate_in_file");
    assert.ok(dup);

    const match = diagnostic.rows.find((r) => r.disposition === "existing_match");
    assert.ok(match);
    assert.ok(match.match_member_id);

    const invalid = diagnostic.rows.find((r) => r.disposition === "invalid");
    assert.ok(invalid);

    // Visitors still importable in impact
    assert.ok(diagnostic.impact.visitorsThatMayStillBeImported >= 1);

    // Formula-safe export
    const errCsv = churchMemberImportService.buildErrorExportCsv(diagnostic);
    assert.match(errCsv, /row_number/);
    assert.doesNotMatch(errCsv, /\n=/);

    // Repeated batch key → idempotent existing
    const preview2 = await churchMemberImportService.previewMemberImport(pool, {
      organizationId: org.id,
      branchId: branch.id,
      platformTenantId: TENANT_ZM,
      adminId: 1,
      buffer: Buffer.from(validCsv, "utf8"),
      originalFilename: "members.csv",
      batchKey,
    });
    assert.equal(preview2.outcome, "existing_batch");
    assert.equal(preview2.batch.id, preview1.batch.id);

    // Cross-tenant identifiers in CSV must not change ownership
    assert.equal(Number(preview1.batch.organization_id), org.id);
    assert.equal(Number(preview1.batch.branch_id), branch.id);

    const commit1 = await churchMemberImportService.commitMemberImport(pool, {
      batchId: preview1.batch.id,
      organizationId: org.id,
      branchId: branch.id,
      adminId: 1,
    });
    assert.equal(commit1.outcome, "committed");
    assert.ok(commit1.commitSummary.created >= 2);

    const commit2 = await churchMemberImportService.commitMemberImport(pool, {
      batchId: preview1.batch.id,
      organizationId: org.id,
      branchId: branch.id,
      adminId: 1,
    });
    assert.equal(commit2.outcome, "already_committed");

    const visitor = await pool.query(
      `SELECT status, import_batch_id FROM public.church_members
       WHERE email = $1 AND branch_id = $2 LIMIT 1`,
      [`v1_${suffix}@example.com`, branch.id]
    );
    assert.equal(visitor.rows[0].status, "pending");
    assert.equal(Number(visitor.rows[0].import_batch_id), preview1.batch.id);

    const member = await pool.query(
      `SELECT status FROM public.church_members WHERE email = $1 AND branch_id = $2 LIMIT 1`,
      [`m1_${suffix}@example.com`, branch.id]
    );
    assert.equal(member.rows[0].status, "verified");

    // Member that exceeded seats should still exist as pending visitor
    const forcedVisitor = await pool.query(
      `SELECT status FROM public.church_members WHERE email = $1 AND branch_id = $2 LIMIT 1`,
      [`m2_${suffix}@example.com`, branch.id]
    );
    assert.equal(forcedVisitor.rows[0].status, "pending");

    // Existing match not duplicated
    const existingCount = await pool.query(
      `SELECT COUNT(*)::int AS c FROM public.church_members
       WHERE branch_id = $1 AND lower(trim(email)) = $2`,
      [branch.id, `existing_${suffix}@example.com`]
    );
    assert.equal(existingCount.rows[0].c, 1);

    // Audit history without raw confidential payloads
    const audits = await pool.query(
      `SELECT action, metadata_json FROM public.church_audit_logs
       WHERE organization_id = $1
         AND action LIKE 'member_import%'
       ORDER BY id DESC LIMIT 10`,
      [org.id]
    );
    assert.ok(audits.rows.some((a) => a.action === "member_import_previewed"));
    assert.ok(audits.rows.some((a) => a.action === "member_import_committed"));
    for (const a of audits.rows) {
      const meta = JSON.stringify(a.metadata_json || {});
      assert.doesNotMatch(meta, /260972000001/);
      assert.doesNotMatch(meta, new RegExp(`v1_${suffix}@example.com`));
    }

    // Malformed CSV
    await assert.rejects(
      () =>
        churchMemberImportService.previewMemberImport(pool, {
          organizationId: org.id,
          branchId: branch.id,
          platformTenantId: TENANT_ZM,
          adminId: 1,
          buffer: Buffer.from("foo,bar\n1,2\n", "utf8"),
          originalFilename: "bad.csv",
          batchKey: `bad_${suffix}`,
        }),
      (err) => err && err.code === "MALFORMED_CSV"
    );

    // Reverse batch
    const reversed = await churchMemberImportService.reverseMemberImportBatch(pool, {
      batchId: preview1.batch.id,
      organizationId: org.id,
      branchId: branch.id,
      adminId: 1,
      reason: "Test reverse",
    });
    assert.equal(reversed.outcome, "reversed");
    const afterReverse = await pool.query(
      `SELECT status FROM public.church_members WHERE email = $1 AND branch_id = $2`,
      [`v1_${suffix}@example.com`, branch.id]
    );
    assert.equal(afterReverse.rows[0].status, "suspended");
    // Existing pre-import member untouched
    const existingStill = await pool.query(
      `SELECT status FROM public.church_members WHERE email = $1 AND branch_id = $2`,
      [`existing_${suffix}@example.com`, branch.id]
    );
    assert.equal(existingStill.rows[0].status, "verified");

    assert.ok(crypto.createHash);
  }
);
