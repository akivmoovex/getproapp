/**
 * Attach aggregate review fields to company rows for directory / category listings.
 * avg_rating / review_count: all-time. Highlight fields: best-rated review in the last 90 days.
 */

const { getPgPool } = require("../db/pg");
const reviewsRepo = require("../db/pg/reviewsRepo");

/**
 * @param {object[]} companies
 * @returns {Promise<object[]>}
 */
async function attachReviewStatsToCompanies(companies) {
  if (!companies || companies.length === 0) return companies;
  const ids = [...new Set(companies.map((c) => c.id).filter((id) => id != null && Number(id) > 0))];
  if (ids.length === 0) return companies;

  const pool = getPgPool();
  const byId = await reviewsRepo.getBatchDirectoryStatsMap(pool, ids);
  return companies.map((c) => {
    const s = byId.get(c.id);
    if (!s) return c;
    return {
      ...c,
      avg_rating: s.avg_rating,
      review_count: s.review_count,
      highlight_review_body: s.highlight_review_body,
      highlight_review_author: s.highlight_review_author,
      highlight_review_rating: s.highlight_review_rating,
    };
  });
}

module.exports = { attachReviewStatsToCompanies };
