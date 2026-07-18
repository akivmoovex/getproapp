"use strict";

/**
 * Target loader — dry-run by default; apply writes in bounded transactions.
 * Idempotent via deterministic primary keys (ON CONFLICT DO NOTHING / existence check).
 * Never touches source DB. Never creates public.tenants or public.session.
 */

const FORBIDDEN_TARGET_DDL = Object.freeze([
  "public.tenants",
  "public.session",
  "CREATE TABLE public.tenants",
  "CREATE TABLE public.session",
]);

function assertNoForbiddenSql(sql) {
  const upper = String(sql);
  for (const bad of FORBIDDEN_TARGET_DDL) {
    if (upper.includes(bad)) {
      throw new Error(`forbidden_target_sql:${bad}`);
    }
  }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} entity
 * @param {object} record
 * @param {object} ctx
 */
async function applyEntity(client, entity, record, ctx) {
  if (entity === "organization") {
    return applyOrganization(client, record, ctx);
  }
  if (entity === "domain") {
    return applyDomain(client, record, ctx);
  }
  if (entity === "branch") {
    return applyBranch(client, record, ctx);
  }
  if (entity === "user_hq_admin" || entity === "user_branch_admin") {
    return applyUserRole(client, record, ctx);
  }
  if (entity === "member") {
    return applyMember(client, record, ctx);
  }
  if (entity === "ministry") {
    return applyMinistry(client, record, ctx);
  }
  if (entity === "event") {
    return applyEvent(client, record, ctx);
  }
  if (entity === "announcement") {
    return applyAnnouncement(client, record, ctx);
  }
  if (entity === "attendance_record") {
    return applyAttendance(client, record, ctx);
  }
  if (entity === "giving_summary") {
    return applyGiving(client, record, ctx);
  }
  if (entity === "audit_log") {
    return applyAudit(client, record, ctx);
  }
  return { status: "skipped", reason: "no_loader" };
}

