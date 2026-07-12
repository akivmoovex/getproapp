"use strict";

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");
const { BLESSBOARD_REGISTER_CHURCH_PATH } = require("../src/church/platformPublicContent");

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
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

function makeBranchApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      orgSlug: "demo",
      organization: { id: 1, name: "Demo Church", status: "active" },
      branch: { id: 1, name: "Demo Branch", status: "active", host_slug: "demo" },
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

const PLATFORM_PAGES = [
  { path: "/about", title: "About BlessBoard", sections: ["What BlessBoard is", "Why BlessBoard exists", "Who it serves", "How BlessBoard and GetPro are related", "Our approach"], active: "about" },
  { path: "/contact", title: "Contact BlessBoard", active: "contact", hasForm: true },
  { path: "/for-churches", title: "BlessBoard for your church", active: "for-churches" },
  { path: "/multi-branch", title: "One platform for every branch", active: "multi-branch" },
  { path: BLESSBOARD_REGISTER_CHURCH_PATH, title: "Register Your Church", active: "register-church", hasForm: true },
  { path: "/privacy", title: "Privacy Policy", active: "privacy" },
  { path: "/terms", title: "Terms of Service", active: "terms" },
  { path: "/security", title: "Security and Data Information", active: "security" },
  { path: "/support", title: "Support", active: "support" },
  { path: "/faq", title: "Frequently Asked Questions", active: "faq" },
  { path: "/demo", title: "See BlessBoard in action", active: "demo" },
];

test("apex platform static pages render with shared shell", async () => {
  const app = makeApexApp();
  for (const page of PLATFORM_PAGES) {
    const res = await request(app).get(page.path);
    assert.equal(res.status, 200, `${page.path} should render`);
    assert.match(res.text, /church\.css\?v=63/, `${page.path} should load public CSS`);
    assert.match(res.text, /church-body--apex/, `${page.path} should use apex body`);
    assert.match(res.text, new RegExp(page.title), `${page.path} should include heading`);
    if (page.sections) {
      for (const section of page.sections) {
        assert.match(res.text, new RegExp(section), `${page.path} should include section ${section}`);
      }
    }
    assert.match(res.text, /church-footer--apex/, `${page.path} should include apex footer`);
    assert.match(res.text, /href="\/about"/, `${page.path} footer should link about`);
    assert.match(res.text, /href="\/privacy"/, `${page.path} footer should link privacy`);
    if (page.hasForm) {
      assert.match(res.text, /method="post"/, `${page.path} should include submission form`);
    }
    assert.doesNotMatch(res.text, /data-tenant-header="1"/, `${page.path} must not use tenant header`);
  }
});

test("apex /about page uses approved GetPro relationship wording", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/about");
  assert.equal(res.status, 200);
  assert.match(res.text, /BlessBoard is developed and supported using GetPro technology/);
  assert.match(res.text, /Powered by GetPro/);
  assert.match(res.text, /getproapp\.org/);
  assert.match(res.text, /Contact BlessBoard/);
  assert.match(res.text, /Register Your Church/);
  assert.match(res.text, /bb-platform-info-hero/);
  assert.match(res.text, /bb-platform-info-section/);
  assert.doesNotMatch(res.text, /Moovex/i);
  assert.doesNotMatch(res.text, /\bfree\b/i);
  assert.doesNotMatch(res.text, /encrypted|guaranteed uptime|trusted by thousands|market.leading/i);
});

test("apex /features page renders dedicated capability sections", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/features");
  assert.equal(res.status, 200);
  assert.match(res.text, /Everything your church needs in one connected platform/);
  assert.match(res.text, /Public Church Website/);
  assert.match(res.text, /Member Portal/);
  assert.match(res.text, /Branch Administration/);
  assert.match(res.text, /Headquarters and Multi-Branch Management/);
  assert.match(res.text, /Register Your Church/);
  assert.match(res.text, /Contact BlessBoard/);
  assert.match(res.text, /href="\/register-church"/);
  assert.match(res.text, /href="\/contact"/);
  assert.doesNotMatch(res.text, /pricing/i);
});

