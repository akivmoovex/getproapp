"use strict";

/**
 * Public website edit mode → Stage 2 settings deep links.
 * Discovery only — no duplicate storage. Scope comes from session-derived chrome, never client IDs.
 */

const {
  isTenantPublicPagePath,
  isTenantPublicBranchPagePath,
} = require("../http/tenantPublicPaths");
const { normalizeBranchKey } = require("./listBlessBoardBranches");

const MAX_RETURN_LEN = 500;

/**
 * Safe same-origin public return path for settings surfaces.
 * Allows optional ?website_edit=1 and branch mini paths. Rejects off-site / traversal.
 * @param {unknown} raw
 * @returns {{ ok: boolean, path: string|null }}
 */
function parseSafePublicWebsiteReturnTo(raw) {
  const value = String(raw == null ? "" : raw).trim();
  if (!value) return { ok: true, path: null };
  if (value.length > MAX_RETURN_LEN) return { ok: false, path: null };
  if (!value.startsWith("/") || value.startsWith("//")) return { ok: false, path: null };
  if (value.includes("://") || value.includes("\\") || value.includes("..")) {
    return { ok: false, path: null };
  }

  const qIndex = value.indexOf("?");
  const pathOnly = qIndex >= 0 ? value.slice(0, qIndex) : value;
  const query = qIndex >= 0 ? value.slice(qIndex + 1) : "";

  const publicOk = isTenantPublicPagePath(pathOnly) || isTenantPublicBranchPagePath(pathOnly);
  if (!publicOk) return { ok: false, path: null };

  if (query) {
    const params = new URLSearchParams(query);
    for (const key of params.keys()) {
      if (key !== "website_edit") return { ok: false, path: null };
    }
    const edit = params.get("website_edit");
    if (edit != null && edit !== "1") return { ok: false, path: null };
  }

  const normalizedPath =
    pathOnly.length > 1 && pathOnly.endsWith("/") ? pathOnly.slice(0, -1) : pathOnly || "/";
  const outParams = new URLSearchParams();
  if (query) {
    const params = new URLSearchParams(query);
    if (params.get("website_edit") === "1") outParams.set("website_edit", "1");
  }
  const qs = outParams.toString();
  return { ok: true, path: qs ? `${normalizedPath}?${qs}` : normalizedPath };
}

/**
 * @param {string} base
 * @param {Record<string, string|null|undefined>} query
 */
