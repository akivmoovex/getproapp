"use strict";

/**
 * Phase 7 Stage 5 — structured draft save/load/overlay (does not publish).
 */

const draftRepo = require("../repositories/websiteStructuredDraftRepository");
const fieldDraftRepo = require("../repositories/websiteInlineFieldDraftRepository");
const contentRepo = require("../repositories/publicContentRepository");
const mediaAssetsRepo = require("../media/mediaAssetsRepository");
const {
  DRAFT_KINDS,
  validateStructuredPayload,
  mapError,
  listDemoImages,
  collectStructuredImageUrls,
  parseStructuredMediaAssetId,
} = require("./websiteStructuredDraftValidation");
const auditSvc = require("./websiteAuditService");

const ENTITY_FINDERS = Object.freeze({
  leader: contentRepo.findLeaderById,
  ministry: contentRepo.findMinistryById,
  event: contentRepo.findEventById,
  sermon: contentRepo.findSermonById,
  giving_method: contentRepo.findGivingMethodById,
  social_link: contentRepo.findContactChannelById,
});

/**
 * When entityKey is a UUID that already exists, it must belong to the session church.
 * Cross-organization IDs return 404 (no leak). Unknown UUIDs are allowed (create path).
 * @param {import('pg').Pool} db
 * @param {{ draftKind: string, entityKey: string, churchId: string, payload?: object, op?: string }} input
 */
async function assertEntityKeysInChurch(db, input) {
  const finder = ENTITY_FINDERS[input.draftKind];
  if (!finder) return;

  const keys = new Set();
  if (fieldDraftRepo.isUuid(input.entityKey)) {
    keys.add(String(input.entityKey).trim());
  }
  const order = input.payload && Array.isArray(input.payload.order) ? input.payload.order : [];
  for (const id of order) {
    if (fieldDraftRepo.isUuid(id)) keys.add(String(id).trim());
  }

  for (const id of keys) {
    const existing = await finder(db, id);
    if (!existing) continue;
    if (String(existing.churchId) !== String(input.churchId)) {
      throw mapError("NOT_FOUND", "Item not found.", 404);
    }
  }
}

async function assertMediaAssetsInChurch(db, input) {
  const urls = collectStructuredImageUrls(input.payload);
  for (const url of urls) {
    const id = parseStructuredMediaAssetId(url);
    if (!id) continue;
    const asset = await mediaAssetsRepo.findMediaAssetById(db, id);
    if (!asset || asset.status !== "active" || String(asset.churchId) !== String(input.churchId)) {
      throw mapError("NOT_FOUND", "Image not found.", 404);
    }
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   branchId?: string|null,
 *   editorUserId: string,
 *   actorRole?: string|null,
 *   draftKind: string,
 *   pageKey?: string|null,
 *   sectionKey?: string|null,
 *   entityKey: string,
 *   op?: string,
 *   payload: object,
 *   previousPayload?: object|null,
 * }} input
 */
async function saveStructuredDraft(db, input) {
  const kind = String(input.draftKind || "").trim();
  if (!DRAFT_KINDS.includes(kind)) {
    throw mapError("INVALID_KIND", "That editor type is not supported.", 400);
  }
  const entityKey = String(input.entityKey || "").trim();
  if (!entityKey || entityKey.length > 120) {
    throw mapError("INVALID_ENTITY", "Missing item identifier.", 400);
  }
  // Never accept client church/org overrides (caller must set from session).
  const op = String(input.op || "upsert").trim();
  if (!["upsert", "remove", "reorder"].includes(op)) {
    throw mapError("INVALID_OP", "Unsupported edit action.", 400);
  }

  const validated = validateStructuredPayload(kind, input.payload || {}, op);
  if (!validated.ok) {
    throw mapError("VALIDATION", validated.error || "Invalid content.", 400);
  }

  await assertEntityKeysInChurch(db, {
    draftKind: kind,
    entityKey,
    churchId: input.churchId,
    payload: validated.payload,
    op,
  });
  await assertMediaAssetsInChurch(db, {
    churchId: input.churchId,
    payload: validated.payload,
  });

  const draft = await draftRepo.upsertStructuredDraft(db, {
    organizationId: input.organizationId,
    churchId: input.churchId,
    branchId: input.branchId || null,
    draftKind: kind,
    pageKey: input.pageKey || null,
    sectionKey: input.sectionKey || null,
    entityKey,
    op,
    payload: validated.payload,
    previousPayload: input.previousPayload != null ? input.previousPayload : null,
    editorUserId: input.editorUserId,
  });

  try {
    await auditSvc.recordWebsiteAuditEvent(db, {
      organizationId: input.organizationId,
      branchId: input.branchId || null,
      actorUserId: input.editorUserId,
      actorRole: input.actorRole || null,
      actionType: "draft_saved",
      pageKey: input.pageKey || null,
      sectionKey: input.sectionKey || null,
      entityType: kind,
      entityId: draft.id,
      result: "success",
      before: input.previousPayload || {},
      after: validated.payload,
      metadata: { source: "structured_editor", op, published: false, entityKey },
    });
  } catch {
    // non-blocking
  }

  return {
    saved: true,
    published: false,
    draftId: draft.id,
    draftKind: kind,
    entityKey,
    op,
    payload: draft.payload,
    updatedAt: draft.updatedAt,
  };
}

