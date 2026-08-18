"use strict";

/**
 * Website JSON/editor routes must not 500 on resolve failure.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  RESULT,
  clinicResolveFailurePayload,
  isWebsiteApiRequest,
} = require("../src/activeclinic/http/activeClinicPublicRespond");

describe("ActiveClinic JSON clinic resolve contract", () => {
  it("maps resolve codes to 404/403 without inventing new statuses", () => {
    assert.deepEqual(clinicResolveFailurePayload({ code: RESULT.NOT_FOUND }), {
      status: 404,
      code: "clinic_not_found",
    });
    assert.deepEqual(clinicResolveFailurePayload({ code: RESULT.INVALID_INPUT }), {
      status: 404,
      code: "clinic_not_found",
    });
    assert.deepEqual(clinicResolveFailurePayload({ code: RESULT.PRODUCT_NOT_ACTIVE }), {
      status: 404,
      code: "clinic_not_found",
    });
    assert.deepEqual(clinicResolveFailurePayload({ code: RESULT.NOT_PUBLISHED }), {
      status: 403,
      code: "clinic_not_published",
    });
    assert.deepEqual(clinicResolveFailurePayload({ code: RESULT.WEBSITE_OFFLINE }), {
      status: 403,
      code: "website_offline",
    });
    assert.deepEqual(clinicResolveFailurePayload({ code: RESULT.WEBSITE_SUSPENDED }), {
      status: 403,
      code: "website_suspended",
    });
  });

  it("treats website editor paths as API requests except preview GET", () => {
    assert.equal(
      isWebsiteApiRequest({ method: "POST", path: "/clinics/acme/website/drafts" }),
      true
    );
    assert.equal(
      isWebsiteApiRequest({ method: "GET", path: "/clinics/acme/website/preview" }),
      false
    );
    assert.equal(
      isWebsiteApiRequest({ method: "GET", path: "/clinics/acme/website/media/abc" }),
      true
    );
  });
});
