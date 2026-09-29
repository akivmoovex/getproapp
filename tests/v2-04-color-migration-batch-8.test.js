"use strict";

/**
 * V2.04 Batch 8 — final raw-color cleanup + allowlist guard.
 *
 * Unjustified platform GUI raw colors must remain 0.
 * Documented exceptions live in ALLOWLIST (file → colors → rationale).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

/** @type {Record<string, { colors: string[], category: string, rationale: string }>} */
const ALLOWLIST = {
  // Brand / content SVG assets
  "public/favicon.svg": {
    colors: ["*"],
    category: "BRAND_ASSET",
    rationale: "Product favicon artwork; not GUI chrome.",
  },
  "public/images/mobile/feature-compare.svg": {
    colors: ["*"],
    category: "CONTENT_COLOR",
    rationale: "Marketing illustration SVG fills.",
  },
  "public/images/mobile/feature-track.svg": {
    colors: ["*"],
    category: "CONTENT_COLOR",
    rationale: "Marketing illustration SVG fills.",
  },
  "public/images/mobile/feature-find.svg": {
    colors: ["*"],
    category: "CONTENT_COLOR",
    rationale: "Marketing illustration SVG fills.",
  },
  "public/activeclinic/assets/doctors/doctor-fallback.svg": {
    colors: ["*"],
    category: "CONTENT_COLOR",
    rationale: "Doctor avatar fallback illustration.",
  },
  "public/activeclinic/assets/icons/consultation.svg": {
    colors: ["*"],
    category: "CONTENT_COLOR",
    rationale: "Service icon artwork.",
  },
  "public/activeclinic/assets/icons/general.svg": {
    colors: ["*"],
    category: "CONTENT_COLOR",
    rationale: "Service icon artwork.",
  },
  "public/activeclinic/assets/icons/lab.svg": {
    colors: ["*"],
    category: "CONTENT_COLOR",
    rationale: "Service icon artwork.",
  },
  "public/activeclinic/assets/icons/procedure.svg": {
    colors: ["*"],
    category: "CONTENT_COLOR",
    rationale: "Service icon artwork.",
  },
  // Print / export
  "views/field_agent/statement_print.ejs": {
    colors: ["*"],
    category: "PRINT_EXPORT_COMPATIBILITY",
    rationale: "Print stylesheet; CSS variables unreliable in print engines.",
  },
  "views/activeclinic/app/billing-statement-content.ejs": {
    colors: ["#000000"],
    category: "PRINT_EXPORT_COMPATIBILITY",
    rationale: "Billing statement print ink must be absolute black.",
  },
  "views/activeclinic/app/pharmacy-medicine-labels-content.ejs": {
    colors: ["#222222"],
    category: "PRINT_EXPORT_COMPATIBILITY",
    rationale: "Medicine label print border; absolute ink for printers.",
  },
  // Tenant branding color pickers / JS defaults (HTML color inputs require HEX)
  "public/activeclinic/website-cms.js": {
    colors: ["#006068", "#0F766E"],
    category: "TENANT_BRANDING",
    rationale: "Runtime default brand HEX for tenant website CMS preview.",
  },
  "views/activeclinic/app/website-cms-branding.ejs": {
    colors: ["#006068", "#0F766E"],
    category: "TENANT_BRANDING",
    rationale: "HTML color input defaults/placeholders for tenant brand.",
  },
  "public/blessboard/v5/website-branding.js": {
    colors: ["#6C5CE7", "#5341CD"],
    category: "TENANT_BRANDING",
    rationale: "JS preview defaults when church brand unset.",
  },
  "views/blessboard/v5/hq/website-branding.ejs": {
    colors: ["#6C5CE7", "#5341CD"],
    category: "TENANT_BRANDING",
    rationale: "Server-side branding defaults for color pickers.",
  },
};

const HEX = /#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RGB =
  /rgba?\(\s*([0-9.]+%?)\s*,\s*([0-9.]+%?)\s*,\s*([0-9.]+%?)(?:\s*,\s*([0-9.]+))?\s*\)/gi;
const TOKEN_HINTS = [
  "tokens",
  "design-tokens",
  "theme.css",
  "ac-app-tokens",
  "design-system.css",
];

