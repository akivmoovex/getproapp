"use strict";

/**
 * Version-bound governance preview. Renders historical snapshots through the
 * existing product website templates. Never publishes, mutates drafts, or
 * opens a public route.
 */

const { PRODUCT_CODE } = require("./publicWebsiteUrl");
const {
  resolvePublishableClinicByKey,
} = require("../../activeclinic/services/activeClinicPublicVisibilityService");
const {
  resolveActiveClinicWebsite,
} = require("../../activeclinic/website/activeClinicWebsiteResolver");
const { renderPublicPage } = require("../../activeclinic/http/renderActiveClinicPublic");
const { buildClinicWebsiteNav } = require("../../activeclinic/website/activeClinicClinicWebsiteNav");
const { getWebsiteTemplate } = require("./templateRegistry");
const { presentValue } = require("./reviewDiff");
const { escapeHtml } = require("./safeValues");
const {
  extractCmsSnapshot,
  snapshotUsable,
} = require("../../blessboard/services/websitePublishedSnapshotRead");
const { getBlessBoardCatalogueContext } = require("../../blessboard/services/getBlessBoardCatalogueContext");
const { buildBlessBoardTenantContext } = require("../../blessboard/http/buildBlessBoardTenantContext");
const { loadTenantPublicPageModel, KIND } = require("../../blessboard/http/loadTenantPublicPageModel");
const { renderTenantPublicPage } = require("../../blessboard/http/renderTenantPublicPage");
const bbVersionRepo = require("../../blessboard/repositories/websitePublicationVersionRepository");

const PREVIEW_MODE = Object.freeze({
  FULL_HISTORICAL_WEBSITE_RENDER: "full_historical_website_render",
  COMPONENT_PREVIEW: "component_preview",
  STRUCTURED_SNAPSHOT: "structured_snapshot",
});

function snapshotValues(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return { values: {}, visibility: {} };
  if (snapshot.values && typeof snapshot.values === "object") {
    return {
      values: { ...snapshot.values },
      visibility:
        snapshot.visibility && typeof snapshot.visibility === "object" ? { ...snapshot.visibility } : {},
    };
  }
  return { values: { ...snapshot }, visibility: {} };
}

function bannerHtml(label) {
  const text = escapeHtml(label || "Governance preview — not a live publication");
  return `<div class="bb-pa-governance-preview-banner" data-governance-preview-banner="1" role="status">${text}</div>`;
}

async function renderActiveClinicHistorical(db, input) {
  const clinicResult = await resolvePublishableClinicByKey(db, {
    clinicKey: input.organizationKey,
    allowUnpublished: true,
  });
  if (!clinicResult.ok || !clinicResult.clinic) {
    return { ok: false, code: clinicResult.code || "clinic_not_found", mode: PREVIEW_MODE.STRUCTURED_SNAPSHOT };
  }
  const resolved = await resolveActiveClinicWebsite(db, {
    clinic: clinicResult.clinic,
    snapshot: input.snapshot,
  });
  if (!resolved.ok) {
    return { ok: false, code: resolved.code || "resolve_failed", mode: PREVIEW_MODE.STRUCTURED_SNAPSHOT };
  }
  const versionNumber = input.version && input.version.versionNumber ? input.version.versionNumber : "";
  const label =
    input.label ||
    `Governance preview of published version v${versionNumber} — not a live publication`;
  const html = renderPublicPage({
    pageId: "governance-version-preview",
    pageTitle: label,
    contentTemplate: "tenant/home",
    shellVariant: "tenant",
    robots: "noindex, nofollow",
    locals: {
      clinic: resolved.clinic,
      clinicWebsiteNav: buildClinicWebsiteNav(resolved.clinic, { env: process.env }),
      websiteCanEdit: false,
      websiteCanSubmit: false,
      websiteCanPublish: false,
      websiteCanRestore: false,
      websiteEdit: false,
      websiteVersionPreview: true,
      websitePreviewVersion: input.version || null,
      websitePreviewRestoreUrl: "",
      governancePreview: true,
      csrfToken: "",
    },
  });
  return {
    ok: true,
    mode: PREVIEW_MODE.FULL_HISTORICAL_WEBSITE_RENDER,
    html: `${bannerHtml(label)}${html}`,
    limitation: null,
  };
}

function snapshotFieldValues(snapshot) {
  const snap = snapshotValues(snapshot);
  return snap.values;
}

