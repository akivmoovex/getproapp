/**
 * Attach aggregate review fields to company rows for directory / category listings.
 * avg_rating / review_count: all-time. Highlight fields: best-rated review in the last 90 days.
 */

function attachReviewStatsToCompanies(db, companies) {
  if (!companies || companies.length === 0) return companies;
  const ids = [...new Set(companies.map((c) => c.id).filter((id) => id != null && Number(id) > 0))];
  if (ids.length === 0) return companies;
  const ph = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
      SELECT c.id AS company_id,
        (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE company_id = c.id) AS avg_rating,
        (SELECT COUNT(*) FROM reviews WHERE company_id = c.id) AS review_count,
        (SELECT body FROM reviews r
          WHERE r.company_id = c.id AND date(r.created_at) >= date('now', '-90 days')
          ORDER BY r.rating DESC, r.created_at DESC LIMIT 1) AS highlight_review_body,
        (SELECT author_name FROM reviews r
          WHERE r.company_id = c.id AND date(r.created_at) >= date('now', '-90 days')
          ORDER BY r.rating DESC, r.created_at DESC LIMIT 1) AS highlight_review_author,
        (SELECT r.rating FROM reviews r
          WHERE r.company_id = c.id AND date(r.created_at) >= date('now', '-90 days')
          ORDER BY r.rating DESC, r.created_at DESC LIMIT 1) AS highlight_review_rating
      FROM companies c
      WHERE c.id IN (${ph})
      `
    )
    .all(...ids);
  const byId = Object.fromEntries(rows.map((s) => [s.company_id, s]));
  return companies.map((c) => {
    const s = byId[c.id];
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
