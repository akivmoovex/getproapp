"use strict";

/**
 * Phase 7 Stage 6 — consolidated draft-changes review (read model).
 * Does not publish or invent a second version engine.
 */

const fieldDraftRepo = require("../repositories/websiteInlineFieldDraftRepository");
const structuredDraftRepo = require("../repositories/websiteStructuredDraftRepository");
const settingsRepo = require("../repositories/blessBoardSettingsRepository");
const versionRepo = require("../repositories/websitePublicationVersionRepository");
const { PAGE_KEY_TITLES } = require("./publicContentConstants");
const {
  resolveEditableField,
} = require("./websiteInlineEditableFields");
const approvalSettingsSvc = require("./websiteApprovalSettingsService");
const {
  evaluatePublishReadiness,
} = require("./churchWebsitePublishService");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  LOOKUP_ERROR: "lookup_error",
  FORBIDDEN: "forbidden",
});

const FIELD_LABELS = Object.freeze({
  heading: "Headline",
  bodyText: "Body text",
  buttonText: "Button label",
  buttonUrl: "Button link",
  email: "Email",
  phone: "Phone",
  address: "Address",
});

const SECTION_LABELS = Object.freeze({
  hero: "Hero",
  welcome: "Welcome",
  story: "Our story",
  values: "Values",
  details: "Contact details",
  service_times: "Service times",
  intro: "Introduction",
  giving: "Giving",
});

const KIND_LABELS = Object.freeze({
  image: "Image",
  video: "Video",
  service_times: "Service times",
  leader: "Leadership",
  ministry: "Ministry",
  event: "Event",
  sermon: "Sermon",
});

const KIND_SUMMARY_KEYS = Object.freeze({
  text: "textChanges",
  image: "imageChanges",
  video: "videoChanges",
  service_times: "serviceTimeChanges",
  leader: "leadershipChanges",
  ministry: "ministryChanges",
  event: "eventChanges",
  sermon: "sermonChanges",
});

const PREVIEW_LEN = 160;

function isUuid(value) {
  return fieldDraftRepo.isUuid(value);
}

function pageTitle(pageKey) {
  return PAGE_KEY_TITLES[pageKey] || String(pageKey || "Page");
}

function sectionTitle(sectionKey) {
  return SECTION_LABELS[sectionKey] || humanizeKey(sectionKey);
}

