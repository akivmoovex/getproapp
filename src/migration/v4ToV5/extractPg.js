"use strict";

/**
 * Read-only PostgreSQL extractor for V4 church_* tables.
 * SELECT only. Never UPDATE/DELETE/INSERT on source.
 */

const ENTITY_SQL = Object.freeze({
  organization: {
    table: "public.church_organizations",
    sql: `SELECT id, slug, name, status,
            COALESCE(plan_code, 'free') AS plan_code,
            data_environment, legal_name, created_at, updated_at
         FROM public.church_organizations
        ORDER BY id ASC
        OFFSET $1 LIMIT $2`,
    optionalColumns: ["plan_code", "data_environment", "legal_name"],
  },
  domain: {
    table: "public.church_branches",
    sql: `SELECT id, organization_id, slug, host_slug, status
         FROM public.church_branches
        WHERE host_slug IS NOT NULL AND trim(host_slug) <> ''
        ORDER BY id ASC
        OFFSET $1 LIMIT $2`,
  },
  branch: {
    table: "public.church_branches",
    sql: `SELECT id, organization_id, slug, name, status, welcome_message,
            service_times, location_text, host_slug, timezone, country_code
         FROM public.church_branches
        ORDER BY id ASC
        OFFSET $1 LIMIT $2`,
    optionalColumns: ["timezone", "country_code", "host_slug", "welcome_message", "service_times", "location_text"],
  },
  user_hq_admin: {
    table: "public.church_hq_admins",
    sql: `SELECT a.id, a.organization_id, a.username, a.password_hash, a.display_name, a.status,
            a.email, o.slug AS organization_slug
         FROM public.church_hq_admins a
         JOIN public.church_organizations o ON o.id = a.organization_id
        ORDER BY a.id ASC
        OFFSET $1 LIMIT $2`,
    optionalColumns: ["email"],
  },
  user_branch_admin: {
    table: "public.church_branch_admins",
    sql: `SELECT a.id, a.organization_id, a.branch_id, a.username, a.password_hash,
            a.display_name, a.status, a.email, o.slug AS organization_slug
         FROM public.church_branch_admins a
         JOIN public.church_organizations o ON o.id = a.organization_id
        ORDER BY a.id ASC
        OFFSET $1 LIMIT $2`,
    optionalColumns: ["email"],
  },
  member: {
    table: "public.church_members",
    sql: `SELECT id, organization_id, branch_id, email, phone, full_name, status,
            password_hash, created_at, updated_at
         FROM public.church_members
        ORDER BY id ASC
        OFFSET $1 LIMIT $2`,
  },
  attendance_record: {
    table: "public.church_attendance_records",
    sql: `SELECT id, organization_id, branch_id, service_date, service_label, headcount,
            notes, status, created_at, updated_at
         FROM public.church_attendance_records
        ORDER BY id ASC
        OFFSET $1 LIMIT $2`,
  },
  giving_summary: {
    table: "public.church_giving_summaries",
    sql: `SELECT id, organization_id, branch_id, period_year, period_month,
            total_amount_cents, currency_code, notes, status, created_at, updated_at
         FROM public.church_giving_summaries
        ORDER BY id ASC
        OFFSET $1 LIMIT $2`,
  },
  announcement: {
    table: "public.church_announcements",
    sql: `SELECT id, organization_id, branch_id, title, body, status, published_at,
            is_pinned, is_featured, created_at, updated_at
         FROM public.church_announcements
        ORDER BY id ASC
        OFFSET $1 LIMIT $2`,
    optionalColumns: ["body", "is_pinned", "is_featured", "published_at"],
  },
  ministry: {
    table: "public.church_ministries",
    sql: `SELECT id, organization_id, branch_id, name, slug, description, status
         FROM public.church_ministries
        ORDER BY id ASC
        OFFSET $1 LIMIT $2`,
  },
  event: {
    table: "public.church_events",
    sql: `SELECT id, organization_id, branch_id, title, description, status,
            starts_at, ends_at, location_text, registration_form_id
         FROM public.church_events
        ORDER BY id ASC
        OFFSET $1 LIMIT $2`,
    optionalColumns: ["starts_at", "ends_at", "location_text", "registration_form_id", "description"],
  },
  audit_log: {
    table: "public.church_audit_logs",
    sql: `SELECT id, organization_id, branch_id, actor_type, actor_id, action,
            entity_type, entity_id, metadata_json, created_at
         FROM public.church_audit_logs
        ORDER BY id ASC
        OFFSET $1 LIMIT $2`,
  },
});

async function tableExists(client, schemaTable) {
  const [schema, table] = String(schemaTable).replace(/^public\./, "public.").split(".");
  const sch = schema === "public" || !table ? "public" : schema;
  const tbl = table || schemaTable.replace(/^public\./, "");
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = $2`,
    [sch, tbl.replace(/^public\./, "")]
  );
  return r.rowCount > 0;
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ batchSize?: number }} [options]
 */
function createPgExtractor(pool, options = {}) {
  const batchSize = options.batchSize || 50;

  return {
    kind: "pg_readonly",

    /**
     * @param {string} entity
     * @param {string|null} cursor
     */
    async extract(entity, cursor) {
      const spec = ENTITY_SQL[entity];
      if (!spec) return { rows: [], nextCursor: null, skipped: true, reason: "no_sql" };

      const client = await pool.connect();
      try {
        // Per-transaction read-only; do not poison pooled connections.
        await client.query("BEGIN");
        await client.query("SET LOCAL default_transaction_read_only = on");

        const exists = await tableExists(client, spec.table);
        if (!exists) {
          await client.query("COMMIT");
          return {
            rows: [],
            nextCursor: null,
            skipped: true,
            reason: "source_table_missing",
            table: spec.table,
          };
        }

        const offset = cursor ? Number(cursor) : 0;
        let rows;
        try {
          const result = await client.query(spec.sql, [offset, batchSize]);
          rows = result.rows;
        } catch (err) {
          await client.query("ROLLBACK");
          return {
            rows: [],
            nextCursor: null,
            skipped: true,
            reason: "source_query_failed",
            table: spec.table,
            errorCode: err && err.code ? err.code : null,
          };
        }

        await client.query("COMMIT");
        const nextCursor = rows.length === batchSize ? String(offset + batchSize) : null;
        return { rows, nextCursor, skipped: false };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      } finally {
        client.release();
      }
    },

    async count(entity) {
      const spec = ENTITY_SQL[entity];
      if (!spec) return { ok: false, count: 0 };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL default_transaction_read_only = on");
        if (!(await tableExists(client, spec.table))) {
          await client.query("COMMIT");
          return { ok: true, count: 0, missing: true };
        }
        const r = await client.query(`SELECT COUNT(*)::int AS n FROM ${spec.table}`);
        await client.query("COMMIT");
        return { ok: true, count: r.rows[0].n };
      } catch {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        return { ok: false, count: 0 };
      } finally {
        client.release();
      }
    },
  };
}

module.exports = {
  ENTITY_SQL,
  createPgExtractor,
  tableExists,
};
