"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const ejs = require("ejs");

const churchRoutes = require("../src/routes/church");
const { BLESSBOARD_NAME } = require("../src/church/branding");
const websiteContentService = require("../src/services/church/websiteContentService");
const givingSettingsService = require("../src/services/church/givingSettingsService");
const { validatePublicContactBody } = require("../src/church/contactSubmissionValidation");

const CSS_PATH = path.join(__dirname, "../public/church/church.css");
const GIVING_VIEW = path.join(__dirname, "../views/church/public/giving.ejs");
const CONTACT_VIEW = path.join(__dirname, "../views/church/public/contact.ejs");
const ABOUT_VIEW = path.join(__dirname, "../views/church/public/about.ejs");
const LEADERSHIP_VIEW = path.join(__dirname, "../views/church/public/leadership.ejs");
const EVENTS_VIEW = path.join(__dirname, "../views/church/public/events.ejs");
const SERMONS_VIEW = path.join(__dirname, "../views/church/public/sermons.ejs");
const PUBLIC_PAGES = path.join(__dirname, "../src/routes/church/publicPages.js");
const CONTACT_VALIDATION = path.join(__dirname, "../src/church/contactSubmissionValidation.js");

function makeApp(ctx, { inject } = {}) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    next();
  });
  if (inject) {
    app.use((req, res, next) => {
      const render = res.render.bind(res);
      res.render = (view, locals, cb) => render(view, { ...(locals || {}), ...inject(view, locals || {}) }, cb);
      next();
    });
  }
  app.use(churchRoutes());
  return app;
}

function tenantCtx(extraBranch = {}) {
  return {
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Alpha Grace Church", status: "active" },
    branch: {
      id: 1,
      name: "Downtown Branch",
      status: "active",
      host_slug: "demo",
      location_text: "12 Faith Street",
      contact_phone: "+260971111111",
      contact_email: "office@example.com",
      service_times: "Sunday Worship · 10:00 AM",
      ...extraBranch,
    },
  };
}

function emptyContactCtx() {
  return tenantCtx({
    location_text: "",
    contact_phone: "",
    contact_email: "",
    service_times: "",
  });
}

function makeTenantApp(opts) {
  return makeApp(tenantCtx(), opts);
}

function makeApexApp() {
  return makeApp({ kind: "vertical-apex", host: "blessboard.com", organization: null, branch: null });
}

function baseLocals(activePage, extras = {}) {
  return {
    ...websiteContentService.preparePublicViewModel(
      tenantCtx().organization,
      tenantCtx().branch,
      {},
      { activePage }
    ),
    isVerticalApex: false,
    isPreview: false,
    metaDescription: "",
    blessboardPublicUrl: "https://blessboard.com",
    contactSubmitted: false,
    contactError: null,
    contactForm: {},
    ...extras,
  };
}

async function renderView(viewPath, locals) {
  return ejs.renderFile(viewPath, locals, { root: path.join(__dirname, "../views") });
}

test("1-4 Giving and Contact routes and page roots render", async () => {
  const app = makeTenantApp();
  const giving = await request(app).get("/giving");
  const contact = await request(app).get("/contact");
  assert.equal(giving.status, 200);
  assert.equal(contact.status, 200);
  assert.match(giving.text, /church-giving-page/);
  assert.match(giving.text, /data-giving-page="1"/);
  assert.match(contact.text, /church-contact-page/);
  assert.match(contact.text, /data-contact-page="1"/);
});

test("5-10 real giving information, empty state, and no demo channels", async () => {
  const empty = await request(makeTenantApp()).get("/giving");
  assert.match(empty.text, /Giving details coming soon/);
  assert.match(empty.text, /church-empty-state|church-public-empty-state/);
  assert.match(empty.text, /Contact Church/);
  assert.doesNotMatch(empty.text, /5821 0000 4567 890|giving-qr-demo\.png|Demo QR/);
  assert.doesNotMatch(empty.text, /Airtel Money|MTN MoMo|Request Details|Give Online|Give Now/);

  const html = await renderView(GIVING_VIEW, {
    ...baseLocals("giving"),
    givingDisplay: givingSettingsService.prepareGivingDisplay(
      {
        bank_name: "Zanaco",
        account_name: "Alpha Grace Church",
        account_number: "1234567890",
        branch_code: "001",
        swift_code: "",
        mobile_money_provider_1: "Airtel Money",
        mobile_money_number_1: "0977123456",
        mobile_money_name_1: "Alpha Grace",
        giving_categories_json: ["Tithe", "Offering"],
        giving_instructions: "Use your member ID in the payment reference.",
        qr_code_label: "Scan to give",
        giving_qr_url: "/church/uploads/giving-qr.png",
        finance_contact_name: "",
        finance_contact_phone: "",
      },
      null,
      { audience: "public", churchName: "Alpha Grace Church" }
    ),
  });
  assert.match(html, /Zanaco/);
  assert.match(html, /1234567890/);
  assert.match(html, /Airtel Money/);
  assert.match(html, /0977123456/);
  assert.match(html, /Tithe/);
  assert.match(html, /Use your member ID in the payment reference/);
  assert.match(html, /giving-qr\.png/);
  assert.doesNotMatch(html, /giving-qr-demo\.png/);
  assert.doesNotMatch(html, /Give Online|Donation history|Recent Contributions/);
});

