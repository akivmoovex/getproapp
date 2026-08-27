"use strict";

/**
 * Phase 7 Stage 6 — apply overlay drafts into CMS rows inside a caller transaction.
 * Public visitors only see applied content after the surrounding publish TX commits.
 */

const contentRepo = require("../repositories/publicContentRepository");
const settingsRepo = require("../repositories/blessBoardSettingsRepository");
const fieldDraftRepo = require("../repositories/websiteInlineFieldDraftRepository");
const structuredDraftRepo = require("../repositories/websiteStructuredDraftRepository");
const { PAGE_KEY_TITLES, PUBLIC_PAGE_KEYS } = require("./publicContentConstants");
const { SERVICE_TIMES_SCHEMA } = require("./homeServiceTimesService");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

/**
 * Ensure a public page exists for the apply scope.
 * @param {import('pg').PoolClient} client
 */
async function ensurePage(client, { churchId, branchId, pageKey }) {
  let page = await contentRepo.findPageByScope(client, {
    churchId,
    branchId: branchId || null,
    pageKey,
  });
  if (page) return page;
  if (!PUBLIC_PAGE_KEYS.includes(pageKey)) {
    throw mapError("INVALID_PAGE", "Unknown website page.");
  }
  const ensured = await contentRepo.ensureDraftPage(client, {
    churchId,
    branchId: branchId || null,
    pageKey,
    title: PAGE_KEY_TITLES[pageKey] || pageKey,
  });
  page = ensured.page;
  if (!page) throw mapError("PAGE_MISSING", "Could not prepare website page.");
  // Publishing TX will flip pages to published; keep draft until then if brand-new.
  if (page.status !== "published") {
    const updated = await contentRepo.updatePage(client, page.id, { status: "published" });
    if (updated.page) page = updated.page;
  }
  return page;
}

/**
 * Ensure a section exists on a page.
 * @param {import('pg').PoolClient} client
 */
async function ensureSection(client, page, sectionKey, sectionType) {
  let section = await contentRepo.findSectionByPageAndKey(client, page.id, sectionKey);
  if (section) return section;
  section = await contentRepo.insertSection(client, {
    pageId: page.id,
    sectionKey,
    sectionType: sectionType || sectionKey,
    heading: null,
    bodyText: null,
    mediaUrl: null,
    sortOrder: 100,
    status: "published",
    layoutMetadata: null,
  });
  return section;
}

function mergeLayoutMetadata(existing, patch) {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {};
  return { ...base, ...patch };
}

/**
 * Apply one scalar field draft onto CMS / settings.
 * @param {import('pg').PoolClient} client
 */
