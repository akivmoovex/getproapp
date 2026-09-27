"use strict";

/**
 * V10 DBCL04 — Canonical cleanup safety net (ephemeral local Postgres only).
 *
 * Asserts V10/V2.03 canonical behavior for surfaces DBCL03 marked actionable.
 * Does NOT mutate hosted QA/production. Does NOT remove compatibility code yet.
 *
 * Companion: entitlement seat counts retargeted to user_role_assignments
 * (canonical correctness; not a dual-write removal).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const authRepo = require("../src/blessboard/repositories/blessBoardAuthRepository");
const rbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");
const {
  listEffectivePermissions,
  authorize,
} = require("../src/blessboard/services/blessBoardRbacAuthorizationService");
const { listStaffAccess } = require("../src/blessboard/services/staffAccessService");
const {
  countStaffAccountsForOrganization,
  countUsersForOrganization,
} = require("../src/platform/repositories/entitlementRepository");
const { insertAuditEvent, listAuditEvents } = require("../src/platform/repositories/auditEventRepository");
const mediaService = require("../src/platform/website/mediaService");
const { provisionWebsiteInstance } = require("../src/platform/website/provisionService");
const {
  registerBlessBoardWebsiteTemplate,
  BLESSBOARD_TEMPLATE_ID,
  BLESSBOARD_TEMPLATE_VERSION,
} = require("../src/blessboard/website/blessboardChurchTemplate");
const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");
const { PROVIDER_DATABASE, PROVIDER_HOSTINGER } = require("../src/platform/media/hostingerMediaConfig");
const {
  toCanonicalLifecycle,
  LIFECYCLE,
  PRODUCT,
} = require("../src/platform/registration");
const {
  createCompareLegacyHostContext,
  comparePlatformAndLegacy,
} = require("../src/platform/http/compareLegacyHostContext");
const { makeResolvedTenantContext } = require("./helpers/blessboardV5Fixtures");

const IDENTITY_KEY = "moovex-platform-v7";
const PASSWORD = "Dbcl04-Canonical-Pass1!";
const ORG_KEY = "dbcl04-bb";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/** Fixtures that still INSERT into frozen blessboard.user_roles (retire before dual-read removal). */
const LEGACY_USER_ROLES_INSERT_FIXTURES = Object.freeze([
  "tests/v2-02-phase-a-user-roles-backfill.test.js",
]);

