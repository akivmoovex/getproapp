"use strict";

/**
 * ActiveClinic data-job adapters (ACN26).
 * Product owns schemas, validation rules, and mappings.
 * Platform owns job lifecycle, file validation, auth hooks, audit, download.
 */

const {
  registerDataJobAdapter,
  buildCsvText,
  normalizeHeader,
} = require("../../platform/jobs");
const { parseMoneyInput } = require("./formatMoney");

const SETUP_REQUIRED = ["code", "name", "amount"];

function moneyToMinor(raw) {
  const parsed = parseMoneyInput(String(raw || "").trim());
  return parsed;
}

function rowObject(headers, cells) {
  const out = {};
  headers.forEach((h, i) => {
    out[h] = cells[i] != null ? String(cells[i]).trim() : "";
  });
  return out;
}

function registerActiveClinicDataJobAdapters() {
  registerDataJobAdapter({
    productCode: "activeclinic",
    entityKey: "ac.setup_catalogue",
    jobKinds: ["import"],
    requiredHeaders: SETUP_REQUIRED,
    async previewImport({ headers, rows }) {
      const errors = [];
      const warnings = [];
      const acceptedRows = [];
      const seen = new Set();

      rows.forEach((cells, index) => {
        const line = index + 2; // header is line 1
        const row = rowObject(headers, cells);
        const code = String(row.code || "").trim().toUpperCase();
        const name = String(row.name || "").trim();
        const category = String(row.category || "").trim() || null;
        const amountMinor = moneyToMinor(row.amount);

        if (!code || !name) {
          errors.push({ line, code: "required_fields", message: "code and name are required" });
          return;
        }
        if (amountMinor === null || amountMinor < 0) {
          errors.push({ line, code: "invalid_amount", message: "amount must be a valid money value" });
          return;
        }
        if (seen.has(code)) {
          warnings.push({ line, code: "duplicate_in_file", message: `Duplicate code ${code} in file` });
        }
        seen.add(code);
        acceptedRows.push({
          line,
          code,
          name: name.slice(0, 255),
          category: category ? category.slice(0, 100) : null,
          amountMinor,
          description: String(row.description || "").trim().slice(0, 500) || null,
        });
      });

      return {
        entityKey: "ac.setup_catalogue",
        acceptedCount: acceptedRows.length,
        errorCount: errors.length,
        warningCount: warnings.length,
        errors: errors.slice(0, 50),
        warnings: warnings.slice(0, 50),
        acceptedRows: acceptedRows.slice(0, 5000),
        sample: acceptedRows.slice(0, 10),
      };
    },
    async commitImport({ db, job, trusted, acceptedRows }) {
      const facilityId = trusted && trusted.facilityId;
      const tenantId = trusted && trusted.organizationId;
      const staffId = trusted && trusted.staffId;
      if (!facilityId || !tenantId) {
        return { inserted: 0, updated: 0, skipped: acceptedRows.length, reason: "facility_required" };
      }
      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      for (const row of acceptedRows || []) {
        const existing = await db.query(
          `SELECT id FROM activeclinic.charge_catalogue_items
            WHERE tenant_id = $1
              AND (facility_id = $2 OR facility_id IS NULL)
              AND upper(code) = upper($3)
            ORDER BY facility_id NULLS LAST
            LIMIT 1`,
          [tenantId, facilityId, row.code]
        );
        if (existing.rows.length) {
          await db.query(
            `UPDATE activeclinic.charge_catalogue_items
                SET name = $1,
                    description = COALESCE($2, description),
                    category = COALESCE($3, category),
                    amount_minor = $4,
                    updated_at = now(),
                    updated_by_staff_id = $5
              WHERE id = $6`,
            [
              row.name,
              row.description,
              row.category,
              row.amountMinor,
              staffId || null,
              existing.rows[0].id,
            ]
          );
          updated += 1;
        } else {
          await db.query(
            `INSERT INTO activeclinic.charge_catalogue_items (
               tenant_id, facility_id, code, name, description, category,
               amount_minor, currency_code, is_active, created_by_staff_id, updated_by_staff_id
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,'ZMW', true, $8, $8)`,
            [
              tenantId,
              facilityId,
              row.code,
              row.name,
              row.description,
              row.category,
              row.amountMinor,
              staffId || null,
            ]
          );
          inserted += 1;
        }
      }
      return { inserted, updated, skipped, jobId: job.id };
    },
  });

  registerDataJobAdapter({
    productCode: "activeclinic",
    entityKey: "ac.patients",
    jobKinds: ["export"],
    async buildExport({ db, trusted }) {
      const orgId = trusted.organizationId;
      const facilityId = trusted.facilityId;
      // Privacy: facility-scoped patient numbers + names only — no clinical notes, no national IDs.
      const result = await db.query(
        `SELECT p.patient_number, p.first_name, p.last_name, p.date_of_birth, p.sex_at_registration
           FROM activeclinic.patients p
           JOIN activeclinic.patient_facility_links l
             ON l.patient_id = p.id
            AND l.facility_id = $2
            AND l.organization_id = $1
          WHERE p.organization_id = $1
          ORDER BY p.created_at DESC
          LIMIT 5000`,
        [orgId, facilityId]
      );
      const headers = [
        "patient_number",
        "first_name",
        "last_name",
        "date_of_birth",
        "sex_at_registration",
      ];
      const rows = result.rows.map((r) => ({
        patient_number: r.patient_number,
        first_name: r.first_name,
        last_name: r.last_name,
        date_of_birth: r.date_of_birth,
        sex_at_registration: r.sex_at_registration,
      }));
      return {
        csv: buildCsvText(headers, rows),
        filename: "ac-patients-export.csv",
        rowCount: rows.length,
        privacy: "facility_scoped_no_clinical",
      };
    },
  });

  registerDataJobAdapter({
    productCode: "activeclinic",
    entityKey: "ac.appointments",
    jobKinds: ["export"],
    async buildExport({ db, trusted, filters }) {
      const orgId = trusted.organizationId;
      const hcoId = trusted.healthcareOrganizationId || trusted.hcoId;
      const facilityId = trusted.facilityId;
      const from = (filters && filters.from) || null;
      const to = (filters && filters.to) || null;
      const params = [orgId, facilityId];
      let dateClause = "";
      if (from && to) {
        params.push(from, to);
        dateClause = ` AND a.starts_at >= $${params.length - 1}::date AND a.starts_at < ($${params.length}::date + interval '1 day')`;
      }
      const result = await db.query(
        `SELECT a.starts_at, a.ends_at, a.status, a.timezone,
                p.patient_number,
                COALESCE(st.display_name, st.service_key) AS service_name
           FROM activeclinic.appointments a
           JOIN activeclinic.patients p ON p.id = a.patient_id
           LEFT JOIN activeclinic.appointment_service_types st ON st.id = a.service_type_id
          WHERE a.organization_id = $1
            AND a.facility_id = $2
            ${dateClause}
          ORDER BY a.starts_at DESC
          LIMIT 5000`,
        params
      );
      const headers = [
        "starts_at",
        "ends_at",
        "status",
        "timezone",
        "patient_number",
        "service_name",
      ];
      const rows = result.rows.map((r) => ({
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        status: r.status,
        timezone: r.timezone,
        patient_number: r.patient_number,
        service_name: r.service_name,
      }));
      return {
        csv: buildCsvText(headers, rows),
        filename: "ac-appointments-export.csv",
        rowCount: rows.length,
        privacy: "facility_scoped_no_clinical",
      };
    },
  });

  registerDataJobAdapter({
    productCode: "activeclinic",
    entityKey: "ac.services",
    jobKinds: ["export"],
    async buildExport({ db, trusted }) {
      const orgId = trusted.organizationId;
      const facilityId = trusted.facilityId;
      const result = await db.query(
        `SELECT code, name, category, amount_minor, currency_code, is_active
           FROM activeclinic.charge_catalogue_items
          WHERE tenant_id = $1
            AND (facility_id = $2 OR facility_id IS NULL)
          ORDER BY category NULLS LAST, name
          LIMIT 5000`,
        [orgId, facilityId]
      );
      const headers = ["code", "name", "category", "amount_minor", "currency_code", "is_active"];
      return {
        csv: buildCsvText(headers, result.rows),
        filename: "ac-services-export.csv",
        rowCount: result.rows.length,
        privacy: "facility_scoped",
      };
    },
  });

  registerDataJobAdapter({
    productCode: "activeclinic",
    entityKey: "ac.financial_summary",
    jobKinds: ["export"],
    async buildExport({ db, trusted, filters }) {
      const orgId = trusted.organizationId;
      const facilityId = trusted.facilityId;
      const from = (filters && filters.from) || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      const to = (filters && filters.to) || new Date().toISOString().slice(0, 10);
      const payments = await db.query(
        `SELECT payment_method,
                COUNT(*)::int AS payment_count,
                COALESCE(SUM(amount_minor), 0)::bigint AS amount_minor
           FROM activeclinic.payments
          WHERE tenant_id = $1
            AND facility_id = $2
            AND payment_date >= $3::date
            AND payment_date <= $4::date
          GROUP BY payment_method
          ORDER BY payment_method`,
        [orgId, facilityId, from, to]
      );
      const invoices = await db.query(
        `SELECT status,
                COUNT(*)::int AS invoice_count,
                COALESCE(SUM(total_amount_minor), 0)::bigint AS total_minor
           FROM activeclinic.invoices
          WHERE tenant_id = $1
            AND facility_id = $2
            AND invoice_date >= $3::date
            AND invoice_date <= $4::date
          GROUP BY status
          ORDER BY status`,
        [orgId, facilityId, from, to]
      );
      const headers = ["section", "key", "count", "amount_minor", "from_date", "to_date"];
      const rows = [];
      for (const r of payments.rows) {
        rows.push({
          section: "payments",
          key: r.payment_method,
          count: r.payment_count,
          amount_minor: r.amount_minor,
          from_date: from,
          to_date: to,
        });
      }
      for (const r of invoices.rows) {
        rows.push({
          section: "invoices",
          key: r.status,
          count: r.invoice_count,
          amount_minor: r.total_minor,
          from_date: from,
          to_date: to,
        });
      }
      return {
        csv: buildCsvText(headers, rows),
        filename: "ac-financial-summary-export.csv",
        rowCount: rows.length,
        privacy: "facility_scoped_aggregates",
      };
    },
  });
}

module.exports = {
  registerActiveClinicDataJobAdapters,
  SETUP_REQUIRED,
  normalizeHeader,
};
