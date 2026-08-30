"use strict";

const { appendQuery } = require("../../platform/website/publicWebsiteUrl");
const { isPublicClinicDirectoryNavEnabled } = require("./activeClinicPublicCapabilities");
const { navCustomPages, publicPageHref, PAGE_STATUS } = require("./clinicWebsiteCms");

const CONTENT_ITEMS = Object.freeze([
  {
    key: "about",
    defaultLabel: "About",
    labelKey: "nav.about.label",
    pageKey: "about",
    hideable: false,
    surfaces: ["desktop", "drawer"],
  },
  {
    key: "doctors",
    defaultLabel: "Doctors",
    labelKey: "nav.doctors.label",
    pageKey: "doctors",
    hideable: true,
    visibilityKey: "page.doctors.visible",
    surfaces: ["desktop", "drawer", "footerQuick", "bottom"],
  },
  {
    key: "services",
    defaultLabel: "Services",
    labelKey: "nav.services.label",
    pageKey: "services",
    hideable: false,
    surfaces: ["desktop", "drawer", "footerQuick"],
  },
  {
    key: "pricing",
    defaultLabel: "Pricing",
    labelKey: "nav.pricing.label",
    pageKey: "pricing",
    hideable: true,
    visibilityKey: "page.pricing.visible",
    surfaces: ["desktop", "drawer"],
  },
  {
    key: "location",
    defaultLabel: "Location",
    labelKey: "nav.location.label",
    pageKey: "location",
    hideable: false,
    surfaces: ["drawer"],
  },
  {
    key: "contact",
    defaultLabel: "Contact",
    labelKey: "nav.contact.label",
    pageKey: "contact",
    hideable: false,
    surfaces: ["desktop", "drawer"],
  },
  {
    key: "patientInformation",
    defaultLabel: "Patient information",
    labelKey: "nav.patient_information.label",
    pageKey: "patientInformation",
    hideable: true,
    visibilityKey: "page.patient_information.visible",
    surfaces: ["drawer"],
  },
]);

const SYSTEM_ITEMS = Object.freeze([
  {
    key: "book",
    defaultLabel: "Book Appointment",
    requestLabel: "Request Appointment",
    pageKey: "book",
    kind: "system",
    surfaces: ["desktop", "drawer", "footerQuick", "bottom"],
  },
  {
    key: "myBooking",
    defaultLabel: "My booking",
    pageKey: "myBooking",
    kind: "system",
    surfaces: ["drawer"],
  },
  {
    key: "patientLogin",
    defaultLabel: "Login",
    drawerLabel: "Patient portal",
    pageKey: "patientLogin",
    kind: "system",
    surfaces: ["desktop", "drawer", "bottom"],
  },
]);

const DIRECTORY_LABELS = Object.freeze(["Find", "Find a clinic", "All clinics", "ActiveClinic directory"]);

function pageHref(clinic, pageKey) {
  const pages = (clinic && clinic.publicPagePaths) || {};
  if (pages[pageKey]) return String(pages[pageKey]);
  const home =
    pages.home ||
    (clinic && clinic.publicBasePath) ||
    (clinic && clinic.clinicKey ? `/clinics/${clinic.clinicKey}` : "");
  if (!home) return "";
  if (!pageKey || pageKey === "home") return home;
  const extras = {
    privacy: "/privacy",
    terms: "/terms",
    patientLogin: "/patient/login",
    myBooking: "/my-booking",
    patientInformation: "/patient-information",
  };
  return home + (extras[pageKey] || `/${pageKey}`);
}

function labelFor(clinic, item, surface) {
  const values = (clinic && clinic.websiteContent) || {};
  if (item.labelKey && values[item.labelKey]) return String(values[item.labelKey]);
  if (item.key === "book") {
    return clinic && clinic.publicBookingEnabled ? item.defaultLabel : item.requestLabel;
  }
  if (item.key === "patientLogin" && surface === "drawer" && item.drawerLabel) {
    return item.drawerLabel;
  }
  if (item.key === "patientLogin" && surface === "bottom") return "Account";
  if (item.key === "book" && surface === "bottom") {
    return clinic && clinic.publicBookingEnabled ? "Book" : "Request";
  }
  return item.defaultLabel;
}

function isContentVisible(clinic, item) {
  if (!item.hideable) return true;
  if (item.key === "doctors") return clinic && clinic.showDoctors !== false;
  if (item.key === "pricing") return clinic && clinic.showPricing !== false;
  if (item.key === "patientInformation") return clinic && clinic.showPatientInformation !== false;
  return true;
}

function withSurfaceQuery(href, query) {
  if (!href || !query || !Object.keys(query).length) return href;
  return appendQuery(href, query);
}

function buildItem(clinic, item, surface, query) {
  return {
    key: item.key,
    kind: item.kind || "content",
    label: labelFor(clinic, item, surface),
    labelKey: item.kind === "system" ? null : item.labelKey || null,
    href: withSurfaceQuery(pageHref(clinic, item.pageKey || item.key), query),
    hideable: item.hideable === true,
    visibilityKey: item.visibilityKey || null,
    protected: item.kind === "system" || item.kind === "platform",
  };
}

function cmsPageForKey(clinic, pageKey) {
  const pages = Array.isArray(clinic && clinic.cmsPages) ? clinic.cmsPages : [];
  return pages.find((page) => page && (page.template_key === pageKey || page.slug === pageKey)) || null;
}

