"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const request = require("supertest");

const test = require("node:test");
const assert = require("node:assert/strict");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const registerAdminFieldAgentAnalyticsRoutes = require("../src/routes/admin/adminFieldAgentAnalytics");
const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const { TENANT_ZM, TENANT_IL } = require("../src/tenants/tenantIds");
const { ROLES } = require("../src/auth/roles");

function createApp(tenantId, role = ROLES.TENANT_MANAGER) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.json());
  app.use(
    session({
      secret: "admin_fa_analytics_reporting_center_test",
      resave: false,
      saveUninitialized: true,
      name: "adm_faa_reporting_sid",
    })
  );
  app.use((req, res, next) => {
    req.session.adminUser = {
      id: 1,
      role,
      tenantId,
    };
    res.locals.asset = () => "/styles.css";
    res.locals.bodyEmbedClass = "";
    res.locals.embed = false;
    next();
  });
  const router = express.Router();
  registerAdminFieldAgentAnalyticsRoutes(router);
  app.use("/admin", router);
  return app;
}

function stripBom(s) {
  return String(s || "").replace(/^\uFEFF/, "");
}

test(
  "reporting center route requires CRM permission",
  { skip: !isPgConfigured() },
  async () => {
    const app = createApp(TENANT_ZM, ROLES.TENANT_VIEWER);
    await request(app).get("/admin/field-agent-analytics/reporting").expect(403);
  }
);

test(
  "reporting center page renders supported dataset buckets",
  { skip: !isPgConfigured() },
  async () => {
    const app = createApp(TENANT_ZM);
    const res = await request(app).get("/admin/field-agent-analytics/reporting").expect(200);
    const html = String(res.text || "");
    [
      "total_submissions",
      "pending",
      "info_needed",
      "approved",
      "rejected",
      "appealed",
      "approval_rate_decided",
      "share_approved_all",
      "total_commission_approved",
      "avg_commission_approved",
      "callback_leads",
    ].forEach((bucket) => assert.ok(html.includes(`value="${bucket}"`)));
  }
);

test(
  "reporting export delegates filters and preserves tenant scope",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const app = createApp(TENANT_ZM);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faZm = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_rep_zm_${tag}`,
      passwordHash: "x",
      displayName: "Rep ZM",
      phone: "",
    });
    const faIl = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_IL,
      username: `fa_rep_il_${tag}`,
      passwordHash: "x",
      displayName: "Rep IL",
      phone: "",
    });
    const sZm = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'RepFind', 'ZM', 'Plumber', 'Lusaka', '8111', '8111', '', '', '', '', '', '', '', '', '', '[]', 'approved', 1, now(), now())
      RETURNING id
      `,
      [TENANT_ZM, faZm]
    );
    const sIl = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'RepFind', 'IL', 'Plumber', 'Haifa', '8112', '8112', '', '', '', '', '', '', '', '', '', '[]', 'approved', 1, now(), now())
      RETURNING id
      `,
      [TENANT_IL, faIl]
    );

    const delegated = await request(app)
      .get("/admin/field-agent-analytics/reporting/export")
      .query({
        record_type: "submissions",
        bucket: "approved",
        q: "RepFind",
        agent: String(faZm),
        from: "2026-01-01",
        to: "2026-12-31",
      })
      .expect(302);
    const loc = String(delegated.headers.location || "");
    assert.ok(loc.includes("/admin/field-agent-analytics/drilldown/submissions/export.csv?"));
    assert.ok(loc.includes("bucket=approved"));
    assert.ok(loc.includes("q=RepFind"));
    assert.ok(loc.includes(`agent=${faZm}`));
    assert.ok(loc.includes("from=2026-01-01"));
    assert.ok(loc.includes("to=2026-12-31"));

    const csvRes = await request(app)
      .get(loc)
      .expect(200);
    const csv = stripBom(csvRes.text);
    assert.ok(csv.includes('"RepFind ZM"'));
    assert.ok(!csv.includes('"RepFind IL"'));

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [[sZm.rows[0].id, sIl.rows[0].id]]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[faZm, faIl]]);
  }
);

test(
  "mapped reporting datasets use existing semantics",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const app = createApp(TENANT_ZM);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_rep_map_${tag}`,
      passwordHash: "x",
      displayName: "Rep Map",
      phone: "",
    });
    const approved = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'MapApproved', 'A', 'Plumber', 'Lusaka', '8211', '8211', '', '', '', '', '', '', '', '', '', '[]', 'approved', 1, now(), now())
      RETURNING id
      `,
      [TENANT_ZM, fa]
    );
    const rejected = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'MapRejected', 'B', 'Plumber', 'Lusaka', '8212', '8212', '', '', '', '', '', '', '', '', '', '[]', 'rejected', 0, now(), now())
      RETURNING id
      `,
      [TENANT_ZM, fa]
    );
    const pending = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'MapPending', 'C', 'Plumber', 'Lusaka', '8213', '8213', '', '', '', '', '', '', '', '', '', '[]', 'pending', 0, now(), now())
      RETURNING id
      `,
      [TENANT_ZM, fa]
    );

    const decidedRedirect = await request(app)
      .get("/admin/field-agent-analytics/reporting/export")
      .query({ record_type: "submissions", bucket: "approval_rate_decided" })
      .expect(302);
    const decidedCsv = stripBom((await request(app).get(decidedRedirect.headers.location).expect(200)).text);
    assert.ok(decidedCsv.includes('"MapApproved A"'));
    assert.ok(decidedCsv.includes('"MapRejected B"'));
    assert.ok(!decidedCsv.includes('"MapPending C"'));

    const shareRedirect = await request(app)
      .get("/admin/field-agent-analytics/reporting/export")
      .query({ record_type: "submissions", bucket: "share_approved_all" })
      .expect(302);
    const shareCsv = stripBom((await request(app).get(shareRedirect.headers.location).expect(200)).text);
    assert.ok(shareCsv.includes('"MapApproved A"'));
    assert.ok(!shareCsv.includes('"MapRejected B"'));
    assert.ok(!shareCsv.includes('"MapPending C"'));

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [
      [approved.rows[0].id, rejected.rows[0].id, pending.rows[0].id],
    ]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "reporting export rejects unsupported buckets safely and reporting page includes presets",
  { skip: !isPgConfigured() },
  async () => {
    const app = createApp(TENANT_ZM);
    await request(app)
      .get("/admin/field-agent-analytics/reporting/export")
      .query({ record_type: "submissions", bucket: "bad_bucket" })
      .expect(400);

    await request(app)
      .post("/admin/field-agent-analytics/presets")
      .send({
        name: "Reporting Preset A",
        record_type: "submissions",
        bucket: "pending",
        filters: { q: "abc", from: "2026-01-01", to: "2026-01-02" },
      })
      .expect(201);

    const page = await request(app).get("/admin/field-agent-analytics/reporting").expect(200);
    const html = String(page.text || "");
    assert.ok(html.includes('data-faa-reporting-preset'));
    assert.ok(html.includes("Reporting Preset A"));
    assert.ok(html.includes('data-record-type="submissions"'));
  }
);
