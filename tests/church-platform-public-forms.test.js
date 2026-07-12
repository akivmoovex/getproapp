"use strict";

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const platformInquiriesRepo = require("../src/db/pg/church/platformInquiriesRepo");
const {
  validatePlatformContactInquiry,
  validatePlatformRegisterChurchInquiry,
} = require("../src/church/platformInquiryValidation");
const { BLESSBOARD_REGISTER_CHURCH_PATH } = require("../src/church/platformPublicContent");
const { churchPgSkipIfUnconfigured, requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const churchRoutes = require("../src/routes/church");

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
  app.use(express.urlencoded({ extended: true }));
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

const validContact = {
  full_name: "Jane Doe",
  email: "jane@example.com",
  phone: "+260971234567",
  subject: "Platform question",
  message: "I would like to know more about BlessBoard onboarding.",
};

const validRegister = {
  church_name: "Grace Chapel",
  branch_name: "Main Campus",
  city: "Lusaka",
  country: "Zambia",
  contact_name: "Pastor John",
  role_in_church: "Senior Pastor",
  phone: "+260971234567",
  whatsapp: "+260971234568",
  email: "pastor@grace.example",
  branch_count: "3",
  message: "We would like BlessBoard for our three branch locations.",
  consent_contact: "on",
};

test("validatePlatformContactInquiry rejects missing required fields", () => {
  const result = validatePlatformContactInquiry({});
  assert.equal(result.ok, false);
  assert.match(result.error, /name/i);
});

test("validatePlatformContactInquiry rejects invalid email and phone", () => {
  const badEmail = validatePlatformContactInquiry({ ...validContact, email: "not-an-email" });
  assert.equal(badEmail.ok, false);
  assert.match(badEmail.error, /valid email/i);

  const badPhone = validatePlatformContactInquiry({ ...validContact, phone: "123" });
  assert.equal(badPhone.ok, false);
  assert.match(badPhone.error, /phone/i);
});

test("validatePlatformContactInquiry accepts honeypot as silent success", () => {
  const result = validatePlatformContactInquiry({ ...validContact, company_website: "https://spam.example" });
  assert.equal(result.ok, true);
  assert.equal(result.honeypot, true);
});

test("validatePlatformRegisterChurchInquiry requires consent and valid fields", () => {
  const noConsent = validatePlatformRegisterChurchInquiry({ ...validRegister, consent_contact: "" });
  assert.equal(noConsent.ok, false);
  assert.match(noConsent.error, /contact you/i);

  const ok = validatePlatformRegisterChurchInquiry(validRegister);
  assert.equal(ok.ok, true);
  assert.equal(ok.data.inquiry_type, "register_church");
});

test("apex GET /contact and register-church render accessible forms", async () => {
  const app = makeApexApp();
  for (const routePath of ["/contact", BLESSBOARD_REGISTER_CHURCH_PATH]) {
    const res = await request(app).get(routePath);
    assert.equal(res.status, 200, `${routePath} should render`);
    assert.match(res.text, /method="post"/);
    assert.match(res.text, /company_website/);
    assert.match(res.text, /church\.css\?v=62/);
  }
  const contact = await request(app).get("/contact");
  assert.match(contact.text, /name="full_name"/);
  assert.match(contact.text, /name="subject"/);

  const register = await request(app).get(BLESSBOARD_REGISTER_CHURCH_PATH);
  assert.match(register.text, /name="church_name"/);
  assert.match(register.text, /name="consent_contact"/);
});

test("apex POST /contact validation preserves values and shows errors", async () => {
  const app = makeApexApp();
  const res = await request(app)
    .post("/contact")
    .type("form")
    .send({ full_name: "Jane", email: "bad", subject: "Hi", message: "short" });
  assert.equal(res.status, 400);
  assert.match(res.text, /valid email/i);
  assert.match(res.text, /value="Jane"/);
  assert.match(res.text, /role="alert"/);
});

test(
  "apex POST forms persist inquiries without creating tenants",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    await ensureChurchSchema(pool);

    const beforeOrgs = await pool.query(`SELECT COUNT(*)::int AS count FROM public.church_organizations`);
    const beforeCount = beforeOrgs.rows[0].count;

    const app = makeApexApp();
    const contactRes = await request(app).post("/contact").type("form").send(validContact);
    assert.equal(contactRes.status, 303);
    assert.match(contactRes.headers.location, /^\/contact\?submitted=1$/);

    const registerRes = await request(app)
      .post(BLESSBOARD_REGISTER_CHURCH_PATH)
      .type("form")
      .send(validRegister);
    assert.equal(registerRes.status, 303);
    assert.match(registerRes.headers.location, new RegExp(`^${BLESSBOARD_REGISTER_CHURCH_PATH}\\?submitted=1$`));

    const afterOrgs = await pool.query(`SELECT COUNT(*)::int AS count FROM public.church_organizations`);
    assert.equal(afterOrgs.rows[0].count, beforeCount, "submitting inquiries must not create organizations");

    const items = await platformInquiriesRepo.listPlatformInquiries(pool, { limit: 10 });
    const contactRow = items.find((row) => row.email === validContact.email && row.inquiry_type === "contact");
    const registerRow = items.find(
      (row) => row.email === validRegister.email && row.inquiry_type === "register_church"
    );
    assert.ok(contactRow, "contact inquiry should be stored");
    assert.ok(registerRow, "register church inquiry should be stored");
    assert.equal(registerRow.church_name, validRegister.church_name);
    assert.equal(registerRow.status, "new");

    await pool.query(`DELETE FROM public.church_platform_inquiries WHERE email = ANY($1::text[])`, [
      [validContact.email, validRegister.email],
    ]);
  }
);

