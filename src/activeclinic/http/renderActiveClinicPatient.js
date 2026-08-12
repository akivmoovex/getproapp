"use strict";

/**
 * Render patient portal views (AC-V6-P27) via EJS templates.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const { CSRF_FIELD } = require("../../platform/http/v5Csrf");
const {
  buildPhoneFieldLocals,
} = require("../services/activeClinicPhoneFieldLocals");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "activeclinic");
const ASSET_VERSION = "v7-parity-9";

const BOOKING_STATUS_LABELS = Object.freeze({
  submitted_pending_confirmation: "Pending confirmation",
  confirmed: "Confirmed",
  cancellation_requested: "Cancellation requested",
  reschedule_requested: "Reschedule requested",
  clinic_follow_up: "Clinic follow-up",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No show",
  declined: "Declined",
  expired: "Expired",
});

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPartial(relativePath, data) {
  const templatePath = relativePath.endsWith(".ejs") ? relativePath : `${relativePath}.ejs`;
  const absolute = path.join(VIEWS_ROOT, templatePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`ActiveClinic patient template missing: ${relativePath}`);
  }
  const source = fs.readFileSync(absolute, "utf8");
  return ejs.render(
    source,
    { ...(data || {}), escapeHtml, csrfField: CSRF_FIELD, bookingStatusLabels: BOOKING_STATUS_LABELS },
    {
      filename: absolute,
      root: VIEWS_ROOT,
      views: [VIEWS_ROOT],
    }
  );
}

function defaultLocals(data) {
  const d = data || {};
  const patientAuth = d.patientAuth || {};
  const patient = patientAuth.patient || {};
  const phoneLocals = buildPhoneFieldLocals({
    clinicDefaultCountry:
      (d.clinic && (d.clinic.countryCode || d.clinic.defaultCountry)) || null,
    selectedCountry: d.phoneCountry || null,
  });
  return {
    assetVersion: ASSET_VERSION,
    csrfField: CSRF_FIELD,
    csrfToken: d.csrfToken || "",
    clinicKey: d.clinicKey || "",
    clinic: d.clinic || null,
    patientAuth,
    patient,
    displayName: patient.preferredName || patient.firstName || "Patient",
    activeNav: d.activeNav || "",
    error: d.error || null,
    success: d.success || null,
    message: d.message || d.success || null,
    token: d.token || "",
    bookings: d.bookings || [],
    upcoming: d.upcoming || [],
    pending: d.pending || [],
    past: d.past || [],
    booking: d.booking || null,
    profile: d.profile || patient,
    statusFilter: d.statusFilter || "",
    notFoundKind: d.notFoundKind || "",
    pageTitle: d.pageTitle || "Patient Portal",
    ...phoneLocals,
    pageId: d.pageId || "patient",
    escapeHtml,
    bookingStatusLabels: BOOKING_STATUS_LABELS,
  };
}

/**
 * @param {object} input
 * @param {string} input.pageId
 * @param {string} input.pageTitle
 * @param {string} input.contentTemplate e.g. patient/login
 * @param {object} [input.locals]
 */
function renderPatientPage(input) {
  const locals = defaultLocals({
    ...(input.locals || {}),
    pageId: input.pageId,
    pageTitle: input.pageTitle,
  });

  const headerHtml = renderPartial("partials/patient-header", locals);
  const navHtml =
    locals.patientAuth && locals.patientAuth.authenticated
      ? renderPartial("partials/patient-nav", locals)
      : "";
  const bodyHtml = renderPartial(input.contentTemplate, locals);

  return renderPartial("layouts/patient-shell", {
    ...locals,
    headerHtml,
    navHtml,
    bodyHtml,
  });
}

/** @param {string} viewPath e.g. patient/login */
function renderPatientView(viewPath, data) {
  const d = data || {};
  const pageId = String(viewPath).replace(/[\\/]/g, "-");
  const titles = {
    "patient/login": "Sign in",
    "patient/register": "Register",
    "patient/forgot-password": "Forgot password",
    "patient/reset-password": "Reset password",
    "patient/password-updated": "Password updated",
    "patient/verify-phone": "Verify phone",
    "patient/verification-success": "Verification",
    "patient/recovery-verification": "Recovery verification",
    "patient/dashboard": "Dashboard",
    "patient/dashboard-empty": "Dashboard",
    "patient/bookings": "My bookings",
    "patient/booking-detail": "Booking detail",
    "patient/link-guest-booking": "Link guest booking",
    "patient/profile": "Profile",
    "patient/security": "Security",
    "patient/notifications": "Notifications",
    "patient/offline": "Offline",
    "patient/not-found": "Not found",
  };

  return renderPatientPage({
    pageId,
    pageTitle: d.pageTitle || titles[viewPath] || "Patient Portal",
    contentTemplate: viewPath,
    locals: d,
  });
}

function renderPatientClinicNotFound(data) {
  return renderPatientView("patient/not-found", {
    ...(data || {}),
    pageTitle: "Clinic not found",
    notFoundKind: "clinic",
  });
}

module.exports = {
  renderPatientView,
  renderPatientPage,
  renderPatientClinicNotFound,
  VIEWS_ROOT,
  ASSET_VERSION,
  CSRF_FIELD,
  BOOKING_STATUS_LABELS,
};
