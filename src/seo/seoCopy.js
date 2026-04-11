"use strict";

const { mergeVoiceProfile } = require("./seoVoice");

/**
 * Marketplace SEO copy (titles + meta + optional H1). Server-side only; no translation APIs.
 * English strings follow product templates; Hebrew mirrors intent for `seoLocale === 'he'`.
 * Pass optional `voice` (from getSeoVoiceProfile) to vary tone without duplicating structure.
 */

/** Soft cap for titles (~60 chars); avoids awkward mid-word cuts. */
function clampSeoTitle(s, max = 60) {
  const t = String(s || "")
    .replace(/\s+/g, " ")
    .replace(/\s*\|\s*/g, " | ")
    .trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  const base = sp > 40 ? cut.slice(0, sp) : cut;
  return `${base.trimEnd()}…`;
}

function clampSeoDescription(s, max = 160) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

/**
 * Plural label for listing titles (e.g. "Electrician" → "Electricians").
 */
function categoryPluralForListing(name) {
  const t = String(name || "").trim();
  if (!t) return "Service Providers";
  const low = t.toLowerCase();
  if (low === "professional services" || low.endsWith(" services")) return t;
  if (/[^s]s$/i.test(t) && !/ss$/i.test(t)) return t;
  if (/y$/i.test(t) && /[bcdfghjklmnpqrstvwxz]y$/i.test(t)) return `${t.slice(0, -1)}ies`;
  return `${t}s`;
}

/**
 * Singular job/category label for provider titles (e.g. "Electricians" → "Electrician").
 */
function categorySingularTitleCase(name) {
  const t = String(name || "").trim();
  if (!t) return "Service Provider";
  const low = t.toLowerCase();
  let core = t;
  if (low.endsWith("ies") && t.length > 3) core = `${t.slice(0, -3)}y`;
  else if (/[^s]s$/i.test(t) && t.length > 3 && !/ss$/i.test(t)) core = t.slice(0, -1);
  return core.charAt(0).toUpperCase() + core.slice(1);
}

/**
 * Lowercase singular for sentences ("trusted electrician").
 */
function categorySingularLower(name) {
  return categorySingularTitleCase(name).toLowerCase();
}

/**
 * Lowercase plural for meta ("compare trusted electricians").
 */
function categoryPluralLower(name) {
  return categoryPluralForListing(name).toLowerCase();
}

/**
 * A. Homepage — primary vs alternative when country/region is known.
 * @param {'en' | 'he'} locale
 * @param {{ brandName: string, countryOrTenant?: string, voice?: object }} opts — use alternative when `countryOrTenant` is non-empty
 */
function homePage(locale, { brandName, countryOrTenant, voice }) {
  const v = mergeVoiceProfile(voice);
  const brand = String(brandName || "").trim() || "Pro-online";
  const loc = String(countryOrTenant || "").trim();
  if (locale === "he") {
    if (loc) {
      return {
        title: clampSeoTitle(`מצאו נותני שירות מהימנים ב${loc} | ${brand}`),
        description: clampSeoDescription(
          `מצאו נותני שירות מהימנים ב${loc} ב${brand}. השוו פרופילים, דירוגים ושירותים כדי לבחור באנשי המקצוע הנכונים.`
        ),
      };
    }
    return {
      title: clampSeoTitle(`${brand} | מצאו נותני שירות מהימנים לידכם`),
      description: clampSeoDescription(
        `מצאו נותני שירות מהימנים ב${brand}. השוו פרופילים, דירוגים ושירותים כדי לבחור באיש המקצוע המתאים לידכם.`
      ),
    };
  }
  if (loc) {
    return {
      title: clampSeoTitle(`${v.homeTitleLead} Service Providers in ${loc} | ${brand}`),
      description: clampSeoDescription(
        `${v.metaFindOpen} service providers in ${loc} on ${brand}. Compare profiles, ratings, and services to choose the right professional.`
      ),
    };
  }
  return {
    title: clampSeoTitle(`${brand} | ${v.homeTitleLead} Service Providers Near You`),
    description: clampSeoDescription(
      `${v.metaFindOpen} service providers on ${brand}. Compare profiles, ratings, and services to choose the right professional near you.`
    ),
  };
}

/** B. Directory main (no city/search/category filters). */
function directoryMain(locale, brandName, voice) {
  const v = mergeVoiceProfile(voice);
  const brand = String(brandName || "").trim() || "Pro-online";
  if (locale === "he") {
    return {
      title: clampSeoTitle(`נותני שירות מובילים | ${brand}`),
      description: clampSeoDescription(
        `עיינו בנותני שירות מהימנים ב${brand}. גלו פרופילים, דירוגים ושירותים כדי למצוא את ההתאמה הנכונה לצרכים שלכם.`
      ),
    };
  }
  return {
    title: clampSeoTitle(`${v.listingTitleLead} Service Providers | ${brand}`),
    description: clampSeoDescription(
      `${v.metaBrowseOpen} service providers on ${brand}. Explore profiles, ratings, and services to find the right match for your needs.`
    ),
  };
}

