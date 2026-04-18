"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCompanyPhotosFromFieldAgentSubmission,
} = require("../src/fieldAgent/fieldAgentSubmissionPhotosToCompany");

test("maps profile + work URLs into logo and gallery_json", () => {
  const r = buildCompanyPhotosFromFieldAgentSubmission({
    photo_profile_url: "/uploads/field-agent/1/2/a.jpg",
    work_photos_json: JSON.stringify(["/uploads/field-agent/1/2/b.jpg", "/uploads/field-agent/1/2/c.jpg"]),
  });
  assert.equal(r.logoUrl, "/uploads/field-agent/1/2/a.jpg");
  const g = JSON.parse(r.galleryJson);
  assert.equal(g.length, 2);
  assert.equal(g[0].url, "/uploads/field-agent/1/2/b.jpg");
});

test("empty submission yields empty logo and [] gallery", () => {
  const r = buildCompanyPhotosFromFieldAgentSubmission({
    photo_profile_url: "",
    work_photos_json: "[]",
  });
  assert.equal(r.logoUrl, "");
  assert.equal(r.galleryJson, "[]");
});

test("rejects non-allowed profile URL", () => {
  const r = buildCompanyPhotosFromFieldAgentSubmission({
    photo_profile_url: "javascript:alert(1)",
    work_photos_json: "[]",
  });
  assert.equal(r.logoUrl, "");
});
