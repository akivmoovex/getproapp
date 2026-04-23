"use strict";

/**
 * Field Agent console: protected static pages, phone check API, callback POST,
 * and auth flows (signup/login, dashboard access, tenant mismatch, deleted/disabled agent).
 * Static redirect tests run without PostgreSQL. DB-backed tests skip when PG is unavailable.
 */

const path = require("path");
const fs = require("fs");
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
const companiesRepo = require("../src/db/pg/companiesRepo");
const categoriesRepo = require("../src/db/pg/categoriesRepo");
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

async function insertApprovedSubmission(pool, fieldAgentId, suffix) {
  const phoneNorm = makePhoneNorm();
  const subId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
    tenantId: TENANT_ZM,
    fieldAgentId,
    phoneRaw: phoneNorm,
    phoneNorm,
    whatsappRaw: "",
    whatsappNorm: "",
    firstName: `A${suffix}`,
    lastName: `B${suffix}`,
    profession: "Plumber",
    city: "Lusaka",
    pacra: "",
    addressStreet: "",
    addressLandmarks: "",
    addressNeighbourhood: "",
    addressCity: "Lusaka",
    nrcNumber: `N${suffix}`,
    photoProfileUrl: "",
    workPhotosJson: "[]",
  });
  await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(pool, {
    tenantId: TENANT_ZM,
    submissionId: subId,
    commissionAmount: 0,
  });
  return subId;
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

test("field-agent website-content preview: unauthenticated GET redirects to field-agent login", async () => {
  const app = createApp({});
  const res = await request(app).get("/field-agent/submissions/1/website-content/preview").redirects(0);
  assert.equal(res.status, 302);
  assert.match(String(res.headers.location || ""), /field-agent\/login/);
});

test("field-agent SP Websites page: unauthenticated GET redirects to field-agent login", async () => {
  const app = createApp({});
  const res = await request(app).get("/field-agent/sp-websites").redirects(0);
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

test("field-agent website-content submit API: unauthenticated POST redirects to login", async () => {
  const app = createApp({});
  const res = await request(app)
    .post("/field-agent/api/submissions/1/website-content-submit-review")
    .set("Content-Type", "application/json")
    .send({ draft: {} })
    .redirects(0);
  assert.equal(res.status, 302);
  assert.match(String(res.headers.location || ""), /field-agent\/login/);
});

test("field-agent website-content view: submit success reuses m3 success overlay, countdown CSS, 5s timer, navigate helper", () => {
  const p = path.join(__dirname, "..", "views", "field_agent", "website_content.ejs");
  const s = fs.readFileSync(p, "utf8");
  assert.match(s, /id="fa-wc-submit-success-overlay"/);
  assert.match(s, /class="fa-submit-success-countdown"/);
  assert.match(s, /m3-modal-overlay/);
  assert.match(s, /, 5000\)/);
  assert.match(s, /goDashboardFromReviewSuccess/);
  assert.match(s, /pendingReviewSuccessUrl\s*=\s*result\.json\.redirect/);
});

test(
  "field-agent SP Websites: authenticated page shows approved and not-linked submissions only",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_spw_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const showSubId = await insertApprovedSubmission(pool, agentId, `show_${u}`);
    const linkedSubId = await insertApprovedSubmission(pool, agentId, `linked_${u}`);
    const catRows = await categoriesRepo.listByTenantId(pool, TENANT_ZM);
    const catId = catRows && catRows[0] ? catRows[0].id : null;
    const linkedCompany = await companiesRepo.insertFull(pool, {
      tenantId: TENANT_ZM,
      subdomain: `spw-${u}`.slice(0, 40).toLowerCase().replace(/[^a-z0-9-]/g, ""),
      name: `SPW ${u}`,
      categoryId: catId,
      headline: "",
      about: "",
      services: "",
      phone: "",
      email: "",
      location: "",
      featuredCtaLabel: "Call us",
      featuredCtaPhone: "",
      yearsExperience: null,
      serviceAreas: "",
      hoursText: "",
      galleryJson: "[]",
      logoUrl: "",
      accountManagerFieldAgentId: agentId,
      sourceFieldAgentSubmissionId: linkedSubId,
    });

    try {
      const app = createApp({ fieldAgentId: agentId });
      const res = await request(app).get("/field-agent/sp-websites").redirects(0);
      assert.equal(res.status, 200);
      assert.match(res.text || "", new RegExp(`/field-agent/submissions/${showSubId}/website-content`));
      assert.doesNotMatch(res.text || "", new RegExp(`/field-agent/submissions/${linkedSubId}/website-content`));
    } finally {
      await pool.query(`DELETE FROM public.companies WHERE id = $1`, [linkedCompany.id]);
      await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [[showSubId, linkedSubId]]);
      await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    }
  }
);

