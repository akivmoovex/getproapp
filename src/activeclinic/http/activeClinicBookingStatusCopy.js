"use strict";

/**
 * Patient-safe booking status copy shared by public My Booking and the patient portal.
 */

const BOOKING_STATUS_LABELS = Object.freeze({
  submitted_pending_confirmation: "Pending clinic confirmation",
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

function bookingStatusTone(status) {
  const key = String(status || "");
  if (
    key === "submitted_pending_confirmation" ||
    key === "cancellation_requested" ||
    key === "reschedule_requested" ||
    key === "clinic_follow_up"
  ) {
    return "pending";
  }
  if (key === "confirmed") return "confirmed";
  return "done";
}

function formatBookingWhen(iso, timezone) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone || "UTC",
    }).format(date);
  } catch (_err) {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
}

function bookingStatusLabel(status) {
  const key = String(status || "");
  return BOOKING_STATUS_LABELS[key] || key.replace(/_/g, " ");
}

module.exports = {
  BOOKING_STATUS_LABELS,
  bookingStatusTone,
  formatBookingWhen,
  bookingStatusLabel,
};
