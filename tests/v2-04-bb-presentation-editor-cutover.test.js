"use strict";

/**
 * V2.04 Phase 4 — BB presentation + editor cutover proofs.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const bridge = require("../src/blessboard/website/blessboardWebsiteComponentBridge");
const presentation = require("../src/blessboard/website/blessboardWebsitePresentationAdapter");
const mediaContract = require("../src/platform/website/websiteMediaEditingContract");
const componentLibrary = require("../src/platform/website/presentation/componentLibrary");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function collectRuntimeRefs(needle) {
  const roots = ["views", "public", "src"].map((d) => path.join(ROOT, d));
  const hits = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name.includes(" 2.")) continue;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        if (name === "node_modules" || name === ".git") continue;
        walk(full);
        continue;
      }
      if (!/\.(js|ejs|css|html)$/.test(name)) continue;
      // The legacy asset file itself is not a runtime reference.
      if (full.endsWith(`${path.sep}blessboard${path.sep}v5${path.sep}website-inline-edit.js`)) {
        continue;
      }
      const text = fs.readFileSync(full, "utf8");
      if (text.includes(needle)) hits.push(path.relative(ROOT, full));
    }
  }
  roots.forEach(walk);
  return hits;
}

describe("V2.04 Phase 4 BB presentation + editor cutover", () => {
  it("uses a single editor / upload / media-library engine", () => {
    assert.equal(bridge.ENGINE_COUNTS.EDITOR_ENGINE_COUNT, 1);
    assert.equal(bridge.ENGINE_COUNTS.UPLOAD_ENGINE_COUNT, 1);
    assert.equal(bridge.ENGINE_COUNTS.MEDIA_LIBRARY_ENGINE_COUNT, 1);
    assert.equal(componentLibrary.SHARED_EDITOR_ENGINE_COUNT, 1);
    assert.equal(mediaContract.SHARED_UPLOAD_ENGINE_COUNT, 1);
    assert.match(bridge.ENGINE_COUNTS.EDITOR_ENGINE_PATH, /platform\/website-inline-edit\.js/);
  });

  it("BB public shells load platform editor + presentation CSS and not legacy inline-edit.js", () => {
    const shellEnd = read("views/blessboard/v5/partials/tenant-public-shell-end.ejs");
    const shellStart = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    assert.match(shellEnd, /\/platform\/website-inline-edit\.js/);
    assert.doesNotMatch(shellEnd, /\/blessboard\/v5\/website-inline-edit\.js/);
    assert.match(shellStart, /website-presentation-token-bridge\.css/);
    assert.match(shellStart, /website-presentation-components\.css/);
  });

  it("legacy BB website-inline-edit.js has zero runtime references", () => {
    const hits = collectRuntimeRefs("/blessboard/v5/website-inline-edit.js");
    assert.deepEqual(hits, [], `unexpected runtime refs: ${hits.join(", ")}`);
  });

  it("public partials cut over to platform components for non-edit renders", () => {
    const leader = read("views/blessboard/v5/public/partials/leader-card.ejs");
    const cta = read("views/blessboard/v5/public/partials/cta-band.ejs");
    const hours = read("views/blessboard/v5/public/partials/service-times-block.ejs");
    assert.match(leader, /platform\/website\/components\/person-card/);
    assert.match(cta, /platform\/website\/components\/cta/);
    assert.match(hours, /platform\/website\/components\/hours/);
    assert.equal(presentation.STEP.wiredToPublicRender, true);
  });

  it("preserves BlessBoard primary violet via colors.css / token bridge (not AC teal)", () => {
    const colors = read("public/platform/theme/colors.css");
    const bridgeCss = read("public/platform/website-presentation-token-bridge.css");
    assert.match(colors, /--palette-violet-500:\s*#6c5ce7/i);
    assert.match(bridgeCss, /--gp-website-color-primary:\s*var\(--bb-color-primary/);
    assert.doesNotMatch(bridgeCss, /body\.bb-tp-body[\s\S]*#006068/);
  });

  it("component bridge renders platform hero/cta/hours HTML", () => {
    const hero = bridge.renderHeroFromLocals({
      heroHeading: "Welcome home",
      heroBody: "Join us this Sunday",
      heroMedia: "/hero.jpg",
      heroCtaPrimary: { label: "Visit", href: "/visit" },
    });
    assert.equal(hero.ok, true);
    assert.match(hero.html, /data-gp-website-component="hero"/);
    assert.match(hero.html, /bb-tp-platform-bridge/);

    const cta = bridge.renderCtaFromLocals({
      ctaTitle: "Give",
      ctaBody: "Support",
      ctaPrimary: { label: "Give", href: "/give" },
    });
    assert.equal(cta.ok, true);
    assert.match(cta.html, /data-gp-website-component="cta"/);

    const hours = bridge.renderHoursFromServiceTimes({
      serviceTimesHeading: "Worship",
      serviceTimesEntries: [{ name: "Sunday", day: "sunday", startTime: "10:00" }],
    });
    assert.equal(hours.ok, true);
    assert.match(hours.html, /data-gp-website-component="hours"/);
  });
});
