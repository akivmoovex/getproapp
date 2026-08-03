"use strict";

/**
 * Platform Admin public links catalogue: church-wide + branches + custom domains.
 * Builds absolute URLs with apex origin. WhatsApp share text helper included.
 * Does NOT network-check links during list.
 */

const {
  authorize,
} = require("../../blessboard/services/blessBoardRbacAuthorizationService");
const {
  publicChurchHomePath,
  publicChurchPagePath,
  publicBranchHomePath,
  publicBranchPagePath,
  PUBLIC_PAGE_KEYS,
} = require("../../blessboard/urls/churchUrlHelper");
const { getApexOrigin } = require("../../blessboard/http/tenantLoginHelpers");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

async function assertPlatformPermission(db, actorUserId, permissionKey) {
  const userId = String(actorUserId || "").trim();
  if (!UUID_RE.test(userId)) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "unauthenticated" };
  }
  const decision = await authorize(db, {
    actor: { userId },
    permission: permissionKey,
    tenantContext: {
      organizationId: null,
      churchId: null,
      primaryBranchId: null,
    },
    resourceContext: {
      organizationId: null,
      churchId: null,
      branchId: null,
    },
  });
  if (decision && decision.allowed === true) {
    return { ok: true };
  }
  const roles = await db.query(
    `SELECT 1
       FROM blessboard.user_roles
      WHERE user_id = $1
        AND role_key = 'platform_admin'
        AND status = 'active'
      LIMIT 1`,
    [userId]
  );
  if (roles.rows[0]) {
    return { ok: true };
  }
  return {
    ok: false,
    status: STATUS.FORBIDDEN,
    reason: (decision && decision.reasonCode) || "forbidden",
  };
}

function normalizeLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(n), 1), MAX_LIMIT);
}

function normalizePage(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.max(Math.floor(n), 1), 10000);
}

function buildWhatsAppShareText(name, url) {
  const text = `Visit the official website of ${name}:\n\n${url}`;
  return encodeURIComponent(text);
}

