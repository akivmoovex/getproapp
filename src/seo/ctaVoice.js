"use strict";

/**
 * Conversion CTA copy by brand — same structure, different wording.
 * Resolves brand via resolveSeoVoiceKey (HTML_DATA_BRAND, tenant il → pronline, else getpro).
 */

const { resolveSeoVoiceKey, DEFAULT_VOICE_KEY } = require("./seoVoice");

/** @type {Record<string, { homepage: object, provider: object, form: object, emptyState: object, searchRefinement: object }>} */
const ctaVoiceProfiles = {
  getpro: {
    homepage: {
      primary_search: "Find Trusted Providers",
      secondary_join: "Join as a Provider",
      footer_search: "Start Your Search",
      nav_join: "Join Us",
      footer_list_business: "Join as a Provider",
      nav_drawer_search: "Search directory",
      nav_drawer_join: "Join as a Provider",
      story_helper: "Compare trusted profiles, ratings, and services.",
    },
    provider: {
      primary_contact: "Contact This Provider",
      primary_lead: "Request This Service",
      secondary_profile: "View Full Profile",
    },
    form: {
      search: {
        primary: "Find Trusted Providers",
      },
      onboarding: {
        start: "Join as a Provider",
        continue: "Continue Registration",
        next: "Next Step",
        submit: "Create My Provider Profile",
      },
      contact: {
        primary: "Contact This Provider",
        request: "Request This Service",
        send: "Send Request",
        sending_loading: "Sending Request…",
      },
      generic: {
        continue: "Continue",
        next: "Next Step",
        submit: "Submit Request",
      },
    },
    emptyState: {
      no_results: {
        title: "No providers found",
        body: "Try another category, city, or search term to find trusted providers.",
        cta: "Browse All Providers",
      },
      no_featured: {
        title: "No featured providers yet",
        body: "Featured providers are not available right now. Try browsing all trusted providers instead.",
        cta: "Browse Providers",
      },
      no_city_results: {
        title: "No results in this city",
        body: "Try a nearby city or browse providers across a wider area.",
        cta: "Search Another Area",
      },
      no_category_results: {
        title: "No providers in this category yet",
        title_with_name: "No {category} listings yet",
        body: "Try another category or browse all available providers.",
        cta: "Browse Categories",
      },
      no_category_city: {
        title: "No {category} found in {city}",
        body: "Try another city or browse trusted providers in related categories.",
        cta: "Browse Providers",
      },
      no_service_in_city: {
        title: "No {service} found in {city}",
      },
      no_service_only: {
        title: "No results for {service}",
      },
      lead_capture_hint:
        "Leave your details and we'll help connect you with a suitable professional.",
      jump_to_search: "Jump to search",
      jump_to_search_suffix: "to change your filters.",
      refine_search: "Refine search",
      callback_loading: "Sending request…",
    },
    searchRefinement: {
      service_placeholder: "Search for a service (e.g. electrician, tutor)",
      city_placeholder: "City or town",
      helper: "Find trusted providers by service, category, or location",
      recent_label: "Recent searches",
      trending_label: "Trending categories",
      popular_label: "Popular searches",
      popular: ["Electrician", "Plumber", "Tutor", "Cleaner", "Mechanic"],
      suggestions: {
        title: "Try searching for:",
        examples: ["Electrician", "Plumber", "Tutor"],
      },
      refinement_hints: [
        "Try a different category",
        "Try another city",
        "Browse all providers",
      ],
    },
  },
  pronline: {
    homepage: {
      primary_search: "Discover Top Providers",
      secondary_join: "List Your Services",
      footer_search: "Explore Providers",
      nav_join: "Join Us",
      footer_list_business: "List Your Services",
      nav_drawer_search: "Search directory",
      nav_drawer_join: "List Your Services",
      story_helper: "Explore top profiles, ratings, and services.",
    },
    provider: {
      primary_contact: "Connect with This Provider",
      primary_lead: "Get Started",
      secondary_profile: "Explore Full Profile",
    },
    form: {
      search: {
        primary: "Discover Top Providers",
      },
      onboarding: {
        start: "List Your Services",
        continue: "Keep Going",
        next: "Next Step",
        submit: "Publish My Service Profile",
      },
      contact: {
        primary: "Connect with This Provider",
        request: "Get Started",
        send: "Send My Request",
        sending_loading: "Sending Your Request…",
      },
      generic: {
        continue: "Continue",
        next: "Next Step",
        submit: "Send Request",
      },
    },
    emptyState: {
      no_results: {
        title: "No providers matched your search",
        body: "Try another category, city, or keyword to discover top providers.",
        cta: "Explore All Providers",
      },
      no_featured: {
        title: "No featured providers right now",
        body: "There are no featured providers at the moment. Explore more providers to keep your search moving.",
        cta: "Explore Providers",
      },
      no_city_results: {
        title: "No results in this city",
        body: "Try another city or expand your search to discover more providers.",
        cta: "Explore Nearby",
      },
      no_category_results: {
        title: "No providers found in this category",
        title_with_name: "No {category} listings yet",
        body: "Try another category or explore more providers available on the platform.",
        cta: "Explore Categories",
      },
      no_category_city: {
        title: "No {category} found in {city}",
        body: "Try another city or explore more providers in related categories.",
        cta: "Explore Providers",
      },
      no_service_in_city: {
        title: "No {service} found in {city}",
      },
      no_service_only: {
        title: "No results for {service}",
      },
      lead_capture_hint:
        "Tell us how to reach you and we'll help you find the right provider.",
      jump_to_search: "Jump to search",
      jump_to_search_suffix: "to change your filters.",
      refine_search: "Refine search",
      callback_loading: "Sending request…",
    },
    searchRefinement: {
      service_placeholder: "What service are you looking for?",
      city_placeholder: "City or area",
      helper: "Discover top providers by service, category, or location",
      recent_label: "Recent searches",
      trending_label: "Trending categories",
      popular_label: "Popular searches",
      popular: ["Electrician", "Hair Stylist", "Home Cleaning", "Tutor", "Photographer"],
      suggestions: {
        title: "Popular searches:",
        examples: ["Electrician", "Hair Stylist", "Cleaning Service"],
      },
      refinement_hints: [
        "Try another keyword",
        "Explore nearby categories",
        "Discover more providers",
      ],
    },
  },
};