async function applyFieldDraft(client, draft, ctx) {
  const { churchId, branchId } = ctx;

  if (draft.fieldKey === "email" || draft.fieldKey === "phone" || draft.fieldKey === "address") {
    if (draft.fieldKey === "address") {
      let targetBranchId = branchId;
      if (!targetBranchId) {
        const snap = await settingsRepo.findChurchCatalogueSnapshot(client, churchId);
        targetBranchId = snap && snap.primaryBranchId ? snap.primaryBranchId : null;
      }
      if (targetBranchId) {
        const branchSettings = await settingsRepo.findBranchSettings(client, targetBranchId);
        await settingsRepo.upsertBranchSettings(client, targetBranchId, {
          publicName: (branchSettings && branchSettings.publicName) || "Branch",
          email: (branchSettings && branchSettings.email) || null,
          phone: (branchSettings && branchSettings.phone) || null,
          timezone: (branchSettings && branchSettings.timezone) || null,
          countryCode: (branchSettings && branchSettings.countryCode) || null,
          addressLine1: draft.newValue || null,
          addressLine2: (branchSettings && branchSettings.addressLine2) || null,
          city: (branchSettings && branchSettings.city) || null,
          provinceState: (branchSettings && branchSettings.provinceState) || null,
          postalCode: (branchSettings && branchSettings.postalCode) || null,
          latitude: (branchSettings && branchSettings.latitude) || null,
          longitude: (branchSettings && branchSettings.longitude) || null,
        });
      }
      return;
    }

    const existing = await settingsRepo.findChurchSettings(client, churchId);
    if (!existing) {
      await settingsRepo.ensureChurchSettingsRow(client, {
        churchId,
        publicName: "Church",
      });
    }
    const current = (await settingsRepo.findChurchSettings(client, churchId)) || {};
    const fields = {
      publicName: current.publicName || "Church",
      denomination: current.denomination || null,
      primaryEmail: current.primaryEmail || null,
      primaryPhone: current.primaryPhone || null,
      defaultTimezone: current.defaultTimezone || null,
      defaultCountryCode: current.defaultCountryCode || null,
      websiteStatus: current.websiteStatus || "draft",
    };
    if (draft.fieldKey === "email") fields.primaryEmail = draft.newValue || null;
    if (draft.fieldKey === "phone") fields.primaryPhone = draft.newValue || null;
    await settingsRepo.upsertChurchSettings(client, churchId, fields);
    return;
  }

  // Footer tagline is shared chrome: always persist on the home page footer section
  // so church-wide and branch scopes resolve the same way as the rest of the site.
  const pageKey =
    draft.sectionKey === "footer" && draft.fieldKey === "tagline" ? "home" : draft.pageKey;
  const page = await ensurePage(client, {
    churchId,
    branchId,
    pageKey,
  });
  const section = await ensureSection(client, page, draft.sectionKey, draft.sectionKey);
  const patch = { status: "published" };
  if (draft.fieldKey === "heading") patch.heading = draft.newValue;
  else if (draft.fieldKey === "bodyText") patch.bodyText = draft.newValue;
  else if (draft.fieldKey === "tagline") {
    patch.bodyText = draft.newValue;
    patch.layoutMetadata = mergeLayoutMetadata(section.layoutMetadata, {
      tagline: draft.newValue,
    });
  } else if (
    draft.fieldKey === "buttonText" ||
    draft.fieldKey === "buttonUrl" ||
    draft.fieldKey === "eyebrow" ||
    draft.fieldKey === "secondaryButtonText" ||
    draft.fieldKey === "secondaryButtonUrl"
  ) {
    patch.layoutMetadata = mergeLayoutMetadata(section.layoutMetadata, {
      [draft.fieldKey]: draft.newValue,
    });
  } else {
    throw mapError("INVALID_FIELD", "Unsupported draft field.");
  }
  const updated = await contentRepo.updateSection(client, section.id, patch);
  if (!updated.section) throw mapError("APPLY_FAILED", "Could not update page section.");
}

/**
 * Apply structured draft onto CMS.
 * @param {import('pg').PoolClient} client
 */
async function applyStructuredDraft(client, draft, ctx) {
  const { churchId, branchId } = ctx;
  const payload = draft.payload || {};

  if (draft.draftKind === "image" || draft.draftKind === "video") {
    const pageKey = draft.pageKey || "home";
    const sectionKey = draft.sectionKey || "hero";
    const page = await ensurePage(client, { churchId, branchId, pageKey });
    const section = await ensureSection(client, page, sectionKey, sectionKey);
    if (draft.op === "remove") {
      const updated = await contentRepo.updateSection(client, section.id, {
        mediaUrl: null,
        status: "published",
        layoutMetadata: mergeLayoutMetadata(section.layoutMetadata, {
          altText: null,
          videoUrl: null,
          videoTitle: null,
        }),
      });
      if (!updated.section) throw mapError("APPLY_FAILED", "Could not clear media.");
      return;
    }
    const mediaUrl =
      payload.imageUrl || payload.videoUrl || payload.thumbnailUrl || null;
    const layoutPatch =
      draft.draftKind === "image"
        ? {
            altText: payload.altText || null,
            focal: payload.focal || null,
            fit: payload.fit || null,
          }
        : {
            videoUrl: payload.videoUrl || null,
            videoTitle: payload.title || null,
          };
    const updated = await contentRepo.updateSection(client, section.id, {
      mediaUrl,
      status: "published",
      layoutMetadata: mergeLayoutMetadata(section.layoutMetadata, layoutPatch),
    });
    if (!updated.section) throw mapError("APPLY_FAILED", "Could not update media.");
    return;
  }

  if (draft.draftKind === "page_section") {
    if (draft.op !== "reorder" || !Array.isArray(payload.order)) return;
    const pageKey = draft.pageKey || "home";
    const page = await contentRepo.findPageByScope(client, {
      churchId,
      branchId: branchId || null,
      pageKey,
    });
    if (!page) return;
    const sections = await contentRepo.listSectionsForPage(client, page.id, {});
    const byKey = new Map((sections || []).map((s) => [String(s.sectionKey), s]));
    let position = 0;
    for (const key of payload.order) {
      const section = byKey.get(String(key));
      if (!section) continue;
      position += 1;
      await contentRepo.updateSection(client, section.id, { sortOrder: position * 10 });
    }
    // Sections absent from the draft order keep their relative order behind it.
    const ordered = new Set(payload.order.map(String));
    const remainder = (sections || [])
      .filter((s) => !ordered.has(String(s.sectionKey)))
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    for (const section of remainder) {
      position += 1;
      await contentRepo.updateSection(client, section.id, { sortOrder: position * 10 });
    }
    return;
  }

  if (draft.draftKind === "service_times") {
    const page = await ensurePage(client, { churchId, branchId, pageKey: "home" });
    const section = await ensureSection(client, page, "service_times", "service_times");
    if (draft.op === "remove") {
      await contentRepo.updateSection(client, section.id, {
        heading: "",
        bodyText: "",
        status: "published",
        layoutMetadata: { schema: SERVICE_TIMES_SCHEMA, entries: [] },
      });
      return;
    }
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    const bodyText = entries
      .filter((e) => e && e.enabled !== false)
      .map((e) => {
        const day = e.day || "";
        const name = e.name || "Service";
        const start = e.startTime || "";
        const end = e.endTime ? `–${e.endTime}` : "";
        return `${day} ${name} ${start}${end}`.trim();
      })
      .join("\n");
    await contentRepo.updateSection(client, section.id, {
      heading: entries.length ? "Service Times" : "",
      bodyText,
      sectionType: "service_times",
      status: "published",
      layoutMetadata: { schema: SERVICE_TIMES_SCHEMA, entries },
    });
    return;
  }

  await applyEntityDraft(client, draft, ctx);
}

