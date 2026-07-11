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
const ministriesRepo = require("../src/db/pg/church/ministriesRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { churchPgSkipIfUnconfigured, requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const { BLESSBOARD_NAME } = require("../src/church/branding");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeApp(ctx) {
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

function makeTenantApp(extraBranch = {}) {
  return makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Alpha Grace Church", status: "active" },
    branch: {
      id: 1,
      name: "Downtown Branch",
      status: "active",
      host_slug: "demo",
      ...extraBranch,
    },
  });
}

function makeApexApp() {
  return makeApp({ kind: "vertical-apex", host: "blessboard.com", organization: null, branch: null });
}

function countMatches(html, pattern) {
  return (html.match(new RegExp(pattern, "g")) || []).length;
}

async function cleanup(pool, branchIds, orgIds) {
  for (const branchId of branchIds) {
    await pool.query(`DELETE FROM public.church_ministries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("tenant ministries page renders active nav, hero, empty state, and tenant chrome", async () => {
  const res = await request(makeTenantApp()).get("/ministries");
  assert.equal(res.status, 200);
  assert.match(res.text, /data-ministries-page="1"/);
  assert.match(res.text, /bb-public-ministries/);
  assert.match(res.text, /bb-ministries-hero/);
  assert.match(res.text, /Growing Together in Faith|Our Ministries/);
  assert.match(res.text, /href="\/ministries"[^>]*church-nav__active|church-nav__active[^>]*>\s*Ministries/);
  assert.match(res.text, /data-tenant-header="1"/);
  assert.match(res.text, /Alpha Grace Church/);
  assert.match(res.text, /Downtown Branch/);
  assert.match(res.text, /href="\/login"[^>]*>Member Login</);
  assert.match(res.text, /href="\/register"[^>]*>Register as a Member</);
  assert.match(res.text, /Ministry information will be available soon/);
  assert.match(res.text, /bb-ministries-empty/);
  assert.match(res.text, /bb-ministries-cta/);
  assert.match(res.text, /church-ministries-desktop|church-ministries-mobile|bb-ministries-empty|bb-ministries-grid/);
  assert.match(res.text, /church-footer--branch/);
  assert.equal(countMatches(res.text, /church-footer--branch/), 1);
  assert.match(res.text, /bb-powered-by__label/);
  assert.match(res.text, /bb-powered-by__getpro/);
  assert.doesNotMatch(res.text, /Showing sample ministry layout/);
  assert.doesNotMatch(res.text, /Download Ministry Guide/);
  assert.doesNotMatch(res.text, /Contact Ministry Leader/);
  assert.doesNotMatch(res.text, /member_count|leader_phone/);
  assert.doesNotMatch(res.text, /church-footer--apex/);
  assert.doesNotMatch(res.text, /bb-saas-hero/);
  assert.doesNotMatch(res.text, /Join Ministry|Contact Leader|Download Guide/);
});

test("CSS contains ministries page selectors and powered-by colors", () => {
  const css = fs.readFileSync(path.join(__dirname, "../public/church/church.css"), "utf8");
  for (const token of [
    ".bb-public-ministries",
    ".bb-ministries-hero",
    ".bb-ministries-grid",
    ".bb-ministries-feature",
    ".bb-ministries-card",
    ".bb-ministries-empty",
    ".bb-ministries-cta",
  ]) {
    assert.ok(css.includes(token), `missing ${token}`);
  }
  assert.match(css, /\.bb-powered-by__label\s*\{[^}]*color:\s*var\(--church-powered-by-gray\)/s);
  assert.match(css, /\.bb-powered-by__getpro\s*\{[^}]*color:\s*var\(--church-getpro-orange\)/s);
});

test("apex homepage remains unchanged by ministries repair", async () => {
  const res = await request(makeApexApp()).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /bb-saas-hero/);
  assert.match(res.text, new RegExp(BLESSBOARD_NAME));
  assert.doesNotMatch(res.text, /data-ministries-page="1"/);
});

test("about page remains unchanged by ministries repair", async () => {
  const res = await request(makeTenantApp()).get("/about");
  assert.equal(res.status, 200);
  assert.doesNotMatch(res.text, /data-ministries-page="1"/);
  assert.match(res.text, /About|Our Story/);
});

test(
  "published public ministries render with safe cards; unpublished and other tenants excluded",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("pmin");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pmin_a_${suffix}`,
      name: `Public Min A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pmin_b_${suffix}`,
      name: `Public Min B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `Branch B ${suffix}`,
    });

    await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      name: `Very Long Public Ministry Name That Should Wrap Safely ${suffix}`,
      slug: `long-public-${suffix}`,
      description: "A published public ministry description for the ministries page.",
      leader_name: "Secret Leader",
      leader_phone: "+260900000000",
      meeting_time: "Saturday 10:00",
      visibility: "public",
      status: "published",
    });
    await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      name: `Draft Ministry ${suffix}`,
      slug: `draft-${suffix}`,
      description: "Should not show",
      visibility: "public",
      status: "draft",
    });
    await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      name: `Members Only Ministry ${suffix}`,
      slug: `members-${suffix}`,
      description: "Members only",
      visibility: "members",
      status: "published",
    });
    await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      name: `Other Tenant Ministry ${suffix}`,
      slug: `other-${suffix}`,
      description: "Other tenant",
      visibility: "public",
      status: "published",
    });

    const appA = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const res = await request(appA).get("/ministries");
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(`Very Long Public Ministry Name That Should Wrap Safely ${suffix}`));
    assert.match(res.text, /bb-ministries-feature|bb-ministries-card/);
    assert.match(res.text, /bb-ministries-feature__media|bb-ministries-card__media|material-symbols-outlined/);
    assert.match(res.text, /Saturday 10:00/);
    assert.doesNotMatch(res.text, new RegExp(`Draft Ministry ${suffix}`));
    assert.doesNotMatch(res.text, new RegExp(`Members Only Ministry ${suffix}`));
    assert.doesNotMatch(res.text, new RegExp(`Other Tenant Ministry ${suffix}`));
    assert.doesNotMatch(res.text, /\+260900000000/);
    assert.doesNotMatch(res.text, /Secret Leader/);
    assert.doesNotMatch(res.text, /member_count/);
    assert.doesNotMatch(res.text, /src=""\s/);
    assert.equal(countMatches(res.text, /id="ministry-grid"/), 1);

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);
