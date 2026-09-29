"use strict";

/**
 * Wrap a pg Pool for SQL query-count regression tests.
 * Counts pool.query and client.query invocations.
 */
function wrapPoolWithQueryCounter(pool) {
  let queryCount = 0;

  function trackQuery(text) {
    queryCount += 1;
    return String(text || "");
  }

  return {
    queryCount: () => queryCount,
    resetQueryCount() {
      queryCount = 0;
    },
    query(text, params) {
      trackQuery(text);
      return pool.query(text, params);
    },
    connect() {
      return pool.connect().then((client) => {
        const origQuery = client.query.bind(client);
        client.query = (text, params) => {
          trackQuery(text);
          return origQuery(text, params);
        };
        const origRelease = client.release.bind(client);
        client.release = (...args) => {
          client.query = origQuery;
          client.release = origRelease;
          return origRelease(...args);
        };
        return client;
      });
    },
    end: (...args) => pool.end(...args),
    _pool: pool,
  };
}

function countPlanResolutionQueries(queries) {
  const org = queries.filter((q) => /FROM public\.church_organizations/i.test(q)).length;
  const trial = queries.filter((q) => /church_organization_package_trials/i.test(q)).length;
  return { org, trial, total: queries.length };
}

module.exports = {
  wrapPoolWithQueryCounter,
  countPlanResolutionQueries,
};
