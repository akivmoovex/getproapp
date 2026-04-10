"use strict";

/**
 * Regression: site_footer must render when parent views omit GETPRO-style contact locals
 * (e.g. field agent dashboard). Guards against ReferenceError on getproPhone / getproEmail / getproAddress.
 */
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const ejs = require("ejs");

test("site_footer.ejs renders with only tenantUrlPrefix (no getpro* contact locals)", async () => {
  const footerPath = path.join(__dirname, "..", "views", "partials", "site_footer.ejs");
  const html = await new Promise((resolve, reject) => {
    ejs.renderFile(footerPath, { tenantUrlPrefix: "" }, {}, (err, str) => {
      if (err) reject(err);
      else resolve(str);
    });
  });
  assert.ok(typeof html === "string" && html.includes('class="wf-footer"'));
});