test(
  "field-agent dashboard: websites-to-create card links to SP Websites; count matches eligible list; no Next step block",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_dash_spw_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const showSubId = await insertApprovedSubmission(pool, agentId, `dash_show_${u}`);
    const linkedSubId = await insertApprovedSubmission(pool, agentId, `dash_linked_${u}`);
    const catRows = await categoriesRepo.listByTenantId(pool, TENANT_ZM);
    const catId = catRows && catRows[0] ? catRows[0].id : null;
    const linkedCompany = await companiesRepo.insertFull(pool, {
      tenantId: TENANT_ZM,
      subdomain: `dash-spw-${u}`.slice(0, 40).toLowerCase().replace(/[^a-z0-9-]/g, ""),
      name: `Dash SPW ${u}`,
      categoryId: catId,
      headline: "",
      about: "",
      services: "",
      phone: "",
      email: "",
      location: "",
      featuredCtaLabel: "Call us",
      featuredCtaPhone: "",
      yearsExperience: null,
      serviceAreas: "",
      hoursText: "",
      galleryJson: "[]",
      logoUrl: "",
      accountManagerFieldAgentId: agentId,
      sourceFieldAgentSubmissionId: linkedSubId,
    });

    try {
      const app = createApp({ fieldAgentId: agentId });
      const spRes = await request(app).get("/field-agent/sp-websites").redirects(0);
      assert.equal(spRes.status, 200);
      const listCount = (String(spRes.text || "").match(/field-agent-dash-list__item/g) || []).length;

      const dash = await request(app).get("/field-agent/dashboard").redirects(0);
      assert.equal(dash.status, 200);
      const html = String(dash.text || "");
      assert.doesNotMatch(html, /Next step/i);
      assert.doesNotMatch(html, /Prepare website content/);
      assert.match(html, /href="\/field-agent\/sp-websites"/);
      assert.match(html, /Field agent dashboard/i);
      const cardM = html.match(
        /field-agent-metric-card__label[^>]*>Websites to create<[\s\S]*?field-agent-metric-card__value">(\d+)</
      );
      assert.ok(cardM, "expected websites-to-create metric");
      assert.equal(Number(cardM[1]), listCount);
      assert.equal(listCount, 1);
    } finally {
      await pool.query(`DELETE FROM public.companies WHERE id = $1`, [linkedCompany.id]);
      await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [[showSubId, linkedSubId]]);
      await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    }
  }
);

