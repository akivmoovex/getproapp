"use strict";

/**
 * Integration: POST /field-agent/add-contact/submit accepts submission with no uploaded files.
 * Skips when PostgreSQL is not configured.
 */

const path = require("path");
const express = require("express");
const session = require("express-session");
const request = require("supertest");

const test = require("node:test");
const assert = require("node:assert/strict");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const fieldAgentRoutes = require("../src/routes/fieldAgent");
const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const { setFieldAgentSession } = require("../src/auth/fieldAgentAuth");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

function makePhoneNorm() {
  const tail = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  return `26097${tail}`;
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

test(
  "field-agent add-contact submit: no profile or work photos returns 302 and persists row",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const phoneNorm = makePhoneNorm();
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ac_${Date.now()}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });

    const app = createTestApp(agentId);

    const res = await request(app)
      .post("/field-agent/add-contact/submit")
      .field("phone", `+${phoneNorm}`)
      .field("whatsapp", "")
      .field("first_name", "No")
      .field("last_name", "Files")
      .field("profession", "Electrician")
      .field("pacra", "")
      .field("address_street", "")
      .field("address_landmarks", "")
      .field("address_neighbourhood", "")
      .field("address_city", "Lusaka")
      .field("nrc_number", "123456/78/9")
      .redirects(0);

    assert.equal(res.status, 302);
    assert.match(res.headers.location || "", /field-agent\/dashboard/);

    const r = await pool.query(
      `SELECT id, city, address_city, photo_profile_url, work_photos_json
       FROM public.field_agent_provider_submissions
       WHERE field_agent_id = $1
       ORDER BY id DESC LIMIT 1`,
      [agentId]
    );
    assert.equal(r.rows.length, 1);
    const row = r.rows[0];
    const subId = row.id;
    assert.equal(row.city, "Lusaka");
    assert.equal(row.address_city, "Lusaka");
    assert.equal(row.photo_profile_url, "");
    assert.equal(row.work_photos_json, "[]");

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);