/** D. City-only filter on /directory (city query, no search text). */
function directoryCityPage(locale, { city, brandName, voice }) {
  const v = mergeVoiceProfile(voice);
  const brand = String(brandName || "").trim() || "Pro-online";
  const c = String(city || "").trim();
  if (locale === "he") {
    return {
      title: clampSeoTitle(`נותני שירות מובילים ב${c} | ${brand}`),
      description: clampSeoDescription(
        `מצאו נותני שירות מהימנים ב${c} ב${brand}. עיינו בפרופילים, בדירוגים ובשירותים כדי לבחור באיש המקצוע המתאים.`
      ),
    };
  }
  return {
    title: clampSeoTitle(`${v.listingTitleLead} Service Providers in ${c} | ${brand}`),
    description: clampSeoDescription(
      `${v.metaFindOpen} service providers in ${c} on ${brand}. Browse profiles, ratings, and services to choose the right professional.`
    ),
  };
}

/**
 * C. Category page (/category and directory category-only).
 */
function categoryPage(locale, { categoryName, brandName, voice }) {
  const v = mergeVoiceProfile(voice);
  const brand = String(brandName || "").trim() || "Pro-online";
  const plural = categoryPluralForListing(categoryName);
  if (locale === "he") {
    return {
      title: clampSeoTitle(`מובילים בתחום ${plural} | ${brand}`),
      description: clampSeoDescription(
        `השוו ${plural.toLowerCase()} מהימנים ב${brand}. עיינו בפרופילים, בדירוגים ובשירותים כדי לבחור בנותן השירות המתאים.`
      ),
    };
  }
  return {
    title: clampSeoTitle(`${v.listingTitleLead} ${plural} | ${brand}`),
    description: clampSeoDescription(
      `${v.metaCompareOpen} ${categoryPluralLower(categoryName)} on ${brand}. Browse profiles, ratings, and services to choose the right provider.`
    ),
  };
}

/**
 * E. Category + city (directory narrow, /services/...).
 */
function categoryCityLanding(locale, { categoryName, city, brandName, voice }) {
  const v = mergeVoiceProfile(voice);
  const brand = String(brandName || "").trim() || "Pro-online";
  const plural = categoryPluralForListing(categoryName);
  const c = String(city || "").trim();
  if (locale === "he") {
    const title = `מובילים בתחום ${plural} ב${c} | ${brand}`;
    return {
      title: clampSeoTitle(title),
      description: clampSeoDescription(
        `מצאו ${plural.toLowerCase()} מהימנים ב${c} ב${brand}. השוו פרופילים, דירוגים ושירותים כדי לבחור בנותן השירות המתאים.`
      ),
      h1: `מובילים בתחום ${plural} ב${c}`,
    };
  }
  return {
    title: clampSeoTitle(`${v.listingTitleLead} ${plural} in ${c} | ${brand}`),
    description: clampSeoDescription(
      `${v.metaFindOpen} ${categoryPluralLower(categoryName)} in ${c} on ${brand}. Compare profiles, ratings, and services to choose the right provider.`
    ),
    h1: `${v.listingTitleLead} ${plural} in ${c}`,
  };
}

/**
 * F. Featured providers (home_featured flows; page may be noindex — copy stays consistent).
 * Optional: categoryName, city (both, one, or neither).
 */
