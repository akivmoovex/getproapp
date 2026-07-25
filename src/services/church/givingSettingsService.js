"use strict";

function parseCategories(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || "").trim()).filter(Boolean);
      }
    } catch {
      /* fall through to line parsing */
    }
  }
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function categoriesToText(categories) {
  if (!Array.isArray(categories)) return "";
  return categories.join("\n");
}

function settingsFromForm(body) {
  const b = body || {};
  return {
    bank_name: String(b.bank_name || "").trim(),
    account_name: String(b.account_name || "").trim(),
    account_number: String(b.account_number || "").trim(),
    branch_code: String(b.branch_code || "").trim(),
    swift_code: String(b.swift_code || "").trim(),
    mobile_money_provider_1: String(b.mobile_money_provider_1 || "").trim(),
    mobile_money_number_1: String(b.mobile_money_number_1 || "").trim(),
    mobile_money_name_1: String(b.mobile_money_name_1 || "").trim(),
    mobile_money_provider_2: String(b.mobile_money_provider_2 || "").trim(),
    mobile_money_number_2: String(b.mobile_money_number_2 || "").trim(),
    mobile_money_name_2: String(b.mobile_money_name_2 || "").trim(),
    giving_categories_json: parseCategories(b.giving_categories),
    giving_instructions: String(b.giving_instructions || "").trim(),
    qr_code_label: String(b.qr_code_label || "").trim(),
    finance_contact_name: String(b.finance_contact_name || "").trim(),
    finance_contact_phone: String(b.finance_contact_phone || "").trim(),
  };
}

function formFromSettings(row) {
  const s = row || {};
  const categories = Array.isArray(s.giving_categories_json) ? s.giving_categories_json : [];
  return {
    bank_name: s.bank_name || "",
    account_name: s.account_name || "",
    account_number: s.account_number || "",
    branch_code: s.branch_code || "",
    swift_code: s.swift_code || "",
    mobile_money_provider_1: s.mobile_money_provider_1 || "",
    mobile_money_number_1: s.mobile_money_number_1 || "",
    mobile_money_name_1: s.mobile_money_name_1 || "",
    mobile_money_provider_2: s.mobile_money_provider_2 || "",
    mobile_money_number_2: s.mobile_money_number_2 || "",
    mobile_money_name_2: s.mobile_money_name_2 || "",
    giving_categories: categoriesToText(categories),
    giving_instructions: s.giving_instructions || "",
    qr_code_label: s.qr_code_label || "",
    finance_contact_name: s.finance_contact_name || "",
    finance_contact_phone: s.finance_contact_phone || "",
  };
}

function hasBankChannel(settings) {
  return Boolean(String(settings.account_number || "").trim());
}

function hasMobileChannel(settings) {
  return Boolean(String(settings.mobile_money_number_1 || "").trim());
}

function validateForPublish(settings) {
  if (!hasBankChannel(settings) && !hasMobileChannel(settings)) {
    return {
      ok: false,
      error: "Publish requires at least one giving channel: bank account or mobile money.",
    };
  }
  if (hasBankChannel(settings) && !String(settings.account_name || "").trim()) {
    return { ok: false, error: "Account name is required when an account number is provided." };
  }
  if (hasMobileChannel(settings) && !String(settings.mobile_money_name_1 || "").trim()) {
    return {
      ok: false,
      error: "Mobile money registered name is required when a mobile money number is provided.",
    };
  }
  return { ok: true };
}

const SETTINGS_TEXT_LIMITS = Object.freeze({
  bank_name: 120,
  account_name: 120,
  account_number: 64,
  branch_code: 64,
  swift_code: 32,
  mobile_money_provider_1: 80,
  mobile_money_number_1: 40,
  mobile_money_name_1: 120,
  mobile_money_provider_2: 80,
  mobile_money_number_2: 40,
  mobile_money_name_2: 120,
  giving_instructions: 4000,
  qr_code_label: 120,
  finance_contact_name: 120,
  finance_contact_phone: 40,
});

/**
 * Server-side length / shape checks for draft or publish (beyond publish channel rules).
 * @param {object} settings
 * @param {{ giving_categories?: string }} [form]
 */
function validateGivingSettingsFields(settings, form = {}) {
  for (const [key, max] of Object.entries(SETTINGS_TEXT_LIMITS)) {
    const value = String(settings[key] == null ? "" : settings[key]);
    if (value.length > max) {
      return { ok: false, error: `${key.replace(/_/g, " ")} is too long (max ${max} characters).` };
    }
  }
  const categories = Array.isArray(settings.giving_categories_json)
    ? settings.giving_categories_json
    : parseCategories(form.giving_categories);
  if (categories.length > 40) {
    return { ok: false, error: "Too many giving categories (maximum 40)." };
  }
  for (const cat of categories) {
    if (String(cat).length > 80) {
      return { ok: false, error: "Each giving category must be 80 characters or fewer." };
    }
  }
  return { ok: true };
}

/**
 * Channel readiness for Phase 6 settings UI (no payment-provider secrets).
 * @param {object | null} row
 * @param {object} form
 */
