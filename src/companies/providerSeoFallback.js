"use strict";

const { PRODUCT_NAME } = require("../platform/branding");
const { regionLabelForSeo } = require("../seo/seoLocale");
const {
  categorySingularTitleCase,
  categorySingularLower,
  clampSeoDescription,
  clampSeoTitle,
} = require("../seo/seoCopy");
const { mergeVoiceProfile, providerCategoryTitleSegment } = require("../seo/seoVoice");

const MIN_ABOUT_CHARS = 80;
/** Headline alone can carry the page without auto body copy */
const MIN_HEADLINE_ALONE = 88;
const MIN_META_LEN = 90;

function regionLabelFromCountryCode(cc) {
  const c = String(cc || "").trim().toUpperCase();
  if (!c || c === "XX" || !/^[A-Z]{2}$/.test(c)) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(c);
  } catch {
    return "";
  }
}

/**
 * True when the provider already supplied enough copy that we should not inject template SEO body copy.
 */
function hasSubstantialManualCopy(company) {
  const about = String(company.about || "").trim();
  const headline = String(company.headline || "").trim();
  if (about.length >= MIN_ABOUT_CHARS) return true;
  if (headline.length >= MIN_HEADLINE_ALONE) return true;
  if (about.length >= 40 && headline.length >= 50) return true;
  return false;
}

/**
 * @param {object} company
 * @param {number} [maxItems]
 * @param {number} [maxLen]
 */
function parseServicesSnippet(company, maxItems = 4, maxLen = 110) {
  const raw = String(company.services || "").trim();
  if (!raw) return "";
  const lines = raw.split(/\n/).map((s) => String(s).trim()).filter(Boolean);
  const items = lines.slice(0, maxItems);
  if (items.length === 0) return "";
  let out;
  if (items.length === 1) out = items[0];
  else if (items.length === 2) out = `${items[0]} and ${items[1]}`;
  else {
    const last = items[items.length - 1];
    out = `${items.slice(0, -1).join(", ")}, and ${last}`;
  }
  if (out.length > maxLen) return `${out.slice(0, maxLen - 1).trim()}…`;
  return out;
}

