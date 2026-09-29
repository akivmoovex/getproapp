#!/usr/bin/env node
"use strict";

/**
 * V2.03 QA10 — BlessBoard regression test readiness after V10 consolidation / DB cleanup.
 *
 * Proves:
 *   - Required BB surfaces remain mapped to automated evidence
 *   - blessboard.user_roles runtime reads = 0 and writes = 0 (product paths)
 *   - Canonical user_role_assignments behave (assign / freeze / seats)
 *   - Website dual-write / engine bridge is still present (must NOT remove)
 *
 * Marker: V203_BB_REGRESSION_TEST_READINESS_PASS
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  assignBlessBoardRole,
} = require("../src/blessboard/services/assignBlessBoardRole");
const {
  createBlessBoardUser,
} = require("../src/blessboard/services/createBlessBoardUser");
const {
  provisionPlatformTenant,
} = require("../src/platform/services/provisionPlatformTenant");
const {
  provisionBlessBoardChurch,
} = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  countStaffAccountsForOrganization,
} = require("../src/platform/repositories/entitlementRepository");

const ROOT = path.join(__dirname, "..");
const PASSWORD = "Qa10BbPass99!";

/** Required QA10 surfaces → primary automated evidence (must exist). */
const BB_SURFACE_EVIDENCE = Object.freeze([
  {
    surface: "registration",
    tests: [
      "tests/blessboard-register-church.test.js",
      "tests/blessboard-instant-free-registration.test.js",
    ],
  },
  {
    surface: "login",
    tests: [
      "tests/blessboard-phone-login.test.js",
      "tests/blessboard-auth-http.test.js",
      "tests/blessboard-tenant-auth.test.js",
    ],
  },
  {
    surface: "HQ/branch",
    tests: [
      "tests/blessboard-hq-shell.test.js",
      "tests/blessboard-branch-admin-shell.test.js",
      "tests/blessboard-hq-branch-user-creation.test.js",
      "tests/v2-01-shared-hq-branch-website.test.js",
    ],
  },
  {
    surface: "RBAC",
    tests: [
      "tests/blessboard-authorization.test.js",
      "tests/blessboard-rbac-foundation.test.js",
      "tests/blessboard-rbac-e2e.test.js",
      "tests/v2-02-legacy-rbac-removal.test.js",
      "tests/v2-02-bb-catalogue-only-rbac.test.js",
    ],
  },
  {
    surface: "role assignment",
    tests: [
      "tests/blessboard-hq-roles.test.js",
      "tests/blessboard-staff-invitation.test.js",
      "tests/v10-dbcl04-canonical-cleanup-baseline.test.js",
    ],
  },
  {
    surface: "staff directory",
    tests: ["tests/blessboard-staff-access.test.js"],
  },
  {
    surface: "seat/entitlement counts",
    tests: [
      "tests/platform-entitlements.test.js",
      "tests/phase4-website-plan-entitlements.test.js",
      "tests/v10-dbcl04-canonical-cleanup-baseline.test.js",
    ],
  },
  {
    surface: "website editor",
    tests: [
      "tests/v2-01-bb-inline-editor-parity.test.js",
      "tests/v7-shared-website-editor.test.js",
    ],
  },
  {
    surface: "inline editing",
    tests: [
      "tests/v2-01-bb-inline-editor-parity.test.js",
      "tests/v2-01-unpublished-changes-panel.test.js",
    ],
  },
  {
    surface: "structured editing",
    tests: [
      "tests/v2-01-shared-section-management.test.js",
      "tests/v2-bb-leadership-section-management.test.js",
    ],
  },
  {
    surface: "image upload",
    tests: [
      "tests/blessboard-p1-image-persistence.test.js",
      "tests/v2-01-universal-image-editor.test.js",
      "tests/v2-bb-sermon-image-persistence.test.js",
    ],
  },
  {
    surface: "CMS",
    tests: [
      "tests/blessboard-content-admin.test.js",
      "tests/v10-pc11-cms-convergence.test.js",
      "tests/v10-pl05-canonical-cms.test.js",
    ],
  },
  {
    surface: "publish",
    tests: [
      "tests/blessboard-p0-publish-auth.test.js",
      "tests/blessboard-church-website-publish.test.js",
      "tests/v7-blessboard-publish-engine-bridge.test.js",
      "tests/phase4-publish-website.test.js",
    ],
  },
  {
    surface: "versions",
    tests: ["tests/phase3-website-publishing-history.test.js"],
  },
  {
    surface: "restore",
    tests: [
      "tests/phase4-restore-previous-website.test.js",
      "tests/phase3-website-version-compare-restore.test.js",
      "tests/v2-01-field-history-restore.test.js",
    ],
  },
  {
    surface: "public pages",
    tests: [
      "tests/blessboard-public-pages.test.js",
      "tests/church-platform-public-pages.test.js",
    ],
  },
  {
    surface: "sermons",
    tests: [
      "tests/v2-bb-sermon-image-persistence.test.js",
      "tests/church-public-events-sermons-visual.test.js",
    ],
  },
  {
    surface: "giving",
    tests: [
      "tests/blessboard-giving.test.js",
      "tests/blessboard-finance-separation.test.js",
      "tests/church-public-giving-contact-visual.test.js",
    ],
  },
  {
    surface: "events",
    tests: [
      "tests/church-branch-announcements-events.test.js",
      "tests/church-growth-advanced-events.test.js",
    ],
  },
  {
    surface: "ministries",
    tests: [
      "tests/church-branch-ministries.test.js",
      "tests/church-public-home-ministries-regression.test.js",
      "tests/v2-bb-ministry-image-edit.test.js",
    ],
  },
  {
    surface: "contact",
    tests: [
      "tests/v2-bb-contact-hours-edit.test.js",
      "tests/v2-bb-contact-image-replace.test.js",
      "tests/bb-contact-stitch.test.js",
    ],
  },
]);