describe("V10 DBCL04 canonical cleanup baseline", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let org;
  let churchId;
  let branchId;
  let adminUser;
  let websiteInstance;
  let tenantContext;
  let hqBranch;

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ pool });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const platform = await provisionPlatformTenant(pool, {
        organizationKey: ORG_KEY,
        displayName: "DBCL04 Church",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: ORG_KEY,
        hostname: "dbcl04.blessboard.test",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      org = platform.records.organization;

      const church = await provisionBlessBoardChurch(pool, {
        organizationKey: ORG_KEY,
        churchKey: ORG_KEY,
        displayName: "DBCL04 Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });
      churchId = church.records.church.id;
      hqBranch = church.records.hqBranch || church.records.primaryBranch;
      branchId = hqBranch.id;

      adminUser = await createBlessBoardUser(pool, {
        email: "dbcl04-admin@example.test",
        password: PASSWORD,
        displayName: "DBCL04 Admin",
      });
      assert.equal(adminUser.ok, true, adminUser.message || "create user failed");

      const assigned = await assignBlessBoardRole(pool, {
        email: "dbcl04-admin@example.test",
        organizationKey: ORG_KEY,
        churchKey: ORG_KEY,
        roleKey: "organisation_administrator",
      });
      assert.equal(assigned.ok, true, JSON.stringify(assigned));

      tenantContext = makeResolvedTenantContext({
        organization: { id: org.id, organization_key: ORG_KEY },
        church: {
          id: churchId,
          church_key: ORG_KEY,
          display_name: "DBCL04 Church",
        },
        primaryBranch: hqBranch,
      });

      registerBlessBoardWebsiteTemplate();
      const provisioned = await provisionWebsiteInstance(pool, {
        organizationId: org.id,
        productCode: PRODUCT_CODE.BLESSBOARD,
        templateId: BLESSBOARD_TEMPLATE_ID,
        templateVersion: BLESSBOARD_TEMPLATE_VERSION,
        slug: ORG_KEY,
        actorIdentityId: null,
      });
      assert.equal(provisioned.ok, true, provisioned.code || "website provision failed");
      websiteInstance = provisioned.instance;
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  // —— 1. mediaService canonical columns ——
  describe("1 mediaService canonical website_media", () => {
    it("registers media with id, storage_provider, payload_bytes on fresh schema", async () => {
      requireDb();
      const registered = await mediaService.registerWebsiteMedia(pool, {
        organizationId: org.id,
        instanceId: websiteInstance.id,
        expectedProductCode: PRODUCT_CODE.BLESSBOARD,
        mediaKind: "image",
        buffer: TINY_PNG,
        originalFilename: "pixel.png",
        mimeType: "image/png",
        actorIdentityId: null,
        env: {
          DEPLOYMENT_ENV: "testing",
          PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
        },
      });
      assert.equal(registered.ok, true, registered.code || "register failed");
      assert.ok(registered.media && registered.media.id, "media.id required");
      assert.equal(registered.media.storageProvider, PROVIDER_DATABASE);

      const row = await pool.query(
        `SELECT id, storage_provider, payload_bytes IS NOT NULL AS has_payload,
                octet_length(payload_bytes) AS payload_len
           FROM platform.website_media WHERE id = $1`,
        [registered.media.id]
      );
      assert.equal(row.rowCount, 1);
      assert.equal(row.rows[0].storage_provider, PROVIDER_DATABASE);
      assert.equal(row.rows[0].has_payload, true);
      assert.ok(Number(row.rows[0].payload_len) > 0);
    });

    it("preserves Hostinger/service failure fallback path in source (not schema 42703)", () => {
      const src = fs.readFileSync(
        path.join(ROOT, "src/platform/website/mediaService.js"),
        "utf8"
      );
      assert.match(src, /PROVIDER_HOSTINGER/);
      assert.match(src, /PROVIDER_DATABASE/);
      // Service-failure cleanup still present
      assert.match(src, /orphan cleanup|deleteMedia/i);
    });
  });

  // —— 2. BlessBoard auth phone/preferred columns ——
  describe("2 blessBoardAuthRepository canonical phone columns", () => {
    it("SELECT includes phone_verified_at and preferred_* on fresh schema", async () => {
      requireDb();
      await pool.query(
        `UPDATE blessboard.users
            SET phone_normalized = $2,
                phone_display = $3,
                phone_country_code = 'ZM',
                phone_verified_at = now(),
                preferred_login_identifier = 'email',
                preferred_contact_channel = 'email'
          WHERE id = $1`,
        [adminUser.user.id, "+260970000004", "+260 97 0000004"]
      );
      const row = await authRepo.findUserById(pool, adminUser.user.id);
      assert.ok(row);
      assert.equal(row.phone_country_code, "ZM");
      assert.ok(row.phone_verified_at);
      assert.equal(row.preferred_login_identifier, "email");
      assert.equal(row.preferred_contact_channel, "email");
    });

    it("canonical columns exist (no optional-probe required for ceiling DBs)", async () => {
      requireDb();
      const cols = await pool.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'blessboard' AND table_name = 'users'
            AND column_name = ANY($1::text[])
          ORDER BY 1`,
        [[
          "phone_country_code",
          "phone_verified_at",
          "preferred_login_identifier",
          "preferred_contact_channel",
        ]]
      );
      assert.equal(cols.rowCount, 4);
    });
  });

  // —— 3. AC website_published ——
  describe("3 ActiveClinic website_published column", () => {
    it("healthcare_organizations.website_published exists on fresh migrate", async () => {
      requireDb();
      const cols = await pool.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'activeclinic'
            AND table_name = 'healthcare_organizations'
            AND column_name = 'website_published'`
      );
      assert.equal(cols.rowCount, 1);
    });
  });

  // —— 4. registration lifecycle canonical statuses ——
  describe("4 registration lifecycle canonical statuses", () => {
    it("maps canonical AC/BB statuses without requiring legacy enum values", () => {
      assert.equal(
        toCanonicalLifecycle(PRODUCT.ACTIVECLINIC, {
          status: LIFECYCLE.REVIEW_REQUIRED,
          provisioning_status: null,
        }),
        LIFECYCLE.REVIEW_REQUIRED
      );
      assert.equal(
        toCanonicalLifecycle(PRODUCT.ACTIVECLINIC, {
          status: LIFECYCLE.ACTIVE,
          provisioning_status: "provisioned",
        }),
        LIFECYCLE.ACTIVE
      );
      assert.equal(
        toCanonicalLifecycle(PRODUCT.ACTIVECLINIC, {
          status: LIFECYCLE.PROVISIONING,
          provisioning_status: "in_progress",
        }),
        LIFECYCLE.PROVISIONING
      );
      assert.equal(
        toCanonicalLifecycle(PRODUCT.BLESSBOARD, {
          application_status: LIFECYCLE.ACTIVE,
          provisioning_status: "provisioned",
          organization_id: org?.id || "00000000-0000-4000-8000-000000000099",
        }),
        LIFECYCLE.ACTIVE
      );
      assert.equal(
        toCanonicalLifecycle(PRODUCT.BLESSBOARD, {
          application_status: LIFECYCLE.REVIEW_REQUIRED,
        }),
        LIFECYCLE.REVIEW_REQUIRED
      );
      assert.equal(
        toCanonicalLifecycle(PRODUCT.BLESSBOARD, {
          application_status: LIFECYCLE.REJECTED,
        }),
        LIFECYCLE.REJECTED
      );
    });
  });

  // —— 5. BlessBoard RBAC catalogue ——
  describe("5 BlessBoard RBAC catalogue-only grants", () => {
    it("assignBlessBoardRole writes user_role_assignments and not user_roles", async () => {
      requireDb();
      const beforeRoles = await pool.query(
        `SELECT COUNT(*)::int AS n FROM blessboard.user_roles WHERE user_id = $1`,
        [adminUser.user.id]
      );
      assert.equal(beforeRoles.rows[0].n, 0);

      const assignments = await pool.query(
        `SELECT a.id, a.status, r.role_key
           FROM blessboard.user_role_assignments a
           JOIN blessboard.roles r ON r.id = a.role_id
          WHERE a.user_id = $1 AND a.status = 'active'`,
        [adminUser.user.id]
      );
      assert.ok(assignments.rowCount >= 1);
      assert.ok(
        assignments.rows.some((r) => r.role_key === "organisation_administrator")
      );
    });

    it("freeze trigger rejects INSERT into blessboard.user_roles", async () => {
      requireDb();
      await assert.rejects(
        () =>
          pool.query(
            `INSERT INTO blessboard.user_roles
               (user_id, organization_id, church_id, branch_id, role_key, status)
             VALUES ($1, $2, $3, NULL, 'church_hq_admin', 'active')`,
            [adminUser.user.id, org.id, churchId]
          ),
        /frozen|user_roles/i
      );
    });

    it("role status update via catalogue revoke works", async () => {
      requireDb();
      const staffEmail = `dbcl04-staff-${crypto.randomBytes(3).toString("hex")}@example.test`;
      const staff = await createBlessBoardUser(pool, {
        email: staffEmail,
        password: PASSWORD,
        displayName: "DBCL04 Staff",
      });
      assert.equal(staff.ok, true, staff.message);
      const granted = await assignBlessBoardRole(pool, {
        email: staffEmail,
        organizationKey: ORG_KEY,
        churchKey: ORG_KEY,
        branchKey: "hq",
        roleKey: "branch_administrator",
      });
      assert.equal(granted.ok, true, JSON.stringify(granted));

      const active = await pool.query(
        `SELECT a.id FROM blessboard.user_role_assignments a
          WHERE a.user_id = $1 AND a.status = 'active' LIMIT 1`,
        [staff.user.id]
      );
      assert.equal(active.rowCount, 1);
      await rbacRepo.revokeAssignment(pool, {
        assignmentId: active.rows[0].id,
        revokedByUserId: adminUser.user.id,
        revocationReason: "dbcl04_revoke",
      });
      const after = await pool.query(
        `SELECT status, revoked_at IS NOT NULL AS revoked
           FROM blessboard.user_role_assignments WHERE id = $1`,
        [active.rows[0].id]
      );
      assert.equal(after.rows[0].status, "revoked");
      assert.equal(after.rows[0].revoked, true);
    });

    it("staff access lists catalogue-assigned users", async () => {
      requireDb();
      const listed = await listStaffAccess(pool, {
        organizationId: org.id,
        churchId,
        actorUserId: adminUser.user.id,
        tenantContext,
      });
      assert.equal(listed.ok, true, JSON.stringify(listed));
      assert.ok(listed.users.some((u) => u.id === adminUser.user.id));
    });

    it("entitlement seat counts use catalogue assignments", async () => {
      requireDb();
      const staffSeats = await countStaffAccountsForOrganization(pool, org.id);
      const userSeats = await countUsersForOrganization(pool, org.id);
      assert.ok(staffSeats >= 1, `expected catalogue staff seats, got ${staffSeats}`);
      assert.ok(userSeats >= 1, `expected catalogue user seats, got ${userSeats}`);
    });

    it("catalogue permissions are non-empty for organisation_administrator", async () => {
      requireDb();
      const perms = await listEffectivePermissions(pool, {
        actor: { userId: adminUser.user.id },
        tenantContext,
        resourceContext: {
          organizationId: org.id,
          churchId,
          branchId: null,
        },
      });
      assert.equal(perms.ok, true, JSON.stringify(perms));
      assert.ok(perms.permissions.length > 0);
      const decision = await authorize(pool, {
        actor: { userId: adminUser.user.id },
        permission: "website.view",
        tenantContext,
        resourceContext: {
          organizationId: org.id,
          churchId,
          branchId: null,
        },
      });
      assert.equal(decision.allowed, true, JSON.stringify(decision));
    });

    it("HQ role admin writes catalogue assignments only (DBCL06)", () => {
      const hq = fs.readFileSync(
        path.join(ROOT, "src/blessboard/services/hqRoleManagementService.js"),
        "utf8"
      );
      assert.match(hq, /assignBlessBoardRole/);
      assert.match(hq, /revokeAssignment/);
      assert.doesNotMatch(hq, /insertRole\s*\(/);
      assert.doesNotMatch(hq, /updateRoleStatus\s*\(/);
      assert.doesNotMatch(hq, /INSERT\s+INTO\s+blessboard\.user_roles/i);
      const assign = fs.readFileSync(
        path.join(ROOT, "src/blessboard/services/assignBlessBoardRole.js"),
        "utf8"
      );
      assert.match(assign, /user_role_assignments/);
      assert.doesNotMatch(assign, /INSERT\s+INTO\s+blessboard\.user_roles/i);
      const authRepo = fs.readFileSync(
        path.join(ROOT, "src/blessboard/repositories/blessBoardAuthRepository.js"),
        "utf8"
      );
      assert.doesNotMatch(authRepo, /async function insertRole\b/);
      assert.doesNotMatch(authRepo, /async function updateRoleStatus\b/);
    });
  });

  // —— 6. audit facility_id / product_code ——
  describe("6 auditEventRepository canonical columns", () => {
    it("inserts and reads facility_id + product_code on fresh schema", async () => {
      requireDb();
      const facilityId = crypto.randomUUID();
      const inserted = await insertAuditEvent(pool, {
        deploymentCode: "blessboard-org-staging",
        organizationId: org.id,
        churchId,
        branchId,
        facilityId,
        productCode: "blessboard",
        actorUserId: adminUser.user.id,
        actionKey: "dbcl04.audit.probe",
        entityType: "organization",
        entityId: org.id,
        outcome: "success",
        metadata: { source: "dbcl04" },
      });
      assert.ok(inserted && inserted.id);
      assert.equal(inserted.facilityId, facilityId);
      assert.equal(inserted.productCode, "blessboard");

      const listed = await listAuditEvents(pool, {
        organizationId: org.id,
        facilityId,
        productCode: "blessboard",
        limit: 10,
      });
      assert.ok(Array.isArray(listed.events));
      assert.ok(
        listed.events.some((e) => e.id === inserted.id && e.facilityId === facilityId)
      );
    });
  });

  // —— 7. registration / admin schema paths ——
  describe("7 registration application tables present", () => {
    it("canonical registration tables exist", async () => {
      requireDb();
      const tables = await pool.query(
        `SELECT table_schema || '.' || table_name AS qname
           FROM information_schema.tables
          WHERE (table_schema, table_name) IN (
            ('blessboard', 'platform_church_registration_applications'),
            ('activeclinic', 'clinic_registration_applications')
          )
          ORDER BY 1`
      );
      assert.equal(tables.rowCount, 2);
    });
  });

  // —— 8. AC public schema startup ——
  describe("8 AC public schema startup", () => {
    it("canonical AC public objects exist on fresh migrate (DBCL08 D6 probe removed)", async () => {
      requireDb();
      const status = await pool.query(
        `SELECT
           EXISTS (
             SELECT 1 FROM information_schema.schemata WHERE schema_name = 'activeclinic'
           ) AS schema_exists,
           EXISTS (
             SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'activeclinic' AND table_name = 'healthcare_organizations'
           ) AS healthcare_organizations,
           EXISTS (
             SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'activeclinic' AND table_name = 'clinic_registration_applications'
           ) AS clinic_registration_applications,
           EXISTS (
             SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'activeclinic'
                AND table_name = 'healthcare_organizations'
                AND column_name = 'website_published'
           ) AS website_published`
      );
      const row = status.rows[0];
      assert.equal(row.schema_exists, true);
      assert.equal(row.healthcare_organizations, true);
      assert.equal(row.clinic_registration_applications, true);
      assert.equal(row.website_published, true);
    });
  });

  // —— 9. compareLegacyHostContext consumers ——
  describe("9 compareLegacyHostContext consumers", () => {
    it("module exports comparison helpers used by tests / server.legacy only", () => {
      assert.equal(typeof createCompareLegacyHostContext, "function");
      assert.equal(typeof comparePlatformAndLegacy, "function");
      const serverLegacy = fs.readFileSync(path.join(ROOT, "server.legacy.js"), "utf8");
      assert.match(serverLegacy, /createCompareLegacyHostContext/);
      const foundation = fs.readFileSync(
        path.join(ROOT, "src/platform/http/v5FoundationServer.js"),
        "utf8"
      );
      assert.doesNotMatch(foundation, /createCompareLegacyHostContext/);
    });

    it("documents test consumers that must be updated before module removal", () => {
      // DBCL09: KEEP — server.legacy.js remains ACTIVE unprofiled bootstrap consumer.
      const consumers = [
        "tests/platform-host-comparison.test.js",
        "tests/blessboard-catalogue-http-context.test.js",
        "tests/v5-logging-sensitive-data.test.js",
        "tests/platform-diagnostic-integration.test.js",
        "server.legacy.js",
      ];
      for (const rel of consumers) {
        assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`);
      }
    });
  });

  // —— Legacy fixtures inventory (characterization) ——
  describe("legacy fixtures inventory", () => {
    it("lists known user_roles INSERT fixtures for later retirement", () => {
      for (const rel of LEGACY_USER_ROLES_INSERT_FIXTURES) {
        const full = path.join(ROOT, rel);
        assert.ok(fs.existsSync(full), `missing fixture file ${rel}`);
        const text = fs.readFileSync(full, "utf8");
        assert.match(
          text,
          /INSERT\s+INTO\s+blessboard\.user_roles/i,
          `${rel} no longer inserts user_roles — update LEGACY_USER_ROLES_INSERT_FIXTURES`
        );
      }
    });
  });
});