async function applyEntityDraft(client, draft, ctx) {
  const { churchId, branchId } = ctx;
  const kind = draft.draftKind;
  const payload = draft.payload || {};
  const entityKey = String(draft.entityKey || "");
  const isExisting = UUID_RE.test(entityKey);

  const findFns = {
    leader: contentRepo.findLeaderById,
    ministry: contentRepo.findMinistryById,
    event: contentRepo.findEventById,
    sermon: contentRepo.findSermonById,
    giving_method: contentRepo.findGivingMethodById,
    social_link: contentRepo.findContactChannelById,
  };
  const updateFns = {
    leader: contentRepo.updateLeader,
    ministry: contentRepo.updateMinistry,
    event: contentRepo.updateEvent,
    sermon: contentRepo.updateSermon,
    giving_method: contentRepo.updateGivingMethod,
    social_link: contentRepo.updateContactChannel,
  };
  const insertFns = {
    leader: contentRepo.insertLeader,
    ministry: contentRepo.insertMinistry,
    event: contentRepo.insertEvent,
    sermon: contentRepo.insertSermon,
    giving_method: contentRepo.insertGivingMethod,
    social_link: contentRepo.insertContactChannel,
  };

  if (!findFns[kind]) return;

  if (draft.op === "reorder" && Array.isArray(payload.order)) {
    let orderIndex = 0;
    for (const id of payload.order) {
      orderIndex += 1;
      if (!UUID_RE.test(String(id))) continue;
      await updateFns[kind](client, String(id), {
        sortOrder: orderIndex * 10,
      });
    }
    return;
  }

  if (draft.op === "remove" || payload.visible === false) {
    if (isExisting) {
      await updateFns[kind](client, entityKey, { status: "archived" });
    }
    return;
  }

  if (kind === "leader") {
    const fields = {
      displayName: payload.displayName || "Leader",
      roleTitle: payload.roleTitle || null,
      biography: payload.biography || null,
      imageUrl: payload.imageUrl || null,
      sortOrder: payload.sortOrder != null ? Number(payload.sortOrder) : 0,
      status: "published",
    };
    if (isExisting) {
      const existing = await findFns.leader(client, entityKey);
      if (existing && String(existing.churchId) === String(churchId)) {
        await updateFns.leader(client, entityKey, fields);
        return;
      }
    }
    await insertFns.leader(client, {
      churchId,
      branchId: branchId || null,
      ...fields,
    });
    return;
  }

  if (kind === "ministry") {
    const fields = {
      name: payload.name || "Ministry",
      summary: payload.summary || null,
      description: payload.description || null,
      meetingDay: payload.meetingDay || null,
      contactEmail: payload.contactEmail || null,
      imageUrl: payload.imageUrl || null,
      sortOrder: payload.sortOrder != null ? Number(payload.sortOrder) : 0,
      joinPolicy: payload.joinPolicy || "request",
      status: "published",
    };
    if (isExisting) {
      const existing = await findFns.ministry(client, entityKey);
      if (existing && String(existing.churchId) === String(churchId)) {
        await updateFns.ministry(client, entityKey, fields);
        return;
      }
    }
    await insertFns.ministry(client, {
      churchId,
      branchId: branchId || null,
      ...fields,
    });
    return;
  }

  if (kind === "event") {
    const fields = {
      title: payload.title || "Event",
      summary: payload.summary || null,
      startsAt: payload.startsAt || null,
      endsAt: payload.endsAt || null,
      timezone: payload.timezone || null,
      location: payload.location || null,
      registrationUrl: payload.registrationUrl || null,
      imageUrl: payload.imageUrl || null,
      status: "published",
    };
    if (isExisting) {
      const existing = await findFns.event(client, entityKey);
      if (existing && String(existing.churchId) === String(churchId)) {
        await updateFns.event(client, entityKey, fields);
        return;
      }
    }
    await insertFns.event(client, {
      churchId,
      branchId: branchId || null,
      ...fields,
    });
    return;
  }

  if (kind === "sermon") {
    const fields = {
      title: payload.title || "Sermon",
      speakerName: payload.speakerName || null,
      preachedAt: payload.preachedAt || null,
      summary: payload.summary || null,
      mediaUrl: payload.mediaUrl || null,
      resourceUrl: payload.resourceUrl || null,
      status: "published",
    };
    if (isExisting) {
      const existing = await findFns.sermon(client, entityKey);
      if (existing && String(existing.churchId) === String(churchId)) {
        await updateFns.sermon(client, entityKey, fields);
        return;
      }
    }
    await insertFns.sermon(client, {
      churchId,
      branchId: branchId || null,
      ...fields,
    });
    return;
  }

  if (kind === "giving_method") {
    const fields = {
      methodType: payload.methodType || "other",
      label: payload.label || "Giving method",
      description: payload.description || null,
      accountDetails: payload.accountDetails || null,
      instructions: payload.instructions || null,
      externalUrl: payload.externalUrl || null,
      buttonLabel: payload.buttonLabel || null,
      qrImageUrl: payload.qrImageUrl || null,
      sortOrder: payload.sortOrder != null ? Number(payload.sortOrder) : 0,
      status: payload.visible === false ? "archived" : "published",
    };
    if (isExisting) {
      const existing = await findFns.giving_method(client, entityKey);
      if (existing && String(existing.churchId) === String(churchId)) {
        await updateFns.giving_method(client, entityKey, fields);
        return;
      }
      // Cross-org or missing → treat as not found (no leak)
      return;
    }
    // Soft-fill / stable demo keys: update the matching church method if one already
    // exists so repeat publishes do not insert duplicates.
    const stableSoftKey =
      entityKey.startsWith("demo-giving-") || entityKey.startsWith("method-");
    if (stableSoftKey) {
      const items = await contentRepo.listGivingMethods(client, {
        churchId,
        branchId: branchId || null,
      });
      const match = (items || []).find(
        (m) =>
          m &&
          String(m.methodType || "").toLowerCase() === String(fields.methodType).toLowerCase() &&
          String(m.label || "").trim().toLowerCase() === String(fields.label).trim().toLowerCase()
      );
      if (match && match.id) {
        await updateFns.giving_method(client, match.id, fields);
        return;
      }
    }
    await insertFns.giving_method(client, {
      churchId,
      branchId: branchId || null,
      ...fields,
    });
    return;
  }

  if (kind === "social_link") {
    const fields = {
      channelType: payload.channelType || "social",
      label: payload.label || payload.channelType || "Social",
      value: payload.value || "",
      sortOrder: payload.sortOrder != null ? Number(payload.sortOrder) : 0,
      status: "published",
    };
    if (!fields.value) return;
    if (isExisting) {
      const existing = await findFns.social_link(client, entityKey);
      if (existing && String(existing.churchId) === String(churchId)) {
        await updateFns.social_link(client, entityKey, fields);
        return;
      }
      return;
    }
    await insertFns.social_link(client, {
      churchId,
      branchId: branchId || null,
      ...fields,
    });
  }
}

