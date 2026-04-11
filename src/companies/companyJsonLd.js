"use strict";

const { canonicalUrlForTenant } = require("../content/contentPages");

/** Star ratings in the app are always on a 1–5 scale (see reviewStats / computeReviewStatsFromRows). */
const REVIEW_BEST = 5;
const REVIEW_WORST = 1;

/**
 * JSON-LD for public provider profile pages (LocalBusiness / ProfessionalService).
 * aggregateRating is emitted only when real review stats exist (review_count > 0 and computed average).
 *
 * @param {import('express').Request} req
 * @param {object} locals — same shape as `buildCompanyPageLocals` output (partial ok if fields present)
 */
function buildCompanyJsonLd(req, locals) {
  const co = locals.company;
  if (!co || co.id == null) return "";

  const canonicalUrl = canonicalUrlForTenant(req, `/company/${co.id}`);
  const schemaType = locals.category ? "ProfessionalService" : "LocalBusiness";

  const lb = {
    "@context": "https://schema.org",
    "@type": schemaType,
    name: co.name,
    url: canonicalUrl,
  };

  if (!locals.providerSeoUsedAuto && co.headline) {
    lb.description = co.headline;
  } else if (locals.providerSchemaDescription) {
    lb.description = String(locals.providerSchemaDescription).slice(0, 800);
  }

  if (co.phone) lb.telephone = co.phone;
  if (co.email) lb.email = co.email;
  if (co.location) {
    lb.address = { "@type": "PostalAddress", streetAddress: co.location };
  }

  const rc = Number(locals.review_count) || 0;
  const avRaw = locals.avg_rating;
  const av = avRaw != null && !Number.isNaN(Number(avRaw)) ? Number(avRaw) : null;

  if (rc > 0 && av != null) {
    lb.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Math.round(av * 100) / 100,
      reviewCount: rc,
      bestRating: REVIEW_BEST,
      worstRating: REVIEW_WORST,
    };
  }

  return JSON.stringify(lb);
}

module.exports = { buildCompanyJsonLd, REVIEW_BEST, REVIEW_WORST };
