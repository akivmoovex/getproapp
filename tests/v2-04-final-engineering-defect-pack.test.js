"use strict";

/**
 * V2.04 defect-pack focused contracts:
 * - AC historical version preview wires Stitch presentation
 * - BB publish readiness honors engine contact + checklist cascade fix
 * - AC publish always attempts go-live availability
 * - BB members directory tolerates missing V2.04 columns
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.04 final engineering defect pack contracts", () => {
  it("AC historical version preview builds Stitch websitePresentation", () => {
    const gov = read("src/platform/website/governanceVersionPreview.js");
    assert.match(gov, /buildActiveClinicStitchPublicPage/);
    assert.match(gov, /websitePresentation/);
    assert.match(gov, /renderActiveClinicHistorical/);
  });

  it("BB publish readiness ORs engine contact.details with church_settings", () => {
    const svc = read("src/blessboard/services/churchWebsitePublishService.js");
    assert.match(svc, /loadFieldOverlayMap/);
    assert.match(svc, /hasEngineContact/);
    assert.match(svc, /overlayKey\("details", "email"\)/);
    assert.match(svc, /hasContact: hasChurchContact \|\| hasBranchContact \|\| hasEngineContact/);
  });

  it("BB publication validation checks do not cascade global readyOk", () => {
    const val = read("src/blessboard/services/websitePublicationValidationService.js");
    assert.match(val, /Each check keys off its own gap/);
    assert.match(val, /readinessEvaluated && !gaps\.includes\("contact_method"\)/);
    assert.match(val, /readinessEvaluated && !gaps\.includes\("website_suspended"\)/);
    assert.doesNotMatch(
      val,
      /ok:\s*readyOk && !\(readiness\.gaps \|\| \[\]\)\.includes\("contact_method"\)/
    );
  });

  it("AC tenant publish always attempts setClinicWebsiteAvailability when makePublic not false", () => {
    const routes = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    assert.match(routes, /setClinicWebsiteAvailability/);
    assert.match(routes, /wantsPublic/);
    assert.match(routes, /published_content_not_live|availability_failed/);
  });

  it("BB members list retries without V2.04 columns on undefined_column", () => {
    const repo = read("src/blessboard/repositories/memberIdentityRepository.js");
    assert.match(repo, /isUndefinedColumnError/);
    assert.match(repo, /listMembersForChurchCore/);
    assert.match(repo, /listMembersForBranchCore/);
    assert.match(repo, /withV204Columns/);
    assert.match(repo, /NULL::text AS member_number/);
  });

  it("service_times readiness accepts layout_metadata.entries", () => {
    const svc = read("src/blessboard/services/churchWebsitePublishService.js");
    assert.match(svc, /layout_metadata.*entries/);
    assert.match(svc, /jsonb_array_length/);
  });
});