test(
  "field-agent website-content draft: blank email accepted, phone tampering ignored, and reopen hydrates saved draft",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_wcd_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const subId = await insertApprovedSubmission(pool, agentId, `draft_${u}`);
    try {
      const app = createApp({ fieldAgentId: agentId });
      const save = await request(app)
        .post(`/field-agent/api/submissions/${subId}/website-content-draft`)
        .set("Content-Type", "application/json")
        .send({
          draft: {
            listing_name: "Saved Listing",
            email: "",
            years_experience: "12",
            established_year: "2012",
            listing_phone: "HACKED-PHONE",
            specialities: ["Plumbing", "Electrical", "Plumbing"],
            weekly_hours: {
              sunday: { closed: true, from: "", to: "" },
              monday: { closed: false, from: "08:00", to: "17:00" },
              tuesday: { closed: true, from: "", to: "" },
              wednesday: { closed: true, from: "", to: "" },
              thursday: { closed: true, from: "", to: "" },
              friday: { closed: true, from: "", to: "" },
              saturday: { closed: true, from: "", to: "" },
            },
          },
        })
        .redirects(0);
      assert.equal(save.status, 200);
      const savedBody = JSON.parse(save.text || "{}");
      assert.equal(savedBody.ok, true);
      assert.equal(
        String(savedBody.redirect || ""),
        "/field-agent/dashboard?draft_saved=1",
        "save success includes dashboard redirect for confirmation banner"
      );
      assert.equal(String(savedBody.submission.website_listing_draft_json.listing_name || ""), "Saved Listing");
      assert.equal(String(savedBody.submission.website_listing_draft_json.email || ""), "");
      assert.equal(Number(savedBody.submission.website_listing_draft_json.years_experience), 12);
      assert.equal(Number(savedBody.submission.website_listing_draft_json.established_year), 2012);
      assert.notEqual(String(savedBody.submission.website_listing_draft_json.listing_phone || ""), "HACKED-PHONE");
      const spRows = await pool.query(
        `SELECT speciality_name FROM public.field_agent_submission_website_specialities WHERE tenant_id = $1 AND submission_id = $2`,
        [TENANT_ZM, subId]
      );
      const spNames = spRows.rows.map((r) => String(r.speciality_name || "").toLowerCase());
      assert.ok(spNames.includes("plumbing"));
      assert.ok(spNames.includes("electrical"));
      assert.equal(spNames.filter((x) => x === "plumbing").length, 1);

      const reopen = await request(app).get(`/field-agent/submissions/${subId}/website-content`).redirects(0);
      assert.equal(reopen.status, 200);
      assert.match(reopen.text || "", /Saved Listing/);
      assert.match(reopen.text || "", /Specialities/);
      assert.match(reopen.text || "", /Plumbing/);
      assert.match(reopen.text || "", /Electrical/);
      assert.match(reopen.text || "", /Established in year/i);
    } finally {
      await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
      await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    }
  }
);

test(
  "field-agent dashboard: draft_saved=1 shows website draft saved banner",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_draftbanner_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    try {
      const app = createApp({ fieldAgentId: agentId });
      const res = await request(app).get("/field-agent/dashboard?draft_saved=1").redirects(0);
      assert.equal(res.status, 200);
      assert.match(String(res.text || ""), /Website draft saved/i);
    } finally {
      await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    }
  }
);

test(
  "field-agent dashboard: review_submitted=1 shows listing submitted for staff review banner",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_reviewbanner_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    try {
      const app = createApp({ fieldAgentId: agentId });
      const res = await request(app).get("/field-agent/dashboard?review_submitted=1").redirects(0);
      assert.equal(res.status, 200);
      assert.match(String(res.text || ""), /Listing submitted for staff review/i);
    } finally {
      await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    }
  }
);

test(
  "field-agent website-content submit: persists review status, returns dashboard redirect, creates CRM inbound task",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_wcsubmit_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const subId = await insertApprovedSubmission(pool, agentId, `wcsr_${u}`);
    try {
      const app = createApp({ fieldAgentId: agentId });
      const res = await request(app)
        .post(`/field-agent/api/submissions/${subId}/website-content-submit-review`)
        .set("Content-Type", "application/json")
        .send({ draft: {} })
        .redirects(0);
      assert.equal(res.status, 200);
      const body = JSON.parse(res.text || "{}");
      assert.equal(body.ok, true);
      assert.equal(String(body.redirect || ""), "/field-agent/dashboard?review_submitted=1");
      assert.equal(String(body.submission && body.submission.website_listing_review_status), "submitted");
      const crm = await pool.query(
        `SELECT id FROM public.crm_tasks
         WHERE tenant_id = $1 AND source_type = 'field_agent_website_listing' AND source_ref_id = $2`,
        [TENANT_ZM, subId]
      );
      assert.equal(crm.rows.length, 1);
    } finally {
      await pool.query(
        `DELETE FROM public.crm_tasks
         WHERE tenant_id = $1 AND source_type = 'field_agent_website_listing' AND source_ref_id = $2`,
        [TENANT_ZM, subId]
      );
      await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
      await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    }
  }
);

