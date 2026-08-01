"use strict";

/**
 * Canonical public website navigation for BlessBoard V5 tenant sites.
 * Builds desktop (grouped), mobile (flat), footer, and CTA models.
 * Does not hard-code tenant keys; uses path prefixes from the caller.
 */

const { PAGE_KEY_TO_PATH, PAGE_KEY_TITLES } = (() => {
  const paths = require("./tenantPublicPaths");
  const { PAGE_KEY_TITLES: titles } = require("../services/publicContentConstants");
  return { PAGE_KEY_TO_PATH: paths.PAGE_KEY_TO_PATH, PAGE_KEY_TITLES: titles };
})();

const MAX_MINISTRY_DROPDOWN = 6;

/**
 * @param {string} pathPrefix
 * @param {string} pageKey
 */
function pageHref(pathPrefix, pageKey) {
  const prefix = String(pathPrefix || "").replace(/\/$/, "");
  const suffix = PAGE_KEY_TO_PATH[pageKey];
  if (suffix == null) return prefix || "/";
  if (suffix === "/") return prefix || "/";
  return `${prefix}${suffix}`;
}

/**
 * @param {Set<string>|null|undefined} available
 * @param {string} pageKey
 */
function isPageVisible(available, pageKey) {
  if (!available) return Boolean(PAGE_KEY_TO_PATH[pageKey]);
  return available.has(pageKey);
}

/**
 * @param {string} activeKey
 * @param {string|string[]} keys
 */
function isActiveKey(activeKey, keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  return list.includes(String(activeKey || ""));
}

/**
 * @param {{
 *   key: string,
 *   label: string,
 *   href?: string|null,
 *   isActive?: boolean,
 *   children?: object[],
 *   external?: boolean,
 *   emphasized?: boolean,
 * }} partial
 */
function freezeItem(partial) {
  const children = Array.isArray(partial.children)
    ? Object.freeze(partial.children.map((c) => freezeItem(c)))
    : undefined;
  return Object.freeze({
    key: String(partial.key),
    label: String(partial.label),
    href: partial.href != null ? String(partial.href) : null,
    isActive: Boolean(partial.isActive),
    isVisible: true,
    children,
    external: Boolean(partial.external),
    emphasized: Boolean(partial.emphasized),
  });
}

/**
 * @param {{
 *   scopeType?: 'church'|'branch',
 *   pathPrefix?: string,
 *   churchHomeHref?: string|null,
 *   activePageKey?: string,
 *   availablePages?: Set<string>|string[]|null,
 *   ministries?: Array<{ id?: string|null, name?: string|null }>|null,
 *   locationCount?: number,
 *   locations?: Array<{ key?: string, displayName?: string, websiteHref?: string }>|null,
 *   hasGiving?: boolean,
 *   hasDirections?: boolean,
 *   hasServiceTimes?: boolean,
 * }} input
 */
