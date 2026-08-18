"use strict";

/**
 * Unified Platform Admin website control-center data.
 * Reads existing ActiveClinic (shared engine) and BlessBoard (legacy CMS) records.
 */

const instanceRepo = require("./instanceRepository");
const contentService = require("./contentService");
const versionService = require("./versionService");
const { buildWebsiteReviewDiff, buildVersionDiff } = require("./reviewDiff");
const { getWebsiteTemplate } = require("./templateRegistry");
const bbVersionRepo = require("../../blessboard/repositories/websitePublicationVersionRepository");
const { compareVersions } = require("../../blessboard/services/websitePublicationVersionService");

function formatTs(value) {
  if (!value) return "";
  try {
    return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  } catch {
    return String(value).slice(0, 19);
  }
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
  for (const row of rows.rows) {
    const productCode = String(row.product_code || "");
    let published = false;
    let hasWebsite = Boolean(row.instance_id) || Boolean(row.church_id);
    let lastPublishedAt = null;
    let lastPublisher = null;
    let currentVersionNumber = null;
    let unpublishedCount = 0;
    let draftUpdatedAt = null;

    if (productCode === "activeclinic" && row.instance_id) {
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
      lastPublisher = live ? live.editorIdentityId : null;
      published = row.ac_website_published === true;
      if (instance) {
        const changes = await contentService.listUnpublishedChanges(
          db,
          instance,
          row.organization_id
        );
        unpublishedCount = changes.length;
      }
    } else if (productCode === "blessboard") {
      published = String(row.bb_website_status || "") === "published";
      hasWebsite = Boolean(row.church_id);
      if (row.organization_id) {
        const live = await bbVersionRepo.getCurrentPublishedVersion(db, row.organization_id, null);
        if (live) {
          currentVersionNumber = live.versionNumber;
          lastPublishedAt = live.publishedAt;
          lastPublisher = live.publishedByName || live.publishedBy;
        }
      }
    }

    const item = {
      organizationId: row.organization_id,
      organizationKey: row.organization_key,
      displayName: row.display_name,
      organizationStatus: row.organization_status,
      productCode,
      hasWebsite,
      published,
      unpublishedCount,
      currentVersionNumber,
      lastPublishedAt,
      lastPublishedLabel: formatTs(lastPublishedAt),
      lastPublisher,
      lifecycleStatus: row.lifecycle_status || row.bb_website_status || null,
      adapterMode: row.adapter_mode || (productCode === "blessboard" ? "legacy_cms" : null),
      slug: row.slug || row.organization_key,
      instanceId: row.instance_id,
      churchId: row.church_id,
      draftUpdatedAt,
    };

    if (q) {
      const hay = `${item.displayName} ${item.organizationKey} ${item.productCode}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    if (tab === "drafts" && item.unpublishedCount < 1 && item.published) continue;
    if (tab === "published" && !item.published) continue;
    if (tab === "history" && !item.currentVersionNumber) continue;
    websites.push(item);
  }

  return { websites, tab, q };
}

async function loadPlatformAdminWebsiteDetail(db, organizationKey) {
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
    products.rows.find((r) => r.application_code === "activeclinic")
      ? "activeclinic"
      : products.rows.find((r) => r.application_code === "blessboard")
        ? "blessboard"
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

  if (productCode === "activeclinic" && instance) {
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
  } else if (productCode === "blessboard") {
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
    if (liveVersion && versions.length > 1) {
      const previous = versions.find((v) => v.id !== liveVersion.id) || null;
      if (previous) {
        try {
          const compared = await compareVersions(db, {
            organizationId: organization.id,
            leftVersionId: previous.id,
            rightVersionId: liveVersion.id,
          });
          if (compared && compared.ok && compared.diff) {
            changeSummary = [
              {
                page: "Published history",
                items: [`Compared v${previous.versionNumber} → v${liveVersion.versionNumber}`],
              },
            ];
          }
        } catch {
          /* comparison optional */
        }
      }
    }
  }

  return {
    ok: true,
    organization,
    productCode,
    instance,
    churchId,
    websitePublished,
    liveVersion,
    versions,
    draftChanges,
    changeSummary,
    unpublishedCount: draftChanges.length,
  };
}

module.exports = {
  formatTs,
  summarizeAcChanges,
  listPlatformAdminWebsites,
  loadPlatformAdminWebsiteDetail,
  buildVersionDiff,
};
