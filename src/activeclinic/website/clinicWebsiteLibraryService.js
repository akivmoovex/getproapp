"use strict";

/**
 * Reusable clinic website content (MW09).
 * Stores library items and placements on the shared website engine.
 * Does not create staff, service, or facility records.
 */

const contentService = require("../../platform/website/contentService");
const { PERMISSIONS, hasWebsitePermission } = require("../../platform/website/permissions");
const {
  listPublicServices,
  listPublicStaffProfiles,
} = require("../services/activeClinicPublicVisibilityService");
const { listFacilitiesByOrganization } = require("../services/facilityService");
const cmsService = require("./clinicWebsiteCmsService");
const {
  CMS_KEYS,
  PAGE_KIND,
  LIBRARY_TYPES,
  LIBRARY_SOURCES,
  newCmsId,
  sortKey,
  boolValue,
  sortByOrder,
  isLibraryType,
  libraryTypeLabel,
  librarySourceLabel,
  operationalItemId,
  builtinLibraryPage,
  publicPageHref,
  applyLibraryPresentation,
  libraryItemIsHidden,
} = require("./clinicWebsiteCms");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  ALREADY_EXISTS: "already_exists",
  RECORD_NOT_FOUND: "record_not_found",
});

const MAX_LIBRARY_ITEMS = 80;
const MAX_PLACEMENTS = 200;

function granted(input) {
  return Array.isArray(input && input.grantedPermissions) ? input.grantedPermissions : [];
}

function requireEdit(input) {
  if (!hasWebsitePermission(granted(input), PERMISSIONS.EDIT)) {
    return { ok: false, code: RESULT.FORBIDDEN };
  }
  return { ok: true };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function draftList(row) {
  if (!row) return [];
  return asArray(row.draftValue);
}

function text(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function normalizeImage(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    const src = raw.trim();
    return src ? { src, alt: "", mediaId: "" } : null;
  }
  const src = String((raw && raw.src) || "").trim();
  const mediaId = String((raw && raw.mediaId) || "").trim();
  if (!src && !mediaId) return null;
  return {
    src,
    alt: String((raw && raw.alt) || "").trim(),
    mediaId,
  };
}

function normalizeItem(raw, index) {
  const source =
    raw && raw.source === LIBRARY_SOURCES.OPERATIONAL
      ? LIBRARY_SOURCES.OPERATIONAL
      : LIBRARY_SOURCES.WEBSITE;
  return {
    id: text(raw && raw.id, 40) || newCmsId("lib"),
    type: isLibraryType(raw && raw.type) ? String(raw.type) : "faq",
    source,
    operational_key: text(raw && raw.operational_key, 80),
    title: text(raw && raw.title, 160),
    summary: text(raw && raw.summary, 400),
    body: text(raw && raw.body, 4000),
    attribution: text(raw && raw.attribution, 120),
    image: normalizeImage(raw && raw.image),
    visible: raw && raw.visible === false ? false : true,
    featured: raw && raw.featured === true,
    sort_order: String(sortKey(raw && raw.sort_order != null ? raw.sort_order : index)),
  };
}

function normalizePlacement(raw, index) {
  return {
    id: text(raw && raw.id, 40) || newCmsId("pl"),
    item_id: text(raw && raw.item_id, 40),
    page_id: text(raw && raw.page_id, 40),
    section_id: text(raw && raw.section_id, 40),
    sort_order: String(sortKey(raw && raw.sort_order != null ? raw.sort_order : index)),
  };
}

async function saveKey(db, input, contentKey, value) {
  return contentService.saveWebsiteDraft(db, {
    organizationId: input.organizationId,
    instanceId: input.instanceId,
    expectedProductCode: "activeclinic",
    contentKey,
    value,
    actorIdentityId: input.actorIdentityId || null,
    grantedPermissions: granted(input),
  });
}

function formatHours(facility) {
  const raw = facility && (facility.publicHours || facility.publicHoursJson);
  if (!raw) return "";
  if (typeof raw === "string") return raw.slice(0, 400);
  if (typeof raw === "object") {
    try {
      return Object.keys(raw)
        .map((day) => `${day}: ${raw[day]}`)
        .join("; ")
        .slice(0, 400);
    } catch (_err) {
      return "";
    }
  }
  return "";
}

function formatAddress(facility) {
  if (!facility) return "";
  return [facility.addressLine1, facility.city, facility.province].filter(Boolean).join(", ");
}

function facilityKey(facility) {
  return String((facility && (facility.facilityKey || facility.id)) || "");
}

async function loadStored(db, instance, organizationId) {
  const [libraryRow, placementRow] = await Promise.all([
    contentService.getWebsiteContentRow(db, instance.id, organizationId, CMS_KEYS.LIBRARY),
    contentService.getWebsiteContentRow(db, instance.id, organizationId, CMS_KEYS.PLACEMENTS),
  ]);
  return {
    libraryRow,
    placementRow,
    items: sortByOrder(draftList(libraryRow).map((item, index) => normalizeItem(item, index))),
    placements: sortByOrder(
      draftList(placementRow).map((item, index) => normalizePlacement(item, index))
    ),
  };
}

async function loadOperational(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "");
  const empty = { services: [], doctors: [], facilities: [] };
  if (!organizationId || !healthcareOrganizationId) return empty;
  const [services, doctors, facilities] = await Promise.all([
    listPublicServices(db, { organizationId, healthcareOrganizationId }),
    listPublicStaffProfiles(db, { organizationId, healthcareOrganizationId }),
    listFacilitiesByOrganization(db, { organizationId, status: "active" }),
  ]);
  return {
    services: services.ok ? services.services || [] : [],
    doctors: doctors.ok ? doctors.profiles || [] : [],
    facilities: facilities.ok ? facilities.facilities || [] : [],
  };
}

