"use strict";

const crypto = require("crypto");

function createMemoryCommunityStore() {
  const tails = new Map();
  return {
    persons: new Map(),
    memberships: new Map(),
    acquisitions: [],
    introductions: [],
    passes: [],
    links: [],
    patients: [],
    charts: [],
    agreements: [],
    audits: [],
    ledger: [],
    plans: new Map(),
    settlements: new Map(),
    serial(key, fn) {
      const prev = tails.get(key) || Promise.resolve();
      const run = prev.then(fn, fn);
      tails.set(key, run.then(() => undefined, () => undefined));
      return run;
    },
  };
}

function id() {
  return crypto.randomUUID();
}

function audit(store, event) {
  const row = {
    id: id(),
    at: event.at || Date.now(),
    ...event,
  };
  delete row.token;
  delete row.code;
  delete row.diagnosis;
  store.audits.push(row);
  return row;
}

module.exports = {
  createMemoryCommunityStore,
  id,
  audit,
};
