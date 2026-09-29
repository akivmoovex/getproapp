"use strict";

/**
 * V2.02 Universal Image Editor — coverage contract.
 *
 * Category-A slots must reach the platform Adjust Picture / framing surface.
 * Structured BB mounts that only offer replace are EXPECTED to fail until the
 * platform extraction fix lands. Application code must not be changed to green this.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  CLASS,
  MOUNT,
  SLOTS,
  slotsByClass,
  slotsByProduct,
} = require("./helpers/v2-02-universal-image-editor-coverage-matrix");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const PLATFORM_INLINE_JS = "public/platform/website-inline-edit.js";
const PLATFORM_PLACEMENT = "src/platform/website/imagePlacement.js";
const STRUCTURED_JS = "public/blessboard/v5/website-structured-edit.js";

/** Markers from the canonical Universal Image Editor (website-inline-edit.js). */
const FRAMING_MARKERS = Object.freeze([
  "Adjust Picture",
  "data-website-adjust",
  "data-website-frame-zoom",
  "data-website-frame-fit",
  "data-website-frame-stage",
  "data-website-frame-reset",
]);

function platformFramingPresent() {
  const js = read(PLATFORM_INLINE_JS);
  const missing = FRAMING_MARKERS.filter((m) => !js.includes(m));
  return { ok: missing.length === 0, missing, js };
}

function placementModelPresent() {
  const src = read(PLATFORM_PLACEMENT);
  return {
    ok:
      src.includes("validateImagePlacement") &&
      src.includes("renderPlacementStyle") &&
      src.includes("IMAGE_SLOT_REGISTRY"),
    src,
  };
}

function structuredFramingPresent() {
  const js = read(STRUCTURED_JS);
  const usesMountApi =
    js.includes("GpUniversalImageEditor") &&
    js.includes("openFraming") &&
    (js.includes("data-bb-se-adjust") || js.includes("Adjust Picture"));
  const framingHits = FRAMING_MARKERS.filter((m) => js.includes(m));
  // Focal select alone is not Universal Image Editor framing.
  const hasWeakFocal = js.includes("Focal position") || js.includes('name="focal"');
  return {
    ok: usesMountApi || framingHits.length >= 4,
    framingHits,
    hasWeakFocal,
    usesMountApi,
    js,
  };
}

function evidenceHasInlineMount(slot) {
  const files = slot.evidenceFiles.length ? slot.evidenceFiles : [];
  let joined = "";
  for (const rel of files) {
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    joined += `\n${read(rel)}`;
  }
  const hasPartial =
    joined.includes("editable-image") ||
    joined.includes("website-editable-image");
  const hints = slot.contentKeyHints || [];
  const hasKey = hints.some((h) => joined.includes(h));
  return { hasPartial, hasKey, ok: hasPartial && hasKey };
}

/**
 * True only when a contentKey is wired through the shared editable-image partial
 * (not merely present on a page that also has an unrelated hero/logo editor).
 */
function contentKeyOnSharedEditableImage(slot) {
  const hints = slot.contentKeyHints || [];
  if (!hints.length) return false;
  const scanRoots =
    slot.product === "blessboard"
      ? ["views/blessboard"]
      : ["views/activeclinic"];

  function walk(dir) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return false;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (walk(rel)) return true;
        continue;
      }
      if (!entry.name.endsWith(".ejs")) continue;
      const src = read(rel);
      for (const key of hints) {
        const re = new RegExp(
          String.raw`include\([^)]*(?:editable-image|website-editable-image)[\s\S]{0,800}?contentKey:\s*['"]${key.replace(/\./g, "\\.")}['"]`,
          "m"
        );
        if (re.test(src)) return true;
      }
    }
    return false;
  }

  return scanRoots.some((root) => walk(root));
}

/**
 * Category-A framing reachability:
 * - platform_inline: evidence must mount editable-image partial + platform JS has framing
 * - structured: structured JS must expose framing markers, OR this slot's contentKey
 *   must be mounted on the shared editable-image partial (unrelated hero/logo on the
 *   same page does not count)
 */