test(
  "field-agent website flow regression: dashboard + SP list + save/reload + submit/CRM + review_submitted dashboard",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_wc_journey_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const showSubId = await insertApprovedSubmission(pool, agentId, `jr_show_${u}`);
    const linkedSubId = await insertApprovedSubmission(pool, agentId, `jr_linked_${u}`);
    const catRows = await categoriesRepo.listByTenantId(pool, TENANT_ZM);
    const catId = catRows && catRows[0] ? catRows[0].id : null;
    const linkedCompany = await companiesRepo.insertFull(pool, {
      tenantId: TENANT_ZM,
      subdomain: `jr-spw-${u}`.slice(0, 40).toLowerCase().replace(/[^a-z0-9-]/g, ""),
      name: `JR SPW ${u}`,
      categoryId: catId,
      headline: "",
      about: "",
      services: "",
      phone: "",
      email: "",
      location: "",
      featuredCtaLabel: "Call us",
      featuredCtaPhone: "",
      yearsExperience: null,
      serviceAreas: "",
      hoursText: "",
      galleryJson: "[]",
      logoUrl: "",
      accountManagerFieldAgentId: agentId,
      sourceFieldAgentSubmissionId: linkedSubId,
    });
    const journeyName = `JourneyList_${u}`;

    try {
      const app = createApp({ fieldAgentId: agentId });

      const dash = await request(app).get("/field-agent/dashboard").redirects(0);
      assert.equal(dash.status, 200);
      const dashHtml = String(dash.text || "");
      const cardM = dashHtml.match(
        /Websites to create<[\s\S]*?field-agent-metric-card__value">(\d+)</
      );
      assert.ok(cardM, "websites-to-create card");
      assert.equal(Number(cardM[1]), 1);

      const sp = await request(app).get("/field-agent/sp-websites").redirects(0);
      assert.equal(sp.status, 200);
      assert.match(String(sp.text || ""), new RegExp(`/field-agent/submissions/${showSubId}/website-content`));

      const page = await request(app)
        .get(`/field-agent/submissions/${showSubId}/website-content`)
        .redirects(0);
      assert.equal(page.status, 200);
      const pageHtml = String(page.text || "");
      assert.match(pageHtml, /id="fa-website-content-form"/);
      assert.match(pageHtml, /id="fa-wc-submit-success-overlay"/);
      assert.match(pageHtml, /field-agent\/sp-websites/);

      const save = await request(app)
        .post(`/field-agent/api/submissions/${showSubId}/website-content-draft`)
        .set("Content-Type", "application/json")
        .send({
          draft: {
            listing_name: journeyName,
            established_year: "2010",
            weekly_hours: {
              sunday: { closed: true, from: "", to: "" },
              monday: { closed: false, from: "08:00", to: "17:00" },
              tuesday: { closed: true, from: "", to: "" },
              wednesday: { closed: true, from: "", to: "" },
              thursday: { closed: true, from: "", to: "" },
              friday: { closed: true, from: "", to: "" },
              saturday: { closed: true, from: "", to: "" },
            },
          },
        })
        .redirects(0);
      assert.equal(save.status, 200);
      const saveJson = JSON.parse(String(save.text || "{}"));
      assert.equal(saveJson.ok, true);
      assert.equal(String(saveJson.redirect || ""), "/field-agent/dashboard?draft_saved=1");

      const afterSave = await request(app)
        .get(`/field-agent/submissions/${showSubId}/website-content`)
        .redirects(0);
      assert.equal(afterSave.status, 200);
      assert.match(String(afterSave.text || ""), new RegExp(journeyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

      const subRes = await request(app)
        .post(`/field-agent/api/submissions/${showSubId}/website-content-submit-review`)
        .set("Content-Type", "application/json")
        .send({ draft: {} })
        .redirects(0);
      assert.equal(subRes.status, 200);
      const subJson = JSON.parse(String(subRes.text || "{}"));
      assert.equal(subJson.ok, true);
      assert.equal(String(subJson.redirect || ""), "/field-agent/dashboard?review_submitted=1");
      const crm = await pool.query(
        `SELECT id, title FROM public.crm_tasks
         WHERE tenant_id = $1 AND source_type = 'field_agent_website_listing' AND source_ref_id = $2`,
        [TENANT_ZM, showSubId]
      );
      assert.equal(crm.rows.length, 1);
      assert.match(String(crm.rows[0].title || ""), new RegExp(`submission #${showSubId}`));

      const afterReview = await request(app).get("/field-agent/dashboard?review_submitted=1").redirects(0);
      assert.equal(afterReview.status, 200);
      assert.match(String(afterReview.text || ""), /Listing submitted for staff review/i);
    } finally {
      await pool.query(`DELETE FROM public.crm_tasks WHERE tenant_id = $1 AND source_ref_id = $2 AND source_type = 'field_agent_website_listing'`, [
        TENANT_ZM,
        showSubId,
      ]);
      await pool.query(`DELETE FROM public.companies WHERE id = $1`, [linkedCompany.id]);
      await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [
        [showSubId, linkedSubId],
      ]);
      await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    }
  }
);