function pageTitle(pages, pageId) {
  const page = (pages || []).find((item) => item && item.id === pageId);
  return (page && (page.title || page.nav_label)) || pageId;
}

function usageFor(item, placements, pages, clinicKey) {
  const used = [];
  const builtin = item.source === LIBRARY_SOURCES.OPERATIONAL ? builtinLibraryPage(item.type) : null;
  if (builtin) {
    used.push({
      page_id: builtin.pageId,
      label: builtin.label,
      builtin: true,
      href: publicPageHref(clinicKey, (pages || []).find((page) => page && page.id === builtin.pageId)),
    });
  }
  (placements || [])
    .filter((placement) => placement && placement.item_id === item.id)
    .forEach((placement) => {
      const page = (pages || []).find((entry) => entry && entry.id === placement.page_id);
      used.push({
        placement_id: placement.id,
        page_id: placement.page_id,
        label: pageTitle(pages, placement.page_id),
        builtin: false,
        href: publicPageHref(clinicKey, page),
      });
    });
  return used;
}

function presentItem(item, extra) {
  const extras = extra || {};
  return {
    ...item,
    typeLabel: libraryTypeLabel(item.type),
    sourceLabel: librarySourceLabel(item.source),
    isOperational: item.source === LIBRARY_SOURCES.OPERATIONAL,
    clinicTitle: extras.clinicTitle || "",
    clinicSummary: extras.clinicSummary || "",
    recordsHref: extras.recordsHref || "",
    recordsLabel: extras.recordsLabel || "",
    usage: extras.usage || [],
    stored: extras.stored === true,
  };
}