async function composeBlessBoardHistoricalBinding(db, input) {
  const snapshot = (input && input.snapshot) || {};
  const values = snapshotFieldValues(snapshot);
  const visibility =
    snapshot.visibility && typeof snapshot.visibility === "object"
      ? snapshot.visibility
      : snapshotValues(snapshot).visibility;
  let cms = extractCmsSnapshot(snapshot);
  if (!snapshotUsable(cms) && input.organizationId && input.churchId) {
    const branchId = input.branchId || null;
    const listed = await bbVersionRepo.listVersions(db, {
      organizationId: input.organizationId,
      branchId,
      limit: 80,
    });
    const wanted = input.version && Number(input.version.versionNumber);
    const match =
      (listed.items || []).find(
        (row) =>
          wanted &&
          Number(row.versionNumber) === wanted &&
          snapshotUsable(row.snapshot)
      ) ||
      (listed.items || []).find((row) => snapshotUsable(row.snapshot) && row.status === "published");
    if (match && match.snapshot) cms = match.snapshot;
  }
  return {
    cmsSnapshot: snapshotUsable(cms) ? cms : null,
    fieldValues: values,
    visibility,
  };
}

async function loadBlessBoardSelectedBranch(db, churchId, branchId) {
  if (!branchId) return null;
  const row = await db.query(
    `SELECT id, branch_key, display_name, branch_type, is_primary
       FROM blessboard.branches
      WHERE id = $1 AND church_id = $2 AND status = 'active'
      LIMIT 1`,
    [String(branchId), String(churchId)]
  );
  if (!row.rows[0]) return null;
  const branch = row.rows[0];
  return {
    id: String(branch.id),
    key: String(branch.branch_key || ""),
    displayName: String(branch.display_name || ""),
    branchType: String(branch.branch_type || ""),
    isPrimary: Boolean(branch.is_primary),
  };
}

async function renderBlessBoardHistorical(db, input) {
  const instance = input.instance;
  const organizationId = String((instance && instance.organizationId) || "");
  const catalogue = await getBlessBoardCatalogueContext(db, organizationId);
  if (!catalogue.ok || !catalogue.context) {
    return { ok: false, code: catalogue.status || "church_not_found", mode: PREVIEW_MODE.STRUCTURED_SNAPSHOT };
  }
  const tenant = buildBlessBoardTenantContext(catalogue.context);
  if (!tenant) {
    return { ok: false, code: "tenant_unresolved", mode: PREVIEW_MODE.STRUCTURED_SNAPSHOT };
  }
  const churchId = tenant.church.id;
  const scopeRef = instance.scopeRef || null;
  const selectedBranch = scopeRef
    ? await loadBlessBoardSelectedBranch(db, churchId, scopeRef)
    : null;
  if (scopeRef && !selectedBranch) {
    return { ok: false, code: "branch_not_found", mode: PREVIEW_MODE.STRUCTURED_SNAPSHOT };
  }
  const historicalBinding = await composeBlessBoardHistoricalBinding(db, {
    snapshot: input.snapshot,
    version: input.version,
    organizationId,
    churchId,
    branchId: scopeRef,
  });
  const model = await loadTenantPublicPageModel(db, {
    tenant,
    pageKey: "home",
    hostname: "",
    pathPrefix: `/c/${encodeURIComponent(input.organizationKey || "")}`,
    selectedBranch,
    routingMode: "path",
    preview: false,
    governancePreview: true,
    historicalBinding,
    allowChurchContentFallback: !selectedBranch,
  });
  if (!model || model.kind === KIND.UNAVAILABLE) {
    return { ok: false, code: (model && model.reason) || "unavailable", mode: PREVIEW_MODE.STRUCTURED_SNAPSHOT };
  }
  if (model.kind === KIND.SETUP) {
    return { ok: false, code: "website_unpublished", mode: PREVIEW_MODE.STRUCTURED_SNAPSHOT };
  }
  const versionNumber = input.version && input.version.versionNumber ? input.version.versionNumber : "";
  const label =
    input.label ||
    `Governance preview of published version v${versionNumber} — not a live publication`;
  const html = renderTenantPublicPage(model);
  return {
    ok: true,
    mode: PREVIEW_MODE.FULL_HISTORICAL_WEBSITE_RENDER,
    html: `${bannerHtml(label)}${html}`,
    limitation: historicalBinding.cmsSnapshot ? null : "HISTORICAL_CMS_SNAPSHOT_PARTIAL",
  };
}

