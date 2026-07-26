"use strict";

/**
 * Centralized public website demo fixtures for BlessBoard V5 tenant sites.
 * Used when a church has published pages but little/no customized content.
 * No lorem ipsum, no fabricated statistics, no public “demo” notices.
 */

const MEDIA = Object.freeze({
  homeHero: "/church/images/tenant-public/home-desktop-hero.jpg",
  homeHeroMobile: "/church/images/tenant-public/home-mobile-hero.jpg",
  aboutHero: "/church/images/tenant-public/about-hero-building.jpg",
  aboutStory: "/church/images/tenant-public/home-mobile-hero.jpg",
  aboutGallery1: "/church/images/tenant-public/about-hero-building.jpg",
  aboutGallery2: "/church/images/tenant-public/home-desktop-hero.jpg",
  aboutGallery3: "/church/images/leadership/ministry-1.jpg",
  pastor: "/church/images/leadership/pastor-desktop.jpg",
  associate: "/church/images/leadership/assistant-desktop.jpg",
  leader3: "/church/images/leadership/elder-1.jpg",
  leader4: "/church/images/leadership/elder-2.jpg",
  leader5: "/church/images/leadership/elder-3.jpg",
  leader6: "/church/images/leadership/elder-4.jpg",
  ministryWorship: "/church/images/leadership/ministry-1.jpg",
  ministryYouth: "/church/images/leadership/ministry-2.jpg",
  ministryOutreach: "/church/images/leadership/ministry-3.jpg",
  ministryChildren: "/church/images/leadership/ministry-m1.jpg",
  event1: "/church/images/events/event-1.jpg",
  event2: "/church/images/events/event-2.jpg",
  event3: "/church/images/events/event-3.jpg",
  sermon: "/church/images/sermons/sermon-featured-desktop.jpg",
  sermon2: "/church/images/sermons/sermon-1.jpg",
  sermon3: "/church/images/sermons/sermon-2.jpg",
  leadershipIntro: "/church/images/leadership/pastor-desktop.jpg",
  ministriesIntro: "/church/images/leadership/ministry-1.jpg",
  eventsIntro: "/church/images/events/event-1.jpg",
  sermonsIntro: "/church/images/sermons/sermon-featured-desktop.jpg",
});

const SERVICE_TIMES = Object.freeze([
  Object.freeze({
    id: "public-demo-sunday",
    name: "Sunday Worship",
    day: "sunday",
    startTime: "09:00",
    endTime: "11:00",
    location: "Main sanctuary",
    note: "In-person and streamed",
    enabled: true,
    sortOrder: 10,
  }),
  Object.freeze({
    id: "public-demo-midweek",
    name: "Wednesday Midweek",
    day: "wednesday",
    startTime: "18:30",
    endTime: "20:00",
    location: "Fellowship hall",
    note: "Study and prayer",
    enabled: true,
    sortOrder: 20,
  }),
]);

const SOCIAL_LINKS = Object.freeze([
  Object.freeze({ label: "Facebook", icon: "public", href: null }),
  Object.freeze({ label: "Instagram", icon: "photo_camera", href: null }),
  Object.freeze({ label: "YouTube", icon: "smart_display", href: null }),
]);

/**
 * @param {{ publicName?: string }} opts
 */
