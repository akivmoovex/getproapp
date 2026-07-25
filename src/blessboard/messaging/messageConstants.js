"use strict";

/**
 * Shared enums and labels for BlessBoard V5 unified messaging.
 */

const MESSAGE_TYPES = Object.freeze([
  "announcement",
  "leadership_message",
  "ministry_announcement",
  "event_reminder",
  "service_update",
  "administrative_notice",
  "giving_receipt",
  "direct_message",
  "system_notice",
]);

/** Types HQ may create manually in the composer. */
const MANUAL_MESSAGE_TYPES = Object.freeze([
  "announcement",
  "leadership_message",
  "ministry_announcement",
  "event_reminder",
  "service_update",
  "administrative_notice",
  "direct_message",
]);

const MESSAGE_TYPE_LABELS = Object.freeze({
  announcement: "Announcement",
  leadership_message: "Leadership message",
  ministry_announcement: "Ministry announcement",
  event_reminder: "Event reminder",
  service_update: "Service update",
  administrative_notice: "Administrative notice",
  giving_receipt: "Giving receipt",
  direct_message: "Direct message",
  system_notice: "System notice",
});

const PRIORITIES = Object.freeze(["normal", "important", "urgent"]);

const PRIORITY_LABELS = Object.freeze({
  normal: "Normal",
  important: "Important",
  urgent: "Urgent",
});

const MESSAGE_STATUSES = Object.freeze([
  "draft",
  "scheduled",
  "sending",
  "sent",
  "partially_delivered",
  "failed",
  "cancelled",
]);

const MESSAGE_STATUS_LABELS = Object.freeze({
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  partially_delivered: "Partially Delivered",
  failed: "Delivery Failed",
  cancelled: "Cancelled",
});

const AUDIENCE_TYPES = Object.freeze([
  "all_active_members",
  "branches",
  "ministries",
  "roles",
  "members",
  "event_attendees",
]);

const AUDIENCE_TYPE_LABELS = Object.freeze({
  all_active_members: "All active members",
  branches: "Selected branches",
  ministries: "Selected ministries",
  roles: "Selected roles",
  members: "Specific members",
  event_attendees: "Event attendees",
});

const DELIVERY_CHANNELS = Object.freeze(["in_app", "email", "sms", "push"]);

const DELIVERY_STATUSES = Object.freeze([
  "not_requested",
  "queued",
  "sending",
  "delivered",
  "failed",
  "unavailable",
  "suppressed_by_preference",
  "suppressed_by_consent",
]);

const DELIVERY_STATUS_LABELS = Object.freeze({
  not_requested: "Not requested",
  queued: "Queued",
  sending: "Sending",
  delivered: "Delivered",
  failed: "Failed",
  unavailable: "Not Available",
  suppressed_by_preference: "Not Enabled",
  suppressed_by_consent: "Not Enabled",
  in_app: "In App",
});

const PREFERENCE_CATEGORIES = Object.freeze([
  "church_announcements",
  "leadership_messages",
  "ministry_updates",
  "event_reminders",
  "service_updates",
  "giving_receipts",
  "direct_messages",
  "administrative_notices",
]);

const PREFERENCE_CATEGORY_LABELS = Object.freeze({
  church_announcements: "Church announcements",
  leadership_messages: "Leadership messages",
  ministry_updates: "Ministry updates",
  event_reminders: "Event reminders",
  service_updates: "Service-time changes",
  giving_receipts: "Giving receipts",
  direct_messages: "Direct messages",
  administrative_notices: "Administrative notices",
});

const INBOX_CATEGORIES = Object.freeze([
  "all",
  "church",
  "ministries",
  "events",
  "leadership",
  "giving",
  "direct",
  "system",
  "administrative",
]);

const INBOX_CATEGORY_LABELS = Object.freeze({
  all: "All",
  church: "Church",
  ministries: "Ministries",
  events: "Events",
  leadership: "Leadership",
  giving: "Giving",
  direct: "Direct",
  system: "System",
  administrative: "Admin",
});

const PREFERENCE_PRESETS = Object.freeze([
  "all_updates",
  "important_only",
  "in_app_only",
  "custom",
]);

const MESSAGE_TYPE_TO_PREFERENCE_CATEGORY = Object.freeze({
  announcement: "church_announcements",
  leadership_message: "leadership_messages",
  ministry_announcement: "ministry_updates",
  event_reminder: "event_reminders",
  service_update: "service_updates",
  administrative_notice: "administrative_notices",
  giving_receipt: "giving_receipts",
  direct_message: "direct_messages",
  system_notice: "administrative_notices",
});

const MESSAGE_TYPE_TO_INBOX_CATEGORY = Object.freeze({
  announcement: "church",
  leadership_message: "leadership",
  ministry_announcement: "ministries",
  event_reminder: "events",
  service_update: "church",
  administrative_notice: "administrative",
  giving_receipt: "giving",
  direct_message: "direct",
  system_notice: "system",
});

/** Default preference matrix (conservative). */
function defaultPreferenceRow(category) {
  const alwaysInApp = true;
  const emailDefault =
    category === "church_announcements" ||
    category === "leadership_messages" ||
    category === "giving_receipts" ||
    category === "direct_messages" ||
    category === "administrative_notices" ||
    category === "service_updates";
  return {
    category,
    inAppEnabled: alwaysInApp,
    emailEnabled: emailDefault,
    smsEnabled: false,
    pushEnabled: false,
  };
}

function defaultPreferences() {
  return PREFERENCE_CATEGORIES.map((c) => defaultPreferenceRow(c));
}

function preferencesForPreset(preset) {
  const key = String(preset || "");
  if (key === "all_updates") {
    return PREFERENCE_CATEGORIES.map((category) => ({
      category,
      inAppEnabled: true,
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: false,
    }));
  }
  if (key === "important_only") {
    return PREFERENCE_CATEGORIES.map((category) => {
      const important =
        category === "leadership_messages" ||
        category === "service_updates" ||
        category === "direct_messages" ||
        category === "administrative_notices" ||
        category === "giving_receipts";
      return {
        category,
        inAppEnabled: true,
        emailEnabled: important,
        smsEnabled: false,
        pushEnabled: false,
      };
    });
  }
  if (key === "in_app_only") {
    return PREFERENCE_CATEGORIES.map((category) => ({
      category,
      inAppEnabled: true,
      emailEnabled: false,
      smsEnabled: false,
      pushEnabled: false,
    }));
  }
  return defaultPreferences();
}

module.exports = {
  MESSAGE_TYPES,
  MANUAL_MESSAGE_TYPES,
  MESSAGE_TYPE_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  MESSAGE_STATUSES,
  MESSAGE_STATUS_LABELS,
  AUDIENCE_TYPES,
  AUDIENCE_TYPE_LABELS,
  DELIVERY_CHANNELS,
  DELIVERY_STATUSES,
  DELIVERY_STATUS_LABELS,
  PREFERENCE_CATEGORIES,
  PREFERENCE_CATEGORY_LABELS,
  INBOX_CATEGORIES,
  INBOX_CATEGORY_LABELS,
  PREFERENCE_PRESETS,
  MESSAGE_TYPE_TO_PREFERENCE_CATEGORY,
  MESSAGE_TYPE_TO_INBOX_CATEGORY,
  defaultPreferenceRow,
  defaultPreferences,
  preferencesForPreset,
};
