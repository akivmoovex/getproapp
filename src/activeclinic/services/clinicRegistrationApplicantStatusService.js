"use strict";

/**
 * Applicant-facing clinic registration status (V7 Phase E).
 * Presentation only — reads existing Phase B application + review-event axes.
 * Not a second state machine, not a shared platform application service.
 */

const crypto = require("crypto");
const { normalizeActiveClinicEmail } = require("./normalizeActiveClinicContact");
const {
  normalizeZambiaPhone,
} = require("./activeClinicPublicOnboardingService");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "application_not_found",
});

const GENERIC_NOT_FOUND =
  "We could not find an application matching those details.";

const GENERIC_REJECTION =
  "This application was not approved. You may submit a new application later if your circumstances have changed.";

const PUBLIC_STATE = Object.freeze({
  UNDER_REVIEW: "under_review",
  MORE_INFORMATION_NEEDED: "more_information_needed",
  BACK_UNDER_REVIEW: "back_under_review",
  APPROVED_PREPARING: "approved_preparing",
  APPROVED_SETUP_ATTENTION: "approved_setup_attention",
  APPROVED: "approved",
  REJECTED: "rejected",
  WITHDRAWN: "withdrawn",
  DUPLICATE_RECORDED: "duplicate_recorded",
});

const DUMMY_EMAIL = "nobody@invalid.example";
const DUMMY_PHONE = "+260900000000";

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  const size = Math.max(a.length, b.length, 32);
  const padA = Buffer.alloc(size);
  const padB = Buffer.alloc(size);
  a.copy(padA);
  b.copy(padB);
  return crypto.timingSafeEqual(padA, padB) && a.length === b.length;
}

function normalizeApplicationNumber(raw) {
  const text = String(raw == null ? "" : raw)
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase()
    .slice(0, 64);
  return text;
}

function normalizeLookupContact(input) {
  const emailRaw = String((input && (input.contactEmail || input.email)) || "").trim();
  const email = emailRaw ? normalizeActiveClinicEmail(emailRaw) : { ok: false, normalized: null };
  const phone = normalizeZambiaPhone(input && (input.contactPhone || input.phone), {
    phoneCountry: (input && (input.phoneCountry || input.contactPhoneCountry)) || null,
    phoneNational: (input && (input.phoneNational || input.contactPhoneNational)) || null,
    defaultCountry: (input && input.countryCode) || "ZM",
  });
  return {
    email: email.ok && email.normalized ? email.normalized : null,
    phone: phone.ok && phone.normalized ? phone.normalized : null,
    emailAttempted: Boolean(emailRaw),
    phoneAttempted: Boolean(
      String((input && (input.contactPhone || input.phone || input.phoneNational || input.contactPhoneNational)) || "").trim()
    ),
  };
}

function contactsMatch(row, contact) {
  const storedEmail = row && row.contact_email_normalized ? String(row.contact_email_normalized) : DUMMY_EMAIL;
  const storedPhone = row && row.contact_phone_normalized ? String(row.contact_phone_normalized) : DUMMY_PHONE;
  const emailProbe = contact.email || DUMMY_EMAIL;
  const phoneProbe = contact.phone || DUMMY_PHONE;
  const emailHit = timingSafeEqualText(storedEmail, emailProbe);
  const phoneHit = timingSafeEqualText(storedPhone, phoneProbe);
  if (!row) return false;
  const usedEmail = Boolean(contact.email);
  const usedPhone = Boolean(contact.phone);
  return (usedEmail && emailHit) || (usedPhone && phoneHit);
}

function formatSubmittedDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function projectApplicantStatus(application, informationRequest) {
  const applicationStatus = String((application && application.status) || "");
  const followUp = String((application && application.follow_up_status) || "none");
  const provisioning = String((application && application.provisioning_status) || "not_started");

  let publicState = PUBLIC_STATE.UNDER_REVIEW;
  let label = "Under review";
  let explanation =
    "Your application is with the clinic review team. This can take several business days.";
  let nextAction = "Keep your application number. Check back here for updates.";
  let showLogin = false;
  let rejectionMessage = null;
  let showInformationRequest = false;

  if (applicationStatus === "rejected") {
    publicState = PUBLIC_STATE.REJECTED;
    label = "Not approved";
    explanation = GENERIC_REJECTION;
    nextAction = "If your circumstances have changed, you may start a new clinic registration.";
    rejectionMessage = GENERIC_REJECTION;
  } else if (applicationStatus === "withdrawn") {
    publicState = PUBLIC_STATE.WITHDRAWN;
    label = "Withdrawn";
    explanation = "This application was withdrawn and is no longer under review.";
    nextAction = "If you still want to join ActiveClinic, start a new clinic registration.";
  } else if (applicationStatus === "duplicate") {
    publicState = PUBLIC_STATE.DUPLICATE_RECORDED;
    label = "Already recorded";
    explanation =
      "This application is recorded against an existing submission. The original remains in review.";
    nextAction = "Use this same application number to check the original submission, or wait for review.";
  } else if (applicationStatus === "approved") {
    if (provisioning === "failed") {
      publicState = PUBLIC_STATE.APPROVED_SETUP_ATTENTION;
      label = "Approved — setup needs attention";
      explanation =
        "Your clinic was approved, but setup needs attention from ActiveClinic support. Quote your application number if you contact support.";
      nextAction = "Keep your application number. Clinic operations are not blocked by website publication.";
    } else if (provisioning === "in_progress" || provisioning === "not_started") {
      publicState = PUBLIC_STATE.APPROVED_PREPARING;
      label = "Approved — preparing your clinic";
      explanation = "Your clinic was approved. ActiveClinic is preparing your clinic setup.";
      nextAction = "Check back shortly. You will be able to sign in when setup is ready.";
    } else if (provisioning === "website_pending") {
      publicState = PUBLIC_STATE.APPROVED;
      label = "Approved";
      explanation =
        "Your clinic was approved. You can sign in and operate the clinic. Publishing a clinic website is separate and does not block clinic operations.";
      nextAction = "Sign in with the email or phone and password from your application.";
      showLogin = true;
    } else {
      publicState = PUBLIC_STATE.APPROVED;
      label = "Approved";
      explanation = "Your clinic was approved. The clinic administrator can sign in now.";
      nextAction = "Sign in with the email or phone and password from your application.";
      showLogin = true;
    }
  } else if (followUp === "awaiting_customer") {
    publicState = PUBLIC_STATE.MORE_INFORMATION_NEEDED;
    label = "More information needed";
    explanation =
      "The clinic review team needs additional information. No email or SMS was sent from ActiveClinic.";
    nextAction =
      "Contact the review team using your existing support channel and quote your application number. You cannot edit this application online yet.";
    showInformationRequest = true;
  } else if (followUp === "returned_for_review") {
    publicState = PUBLIC_STATE.BACK_UNDER_REVIEW;
    label = "Back under review";
    explanation = "The information you provided has been marked returned. The review team is looking at your application again.";
    nextAction = "No further action is needed online. Check back here for the decision.";
    showInformationRequest = true;
  } else {
    publicState = PUBLIC_STATE.UNDER_REVIEW;
    label = "Under review";
    explanation =
      "Your application is with the clinic review team. This can take several business days.";
    nextAction = "Keep your application number. Check back here for updates.";
  }

  const request =
    showInformationRequest && informationRequest && informationRequest.body
      ? {
          body: String(informationRequest.body),
          requestedAt: informationRequest.createdAt
            ? new Date(informationRequest.createdAt).toISOString()
            : null,
          emailSent: false,
        }
      : null;

  return {
    applicationNumber: String(application.application_number),
    clinicName: String(application.clinic_name),
    submittedAt: formatSubmittedDate(application.created_at),
    publicState,
    label,
    explanation,
    nextAction,
    showLogin,
    rejectionMessage,
    informationRequest: request,
    stored: {
      applicationStatus,
      followUpStatus: followUp,
      provisioningStatus: provisioning,
    },
  };
}

function notFoundResult() {
  return {
    ok: false,
    code: RESULT.NOT_FOUND,
    message: GENERIC_NOT_FOUND,
    projection: null,
  };
}

function invalidInputResult(errors) {
  return {
    ok: false,
    code: RESULT.INVALID_INPUT,
    message: "Enter your application number and the email or phone used on the application.",
    errors: errors || {},
    projection: null,
  };
}

async function loadLatestInformationRequest(db, applicationId) {
  const result = await db.query(
    `SELECT body, created_at
       FROM activeclinic.clinic_registration_review_events
      WHERE application_id = $1
        AND event_type = 'information_requested'
        AND visibility <> 'internal'
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [applicationId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { body: row.body, createdAt: row.created_at };
}

/**
 * Lookup requires application number AND matching submitted email or phone.
 * Does not mutate application state.
 */
async function lookupClinicRegistrationApplicantStatus(db, input) {
  const applicationNumber = normalizeApplicationNumber(input && input.applicationNumber);
  const contact = normalizeLookupContact(input || {});
  const errors = {};
  if (!applicationNumber) {
    errors.applicationNumber = "Enter your application number.";
  }
  if (!contact.email && !contact.phone) {
    errors.contact = "Enter the email or phone number used on the application.";
  }
  if (Object.keys(errors).length) {
    return invalidInputResult(errors);
  }

  const found = await db.query(
    `SELECT id, application_number, clinic_name, status, follow_up_status, provisioning_status,
            created_at, contact_email_normalized, contact_phone_normalized
       FROM activeclinic.clinic_registration_applications
      WHERE application_number = $1
      LIMIT 1`,
    [applicationNumber]
  );
  const row = found.rows[0] || null;
  if (!contactsMatch(row, contact)) {
    return notFoundResult();
  }

  const informationRequest = await loadLatestInformationRequest(db, row.id);
  const projected = projectApplicantStatus(row, informationRequest);
  return {
    ok: true,
    code: RESULT.OK,
    message: null,
    projection: {
      applicationNumber: projected.applicationNumber,
      clinicName: projected.clinicName,
      submittedAt: projected.submittedAt,
      publicState: projected.publicState,
      label: projected.label,
      explanation: projected.explanation,
      nextAction: projected.nextAction,
      showLogin: projected.showLogin,
      rejectionMessage: projected.rejectionMessage,
      informationRequest: projected.informationRequest,
    },
  };
}

module.exports = {
  RESULT,
  PUBLIC_STATE,
  GENERIC_NOT_FOUND,
  GENERIC_REJECTION,
  normalizeApplicationNumber,
  normalizeLookupContact,
  projectApplicantStatus,
  lookupClinicRegistrationApplicantStatus,
};
