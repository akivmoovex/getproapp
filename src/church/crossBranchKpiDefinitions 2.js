"use strict";

/**
 * Documented KPI definitions for the Growth cross-branch / advanced reporting dashboard.
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
  group_attendance: {
    id: "group_attendance",
    label: "Group attendance",
    definition:
      "Count of church_group_attendance rows with present = true whose meeting starts_at falls in the date range (optional group_id filter).",
    source: "church_group_attendance ∩ church_group_meetings",
  },
  visitors: {
    id: "visitors",
    label: "Visitors",
    definition:
      "Sum of first_time_visitors_count on submitted attendance records in the date range (same filters as attendance).",
    source: "church_attendance_records.first_time_visitors_count",
  },
  visitor_retention: {
    id: "visitor_retention",
    label: "Visitor follow-ups closed",
    definition:
      "Count of church_event_visitor_follow_ups with status = closed whose created_at falls in the date range (event visitor follow-up completions).",
    source: "church_event_visitor_follow_ups",
  },
  absence_follow_ups: {
    id: "absence_follow_ups",
    label: "Absence follow-ups",
    definition:
      "Count of pastoral automation work items with trigger_type = missed_service and status in (pending, accepted, converted) created in the date range.",
    source: "church_pastoral_automation_work_items",
  },
  event_registrations: {
    id: "event_registrations",
    label: "Event registrations",
    definition:
      "Count of church_event_registrations (excluding cancelled) for published events whose event_date is in the date range.",
    source: "church_event_registrations ∩ church_events",
  },
  event_attendance: {
    id: "event_attendance",
    label: "Event check-ins",
    definition:
      "Count of church_event_check_ins for published events whose event_date is in the date range.",
    source: "church_event_check_ins ∩ church_events",
  },
  open_pastoral_follow_ups: {
    id: "open_pastoral_follow_ups",
    label: "Open pastoral follow-ups",
    definition:
      "Open church_pastoral_cases (status in open, in_follow_up, paused, pending_supervisor_ack, escalated) plus ministry activity notes with review_status = follow_up_requested.",
    source: "church_pastoral_cases + church_ministry_activity_notes",
  },
  pastoral_workload: {
    id: "pastoral_workload",
    label: "Pastoral workload",
    definition:
      "Count of open church_pastoral_cases (non-closed) assigned to a branch admin (assigned_admin_id IS NOT NULL).",
    source: "church_pastoral_cases",
  },
  overdue_pastoral_cases: {
    id: "overdue_pastoral_cases",
    label: "Overdue pastoral cases",
    definition:
      "Open pastoral cases whose due_date is before today, or (when due_date is null) whose updated_at is older than 7 days.",
    source: "church_pastoral_cases",
    overdue_days: 7,
  },
  survey_completions: {
    id: "survey_completions",
    label: "Survey completions",
    definition:
      "Count of church_survey_response_sessions with status = submitted and submitted_at in the date range.",
    source: "church_survey_response_sessions",
  },
  survey_completion_rate: {
    id: "survey_completion_rate",
    label: "Survey completion rate (%)",
    definition:
      "100 * submitted sessions in range / (submitted + in_progress sessions with created_at in range). Zero when denominator is 0.",
    source: "church_survey_response_sessions",
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

/** KPI keys used for branch ranking (desc). */
const CROSS_BRANCH_RANKING_KPI_ORDER = Object.freeze([
  "monthly_attendance",
  "active_members",
  "visitors",
  "event_registrations",
  "event_attendance",
  "group_attendance",
  "giving_totals",
]);

/** Within-tenant analytics: exclude inactive + obvious sample/demo campus hosts. */
const DEMO_TEST_BRANCH_EXCLUSION_SQL = `
  AND b.status = 'active'
  AND lower(b.host_slug) NOT IN ('demo', 'demo2')
  AND lower(b.host_slug) NOT LIKE 'demo-%'
  AND lower(b.host_slug) NOT LIKE '%-demo'
  AND lower(b.slug) NOT LIKE 'sample%'
  AND lower(b.slug) NOT LIKE 'demo-%'
  AND lower(b.name) NOT LIKE 'sample %'
`;

module.exports = {
  CROSS_BRANCH_KPI_DEFINITIONS,
  CROSS_BRANCH_RANKING_KPI_ORDER,
  DEMO_TEST_BRANCH_EXCLUSION_SQL,
};
