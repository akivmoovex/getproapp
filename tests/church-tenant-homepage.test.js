"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const announcementsRepo = require("../src/db/pg/church/announcementsRepo");
const eventsRepo = require("../src/db/pg/church/eventsRepo");
const ministriesRepo = require("../src/db/pg/church/ministriesRepo");
const sermonsRepo = require("../src/db/pg/church/sermonsRepo");
const websiteContentRepo = require("../src/db/pg/church/websiteContentRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { churchPgSkipIfUnconfigured, requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const { BLESSBOARD_NAME } = require("../src/church/branding");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeBranchApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    next();
  });
  app.use(churchRoutes());
  return app;
}

function makeApexApp() {
  return makeBranchApp({ kind: "vertical-apex", host: "blessboard.com", organization: null, branch: null });
}

function makeFallbackBranchApp() {
  return makeBranchApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Alpha Grace Church", status: "active" },
    branch: {
      id: 1,
      name: "Downtown Branch",
      status: "active",
      host_slug: "demo",
      service_times: "Sunday Worship · 10:00 AM",
      location_text: "12 Faith Street",
    },
  });
}

async function cleanup(pool, branchIds, orgIds) {
  for (const branchId of branchIds) {
    await pool.query(`DELETE FROM public.church_sermons WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_ministries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_events WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_announcements WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_website_content WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("tenant homepage renders approved section hierarchy without fake content", async () => {
  const app = makeFallbackBranchApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);

  const order = [
    /data-tenant-home="1"/,
    /bb-tenant-hero/,
    /id="giving"/,
    /id="announcements"/,
    /id="events"/,
    /id="sermons"/,
    /id="ministries"/,
    /id="visit"/,
  ];
  let cursor = 0;
  for (const pattern of order) {
    const idx = res.text.slice(cursor).search(pattern);
    assert.ok(idx >= 0, `missing section marker ${pattern}`);
    cursor += idx + 1;
  }

  assert.match(res.text, /Alpha Grace Church|Downtown Branch/);
  assert.match(res.text, /Downtown Branch/);
  assert.match(res.text, /href="\/login"[^>]*>Member Login</);
  assert.match(res.text, /href="\/register"[^>]*>Register as a Member</);
  assert.match(res.text, /Sunday Worship · 10:00 AM/);
  assert.match(res.text, /12 Faith Street/);
  assert.match(res.text, /bb-tenant-hero__visual--fallback|bb-tenant-hero__fallback/);
  assert.match(res.text, /No upcoming events have been published yet/);
  assert.match(res.text, /There are no public announcements at this time/);
  assert.match(res.text, /Ministry information will be available soon/);
  assert.match(res.text, /href="\/giving"/);
  assert.match(res.text, /Give Now/);
  assert.match(res.text, /Join a Service|Join Our Next Service/);
  assert.match(res.text, /Connected Community|Digital Giving|Already a Member\?/);
  assert.doesNotMatch(res.text, /Give Online Now|Other Ways to Give|1\.2k\+/);
  assert.match(res.text, /href="\/contact"/);
  assert.match(res.text, /bb-powered-by__label/);
  assert.match(res.text, /bb-powered-by__getpro/);
  assert.match(res.text, /home-desktop-design/);
  assert.match(res.text, /home-mobile-design/);
  assert.match(res.text, /church-nav--branch/);
  assert.doesNotMatch(res.text, /bb-saas-hero/);
  assert.doesNotMatch(res.text, /Find Your Church/);
  assert.doesNotMatch(res.text, /Annual Praise Night/);
  assert.doesNotMatch(res.text, /15 members are nearby/);
  assert.doesNotMatch(res.text, /mobile-map-kafue/);
  assert.doesNotMatch(res.text, /Children's Ministry/);
  assert.doesNotMatch(res.text, /overflow-x:\s*scroll/);
});

test("powered-by GetPro branding colors remain in shared CSS", () => {
  const css = fs.readFileSync(path.join(__dirname, "../public/church/church.css"), "utf8");
  assert.match(css, /\.bb-powered-by__label\s*\{[^}]*color:\s*var\(--church-powered-by-gray\)/s);
  assert.match(css, /\.bb-powered-by__getpro\s*\{[^}]*color:\s*var\(--church-getpro-orange\)/s);
  assert.match(css, /\.bb-tenant-home/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});

test("apex homepage remains church finder and is not tenant homepage", async () => {
  const res = await request(makeApexApp()).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /bb-saas-hero/);
  assert.match(res.text, /Find Your Church/);
  assert.match(res.text, new RegExp(BLESSBOARD_NAME));
  assert.doesNotMatch(res.text, /data-tenant-home="1"/);
  assert.doesNotMatch(res.text, /Mark Your Calendar/);
  assert.doesNotMatch(res.text, /Generosity Changes Lives/);
});

test("login and registration links stay tenant-scoped relative paths", async () => {
  const res = await request(makeFallbackBranchApp()).get("/");
  assert.match(res.text, /href="\/login"/);
  assert.match(res.text, /href="\/register"/);
  assert.doesNotMatch(res.text, /https:\/\/[^"]+\/login/);
  assert.doesNotMatch(res.text, /https:\/\/[^"]+\/register/);
});

test("inactive tenant organization homepage is unavailable", async () => {
  const res = await request(
    makeBranchApp({
      kind: "branch",
      orgSlug: "demo",
      organization: { id: 1, name: "Suspended Church", status: "suspended" },
      branch: { id: 1, name: "Main", status: "active", host_slug: "demo" },
    })
  ).get("/");
  assert.equal(res.status, 503);
  assert.match(res.text, /temporarily unavailable/i);
});

test("inactive branch homepage is unavailable", async () => {
  const res = await request(
    makeBranchApp({
      kind: "branch",
      orgSlug: "demo",
      organization: { id: 1, name: "Active Church", status: "active" },
      branch: { id: 1, name: "Closed Branch", status: "suspended", host_slug: "demo" },
    })
  ).get("/");
  assert.equal(res.status, 503);
  assert.match(res.text, /temporarily unavailable/i);
});

test(
  "tenant homepage uses real published data and respects visibility scoping",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("thome");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `thome_a_${suffix}`,
      name: `Tenant Home A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `thome_b_${suffix}`,
      name: `Tenant Home B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `Branch A ${suffix}`,
      service_times: "Sunday 09:00",
      location_text: "100 Hope Ave",
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `Branch B ${suffix}`,
      service_times: "Sunday 11:00",
      location_text: "200 Secret Rd",
    });

    await websiteContentRepo.upsertWebsiteDraftForBranch(pool, branchA.id, {
      organization_id: orgA.id,
      homepage_hero_title: `Welcome to A ${suffix}`,
      homepage_hero_subtitle: "Grace and peace",
      welcome_message: `Real welcome message for A ${suffix}`,
      service_times: "Sunday 09:00",
      location_text: "100 Hope Ave",
      contact_phone: "+260971111111",
      contact_email: `office_a_${suffix}@example.com`,
      giving_instructions: `Giving intro A ${suffix}`,
      address: "100 Hope Ave",
    });
    await websiteContentRepo.publishWebsiteContentForBranch(pool, branchA.id, null);

    const eventDate = new Date();
    eventDate.setDate(eventDate.getDate() + 14);
    const eventDateStr = eventDate.toISOString().slice(0, 10);

    await eventsRepo.createEventForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      title: `Published Event A ${suffix}`,
      description: "Public event for homepage",
      event_date: eventDateStr,
      start_time: "10:00 AM",
      location: "Main Hall",
      visibility: "public",
      status: "published",
    });
    await eventsRepo.createEventForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      title: `Draft Event A ${suffix}`,
      description: "Should not show",
      event_date: eventDateStr,
      visibility: "public",
      status: "draft",
    });
    await eventsRepo.createEventForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      title: `Members Event A ${suffix}`,
      description: "Members only",
      event_date: eventDateStr,
      visibility: "members",
      status: "published",
    });
    await eventsRepo.createEventForBranch(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      title: `Secret Event B ${suffix}`,
      description: "Other tenant",
      event_date: eventDateStr,
      visibility: "public",
      status: "published",
    });

    const publicAnn = await announcementsRepo.createAnnouncementForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      title: `Public Announcement A ${suffix}`,
      body: "Visible on public homepage",
      category: "General",
      audience: "public",
      status: "draft",
    });
    await announcementsRepo.publishAnnouncementForBranch(pool, publicAnn.id, branchA.id, {});

    const memberAnn = await announcementsRepo.createAnnouncementForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      title: `Internal Announcement A ${suffix}`,
      body: "Members only",
      category: "Internal",
      audience: "members",
      status: "draft",
    });
    await announcementsRepo.publishAnnouncementForBranch(pool, memberAnn.id, branchA.id, {});

    const expiredAnn = await announcementsRepo.createAnnouncementForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      title: `Expired Announcement A ${suffix}`,
      body: "Expired",
      category: "General",
      audience: "public",
      status: "draft",
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    await announcementsRepo.publishAnnouncementForBranch(pool, expiredAnn.id, branchA.id, {
      publish_at: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });
    await pool.query(`UPDATE public.church_announcements SET expires_at = $1 WHERE id = $2`, [
      new Date(Date.now() - 24 * 60 * 60 * 1000),
      expiredAnn.id,
    ]);

    await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      name: `Public Ministry A ${suffix}`,
      slug: `public-min-a-${suffix}`,
      description: "Open ministry description",
      visibility: "public",
      status: "published",
    });
    await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      name: `Members Ministry A ${suffix}`,
      slug: `members-min-a-${suffix}`,
      description: "Internal roster ministry",
      visibility: "members",
      status: "published",
    });

    await sermonsRepo.createSermonForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      title: `Published Sermon A ${suffix}`,
      speaker: "Pastor A",
      sermon_date: eventDateStr,
      description: "A published message",
      status: "published",
    });
    await sermonsRepo.createSermonForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      title: `Draft Sermon A ${suffix}`,
      speaker: "Pastor A",
      sermon_date: eventDateStr,
      description: "Draft only",
      status: "draft",
    });

    const appA = makeBranchApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const appB = makeBranchApp({
      kind: "branch",
      orgSlug: orgB.slug,
      organization: orgB,
      branch: branchB,
    });

    const homeA = await request(appA).get("/");
    assert.equal(homeA.status, 200);
    assert.match(homeA.text, new RegExp(`Welcome to A ${suffix}`));
    assert.match(homeA.text, new RegExp(`Branch A ${suffix}`));
    assert.match(homeA.text, new RegExp(`Real welcome message for A ${suffix}`));
    assert.match(homeA.text, /Sunday 09:00/);
    assert.match(homeA.text, /100 Hope Ave/);
    assert.match(homeA.text, /\+260971111111/);
    assert.match(homeA.text, new RegExp(`office_a_${suffix}@example.com`));
    assert.match(homeA.text, new RegExp(`Published Event A ${suffix}`));
    assert.doesNotMatch(homeA.text, new RegExp(`Draft Event A ${suffix}`));
    assert.doesNotMatch(homeA.text, new RegExp(`Members Event A ${suffix}`));
    assert.doesNotMatch(homeA.text, new RegExp(`Secret Event B ${suffix}`));
    assert.match(homeA.text, new RegExp(`Public Announcement A ${suffix}`));
    assert.doesNotMatch(homeA.text, new RegExp(`Internal Announcement A ${suffix}`));
    assert.doesNotMatch(homeA.text, new RegExp(`Expired Announcement A ${suffix}`));
    assert.match(homeA.text, new RegExp(`Public Ministry A ${suffix}`));
    assert.doesNotMatch(homeA.text, new RegExp(`Members Ministry A ${suffix}`));
    assert.match(homeA.text, new RegExp(`Published Sermon A ${suffix}`));
    assert.doesNotMatch(homeA.text, new RegExp(`Draft Sermon A ${suffix}`));
    assert.match(homeA.text, new RegExp(`Giving intro A ${suffix}`));
    assert.match(homeA.text, /href="\/giving"/);
    assert.match(homeA.text, /href="\/login"/);
    assert.match(homeA.text, /href="\/register"/);

    const homeB = await request(appB).get("/");
    assert.equal(homeB.status, 200);
    assert.match(homeB.text, new RegExp(`Branch B ${suffix}`));
    assert.doesNotMatch(homeB.text, new RegExp(`Welcome to A ${suffix}`));
    assert.doesNotMatch(homeB.text, new RegExp(`Published Event A ${suffix}`));
    assert.doesNotMatch(homeB.text, new RegExp(`Public Announcement A ${suffix}`));
    assert.doesNotMatch(homeB.text, new RegExp(`Public Ministry A ${suffix}`));
    assert.doesNotMatch(homeB.text, new RegExp(`Published Sermon A ${suffix}`));
    assert.match(homeB.text, new RegExp(`Secret Event B ${suffix}`));

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);