function describeGivingSettingsReadiness(row, form) {
  const settings = settingsFromForm(form || {});
  const status = row && row.status === "published" ? "published" : "draft";
  return {
    status,
    statusLabel: status === "published" ? "Published" : "Draft",
    hasBankChannel: hasBankChannel(settings),
    hasMobileChannel: hasMobileChannel(settings),
    categoryCount: Array.isArray(settings.giving_categories_json)
      ? settings.giving_categories_json.length
      : parseCategories(form && form.giving_categories).length,
    paymentProviderSupported: false,
    paymentProviderStatus: "unavailable",
    paymentProviderLabel:
      "Not available — BlessBoard does not connect payment providers on this page.",
    receiptsSupported: false,
    goalsSupported: false,
    anonymousPreferenceSupported: false,
    defaultCurrencyEditable: false,
    defaultCurrencyNote:
      "Monthly giving summaries use each record’s currency code (default ZMW). Changing display currency here is not supported and does not convert stored amounts.",
  };
}

function mobileMoneyEntries(settings) {
  if (!settings) return [];
  const entries = [];
  if (settings.mobile_money_number_1) {
    entries.push({
      provider: settings.mobile_money_provider_1 || "Mobile money",
      number: settings.mobile_money_number_1,
      name: settings.mobile_money_name_1,
    });
  }
  if (settings.mobile_money_number_2) {
    entries.push({
      provider: settings.mobile_money_provider_2 || "Mobile money",
      number: settings.mobile_money_number_2,
      name: settings.mobile_money_name_2,
    });
  }
  return entries;
}

function hasBankDetails(settings) {
  return Boolean(
    settings &&
      (String(settings.bank_name || "").trim() ||
        String(settings.account_name || "").trim() ||
        String(settings.account_number || "").trim())
  );
}

/**
 * @param {object | null} publishedSettings
 * @param {object | null} websiteFallback
 * @param {{ audience: 'public' | 'member', churchName?: string }} opts
 */
function prepareGivingDisplay(publishedSettings, websiteFallback, opts = {}) {
  const audience = opts.audience || "public";
  const churchName = opts.churchName || "the church";

  if (publishedSettings) {
    const categories = Array.isArray(publishedSettings.giving_categories_json)
      ? publishedSettings.giving_categories_json
      : [];
    const qrFromSettings = String(
      publishedSettings.giving_qr_url ||
        publishedSettings.qr_code_url ||
        publishedSettings.mobile_money_qr_url ||
        ""
    ).trim();
    return {
      source: "settings",
      hasPublishedSettings: true,
      givingInstructions: publishedSettings.giving_instructions || "",
      bank: hasBankDetails(publishedSettings)
        ? {
            bank_name: publishedSettings.bank_name,
            account_name: publishedSettings.account_name,
            account_number: publishedSettings.account_number,
            branch_code: publishedSettings.branch_code,
            swift_code: publishedSettings.swift_code,
          }
        : null,
      mobileMoney: mobileMoneyEntries(publishedSettings),
      categories,
      qrCodeLabel: publishedSettings.qr_code_label || "Scan to give",
      qrImageUrl: qrFromSettings || "",
      isDemoQr: false,
      financeContactName: publishedSettings.finance_contact_name || "",
      financeContactPhone: publishedSettings.finance_contact_phone || "",
    };
  }

  const wf = websiteFallback || {};
  const hasWebsiteGiving =
    wf.givingBankDetails ||
    wf.givingMobileMoney ||
    wf.givingCategories ||
    wf.givingInstructions ||
    wf.givingQrPlaceholder;

  const websiteQrRaw = String(wf.givingQrPlaceholder || "").trim();
  const websiteQrLooksLikeUrl =
    websiteQrRaw.startsWith("/") ||
    /^https?:\/\//i.test(websiteQrRaw) ||
    /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(websiteQrRaw);

  if (audience === "member") {
    return {
      source: "none",
      hasPublishedSettings: false,
      givingInstructions: "",
      bank: null,
      mobileMoney: [],
      categories: [],
      qrCodeLabel: "",
      qrImageUrl: "",
      isDemoQr: false,
      financeContactName: "",
      financeContactPhone: "",
    };
  }

  if (hasWebsiteGiving) {
    return {
      source: "website",
      hasPublishedSettings: false,
      givingInstructions: wf.givingInstructions || "",
      bank: null,
      mobileMoney: [],
      categories: [],
      qrCodeLabel: websiteQrLooksLikeUrl ? "Scan to give" : websiteQrRaw || "Scan to give",
      qrImageUrl: websiteQrLooksLikeUrl ? websiteQrRaw : "",
      isDemoQr: false,
      financeContactName: "",
      financeContactPhone: "",
      givingBankDetails: wf.givingBankDetails || "",
      givingMobileMoney: wf.givingMobileMoney || "",
      givingCategories: wf.givingCategories || "",
      givingQrPlaceholder: wf.givingQrPlaceholder || "",
    };
  }

  return {
    source: "generic",
    hasPublishedSettings: false,
    givingInstructions: `Your generosity supports ministry, outreach, and community care at ${churchName}. Contact the church office for giving details.`,
    bank: null,
    mobileMoney: [],
    categories: [],
    qrCodeLabel: "",
    qrImageUrl: "",
    isDemoQr: false,
    financeContactName: "",
    financeContactPhone: "",
  };
}

module.exports = {
  parseCategories,
  categoriesToText,
  settingsFromForm,
  formFromSettings,
  validateForPublish,
  validateGivingSettingsFields,
  describeGivingSettingsReadiness,
  prepareGivingDisplay,
  mobileMoneyEntries,
  SETTINGS_TEXT_LIMITS,
};
