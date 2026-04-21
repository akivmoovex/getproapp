"use strict";

/**
 * Field Agent console: protected static pages, phone check API, callback POST,
 * and auth flows (signup/login, dashboard access, tenant mismatch, deleted/disabled agent).
 * Static redirect tests run without PostgreSQL. DB-backed tests skip when PG is unavailable.
 */

const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const request = require("supertest");

const test = require("node:test");
const assert = require("node:assert/strict");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const fieldAgentRoutes = require("../src/routes/fieldAgent");
const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const fieldAgentSubmissionsRepo = require("../src/db/pg/fieldAgentSubmissionsRepo");
const { setFieldAgentSession } = require("../src/auth/fieldAgentAuth");
const { TENANT_ZM, TENANT_IL } = require("../src/tenants/tenantIds");

const SESSION_NAME = "fa_console_routes_sid";
const SESSION_SECRET = "field_agent_console_routes_test";

function stubViewLocals(req, res, next) {
  res.locals.asset = (key) => `/${String(key || "").replace(/^\//, "")}`;
  res.locals.brandProductName = "Pro-online";
  res.locals.brandPublicTagline = "Test tagline";
  res.locals.showUiGuard = false;
  res.locals.appVersion = "";
  next();
}

function baseSessionMiddleware() {
  return session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    name: SESSION_NAME,
  });
}

function tenantMiddleware(req, res, next) {
  req.tenant = { id: TENANT_ZM, slug: "zm", themeClass: "" };
  req.tenantUrlPrefix = "";
  next();
}

/** Field Agent routes with tenant + view stubs; optional session setter. */
function createApp({ fieldAgentId, sessionTenantId } = {}) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(baseSessionMiddleware());
  app.use(tenantMiddleware);
  app.use(stubViewLocals);
  if (fieldAgentId != null) {
    app.use((req, res, next) => {
      setFieldAgentSession(req, {
        id: fieldAgentId,
        tenantId: sessionTenantId != null ? sessionTenantId : TENANT_ZM,
        username: "fa_console_test",
        displayName: "",
      });
      next();
    });
  }
  app.use(fieldAgentRoutes());
  return app;
}

function makePhoneNorm() {
  const tail = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  return `26097${tail}`;
}

test("field-agent static pages: unauthenticated GET redirects to field-agent login", async () => {
  const paths = ["/field-agent/faq", "/field-agent/support", "/field-agent/about"];
  const app = createApp({});
  for (const p of paths) {
    const res = await request(app).get(p).redirects(0);
    assert.equal(res.status, 302, `expected 302 for ${p}`);
    assert.match(String(res.headers.location || ""), /field-agent\/login/, `login redirect for ${p}`);
  }
});

test("field-agent website-content: unauthenticated GET redirects to field-agent login", async () => {
  const app = createApp({});
  const res = await request(app).get("/field-agent/submissions/1/website-content").redirects(0);
  assert.equal(res.status, 302);
  assert.match(String(res.headers.location || ""), /field-agent\/login/);
});

test("field-agent website-content draft API: unauthenticated POST redirects to login", async () => {
  const app = createApp({});
  const res = await request(app)
    .post("/field-agent/api/submissions/1/website-content-draft")
    .set("Content-Type", "application/json")
    .send({ draft: { headline: "x" } })
    .redirects(0);
  assert.equal(res.status, 302);
  assert.match(String(res.headers.location || ""), /field-agent\/login/);
});

test(
  "field-agent static pages: authenticated active agent GET returns 200",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_static_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createApp({ fieldAgentId: agentId });
    try {
      for (const p of ["/field-agent/faq", "/field-agent/support", "/field-agent/about"]) {
        const res = await request(app).get(p).redirects(0);
        assert.equal(res.status, 200, `expected 200 for ${p}`);
        assert.match(res.text || "", /Field agent|Support|field agent program/i);
      }
    } finally {
      await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    }
  }
);