function directoryFeatured(locale, brandName, opts = {}) {
  const brand = String(brandName || "").trim() || "Pro-online";
  const categoryName = opts.categoryName != null ? String(opts.categoryName).trim() : "";
  const city = opts.city != null ? String(opts.city).trim() : "";
  const plural = categoryName ? categoryPluralForListing(categoryName) : "";

  if (locale === "he") {
    if (plural && city) {
      return {
        title: clampSeoTitle(`נותני שירות מומלצים — ${plural} ב${city} | ${brand}`),
        description: clampSeoDescription(
          `עיינו ב${plural.toLowerCase()} המומלצים ב${city} ב${brand}. גלו אנשי מקצוע נבחרים, השוו פרופילים, דירוגים ושירותים.`
        ),
      };
    }
    if (plural) {
      return {
        title: clampSeoTitle(`נותני שירות מומלצים — ${plural} | ${brand}`),
        description: clampSeoDescription(
          `עיינו בנותני שירות מומלצים ב${brand}. גלו אנשי מקצוע נבחרים, השוו פרופילים ומצאו נותן שירות מהימן לצרכים שלכם.`
        ),
      };
    }
    if (city) {
      return {
        title: clampSeoTitle(`נותני שירות מומלצים ב${city} | ${brand}`),
        description: clampSeoDescription(
          `עיינו בנותני שירות מומלצים ב${city} ב${brand}. גלו אנשי מקצוע נבחרים, השוו פרופילים ומצאו נותן שירות מהימן.`
        ),
      };
    }
    return {
      title: clampSeoTitle(`נותני שירות מומלצים | ${brand}`),
      description: clampSeoDescription(
        `עיינו בנותני שירות מומלצים ב${brand}. גלו אנשי מקצוע נבחרים, השוו פרופילים ומצאו נותן שירות מהימן לצרכים שלכם.`
      ),
    };
  }

  if (plural && city) {
    return {
      title: clampSeoTitle(`Featured ${plural} in ${city} | ${brand}`),
      description: clampSeoDescription(
        `Browse featured ${categoryPluralLower(categoryName)} in ${city} on ${brand}. Explore selected professionals and compare profiles, ratings, and services.`
      ),
    };
  }
  if (plural) {
    return {
      title: clampSeoTitle(`Featured ${plural} | ${brand}`),
      description: clampSeoDescription(
        `Browse featured ${categoryPluralLower(categoryName)} on ${brand}. Explore selected professionals, compare profiles, and find a trusted provider for your needs.`
      ),
    };
  }
  if (city) {
    return {
      title: clampSeoTitle(`Featured Service Providers in ${city} | ${brand}`),
      description: clampSeoDescription(
        `Browse featured service providers on ${brand}. Explore selected professionals, compare profiles, and find a trusted provider for your needs.`
      ),
    };
  }
  return {
    title: clampSeoTitle(`Featured Service Providers | ${brand}`),
    description: clampSeoDescription(
      `Browse featured service providers on ${brand}. Explore selected professionals, compare profiles, and find a trusted provider for your needs.`
    ),
  };
}

function directoryFeaturedEmpty(locale, brandName, opts = {}) {
  return directoryFeatured(locale, brandName, opts);
}

/** Legacy name: category + city on /directory before redirect to /services */
function directoryCategoryCity(locale, ctx) {
  return categoryCityLanding(locale, {
    categoryName: ctx.catName,
    city: ctx.cityQ,
    brandName: ctx.platformName,
    voice: ctx.voice,
  });
}

/** Category selected, no city (or with city+search): listing by category */
function directoryCategoryOnly(locale, ctx) {
  return categoryPage(locale, {
    categoryName: ctx.catName,
    brandName: ctx.platformName,
    voice: ctx.voice,
  });
}

/** Search text and/or combined filters (not city-only). */
function directorySearch(locale, { qPart, platformName, cityQ, locationLabel, voice }) {
  const v = mergeVoiceProfile(voice);
  const brand = String(platformName || "").trim() || "Pro-online";
  const q = String(qPart || "services").trim();
  const loc = String(locationLabel || "").trim() || brand;
  if (locale === "he") {
    return {
      title: clampSeoTitle(`חיפוש: ${q} ב${loc} | ${brand}`),
      description: clampSeoDescription(
        `חיפוש במדריך ב${brand}${cityQ ? ` ב${cityQ}` : ""}. השוו נותני שירות מהימנים ומצאו התאמה לצרכים שלכם.`
      ),
    };
  }
  return {
    title: clampSeoTitle(`Top ${q} Service Providers in ${loc} | ${brand}`),
    description: clampSeoDescription(
      `${v.metaFindOpen} ${q.toLowerCase()} providers in ${loc} on ${brand}. Compare profiles, ratings, and services to choose the right professional.`
    ),
  };
}

/** H. Article / guide detail */
function articlePage(locale, { articleTitle, brandName }) {
  const brand = String(brandName || "").trim() || "Pro-online";
  const t = String(articleTitle || "").trim() || "Article";
  if (locale === "he") {
    return {
      title: clampSeoTitle(`${t} | ${brand}`),
      description: clampSeoDescription(`קראו את ${t} ב${brand}. טיפים, תובנות והכוונה מעשית.`),
    };
  }
  return {
    title: clampSeoTitle(`${t} | ${brand}`),
    description: clampSeoDescription(`Read ${t} on ${brand}. Get useful tips, insights, and practical guidance.`),
  };
}

/** Back-compat alias for /services/:cat/:city */
const servicesLanding = categoryCityLanding;

module.exports = {
  clampSeoTitle,
  clampSeoDescription,
  categoryPluralForListing,
  categoryPluralLower,
  categorySingularTitleCase,
  categorySingularLower,
  homePage,
  directoryMain,
  directoryCityPage,
  categoryPage,
  categoryCityLanding,
  directoryFeatured,
  directoryFeaturedEmpty,
  directoryCategoryCity,
  directoryCategoryOnly,
  directorySearch,
  articlePage,
  servicesLanding,
};