function isCmsNavVisible(clinic, item) {
  if (!isContentVisible(clinic, item)) return false;
  const cms = cmsPageForKey(clinic, item.key);
  if (!cms) return true;
  if (cms.status === PAGE_STATUS.HIDDEN) return false;
  if (cms.in_nav === false) return false;
  return true;
}

function customNavItems(clinic, surface, query) {
  if (surface !== "desktop" && surface !== "drawer") return [];
  const pages = navCustomPages(clinic && clinic.cmsPages);
  const key = clinic && clinic.clinicKey;
  return pages.map((page) => ({
    key: `custom_${page.id}`,
    kind: "content",
    label: page.nav_label || page.title,
    labelKey: null,
    href: withSurfaceQuery(publicPageHref(key, page), query),
    hideable: true,
    visibilityKey: null,
    protected: false,
    sortOrder: Number(page.sort_order) || 0,
  }));
}

function itemsForSurface(clinic, surface, query) {
  const content = CONTENT_ITEMS.filter((item) => item.surfaces.includes(surface))
    .filter((item) => isCmsNavVisible(clinic, item))
    .map((item) => {
      const built = buildItem(clinic, item, surface, query);
      const cms = cmsPageForKey(clinic, item.key);
      if (cms && cms.nav_label) built.label = cms.nav_label;
      built.sortOrder = cms ? Number(cms.sort_order) || 0 : 50;
      return built;
    })
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const custom = customNavItems(clinic, surface, query);
  const system = SYSTEM_ITEMS.filter((item) => item.surfaces.includes(surface)).map((item) =>
    buildItem(clinic, item, surface, query)
  );
  if (surface === "desktop") {
    const merged = [...content, ...custom].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    return [...merged, ...system.filter((item) => item.key === "patientLogin" || item.key === "book")];
  }
  if (surface === "footerQuick") {
    return content.concat(system.filter((item) => item.key === "book"));
  }
  if (surface === "bottom") {
    const home = {
      key: "home",
      kind: "content",
      label: "Home",
      labelKey: null,
      href: withSurfaceQuery(pageHref(clinic, "home"), query),
      hideable: false,
      protected: true,
    };
    const doctors = content.find((item) => item.key === "doctors");
    const book = system.find((item) => item.key === "book");
    const account = system.find((item) => item.key === "patientLogin");
    return [home, doctors, book, account].filter(Boolean);
  }
  return [...content, ...custom, ...system];
}

function buildClinicWebsiteNav(clinic, options) {
  const opts = options && typeof options === "object" ? options : {};
  const env = opts.env || null;
  const directoryEnabled = isPublicClinicDirectoryNavEnabled(env);
  const query = opts.linkQuery && typeof opts.linkQuery === "object" ? opts.linkQuery : {};
  const platformHome = {
    key: "platformHome",
    kind: "platform",
    label: "Back to ActiveClinic",
    labelKey: null,
    href: "/",
    hideable: false,
    protected: true,
  };
  const directory = {
    key: "directory",
    kind: "platform",
    label: "All clinics",
    labelKey: null,
    href: "/clinics",
    hideable: false,
    protected: true,
  };
  const drawer = itemsForSurface(clinic, "drawer", query);
  if (directoryEnabled) {
    drawer.push(platformHome, directory);
  } else {
    drawer.push(platformHome);
  }
  const footerLegal = [
    {
      key: "privacy",
      kind: "platform",
      label: "Privacy Policy",
      href: withSurfaceQuery(pageHref(clinic, "privacy"), query),
      protected: true,
    },
    {
      key: "terms",
      kind: "platform",
      label: "Terms of Service",
      href: withSurfaceQuery(pageHref(clinic, "terms"), query),
      protected: true,
    },
    {
      key: "patientLogin",
      kind: "system",
      label: "Patient Portal",
      href: withSurfaceQuery(pageHref(clinic, "patientLogin"), query),
      protected: true,
    },
    {
      key: "contact",
      kind: "content",
      label: "Contact Us",
      href: withSurfaceQuery(pageHref(clinic, "contact"), query),
      protected: false,
    },
  ];
  if (directoryEnabled) {
    footerLegal.push({
      key: "directory",
      kind: "platform",
      label: "ActiveClinic directory",
      href: "/clinics",
      protected: true,
    });
  }
  return {
    directoryNavEnabled: directoryEnabled,
    desktop: itemsForSurface(clinic, "desktop", query),
    drawer,
    footerQuick: itemsForSurface(clinic, "footerQuick", query),
    footerLegal,
    bottom: itemsForSurface(clinic, "bottom", query),
    editorItems: CONTENT_ITEMS.map((item) => ({
      key: item.key,
      label: labelFor(clinic, item, "desktop"),
      labelKey: item.labelKey,
      hideable: item.hideable === true,
      visibilityKey: item.visibilityKey || null,
      visible: isContentVisible(clinic, item),
      protected: false,
    })),
    protectedKeys: SYSTEM_ITEMS.map((item) => item.key).concat(["platformHome", "privacy", "terms"]),
  };
}

function clinicWebsiteLinkQuery(options) {
  const opts = options && typeof options === "object" ? options : {};
  if (opts.previewVersionId) {
    return { website_preview_version: String(opts.previewVersionId) };
  }
  if (opts.websiteEdit) {
    return { website_edit: "1", website_mode: "draft" };
  }
  if (opts.previewDraftMode) {
    return { website_mode: "draft" };
  }
  return {};
}

module.exports = {
  CONTENT_ITEMS,
  SYSTEM_ITEMS,
  DIRECTORY_LABELS,
  buildClinicWebsiteNav,
  clinicWebsiteLinkQuery,
  pageHref,
};
