"use strict";

/**
 * Shared website-editor operations — platform handlers invoked by product routes
 * after product adapters resolve auth/tenant/instance context.
 *
 * Product routes own URLs and chrome. These handlers own service invocation,
 * response shaping, and common validation/error mapping — not product forks.
 */

const { issueCsrfToken, setCsrfCookie, CSRF_FIELD } = require("../../http/v5Csrf");
const contentService = require("../contentService");
const {
  getFieldHistoryRestorePanel,
  getUnpublishedChangesPanel,
  restoreFieldRevisionToDraft,
} = require("../websiteChangeManagerService");
const {
  listAddableSections,
  addWebsiteSection,
} = require("../websiteAddSectionService");
const {
  loadStylesPresentation,
  loadSeoPresentation,
  renderStandaloneStylesPage,
  renderStandaloneSeoPage,
  saveStylesDraft,
  saveSeoDraft,
  noticeFromQuery,
  errorFromQuery,
} = require("../websiteSettingsHttp");
const {
  presentThemeState,
  saveThemeDraftHttp,
  loadThemeGalleryPresentation,
  renderStandaloneThemeGalleryPage,
} = require("../websiteThemeHttp");
const {
  pendingChangeCountFor,
  statusForDraftSaveFailure,
  statusForFieldRestoreFailure,
} = require("./websiteEditorHttpUtils");

async function handleSaveGenericDraft(session, body) {
  const saved = await contentService.saveWebsiteDraft(session.db, {
    organizationId: session.organizationId,
    instanceId: session.instanceId,
    expectedProductCode: session.productCode,
    contentKey: body && (body.contentKey || body.key),
    value: body && body.value,
    visibility: body && body.visibility,
    actorIdentityId: session.actorIdentityId,
    grantedPermissions: session.grantedPermissions,
    expectedUpdatedAt: body && body.expectedUpdatedAt,
    env: session.env,
  });
  if (!saved.ok) {
    return {
      ok: false,
      status: statusForDraftSaveFailure(saved.code),
      body: {
        ok: false,
        code: saved.code,
        reason: saved.reason || null,
      },
    };
  }
  let responseContent = saved.content;
  if (saved.content && saved.content.contentKey) {
    const fresh = await contentService.getWebsiteContentRow(
      session.db,
      session.instanceId,
      session.organizationId,
      saved.content.contentKey
    );
    if (fresh) responseContent = fresh;
  }
  const pendingChangeCount = await pendingChangeCountFor(
    session.db,
    session.organizationId,
    session.instanceId,
    session.grantedPermissions
  );
  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      published: false,
      code: "saved_to_draft",
      content: responseContent,
      version: null,
      pendingChangeCount,
    },
  };
}

async function handleGetFieldHistory(session, contentKey) {
  const loaded = await getFieldHistoryRestorePanel(session.db, {
    organizationId: session.organizationId,
    instanceId: session.instanceId,
    contentKey,
    grantedPermissions: session.grantedPermissions,
    expectedProductCode: session.productCode,
  });
  if (!loaded.ok) {
    return {
      ok: false,
      status: loaded.code === "forbidden" ? 403 : 404,
      body: { ok: false, code: loaded.code, panel: null },
    };
  }
  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      contentKey: loaded.contentKey,
      pendingChangeCount: loaded.pendingChangeCount,
      panel: loaded.panel,
    },
  };
}

async function handleRestoreFieldHistory(session, body) {
  const restored = await restoreFieldRevisionToDraft(session.db, {
    organizationId: session.organizationId,
    instanceId: session.instanceId,
    contentKey: body && (body.contentKey || body.key),
    choice: body && body.choice,
    versionId: body && body.versionId,
    expectedUpdatedAt: body && body.expectedUpdatedAt,
    actorIdentityId: session.actorIdentityId,
    grantedPermissions: session.grantedPermissions,
    expectedProductCode: session.productCode,
    env: session.env,
  });
  if (!restored.ok) {
    return {
      ok: false,
      status: statusForFieldRestoreFailure(restored.code),
      body: { ...restored, published: false },
    };
  }
  return { ok: true, status: 200, body: restored };
}

async function handleGetUnpublishedChangesPanel(session, input) {
  const loaded = await getUnpublishedChangesPanel(session.db, {
    organizationId: session.organizationId,
    instanceId: session.instanceId,
    grantedPermissions: session.grantedPermissions,
    canPublish: input && input.canPublish === true,
    previewHref: (input && input.previewHref) || null,
    publishPath: (input && (input.publishPath || input.publishAction)) || null,
    discardPath: (input && (input.discardPath || input.discardAction)) || null,
    pages: (input && input.pages) || [],
  });
  if (!loaded.ok) {
    return {
      ok: false,
      status: loaded.code === "forbidden" ? 403 : 404,
      body: {
        ok: false,
        code: loaded.code,
        pendingChangeCount: 0,
        changedKeys: [],
        panel: null,
      },
    };
  }
  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      pendingChangeCount: loaded.pendingChangeCount,
      changedKeys: loaded.changedKeys,
      panel: loaded.panel,
    },
  };
}

async function sendStylesEditorPage(input) {
  const csrfToken = issueCsrfToken(input.env);
  setCsrfCookie(input.res, csrfToken, {
    secure: String(input.env.NODE_ENV || "") === "production",
    env: input.env,
    req: input.req,
  });
  const presentation = await loadStylesPresentation(input.db, {
    organizationId: input.organizationId,
    productCode: input.productCode,
    siteLabel: input.siteLabel,
    backHref: input.backHref,
    saveAction: input.saveAction,
    mediaLibraryHref: input.mediaLibraryHref || null,
    csrfField: CSRF_FIELD,
    csrfToken,
    notice: noticeFromQuery(input.req.query),
    error: errorFromQuery(input.req.query),
  });
  return input.res.status(200).type("html").send(renderStandaloneStylesPage(presentation));
}

