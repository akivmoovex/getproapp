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

function createApp(tenantId) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(
    session({
      secret: "admin_fa_analytics_test",
      resave: false,
      saveUninitialized: true,
      name: "adm_faa_sid",
    })
  );
  app.use((req, res, next) => {
    req.session.adminUser = {
      id: 1,
      role: ROLES.TENANT_MANAGER,
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

test(
  "admin field-agent analytics drilldown: submissions FIFO + tenant scope + invalid bucket",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const app = createApp(TENANT_ZM);

    const faZm = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ana_zm_${tag}`,
      passwordHash: "x",
      displayName: "ZM Agent",
      phone: "",
    });
    const faIl = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_IL,
      username: `fa_ana_il_${tag}`,
      passwordHash: "x",
      displayName: "IL Agent",
      phone: "",
    });
    const createdAt = "2026-01-02T10:00:00.000Z";
    const r1 = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'A_First', 'One', 'Plumber', 'Lusaka', '111', '111', '', '', '', '', '', '', '', '', '', '[]', 'pending', 0, $3::timestamptz, now())
      RETURNING id
      `,
      [TENANT_ZM, faZm, createdAt]
    );
    const r2 = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'B_Second', 'Two', 'Electrician', 'Lusaka', '222', '222', '', '', '', '', '', '', '', '', '', '[]', 'pending', 0, $3::timestamptz, now())
      RETURNING id
      `,
      [TENANT_ZM, faZm, createdAt]
    );
    const r3 = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'IL_Hidden', 'Three', 'Painter', 'Haifa', '333', '333', '', '', '', '', '', '', '', '', '', '[]', 'pending', 0, $3::timestamptz, now())
      RETURNING id
      `,
      [TENANT_IL, faIl, createdAt]
    );

    const list = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions")
      .query({ bucket: "pending" })
      .expect(200);
    const body = String(list.text || "");
    assert.ok(body.includes("A_First"));
    assert.ok(body.includes("B_Second"));
    assert.ok(!body.includes("IL_Hidden"));
    assert.ok(body.indexOf(`>${r1.rows[0].id}<`) < body.indexOf(`>${r2.rows[0].id}<`));
    assert.ok(body.includes('data-faa-open-detail="1"'));
    assert.ok(body.includes(`data-faa-id="${r1.rows[0].id}"`));
    assert.ok(body.includes('data-faa-kind="submissions"'));
    assert.ok(body.includes("faa-drilldown-row__button"));
    assert.ok(body.includes("aria-label=\"Open submission #"));

    await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions")
      .query({ bucket: "bad_bucket" })
      .expect(400);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [
      [r1.rows[0].id, r2.rows[0].id, r3.rows[0].id],
    ]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[faZm, faIl]]);
  }
);