function mergeLibrary(storedItems, operational, placements, pages, clinicKey) {
  const usedIds = new Set();
  const items = [];

  function overlay(type, key) {
    return storedItems.find(
      (item) =>
        item.source === LIBRARY_SOURCES.OPERATIONAL &&
        item.type === type &&
        item.operational_key === String(key || "")
    );
  }

  (operational.services || []).forEach((service, index) => {
    const key = service.serviceKey;
    const stored = overlay("service", key);
    if (stored) usedIds.add(stored.id);
    items.push(
      presentItem(
        normalizeItem(
          {
            id: stored ? stored.id : operationalItemId("s", key),
            type: "service",
            source: LIBRARY_SOURCES.OPERATIONAL,
            operational_key: key,
            title: (stored && stored.title) || service.displayName || "",
            summary: (stored && stored.summary) || service.summary || "",
            body: stored ? stored.body : "",
            image: stored ? stored.image : null,
            visible: stored ? stored.visible : true,
            featured: stored ? stored.featured : false,
            sort_order: stored ? stored.sort_order : String(index),
          },
          index
        ),
        {
          stored: Boolean(stored),
          clinicTitle: service.displayName || "",
          clinicSummary: service.summary || "",
          recordsLabel: "ActiveClinic service record",
        }
      )
    );
  });

  (operational.doctors || []).forEach((doctor, index) => {
    const key = doctor.staffKey;
    const stored = overlay("doctor", key);
    if (stored) usedIds.add(stored.id);
    items.push(
      presentItem(
        normalizeItem(
          {
            id: stored ? stored.id : operationalItemId("d", key),
            type: "doctor",
            source: LIBRARY_SOURCES.OPERATIONAL,
            operational_key: key,
            title: (stored && stored.title) || doctor.displayName || "",
            summary: (stored && stored.summary) || doctor.title || "",
            body: (stored && stored.body) || doctor.bio || "",
            image: stored ? stored.image : null,
            visible: stored ? stored.visible : true,
            featured: stored ? stored.featured : false,
            sort_order: stored ? stored.sort_order : String(index),
          },
          index
        ),
        {
          stored: Boolean(stored),
          clinicTitle: doctor.displayName || "",
          clinicSummary: doctor.title || doctor.bio || "",
          recordsHref: "/app/staff",
          recordsLabel: "Manage doctors in clinic records",
        }
      )
    );
  });

  (operational.facilities || []).forEach((facility, index) => {
    const key = facilityKey(facility);
    const address = formatAddress(facility);
    const hours = formatHours(facility);
    const locationStored = overlay("location", key);
    if (locationStored) usedIds.add(locationStored.id);
    items.push(
      presentItem(
        normalizeItem(
          {
            id: locationStored ? locationStored.id : operationalItemId("l", key),
            type: "location",
            source: LIBRARY_SOURCES.OPERATIONAL,
            operational_key: key,
            title: (locationStored && locationStored.title) || facility.displayName || "",
            summary: (locationStored && locationStored.summary) || address,
            body: (locationStored && locationStored.body) || address,
            image: locationStored ? locationStored.image : null,
            visible: locationStored ? locationStored.visible : true,
            featured: locationStored ? locationStored.featured : false,
            sort_order: locationStored ? locationStored.sort_order : String(index),
          },
          index
        ),
        {
          stored: Boolean(locationStored),
          clinicTitle: facility.displayName || "",
          clinicSummary: address,
          recordsHref: "/app/facilities",
          recordsLabel: "Manage locations in clinic records",
        }
      )
    );
    const hoursStored = overlay("hours", key);
    if (hoursStored) usedIds.add(hoursStored.id);
    items.push(
      presentItem(
        normalizeItem(
          {
            id: hoursStored ? hoursStored.id : operationalItemId("h", key),
            type: "hours",
            source: LIBRARY_SOURCES.OPERATIONAL,
            operational_key: key,
            title: (hoursStored && hoursStored.title) || `${facility.displayName || "Clinic"} hours`,
            summary: (hoursStored && hoursStored.summary) || hours,
            body: (hoursStored && hoursStored.body) || hours,
            visible: hoursStored ? hoursStored.visible : true,
            featured: hoursStored ? hoursStored.featured : false,
            sort_order: hoursStored ? hoursStored.sort_order : String(index),
          },
          index
        ),
        {
          stored: Boolean(hoursStored),
          clinicTitle: facility.displayName || "",
          clinicSummary: hours,
          recordsHref: "/app/facilities",
          recordsLabel: "Manage opening hours in clinic records",
        }
      )
    );
  });

  storedItems.forEach((item) => {
    if (usedIds.has(item.id)) return;
    items.push(
      presentItem(item, {
        stored: true,
        recordsHref: "",
        recordsLabel: item.source === LIBRARY_SOURCES.WEBSITE ? "Website-only content" : "",
      })
    );
  });

  return items.map((item) => ({
    ...item,
    usage: usageFor(item, placements, pages, clinicKey),
  }));
}

