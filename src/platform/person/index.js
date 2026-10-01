"use strict";

/**
 * V2.04 shared person foundation — platform exports.
 *
 * Person = demographic aggregate (optional portal identity).
 * Product relationship = separate link (bb.membership / ac.patient).
 */

module.exports = {
  ...require("./personConstants"),
  ...require("./personNormalization"),
  ...require("./personScope"),
  ...require("./personCompatibility"),
  ...require("./personService"),
  personRepository: require("./personRepository"),
  duplicate: require("./duplicate"),
  workflow: require("./workflow"),
};
