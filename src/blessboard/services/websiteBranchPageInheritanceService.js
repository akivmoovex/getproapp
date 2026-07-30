"use strict";

/**
 * Stage 5 — branch page inheritance (override / remove override).
 * Never deletes or mutates church-wide (branch_id IS NULL) rows.
 */

const repo = require("../repositories/publicContentRepository");
const { PAGE_KEY_TITLES, PUBLIC_PAGE_KEYS, KEY_RE } = require("./publicContentConstants");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
});

const INHERITANCE_MODE = Object.freeze({
  CHURCH: "church",
  INHERITED: "inherited",
  OVERRIDE: "override",
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

function normalizePageKey(raw) {
  const pageKey = String(raw || "")
    .trim()
    .toLowerCase();
  if (!pageKey || !KEY_RE.test(pageKey) || !PUBLIC_PAGE_KEYS.includes(pageKey)) {
    return null;
  }
  return pageKey;
}

/**
 * Active override = branch page exists, not archived, and is published or has sections.
 * Empty provisioned drafts count as inherited (church content still wins publicly).
 * @param {object|null} branchPage
 * @param {object[]} sections
 */
function classifyOverride(branchPage, sections) {
  if (!branchPage) return false;
  if (String(branchPage.status || "") === "archived") return false;
  if (String(branchPage.status || "") === "published") return true;
  const meta = branchPage.layoutMetadata;
  if (meta && typeof meta === "object" && meta.branchOverride === true) return true;
  const activeSections = (sections || []).filter(
    (s) => s && String(s.status || "") !== "archived"
  );
  if (activeSections.length > 0) return true;
  const defaultTitle = PAGE_KEY_TITLES[branchPage.pageKey] || branchPage.pageKey;
  if (String(branchPage.title || "").trim() !== String(defaultTitle).trim()) return true;
  return false;
}

/**
 * @param {{ query: Function }} client
 * @param {{ churchId: string, branchId: string, pageKey: string }} scope
 */
async function loadInheritanceOnClient(client, scope) {
  const churchPage = await repo.findPageByScope(client, {
    churchId: scope.churchId,
    branchId: null,
    pageKey: scope.pageKey,
  });
  const branchPage = await repo.findPageByScope(client, {
    churchId: scope.churchId,
    branchId: scope.branchId,
    pageKey: scope.pageKey,
  });
  let branchSections = [];
  if (branchPage && branchPage.id) {
    branchSections = await repo.listSectionsForPage(client, branchPage.id);
  }
  let churchSections = [];
  if (churchPage && churchPage.id) {
    churchSections = await repo.listSectionsForPage(client, churchPage.id, {
      status: "published",
    });
  }
  const isOverride = classifyOverride(branchPage, branchSections);
  return {
    mode: isOverride ? INHERITANCE_MODE.OVERRIDE : INHERITANCE_MODE.INHERITED,
    churchPage,
    churchSections,
    branchPage,
    branchSections,
    isOverride,
  };
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{ churchId: string, branchId?: string|null, pageKey: string }} input
 */
async function getBranchPageInheritanceState(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId =
    input && input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;
  const pageKey = normalizePageKey(input && input.pageKey);
  if (!churchId || !pageKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "invalid_input" };
  }
  if (!branchId) {
    return {
      ok: true,
      status: STATUS.OK,
      mode: INHERITANCE_MODE.CHURCH,
      isOverride: false,
      churchPage: null,
      churchSections: [],
      branchPage: null,
      branchSections: [],
    };
  }
  try {
    return await withClient(db, async (client) => {
      const state = await loadInheritanceOnClient(client, { churchId, branchId, pageKey });
      return { ok: true, status: STATUS.OK, pageKey, churchId, branchId, ...state };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup_error" };
  }
}

/**
 * Create or revive a branch page override (never touches church-wide).
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   organizationId?: string|null,
 *   churchId: string,
 *   branchId: string,
 *   pageKey: string,
 *   actorUserId?: string|null,
 * }} input
 */
async function createBranchPageOverride(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const pageKey = normalizePageKey(input && input.pageKey);
  if (!churchId || !branchId || !pageKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "invalid_input", page: null };
  }
  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const existing = await repo.findPageByScope(client, { churchId, branchId, pageKey });
        let page = existing;
        if (existing && String(existing.status) === "archived") {
          const updated = await repo.updatePage(client, existing.id, {
            status: "draft",
            title: existing.title || PAGE_KEY_TITLES[pageKey] || pageKey,
          });
          page = updated.page;
        } else if (!existing) {
          const ensured = await repo.ensureDraftPage(client, {
            churchId,
            branchId,
            pageKey,
            title: PAGE_KEY_TITLES[pageKey] || pageKey,
          });
          page = ensured.page;
        }

        if (!page) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "ensure_failed", page: null };
        }

        // Seed branch draft sections from published church-wide content when empty,
        // so the override is explicit without mutating church-wide rows.
        const branchSections = await repo.listSectionsForPage(client, page.id);
        const activeBranchSections = branchSections.filter(
          (s) => s && String(s.status || "") !== "archived"
        );
        if (activeBranchSections.length === 0) {
          const churchPage = await repo.findPageByScope(client, {
            churchId,
            branchId: null,
            pageKey,
          });
          if (churchPage && churchPage.id) {
            const churchSections = await repo.listSectionsForPage(client, churchPage.id, {
              status: "published",
            });
            for (const section of churchSections) {
              await repo.insertSection(client, {
                pageId: page.id,
                sectionKey: section.sectionKey,
                sectionType: section.sectionType,
                heading: section.heading,
                bodyText: section.bodyText,
                mediaUrl: section.mediaUrl,
                sortOrder: section.sortOrder,
                status: "draft",
                layoutMetadata: section.layoutMetadata || null,
              });
            }
          }
          // Mark empty override explicitly when church had no published sections.
          if (String(page.status) !== "published") {
            const stamped = await repo.updatePage(client, page.id, {
              status: "draft",
              layoutMetadata: {
                ...(page.layoutMetadata && typeof page.layoutMetadata === "object"
                  ? page.layoutMetadata
                  : {}),
                branchOverride: true,
              },
            });
            if (stamped.page) page = stamped.page;
          }
        }

        await recordBlessBoardAudit(client, {
          churchId,
          organizationId: input.organizationId || null,
          branchId,
          actorUserId: input.actorUserId || null,
          actionKey: "content.branch_page_override_created",
          entityType: "public_page",
          entityId: page.id,
          outcome: "success",
          metadata: {
            organization_id: input.organizationId || null,
            church_id: churchId,
            branch_id: branchId,
            page_key: pageKey,
            editor: input.actorUserId || null,
            status: page.status,
            timestamps: { updated_at: page.updatedAt || null },
          },
        });

        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, page };
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
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup_error", page: null };
  }
}

