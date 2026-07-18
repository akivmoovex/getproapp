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
} = require("../src/migration/v4ToV5");
const { assertNotHostedUrl } = require("../src/migration/v4ToV5/extract");
const { redactMetadata } = require("../src/migration/v4ToV5/mappers/audit");
const { createDryRunLoader } = require("../src/migration/v4ToV5/load");

const FIXTURES = path.join(__dirname, "../src/migration/v4ToV5/fixtures");

function ctx() {
  return {
    batchId: "test-batch",
    runConfig: {
      dataEnvironmentDefault: "pilot",
      canonicalDomainSuffix: "blessboard.org",
      deploymentCode: "blessboard-org-v5",
    },
    idMap: createIdMap(),
  };
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

  it("produces deterministic UUIDs for the same legacy key", () => {
    const a = createIdMap();
    const b = createIdMap();
    const id1 = a.resolve("church_organizations", 1, "platform.organizations");
    const id2 = b.resolve("church_organizations", 1, "platform.organizations");
    assert.equal(id1, id2);
    assert.match(id1, /^[0-9a-f-]{36}$/);
  });

  it("maps organization + church + plan with quarantine for bad keys", () => {
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
  });

  it("maps branches and domains from host_slug", () => {
    const c = ctx();
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

    const domain = transformRow(
      "domain",
      { id: 10, organization_id: 1, host_slug: "grace-chapel", is_primary: true },
      c
    );
    assert.equal(domain.ok, true);
    assert.equal(domain.record.domain.hostname, "grace-chapel.blessboard.org");
    assert.equal(domain.record.domain.domainType, "canonical");
  });

  it("maps admins to users/roles and synthesizes email when missing", () => {
    const c = ctx();
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
        status: "active",
      },
      c
    );
    assert.equal(synth.ok, true);
    assert.equal(synth.record.user.emailNormalized, "noemail@grace-chapel.migrated.invalid");
    assert.ok(synth.warnings.includes("synthesized_email_from_username"));

    const branch = transformRow(
      "user_branch_admin",
      {
        id: 200,
        organization_id: 1,
        branch_id: 11,
        email: "branch@grace.example",
        password_hash: "$2a$10$abcdefghijklmnopqrstuv",
        status: "active",
      },
      c
    );
    assert.equal(branch.ok, true);
    assert.equal(branch.record.role.roleKey, "branch_admin");
    assert.ok(branch.record.role.branchId);
  });

  it("maps members with status/contact rules and skips passwords", () => {
    const c = ctx();
    const verified = transformRow(
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
    assert.equal(verified.ok, true);
    assert.equal(verified.record.member.status, "active");
    assert.equal(verified.record.member.emailNormalized, "alice@example.com");
    assert.equal(verified.record.member.userId, null);
    assert.ok(verified.warnings.includes("member_password_not_migrated_to_users"));

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
    assert.equal(noContact.ok, false);
    assert.equal(noContact.quarantine.reason, "missing_contact");

    const rejected = transformRow(
      "member",
      {
        id: 302,
        organization_id: 1,
        branch_id: 11,
        full_name: "Rejected Person",
        email: "rejected@example.com",
        status: "rejected",
      },
      c
    );
    assert.equal(rejected.ok, true);
    assert.equal(rejected.record.member.status, "archived");
  });

  it("maps attendance aggregates and marks per-member attendance unsupported", () => {
    const c = ctx();
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

  it("redacts forbidden audit metadata keys", () => {
    const redacted = redactMetadata({
      password: "x",
      note: "ok",
      api_secret: "y",
    });
    assert.equal(redacted.password, undefined);
    assert.equal(redacted.api_secret, undefined);
    assert.equal(redacted.note, "ok");
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

  it("runner dry-runs fixture entities and builds reconciliation reports", async () => {
    const runner = createMigrationRunner({
      dryRun: true,
      fixturesDir: FIXTURES,
    });
    const orgRun = await runner.runEntity("organization", null);
    assert.equal(orgRun.report.sourceRows, 3);
    assert.equal(orgRun.report.accepted, 2);
    assert.equal(orgRun.report.quarantined, 1);

    const memberRun = await runner.runEntity("member", null);
    assert.equal(memberRun.report.accepted, 2);
    assert.equal(memberRun.report.quarantined, 1);

    const givingRun = await runner.runEntity("giving_summary", null);
    assert.equal(givingRun.report.accepted, 1);
    assert.equal(givingRun.results[0].transformed.record.entry.amount, "1250.50");
  });
});
