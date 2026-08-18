"use strict";

/**
 * Unified Platform Admin website control-center.
 * Shared instance/content/version/lifecycle services first; product overlays
 * (ActiveClinic HCO flag, BlessBoard church_settings + legacy CMS drafts)
 * remain only where the CMS differs.
 */

const instanceRepo = require("./instanceRepository");
const contentService = require("./contentService");
const versionService = require("./versionService");
const { buildWebsiteReviewDiff, buildVersionDiff } = require("./reviewDiff");
const { getWebsiteTemplate } = require("./templateRegistry");
const {
  PRODUCT_CODE,
  buildPublicOrganizationWebsitePath,
  buildPublicWebsitePreviewPath,
} = require("./publicWebsiteUrl");
const { LIFECYCLE_LABELS, LIFECYCLE_STATUS } = require("./lifecycleStatus");
const {
  takeWebsiteOffline,
  suspendWebsite,
  restoreWebsiteAvailability,
  applyLifecycle,
} = require("./lifecycleService");
const { restoreWebsiteVersionLive } = require("./publicationService");
const {
  getClinicWebsiteAvailability,
  setClinicWebsiteAvailability,
} = require("../../activeclinic/services/clinicWebsiteAvailabilityService");
const bbVersionRepo = require("../../blessboard/repositories/websitePublicationVersionRepository");
const fieldDraftRepo = require("../../blessboard/repositories/websiteInlineFieldDraftRepository");
const {
  countAllWebsiteDrafts,
  listStructuredDrafts,
} = require("../../blessboard/services/websiteStructuredDraftService");
const {
  restoreAndPublishCurrentVersion,
} = require("../../blessboard/services/websitePublicationVersionService");
const {
  unpublishChurchWebsite,
} = require("../../blessboard/services/churchWebsitePublishService");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatTs(value) {
  if (!value) return "";
  try {
    return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  } catch {
    return String(value).slice(0, 19);
  }
}

function productLabel(productCode) {
  if (productCode === PRODUCT_CODE.ACTIVECLINIC) return "ActiveClinic";
  if (productCode === PRODUCT_CODE.BLESSBOARD) return "BlessBoard";
  return productCode || "—";
}

function websiteStatusLabel(input) {
  if (input.lifecycleStatus && LIFECYCLE_LABELS[input.lifecycleStatus]) {
    if (input.lifecycleStatus === LIFECYCLE_STATUS.PUBLIC && input.published === false) {
      return "Not public";
    }
    return LIFECYCLE_LABELS[input.lifecycleStatus];
  }
  if (input.bbWebsiteStatus === "suspended") return "Website suspended";
  if (input.published) return "Website live";
  if (input.hasWebsite) return "Draft";
  return "Not provisioned";
}

function draftLabel(input) {
  if (input.unpublishedCount > 0) return "Unpublished changes";
  if (input.published) return "Current";
  if (input.hasWebsite) return "Draft only";
  return "Missing";
}

function buildActionUrls(organizationKey, productCode) {
  const key = String(organizationKey || "");
  const product = String(productCode || "");
  const open = `/admin/organizations/${encodeURIComponent(key)}/website`;
  return {
    viewLive: buildPublicOrganizationWebsitePath({
      product,
      organizationKey: key,
    }),
    previewDraft: buildPublicWebsitePreviewPath({
      product,
      organizationKey: key,
    }),
    changeSummary: `${open}#website-changes`,
    history: `${open}#website-history`,
    restore: open,
    unpublish: `${open}/unpublish`,
    suspend: `${open}/suspend`,
    resume: `${open}/restore-site`,
    open,
  };
}

function summarizeAcChanges(changes, template) {
  const diff = buildWebsiteReviewDiff({
    snapshot: { changes, changedKeys: (changes || []).map((c) => c.contentKey) },
    template,
    changedKeys: (changes || []).map((c) => c.contentKey),
  });
  const byPage = new Map();
  for (const item of diff.items || []) {
    const page = item.pageLabel || item.pageKey || "Other";
    if (!byPage.has(page)) byPage.set(page, []);
    const field = item.fieldLabel || item.contentKey;
    const verb =
      item.changeType === "added"
        ? "added"
        : item.changeType === "removed"
          ? "removed"
          : "changed";
    byPage.get(page).push(`${field} ${verb}`);
  }
  return [...byPage.entries()].map(([page, items]) => ({ page, items }));
}

