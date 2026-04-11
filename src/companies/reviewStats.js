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

/**
 * Highest average rating first; missing ratings last. Tie-break: review count desc, then name asc.
 * @param {object[]} companies
 * @returns {object[]}
 */
function sortDirectoryCompaniesByRating(companies) {
  if (!companies || companies.length === 0) return companies;
  return [...companies].sort((a, b) => {
    const ar = a.avg_rating != null ? Number(a.avg_rating) : null;
    const br = b.avg_rating != null ? Number(b.avg_rating) : null;
    if (ar != null && br != null && ar !== br) return br - ar;
    if (ar != null && br == null) return -1;
    if (ar == null && br != null) return 1;
    const ac = a.review_count != null ? Number(a.review_count) : 0;
    const bc = b.review_count != null ? Number(b.review_count) : 0;
    if (bc !== ac) return bc - ac;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

module.exports = { attachReviewStatsToCompanies, sortDirectoryCompaniesByRating };
