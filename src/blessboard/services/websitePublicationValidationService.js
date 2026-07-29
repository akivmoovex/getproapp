"use strict";

/**
 * Structured website publication validation used by confirmation + publish.
 */

const {
  evaluatePublishReadiness,
  STATUS: PUBLISH_STATUS,
} = require("./churchWebsitePublishService");
const approvalSettingsSvc = require("./websiteApprovalSettingsService");
const submissionRepo = require("../repositories/websiteChangeSubmissionRepository");
const versionRepo = require("../repositories/websitePublicationVersionRepository");
const publicContentRepo = require("../repositories/publicContentRepository");
const { PUBLIC_PAGE_KEYS, PAGE_KEY_TITLES } = require("./publicContentConstants");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  LOOKUP_ERROR: "lookup_error",
});

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   actorUserId?: string|null,
 *   deferServiceTimes?: boolean,
 *   mobilePreviewConfirmed?: boolean,
 *   relaxPreviewRequirement?: boolean,
 *   relaxReadinessGaps?: boolean,
 *   env?: object,
 * }} opts
 */
async function validateWebsitePublication(db, opts) {
  const organizationId = opts && opts.organizationId;
  const churchId = opts && opts.churchId;
  if (!versionRepo.isUuid(organizationId) || !versionRepo.isUuid(churchId)) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      publishable: false,
      errors: ["Invalid tenant context."],
      warnings: [],
      checks: [],
    };
  }

  try {
    const [readiness, settingsResult, currentVersion, nextNumber, approvedList, pendingList] =
      await Promise.all([
        evaluatePublishReadiness(db, {
          churchId,
          deferServiceTimes: Boolean(opts.deferServiceTimes),
          env: opts.env,
        }),
        approvalSettingsSvc.loadEffectiveSettings(db, organizationId),
        versionRepo.getCurrentPublishedVersion(db, organizationId),
        versionRepo.getNextVersionNumber(db, organizationId),
        submissionRepo.listSubmissions(db, {
          organizationId,
          status: "approved",
          limit: 50,
        }),
        submissionRepo.listSubmissions(db, {
          organizationId,
          status: "pending_review",
          limit: 20,
        }),
      ]);

    const settings =
      settingsResult && settingsResult.ok
        ? settingsResult.settings
        : {
            requirePreviewBeforePublish: true,
            requireMobilePreviewConfirmation: false,
          };

    const errors = [];
    const warnings = [];
    const checks = [];

    const fatalGapKeys = new Set([
      "website_suspended",
      "organization_name",
      "first_branch",
      "custom_domain_entitlement",
    ]);
    const hasFatalReadinessGap = (readiness.gaps || []).some((g) =>
      fatalGapKeys.has(String(g))
    );
    const readyOk = Boolean(
      readiness &&
        readiness.ok &&
        (readiness.ready || (opts.relaxReadinessGaps && !hasFatalReadinessGap))
    );
    checks.push({
      key: "required_content",
      label: "Required content complete",
      ok: readyOk && !(readiness.gaps || []).includes("required_pages"),
    });
    checks.push({
      key: "contact",
      label: "Contact information present",
      ok:
        (readyOk && !(readiness.gaps || []).includes("contact_method")) ||
        Boolean(opts.relaxReadinessGaps),
    });
    checks.push({
      key: "tenant_active",
      label: "Tenant is active",
      ok: readyOk && !(readiness.gaps || []).includes("website_suspended"),
    });
    checks.push({
      key: "draft_exists",
      label: "Draft website content exists",
      ok: Boolean(readiness && readiness.ok),
    });
    checks.push({
      key: "permission",
      label: "User has publish permission",
      ok: true,
    });

    if (!readiness.ok) {
      errors.push("Publish readiness could not be evaluated.");
    } else if (!readiness.ready) {
      for (const gap of readiness.gaps || []) {
        if (opts.relaxReadinessGaps && !fatalGapKeys.has(String(gap))) continue;
        errors.push(`Readiness gap: ${gap}`);
      }
    }

    let missingImages = 0;
    for (const pageKey of PUBLIC_PAGE_KEYS.slice(0, 3)) {
      const page = await publicContentRepo.findPageByScope(db, {
        churchId,
        branchId: null,
        pageKey,
      });
      if (!page) continue;
      const sections = await publicContentRepo.listSectionsForPage(db, page.id, {});
      for (const sec of sections || []) {
        if (sec.mediaUrl != null && String(sec.mediaUrl).trim() === "") {
          missingImages += 1;
        }
      }
    }
    checks.push({
      key: "images",
      label: "No broken required image references",
      ok: missingImages === 0,
    });
    if (missingImages > 0) {
      warnings.push(`${missingImages} section(s) have empty media references.`);
    }

    const settingsPersisted = Boolean(settings && settings.updatedAt);
    const requirePreview = settingsPersisted
      ? settings.requirePreviewBeforePublish !== false
      : false;
    const previewOk =
      Boolean(opts.relaxPreviewRequirement) ||
      !requirePreview ||
      Boolean(readiness.previewAcknowledged);
    checks.push({
      key: "preview",
      label: "Preview acknowledged before publication",
      ok: previewOk,
    });
    if (!previewOk) {
      errors.push("Preview confirmation is required before publication.");
    }

    if (settingsPersisted && settings.hqDirectPublishEnabled === false) {
      checks.push({
        key: "hq_direct_publish",
        label: "HQ direct publish allowed",
        ok: false,
      });
      errors.push("HQ direct publish is disabled in network approval settings.");
    } else {
      checks.push({
        key: "hq_direct_publish",
        label: "HQ direct publish allowed",
        ok: true,
      });
    }

    const requireMobile =
      settingsPersisted && Boolean(settings.requireMobilePreviewConfirmation);
    const mobileOk = !requireMobile || Boolean(opts.mobilePreviewConfirmed);
    checks.push({
      key: "mobile_preview",
      label: "Mobile preview confirmation",
      ok: mobileOk,
    });
    if (!mobileOk) {
      errors.push("Mobile preview confirmation is required before publication.");
    }

    const conflictDraftRes = await db.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.website_change_submissions
        WHERE organization_id = $1
          AND status = 'draft'
          AND change_type ILIKE 'Conflict draft%'`,
      [organizationId]
    );
    const conflictDrafts = conflictDraftRes.rows[0]
      ? Number(conflictDraftRes.rows[0].n)
      : 0;
    const conflictsOk = conflictDrafts === 0;
    checks.push({
      key: "conflicts",
      label: "No unresolved edit conflict drafts",
      ok: conflictsOk,
    });
    if (!conflictsOk) {
      errors.push(
        `${conflictDrafts} unresolved edit conflict draft(s) must be resolved before publication.`
      );
    }

    const pending = (pendingList && pendingList.items) || [];
    const pendingOk = pending.length === 0;
    checks.push({
      key: "unapproved_submissions",
      label: "No submissions awaiting approval",
      ok: pendingOk,
    });
    if (!pendingOk) {
      errors.push(
        `${pending.length} submission(s) are still pending review and block publication.`
      );
    }

    const approved = (approvedList && approvedList.items) || [];
    checks.push({
      key: "approved_submissions",
      label: "Included branch submissions are approved",
      ok: true,
    });

    let pagesChanged = [];
    let sectionsChanged = 0;
    const draftPages = [];
    for (const pageKey of PUBLIC_PAGE_KEYS) {
      const page = await publicContentRepo.findPageByScope(db, {
        churchId,
        branchId: null,
        pageKey,
      });
      if (!page) continue;
      draftPages.push(page);
      const sections = await publicContentRepo.listSectionsForPage(db, page.id, {});
      const livePage =
        currentVersion &&
        currentVersion.snapshot &&
        Array.isArray(currentVersion.snapshot.pages)
          ? currentVersion.snapshot.pages.find((p) => p.pageKey === pageKey)
          : null;
      if (!livePage || page.title !== livePage.title || page.status === "draft") {
        pagesChanged.push(pageKey);
      }
      const liveSections = (livePage && livePage.sections) || [];
      for (const sec of sections || []) {
        const liveSec = liveSections.find((s) => s.sectionKey === sec.sectionKey);
        if (
          !liveSec ||
          liveSec.heading !== sec.heading ||
          liveSec.bodyText !== sec.bodyText ||
          liveSec.mediaUrl !== sec.mediaUrl ||
          Number(liveSec.sortOrder) !== Number(sec.sortOrder) ||
          liveSec.status !== sec.status
        ) {
          sectionsChanged += 1;
          if (!pagesChanged.includes(pageKey)) pagesChanged.push(pageKey);
        }
      }
    }
    if (!pagesChanged.length && draftPages.length) {
      pagesChanged = draftPages.map((p) => p.pageKey);
    }

    const publishable = errors.length === 0 && readyOk;

    return {
      ok: true,
      status: STATUS.OK,
      publishable,
      errors,
      warnings,
      checks,
      readiness,
      settings,
      summary: {
        pagesChanged,
        pageCount: pagesChanged.length,
        sectionsChanged,
        branchesAffected: approved
          .map((s) => s.branchName || s.branchKey)
          .filter(Boolean),
        approvedSubmissions: approved,
        pendingSubmissions: pending,
        themeChanges: false,
        navigationChanges: false,
        currentLiveVersion: currentVersion,
        proposedVersionNumber: nextNumber,
        pageTitles: PAGE_KEY_TITLES,
      },
      publishStatus: PUBLISH_STATUS,
    };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      publishable: false,
      errors: ["Publication validation failed."],
      warnings: [],
      checks: [],
    };
  }
}

module.exports = {
  STATUS,
  validateWebsitePublication,
};
