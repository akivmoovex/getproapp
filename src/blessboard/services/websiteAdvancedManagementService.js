"use strict";

/**
 * Phase4 Advanced Website Management hub (aggregation over existing services).
 */

const changeSvc = require("./websiteChangeSubmissionService");
const versionRepo = require("../repositories/websitePublicationVersionRepository");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  LOOKUP_ERROR: "lookup_error",
});

/**
 * @param {import('pg').Pool} db
 * @param {string} organizationId
 */
async function loadAdvancedWebsiteManagementHub(db, organizationId) {
  if (!versionRepo.isUuid(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }

  try {
    const [listResult, versions, branchCountRes] = await Promise.all([
      changeSvc.loadSubmissionsList(db, { organizationId }),
      versionRepo.listVersions(db, { organizationId, limit: 5 }),
      db.query(
        `SELECT COUNT(*)::int AS c
           FROM blessboard.branches b
           INNER JOIN blessboard.churches c ON c.id = b.church_id
          WHERE c.organization_id = $1
            AND b.status = 'active'`,
        [organizationId]
      ),
    ]);

    const summary =
      (listResult && listResult.ok && listResult.summary) || {
        pendingReview: 0,
        changesRequested: 0,
        approvedToday: 0,
        recentlyPublished: 0,
      };

    let approvedReady = 0;
    try {
      const approvedRes = await db.query(
        `SELECT COUNT(*)::int AS c
           FROM blessboard.website_change_submissions
          WHERE organization_id = $1
            AND status = 'approved'`,
        [organizationId]
      );
      approvedReady = (approvedRes.rows[0] && approvedRes.rows[0].c) || 0;
    } catch {
      approvedReady = 0;
    }

    let publications = Array.isArray(versions) ? versions.length : 0;
    try {
      const pubRes = await db.query(
        `SELECT COUNT(*)::int AS c
           FROM blessboard.website_publication_versions
          WHERE organization_id = $1`,
        [organizationId]
      );
      publications = (pubRes.rows[0] && pubRes.rows[0].c) || publications;
    } catch {
      /* keep list length */
    }

    return {
      ok: true,
      status: STATUS.OK,
      hub: {
        counts: {
          activeBranches: (branchCountRes.rows[0] && branchCountRes.rows[0].c) || 0,
          pendingReview: summary.pendingReview || 0,
          approvedReady,
          publications,
        },
        links: {
          versionHistory: "/hq/website/network-version-history",
          compare: "/hq/website/version-history/compare",
          recentChanges: "/hq/website/recent-changes",
          publishingHistory: "/hq/website/publishing-history",
          auditLog: "/hq/website/audit-log",
          approvalSettings: "/hq/website/network-approval-settings",
          changeRequests: "/hq/website/change-requests",
        },
      },
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "hub" };
  }
}

module.exports = {
  STATUS,
  loadAdvancedWebsiteManagementHub,
};