function buildManualMetaDescription(company, catName, productName, rc, av, cityPart, seoLocale = "en") {
  const headline = (company.headline || company.name || "").replace(/"/g, "");
  const n = Number(rc) || 0;
  const rating = av != null && !Number.isNaN(Number(av)) ? Number(av) : null;
  if (seoLocale === "he") {
    let seoDescription = `${headline} — ${catName} ב${productName}.`;
    if (cityPart) seoDescription += ` שירות ב${cityPart}.`;
    if (n > 0 && rating != null) {
      seoDescription += ` ממוצע ${rating.toFixed(1)}/5 מתוך ${n} ביקורות מאומתות.`;
    }
    return clampSeoDescription(seoDescription);
  }
  let seoDescription = `${headline} — ${catName} on ${productName}.`;
  if (cityPart) seoDescription += ` Serving ${cityPart}.`;
  if (n > 0 && rating != null) {
    seoDescription += ` ${rating.toFixed(1)}/5 average from ${n} verified reviews.`;
  }
  return clampSeoDescription(seoDescription);
}

/**
 * Template-based body intro when about/headline are missing or too short.
 */
function buildAutoIntroAndMeta(company, catName, cityLabel, productName, variation, seoLocale = "en") {
  const name = String(company.name || "").trim() || "This business";
  const cat = catName || "professional services";
  const catLower = cat.toLowerCase();
  const services = parseServicesSnippet(company);
  const rc = Number(company.review_count) || 0;
  const av = company.avg_rating != null && !Number.isNaN(Number(company.avg_rating)) ? Number(company.avg_rating) : null;
  const hasReviews = rc > 0 && av != null;

  if (seoLocale === "he") {
    const servicesMid = services ? ` מציעים שירותים מקצועיים: ${services}.` : ` מציעים שירותים מקצועיים בתחום ${catLower}.`;
    const ratingEnd = hasReviews
      ? ` דירוג גבוה מלקוחות (${av.toFixed(1)}/5 מתוך ${rc} ביקורות מאומתות).`
      : [
          " רישום מאומת — פרטי קשר בפרופיל זה.",
          " עיינו בפרופיל המאומת ליצירת קשר.",
          " חלק מרשת אנשי המקצוע המאומתים ב" + productName + ".",
        ][variation % 3];
    const openings = [
      `${name} הוא ספק ${cat} מהימן ב${cityLabel}.${servicesMid}${ratingEnd}`,
      `${name} מספק שירותי ${catLower} ב${cityLabel}.${servicesMid}${ratingEnd}`,
      `מחפשים ${catLower} ב${cityLabel}? ${name} הוא ספק מאומת.${servicesMid}${ratingEnd}`,
    ];
    const intro = openings[variation % openings.length];
    return { intro, meta: clampSeoDescription(intro) };
  }

  const servicesMid = services
    ? ` Offering professional ${services}.`
    : ` Offering professional ${catLower}.`;

  const ratingEnd = hasReviews
    ? ` Highly rated by clients (${av.toFixed(1)}/5 from ${rc} verified reviews).`
    : [
        " Verified listing — contact details on this profile.",
        " Browse this verified directory profile to get in touch.",
        " Part of the trusted professional network on " + productName + ".",
      ][variation % 3];

  const openings = [
    `${name} is a trusted ${cat} service provider in ${cityLabel}.${servicesMid}${ratingEnd}`,
    `${name} provides ${catLower} in ${cityLabel}.${servicesMid}${ratingEnd}`,
    `Looking for ${catLower} in ${cityLabel}? ${name} is a verified provider.${servicesMid}${ratingEnd}`,
  ];

  const intro = openings[variation % openings.length];
  return { intro, meta: clampSeoDescription(intro) };
}

function buildEnglishTemplateMeta({ name, catName, cityPart, brandName, voice }) {
  const v = mergeVoiceProfile(voice);
  const catSing = categorySingularLower(catName);
  const metaAdj = v.providerMetaAdj || "trusted";
  const offersAdj = v.providerOffersAdj || "trusted";
  if (cityPart && catSing) {
    return clampSeoDescription(
      `${name} is a ${metaAdj} ${catSing} in ${cityPart}. View services, profile details, and ratings on ${brandName}.`
    );
  }
  if (catSing) {
    return clampSeoDescription(
      `${name} offers ${offersAdj} ${catSing} services on ${brandName}. View profile details, services, and ratings.`
    );
  }
  return clampSeoDescription(`View ${name} on ${brandName}. Explore services, profile details, and customer ratings.`);
}

function buildEnglishTemplateTitle({ name, catName, cityPart, brandName, voice }) {
  const v = mergeVoiceProfile(voice);
  const catBase = categorySingularTitleCase(catName || "");
  const catSeg = providerCategoryTitleSegment(v, catBase);
  if (cityPart && catSeg) {
    return clampSeoTitle(`${name} | ${catSeg} in ${cityPart}`);
  }
  if (catSeg) {
    return clampSeoTitle(`${name} | ${catSeg} | ${brandName}`);
  }
  return clampSeoTitle(`${name} | Trusted Service Provider | ${brandName}`);
}

/**
 * @param {object} params
 * @param {object} params.company — row with name, headline, about, services, location, id, subdomain
 * @param {{ slug?: string, name?: string } | null} params.category
 * @param {string} [params.tenantName]
 * @param {string} [params.productName]
 * @param {number|string} params.reviewCount
 * @param {number|null} params.avgRating
 * @param {string} [params.clientCountryCode] — ISO2 from request
 * @param {'en'|'he'} [params.seoLocale]
 * @param {object} [params.seoVoice] — from getSeoVoiceProfile(req); English copy only
 */
function buildProviderMiniSiteSeo(params) {
  const {
    company,
    category,
    tenantName,
    productName = PRODUCT_NAME,
    reviewCount,
    avgRating,
    clientCountryCode,
    seoLocale = "en",
    seoVoice,
  } = params;

  const brandName = String(tenantName || productName || PRODUCT_NAME).trim() || PRODUCT_NAME;
  const catName = category && category.name ? category.name : "";
  const locRaw = (company.location || "").trim();
  const cityPart = locRaw ? locRaw.split(",")[0].trim() : "";
  const countryLabel =
    regionLabelForSeo(clientCountryCode || "XX", seoLocale === "he" ? "he" : "en") ||
    regionLabelFromCountryCode(clientCountryCode || "XX");
  const cityLabel = cityPart || countryLabel || tenantName || productName;
  const inPlace = cityPart || countryLabel || tenantName || productName;

  const rc = Number(reviewCount) || 0;
  const av = avgRating != null && !Number.isNaN(Number(avgRating)) ? Number(avgRating) : null;

  const about = String(company.about || "").trim();
  const manual = hasSubstantialManualCopy(company);

  const variation =
    (Number(company.id) * 31 +
      String(company.name || "").length +
      (company.subdomain ? String(company.subdomain).charCodeAt(0) : 7)) %
    6;

  let seoDescription;
  let showProviderSeoIntro = false;
  let providerSeoIntro = "";
  let providerSchemaDescription;
  let providerSeoUsedAuto = false;

  const name = String(company.name || "").trim() || "Business";

  if (seoLocale === "he") {
    let seoTitle =
      catName && cityPart
        ? `${company.name} – ${catName} ב${cityPart}`
        : catName
          ? `${company.name} – ${catName} ב${inPlace}`
          : `${company.name} – ${brandName}`;

    if (manual) {
      seoDescription = buildManualMetaDescription(company, catName || "שירותים מקצועיים", productName, rc, av, cityPart, "he");
      const headline = String(company.headline || "").trim();
      providerSchemaDescription = about.length ? about.slice(0, 800) : headline.slice(0, 800) || company.name;
      if (seoDescription.length < MIN_META_LEN && !about.length) {
        const extra = parseServicesSnippet(company);
        if (extra) {
          seoDescription = clampSeoDescription(`${seoDescription} שירותים: ${extra}.`);
        }
      }
    } else {
      providerSeoUsedAuto = true;
      const co = { ...company, review_count: rc, avg_rating: av };
      const { intro, meta } = buildAutoIntroAndMeta(co, catName || "שירותים מקצועיים", cityLabel, productName, variation, "he");
      seoDescription = meta;
      providerSeoIntro = intro;
      showProviderSeoIntro = true;
      providerSchemaDescription = intro.slice(0, 800);
    }

    return {
      seoTitle: clampSeoTitle(seoTitle),
      seoDescription,
      showProviderSeoIntro,
      providerSeoIntro,
      providerSchemaDescription,
      providerSeoUsedAuto,
    };
  }

  /** English: marketplace title templates */
  const seoTitle = buildEnglishTemplateTitle({
    name,
    catName: catName || "Service Provider",
    cityPart,
    brandName,
    voice: seoVoice,
  });

  if (about.length >= MIN_ABOUT_CHARS) {
    seoDescription = clampSeoDescription(about);
    providerSchemaDescription = about.slice(0, 800);
    const headline = String(company.headline || "").trim();
    if (!providerSchemaDescription) providerSchemaDescription = headline.slice(0, 800) || company.name;
  } else if (manual) {
    seoDescription = buildEnglishTemplateMeta({
      name,
      catName: catName || "service provider",
      cityPart,
      brandName,
      voice: seoVoice,
    });
    const headline = String(company.headline || "").trim();
    providerSchemaDescription = about.length ? about.slice(0, 800) : headline.slice(0, 800) || company.name;
    if (seoDescription.length < MIN_META_LEN) {
      const extra = parseServicesSnippet(company);
      if (extra) {
        seoDescription = clampSeoDescription(`${seoDescription} Services include: ${extra}.`);
      }
    }
  } else {
    providerSeoUsedAuto = true;
    const co = { ...company, review_count: rc, avg_rating: av };
    const { intro } = buildAutoIntroAndMeta(co, catName || "professional services", cityLabel, productName, variation, "en");
    providerSeoIntro = intro;
    showProviderSeoIntro = true;
    providerSchemaDescription = intro.slice(0, 800);
    seoDescription = buildEnglishTemplateMeta({
      name,
      catName: catName || "service provider",
      cityPart,
      brandName,
      voice: seoVoice,
    });
  }

  return {
    seoTitle,
    seoDescription,
    showProviderSeoIntro,
    providerSeoIntro,
    providerSchemaDescription,
    providerSeoUsedAuto,
  };
}

module.exports = {
  buildProviderMiniSiteSeo,
  hasSubstantialManualCopy,
  parseServicesSnippet,
};
