"use strict";

/**
 * Canonical home-page service times (Prompt 50).
 * Storage: blessboard.page_sections with section_key/type = service_times.
 * Structured entries live in layout_metadata; body_text is the public plain-text mirror.
 */

const repo = require("../repositories/publicContentRepository");
const { PAGE_KEY_TITLES } = require("./publicContentConstants");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");

const SERVICE_TIMES_SECTION_KEY = "service_times";
const SERVICE_TIMES_SECTION_TYPE = "service_times";
const SERVICE_TIMES_SCHEMA = "service_times_v1";
const MAX_ENTRIES = 20;
const DAYS = Object.freeze([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
});

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function emptyLayoutMetadata() {
  return { schema: SERVICE_TIMES_SCHEMA, entries: [] };
}

function dayLabel(day) {
  const d = String(day || "");
  if (!d) return "";
  return d.charAt(0).toUpperCase() + d.slice(1);
}

function formatTimeLabel(hhmm) {
  const m = TIME_RE.exec(String(hhmm || ""));
  if (!m) return String(hhmm || "");
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${ampm}`;
}

function parseTimeToMinutes(hhmm) {
  const m = TIME_RE.exec(String(hhmm || ""));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function sanitizePlain(raw, max) {
  const value = String(raw == null ? "" : raw)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (value.length > max) return { ok: false, reason: "too_long" };
  return { ok: true, value };
}

/**
 * @param {unknown} rawEntries
 */
function validateServiceTimeEntries(rawEntries) {
  if (rawEntries == null) {
    return { ok: true, entries: [] };
  }
  if (!Array.isArray(rawEntries)) {
    return { ok: false, reason: "entries", message: "Service times must be a list." };
  }
  if (rawEntries.length > MAX_ENTRIES) {
    return {
      ok: false,
      reason: "entries_limit",
      message: `You can add up to ${MAX_ENTRIES} service times.`,
    };
  }

  const entries = [];
  const seen = new Set();
  for (let i = 0; i < rawEntries.length; i += 1) {
    const raw = rawEntries[i] && typeof rawEntries[i] === "object" ? rawEntries[i] : {};
    const nameResult = sanitizePlain(raw.name != null ? raw.name : raw.service_name, 120);
    if (!nameResult.ok || !nameResult.value) {
      return {
        ok: false,
        reason: "name",
        message: "Each service time needs a name.",
        index: i,
      };
    }
    const day = String(raw.day != null ? raw.day : raw.day_of_week || "")
      .trim()
      .toLowerCase();
    if (!DAYS.includes(day)) {
      return {
        ok: false,
        reason: "day",
        message: "Choose a valid day of the week.",
        index: i,
      };
    }
    const startTime = String(raw.startTime != null ? raw.startTime : raw.start_time || "").trim();
    if (!TIME_RE.test(startTime)) {
      return {
        ok: false,
        reason: "start_time",
        message: "Start time must use HH:MM (24-hour).",
        index: i,
      };
    }
    let endTime = String(raw.endTime != null ? raw.endTime : raw.end_time || "").trim();
    if (endTime === "") endTime = null;
    if (endTime && !TIME_RE.test(endTime)) {
      return {
        ok: false,
        reason: "end_time",
        message: "End time must use HH:MM (24-hour).",
        index: i,
      };
    }
    if (endTime) {
      const startM = parseTimeToMinutes(startTime);
      const endM = parseTimeToMinutes(endTime);
      if (startM != null && endM != null && endM <= startM) {
        return {
          ok: false,
          reason: "end_time_order",
          message: "End time must be later than start time.",
          index: i,
        };
      }
    }
    const locationResult = sanitizePlain(
      raw.location != null ? raw.location : raw.branch || "",
      120
    );
    if (!locationResult.ok) {
      return { ok: false, reason: "location", message: "Location is too long.", index: i };
    }
    const noteResult = sanitizePlain(raw.note != null ? raw.note : "", 240);
    if (!noteResult.ok) {
      return { ok: false, reason: "note", message: "Note is too long.", index: i };
    }
    const enabled =
      raw.enabled === false || raw.enabled === "0" || raw.enabled === "false" ? false : true;
    const sortOrder =
      raw.sortOrder != null && Number.isFinite(Number(raw.sortOrder))
        ? Math.max(0, Math.min(999, Number(raw.sortOrder)))
        : i;

    const dedupeKey = `${nameResult.value.toLowerCase()}|${day}|${startTime}|${endTime || ""}`;
    if (seen.has(dedupeKey)) {
      return {
        ok: false,
        reason: "duplicate",
        message: "Remove duplicate service times.",
        index: i,
      };
    }
    seen.add(dedupeKey);

    entries.push({
      name: nameResult.value,
      day,
      startTime,
      endTime,
      location: locationResult.value || null,
      note: noteResult.value || null,
      enabled,
      sortOrder,
    });
  }

  entries.sort((a, b) => a.sortOrder - b.sortOrder || a.day.localeCompare(b.day));
  return { ok: true, entries };
}

/**
 * Parse multipart-style form arrays: name[], day[], start_time[], …
 * @param {object} body
 */
function entriesFromFormBody(body) {
  const raw = body && typeof body === "object" ? body : {};
  if (Array.isArray(raw.entries)) return raw.entries;

  const names = [].concat(raw["name[]"] != null ? raw["name[]"] : raw.name || []);
  const days = [].concat(raw["day[]"] != null ? raw["day[]"] : raw.day || []);
  const starts = [].concat(
    raw["start_time[]"] != null ? raw["start_time[]"] : raw.start_time || []
  );
  const ends = [].concat(raw["end_time[]"] != null ? raw["end_time[]"] : raw.end_time || []);
  const locations = [].concat(
    raw["location[]"] != null ? raw["location[]"] : raw.location || []
  );
  const notes = [].concat(raw["note[]"] != null ? raw["note[]"] : raw.note || []);
  const enabledFlags = [].concat(
    raw["enabled[]"] != null ? raw["enabled[]"] : raw.enabled || []
  );
  const sortOrders = [].concat(
    raw["sort_order[]"] != null ? raw["sort_order[]"] : raw.sort_order || []
  );

  const len = Math.max(
    names.length,
    days.length,
    starts.length,
    ends.length,
    locations.length,
    notes.length
  );
  const entries = [];
  for (let i = 0; i < len; i += 1) {
    const name = String(names[i] != null ? names[i] : "").trim();
    const day = String(days[i] != null ? days[i] : "").trim();
    const startTime = String(starts[i] != null ? starts[i] : "").trim();
    if (!name && !day && !startTime) continue;
    const sortRaw = sortOrders[i];
    const sortOrder =
      sortRaw != null && String(sortRaw).trim() !== "" && Number.isFinite(Number(sortRaw))
        ? Number(sortRaw)
        : i;
    entries.push({
      name,
      day,
      startTime,
      endTime: String(ends[i] != null ? ends[i] : "").trim(),
      location: String(locations[i] != null ? locations[i] : "").trim(),
      note: String(notes[i] != null ? notes[i] : "").trim(),
      enabled:
        enabledFlags.length === 0
          ? true
          : String(enabledFlags[i] != null ? enabledFlags[i] : "1") !== "0",
      sortOrder,
    });
  }
  return entries;
}

function bodyTextFromEntries(entries) {
  const lines = (entries || [])
    .filter((e) => e && e.enabled !== false)
    .map((e) => {
      let line = `${dayLabel(e.day)} · ${e.name} · ${formatTimeLabel(e.startTime)}`;
      if (e.endTime) line += `–${formatTimeLabel(e.endTime)}`;
      if (e.location) line += ` · ${e.location}`;
      if (e.note) line += ` (${e.note})`;
      return line;
    });
  return lines.join("\n");
}

function entriesFromSection(section) {
  const meta =
    section && section.layoutMetadata && typeof section.layoutMetadata === "object"
      ? section.layoutMetadata
      : null;
  if (meta && meta.schema === SERVICE_TIMES_SCHEMA && Array.isArray(meta.entries)) {
    return meta.entries;
  }
  return [];
}

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

/**
 * Ensure church-wide home draft page + empty service_times section (idempotent).
 * Does not overwrite existing section content.
 * @param {{ query: Function }} client
 * @param {{ churchId: string, branchId?: string|null }} input
 */
async function ensureCanonicalServiceTimesSection(client, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) return { ok: false, status: STATUS.INVALID_INPUT, created: false };
  const branchId =
    input && input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;

  const pageResult = await repo.ensureDraftPage(client, {
    churchId,
    branchId,
    pageKey: "home",
    title: PAGE_KEY_TITLES.home || "Home",
  });
  const page = pageResult.page;
  if (!page) return { ok: false, status: STATUS.LOOKUP_ERROR, created: false, page: null };

  const existing = await repo.findSectionByPageAndKeyForProvision(
    client,
    page.id,
    SERVICE_TIMES_SECTION_KEY
  );
  if (existing) {
    return {
      ok: true,
      status: STATUS.OK,
      created: false,
      page,
      section: existing,
    };
  }

  const section = await repo.insertSection(client, {
    pageId: page.id,
    sectionKey: SERVICE_TIMES_SECTION_KEY,
    sectionType: SERVICE_TIMES_SECTION_TYPE,
    heading: null,
    bodyText: null,
    mediaUrl: null,
    sortOrder: 10,
    status: "draft",
    layoutMetadata: emptyLayoutMetadata(),
  });
  return {
    ok: true,
    status: STATUS.OK,
    created: true,
    page,
    section,
  };
}

/**
 * Save service times onto the canonical home section.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   churchId: string,
 *   branchId?: string|null,
 *   organizationId?: string|null,
 *   actorUserId?: string|null,
 *   entries?: unknown,
 *   formBody?: object,
 * }} input
 */
async function saveHomeServiceTimes(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "church_id" };
  }
  const branchId =
    input && input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;
  const rawEntries =
    input && input.entries != null
      ? input.entries
      : entriesFromFormBody(input && input.formBody);
  const validated = validateServiceTimeEntries(rawEntries);
  if (!validated.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      reason: validated.reason,
      message: validated.message,
      index: validated.index,
    };
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const ensured = await ensureCanonicalServiceTimesSection(client, {
          churchId,
          branchId,
        });
        if (!ensured.ok || !ensured.section) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "section_prepare_failed" };
        }

        const bodyText = bodyTextFromEntries(validated.entries);
        const heading = validated.entries.length ? "Service Times" : null;
        const layoutMetadata = {
          schema: SERVICE_TIMES_SCHEMA,
          entries: validated.entries,
        };

        const action = String((input && input.action) || "").trim();
        let nextStatus;
        if (action === "save_publish") {
          nextStatus = "published";
        } else if (action === "save_draft") {
          nextStatus = "draft";
        } else {
          // Legacy content-admin checkbox flow.
          nextStatus = ensured.section.status === "archived" ? "draft" : ensured.section.status;
          const publishRequested =
            input &&
            (input.confirmPublish === true ||
              input.confirmPublish === "1" ||
              input.confirmPublish === "on");
          if (validated.entries.length && publishRequested) {
            nextStatus = "published";
          }
        }

        const updated = await repo.updateSection(client, ensured.section.id, {
          heading,
          bodyText: bodyText || null,
          sectionType: SERVICE_TIMES_SECTION_TYPE,
          layoutMetadata,
          status: nextStatus,
        });
        if (!updated.section) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "section_update_failed" };
        }

        if (input.organizationId && input.actorUserId) {
          await recordBlessBoardAudit(client, {
            churchId,
            organizationId: input.organizationId,
            branchId,
            actorUserId: input.actorUserId,
            actionKey: "content.service_times_saved",
            entityType: "page_section",
            entityId: updated.section.id,
            outcome: "success",
            metadata: {
              status: "ok",
              entity_key: SERVICE_TIMES_SECTION_KEY,
              count: validated.entries.length,
              scope: branchId ? "branch" : "church",
              published: nextStatus === "published",
              source: branchId ? "branch_service_times" : "hq_content",
            },
          });
        }

        // Publishing service times must publish the scoped home page so public reads can see it.
        // Branch publish never touches church-wide (branch_id IS NULL) rows.
        if (nextStatus === "published" && ensured.page && ensured.page.id) {
          await client.query(
            `UPDATE blessboard.public_pages
                SET status = 'published',
                    published_at = COALESCE(published_at, now()),
                    updated_at = now()
              WHERE id = $1
                AND church_id = $2
                AND branch_id IS NOT DISTINCT FROM $3::uuid`,
            [ensured.page.id, churchId, branchId]
          );
        }

        await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          section: updated.section,
          page: ensured.page,
          createdSection: Boolean(ensured.created),
          entryCount: validated.entries.length,
          published: nextStatus === "published",
          branchId,
        };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup_error" };
  }
}

/**
 * Idempotent repair: ensure church-wide home page + empty service_times section.
 * Never overwrites existing section content.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{ churchId: string, organizationId?: string|null, actorUserId?: string|null }} input
 */
async function repairHomeContentFoundation(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "church_id" };
  }
  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const ensured = await ensureCanonicalServiceTimesSection(client, {
          churchId,
          branchId: null,
        });
        if (!ensured.ok) {
          await client.query("ROLLBACK");
          return { ok: false, status: ensured.status || STATUS.LOOKUP_ERROR, reason: "ensure_failed" };
        }
        if (ensured.created && input.organizationId && input.actorUserId) {
          await recordBlessBoardAudit(client, {
            churchId,
            organizationId: input.organizationId,
            branchId: null,
            actorUserId: input.actorUserId,
            actionKey: "content.service_times_repaired",
            entityType: "page_section",
            entityId: ensured.section && ensured.section.id,
            outcome: "success",
            metadata: {
              status: "ok",
              entity_key: SERVICE_TIMES_SECTION_KEY,
              created_section: true,
              source: "hq_content_repair",
            },
          });
        }
        await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          page: ensured.page,
          section: ensured.section,
          created: Boolean(ensured.created),
        };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup_error" };
  }
}

/**
 * Load service times for the editor (draft or published section).
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{ churchId: string, branchId?: string|null }} input
 */
async function loadAdminServiceTimes(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "church_id", entries: [], section: null, page: null };
  }
  const branchId =
    input && input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;
  try {
    return await withClient(db, async (client) => {
      const ensured = await ensureCanonicalServiceTimesSection(client, { churchId, branchId });
      if (!ensured.ok || !ensured.section) {
        return {
          ok: false,
          status: ensured.status || STATUS.LOOKUP_ERROR,
          reason: "section_prepare_failed",
          entries: [],
          section: null,
          page: null,
        };
      }
      return {
        ok: true,
        status: STATUS.OK,
        page: ensured.page,
        section: ensured.section,
        entries: entriesFromSection(ensured.section),
        created: Boolean(ensured.created),
        branchId,
      };
    });
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: "lookup_error",
      entries: [],
      section: null,
      page: null,
    };
  }
}

/**
 * Public service-times resolution for a branch mini website (or church-wide when branchId null).
 * Order: published branch section → (optional) published church-wide section → empty.
 * After branch website initialization, church-wide fallback must be disabled.
 * Never invents demo entries.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{ churchId: string, branchId?: string|null, allowChurchFallback?: boolean }} input
 */
async function resolvePublicServiceTimesEntries(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, entries: [], source: null };
  }
  const branchId =
    input && input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;
  const allowChurchFallback = !input || input.allowChurchFallback !== false;

  try {
    return await withClient(db, async (client) => {
      async function publishedEntriesForScope(scopeBranchId) {
        const page = await repo.findPageByScope(client, {
          churchId,
          branchId: scopeBranchId,
          pageKey: "home",
        });
        if (!page || page.status !== "published") {
          return [];
        }
        const sections = await repo.listSectionsForPage(client, page.id, { status: "published" });
        for (const section of sections || []) {
          if (String(section.sectionKey || "") !== SERVICE_TIMES_SECTION_KEY) continue;
          const entries = entriesFromSection(section)
            .filter((e) => e && e.enabled !== false && (e.name || e.startTime))
            .slice()
            .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
          return entries;
        }
        return [];
      }

      if (branchId) {
        const branchEntries = await publishedEntriesForScope(branchId);
        if (branchEntries.length) {
          return {
            ok: true,
            status: STATUS.OK,
            entries: branchEntries,
            source: "branch",
          };
        }
        if (!allowChurchFallback) {
          return { ok: true, status: STATUS.OK, entries: [], source: "branch" };
        }
      }

      const churchEntries = await publishedEntriesForScope(null);
      if (churchEntries.length) {
        return {
          ok: true,
          status: STATUS.OK,
          entries: churchEntries,
          source: "church",
        };
      }

      return { ok: true, status: STATUS.OK, entries: [], source: null };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, entries: [], source: null };
  }
}

module.exports = {
  STATUS,
  SERVICE_TIMES_SECTION_KEY,
  SERVICE_TIMES_SECTION_TYPE,
  SERVICE_TIMES_SCHEMA,
  MAX_ENTRIES,
  DAYS,
  emptyLayoutMetadata,
  validateServiceTimeEntries,
  entriesFromFormBody,
  bodyTextFromEntries,
  entriesFromSection,
  ensureCanonicalServiceTimesSection,
  saveHomeServiceTimes,
  repairHomeContentFoundation,
  loadAdminServiceTimes,
  resolvePublicServiceTimesEntries,
  dayLabel,
  formatTimeLabel,
};
