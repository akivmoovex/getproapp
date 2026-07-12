"use strict";

const {
  BLESSBOARD_NAME,
  BLESSBOARD_TAGLINE,
  BLESSBOARD_PUBLIC_URL,
} = require("../../church/branding");
const {
  BLESSBOARD_DEMO_PUBLIC_URL,
  BLESSBOARD_REGISTER_CHURCH_PATH,
  buildDemoExploreLinks,
} = require("../../church/platformPublicContent");
const { PLATFORM_FAQ_ITEMS } = require("../../church/platformFaqContent");
const {
  BLESSBOARD_PRICING_ONBOARDING_NOTE,
  buildPublicPricingPlans,
  buildPublicPricingComparisonRows,
  buildPartnerPlan,
  STAFF_BILLING_NOTE,
  THIRD_PARTY_COSTS_NOTE,
} = require("../../church/platformPricingContent");
const { mergePlatformPublicSeo } = require("../../church/platformPublicSeo");

function requireVerticalApex(req, res, next) {
  const ctx = req.churchContext;
  if (!ctx || ctx.kind !== "vertical-apex") {
    return next("router");
  }
  return next();
}

function apexPageLocals(extra = {}, req = null) {
  const locals = {
    pageTitle: extra.pageTitle || BLESSBOARD_NAME,
    churchName: BLESSBOARD_NAME,
    metaDescription: extra.metaDescription || BLESSBOARD_TAGLINE,
    isVerticalApex: true,
    activePage: extra.activePage || "home",
    welcomeMessage: extra.welcomeMessage || BLESSBOARD_TAGLINE,
    blessboardPublicUrl: BLESSBOARD_PUBLIC_URL,
    demoChurchUrl: BLESSBOARD_DEMO_PUBLIC_URL,
    registerChurchPath: BLESSBOARD_REGISTER_CHURCH_PATH,
    demoExploreLinks: buildDemoExploreLinks(),
    ...extra,
  };
  return mergePlatformPublicSeo(locals, req);
}

function registerPlatformPublicPagesRoutes(router) {
  router.get("/features", requireVerticalApex, (req, res) => {
    return res.render(
      "church/public/platform_features",
      apexPageLocals(
        {
          pageTitle: "Features",
          activePage: "features",
        },
        req
      )
    );
  });

  router.get("/pricing", requireVerticalApex, (req, res) => {
    return res.render(
      "church/public/platform_pricing",
      apexPageLocals(
        {
          pageTitle: "Pricing",
          activePage: "pricing",
          pricingOnboardingNote: BLESSBOARD_PRICING_ONBOARDING_NOTE,
          pricingPlans: buildPublicPricingPlans(),
          partnerPlan: buildPartnerPlan(),
          pricingComparisonRows: buildPublicPricingComparisonRows(),
          staffBillingNote: STAFF_BILLING_NOTE,
          thirdPartyCostsNote: THIRD_PARTY_COSTS_NOTE,
        },
        req
      )
    );
  });

  router.get("/for-churches", requireVerticalApex, (req, res) => {
    return res.render(
      "church/public/platform_for_churches",
      apexPageLocals(
        {
          pageTitle: "For Churches",
          activePage: "for-churches",
        },
        req
      )
    );
  });

  router.get("/multi-branch", requireVerticalApex, (req, res) => {
    return res.render(
      "church/public/platform_multi_branch",
      apexPageLocals(
        {
          pageTitle: "Multi-Branch Churches",
          activePage: "multi-branch",
        },
        req
      )
    );
  });

  router.get(BLESSBOARD_REGISTER_CHURCH_PATH, requireVerticalApex, (req, res) => {
    return res.render(
      "church/public/platform_register_church",
      apexPageLocals(
        {
          pageTitle: "Register Your Church",
          activePage: "register-church",
          submitted: String(req.query.submitted || "") === "1",
          formError: null,
          form: {},
        },
        req
      )
    );
  });

  router.get("/privacy", requireVerticalApex, (req, res) => {
    return res.render(
      "church/public/platform_privacy",
      apexPageLocals(
        {
          pageTitle: "Privacy Policy",
          activePage: "privacy",
        },
        req
      )
    );
  });

  router.get("/terms", requireVerticalApex, (req, res) => {
    return res.render(
      "church/public/platform_terms",
      apexPageLocals(
        {
          pageTitle: "Terms of Service",
          activePage: "terms",
        },
        req
      )
    );
  });

  router.get("/support", requireVerticalApex, (req, res) => {
    return res.render(
      "church/public/platform_support",
      apexPageLocals(
        {
          pageTitle: "Support",
          activePage: "support",
        },
        req
      )
    );
  });

  router.get("/security", requireVerticalApex, (req, res) => {
    return res.render(
      "church/public/platform_security",
      apexPageLocals(
        {
          pageTitle: "Security and Data Information",
          activePage: "security",
        },
        req
      )
    );
  });

  router.get("/faq", requireVerticalApex, (req, res) => {
    return res.render(
      "church/public/platform_faq",
      apexPageLocals(
        {
          pageTitle: "FAQ",
          activePage: "faq",
          faqItems: PLATFORM_FAQ_ITEMS,
        },
        req
      )
    );
  });

  router.get("/demo", requireVerticalApex, (req, res) => {
    return res.render(
      "church/public/platform_demo",
      apexPageLocals(
        {
          pageTitle: "See BlessBoard in action",
          activePage: "demo",
        },
        req
      )
    );
  });
}

module.exports = registerPlatformPublicPagesRoutes;
module.exports.apexPageLocals = apexPageLocals;
module.exports.requireVerticalApex = requireVerticalApex;
