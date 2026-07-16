"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema, latestChurchSchemaMigration } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const blessboardAdminRoutes = require("../src/routes/blessboardAdmin");
const { ROLES } = require("../src/auth/roles");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const {
  getBackupVerificationStatus,
  recordBackupVerification,
  recordRestorationTest,
  redactOperatorText,
} = require("../src/services/church/churchBackupVerificationService");

const CSRF_FIELD = "_csrf";
const STAGING_DOC = path.join(__dirname, "../docs/blessboard-staging-restoration-checklist.md");

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

function makePlatformApp(role) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-backup-verification",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isBlessBoardApexHost = true;
    if (role) {
      req.session.adminUser = {
        id: 91,
        username: "backup-admin@example.com",
        email: "backup-admin@example.com",
        display_name: "Backup Admin",
        role,
      };
    }
    next();
  });
  app.use("/admin", blessboardAdminRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

async function cleanupEvents(pool, evidencePrefix) {
  await pool.query(
    `DELETE FROM public.church_audit_logs
     WHERE action IN ('platform_backup_verification_recorded', 'platform_backup_restoration_test_recorded')
       AND (
         metadata_json::text LIKE $1
         OR target_label LIKE $1
       )`,
    [`%${evidencePrefix}%`]
  );
  await pool.query(
    `DELETE FROM public.church_backup_verification_events
     WHERE evidence_reference LIKE $1 OR notes LIKE $1 OR environment_label LIKE $1`,
    [`%${evidencePrefix}%`]
  );
}

test("redactOperatorText strips secrets and URIs", () => {
  const redacted = redactOperatorText(
    "password=hunter2 DATABASE_URL=postgres://u:p@host/db api_key=abc",
    500
  );
  assert.doesNotMatch(redacted, /hunter2/i);
  assert.doesNotMatch(redacted, /postgres:\/\//i);
  assert.doesNotMatch(redacted, /\babc\b/);
  assert.match(redacted, /\[redacted/i);
});

test("missing backup status warns and never invents success", async () => {
  const emptyPool = {
    query: async () => ({ rows: [] }),
  };
  const status = await getBackupVerificationStatus(emptyPool);
  assert.equal(status.available, true);
  assert.equal(status.status, "missing");
  assert.equal(status.health, "warning");
  assert.equal(status.lastSuccessfulBackupAt, null);
  assert.ok(status.warnings.some((w) => /No successful backup verification/i.test(w)));
});

test("successful status from recent attested backup row", async () => {
  const now = new Date();
  const pool = {
    query: async () => ({
      rows: [
        {
          id: 1,
          event_type: "backup_verified",
          outcome: "success",
          verified_at: now,
          recorded_at: now,
          recorded_by_label: "ops",
          environment_label: "production-provider-check",
          evidence_reference: "snap-1",
          notes: null,
        },
        {
          id: 2,
          event_type: "restoration_test",
          outcome: "success",
          verified_at: now,
          recorded_at: now,
          recorded_by_label: "ops",
          environment_label: "staging",
          evidence_reference: "ticket-1",
          notes: "ok",
        },
      ],
    }),
  };
  const status = await getBackupVerificationStatus(pool);
  assert.equal(status.status, "recorded");
  assert.equal(status.health, "ok");
  assert.ok(status.lastSuccessfulBackupAt);
  assert.ok(status.lastRestorationTestAt);
  assert.equal(status.lastRestorationTestOutcome, "success");
});

test("stale backup verification warns", async () => {
  const prevStale = process.env.BLESSBOARD_BACKUP_STALE_DAYS;
  process.env.BLESSBOARD_BACKUP_STALE_DAYS = "7";
  try {
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const pool = {
      query: async () => ({
        rows: [
          {
            id: 1,
            event_type: "backup_verified",
            outcome: "success",
            verified_at: old,
            recorded_at: old,
            recorded_by_label: "ops",
            environment_label: "production-provider-check",
            evidence_reference: "snap-old",
            notes: null,
          },
        ],
      }),
    };
    const status = await getBackupVerificationStatus(pool);
    assert.equal(status.status, "stale");
    assert.equal(status.health, "warning");
    assert.ok(status.warnings.some((w) => /stale/i.test(w)));
  } finally {
    if (prevStale === undefined) delete process.env.BLESSBOARD_BACKUP_STALE_DAYS;
    else process.env.BLESSBOARD_BACKUP_STALE_DAYS = prevStale;
  }
});

test(
  "successful backup verification persists and audits restoration test",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("bv_ok");
    await cleanupEvents(pool, suffix);

    await recordBackupVerification(pool, {
      outcome: "success",
      evidenceReference: `snap-${suffix}`,
      environmentLabel: `env-${suffix}`,
      notes: `Verified provider snapshot ${suffix}`,
      actorLabel: `tester-${suffix}`,
    });

    await recordRestorationTest(pool, {
      outcome: "success",
      environmentLabel: `staging-${suffix}`,
      evidenceReference: `ticket-${suffix}`,
      notes: `Staging restore OK ${suffix}`,
      actorLabel: `tester-${suffix}`,
    });

    const audit = await pool.query(
      `SELECT action, metadata_json::text AS meta
       FROM public.church_audit_logs
       WHERE action = 'platform_backup_restoration_test_recorded'
         AND metadata_json::text LIKE $1
       ORDER BY id DESC LIMIT 1`,
      [`%${suffix}%`]
    );
    assert.equal(audit.rows.length, 1);
    assert.doesNotMatch(audit.rows[0].meta || "", /password|postgres:\/\/|DATABASE_URL/i);

    await cleanupEvents(pool, suffix);
  }
);

test("successful backup verification requires evidence", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureChurchSchema(pool);
  await assert.rejects(
    () =>
      recordBackupVerification(pool, {
        outcome: "success",
        notes: "missing evidence",
      }),
    (err) => err && err.code === "VALIDATION"
  );
});

test("does not invent success without explicit outcome", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureChurchSchema(pool);
  await assert.rejects(
    () => recordBackupVerification(pool, { evidenceReference: "snap-x" }),
    (err) => err && err.code === "VALIDATION"
  );
});

