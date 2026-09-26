"use strict";

/**
 * Architecture guard: src/platform must not hard-require product implementation
 * packages except documented composition-root / legacy-bridge exceptions (E).
 *
 * Shrink PLATFORM_PRODUCT_REQUIRE_ALLOWLIST as PC03+ extraction continues.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const PLATFORM_ROOT = path.join(__dirname, "..", "src", "platform");

/**
 * Remaining justified exceptions (class E / deferred extraction).
 * Paths relative to src/platform/. Recalculate on each PC03 pass.
 */
const PLATFORM_PRODUCT_REQUIRE_ALLOWLIST = Object.freeze([
  // Composition roots that mount product HTTP packs (E — bootstrap boundary)
  "http/v5FoundationServer.js",
  "http/moovexPlatformRuntimeServer.js",
  "http/platformAdminRoutes.js",
  "http/platformWebsiteAdminRoutes.js",
  "http/platformAdminShellLocals.js",
  "http/applySupportContextTenant.js",
  "http/requirePlatformSupportContext.js",
  "http/websiteGovernanceAccess.js",
  // Legacy BB website bridge pending relocation out of platform (E)
  "website-engine/blessboardBridge.js",
  "website-engine/blessboardBackfillService.js",
  "website-engine/index.js",
  // Governance / admin website surfaces still product-coupled (E→A later)
  "website/governanceVersionPreview.js",
  "website/platformAdminWebsitesService.js",
  "website/lifecycleService.js",
  "website/websiteSettingsHttp.js",
  // Platform admin / provisioning helpers still BB-tied (E→A later)
  "services/createScopedTeamMemberService.js",
  "services/platformAdminAccountRecoveryService.js",
  "services/platformAdminTeamService.js",
  "services/platformAdminPublicLinksService.js",
  "services/platformAdminRegistrationAnalyticsService.js",
  "services/platformAdminEntitlements.js",
  "services/listPlatformOrganizations.js",
  "services/listPlatformSubscriptions.js",
  "services/billingSubscriptionService.js",
  "services/authTransferService.js",
  "registration/provisioningRecovery.js",
  "registration/registrationSlugPreview.js",
  "organization/allocateUniqueOrganizationKey.js",
  "release-notes/releaseNotesService.js",
  "config/v5EnvValidation.js",
  "host.js",
  "build/applicationBuildInfo.js",
]);

const PRODUCT_REQUIRE_RE =
  /require\s*\(\s*["']([^"']*(?:blessboard|\/church\/|activeclinic)[^"']*)["']\s*\)/g;

function walkJsFiles(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.includes(" 2.")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJsFiles(full, acc);
    else if (ent.name.endsWith(".js")) acc.push(full);
  }
  return acc;
}

function relativePlatformPath(absPath) {
  return path.relative(PLATFORM_ROOT, absPath).split(path.sep).join("/");
}

describe("PC03 architecture — platform must not hard-require product packages", () => {
  it("only allowlisted platform files may require blessboard/church/activeclinic", () => {
    const allow = new Set(PLATFORM_PRODUCT_REQUIRE_ALLOWLIST);
    const offenders = [];
    for (const file of walkJsFiles(PLATFORM_ROOT)) {
      const rel = relativePlatformPath(file);
      const text = fs.readFileSync(file, "utf8");
      PRODUCT_REQUIRE_RE.lastIndex = 0;
      const hits = [];
      let m;
      while ((m = PRODUCT_REQUIRE_RE.exec(text))) hits.push(m[1]);
      if (!hits.length) continue;
      if (allow.has(rel)) continue;
      offenders.push({ file: rel, hits: [...new Set(hits)] });
    }
    assert.deepEqual(
      offenders,
      [],
      `New platform→product requires (register via productRuntimeRegistry instead):\n${offenders
        .map((o) => ` - ${o.file}: ${o.hits.join(", ")}`)
        .join("\n")}`
    );
  });

  it("allowlist entries exist on disk", () => {
    for (const rel of PLATFORM_PRODUCT_REQUIRE_ALLOWLIST) {
      const abs = path.join(PLATFORM_ROOT, rel);
      assert.equal(fs.existsSync(abs), true, `missing allowlist file ${rel}`);
    }
  });
});

module.exports = {
  PLATFORM_PRODUCT_REQUIRE_ALLOWLIST,
};
