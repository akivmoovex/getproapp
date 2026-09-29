"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema, latestChurchSchemaMigration } = require("../src/db/pg/ensureChurchSchema");
const { ROLES } = require("../src/auth/roles");
const registerAdminChurchPlatformRoutes = require("../src/routes/admin/adminChurchPlatform");
const churchReleaseRegisterService = require("../src/services/church/churchReleaseRegisterService");
const {
  attachPlatformAdminCsrfLocals,
  requirePlatformAdminCsrfOnMutations,
} = require("../src/church/platformAdminCsrf");

const CSRF_FIELD = "_csrf";

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractCsrf(html) {
  const text = String(html || "");
  const m =
    text.match(new RegExp(`name="${CSRF_FIELD}"\\s+value="([^"]+)"`)) ||
    text.match(new RegExp(`name='${CSRF_FIELD}'\\s+value='([^']+)'`));
  return m ? m[1] : null;
}

function makeApp(role) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-release-register",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    if (role) {
      req.session.adminUser = {
        id: 77,
        username: "release-admin@example.com",
        email: "release-admin@example.com",
        display_name: "Release Admin",
        role,
      };
    }
    res.locals.adminUser = req.session.adminUser || null;
    res.locals.asset = (k) => `/${String(k || "").replace(/^\//, "")}`;
    next();
  });
  app.use(attachPlatformAdminCsrfLocals);
  app.use(requirePlatformAdminCsrfOnMutations);
  const router = express.Router();
  registerAdminChurchPlatformRoutes(router);
  app.use("/admin", router);
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

async function cleanupVersion(pool, version) {
  await pool.query(`DELETE FROM public.church_release_records WHERE application_version = $1`, [
    version,
  ]);
  await pool.query(
    `DELETE FROM public.church_audit_logs
     WHERE action IN ('platform_release_record_created', 'platform_release_record_updated')
       AND target_label = $1`,
    [version]
  );
}

test("canEditReleaseRegister is super_admin only; support may view", () => {
  assert.equal(churchReleaseRegisterService.canEditReleaseRegister(ROLES.SUPER_ADMIN), true);
  assert.equal(churchReleaseRegisterService.canEditReleaseRegister(ROLES.CSR), false);
  assert.equal(churchReleaseRegisterService.canViewReleaseRegister(ROLES.CSR), true);
  assert.equal(churchReleaseRegisterService.canViewReleaseRegister(ROLES.TENANT_VIEWER), false);
});

test("validateReleaseInput rejects missing migration and passed without evidence", () => {
  const missing = churchReleaseRegisterService.validateReleaseInput({
    application_version: "9.9.9-test",
    release_date: "2026-07-16",
    release_summary: "Summary",
    migrations_text: "999_does_not_exist.sql",
    test_status: "not_run",
    deployed_by: "Ops",
  });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join(" "), /Unknown migration/);

  const noEvidence = churchReleaseRegisterService.validateReleaseInput({
    application_version: "9.9.8-test",
    release_date: "2026-07-16",
    release_summary: "Summary",
    migrations_text: latestChurchSchemaMigration(),
    test_status: "passed",
    test_evidence: "",
    deployed_by: "Ops",
  });
  assert.equal(noEvidence.ok, false);
  assert.match(noEvidence.errors.join(" "), /evidence/i);
});

