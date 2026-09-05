"use strict";

/**
 * Static client contracts for ActiveClinic editor save/publish resilience.
 * Hosted Playwright already exercises network interrupt; these asserts guard
 * the CSRF content-type fix and dirty/error messaging against regressions.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { wantsV5PrivateNoStore } = require("../src/platform/http/v5PrivateNoStore");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("ActiveClinic editor client contracts", () => {
  it("CMS publish sends urlencoded FormData (CSRF-safe) and surfaces disconnect errors", () => {
    const js = read("public/activeclinic/website-cms.js");
    assert.match(js, /new URLSearchParams\(new FormData\(publishForm\)\)/);
    assert.match(js, /application\/x-www-form-urlencoded/);
    assert.match(js, /Publish failed — check your connection and retry\. Draft unchanged\./);
    assert.doesNotMatch(
      js,
      /body:\s*new FormData\(publishForm\)/,
      "multipart FormData publish body breaks express.urlencoded CSRF validation"
    );
  });

  it("shared lifecycle publish uses urlencoded body and connection failure copy", () => {
    const js = read("public/platform/website-lifecycle.js");
    assert.match(js, /new URLSearchParams\(new FormData\(form\)\)/);
    assert.match(js, /application\/x-www-form-urlencoded/);
    assert.match(js, /Publish failed — check your connection and retry\. Draft unchanged\./);
    assert.match(js, /beforeunload/);
  });

  it("inline editor retains dirty state messaging on save/network failure", () => {
    const candidates = [
      "public/platform/website-inline-edit.js",
      "public/platform/website-editor.js",
      "public/activeclinic/website-cms.js",
      "public/platform/website-lifecycle.js",
    ];
    const blob = candidates
      .map((rel) => {
        try {
          return read(rel);
        } catch {
          return "";
        }
      })
      .join("\n");
    assert.match(
      blob,
      /Save failed — check your connection and retry|check your connection and retry/
    );
    assert.match(blob, /beforeunload|data-website-dirty|isDirty|dirty/);
  });

  it("authenticated clinic editor paths request private no-store treatment", () => {
    assert.equal(wantsV5PrivateNoStore("/clinics/demo"), true);
    assert.equal(wantsV5PrivateNoStore("/clinics/demo?website_edit=1"), true);
    assert.equal(wantsV5PrivateNoStore("/clinics/demo/patient"), true);
    assert.equal(wantsV5PrivateNoStore("/"), false);
  });
});