/**
 * Cancel/discards an active structured draft (no new draft written).
 */
async function cancelStructuredDraft(db, input) {
  const discarded = await draftRepo.discardStructuredDraftByKey(db, {
    churchId: input.churchId,
    branchId: input.branchId || null,
    draftKind: input.draftKind,
    pageKey: input.pageKey || null,
    sectionKey: input.sectionKey || null,
    entityKey: input.entityKey,
  });
  return { cancelled: true, discarded, published: false };
}

async function countAllWebsiteDrafts(db, opts) {
  const [fieldCount, structuredCount] = await Promise.all([
    fieldDraftRepo.countDrafts(db, opts),
    draftRepo.countStructuredDrafts(db, opts),
  ]);
  let engineCount = 0;
  if (opts && opts.organizationId) {
    try {
      const {
        countUnpublishedEngineFields,
      } = require("../website/blessboardEngineContentService");
      engineCount = await countUnpublishedEngineFields(db, {
        organizationId: opts.organizationId,
        branchId: opts.branchId || null,
      });
    } catch {
      engineCount = 0;
    }
  }
  return Math.max(fieldCount + structuredCount, engineCount);
}

/**
 * Apply structured drafts onto a public page model (editing mode only).
 * @param {object} model
 * @param {object[]} drafts
 */
