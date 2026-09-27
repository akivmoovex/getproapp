#!/usr/bin/env node
"use strict";

/**
 * V10 PL10 — TESTING/QA canonical schema reset (empty → migrate → bootstrap).
 *
 * HARD PREREQUISITES (refuses otherwise):
 *   - docs/qa/V10_PL09_FRESH_DB_BOOTSTRAP.md contains V10_FRESH_DB_BOOTSTRAP_PASS
 *     and QA_RESET_AUTHORIZED: YES
 *   - DEPLOYMENT_ENV=testing
 *   - DATABASE_IDENTITY_EXPECTED=moovex-platform-v7
 *   - DATABASE_IDENTITY_ENV=testing
 *   - live platform.database_identity.environment_code=testing
 *   - no production signals in env/host/identity
 *
 * Destructive writes require:
 *   --confirm 'CLEAR V10 QA CANONICAL SCHEMA'
 *
 * Never prints DATABASE_URL, passwords, or connection strings.
 *
 * Usage:
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     node db/scripts/v10-qa-canonical-reset.js --dry-run
 *
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     node db/scripts/v10-qa-canonical-reset.js \
 *     --confirm 'CLEAR V10 QA CANONICAL SCHEMA'
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  resolveDatabaseUrlSafe,
  createProvisionPool,
  requireMatchedIdentity,
  redactSecretsDeep,
  assertNoSecretsInText,
} = require("./lib/provisionCliSafety");
const {
  assertTestingMigrateTarget,
} = require("./migrate-testing");
const { migrate, discoverMigrations, discoverSeeds } = require("./lib/migrator");
const {
  ensureDatabaseIdentity,
  checkDatabaseIdentity,
} = require("./lib/databaseIdentity");
const {
  CANONICAL_CEILING,
  verifyCanonicalFreshSchema,
  describeBaseline,
} = require("./lib/canonicalMigrationBaseline");
const { provisionPlatformTenant } = require("../../src/platform/services/provisionPlatformTenant");
const {
  provisionBlessBoardChurch,
} = require("../../src/blessboard/services/provisionBlessBoardChurch");
const {
  createBlessBoardUser,
} = require("../../src/blessboard/services/createBlessBoardUser");
const {
  assignBlessBoardRole,
} = require("../../src/blessboard/services/assignBlessBoardRole");
const {
  authenticateBlessBoardUser,
} = require("../../src/blessboard/services/authenticateBlessBoardUser");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../../src/blessboard/services/blessBoardSettingsService");
const {
  repairWebsiteFoundation,
} = require("../../src/blessboard/services/websiteFoundationRepairService");
const {
  acknowledgeWebsitePreview,
} = require("../../src/blessboard/services/churchWebsitePublishService");
const {
  provisionEmptyPublicPages,
  createPageSection,
  updatePublicPage,
} = require("../../src/blessboard/services/publicContentAdminService");
const {
  saveInlineFieldDraft,
} = require("../../src/blessboard/services/websiteInlineDraftService");
const {
  publishWebsiteDrafts,
} = require("../../src/blessboard/services/websiteDraftPublishService");
const versionSvc = require("../../src/blessboard/services/websitePublicationVersionService");
const versionRepo = require("../../src/blessboard/repositories/websitePublicationVersionRepository");
const {
  submitAndProvisionClinicRegistration,
} = require("../../src/activeclinic/services/submitClinicRegistrationService");
const {
  authenticateActiveClinicIdentity,
} = require("../../src/activeclinic/services/authenticateActiveClinicIdentity");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../src/platform/config/deploymentProfiles");
const instanceRepo = require("../../src/platform/website/instanceRepository");
const contentService = require("../../src/platform/website/contentService");
const publicationService = require("../../src/platform/website/publicationService");
const versionService = require("../../src/platform/website/versionService");
const {
  PLATFORM_ADMIN_PERMISSIONS,
} = require("../../src/platform/website/permissions");

const CONFIRM_PHRASE = "CLEAR V10 QA CANONICAL SCHEMA";
const EXPECTED_IDENTITY = "moovex-platform-v7";
const EXPECTED_ENV = "testing";
const APP_SCHEMAS = Object.freeze([
  "ngo",
  "getpro",
  "activeclinic",
  "blessboard",
  "platform",
]);
const PL09_DOC = path.join(
  process.cwd(),
  "docs/qa/V10_PL09_FRESH_DB_BOOTSTRAP.md"
);
const DIAG_DIR = path.join(process.cwd(), "docs/qa/references/v10-pl10-qa-reset");
const CREDENTIALS_FILE = path.join(process.cwd(), ".env.pl10-qa-tenants.local");

const AC_V203_TABLES = Object.freeze({
  patients: ["patients", "patient_registrations", "patient_identifiers"],
  appointments: ["appointments", "appointment_service_types", "appointment_status_events"],
  clinical: ["encounters", "clinical_orders", "clinical_diagnoses", "clinical_follow_up_items"],
  pharmacy: ["pharmacy_prescriptions", "inventory_items", "dispense_events"],
  diagnostics: ["laboratory_requests", "radiology_requests", "laboratory_results"],
  billing: ["invoices", "payments", "patient_charges", "cashier_sessions"],
  rooms: ["facility_rooms"],
  clinical_documents: ["clinical_documents", "clinical_document_events"],
  visit_summary: ["patient_visit_summary_releases"],
});

const BB_CORE_TABLES = Object.freeze([
  "churches",
  "branches",
  "members",
  "roles",
  "permissions",
  "user_role_assignments",
  "media_assets",
  "public_pages",
  "website_publication_versions",
  "website_inline_field_drafts",
]);

function emit(obj) {
  const text = JSON.stringify(redactSecretsDeep(obj), null, 2);
  assertNoSecretsInText(text);
  // eslint-disable-next-line no-console
  console.log(text);
}

function parseArgs(argv) {
  let confirm = "";
  let dryRun = false;
  let skipBootstrap = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--skip-bootstrap") skipBootstrap = true;
    else if (arg === "--confirm") confirm = String(argv[++i] || "");
    else if (arg.startsWith("--confirm=")) confirm = arg.slice("--confirm=".length);
  }
  const apply = !dryRun && confirm === CONFIRM_PHRASE;
  return {
    dryRun: !apply,
    apply,
    confirm,
    skipBootstrap,
  };
}

function assertPl09Authorization() {
  if (!fs.existsSync(PL09_DOC)) {
    return { ok: false, code: "pl09_doc_missing", path: PL09_DOC };
  }
  const text = fs.readFileSync(PL09_DOC, "utf8");
  const hasPass = text.includes("V10_FRESH_DB_BOOTSTRAP_PASS");
  const hasAuth = /QA_RESET_AUTHORIZED:\s*YES/.test(text);
  if (!hasPass || !hasAuth) {
    return {
      ok: false,
      code: "pl09_authorization_absent",
      hasPass,
      hasAuth,
    };
  }
  return { ok: true, path: "docs/qa/V10_PL09_FRESH_DB_BOOTSTRAP.md" };
}

function fingerprintUrl(url) {
  try {
    const u = new URL(String(url).replace(/^postgresql:/i, "postgres:"));
    return {
      host: u.hostname,
      port: u.port || "5432",
      database: (u.pathname || "").replace(/^\//, ""),
      userPrefix: (u.username || "").slice(0, 3) + "***",
    };
  } catch {
    return { parse_error: true };
  }
}

function collectProductionAbortReasons(gate, fingerprint, identityRow) {
  const reasons = [];
  const dep = String(gate.DEPLOYMENT_ENV || "").trim().toLowerCase();
  const idEnv = String(gate.DATABASE_IDENTITY_ENV || "").trim().toLowerCase();
  const code = String(gate.PLATFORM_DEPLOYMENT_CODE || "").trim().toLowerCase();
  const host = String((fingerprint && fingerprint.host) || "").toLowerCase();
  const dbEnv = String((identityRow && identityRow.environment_code) || "")
    .trim()
    .toLowerCase();

  if (dep === "production") reasons.push("DEPLOYMENT_ENV=production");
  if (dep && dep !== EXPECTED_ENV) reasons.push(`DEPLOYMENT_ENV=${dep}`);
  if (idEnv === "production") reasons.push("DATABASE_IDENTITY_ENV=production");
  if (idEnv && idEnv !== EXPECTED_ENV) {
    reasons.push(`DATABASE_IDENTITY_ENV=${idEnv}`);
  }
  if (code.includes("production") || /(^|-)prod($|-)/.test(code)) {
    reasons.push(`PLATFORM_DEPLOYMENT_CODE=${code}`);
  }
  if (host.includes("production") || /(^|\.)prod[.-]/.test(host)) {
    reasons.push("host looks production");
  }
  if (/blessboard\.com$|activeclinic\.org$/.test(host)) {
    reasons.push("production apex host");
  }
  if (dbEnv === "production") {
    reasons.push("database_identity.environment_code=production");
  }
  if (dbEnv && dbEnv !== EXPECTED_ENV) {
    reasons.push(`database_identity.environment_code=${dbEnv}`);
  }
  if (gate.GETPRO_DATABASE_URL_set) {
    reasons.push("GETPRO_DATABASE_URL is set");
  }
  return reasons;
}

async function captureDiagnostics(pool) {
  const schemas = await pool.query(
    `SELECT nspname
       FROM pg_namespace
      WHERE nspname = ANY($1::text[])
      ORDER BY 1`,
    [APP_SCHEMAS]
  );
  let migrations = null;
  try {
    const mig = await pool.query(
      `SELECT module, COUNT(*)::int AS n, MAX(version) AS max_version
         FROM platform.schema_migrations
        GROUP BY module
        ORDER BY 1`
    );
    migrations = mig.rows;
  } catch (err) {
    migrations = { error: err && err.message ? err.message : String(err) };
  }
  const tableCounts = {};
  for (const schema of APP_SCHEMAS) {
    const t = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM information_schema.tables
        WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [schema]
    );
    tableCounts[schema] = t.rows[0].n;
  }
  let orgCounts = null;
  try {
    const orgs = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM platform.organizations) AS organizations,
         (SELECT COUNT(*)::int FROM blessboard.churches) AS churches,
         (SELECT COUNT(*)::int FROM activeclinic.healthcare_organizations) AS healthcare_orgs`
    );
    orgCounts = orgs.rows[0];
  } catch (err) {
    orgCounts = { error: err && err.message ? err.message : String(err) };
  }
  return {
    schemas: schemas.rows.map((r) => r.nspname),
    migrations,
    tableCounts,
    orgCounts,
    discoveredMigrations: discoverMigrations().length,
    discoveredSeeds: discoverSeeds().length,
    ceiling: CANONICAL_CEILING,
  };
}

async function dropApplicationSchemas(pool) {
  // CASCADE each schema independently so a missing schema is not fatal.
  const dropped = [];
  for (const schema of APP_SCHEMAS) {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    dropped.push(schema);
  }
  return { ok: true, dropped };
}

async function assertTablesExist(pool, schema, tables) {
  for (const table of tables) {
    const r = await pool.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2 AND table_type = 'BASE TABLE'`,
      [schema, table]
    );
    if (r.rowCount !== 1) {
      throw new Error(`missing ${schema}.${table}`);
    }
  }
}

async function bootstrapControlledTenants(pool, deploymentCode) {
  const stamp = Date.now().toString(36);
  const bbKey = `pl10-bb-${stamp}`;
  const bbPassword = `Pl10Bb${crypto.randomBytes(10).toString("base64url")}!`;
  const acPassword = `Pl10Ac${crypto.randomBytes(10).toString("base64url")}!`;
  const publishEnv = {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: deploymentCode,
    DEPLOYMENT_ENV: "testing",
    SESSION_SECRET: "pl10-qa-session-secret-at-least-32-chars!",
  };

  const platform = await provisionPlatformTenant(pool, {
    organizationKey: bbKey,
    displayName: "PL10 QA BlessBoard",
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: bbKey,
    hostname: `${bbKey}.blessboard.test`,
    domainType: "canonical",
    deploymentCode,
    isPrimary: true,
  });
  if (!platform.ok) {
    throw new Error(`BB platform provision failed: ${platform.message || platform.code}`);
  }

  const church = await provisionBlessBoardChurch(pool, {
    organizationKey: bbKey,
    churchKey: bbKey,
    displayName: "PL10 QA Church",
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "HQ",
  });
  if (!church.ok) {
    throw new Error(`BB church provision failed: ${church.message || church.code}`);
  }

  await ensureChurchSettingsInitialized(pool, church.records.church.id);
  await updateChurchSettings(pool, church.records.church.id, {
    publicName: "PL10 QA Church",
    websiteStatus: "published",
    primaryEmail: `pl10-bb-${stamp}@example.test`,
  });
  await repairWebsiteFoundation(pool, { churchId: church.records.church.id });
  await acknowledgeWebsitePreview(pool, {
    organizationId: platform.records.organization.id,
    actorUserId: null,
  });
  await provisionEmptyPublicPages(pool, {
    churchId: church.records.church.id,
    branchId: null,
  });
  const home = await pool.query(
    `SELECT id FROM blessboard.public_pages
      WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL
      LIMIT 1`,
    [church.records.church.id]
  );
  await updatePublicPage(pool, home.rows[0].id, { status: "published" });
  await createPageSection(pool, {
    pageId: home.rows[0].id,
    sectionKey: "hero",
    sectionType: "hero",
    heading: "PL10 Live Headline",
    bodyText: "PL10 live body",
    status: "published",
    sortOrder: 0,
  });
  await pool.query(
    `UPDATE blessboard.public_pages
        SET status = 'published', published_at = COALESCE(published_at, now())
      WHERE church_id = $1 AND branch_id IS NULL`,
    [church.records.church.id]
  );

  const bbEmail = `pl10-hq-${stamp}@example.test`;
  const bbUser = await createBlessBoardUser(pool, {
    email: bbEmail,
    displayName: "PL10 HQ Admin",
    password: bbPassword,
  });
  if (!bbUser.ok) {
    throw new Error(`BB user create failed: ${bbUser.message || bbUser.code}`);
  }
  const assigned = await assignBlessBoardRole(pool, {
    email: bbEmail,
    organizationKey: bbKey,
    roleKey: "organisation_administrator",
    churchKey: bbKey,
  });
  if (!assigned.ok) {
    throw new Error(`BB role assign failed: ${JSON.stringify(assigned)}`);
  }

  const draft = await saveInlineFieldDraft(pool, {
    organizationId: platform.records.organization.id,
    churchId: church.records.church.id,
    branchId: null,
    editorUserId: bbUser.user.id,
    actorRole: "organisation_administrator",
    pageKey: "home",
    sectionKey: "hero",
    fieldKey: "heading",
    newValue: "PL10 Draft Headline",
  });
  if (!draft.saved) {
    throw new Error(`BB draft failed: ${JSON.stringify(draft)}`);
  }
  const published = await publishWebsiteDrafts(pool, {
    organizationId: platform.records.organization.id,
    churchId: church.records.church.id,
    branchId: null,
    actorUserId: bbUser.user.id,
    actorRole: "organisation_administrator",
    confirmPublish: true,
    deferServiceTimes: true,
    tenant: {
      resolved: true,
      organization: platform.records.organization,
      church: church.records.church,
    },
    env: publishEnv,
  });
  if (!published.ok) {
    throw new Error(`BB publish failed: ${published.reason || JSON.stringify(published)}`);
  }
  const current = await versionRepo.getCurrentPublishedVersion(
    pool,
    platform.records.organization.id
  );
  if (!current || !current.id) {
    throw new Error("BB published version missing");
  }
  await saveInlineFieldDraft(pool, {
    organizationId: platform.records.organization.id,
    churchId: church.records.church.id,
    branchId: null,
    editorUserId: bbUser.user.id,
    actorRole: "organisation_administrator",
    pageKey: "home",
    sectionKey: "hero",
    fieldKey: "heading",
    newValue: "PL10 Second Headline",
  });
  const second = await publishWebsiteDrafts(pool, {
    organizationId: platform.records.organization.id,
    churchId: church.records.church.id,
    branchId: null,
    actorUserId: bbUser.user.id,
    actorRole: "organisation_administrator",
    confirmPublish: true,
    deferServiceTimes: true,
    tenant: {
      resolved: true,
      organization: platform.records.organization,
      church: church.records.church,
    },
    env: publishEnv,
  });
  if (!second.ok) {
    throw new Error(`BB second publish failed: ${second.reason || JSON.stringify(second)}`);
  }
  const restored = await versionSvc.restoreAndPublishCurrentVersion(pool, {
    organizationId: platform.records.organization.id,
    churchId: church.records.church.id,
    versionId: current.id,
    actorUserId: bbUser.user.id,
    env: publishEnv,
  });
  if (!restored.ok) {
    throw new Error(`BB restore failed: ${restored.reason || JSON.stringify(restored)}`);
  }

  const bbAuth = await authenticateBlessBoardUser(pool, {
    email: bbEmail,
    password: bbPassword,
    deploymentCode,
  });
  if (!bbAuth.ok) {
    throw new Error(`BB login failed: ${bbAuth.status || JSON.stringify(bbAuth)}`);
  }

  const acEmail = `pl10-ac-${stamp}@example.invalid`;
  const acPhone = `+260977${String(Date.now()).slice(-6)}`;
  const ac = await submitAndProvisionClinicRegistration(pool, {
    clinicName: "PL10 QA ActiveClinic",
    contactName: "PL10 Clinic Admin",
    contactEmail: acEmail,
    contactPhone: acPhone,
    province: "Lusaka",
    city: "Lusaka",
    address: "1 Independence Avenue",
    countryCode: "ZM",
    notes: "pl10 canonical qa",
    password: acPassword,
    passwordConfirm: acPassword,
    acceptTerms: "on",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    dataEnvironment: "testing",
    env: {
      NODE_ENV: "test",
      PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
    },
  });
  if (!ac.ok) {
    throw new Error(`AC provision failed: ${JSON.stringify(ac)}`);
  }

  const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
    organizationId: ac.organizationId,
    productCode: "activeclinic",
  });
  if (!instance || !instance.id) {
    throw new Error("AC website instance missing after provision");
  }

  await contentService.saveWebsiteDraft(pool, {
    organizationId: ac.organizationId,
    instanceId: instance.id,
    contentKey: "home.hero.title",
    value: "PL10 AC Hero",
    actorIdentityId: ac.identityId,
  });
  const acPublish = await publicationService.publishWebsiteDraft(pool, {
    organizationId: ac.organizationId,
    instanceId: instance.id,
    actorIdentityId: ac.identityId,
    grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
  });
  if (!acPublish.ok) {
    throw new Error(`AC publish failed: ${JSON.stringify(acPublish)}`);
  }
  await contentService.saveWebsiteDraft(pool, {
    organizationId: ac.organizationId,
    instanceId: instance.id,
    contentKey: "home.hero.title",
    value: "PL10 AC Hero v2",
    actorIdentityId: ac.identityId,
  });
  const acSecond = await publicationService.publishWebsiteDraft(pool, {
    organizationId: ac.organizationId,
    instanceId: instance.id,
    actorIdentityId: ac.identityId,
    grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
  });
  if (!acSecond.ok) {
    throw new Error(`AC second publish failed: ${JSON.stringify(acSecond)}`);
  }
  const listed = await versionService.listWebsiteVersions(pool, {
    instanceId: instance.id,
    organizationId: ac.organizationId,
  });
  const historical = (listed.versions || []).find(
    (v) => v.id !== (acSecond.version && acSecond.version.id)
  );
  if (!historical) {
    throw new Error("AC prior version missing for restore");
  }
  const acRestore = await publicationService.restoreWebsiteVersionLive(pool, {
    organizationId: ac.organizationId,
    instanceId: instance.id,
    versionId: historical.id,
    actorIdentityId: ac.identityId,
    grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
  });
  if (!acRestore.ok) {
    throw new Error(`AC restore failed: ${JSON.stringify(acRestore)}`);
  }

  const acAuth = await authenticateActiveClinicIdentity(pool, {
    identifier: acEmail,
    password: acPassword,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    hostname: "activeclinic.test",
  });
  if (!acAuth.ok) {
    throw new Error(`AC login failed: ${acAuth.status || JSON.stringify(acAuth)}`);
  }

  const cross = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int
          FROM activeclinic.healthcare_organizations h
         WHERE h.organization_id = $1) AS bb_as_hco,
       (SELECT COUNT(*)::int
          FROM blessboard.churches c
         WHERE c.organization_id = $2) AS ac_as_church`,
    [platform.records.organization.id, ac.organizationId]
  );
  if (cross.rows[0].bb_as_hco !== 0 || cross.rows[0].ac_as_church !== 0) {
    throw new Error(`tenant isolation failed: ${JSON.stringify(cross.rows[0])}`);
  }

  const credBody = [
    `# PL10 controlled QA tenants — local only; do not commit`,
    `PL10_BB_ORG_KEY=${bbKey}`,
    `PL10_BB_EMAIL=${bbEmail}`,
    `PL10_BB_PASSWORD=${bbPassword}`,
    `PL10_AC_EMAIL=${acEmail}`,
    `PL10_AC_PASSWORD=${acPassword}`,
    `PL10_AC_ORG_ID=${ac.organizationId}`,
    "",
  ].join("\n");
  fs.writeFileSync(CREDENTIALS_FILE, credBody, { mode: 0o600 });

  return {
    ok: true,
    bb: {
      organizationKey: bbKey,
      churchId: church.records.church.id,
      userEmail: bbEmail,
      login: true,
      publish: true,
      restore: true,
      cms: true,
    },
    ac: {
      organizationId: ac.organizationId,
      email: acEmail,
      login: true,
      publish: true,
      restore: true,
      cms: true,
      websiteInstanceId: instance.id,
    },
    credentialsFile: ".env.pl10-qa-tenants.local",
    isolation: cross.rows[0],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let pool = null;
  let exitCode = 0;

  try {
    const pl09 = assertPl09Authorization();
    if (!pl09.ok) {
      emit({
        ok: false,
        code: pl09.code,
        message: "STOP: V10_FRESH_DB_BOOTSTRAP_PASS / QA_RESET_AUTHORIZED: YES absent",
        detail: pl09,
      });
      exitCode = 2;
      return;
    }

    const migrateGate = assertTestingMigrateTarget(process.env);
    if (!migrateGate.ok) {
      emit({ ok: false, code: migrateGate.code, message: migrateGate.message });
      exitCode = 2;
      return;
    }

    const gate = {
      DEPLOYMENT_ENV: process.env.DEPLOYMENT_ENV,
      PLATFORM_DEPLOYMENT_CODE: process.env.PLATFORM_DEPLOYMENT_CODE,
      DATABASE_IDENTITY_EXPECTED: process.env.DATABASE_IDENTITY_EXPECTED,
      DATABASE_IDENTITY_ENV: process.env.DATABASE_IDENTITY_ENV,
      GETPRO_DATABASE_URL_set: Boolean(
        process.env.GETPRO_DATABASE_URL && String(process.env.GETPRO_DATABASE_URL).trim()
      ),
    };

    const dbUrl = resolveDatabaseUrlSafe();
    if (!dbUrl.ok) {
      emit({ ok: false, code: "DATABASE_URL_required", message: dbUrl.message });
      exitCode = 2;
      return;
    }

    const fingerprint = fingerprintUrl(dbUrl.connectionString);
    pool = createProvisionPool(dbUrl.connectionString, { max: 4 });

    const identity = await checkDatabaseIdentity(pool, {
      identityKey: EXPECTED_IDENTITY,
    });
    if (!identity.ok) {
      emit({
        ok: false,
        code: "identity_unproven",
        message: "ABORT WITHOUT DESTRUCTIVE ACTION: testing identity not proven",
        identity,
        fingerprint,
        gate,
      });
      exitCode = 2;
      return;
    }

    const matched = await requireMatchedIdentity(pool);
    if (!matched.ok) {
      emit({
        ok: false,
        code: "identity_match_failed",
        message: "ABORT WITHOUT DESTRUCTIVE ACTION",
        matched,
        fingerprint,
        gate,
      });
      exitCode = 2;
      return;
    }

    const abortReasons = collectProductionAbortReasons(gate, fingerprint, identity.row);
    if (abortReasons.length) {
      emit({
        ok: false,
        code: "production_or_non_testing_signal",
        message: "ABORT WITHOUT DESTRUCTIVE ACTION",
        abortReasons,
        fingerprint,
        gate,
        identity: {
          identity_key: identity.row.identity_key,
          environment_code: identity.row.environment_code,
          database_instance_id: identity.row.database_instance_id,
        },
      });
      exitCode = 2;
      return;
    }

    const diagnostics = await captureDiagnostics(pool);
    fs.mkdirSync(DIAG_DIR, { recursive: true });
    const diagPath = path.join(
      DIAG_DIR,
      `pre-reset-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    );
    const diagPayload = redactSecretsDeep({
      capturedAt: new Date().toISOString(),
      fingerprint,
      gate,
      identity: {
        identity_key: identity.row.identity_key,
        environment_code: identity.row.environment_code,
        database_instance_id: identity.row.database_instance_id,
      },
      diagnostics,
      baseline: describeBaseline(),
    });
    fs.writeFileSync(diagPath, JSON.stringify(diagPayload, null, 2));

    emit({
      ok: true,
      phase: "preflight",
      mode: args.apply ? "apply" : "dry_run",
      pl09,
      target: {
        identity_key: identity.row.identity_key,
        environment_code: identity.row.environment_code,
        database_instance_id: identity.row.database_instance_id,
        host: fingerprint.host,
        database: fingerprint.database,
        deployment_env: gate.DEPLOYMENT_ENV,
        platform_deployment_code: gate.PLATFORM_DEPLOYMENT_CODE,
      },
      diagnostics_file: path.relative(process.cwd(), diagPath),
      confirmRequired: CONFIRM_PHRASE,
      note: args.apply
        ? "Applying canonical QA schema reset"
        : "Dry-run only — no DROP SCHEMA / migrate / bootstrap",
    });

    if (!args.apply) {
      emit({
        ok: true,
        code: "V10_QA_CANONICAL_RESET_DRY_RUN",
        message: "Refusing destructive action without exact confirm phrase",
      });
      return;
    }

    // --- DESTRUCTIVE ---
    const drop = await dropApplicationSchemas(pool);
    const migrateSummary = await migrate({ pool });
    const ensured = await ensureDatabaseIdentity(pool, {
      connectionString: dbUrl.connectionString,
      identityKey: EXPECTED_IDENTITY,
      environmentCode: EXPECTED_ENV,
    });
    if (!ensured.ok) {
      emit({ ok: false, code: "identity_ensure_failed", ensured, drop });
      exitCode = 1;
      return;
    }
    const postIdentity = await checkDatabaseIdentity(pool, {
      identityKey: EXPECTED_IDENTITY,
    });
    if (
      !postIdentity.ok ||
      String(postIdentity.row.environment_code).toLowerCase() !== EXPECTED_ENV
    ) {
      emit({ ok: false, code: "post_identity_not_testing", postIdentity });
      exitCode = 1;
      return;
    }

    const schema = await verifyCanonicalFreshSchema(pool);
    if (!schema.ok) {
      emit({ ok: false, code: "schema_verify_failed", failures: schema.failures });
      exitCode = 1;
      return;
    }

    for (const [area, tables] of Object.entries(AC_V203_TABLES)) {
      await assertTablesExist(pool, "activeclinic", tables);
      void area;
    }
    await assertTablesExist(pool, "blessboard", BB_CORE_TABLES);

    let bootstrap = { skipped: true };
    if (!args.skipBootstrap) {
      const deploymentCode =
        String(process.env.PLATFORM_DEPLOYMENT_CODE || "").trim() ||
        "moovex-platform-testing";
      bootstrap = await bootstrapControlledTenants(pool, deploymentCode);
    }

    const postDiag = await captureDiagnostics(pool);
    emit({
      ok: true,
      code: "V10_QA_CANONICAL_RESET_PASS",
      drop,
      migrate: {
        applied: migrateSummary.applied.length,
        skipped: migrateSummary.skipped.length,
        seeds_applied: migrateSummary.seedsApplied.length,
        seeds_skipped: migrateSummary.seedsSkipped.length,
        discovered: discoverMigrations().length,
        ceiling: CANONICAL_CEILING,
      },
      identity: {
        identity_key: postIdentity.row.identity_key,
        environment_code: postIdentity.row.environment_code,
        database_instance_id: postIdentity.row.database_instance_id,
        ensure_result: ensured.result,
      },
      schema_ok: true,
      ac_v203_schema: true,
      bb_core_schema: true,
      bootstrap,
      post_diagnostics: {
        tableCounts: postDiag.tableCounts,
        migrations: postDiag.migrations,
        orgCounts: postDiag.orgCounts,
      },
      production: "UNTOUCHED",
    });
  } catch (err) {
    emit({
      ok: false,
      code: "pl10_failed",
      message: err && err.message ? err.message : String(err),
    });
    exitCode = 1;
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch {
        /* ignore */
      }
    }
  }
  process.exit(exitCode);
}

main();