test("10 cross-tenant giving information does not render from unrelated settings", async () => {
  const html = await renderView(GIVING_VIEW, {
    ...baseLocals("giving"),
    churchName: "Alpha Grace Church",
    givingDisplay: givingSettingsService.prepareGivingDisplay(null, null, {
      audience: "public",
      churchName: "Alpha Grace Church",
    }),
  });
  assert.doesNotMatch(html, /Other Tenant Bank|9999999999|Foreign MoMo/);
  assert.match(html, /Giving details coming soon/);
});

test("11-17 real contact fields, no hardcoded Kafue/admin, reduced state", async () => {
  const populated = await request(makeTenantApp()).get("/contact");
  assert.match(populated.text, /12 Faith Street/);
  assert.match(populated.text, /\+260971111111/);
  assert.match(populated.text, /office@example\.com/);
  assert.match(populated.text, /Sunday Worship/);
  assert.match(populated.text, /10:00 AM/);
  assert.doesNotMatch(populated.text, /Plot 452, Main Street, Kafue|KAFUE, ZAMBIA|Kafue Central/);
  assert.doesNotMatch(populated.text, /pastor@|admin@|private\.admin/);
  assert.doesNotMatch(populated.text, /08:30|11:00 AM First Service/);

  const reduced = await request(makeApp(emptyContactCtx())).get("/contact");
  assert.match(reduced.text, /Contact details coming soon|church-empty-state|church-public-empty-state/);
  assert.doesNotMatch(reduced.text, /Not available/);
  assert.doesNotMatch(reduced.text, /contact-map-mobile\.jpg|contact-map-desktop\.jpg/);
});

test("18-23 contact form, validation, success/error, and existing protections", async () => {
  const page = await request(makeTenantApp()).get("/contact");
  assert.match(page.text, /action="\/contact"/);
  assert.match(page.text, /name="full_name"/);
  assert.match(page.text, /name="email"/);
  assert.match(page.text, /name="phone"/);
  assert.match(page.text, /name="message"/);
  assert.equal((page.text.match(/action="\/contact"/g) || []).length, 1);

  const validationSrc = fs.readFileSync(CONTACT_VALIDATION, "utf8");
  assert.match(validationSrc, /validatePublicContactBody/);
  assert.match(validationSrc, /Please enter your name/);
  assert.match(validationSrc, /email address or phone number/);

  const routeSrc = fs.readFileSync(PUBLIC_PAGES, "utf8");
  assert.match(routeSrc, /validatePublicContactBody/);
  assert.match(routeSrc, /createContactSubmissionForBranch/);
  assert.match(routeSrc, /contact\?submitted=1/);
  assert.match(routeSrc, /organization_id: ctx\.organization\.id/);
  assert.match(routeSrc, /branch_id: ctx\.branch\.id/);

  assert.equal(validatePublicContactBody({ full_name: "", message: "hello there!!" }).ok, false);
  assert.equal(
    validatePublicContactBody({
      full_name: "Visitor",
      email: "ok@example.com",
      message: "Hello church friends.",
    }).ok,
    true
  );

  const err = await request(makeTenantApp()).post("/contact").type("form").send({
    full_name: "",
    message: "short",
  });
  assert.equal(err.status, 400);
  assert.match(err.text, /church-alert--error|Please enter your name/);

  const success = await request(makeTenantApp()).get("/contact?submitted=1");
  assert.match(success.text, /church-alert--success|Thank you for your message/);

  // Public contact form historically has no CSRF field; authenticated portals keep CSRF separately.
  assert.doesNotMatch(page.text, /name="_csrf"/);
  assert.match(fs.readFileSync(path.join(__dirname, "../src/routes/church/auth.js"), "utf8"), /churchCsrfToken/);
});

