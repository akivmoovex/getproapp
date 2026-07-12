"use strict";

/**
 * Public church-selection flow (apex finder → branch → tenant).
 */

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { churchPgSkipIfUnconfigured, requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const directoryRepo = require("../src/db/pg/church/publicChurchDirectoryRepo");
const {
  COOKIE_NAME,
  readChurchSelectionPreference,
  isSafeSlug,
} = require("../src/church/churchSelectionPreference");
const { churchPublicUrl } = require("../src/church/platformProvisioningValidation");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeApexApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "vertical-apex",
      host: "blessboard.com",
      organization: null,
      branch: null,
      orgSlug: null,
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

function makeBranchApp(org, branch) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      host: `${branch.host_slug || branch.slug}.blessboard.com`,
      orgSlug: org.slug,
      hostSlug: branch.host_slug || branch.slug,
      organization: org,
      branch,
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

async function insertOrg(pool, { name, slug, status = "active", city = null, country = null }) {
  const r = await pool.query(
    `INSERT INTO public.church_organizations
       (platform_tenant_id, name, slug, status, city, country)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, slug, status, city, country`,
    [TENANT_ZM, name, slug, status, city, country]
  );
  return r.rows[0];
}

async function insertBranch(pool, orgId, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_branches
       (organization_id, name, slug, host_slug, status, city, country, location_text, service_times, welcome_message, member_registration_enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, organization_id, name, slug, host_slug, status, city, country, location_text, service_times`,
    [
      orgId,
      fields.name,
      fields.slug,
      fields.host_slug || fields.slug,
      fields.status || "active",
      fields.city || null,
      fields.country || null,
      fields.location_text || null,
      fields.service_times || null,
      fields.welcome_message || null,
      fields.member_registration_enabled !== undefined ? fields.member_registration_enabled : true,
    ]
  );
  return r.rows[0];
}

test("apex homepage shows Find Your Church and not tenant member login as main action", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /Find Your Church/);
  assert.match(res.text, /Church Administrator Login/);
  assert.doesNotMatch(res.text, /https:\/\/demo\.blessboard\.com\/login/);
  assert.doesNotMatch(res.text, /https:\/\/demo\.blessboard\.com\/register/);
  assert.doesNotMatch(res.text, /Start Free Trial/);
  // Header primary CTA is Find Your Church, not Member Login on apex
  assert.doesNotMatch(res.text, /church-header--apex[\s\S]*href="\/login"/);
});

test("Powered by is gray and GetPro is orange in shared markup and CSS tokens", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/");
  assert.match(res.text, /bb-powered-by__label/);
  assert.match(res.text, /bb-powered-by__getpro/);
  assert.match(res.text, /Powered by[\s\S]{0,120}?GetPro/);

  const fs = require("fs");
  const css = fs.readFileSync(path.join(__dirname, "../public/church/church.css"), "utf8");
  assert.match(css, /--church-getpro-orange:\s*#f59e0b/);
  assert.match(css, /\.bb-powered-by__label\s*\{[^}]*color:\s*var\(--church-powered-by-gray\)/s);
  assert.match(css, /\.bb-powered-by__getpro\s*\{[^}]*color:\s*var\(--church-getpro-orange\)/s);
});

test("church selection preference helpers reject unsafe slugs", () => {
  assert.equal(isSafeSlug("good-church"), true);
  assert.equal(isSafeSlug("../evil"), false);
  assert.equal(isSafeSlug("a".repeat(80)), false);
  assert.equal(readChurchSelectionPreference({ headers: {} }), null);
  assert.equal(
    readChurchSelectionPreference({ headers: { cookie: `${COOKIE_NAME}=bad|../x` } }),
    null
  );
});

test(
  "public church search uses active organizations only and is parameterized",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("finder");
    const active = await insertOrg(pool, {
      name: `Alpha Active ${suffix}`,
      slug: `alpha-active-${suffix}`,
      status: "active",
      city: "Kafue",
      country: "ZM",
    });
    const inactive = await insertOrg(pool, {
      name: `Beta Inactive ${suffix}`,
      slug: `beta-inactive-${suffix}`,
      status: "inactive",
      city: "Kafue",
    });
    await insertBranch(pool, active.id, {
      name: `Alpha Branch ${suffix}`,
      slug: `alpha-br-${suffix}`,
      host_slug: `alpha-br-${suffix}`,
      city: "Kafue",
      status: "active",
    });
    await insertBranch(pool, inactive.id, {
      name: `Beta Branch ${suffix}`,
      slug: `beta-br-${suffix}`,
      host_slug: `beta-br-${suffix}`,
      status: "active",
    });

    const byName = await directoryRepo.searchPublicOrganizations(pool, { q: `Alpha Active ${suffix}` });
    assert.ok(byName.items.some((i) => i.slug === active.slug));
    assert.ok(!byName.items.some((i) => i.slug === inactive.slug));

    const byTown = await directoryRepo.searchPublicOrganizations(pool, { q: "Kafue" });
    assert.ok(byTown.items.some((i) => i.slug === active.slug));
    assert.ok(!byTown.items.some((i) => i.slug === inactive.slug));

    // Ensure public projection has no private contact fields
    for (const item of byName.items) {
      assert.equal(Object.prototype.hasOwnProperty.call(item, "primary_contact_email"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(item, "id"), false);
    }
  }
);

test(
  "apex church finder renders results and no-results state",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("ui");
    const org = await insertOrg(pool, {
      name: `Finder UI ${suffix}`,
      slug: `finder-ui-${suffix}`,
      status: "active",
      city: "Lusaka",
    });
    await insertBranch(pool, org.id, {
      name: `UI Branch ${suffix}`,
      slug: `ui-br-${suffix}`,
      host_slug: `ui-br-${suffix}`,
      status: "active",
    });

    const app = makeApexApp();
    const hit = await request(app).get(`/churches?q=${encodeURIComponent(org.name)}`);
    assert.equal(hit.status, 200);
    assert.match(hit.text, /Find Your Church/);
    assert.match(hit.text, new RegExp(org.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(hit.text, /Visit Church|Select branch/);

    const miss = await request(app).get("/churches?q=zzznomatchchurch999");
    assert.equal(miss.status, 200);
    assert.match(miss.text, /No churches matched your search/);
  }
);

test(
  "single-branch church redirects directly; multi-branch shows selector; inactive excluded",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("redir");
    const single = await insertOrg(pool, {
      name: `Single ${suffix}`,
      slug: `single-${suffix}`,
      status: "active",
    });
    const singleBranch = await insertBranch(pool, single.id, {
      name: `Only Branch ${suffix}`,
      slug: `only-${suffix}`,
      host_slug: `only-${suffix}`,
      status: "active",
    });
    await insertBranch(pool, single.id, {
      name: `Inactive Branch ${suffix}`,
      slug: `inactive-${suffix}`,
      host_slug: `inactive-${suffix}`,
      status: "inactive",
    });

    const multi = await insertOrg(pool, {
      name: `Multi ${suffix}`,
      slug: `multi-${suffix}`,
      status: "active",
    });
    const b1 = await insertBranch(pool, multi.id, {
      name: `North ${suffix}`,
      slug: `north-${suffix}`,
      host_slug: `north-${suffix}`,
      status: "active",
      city: "Ndola",
      service_times: "Sunday 09:00",
    });
    const b2 = await insertBranch(pool, multi.id, {
      name: `South ${suffix}`,
      slug: `south-${suffix}`,
      host_slug: `south-${suffix}`,
      status: "active",
    });

    const app = makeApexApp();
    const singleRes = await request(app).get(`/churches/${single.slug}`);
    assert.equal(singleRes.status, 302);
    assert.equal(singleRes.headers.location, churchPublicUrl(singleBranch.host_slug, "/"));
    assert.match(String(singleRes.headers["set-cookie"] || ""), new RegExp(COOKIE_NAME));

    const multiRes = await request(app).get(`/churches/${multi.slug}`);
    assert.equal(multiRes.status, 302);
    assert.match(multiRes.headers.location, new RegExp(`/churches/${multi.slug}/branches`));

    const branchesPage = await request(app).get(`/churches/${multi.slug}/branches`);
    assert.equal(branchesPage.status, 200);
    assert.match(branchesPage.text, new RegExp(multi.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(branchesPage.text, new RegExp(b1.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(branchesPage.text, new RegExp(b2.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(branchesPage.text, /Visit Church/);
    assert.match(branchesPage.text, /Sunday 09:00/);
    assert.match(branchesPage.text, /bb-finder__org-name/);
    assert.doesNotMatch(branchesPage.text, /Inactive Branch/);
  }
);

test(
  "branch open validates ownership and blocks open redirect",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("own");
    const orgA = await insertOrg(pool, { name: `OrgA ${suffix}`, slug: `orga-${suffix}`, status: "active" });
    const orgB = await insertOrg(pool, { name: `OrgB ${suffix}`, slug: `orgb-${suffix}`, status: "active" });
    const branchB = await insertBranch(pool, orgB.id, {
      name: `BranchB ${suffix}`,
      slug: `branchb-${suffix}`,
      host_slug: `branchb-${suffix}`,
      status: "active",
    });

    const app = makeApexApp();
    const cross = await request(app)
      .post(`/churches/${orgA.slug}/branches/${branchB.slug}/open`)
      .type("form")
      .send({});
    assert.equal(cross.status, 404);
    assert.match(cross.text, /active branch available online|could not find|not available/i);

    const ok = await request(app)
      .post(`/churches/${orgB.slug}/branches/${branchB.slug}/open`)
      .type("form")
      .send({});
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.location, churchPublicUrl(branchB.host_slug, "/"));
    assert.ok(String(ok.headers.location).startsWith("https://"));
    assert.doesNotMatch(String(ok.headers.location), /evil\.com|javascript:/i);
  }
);

test("tenant homepage shows resolved church/branch and member login/register", async () => {
  const org = {
    id: 1,
    name: "Resolved Org Church",
    slug: "resolved-org",
    status: "active",
  };
  const branch = {
    id: 2,
    name: "Resolved Branch Campus",
    slug: "resolved-branch",
    host_slug: "resolved-branch",
    status: "active",
    welcome_message: "Welcome to our campus.",
    service_times: "Sunday 10:00",
    location_text: "Main Road",
  };
  const app = makeBranchApp(org, branch);
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /Resolved Branch Campus|Resolved Org Church/);
  assert.match(res.text, /Member Login/);
  assert.match(res.text, /Register as a Member/);
  assert.match(res.text, /href="\/login"/);
  assert.match(res.text, /href="\/register"/);
});

test(
  "remembered church renders on apex and invalid preference fails safely without auth",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("pref");
    const org = await insertOrg(pool, {
      name: `Pref Church ${suffix}`,
      slug: `pref-${suffix}`,
      status: "active",
    });
    const branch = await insertBranch(pool, org.id, {
      name: `Pref Branch ${suffix}`,
      slug: `pref-br-${suffix}`,
      host_slug: `pref-br-${suffix}`,
      status: "active",
    });

    const app = makeApexApp();
    const withPref = await request(app)
      .get("/")
      .set("Cookie", `${COOKIE_NAME}=${org.slug}|${branch.slug}`);
    assert.equal(withPref.status, 200);
    assert.match(withPref.text, /Continue to your church/);
    assert.match(withPref.text, new RegExp(org.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(withPref.text, new RegExp(branch.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(withPref.text, /Choose another church/);
    assert.doesNotMatch(withPref.text, /member\/dashboard|branch\/dashboard|hq\/dashboard/);

    const invalid = await request(app)
      .get("/")
      .set("Cookie", `${COOKIE_NAME}=missing-org-${suffix}|missing-br-${suffix}`);
    assert.equal(invalid.status, 200);
    assert.doesNotMatch(invalid.text, /Continue to your church/);
    assert.match(invalid.text, /Find Your Church/);
    // Cleared preference cookie
    const cleared = String(invalid.headers["set-cookie"] || "");
    if (cleared) {
      assert.match(cleared, new RegExp(COOKIE_NAME));
    }
  }
);

test("admin intent opens branch admin login destination", churchPgSkipIfUnconfigured(), async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;
  await ensureCanonicalTenantsForTests(pool);
  await ensureChurchSchema(pool);

  const suffix = makeSuffix("adminintent");
  const org = await insertOrg(pool, {
    name: `Admin Intent ${suffix}`,
    slug: `admin-intent-${suffix}`,
    status: "active",
  });
  const branch = await insertBranch(pool, org.id, {
    name: `Admin Branch ${suffix}`,
    slug: `admin-br-${suffix}`,
    host_slug: `admin-br-${suffix}`,
    status: "active",
  });

  const app = makeApexApp();
  const res = await request(app).get(`/churches/${org.slug}?for=admin`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, churchPublicUrl(branch.host_slug, "/branch/login"));
});

test("desktop and mobile apex layouts both expose Find Your Church", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/");
  assert.match(res.text, /home-desktop-design/);
  assert.match(res.text, /church-menu-btn/);
  assert.match(res.text, /Find Your Church/);
  assert.match(res.text, /church-drawer--apex/);
});

test(
  "directory cards show optional fields, graceful fallbacks, and search by slug",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("cards");
    const org = await insertOrg(pool, {
      name: `Card Church ${suffix}`,
      slug: `card-church-${suffix}`,
      status: "active",
      city: "Livingstone",
      country: "Zambia",
    });
    await insertBranch(pool, org.id, {
      name: `Card Branch ${suffix}`,
      slug: `card-br-${suffix}`,
      host_slug: `card-br-${suffix}`,
      status: "active",
      city: "Livingstone",
      welcome_message: "A friendly church community in Livingstone.",
      service_times: null,
      location_text: "Mosi-oa-Tunya Road",
    });

    const app = makeApexApp();
    const bySlug = await request(app).get(`/churches?q=${encodeURIComponent(org.slug)}`);
    assert.equal(bySlug.status, 200);
    assert.match(bySlug.text, new RegExp(org.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(bySlug.text, /Branch:/);
    assert.match(bySlug.text, /Service times not published/);
    assert.match(bySlug.text, /Visit Church/);
    assert.match(bySlug.text, /aria-label="Visit Card Church/);
    assert.match(bySlug.text, /bb-finder__visit/);
    assert.match(bySlug.text, /bb-finder__card-main/);
  }
);

test(
  "suspended organizations and inactive branches stay out of directory cards",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("hidden");
    const hidden = await insertOrg(pool, {
      name: `Hidden Church ${suffix}`,
      slug: `hidden-${suffix}`,
      status: "suspended",
      city: "Kabwe",
    });
    await insertBranch(pool, hidden.id, {
      name: `Hidden Branch ${suffix}`,
      slug: `hidden-br-${suffix}`,
      host_slug: `hidden-br-${suffix}`,
      status: "active",
    });

    const app = makeApexApp();
    const res = await request(app).get(`/churches?q=${encodeURIComponent(hidden.slug)}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /No churches matched your search/);
    assert.doesNotMatch(res.text, new RegExp(hidden.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
);