/**
 * Deterministic apply order: upserts/removes first, then reorder operations.
 * @param {object[]} drafts
 */
function orderedStructuredDrafts(drafts) {
  const list = Array.isArray(drafts) ? drafts.slice() : [];
  const weight = (d) => (d && d.op === "reorder" ? 1 : 0);
  return list.sort((a, b) => weight(a) - weight(b));
}

/**
 * Apply all active Phase 7 drafts in the current transaction, then mark applied.
 * @param {import('pg').PoolClient} client
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   branchId?: string|null,
 * }} opts
 */
async function applyWebsiteDraftsInTransaction(client, opts) {
  const organizationId = opts.organizationId;
  const churchId = opts.churchId;
  const branchId = opts.branchId === undefined ? null : opts.branchId;

  if (!fieldDraftRepo.isUuid(organizationId) || !fieldDraftRepo.isUuid(churchId)) {
    throw mapError("INVALID_SCOPE", "Invalid organization scope.");
  }

  const orgCheck = await client.query(
    `SELECT organization_id FROM blessboard.churches WHERE id = $1 LIMIT 1`,
    [churchId]
  );
  const row = orgCheck.rows[0];
  if (!row || String(row.organization_id) !== String(organizationId)) {
    throw mapError("CROSS_ORG", "Organization scope mismatch.");
  }

  const fieldDrafts = await fieldDraftRepo.listDrafts(client, {
    churchId,
    branchId,
    status: "draft",
  });
  const structuredDrafts = await structuredDraftRepo.listStructuredDrafts(client, {
    churchId,
    branchId,
    status: "draft",
  });

  if (!fieldDrafts.length && !structuredDrafts.length) {
    return { applied: 0, fieldCount: 0, structuredCount: 0 };
  }

  // Reject drafts belonging to another organization (defense in depth).
  for (const d of fieldDrafts.concat(structuredDrafts)) {
    if (String(d.organizationId) !== String(organizationId)) {
      throw mapError("CROSS_ORG", "Draft belongs to another organization.");
    }
  }

  const ctx = { churchId, branchId: branchId || null };
  for (const d of fieldDrafts) {
    await applyFieldDraft(client, d, ctx);
  }
  // Reorder drafts normalise positions across a whole collection, so they must
  // settle after the per-item upserts that may also carry a sort order.
  for (const d of orderedStructuredDrafts(structuredDrafts)) {
    await applyStructuredDraft(client, d, ctx);
  }

  const fieldApplied = await fieldDraftRepo.markAllDraftsApplied(client, {
    churchId,
    branchId,
    organizationId,
  });
  const structuredApplied = await structuredDraftRepo.markAllStructuredDraftsApplied(client, {
    churchId,
    branchId,
    organizationId,
  });

  return {
    applied: fieldApplied + structuredApplied,
    fieldCount: fieldApplied,
    structuredCount: structuredApplied,
  };
}

