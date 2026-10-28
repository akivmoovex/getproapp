"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");

test("member invitation acceptance form targets the canonical invitation route", () => {
  const template = fs.readFileSync(
    path.join(ROOT, "views/blessboard/v5/member-invite/accept.ejs"),
    "utf8"
  );
  const routes = fs.readFileSync(
    path.join(ROOT, "src/blessboard/http/inviteAcceptRoutes.js"),
    "utf8"
  );

  assert.match(template, /method="post"\s+action="\/invite\/accept"/);
  assert.doesNotMatch(template, /action="\/member-invite\/accept"/);
  assert.match(routes, /router\.post\(["']\/invite\/accept["']/);
  assert.match(template, /name="<%= csrfField %>"\s+value="<%= csrfToken %>"/);
});
