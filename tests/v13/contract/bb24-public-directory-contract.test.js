"use strict";

/**
 * BB-24 — Public directory card targeting and contact/join identity contracts.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  mapDirectoryVisitUrl,
  mapDirectoryItems,
} = require("../../../src/blessboard/http/apexMarketingContent");

const ROOT = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("BB-24 public directory and church contact/join contracts", () => {
  it("directory cards target the selected church path, not owner registration", () => {
    const href = mapDirectoryVisitUrl({
      slug: "grace-chapel",
      preview_branch_slug: "hq",
    });
    assert.ok(href);
    assert.match(href, /\/c\/grace-chapel/);
    assert.doesNotMatch(href, /register-church/);

    const items = mapDirectoryItems([
      { slug: "alpha-church", branch_slug: "main", name: "Alpha" },
      { slug: "beta-church", name: "Beta" },
    ]);
    assert.ok(items[0].visit_href.includes("/c/alpha-church"));
    assert.ok(items[1].visit_href.includes("/c/beta-church"));
    assert.equal(items[0].visit_label, "Visit Church");
  });

  it("directory template renders visit, contact, and join for the selected church", () => {
    const tpl = read("views/blessboard/v5/apex/directory.ejs");
    assert.match(tpl, /item\.visit_href/);
    assert.match(tpl, /item\.contact_href/);
    assert.match(tpl, /item\.join_href/);
    assert.match(tpl, /Visit Church/);
    assert.match(tpl, /Contact Church/);
    assert.match(tpl, /Join Church/);
    assert.match(tpl, /data-bb-directory-action="contact"/);
    assert.match(tpl, /data-bb-directory-action="join"/);
    assert.match(tpl, /action="\/directory"/);
    const card = tpl.slice(tpl.indexOf("bb-apex-directory-card__actions"), tpl.indexOf("bb-apex-directory-pager"));
    assert.doesNotMatch(card, /register-church/);
    assert.match(tpl, /register-church/);
  });

  it("apex /directory route is mounted and legacy finder redirects into it", () => {
    const src = read("src/blessboard/http/apexMarketingRoutes.js");
    assert.match(src, /router\.get\("\/directory"/);
    assert.match(src, /\/c\/\$\{encodeURIComponent\(slug\)\}/);
  });

  it("platform /contact stays BlessBoard support and does not write a church enquiry", () => {
    const routes = read("src/blessboard/http/apexMarketingRoutes.js");
    assert.match(routes, /Network is support-contact only \(no auto tenant\)/);
    assert.match(routes, /router\.post\(CONTACT_PATH/);
    assert.match(routes, /submitPlatformInquiry/);
    assert.doesNotMatch(routes, /submitPublicChurchEnquiry|createPublicContactSubmission/);
    const contact = read("views/blessboard/v5/apex/contact.ejs");
    assert.match(contact, /data-bb-contact="platform"/);
    assert.match(contact, /action="\/contact"/);
    assert.match(contact, /does not deliver a message to a listed church/);
  });

  it("tenant visit/contact path retains organization key scoping", () => {
    const model = read("src/blessboard/http/loadTenantPublicPageModel.js");
    assert.match(model, /visitHref/);
    assert.match(model, /\/contact/);
    const pathRoutes = read("src/blessboard/http/pathPublicRoutes.js");
    assert.match(pathRoutes, /\/c\/\$\{encodeURIComponent\(resolved\.organizationKey\)\}/);
  });

  it("joining a listed church uses membership registration, not owner registration", () => {
    const directory = read("views/blessboard/v5/apex/directory.ejs");
    assert.match(directory, /join_href/);
    assert.match(directory, /Register Your Church lists a new congregation/);
    const content = read("src/blessboard/http/apexMarketingContent.js");
    const joinFn = content.slice(content.indexOf("function mapDirectoryJoinUrl"), content.indexOf("function mapDirectoryItems"));
    assert.match(joinFn, /return `\$\{home\}\/register`/);
    assert.doesNotMatch(joinFn, /register-church/);
    const register = read("views/blessboard/v5/apex/register-church.ejs");
    assert.match(register, /register-church|Register/);
  });

  it("church contact posts to the resolved church and admins read only that church", () => {
    const form = read("views/blessboard/v5/public/contact.ejs");
    const http = read("src/blessboard/http/publicChurchContactHttp.js");
    const service = read("src/blessboard/services/publicChurchContactService.js");
    const repo = read("src/blessboard/repositories/publicContactSubmissionsRepository.js");
    const tenant = read("src/blessboard/http/tenantPublicRoutes.js");
    const pathRoutes = read("src/blessboard/http/pathPublicRoutes.js");
    const admin = read("src/blessboard/http/contactSubmissionsAdminRoutes.js");
    assert.match(form, /data-bb-contact-form="church"/);
    assert.match(form, /hrefFor\('\/contact'\)/);
    assert.doesNotMatch(form, /action="\/contact"|church_id/);
    assert.match(http, /validateCsrf/);
    assert.match(http, /submitPublicChurchEnquiry/);
    assert.match(service, /source\.churchId/);
    assert.doesNotMatch(service, /body\.church_id|submitPlatformInquiry/);
    assert.match(repo, /church_id = \$1 AND organization_id = \$2/);
    assert.match(repo, /church_id = \$2 AND branch_id = \$3/);
    assert.match(tenant, /router\.post\("\/contact"/);
    assert.match(tenant, /router\.post\("\/branches\/:branchKey\/contact"/);
    assert.match(pathRoutes, /router\.post\(\s*"\/c\/:organizationKey\/:branchKey\/contact"/);
    assert.match(admin, /rejectApex/);
    assert.match(admin, /listPublicContactSubmissionsForChurch/);
  });

  it("HQ enquiry surfaces are church-scoped (cross-tenant access denied by scope gates)", () => {
    const journey = read("src/blessboard/http/memberJourneyAdminRoutes.js");
    assert.match(journey, /\/hq\/member-journey\/contacts/);
    assert.match(journey, /gateStaff|rejectApex/);
  });
});