test("apex /for-churches page renders leader-focused sections", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/for-churches");
  assert.equal(res.status, 200);
  assert.match(res.text, /Common challenges churches face/);
  assert.match(res.text, /How BlessBoard helps/);
  assert.match(res.text, /What a church receives/);
  assert.match(res.text, /Typical onboarding steps/);
  assert.match(res.text, /What church administrators can manage/);
  assert.match(res.text, /Mobile access for members/);
  assert.match(res.text, /Request BlessBoard for your church/);
  assert.match(res.text, /href="\/features"/);
});

test("apex /multi-branch page renders HQ-focused sections", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/multi-branch");
  assert.equal(res.status, 200);
  assert.match(res.text, /Shared platform with separate branch operations/);
  assert.match(res.text, /HQ oversight/);
  assert.match(res.text, /Branch-level administration/);
  assert.match(res.text, /Consistent public identity/);
  assert.match(res.text, /Separate local content/);
  assert.match(res.text, /Role-based access/);
  assert.match(res.text, /Talk to us about multi-branch setup/);
  assert.match(res.text, /Contact BlessBoard/);
});

test("apex homepage includes platform marketing sections and links to dedicated pages", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /One digital home for your church/);
  assert.match(res.text, /id="audiences"/);
  assert.match(res.text, /id="features"/);
  assert.match(res.text, /See full feature list/);
  assert.match(res.text, /href="\/features"/);
  assert.match(res.text, /href="\/multi-branch"/);
  assert.match(res.text, /href="\/for-churches"/);
  assert.match(res.text, /Bring your church community together online/);
  assert.doesNotMatch(res.text, /pricing/i);
});

test("apex header and footer navigation links to dedicated pages", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/");
  for (const href of [
    'href="/features"',
    'href="/for-churches"',
    'href="/multi-branch"',
    'href="/churches"',
    'href="/about"',
    'href="/contact"',
    `href="${BLESSBOARD_REGISTER_CHURCH_PATH}"`,
    'href="/privacy"',
    'href="/terms"',
    'href="/security"',
    'href="/support"',
    'href="/demo"',
    'href="/faq"',
  ]) {
    assert.match(res.text, new RegExp(href), `homepage should include ${href}`);
  }
  assert.doesNotMatch(res.text, /href="\/#features"/);
});

test("apex desktop nav includes Solutions dropdown with Multi-Branch link", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/");
  const navMatch = res.text.match(/<nav class="church-nav church-nav--apex"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(navMatch);
  assert.match(navMatch[1], /href="\/features"[^>]*>Features</);
  assert.match(navMatch[1], /Solutions/);
  assert.match(navMatch[1], /href="\/multi-branch"/);
  assert.match(navMatch[1], /href="\/for-churches"/);
  assert.doesNotMatch(navMatch[1], />Home</);
});

test("branch /about and /contact remain tenant pages on branch host", async () => {
  const app = makeBranchApp();
  const about = await request(app).get("/about");
  assert.equal(about.status, 200);
  assert.match(about.text, /church-about-page|About Us/);
  assert.match(about.text, /data-tenant-header="1"/);
  assert.doesNotMatch(about.text, /About BlessBoard/);

  const contact = await request(app).get("/contact");
  assert.equal(contact.status, 200);
  assert.match(contact.text, /Get in Touch|Send a Message/);
  assert.doesNotMatch(contact.text, /Contact BlessBoard/);
});

test("branch host does not expose apex-only platform routes", async () => {
  const app = makeBranchApp();
  for (const routePath of [
    "/features",
    "/for-churches",
    "/multi-branch",
    "/privacy",
    "/terms",
    "/security",
    "/support",
    "/faq",
    "/demo",
    BLESSBOARD_REGISTER_CHURCH_PATH,
  ]) {
    const res = await request(app).get(routePath);
    assert.equal(res.status, 404, `${routePath} should not exist on branch host`);
  }
});
