"use strict";

/**
 * Deterministic backfill of shared-engine version history for BlessBoard sites.
 *
 * Migration completeness must not depend on an administrator opening the hub,
 * so this is an explicit, idempotent, non-destructive pass:
 *   - never writes blessboard.public_pages
 *   - never changes website_status or any public content
 *   - never touches legacy publication history
 *   - skips any site that already has shared-engine version history
 */

const {
  resolveInstance,
  ensureEngineContent,
  publishFromLegacy,
  syncDraftToEngine,
} = require("./blessboardBridge");

const OUTCOME = Object.freeze({
  VERSION_CREATED: "version_created",
  ALREADY_CURRENT: "already_current",
  DRAFT_SEEDED: "draft_seeded",
  ERROR: "error",
});

const MIGRATION_ORIGIN = "website_engine_backfill_v7_phase2";

/**
 * HQ (church-wide) and branch sites that the engine should have history for.
 * @param {{query: Function}} db
 */
async function listBlessBoardSites(db) {
  const rows = await db.query(
    `SELECT c.id AS church_id,
            c.organization_id,
            o.organization_key,
            NULL::uuid AS branch_id,
            COALESCE(cs.website_status, 'draft') AS website_status
       FROM blessboard.churches c
       JOIN platform.organizations o ON o.id = c.organization_id
       LEFT JOIN blessboard.church_settings cs ON cs.church_id = c.id
     UNION ALL
     SELECT c.id AS church_id,
            c.organization_id,
            o.organization_key,
            b.id AS branch_id,
            COALESCE(cs.website_status, 'draft') AS website_status
       FROM blessboard.branches b
       JOIN blessboard.churches c ON c.id = b.church_id
       JOIN platform.organizations o ON o.id = c.organization_id
       LEFT JOIN blessboard.church_settings cs ON cs.church_id = c.id
      WHERE b.status = 'active'
        AND EXISTS (
          SELECT 1 FROM blessboard.public_pages p
           WHERE p.church_id = b.church_id AND p.branch_id = b.id
        )
      ORDER BY 2, 4 NULLS FIRST`
  );
  return rows.rows.map((r) => ({
    churchId: String(r.church_id),
    organizationId: String(r.organization_id),
    slug: r.organization_key ? String(r.organization_key) : null,
    branchId: r.branch_id ? String(r.branch_id) : null,
    websiteStatus: String(r.website_status || "draft"),
  }));
}

/**
 * @param {{query: Function}} db
 * @param {string} instanceId
 */
async function countEngineVersions(db, instanceId) {
  const rows = await db.query(
    `SELECT COUNT(*)::int AS n FROM platform.website_versions WHERE instance_id = $1`,
    [instanceId]
  );
  return Number((rows.rows[0] && rows.rows[0].n) || 0);
}

/**
 * @param {{query: Function}} db
 * @param {{dryRun?: boolean, limit?: number|null, onSite?: Function}} [opts]
 */
async function backfillBlessBoardWebsiteVersions(db, opts = {}) {
  const dryRun = opts.dryRun === true;
  const limit =
    opts.limit != null && Number.isFinite(Number(opts.limit)) && Number(opts.limit) > 0
      ? Number(opts.limit)
      : null;

  const sites = await listBlessBoardSites(db);
  const scoped = limit ? sites.slice(0, limit) : sites;

  const summary = {
    migrationOrigin: MIGRATION_ORIGIN,
    dryRun,
    websitesScanned: 0,
    versionsCreated: 0,
    alreadyCurrent: 0,
    draftsSeeded: 0,
    errors: 0,
    details: [],
  };

  for (const site of scoped) {
    summary.websitesScanned += 1;
    const detail = await backfillOneSite(db, site, dryRun);
    if (detail.outcome === OUTCOME.VERSION_CREATED) summary.versionsCreated += 1;
    else if (detail.outcome === OUTCOME.ALREADY_CURRENT) summary.alreadyCurrent += 1;
    else if (detail.outcome === OUTCOME.DRAFT_SEEDED) summary.draftsSeeded += 1;
    else summary.errors += 1;
    summary.details.push(detail);
    if (typeof opts.onSite === "function") {
      try {
        opts.onSite(detail);
      } catch {
        // Reporting must not abort the backfill.
      }
    }
  }

  return summary;
}

/**
 * @param {{query: Function}} db
 * @param {{churchId: string, organizationId: string, slug: string|null, branchId: string|null, websiteStatus: string}} site
 * @param {boolean} dryRun
 */
async function backfillOneSite(db, site, dryRun) {
  const detail = {
    churchId: site.churchId,
    branchId: site.branchId,
    websiteStatus: site.websiteStatus,
    outcome: null,
    reason: null,
  };
  const scope = {
    organizationId: site.organizationId,
    churchId: site.churchId,
    branchId: site.branchId,
    slug: site.slug,
    actorIdentityId: null,
  };

  try {
    const resolved = await resolveInstance(db, scope);
    if (!resolved.ok || !resolved.instance) {
      detail.outcome = OUTCOME.ERROR;
      detail.reason = "website_instance_not_found";
      return detail;
    }

    const existingVersions = await countEngineVersions(db, resolved.instance.id);
    if (existingVersions > 0) {
      detail.outcome = OUTCOME.ALREADY_CURRENT;
      detail.reason = `versions=${existingVersions}`;
      return detail;
    }

    const isPublished = site.websiteStatus === "published";

    if (dryRun) {
      detail.outcome = isPublished ? OUTCOME.VERSION_CREATED : OUTCOME.DRAFT_SEEDED;
      detail.reason = "planned";
      return detail;
    }

    await ensureEngineContent(db, { ...scope, websiteStatus: site.websiteStatus });

    if (!isPublished) {
      await syncDraftToEngine(db, scope);
      detail.outcome = OUTCOME.DRAFT_SEEDED;
      return detail;
    }

    // Publishes the engine snapshot only. blessboard.public_pages is untouched,
    // so the live site is identical before and after this call.
    const published = await publishFromLegacy(db, scope);
    if (!published.ok) {
      detail.outcome = OUTCOME.ERROR;
      detail.reason = published.code || "engine_publish_failed";
      return detail;
    }
    detail.outcome = OUTCOME.VERSION_CREATED;
    detail.reason =
      published.version && published.version.versionNumber != null
        ? `version=${published.version.versionNumber}`
        : null;
    return detail;
  } catch (err) {
    detail.outcome = OUTCOME.ERROR;
    detail.reason = (err && (err.code || err.message)) || "unknown_error";
    return detail;
  }
}

module.exports = {
  OUTCOME,
  MIGRATION_ORIGIN,
  listBlessBoardSites,
  countEngineVersions,
  backfillOneSite,
  backfillBlessBoardWebsiteVersions,
};
