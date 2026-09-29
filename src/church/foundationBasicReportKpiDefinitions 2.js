"use strict";

/**
 * Documented KPI definitions for Foundation branch basic reporting.
 * Reuses Growth cross-branch formulas where applicable; adds branch-only metrics.
 */

const { CROSS_BRANCH_KPI_DEFINITIONS } = require("./crossBranchKpiDefinitions");

const FOUNDATION_BASIC_REPORT_KPI_DEFINITIONS = Object.freeze({
  total_members: {
    id: "total_members",
    label: "Total members",
    definition:
      "Count of all church_members on the branch (pending, verified, suspended, and rejected).",
    source: "church_members",
    drillDown: true,
  },
  active_members: {
    ...CROSS_BRANCH_KPI_DEFINITIONS.active_members,
    drillDown: true,
  },
  inactive_members: {
    id: "inactive_members",
    label: "Inactive members",
    definition:
      "Count of church_members with status suspended or rejected on the branch (point-in-time).",
    source: "church_members",
    drillDown: true,
  },
  monthly_attendance: {
    ...CROSS_BRANCH_KPI_DEFINITIONS.monthly_attendance,
    drillDown: true,
  },
  visitors: {
    ...CROSS_BRANCH_KPI_DEFINITIONS.visitors,
    drillDown: true,
  },
  event_registrations: {
    ...CROSS_BRANCH_KPI_DEFINITIONS.event_registrations,
    drillDown: true,
  },
  event_attendance: {
    ...CROSS_BRANCH_KPI_DEFINITIONS.event_attendance,
    drillDown: true,
  },
  open_prayer_requests: {
    id: "open_prayer_requests",
    label: "Open prayer requests",
    definition:
      "Prayer requests with status submitted or reviewed (not closed) on the branch.",
    source: "church_prayer_requests",
    drillDown: true,
  },
  open_pastoral_follow_ups: {
    ...CROSS_BRANCH_KPI_DEFINITIONS.open_pastoral_follow_ups,
    drillDown: true,
  },
  giving_totals: {
    ...CROSS_BRANCH_KPI_DEFINITIONS.giving_totals,
    drillDown: true,
  },
  ministry_participation: {
    id: "ministry_participation",
    label: "Ministry participation",
    definition:
      "Count of active church_member_ministries assignments on published ministries at the branch.",
    source: "church_member_ministries",
    drillDown: true,
  },
});

/** KPI keys shown on the basic report dashboard (ordered). */
const FOUNDATION_BASIC_REPORT_KPI_ORDER = Object.freeze([
  "total_members",
  "active_members",
  "inactive_members",
  "visitors",
  "monthly_attendance",
  "event_registrations",
  "event_attendance",
  "open_prayer_requests",
  "open_pastoral_follow_ups",
  "giving_totals",
  "ministry_participation",
]);

module.exports = {
  FOUNDATION_BASIC_REPORT_KPI_DEFINITIONS,
  FOUNDATION_BASIC_REPORT_KPI_ORDER,
};
