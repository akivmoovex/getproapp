"use strict";

/**
 * Centralized public website demo fixtures for BlessBoard V5 tenant sites.
 * Used when a church has published pages but little/no customized content.
 * No lorem ipsum, no fabricated statistics, no public “demo” notices.
 *
 * Demo copy uses the safe token {{churchName}} (and aliases). Resolve with
 * interpolateDemoText / buildPublicDemoPack — never evaluate arbitrary expressions.
 */

const CHURCH_NAME_TOKEN = "{{churchName}}";
const CHURCH_NAME_ALIASES = Object.freeze([
  "{{churchName}}",
  "{{church_name}}",
  "{{publicName}}",
]);

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
  ministryWomen: "/church/images/leadership/ministry-1.jpg",
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
    note: "In-person gathering with children's discovery during the message",
    enabled: true,
    primary: true,
    sortOrder: 10,
  }),
  Object.freeze({
    id: "public-demo-midweek",
    name: "Wednesday Midweek",
    day: "wednesday",
    startTime: "18:30",
    endTime: "20:00",
    location: "Fellowship hall",
    note: "Scripture study, prayer, and midweek encouragement",
    enabled: true,
    primary: false,
    sortOrder: 20,
  }),
]);

const SOCIAL_LINKS = Object.freeze([
  Object.freeze({ label: "Facebook", icon: "public", href: null }),
  Object.freeze({ label: "Instagram", icon: "photo_camera", href: null }),
  Object.freeze({ label: "YouTube", icon: "smart_display", href: null }),
]);

/**
 * Resolve canonical display name for demo interpolation.
 * @param {{
 *   publicName?: string|null,
 *   churchDisplayName?: string|null,
 *   organizationDisplayName?: string|null,
 *   branchDisplayName?: string|null,
 *   branchSpecific?: boolean,
 * }} opts
 */
function resolveCanonicalChurchName(opts) {
  const o = opts || {};
  const candidates = [
    o.publicName,
    o.churchDisplayName,
    o.organizationDisplayName,
    o.branchSpecific ? o.branchDisplayName : null,
  ];
  for (const c of candidates) {
    const s = String(c == null ? "" : c).trim();
    if (s) return s;
  }
  return "Our Church";
}

/**
 * Replace only the explicit church-name tokens. No expression evaluation.
 * @param {unknown} value
 * @param {string} churchName
 */
function interpolateDemoText(value, churchName) {
  if (value == null) return value;
  if (typeof value !== "string") return value;
  const name = String(churchName || "Our Church").trim() || "Our Church";
  let out = value;
  for (const token of CHURCH_NAME_ALIASES) {
    if (out.indexOf(token) >= 0) {
      out = out.split(token).join(name);
    }
  }
  return out;
}

/**
 * Deep-walk strings (and arrays/objects) applying church-name interpolation.
 * @param {unknown} value
 * @param {string} churchName
 */
function interpolateDemoValue(value, churchName) {
  if (value == null) return value;
  if (typeof value === "string") return interpolateDemoText(value, churchName);
  if (Array.isArray(value)) {
    return value.map((item) => interpolateDemoValue(item, churchName));
  }
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = interpolateDemoValue(value[key], churchName);
    }
    return out;
  }
  return value;
}

/**
 * @param {{
 *   publicName?: string|null,
 *   churchDisplayName?: string|null,
 *   organizationDisplayName?: string|null,
 *   branchDisplayName?: string|null,
 *   branchSpecific?: boolean,
 * }} opts
 */
