"use strict";

/**
 * Client-side BlessBoard registration slug preview.
 * Mirrors server rules in registrationSlugPreview.js / organizationKey.js / branchKey.js.
 */

(function (global) {
  var RESERVED_ORG = [
    "admin",
    "api",
    "account",
    "auth",
    "blessboard",
    "branch",
    "branches",
    "c",
    "church",
    "churches",
    "directory",
    "features",
    "for-churches",
    "getpro",
    "healthz",
    "hq",
    "login",
    "logout",
    "member",
    "org",
    "organization",
    "organizations",
    "platform",
    "portal",
    "pricing",
    "privacy",
    "register",
    "register-church",
    "static",
    "terms",
    "www",
  ];
  var RESERVED_BRANCH = [
    "about",
    "admin",
    "api",
    "branch",
    "branches",
    "contact",
    "create",
    "edit",
    "events",
    "giving",
    "hq",
    "leadership",
    "login",
    "logout",
    "me",
    "ministries",
    "new",
    "sermons",
    "settings",
    "www",
  ];

  function slugifyOrg(raw) {
    var s = String(raw || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 64);
    if (!s) return "";
    if (!/^[a-z]/.test(s)) s = ("c-" + s).slice(0, 64);
    return s;
  }

  function slugifyBranch(raw) {
    return String(raw || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\u2018\u2019\u201A\u2032`']/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 64);
  }

  function normalizeOrgKey(raw) {
    var key = slugifyOrg(raw);
    if (!key || !/^[a-z][a-z0-9_-]{0,63}$/.test(key)) return null;
    if (RESERVED_ORG.indexOf(key) !== -1) return null;
    return key;
  }

  function normalizeBranchKey(raw) {
    var key = slugifyBranch(raw);
    if (!key || !/^[a-z][a-z0-9_-]{0,63}$/.test(key)) return null;
    if (RESERVED_BRANCH.indexOf(key) !== -1) return null;
    return key;
  }

  function resolveBaseOrg(raw) {
    var slug = slugifyOrg(raw);
    if (!slug) return null;
    var direct = normalizeOrgKey(slug);
    if (direct) return direct;
    var alts = [slug + "-church", "org-" + slug, "c-" + slug];
    for (var i = 0; i < alts.length; i += 1) {
      var alt = normalizeOrgKey(alts[i]);
      if (alt) return alt;
    }
    return null;
  }

  function resolveBaseBranch(raw) {
    var slug = slugifyBranch(raw);
    if (!slug) return null;
    var direct = normalizeBranchKey(slug);
    if (direct) return direct;
    var alts = [slug + "-branch", "campus-" + slug, "b-" + slug];
    for (var j = 0; j < alts.length; j += 1) {
      var altB = normalizeBranchKey(alts[j]);
      if (altB) return altB;
    }
    return null;
  }

  function buildPreview(config) {
    config = config || {};
    var origin = String(config.origin || "").replace(/\/$/, "") || "https://blessboard.com";
    var orgKey = resolveBaseOrg(config.churchName) || "your-church";
    var branchKey = resolveBaseBranch(config.branchName) || "your-branch";
    var path = "/c/" + orgKey + "/" + branchKey;
    return {
      organizationKey: orgKey,
      branchKey: branchKey,
      publicPath: path,
      publicUrl: origin + path,
    };
  }

  function initBlessBoardRegistrationUrlPreview(config) {
    config = config || {};
    var churchInput =
      typeof config.churchInput === "string"
        ? document.querySelector(config.churchInput)
        : config.churchInput;
    var branchInput =
      typeof config.branchInput === "string"
        ? document.querySelector(config.branchInput)
        : config.branchInput;
    var previewEl =
      typeof config.previewEl === "string"
        ? document.querySelector(config.previewEl)
        : config.previewEl;
    var orgHidden =
      typeof config.orgHiddenInput === "string"
        ? document.querySelector(config.orgHiddenInput)
        : config.orgHiddenInput;
    var branchHidden =
      typeof config.branchHiddenInput === "string"
        ? document.querySelector(config.branchHiddenInput)
        : config.branchHiddenInput;
    if (!previewEl) return null;

    function sync() {
      var preview = buildPreview({
        origin: config.origin,
        churchName: churchInput ? churchInput.value : "",
        branchName: branchInput ? branchInput.value : "",
      });
      previewEl.textContent = preview.publicUrl.replace(/^https?:\/\//, "");
      if (orgHidden) orgHidden.value = preview.organizationKey === "your-church" ? "" : preview.organizationKey;
      if (branchHidden) branchHidden.value = preview.branchKey === "your-branch" ? "" : preview.branchKey;
    }

    if (churchInput) churchInput.addEventListener("input", sync);
    if (branchInput) branchInput.addEventListener("input", sync);
    sync();
    return { refresh: sync, buildPreview: buildPreview };
  }

  global.GpRegistrationSlugPreview = {
    buildPreview: buildPreview,
    initBlessBoardRegistrationUrlPreview: initBlessBoardRegistrationUrlPreview,
    resolveBaseOrganizationKey: resolveBaseOrg,
    resolveBaseBranchKey: resolveBaseBranch,
  };
})(typeof window !== "undefined" ? window : globalThis);
