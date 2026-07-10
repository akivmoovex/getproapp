"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const platformUsersRepo = require("../src/db/pg/church/platformUsersRepo");
const auditLogsRepo = require("../src/db/pg/church/auditLogsRepo");
const { parseAuditFilters } = require("../src/church/auditLogFormatting");
const blessboardAdminRoutes = require("../src/routes/blessboardAdmin");
const { ROLES } = require("../src/auth/roles");

function makeApp(role) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-platform-admin-console",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isBlessBoardApexHost = true;
    if (role) {
      req.session.adminUser = {
        id: 1,
        username: "super",
        display_name: "Super",
        role,
      };
    }
    next();
  });
  app.use("/admin", blessboardAdminRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

test("platform users normalizeListOpts clamps page and enums", () => {
  const opts = platformUsersRepo.normalizeListOpts({
    page: 0,
    limit: 999,
    account_type: "nope",
    status: "weird",
    q: "  akiv  ",
  });
  assert.equal(opts.page, 1);
  assert.equal(opts.limit, 50);
  assert.equal(opts.account_type, "all");
  assert.equal(opts.status, "all");
  assert.equal(opts.q, "akiv");
});

test("parseAuditFilters accepts organization_id for platform audit", () => {
  const parsed = parseAuditFilters({
    organization_id: "12",
    page: "2",
    q: "broadcast",
    actor_type: "hq_admin",
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.filters.organizationId, 12);
  assert.equal(parsed.filters.page, 2);
  assert.equal(parsed.filters.actorType, "hq_admin");
});

test("anonymous cannot access platform users/roles/audit", async () => {
  const app = makeApp(null);
  for (const p of ["/admin/church/users", "/admin/church/roles", "/admin/church/audit"]) {
    const res = await request(app).get(p).set("Host", "blessboard.com");
    assert.ok([302, 303].includes(res.status), `${p} should redirect`);
    assert.match(String(res.headers.location || ""), /login/i);
  }
});

test("non-super-admin cannot access platform users/roles/audit", async () => {
  const app = makeApp(ROLES.TENANT_MANAGER);
  for (const p of ["/admin/church/users", "/admin/church/roles", "/admin/church/audit"]) {
    const res = await request(app).get(p).set("Host", "blessboard.com");
    assert.equal(res.status, 403, `${p} should be forbidden`);
  }
});

test(
  "super-admin platform users/roles/audit screens render",
  { skip: !isPgConfigured() },
  async (t) => {
    const pool = getPgPool();
    try {
      await pool.query("SELECT 1");
    } catch (e) {
      t.skip(`PostgreSQL unreachable (${e.code || e.message})`);
      return;
    }
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const app = makeApp(ROLES.SUPER_ADMIN);
    const users = await request(app).get("/admin/church/users").set("Host", "blessboard.com");
    assert.equal(users.status, 200);
    assert.match(users.text, /Church users/);
    assert.doesNotMatch(users.text, /password_hash/i);
    assert.doesNotMatch(users.text, /reset_token/i);

    const roles = await request(app).get("/admin/church/roles").set("Host", "blessboard.com");
    assert.equal(roles.status, 200);
    assert.match(roles.text, /Roles reference/);
    assert.match(roles.text, /hq_admin/);
    assert.match(roles.text, /read-only/i);

    const audit = await request(app).get("/admin/church/audit").set("Host", "blessboard.com");
    assert.equal(audit.status, 200);
    assert.match(audit.text, /Platform audit log/);

    const missing = await request(app).get("/admin/church/audit/999999999").set("Host", "blessboard.com");
    assert.equal(missing.status, 404);

    const listed = await platformUsersRepo.listPlatformChurchAdmins(pool, { page: 1, limit: 5 });
    assert.ok(listed.totalPages >= 1);
    assert.ok(Array.isArray(listed.rows));
    for (const row of listed.rows) {
      assert.equal(Object.prototype.hasOwnProperty.call(row, "password_hash"), false);
    }

    const logs = await auditLogsRepo.listAuditLogsForPlatform(pool, { page: 1, limit: 5, offset: 0 });
    assert.ok(Array.isArray(logs));
  }
);
