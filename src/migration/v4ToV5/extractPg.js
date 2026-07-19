"use strict";

/**
 * Read-only PostgreSQL extractor for V4 church_* tables.
 * SELECT only. Never UPDATE/DELETE/INSERT on source.
 * Optional columns are probed via information_schema so older V4 DBs degrade gracefully.
 */

const ENTITY_SQL = Object.freeze({
  organization: {
    table: "public.church_organizations",
    baseColumns: ["id", "slug", "name", "status"],
    optionalColumns: ["plan_code", "data_environment", "legal_name"],
    orderBy: "id ASC",
  },
  domain: {
    // All branches — missing host_slug is classified at transform (missing_host_slug).
    table: "public.church_branches",
    baseColumns: ["id", "organization_id", "slug", "status"],
    optionalColumns: ["host_slug", "is_primary"],
    orderBy: "id ASC",
  },
  branch: {
    table: "public.church_branches",
    baseColumns: ["id", "organization_id", "slug", "name", "status"],
    optionalColumns: [
      "timezone",
      "country_code",
      "host_slug",
      "welcome_message",
      "service_times",
      "location_text",
      "is_hq",
      "is_primary",
    ],
    orderBy: "id ASC",
  },
  user_hq_admin: {
    table: "public.church_hq_admins",
    baseColumns: [
      "a.id",
      "a.organization_id",
      "a.username",
      "a.password_hash",
      "a.display_name",
      "a.status",
      "o.slug AS organization_slug",
    ],
    optionalColumns: ["a.email"],
    fromSql: `FROM public.church_hq_admins a
         JOIN public.church_organizations o ON o.id = a.organization_id`,
    orderBy: "a.id ASC",
    columnProbeTable: "church_hq_admins",
    optionalBare: ["email"],
  },
  user_branch_admin: {
    table: "public.church_branch_admins",
    baseColumns: [
      "a.id",
      "a.organization_id",
      "a.branch_id",
      "a.username",
      "a.password_hash",
      "a.display_name",
      "a.status",
      "o.slug AS organization_slug",
    ],
    optionalColumns: ["a.email"],
    fromSql: `FROM public.church_branch_admins a
         JOIN public.church_organizations o ON o.id = a.organization_id`,
    orderBy: "a.id ASC",
    columnProbeTable: "church_branch_admins",
    optionalBare: ["email"],
  },
  member: {
    table: "public.church_members",
    baseColumns: [
      "id",
      "organization_id",
      "branch_id",
      "email",
      "phone",
      "full_name",
      "status",
      "password_hash",
      "created_at",
      "updated_at",
    ],
    optionalColumns: [],
    orderBy: "id ASC",
  },
  attendance_record: {
    table: "public.church_attendance_records",
    baseColumns: [
      "id",
      "organization_id",
      "branch_id",
      "service_date",
      "service_label",
      "headcount",
      "notes",
      "status",
      "created_at",
      "updated_at",
    ],
    optionalColumns: [],
    orderBy: "id ASC",
  },
  giving_summary: {
    table: "public.church_giving_summaries",
    baseColumns: [
      "id",
      "organization_id",
      "branch_id",
      "period_year",
      "period_month",
      "total_amount_cents",
      "currency_code",
      "notes",
      "status",
      "created_at",
      "updated_at",
    ],
    optionalColumns: [],
    orderBy: "id ASC",
  },
  announcement: {
    table: "public.church_announcements",
    baseColumns: ["id", "organization_id", "branch_id", "title", "status", "created_at", "updated_at"],
    optionalColumns: ["body", "is_pinned", "is_featured", "published_at"],
    orderBy: "id ASC",
  },
  ministry: {
    table: "public.church_ministries",
    baseColumns: ["id", "organization_id", "branch_id", "name", "slug", "description", "status"],
    optionalColumns: [],
    orderBy: "id ASC",
  },
  event: {
    table: "public.church_events",
    baseColumns: ["id", "organization_id", "branch_id", "title", "status"],
    optionalColumns: ["starts_at", "ends_at", "location_text", "registration_form_id", "description"],
    orderBy: "id ASC",
  },
  audit_log: {
    table: "public.church_audit_logs",
    baseColumns: [
      "id",
      "organization_id",
      "branch_id",
      "actor_type",
      "actor_id",
      "action",
      "entity_type",
      "entity_id",
      "metadata_json",
      "created_at",
    ],
    optionalColumns: [],
    orderBy: "id ASC",
  },
});

async function tableExists(client, schemaTable) {
  const bare = String(schemaTable).replace(/^public\./, "");
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1`,
    [bare]
  );
  return r.rowCount > 0;
}

async function existingColumns(client, tableName, candidates) {
  if (!candidates.length) return new Set();
  const r = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
        AND column_name = ANY($2::text[])`,
    [tableName, candidates]
  );
  return new Set(r.rows.map((row) => row.column_name));
}

function bareColumnName(expr) {
  const s = String(expr || "").trim();
  if (s.includes(" AS ")) {
    return s.split(/\s+AS\s+/i).pop().trim();
  }
  if (s.includes(".")) return s.split(".").pop().trim();
  return s;
}

/**
 * @param {object} spec
 * @param {Set<string>} presentOptional — bare optional column names present on table
 */
function buildSelectSql(spec, presentOptional) {
  const cols = spec.baseColumns.slice();
  const optionalExprs = spec.optionalColumns || [];
  const optionalBare = spec.optionalBare || optionalExprs.map(bareColumnName);
  for (let i = 0; i < optionalExprs.length; i += 1) {
    const bare = optionalBare[i] || bareColumnName(optionalExprs[i]);
    if (presentOptional.has(bare)) {
      cols.push(optionalExprs[i]);
    } else {
      cols.push(`NULL AS ${bare}`);
    }
  }
  const fromSql = spec.fromSql || `FROM ${spec.table}`;
  return `SELECT ${cols.join(", ")} ${fromSql} ORDER BY ${spec.orderBy} OFFSET $1 LIMIT $2`;
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ batchSize?: number }} [options]
 */
function createPgExtractor(pool, options = {}) {
  const batchSize = options.batchSize || 50;
  /** @type {Map<string, string>} */
  const sqlCache = new Map();

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

        let sql = sqlCache.get(entity);
        if (!sql) {
          const probeTable = spec.columnProbeTable || String(spec.table).replace(/^public\./, "");
          const optionalBare =
            spec.optionalBare || (spec.optionalColumns || []).map(bareColumnName);
          const present = await existingColumns(client, probeTable, optionalBare);
          sql = buildSelectSql(spec, present);
          sqlCache.set(entity, sql);
        }

        const offset = cursor ? Number(cursor) : 0;
        let rows;
        try {
          const result = await client.query(sql, [offset, batchSize]);
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
  buildSelectSql,
  existingColumns,
};