function buildPublicDemoPack(opts) {
  const publicName = resolveCanonicalChurchName(opts);
  const N = CHURCH_NAME_TOKEN;

  const home = Object.freeze({
    heroEyebrow: `Welcome to ${N}`,
    heroHeading: "Faith, Community and Hope",
    heroBody: `At ${N}, we gather to worship Jesus, open Scripture together, and practice hospitality that makes room for every neighbour. Whether you are exploring faith for the first time or returning after a long season, you will find clear teaching, warm welcome, and practical next steps.`,
    heroMediaUrl: MEDIA.homeHero,
    welcomeHeading: "A Place to Belong",
    welcomeBody: `We are glad you found ${N}. Our Sunday gatherings combine thoughtful worship, accessible teaching, and space to meet people who care about your story. After the service, stay for coffee, ask a question, or take a quiet walk through our welcome area — there is no pressure and plenty of help finding your next step.`,
    aboutPreviewHeading: "Who We Are",
    aboutPreviewBody: `${N} exists to help people follow Jesus in everyday life. We value Scripture that is taught with clarity, prayer that is honest, and service that meets real needs in our city. Come see how worship, friendship, and neighbour-care weave together in one church family.`,
    ministriesIntroHeading: "Grow and Serve Together",
    ministriesIntroBody: `From children's discovery to youth gatherings, women's fellowship, and community outreach, ministries at ${N} help you build friendships and use your gifts. Explore a group that fits your season of life and take one simple next step this month.`,
    eventsIntroHeading: "This Season at Church",
    eventsIntroBody: `Join upcoming gatherings at ${N} — from Sunday connection mornings to leadership workshops and neighbourhood celebrations. Events are designed to help you meet people, grow in faith, and serve with joy.`,
    sermonIntroHeading: "Listen and Reflect",
    sermonIntroBody: `Catch a recent message from ${N}. Each teaching aims to open Scripture with clarity and leave you with one practical next step for home, work, and community life.`,
    leadershipIntroHeading: "Pastors and Leaders",
    leadershipIntroBody: `Meet the pastors and ministry leaders who teach, shepherd, and equip the ${N} family. They are glad to pray with you and help you find a place to belong.`,
    givingHeading: "Generosity that Builds Community",
    givingBody: `Your generosity helps ${N} sustain Sunday worship, discipleship for every age, and practical care for neighbours. Learn how to give through the published options our church shares — BlessBoard never processes payments on this page.`,
    contactHeading: "Plan Your Visit",
    contactBody: `We would love to welcome you at ${N}. Find service times, ask a question, or request directions before your first Sunday. A greeter will help you settle in when you arrive.`,
    serviceTimesHeading: "When We Gather",
    serviceTimesBody: `Regular service times at ${N} are listed below. Times can change for holidays or special gatherings — check with the church office if you are planning a first visit.`,
  });

  const about = Object.freeze({
    heroHeading: "Our History and Calling",
    heroBody: `Learn who we are, what we believe, and how ${N} serves our city with clarity, compassion, and hope rooted in Jesus Christ.`,
    heroMediaUrl: MEDIA.aboutHero,
    story: Object.freeze({
      sectionKey: "story",
      sectionType: "story",
      heading: "How We Began — and Why We Gather",
      bodyText: [
        `${N} began as a small circle of friends who wanted Scripture, prayer, and hospitality to shape ordinary life. What started in living rooms grew into a congregation that still values unhurried welcome and clear teaching on Sundays and through the week.`,
        `Over the years we have added ministries for children, students, and adults, while keeping the same centre: worship that lifts our eyes to God, community that carries one another, and neighbour-care that meets practical needs with dignity and hope.`,
        `Today we gather each Sunday, meet midweek for study and prayer, and partner with local schools and care organisations across the city. Whether you are new to faith or have walked with Jesus for decades, there is room for your questions and your gifts at ${N}.`,
        `We invite you to visit, ask honest questions, and take one next step — a conversation with a greeter, a small group introduction, or simply returning next Sunday. You do not need to have everything figured out to belong here; come as you are, bring your family, and grow with us over time.`,
      ].join("\n\n"),
      mediaUrl: MEDIA.aboutStory,
    }),
    mission: Object.freeze({
      sectionKey: "mission",
      sectionType: "mission",
      heading: "Mission",
      bodyText: `Our mission is to help people discover life with Jesus and live it out together. At ${N}, that means clear Scripture teaching, prayerful community, and practical love for neighbours near and far.`,
      mediaUrl: null,
    }),
    vision: Object.freeze({
      sectionKey: "vision",
      sectionType: "vision",
      heading: "Vision",
      bodyText: `We long to see a neighbourhood shaped by grace — households growing in faith, friendships that cross generations, and a church known for integrity, hospitality, and steady care for the city around us.`,
      mediaUrl: null,
    }),
    values: Object.freeze([
      Object.freeze({
        sectionKey: "value_presence",
        sectionType: "values",
        heading: "Presence",
        bodyText:
          "We show up for God and for one another with undivided attention — in worship, conversation, and everyday care.",
      }),
      Object.freeze({
        sectionKey: "value_integrity",
        sectionType: "values",
        heading: "Integrity",
        bodyText:
          "We ask honest questions, pursue truth with humility, and keep our words aligned with our actions.",
      }),
      Object.freeze({
        sectionKey: "value_compassion",
        sectionType: "values",
        heading: "Compassion",
        bodyText:
          "We move toward need with practical help, lasting relationships, and dignity for every neighbour.",
      }),
      Object.freeze({
        sectionKey: "value_discipleship",
        sectionType: "values",
        heading: "Discipleship",
        bodyText:
          "We grow through Scripture, prayer, and shared habits that shape home, work, and community life.",
      }),
    ]),
    beliefs: Object.freeze({
      sectionKey: "beliefs",
      sectionType: "beliefs",
      heading: "What We Believe",
      bodyText: `We hold Scripture as a living guide for flourishing. We confess Jesus Christ as Lord, trust the gospel of grace, and seek the Spirit’s help to love God and neighbour. Salvation renews mind, body, and community — not only the inner life. Visitors are welcome to ask questions; our pastors are glad to talk through the foundations of our faith.`,
      mediaUrl: null,
    }),
    community: Object.freeze({
      sectionKey: "community",
      sectionType: "community",
      heading: "In Our Neighbourhood",
      bodyText: `${N} invests time and resources in local education support, neighbourhood care projects, and partnerships that strengthen the city around us. We prefer steady presence over spectacle — showing up with meals, mentoring, and practical help when it matters.`,
      mediaUrl: null,
    }),
    visitorCtaHeading: "Visit on a Sunday",
    visitorCtaBody: `Come see ${N} in person. Arrive a few minutes early, find a greeter, and stay after the service if you would like to meet someone from the pastoral team. You are welcome exactly as you are.`,
    gallery: Object.freeze([MEDIA.aboutGallery1, MEDIA.aboutGallery2, MEDIA.aboutGallery3]),
  });

  const leadership = Object.freeze({
    introHeading: "Leaders Who Shepherd and Equip",
    introBody: `Meet the pastors and ministry leaders who teach, care for people, and help the ${N} family take next steps in faith. They pray with visitors, equip volunteers, and keep our ministries healthy and clear.`,
    introMediaUrl: MEDIA.leadershipIntro,
    contactCtaHeading: "Talk with a Pastor",
    contactCtaBody: `If you would like prayer, guidance, or simply a conversation about belonging at ${N}, reach out through our contact page. A member of the pastoral team will respond as soon as they can.`,
  });

  const leaders = Object.freeze([
    Object.freeze({
      id: "demo-leader-senior",
      displayName: "Pastor Jordan Hale",
      roleTitle: "Senior Pastor",
      biography: `Jordan teaches with warmth and clarity, helping people find hope in Scripture and put faith into practice at home and work. Before serving at ${N}, Jordan spent years mentoring young adults and walking with families through both joy and grief. On Sundays you will hear teaching that is accessible, rooted in the Bible, and aimed at one clear next step.`,
      imageUrl: MEDIA.pastor,
      sortOrder: 10,
      contactHref: null,
      seniorLeader: true,
    }),
    Object.freeze({
      id: "demo-leader-associate",
      displayName: "Pastor Sam Okonkwo",
      roleTitle: "Associate Pastor",
      biography:
        "Sam oversees pastoral care and midweek gatherings, walking with families through seasons of joy and challenge. Sam is often the first to visit hospitals, welcome newcomers, and help small groups stay healthy.",
      imageUrl: MEDIA.associate,
      sortOrder: 20,
      contactHref: null,
    }),
    Object.freeze({
      id: "demo-leader-ministries",
      displayName: "Sarah Chen",
      roleTitle: "Director of Ministries",
      biography:
        "Sarah builds teams that welcome newcomers and help every age group find a place to grow and serve. She loves matching gifts with needs and making first Sundays less intimidating.",
      imageUrl: MEDIA.leader3,
      sortOrder: 30,
      contactHref: null,
    }),
    Object.freeze({
      id: "demo-leader-executive",
      displayName: "David Miller",
      roleTitle: "Executive Pastor",
      biography:
        "David stewards operations and long-range planning so ministry stays healthy, clear, and sustainable. He supports volunteers behind the scenes so Sunday gatherings run with calm excellence.",
      imageUrl: MEDIA.leader4,
      sortOrder: 40,
      contactHref: null,
    }),
  ]);

  const ministries = Object.freeze([
    Object.freeze({
      id: "demo-ministry-kids",
      name: "Children’s Ministry",
      summary: "A safe, engaging environment where children discover God’s love through stories, songs, and friendship.",
      description: `During Sunday worship, children at ${N} gather for age-appropriate teaching, creative activities, and caring leaders who know them by name. Parents receive a clear check-in process and a simple summary of what was taught so faith conversations can continue at home.`,
      meetingDay: "Sunday during worship",
      audience: "Children (nursery through primary years)",
      leaderName: "Sam Okonkwo",
      contactEmail: null,
      contactHref: null,
      ctaLabel: "Ask about Children’s Ministry",
      imageUrl: MEDIA.ministryChildren || MEDIA.ministryWorship,
      sortOrder: 10,
    }),
    Object.freeze({
      id: "demo-ministry-youth",
      name: "Youth Ministry",
      summary: "A place for students to grow in faith, friendship, and courage for everyday life.",
      description:
        "Youth gatherings combine games, Scripture, and honest conversation. Students are encouraged to ask hard questions, serve their neighbourhood, and build friendships that last beyond a single school year. Leaders partner with parents and keep a warm, structured environment.",
      meetingDay: "Friday · 6:30 PM",
      audience: "Students ages 12–18",
      leaderName: "Marcus Wright",
      contactEmail: null,
      contactHref: null,
      ctaLabel: "Join a youth night",
      imageUrl: MEDIA.ministryYouth,
      sortOrder: 20,
    }),
    Object.freeze({
      id: "demo-ministry-women",
      name: "Women’s Fellowship",
      summary: "Encouragement, Scripture, and friendship for women in every season of life.",
      description: `Women’s Fellowship at ${N} offers midweek connection, prayer, and practical study that fits busy schedules. Whether you are new to the area or have long roots here, you will find space to share honestly and grow together without pressure.`,
      meetingDay: "Second Saturday · 10:00 AM",
      audience: "Women of all ages",
      leaderName: "Sarah Chen",
      contactEmail: null,
      contactHref: null,
      ctaLabel: "Learn more",
      imageUrl: MEDIA.ministryWomen || MEDIA.ministryWorship,
      sortOrder: 30,
    }),
    Object.freeze({
      id: "demo-ministry-outreach",
      name: "Community Outreach",
      summary: "Practical neighbour-care projects that put compassion into action.",
      description:
        "Monthly outreach Saturdays focus on local needs — food support, school partnerships, and visits that restore dignity. Volunteers of every age are welcome. Training is simple, and every project ends with a short time of prayer and reflection.",
      meetingDay: "Monthly outreach Saturday",
      audience: "All ages welcome",
      leaderName: "Elena Rodriguez",
      contactEmail: null,
      contactHref: null,
      ctaLabel: "Volunteer with outreach",
      imageUrl: MEDIA.ministryOutreach,
      sortOrder: 40,
    }),
  ]);

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const events = Object.freeze([
    Object.freeze({
      id: "demo-event-1",
      title: "Leaders Equipping Weekend",
      summary: `A weekend of teaching, prayer, and practical workshops for serving teams at ${N}. Ideal for small-group hosts, worship helpers, and anyone exploring leadership.`,
      startsAt: new Date(now + 5 * dayMs).toISOString(),
      endsAt: new Date(now + 7 * dayMs).toISOString(),
      timezone: "UTC",
      location: "Main sanctuary",
      imageUrl: MEDIA.event1,
      registrationUrl: null,
      registrationNote: "Register with the church office so we can prepare materials.",
      organizer: "Church leadership team",
    }),
    Object.freeze({
      id: "demo-event-2",
      title: "Sunday Morning Connection",
      summary:
        "Coffee, conversation, and a warm welcome before the morning service. Greeters will help first-time visitors find seating, children’s check-in, and someone to sit with if helpful.",
      startsAt: new Date(now + 2 * dayMs).toISOString(),
      endsAt: null,
      timezone: "UTC",
      location: "Fellowship hall",
      imageUrl: MEDIA.event2,
      registrationUrl: null,
      registrationNote: "No registration required — simply arrive early.",
      organizer: "Welcome team",
    }),
    Object.freeze({
      id: "demo-event-3",
      title: "Neighbourhood Celebration",
      summary: `An outdoor gathering with food, games, and welcome for every family. ${N} hosts this celebration to bless our street and invite neighbours to experience the warmth of our church community.`,
      startsAt: new Date(now + 12 * dayMs).toISOString(),
      endsAt: null,
      timezone: "UTC",
      location: "Church lawn",
      imageUrl: MEDIA.event3,
      registrationUrl: null,
      registrationNote: "Families welcome; weather updates posted on Sunday.",
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
      series: "Walking in Grace",
      summary:
        "When life feels crowded and loud, Scripture invites us to bring our worries to God with thanksgiving. This message explores Philippians 4 and offers practical habits for prayer, rest, and steady hope through an ordinary week.",
      mediaUrl: null,
      resourceUrl: null,
      imageUrl: MEDIA.sermon,
      scripture: "Philippians 4:6-7",
    }),
    Object.freeze({
      id: "demo-sermon-2",
      title: "The Gift of Attention",
      speakerName: "Pastor Sam Okonkwo",
      preachedAt: new Date(now - 14 * dayMs).toISOString(),
      category: "Walking in Grace",
      series: "Walking in Grace",
      summary:
        "Learning to give God and people our undivided attention in a distracted age. Sam opens Matthew 6 and shows how treasure, focus, and love for neighbour belong together in discipleship.",
      mediaUrl: null,
      resourceUrl: null,
      imageUrl: MEDIA.sermon2 || MEDIA.sermon,
      scripture: "Matthew 6:21-23",
    }),
    Object.freeze({
      id: "demo-sermon-3",
      title: "Be Still and Know",
      speakerName: "Pastor Jordan Hale",
      preachedAt: new Date(now - 21 * dayMs).toISOString(),
      category: "Foundations of Focus",
      series: "Foundations of Focus",
      summary:
        "Psalm 46 calls us to trust God’s presence when culture is loud. This teaching helps listeners practise stillness, remember God’s faithfulness, and choose wisdom in daily decisions.",
      mediaUrl: null,
      resourceUrl: null,
      imageUrl: MEDIA.sermon3 || MEDIA.sermon,
      scripture: "Psalm 46:10",
    }),
  ]);

  const givingMethods = Object.freeze([
    Object.freeze({
      id: "demo-giving-bank_transfer",
      methodType: "bank_transfer",
      label: "Bank Transfer",
      instructions:
        "Contact the church office for published bank transfer instructions. Sensitive payment details are shared privately so they stay accurate and secure.",
      externalUrl: null,
      icon: "account_balance",
      sortOrder: 10,
    }),
    Object.freeze({
      id: "demo-giving-mobile_money",
      methodType: "mobile_money",
      label: "Mobile Money",
      instructions:
        "Ask the office for the current published mobile-money details for this congregation. BlessBoard does not process mobile payments on this page.",
      externalUrl: null,
      icon: "smartphone",
      sortOrder: 20,
    }),
    Object.freeze({
      id: "demo-giving-in_person",
      methodType: "in_person",
      label: "In-Person Offering",
      instructions: "Give during Sunday worship or visit the church office during published office hours.",
      externalUrl: null,
      icon: "volunteer_activism",
      sortOrder: 30,
    }),
  ]);

  const ministriesPage = Object.freeze({
    introHeading: "A Space to Belong and Grow",
    introBody: `Discover ministries at ${N} where you can grow in faith, serve others, and find lasting community. Each group has a clear purpose, welcoming leaders, and a simple way to begin.`,
    introMediaUrl: MEDIA.ministriesIntro || MEDIA.ministryWorship,
  });

  const eventsPage = Object.freeze({
    introHeading: "Upcoming Gatherings",
    introBody: `See what is coming up at ${N}. Join us for worship, learning, and community celebrations — dates below are sample upcoming gatherings you can replace with your own calendar.`,
    introMediaUrl: MEDIA.eventsIntro || MEDIA.event1,
  });

  const sermonsPage = Object.freeze({
    introHeading: "Recent Teachings",
    introBody: `Listen to recent messages from ${N}. Media links appear only when the church has published a safe audio or video URL. Summaries help you decide which message to revisit.`,
    introMediaUrl: MEDIA.sermonsIntro || MEDIA.sermon,
  });

  const contactPage = Object.freeze({
    introHeading: "We'd Love to Hear From You",
    introBody: `Reach ${N} about a first visit, pastoral care, ministry questions, or practical directions. We respond as quickly as we can during office hours and will point you to the right person when needed.`,
    visitorGuidance:
      "First-time visitors are always welcome. Tell us you are coming if you would like a greeter to meet you, or simply arrive a few minutes early on Sunday. Children are cared for during the message, and coffee is available after the service.",
    officeHoursHeading: "Office Hours",
    officeHoursBody: "Monday – Thursday · 9:00 AM – 4:00 PM",
    directionsHeading: "Address and Directions",
    directionsBody:
      "Use the published address below for maps and parking guidance. If you need step-free access or have other accessibility questions, contact the office before your visit.",
    serviceReminderHeading: "Service-Time Reminder",
    serviceReminderBody: `Check the service times on this page or the home page before you travel. Holiday schedules at ${N} may differ — the office can confirm the next Sunday gathering.`,
  });

  const givingPage = Object.freeze({
    introHeading: "Generosity with Clarity and Care",
    introBody: `Your generosity helps ${N} sustain worship, discipleship, and neighbourhood care. This page explains why we give and how to use the published giving options — BlessBoard does not process payments here.`,
    whyHeading: "Why We Give",
    whyItems: Object.freeze([
      Object.freeze({
        sectionKey: "why_impact",
        icon: "volunteer_activism",
        title: "Community Impact",
        body: "Gifts support local outreach, pastoral care, and the daily work of this congregation.",
      }),
      Object.freeze({
        sectionKey: "why_stewardship",
        icon: "favorite",
        title: "Worshipful Stewardship",
        body: "Giving is a joyful response to the grace we have received, practised with wisdom and freedom.",
      }),
      Object.freeze({
        sectionKey: "why_accountability",
        icon: "verified",
        title: "Accountable Care",
        body: "Leaders manage published gifts with clear communication and care for designations.",
      }),
    ]),
    stewardshipHeading: "Stewardship and Support",
    stewardshipBody: `${N} treats giving as partnership, not pressure. Use only the methods the church has published. If you need help understanding designations, receipts, or confidential assistance, contact the office — never share card or wallet details on this website.`,
    waysHeading: "Ways to Give",
    accountability:
      "For questions about designations or receipts, contact the church office. BlessBoard never collects card, bank, or wallet credentials on this page, and this demo does not activate a payment processor.",
    assistanceContact:
      "Need confidential assistance or have a stewardship question? Reach the church office through the Contact page and ask for the giving administrator.",
  });

  const contact = Object.freeze({
    addressText: "123 Welcome Way, Community Heights",
    phone: "(555) 010-2000",
    email: "hello@example.church",
    phoneHref: "tel:+15550102000",
    emailHref: "mailto:hello@example.church",
    addressLines: ["123 Welcome Way", "Community Heights"],
    latitude: null,
    longitude: null,
    hasMap: false,
    mapEmbedUrl: null,
    directionsUrl: null,
    hasAny: true,
  });

  const footer = Object.freeze({
    description: `${N} is a community where faith finds a home. Join us as we worship, grow, and serve our neighbourhood with grace and hope.`,
  });

  const raw = {
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
    churchName: publicName,
  };

  return Object.freeze(interpolateDemoValue(raw, publicName));
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
  CHURCH_NAME_TOKEN,
  CHURCH_NAME_ALIASES,
  resolveCanonicalChurchName,
  interpolateDemoText,
  interpolateDemoValue,
  buildPublicDemoPack,
  mediaOrFallback,
};
