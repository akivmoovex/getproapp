"use strict";

const { ok, quarantine } = require("./helpers");

function toIsoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function transform(row, ctx) {
  const id = row && row.id;
  if (id == null) return quarantine("missing_id", row);
  if (row.organization_id == null || row.branch_id == null) {
    return quarantine("missing_scope", row);
  }
  const eventDate = toIsoDate(row.service_date);
  if (!eventDate) return quarantine("missing_service_date", row);

  const legacyStatus = String(row.status || "recorded").toLowerCase();
  let status;
  let submittedAt = null;
  let approvedAt = null;
  if (legacyStatus === "recorded") {
    status = "approved";
    submittedAt = row.updated_at || row.created_at || new Date().toISOString();
    approvedAt = submittedAt;
  } else if (legacyStatus === "void") {
    status = "archived";
    submittedAt = row.updated_at || row.created_at || new Date().toISOString();
    approvedAt = submittedAt;
  } else {
    return quarantine("invalid_status", row);
  }

  const headcount = Number(row.headcount);
  if (!Number.isFinite(headcount) || headcount < 0) {
    return quarantine("invalid_headcount", row);
  }

  const churchId = ctx.idMap.resolve(
    "church_organizations_church",
    row.organization_id,
    "blessboard.churches"
  );
  const branchId = ctx.idMap.resolve("church_branches", row.branch_id, "blessboard.branches");
  const eventId = ctx.idMap.resolve(
    "church_attendance_records",
    id,
    "blessboard.attendance_events"
  );

  const warnings = [];
  warnings.push("per_member_attendance_unsupported");

  return ok(
    {
      attendanceEvent: {
        id: eventId,
        churchId,
        branchId,
        eventDate,
        eventType: "other",
        title: String(row.service_label || "Service").trim().slice(0, 200) || "Service",
        status,
        submittedAt,
        approvedAt,
      },
      attendanceEntry: {
        attendanceEventId: eventId,
        churchId,
        category: "other",
        count: Math.trunc(headcount),
      },
      unsupported: {
        check_ins: true,
        qr_tokens: true,
      },
    },
    warnings
  );
}

module.exports = { transform };
