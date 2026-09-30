"use strict";

/**
 * V2.04 Phase 3 — BlessBoard website platform adapter (presentation + contract).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const facade = require("../src/blessboard/website/blessboardWebsitePlatformAdapter");
const presentation = require("../src/blessboard/website/blessboardWebsitePresentationAdapter");

describe("V2.04 Phase 3 BB website platform adapter", () => {
  it("declares adapter owns policy/presentation and does not own engines", () => {
    assert.equal(facade.ADAPTER_CONTRACT.importsActiveClinic, false);
    assert.ok(facade.ADAPTER_CONTRACT.owns.includes("presentation_mapping"));
    assert.ok(facade.ADAPTER_CONTRACT.doesNotOwn.includes("draft_storage"));
    assert.ok(facade.ADAPTER_CONTRACT.doesNotOwn.includes("publish_engine"));
    assert.ok(facade.ADAPTER_CONTRACT.doesNotOwn.includes("version_engine"));
    assert.ok(facade.ADAPTER_CONTRACT.doesNotOwn.includes("restore_engine"));
    assert.ok(facade.ADAPTER_CONTRACT.doesNotOwn.includes("media_upload_engine"));
    assert.ok(facade.ADAPTER_CONTRACT.doesNotOwn.includes("inline_editor_engine"));
  });

  it("maps pastor/leader → PersonPresentation and ministry → CollectionPresentation", () => {
    const person = presentation.toPersonPresentation({
      id: "ldr-1",
      displayName: "Pastor Ada",
      roleTitle: "Lead Pastor",
      biography: "Serves the congregation.",
      imageUrl: "/img/ada.jpg",
      seniorLeader: true,
    });
    assert.equal(person.ok, true);
    assert.equal(person.value.name, "Pastor Ada");
    assert.equal(person.value.sourceDomain, "pastor_leader");
    assert.equal(person.value.sourceProduct, "blessboard");

    const collection = presentation.toMinistryCollection({
      title: "Ministries",
      items: [
        { id: "m1", name: "Youth", summary: "Next generation", joinUrl: "/youth" },
      ],
    });
    assert.equal(collection.ok, true);
    assert.equal(collection.value.items.length, 1);
    assert.equal(collection.value.items[0].title, "Youth");
    assert.equal(collection.value.items[0].sourceDomain, "ministry");
  });

  it("maps generic hero, CTA, hours, and gallery into platform components", () => {
    const hero = presentation.toHero({
      title: "Welcome",
      subtitle: "Join us Sunday",
      imageUrl: "/hero.jpg",
      primaryLabel: "Visit",
      primaryUrl: "/visit",
    });
    assert.equal(hero.ok, true);
    assert.equal(hero.value.type, "hero");
    assert.equal(hero.value.title, "Welcome");

    const cta = presentation.toCta({
      heading: "Give",
      body: "Support the mission",
      primaryLabel: "Give now",
      primaryUrl: "/give",
    });
    assert.equal(cta.ok, true);
    assert.equal(cta.value.type, "cta");

    const hours = presentation.toHours({
      heading: "Worship",
      times: [{ day: "Sunday", time: "10:00 AM", label: "Main service" }],
    });
    assert.equal(hours.ok, true);
    assert.equal(hours.value.type, "hours");
    assert.equal(hours.value.rows.length, 1);

    const gallery = presentation.toGallery({
      images: ["/a.jpg", { url: "/b.jpg", alt: "Choir" }],
    });
    assert.equal(gallery.ok, true);
    assert.equal(gallery.value.type, "gallery");
    assert.equal(gallery.value.items.length, 2);
  });

  it("BB website adapter modules do not import ActiveClinic implementation", () => {
    const dir = path.join(__dirname, "../src/blessboard/website");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js") && !f.includes(" 2."));
    for (const file of files) {
      const src = fs.readFileSync(path.join(dir, file), "utf8");
      assert.equal(
        /require\(["'].*activeclinic/.test(src),
        false,
        `${file} must not require activeclinic`
      );
    }
  });
});