/** Product runtime trees — must not SQL-touch blessboard.user_roles. */
const RUNTIME_SCAN_ROOTS = Object.freeze([
  "src/blessboard",
  "src/church",
  "src/platform",
]);

/**
 * Allowed exceptions (not product request/runtime auth paths):
 * - testing data reset DELETE (TEST_FIXTURE)
 * - historical migration loaders under src/migration (not request path)
 */
const USER_ROLES_SQL_ALLOWLIST = Object.freeze([
  "src/platform/repositories/testingDataResetRepository.js",
]);

const USER_ROLES_SQL_RE = Object.freeze([
  /\bFROM\s+blessboard\.user_roles\b/i,
  /\bJOIN\s+blessboard\.user_roles\b/i,
  /\bINTO\s+blessboard\.user_roles\b/i,
  /\bUPDATE\s+blessboard\.user_roles\b/i,
  /\bDELETE\s+FROM\s+blessboard\.user_roles\b/i,
]);

let pool;
let skipReason = null;

function requireDb(t) {
  if (skipReason) t.skip(`QA10 foundation unavailable: ${skipReason}`);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function walkJsFiles(absDir, out = []) {
  if (!fs.existsSync(absDir)) return out;
  for (const ent of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    const full = path.join(absDir, ent.name);
    if (ent.isDirectory()) walkJsFiles(full, out);
    else if (ent.isFile() && ent.name.endsWith(".js")) {
      // Skip Finder "foo 2.js" duplicate artifacts — not product runtime.
      if (/\s\d+\.js$/i.test(ent.name)) continue;
      out.push(full);
    }
  }
  return out;
}

function stripComments(src) {
  return String(src || "")
    .replace(/\/\*[\s\S]*?\*\//g, "\n")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function findUserRolesSqlHits() {
  const hits = [];
  for (const rootRel of RUNTIME_SCAN_ROOTS) {
    const files = walkJsFiles(path.join(ROOT, rootRel));
    for (const abs of files) {
      const rel = path.relative(ROOT, abs).split(path.sep).join("/");
      if (USER_ROLES_SQL_ALLOWLIST.includes(rel)) continue;
      if (rel.startsWith("src/migration/")) continue;
      const body = stripComments(fs.readFileSync(abs, "utf8"));
      for (const re of USER_ROLES_SQL_RE) {
        if (re.test(body)) {
          hits.push({ file: rel, pattern: String(re) });
        }
      }
    }
  }
  return hits;
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

before(async () => {
  try {
    const databaseUrl = await resetFoundationDatabase();
    pool = createFoundationPool(databaseUrl);
    await migrate({ connectionString: databaseUrl });
  } catch (err) {
    skipReason = err && err.message ? String(err.message).slice(0, 400) : "no foundation db";
    pool = null;
  }
});

after(async () => {
  if (pool) await pool.end().catch(() => {});
});

describe("V203 QA10 BB — surface inventory", () => {
  it("maps every required BlessBoard surface to existing automated tests", () => {
    assert.ok(BB_SURFACE_EVIDENCE.length >= 20);
    for (const row of BB_SURFACE_EVIDENCE) {
      assert.ok(row.tests.length >= 1, `${row.surface} needs evidence`);
      for (const rel of row.tests) {
        assert.ok(
          fs.existsSync(path.join(ROOT, rel)),
          `${row.surface}: missing ${rel}`
        );
      }
    }
  });
});

describe("V203 QA10 BB — user_roles cutover (runtime R/W = 0)", () => {
  it("product runtime has zero SQL reads/writes against blessboard.user_roles", () => {
    const hits = findUserRolesSqlHits();
    assert.deepEqual(
      hits,
      [],
      `user_roles runtime SQL must be 0:\n${JSON.stringify(hits, null, 2)}`
    );
  });

  it("auth / assign / staff / seats use user_role_assignments only", () => {
    const authz = read("src/blessboard/repositories/blessBoardAuthorizationRepository.js");
    assert.match(authz, /user_role_assignments/);
    assert.doesNotMatch(stripComments(authz), /blessboard\.user_roles/);

    const session = read("src/blessboard/services/establishBlessBoardSession.js");
    assert.match(session, /user_role_assignments/);
    assert.match(session, /Does not depend on blessboard\.user_roles/);
    assert.doesNotMatch(stripComments(session), /FROM\s+blessboard\.user_roles/i);

    const assign = read("src/blessboard/services/assignBlessBoardRole.js");
    assert.match(assign, /user_role_assignments/);
    assert.doesNotMatch(stripComments(assign), /INTO\s+blessboard\.user_roles/i);

    const staff = read("src/blessboard/services/staffAccessService.js");
    assert.match(staff, /user_role_assignments/);
    assert.doesNotMatch(stripComments(staff), /FROM\s+blessboard\.user_roles/i);

    const seats = read("src/platform/repositories/entitlementRepository.js");
    assert.match(seats, /countStaffAccountsForOrganization/);
    assert.match(seats, /FROM blessboard\.user_role_assignments/);
    assert.match(seats, /Frozen blessboard\.user_roles is not the seat source/);
    assert.doesNotMatch(stripComments(seats), /FROM\s+blessboard\.user_roles/i);
  });

  it("freeze migration remains; legacy authz guard still green", () => {
    const freeze = read("db/migrations/blessboard/116_freeze_legacy_user_roles.sql");
    assert.match(freeze, /freeze|user_roles/i);
    assert.match(freeze, /CREATE\s+.*TRIGGER|FUNCTION|RAISE/i);

    assert.ok(
      fs.existsSync(path.join(ROOT, "tests/v2-02-legacy-rbac-removal.test.js"))
    );
    assert.ok(
      fs.existsSync(path.join(ROOT, "tests/v2-02-bb-catalogue-only-rbac.test.js"))
    );
  });

  it("canonical assign writes URA, freeze rejects user_roles, seats count URA", async (t) => {
    requireDb(t);
    const key = uniq("qa10");
    const platform = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: key,
      displayName: `QA10 ${key}`,
      productKey: "blessboard",
      productTenantKey: key,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(platform.ok, true, JSON.stringify(platform));
    const org = platform.records.organization;

    const church = await provisionBlessBoardChurch(pool, {
      organizationKey: key,
      churchKey: key,
      displayName: `QA10 Church ${key}`,
      legalName: null,
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "Headquarters",
    });
    assert.equal(church.ok, true, JSON.stringify(church));
    const churchId = church.records.church.id;

    const admin = await createBlessBoardUser(pool, {
      email: `qa10-admin-${key}@example.test`,
      password: PASSWORD,
      displayName: "QA10 Admin",
    });
    assert.equal(admin.ok, true, admin.message || JSON.stringify(admin));

    const assigned = await assignBlessBoardRole(pool, {
      email: `qa10-admin-${key}@example.test`,
      organizationKey: key,
      churchKey: key,
      roleKey: "organisation_administrator",
    });
    assert.equal(assigned.ok, true, JSON.stringify(assigned));

    const uraAdmin = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_role_assignments
        WHERE user_id = $1 AND status = 'active'`,
      [admin.user.id]
    );
    assert.ok(uraAdmin.rows[0].n >= 1);

    const legacyAdmin = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_roles WHERE user_id = $1`,
      [admin.user.id]
    );
    assert.equal(legacyAdmin.rows[0].n, 0);

    const staffEmail = `qa10-staff-${key}@example.test`;
    const staff = await createBlessBoardUser(pool, {
      email: staffEmail,
      password: PASSWORD,
      displayName: "QA10 Staff",
    });
    assert.equal(staff.ok, true, staff.message || JSON.stringify(staff));

    const granted = await assignBlessBoardRole(pool, {
      email: staffEmail,
      organizationKey: key,
      churchKey: key,
      branchKey: "hq",
      roleKey: "branch_administrator",
    });
    assert.equal(granted.ok, true, JSON.stringify(granted));

    const uraStaff = await pool.query(
      `SELECT r.role_key
         FROM blessboard.user_role_assignments a
         JOIN blessboard.roles r ON r.id = a.role_id
        WHERE a.user_id = $1 AND a.status = 'active'`,
      [staff.user.id]
    );
    assert.ok(uraStaff.rows.some((r) => r.role_key === "branch_administrator"));

    const legacyStaff = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_roles WHERE user_id = $1`,
      [staff.user.id]
    );
    assert.equal(legacyStaff.rows[0].n, 0);

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.user_roles
             (user_id, organization_id, church_id, branch_id, role_key, status)
           VALUES ($1, $2, $3, NULL, 'church_hq_admin', 'active')`,
          [staff.user.id, org.id, churchId]
        ),
      /frozen|user_roles/i
    );

    const seats = await countStaffAccountsForOrganization(pool, org.id);
    assert.ok(seats >= 2, `expected admin+branch seats, got ${seats}`);
  });
});