test(
  "field-agent website-content draft: max-10 specialities enforced",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_wcsmax_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const subId = await insertApprovedSubmission(pool, agentId, `spmax_${u}`);
    try {
      const app = createApp({ fieldAgentId: agentId });
      const specialities = Array.from({ length: 11 }, (_, i) => `Spec ${i + 1}`);
      const res = await request(app)
        .post(`/field-agent/api/submissions/${subId}/website-content-draft`)
        .set("Content-Type", "application/json")
        .send({ draft: { specialities } })
        .redirects(0);
      assert.equal(res.status, 400);
      assert.match(res.text || "", /Maximum 10 specialities/i);
    } finally {
      await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
      await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    }
  }
);

test(
  "field-agent website-content draft: invalid structured hours rejected",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_wchval_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const subId = await insertApprovedSubmission(pool, agentId, `hval_${u}`);
    try {
      const app = createApp({ fieldAgentId: agentId });
      const partial = await request(app)
        .post(`/field-agent/api/submissions/${subId}/website-content-draft`)
        .set("Content-Type", "application/json")
        .send({ draft: { weekly_hours: { monday: { closed: false, from: "08:00", to: "" } } } })
        .redirects(0);
      assert.equal(partial.status, 400);
      assert.match(partial.text || "", /both from and to times are required/i);

      const order = await request(app)
        .post(`/field-agent/api/submissions/${subId}/website-content-draft`)
        .set("Content-Type", "application/json")
        .send({ draft: { weekly_hours: { monday: { closed: false, from: "18:00", to: "09:00" } } } })
        .redirects(0);
      assert.equal(order.status, 400);
      assert.match(order.text || "", /Open time must be before close time/i);

      const closedOk = await request(app)
        .post(`/field-agent/api/submissions/${subId}/website-content-draft`)
        .set("Content-Type", "application/json")
        .send({ draft: { weekly_hours: { monday: { closed: true, from: "", to: "" } } } })
        .redirects(0);
      assert.equal(closedOk.status, 200);
      const closedJson = JSON.parse(closedOk.text || "{}");
      assert.equal(closedJson.ok, true);
      assert.equal(String(closedJson.redirect || ""), "/field-agent/dashboard?draft_saved=1");
    } finally {
      await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
      await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    }
  }
);

