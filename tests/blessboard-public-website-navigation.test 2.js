"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildPublicWebsiteNavigation,
} = require("../src/blessboard/http/buildPublicWebsiteNavigation");

function keysOf(items) {
  return (items || []).map((i) => i.key);
}

function countDropdowns(items) {
  return (items || []).filter((i) => i.children && i.children.length).length;
}

describe("buildPublicWebsiteNavigation", () => {
  it("HQ desktop shows ≤6 top-level items with About/Ministries/Media groups and Give CTA", () => {
    const nav = buildPublicWebsiteNavigation({
      scopeType: "church",
      pathPrefix: "/c/example-church",
      churchHomeHref: "/c/example-church",
      activePageKey: "home",
      availablePages: new Set([
        "home",
        "about",
        "leadership",
        "ministries",
        "events",
        "sermons",
        "contact",
        "giving",
      ]),
      ministries: [
        { id: "1", name: "Children" },
        { id: "2", name: "Youth" },
        { id: "3", name: "Women" },
      ],
      locationCount: 2,
      locations: [
        { key: "a", displayName: "A", websiteHref: "/c/example-church/branches/a" },
        { key: "b", displayName: "B", websiteHref: "/c/example-church/branches/b" },
      ],
      hasGiving: true,
    });

    assert.ok(nav.primaryItems.length <= 6);
    assert.ok(countDropdowns(nav.primaryItems) <= 3);
    assert.deepEqual(
      keysOf(nav.primaryItems).slice(0, 5),
      ["home", "about-group", "ministries-group", "media-group", "locations"]
    );
    assert.equal(nav.ctaItem && nav.ctaItem.key, "giving");
    assert.equal(nav.ctaItem.label, "Give");
    assert.equal(nav.ctaItem.href, "/c/example-church/giving");
    assert.ok(nav.primaryItems.every((i) => i.key !== "giving"));

    const about = nav.primaryItems.find((i) => i.key === "about-group");
    assert.ok(about.children.some((c) => c.key === "leadership"));
    assert.ok(about.children.some((c) => c.key === "contact"));

    const ministries = nav.primaryItems.find((i) => i.key === "ministries-group");
    assert.ok(ministries.children.some((c) => c.label === "Children"));
    assert.ok(ministries.children.some((c) => c.key === "ministries"));

    const media = nav.primaryItems.find((i) => i.key === "media-group");
    assert.deepEqual(keysOf(media.children), ["sermons", "events"]);
  });

  it("hides empty Ministries and Media groups and Give when unavailable", () => {
    const nav = buildPublicWebsiteNavigation({
      scopeType: "church",
      pathPrefix: "/c/example-church",
      availablePages: new Set(["home", "about", "contact"]),
      ministries: [],
      locationCount: 1,
      hasGiving: false,
    });
    assert.ok(!keysOf(nav.primaryItems).includes("ministries-group"));
    assert.ok(!keysOf(nav.primaryItems).includes("ministries"));
    assert.ok(!keysOf(nav.primaryItems).includes("media-group"));
    assert.equal(nav.ctaItem, null);
  });

  it("branch nav uses branch-scoped URLs, Visit group, and Main Church link", () => {
    const nav = buildPublicWebsiteNavigation({
      scopeType: "branch",
      pathPrefix: "/c/example-church/branches/east",
      churchHomeHref: "/c/example-church",
      activePageKey: "about",
      availablePages: new Set([
        "home",
        "about",
        "leadership",
        "ministries",
        "events",
        "sermons",
        "contact",
        "giving",
      ]),
      hasGiving: true,
      hasServiceTimes: true,
      hasDirections: true,
    });

    assert.ok(nav.primaryItems.length <= 6);
    assert.ok(countDropdowns(nav.primaryItems) <= 3);
    assert.ok(keysOf(nav.primaryItems).includes("visit-group") || keysOf(nav.primaryItems).includes("visit"));
    assert.ok(keysOf(nav.primaryItems).includes("ministries"));

    const about = nav.primaryItems.find((i) => i.key === "about-group");
    assert.ok(about);
    const main = about.children.find((c) => c.key === "main-church");
    assert.equal(main.href, "/c/example-church");
    assert.ok(!main.emphasized);

    for (const item of nav.mobileItems) {
      if (["home", "about", "ministries", "sermons", "events", "contact", "giving"].includes(item.key)) {
        assert.match(item.href, /\/c\/example-church\/branches\/east/);
      }
    }
    assert.ok(nav.mobileItems.some((i) => i.key === "main-church"));
    assert.equal(nav.ctaItem.href, "/c/example-church/branches/east/giving");
  });

  it("does not invent cross-organization hrefs", () => {
    const nav = buildPublicWebsiteNavigation({
      scopeType: "church",
      pathPrefix: "/c/alpha",
      churchHomeHref: "/c/alpha",
      availablePages: new Set(["home", "about", "giving"]),
      hasGiving: true,
      locationCount: 0,
    });
    const hrefs = [];
    function walk(items) {
      for (const item of items || []) {
        if (item.href) hrefs.push(item.href);
        if (item.children) walk(item.children);
      }
    }
    walk(nav.primaryItems);
    if (nav.ctaItem) hrefs.push(nav.ctaItem.href);
    walk(nav.mobileItems);
    walk(nav.footerItems);
    for (const href of hrefs) {
      assert.doesNotMatch(href, /\/c\/(?!alpha)/);
    }
  });

  it("mobile items expose destinations removed from desktop top-level", () => {
    const nav = buildPublicWebsiteNavigation({
      scopeType: "church",
      pathPrefix: "/c/example-church",
      availablePages: new Set([
        "home",
        "about",
        "leadership",
        "ministries",
        "events",
        "sermons",
        "contact",
        "giving",
      ]),
      hasGiving: true,
      locationCount: 2,
      locations: [
        { key: "a", displayName: "A", websiteHref: "/c/example-church/branches/a" },
        { key: "b", displayName: "B", websiteHref: "/c/example-church/branches/b" },
      ],
    });
    const mobileKeys = keysOf(nav.mobileItems);
    assert.ok(mobileKeys.includes("leadership"));
    assert.ok(mobileKeys.includes("sermons"));
    assert.ok(mobileKeys.includes("events"));
    assert.ok(mobileKeys.includes("contact"));
    assert.ok(mobileKeys.includes("giving"));
  });
});