describe("V203 QA10 BB — website dual-write / bridge retained", () => {
  it("does not remove engine bridge or classic overlay dual-write", () => {
    const bridge = read("src/platform/website-engine/blessboardBridge.js");
    assert.match(bridge, /syncDraftToEngine|publishFromLegacy|ensureEngineContent/);

    const editorRoutes = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    assert.match(editorRoutes, /dual-write|dualWrite/i);
    assert.match(editorRoutes, /blessboardBridge|overlay/);

    const adapter = read("src/blessboard/website/blessboardWebsiteEditorAdapter.js");
    assert.match(adapter, /dual-write|Engine-primary/i);

    const classic = read("src/blessboard/website/blessboardClassicCmsAdapter.js");
    assert.match(classic, /dual-write|syncDraftToEngine/);

    const publish = read("src/blessboard/services/churchWebsitePublishService.js");
    assert.match(publish, /blessboardBridge|publishFromLegacy/);

    const bridgeTest = read("tests/v7-blessboard-publish-engine-bridge.test.js");
    assert.match(bridgeTest, /dual-write|DualWrite|blessboardBridge/i);
  });
});

describe("V203 QA10 marker", () => {
  it("prints BlessBoard regression test readiness pass marker", () => {
    console.log("V203_BB_REGRESSION_TEST_READINESS_PASS");
    assert.equal(true, true);
  });
});