async function seedLibraryIfMissing(db, input, instance, organizationId) {
  const stored = await loadStored(db, instance, organizationId);
  if (stored.libraryRow) return stored;
  const [faqRow, testimonialRow] = await Promise.all([
    contentService.getWebsiteContentRow(db, instance.id, organizationId, "home.faq"),
    contentService.getWebsiteContentRow(db, instance.id, organizationId, "home.testimonials"),
  ]);
  const faqs = draftList(faqRow);
  const testimonials = draftList(testimonialRow);
  const items = [];
  const placements = [];
  faqs.forEach((faq, index) => {
    const item = normalizeItem(
      {
        type: "faq",
        source: LIBRARY_SOURCES.WEBSITE,
        title: faq && faq.question,
        body: faq && faq.answer,
        sort_order: String(index),
      },
      index
    );
    items.push(item);
    placements.push(
      normalizePlacement(
        { item_id: item.id, page_id: "tpl_home", sort_order: String(index) },
        index
      )
    );
  });
  testimonials.forEach((entry, index) => {
    const item = normalizeItem(
      {
        type: "testimonial",
        source: LIBRARY_SOURCES.WEBSITE,
        title: (entry && entry.attribution) || "Patient comment",
        body: entry && entry.quote,
        attribution: entry && entry.attribution,
        sort_order: String(faqs.length + index),
      },
      faqs.length + index
    );
    items.push(item);
    placements.push(
      normalizePlacement(
        {
          item_id: item.id,
          page_id: "tpl_home",
          sort_order: String(faqs.length + index),
        },
        faqs.length + index
      )
    );
  });
  await contentService.seedWebsiteContent(
    db,
    instance,
    [
      { contentKey: CMS_KEYS.LIBRARY, value: items, publish: true },
      { contentKey: CMS_KEYS.PLACEMENTS, value: placements, publish: true },
    ],
    input.actorIdentityId || null
  );
  return loadStored(db, instance, organizationId);
}

async function loadLibrary(db, input) {
  const seeded = await cmsService.ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const stored = await seedLibraryIfMissing(db, input, seeded.instance, seeded.organizationId);
  const operational = await loadOperational(db, input);
  const items = mergeLibrary(
    stored.items,
    operational,
    stored.placements,
    seeded.pages,
    input.clinicKey
  );
  return {
    ok: true,
    instance: seeded.instance,
    items,
    placements: stored.placements,
    pages: (seeded.pages || []).map((page) => cmsService.presentPage(page, input.clinicKey)),
    operational,
    types: LIBRARY_TYPES,
  };
}

function findMerged(items, itemId) {
  return (items || []).find((item) => item && item.id === String(itemId || "")) || null;
}

async function getLibraryItem(db, input) {
  const loaded = await loadLibrary(db, input);
  if (!loaded.ok) return loaded;
  const item = findMerged(loaded.items, input.itemId);
  if (!item) return { ok: false, code: RESULT.NOT_FOUND };
  return { ...loaded, item };
}

function lookupOperational(operational, type, key) {
  const wanted = String(key || "");
  if (!wanted) return null;
  if (type === "service") {
    return (operational.services || []).find((row) => row.serviceKey === wanted) || null;
  }
  if (type === "doctor") {
    return (operational.doctors || []).find((row) => row.staffKey === wanted) || null;
  }
  if (type === "location" || type === "hours") {
    return (operational.facilities || []).find((row) => facilityKey(row) === wanted) || null;
  }
  return null;
}

function defaultsFromRecord(type, record) {
  if (!record) return { title: "", summary: "", body: "" };
  if (type === "service") {
    return { title: record.displayName || "", summary: record.summary || "", body: record.summary || "" };
  }
  if (type === "doctor") {
    return { title: record.displayName || "", summary: record.title || "", body: record.bio || "" };
  }
  if (type === "location") {
    const address = formatAddress(record);
    return { title: record.displayName || "", summary: address, body: address };
  }
  if (type === "hours") {
    const hours = formatHours(record);
    return {
      title: `${record.displayName || "Clinic"} hours`,
      summary: hours,
      body: hours,
    };
  }
  return { title: "", summary: "", body: "" };
}

