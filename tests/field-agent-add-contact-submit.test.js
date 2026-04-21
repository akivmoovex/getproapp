"use strict";

/**
 * Integration: POST /field-agent/add-contact/submit image rules (1 profile, 2–10 work JPEGs via sharp).
 * Skips when PostgreSQL is not configured.
 */

const path = require("path");
const express = require("express");
const session = require("express-session");
const request = require("supertest");
const sharp = require("sharp");

const test = require("node:test");
const assert = require("node:assert/strict");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const fieldAgentRoutes = require("../src/routes/fieldAgent");
const fieldAgentCrm = require("../src/fieldAgent/fieldAgentCrm");
const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const { setFieldAgentSession } = require("../src/auth/fieldAgentAuth");
const { TENANT_ZM, TENANT_IL } = require("../src/tenants/tenantIds");

function makePhoneNorm() {
  const tail = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  return `26097${tail}`;
}

async function tinyJpegBuffer() {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 200, b: 200 } },
  })
    .jpeg()
    .toBuffer();
}

function createTestApp(fieldAgentId) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "field_agent_add_contact_submit_test",
      resave: false,
      saveUninitialized: true,
      name: "fa_ac_submit_sid",
    })
  );
  app.use((req, res, next) => {
    req.tenant = { id: TENANT_ZM, slug: "zm" };
    req.tenantUrlPrefix = "";
    next();
  });
  app.use((req, res, next) => {
    setFieldAgentSession(req, {
      id: fieldAgentId,
      tenantId: TENANT_ZM,
      username: "fa_submit_test",
      displayName: "",
    });
    next();
  });
  app.use(fieldAgentRoutes());
  return app;
}

function addCommonTextFields(req, phoneNorm) {
  return req
    .field("phone", `+${phoneNorm}`)
    .field("whatsapp", "")
    .field("first_name", "No")
    .field("last_name", "Files")
    .field("profession", "Electrician")
    .field("pacra", "PACRA-OK")
    .field("address_street", "123 Main St")
    .field("address_landmarks", "Near market")
    .field("address_neighbourhood", "CBD")
    .field("address_city", "Lusaka")
    .field("nrc_number", "123456/78/9");
}

test(
  "field-agent add-contact submit: 1 profile and 2 work photos returns 302 and persists URLs",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const phoneNorm = makePhoneNorm();
    const img = await tinyJpegBuffer();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ac_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });

    const app = createTestApp(agentId);

    const res = await addCommonTextFields(
      request(app).post("/field-agent/add-contact/submit"),
      phoneNorm
    )
      .attach("profile", img, "profile.jpg")
      .attach("works", img, "w1.jpg")
      .attach("works", img, "w2.jpg")
      .redirects(0);

    assert.equal(res.status, 302);
    assert.match(res.headers.location || "", /field-agent\/dashboard/);

    const r = await pool.query(
      `SELECT id, photo_profile_url, work_photos_json
       FROM public.field_agent_provider_submissions
       WHERE field_agent_id = $1
       ORDER BY id DESC LIMIT 1`,
      [agentId]
    );
    assert.equal(r.rows.length, 1);
    const row = r.rows[0];
    const subId = row.id;
    assert.match(String(row.photo_profile_url || ""), /^\/uploads\/field-agent\//);
    const works = JSON.parse(row.work_photos_json || "[]");
    assert.equal(Array.isArray(works), true);
    assert.equal(works.length, 2);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent add-contact submit: missing profile photo returns 400",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const phoneNorm = makePhoneNorm();
    const img = await tinyJpegBuffer();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ac_nop_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createTestApp(agentId);
    const res = await addCommonTextFields(request(app).post("/field-agent/add-contact/submit"), phoneNorm)
      .attach("works", img, "w1.jpg")
      .attach("works", img, "w2.jpg")
      .redirects(0);
    assert.equal(res.status, 400);
    assert.equal(res.text || "", "Please upload exactly one profile photo.");
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent add-contact submit: fewer than 2 work photos returns 400",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const phoneNorm = makePhoneNorm();
    const img = await tinyJpegBuffer();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ac_1w_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createTestApp(agentId);
    const res = await addCommonTextFields(request(app).post("/field-agent/add-contact/submit"), phoneNorm)
      .attach("profile", img, "profile.jpg")
      .attach("works", img, "w1.jpg")
      .redirects(0);
    assert.equal(res.status, 400);
    assert.equal(res.text || "", "Please upload at least 2 work photos.");
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent add-contact submit: more than 10 work photos returns 400",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const phoneNorm = makePhoneNorm();
    const img = await tinyJpegBuffer();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ac_11w_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createTestApp(agentId);
    let req = addCommonTextFields(request(app).post("/field-agent/add-contact/submit"), phoneNorm).attach(
      "profile",
      img,
      "profile.jpg"
    );
    for (let i = 0; i < 11; i++) {
      req = req.attach("works", img, `w${i}.jpg`);
    }
    const res = await req.redirects(0);
    assert.equal(res.status, 400);
    assert.equal(res.text || "", "Please upload at most 10 work photos.");
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent add-contact submit: session id with no field_agents row returns 401 (no FK insert)",
  { skip: !isPgConfigured() },
  async () => {
    const app = createTestApp(999999999);
    const res = await request(app)
      .post("/field-agent/add-contact/submit")
      .field("phone", "+2609712345678")
      .field("whatsapp", "")
      .field("first_name", "X")
      .field("last_name", "Y")
      .field("profession", "Z")
      .field("pacra", "")
      .field("address_street", "")
      .field("address_landmarks", "")
      .field("address_neighbourhood", "")
      .field("address_city", "Lusaka")
      .field("nrc_number", "123456/78/9")
      .redirects(0);

    assert.equal(res.status, 401);
    assert.equal(res.text || "", "Session expired. Please sign in again.");
  }
);