function categoryAFramingReachable(slot) {
  const platform = platformFramingPresent();
  if (!platform.ok) {
    return { ok: false, detail: `platform framing markers missing: ${platform.missing.join(", ")}` };
  }

  if (slot.mount === MOUNT.PLATFORM_INLINE) {
    const evidence = evidenceHasInlineMount(slot);
    if (!evidence.ok) {
      return {
        ok: false,
        detail: `inline mount evidence missing editable-image / key (partial=${evidence.hasPartial}, key=${evidence.hasKey})`,
      };
    }
    return { ok: true, detail: "platform_inline + framing markers" };
  }

  if (slot.mount === MOUNT.STRUCTURED) {
    const structured = structuredFramingPresent();
    if (structured.ok) {
      return { ok: true, detail: "structured framing markers" };
    }
    if (contentKeyOnSharedEditableImage(slot)) {
      return { ok: true, detail: "slot contentKey mounted on shared editable-image" };
    }
    return {
      ok: false,
      detail:
        "structured mount exposes replace/media selection without Universal Image Editor framing " +
        `(weakFocal=${structured.hasWeakFocal}; framingHits=${structured.framingHits.join("|") || "none"})`,
    };
  }

  return { ok: false, detail: `unsupported mount for category A: ${slot.mount}` };
}

describe("V2.02 Universal Image Editor coverage contract", () => {
  it("matrix enumerates BB and AC slots with A/B/C/D classifications", () => {
    assert.ok(SLOTS.length >= 20, `expected inventory size, got ${SLOTS.length}`);
    const bb = slotsByProduct("blessboard");
    const ac = slotsByProduct("activeclinic");
    assert.ok(bb.length >= 10, `BB slots: ${bb.length}`);
    assert.ok(ac.length >= 8, `AC slots: ${ac.length}`);

    for (const slot of SLOTS) {
      assert.ok(Object.values(CLASS).includes(slot.classification), slot.id);
      assert.ok(Object.values(MOUNT).includes(slot.mount), slot.id);
      assert.ok(slot.reason && slot.reason.length > 8, slot.id);
    }

    // Explicit non-A representation — missing framing must not look like silent pass.
    assert.ok(slotsByClass(CLASS.B).length >= 4, "category B must be represented");
    assert.ok(slotsByClass(CLASS.D).length >= 4, "category D must be represented");
  });

  it("canonical platform framing + placement model exist", () => {
    const framing = platformFramingPresent();
    assert.equal(framing.ok, true, `missing: ${framing.missing.join(", ")}`);
    const placement = placementModelPresent();
    assert.equal(placement.ok, true);
    const inlineEdit = read(PLATFORM_INLINE_JS);
    assert.match(inlineEdit, /placement/i);
    assert.match(inlineEdit, /draft|save|PUT|PATCH|fetch/i);
  });

  it("category B/C/D slots do not require Adjust Picture (documented non-goals)", () => {
    for (const slot of SLOTS) {
      if (slot.classification === CLASS.A) continue;
      assert.notEqual(
        slot.adjustPicture,
        "expected",
        `${slot.id} non-A must not claim expected Adjust Picture`
      );
      assert.equal(slot.adjustPicture, false, `${slot.id} non-A adjustPicture`);
      assert.equal(slot.zoom, false, `${slot.id} non-A zoom`);
    }
  });

  it("every category-A slot reaches shared Adjust Picture / framing controls", () => {
    const categoryA = slotsByClass(CLASS.A);
    assert.ok(categoryA.length >= 8, `category A count: ${categoryA.length}`);

    const failures = [];
    const passes = [];

    for (const slot of categoryA) {
      const result = categoryAFramingReachable(slot);
      if (result.ok) passes.push(slot.id);
      else failures.push({ id: slot.id, product: slot.product, mount: slot.mount, detail: result.detail });
    }

    // Surface structured gaps clearly for QA / fix planning.
    if (failures.length) {
      const lines = failures.map((f) => `  - ${f.id} [${f.product}/${f.mount}]: ${f.detail}`);
      assert.fail(
        [
          `CATEGORY_A framing gaps: ${failures.length} fail, ${passes.length} pass`,
          ...lines,
          "Expected until platform mounts Universal Image Editor on structured surfaces.",
        ].join("\n")
      );
    }

    assert.equal(failures.length, 0);
    assert.ok(passes.length === categoryA.length);
  });

  it("platform_inline category-A slots already pass; structured category-A are the known gap set", () => {
    const structuredA = slotsByClass(CLASS.A).filter((s) => s.mount === MOUNT.STRUCTURED);
    const inlineA = slotsByClass(CLASS.A).filter((s) => s.mount === MOUNT.PLATFORM_INLINE);

    for (const slot of inlineA) {
      assert.equal(categoryAFramingReachable(slot).ok, true, slot.id);
    }

    // After the structured-surface fix, platform_inline AND structured Category-A must pass.
    const structuredFails = structuredA.filter((s) => !categoryAFramingReachable(s).ok);
    assert.equal(structuredFails.length, 0, structuredFails.map((s) => s.id).join(", "));
    assert.ok(structuredA.length >= 8, `structured A inventory: ${structuredA.length}`);
  });
});