test(
  "field-agent website-content draft and submit: invalid established year rejected",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_wcey_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const subId = await insertApprovedSubmission(pool, agentId, `estyear_${u}`);
    try {
      const app = createApp({ fieldAgentId: agentId });
      const saveBad = await request(app)
        .post(`/field-agent/api/submissions/${subId}/website-content-draft`)
        .set("Content-Type", "application/json")
        .send({ draft: { established_year: "99" } })
        .redirects(0);
      assert.equal(saveBad.status, 400);
      assert.match(saveBad.text || "", /Established in year/i);

      const submitBad = await request(app)
        .post(`/field-agent/api/submissions/${subId}/website-content-submit-review`)
        .set("Content-Type", "application/json")
        .send({ draft: { established_year: "3000" } })
        .redirects(0);
      assert.equal(submitBad.status, 400);
      assert.match(submitBad.text || "", /Established in year/i);
    } finally {
      await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
      await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    }
  }
);

test(
  "field-agent website-content draft and submit: invalid email rejected",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_wce_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const subId = await insertApprovedSubmission(pool, agentId, `email_${u}`);
    try {
      const app = createApp({ fieldAgentId: agentId });
      const saveBad = await request(app)
        .post(`/field-agent/api/submissions/${subId}/website-content-draft`)
        .set("Content-Type", "application/json")
        .send({ draft: { email: "bad-email" } })
        .redirects(0);
      assert.equal(saveBad.status, 400);
      assert.match(saveBad.text || "", /valid email/i);

      const submitBad = await request(app)
        .post(`/field-agent/api/submissions/${subId}/website-content-submit-review`)
        .set("Content-Type", "application/json")
        .send({ draft: { email: "also-bad" } })
        .redirects(0);
      assert.equal(submitBad.status, 400);
      assert.match(submitBad.text || "", /valid email/i);
    } finally {
      await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
      await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    }
  }
);

test(
  "field-agent website-content page: shows website review rejection comment/status",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_wcstatus_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const subId = await insertApprovedSubmission(pool, agentId, `status_${u}`);
    try {
      await pool.query(
        `UPDATE public.field_agent_provider_submissions
         SET website_listing_review_status = 'changes_requested',
             website_listing_review_comment = 'Please improve the headline wording.'
         WHERE id = $1`,
        [subId]
      );
      await pool.query(
        `INSERT INTO public.field_agent_submission_website_specialities
         (tenant_id, submission_id, speciality_name, speciality_name_norm, is_verified)
         VALUES ($1, $2, 'Plumbing', 'plumbing', TRUE)`,
        [TENANT_ZM, subId]
      );
      const app = createApp({ fieldAgentId: agentId });
      const res = await request(app).get(`/field-agent/submissions/${subId}/website-content`).redirects(0);
      assert.equal(res.status, 200);
      assert.match(res.text || "", /changes requested/i);
      assert.match(res.text || "", /Please improve the headline wording/i);
      assert.match(res.text || "", /Verified ✓/);
      assert.doesNotMatch(res.text || "", /specialities_verified/);
    } finally {
      await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
      await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    }
  }
);

