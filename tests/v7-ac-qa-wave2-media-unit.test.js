"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const mediaService = require("../src/platform/website/mediaService");
const catalogueService = require("../src/activeclinic/website/clinicWebsiteCatalogueService");
const appointmentService = require("../src/activeclinic/services/activeClinicAppointmentService");

function jpegBuffer(size) {
  const buf = Buffer.alloc(Math.max(size, 4));
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xd9;
  return buf;
}

function pngBuffer() {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
    0x00, 0x05, 0xfe, 0x02, 0xfe, 0xa7, 0x35, 0x81, 0x84, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
    0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
}

function webpBuffer() {
  return Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
    0x0e, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00,
  ]);
}

describe("ActiveClinic QA Wave 2 — media signature validation", () => {
  it("accepts valid JPEG/PNG/WebP signatures and rejects fake/unsupported", () => {
    assert.equal(mediaService.detectMimeFromSignature(jpegBuffer(32)), "image/jpeg");
    assert.equal(mediaService.detectMimeFromSignature(pngBuffer()), "image/png");
    assert.equal(mediaService.detectMimeFromSignature(webpBuffer()), "image/webp");
    assert.equal(mediaService.detectMimeFromSignature(Buffer.from("not an image")), null);
    assert.equal(mediaService.detectMimeFromSignature(Buffer.from("<svg xmlns='x'></svg>")), null);
    assert.ok(jpegBuffer(5 * 1024 * 1024 + 10).length > mediaService.MAX_BYTES);
  });

  it("exposes service catalogue create/update APIs", () => {
    assert.equal(typeof catalogueService.createCatalogueService, "function");
    assert.equal(typeof catalogueService.updateCatalogueService, "function");
    assert.equal(typeof appointmentService.updateAppointmentServiceType, "function");
  });
});