test("24-25 safe directions URL attributes; unsafe URL omitted", async () => {
  const safe = await renderView(CONTACT_VIEW, {
    ...baseLocals("contact"),
    mapEmbedPlaceholder: "https://maps.example.com/place/alpha",
  });
  assert.match(safe, /href="https:\/\/maps\.example\.com\/place\/alpha"/);
  assert.match(safe, /rel="noopener noreferrer"/);
  assert.match(safe, /target="_blank"/);
  assert.match(safe, /Get Directions/);

  const unsafe = await renderView(CONTACT_VIEW, {
    ...baseLocals("contact"),
    mapEmbedPlaceholder: "javascript:alert(1)",
  });
  assert.doesNotMatch(unsafe, /javascript:alert/);
  assert.doesNotMatch(unsafe, /Get Directions/);
});

test("26-29 desktop and mobile class markers on single responsive trees", async () => {
  const giving = await request(makeTenantApp()).get("/giving");
  const contact = await request(makeTenantApp()).get("/contact");
  assert.match(giving.text, /church-giving-desktop/);
  assert.match(giving.text, /church-giving-mobile/);
  assert.match(contact.text, /church-contact-desktop/);
  assert.match(contact.text, /church-contact-mobile/);
  assert.doesNotMatch(giving.text, /home-desktop-design|home-mobile-design/);
  assert.doesNotMatch(contact.text, /home-desktop-design|home-mobile-design/);
  assert.equal((giving.text.match(/data-giving-page="1"/g) || []).length, 1);
  assert.equal((contact.text.match(/data-contact-page="1"/g) || []).length, 1);
});

test("30-33 active nav, member actions, and single footer attribution", async () => {
  const giving = await request(makeTenantApp()).get("/giving");
  const contact = await request(makeTenantApp()).get("/contact");
  assert.match(giving.text, /church-nav__active[^>]*>\s*Giving|href="\/giving"[^>]*church-nav__active/);
  assert.match(contact.text, /church-nav__active[^>]*>\s*Contact|href="\/contact"[^>]*church-nav__active/);
  assert.match(giving.text, /Member Login|\/login/);
  assert.match(giving.text, /Register as a Member|\/register/);
  assert.match(contact.text, /Member Login|\/login/);
  assert.match(contact.text, /Register as a Member|\/register/);
  assert.match(giving.text, /bb-powered-by__getpro/);
  assert.match(contact.text, /bb-powered-by__getpro/);
  assert.match(giving.text, /bb-powered-by__label/);
  assert.doesNotMatch(giving.text, /bb-saas-footer|Church Administrator Login/);
});

test("34-35 Home/About/Leadership/Ministries/Events/Sermons and apex remain unchanged", async () => {
  const app = makeTenantApp();
  for (const [route, marker] of [
    ["/", /data-tenant-home="1"/],
    ["/about", /church-about-page/],
    ["/leadership", /church-leadership-page/],
    ["/ministries", /bb-public-ministries|data-ministries-page/],
    ["/events", /church-events-page/],
    ["/sermons", /church-sermons-page/],
  ]) {
    const res = await request(app).get(route);
    assert.equal(res.status, 200, route);
    assert.match(res.text, marker);
  }

  const aboutSrc = fs.readFileSync(ABOUT_VIEW, "utf8");
  const leadershipSrc = fs.readFileSync(LEADERSHIP_VIEW, "utf8");
  const eventsSrc = fs.readFileSync(EVENTS_VIEW, "utf8");
  const sermonsSrc = fs.readFileSync(SERMONS_VIEW, "utf8");
  assert.match(aboutSrc, /church-about-page/);
  assert.match(leadershipSrc, /church-leadership-page/);
  assert.match(eventsSrc, /church-events-page/);
  assert.match(sermonsSrc, /church-sermons-page/);

  const apex = await request(makeApexApp()).get("/");
  assert.equal(apex.status, 200);
  assert.match(apex.text, new RegExp(BLESSBOARD_NAME));
  assert.match(apex.text, /Find Your Church|One digital home for your church/);
});

test("36-37 no duplicate IDs and CSS selectors for page roots", async () => {
  const contact = await request(makeTenantApp()).get("/contact");
  assert.equal((contact.text.match(/id="contact_full_name"/g) || []).length, 1);
  assert.equal((contact.text.match(/id="contact_email"/g) || []).length, 1);
  assert.equal((contact.text.match(/id="contact_message"/g) || []).length, 1);

  const css = fs.readFileSync(CSS_PATH, "utf8");
  assert.match(css, /\.church-giving-page\s*\{/);
  assert.match(css, /\.church-contact-page\s*\{/);
  assert.match(css, /\.church-giving-page__grid/);
  assert.match(css, /\.church-contact-page__main/);
  assert.doesNotMatch(css, /\.church-contact-mobile\s*\{/);
  assert.doesNotMatch(css, /\.church-giving-mobile\s*\{/);
});
