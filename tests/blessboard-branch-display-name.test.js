"use strict";

/**
 * Branch display-name normalization + uniqueness within church_id (migration 029).
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const fs = require("fs");
const path = require("path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  createBlessBoardBranch,
} = require("../src/blessboard/services/createBlessBoardBranch");
const {
  normalizeBranchDisplayName,
  prepareBranchDisplayName,
  isUniqueBranchDisplayNameViolation,
  DUPLICATE_BRANCH_DISPLAY_NAME_MESSAGE,
} = require("../src/blessboard/services/normalizeBranchDisplayName");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const { assignOrganizationPlan } = require("../src/platform/services/entitlementService");

const IDENTITY_KEY = "blessboard-platform-v5";
const DEPLOYMENT = "blessboard-org-v5";
const ROOT = path.join(__dirname, "..");

describe("normalizeBranchDisplayName", () => {
  it("trims, collapses whitespace, and lowercases without stripping punctuation", () => {
    assert.equal(normalizeBranchDisplayName("  Central   Branch  "), "central branch");
    assert.equal(normalizeBranchDisplayName("central branch"), "central branch");
    assert.equal(normalizeBranchDisplayName("Central Branch"), "central branch");
    assert.equal(normalizeBranchDisplayName("St. Mary's"), "st. mary's");
    assert.equal(normalizeBranchDisplayName("St Mary's"), "st mary's");
    assert.notEqual(
      normalizeBranchDisplayName("St. Mary's"),
      normalizeBranchDisplayName("St Mary's")
    );
  });

  it("prepareBranchDisplayName preserves user-facing casing while normalizing compare form", () => {
    const prepared = prepareBranchDisplayName("  Central   Branch  ");
    assert.equal(prepared.ok, true);
    assert.equal(prepared.display, "Central Branch");
    assert.equal(prepared.normalized, "central branch");
  });
});

describe("blessboard branch display-name uniqueness", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let orgA;
  let churchA;
  let orgB;
  let churchB;

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

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "bdn-org-a",
        displayName: "Shared Org Display Name",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "bdn-org-a",
        hostname: "bdn-a.blessboard.test",
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const churchProvA = await provisionBlessBoardChurch(pool, {
        organizationKey: "bdn-org-a",
        churchKey: "bdn-org-a",
        displayName: "Branch Name Church A",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
        timezone: "UTC",
        countryCode: "ZM",
      });
      assert.equal(churchProvA.ok, true, churchProvA.message);
      churchA = churchProvA.records.church;

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "bdn-org-b",
        displayName: "Shared Org Display Name",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "bdn-org-b",
        hostname: "bdn-b.blessboard.test",
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;

      const churchProvB = await provisionBlessBoardChurch(pool, {
        organizationKey: "bdn-org-b",
        churchKey: "bdn-org-b",
        displayName: "Branch Name Church B",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
        timezone: "UTC",
        countryCode: "KE",
      });
      assert.equal(churchProvB.ok, true, churchProvB.message);
      churchB = churchProvB.records.church;

      for (const organizationId of [orgA.id, orgB.id]) {
        const growth = await assignOrganizationPlan(pool, {
          organizationId,
          planKey: "growth",
        });
        assert.equal(growth.ok, true, growth.reason);
      }
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("migration adds generated column and live unique index on (church_id, display_name_normalized)", async () => {
    requireDb();
    const col = await pool.query(
      `SELECT is_generated, generation_expression
         FROM information_schema.columns
        WHERE table_schema = 'blessboard'
          AND table_name = 'branches'
          AND column_name = 'display_name_normalized'`
    );
    assert.equal(col.rowCount, 1);
    assert.equal(String(col.rows[0].is_generated).toUpperCase(), "ALWAYS");
    assert.match(String(col.rows[0].generation_expression), /lower|regexp_replace|trim/i);

    const idx = await pool.query(
      `SELECT indexname, indexdef
         FROM pg_indexes
        WHERE schemaname = 'blessboard'
          AND indexname = 'branches_church_display_name_normalized_live_uidx'`
    );
    assert.equal(idx.rowCount, 1);
    assert.match(idx.rows[0].indexdef, /UNIQUE/i);
    assert.match(idx.rows[0].indexdef, /church_id/i);
    assert.match(idx.rows[0].indexdef, /display_name_normalized/i);
  });

  it("Central Branch variants collide within one church; punctuation remains meaningful", async () => {
    requireDb();
    const first = await createBlessBoardBranch(pool, {
      churchId: churchA.id,
      organizationId: orgA.id,
      branchKey: "central-1",
      displayName: "Central Branch",
    });
    assert.equal(first.ok, true, first.reason || first.message);
    assert.equal(first.branch.display_name, "Central Branch");
    assert.equal(first.branch.display_name_normalized, "central branch");

    const caseCollision = await createBlessBoardBranch(pool, {
      churchId: churchA.id,
      organizationId: orgA.id,
      branchKey: "central-2",
      displayName: "central branch",
    });
    assert.equal(caseCollision.ok, false);
    assert.equal(caseCollision.status, "conflict");
    assert.equal(caseCollision.reason, "duplicate_display_name");
    assert.equal(caseCollision.message, DUPLICATE_BRANCH_DISPLAY_NAME_MESSAGE);

    const spaceCollision = await createBlessBoardBranch(pool, {
      churchId: churchA.id,
      organizationId: orgA.id,
      branchKey: "central-3",
      displayName: "  Central   Branch  ",
    });
    assert.equal(spaceCollision.ok, false);
    assert.equal(spaceCollision.reason, "duplicate_display_name");

    const punctOk = await createBlessBoardBranch(pool, {
      churchId: churchA.id,
      organizationId: orgA.id,
      branchKey: "st-marys",
      displayName: "St. Mary's",
    });
    assert.equal(punctOk.ok, true, punctOk.reason || punctOk.message);

    const punctDistinct = await createBlessBoardBranch(pool, {
      churchId: churchA.id,
      organizationId: orgA.id,
      branchKey: "st-marys-2",
      displayName: "St Mary's",
    });
    assert.equal(punctDistinct.ok, true, punctDistinct.reason || punctDistinct.message);
  });

  it("same normalized branch name succeeds under a different church/owner", async () => {
    requireDb();
    const other = await createBlessBoardBranch(pool, {
      churchId: churchB.id,
      organizationId: orgB.id,
      branchKey: "central-b",
      displayName: "Central Branch",
    });
    assert.equal(other.ok, true, other.reason || other.message);
    assert.equal(other.branch.display_name, "Central Branch");
  });

  it("registration-provided first-branch display name is persisted with HQ key hq", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const app = await appRepo.createApplication(pool, {
      church_name: `BDN Persist ${stamp}`,
      country: "Zambia",
      city: "Lusaka",
      contact_name: "Pastor Persist",
      contact_email: `bdn-persist-${stamp}@example.org`,
      contact_phone: `+26097${String(2000000 + (Date.now() % 1000000)).slice(0, 7)}`,
      role_in_church: "Pastor",
      selected_plan: "foundation",
      consent_terms: true,
      branch_name: "  Central   Branch  ",
    });
    assert.equal(app.branch_name, "  Central   Branch  ");

    const result = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: app.id,
      administratorPassword: "TestPassword99",
      requestId: `req-bdn-${stamp}`,
      actorContext: { type: "test", source: "unit", dataEnvironment: "testing" },
    });
    assert.equal(result.ok, true, result.message || result.status);

    const branch = await pool.query(
      `SELECT branch_key, display_name, display_name_normalized, branch_type, is_primary
         FROM blessboard.branches WHERE id = $1`,
      [result.records.branchId]
    );
    assert.equal(branch.rowCount, 1);
    assert.equal(branch.rows[0].branch_key, "hq");
    assert.equal(branch.rows[0].branch_type, "hq");
    assert.equal(branch.rows[0].is_primary, true);
    assert.equal(branch.rows[0].display_name, "Central Branch");
    assert.equal(branch.rows[0].display_name_normalized, "central branch");
  });

  it("duplicate database insert maps to the friendly conflict error", async () => {
    requireDb();
    const first = await createBlessBoardBranch(pool, {
      churchId: churchB.id,
      organizationId: orgB.id,
      branchKey: "race-name-1",
      displayName: "Race Name Campus",
    });
    assert.equal(first.ok, true, first.reason || first.message);

    await assert.rejects(
      async () => {
        await pool.query(
          `INSERT INTO blessboard.branches
             (church_id, branch_key, display_name, branch_type, status, is_primary)
           VALUES ($1, $2, $3, 'branch', 'active', false)`,
          [churchB.id, "race-name-2", "race   name campus"]
        );
      },
      (err) => {
        assert.equal(String(err.code), "23505");
        assert.equal(isUniqueBranchDisplayNameViolation(err), true);
        return true;
      }
    );

    const mapped = await createBlessBoardBranch(pool, {
      churchId: churchB.id,
      organizationId: orgB.id,
      branchKey: "race-name-3",
      displayName: "RACE NAME CAMPUS",
    });
    assert.equal(mapped.ok, false);
    assert.equal(mapped.status, "conflict");
    assert.equal(mapped.reason, "duplicate_display_name");
    assert.equal(mapped.message, DUPLICATE_BRANCH_DISPLAY_NAME_MESSAGE);
    assert.doesNotMatch(mapped.message || "", /23505|branches_church|SQL|stack/i);
  });

  it("migration precheck detects existing live duplicates under church_id", async () => {
    requireDb();
    await pool.query(
      `DROP INDEX IF EXISTS blessboard.branches_church_display_name_normalized_live_uidx`
    );

    const churchId = churchA.id;
    await pool.query(
      `INSERT INTO blessboard.branches
         (church_id, branch_key, display_name, branch_type, status, is_primary)
       VALUES
         ($1, 'dup-precheck-1', 'Precheck Dup', 'branch', 'active', false),
         ($1, 'dup-precheck-2', 'precheck   dup', 'branch', 'active', false)`,
      [churchId]
    );

    const groups = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM (
           SELECT church_id, display_name_normalized
             FROM blessboard.branches
            WHERE status IN ('active', 'inactive', 'suspended')
              AND display_name_normalized IS NOT NULL
              AND display_name_normalized <> ''
            GROUP BY church_id, display_name_normalized
           HAVING COUNT(*) > 1
         ) d`
    );
    assert.ok(groups.rows[0].n >= 1);

    await assert.rejects(
      async () => {
        await pool.query(`
          DO $$
          DECLARE
            duplicate_groups INT;
            sample TEXT;
          BEGIN
            SELECT COUNT(*)::int INTO duplicate_groups
              FROM (
                SELECT church_id, display_name_normalized
                  FROM blessboard.branches
                 WHERE status IN ('active', 'inactive', 'suspended')
                   AND display_name_normalized IS NOT NULL
                   AND display_name_normalized <> ''
                 GROUP BY church_id, display_name_normalized
                HAVING COUNT(*) > 1
              ) d;
            IF duplicate_groups > 0 THEN
              SELECT string_agg(
                       format('church=%s name=%s count=%s', church_id, display_name_normalized, cnt),
                       '; '
                     )
                INTO sample
                FROM (
                  SELECT church_id, display_name_normalized, COUNT(*)::int AS cnt
                    FROM blessboard.branches
                   WHERE status IN ('active', 'inactive', 'suspended')
                     AND display_name_normalized IS NOT NULL
                     AND display_name_normalized <> ''
                   GROUP BY church_id, display_name_normalized
                  HAVING COUNT(*) > 1
                   ORDER BY COUNT(*) DESC
                   LIMIT 5
                ) s;
              RAISE EXCEPTION
                '029 branch display_name: % duplicate group(s) under church_id for live statuses (active|inactive|suspended). Resolve manually before applying unique index. Samples: %',
                duplicate_groups,
                COALESCE(sample, '(none)')
                USING ERRCODE = 'integrity_constraint_violation';
            END IF;
          END $$;
        `);
      },
      (err) => {
        assert.match(String(err.message), /029 branch display_name.*duplicate group/i);
        assert.match(String(err.message), /precheck dup/i);
        return true;
      }
    );

    await pool.query(
      `DELETE FROM blessboard.branches
        WHERE church_id = $1 AND branch_key IN ('dup-precheck-1', 'dup-precheck-2')`,
      [churchId]
    );
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS branches_church_display_name_normalized_live_uidx
        ON blessboard.branches (church_id, display_name_normalized)
        WHERE status IN ('active', 'inactive', 'suspended')
          AND display_name_normalized IS NOT NULL
          AND display_name_normalized <> ''
    `);
  });

  it("organization display names remain non-unique globally", async () => {
    requireDb();
    const names = await pool.query(
      `SELECT display_name, COUNT(*)::int AS n
         FROM platform.organizations
        WHERE display_name = 'Shared Org Display Name'
        GROUP BY display_name`
    );
    assert.equal(names.rowCount, 1);
    assert.ok(names.rows[0].n >= 2);

    const constraints = await pool.query(
      `SELECT c.conname, pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'platform'
          AND t.relname = 'organizations'
          AND c.contype = 'u'`
    );
    for (const row of constraints.rows) {
      assert.doesNotMatch(String(row.def), /display_name/i);
    }

    const indexes = await pool.query(
      `SELECT indexname, indexdef
         FROM pg_indexes
        WHERE schemaname = 'platform' AND tablename = 'organizations'`
    );
    for (const row of indexes.rows) {
      if (/UNIQUE/i.test(row.indexdef) && /display_name/i.test(row.indexdef)) {
        assert.fail(`unexpected unique org display_name index: ${row.indexname}`);
      }
    }
  });

  it("empty-database migration 029 is present and idempotent on re-run", async () => {
    requireDb();
    const sqlPath = path.join(
      ROOT,
      "db/migrations/blessboard/029_branch_display_name_normalized.sql"
    );
    assert.equal(fs.existsSync(sqlPath), true);
    const sql = fs.readFileSync(sqlPath, "utf8");
    await pool.query(sql);
    const idx = await pool.query(
      `SELECT 1
         FROM pg_indexes
        WHERE schemaname = 'blessboard'
          AND indexname = 'branches_church_display_name_normalized_live_uidx'`
    );
    assert.equal(idx.rowCount, 1);
  });
});