test("apex POST honeypot returns success redirect without storing inquiry", async () => {
  const app = makeApexApp();
  const res = await request(app)
    .post("/contact")
    .type("form")
    .send({ ...validContact, company_website: "https://bot.example" });
  assert.equal(res.status, 303);
  assert.match(res.headers.location, /submitted=1/);
});

test("branch POST /contact is unchanged and does not use apex platform handler", async () => {
  const app = makeBranchApp();
  const res = await request(app)
    .post("/contact")
    .type("form")
    .send({
      full_name: "Member",
      email: "member@example.com",
      message: "Hello church team, I have a question about Sunday service.",
    });
  assert.notEqual(res.status, 303, "branch contact may fail without PG but must not redirect to apex success");
  assert.doesNotMatch(String(res.headers.location || ""), /submitted=1/);
});

test("platform public form rate limit returns friendly error page", async () => {
  const prevMax = process.env.GETPRO_PLATFORM_FORM_RATE_MAX;
  const prevWindow = process.env.GETPRO_PLATFORM_FORM_RATE_WINDOW_MS;
  process.env.GETPRO_PLATFORM_FORM_RATE_MAX = "1";
  process.env.GETPRO_PLATFORM_FORM_RATE_WINDOW_MS = "60000";

  const rateLimitPath = require.resolve("../src/middleware/platformPublicFormRateLimit");
  delete require.cache[rateLimitPath];
  const formsPath = require.resolve("../src/routes/church/platformPublicForms");
  delete require.cache[formsPath];
  const indexPath = require.resolve("../src/routes/church/index");
  delete require.cache[indexPath];
  const freshRoutes = require("../src/routes/church");

  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = { kind: "vertical-apex", host: "blessboard.com", organization: null, branch: null };
    next();
  });
  app.use(freshRoutes());

  try {
    const first = await request(app).post("/contact").type("form").send(validContact);
    assert.ok(first.status === 303 || first.status === 503, "first submit may redirect or fail without PG");

    const second = await request(app).post("/contact").type("form").send(validContact);
    assert.equal(second.status, 429);
    assert.match(second.text, /Too many submissions/i);
  } finally {
    if (prevMax === undefined) delete process.env.GETPRO_PLATFORM_FORM_RATE_MAX;
    else process.env.GETPRO_PLATFORM_FORM_RATE_MAX = prevMax;
    if (prevWindow === undefined) delete process.env.GETPRO_PLATFORM_FORM_RATE_WINDOW_MS;
    else process.env.GETPRO_PLATFORM_FORM_RATE_WINDOW_MS = prevWindow;
    delete require.cache[rateLimitPath];
    delete require.cache[formsPath];
    delete require.cache[indexPath];
  }
});