test(
  "admin field-agent analytics drilldown: commission cards map to approved submissions",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const app = createApp(TENANT_ZM);
    const faZm = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ana_map_${tag}`,
      passwordHash: "x",
      displayName: "Map Agent",
      phone: "",
    });
    const createdAt = "2026-01-03T10:00:00.000Z";
    const approved = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'Approved_Row', 'Ok', 'Plumber', 'Lusaka', '444', '444', '', '', '', '', '', '', '', '', '', '[]', 'approved', 12.5, $3::timestamptz, now())
      RETURNING id
      `,
      [TENANT_ZM, faZm, createdAt]
    );
    const rejected = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'Rejected_Row', 'No', 'Painter', 'Lusaka', '555', '555', '', '', '', '', '', '', '', '', '', '[]', 'rejected', 0, $3::timestamptz, now())
      RETURNING id
      `,
      [TENANT_ZM, faZm, createdAt]
    );

    const totalList = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions")
      .query({ bucket: "total_commission_approved" })
      .expect(200);
    assert.ok(totalList.text.includes("Approved_Row"));
    assert.ok(!totalList.text.includes("Rejected_Row"));

    const avgList = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions")
      .query({ bucket: "avg_commission_approved" })
      .expect(200);
    assert.ok(avgList.text.includes("Approved_Row"));
    assert.ok(!avgList.text.includes("Rejected_Row"));

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [
      [approved.rows[0].id, rejected.rows[0].id],
    ]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [faZm]);
  }
);

test(
  "admin field-agent analytics drilldown: callback leads FIFO + tenant scope",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const app = createApp(TENANT_ZM);
    const faZm = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ana_cb_zm_${tag}`,
      passwordHash: "x",
      displayName: "ZM Agent",
      phone: "",
    });
    const faIl = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_IL,
      username: `fa_ana_cb_il_${tag}`,
      passwordHash: "x",
      displayName: "IL Agent",
      phone: "",
    });
    const createdAt = "2026-01-04T11:00:00.000Z";
    const c1 = await pool.query(
      `
      INSERT INTO public.field_agent_callback_leads
      (tenant_id, field_agent_id, first_name, last_name, phone, email, location_city, created_at)
      VALUES ($1, $2, 'Cb_A', 'One', '111', 'a@example.com', 'Lusaka', $3::timestamptz)
      RETURNING id
      `,
      [TENANT_ZM, faZm, createdAt]
    );
    const c2 = await pool.query(
      `
      INSERT INTO public.field_agent_callback_leads
      (tenant_id, field_agent_id, first_name, last_name, phone, email, location_city, created_at)
      VALUES ($1, $2, 'Cb_B', 'Two', '222', 'b@example.com', 'Lusaka', $3::timestamptz)
      RETURNING id
      `,
      [TENANT_ZM, faZm, createdAt]
    );
    const c3 = await pool.query(
      `
      INSERT INTO public.field_agent_callback_leads
      (tenant_id, field_agent_id, first_name, last_name, phone, email, location_city, created_at)
      VALUES ($1, $2, 'Cb_Hidden', 'Three', '333', 'c@example.com', 'Haifa', $3::timestamptz)
      RETURNING id
      `,
      [TENANT_IL, faIl, createdAt]
    );

    const list = await request(app)
      .get("/admin/field-agent-analytics/drilldown/callback-leads")
      .query({ bucket: "callback_leads" })
      .expect(200);
    const body = String(list.text || "");
    assert.ok(body.includes("Cb_A"));
    assert.ok(body.includes("Cb_B"));
    assert.ok(!body.includes("Cb_Hidden"));
    assert.ok(body.indexOf(`>${c1.rows[0].id}<`) < body.indexOf(`>${c2.rows[0].id}<`));
    assert.ok(body.includes('data-faa-open-detail="1"'));
    assert.ok(body.includes(`data-faa-id="${c1.rows[0].id}"`));
    assert.ok(body.includes('data-faa-kind="callback-leads"'));
    assert.ok(body.includes("faa-drilldown-row__button"));
    assert.ok(body.includes("aria-label=\"Open callback lead #"));

    await request(app)
      .get("/admin/field-agent-analytics/drilldown/callback-leads")
      .query({ bucket: "bad_bucket" })
      .expect(400);

    await pool.query(`DELETE FROM public.field_agent_callback_leads WHERE id = ANY($1::int[])`, [
      [c1.rows[0].id, c2.rows[0].id, c3.rows[0].id],
    ]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[faZm, faIl]]);
  }
);

