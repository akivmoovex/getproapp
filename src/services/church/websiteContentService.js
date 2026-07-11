"use strict";

function defaultLeadership() {
  return {
    pastor: { name: "", title: "", bio: "" },
    assistant_pastor: { name: "" },
    elders: [],
  };
}

function parseElderNames(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseMinistriesText(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      return {
        name: parts[0] || "",
        description: parts[1] || "",
        meeting_time: parts[2] || "",
      };
    })
    .filter((m) => m.name);
}

function ministriesToText(ministries) {
  if (!Array.isArray(ministries)) return "";
  return ministries
    .map((m) => [m.name, m.description, m.meeting_time].filter(Boolean).join(" | "))
    .join("\n");
}

function eldersToText(elders) {
  if (!Array.isArray(elders)) return "";
  return elders.join("\n");
}

function leadershipFromForm(body) {
  const b = body || {};
  return {
    pastor: {
      name: String(b.pastor_name || "").trim(),
      title: String(b.pastor_title || "").trim(),
      bio: String(b.pastor_bio || "").trim(),
    },
    assistant_pastor: {
      name: String(b.assistant_pastor_name || "").trim(),
    },
    elders: parseElderNames(b.elder_names),
  };
}

function formFromLeadership(leadership) {
  const l = leadership && typeof leadership === "object" ? leadership : defaultLeadership();
  const pastor = l.pastor || {};
  const assistant = l.assistant_pastor || {};
  return {
    pastor_name: pastor.name || "",
    pastor_title: pastor.title || "",
    pastor_bio: pastor.bio || "",
    assistant_pastor_name: assistant.name || "",
    elder_names: eldersToText(l.elders),
  };
}

function contentFromForm(body) {
  const b = body || {};
  return {
    homepage_hero_title: String(b.homepage_hero_title || "").trim(),
    homepage_hero_subtitle: String(b.homepage_hero_subtitle || "").trim(),
    welcome_message: String(b.welcome_message || "").trim(),
    service_times: String(b.service_times || "").trim(),
    location_text: String(b.location_text || "").trim(),
    about_title: String(b.about_title || "").trim(),
    about_body: String(b.about_body || "").trim(),
    mission_text: String(b.mission_text || "").trim(),
    vision_text: String(b.vision_text || "").trim(),
    values_text: String(b.values_text || "").trim(),
    leadership_json: leadershipFromForm(b),
    ministries_json: parseMinistriesText(b.ministries_entries),
    contact_phone: String(b.contact_phone || "").trim(),
    contact_email: String(b.contact_email || "").trim(),
    office_hours: String(b.office_hours || "").trim(),
    address: String(b.address || "").trim(),
    map_embed_placeholder: String(b.map_embed_placeholder || "").trim(),
    giving_bank_details: String(b.giving_bank_details || "").trim(),
    giving_mobile_money: String(b.giving_mobile_money || "").trim(),
    giving_categories: String(b.giving_categories || "").trim(),
    giving_instructions: String(b.giving_instructions || "").trim(),
    giving_qr_placeholder: String(b.giving_qr_placeholder || "").trim(),
    footer_message: String(b.footer_message || "").trim(),
  };
}

function formFromContent(content) {
  const c = content || {};
  const leadership = formFromLeadership(c.leadership_json);
  return {
    homepage_hero_title: c.homepage_hero_title || "",
    homepage_hero_subtitle: c.homepage_hero_subtitle || "",
    welcome_message: c.welcome_message || "",
    service_times: c.service_times || "",
    location_text: c.location_text || "",
    about_title: c.about_title || "",
    about_body: c.about_body || "",
    mission_text: c.mission_text || "",
    vision_text: c.vision_text || "",
    values_text: c.values_text || "",
    ministries_entries: ministriesToText(c.ministries_json),
    contact_phone: c.contact_phone || "",
    contact_email: c.contact_email || "",
    office_hours: c.office_hours || "",
    address: c.address || "",
    map_embed_placeholder: c.map_embed_placeholder || "",
    giving_bank_details: c.giving_bank_details || "",
    giving_mobile_money: c.giving_mobile_money || "",
    giving_categories: c.giving_categories || "",
    giving_instructions: c.giving_instructions || "",
    giving_qr_placeholder: c.giving_qr_placeholder || "",
    footer_message: c.footer_message || "",
    ...leadership,
  };
}

function buildBranchFallbacks(org, branch) {
  const organizationName = (org && org.name) || "";
  const branchName = (branch && branch.name) || "";
  const churchName = branchName || organizationName || "Our Church";
  const heroTitle = organizationName ? `Welcome to ${organizationName}` : `Welcome to ${churchName}`;
  return {
    homepage_hero_title: heroTitle,
    homepage_hero_subtitle: "Welcome home",
    welcome_message:
      (branch && branch.welcome_message) ||
      `Welcome to ${churchName}. We are glad you are here and would love to connect with you.`,
    service_times: (branch && branch.service_times) || "",
    location_text: (branch && branch.location_text) || "",
    about_title: `About ${churchName}`,
    about_body: `We are a Christ-centered community serving ${churchName}.`,
    mission_text: "",
    vision_text: "",
    values_text: "",
    leadership_json: defaultLeadership(),
    ministries_json: [],
    contact_phone: (branch && (branch.contact_phone || branch.contactPhone)) || "",
    contact_email: (branch && (branch.contact_email || branch.contactEmail)) || "",
    office_hours: "",
    address: (branch && branch.location_text) || "",
    map_embed_placeholder: "",
    giving_bank_details: "",
    giving_mobile_money: "",
    giving_categories: "",
    giving_instructions: "",
    giving_qr_placeholder: "",
    footer_message: "Member registration and login are available on your branch church site.",
  };
}