async function syncHomeCollections(db, input, instanceId, items, types) {
  const wanted = Array.isArray(types) && types.length ? types : ["faq", "testimonial"];
  if (wanted.includes("faq")) {
    const faqs = (items || [])
      .filter((item) => item.type === "faq" && item.visible !== false)
      .map((item) => ({ question: item.title, answer: item.body }));
    const faqSaved = await saveKey(db, { ...input, instanceId }, "home.faq", faqs);
    if (!faqSaved.ok) return faqSaved;
  }
  if (wanted.includes("testimonial")) {
    const testimonials = (items || [])
      .filter((item) => item.type === "testimonial" && item.visible !== false)
      .map((item) => ({ quote: item.body, attribution: item.attribution || item.title || "" }));
    const quoteSaved = await saveKey(db, { ...input, instanceId }, "home.testimonials", testimonials);
    if (!quoteSaved.ok) return quoteSaved;
    if (testimonials.length) {
      const vis = await saveKey(db, { ...input, instanceId }, "section.testimonials.visible", true);
      if (!vis.ok) return vis;
    }
  }
  return { ok: true };
}

async function persistLibrary(db, input, instanceId, items, placements) {
  const savedItems = await saveKey(db, { ...input, instanceId }, CMS_KEYS.LIBRARY, items);
  if (!savedItems.ok) return savedItems;
  const savedPlaces = await saveKey(db, { ...input, instanceId }, CMS_KEYS.PLACEMENTS, placements);
  if (!savedPlaces.ok) return savedPlaces;
  return { ok: true };
}

async function upsertStoredItem(db, input, mergedItem) {
  const seeded = await cmsService.ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const stored = await loadStored(db, seeded.instance, seeded.organizationId);
  const next = normalizeItem(mergedItem, stored.items.length);
  const exists = stored.items.some((item) => item.id === next.id);
  const items = exists
    ? stored.items.map((item) => (item.id === next.id ? next : item))
    : stored.items.concat([next]);
  if (!exists && items.length > MAX_LIBRARY_ITEMS) {
    return { ok: false, code: RESULT.INVALID_INPUT, reason: "too_many_items" };
  }
  const saved = await persistLibrary(db, input, seeded.instance.id, items, stored.placements);
  if (!saved.ok) return saved;
  return { ok: true, item: next, instance: seeded.instance, items, placements: stored.placements };
}

function itemFromForm(body, operational) {
  const type = String((body && body.type) || "").trim();
  if (!isLibraryType(type)) return { ok: false, code: RESULT.INVALID_INPUT, reason: "invalid_type" };
  const websiteOnly = boolValue(body && body.websiteOnly, false) === true;
  const pickedKey =
    type === "service"
      ? text(body && (body.serviceKey || body.operationalKey), 80)
      : type === "doctor"
        ? text(body && (body.doctorKey || body.operationalKey), 80)
        : type === "location" || type === "hours"
          ? text(body && (body.facilityKey || body.operationalKey), 80)
          : "";
  const operationalKey = websiteOnly ? "" : pickedKey;
  const record = operationalKey ? lookupOperational(operational, type, operationalKey) : null;
  if (operationalKey && !record) return { ok: false, code: RESULT.RECORD_NOT_FOUND };
  const source = record ? LIBRARY_SOURCES.OPERATIONAL : LIBRARY_SOURCES.WEBSITE;
  const fallback = defaultsFromRecord(type, record);
  const title = text(body && (body.title || body.question), 160) || fallback.title;
  const summary = text(body && body.summary, 400) || fallback.summary;
  const bodyText =
    text(body && (body.body || body.answer || body.quote), 4000) || fallback.body;
  const attribution = text(body && body.attribution, 120);
  const image = cmsService.imageValueFromParts(
    body && (body.imageSrc || (body.image && body.image.src)),
    body && (body.imageAlt || (body.image && body.image.alt)),
    body && (body.imageMediaId || (body.image && body.image.mediaId))
  );
  const featured = boolValue(body && body.featured, false) === true;
  if (type === "faq" && (!title || !bodyText)) {
    return { ok: false, code: RESULT.INVALID_INPUT, reason: "faq_required" };
  }
  if (type === "testimonial" && !bodyText) {
    return { ok: false, code: RESULT.INVALID_INPUT, reason: "testimonial_required" };
  }
  if (source === LIBRARY_SOURCES.WEBSITE && (type === "service" || type === "doctor") && !title) {
    return { ok: false, code: RESULT.INVALID_INPUT, reason: "title_required" };
  }
  const id =
    source === LIBRARY_SOURCES.OPERATIONAL
      ? operationalItemId(type === "service" ? "s" : type === "doctor" ? "d" : type === "hours" ? "h" : "l", operationalKey)
      : newCmsId("lib");
  return {
    ok: true,
    item: normalizeItem(
      {
        id,
        type,
        source,
        operational_key: operationalKey,
        title,
        summary,
        body: bodyText,
        attribution,
        image,
        visible: boolValue(body && body.visible, false) !== false,
        featured,
      },
      0
    ),
  };
}

