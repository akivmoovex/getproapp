"use strict";

/**
 * V2.04 correction gate — token resolution hygiene for completed Batch 1–5 surfaces.
 * Detects undefined color token refs, circular chains, and product-domain leakage.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const COMPLETED_SCOPE = [
  "public/platform/gp-ops-shared.css",
  "public/platform/gp-auth-reg.css",
  "public/platform/forms-builder.css",
  "public/platform/announcements.css",
  "public/platform/phone-field.css",
  "public/platform/location-autocomplete.css",
  "public/platform/release-notes-center.css",
  "public/m3-modal.css",
  "public/design-system.css",
  "public/platform/registration-ux.css",
  "public/blessboard/v5/apex-auth.css",
  "public/blessboard/v5/tenant-auth.css",
  "public/activeclinic/ac-auth.css",
  "public/activeclinic/ac-app.css",
  "public/activeclinic/ac-urp.css",
  "public/activeclinic/website-cms.css",
  "public/blessboard/v5/platform-admin.css",
  "public/blessboard/v5/hq-admin.css",
  "public/blessboard/v5/branch-admin.css",
  "public/blessboard/v5/member-portal.css",
  "public/blessboard/v5/media-picker.css",
  "public/blessboard/v5/bb-urp.css",
  "public/church/church.css",
  // Batch 5 — website editor chrome
  "public/platform/website-inline-edit.css",
  "public/platform/website-change-manager-ui.css",
  "public/platform/website-theme-gallery.css",
  "public/platform/website-history.css",
  "public/platform/website-scope-list.css",
  "public/platform/website-media-field.css",
  "public/platform/website-styles.css",
  "public/platform/website-add-section.css",
  "public/platform/website-version-preview.css",
];

const TOKEN_DEFINITION_FILES = [
  "src/platform/ui/theme/colors.css",
  "public/platform/theme/colors.css",
  "public/blessboard/v5/design-tokens.css",
  "public/activeclinic/ac-app-tokens.css",
  "public/activeclinic/ac-tokens.css",
  ...COMPLETED_SCOPE,
];

/** Non-color / layout / motion custom properties (not required in color foundation). */
const NON_COLOR_PREFIXES = [
  "space-",
  "spacing-",
  "radius-",
  "border-radius",
  "border-width",
  "elevation-",
  "shadow-",
  "font-",
  "type-",
  "typo-",
  "size-",
  "width-",
  "height-",
  "z-",
  "duration-",
  "ease-",
  "motion-",
  "opacity-",
  "gap-",
  "pad-",
  "margin-",
  "line-height",
  "letter-",
  "admin-modal-",
  "gp-ds-",
  "focus-ring-width",
  "focus-ring-offset",
  "m3-modal-",
  "modal-z-",
  "modal-header-",
  "modal-close-",
  "bb-space-",
  "bb-text-",
  "bb-font-",
  "bb-radius-",
  "bb-max",
  "bb-gutter",
  "bb-section",
  "bb-header",
  "bb-sidebar",
  "bb-shell",
  "bb-drawer",
  "bb-control",
  "bb-icon",
  "bb-touch",
  "bb-z-",
  "bb-bp-",
  "bb-leading",
  "ac-radius",
  "ac-shadow",
  "ac-staff",
  "ac-touch",
  "ac-sidebar",
  "ac-content",
  "ac-font",
  "text-xs",
  "text-sm",
  "text-md",
  "text-lg",
  "text-xl",
  "gp-website-touch",
  "gp-website-chrome",
  "gp-keyboard",
  "gp-we-toolbar-h",
  "gp-we-rail-w",
  "gp-we-z-",
];

/** Intentionally optional / runtime-set (theme cards, tenant overrides). */
const INTENTIONALLY_OPTIONAL = new Set([
  "theme-swatch-primary",
  "theme-swatch-accent",
]);

const AC_DOMAIN = new Set([
  "status-appointment-requested",
  "status-appointment-waiting",
  "status-encounter-with-practitioner",
  "ac-website-preview-primary",
  "ac-website-preview-accent",
]);

const BB_DOMAIN = new Set([
  "status-published-bg",
  "status-published-text",
  "status-published-border",
  "status-draft-bg",
  "status-draft-text",
  "status-draft-border",
  "status-inactive-bg",
  "status-inactive-text",
  "status-inactive-border",
]);

const VAR_USE = /var\(--([a-zA-Z0-9-]+)/g;
const VAR_DEF = /^\s*--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/gm;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function collectDefs(files) {
  const defs = new Map();
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const text = read(rel);
    let m;
    const re = new RegExp(VAR_DEF.source, "gm");
    while ((m = re.exec(text))) {
      if (!defs.has(m[1])) defs.set(m[1], m[2].trim());
    }
  }
  return defs;
}

function isLikelyColorToken(name) {
  if (INTENTIONALLY_OPTIONAL.has(name)) return false;
  if (NON_COLOR_PREFIXES.some((p) => name === p || name.startsWith(p))) return false;
  if (/^(space|radius|shadow|font|type|typo|z-|duration|ease|motion|opacity|gap|size|width|height)/.test(name)) {
    return false;
  }
  return (
    /^(color-|palette-|status-|brand-|btn-|button-|flash-|wf-|badge-|nav-|modal-|input-|card-|table-|product-|gp-ops-|gp-we-|gp-cm-|editor-|ac-|bb-|church-|urp-|surface|muted|primary-)/.test(
      name
    ) ||
    /(color|bg|background|border|fill|stroke|text|surface|ink|accent|primary|danger|warning|success|info|focus|scrim|overlay|tint|status|palette|brand|canvas|outline|link|alert|badge)/i.test(
      name
    )
  );
}

