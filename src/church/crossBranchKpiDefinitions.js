"use strict";

/**
 * Documented KPI definitions for the Growth cross-branch comparison dashboard.
 * Used by the service and surfaced in the UI — do not invent alternate formulas
 * without updating this module.
 */

const CROSS_BRANCH_KPI_DEFINITIONS = Object.freeze({
  active_members: {
    id: "active_members",
    label: "Active members",
    definition:
      "Count of church_members with status = verified on each branch (point-in-time; not period-joined).",
    source: "church_members",
  },
  monthly_attendance: {
    id: "monthly_attendance",
    label: "Monthly attendance",
    definition:
      "Sum of adults_count + youth_count + children_count on submitted attendance records in the date range (optional attendance_type / ministry filters).",
    source: "church_attendance_records",
  },
  visitors: {
    id: "visitors",
    label: "Visitors",
    definition:
      "Sum of first_time_visitors_count on submitted attendance records in the date range (same filters as attendance).",
    source: "church_attendance_records.first_time_visitors_count",
  },
  event_registrations: {
    id: "event_registrations",
    label: "Event registrations (proxy)",
    definition:
      "Count of published church_events in the date range per branch. Registration RSVP tables are not yet available; this is the documented proxy.",
    source: "church_events",
  },
  event_attendance: {
    id: "event_attendance",
    label: "Event attendance (proxy)",
    definition:
      "Sum of headcount on attendance records whose service_date matches a published event date for the same branch in range.",
    source: "church_attendance_records ∩ church_events.event_date",
  },
  open_pastoral_follow_ups: {
    id: "open_pastoral_follow_ups",
    label: "Open pastoral follow-ups (proxy)",
    definition:
      "Ministry activity notes with review_status = follow_up_requested plus open member requests (submitted / in_review / more_info_needed).",
    source: "church_ministry_activity_notes + church_member_requests",
  },
  overdue_pastoral_cases: {
    id: "overdue_pastoral_cases",
    label: "Overdue pastoral cases (proxy)",
    definition:
      "Open pastoral follow-ups whose updated_at (notes) or created_at (requests) is older than 7 days.",
    source: "same as open_pastoral_follow_ups with age > 7 days",
    overdue_days: 7,
  },
  giving_totals: {
    id: "giving_totals",
    label: "Giving totals",
    definition:
      "Sum of giving category totals from church_giving_summaries overlapping the date range (by period_year/period_month). Shown only when the HQ admin has can_view_finance.",
    source: "church_giving_summaries",
    requires_finance_permission: true,
  },
});

/** Within-tenant analytics: exclude inactive + obvious sample/demo campus hosts. */
const DEMO_TEST_BRANCH_EXCLUSION_SQL = `
  AND b.status = 'active'
  AND lower(b.host_slug) <> 'demo'
  AND lower(b.host_slug) NOT LIKE 'demo-%'
  AND lower(b.host_slug) NOT LIKE '%-demo'
  AND lower(b.slug) NOT LIKE 'sample%'
  AND lower(b.slug) NOT LIKE 'demo-%'
  AND lower(b.name) NOT LIKE 'sample %'
`;

module.exports = {
  CROSS_BRANCH_KPI_DEFINITIONS,
  DEMO_TEST_BRANCH_EXCLUSION_SQL,
};
