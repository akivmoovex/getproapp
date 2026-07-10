"use strict";

const path = require("path");
const ejs = require("ejs");
const test = require("node:test");
const assert = require("node:assert/strict");

const BUTTON = path.join(__dirname, "../views/partials/components/button.ejs");

test("button partial ignores object form local so submit works inside forms", async () => {
  const html = await ejs.renderFile(
    BUTTON,
    {
      variant: "primary",
      type: "submit",
      label: "Create HQ Admin",
      // Simulates admin create/edit pages that pass a `form` values object in locals
      form: { full_name: "Demo", email: "a@b.com" },
    },
    { async: true }
  );
  assert.match(html, /type="submit"/);
  assert.doesNotMatch(html, /form="\[object Object\]"/i);
  assert.doesNotMatch(html, /form="/);
});

test("button partial accepts string formId for HTML form attribute", async () => {
  const html = await ejs.renderFile(
    BUTTON,
    {
      variant: "primary",
      type: "submit",
      label: "Save",
      formId: "hq-admin-create-form",
    },
    { async: true }
  );
  assert.match(html, /form="hq-admin-create-form"/);
});
