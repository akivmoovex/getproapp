"use strict";

/**
 * BlessBoard V5 public website content constants.
 * Plain-text model; no HTML storage policy yet.
 */

const PUBLIC_PAGE_KEYS = Object.freeze([
  "home",
  "about",
  "leadership",
  "ministries",
  "events",
  "sermons",
  "contact",
  "giving",
]);

const PAGE_KEY_TITLES = Object.freeze({
  home: "Home",
  about: "About",
  leadership: "Leadership",
  ministries: "Ministries",
  events: "Events",
  sermons: "Sermons",
  contact: "Contact",
  giving: "Giving",
});

const CONTENT_STATUS = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
  CANCELLED: "cancelled",
});

const KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const CHANNEL_TYPE_RE = /^[a-z][a-z0-9_-]{0,31}$/;

module.exports = {
  PUBLIC_PAGE_KEYS,
  PAGE_KEY_TITLES,
  CONTENT_STATUS,
  KEY_RE,
  CHANNEL_TYPE_RE,
};