test("unauthenticated cannot access diagnostics or record endpoints", async () => {
  const app = makePlatformApp(null);
  const getRes = await request(app).get("/admin/church/diagnostics").set("Host", "blessboard.com");
  assert.equal(getRes.status, 302);
  assert.match(String(getRes.headers.location || ""), /login/i);

  const postRes = await request(app)
    .post("/admin/church/diagnostics/backup-verification")
    .set("Host", "blessboard.com")
    .type("form")
    .send({ outcome: "success", evidence_reference: "x" });
  assert.equal(postRes.status, 302);
  assert.match(String(postRes.headers.location || ""), /login/i);
});

test("non-super-admin cannot access backup diagnostics recording", async () => {
  const app = makePlatformApp(ROLES.TENANT_MANAGER);
  const res = await request(app).get("/admin/church/diagnostics").set("Host", "blessboard.com");
  assert.equal(res.status, 403);

  const postRes = await request(app)
    .post("/admin/church/diagnostics/restoration-test")
    .set("Host", "blessboard.com")
    .type("form")
    .send({
      outcome: "success",
      environment_label: "staging",
      notes: "should fail auth",
    });
  assert.equal(postRes.status, 403);
});

test(
  "super admin diagnostics shows backup section without secrets",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("bv_ui");
    const hash = await bcrypt.hash("pw12345678", 12);
    const username = `bv_super_${suffix}`;
    const userId = await adminUsersRepo.insertUser(pool, {
      username,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: TENANT_ZM,
      displayName: "BV Super",
    });

    const app = express();
    app.set("view engine", "ejs");
    app.set("views", path.join(__dirname, "../views"));
    app.use(express.urlencoded({ extended: true }));
    app.use(
      session({
        secret: "test-backup-ui",
        resave: false,
        saveUninitialized: true,
      })
    );
    app.use((req, _res, next) => {
      req.isBlessBoardApexHost = true;
      next();
    });
    app.use("/admin", blessboardAdminRoutes());

    try {
      const agent = request.agent(app);
      await agent
        .post("/admin/login")
        .set("Host", "blessboard.com")
        .type("form")
        .send({ username, password: "pw12345678" });

      const page = await agent.get("/admin/church/diagnostics").set("Host", "blessboard.com");
      assert.equal(page.status, 200);
      assert.match(page.text, /Backup verification/i);
      assert.match(page.text, /Record restoration test/i);
      assert.match(page.text, /blessboard-staging-restoration-checklist/);
      assert.doesNotMatch(page.text, /postgres:\/\//i);
      assert.doesNotMatch(page.text, /DATABASE_URL\s*=/i);
      assert.doesNotMatch(page.text, /secretpass/i);

      const csrf = extractCsrf(page.text);
      assert.ok(csrf);

      const record = await agent
        .post("/admin/church/diagnostics/backup-verification")
        .set("Host", "blessboard.com")
        .type("form")
        .send({
          _csrf: csrf,
          outcome: "failed",
          evidence_reference: `check-${suffix}`,
          environment_label: `env-${suffix}`,
          notes: `failed check ${suffix} password=should-redact DATABASE_URL=postgres://u:p@h/db`,
        });
      assert.equal(record.status, 302);

      const stored = await pool.query(
        `SELECT notes, evidence_reference FROM public.church_backup_verification_events
         WHERE evidence_reference = $1 ORDER BY id DESC LIMIT 1`,
        [`check-${suffix}`]
      );
      assert.equal(stored.rows.length, 1);
      assert.doesNotMatch(stored.rows[0].notes || "", /should-redact/i);
      assert.doesNotMatch(stored.rows[0].notes || "", /postgres:\/\//i);
    } finally {
      await cleanupEvents(pool, suffix);
      await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
    }
  }
);

test("staging restoration checklist doc exists with command guidance", () => {
  const text = fs.readFileSync(STAGING_DOC, "utf8");
  assert.match(text, /staging restoration checklist/i);
  assert.match(text, /pg_restore|provider/i);
  assert.match(text, /record-church-backup-verification/);
  assert.match(text, /Do not restore over production/i);
});

test("latest church migration includes backup verification", () => {
  assert.equal(latestChurchSchemaMigration(), "108_church_backup_verification.sql");
});
