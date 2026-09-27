"use strict";

/**
 * ActiveClinic website-editor product adapter responsibilities (PC07).
 *
 * Product route file (`activeClinicWebsiteRoutes.js`) mounts AC clinic URLs.
 * Platform handlers: `src/platform/website/http/*`.
 *
 * AC adapter owns:
 * - `/clinics/:clinicKey/...` URL surface
 * - Clinic resolve + attachActiveClinicWebsiteLocals chrome
 * - AC website permissions (edit/publish/restore/view)
 * - CMS section field draft path (`parseCmsSectionFieldKey`)
 * - submit / unpublish / edit-session finish workflows
 * - publish + optional makePublic availability flip
 * - Publication governance: `activeClinicPublicationGovernanceAdapter` (PC10)
 * - Clinic websites scope listing
 *
 * Platform handlers own (shared):
 * - Shared HTTP utils (json correlation, CSRF helpers, media upload)
 * - Field-history restore, styles page send, generic draft/status mapping
 * - Theme/SEO/add-section operations (when wired)
 * - Publication orchestration authz gate + version mint (PC10)
 */

const { PRODUCT_CODE } = require("../../platform/website/publicWebsiteUrl");

function activeClinicEditorProductCode() {
  return PRODUCT_CODE.ACTIVECLINIC;
}

module.exports = {
  activeClinicEditorProductCode,
};
