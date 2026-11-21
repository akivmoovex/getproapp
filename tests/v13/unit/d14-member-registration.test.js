"use strict";

/**
 * D14 — HQ member field contract and CSRF issuance.
 * Database-free. Does not create a member.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const { parseAddMemberFormBody } = require("../../../src/blessboard/services/blessBoardStaffAddMemberFormService");
const { buildHqAdminShellLocals } = require("../../../src/blessboard/http/hqAdminShellLocals");
const {
  CSRF_FIELD,
  validateCsrf,
  getCsrfCookieName,
} = require("../../../src/platform/http/v5Csrf");

const ROOT = path.join(__dirname, "../../..");
const VIEWS = path.join(ROOT, "views/blessboard/v5");
const BRANCH_ID = "00000000-0000-4000-8000-000000000014";
const TEST_ENV = Object.freeze({
  NODE_ENV: "test",
  SESSION_SECRET: "d14-member-csrf-secret-at-least-32-chars",
});

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function render(relativePath, locals) {
  const filename = path.join(VIEWS, relativePath);
  return ejs.render(fs.readFileSync(filename, "utf8"), locals, { filename });
}

function csrfValues(html) {
  return [...String(html).matchAll(/name="_csrf" value="([^"]*)"/g)].map((match) => match[1]);
}

function fakeResponse(cookies) {
  return {
    cookie(name, value) {
      cookies[name] = value;
    },
  };
}

function shellRequest() {
  return {
    cookies: {},
    signedCookies: {},
    platform: null,
    path: "/hq/members/new",
    url: "/hq/members/new",
    v5Session: {
      authenticated: true,
      session: { userId: "user-d14", user: { displayName: "HQ Admin" } },
    },
    blessBoardAuthorizationContext: null,
    platformSupportBanner: null,
  };
}

async function issueShell(extra) {
  const req = shellRequest();
  const cookies = {};
  const locals = await buildHqAdminShellLocals(req, fakeResponse(cookies), {
    env: TEST_ENV,
    isProduction: false,
    getPool: null,
    activeNav: "members",
    extra: extra || {},
  });
  req.cookies = cookies;
  return { req, cookies, locals };
}

const HQ_FORM = {
  full_name: "D14 Member Example",
  email: "member.d14@example.invalid",
  phone: "+2609771234567",
  address_line_1: "1 QA Street",
  marital_status: "single",
  next_of_kin_name: "QA Contact",
  next_of_kin_relationship: "sibling",
  next_of_kin_phone: "+260971234567",
  branch_id: BRANCH_ID,
};

describe("D14 HQ member registration", () => {
  it("accepts the HQ field contract and requires the membership profile fields", () => {
    const parsed = parseAddMemberFormBody(HQ_FORM);
    assert.equal(parsed.ok, true, JSON.stringify(parsed.fieldErrors));
    assert.equal(parsed.values.fullName, "D14 Member Example");
    assert.equal(parsed.values.email, "member.d14@example.invalid");
    assert.equal(parsed.branchId, BRANCH_ID);
    assert.ok(parsed.demographics.phoneNormalized);
    assert.equal(parsed.profile.address.line1, "1 QA Street");
    assert.equal(parsed.profile.maritalStatus, "single");
    assert.equal(parsed.profile.nextOfKin.name, "QA Contact");

    const blankEmail = parseAddMemberFormBody({ ...HQ_FORM, email: "" });
    assert.equal(blankEmail.ok, true, JSON.stringify(blankEmail.fieldErrors));
    assert.equal(blankEmail.demographics.emailNormalized, null);

    const missing = parseAddMemberFormBody({ email: "not-an-email", marital_status: "nope" });
    assert.equal(missing.ok, false);
    assert.ok(missing.fieldErrors.some((item) => item.field === "full_name"));
    assert.ok(missing.fieldErrors.some((item) => item.field === "phone"));
    assert.ok(missing.fieldErrors.some((item) => item.field === "branch_id"));
    assert.ok(missing.fieldErrors.some((item) => item.field === "email"));
    assert.ok(missing.fieldErrors.some((item) => item.field === "marital_status"));
    assert.ok(missing.fieldErrors.some((item) => item.field === "address_line_1"));
    assert.ok(missing.fieldErrors.some((item) => item.field === "next_of_kin_name"));
    assert.ok(missing.fieldErrors.some((item) => item.field === "next_of_kin_relationship"));
    assert.ok(missing.fieldErrors.some((item) => item.field === "next_of_kin_phone"));

    const badKin = parseAddMemberFormBody({
      ...HQ_FORM,
      next_of_kin_phone: "not-a-phone",
    });
    assert.equal(badKin.ok, false);
    assert.ok(badKin.fieldErrors.some((item) => item.field === "next_of_kin_phone"));
  });

  it("renders required name, phone, and branch with an optional email and visible errors", async () => {
    const issued = await issueShell({
      pageTitle: "Add member",
      form: {
        values: { fullName: "", email: "bad", phone: "", branchId: "" },
        fieldErrors: [
          { field: "full_name", message: "Full legal name is required." },
          { field: "phone", message: "Enter a valid primary phone number." },
          { field: "email", message: "Enter a valid email or leave blank." },
          { field: "address_line_1", message: "Residential address is required." },
          { field: "branch_id", message: "Assigned branch is required." },
        ],
        maritalOptions: ["single"],
        relationshipOptions: ["sibling"],
      },
      branches: [{ id: BRANCH_ID, displayName: "Central", key: "central", status: "active" }],
    });
    const html = render("hq/member-add.ejs", issued.locals);
    assert.match(html, /data-bb-hq-add-member-form="1"/);
    assert.match(html, /name="full_name"[^>]*required/);
    assert.match(html, /name="phone"[^>]*required/);
    assert.match(html, /name="branch_id"[^>]*required/);
    assert.match(html, /name="address_line_1"[^>]*required/);
    assert.match(html, /name="marital_status"[^>]*required/);
    assert.match(html, /name="next_of_kin_name"[^>]*required/);
    assert.match(html, /name="next_of_kin_relationship"[^>]*required/);
    assert.match(html, /name="next_of_kin_phone"[^>]*required/);
    assert.match(html, /Residential address is required/);
    assert.match(html, /Portal activation remains pending after creation/);
    assert.match(html, /aria-invalid="true"/);
    assert.match(html, /Full legal name is required/);
    assert.match(html, /Enter a valid primary phone number/);
    assert.match(html, /Assigned branch is required/);
    const email = html.match(/<input[^>]*name="email"[^>]*>/i);
    assert.ok(email);
    assert.doesNotMatch(email[0], /\brequired\b/);
    assert.doesNotMatch(html, /<label[^>]*>Last name<\/label>/);
    assert.match(html, /Select a branch/);
    assert.match(html, />Central</);
  });

  it("shows the same supported fields on review, created, and directory views", async () => {
    const issued = await issueShell({
      pageTitle: "Review new member",
      draftToken: "draft-token-d14",
      review: {
        values: {
          fullName: "D14 Member Example",
          phone: "+2609771234567",
          email: "member.d14@example.invalid",
          branchId: BRANCH_ID,
          branchName: "Central",
          addressLine1: "1 QA Street",
          maritalStatus: "single",
          nextOfKinName: "QA Contact",
          nextOfKinRelationship: "sibling",
          nextOfKinPhone: "+260971234567",
        },
      },
    });
    const review = render("hq/member-review.ejs", issued.locals);
    assert.match(review, /Review new member/);
    assert.match(review, /D14 Member Example/);
    assert.match(review, /\+2609771234567/);
    assert.match(review, /member\.d14@example\.invalid/);
    assert.match(review, /Central/);
    assert.match(review, /1 QA Street/);
    assert.match(review, /QA Contact/);
    assert.match(review, /not_activated/);
    assert.match(review, /name="draft_token" value="draft-token-d14"/);
    assert.match(review, /name="action" value="confirm_create"/);

    const createdLocals = await issueShell({
      member: {
        id: BRANCH_ID,
        firstName: "D14",
        lastName: "Member Example",
        phoneDisplay: "+2609771234567",
        emailDisplay: "member.d14@example.invalid",
        branchDisplayName: "Central",
        portalAccessStatus: "not_activated",
      },
    });
    const created = render("hq/member-created.ejs", createdLocals.locals);
    assert.match(created, /D14 Member Example/);
    assert.match(created, /\+2609771234567/);
    assert.match(created, /member\.d14@example\.invalid/);
    assert.match(created, /Central/);
    assert.match(created, /not_activated/);

    const directory = read("views/blessboard/v5/hq/members.ejs");
    assert.match(directory, /<th scope="col">Phone<\/th>/);
    assert.match(directory, /<th scope="col">Email<\/th>/);
    assert.match(directory, /<th scope="col">Branch<\/th>/);
    assert.match(directory, /item\.firstName %> <%= item\.lastName/);
  });

  it("issues one CSRF token for the cookie, logout forms, and member form", async () => {
    const stale = "stale-token-must-not-render";
    const issued = await issueShell({
      pageTitle: "Add member",
      csrfToken: stale,
      csrfField: "forged",
      form: { values: {}, fieldErrors: [] },
      branches: [{ id: BRANCH_ID, displayName: "Central", key: "central", status: "active" }],
    });
    const cookieName = getCsrfCookieName(TEST_ENV);
    const html = render("hq/member-add.ejs", issued.locals);
    const tokens = csrfValues(html);
    assert.ok(tokens.length >= 2, "shell logout and member form must both carry the token");
    assert.ok(tokens.every((token) => token === issued.locals.csrfToken));
    assert.equal(issued.cookies[cookieName], issued.locals.csrfToken);
    assert.equal(issued.locals.csrfField, CSRF_FIELD);
    assert.equal(validateCsrf(issued.req, issued.locals.csrfToken, TEST_ENV), true);
    assert.equal(validateCsrf(issued.req, "", TEST_ENV), false);
    assert.equal(validateCsrf(issued.req, `${issued.locals.csrfToken}mismatch`, TEST_ENV), false);
    assert.doesNotMatch(html, new RegExp(stale));

    const refreshed = await issueShell({
      pageTitle: "Add member",
      form: { values: {}, fieldErrors: [] },
      branches: [],
    });
    const refreshedHtml = render("hq/member-add.ejs", refreshed.locals);
    const refreshedTokens = csrfValues(refreshedHtml);
    assert.notEqual(refreshed.locals.csrfToken, issued.locals.csrfToken);
    assert.ok(refreshedTokens.every((token) => token === refreshed.cookies[cookieName]));
    assert.equal(validateCsrf(issued.req, issued.locals.csrfToken, TEST_ENV), true);
    assert.equal(validateCsrf(refreshed.req, issued.locals.csrfToken, TEST_ENV), false);

    const routes = read("src/blessboard/http/hqMembersAdminRoutes.js");
    assert.match(routes, /createRequireBlessBoardPermission\("members\.create"/);
    assert.doesNotMatch(routes, /issueCsrfToken\s*\(/);
    assert.match(routes, /Invalid or missing CSRF token/);
    const getHandler = routes.match(
      /router\.get\("\/hq\/members\/new"[\s\S]*?return res\.status\(200\)/
    );
    assert.ok(getHandler);
    assert.equal((getHandler[0].match(/shellLocals\(/g) || []).length, 1);
  });
});