test("redactOperatorText strips secrets from release notes", () => {
  const redacted = churchReleaseRegisterService.redactOperatorText(
    "rollback with password=hunter2 and DATABASE_URL=postgres://u:p@h/db",
    500
  );
  assert.doesNotMatch(redacted, /hunter2/);
  assert.doesNotMatch(redacted, /postgres:\/\//);
  assert.match(redacted, /\[redacted/i);
});

test("release detail view shows rollback notes and never claims passed without evidence markup", () => {
  const raw = require("fs").readFileSync(
    path.join(__dirname, "../views/admin/church/release_detail.ejs"),
    "utf8"
  );
  assert.match(raw, /data-rollback-notes/);
  assert.match(raw, /Evidence missing — treat as unverified/);
  assert.match(raw, /Names only/);
  assert.doesNotMatch(raw, /password\s*=/i);
});

test(
  "release register: create, duplicate rejection, missing migration, unauthorised edit, safe display",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("rel");
    const version = `1.4.0-${suffix}`.slice(0, 64);
    const dupVersion = version;
    await cleanupVersion(pool, version);

    const actor = {
      id: 77,
      role: ROLES.SUPER_ADMIN,
      label: "Release Admin",
      username: "release-admin@example.com",
    };

    const created = await churchReleaseRegisterService.createReleaseRecord(
      pool,
      {
        application_version: version,
        release_date: "2026-07-16",
        release_summary: "Growth release notes for register.",
        migrations_text: latestChurchSchemaMigration(),
        rollback_notes: "Restore previous app revision; keep DB forward-only.",
        known_limitations: "Scheduled jobs still manual on staging.",
        package_features_text: "reports_scheduled",
        required_env_vars_text: "BLESSBOARD_BACKUP_STALE_DAYS",
        test_status: "passed",
        test_evidence: "tests/church-release-register.test.js CI run local",
        deployed_by: "Release Admin",
      },
      actor
    );
    assert.equal(created.applicationVersion, version);
    assert.ok(created.migrations.includes(latestChurchSchemaMigration()));
    assert.equal(created.testStatus, "passed");
    assert.ok(created.testEvidence);

    await assert.rejects(
      () =>
        churchReleaseRegisterService.createReleaseRecord(
          pool,
          {
            application_version: dupVersion,
            release_date: "2026-07-17",
            release_summary: "Duplicate",
            migrations_text: latestChurchSchemaMigration(),
            test_status: "not_run",
            deployed_by: "Release Admin",
          },
          actor
        ),
      (err) => err && err.code === "DUPLICATE_VERSION"
    );

    await assert.rejects(
      () =>
        churchReleaseRegisterService.createReleaseRecord(
          pool,
          {
            application_version: `bad-mig-${suffix}`.slice(0, 64),
            release_date: "2026-07-16",
            release_summary: "Bad migration",
            migrations_text: "000_not_a_real_migration.sql",
            test_status: "not_run",
            deployed_by: "Release Admin",
          },
          actor
        ),
      (err) => err && err.code === "VALIDATION" && /migration/i.test(err.message)
    );

    await assert.rejects(
      () =>
        churchReleaseRegisterService.createReleaseRecord(
          pool,
          {
            application_version: `csr-${suffix}`.slice(0, 64),
            release_date: "2026-07-16",
            release_summary: "Should fail",
            migrations_text: latestChurchSchemaMigration(),
            test_status: "not_run",
            deployed_by: "CSR",
          },
          { id: 88, role: ROLES.CSR, label: "Support" }
        ),
      (err) => err && err.code === "FORBIDDEN"
    );

    const appSuper = makeApp(ROLES.SUPER_ADMIN);
    const detail = await request(appSuper).get(`/admin/church/releases/${created.id}`).expect(200);
    assert.match(detail.text, /data-release-detail/);
    assert.match(detail.text, /data-rollback-notes/);
    assert.match(detail.text, /Restore previous app revision/);
    assert.match(detail.text, /BLESSBOARD_BACKUP_STALE_DAYS/);
    assert.doesNotMatch(detail.text, /postgres:\/\//i);
    assert.match(detail.text, /Passed \(evidence on file\)/);

    const appCsr = makeApp(ROLES.CSR);
    const listCsr = await request(appCsr).get("/admin/church/releases").expect(200);
    assert.match(listCsr.text, /Release register/);
    assert.doesNotMatch(listCsr.text, />Record release</);

    const formGet = await request(appCsr).get("/admin/church/releases/new").expect(403);
    assert.match(formGet.text, /authorised platform administrators/i);

    const csrfPage = await request(appSuper).get("/admin/church/releases/new").expect(200);
    const csrf = extractCsrf(csrfPage.text);
    assert.ok(csrf);
    const unauthPost = await request(appCsr)
      .post("/admin/church/releases")
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        application_version: `hack-${suffix}`.slice(0, 64),
        release_date: "2026-07-16",
        release_summary: "Nope",
        migrations_text: latestChurchSchemaMigration(),
        test_status: "not_run",
        deployed_by: "CSR",
      });
    assert.equal(unauthPost.status, 403);

    await cleanupVersion(pool, version);
  }
);