function buildPublicDemoPack(opts) {
  const publicName = String((opts && opts.publicName) || "Our Church").trim() || "Our Church";

  const home = Object.freeze({
    heroHeading: "Faith, Community and Hope",
    heroBody: `A place where everyone belongs, purpose is discovered, and lives are transformed through the love of Christ at ${publicName}.`,
    heroMediaUrl: MEDIA.homeHero,
    welcomeHeading: "Welcome Home",
    welcomeBody:
      "We're so glad you're here. Whether you are visiting for the first time or returning after a season away, you will find warm welcome, clear next steps, and a community ready to walk with you.",
    aboutPreviewHeading: "Who We Are",
    aboutPreviewBody:
      "We gather to worship, grow in Scripture, and serve our neighbourhood with practical compassion. Come see how faith finds a home in everyday life.",
    givingHeading: "Stewardship with Purpose",
    givingBody:
      "Your generosity fuels worship, discipleship, and outreach. Learn how to give safely through the options our church shares.",
    contactHeading: "Visit Us",
    contactBody: "Plan a Sunday visit, ask a question, or find directions to our gathering place.",
  });

  const about = Object.freeze({
    heroHeading: "Roots of Connection",
    heroBody: `Learn who we are, what we believe, and how ${publicName} serves our city with clarity and compassion.`,
    heroMediaUrl: MEDIA.aboutHero,
    story: Object.freeze({
      sectionKey: "story",
      sectionType: "story",
      heading: "How We Gather",
      bodyText:
        "What began as a small circle of friends has grown into a welcoming congregation. We still gather around Scripture, prayer, and hospitality—now with ministries that help every generation take a next step.",
      mediaUrl: MEDIA.aboutStory,
    }),
    mission: Object.freeze({
      sectionKey: "mission",
      sectionType: "mission",
      heading: "Mission",
      bodyText:
        "To cultivate a space of sacred clarity where people discover divine purpose and walk it out together.",
      mediaUrl: null,
    }),
    vision: Object.freeze({
      sectionKey: "vision",
      sectionType: "vision",
      heading: "Vision",
      bodyText:
        "A community of intentional neighbours operating with grace, integrity, and practical love.",
      mediaUrl: null,
    }),
    values: Object.freeze([
      Object.freeze({
        sectionKey: "value_presence",
        sectionType: "values",
        heading: "Radical Presence",
        bodyText: "We show up for God and for one another with undivided attention.",
      }),
      Object.freeze({
        sectionKey: "value_integrity",
        sectionType: "values",
        heading: "Intellectual Integrity",
        bodyText: "We ask honest questions and pursue truth with humility.",
      }),
      Object.freeze({
        sectionKey: "value_compassion",
        sectionType: "values",
        heading: "Proactive Compassion",
        bodyText: "We move toward need with practical help and lasting relationships.",
      }),
    ]),
    beliefs: Object.freeze({
      sectionKey: "beliefs",
      sectionType: "beliefs",
      heading: "The Foundation",
      bodyText:
        "We hold Scripture as a living guide for flourishing. Salvation renews mind, body, and community—not only the inner life.",
      mediaUrl: null,
    }),
    community: Object.freeze({
      sectionKey: "community",
      sectionType: "community",
      heading: "Beyond the Sanctuary",
      bodyText:
        "We invest time and resources in local education, neighbourhood care, and partnerships that strengthen the city around us.",
      mediaUrl: null,
    }),
    gallery: Object.freeze([MEDIA.aboutGallery1, MEDIA.aboutGallery2, MEDIA.aboutGallery3]),
  });

  const leadership = Object.freeze({
    introHeading: "Composed Focus, Sacred Leadership",
    introBody:
      "Meet the pastors and ministry leaders who teach, shepherd, and equip our church family for everyday discipleship.",
    introMediaUrl: MEDIA.leadershipIntro,
  });

  const leaders = Object.freeze([
    Object.freeze({
      id: "demo-leader-senior",
      displayName: "Pastor Jordan Hale",
      roleTitle: "Senior Pastor",
      biography:
        "Jordan teaches with warmth and clarity, helping people find hope in Scripture and put faith into practice at home and work.",
      imageUrl: MEDIA.pastor,
      sortOrder: 10,
      contactHref: null,
    }),
    Object.freeze({
      id: "demo-leader-associate",
      displayName: "Pastor Sam Okonkwo",
      roleTitle: "Associate Pastor",
      biography:
        "Sam oversees pastoral care and midweek gatherings, walking with families through seasons of joy and challenge.",
      imageUrl: MEDIA.associate,
      sortOrder: 20,
      contactHref: null,
    }),
    Object.freeze({
      id: "demo-leader-ministries",
      displayName: "Sarah Chen",
      roleTitle: "Director of Ministries",
      biography:
        "Sarah builds teams that welcome newcomers and help every age group find a place to grow and serve.",
      imageUrl: MEDIA.leader3,
      sortOrder: 30,
      contactHref: null,
    }),
    Object.freeze({
      id: "demo-leader-executive",
      displayName: "David Miller",
      roleTitle: "Executive Pastor",
      biography:
        "David stewards operations and long-range planning so ministry stays healthy, clear, and sustainable.",
      imageUrl: MEDIA.leader4,
      sortOrder: 40,
      contactHref: null,
    }),
    Object.freeze({
      id: "demo-leader-youth",
      displayName: "Marcus Wright",
      roleTitle: "Youth Ministry Lead",
      biography: "Marcus mentors students with energy, honesty, and a passion for Scripture.",
      imageUrl: MEDIA.leader5,
      sortOrder: 50,
      contactHref: null,
    }),
    Object.freeze({
      id: "demo-leader-outreach",
      displayName: "Elena Rodriguez",
      roleTitle: "Community Outreach",
      biography: "Elena connects the church with neighbours through service projects and local partnerships.",
      imageUrl: MEDIA.leader6,
      sortOrder: 60,
      contactHref: null,
    }),
  ]);

  const ministries = Object.freeze([
    Object.freeze({
      id: "demo-ministry-worship",
      name: "Sacred Worship",
      summary: "Creating an atmosphere where heaven meets earth through creative expression.",
      description: "Join the worship team for Sunday gatherings and midweek rehearsals.",
      meetingDay: "Sunday · 8:00 AM rehearsal",
      audience: "Musicians and tech volunteers",
      leaderName: "Elena Rodriguez",
      contactEmail: null,
      contactHref: null,
      imageUrl: MEDIA.ministryWorship,
      sortOrder: 10,
    }),
    Object.freeze({
      id: "demo-ministry-youth",
      name: "Elevate Youth",
      summary: "Empowering the next generation to lead with faith, courage, and integrity.",
      description: "Games, Scripture, and honest conversation for teens.",
      meetingDay: "Friday · 6:30 PM",
      audience: "Students ages 12–18",
      leaderName: "Marcus Wright",
      contactEmail: null,
      contactHref: null,
      imageUrl: MEDIA.ministryYouth,
      sortOrder: 20,
    }),
    Object.freeze({
      id: "demo-ministry-outreach",
      name: "Neighbor Care",
      summary: "Being the hands and feet of Jesus in our local community and beyond.",
      description: "Monthly service projects and practical care for neighbours in need.",
      meetingDay: "Monthly outreach Saturday",
      audience: "All ages welcome",
      leaderName: "Sarah Chen",
      contactEmail: null,
      contactHref: null,
      imageUrl: MEDIA.ministryOutreach,
      sortOrder: 30,
    }),
    Object.freeze({
      id: "demo-ministry-kids",
      name: "Children’s Discovery",
      summary: "A safe, engaging environment for young faith explorers.",
      description: "Age-appropriate teaching during Sunday worship.",
      meetingDay: "Sunday during worship",
      audience: "Children",
      leaderName: "Sam Okonkwo",
      contactEmail: null,
      contactHref: null,
      imageUrl: MEDIA.ministryChildren || MEDIA.ministryWorship,
      sortOrder: 40,
    }),
  ]);

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const events = Object.freeze([
    Object.freeze({
      id: "demo-event-1",
      title: "Grace Leaders Summit",
      summary: "A weekend of teaching, prayer, and practical leadership workshops for serving teams.",
      startsAt: new Date(now + 5 * dayMs).toISOString(),
      endsAt: new Date(now + 7 * dayMs).toISOString(),
      timezone: "UTC",
      location: "Main sanctuary",
      imageUrl: MEDIA.event1,
      registrationUrl: null,
      organizer: "Church leadership team",
    }),
    Object.freeze({
      id: "demo-event-2",
      title: "Sunday Morning Connection",
      summary: "Coffee, conversation, and a warm welcome before the morning service.",
      startsAt: new Date(now + 2 * dayMs).toISOString(),
      endsAt: null,
      timezone: "UTC",
      location: "Fellowship hall",
      imageUrl: MEDIA.event2,
      registrationUrl: null,
      organizer: null,
    }),
    Object.freeze({
      id: "demo-event-3",
      title: "Fall Festival",
      summary: "A neighbourhood celebration with food, games, and welcome for every family.",
      startsAt: new Date(now + 12 * dayMs).toISOString(),
      endsAt: null,
      timezone: "UTC",
      location: "Church lawn",
      imageUrl: MEDIA.event3,
      registrationUrl: null,
      organizer: "Outreach team",
    }),
  ]);

  const sermons = Object.freeze([
    Object.freeze({
      id: "demo-sermon-1",
      title: "Finding Peace in the Noise",
      speakerName: "Pastor Jordan Hale",
      preachedAt: new Date(now - 7 * dayMs).toISOString(),
      category: "Walking in Grace",
      summary: "Category: Walking in Grace. A message on resting in Christ when life feels crowded and loud.",
      mediaUrl: null,
      resourceUrl: null,
      imageUrl: MEDIA.sermon,
      scripture: "Philippians 4:6-7",
    }),
    Object.freeze({
      id: "demo-sermon-2",
      title: "The Sanctity of Attention",
      speakerName: "Pastor Sam Okonkwo",
      preachedAt: new Date(now - 14 * dayMs).toISOString(),
      category: "Walking in Grace",
      summary: "Category: Walking in Grace. Learning to give God and people our undivided attention.",
      mediaUrl: null,
      resourceUrl: null,
      imageUrl: MEDIA.sermon2 || MEDIA.sermon,
      scripture: "Matthew 6:21-23",
    }),
    Object.freeze({
      id: "demo-sermon-3",
      title: "Filtering the Noise",
      speakerName: "Pastor Jordan Hale",
      preachedAt: new Date(now - 21 * dayMs).toISOString(),
      category: "Foundations of Focus",
      summary: "Category: Foundations of Focus. Choosing wisdom when culture is loud.",
      mediaUrl: null,
      resourceUrl: null,
      imageUrl: MEDIA.sermon3 || MEDIA.sermon,
      scripture: "Psalm 46:10",
    }),
  ]);

  const givingMethods = Object.freeze([
    Object.freeze({
      methodType: "bank_transfer",
      label: "Bank Transfer",
      instructions:
        "Contact the church office for published bank transfer instructions. Sensitive payment details are shared privately so they stay accurate and secure.",
      externalUrl: null,
      icon: "account_balance",
    }),
    Object.freeze({
      methodType: "mobile_money",
      label: "Mobile Money",
      instructions:
        "Ask the office for the current published mobile-money details for this congregation. BlessBoard does not process mobile payments on this page.",
      externalUrl: null,
      icon: "smartphone",
    }),
    Object.freeze({
      methodType: "in_person",
      label: "In-Person Offering",
      instructions: "Give during Sunday worship or visit the church office during published office hours.",
      externalUrl: null,
      icon: "volunteer_activism",
    }),
  ]);

  const ministriesPage = Object.freeze({
    introHeading: "A Space to Belong and Grow",
    introBody: `Discover ministries at ${publicName} where you can grow in faith, serve others, and find lasting community.`,
    introMediaUrl: MEDIA.ministriesIntro || MEDIA.ministryWorship,
  });

  const eventsPage = Object.freeze({
    introHeading: "Kingdom Gatherings",
    introBody: `Upcoming gatherings at ${publicName}. Join us for worship, learning, and community celebrations.`,
    introMediaUrl: MEDIA.eventsIntro || MEDIA.event1,
  });

  const sermonsPage = Object.freeze({
    introHeading: "Sacred Teachings for Modern Souls",
    introBody: `Listen to recent messages from ${publicName}. Media links appear only when the church has published a safe audio or video URL.`,
    introMediaUrl: MEDIA.sermonsIntro || MEDIA.sermon,
  });

  const contactPage = Object.freeze({
    introHeading: "We'd Love to Hear From You",
    introBody: `Reach ${publicName} by phone or email, plan a visit, or find service times below.`,
    officeHoursHeading: "Office Hours",
    officeHoursBody: "Monday – Thursday · 9:00 AM – 4:00 PM",
  });

  const givingPage = Object.freeze({
    introHeading: "Investing in Sacred Space and Community",
    introBody: `Your generosity helps ${publicName} sustain worship, discipleship, and neighbourhood care. This page shares published instructions only — BlessBoard does not process payments here.`,
    whyHeading: "Why We Give",
    whyItems: Object.freeze([
      Object.freeze({
        icon: "volunteer_activism",
        title: "Impact",
        body: "Gifts support local outreach and the daily work of this congregation.",
      }),
      Object.freeze({
        icon: "favorite",
        title: "Worship",
        body: "Giving is a joyful response to the grace we have received.",
      }),
      Object.freeze({
        icon: "verified",
        title: "Stewardship",
        body: "The church manages published gifts with care and clear communication.",
      }),
    ]),
    accountability:
      "For questions about designations or receipts, contact the church office. BlessBoard never collects card, bank, or wallet credentials on this page.",
  });

  const contact = Object.freeze({
    addressText: "123 Sacred Way, Modern Heights, ST 54321",
    phone: "(555) 123-4567",
    email: "hello@example.church",
    phoneHref: "tel:+15551234567",
    emailHref: "mailto:hello@example.church",
    addressLines: ["123 Sacred Way", "Modern Heights, ST 54321"],
    latitude: null,
    longitude: null,
    hasMap: false,
    mapEmbedUrl: null,
    directionsUrl: null,
    hasAny: true,
  });

  const footer = Object.freeze({
    description: `Building a community where faith finds a modern home. Join ${publicName} as we navigate life together through grace and hope.`,
  });

  return Object.freeze({
    media: MEDIA,
    serviceTimes: SERVICE_TIMES,
    socialLinks: SOCIAL_LINKS,
    home,
    about,
    leadership,
    leaders,
    ministries,
    events,
    sermons,
    givingMethods,
    ministriesPage,
    eventsPage,
    sermonsPage,
    contactPage,
    givingPage,
    contact,
    footer,
  });
}

/**
 * Prefer a valid media URL; otherwise fall back to a known local asset.
 * @param {string|null|undefined} url
 * @param {string} fallback
 */
function mediaOrFallback(url, fallback) {
  const raw = url != null ? String(url).trim() : "";
  if (!raw || raw === "#" || /^javascript:/i.test(raw)) {
    return fallback || null;
  }
  return raw;
}

module.exports = {
  MEDIA,
  SERVICE_TIMES,
  SOCIAL_LINKS,
  buildPublicDemoPack,
  mediaOrFallback,
};