/**
 * Remove branch override by archiving the branch page + sections.
 * Church-wide rows are never modified.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   organizationId?: string|null,
 *   churchId: string,
 *   branchId: string,
 *   pageKey: string,
 *   actorUserId?: string|null,
 * }} input
 */
async function removeBranchPageOverride(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const pageKey = normalizePageKey(input && input.pageKey);
  if (!churchId || !branchId || !pageKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "invalid_input", page: null };
  }
  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const page = await repo.findPageByScope(client, { churchId, branchId, pageKey });
        if (!page) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found", page: null };
        }
        if (page.branchId == null || String(page.branchId) !== branchId) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.FORBIDDEN, reason: "church_wide_protected", page: null };
        }

        const sections = await repo.listSectionsForPage(client, page.id);
        for (const section of sections) {
          if (String(section.status) === "archived") continue;
          await repo.updateSection(client, section.id, { status: "archived" });
        }

        const updated = await repo.updatePage(client, page.id, { status: "archived" });
        if (!updated.page) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "archive_failed", page: null };
        }

        await recordBlessBoardAudit(client, {
          churchId,
          organizationId: input.organizationId || null,
          branchId,
          actorUserId: input.actorUserId || null,
          actionKey: "content.branch_page_override_removed",
          entityType: "public_page",
          entityId: page.id,
          outcome: "success",
          metadata: {
            organization_id: input.organizationId || null,
            church_id: churchId,
            branch_id: branchId,
            page_key: pageKey,
            editor: input.actorUserId || null,
            status: "archived",
            timestamps: {
              updated_at: updated.page.updatedAt || null,
            },
            church_wide_untouched: true,
          },
        });

        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, page: updated.page };
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
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup_error", page: null };
  }
}

/**
 * Publish a single branch-scoped page. Never updates other branches or church-wide pages.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   organizationId?: string|null,
 *   churchId: string,
 *   branchId: string,
 *   pageKey: string,
 *   actorUserId?: string|null,
 *   confirmPublish?: unknown,
 * }} input
 */
async function publishBranchScopedPage(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const pageKey = normalizePageKey(input && input.pageKey);
  const confirm =
    input &&
    (input.confirmPublish === true ||
      input.confirmPublish === "1" ||
      input.confirmPublish === "on" ||
      input.confirmPublish === "yes");
  if (!churchId || !branchId || !pageKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "invalid_input", page: null };
  }
  if (!confirm) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "confirm_publish", page: null };
  }
  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const page = await repo.findPageByScope(client, { churchId, branchId, pageKey });
        if (!page || page.branchId == null || String(page.branchId) !== branchId) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found", page: null };
        }
        const updated = await repo.updatePage(client, page.id, {
          status: "published",
          publishedAt: new Date(),
        });
        if (!updated.page) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "publish_failed", page: null };
        }

        const sections = await repo.listSectionsForPage(client, page.id);
        for (const section of sections) {
          if (String(section.status) === "draft") {
            await repo.updateSection(client, section.id, { status: "published" });
          }
        }

        await recordBlessBoardAudit(client, {
          churchId,
          organizationId: input.organizationId || null,
          branchId,
          actorUserId: input.actorUserId || null,
          actionKey: "content.branch_page_published",
          entityType: "public_page",
          entityId: page.id,
          outcome: "success",
          metadata: {
            organization_id: input.organizationId || null,
            church_id: churchId,
            branch_id: branchId,
            page_key: pageKey,
            editor: input.actorUserId || null,
            status: "published",
            timestamps: {
              published_at: updated.page.publishedAt || null,
              updated_at: updated.page.updatedAt || null,
            },
            scope: "branch",
          },
        });

        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, page: updated.page };
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
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup_error", page: null };
  }
}

module.exports = {
  STATUS,
  INHERITANCE_MODE,
  getBranchPageInheritanceState,
  createBranchPageOverride,
  removeBranchPageOverride,
  publishBranchScopedPage,
  classifyOverride,
};