function resolveDepth(name, defs, seen = new Set()) {
  if (seen.has(name)) return { kind: "CIRCULAR", path: [...seen, name] };
  const next = new Set(seen);
  next.add(name);
  const val = defs.get(name);
  if (!val) return { kind: "UNDEF", depth: 0 };
  const refs = [...val.matchAll(VAR_USE)].map((m) => m[1]);
  if (!refs.length) return { kind: "OK", depth: 1 };
  let max = 0;
  for (const r of refs) {
    const child = resolveDepth(r, defs, next);
    if (child.kind === "CIRCULAR") return child;
    max = Math.max(max, child.depth || 0);
  }
  return { kind: "OK", depth: 1 + max };
}

function usesInFile(rel) {
  const text = read(rel);
  const used = new Set();
  let m;
  const re = new RegExp(VAR_USE.source, "g");
  while ((m = re.exec(text))) used.add(m[1]);
  return used;
}

describe("V2_04 color token resolution (correction gate)", () => {
  const defs = collectDefs(TOKEN_DEFINITION_FILES);

  it("completed Batch 1–4 CSS has no undefined color token references", () => {
    const missing = [];
    for (const rel of COMPLETED_SCOPE) {
      for (const tok of usesInFile(rel)) {
        if (!isLikelyColorToken(tok)) continue;
        if (!defs.has(tok)) missing.push(`${rel}: --${tok}`);
      }
    }
    assert.deepEqual(missing, [], `Undefined color tokens:\n${missing.join("\n")}`);
  });

  it("token definition graph has no circular color references", () => {
    const circular = [];
    for (const name of defs.keys()) {
      if (!isLikelyColorToken(name) && !name.startsWith("bb-shadow-")) continue;
      const r = resolveDepth(name, defs);
      if (r.kind === "CIRCULAR") circular.push(r.path.join(" → "));
    }
    assert.deepEqual(circular, []);
  });

  it("alias chains stay within preferred depth (component → semantic → primitive)", () => {
    const deep = [];
    for (const name of defs.keys()) {
      const r = resolveDepth(name, defs);
      if (r.kind === "OK" && r.depth >= 5) deep.push(`${name} depth=${r.depth}`);
    }
    assert.deepEqual(deep, [], `Excessive alias chains:\n${deep.join("\n")}`);
  });

  it("does not leak AC domain tokens into BlessBoard/church CSS consumers", () => {
    const leaks = [];
    for (const rel of COMPLETED_SCOPE) {
      if (!rel.includes("blessboard") && !rel.includes("church")) continue;
      const text = read(rel);
      for (const tok of AC_DOMAIN) {
        const use = new RegExp(`var\\(--${tok}\\b`);
        const def = new RegExp(`^\\s*--${tok}\\s*:`, "m");
        if (use.test(text) && !def.test(text)) leaks.push(`${rel}: --${tok}`);
      }
    }
    assert.deepEqual(leaks, []);
  });

  it("does not leak BB domain tokens into ActiveClinic CSS consumers", () => {
    const leaks = [];
    for (const rel of COMPLETED_SCOPE) {
      if (!rel.includes("activeclinic")) continue;
      const text = read(rel);
      for (const tok of BB_DOMAIN) {
        const use = new RegExp(`var\\(--${tok}\\b`);
        const def = new RegExp(`^\\s*--${tok}\\s*:`, "m");
        if (use.test(text) && !def.test(text)) leaks.push(`${rel}: --${tok}`);
      }
    }
    assert.deepEqual(leaks, []);
  });

  it("shared platform components do not consume product-domain status tokens", () => {
    const shared = COMPLETED_SCOPE.filter(
      (r) => r.startsWith("public/platform/") || r === "public/m3-modal.css" || r === "public/design-system.css"
    );
    const domain = new Set([...AC_DOMAIN, ...BB_DOMAIN]);
    const leaks = [];
    for (const rel of shared) {
      const text = read(rel);
      for (const tok of domain) {
        if (new RegExp(`var\\(--${tok}\\b`).test(text)) leaks.push(`${rel}: --${tok}`);
      }
    }
    assert.deepEqual(leaks, []);
  });

  it("maps design-system / m3-modal to V2.04 button and border semantics", () => {
    const ds = read("public/design-system.css");
    assert.match(ds, /--button-primary-bg/);
    assert.match(ds, /--color-brand-primary/);
    assert.doesNotMatch(ds, /var\(--btn-primary-bg\)/);
    assert.doesNotMatch(ds, /var\(--wf-primary\)/);
    assert.doesNotMatch(ds, /var\(--flash-success-bg\)/);

    const modal = read("public/m3-modal.css");
    assert.match(modal, /--color-border-default/);
    assert.match(modal, /--modal-overlay/);
    assert.doesNotMatch(modal, /var\(--color-outline\)/);
    assert.doesNotMatch(modal, /var\(--color-scrim-join-backdrop\)/);
  });
});