async function listPlatformPublicLinks(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.domains.view"
  );
  if (!gate.ok) {
    return { ok: false, status: gate.status, reason: gate.reason, links: [], total: 0 };
  }

  const filters = input.filters || {};
  const page = normalizePage(filters.page);
  const limit = normalizeLimit(filters.limit);
  const offset = (page - 1) * limit;

  try {
    const apexOrigin = getApexOrigin(input.env || process.env);

    const churchRes = await db.query(
      `SELECT
         o.id AS organization_id,
         o.organization_key,
         o.display_name AS organization_name,
         o.status AS organization_status,
         c.id AS church_id,
         c.church_key,
         c.display_name AS church_name,
         c.status AS church_status
         FROM platform.organizations o
         JOIN blessboard.churches c ON c.organization_id = o.id
        WHERE o.status = 'active'
        ORDER BY o.organization_key ASC, c.church_key ASC`
    );

    const branchRes = await db.query(
      `SELECT
         o.id AS organization_id,
         o.organization_key,
         o.display_name AS organization_name,
         o.status AS organization_status,
         c.id AS church_id,
         c.church_key,
         c.display_name AS church_name,
         b.id AS branch_id,
         b.branch_key,
         b.display_name AS branch_name,
         b.branch_type,
         b.is_primary,
         b.status AS branch_status
         FROM platform.organizations o
         JOIN blessboard.churches c ON c.organization_id = o.id
         JOIN blessboard.branches b ON b.church_id = c.id
        WHERE o.status = 'active'
        ORDER BY o.organization_key ASC,
                 CASE WHEN b.branch_type = 'hq' OR b.is_primary THEN 0 ELSE 1 END,
                 b.branch_key ASC`
    );

    const customDomainsRes = await db.query(
      `SELECT
         d.id AS domain_id,
         d.hostname,
         d.organization_id,
         d.status,
         d.verified_at,
         o.organization_key,
         o.display_name AS organization_name,
         c.church_key,
         c.display_name AS church_name
         FROM platform.domains d
         LEFT JOIN platform.organizations o ON o.id = d.organization_id
         LEFT JOIN blessboard.churches c ON c.organization_id = d.organization_id
        WHERE d.domain_type IN ('custom', 'custom_church_website')
        ORDER BY d.hostname ASC`
    );

    const links = [];

    function pushLink(entry) {
      links.push(entry);
    }

    for (const row of churchRes.rows) {
      const orgKey = row.organization_key;
      const homePath = publicChurchHomePath(orgKey);
      const canonicalPublicUrl = homePath ? `${apexOrigin}${homePath}` : null;
      const pageLinks = {};
      for (const pageKey of PUBLIC_PAGE_KEYS) {
        const path = publicChurchPagePath(orgKey, pageKey);
        pageLinks[pageKey] = path ? `${apexOrigin}${path}` : null;
      }
      pushLink({
        organizationId: String(row.organization_id),
        organizationKey: orgKey,
        organizationName: String(row.organization_name || ""),
        churchId: String(row.church_id),
        churchKey: row.church_key || null,
        churchName: row.church_name || null,
        branchId: null,
        branchKey: null,
        scopeName: row.church_name || "Church-wide",
        type: "Church-wide",
        activeStatus: String(row.church_status || row.organization_status || ""),
        publicationStatus: "Unknown",
        canonicalPublicUrl,
        customDomain: null,
        lastChecked: null,
        pageLinks,
        whatsappShareText: canonicalPublicUrl
          ? buildWhatsAppShareText(row.church_name || row.organization_name || orgKey, canonicalPublicUrl)
          : null,
      });
    }

    for (const row of branchRes.rows) {
      const orgKey = row.organization_key;
      const branchKey = row.branch_key;
      const isHq = String(row.branch_type || "") === "hq" || Boolean(row.is_primary);
      const homePath = publicBranchHomePath(orgKey, branchKey);
      const canonicalPublicUrl = homePath ? `${apexOrigin}${homePath}` : null;
      const pageLinks = {};
      for (const pageKey of PUBLIC_PAGE_KEYS) {
        const path = publicBranchPagePath(orgKey, branchKey, pageKey);
        pageLinks[pageKey] = path ? `${apexOrigin}${path}` : null;
      }
      pushLink({
        organizationId: String(row.organization_id),
        organizationKey: orgKey,
        organizationName: String(row.organization_name || ""),
        churchId: row.church_id ? String(row.church_id) : null,
        churchKey: row.church_key || null,
        churchName: row.church_name || null,
        branchId: row.branch_id ? String(row.branch_id) : null,
        branchKey,
        scopeName: `${row.branch_name || branchKey}${isHq ? " (HQ)" : ""}`,
        type: isHq ? "HQ" : "Branch",
        activeStatus: String(row.branch_status || row.organization_status || ""),
        publicationStatus: "Unknown",
        canonicalPublicUrl,
        customDomain: null,
        lastChecked: null,
        pageLinks,
        whatsappShareText: canonicalPublicUrl
          ? buildWhatsAppShareText(row.branch_name || branchKey, canonicalPublicUrl)
          : null,
      });
    }

    for (const row of customDomainsRes.rows) {
      const hostname = row.hostname;
      const customUrl = `https://${hostname}`;
      pushLink({
        organizationId: row.organization_id ? String(row.organization_id) : null,
        organizationKey: row.organization_key || null,
        organizationName: row.organization_name || null,
        churchId: null,
        churchKey: row.church_key || null,
        churchName: row.church_name || null,
        branchId: null,
        branchKey: null,
        scopeName: "Custom domain",
        type: "Custom domain",
        activeStatus: String(row.status || ""),
        publicationStatus: row.verified_at ? "Verified" : "Unverified",
        canonicalPublicUrl: customUrl,
        customDomain: hostname,
        lastChecked: row.verified_at || null,
        pageLinks: {},
        whatsappShareText: buildWhatsAppShareText(
          row.organization_name || hostname,
          customUrl
        ),
      });
    }

    // Apply filters
    let filtered = links;
    if (filters.organizationKey) {
      const key = String(filters.organizationKey).trim().toLowerCase();
      filtered = filtered.filter(
        (l) => l.organizationKey && l.organizationKey.toLowerCase() === key
      );
    }
    if (filters.type) {
      const t = String(filters.type).trim();
      filtered = filtered.filter((l) => l.type === t);
    }
    if (filters.status) {
      const s = String(filters.status).trim();
      filtered = filtered.filter((l) => l.activeStatus === s);
    }
    if (filters.publication) {
      const p = String(filters.publication).trim();
      filtered = filtered.filter((l) => l.publicationStatus === p);
    }

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      ok: true,
      status: STATUS.OK,
      links: paginated,
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "lookup",
      links: [],
      total: 0,
    };
  }
}

module.exports = {
  STATUS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  listPlatformPublicLinks,
  buildWhatsAppShareText,
};