async function applyOrganization(client, record) {
  const org = record.organization;
  const church = record.church;
  const enrolment = record.enrolment;
  const subscription = record.subscription;

  const existing = await client.query(`SELECT id, organization_key FROM platform.organizations WHERE id = $1`, [
    org.id,
  ]);
  if (existing.rows[0]) {
    if (existing.rows[0].organization_key !== org.organizationKey) {
      return {
        status: "conflict",
        code: "organization_key_mismatch",
        sourceId: null,
        detail: "deterministic id exists with different organization_key",
      };
    }
    return { status: "skipped", reason: "already_present" };
  }

  const keyClash = await client.query(
    `SELECT id FROM platform.organizations WHERE organization_key = $1 AND id <> $2`,
    [org.organizationKey, org.id]
  );
  if (keyClash.rows[0]) {
    return {
      status: "conflict",
      code: "organization_key_taken",
      detail: "organization_key owned by different id",
    };
  }

  const sqlOrg = `INSERT INTO platform.organizations
      (id, organization_key, display_name, legal_name, status, data_environment)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (id) DO NOTHING`;
  assertNoForbiddenSql(sqlOrg);
  await client.query(sqlOrg, [
    org.id,
    org.organizationKey,
    org.displayName,
    org.legalName,
    org.status,
    org.dataEnvironment,
  ]);

  const product = await client.query(
    `SELECT id FROM platform.products WHERE product_key = 'blessboard' LIMIT 1`
  );
  if (!product.rows[0]) {
    return { status: "conflict", code: "blessboard_product_missing" };
  }

  await client.query(
    `INSERT INTO platform.organization_products
       (organization_id, product_id, product_tenant_key, status)
     VALUES ($1,$2,$3,'active')
     ON CONFLICT (organization_id, product_id) DO NOTHING`,
    [enrolment.organizationId, product.rows[0].id, enrolment.productTenantKey]
  );

  const plan = await client.query(`SELECT id FROM platform.plans WHERE plan_key = $1`, [
    subscription.planKey,
  ]);
  if (plan.rows[0]) {
    const sub = await client.query(
      `SELECT id FROM platform.organization_subscriptions
        WHERE organization_id = $1 AND product_key = 'blessboard'
          AND status IN ('active','trialing','past_due')`,
      [subscription.organizationId]
    );
    if (!sub.rows[0]) {
      await client.query(
        `INSERT INTO platform.organization_subscriptions
           (organization_id, product_key, plan_id, status)
         VALUES ($1,'blessboard',$2,'active')`,
        [subscription.organizationId, plan.rows[0].id]
      );
    }
  }

  const chExisting = await client.query(`SELECT id FROM blessboard.churches WHERE id = $1`, [church.id]);
  if (!chExisting.rows[0]) {
    await client.query(
      `INSERT INTO blessboard.churches
         (id, organization_id, church_key, display_name, legal_name, status, data_environment)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        church.id,
        church.organizationId,
        church.churchKey,
        church.displayName,
        church.legalName,
        church.status,
        church.dataEnvironment,
      ]
    );
  }

  return { status: "written" };
}

async function applyDomain(client, record) {
  const d = record.domain;
  const existing = await client.query(`SELECT id, hostname FROM platform.domains WHERE id = $1`, [d.id]);
  if (existing.rows[0]) {
    if (existing.rows[0].hostname !== d.hostname) {
      return { status: "conflict", code: "domain_hostname_mismatch" };
    }
    return { status: "skipped", reason: "already_present" };
  }
  const clash = await client.query(`SELECT id FROM platform.domains WHERE hostname = $1 AND id <> $2`, [
    d.hostname,
    d.id,
  ]);
  if (clash.rows[0]) return { status: "conflict", code: "hostname_taken" };

  const product = await client.query(
    `SELECT id FROM platform.products WHERE product_key = 'blessboard' LIMIT 1`
  );
  if (!product.rows[0]) return { status: "conflict", code: "blessboard_product_missing" };

  await client.query(
    `INSERT INTO platform.domains
       (id, organization_id, product_id, deployment_id, hostname, domain_type, is_primary, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'active')
     ON CONFLICT (id) DO NOTHING`,
    [
      d.id,
      d.organizationId,
      product.rows[0].id,
      d.deploymentCode,
      d.hostname,
      d.domainType,
      d.isPrimary === true,
    ]
  );
  return { status: "written" };
}

async function applyBranch(client, record) {
  const b = record.branch;
  const existing = await client.query(`SELECT id, branch_key FROM blessboard.branches WHERE id = $1`, [
    b.id,
  ]);
  if (existing.rows[0]) {
    if (existing.rows[0].branch_key !== b.branchKey) {
      return { status: "conflict", code: "branch_key_mismatch" };
    }
    return { status: "skipped", reason: "already_present" };
  }

  await client.query(
    `INSERT INTO blessboard.branches
       (id, church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO NOTHING`,
    [
      b.id,
      b.churchId,
      b.branchKey,
      b.displayName,
      b.branchType,
      b.status,
      b.isPrimary === true,
      b.timezone,
      b.countryCode,
    ]
  );

  await client.query(
    `INSERT INTO blessboard.branch_settings (branch_id, public_name, timezone, country_code)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (branch_id) DO NOTHING`,
    [b.id, b.displayName, b.timezone, b.countryCode]
  );

  return { status: "written" };
}

async function applyUserRole(client, record) {
  const u = record.user;
  const role = record.role;

  const byId = await client.query(`SELECT id, email_normalized FROM blessboard.users WHERE id = $1`, [
    u.id,
  ]);
  if (byId.rows[0]) {
    if (byId.rows[0].email_normalized !== u.emailNormalized) {
      return { status: "conflict", code: "user_email_mismatch" };
    }
  } else {
    const emailClash = await client.query(
      `SELECT id FROM blessboard.users WHERE email_normalized = $1 AND id <> $2`,
      [u.emailNormalized, u.id]
    );
    if (emailClash.rows[0]) {
      // Merge: use existing user id for role only
      role.userId = emailClash.rows[0].id;
    } else {
      await client.query(
        `INSERT INTO blessboard.users
           (id, email_normalized, email_display, password_hash, status, display_name)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO NOTHING`,
        [u.id, u.emailNormalized, u.emailDisplay, u.passwordHash, u.status, u.displayName]
      );
    }
  }

  const userId = role.userId;
  const existingRole = await client.query(
    `SELECT id FROM blessboard.user_roles
      WHERE user_id = $1 AND organization_id = $2
        AND church_id IS NOT DISTINCT FROM $3
        AND branch_id IS NOT DISTINCT FROM $4
        AND role_key = $5`,
    [userId, role.organizationId, role.churchId, role.branchId, role.roleKey]
  );
  if (existingRole.rows[0]) return { status: "skipped", reason: "already_present" };

  await client.query(
    `INSERT INTO blessboard.user_roles
       (user_id, organization_id, church_id, branch_id, role_key, status)
     VALUES ($1,$2,$3,$4,$5,'active')`,
    [userId, role.organizationId, role.churchId, role.branchId, role.roleKey]
  );
  return { status: "written" };
}

async function applyMember(client, record) {
  const m = record.member;
  const membership = record.membership;
  const existing = await client.query(`SELECT id FROM blessboard.members WHERE id = $1`, [m.id]);
  if (existing.rows[0]) return { status: "skipped", reason: "already_present" };

  await client.query(
    `INSERT INTO blessboard.members
       (id, church_id, user_id, first_name, last_name, email_normalized, email_display,
        phone_normalized, phone_display, status)
     VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO NOTHING`,
    [
      m.id,
      m.churchId,
      m.firstName,
      m.lastName,
      m.emailNormalized,
      m.emailDisplay,
      m.phoneNormalized,
      m.phoneDisplay,
      m.status,
    ]
  );

  await client.query(
    `INSERT INTO blessboard.member_branch_memberships
       (member_id, branch_id, is_primary, membership_status)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (member_id, branch_id) DO NOTHING`,
    [membership.memberId, membership.branchId, membership.isPrimary === true, membership.membershipStatus]
  );
  return { status: "written" };
}

async function applyMinistry(client, record) {
  const m = record.ministry;
  const existing = await client.query(`SELECT id FROM blessboard.ministries WHERE id = $1`, [m.id]);
  if (existing.rows[0]) return { status: "skipped", reason: "already_present" };
  await client.query(
    `INSERT INTO blessboard.ministries
       (id, church_id, branch_id, name, description, status, join_policy)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO NOTHING`,
    [m.id, m.churchId, m.branchId, m.name, m.description, m.status, m.joinPolicy || "request"]
  );
  return { status: "written" };
}

async function applyEvent(client, record) {
  const e = record.event;
  const existing = await client.query(`SELECT id FROM blessboard.events WHERE id = $1`, [e.id]);
  if (existing.rows[0]) return { status: "skipped", reason: "already_present" };
  await client.query(
    `INSERT INTO blessboard.events
       (id, church_id, branch_id, title, summary, starts_at, ends_at, timezone, location, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO NOTHING`,
    [
      e.id,
      e.churchId,
      e.branchId,
      e.title,
      e.description,
      e.startsAt,
      e.endsAt,
      e.timezone || "UTC",
      e.locationText,
      e.status,
    ]
  );
  return { status: "written" };
}

async function applyAnnouncement(client, record) {
  const a = record.announcement;
  const existing = await client.query(`SELECT id FROM blessboard.announcements WHERE id = $1`, [a.id]);
  if (existing.rows[0]) return { status: "skipped", reason: "already_present" };
  await client.query(
    `INSERT INTO blessboard.announcements
       (id, church_id, branch_id, title, body, status, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO NOTHING`,
    [a.id, a.churchId, a.branchId, a.title, a.body, a.status, a.publishedAt]
  );
  for (const aud of record.audiences || []) {
    await client.query(
      `INSERT INTO blessboard.announcement_audiences (announcement_id, audience_key)
       VALUES ($1,$2)
       ON CONFLICT (announcement_id, audience_key) DO NOTHING`,
      [aud.announcementId, aud.audienceKey]
    );
  }
  return { status: "written" };
}

async function ensureMigrationActor(client, churchId, organizationId) {
  const email = `migration-actor-${String(organizationId).slice(0, 8)}@migrated.invalid`;
  const existing = await client.query(
    `SELECT id FROM blessboard.users WHERE email_normalized = $1`,
    [email]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const { rows } = await client.query(
    `INSERT INTO blessboard.users
       (email_normalized, email_display, password_hash, status, display_name)
     VALUES ($1,$1,$2,'active','Migration Actor')
     RETURNING id`,
    [email, "$2a$10$migrationactorplaceholderhashxx"]
  );
  return rows[0].id;
}

async function applyAttendance(client, record) {
  const ev = record.attendanceEvent;
  const entry = record.attendanceEntry;
  const existing = await client.query(`SELECT id FROM blessboard.attendance_events WHERE id = $1`, [
    ev.id,
  ]);
  if (existing.rows[0]) return { status: "skipped", reason: "already_present" };

  await client.query(
    `INSERT INTO blessboard.attendance_events
       (id, church_id, branch_id, event_date, event_type, title, status, submitted_at, approved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO NOTHING`,
    [
      ev.id,
      ev.churchId,
      ev.branchId,
      ev.eventDate,
      ev.eventType,
      ev.title,
      ev.status,
      ev.submittedAt,
      ev.approvedAt,
    ]
  );
  await client.query(
    `INSERT INTO blessboard.attendance_entries
       (attendance_event_id, church_id, category, count)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (attendance_event_id, category) DO NOTHING`,
    [entry.attendanceEventId, entry.churchId, entry.category, entry.count]
  );
  return { status: "written" };
}

async function applyGiving(client, record) {
  const cat = record.category;
  const entry = record.entry;
  const existing = await client.query(`SELECT id FROM blessboard.giving_entries WHERE id = $1`, [
    entry.id,
  ]);
  if (existing.rows[0]) return { status: "skipped", reason: "already_present" };

  let categoryId;
  const catRow = await client.query(
    `SELECT id FROM blessboard.giving_categories WHERE church_id = $1 AND category_key = $2`,
    [cat.churchId, cat.categoryKey]
  );
  if (catRow.rows[0]) categoryId = catRow.rows[0].id;
  else {
    const inserted = await client.query(
      `INSERT INTO blessboard.giving_categories (church_id, category_key, label, status)
       VALUES ($1,$2,$3,'active')
       RETURNING id`,
      [cat.churchId, cat.categoryKey, cat.label]
    );
    categoryId = inserted.rows[0].id;
  }

  const org = await client.query(
    `SELECT organization_id FROM blessboard.churches WHERE id = $1`,
    [entry.churchId]
  );
  const actorId = await ensureMigrationActor(
    client,
    entry.churchId,
    org.rows[0] && org.rows[0].organization_id
  );

  await client.query(
    `INSERT INTO blessboard.giving_entries
       (id, church_id, branch_id, category_id, giving_date, amount, currency, notes, status,
        recorded_by_user_id, submitted_at, approved_at, submitted_by_user_id, approved_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6::numeric,$7,$8,$9,$10,$11,$12,$10,$10)
     ON CONFLICT (id) DO NOTHING`,
    [
      entry.id,
      entry.churchId,
      entry.branchId,
      categoryId,
      entry.givingDate,
      entry.amount,
      entry.currency,
      entry.notes,
      entry.status,
      actorId,
      entry.submittedAt,
      entry.approvedAt,
    ]
  );
  return { status: "written" };
}

async function applyAudit(client, record) {
  const a = record.auditEvent;
  const existing = await client.query(`SELECT id FROM platform.audit_events WHERE id = $1`, [a.id]);
  if (existing.rows[0]) return { status: "skipped", reason: "already_present" };
  await client.query(
    `INSERT INTO platform.audit_events
       (id, deployment_code, organization_id, church_id, branch_id, actor_user_id,
        action_key, entity_type, entity_id, outcome, metadata_json, created_at)
     VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,NULL,$8,$9::jsonb,COALESCE($10::timestamptz, now()))
     ON CONFLICT (id) DO NOTHING`,
    [
      a.id,
      a.deploymentCode,
      a.organizationId,
      a.churchId,
      a.branchId,
      a.actionKey,
      a.entityType,
      a.outcome,
      JSON.stringify(a.metadataJson || {}),
      a.createdAt,
    ]
  );
  return { status: "written" };
}

/**
 * @param {object} options
 * @param {boolean} [options.dryRun=true]
 * @param {import('pg').Pool} [options.targetPool]
 * @param {number} [options.batchSize]
 */
function createTargetLoader(options = {}) {
  const dryRun = options.dryRun !== false;
  const pool = options.targetPool || null;
  const batchSize = options.batchSize || 50;

  return {
    dryRun,
    batchSize,

    /**
     * Load a bounded batch inside one transaction (apply) or simulate (dry-run).
     * @param {string} entity
     * @param {Array<{ sourceId: *, transformed: object }>} items
     * @param {{ forceFailAfter?: number }} [hooks] — test-only rollback hook
     */
    async loadBatch(entity, items, hooks = {}) {
      if (dryRun) {
        const results = [];
        for (const item of items) {
          const t = item.transformed;
          if (!t || !t.ok) {
            results.push({
              sourceId: item.sourceId,
              status: "quarantined",
              quarantine: t && t.quarantine,
            });
            continue;
          }
          results.push({
            sourceId: item.sourceId,
            status: "dry_run_accepted",
            warnings: t.warnings || [],
          });
        }
        return { ok: true, rolledBack: false, results };
      }

      if (!pool) {
        return {
          ok: false,
          rolledBack: false,
          results: [],
          error: "target_pool_required_for_apply",
        };
      }

      const client = await pool.connect();
      const results = [];
      try {
        await client.query("BEGIN");
        let i = 0;
        for (const item of items) {
          if (hooks.forceFailAfter != null && i >= hooks.forceFailAfter) {
            throw new Error("forced_batch_failure");
          }
          const t = item.transformed;
          if (!t || !t.ok) {
            results.push({
              sourceId: item.sourceId,
              status: "quarantined",
              quarantine: t && t.quarantine,
            });
            i += 1;
            continue;
          }
          const applied = await applyEntity(client, entity, t.record, { dryRun: false });
          results.push({ sourceId: item.sourceId, ...applied });
          i += 1;
        }
        await client.query("COMMIT");
        return { ok: true, rolledBack: false, results };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        return {
          ok: false,
          rolledBack: true,
          results: [],
          error: err && err.message ? String(err.message) : "batch_error",
        };
      } finally {
        client.release();
      }
    },
  };
}

module.exports = {
  createTargetLoader,
  applyEntity,
  assertNoForbiddenSql,
  FORBIDDEN_TARGET_DDL,
};
