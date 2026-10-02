"use strict";

/**
 * V10 PL06 — Legacy infrastructure cleanup characterization.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("PL06 legacy infra cleanup", () => {
  it("removes obsolete AC phone asset shims; platform phone remains", () => {
    assert.equal(fs.existsSync(path.join(ROOT, "public/platform/phone-field.js")), true);
    assert.equal(fs.existsSync(path.join(ROOT, "public/platform/phone-field.css")), true);
    assert.equal(fs.existsSync(path.join(ROOT, "public/activeclinic/ac-phone-field.js")), false);
    assert.equal(fs.existsSync(path.join(ROOT, "public/activeclinic/ac-phone-field.css")), false);
  });

  it("removes zero-consumer AC Resend re-export; delivery uses platform", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/activeclinic/services/activeClinicEmailResendAdapter.js")),
      false
    );
    const delivery = read("src/activeclinic/services/activeClinicEmailDelivery.js");
    assert.match(delivery, /platform\/email\/outboundEmailTransport/);
    assert.match(delivery, /platform\/email\/resendEmailAdapter/);
  });

  it("removes legacyCompatibilityPermissions stub from runtime", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/blessboard/rbac/legacyCompatibilityPermissions.js")),
      false
    );
    assert.doesNotMatch(read("src/blessboard/services/staffAccessService.js"), /legacyCompatibilityPermissions/);
  });

  it("statusCompatibility module removed after empty-map cutover (DBCL10)", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/platform/registration/statusCompatibility.js")),
      false
    );
    assert.doesNotMatch(
      read("src/platform/registration/index.js"),
      /statusCompatibility/
    );
  });

  it("BB runtime organizationKey callers import platform SoT", () => {
    const editor = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    const compat = read("src/blessboard/services/organizationKeyCompat.js");
    assert.match(editor, /platform\/organization\/organizationKey/);
    assert.match(compat, /platform\/organization\/organizationKey/);
  });

  it("orgDataEnvironment mode helpers import platform deploymentEnv", () => {
    assert.match(read("src/church/orgDataEnvironment.js"), /platform\/config\/deploymentEnv/);
  });

  it("does not remove BB operational media_assets or invent website-media URL shims delete", () => {
    assert.equal(fs.existsSync(path.join(ROOT, "src/blessboard/media")), true);
    assert.equal(fs.existsSync(path.join(ROOT, "public/platform/website-media-field.js")), true);
  });

  it("keeps activeClinicEmailDelivery product facade", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/activeclinic/services/activeClinicEmailDelivery.js")),
      true
    );
  });
});
