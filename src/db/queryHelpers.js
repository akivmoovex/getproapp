"use strict";

function createQueryHelpers(db) {
  function run(query, params = []) {
    return db.prepare(query).run(params);
  }

  function getOne(query, params = []) {
    return db.prepare(query).get(params);
  }

  function getAll(query, params = []) {
    return db.prepare(query).all(params);
  }

  return { run, getOne, getAll };
}

module.exports = { createQueryHelpers };
