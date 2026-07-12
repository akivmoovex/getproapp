"use strict";

const rateLimit = require("express-rate-limit");

const WINDOW_MS = Number(process.env.GETPRO_PLATFORM_FORM_RATE_WINDOW_MS) || 15 * 60 * 1000;
const MAX = Number(process.env.GETPRO_PLATFORM_FORM_RATE_MAX) || 12;

const platformPublicFormLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    const msg = "Too many submissions from this network. Please wait a few minutes and try again.";
    if (String(req.path || "").includes("register-church")) {
      return res.status(options.statusCode).render("church/public/platform_register_church", {
        pageTitle: "Register Your Church",
        churchName: "BlessBoard",
        metaDescription: "Request BlessBoard access for your church.",
        isVerticalApex: true,
        activePage: "register-church",
        welcomeMessage: "",
        registerChurchPath: "/register-church",
        submitted: false,
        formError: msg,
        form: {},
      });
    }
    return res.status(options.statusCode).render("church/public/platform_contact", {
      pageTitle: "Contact BlessBoard",
      churchName: "BlessBoard",
      metaDescription: "Contact BlessBoard about platform access or general questions.",
      isVerticalApex: true,
      activePage: "contact",
      welcomeMessage: "",
      registerChurchPath: "/register-church",
      submitted: false,
      formError: msg,
      form: {},
    });
  },
});

module.exports = { platformPublicFormLimiter };