test("field-agent: tenant mismatch clears session and redirects to login", async () => {
  const app = createApp({ fieldAgentId: 1, sessionTenantId: TENANT_IL });
  const res = await request(app).get("/field-agent/faq").redirects(0);
  assert.equal(res.status, 302);
  assert.match(String(res.headers.location || ""), /field-agent\/login/);
});

test(
  "field-agent: deleted agent row redirects to login (session cleared for subsequent request)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_del_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createApp({ fieldAgentId: agentId });
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    const httpAgent = request.agent(app);
    const res1 = await httpAgent.get("/field-agent/faq").redirects(0);
    assert.equal(res1.status, 302);
    assert.match(String(res1.headers.location || ""), /field-agent\/login/);
    const res2 = await httpAgent.get("/field-agent/faq").redirects(0);
    assert.equal(res2.status, 302);
    assert.match(String(res2.headers.location || ""), /field-agent\/login/);
  }
);

test(
  "field-agent: disabled agent redirects to login",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_dis_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    await pool.query(`UPDATE public.field_agents SET enabled = false WHERE id = $1`, [agentId]);
    const app = createApp({ fieldAgentId: agentId });
    try {
      const res = await request(app).get("/field-agent/faq").redirects(0);
      assert.equal(res.status, 302);
      assert.match(String(res.headers.location || ""), /field-agent\/login/);
    } finally {
      await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    }
  }
);

test(
  "field-agent api check-phone: unauthenticated POST redirects to login",
  async () => {
    const app = createApp({});
    const res = await request(app)
      .post("/field-agent/api/check-phone")
      .set("Content-Type", "application/json")
      .send({ phone: "+2609711111111" })
      .redirects(0);
    assert.equal(res.status, 302);
    assert.match(String(res.headers.location || ""), /field-agent\/login/);
  }
);