function summarizeBlessBoardDrafts(fieldDrafts, structuredDrafts) {
  const byPage = new Map();
  function add(page, item) {
    const key = page || "Website";
    if (!byPage.has(key)) byPage.set(key, []);
    byPage.get(key).push(item);
  }
  for (const draft of fieldDrafts || []) {
    add(draft.pageKey || "home", `${draft.sectionKey || "section"}.${draft.fieldKey || "field"} changed`);
  }
  for (const draft of structuredDrafts || []) {
    add(draft.pageKey || "home", `${draft.draftKind || "item"} ${draft.op || "changed"}`);
  }
  return [...byPage.entries()].map(([page, items]) => ({ page, items }));
}

async function loadActorLabels(db, ids) {
  const labels = new Map();
  const unique = [...new Set((ids || []).map((id) => String(id || "")).filter((id) => UUID_RE.test(id)))];
  if (!unique.length) return labels;
  try {
    const identities = await db.query(
      `SELECT id, primary_email, email_normalized
         FROM platform.identities WHERE id = ANY($1::uuid[])`,
      [unique]
    );
    for (const row of identities.rows) {
      labels.set(String(row.id), String(row.primary_email || row.email_normalized || "Editor"));
    }
  } catch {
    /* identities table may be absent in older fixtures */
  }
  const missing = unique.filter((id) => !labels.has(id));
  if (!missing.length) return labels;
  try {
    const users = await db.query(
      `SELECT id, display_name, email_normalized
         FROM blessboard.users WHERE id = ANY($1::uuid[])`,
      [missing]
    );
    for (const row of users.rows) {
      labels.set(String(row.id), String(row.display_name || row.email_normalized || "Editor"));
    }
  } catch {
    /* users lookup optional */
  }
  return labels;
}

async function loadAcLastEditor(db, instanceId, organizationId) {
  const row = await db.query(
    `SELECT updated_by_identity_id, updated_at
       FROM platform.website_content
      WHERE instance_id = $1 AND organization_id = $2 AND updated_by_identity_id IS NOT NULL
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1`,
    [instanceId, organizationId]
  );
  if (!row.rows[0]) return { id: null, at: null };
  return { id: row.rows[0].updated_by_identity_id, at: row.rows[0].updated_at };
}

async function loadBbLastEditor(db, churchId) {
  if (!churchId) return { id: null, at: null };
  const field = await db.query(
    `SELECT editor_user_id, updated_at
       FROM blessboard.website_inline_field_drafts
      WHERE church_id = $1 AND status = 'draft' AND editor_user_id IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 1`,
    [churchId]
  );
  if (field.rows[0]) return { id: field.rows[0].editor_user_id, at: field.rows[0].updated_at };
  const structured = await db.query(
    `SELECT editor_user_id, updated_at
       FROM blessboard.website_structured_drafts
      WHERE church_id = $1 AND status = 'draft' AND editor_user_id IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 1`,
    [churchId]
  );
  if (!structured.rows[0]) return { id: null, at: null };
  return { id: structured.rows[0].editor_user_id, at: structured.rows[0].updated_at };
}