async function saveStylesEditorDraft(session, body) {
  return saveStylesDraft(session.db, {
    organizationId: session.organizationId,
    productCode: session.productCode,
    instance: session.instance,
    actorIdentityId: session.actorIdentityId,
    grantedPermissions: session.grantedPermissions,
    body,
    env: session.env,
  });
}

async function sendSeoEditorPage(input) {
  const csrfToken = issueCsrfToken(input.env);
  setCsrfCookie(input.res, csrfToken, {
    secure: String(input.env.NODE_ENV || "") === "production",
    env: input.env,
    req: input.req,
  });
  const presentation = await loadSeoPresentation(input.db, {
    organizationId: input.organizationId,
    productCode: input.productCode,
    siteLabel: input.siteLabel,
    backHref: input.backHref,
    saveAction: input.saveAction,
    instanceId: input.instanceId || null,
    csrfField: CSRF_FIELD,
    csrfToken,
    notice: noticeFromQuery(input.req.query),
    error: errorFromQuery(input.req.query),
  });
  return input.res.status(200).type("html").send(renderStandaloneSeoPage(presentation));
}

async function saveSeoEditorDraft(session, body) {
  return saveSeoDraft(session.db, {
    organizationId: session.organizationId,
    productCode: session.productCode,
    instance: session.instance,
    actorIdentityId: session.actorIdentityId,
    grantedPermissions: session.grantedPermissions,
    body,
    env: session.env,
  });
}

async function handleListAddableSectionTypes(session, pageKey) {
  const listed = await listAddableSections(session.db, {
    productCode: session.productCode,
    organizationId: session.organizationId,
    instanceId: session.instanceId,
    pageKey: pageKey || "home",
    grantedPermissions: session.grantedPermissions,
    churchId: session.churchId || null,
    branchId: session.branchId || null,
    clinicId: session.clinicId || null,
  });
  if (!listed.ok) {
    return {
      ok: false,
      status: listed.code === "forbidden" ? 403 : 400,
      body: listed,
    };
  }
  return { ok: true, status: 200, body: listed };
}

async function handleAddWebsiteSection(session, body) {
  const added = await addWebsiteSection(session.db, {
    productCode: session.productCode,
    organizationId: session.organizationId,
    instanceId: session.instanceId,
    pageKey: body && body.pageKey,
    type: body && (body.type || body.sectionType),
    heading: body && body.heading,
    bodyText: body && body.bodyText,
    mediaUrl: body && body.mediaUrl,
    image: body && body.image,
    editorUserId: session.actorIdentityId,
    actorRole: session.actorRole || null,
    grantedPermissions: session.grantedPermissions,
    churchId: session.churchId || null,
    branchId: session.branchId || null,
    clinicId: session.clinicId || null,
  });
  if (!added.ok) {
    return {
      ok: false,
      status: added.code === "forbidden" ? 403 : 400,
      body: added,
    };
  }
  return { ok: true, status: 200, body: added };
}

async function handleGetThemeState(session) {
  return presentThemeState(session.db, {
    organizationId: session.organizationId,
    productCode: session.productCode,
    instance: session.instance || null,
    preferDraft: true,
    grantedPermissions: session.grantedPermissions,
  });
}

async function handleSaveThemeDraft(session, body) {
  return saveThemeDraftHttp(session.db, {
    organizationId: session.organizationId,
    productCode: session.productCode,
    instance: session.instance,
    themeId: body && (body.themeId || body.theme_id || body.value),
    actorIdentityId: session.actorIdentityId,
    grantedPermissions: session.grantedPermissions,
    env: session.env,
  });
}

async function sendThemeGalleryPage(input) {
  const csrfToken = issueCsrfToken(input.env);
  setCsrfCookie(input.res, csrfToken, {
    secure: String(input.env.NODE_ENV || "") === "production",
    env: input.env,
    req: input.req,
  });
  const presentation = await loadThemeGalleryPresentation(input.db, {
    organizationId: input.organizationId,
    productCode: input.productCode,
    instance: input.instance,
    siteLabel: input.siteLabel,
    backHref: input.backHref,
    editHref: input.editHref || input.backHref,
    previewHrefBase: input.previewHrefBase || input.backHref,
    themeApiUrl: input.themeApiUrl,
    stylesHref: input.stylesHref || null,
    csrfField: CSRF_FIELD,
    csrfToken,
    notice: noticeFromQuery(input.req.query),
    error: errorFromQuery(input.req.query),
  });
  return input.res
    .status(200)
    .type("html")
    .send(renderStandaloneThemeGalleryPage(presentation));
}

module.exports = {
  handleSaveGenericDraft,
  handleGetFieldHistory,
  handleRestoreFieldHistory,
  handleGetUnpublishedChangesPanel,
  sendStylesEditorPage,
  saveStylesEditorDraft,
  sendSeoEditorPage,
  saveSeoEditorDraft,
  handleListAddableSectionTypes,
  handleAddWebsiteSection,
  handleGetThemeState,
  handleSaveThemeDraft,
  sendThemeGalleryPage,
  loadThemeGalleryPresentation,
  noticeFromQuery,
  errorFromQuery,
};