function mergeWithFallbacks(content, org, branch) {
  const fallbacks = buildBranchFallbacks(org, branch);
  const c = content || {};
  const pick = (key) => {
    const val = c[key];
    if (val === null || val === undefined) return fallbacks[key];
    if (typeof val === "string" && !val.trim()) return fallbacks[key];
    return val;
  };
  const leadership =
    c.leadership_json && typeof c.leadership_json === "object"
      ? c.leadership_json
      : fallbacks.leadership_json;
  const ministries = Array.isArray(c.ministries_json) ? c.ministries_json : fallbacks.ministries_json;

  return {
    ...fallbacks,
    ...c,
    homepage_hero_title: pick("homepage_hero_title"),
    homepage_hero_subtitle: pick("homepage_hero_subtitle"),
    welcome_message: pick("welcome_message"),
    service_times: pick("service_times"),
    location_text: pick("location_text"),
    about_title: pick("about_title"),
    about_body: pick("about_body"),
    mission_text: c.mission_text || "",
    vision_text: c.vision_text || "",
    values_text: c.values_text || "",
    leadership_json: leadership,
    ministries_json: ministries,
    contact_phone: String(c.contact_phone || "").trim() || fallbacks.contact_phone || "",
    contact_email: String(c.contact_email || "").trim() || fallbacks.contact_email || "",
    office_hours: String(c.office_hours || "").trim() || fallbacks.office_hours || "",
    address: pick("address"),
    map_embed_placeholder: String(c.map_embed_placeholder || "").trim() || fallbacks.map_embed_placeholder || "",
    giving_bank_details: c.giving_bank_details || "",
    giving_mobile_money: c.giving_mobile_money || "",
    giving_categories: pick("giving_categories"),
    giving_instructions: pick("giving_instructions"),
    giving_qr_placeholder: c.giving_qr_placeholder || "",
    footer_message: pick("footer_message"),
  };
}

function validateForPublish(content) {
  const title = String(content.homepage_hero_title || "").trim();
  const welcome = String(content.welcome_message || "").trim();
  if (!title) {
    return { ok: false, error: "Homepage hero title is required before publishing." };
  }
  if (!welcome) {
    return { ok: false, error: "Welcome message is required before publishing." };
  }
  return { ok: true };
}

function resolveChurchLogoUrl(org, branch) {
  const candidates = [
    org && org.logo_url,
    org && org.logoUrl,
    branch && branch.logo_url,
    branch && branch.logoUrl,
  ];
  for (const raw of candidates) {
    const url = String(raw || "").trim();
    if (!url) continue;
    if (url.startsWith("/") && !url.startsWith("//")) return url;
    if (/^https:\/\//i.test(url)) return url;
  }
  return "";
}

function preparePublicViewModel(org, branch, content, extra = {}) {
  const merged = mergeWithFallbacks(content, org, branch);
  const organizationName = (org && org.name) || "";
  const branchName = (branch && branch.name) || "";
  const churchName = branchName || organizationName || "Our Church";
  const leadership = merged.leadership_json || defaultLeadership();
  return {
    pageTitle: merged.homepage_hero_title || churchName,
    churchName,
    organizationName,
    branchName,
    churchLogoUrl: resolveChurchLogoUrl(org, branch),
    heroTitle: merged.homepage_hero_title || churchName,
    heroSubtitle: merged.homepage_hero_subtitle || "",
    welcomeMessage: merged.welcome_message,
    serviceTimes: merged.service_times,
    locationText: merged.location_text,
    footerMessage: merged.footer_message,
    aboutTitle: merged.about_title,
    aboutBody: merged.about_body,
    missionText: merged.mission_text,
    visionText: merged.vision_text,
    valuesText: merged.values_text,
    leadership,
    ministries: merged.ministries_json || [],
    contactPhone: merged.contact_phone,
    contactEmail: merged.contact_email,
    officeHours: merged.office_hours,
    address: merged.address,
    mapEmbedPlaceholder: merged.map_embed_placeholder,
    givingBankDetails: merged.giving_bank_details,
    givingMobileMoney: merged.giving_mobile_money,
    givingCategories: merged.giving_categories,
    givingInstructions: merged.giving_instructions,
    givingQrPlaceholder: merged.giving_qr_placeholder,
    givingTeaser: merged.giving_instructions,
    isVerticalApex: false,
    activePage: extra.activePage || "home",
    isPreview: Boolean(extra.isPreview),
    ...(extra || {}),
  };
}

module.exports = {
  defaultLeadership,
  contentFromForm,
  formFromContent,
  buildBranchFallbacks,
  mergeWithFallbacks,
  validateForPublish,
  preparePublicViewModel,
  ministriesToText,
};
