"use strict";

/**
 * Prompt 073 — public registration schema mismatch (RETURNING/SELECT vs hosted columns).
 */

const assert = require("node:assert/strict");
const { describe, it, before, after, beforeEach } = require("node:test");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const repo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  submitInstantFreeChurchRegistration,
  submitPlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationService");
const {
  validatePlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");

const ROOT = path.resolve(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function randomPhone() {
  return `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
}

describe("public registration schema mismatch (Prompt 073)", () => {
  let pool;
  let databaseUrl;
  let skipSuite = false;
  let skipReason = "";
  let existingUserEmail = null;

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

      const key = uniq("schema-user");
      existingUserEmail = `${key}@example.org`;
      const created = await createBlessBoardUser(pool, {
        email: existingUserEmail,
        displayName: "Schema Existing User",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  beforeEach(() => {
    repo.resetPublicRegistrationSchemaCacheForTests();
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("public write INSERT/RETURNING does not reference admin-only rejection columns", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/blessboard/repositories/platformChurchRegistrationRepository.js"),
      "utf8"
    );
    const insertFn = source.match(/async function insertApplicationRow[\s\S]*?\n\}/);
    assert.ok(insertFn, "insertApplicationRow present");
    const body = insertFn[0];
    assert.match(body, /RETURNING \$\{PUBLIC_WRITE_SELECT_COLUMNS\}/);
    for (const col of repo.PUBLIC_REGISTRATION_ADMIN_ONLY_COLUMNS) {
      assert.equal(
        body.includes(col),
        false,
        `insertApplicationRow must not reference admin-only column ${col}`
      );
    }
    assert.ok(repo.PUBLIC_WRITE_SELECT_COLUMNS.includes("risk_decision"));
    assert.equal(repo.PUBLIC_WRITE_SELECT_COLUMNS.includes("rejection_category"), false);
    assert.ok(repo.SELECT_COLUMNS.includes("rejection_category"));
  });

  it("migration order includes 039 rejection metadata (admin path; not required for public INSERT)", () => {
    const migDir = path.join(ROOT, "db/migrations/blessboard");
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
    assert.ok(files.includes("039_registration_application_communications.sql"));
    assert.ok(files.indexOf("039_registration_application_communications.sql") > files.indexOf("031_registration_risk_review.sql"));
    const sql = fs.readFileSync(
      path.join(migDir, "039_registration_application_communications.sql"),
      "utf8"
    );
    assert.match(sql, /ADD COLUMN IF NOT EXISTS rejection_category/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS reapplication_allowed/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS rejection_notification_status/);
  });

  it("foundation registration succeeds with canonical migrated schema", async () => {
    requireDb();
    const phone = randomPhone();
    const email = `${uniq("found")}@example.org`;
    const orgKey = uniq("schemafound");
    const validation = validatePlatformChurchRegistration(
      {
        church_name: "Schema Foundation Church",
        country: "Zambia",
        city: "Lusaka",
        contact_name: "Pastor Schema",
        role_in_church: "Pastor",
        phone,
        email,
        selected_plan: "foundation",
        consent_contact: "on",
        organization_key: orgKey,
        password: PASSWORD,
        password_confirm: PASSWORD,
        branch_name: "HQ",
      },
      { instantFreeEnabled: true }
    );
    assert.equal(validation.ok, true, validation.error);
    const result = await submitInstantFreeChurchRegistration(
      pool,
      { ip: "203.0.113.73" },
      validation,
      { dataEnvironment: "testing", deploymentCode: "blessboard-org-staging" }
    );
    assert.equal(result.ok, true, result.error || result.code);
    assert.ok(result.application && result.application.id);
    assert.ok(["submitted", "closed"].includes(String(result.application.application_status)));
    assert.equal(Object.prototype.hasOwnProperty.call(result.application, "rejection_category"), false);
  });

  it("duplicate_email risk still creates a review application", async () => {
    requireDb();
    assert.ok(existingUserEmail);
    const phone = randomPhone();
    const validation = validatePlatformChurchRegistration(
      {
        church_name: "Schema Duplicate Email Church",
        country: "Zambia",
        city: "Lusaka",
        contact_name: "Pastor Dup",
        role_in_church: "Pastor",
        phone,
        email: existingUserEmail,
        selected_plan: "foundation",
        consent_contact: "on",
        organization_key: uniq("schemadup"),
        password: PASSWORD,
        password_confirm: PASSWORD,
        branch_name: "HQ",
      },
      { instantFreeEnabled: true }
    );
    assert.equal(validation.ok, true, validation.error);
    const before = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [existingUserEmail]
    );
    const result = await submitInstantFreeChurchRegistration(
      pool,
      { ip: "203.0.113.74" },
      validation
    );
    assert.equal(result.ok, false);
    assert.equal(result.review, true);
    assert.equal(result.code, "review_required");
    assert.ok(result.application && result.application.id);
    assert.equal(result.application.application_status, "duplicate_review");
    assert.equal(result.application.risk_decision, "review_required");
    assert.ok((result.riskReasonCodes || []).includes("duplicate_email"));
    const after = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [existingUserEmail]
    );
    assert.equal(after.rows[0].n, before.rows[0].n + 1);
  });

  it("missing required column produces schema_mismatch and creates no partial application", async () => {
    requireDb();
    const phone = randomPhone();
    const email = `${uniq("misscol")}@example.org`;
    const churchName = `Missing Col Church ${uniq("c")}`;

    const gatedQuery = async (text, params) => {
      const sql = String(text || "");
      if (sql.includes("information_schema.columns") && sql.includes("column_name")) {
        const present = repo.PUBLIC_REGISTRATION_REQUIRED_COLUMNS.filter(
          (c) => c !== "risk_decision"
        );
        return { rows: present.map((column_name) => ({ column_name })) };
      }
      return pool.query(text, params);
    };
    // Query-only client (no connect) exercises createApplicationIdempotent fallback path.
    const gatedPool = { query: gatedQuery };

    const before = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1) AND lower(church_name) = lower($2)`,
      [email, churchName]
    );

    await assert.rejects(
      () =>
        repo.createApplicationIdempotent(gatedPool, {
          church_name: churchName,
          country: "Zambia",
          city: "Lusaka",
          contact_name: "Pastor Miss",
          contact_email: email,
          contact_phone: phone,
          contact_phone_normalized: phone,
          role_in_church: "Pastor",
          selected_plan: "foundation",
          consent_terms: true,
          application_status: "submitted",
          risk_decision: "allow",
          risk_reason_codes: [],
        }),
      (err) => {
        assert.equal(err.code, "schema_mismatch");
        assert.equal(err.name, "PublicRegistrationSchemaMismatchError");
        assert.deepEqual(err.missingColumns, ["risk_decision"]);
        return true;
      }
    );

    const after = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1) AND lower(church_name) = lower($2)`,
      [email, churchName]
    );
    assert.equal(after.rows[0].n, before.rows[0].n);

    const serviceResult = await submitPlatformChurchRegistration(
      gatedPool,
      { ip: "203.0.113.75" },
      validatePlatformChurchRegistration({
        church_name: churchName,
        country: "Zambia",
        city: "Ndola",
        contact_name: "Pastor Miss",
        role_in_church: "Pastor",
        phone,
        email,
        selected_plan: "foundation",
        consent_contact: "on",
      })
    );
    assert.equal(serviceResult.ok, false);
    assert.equal(serviceResult.code, "schema_mismatch");
    assert.equal(serviceResult.httpStatus, 503);
    assert.match(serviceResult.error, /could not save/i);
    assert.equal(serviceResult.missingColumns, undefined);
  });

  it("schema readiness lists exact missing columns without mutating schema", async () => {
    requireDb();
    const checkOk = await repo.checkPublicRegistrationSchemaReady(pool);
    assert.equal(checkOk.ok, true);
    assert.deepEqual(checkOk.missingColumns, []);

    repo.resetPublicRegistrationSchemaCacheForTests();
    const mock = {
      query: async () => ({
        rows: repo.PUBLIC_REGISTRATION_REQUIRED_COLUMNS.filter(
          (c) => c !== "contact_phone_normalized" && c !== "support_requested"
        ).map((column_name) => ({ column_name })),
      }),
    };
    const checkBad = await repo.checkPublicRegistrationSchemaReady(mock);
    assert.equal(checkBad.ok, false);
    assert.deepEqual(checkBad.missingColumns.sort(), [
      "contact_phone_normalized",
      "support_requested",
    ]);
  });

  it("existing registration fields remain readable after public write", async () => {
    requireDb();
    const phone = randomPhone();
    const created = await repo.createApplication(pool, {
      church_name: "Schema Intact Church",
      country: "Kenya",
      city: "Nairobi",
      contact_name: "Pastor Intact",
      contact_email: `${uniq("intact")}@example.org`,
      contact_phone: phone,
      contact_phone_normalized: phone,
      role_in_church: "Administrator",
      selected_plan: "foundation",
      consent_terms: true,
      application_status: "submitted",
      risk_decision: "allow",
      risk_reason_codes: ["clean"],
    });
    const loaded = await repo.findApplicationById(pool, created.id);
    assert.ok(loaded);
    assert.equal(loaded.church_name, "Schema Intact Church");
    assert.equal(loaded.risk_decision, "allow");
    assert.equal(loaded.rejection_category, null);
    assert.equal(loaded.reapplication_allowed, null);
    assert.equal(loaded.rejection_notification_status, null);
  });
});