test(
  "field-agent api check-phone: duplicate false when phone and whatsapp do not match pipeline",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_chk_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createApp({ fieldAgentId: agentId });
    const phone = `+${makePhoneNorm()}`;
    const wa = `+${makePhoneNorm()}`;
    const res = await request(app)
      .post("/field-agent/api/check-phone")
      .set("Content-Type", "application/json")
      .send({ phone, whatsapp: wa })
      .redirects(0);
    assert.equal(res.status, 200);
    const body = JSON.parse(res.text || "{}");
    assert.equal(body.ok, true);
    assert.equal(body.duplicate, false);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent api check-phone: duplicate true when pending submission exists for normalized phone",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_dup_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const pNorm = makePhoneNorm();
    const subId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId: TENANT_ZM,
      fieldAgentId: agentId,
      phoneRaw: pNorm,
      phoneNorm: pNorm,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "Dup",
      lastName: "Test",
      profession: "X",
      city: "Lusaka",
      pacra: "",
      addressStreet: "",
      addressLandmarks: "",
      addressNeighbourhood: "",
      addressCity: "Lusaka",
      nrcNumber: "N",
      photoProfileUrl: "",
      workPhotosJson: "[]",
    });

    const app = createApp({ fieldAgentId: agentId });
    const res = await request(app)
      .post("/field-agent/api/check-phone")
      .set("Content-Type", "application/json")
      .send({ phone: `+${pNorm}` })
      .redirects(0);
    assert.equal(res.status, 200);
    const body = JSON.parse(res.text || "{}");
    assert.equal(body.ok, true);
    assert.equal(body.duplicate, true);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent api check-phone: duplicate true when only whatsapp matches pending submission",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_dupwa_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    let pNorm = makePhoneNorm();
    let wNorm = makePhoneNorm();
    while (wNorm === pNorm) wNorm = makePhoneNorm();
    let pCheck = makePhoneNorm();
    while (pCheck === pNorm || pCheck === wNorm) pCheck = makePhoneNorm();
    const subId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId: TENANT_ZM,
      fieldAgentId: agentId,
      phoneRaw: pNorm,
      phoneNorm: pNorm,
      whatsappRaw: wNorm,
      whatsappNorm: wNorm,
      firstName: "Wa",
      lastName: "Dup",
      profession: "X",
      city: "Lusaka",
      pacra: "",
      addressStreet: "",
      addressLandmarks: "",
      addressNeighbourhood: "",
      addressCity: "Lusaka",
      nrcNumber: "N",
      photoProfileUrl: "",
      workPhotosJson: "[]",
    });

    const app = createApp({ fieldAgentId: agentId });
    const res = await request(app)
      .post("/field-agent/api/check-phone")
      .set("Content-Type", "application/json")
      .send({ phone: `+${pCheck}`, whatsapp: `+${wNorm}` })
      .redirects(0);
    assert.equal(res.status, 200);
    const body = JSON.parse(res.text || "{}");
    assert.equal(body.ok, true);
    assert.equal(body.duplicate, true);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent api check-phone: invalid phone returns 400 JSON",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_inv_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createApp({ fieldAgentId: agentId });
    const res = await request(app)
      .post("/field-agent/api/check-phone")
      .set("Content-Type", "application/json")
      .send({ phone: "no" })
      .redirects(0);
    assert.equal(res.status, 400);
    const body = JSON.parse(res.text || "{}");
    assert.equal(body.ok, false);
    assert.ok(body.error);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent api check-phone: invalid whatsapp returns 400 JSON when phone valid",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_wa_inv_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createApp({ fieldAgentId: agentId });
    const res = await request(app)
      .post("/field-agent/api/check-phone")
      .set("Content-Type", "application/json")
      .send({ phone: `+${makePhoneNorm()}`, whatsapp: "not-a-number" })
      .redirects(0);
    assert.equal(res.status, 400);
    const body = JSON.parse(res.text || "{}");
    assert.equal(body.ok, false);
    assert.ok(body.error);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent callback POST: stores lead and redirects to dashboard with callback=1",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_cb_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createApp({ fieldAgentId: agentId });
    const phone = `+${makePhoneNorm()}`;
    const res = await request(app)
      .post("/field-agent/call-me-back")
      .type("form")
      .send({
        first_name: "Cal",
        last_name: "Back",
        phone,
        email: "cb@example.com",
        location_city: "Lusaka",
      })
      .redirects(0);
    assert.equal(res.status, 302);
    const loc = String(res.headers.location || "");
    assert.match(loc, /field-agent\/dashboard/);
    assert.match(loc, /callback=1/);

    const q = await pool.query(
      `SELECT id, phone, email, location_city FROM public.field_agent_callback_leads
       WHERE field_agent_id = $1 ORDER BY id DESC LIMIT 1`,
      [agentId]
    );
    assert.equal(q.rows.length, 1);
    assert.equal(q.rows[0].email, "cb@example.com");
    assert.equal(String(q.rows[0].location_city || "").trim(), "Lusaka");

    await pool.query(`DELETE FROM public.field_agent_callback_leads WHERE id = $1`, [q.rows[0].id]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent callback POST: invalid phone returns 400 (validation preserved)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_cb_bad_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createApp({ fieldAgentId: agentId });
    const res = await request(app)
      .post("/field-agent/call-me-back")
      .type("form")
      .send({
        first_name: "X",
        last_name: "Y",
        phone: "bad",
        email: "x@example.com",
        location_city: "City",
      })
      .redirects(0);
    assert.equal(res.status, 400);
    assert.match(res.text || "", /admin-gate-error|Invalid/i);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent callback POST: invalid email returns 400 (server-side)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_cb_bad_email_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createApp({ fieldAgentId: agentId });
    const phone = `+${makePhoneNorm()}`;
    const res = await request(app)
      .post("/field-agent/call-me-back")
      .type("form")
      .send({
        first_name: "A",
        last_name: "B",
        phone,
        email: "not-an-email",
        location_city: "City",
      })
      .redirects(0);
    assert.equal(res.status, 400);
    assert.match(res.text || "", /admin-gate-error/);
    assert.match(res.text || "", /valid email/i);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent callback POST: empty email returns 400 (all fields required)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_cb_empty_email_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createApp({ fieldAgentId: agentId });
    const phone = `+${makePhoneNorm()}`;
    const res = await request(app)
      .post("/field-agent/call-me-back")
      .type("form")
      .send({
        first_name: "A",
        last_name: "B",
        phone,
        email: "",
        location_city: "City",
      })
      .redirects(0);
    assert.equal(res.status, 400);
    assert.match(res.text || "", /admin-gate-error/);
    assert.match(res.text || "", /All fields are required/i);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent callback POST: email trimmed; valid mixed-case address succeeds and persists trimmed",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_cb_trim_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createApp({ fieldAgentId: agentId });
    const phone = `+${makePhoneNorm()}`;
    const res = await request(app)
      .post("/field-agent/call-me-back")
      .type("form")
      .send({
        first_name: "Trim",
        last_name: "Mail",
        phone,
        email: "  Mixed.Case+tag@Example.Com  ",
        location_city: "Lusaka",
      })
      .redirects(0);
    assert.equal(res.status, 302);
    const q = await pool.query(
      `SELECT id, email FROM public.field_agent_callback_leads WHERE field_agent_id = $1 ORDER BY id DESC LIMIT 1`,
      [agentId]
    );
    assert.equal(q.rows.length, 1);
    assert.equal(q.rows[0].email, "Mixed.Case+tag@Example.Com");
    await pool.query(`DELETE FROM public.field_agent_callback_leads WHERE id = $1`, [q.rows[0].id]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent callback POST: email with space in local part returns 400 (server-side)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_cb_space_email_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createApp({ fieldAgentId: agentId });
    const phone = `+${makePhoneNorm()}`;
    const res = await request(app)
      .post("/field-agent/call-me-back")
      .type("form")
      .send({
        first_name: "A",
        last_name: "B",
        phone,
        email: "foo bar@example.com",
        location_city: "City",
      })
      .redirects(0);
    assert.equal(res.status, 400);
    assert.match(res.text || "", /admin-gate-error/);
    assert.match(res.text || "", /valid email/i);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

// --- Field-agent auth: HTTP signup/login + cookie session (end-to-end within test app) ---

test("field-agent GET /field-agent/dashboard: unauthenticated redirects to login", async () => {
  const app = createApp({});
  const res = await request(app).get("/field-agent/dashboard").redirects(0);
  assert.equal(res.status, 302);
  assert.match(String(res.headers.location || ""), /field-agent\/login/);
});

test(
  "field-agent signup POST: redirects to dashboard; session allows dashboard GET 200",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const username = `fa_signup_${Date.now()}`;
    const app = createApp({});
    const httpAgent = request.agent(app);
    const res = await httpAgent
      .post("/field-agent/signup")
      .type("form")
      .send({ username, password: "pass1234", display_name: "Sign Up Test" })
      .redirects(0);
    assert.equal(res.status, 302);
    assert.match(String(res.headers.location || ""), /field-agent\/dashboard/);
    const dash = await httpAgent.get("/field-agent/dashboard").redirects(0);
    assert.equal(dash.status, 200);
    assert.match(dash.text || "", /Field agent dashboard/i);
    await pool.query(`DELETE FROM public.field_agents WHERE tenant_id = $1 AND lower(username) = lower($2)`, [
      TENANT_ZM,
      username,
    ]);
  }
);

test(
  "field-agent login POST: valid credentials redirect to dashboard; dashboard GET 200",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const username = `fa_login_${Date.now()}`;
    const password = "loginpass1234";
    const hash = await bcrypt.hash(password, 12);
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username,
      passwordHash: hash,
      displayName: "Login Test",
      phone: "",
    });
    try {
      const app = createApp({});
      const httpAgent = request.agent(app);
      const res = await httpAgent
        .post("/field-agent/login")
        .type("form")
        .send({ username, password })
        .redirects(0);
      assert.equal(res.status, 302);
      assert.match(String(res.headers.location || ""), /field-agent\/dashboard/);
      const dash = await httpAgent.get("/field-agent/dashboard").redirects(0);
      assert.equal(dash.status, 200);
      assert.match(dash.text || "", /Field agent dashboard/i);
    } finally {
      await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    }
  }
);