function applyStructuredDraftsToModel(model, drafts) {
  if (!model || !Array.isArray(drafts) || !drafts.length) return model;

  const byKind = {
    image: [],
    video: [],
    service_times: [],
    leader: [],
    ministry: [],
    event: [],
    sermon: [],
    giving_method: [],
    social_link: [],
    page_section: [],
  };
  for (const d of drafts) {
    if (byKind[d.draftKind]) byKind[d.draftKind].push(d);
  }

  // Draft section order
  for (const d of byKind.page_section) {
    if (!d.pageKey || d.pageKey !== model.pageKey) continue;
    if (d.op !== "reorder" || !Array.isArray(d.payload && d.payload.order)) continue;
    const order = d.payload.order.map(String);
    const rank = (section) => {
      const idx = order.indexOf(String(section && section.sectionKey));
      return idx < 0 ? Number.MAX_SAFE_INTEGER : idx;
    };
    model.sections = (model.sections || [])
      .slice()
      .sort((a, b) => rank(a) - rank(b))
      .map((s, idx) => ({ ...s, sortOrder: (idx + 1) * 10 }));
  }

  // Section media (image/video)
  for (const d of byKind.image.concat(byKind.video)) {
    if (!d.pageKey || d.pageKey !== model.pageKey) continue;
    const sectionKey = d.sectionKey || "hero";
    const payload = d.payload || {};
    if (d.op === "remove") {
      if (sectionKey === "hero" || sectionKey === "intro") {
        if (model.pageKey === "home" && model.homeDemoFallback) {
          model.homeDemoFallback = { ...model.homeDemoFallback, heroMediaUrl: null };
        }
        if (model.pageKey === "about" && model.aboutDemoFallback) {
          model.aboutDemoFallback = { ...model.aboutDemoFallback, heroMediaUrl: null };
        }
        if (model.pageKey === "giving" && model.givingDemoFallback) {
          model.givingDemoFallback = { ...model.givingDemoFallback, introMediaUrl: null };
        }
      }
      model.sections = (model.sections || []).map((s) => {
        if (String(s.sectionKey) !== sectionKey) return s;
        return { ...s, mediaUrl: null };
      });
      continue;
    }
    const mediaUrl =
      payload.imageUrl || payload.videoUrl || payload.thumbnailUrl || null;
    let matched = false;
    model.sections = (model.sections || []).map((s) => {
      if (String(s.sectionKey) !== sectionKey) return s;
      matched = true;
      return {
        ...s,
        mediaUrl: mediaUrl || s.mediaUrl,
        layoutMetadata: {
          ...(s.layoutMetadata || {}),
          ...(d.draftKind === "image"
            ? { altText: payload.altText, focal: payload.focal, fit: payload.fit }
            : { videoUrl: payload.videoUrl, videoTitle: payload.title }),
        },
      };
    });
    if (!matched && mediaUrl) {
      model.sections = [
        ...(model.sections || []),
        {
          sectionKey,
          sectionType: sectionKey,
          heading: null,
          bodyText: null,
          mediaUrl,
          sortOrder: 50,
          status: "draft",
          layoutMetadata:
            d.draftKind === "image"
              ? { altText: payload.altText, focal: payload.focal, fit: payload.fit }
              : { videoUrl: payload.videoUrl, videoTitle: payload.title },
        },
      ];
    }
    // Soft-fill heroes when no CMS section
    if (sectionKey === "hero" && mediaUrl) {
      model._draftHeroMediaUrl = mediaUrl;
      if (model.pageKey === "home" && model.homeDemoFallback) {
        model.homeDemoFallback = { ...model.homeDemoFallback, heroMediaUrl: mediaUrl };
      }
      if (model.pageKey === "about" && model.aboutDemoFallback) {
        model.aboutDemoFallback = { ...model.aboutDemoFallback, heroMediaUrl: mediaUrl };
      }
      if (model.pageKey === "giving" && model.givingDemoFallback) {
        model.givingDemoFallback = { ...model.givingDemoFallback, introMediaUrl: mediaUrl };
      }
    }
    if (model.pageKey === "about" && sectionKey === "story" && mediaUrl && model.aboutDemoFallback) {
      model.aboutDemoFallback = {
        ...model.aboutDemoFallback,
        storyMediaUrl: mediaUrl,
        story: model.aboutDemoFallback.story
          ? { ...model.aboutDemoFallback.story, mediaUrl }
          : model.aboutDemoFallback.story,
      };
    }
    if (model.pageKey === "about" && /^gallery_\d+$/.test(sectionKey) && mediaUrl && model.aboutDemoFallback) {
      const idx = Number(String(sectionKey).replace("gallery_", "")) - 1;
      if (idx >= 0) {
        const gallery = Array.isArray(model.aboutDemoFallback.gallery)
          ? model.aboutDemoFallback.gallery.slice()
          : [];
        while (gallery.length <= idx) gallery.push("");
        gallery[idx] = mediaUrl;
        model.aboutDemoFallback = { ...model.aboutDemoFallback, gallery };
      }
    }
  }

  // Service times
  for (const d of byKind.service_times) {
    if (d.op === "remove") {
      model.serviceTimesEntries = [];
      continue;
    }
    if (Array.isArray(d.payload && d.payload.entries)) {
      model.serviceTimesEntries = d.payload.entries.filter((e) => e && e.enabled !== false);
    }
  }

  // Entity collections
  function applyCollection(list, kindDrafts, mapPayload) {
    let items = Array.isArray(list) ? list.slice() : [];
    for (const d of kindDrafts) {
      const key = String(d.entityKey);
      if (d.op === "remove") {
        items = items.filter((it) => String(it.id || it._draftKey) !== key);
        continue;
      }
      if (d.op === "reorder" && Array.isArray(d.payload.order)) {
        const order = d.payload.order.map(String);
        items.sort((a, b) => {
          const ai = order.indexOf(String(a.id || a._draftKey));
          const bi = order.indexOf(String(b.id || b._draftKey));
          return (ai < 0 ? 9999 : ai) - (bi < 0 ? 9999 : bi);
        });
        items = items.map((it, idx) => ({ ...it, sortOrder: (idx + 1) * 10 }));
        continue;
      }
      const mapped = mapPayload(d.payload || {}, key);
      if (mapped.visible === false) {
        items = items.filter((it) => String(it.id || it._draftKey) !== key);
        // Keep hidden items only as marked for editor list via websiteAdmin
        continue;
      }
      const idx = items.findIndex((it) => String(it.id || it._draftKey) === key);
      if (idx >= 0) items[idx] = { ...items[idx], ...mapped, id: items[idx].id || key };
      else items.push({ ...mapped, id: key, _draftKey: key, _isDraftNew: true });
    }
    return items;
  }

  if (model.pageKey === "leadership" || model.pageKey === "home") {
    if (model.pageKey === "leadership") {
      model.entities = applyCollection(model.entities, byKind.leader, (p, key) => ({
        id: key,
        displayName: p.displayName,
        roleTitle: p.roleTitle,
        biography: p.biography,
        imageUrl: p.imageUrl,
        sortOrder: p.sortOrder || 0,
        status: p.status,
        seniorLeader: p.seniorLeader,
        visible: p.visible !== false,
        email: p.contactPublic ? p.email : null,
        phone: p.contactPublic ? p.phone : null,
      }));
    }
    if (model.pageKey === "home" && model.homeTeasers) {
      model.homeTeasers = {
        ...model.homeTeasers,
        leaders: applyCollection(model.homeTeasers.leaders, byKind.leader, (p, key) => ({
          id: key,
          displayName: p.displayName,
          roleTitle: p.roleTitle,
          biography: p.biography,
          imageUrl: p.imageUrl,
          sortOrder: p.sortOrder || 0,
        })),
      };
    }
  }

  if (model.pageKey === "ministries" || model.pageKey === "home") {
    if (model.pageKey === "ministries") {
      model.entities = applyCollection(model.entities, byKind.ministry, (p, key) => ({
        id: key,
        name: p.name,
        summary: p.summary,
        description: p.description,
        meetingDay: p.meetingDay,
        contactEmail: p.contactEmail,
        imageUrl: p.imageUrl,
        sortOrder: p.sortOrder || 0,
        featured: p.featured,
        visible: p.visible !== false,
        audience: p.audience,
        leaderName: p.leaderName,
        joinUrl: p.joinUrl,
      }));
    }
    if (model.pageKey === "home" && model.homeTeasers) {
      model.homeTeasers = {
        ...model.homeTeasers,
        ministries: applyCollection(model.homeTeasers.ministries, byKind.ministry, (p, key) => ({
          id: key,
          name: p.name,
          summary: p.summary,
          imageUrl: p.imageUrl,
        })),
      };
    }
  }

  if (model.pageKey === "events" || model.pageKey === "home") {
    const mapEv = (p, key) => ({
      id: key,
      title: p.title,
      summary: p.summary,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      timezone: p.timezone,
      location: p.location,
      registrationUrl: p.registrationUrl,
      imageUrl: p.imageUrl,
      featured: p.featured,
      visible: p.visible !== false,
      organizer: p.organizer,
    });
    if (model.pageKey === "events") {
      model.entities = applyCollection(model.entities, byKind.event, mapEv).filter((ev) => {
        if (!ev.startsAt) return true;
        const t = new Date(ev.startsAt).getTime();
        if (Number.isNaN(t)) return true;
        // Past events must not appear as upcoming on public-facing edit preview list
        return t >= Date.now() - 60 * 60 * 1000 || ev.featured;
      });
    }
    if (model.pageKey === "home" && model.homeTeasers) {
      model.homeTeasers = {
        ...model.homeTeasers,
        events: applyCollection(model.homeTeasers.events, byKind.event, mapEv),
      };
    }
  }

  if (model.pageKey === "sermons" || model.pageKey === "home") {
    const mapS = (p, key) => ({
      id: key,
      title: p.title,
      speakerName: p.speakerName,
      preachedAt: p.preachedAt,
      summary: p.summary,
      scripture: p.scripture,
      mediaUrl: p.mediaUrl,
      resourceUrl: p.resourceUrl,
      imageUrl: p.imageUrl,
      featured: p.featured,
      visible: p.visible !== false,
      series: p.series,
    });
    if (model.pageKey === "sermons") {
      model.entities = applyCollection(model.entities, byKind.sermon, mapS);
      model.entities.sort((a, b) => {
        const at = a.preachedAt ? new Date(a.preachedAt).getTime() : 0;
        const bt = b.preachedAt ? new Date(b.preachedAt).getTime() : 0;
        return bt - at;
      });
    }
    if (model.pageKey === "home" && model.homeTeasers) {
      model.homeTeasers = {
        ...model.homeTeasers,
        sermons: applyCollection(model.homeTeasers.sermons, byKind.sermon, mapS),
      };
    }
  }

  if (model.pageKey === "giving") {
    model.entities = applyCollection(model.entities, byKind.giving_method, (p, key) => ({
      id: key,
      methodType: p.methodType,
      label: p.label,
      description: p.description || null,
      accountDetails: p.accountDetails || null,
      instructions: p.instructions || null,
      externalUrl: p.externalUrl || null,
      buttonLabel: p.buttonLabel || null,
      qrImageUrl: p.qrImageUrl || null,
      sortOrder: p.sortOrder || 0,
      status: p.status,
      visible: p.visible !== false,
      icon: null,
    }));
  }

  if (byKind.social_link.length) {
    model.socialLinks = applyCollection(model.socialLinks, byKind.social_link, (p, key) => ({
      id: key,
      channelType: p.channelType,
      label: p.label,
      value: p.value,
      href: p.visible === false ? null : p.value,
      icon: null,
      sortOrder: p.sortOrder || 0,
      visible: p.visible !== false,
      _draftKey: key,
    })).filter((link) => link && link.href);
  }

  return model;
}

module.exports = {
  saveStructuredDraft,
  cancelStructuredDraft,
  countAllWebsiteDrafts,
  applyStructuredDraftsToModel,
  listDemoImages,
  listStructuredDrafts: (db, opts) => draftRepo.listStructuredDrafts(db, opts),
};