test(
  "admin field-agent analytics drilldown: submissions filters compose (q/status/date/agent) and keep FIFO",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const app = createApp(TENANT_ZM);
    const faA = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ana_fa_a_${tag}`,
      passwordHash: "x",
      displayName: "Filter Agent A",
      phone: "",
    });
    const faB = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ana_fa_b_${tag}`,
      passwordHash: "x",
      displayName: "Filter Agent B",
      phone: "",
    });
    const s1 = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'Find', 'MeOne', 'Plumber', 'Lusaka', '9001', '9001', '', '', 'PACRA-X', '', '', '', '', '', '', '[]', 'approved', 10, '2026-01-10T09:00:00.000Z', now())
      RETURNING id
      `,
      [TENANT_ZM, faA]
    );
    const s2 = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'Find', 'MeTwo', 'Electrician', 'Ndola', '9002', '9002', '', '', '', '', '', '', '', '', '', '[]', 'approved', 10, '2026-01-11T09:00:00.000Z', now())
      RETURNING id
      `,
      [TENANT_ZM, faA]
    );
    const s3 = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'Other', 'Row', 'Painter', 'Lusaka', '9003', '9003', '', '', '', '', '', '', '', '', '', '[]', 'rejected', 0, '2026-01-12T09:00:00.000Z', now())
      RETURNING id
      `,
      [TENANT_ZM, faB]
    );

    const filtered = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions")
      .query({
        bucket: "total_submissions",
        q: "Find",
        status: "approved",
        from: "2026-01-10",
        to: "2026-01-11",
        agent: String(faA),
      })
      .expect(200);
    const body = String(filtered.text || "");
    assert.ok(body.includes("MeOne"));
    assert.ok(body.includes("MeTwo"));
    assert.ok(!body.includes("Other"));
    assert.ok(body.indexOf(`>${s1.rows[0].id}<`) < body.indexOf(`>${s2.rows[0].id}<`));

    const empty = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions")
      .query({
        bucket: "total_submissions",
        q: "nope-never-match",
        status: "approved",
      })
      .expect(200);
    assert.ok(String(empty.text || "").includes("No results match your filters."));

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [
      [s1.rows[0].id, s2.rows[0].id, s3.rows[0].id],
    ]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[faA, faB]]);
  }
);

test(
  "admin field-agent analytics drilldown: callback leads filters compose and keep FIFO",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const app = createApp(TENANT_ZM);
    const faA = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ana_cb_fa_a_${tag}`,
      passwordHash: "x",
      displayName: "CB Filter Agent A",
      phone: "",
    });
    const faB = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ana_cb_fa_b_${tag}`,
      passwordHash: "x",
      displayName: "CB Filter Agent B",
      phone: "",
    });
    const c1 = await pool.query(
      `
      INSERT INTO public.field_agent_callback_leads
      (tenant_id, field_agent_id, first_name, last_name, phone, email, location_city, created_at)
      VALUES ($1, $2, 'Call', 'Alpha', '7001', 'alpha@example.com', 'Lusaka', '2026-02-01T09:00:00.000Z')
      RETURNING id
      `,
      [TENANT_ZM, faA]
    );
    const c2 = await pool.query(
      `
      INSERT INTO public.field_agent_callback_leads
      (tenant_id, field_agent_id, first_name, last_name, phone, email, location_city, created_at)
      VALUES ($1, $2, 'Call', 'Beta', '7002', 'beta@example.com', 'Lusaka', '2026-02-02T09:00:00.000Z')
      RETURNING id
      `,
      [TENANT_ZM, faA]
    );
    const c3 = await pool.query(
      `
      INSERT INTO public.field_agent_callback_leads
      (tenant_id, field_agent_id, first_name, last_name, phone, email, location_city, created_at)
      VALUES ($1, $2, 'Skip', 'Gamma', '7003', 'gamma@example.com', 'Ndola', '2026-02-03T09:00:00.000Z')
      RETURNING id
      `,
      [TENANT_ZM, faB]
    );

    const filtered = await request(app)
      .get("/admin/field-agent-analytics/drilldown/callback-leads")
      .query({
        bucket: "callback_leads",
        q: "Call",
        from: "2026-02-01",
        to: "2026-02-02",
        agent: String(faA),
      })
      .expect(200);
    const body = String(filtered.text || "");
    assert.ok(body.includes("Alpha"));
    assert.ok(body.includes("Beta"));
    assert.ok(!body.includes("Gamma"));
    assert.ok(body.indexOf(`>${c1.rows[0].id}<`) < body.indexOf(`>${c2.rows[0].id}<`));

    await pool.query(`DELETE FROM public.field_agent_callback_leads WHERE id = ANY($1::int[])`, [
      [c1.rows[0].id, c2.rows[0].id, c3.rows[0].id],
    ]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[faA, faB]]);
  }
);

test(
  "admin field-agent analytics page: approved cards are wired clickable and deferred cards are not",
  { skip: !isPgConfigured() },
  async () => {
    const app = createApp(TENANT_ZM);
    const res = await request(app).get("/admin/field-agent-analytics").expect(200);
    const html = String(res.text || "");
    assert.ok(html.includes('data-faa-bucket="pending"'));
    assert.ok(html.includes('data-faa-bucket="callback_leads"'));
    assert.ok(html.includes('data-faa-bucket="total_commission_approved"'));
    assert.ok(html.includes('data-faa-bucket="avg_commission_approved"'));
    assert.ok(html.includes("admin-field-agent-analytics"));
    assert.ok(html.includes('aria-controls="faa_drilldown_overlay"'));
    assert.ok(html.includes('aria-haspopup="dialog"'));
    assert.ok(html.includes('aria-live="polite"'));
    assert.ok(html.includes('aria-busy="false"'));
    assert.ok(!html.includes('data-faa-bucket="approval_rate_decided"'));
    assert.ok(!html.includes('data-faa-bucket="approval_rate_total"'));
  }
);