async function createLibraryItem(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const loaded = await loadLibrary(db, input);
  if (!loaded.ok) return loaded;
  const parsed = itemFromForm(input, loaded.operational);
  if (!parsed.ok) return parsed;
  if (loaded.items.some((item) => item.id === parsed.item.id && item.stored)) {
    return { ok: false, code: RESULT.ALREADY_EXISTS, item: parsed.item };
  }
  parsed.item.sort_order = String(loaded.items.length);
  const stored = await upsertStoredItem(db, input, parsed.item);
  if (!stored.ok) return stored;
  if (parsed.item.type === "faq" || parsed.item.type === "testimonial") {
    const synced = await syncHomeCollections(db, input, stored.instance.id, stored.items, [parsed.item.type]);
    if (!synced.ok) return synced;
  }
  if (parsed.item.type === "hours" && parsed.item.source === LIBRARY_SOURCES.WEBSITE && parsed.item.body) {
    await saveKey(db, { ...input, instanceId: stored.instance.id }, "location.hours", parsed.item.body);
  }
  return { ok: true, item: stored.item };
}

async function updateLibraryItem(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const loaded = await getLibraryItem(db, input);
  if (!loaded.ok) return loaded;
  const current = loaded.item;
  const next = normalizeItem(
    {
      ...current,
      title: input.title != null ? text(input.title, 160) : current.title,
      summary: input.summary != null ? text(input.summary, 400) : current.summary,
      body: input.body != null ? text(input.body, 4000) : current.body,
      attribution: input.attribution != null ? text(input.attribution, 120) : current.attribution,
      image:
        input.image !== undefined
          ? normalizeImage(input.image)
          : input.imageSrc !== undefined || input.imageMediaId !== undefined
            ? cmsService.imageValueFromParts(input.imageSrc, input.imageAlt, input.imageMediaId)
            : current.image,
      visible: boolValue(input.visible, false),
      featured: boolValue(input.featured, false) === true,
      source: current.source,
      type: current.type,
      operational_key: current.operational_key,
      id: current.id,
    },
    sortKey(current.sort_order)
  );
  if (current.source === LIBRARY_SOURCES.WEBSITE && current.type === "faq" && (!next.title || !next.body)) {
    return { ok: false, code: RESULT.INVALID_INPUT, reason: "faq_required" };
  }
  const saved = await upsertStoredItem(db, input, next);
  if (!saved.ok) return saved;
  if (next.type === "faq" || next.type === "testimonial") {
    const synced = await syncHomeCollections(db, input, saved.instance.id, saved.items, [next.type]);
    if (!synced.ok) return synced;
  }
  if (next.type === "hours" && next.source === LIBRARY_SOURCES.WEBSITE) {
    await saveKey(db, { ...input, instanceId: saved.instance.id }, "location.hours", next.body);
  }
  return { ok: true, item: saved.item };
}

async function deleteLibraryBlocks(db, input, itemId, pageId) {
  const seeded = await cmsService.ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const matches = (seeded.blocks || []).filter((block) => {
    if (!block || block.type !== "library" || block.library_item_id !== itemId) return false;
    if (pageId && block.page_id !== pageId) return false;
    return true;
  });
  for (let i = 0; i < matches.length; i += 1) {
    const removed = await cmsService.deleteBlock(db, { ...input, blockId: matches[i].id });
    if (!removed.ok) return removed;
  }
  return { ok: true };
}

