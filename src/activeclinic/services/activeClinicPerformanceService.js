"use strict";

/**
 * ACN25 — Clinic performance aggregates.
 * Facility-scoped SQL aggregates only. Never selects clinical narratives / SOAP / diagnoses.
 */

const { formatMoney } = require("./formatMoney");

function hasPerm(set, key) {
  return set instanceof Set ? set.has(key) : Array.isArray(set) && set.includes(key);
}

function parseDateOnly(raw, fallback) {
  const text = String(raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return fallback;
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { from: fmt(start), to: fmt(end) };
}

/**
 * @param {import('pg').Pool} pool
 * @param {{
 *   organizationId: string,
 *   healthcareOrganizationId: string,
 *   facilityId: string,
 *   permissions: Set<string>|string[],
 *   filters?: { from?: string, to?: string, practitionerId?: string, facilityId?: string },
 *   facilities?: Array<{id:string,displayName:string}>,
 *   practitioners?: Array<{id:string,displayName:string}>,
 * }} input
 */
async function loadClinicPerformanceDashboard(pool, input) {
  const perms = input.permissions;
  if (!hasPerm(perms, "activeclinic.performance.view")) {
    return { ok: false, code: "access_denied", httpStatus: 403 };
  }

  const orgId = input.organizationId;
  const hcoId = input.healthcareOrganizationId;
  const selectedFacilityId = input.facilityId;
  if (!orgId || !hcoId || !selectedFacilityId) {
    return { ok: false, code: "facility_required", httpStatus: 400 };
  }

  const defaults = defaultDateRange();
  const filtersIn = input.filters || {};
  const from = parseDateOnly(filtersIn.from, defaults.from);
  const to = parseDateOnly(filtersIn.to, defaults.to);
  // Location filter may only equal trusted selected facility (or stay on selected).
  // Never accept a foreign facility id from the client as a trust boundary bypass.
  const facilityId = selectedFacilityId;
  const practitionerId = String(filtersIn.practitionerId || "").trim() || null;

  const fromTs = `${from}T00:00:00.000Z`;
  const toTsExclusive = new Date(`${to}T00:00:00.000Z`);
  toTsExclusive.setUTCDate(toTsExclusive.getUTCDate() + 1);
  const toTs = toTsExclusive.toISOString();

  const apptParams = [orgId, hcoId, facilityId, fromTs, toTs];
  let practitionerClause = "";
  if (practitionerId) {
    apptParams.push(practitionerId);
    practitionerClause = ` AND a.assigned_staff_id = $${apptParams.length}`;
  }

  const appointmentAgg = await pool.query(
    `SELECT
       COUNT(*)::int AS appointments,
       COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed,
       COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancellations,
       COUNT(*) FILTER (WHERE a.status = 'no_show')::int AS no_shows
     FROM activeclinic.appointments a
     WHERE a.organization_id = $1
       AND a.healthcare_organization_id = $2
       AND a.facility_id = $3
       AND a.starts_at >= $4::timestamptz
       AND a.starts_at < $5::timestamptz
       ${practitionerClause}`,
    apptParams
  );

  const waitParams = [orgId, hcoId, facilityId, fromTs, toTs];
  let waitPractitionerClause = "";
  if (practitionerId) {
    waitParams.push(practitionerId);
    waitPractitionerClause = ` AND q.serving_staff_id = $${waitParams.length}`;
  }
  const waitAgg = await pool.query(
    `SELECT
       COUNT(*)::int AS sampled,
       COALESCE(
         ROUND(AVG(
           EXTRACT(EPOCH FROM (
             COALESCE(q.serving_started_at, q.called_at, q.completed_at) - q.created_at
           )) / 60.0
         )::numeric, 1),
         0
       ) AS avg_wait_minutes
     FROM activeclinic.queue_entries q
     WHERE q.organization_id = $1
       AND q.healthcare_organization_id = $2
       AND q.facility_id = $3
       AND q.created_at >= $4::timestamptz
       AND q.created_at < $5::timestamptz
       AND COALESCE(q.serving_started_at, q.called_at, q.completed_at) IS NOT NULL
       ${waitPractitionerClause}`,
    waitParams
  );

  let revenueMinor = 0;
  let currencyCode = "ZMW";
  if (
    hasPerm(perms, "activeclinic.billing.reports.view") ||
    hasPerm(perms, "activeclinic.billing.view") ||
    hasPerm(perms, "activeclinic.payment.view")
  ) {
    const rev = await pool.query(
      `SELECT
         COALESCE(SUM(py.amount_minor), 0)::bigint AS revenue_minor,
         COALESCE(MAX(py.currency_code), 'ZMW') AS currency_code
       FROM activeclinic.payments py
       WHERE py.tenant_id = $1
         AND py.facility_id = $2
         AND py.payment_date >= $3::date
         AND py.payment_date <= $4::date`,
      [orgId, facilityId, from, to]
    );
    revenueMinor = parseInt(rev.rows[0].revenue_minor, 10) || 0;
    currencyCode = rev.rows[0].currency_code || "ZMW";
  }

  const popular = await pool.query(
    `SELECT
       COALESCE(st.display_name, st.service_key, 'Service') AS service_name,
       COUNT(*)::int AS booking_count
     FROM activeclinic.appointments a
     JOIN activeclinic.appointment_service_types st
       ON st.id = a.service_type_id
      AND st.healthcare_organization_id = a.healthcare_organization_id
     WHERE a.organization_id = $1
       AND a.healthcare_organization_id = $2
       AND a.facility_id = $3
       AND a.starts_at >= $4::timestamptz
       AND a.starts_at < $5::timestamptz
       ${practitionerClause}
     GROUP BY 1
     ORDER BY booking_count DESC, service_name ASC
     LIMIT 8`,
    apptParams
  );

  const row = appointmentAgg.rows[0] || {};
  const wait = waitAgg.rows[0] || {};

  return {
    ok: true,
    code: "ok",
    stitch: {
      // Audit inventory IDs (ACN25). Live Stitch inventory may drift; P01 dashboard is visual fallback.
      desktop: "b834a9b768664c1d91302a0aa1b79b7c",
      mobile: "1615176a78ac4a88a77f71712c6671a6",
      visualFallbackDesktop: "390032bf54ca44ee851673a4800f9af3",
      visualFallbackMobile: "8be466d48814446ab8bb087baacc6ec9",
    },
    filters: {
      from,
      to,
      practitionerId,
      facilityId,
    },
    filterOptions: {
      facilities: Array.isArray(input.facilities) ? input.facilities : [],
      practitioners: Array.isArray(input.practitioners) ? input.practitioners : [],
    },
    metrics: {
      appointments: parseInt(row.appointments, 10) || 0,
      completed: parseInt(row.completed, 10) || 0,
      cancellations: parseInt(row.cancellations, 10) || 0,
      noShows: parseInt(row.no_shows, 10) || 0,
      avgWaitMinutes: Number(wait.avg_wait_minutes) || 0,
      waitSamples: parseInt(wait.sampled, 10) || 0,
      revenueMinor,
      revenueFormatted: formatMoney(revenueMinor, currencyCode),
      currencyCode,
      canViewRevenue:
        hasPerm(perms, "activeclinic.billing.reports.view") ||
        hasPerm(perms, "activeclinic.billing.view") ||
        hasPerm(perms, "activeclinic.payment.view"),
    },
    popularServices: popular.rows.map((r) => ({
      name: r.service_name,
      count: parseInt(r.booking_count, 10) || 0,
    })),
  };
}

module.exports = {
  loadClinicPerformanceDashboard,
  defaultDateRange,
};
