"use strict";

/**
 * Phase3 optimistic edit-conflict detection and resolution for website sections.
 */

const publicContentRepo = require("../repositories/publicContentRepository");
const submissionSvc = require("./websiteChangeSubmissionService");
const auditSvc = require("./websiteAuditService");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
});

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.query === "function" && typeof db.release === "function") {
      return await fn(db);
    }
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

async function withTransaction(db, fn) {
  return withClient(db, async (client) => {
    const ownsTx = Boolean(db && typeof db.connect === "function" && client !== db);
    if (ownsTx) await client.query("BEGIN");
    try {
      const result = await fn(client);
      if (ownsTx) await client.query("COMMIT");
      return result;
    } catch (err) {
      if (ownsTx) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
      }
      throw err;
    }
  });
}

function sectionSnapshot(section) {
  if (!section) return {};
  return {
    heading: section.heading || "",
    bodyText: section.bodyText || "",
    mediaUrl: section.mediaUrl || "",
    sortOrder: section.sortOrder,
    status: section.status,
    sectionType: section.sectionType,
    revisionNumber: section.revisionNumber,
    updatedAt: section.updatedAt,
  };
}

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   churchId: string,
 *   organizationId: string,
 *   pageKey: string,
 *   sectionKey: string,
 *   expectedRevision?: number|null,
 *   expectedUpdatedAt?: string|null,
 *   submitted?: object,
 * }} opts
 */
async function detectWebsiteEditConflict(db, opts) {
  if (!opts.churchId || !opts.pageKey || !opts.sectionKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const page = await publicContentRepo.findPageByScope(client, {
        churchId: opts.churchId,
        branchId: null,
        pageKey: opts.pageKey,
      });
      if (!page) return { ok: false, status: STATUS.NOT_FOUND, reason: "page" };
      const latest = await publicContentRepo.findSectionByPageAndKey(
        client,
        page.id,
        opts.sectionKey
      );
      if (!latest) return { ok: false, status: STATUS.NOT_FOUND, reason: "section" };

      let conflict = false;
      if (opts.expectedRevision != null && Number.isFinite(Number(opts.expectedRevision))) {
        conflict = Number(latest.revisionNumber) !== Number(opts.expectedRevision);
      } else if (opts.expectedUpdatedAt) {
        const a = new Date(opts.expectedUpdatedAt).getTime();
        const b = new Date(latest.updatedAt).getTime();
        conflict = Number.isFinite(a) && Number.isFinite(b) && a !== b;
      }

      return {
        ok: true,
        status: conflict ? STATUS.CONFLICT : STATUS.OK,
        conflict,
        page,
        latest,
        submitted: opts.submitted || null,
        message: conflict
          ? "This content changed while you were editing."
          : null,
      };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "detect" };
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   branchId?: string|null,
 *   actorUserId: string,
 *   actorRole?: string|null,
 *   pageKey: string,
 *   sectionKey: string,
 *   resolution: 'use_latest'|'save_as_draft'|'force_replace',
 *   confirmForce?: boolean,
 *   submitted?: object,
 * }} opts
 */