async function deleteLibraryItem(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const loaded = await getLibraryItem(db, input);
  if (!loaded.ok) return loaded;
  const item = loaded.item;
  const seeded = await cmsService.ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const stored = await loadStored(db, seeded.instance, seeded.organizationId);
  const items = stored.items.filter((entry) => entry.id !== item.id);
  const placements = stored.placements.filter((entry) => entry.item_id !== item.id);
  const saved = await persistLibrary(db, input, seeded.instance.id, items, placements);
  if (!saved.ok) return saved;
  if (item.type === "faq" || item.type === "testimonial") {
    const synced = await syncHomeCollections(db, input, seeded.instance.id, items, [item.type]);
    if (!synced.ok) return synced;
  }
  await deleteLibraryBlocks(db, input, item.id);
  return { ok: true, item };
}

async function placeLibraryItem(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const loaded = await getLibraryItem(db, input);
  if (!loaded.ok) return loaded;
  const page = (loaded.pages || []).find((entry) => entry && entry.id === String(input.pageId || ""));
  if (!page) return { ok: false, code: RESULT.NOT_FOUND, reason: "page_not_found" };
  let item = loaded.item;
  if (!item.stored) {
    const upserted = await upsertStoredItem(db, input, item);
    if (!upserted.ok) return upserted;
    item = upserted.item;
  }
  const seeded = await cmsService.ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const stored = await loadStored(db, seeded.instance, seeded.organizationId);
  if (stored.placements.some((entry) => entry.item_id === item.id && entry.page_id === page.id)) {
    return { ok: false, code: RESULT.ALREADY_EXISTS };
  }
  if (stored.placements.length >= MAX_PLACEMENTS) {
    return { ok: false, code: RESULT.INVALID_INPUT, reason: "too_many_placements" };
  }
  const placement = normalizePlacement(
    {
      item_id: item.id,
      page_id: page.id,
      section_id: text(input.sectionId, 40),
      sort_order: String(stored.placements.length),
    },
    stored.placements.length
  );
  const placements = stored.placements.concat([placement]);
  const saved = await persistLibrary(db, input, seeded.instance.id, stored.items, placements);
  if (!saved.ok) return saved;
  if (page.kind === PAGE_KIND.CUSTOM) {
    const added = await cmsService.addBlock(db, {
      ...input,
      pageId: page.id,
      type: "library",
      libraryItemId: item.id,
      heading: item.title,
      body: item.body || item.summary,
    });
    if (!added.ok) return added;
  }
  return { ok: true, placement, item };
}

async function removePlacement(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const loaded = await getLibraryItem(db, input);
  if (!loaded.ok) return loaded;
  const seeded = await cmsService.ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const stored = await loadStored(db, seeded.instance, seeded.organizationId);
  const current = stored.placements.find((entry) => entry.id === String(input.placementId || ""));
  if (!current || current.item_id !== loaded.item.id) return { ok: false, code: RESULT.NOT_FOUND };
  const placements = stored.placements.filter((entry) => entry.id !== current.id);
  const saved = await persistLibrary(db, input, seeded.instance.id, stored.items, placements);
  if (!saved.ok) return saved;
  await deleteLibraryBlocks(db, input, loaded.item.id, current.page_id);
  return { ok: true };
}

async function reorderLibraryItems(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const loaded = await loadLibrary(db, input);
  if (!loaded.ok) return loaded;
  const ids = Array.isArray(input.itemIds) ? input.itemIds.map(String) : [];
  const byId = new Map((loaded.items || []).map((item) => [item.id, item]));
  const next = [];
  ids.forEach((id, index) => {
    const item = byId.get(id);
    if (!item) return;
    next.push(normalizeItem({ ...item, sort_order: String(index) }, index));
    byId.delete(id);
  });
  byId.forEach((item) => {
    next.push(normalizeItem({ ...item, sort_order: String(next.length) }, next.length));
  });
  const seeded = await cmsService.ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const stored = await loadStored(db, seeded.instance, seeded.organizationId);
  const saved = await persistLibrary(db, input, seeded.instance.id, next, stored.placements);
  if (!saved.ok) return saved;
  return { ok: true, items: next };
}

module.exports = {
  RESULT,
  LIBRARY_TYPES,
  loadLibrary,
  getLibraryItem,
  createLibraryItem,
  updateLibraryItem,
  deleteLibraryItem,
  placeLibraryItem,
  removePlacement,
  reorderLibraryItems,
  applyLibraryPresentation,
  libraryItemIsHidden,
};
