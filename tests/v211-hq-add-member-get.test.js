"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("V211 HQ Add Member GET preparation", () => {
  it("defines a church-scoped members.create guard and static GET route before :id", () => {
    const source = read("src/blessboard/http/hqMembersAdminRoutes.js");
    assert.match(source, /createRequireBlessBoardPermission\("members\.create"/);
    assert.match(source, /router\.get\("\/hq\/members\/new", rejectApex, gateHqCreate/);
    assert.ok(source.indexOf('router.get("/hq/members/new"') < source.indexOf('router.get("/hq/members/:id"'));
    assert.match(source, /buildAddMemberFormModel/);
    assert.match(source, /listBlessBoardBranches\(getPool\(\), scope\.churchId/);
    assert.match(source, /issueCsrfToken/);
  });

  it("exposes an authorized directory action and an operational form", () => {
    const directory = read("views/blessboard/v5/hq/members.ejs");
    const form = read("views/blessboard/v5/hq/member-add.ejs");
    assert.match(directory, /canCreateMember/);
    assert.match(directory, /href="\/hq\/members\/new"/);
    assert.match(form, /data-bb-hq-member-add="1"/);
    assert.match(form, /data-bb-hq-add-member-form="1"/);
    assert.match(form, /method="post" action="\/hq\/members\/new"/);
    assert.match(form, /name="full_name"/);
  });

  it("defines the staged POST, match, review, and created routes", () => {
    const source = read("src/blessboard/http/hqMembersAdminRoutes.js");
    assert.match(source, /router\.post\("\/hq\/members\/new"/);
    assert.match(source, /router\.post\("\/hq\/members\/new\/match"/);
    assert.match(source, /router\.post\("\/hq\/members\/new\/review"/);
    assert.match(source, /router\.get\("\/hq\/members\/:id\/created"/);
  });
});
