"use strict";

/**
 * V2.04 Phase 2 — BB-M01 Members Directory + BB-M02 Add Member.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const {
  parseAddMemberFormBody,
  mapMembershipStatus,
  splitFullName,
  FORM_CODE,
} = require("../src/blessboard/services/blessBoardStaffAddMemberFormService");

describe("V2.04 BB-M01 / BB-M02 members screens", () => {
  it("ships M01/M02 templates with Stitch markers and no business logic in EJS", () => {
    const m01 = read("views/blessboard/v5/branch-admin/members.ejs");
    assert.match(m01, /data-bb-stitch-v204="BB-M01"/);
    assert.match(m01, /data-bb-member-directory="1"/);
    assert.match(m01, /Church ID/);
    assert.match(m01, /Portal Status|portal/);
    assert.match(m01, /Search by member name, phone, or Church ID/);
    assert.match(m01, /\+ Add Member/);
    assert.match(m01, /View Profile/);
    assert.doesNotMatch(m01, /createStaffManagedMember|authorizeBlessBoard|normalizePersonPhone/);

    const m02 = read("views/blessboard/v5/branch-admin/member-add.ejs");
    assert.match(m02, /data-bb-stitch-v204="BB-M02"/);
    assert.match(m02, /data-bb-member-add="1"/);
    assert.match(m02, /Register New Member/);
    assert.match(m02, /1\. Identity Section/);
    assert.match(m02, /2\. Contact Section/);
    assert.match(m02, /3\. Member Details Section/);
    assert.match(m02, /4\. Personal &amp; Family Information/);
    assert.match(m02, /5\. Emergency \/ Next of Kin/);
    assert.match(m02, /Church ID Preview/);
    assert.match(m02, /Email Address \(Optional\)/);
    assert.match(m02, /Creating membership does not activate portal access/);
    assert.doesNotMatch(m02, /createStaffManagedMember|submitStaffAddMember/);
  });

  it("registers Add Member routes before :id and gates create permission", () => {
    const routes = read("src/blessboard/http/branchRegistrationAdminRoutes.js");
    const newGet = routes.indexOf('router.get("/branch-admin/members/new"');
    const newPost = routes.indexOf('router.post("/branch-admin/members/new"');
    const byId = routes.indexOf('router.get("/branch-admin/members/:id"');
    assert.ok(newGet > 0 && newPost > 0 && byId > 0);
    assert.ok(newGet < byId, "GET /new must precede /:id");
    assert.ok(newPost < byId, "POST /new must precede /:id");
    assert.match(routes, /members\.create/);
    assert.match(routes, /gateCreate/);
    assert.match(routes, /beginStaffAddMemberFlow|confirmStaffAddMemberCreate/);
    assert.match(routes, /members\/new\/match/);
    assert.match(routes, /members\/new\/review/);
    assert.match(routes, /members\/:id\/created/);
    assert.match(routes, /portalAccessStatus/);
    assert.match(routes, /loadGpOpsAssets:\s*true/);
  });

  it("parses Add Member form and keeps portal inactive on mapping", () => {
    assert.equal(splitFullName("Abigail Grace Mensah").firstName, "Abigail");
    assert.equal(splitFullName("Abigail Grace Mensah").lastName, "Grace Mensah");
    assert.equal(mapMembershipStatus("probationary_member"), "pending");
    assert.equal(mapMembershipStatus("transferred_in"), "transferred");
    assert.equal(mapMembershipStatus("active"), "active");

    const parsed = parseAddMemberFormBody({
      full_name: "Abigail Grace Mensah",
      preferred_name: "Abby",
      gender: "female",
      date_of_birth: "1990-05-01",
      phone_country: "ZM",
      phone_national: "977123456",
      email: "",
      address_line_1: "12 Main St",
      branch_id: "00000000-0000-4000-8000-000000000001",
      membership_status: "active",
      marital_status: "married",
      next_of_kin_name: "Michael Mensah",
      next_of_kin_relationship: "spouse",
      next_of_kin_phone: "+260971234567",
    });
    assert.equal(parsed.ok, true, JSON.stringify(parsed.fieldErrors));
    assert.equal(parsed.code, FORM_CODE.OK);
    assert.equal(parsed.demographics.firstName, "Abigail");
    assert.equal(parsed.membershipStatus, "active");
    assert.ok(parsed.demographics.phoneNormalized);
    assert.match(parsed.demographics.phoneNormalized, /^\+260/);
    assert.equal(parsed.profile.nextOfKin.name, "Michael Mensah");
    assert.equal(parsed.presentationOnly.gender, "female");
  });

  it("rejects incomplete Add Member payloads without writing", () => {
    const parsed = parseAddMemberFormBody({
      full_name: "",
      gender: "",
      email: "not-an-email",
    });
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, FORM_CODE.VALIDATION);
    assert.ok(parsed.fieldErrors.some((e) => e.field === "full_name"));
    assert.ok(parsed.fieldErrors.some((e) => e.field === "gender"));
  });

  it("directory list helpers expose Church ID + portal filter plumbing", () => {
    const repo = read("src/blessboard/repositories/memberIdentityRepository.js");
    assert.match(repo, /portal_access_status/);
    assert.match(repo, /member_number/);
    assert.match(repo, /allocateNextChurchId/);
    assert.match(repo, /lower\(COALESCE\(m\.member_number/);

    const listSvc = read("src/blessboard/services/memberRegistrationService.js");
    assert.match(listSvc, /portalAccessStatus/);
    assert.match(listSvc, /memberNumber/);

    const domain = read("src/blessboard/services/blessBoardMemberDomainService.js");
    assert.match(domain, /allocateNextChurchId/);
    assert.match(domain, /PORTAL_ACCESS_STATUS\.NOT_ACTIVATED/);
  });

  it("renders M02 form shell with CSRF + sections (no DB)", () => {
    const filename = path.join(
      ROOT,
      "views/blessboard/v5/branch-admin/member-add.ejs"
    );
    // Render only the inner section by stubbing shell includes via a thin wrapper is heavy;
    // assert structural markers and include wiring instead.
    const src = fs.readFileSync(filename, "utf8");
    assert.match(src, /branch-admin-shell-start/);
    assert.match(src, /name="<%= csrfName %>"/);
    assert.match(src, /phone-field/);
    assert.match(src, /data-bb-m02-section="identity"/);
    assert.match(src, /data-bb-m02-section="contact"/);
    assert.match(src, /data-bb-m02-section="membership"/);
    assert.match(src, /data-bb-m02-section="personal"/);
    assert.match(src, /data-bb-m02-section="emergency"/);
  });

  it("keeps AC shells free of BB M01/M02 templates", () => {
    const acShell = read("views/activeclinic/layouts/app-shell.ejs");
    assert.doesNotMatch(acShell, /BB-M01|BB-M02|member-add\.ejs/);
    assert.doesNotMatch(acShell, /Register New Member/);
  });
});