function isTokenFile(rel) {
  return TOKEN_HINTS.some((h) => rel.includes(h)) || rel.endsWith("/theme.css");
}

function expandHex(h) {
  let x = h.toLowerCase().replace(/^#/, "");
  if (x.length === 3) x = x.split("").map((c) => c + c).join("");
  if (x.length === 4) x = x.split("").map((c) => c + c).join("");
  return `#${x.slice(0, 6).toUpperCase()}`;
}

function parseComp(v) {
  const s = String(v).trim();
  if (s.endsWith("%")) return Math.round(parseFloat(s) * 2.55);
  return parseInt(s, 10);
}

function scanRepo() {
  const tracked = execSync("git ls-files public views frontend", {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean)
    .filter(
      (f) =>
        /\.(css|ejs|js|svg|html|mjs|cjs)$/.test(f) &&
        !isTokenFile(f) &&
        !f.includes(" 2.")
    );

  /** @type {Map<string, Set<string>>} */
  const byFile = new Map();
  for (const rel of tracked) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, "utf8");
    const colors = new Set();
    for (const line of text.split(/\r?\n/)) {
      if (/--[a-zA-Z0-9-]+\s*:/.test(line)) continue;
      const s = line.trim();
      if (s.startsWith("/*") || s.startsWith("*") || s.startsWith("//")) continue;
      for (const m of line.matchAll(HEX)) colors.add(expandHex(m[0]));
      RGB.lastIndex = 0;
      let m;
      while ((m = RGB.exec(line))) {
        try {
          const r = parseComp(m[1]);
          const g = parseComp(m[2]);
          const b = parseComp(m[3]);
          colors.add(
            `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
              .toString(16)
              .padStart(2, "0")}`.toUpperCase()
          );
        } catch {
          /* ignore */
        }
      }
    }
    if (colors.size) byFile.set(rel, colors);
  }
  return byFile;
}

function isAllowed(rel, color) {
  const entry = ALLOWLIST[rel];
  if (!entry) return false;
  if (entry.colors.includes("*")) return true;
  return entry.colors.map((c) => c.toUpperCase()).includes(color.toUpperCase());
}

describe("V2_04 color migration batch 8 — final cleanup guard", () => {
  it("has zero unjustified platform GUI raw colors", () => {
    const byFile = scanRepo();
    const unjustified = [];
    for (const [rel, colors] of byFile) {
      for (const c of colors) {
        if (!isAllowed(rel, c)) unjustified.push(`${rel} ${c}`);
      }
    }
    assert.deepEqual(
      unjustified,
      [],
      `Unjustified raw GUI colors:\n${unjustified.join("\n")}`
    );
  });

  it("allowlist covers every remaining scanned raw color", () => {
    const byFile = scanRepo();
    let remaining = 0;
    for (const [, colors] of byFile) remaining += colors.size;
    assert.ok(remaining > 0, "expected justified residual colors");
    assert.ok(remaining <= 50, `unexpected residual volume: ${remaining}`);
    for (const [rel, colors] of byFile) {
      assert.ok(ALLOWLIST[rel], `missing allowlist entry for ${rel}`);
      for (const c of colors) {
        assert.ok(isAllowed(rel, c), `${rel} ${c} not allowlisted`);
      }
    }
  });

  it("removed foundation --product-* / --gp-ops-* compatibility aliases", () => {
    const theme = fs.readFileSync(
      path.join(ROOT, "src/platform/ui/theme/colors.css"),
      "utf8"
    );
    assert.doesNotMatch(theme, /--product-primary\s*:/);
    assert.doesNotMatch(theme, /--gp-ops-canvas\s*:/);
  });

  it("removed appearance-named --bb-violet / --ac-teal aliases", () => {
    const bb = fs.readFileSync(
      path.join(ROOT, "public/blessboard/v5/design-tokens.css"),
      "utf8"
    );
    const ac = fs.readFileSync(
      path.join(ROOT, "public/activeclinic/ac-app-tokens.css"),
      "utf8"
    );
    assert.doesNotMatch(bb, /--bb-violet\s*:/);
    assert.doesNotMatch(ac, /--ac-teal\s*:/);
  });
});