/**
 * Apply Phase 7 draft payloads embedded in a change submission (approval path).
 * Used when live draft rows were already cleared or as a fallback after submit.
 * @param {import('pg').PoolClient} client
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   branchId?: string|null,
 *   proposedContent: object,
 * }} opts
 */
async function applyProposedPhase7DraftsInTransaction(client, opts) {
  const organizationId = opts.organizationId;
  const churchId = opts.churchId;
  const branchId = opts.branchId === undefined ? null : opts.branchId;
  const proposed = opts.proposedContent || {};

  if (!fieldDraftRepo.isUuid(organizationId) || !fieldDraftRepo.isUuid(churchId)) {
    throw mapError("INVALID_SCOPE", "Invalid organization scope.");
  }

  const orgCheck = await client.query(
    `SELECT organization_id FROM blessboard.churches WHERE id = $1 LIMIT 1`,
    [churchId]
  );
  const row = orgCheck.rows[0];
  if (!row || String(row.organization_id) !== String(organizationId)) {
    throw mapError("CROSS_ORG", "Organization scope mismatch.");
  }

  const fieldDrafts = Array.isArray(proposed.fieldDrafts) ? proposed.fieldDrafts : [];
  const structuredDrafts = Array.isArray(proposed.structuredDrafts)
    ? proposed.structuredDrafts
    : [];
  if (!fieldDrafts.length && !structuredDrafts.length) {
    return { applied: 0, fieldCount: 0, structuredCount: 0 };
  }

  const ctx = { churchId, branchId: branchId || null };
  let fieldCount = 0;
  let structuredCount = 0;
  for (const d of fieldDrafts) {
    await applyFieldDraft(
      client,
      {
        ...d,
        organizationId,
        churchId,
        branchId: branchId || null,
        newValue: d.newValue,
        fieldKey: d.fieldKey,
        pageKey: d.pageKey,
        sectionKey: d.sectionKey,
      },
      ctx
    );
    fieldCount += 1;
  }
  for (const d of orderedStructuredDrafts(structuredDrafts)) {
    await applyStructuredDraft(
      client,
      {
        ...d,
        organizationId,
        churchId,
        branchId: branchId || null,
      },
      ctx
    );
    structuredCount += 1;
  }

  return {
    applied: fieldCount + structuredCount,
    fieldCount,
    structuredCount,
  };
}

module.exports = {
  applyWebsiteDraftsInTransaction,
  applyProposedPhase7DraftsInTransaction,
  orderedStructuredDrafts,
  ensurePage,
  ensureSection,
};