function renderComponentPreview(input) {
  const instance = input.instance;
  const template = instance
    ? getWebsiteTemplate(instance.templateId, instance.templateVersion)
    : null;
  const snap = snapshotValues(input.snapshot);
  const keys = Object.keys(snap.values);
  const versionNumber = input.version && input.version.versionNumber ? input.version.versionNumber : "";
  const label =
    input.label ||
    `Governance preview of published version v${versionNumber} — not a live publication`;
  const groups = new Map();
  for (const key of keys) {
    const def = template && template.keys ? template.keys[key] : null;
    const group = (def && def.group) || String(key).split(".")[0] || "other";
    if (!groups.has(group)) groups.set(group, []);
    const type = (def && def.type) || "short_text";
    groups.get(group).push({
      key,
      label: (def && def.description) || key,
      presented: presentValue(snap.values[key], type),
      visibility: snap.visibility[key] || "visible",
    });
  }
  const sections = [...groups.entries()]
    .map(([group, fields]) => {
      const items = fields
        .map((field) => {
          let body = `<p>${escapeHtml(field.presented.text || field.presented.url || "—")}</p>`;
          if (field.presented.kind === "image" && field.presented.src) {
            body = `<img src="${escapeHtml(field.presented.src)}" alt="${escapeHtml(
              field.presented.alt || field.label
            )}" width="320"/>`;
          }
          return `<article data-preview-field="${escapeHtml(field.key)}"><h3>${escapeHtml(
            field.label
          )}</h3>${body}</article>`;
        })
        .join("");
      return `<section data-preview-group="${escapeHtml(group)}"><h2>${escapeHtml(group)}</h2>${items}</section>`;
    })
    .join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="robots" content="noindex,nofollow"/><title>${escapeHtml(
    label
  )}</title><style>
    body{font-family:system-ui,sans-serif;margin:0;background:#f8fafc;color:#0f172a}
    .bb-pa-governance-preview-banner{background:#1e1b4b;color:#fff;padding:.75rem 1rem;font-size:.9rem}
    main{padding:1rem;max-width:72rem;margin:0 auto}
    section{background:#fff;border:1px solid #e2e8f0;border-radius:.75rem;padding:1rem;margin:0 0 1rem}
    img{max-width:100%;height:auto;border-radius:.5rem}
  </style></head><body>${bannerHtml(label)}<main data-governance-component-preview="1">${
    sections || "<p>No stored field values in this snapshot.</p>"
  }</main></body></html>`;
  return {
    ok: true,
    mode: PREVIEW_MODE.COMPONENT_PREVIEW,
    html,
    limitation:
      instance && instance.productCode === PRODUCT_CODE.BLESSBOARD
        ? "PRODUCT_LIMITATION_VISUAL_HISTORY_RENDERING"
        : null,
  };
}

/**
 * Render a historical published version for platform governance review.
 * ActiveClinic uses the existing tenant/home template with version-bound snapshot.
 * BlessBoard uses the existing public tenant templates with a version-bound
 * content overlay. Never publishes, mutates drafts, or opens a public route.
 */
async function renderGovernanceVersionPreview(db, input) {
  const instance = input && input.instance;
  const snapshot = (input && input.snapshot) || {};
  if (!instance) {
    return { ok: false, code: "website_instance_not_found", mode: PREVIEW_MODE.STRUCTURED_SNAPSHOT };
  }
  if (instance.productCode === PRODUCT_CODE.ACTIVECLINIC) {
    try {
      const rendered = await renderActiveClinicHistorical(db, {
        organizationKey: input.organizationKey,
        snapshot,
        version: input.version,
        label: input.label,
      });
      if (rendered.ok) return rendered;
    } catch {
      /* fall through to component preview */
    }
  }
  if (instance.productCode === PRODUCT_CODE.BLESSBOARD) {
    try {
      const rendered = await renderBlessBoardHistorical(db, {
        organizationKey: input.organizationKey,
        instance,
        snapshot,
        version: input.version,
        label: input.label,
      });
      if (rendered.ok) return rendered;
    } catch {
      /* fall through to component preview */
    }
  }
  return renderComponentPreview({
    instance,
    snapshot,
    version: input.version,
    label: input.label,
  });
}

module.exports = {
  PREVIEW_MODE,
  renderGovernanceVersionPreview,
};
