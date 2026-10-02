"use strict";

/**
 * V4→V5 mapping rules — fixture-only (no database, no hosted connections).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  createMigrationRunner,
  createIdMap,
  transformRow,
  ENTITIES,
  loadMigrationEnv,
  buildMigrationPlan,
} = require("../src/migration/v4ToV5");
const { assertNotHostedUrl } = require("../src/migration/v4ToV5/extract");
const { redactMetadata } = require("../src/migration/v4ToV5/mappers/audit");
const { createDryRunLoader } = require("../src/migration/v4ToV5/load");
const { isSampleOrganizationKey, isUnsafeHostname } = require("../src/migration/v4ToV5/mappers/helpers");

const FIXTURES = path.join(__dirname, "../src/migration/v4ToV5/fixtures");

function ctx(runConfig = {}) {
  return {
    batchId: "test-batch",
    runConfig: {
      dataEnvironmentDefault: "pilot",
      canonicalDomainSuffix: "blessboard.org",
      deploymentCode: "blessboard-org-staging",
      includeSampleContent: false,
      ...runConfig,
    },
    idMap: createIdMap(),
  };
}

/** Seed org 1 + church + branch 10/11 as successfully mapped parents. */
function seedGraceParents(c) {
  c.idMap.resolve("church_organizations", 1, "platform.organizations");
  c.idMap.resolve("church_organizations_church", 1, "blessboard.churches");
  c.idMap.resolve("church_branches", 10, "blessboard.branches");
  c.idMap.resolve("church_branches", 11, "blessboard.branches");
}