function withQuery(base, query) {
  const url = String(base || "/");
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (v == null || v === "") continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * @param {string} href
 * @param {string|null} returnTo
 */
function withReturnTo(href, returnTo) {
  if (!returnTo) return href;
  const raw = String(href || "");
  const hashIndex = raw.indexOf("#");
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  const qIndex = withoutHash.indexOf("?");
  const path = qIndex >= 0 ? withoutHash.slice(0, qIndex) : withoutHash;
  const query = qIndex >= 0 ? withoutHash.slice(qIndex + 1) : "";
  const params = new URLSearchParams(query);
  params.set("return_to", returnTo);
  const qs = params.toString();
  return `${path}?${qs}${hash}`;
}

/**
 * @param {{
 *   isHqEditor: boolean,
 *   isBranchEditor: boolean,
 *   pageKey: string,
 *   currentPath: string,
 *   websiteScopeType: 'church'|'branch'|string,
 *   publicBranchKey?: string|null,
 *   primaryBranchKey?: string|null,
 *   contentBasePath?: string|null,
 * }} input
 */
function buildWebsitePublicEditSettingsCatalog(input) {
  const isHq = Boolean(input && input.isHqEditor);
  const isBranch = Boolean(input && input.isBranchEditor) && !isHq;
  const pageKey = String((input && input.pageKey) || "home");
  const scopeType = String((input && input.websiteScopeType) || "church");
  const isBranchMini = scopeType === "branch";

  const returnParsed = parseSafePublicWebsiteReturnTo(
    withQuery(String((input && input.currentPath) || "/"), { website_edit: "1" })
  );
  const returnTo = returnParsed.ok ? returnParsed.path : null;

  const publicBranchKey = normalizeBranchKey(input && input.publicBranchKey);
  const primaryBranchKey = normalizeBranchKey(input && input.primaryBranchKey);
  const settingsBranchKey =
    isBranchMini && publicBranchKey ? publicBranchKey : primaryBranchKey || null;

  const contentBase =
    (input && input.contentBasePath) ||
    (isHq ? "/hq/content" : isBranch ? "/branch-admin/content" : "/hq/content");

  const branchSettingsBase =
    isHq && settingsBranchKey
      ? `/hq/website/branches/${encodeURIComponent(settingsBranchKey)}/settings`
      : null;
  const serviceTimesHref = isHq
    ? settingsBranchKey
      ? `/hq/website/branches/${encodeURIComponent(settingsBranchKey)}/service-times`
      : `${contentBase}/pages/home`
    : "/branch-admin/website/service-times";

  const identityHref = isHq
    ? isBranchMini && branchSettingsBase
      ? withQuery(branchSettingsBase, { section: "identity" }) + "#identity"
      : "/hq/settings#publicName"
    : "/branch-admin/settings#bb-ba-settings-profile";

  const contactHref = isHq
    ? isBranchMini && branchSettingsBase
      ? withQuery(branchSettingsBase, { section: "contact" }) + "#contact"
      : "/hq/settings#bb-hq-branch"
    : "/branch-admin/settings#bb-ba-settings-profile";

  const socialHref = isHq
    ? branchSettingsBase
      ? withQuery(branchSettingsBase, { section: "social" }) + "#social"
      : null
    : null;

  const seoHref = isHq
    ? branchSettingsBase
      ? withQuery(branchSettingsBase, { section: "seo" }) + "#seo"
      : null
    : null;

  const announcementHref = isHq
    ? isBranchMini && publicBranchKey
      ? `/hq/announcements/b/${encodeURIComponent(publicBranchKey)}`
      : "/hq/announcements"
    : "/branch-admin/announcements";

  const pageContentHref = `${contentBase}/pages/${encodeURIComponent(pageKey)}`;
  const navHref = contentBase;
  const visibilityHref = isHq ? "/hq/settings#websiteStatus" : null;
  const websiteManageHref = isHq ? "/hq/website" : "/branch-admin/content";

  /**
   * @param {object} item
   */
  function finalize(item) {
    const href = item.href ? withReturnTo(item.href, returnTo) : null;
    return {
      ...item,
      href,
      returnTo,
      available: Boolean(item.available && href),
    };
  }

  const scopeShared = !isBranchMini;
  const scopeBranch = isBranchMini;
  const scopeLabel = isBranchMini
    ? "This branch"
    : isHq
      ? "Church-wide / shared"
      : "Your branch";

  /** @type {object[]} */
  const items = [
    finalize({
      id: "page_content",
      category: "Page content",
      label: "Edit page content",
      href: pageContentHref,
      available: true,
      scope: scopeLabel,
      scopeKind: isBranchMini ? "branch" : "shared",
      canonical: "content_admin_pages",
    }),
    finalize({
      id: "identity",
      category: "Header and logo",
      label: "Edit identity",
      href: identityHref,
      available: true,
      scope: scopeShared ? "Shared church identity" : "Branch identity",
      scopeKind: scopeShared ? "shared" : "branch",
      canonical: isBranchMini ? "website_scope_identity" : "hq_or_branch_settings",
    }),
    finalize({
      id: "logo",
      category: "Header and logo",
      label: "Change logo",
      href: withQuery(String((input && input.currentPath) || "/"), { website_edit: "1" }),
      available: true,
      scope: "Shared church identity",
      scopeKind: "shared",
      canonical: "website_content_home_logo",
      reason:
        "Edit the church logo inline on the public website. Changes save to draft until you publish.",
    }),
    finalize({
      id: "header_cta",
      category: "Header and logo",
      label: "Edit header CTA",
      href:
        isHq && branchSettingsBase
          ? withQuery(branchSettingsBase, { section: "identity" }) + "#identity"
          : identityHref,
      available: Boolean(isHq ? branchSettingsBase || identityHref : identityHref),
      scope: isBranchMini ? "Branch identity CTAs" : "Shared / primary branch CTAs",
      scopeKind: isBranchMini ? "branch" : "shared",
      canonical: "website_scope_identity_cta",
      reason: isHq
        ? null
        : "Branch admins edit contact CTAs in branch settings; hero CTAs use HQ website settings.",
    }),
    finalize({
      id: "navigation",
      category: "Navigation",
      label: "Edit navigation",
      href: navHref,
      available: true,
      scope: scopeLabel,
      scopeKind: isBranchMini ? "branch" : "shared",
      canonical: "content_admin_pages",
      reason:
        "Public nav labels follow published website pages. Manage pages here — desktop and mobile share the same list.",
    }),
    finalize({
      id: "announcement",
      category: "Announcement",
      label: "Edit announcement",
      href: announcementHref,
      available: true,
      scope: isBranchMini ? "Branch announcements" : "Church announcements",
      scopeKind: isBranchMini ? "branch" : "shared",
      canonical: "announcements_admin",
      reason:
        "Member/portal announcements. The public mini-website does not render a dedicated announcement bar.",
    }),
    finalize({
      id: "contact",
      category: "Contact information",
      label: "Edit contact details",
      href: contactHref,
      available: true,
      scope: scopeLabel,
      scopeKind: isBranchMini ? "branch" : "shared",
      canonical: isBranchMini ? "website_scope_contact" : "hq_or_branch_settings",
    }),
    finalize({
      id: "service_times",
      category: "Service times",
      label: "Edit service times",
      href: serviceTimesHref,
      available: true,
      scope: scopeLabel,
      scopeKind: isBranchMini ? "branch" : "shared",
      canonical: "service_times_editor",
    }),
    finalize({
      id: "social",
      category: "Social links",
      label: "Edit social links",
      href: socialHref || (isBranch ? null : identityHref),
      available: Boolean(socialHref) || Boolean(isBranch),
      scope: isBranchMini ? "Branch social" : "Primary branch social (HQ)",
      scopeKind: isBranchMini ? "branch" : "shared",
      canonical: socialHref ? "website_scope_social" : "structured_social_draft",
      reason: socialHref
        ? null
        : isBranch
          ? "Use on-page social pencils (structured drafts). Scope social overrides are HQ-managed."
          : "Open branch website social settings for the primary branch.",
    }),
    finalize({
      id: "footer",
      category: "Footer",
      label: "Edit footer",
      href: contactHref,
      available: true,
      scope: scopeLabel,
      scopeKind: isBranchMini ? "branch" : "shared",
      canonical: "footer_settings_surfaces",
      reason: "Footer identity and contact reuse church/branch settings; tagline edits inline on the page.",
    }),
    finalize({
      id: "seo",
      category: "SEO",
      label: "Edit SEO",
      href: seoHref,
      available: Boolean(seoHref),
      scope: isBranchMini ? "This branch page SEO" : "Primary branch SEO overrides",
      scopeKind: isBranchMini ? "branch" : "shared",
      canonical: "website_scope_seo",
      reason: seoHref
        ? null
        : isBranch
          ? "SEO overrides are HQ-managed for this branch."
          : "SEO settings require a resolvable branch key.",
    }),
    finalize({
      id: "og_image",
      category: "SEO",
      label: "Edit Open Graph image",
      href: seoHref,
      available: Boolean(seoHref),
      scope: isBranchMini ? "This branch" : "Primary branch",
      scopeKind: isBranchMini ? "branch" : "shared",
      canonical: "website_scope_seo_og_image",
      reason: seoHref ? "Uses seo.og_image_url in branch website settings." : null,
    }),
    finalize({
      id: "page_visibility",
      category: "Page visibility",
      label: "Edit page visibility",
      href: visibilityHref || websiteManageHref,
      available: Boolean(visibilityHref || websiteManageHref),
      scope: isHq ? "Church website status" : "HQ-managed",
      scopeKind: isHq ? "shared" : "hq_managed",
      canonical: isHq ? "church_website_status" : "hq_managed",
      reason: isHq
        ? "Church-wide public visibility. Prefer Website publish for readiness-checked go-live."
        : "Website publish/unpublish is HQ-managed.",
    }),
  ];

  // Branch admin on another branch's public URL should not get HQ SEO — already handled by isBranch.
  if (isBranch && isBranchMini === false) {
    // Branch admin editing church-wide path is unusual; capability usually scopes to own branch.
  }

  const byId = Object.create(null);
  for (const item of items) byId[item.id] = item;

  const categories = [];
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.category)) continue;
    seen.add(item.category);
    categories.push({
      id: item.category.toLowerCase().replace(/\s+/g, "_"),
      title: item.category,
      items: items.filter((i) => i.category === item.category),
    });
  }

  return {
    returnTo,
    scopeType,
    scopeLabel,
    settingsBranchKey,
    isHqEditor: isHq,
    isBranchEditor: isBranch,
    pageKey,
    items,
    byId,
    categories,
    links: {
      identity: byId.identity,
      logo: byId.logo,
      headerCta: byId.header_cta,
      navigation: byId.navigation,
      announcement: byId.announcement,
      contact: byId.contact,
      serviceTimes: byId.service_times,
      social: byId.social,
      footer: byId.footer,
      seo: byId.seo,
      ogImage: byId.og_image,
      pageVisibility: byId.page_visibility,
      pageContent: byId.page_content,
    },
  };
}

module.exports = {
  parseSafePublicWebsiteReturnTo,
  buildWebsitePublicEditSettingsCatalog,
  withReturnTo,
};