function humanizeKey(key) {
  return String(key || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || "Item";
}

function fieldLabel(pageKey, sectionKey, fieldKey) {
  const def = resolveEditableField(pageKey, sectionKey, fieldKey);
  if (def && def.guidance && FIELD_LABELS[fieldKey]) {
    return `${sectionTitle(sectionKey)} · ${FIELD_LABELS[fieldKey]}`;
  }
  return FIELD_LABELS[fieldKey] || humanizeKey(fieldKey);
}

function previewText(value) {
  const text = value == null ? "" : String(value);
  if (text.length <= PREVIEW_LEN) {
    return { preview: text, truncated: false, full: text };
  }
  return {
    preview: `${text.slice(0, PREVIEW_LEN).trim()}…`,
    truncated: true,
    full: text,
  };
}

function mediaLabel(url) {
  const raw = String(url || "").trim();
  if (!raw) return "No media";
  if (raw.includes("youtube") || raw.includes("youtu.be")) return "YouTube video";
  if (raw.includes("vimeo")) return "Vimeo video";
  const parts = raw.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || raw;
  return last.length > 48 ? `${last.slice(0, 45)}…` : last;
}

function mediaThumb(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  if (raw.startsWith("/") || /^https:\/\//i.test(raw)) {
    if (/youtube|youtu\.be|vimeo/i.test(raw)) return null;
    return raw;
  }
  return null;
}

/**
 * Resolve publish vs submit-for-approval using existing approval settings.
 * Does not invent new governance — trusted branch publish stays inactive unless
 * resolveBranchEditMode reports trustedActive.
 * @param {{
 *   canPublish: boolean,
 *   actorRole?: string,
 *   settings: object|null,
 * }} opts
 */
function resolvePublishCapability(opts) {
  const canPublish = Boolean(opts.canPublish);
  const actorRole = opts.actorRole ? String(opts.actorRole) : null;
  const settings = opts.settings || null;

  if (!canPublish) {
    return {
      action: "forbidden",
      label: null,
      reason: "forbidden",
      message: "You do not have permission to publish website changes.",
    };
  }

  // actorRole used only for audit labels if provided
  if (actorRole === "church_hq_admin" || actorRole === "platform_admin" || !actorRole) {
    const hqDirect =
      !settings ||
      settings.hqDirectPublishEnabled !== false;
    if (!hqDirect) {
      return {
        action: "blocked",
        label: null,
        reason: "hq_direct_publish_disabled",
        message: "Direct publishing is disabled for this organization.",
      };
    }
    return {
      action: "publish",
      label: "Save and Publish",
      reason: null,
      message: null,
    };
  }

  if (actorRole === "branch_admin") {
    const resolved = approvalSettingsSvc.resolveBranchEditMode(settings || {});
    if (resolved.mode === "draft_only") {
      return {
        action: "blocked",
        label: null,
        reason: "draft_only",
        message: "Branch website edits are draft-only for this organization.",
      };
    }
    if (resolved.trustedActive) {
      return {
        action: "publish",
        label: "Save and Publish",
        reason: "trusted_branch_publish",
        message: null,
      };
    }
    return {
      action: "submit_for_approval",
      label: "Submit for Approval",
      reason: "approval_required",
      message: null,
    };
  }

  return {
    action: "forbidden",
    label: null,
    reason: "forbidden",
    message: "You do not have permission to publish website changes.",
  };
}

async function loadEditorNames(db, userIds) {
  const ids = [...new Set((userIds || []).filter(isUuid))];
  if (!ids.length) return new Map();
  try {
    const result = await db.query(
      `SELECT id, display_name FROM blessboard.users WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    const map = new Map();
    for (const row of result.rows || []) {
      map.set(String(row.id), String(row.display_name || "Editor"));
    }
    return map;
  } catch {
    return new Map();
  }
}

function changeTypeForField() {
  return "text";
}

function changeTypeForStructured(kind, op) {
  if (op === "remove") return "remove";
  if (op === "reorder") return "reorder";
  return kind || "update";
}

/**
 * Build grouped draft review model from Phase 7 overlay tables.
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   branchId?: string|null,
 *   actorRole?: string|null,
 *   actorUserId?: string|null,
 *   scopeLabel?: string|null,
 *   basePath?: string,
 *   publicHomePath?: string,
 *   editHomePath?: string,
 * }} opts
 */
async function loadWebsiteDraftChangesReview(db, opts) {
  const organizationId = opts && opts.organizationId;
  const churchId = opts && opts.churchId;
  if (!isUuid(organizationId) || !isUuid(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }

  const branchId =
    opts.branchId === undefined ? null : opts.branchId == null ? null : opts.branchId;

  try {
    const [fieldDrafts, structuredDrafts, settings, currentVersion, approvalLoad] =
      await Promise.all([
        fieldDraftRepo.listDrafts(db, { churchId, branchId, status: "draft" }),
        structuredDraftRepo.listStructuredDrafts(db, {
          churchId,
          branchId,
          status: "draft",
        }),
        settingsRepo.findChurchSettings(db, churchId),
        versionRepo.getCurrentPublishedVersion(db, organizationId),
        approvalSettingsSvc.loadEffectiveSettings(db, organizationId),
      ]);

    let lastPublishedAt = null;
    let lastPublishedByName = null;
    if (currentVersion && currentVersion.publishedAt) {
      lastPublishedAt = currentVersion.publishedAt;
      lastPublishedByName = currentVersion.publishedByName || null;
    } else if (settings && settings.websiteStatus === "published") {
      lastPublishedAt = settings.updatedAt || null;
    }

    const editorIds = [
      ...fieldDrafts.map((d) => d.editorUserId),
      ...structuredDrafts.map((d) => d.editorUserId),
    ];
    const editorNames = await loadEditorNames(db, editorIds);

    const counts = {
      textChanges: 0,
      imageChanges: 0,
      videoChanges: 0,
      serviceTimeChanges: 0,
      leadershipChanges: 0,
      ministryChanges: 0,
      eventChanges: 0,
      sermonChanges: 0,
      totalChangedFields: 0,
      totalChangedPages: 0,
    };

    /** @type {Map<string, object>} */
    const pages = new Map();

    function ensurePage(pageKey) {
      const key = pageKey || "home";
      if (!pages.has(key)) {
        pages.set(key, {
          pageKey: key,
          pageTitle: pageTitle(key),
          sections: new Map(),
        });
      }
      return pages.get(key);
    }

    function ensureSection(page, sectionKey, contentItemKey) {
      const sk = sectionKey || "general";
      if (!page.sections.has(sk)) {
        page.sections.set(sk, {
          sectionKey: sk,
          sectionTitle: sectionTitle(sk),
          items: [],
        });
      }
      const section = page.sections.get(sk);
      return { section, contentItemKey: contentItemKey || sk };
    }

    let lastEditorName = null;
    let lastSavedAt = null;

    for (const d of fieldDrafts) {
      counts.textChanges += 1;
      counts.totalChangedFields += 1;
      const page = ensurePage(d.pageKey);
      const { section } = ensureSection(page, d.sectionKey, d.fieldKey);
      const prev = previewText(d.previousValue);
      const next = previewText(d.newValue);
      const editorName = editorNames.get(String(d.editorUserId)) || "Editor";
      const savedAt = d.updatedAt || d.createdAt;
      if (!lastSavedAt || (savedAt && new Date(savedAt) > new Date(lastSavedAt))) {
        lastSavedAt = savedAt;
        lastEditorName = editorName;
      }
      section.items.push({
        kind: "text",
        changeType: changeTypeForField(),
        fieldLabel: fieldLabel(d.pageKey, d.sectionKey, d.fieldKey),
        contentItemLabel: fieldLabel(d.pageKey, d.sectionKey, d.fieldKey),
        previousValue: prev.preview,
        previousValueFull: prev.full,
        previousTruncated: prev.truncated,
        newValue: next.preview,
        newValueFull: next.full,
        newTruncated: next.truncated,
        editorName,
        savedAt,
        mediaThumb: null,
        mediaLabel: null,
      });
    }

    for (const d of structuredDrafts) {
      const summaryKey = KIND_SUMMARY_KEYS[d.draftKind];
      if (summaryKey && counts[summaryKey] != null) counts[summaryKey] += 1;
      counts.totalChangedFields += 1;
      const pageKey = d.pageKey || (d.draftKind === "service_times" ? "home" : "home");
      const page = ensurePage(pageKey);
      const sectionKey =
        d.sectionKey ||
        (d.draftKind === "service_times"
          ? "service_times"
          : d.draftKind === "leader"
            ? "leadership"
            : d.draftKind);
      const { section } = ensureSection(page, sectionKey, d.entityKey);
      const payload = d.payload || {};
      const previous = d.previousPayload || {};
      const editorName = editorNames.get(String(d.editorUserId)) || "Editor";
      const savedAt = d.updatedAt || d.createdAt;
      if (!lastSavedAt || (savedAt && new Date(savedAt) > new Date(lastSavedAt))) {
        lastSavedAt = savedAt;
        lastEditorName = editorName;
      }

      let contentItemLabel = KIND_LABELS[d.draftKind] || humanizeKey(d.draftKind);
      let previousDisplay = "";
      let newDisplay = "";
      let thumb = null;
      let mLabel = null;

      if (d.draftKind === "image" || d.draftKind === "video") {
        const prevUrl = previous.imageUrl || previous.videoUrl || previous.thumbnailUrl || "";
        const nextUrl = payload.imageUrl || payload.videoUrl || payload.thumbnailUrl || "";
        previousDisplay = mediaLabel(prevUrl);
        newDisplay =
          d.op === "remove"
            ? "Removed"
            : mediaLabel(nextUrl) +
              (payload.altText ? ` — ${String(payload.altText).slice(0, 80)}` : "");
        thumb = d.op === "remove" ? null : mediaThumb(nextUrl);
        mLabel = newDisplay;
        contentItemLabel = `${sectionTitle(sectionKey)} · ${KIND_LABELS[d.draftKind]}`;
      } else if (d.draftKind === "service_times") {
        const prevEntries = Array.isArray(previous.entries) ? previous.entries.length : 0;
        const nextEntries = Array.isArray(payload.entries) ? payload.entries.length : 0;
        previousDisplay = prevEntries ? `${prevEntries} service time(s)` : "None";
        newDisplay =
          d.op === "remove" ? "Removed" : `${nextEntries} service time(s)`;
        contentItemLabel = "Service times";
      } else if (d.draftKind === "leader") {
        previousDisplay = previous.displayName || "—";
        newDisplay =
          d.op === "remove"
            ? "Removed"
            : payload.displayName || payload.roleTitle || "Updated leader";
        contentItemLabel = newDisplay === "Removed" ? previousDisplay : newDisplay;
        thumb = mediaThumb(payload.imageUrl);
      } else if (d.draftKind === "ministry") {
        previousDisplay = previous.name || "—";
        newDisplay = d.op === "remove" ? "Removed" : payload.name || "Updated ministry";
        contentItemLabel = newDisplay === "Removed" ? previousDisplay : newDisplay;
        thumb = mediaThumb(payload.imageUrl);
      } else if (d.draftKind === "event") {
        previousDisplay = previous.title || "—";
        newDisplay = d.op === "remove" ? "Removed" : payload.title || "Updated event";
        contentItemLabel = newDisplay === "Removed" ? previousDisplay : newDisplay;
        thumb = mediaThumb(payload.imageUrl);
      } else if (d.draftKind === "sermon") {
        previousDisplay = previous.title || "—";
        newDisplay = d.op === "remove" ? "Removed" : payload.title || "Updated sermon";
        contentItemLabel = newDisplay === "Removed" ? previousDisplay : newDisplay;
        thumb = mediaThumb(payload.imageUrl);
      } else {
        previousDisplay = "—";
        newDisplay = d.op || "update";
      }

      const prevPv = previewText(previousDisplay);
      const nextPv = previewText(newDisplay);
      section.items.push({
        kind: d.draftKind,
        changeType: changeTypeForStructured(d.draftKind, d.op),
        fieldLabel: contentItemLabel,
        contentItemLabel,
        previousValue: prevPv.preview,
        previousValueFull: prevPv.full,
        previousTruncated: prevPv.truncated,
        newValue: nextPv.preview,
        newValueFull: nextPv.full,
        newTruncated: nextPv.truncated,
        editorName,
        savedAt,
        mediaThumb: thumb,
        mediaLabel: mLabel,
      });
    }

    counts.totalChangedPages = pages.size;

    const groupedPages = [...pages.values()]
      .map((p) => ({
        pageKey: p.pageKey,
        pageTitle: p.pageTitle,
        sections: [...p.sections.values()].map((s) => ({
          sectionKey: s.sectionKey,
          sectionTitle: s.sectionTitle,
          items: s.items,
        })),
      }))
      .sort((a, b) => a.pageTitle.localeCompare(b.pageTitle));

    const hasChanges = counts.totalChangedFields > 0;
    const websiteStatus = settings ? String(settings.websiteStatus || "draft") : "draft";
    const churchName =
      (settings && settings.publicName) ||
      "Church";

    const capability = resolvePublishCapability({
      canPublish: opts.canPublish === true,
      actorRole: opts.actorRole,
      settings: approvalLoad.ok ? approvalLoad.settings : null,
    });

    const warnings = await buildDraftWarnings(db, {
      churchId,
      organizationId,
      branchId,
      settings,
      hasChanges,
      fieldDrafts,
      structuredDrafts,
      capability,
    });

    const basePath = String(opts.basePath || "/hq/content").replace(/\/$/, "");
    const scopeLabel =
      opts.scopeLabel ||
      (branchId ? "Branch website" : "Organization website");

    return {
      ok: true,
      status: STATUS.OK,
      hasChanges,
      empty: !hasChanges,
      churchName,
      scopeLabel,
      websiteStatus,
      websiteStatusLabel:
        websiteStatus === "published"
          ? hasChanges
            ? "Published with draft changes"
            : "Published"
          : "Unpublished",
      lastPublishedAt,
      lastPublishedByName,
      lastEditorName,
      lastSavedAt,
      counts,
      groupedPages,
      warnings,
      capability,
      governanceNote:
        capability.action === "submit_for_approval"
          ? "Branch changes require HQ approval before they appear on the public website."
          : null,
      actions: {
        previewPath: `${basePath}/draft-preview/home`,
        continueEditingPath: opts.editHomePath || "/",
        reviewPublishPath: `${basePath}/draft-changes/publish-review`,
        draftChangesPath: `${basePath}/draft-changes`,
        discardPath: `${basePath}/draft-changes/discard`,
        publishPath: `${basePath}/draft-changes/publish`,
        submitPath: `${basePath}/draft-changes/submit`,
        viewWebsitePath: opts.publicHomePath || "/",
        editWebsitePath: opts.editHomePath || "/",
      },
      basePath,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "load" };
  }
}

/**
 * Advisory / blocking warnings for draft review + publish review.
 */
async function buildDraftWarnings(db, opts) {
  const warnings = [];
  const settings = opts.settings || {};
  const churchName = String(settings.publicName || "").trim();
  if (!churchName) {
    warnings.push({
      severity: "blocking",
      code: "missing_church_name",
      message: "Church name is missing.",
    });
  }

  const email = String(settings.primaryEmail || "").trim();
  const phone = String(settings.primaryPhone || "").trim();
  if (!email && !phone) {
    warnings.push({
      severity: "warning",
      code: "missing_contact",
      message: "A public contact method (email or phone) is missing.",
    });
  }

  if (!opts.hasChanges) {
    warnings.push({
      severity: "informational",
      code: "no_changed_content",
      message: "There are no unpublished draft changes to publish.",
    });
  }

  try {
    const readiness = await evaluatePublishReadiness(db, {
      churchId: opts.churchId,
      deferServiceTimes: false,
    });
    if (readiness && Array.isArray(readiness.gaps)) {
      for (const gap of readiness.gaps) {
        if (gap === "service_times") {
          warnings.push({
            severity: "warning",
            code: "missing_service_times",
            message: "A primary service time is missing.",
          });
        } else if (gap === "contact_method" && !warnings.some((w) => w.code === "missing_contact")) {
          warnings.push({
            severity: "warning",
            code: "missing_contact",
            message: "A public contact method (email or phone) is missing.",
          });
        } else if (gap === "organization_name" && !warnings.some((w) => w.code === "missing_church_name")) {
          warnings.push({
            severity: "blocking",
            code: "missing_church_name",
            message: "Church name is missing.",
          });
        }
      }
    }
  } catch {
    /* readiness is advisory here */
  }

  // Broken media (empty required image after remove with no replacement)
  for (const d of opts.structuredDrafts || []) {
    if (d.draftKind === "image" && d.op !== "remove") {
      const url = d.payload && (d.payload.imageUrl || d.payload.thumbnailUrl);
      if (!url) {
        warnings.push({
          severity: "warning",
          code: "broken_media",
          message: "An image change is missing a usable media file.",
        });
      }
    }
    if (d.draftKind === "video" && d.op !== "remove") {
      const url = d.payload && d.payload.videoUrl;
      if (!url) {
        warnings.push({
          severity: "warning",
          code: "broken_media",
          message: "A video change is missing a usable video link.",
        });
      }
    }
  }

  if (opts.capability && opts.capability.action === "submit_for_approval") {
    warnings.push({
      severity: "informational",
      code: "pending_branch_approval",
      message: "These changes will be submitted for HQ approval before publication.",
    });
  }

  if (opts.capability && opts.capability.action === "blocked") {
    warnings.push({
      severity: "blocking",
      code: "publish_blocked",
      message: opts.capability.message || "Publishing is not available for your role.",
    });
  }

  // Deduplicate by code
  const seen = new Set();
  return warnings.filter((w) => {
    if (seen.has(w.code)) return false;
    seen.add(w.code);
    return true;
  });
}

/**
 * Publish-review screen model (final confirmation before publish/submit).
 */
async function loadWebsiteDraftPublishReview(db, opts) {
  const review = await loadWebsiteDraftChangesReview(db, opts);
  if (!review.ok) return review;

  const blockers = (review.warnings || []).filter((w) => w.severity === "blocking");
  const advisories = (review.warnings || []).filter((w) => w.severity === "warning");
  const notes = (review.warnings || []).filter((w) => w.severity === "informational");

  const canProceed =
    review.hasChanges &&
    blockers.length === 0 &&
    review.capability &&
    (review.capability.action === "publish" ||
      review.capability.action === "submit_for_approval");

  const publicationEffect =
    review.capability.action === "submit_for_approval"
      ? "Your changes will be sent to HQ for approval. Public visitors will not see them until they are approved and published."
      : "After publication, public visitors will see this new content on your website.";

  return {
    ...review,
    blockers,
    advisories,
    notes,
    canProceed,
    publicationEffect,
    primaryActionLabel:
      (review.capability && review.capability.label) ||
      (review.capability.action === "submit_for_approval"
        ? "Submit for Approval"
        : "Save and Publish"),
    primaryAction:
      review.capability && review.capability.action === "submit_for_approval"
        ? "submit"
        : "publish",
  };
}

module.exports = {
  STATUS,
  PREVIEW_LEN,
  resolvePublishCapability,
  loadWebsiteDraftChangesReview,
  loadWebsiteDraftPublishReview,
  buildDraftWarnings,
};