/**
 * @param {import('express').Request} req
 * @returns {{ key: string, homepage: object, provider: object, form: object, emptyState: object, searchRefinement: object }}
 */
function getCtaVoiceProfile(req) {
  const key = resolveSeoVoiceKey(req);
  const profile = ctaVoiceProfiles[key] || ctaVoiceProfiles[DEFAULT_VOICE_KEY];
  const es = profile.emptyState;
  const sr = profile.searchRefinement;
  return {
    key,
    homepage: { ...profile.homepage },
    provider: { ...profile.provider },
    form: {
      search: { ...profile.form.search },
      onboarding: { ...profile.form.onboarding },
      contact: { ...profile.form.contact },
      generic: { ...profile.form.generic },
    },
    emptyState: {
      no_results: { ...es.no_results },
      no_featured: { ...es.no_featured },
      no_city_results: { ...es.no_city_results },
      no_category_results: { ...es.no_category_results },
      no_category_city: { ...es.no_category_city },
      no_service_in_city: { ...es.no_service_in_city },
      no_service_only: { ...es.no_service_only },
      lead_capture_hint: es.lead_capture_hint,
      jump_to_search: es.jump_to_search,
      jump_to_search_suffix: es.jump_to_search_suffix,
      refine_search: es.refine_search,
      callback_loading: es.callback_loading,
    },
    searchRefinement: {
      service_placeholder: sr.service_placeholder,
      city_placeholder: sr.city_placeholder,
      helper: sr.helper,
      recent_label: sr.recent_label,
      trending_label: sr.trending_label,
      popular_label: sr.popular_label,
      popular: [...sr.popular],
      suggestions: {
        title: sr.suggestions.title,
        examples: [...sr.suggestions.examples],
      },
      refinement_hints: [...sr.refinement_hints],
    },
  };
}

module.exports = {
  ctaVoiceProfiles,
  getCtaVoiceProfile,
};
