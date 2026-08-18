"use strict";

/**
 * Read-only public website content service.
 * Returns published rows only; never creates or mutates content.
 */

const repo = require("../repositories/publicContentRepository");
const { KEY_RE } = require("./publicContentConstants");
const {
  loadCurrentPublishedSnapshot,
  overlayPublishedPage,
  overlayPublishedEntities,
} = require("./websitePublishedSnapshotRead");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
});

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {(client: object) => Promise<*>} fn
 */
async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
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

function normalizeScope(input) {
  const churchId = String((input && input.churchId) || "").trim();
  const pageKey = String((input && input.pageKey) || "")
    .trim()
    .toLowerCase();
  let branchId = null;
  if (input && input.branchId != null && String(input.branchId).trim()) {
    branchId = String(input.branchId).trim();
  }
  if (!churchId) return { ok: false, reason: "church_id" };
  if (!pageKey || !KEY_RE.test(pageKey)) return { ok: false, reason: "page_key" };
  return { ok: true, churchId, branchId, pageKey };
}

/**
 * Load a published page and its published sections (ordered).
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{ churchId: string, branchId?: string|null, pageKey: string }} input
 */
async function getPublishedPage(db, input) {
  const scope = normalizeScope(input);
  if (!scope.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, page: null, sections: [], reason: scope.reason };
  }
  try {
    return await withClient(db, async (client) => {
      const church = await repo.findChurchStatus(client, scope.churchId);
      if (!church || church.status !== "active") {
        return { ok: false, status: STATUS.NOT_FOUND, page: null, sections: [] };
      }
      if (scope.branchId) {
        const branch = await repo.findBranchScope(client, scope.branchId);
        if (!branch || branch.church_id !== scope.churchId || branch.status !== "active") {
          return { ok: false, status: STATUS.NOT_FOUND, page: null, sections: [] };
        }
      }
      const page = await repo.findPageByScope(client, scope);
      if (!page || page.status !== "published") {
        const snap = await loadCurrentPublishedSnapshot(client, scope.churchId, scope.branchId);
        if (snap && snap.snapshot) {
          const overlaid = overlayPublishedPage(null, [], snap.snapshot, scope.pageKey);
          if (overlaid.fromSnapshot && overlaid.page) {
            return { ok: true, status: STATUS.OK, page: overlaid.page, sections: overlaid.sections };
          }
        }
        return { ok: false, status: STATUS.NOT_FOUND, page: null, sections: [] };
      }
      const sections = await repo.listSectionsForPage(client, page.id, { status: "published" });
      const snap = await loadCurrentPublishedSnapshot(client, scope.churchId, scope.branchId);
      if (snap && snap.snapshot) {
        const overlaid = overlayPublishedPage(page, sections, snap.snapshot, scope.pageKey);
        if (overlaid.fromSnapshot) {
          return { ok: true, status: STATUS.OK, page: overlaid.page, sections: overlaid.sections };
        }
      }
      return { ok: true, status: STATUS.OK, page, sections };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, page: null, sections: [] };
  }
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{ churchId: string, branchId?: string|null }} input
 * @param {'leaders'|'ministries'|'events'|'sermons'|'contact_channels'|'giving_methods'} kind
 */
async function listPublishedContent(db, input, kind) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, items: [], reason: "church_id" };
  }
  let branchId;
  if (input && Object.prototype.hasOwnProperty.call(input, "branchId")) {
    branchId = input.branchId == null || input.branchId === "" ? null : String(input.branchId).trim();
  }
  const listFns = {
    leaders: repo.listLeaders,
    ministries: repo.listMinistries,
    events: repo.listEvents,
    sermons: repo.listSermons,
    contact_channels: repo.listContactChannels,
    giving_methods: repo.listGivingMethods,
  };
  const listFn = listFns[kind];
  if (!listFn) {
    return { ok: false, status: STATUS.INVALID_INPUT, items: [], reason: "kind" };
  }
  try {
    return await withClient(db, async (client) => {
      const church = await repo.findChurchStatus(client, churchId);
      if (!church || church.status !== "active") {
        return { ok: false, status: STATUS.NOT_FOUND, items: [] };
      }
      if (branchId) {
        const branch = await repo.findBranchScope(client, branchId);
        if (!branch || branch.church_id !== churchId || branch.status !== "active") {
          return { ok: false, status: STATUS.NOT_FOUND, items: [] };
        }
      }
      const items = await listFn(client, {
        churchId,
        branchId: branchId === undefined ? undefined : branchId,
        status: "published",
      });
      const snap = await loadCurrentPublishedSnapshot(
        client,
        churchId,
        branchId === undefined ? null : branchId
      );
      if (snap && snap.snapshot) {
        const overlaid = overlayPublishedEntities(kind, items, snap.snapshot);
        if (overlaid.fromSnapshot) {
          return { ok: true, status: STATUS.OK, items: overlaid.items };
        }
      }
      return { ok: true, status: STATUS.OK, items };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, items: [] };
  }
}

async function listPublishedLeaders(db, input) {
  return listPublishedContent(db, input, "leaders");
}
async function listPublishedMinistries(db, input) {
  return listPublishedContent(db, input, "ministries");
}
async function listPublishedEvents(db, input) {
  return listPublishedContent(db, input, "events");
}
async function listPublishedSermons(db, input) {
  return listPublishedContent(db, input, "sermons");
}
async function listPublishedContactChannels(db, input) {
  return listPublishedContent(db, input, "contact_channels");
}
async function listPublishedGivingMethods(db, input) {
  return listPublishedContent(db, input, "giving_methods");
}

module.exports = {
  STATUS,
  getPublishedPage,
  listPublishedLeaders,
  listPublishedMinistries,
  listPublishedEvents,
  listPublishedSermons,
  listPublishedContactChannels,
  listPublishedGivingMethods,
};