async function listPlatformAdminWebsites(db, filters) {
  const tab = String((filters && filters.tab) || "overview").toLowerCase();
  const q = String((filters && filters.q) || "").trim().toLowerCase();
  const rows = await db.query(
    `SELECT
        o.id AS organization_id,
        o.organization_key,
        o.display_name,
        o.status AS organization_status,
        p.product_key AS product_code,
        i.id AS instance_id,
        i.slug,
        i.lifecycle_status,
        i.publish_policy,
        i.adapter_mode,
        i.status AS instance_status,
        hco.website_published AS ac_website_published,
        cs.website_status AS bb_website_status,
        c.id AS church_id
       FROM platform.organizations o
       JOIN platform.organization_products op
         ON op.organization_id = o.id
        AND op.status = 'active'
       JOIN platform.products p
         ON p.id = op.product_id
       LEFT JOIN platform.website_instances i
         ON i.organization_id = o.id
        AND i.product_code = p.product_key
        AND i.status <> 'archived'
       LEFT JOIN activeclinic.healthcare_organizations hco
         ON hco.organization_id = o.id
        AND p.product_key = 'activeclinic'
       LEFT JOIN blessboard.churches c
         ON c.organization_id = o.id
        AND p.product_key = 'blessboard'
       LEFT JOIN blessboard.church_settings cs
         ON cs.church_id = c.id
      WHERE p.product_key IN ('activeclinic', 'blessboard')
      ORDER BY o.display_name ASC`
  );

  const websites = [];
  const actorIds = [];
  for (const row of rows.rows) {
    const productCode = String(row.product_code || "");
    let published = false;
    let hasWebsite = Boolean(row.instance_id) || Boolean(row.church_id);
    let lastPublishedAt = null;
    let lastPublisherId = null;
    let lastPublisher = null;
    let lastEditorId = null;
    let currentVersionNumber = null;
    let unpublishedCount = 0;
    let draftUpdatedAt = null;

    if (productCode === PRODUCT_CODE.ACTIVECLINIC && row.instance_id) {
      const instance = await instanceRepo.findWebsiteInstanceById(
        db,
        row.instance_id,
        row.organization_id
      );
      const versions = instance
        ? await versionService.listWebsiteVersions(db, {
            instanceId: instance.id,
            organizationId: row.organization_id,
          })
        : { versions: [] };
      const live = (versions.versions || []).find((v) => v.status === "published") || null;
      currentVersionNumber = live ? live.versionNumber : null;
      lastPublishedAt = live ? live.publishedAt : null;
      lastPublisherId = live ? live.editorIdentityId : null;
      published = row.ac_website_published === true;
      if (instance) {
        const changes = await contentService.listUnpublishedChanges(
          db,
          instance,
          row.organization_id
        );
        unpublishedCount = changes.length;
        const editor = await loadAcLastEditor(db, instance.id, row.organization_id);
        lastEditorId = editor.id || lastPublisherId;
        draftUpdatedAt = editor.at;
      }
    } else if (productCode === PRODUCT_CODE.BLESSBOARD) {
      published = String(row.bb_website_status || "") === "published";
      hasWebsite = Boolean(row.church_id) || Boolean(row.instance_id);
      if (row.organization_id) {
        const live = await bbVersionRepo.getCurrentPublishedVersion(db, row.organization_id, null);
        if (live) {
          currentVersionNumber = live.versionNumber;
          lastPublishedAt = live.publishedAt;
          lastPublisherId = live.publishedBy;
          lastPublisher = live.publishedByName || null;
        }
      }
      if (row.church_id) {
        unpublishedCount = await countAllWebsiteDrafts(db, { churchId: row.church_id });
        const editor = await loadBbLastEditor(db, row.church_id);
        lastEditorId = editor.id || lastPublisherId;
        draftUpdatedAt = editor.at;
      }
    }

    if (lastPublisherId) actorIds.push(lastPublisherId);
    if (lastEditorId) actorIds.push(lastEditorId);

    const actions = buildActionUrls(row.organization_key, productCode);
    const websiteStatus = websiteStatusLabel({
      lifecycleStatus: row.lifecycle_status,
      published,
      hasWebsite,
      bbWebsiteStatus: row.bb_website_status,
    });
    const item = {
      organizationId: row.organization_id,
      organizationKey: row.organization_key,
      displayName: row.display_name,
      organizationStatus: row.organization_status,
      productCode,
      productLabel: productLabel(productCode),
      hasWebsite,
      published,
      websiteStatus,
      publicPath: actions.viewLive,
      publicUrl: actions.viewLive,
      unpublishedCount,
      currentDraft: draftLabel({ unpublishedCount, published, hasWebsite }),
      currentVersionNumber,
      lastPublishedAt,
      lastPublishedLabel: formatTs(lastPublishedAt),
      lastPublisherId,
      lastPublisher: lastPublisher || lastPublisherId,
      lastEditorId,
      lastEditor: lastEditorId,
      lifecycleStatus: row.lifecycle_status || row.bb_website_status || null,
      adapterMode: row.adapter_mode || (productCode === PRODUCT_CODE.BLESSBOARD ? "legacy_cms" : null),
      slug: row.slug || row.organization_key,
      instanceId: row.instance_id,
      churchId: row.church_id,
      draftUpdatedAt,
      actions,
    };

    if (q) {
      const hay = `${item.displayName} ${item.organizationKey} ${item.productCode} ${item.productLabel}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    if (tab === "drafts" && item.unpublishedCount < 1 && item.published) continue;
    if (tab === "published" && !item.published) continue;
    if (tab === "history" && !item.currentVersionNumber) continue;
    websites.push(item);
  }

  const labels = await loadActorLabels(db, actorIds);
  for (const site of websites) {
    if (site.lastPublisherId) {
      site.lastPublisher = labels.get(String(site.lastPublisherId)) || site.lastPublisher || "—";
    } else {
      site.lastPublisher = site.lastPublisher || "—";
    }
    if (site.lastEditorId) {
      site.lastEditor = labels.get(String(site.lastEditorId)) || "Editor";
    } else {
      site.lastEditor = site.lastEditorId ? "Editor" : "—";
    }
  }

  return { websites, tab, q };
}

async function loadPlatformAdminWebsiteDetail(db, organizationKey, opts) {
  const org = await db.query(
    `SELECT id, organization_key, display_name, status
       FROM platform.organizations
      WHERE organization_key = $1
      LIMIT 1`,
    [String(organizationKey || "").toLowerCase()]
  );
  if (!org.rows[0]) return { ok: false, code: "not_found" };
  const organization = org.rows[0];
  const products = await db.query(
    `SELECT p.product_key AS application_code
       FROM platform.organization_products op
       JOIN platform.products p ON p.id = op.product_id
      WHERE op.organization_id = $1 AND op.status = 'active'`,
    [organization.id]
  );
  const productCode =
    products.rows.find((r) => r.application_code === PRODUCT_CODE.ACTIVECLINIC)
      ? PRODUCT_CODE.ACTIVECLINIC
      : products.rows.find((r) => r.application_code === PRODUCT_CODE.BLESSBOARD)
        ? PRODUCT_CODE.BLESSBOARD
        : String((products.rows[0] && products.rows[0].application_code) || "");

  const instances = await instanceRepo.listWebsiteInstancesForOrganization(
    db,
    organization.id,
    productCode || null
  );
  const instance = instances[0] || null;

  let liveVersion = null;
  let versions = [];
  let draftChanges = [];
  let changeSummary = [];
  let churchId = null;
  let websitePublished = false;
  let lastEditorId = null;
  let lastPublisherId = null;
  let lastPublisher = null;
  let clinicAvailability = null;

  if (productCode === PRODUCT_CODE.ACTIVECLINIC && instance) {
    const listed = await versionService.listWebsiteVersions(db, {
      instanceId: instance.id,
      organizationId: organization.id,
    });
    versions = listed.versions || [];
    liveVersion = versions.find((v) => v.status === "published") || null;
    draftChanges = await contentService.listUnpublishedChanges(db, instance, organization.id);
    const template = getWebsiteTemplate(instance.templateId, instance.templateVersion);
    changeSummary = summarizeAcChanges(draftChanges, template);
    const hco = await db.query(
      `SELECT website_published FROM activeclinic.healthcare_organizations
        WHERE organization_id = $1 LIMIT 1`,
      [organization.id]
    );
    websitePublished = Boolean(hco.rows[0] && hco.rows[0].website_published);
    lastPublisherId = liveVersion ? liveVersion.editorIdentityId : null;
    const editor = await loadAcLastEditor(db, instance.id, organization.id);
    lastEditorId = editor.id || lastPublisherId;
    clinicAvailability = await getClinicWebsiteAvailability(db, {
      organizationKey: organization.organization_key,
      env: opts && opts.env,
    });
  } else if (productCode === PRODUCT_CODE.BLESSBOARD) {
    const church = await db.query(
      `SELECT c.id, s.website_status
         FROM blessboard.churches c
         LEFT JOIN blessboard.church_settings s ON s.church_id = c.id
        WHERE c.organization_id = $1 LIMIT 1`,
      [organization.id]
    );
    churchId = church.rows[0] ? church.rows[0].id : null;
    websitePublished = String((church.rows[0] && church.rows[0].website_status) || "") === "published";
    const history = churchId
      ? await bbVersionRepo.listVersions(db, { organizationId: organization.id, limit: 40 })
      : { items: [] };
    versions = history.items || [];
    liveVersion = versions.find((v) => v.status === "published") || null;
    lastPublisherId = liveVersion ? liveVersion.publishedBy : null;
    lastPublisher = liveVersion ? liveVersion.publishedByName : null;
    if (churchId) {
      const fieldDrafts = await fieldDraftRepo.listDrafts(db, { churchId });
      const structuredDrafts = await listStructuredDrafts(db, { churchId });
      draftChanges = fieldDrafts.concat(structuredDrafts);
      changeSummary = summarizeBlessBoardDrafts(fieldDrafts, structuredDrafts);
      const editor = await loadBbLastEditor(db, churchId);
      lastEditorId = editor.id || lastPublisherId;
    }
  }

  const labels = await loadActorLabels(db, [
    lastEditorId,
    lastPublisherId,
    ...versions.map((v) => v.editorIdentityId || v.publishedBy || v.createdBy),
  ]);
  const decoratedVersions = versions.map((version) => {
    const actorId = version.editorIdentityId || version.publishedBy || version.createdBy;
    const keys = Array.isArray(version.changedKeys) ? version.changedKeys : [];
    return {
      ...version,
      editorLabel:
        version.publishedByName ||
        version.createdByName ||
        labels.get(String(actorId || "")) ||
        "Editor",
      publishedLabel: formatTs(version.publishedAt || version.createdAt),
      fieldCount: keys.length || version.changeCount || 0,
    };
  });

  const actions = buildActionUrls(organization.organization_key, productCode);
  const hasWebsite = Boolean(instance) || Boolean(churchId);
  const unpublishedCount = draftChanges.length;
  const websiteStatus = websiteStatusLabel({
    lifecycleStatus: instance && instance.lifecycleStatus,
    published: websitePublished,
    hasWebsite,
    bbWebsiteStatus: websitePublished ? "published" : churchId ? "draft" : null,
  });

  return {
    ok: true,
    organization,
    productCode,
    productLabel: productLabel(productCode),
    instance,
    churchId,
    websitePublished,
    websiteStatus,
    publicPath: actions.viewLive,
    publicUrl: actions.viewLive,
    liveVersion,
    versions: decoratedVersions,
    draftChanges,
    changeSummary,
    unpublishedCount,
    currentDraft: draftLabel({ unpublishedCount, published: websitePublished, hasWebsite }),
    lastEditor: lastEditorId ? labels.get(String(lastEditorId)) || "Editor" : "—",
    lastPublisher: lastPublisher || (lastPublisherId ? labels.get(String(lastPublisherId)) || "—" : "—"),
    actions,
    clinicAvailability: clinicAvailability && clinicAvailability.ok ? clinicAvailability : null,
    canResume:
      Boolean(
        instance &&
          (instance.lifecycleStatus === LIFECYCLE_STATUS.OFFLINE ||
            instance.lifecycleStatus === LIFECYCLE_STATUS.SUSPENDED)
      ),
  };
}

async function applyPlatformAdminWebsiteAction(db, input) {
  const organizationKey = String((input && input.organizationKey) || "").toLowerCase();
  const action = String((input && input.action) || "").trim();
  const loaded = await loadPlatformAdminWebsiteDetail(db, organizationKey, { env: input && input.env });
  if (!loaded.ok) return loaded;
  const { organization, productCode, instance, churchId } = loaded;
  const actorIdentityId = input.actorIdentityId || null;
  const reason = input.reason || null;
  const notePublic = input.notePublic || input.notes || null;

  if (action === "unpublish") {
    if (productCode === PRODUCT_CODE.ACTIVECLINIC) {
      return setClinicWebsiteAvailability(db, {
        organizationKey,
        public: false,
        actorIdentityId,
        reason,
        env: input.env,
      });
    }
    if (instance) {
      return applyLifecycle(db, {
        organizationId: organization.id,
        instanceId: instance.id,
        lifecycleStatus: LIFECYCLE_STATUS.PROVISIONAL,
        actorIdentityId,
        reason: reason || "Platform Admin unpublished website",
        notePublic: notePublic || "Website is not public.",
        notesTenantVisible: true,
        force: true,
        auditActionKey: "website.lifecycle.provisional",
        moderationActionKey: "website.lifecycle.provisional",
      });
    }
    if (churchId) {
      return unpublishChurchWebsite(db, {
        churchId,
        organizationId: organization.id,
        actorUserId: actorIdentityId,
        env: input.env,
      });
    }
    return { ok: false, code: "not_found" };
  }

  if (action === "publish" || action === "resume") {
    if (productCode === PRODUCT_CODE.ACTIVECLINIC) {
      if (action === "resume" && instance) {
        await restoreWebsiteAvailability(db, {
          organizationId: organization.id,
          instanceId: instance.id,
          actorIdentityId,
          reason,
          lifecycleStatus: LIFECYCLE_STATUS.PUBLIC,
        });
      }
      return setClinicWebsiteAvailability(db, {
        organizationKey,
        public: true,
        actorIdentityId,
        reason,
        overrideReadiness: input.overrideReadiness === true,
        env: input.env,
      });
    }
    if (instance) {
      return restoreWebsiteAvailability(db, {
        organizationId: organization.id,
        instanceId: instance.id,
        actorIdentityId,
        reason,
        lifecycleStatus: LIFECYCLE_STATUS.PUBLIC,
      });
    }
    return { ok: false, code: "not_found" };
  }

  if (action === "suspend") {
    if (!instance) return { ok: false, code: "not_found" };
    return suspendWebsite(db, {
      organizationId: organization.id,
      instanceId: instance.id,
      actorIdentityId,
      reason,
      notes: notePublic,
      notePublic,
      notesTenantVisible: true,
      editLocked: input.editLocked !== false,
      publishLocked: input.publishLocked !== false,
    });
  }

  if (action === "offline") {
    if (!instance) return { ok: false, code: "not_found" };
    return takeWebsiteOffline(db, {
      organizationId: organization.id,
      instanceId: instance.id,
      actorIdentityId,
      reason,
      notes: notePublic,
      notePublic,
      notesTenantVisible: true,
    });
  }

  if (action === "restore-version") {
    const versionId = String(input.versionId || "");
    if (instance && instance.adapterMode !== "legacy_cms") {
      return restoreWebsiteVersionLive(db, {
        organizationId: organization.id,
        instanceId: instance.id,
        versionId,
        actorIdentityId,
      });
    }
    if (!churchId) return { ok: false, code: "not_found" };
    return restoreAndPublishCurrentVersion(db, {
      organizationId: organization.id,
      churchId,
      versionId,
      actorUserId: actorIdentityId,
      restorationReason: "Platform Admin restored a previous published version.",
      env: input.env,
    });
  }

  return { ok: false, code: "invalid_input" };
}

module.exports = {
  formatTs,
  summarizeAcChanges,
  loadActorLabels,
  listPlatformAdminWebsites,
  loadPlatformAdminWebsiteDetail,
  applyPlatformAdminWebsiteAction,
  buildActionUrls,
  buildVersionDiff,
};
