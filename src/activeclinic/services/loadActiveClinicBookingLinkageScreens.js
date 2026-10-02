"use strict";

/**
 * Staff screens for public booking → clinic patient linkage review.
 */

const {
  listBookingsNeedingPatientReview,
  getBookingRequestById,
  assessBookingIdentityMatches,
  LINK_STATUS,
} = require("./activeClinicBookingPatientLinkageService");
const { PERM } = require("./activeClinicPatientService");

function hasPerm(perms, key) {
  return Array.isArray(perms) ? perms.includes(key) : Boolean(perms && perms[key]);
}

const LINK_STATUS_LABELS = Object.freeze({
  [LINK_STATUS.UNLINKED]: "Patient unlinked",
  [LINK_STATUS.POSSIBLE_MATCH]: "Possible patient match",
  [LINK_STATUS.LINK_REVIEW_REQUIRED]: "Patient link review required",
  [LINK_STATUS.LINKED]: "Patient linked",
  [LINK_STATUS.NEW_PATIENT_PENDING]: "New patient pending",
});

async function loadBookingRequestsReviewScreen(db, input) {
  const auth = input.auth || {};
  const perms = auth.permissions || [];
  if (!hasPerm(perms, PERM.SEARCH) && !hasPerm(perms, "activeclinic.reception.view")) {
    return { ok: false, code: "access_denied" };
  }

  const facilityId =
    (auth.selectedFacility && auth.selectedFacility.id) || null;
  const listed = await listBookingsNeedingPatientReview(db, {
    organizationId: auth.organization.id,
    facilityId,
  });
  if (!listed.ok) return { ok: false, code: listed.code };

  return {
    ok: true,
    list: {
      bookings: (listed.bookings || []).map((b) => ({
        ...b,
        linkStatusLabel: LINK_STATUS_LABELS[b.patientLinkStatus] || b.patientLinkStatus,
      })),
      actions: {
        canLink: hasPerm(perms, PERM.SEARCH),
        canCreate: hasPerm(perms, PERM.CREATE) || hasPerm(perms, PERM.QUICK_REGISTER),
      },
    },
  };
}

async function loadBookingRequestDetailScreen(db, input) {
  const auth = input.auth || {};
  const perms = auth.permissions || [];
  if (!hasPerm(perms, PERM.SEARCH) && !hasPerm(perms, "activeclinic.reception.view")) {
    return { ok: false, code: "access_denied" };
  }

  const loaded = await getBookingRequestById(db, {
    organizationId: auth.organization.id,
    bookingId: input.bookingId,
  });
  if (!loaded.ok) return { ok: false, code: loaded.code };

  const booking = loaded.booking;
  let candidates = [];
  if (booking.patientLinkStatus !== LINK_STATUS.LINKED) {
    const assessment = await assessBookingIdentityMatches(db, {
      organizationId: booking.organizationId,
      healthcareOrganizationId: booking.healthcareOrganizationId,
      phoneNormalized: booking.patientPhoneNormalized,
      emailNormalized: booking.patientEmailNormalized,
      firstName: booking.patientFirstName,
      lastName: booking.patientLastName,
    });
    if (assessment.ok) candidates = assessment.candidates || [];
  }

  return {
    ok: true,
    detail: {
      booking: {
        ...booking,
        linkStatusLabel: LINK_STATUS_LABELS[booking.patientLinkStatus] || booking.patientLinkStatus,
        phoneMasked: booking.patientPhoneDisplay
          ? booking.patientPhoneDisplay.replace(/(\d{3})\d+(\d{3})$/, "$1•••$2")
          : null,
      },
      candidates,
      flash: input.flash || null,
      errors: input.errors || [],
      actions: {
        canLink: hasPerm(perms, PERM.SEARCH),
        canCreate: hasPerm(perms, PERM.CREATE) || hasPerm(perms, PERM.QUICK_REGISTER),
        canManageIdentifiers: hasPerm(perms, PERM.MANAGE_IDENTIFIERS),
      },
      checkInHref: `/app/reception/walk-in?booking_request_id=${encodeURIComponent(booking.id)}&request_number=${encodeURIComponent(booking.requestNumber)}`,
      patientSearchHref: `/app/patients?q=${encodeURIComponent(
        `${booking.patientFirstName} ${booking.patientLastName}`.trim()
      )}`,
    },
  };
}

module.exports = {
  LINK_STATUS_LABELS,
  loadBookingRequestsReviewScreen,
  loadBookingRequestDetailScreen,
};