function buildPublicWebsiteNavigation(input) {
  const scopeType = input && input.scopeType === "branch" ? "branch" : "church";
  const pathPrefix = String((input && input.pathPrefix) || "").replace(/\/$/, "");
  const churchHomeHref =
    input && input.churchHomeHref != null && String(input.churchHomeHref).trim()
      ? String(input.churchHomeHref).replace(/\/$/, "") || "/"
      : pathPrefix || "/";
  const activeKey = String((input && input.activePageKey) || "home");
  const available = (() => {
    if (!input || input.availablePages == null) return null;
    if (input.availablePages instanceof Set) return input.availablePages;
    if (Array.isArray(input.availablePages)) return new Set(input.availablePages);
    return null;
  })();
  const ministries = Array.isArray(input && input.ministries) ? input.ministries : [];
  const locations = Array.isArray(input && input.locations) ? input.locations : [];
  const locationCount =
    input && Number.isFinite(Number(input.locationCount))
      ? Number(input.locationCount)
      : locations.length;
  const hasGiving = input && input.hasGiving === false ? false : isPageVisible(available, "giving");
  const hasDirections = Boolean(input && input.hasDirections);
  const hasServiceTimes = Boolean(input && input.hasServiceTimes);

  function link(pageKey, labelOverride) {
    if (!isPageVisible(available, pageKey)) return null;
    return freezeItem({
      key: pageKey,
      label: labelOverride || PAGE_KEY_TITLES[pageKey] || pageKey,
      href: pageHref(pathPrefix, pageKey),
      isActive: activeKey === pageKey,
    });
  }

  /** @type {object[]} */
  const primaryItems = [];
  /** @type {object[]} */
  const footerItems = [];
  /** @type {object[]} */
  const mobileItems = [];

  const home = link("home", "Home");
  if (home) {
    primaryItems.push(home);
    mobileItems.push(home);
  }

  if (scopeType === "church") {
    const aboutChildren = [
      link("about", "About Us"),
      link("leadership", "Leadership"),
      link("contact", "Contact"),
    ].filter(Boolean);
    if (aboutChildren.length === 1 && aboutChildren[0].key === "about") {
      primaryItems.push(aboutChildren[0]);
    } else if (aboutChildren.length > 1) {
      primaryItems.push(
        freezeItem({
          key: "about-group",
          label: "About",
          href: null,
          isActive: isActiveKey(activeKey, ["about", "leadership", "contact"]),
          children: aboutChildren,
        })
      );
    } else if (aboutChildren.length === 1) {
      primaryItems.push(aboutChildren[0]);
    }
    aboutChildren.forEach((c) => mobileItems.push(c));

    const ministryPage = link("ministries", "View All Ministries");
    const ministryChildren = [];
    if (ministryPage) {
      const subset = ministries
        .filter((m) => m && String(m.name || "").trim())
        .slice(0, MAX_MINISTRY_DROPDOWN)
        .map((m, index) =>
          freezeItem({
            key: `ministry-${m.id || index}`,
            label: String(m.name).trim(),
            href: ministryPage.href,
            isActive: activeKey === "ministries",
          })
        );
      ministryChildren.push(...subset);
      ministryChildren.push(ministryPage);
    }
    if (ministryChildren.length > 1) {
      primaryItems.push(
        freezeItem({
          key: "ministries-group",
          label: "Ministries",
          href: null,
          isActive: activeKey === "ministries",
          children: ministryChildren,
        })
      );
    } else if (ministryPage) {
      primaryItems.push(
        freezeItem({
          key: "ministries",
          label: "Ministries",
          href: ministryPage.href,
          isActive: activeKey === "ministries",
        })
      );
    }
    if (ministryPage) mobileItems.push(link("ministries", "Ministries"));

    const mediaChildren = [
      link("sermons", "Sermons"),
      link("events", "Events"),
    ].filter(Boolean);
    if (mediaChildren.length > 1) {
      primaryItems.push(
        freezeItem({
          key: "media-group",
          label: "Media",
          href: null,
          isActive: isActiveKey(activeKey, ["sermons", "events"]),
          children: mediaChildren,
        })
      );
    } else if (mediaChildren.length === 1) {
      primaryItems.push(mediaChildren[0]);
    }
    mediaChildren.forEach((c) => mobileItems.push(c));

    if (locationCount > 1) {
      const locationChildren = locations
        .filter((loc) => loc && loc.websiteHref && loc.displayName)
        .slice(0, 8)
        .map((loc) =>
          freezeItem({
            key: `location-${loc.key || loc.displayName}`,
            label: String(loc.displayName),
            href: String(loc.websiteHref),
            isActive: Boolean(loc.isCurrent),
          })
        );
      if (locationChildren.length > 1) {
        // Keep Locations as a direct link when already at max dropdowns (About/Ministries/Media).
        primaryItems.push(
          freezeItem({
            key: "locations",
            label: "Locations",
            href: churchHomeHref === "/" ? "/#bb-tp-locations" : `${churchHomeHref}#bb-tp-locations`,
            isActive: false,
          })
        );
      } else {
        primaryItems.push(
          freezeItem({
            key: "locations",
            label: "Locations",
            href: churchHomeHref === "/" ? "/#bb-tp-locations" : `${churchHomeHref}#bb-tp-locations`,
            isActive: false,
          })
        );
      }
      mobileItems.push(
        freezeItem({
          key: "locations",
          label: "Locations",
          href: churchHomeHref === "/" ? "/#bb-tp-locations" : `${churchHomeHref}#bb-tp-locations`,
          isActive: false,
        })
      );
    } else if (isPageVisible(available, "contact")) {
      // Single location: product rule → contact / visit.
      const visit = link("contact", "Locations");
      if (visit) {
        primaryItems.push(
          freezeItem({
            key: "locations",
            label: "Locations",
            href: visit.href,
            isActive: activeKey === "contact",
          })
        );
      }
    }

    const leadership = link("leadership");
    const contact = link("contact");
    if (leadership) footerItems.push(leadership);
    if (contact) footerItems.push(freezeItem({ ...contact, label: "Contact" }));
    if (hasGiving) {
      const giving = link("giving", "Giving");
      if (giving) footerItems.push(giving);
    }
    footerItems.push(
      freezeItem({
        key: "locations-footer",
        label: "Branches",
        href: churchHomeHref === "/" ? "/#bb-tp-locations" : `${churchHomeHref}#bb-tp-locations`,
        isActive: false,
      })
    );
  } else {
    // Branch mini-site — max three dropdowns: About, Media, Visit.
    // Ministries stays a direct link to keep the dropdown budget.
    const aboutChildren = [
      link("about", "About Us"),
      link("leadership", "Leadership"),
      freezeItem({
        key: "main-church",
        label: "Main Church",
        href: churchHomeHref || "/",
        isActive: false,
      }),
    ].filter(Boolean);
    if (aboutChildren.length > 1) {
      primaryItems.push(
        freezeItem({
          key: "about-group",
          label: "About",
          href: null,
          isActive: isActiveKey(activeKey, ["about", "leadership"]),
          children: aboutChildren,
        })
      );
    } else if (aboutChildren.length === 1) {
      primaryItems.push(aboutChildren[0]);
    }
    aboutChildren.forEach((c) => mobileItems.push(c));

    const ministryPage = link("ministries", "Ministries");
    if (ministryPage) {
      primaryItems.push(ministryPage);
      mobileItems.push(ministryPage);
    }

    const mediaChildren = [
      link("sermons", "Sermons"),
      link("events", "Events"),
    ].filter(Boolean);
    if (mediaChildren.length > 1) {
      primaryItems.push(
        freezeItem({
          key: "media-group",
          label: "Media",
          href: null,
          isActive: isActiveKey(activeKey, ["sermons", "events"]),
          children: mediaChildren,
        })
      );
    } else if (mediaChildren.length === 1) {
      primaryItems.push(mediaChildren[0]);
    }
    mediaChildren.forEach((c) => mobileItems.push(c));

    const visitChildren = [];
    if (hasServiceTimes && isPageVisible(available, "contact")) {
      visitChildren.push(
        freezeItem({
          key: "service-times",
          label: "Service Times",
          href: `${pageHref(pathPrefix, "contact")}#bb-tp-service-times`,
          isActive: activeKey === "contact",
        })
      );
    }
    if (hasDirections) {
      visitChildren.push(
        freezeItem({
          key: "directions",
          label: "Directions",
          href: `${pageHref(pathPrefix, "contact")}#bb-tp-directions`,
          isActive: activeKey === "contact",
        })
      );
    }
    const contactLink = link("contact", "Contact");
    if (contactLink) visitChildren.push(contactLink);

    if (visitChildren.length > 1) {
      primaryItems.push(
        freezeItem({
          key: "visit-group",
          label: "Visit",
          href: null,
          isActive: activeKey === "contact",
          children: visitChildren,
        })
      );
    } else if (contactLink) {
      primaryItems.push(
        freezeItem({
          key: "visit",
          label: "Visit",
          href: contactLink.href,
          isActive: activeKey === "contact",
        })
      );
    }
    if (contactLink) {
      mobileItems.push(freezeItem({ ...contactLink, key: "contact", label: "Contact" }));
    }

    const leadership =
      aboutChildren.find((c) => c && c.key === "leadership") || link("leadership");
    if (leadership) footerItems.push(leadership);
    if (hasServiceTimes && contactLink) {
      footerItems.push(
        freezeItem({
          key: "service-times",
          label: "Service Times",
          href: `${contactLink.href}#bb-tp-service-times`,
          isActive: false,
        })
      );
    }
    if (contactLink) footerItems.push(freezeItem({ ...contactLink, label: "Contact" }));
    footerItems.push(
      freezeItem({
        key: "main-church",
        label: "Main Church Website",
        href: churchHomeHref || "/",
        isActive: false,
      })
    );
  }

  let ctaItem = null;
  if (hasGiving && isPageVisible(available, "giving")) {
    ctaItem = freezeItem({
      key: "giving",
      label: "Give",
      href: pageHref(pathPrefix, "giving"),
      isActive: activeKey === "giving",
      emphasized: true,
    });
    mobileItems.push(
      freezeItem({
        key: "giving",
        label: "Give",
        href: ctaItem.href,
        isActive: activeKey === "giving",
        emphasized: true,
      })
    );
  }

  // Deduplicate mobile items by key (preserve first).
  const seenMobile = new Set();
  const mobileDeduped = [];
  for (const item of mobileItems) {
    if (!item || seenMobile.has(item.key)) continue;
    seenMobile.add(item.key);
    mobileDeduped.push(item);
  }

  // Cap desktop primary at 6 (CTA counted separately in header actions).
  const primaryCapped = primaryItems.slice(0, 6);

  // Flat navItems for legacy consumers / edit-query rewrite (desktop-visible + CTA).
  const navItems = [];
  function collectLinks(items) {
    for (const item of items || []) {
      if (!item) continue;
      if (item.children && item.children.length) {
        collectLinks(item.children);
      } else if (item.href) {
        navItems.push(item);
      }
    }
  }
  collectLinks(primaryCapped);
  if (ctaItem) navItems.push(ctaItem);

  return Object.freeze({
    scopeType,
    primaryItems: Object.freeze(primaryCapped),
    ctaItem,
    footerItems: Object.freeze(footerItems),
    mobileItems: Object.freeze(mobileDeduped),
    navItems: Object.freeze(navItems),
  });
}

module.exports = {
  buildPublicWebsiteNavigation,
  pageHref,
  MAX_MINISTRY_DROPDOWN,
};