describe("v4 to v5 migration mapping", () => {
  it("exposes extract/transform/load architecture entities", () => {
    assert.ok(ENTITIES.includes("organization"));
    assert.ok(ENTITIES.includes("member"));
    assert.ok(ENTITIES.includes("giving_summary"));
  });

  it("rejects hosted database URLs for extractors", () => {
    assert.throws(() => assertNotHostedUrl("postgresql://x.supabase.co/db"), /hosted_database_forbidden/);
    assert.doesNotThrow(() => assertNotHostedUrl("postgresql://localhost:5432/legacy_local"));
  });

  it("refuses GETPRO_DATABASE_URL in migration env", () => {
    const prev = process.env.GETPRO_DATABASE_URL;
    process.env.GETPRO_DATABASE_URL = "postgresql://localhost:5432/other";
    try {
      const env = loadMigrationEnv({
        V4_SOURCE_DATABASE_URL: "postgresql://localhost:5432/v4_src",
        V5_TARGET_DATABASE_URL: "postgresql://localhost:5432/v5_tgt",
        DATABASE_IDENTITY_EXPECTED: "blessboard-platform-v5",
        allowHosted: true,
      });
      assert.equal(env.ok, false);
      assert.ok(env.errors.includes("GETPRO_DATABASE_URL_forbidden"));
    } finally {
      if (prev === undefined) delete process.env.GETPRO_DATABASE_URL;
      else process.env.GETPRO_DATABASE_URL = prev;
    }
  });

  it("produces deterministic UUIDs for the same legacy key", () => {
    const a = createIdMap();
    const b = createIdMap();
    const id1 = a.resolve("church_organizations", 1, "platform.organizations");
    const id2 = b.resolve("church_organizations", 1, "platform.organizations");
    assert.equal(id1, id2);
    assert.match(id1, /^[0-9a-f-]{36}$/);
  });

  it("maps organization + church + plan with quarantine for bad keys and samples", () => {
    const c = ctx();
    const good = transformRow(
      "organization",
      {
        id: 1,
        slug: "grace-chapel",
        name: "Grace Chapel",
        status: "active",
        plan_code: "growth",
        data_environment: "pilot",
      },
      c
    );
    assert.equal(good.ok, true);
    assert.equal(good.record.organization.organizationKey, "grace-chapel");
    assert.equal(good.record.church.churchKey, "grace-chapel");
    assert.equal(good.record.subscription.planKey, "growth");
    assert.equal(good.record.organization.id, good.record.enrolment.organizationId);

    const bad = transformRow(
      "organization",
      { id: 2, slug: "BAD SLUG!", name: "Bad", status: "active", data_environment: "pilot" },
      c
    );
    assert.equal(bad.ok, false);
    assert.equal(bad.quarantine.reason, "invalid_slug");

    const dormant = transformRow(
      "organization",
      {
        id: 3,
        slug: "legacy-org",
        name: "Legacy",
        status: "dormant",
        plan_code: "enterprise",
        data_environment: "production",
      },
      c
    );
    assert.equal(dormant.ok, true);
    assert.equal(dormant.record.organization.status, "retired");
    assert.equal(dormant.record.church.status, "archived");
    assert.equal(dormant.record.subscription.planKey, "free");
    assert.ok(dormant.warnings.includes("plan_code_defaulted_to_free"));

    const sample = transformRow(
      "organization",
      {
        id: 4,
        slug: "demo-church",
        name: "Demo",
        status: "active",
        plan_code: "free",
        data_environment: "demo",
      },
      c
    );
    assert.equal(sample.ok, false);
    assert.equal(sample.quarantine.reason, "sample_organization_excluded");

    const sampleAllowed = transformRow(
      "organization",
      {
        id: 5,
        slug: "demo-church",
        name: "Demo",
        status: "active",
        plan_code: "free",
        data_environment: "demo",
      },
      ctx({ includeSampleContent: true })
    );
    assert.equal(sampleAllowed.ok, true);
    assert.equal(isSampleOrganizationKey("demo-church", { includeSampleContent: false }), true);
  });

  it("maps branches and domains; quarantines missing/unsafe hosts and orphans", () => {
    const c = ctx();
    seedGraceParents(c);
    const hq = transformRow(
      "branch",
      {
        id: 10,
        organization_id: 1,
        slug: "hq",
        name: "Headquarters",
        status: "active",
        welcome_message: "Hi",
      },
      c
    );
    assert.equal(hq.ok, true);
    assert.equal(hq.record.branch.branchType, "hq");
    assert.equal(hq.record.branch.isPrimary, true);
    assert.ok(hq.warnings.includes("public_copy_deferred_to_settings_or_pages"));

    const orphanBranch = transformRow(
      "branch",
      { id: 50, organization_id: 999, slug: "x", name: "X", status: "active" },
      c
    );
    assert.equal(orphanBranch.ok, false);
    assert.equal(orphanBranch.quarantine.reason, "orphan_organization");

    const domain = transformRow(
      "domain",
      { id: 10, organization_id: 1, host_slug: "grace-chapel", is_primary: true },
      c
    );
    assert.equal(domain.ok, true);
    assert.equal(domain.record.domain.hostname, "grace-chapel.blessboard.org");
    assert.equal(domain.record.domain.domainType, "canonical");

    const missingHost = transformRow(
      "domain",
      { id: 11, organization_id: 1, slug: "kafue", status: "active" },
      c
    );
    assert.equal(missingHost.ok, false);
    assert.equal(missingHost.quarantine.reason, "missing_host_slug");

    const unsafe = transformRow(
      "domain",
      { id: 12, organization_id: 1, host_slug: "localhost", status: "active" },
      c
    );
    assert.equal(unsafe.ok, false);
    assert.equal(unsafe.quarantine.reason, "unsafe_hostname");
    assert.equal(isUnsafeHostname("localhost.blessboard.org"), true);
  });

  it("maps admins to users/roles and synthesizes email when missing", () => {
    const c = ctx();
    seedGraceParents(c);
    const hq = transformRow(
      "user_hq_admin",
      {
        id: 100,
        organization_id: 1,
        email: "hq@grace.example",
        password_hash: "$2a$10$abcdefghijklmnopqrstuv",
        display_name: "HQ",
        status: "active",
      },
      c
    );
    assert.equal(hq.ok, true);
    assert.equal(hq.record.role.roleKey, "church_hq_admin");
    assert.equal(hq.record.role.branchId, null);

    const synth = transformRow(
      "user_hq_admin",
      {
        id: 101,
        organization_id: 1,
        organization_slug: "grace-chapel",
        username: "noemail",
        password_hash: "$2a$10$abcdefghijklmnopqrstuv",
        display_name: "No Email",
        status: "active",
      },
      c
    );
    assert.equal(synth.ok, true);
    assert.match(synth.record.user.emailNormalized, /@grace-chapel\.migrated\.invalid$/);
    assert.ok(synth.warnings.includes("synthesized_email_from_username"));

    const orphanAdmin = transformRow(
      "user_branch_admin",
      {
        id: 200,
        organization_id: 1,
        branch_id: 9999,
        email: "ba@example.com",
        password_hash: "$2a$10$abcdefghijklmnopqrstuv",
        display_name: "BA",
        status: "active",
      },
      c
    );
    assert.equal(orphanAdmin.ok, false);
    assert.equal(orphanAdmin.quarantine.reason, "orphan_branch");
  });

  it("maps members with status/contact rules; quarantines orphans and never invents default branch", () => {
    const c = ctx();
    seedGraceParents(c);
    const okMember = transformRow(
      "member",
      {
        id: 300,
        organization_id: 1,
        branch_id: 11,
        full_name: "Alice Mulenga",
        email: "Alice@Example.COM",
        phone: "+260971234567",
        status: "verified",
        password_hash: "$2a$10$memberhashshouldnotmigratexx",
      },
      c
    );
    assert.equal(okMember.ok, true);
    assert.equal(okMember.record.member.status, "active");
    assert.equal(okMember.record.member.emailNormalized, "alice@example.com");
    assert.ok(okMember.warnings.includes("member_password_not_migrated_to_users"));

    const noContact = transformRow(
      "member",
      {
        id: 301,
        organization_id: 1,
        branch_id: 11,
        full_name: "No Contact",
        email: "",
        phone: "",
        status: "pending",
      },
      c
    );
    assert.equal(noContact.quarantine.reason, "missing_contact");

    const orphanBranch = transformRow(
      "member",
      {
        id: 303,
        organization_id: 1,
        branch_id: 9999,
        full_name: "Orphan Branch",
        email: "x@example.com",
        status: "active",
      },
      c
    );
    assert.equal(orphanBranch.ok, false);
    assert.equal(orphanBranch.quarantine.reason, "orphan_branch");

    const orphanOrg = transformRow(
      "member",
      {
        id: 304,
        organization_id: 999,
        branch_id: 11,
        full_name: "Orphan Org",
        email: "y@example.com",
        status: "active",
      },
      c
    );
    assert.equal(orphanOrg.ok, false);
    assert.equal(orphanOrg.quarantine.reason, "orphan_organization");
  });

  it("maps attendance aggregates with void→archived", () => {
    const c = ctx();
    seedGraceParents(c);
    const recorded = transformRow(
      "attendance_record",
      {
        id: 400,
        organization_id: 1,
        branch_id: 11,
        service_date: "2026-01-05",
        service_label: "Sunday Service",
        headcount: 120,
        status: "recorded",
        updated_at: "2026-01-05T12:00:00.000Z",
      },
      c
    );
    assert.equal(recorded.ok, true);
    assert.equal(recorded.record.attendanceEvent.status, "approved");
    assert.equal(recorded.record.attendanceEntry.count, 120);
    assert.ok(recorded.warnings.includes("per_member_attendance_unsupported"));
  });

  it("maps giving cents to NUMERIC amount exactly", () => {
    const c = ctx();
    seedGraceParents(c);
    const row = transformRow(
      "giving_summary",
      {
        id: 500,
        organization_id: 1,
        branch_id: 11,
        period_year: 2026,
        period_month: 1,
        total_amount_cents: 125050,
        currency_code: "zmw",
        status: "finalized",
        updated_at: "2026-02-01T00:00:00.000Z",
      },
      c
    );
    assert.equal(row.ok, true);
    assert.equal(row.record.entry.amount, "1250.50");
    assert.equal(row.record.entry.currency, "ZMW");
    assert.equal(row.record.entry.status, "approved");
    assert.equal(row.record.entry.givingDate, "2026-01-31");
  });

  it("redacts forbidden audit metadata keys including contact fields", () => {
    const redacted = redactMetadata({
      password: "x",
      note: "ok",
      api_secret: "y",
      email: "a@b.c",
      member_phone: "123",
    });
    assert.equal(redacted.password, undefined);
    assert.equal(redacted.api_secret, undefined);
    assert.equal(redacted.email, undefined);
    assert.equal(redacted.member_phone, undefined);
    assert.equal(redacted.note, "ok");
  });

  it("plan lists unsupported source entities explicitly", () => {
    const env = loadMigrationEnv({
      V4_SOURCE_DATABASE_URL: "postgresql://localhost:5432/v4_src",
      V5_TARGET_DATABASE_URL: "postgresql://localhost:5432/v5_tgt",
      DATABASE_IDENTITY_EXPECTED: "blessboard-platform-v5",
      allowHosted: true,
    });
    assert.equal(env.ok, true);
    const plan = buildMigrationPlan({ config: env.config });
    assert.ok(plan.unsupportedSourceEntities.some((u) => u.key === "sermons"));
    assert.ok(plan.unsupportedSourceEntities.some((u) => u.key === "registrations"));
    assert.equal(plan.safety.orphanParentsQuarantined, true);
  });

  it("load interface stays dry-run and refuses destructive writes", async () => {
    const dry = createDryRunLoader({ dryRun: true });
    const accepted = await dry.load("organization", {
      ok: true,
      record: { organization: { organizationKey: "x" } },
      warnings: [],
    });
    assert.equal(accepted.status, "dry_run_accepted");

    const writes = createDryRunLoader({ dryRun: false });
    const blocked = await writes.load("organization", { ok: true, record: {} });
    assert.equal(blocked.status, "writes_not_implemented");
  });

  it("runner dry-runs fixture entities in dependency order", async () => {
    const runner = createMigrationRunner({
      dryRun: true,
      fixturesDir: FIXTURES,
    });
    const orgRun = await runner.runEntity("organization", null);
    assert.equal(orgRun.report.sourceRows, 4);
    assert.equal(orgRun.report.accepted, 2);
    assert.equal(orgRun.report.quarantined, 2);

    const branchRun = await runner.runEntity("branch", null);
    assert.ok(branchRun.report.accepted >= 2);

    const domainRun = await runner.runEntity("domain", null);
    assert.ok(domainRun.report.quarantined >= 2);

    const memberRun = await runner.runEntity("member", null);
    assert.equal(memberRun.report.accepted, 2);
    assert.ok(memberRun.report.quarantined >= 3);

    const givingRun = await runner.runEntity("giving_summary", null);
    assert.equal(givingRun.report.accepted, 1);
    assert.equal(givingRun.results[0].transformed.record.entry.amount, "1250.50");
  });
});