async function resolveWebsiteEditConflict(db, opts) {
  const resolution = String(opts.resolution || "");
  if (!["use_latest", "save_as_draft", "force_replace"].includes(resolution)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "resolution" };
  }
  if (resolution === "force_replace" && !opts.confirmForce) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "confirm_force" };
  }

  try {
    if (resolution === "use_latest") {
      const detected = await detectWebsiteEditConflict(db, opts);
      if (!detected.ok) return detected;
      return {
        ok: true,
        status: STATUS.OK,
        resolution: "use_latest",
        page: detected.page,
        section: detected.latest,
        message: "Loaded the latest saved version. Your previous unsaved edits were discarded.",
      };
    }

    if (resolution === "save_as_draft") {
      if (!opts.branchId) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "branch_required" };
      }
      const submitted = opts.submitted || {};
      const saved = await submissionSvc.saveBranchSubmissionDraft(db, {
        organizationId: opts.organizationId,
        churchId: opts.churchId,
        branchId: opts.branchId,
        actorUserId: opts.actorUserId,
        title: `Conflict draft: ${opts.pageKey}/${opts.sectionKey}`,
        pageKey: opts.pageKey,
        sectionKey: opts.sectionKey,
        changeType: "Conflict draft",
        reason: "Saved from edit conflict to avoid overwriting newer content",
        proposedContent: {
          heading: submitted.heading,
          bodyText: submitted.body_text || submitted.bodyText,
          mediaUrl: submitted.media_url || submitted.mediaUrl,
          sortOrder: submitted.sort_order || submitted.sortOrder,
          status: submitted.status,
          sectionType: submitted.section_type || submitted.sectionType,
        },
      });
      if (!saved.ok) return saved;

      await withTransaction(db, async (client) => {
        await auditSvc.recordWebsiteAuditEventInTransaction(client, {
          organizationId: opts.organizationId,
          branchId: opts.branchId,
          actorUserId: opts.actorUserId,
          actorRole: opts.actorRole || "church_hq_admin",
          actionType: "edit_conflict_saved_as_draft",
          pageKey: opts.pageKey,
          sectionKey: opts.sectionKey,
          entityType: "website_change_submission",
          entityId: saved.submission.id,
          result: "success",
          after: { submissionId: saved.submission.id },
        });
      });

      return {
        ok: true,
        status: STATUS.OK,
        resolution: "save_as_draft",
        submission: saved.submission,
        message: "Your unsaved work was saved as a separate draft submission.",
      };
    }

    // force_replace: reload latest revision token then write submitted values
    return await withTransaction(db, async (client) => {
      const page = await publicContentRepo.findPageByScope(client, {
        churchId: opts.churchId,
        branchId: null,
        pageKey: opts.pageKey,
      });
      if (!page) return { ok: false, status: STATUS.NOT_FOUND, reason: "page" };
      const latest = await publicContentRepo.findSectionByPageAndKey(
        client,
        page.id,
        opts.sectionKey
      );
      if (!latest) return { ok: false, status: STATUS.NOT_FOUND, reason: "section" };

      const before = sectionSnapshot(latest);
      const submitted = opts.submitted || {};
      const patch = {
        expectedRevision: latest.revisionNumber,
        heading: submitted.heading != null ? submitted.heading : latest.heading,
        bodyText:
          submitted.body_text != null
            ? submitted.body_text
            : submitted.bodyText != null
              ? submitted.bodyText
              : latest.bodyText,
        mediaUrl:
          submitted.media_url != null
            ? submitted.media_url
            : submitted.mediaUrl != null
              ? submitted.mediaUrl
              : latest.mediaUrl,
        sortOrder:
          submitted.sort_order != null
            ? Number(submitted.sort_order)
            : submitted.sortOrder != null
              ? Number(submitted.sortOrder)
              : latest.sortOrder,
        status: submitted.status != null ? submitted.status : latest.status,
        sectionType:
          submitted.section_type != null
            ? submitted.section_type
            : submitted.sectionType != null
              ? submitted.sectionType
              : latest.sectionType,
      };

      const result = await publicContentRepo.updateSection(client, latest.id, patch);
      if (result.conflict || !result.section) {
        return { ok: false, status: STATUS.CONFLICT, reason: "stale_again" };
      }

      await auditSvc.recordWebsiteAuditEventInTransaction(client, {
        organizationId: opts.organizationId,
        branchId: opts.branchId || null,
        actorUserId: opts.actorUserId,
        actorRole: opts.actorRole || "church_hq_admin",
        actionType: "edit_conflict_force_replace",
        pageKey: opts.pageKey,
        sectionKey: opts.sectionKey,
        entityType: "page_section",
        entityId: latest.id,
        result: "success",
        before,
        after: sectionSnapshot(result.section),
        metadata: { note: "Replaced latest section values after explicit confirmation" },
      });

      return {
        ok: true,
        status: STATUS.OK,
        resolution: "force_replace",
        section: result.section,
        page,
        message:
          "Your changes replaced the latest saved values for this section. Unrelated fields were not merged.",
      };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "resolve" };
  }
}

module.exports = {
  STATUS,
  detectWebsiteEditConflict,
  resolveWebsiteEditConflict,
  sectionSnapshot,
};