test(
  "field-agent add-contact submit: agent row for another tenant returns 401 (tenant isolation)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_IL,
      username: `fa_ac_il_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });

    const app = createTestApp(agentId);

    const res = await request(app)
      .post("/field-agent/add-contact/submit")
      .field("phone", "+2609712345678")
      .field("whatsapp", "")
      .field("first_name", "X")
      .field("last_name", "Y")
      .field("profession", "Z")
      .field("pacra", "P")
      .field("address_street", "S")
      .field("address_landmarks", "L")
      .field("address_neighbourhood", "N")
      .field("address_city", "Lusaka")
      .field("nrc_number", "123456/78/9")
      .redirects(0);

    assert.equal(res.status, 401);
    assert.equal(res.text || "", "Session expired. Please sign in again.");

    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent add-contact submit: missing PACRA returns 400 text",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const phoneNorm = makePhoneNorm();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ac_nopac_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createTestApp(agentId);
    const res = await request(app)
      .post("/field-agent/add-contact/submit")
      .field("phone", `+${phoneNorm}`)
      .field("whatsapp", "")
      .field("first_name", "A")
      .field("last_name", "B")
      .field("profession", "C")
      .field("pacra", "")
      .field("address_street", "St")
      .field("address_landmarks", "Lm")
      .field("address_neighbourhood", "Nb")
      .field("address_city", "Lusaka")
      .field("nrc_number", "123456/78/9")
      .redirects(0);
    assert.equal(res.status, 400);
    assert.equal(res.text || "", "Missing required fields.");
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent add-contact submit: missing street address returns 400 text",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const phoneNorm = makePhoneNorm();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ac_nost_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createTestApp(agentId);
    const res = await request(app)
      .post("/field-agent/add-contact/submit")
      .field("phone", `+${phoneNorm}`)
      .field("whatsapp", "")
      .field("first_name", "A")
      .field("last_name", "B")
      .field("profession", "C")
      .field("pacra", "P1")
      .field("address_street", "")
      .field("address_landmarks", "Lm")
      .field("address_neighbourhood", "Nb")
      .field("address_city", "Lusaka")
      .field("nrc_number", "123456/78/9")
      .redirects(0);
    assert.equal(res.status, 400);
    assert.equal(res.text || "", "Missing required fields.");
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent add-contact submit: CRM notify throws but submission still 302, row persisted, structured error log",
  { skip: !isPgConfigured() },
  async (t) => {
    t.mock.method(fieldAgentCrm, "notifyProviderSubmissionToCrm", async () => {
      throw new Error("CRM unavailable (test stub)");
    });
    const logs = [];
    const origErr = console.error;
    console.error = (...args) => {
      logs.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
    };
    const pool = getPgPool();
    const phoneNorm = makePhoneNorm();
    const img = await tinyJpegBuffer();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ac_crmfail_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    try {
      const app = createTestApp(agentId);
      const res = await addCommonTextFields(
        request(app).post("/field-agent/add-contact/submit"),
        phoneNorm
      )
        .attach("profile", img, "profile.jpg")
        .attach("works", img, "w1.jpg")
        .attach("works", img, "w2.jpg")
        .redirects(0);
      assert.equal(res.status, 302);
      assert.match(String(res.headers.location || ""), /field-agent\/dashboard/);
      const r = await pool.query(
        `SELECT id FROM public.field_agent_provider_submissions WHERE field_agent_id = $1 ORDER BY id DESC LIMIT 1`,
        [agentId]
      );
      assert.equal(r.rows.length, 1);
      const blob = logs.join("\n");
      assert.ok(blob.includes('"op":"field_agent_provider_submission"'));
      assert.ok(blob.includes('"severity":"error"'));
      assert.ok(blob.includes("CRM unavailable (test stub)"));
      await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [r.rows[0].id]);
    } finally {
      console.error = origErr;
      await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    }
  }
);