test(
  "field-agent website-content preview: authenticated field agent can preview only own eligible approved submission",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ownerId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_prev_owner_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const otherId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_prev_other_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const eligibleSubId = await insertApprovedSubmission(pool, ownerId, `eligible_${u}`);
    const linkedSubId = await insertApprovedSubmission(pool, ownerId, `linked_${u}`);
    const otherSubId = await insertApprovedSubmission(pool, otherId, `other_${u}`);
    const catRows = await categoriesRepo.listByTenantId(pool, TENANT_ZM);
    const catId = catRows && catRows[0] ? catRows[0].id : null;
    const linkedCompany = await companiesRepo.insertFull(pool, {
      tenantId: TENANT_ZM,
      subdomain: `prev-${u}`.slice(0, 40).toLowerCase().replace(/[^a-z0-9-]/g, ""),
      name: `Prev ${u}`,
      categoryId: catId,
      headline: "",
      about: "",
      services: "",
      phone: "",
      email: "",
      location: "",
      featuredCtaLabel: "Call us",
      featuredCtaPhone: "",
      yearsExperience: null,
      serviceAreas: "",
      hoursText: "",
      galleryJson: "[]",
      logoUrl: "",
      accountManagerFieldAgentId: ownerId,
      sourceFieldAgentSubmissionId: linkedSubId,
    });

    try {
      const app = createApp({ fieldAgentId: ownerId });
      const okRes = await request(app).get(`/field-agent/submissions/${eligibleSubId}/website-content/preview`).redirects(0);
      assert.equal(okRes.status, 200);
      const linkedRes = await request(app).get(`/field-agent/submissions/${linkedSubId}/website-content/preview`).redirects(0);
      assert.equal(linkedRes.status, 403);
      const otherRes = await request(app).get(`/field-agent/submissions/${otherSubId}/website-content/preview`).redirects(0);
      assert.equal(otherRes.status, 404);
    } finally {
      await pool.query(`DELETE FROM public.companies WHERE id = $1`, [linkedCompany.id]);
      await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [
        [eligibleSubId, linkedSubId, otherSubId],
      ]);
      await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[ownerId, otherId]]);
    }
  }
);

test(
  "field-agent website-content preview: renders saved draft and includes Edit link to canonical editor route",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_prev_render_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const subId = await insertApprovedSubmission(pool, agentId, `render_${u}`);
    try {
      const app = createApp({ fieldAgentId: agentId });
      const save = await request(app)
        .post(`/field-agent/api/submissions/${subId}/website-content-draft`)
        .set("Content-Type", "application/json")
        .send({
          draft: {
            listing_name: "Preview Listing Name",
            headline: "Preview Headline",
            about: "Preview About Text",
            established_year: "2010",
            email: "",
            specialities: ["Roofing", "Painting"],
            weekly_hours: {
              monday: { closed: false, from: "08:00", to: "16:00" },
              tuesday: { closed: true, from: "", to: "" },
            },
          },
        })
        .redirects(0);
      assert.equal(save.status, 200);
      const saveJson = JSON.parse(save.text || "{}");
      assert.equal(String(saveJson.redirect || ""), "/field-agent/dashboard?draft_saved=1");
      await pool.query(
        `UPDATE public.field_agent_submission_website_specialities
         SET is_verified = TRUE, verified_at = now()
         WHERE tenant_id = $1 AND submission_id = $2 AND speciality_name_norm = 'roofing'`,
        [TENANT_ZM, subId]
      );

      const preview = await request(app).get(`/field-agent/submissions/${subId}/website-content/preview`).redirects(0);
      assert.equal(preview.status, 200);
      assert.match(preview.text || "", /Preview Listing Name/);
      assert.match(preview.text || "", /Preview Headline/);
      assert.match(preview.text || "", /Preview About Text/);
      assert.match(preview.text || "", /Established in\s*2010/);
      assert.match(preview.text || "", /Roofing/);
      assert.match(preview.text || "", /Roofing[\s\S]*✓/);
      assert.doesNotMatch(preview.text || "", /Painting[\s\S]*✓/);
      assert.match(preview.text || "", /Monday: 08:00-16:00/);
      assert.match(preview.text || "", /Preview mode/);
      assert.match(preview.text || "", new RegExp(`href="/field-agent/submissions/${subId}/website-content"`));
    } finally {
      await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
      await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    }
  }
);

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
