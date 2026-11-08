/**
 * Public marketing site SEO: titles, meta, canonical, JSON-LD.
 * Applied client-side for the website routes; index.html carries crawlable fallbacks.
 */

const SITE_ORIGIN = "https://www.yalataxi.live";

const PAGE_SEO = {
  home: {
    en: {
      title: "YALA Technologies — Taxi & Delivery Mauritania | Nouakchott",
      description:
        "YALA Technologies: YALA Rider, YALA Driver and YALA Delivery across Mauritania. Taxi Nouakchott and 13 cities.",
    },
    fr: {
      title: "YALA Technologies — Taxi & livraison Mauritanie | Nouakchott",
      description:
        "YALA Technologies : VTC et livraison en Mauritanie. Application taxi Nouakchott, YALA Rider, Driver et Delivery.",
    },
    ar: {
      title: "YALA Technologies — تاكسي وتوصيل موريتانيا | نواكشوط",
      description:
        "ياقلة تكنولوجيز: تاكسي وتوصيل في موريتانيا. رايدر، سائق وتوصيل عبر نواكشوط والمدن الرئيسية.",
    },
    path: "/",
  },
  rider: {
    en: {
      title: "YALA Rider — Taxi App Mauritania | YALA Technologies",
      description: "YALA Rider: request rides, live tracking and secure payments in Mauritania.",
    },
    fr: {
      title: "YALA Rider — Application taxi Mauritanie | YALA Technologies",
      description: "YALA Rider : courses, suivi en direct et paiement sécurisé en Mauritanie.",
    },
    ar: {
      title: "YALA Rider — تطبيق التاكسي | YALA Technologies",
      description: "YALA Rider: طلب رحلات وتتبع مباشر ودفع آمن في موريتانيا.",
    },
    path: "/website/rider",
  },
  driver: {
    en: {
      title: "YALA Driver — Drive & Earn | YALA Technologies Mauritania",
      description: "YALA Driver: accept trips and track earnings across Mauritania.",
    },
    fr: {
      title: "YALA Driver — Chauffeur taxi Mauritanie | YALA Technologies",
      description: "YALA Driver : accepter des courses et suivre vos revenus en Mauritanie.",
    },
    ar: {
      title: "YALA Driver — تطبيق السائق | YALA Technologies",
      description: "YALA Driver: قبول الرحلات وتتبع الأرباح في موريتانيا.",
    },
    path: "/website/driver",
  },
  delivery: {
    en: {
      title: "YALA Delivery — Packages & Courier | YALA Technologies",
      description: "YALA Delivery: food, packages and pharmacy delivery in Mauritania.",
    },
    fr: {
      title: "YALA Delivery — Livraison Mauritanie | YALA Technologies",
      description: "YALA Delivery : nourriture, colis et pharmacie à travers la Mauritanie.",
    },
    ar: {
      title: "YALA Delivery — التوصيل | YALA Technologies",
      description: "YALA Delivery: توصيل طعام وطرود وصيدلية في موريتانيا.",
    },
    path: "/website/delivery",
  },
  about: {
    en: {
      title: "About YALA Technologies — Mauritania",
      description: "YALA Technologies: mobility and delivery platform built for Mauritania.",
    },
    fr: {
      title: "À propos — YALA Technologies Mauritanie",
      description: "YALA Technologies : plateforme de mobilité et livraison en Mauritanie.",
    },
    ar: {
      title: "عن YALA Technologies — موريتانيا",
      description: "YALA Technologies: منصة تنقل وتوصيل في موريتانيا.",
    },
    path: "/about",
  },
  safety: {
    en: {
      title: "Safety — YALA Technologies Mauritania",
      description: "Verified drivers, live tracking and emergency tools on YALA.",
    },
    fr: {
      title: "Sécurité — YALA Technologies Mauritanie",
      description: "Chauffeurs vérifiés, suivi en direct et outils d'urgence YALA.",
    },
    ar: {
      title: "السلامة — YALA Technologies",
      description: "سائقون موثقون وتتبع مباشر وأدوات طوارئ على يقلة.",
    },
    path: "/safety",
  },
  contact: {
    en: {
      title: "Contact YALA Technologies",
      description: "Contact YALA support for riders, drivers and delivery in Mauritania.",
    },
    fr: {
      title: "Contact — YALA Technologies",
      description: "Contactez le support YALA pour passagers, chauffeurs et livraison.",
    },
    ar: {
      title: "اتصل بـ YALA Technologies",
      description: "تواصل مع دعم يقلة للركاب والسائقين والتوصيل في موريتانيا.",
    },
    path: "/contact",
  },
  support: {
    en: {
      title: "YALA Support Center",
      description: "Help for YALA Rider, Driver, Delivery and account questions.",
    },
    fr: {
      title: "Centre d'aide YALA",
      description: "Aide pour YALA Rider, Driver, Delivery et votre compte.",
    },
    ar: {
      title: "مركز دعم YALA",
      description: "مساعدة لـ YALA Rider وDriver وDelivery وحسابك.",
    },
    path: "/website/support",
  },
};

function copyForPage(route, lang) {
  const block = PAGE_SEO[route] || PAGE_SEO.home;
  const l = lang === "fr" || lang === "ar" ? lang : "en";
  const localized = block[l] || block.en;
  return { ...localized, path: block.path };
}

function upsertMeta(name, content, attr = "name") {
  if (!content) return;
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel, href) {
  if (!href) return;
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function upsertJsonLd(id, data) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

const ORGANIZATION_ID = `${SITE_ORIGIN}/#organization`;

function baseStructuredData() {
  return {
    organization: {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: "YALA Technologies",
      legalName: "YALA Technologies",
      url: SITE_ORIGIN,
      logo: `${SITE_ORIGIN}/yala-logo.png`,
      email: "support@yalataxi.live",
      telephone: "+22222114373",
      areaServed: { "@type": "Country", name: "Mauritania" },
      sameAs: [],
    },
    webSite: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_ORIGIN}/#website`,
      url: SITE_ORIGIN,
      name: "YALA Technologies",
      publisher: { "@id": ORGANIZATION_ID },
      inLanguage: ["en", "fr", "ar"],
    },
    riderApp: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "YALA Rider",
      applicationCategory: "TravelApplication",
      operatingSystem: "Android, iOS",
      offers: { "@type": "Offer", price: "0", priceCurrency: "MRU" },
      provider: { "@id": ORGANIZATION_ID },
    },
    driverApp: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "YALA Driver",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Android, iOS",
      offers: { "@type": "Offer", price: "0", priceCurrency: "MRU" },
      provider: { "@id": ORGANIZATION_ID },
    },
    deliveryApp: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "YALA Delivery",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Android, iOS",
      offers: { "@type": "Offer", price: "0", priceCurrency: "MRU" },
      provider: { "@id": ORGANIZATION_ID },
    },
  };
}

/**
 * @param {string} route website route key
 * @param {string} lang en | fr | ar
 */
export function applyWebsiteSeo(route, lang = "en") {
  const page = copyForPage(route, lang);
  const canonical = `${SITE_ORIGIN}${page.path}`;

  document.documentElement.lang = lang === "ar" ? "ar" : lang === "fr" ? "fr" : "en";
  document.title = page.title;
  upsertMeta("description", page.description);
  upsertMeta("robots", "index, follow");
  upsertLink("canonical", canonical);

  upsertMeta("og:type", "website", "property");
  upsertMeta("og:url", canonical, "property");
  upsertMeta("og:title", page.title, "property");
  upsertMeta("og:description", page.description, "property");
  upsertMeta("og:image", `${SITE_ORIGIN}/yala-logo.png`, "property");
  upsertMeta("og:locale", lang === "fr" ? "fr_MR" : lang === "ar" ? "ar_MR" : "en_US", "property");

  upsertMeta("twitter:card", "summary_large_image");
  upsertMeta("twitter:title", page.title);
  upsertMeta("twitter:description", page.description);
  upsertMeta("twitter:image", `${SITE_ORIGIN}/yala-logo.png`);

  const sd = baseStructuredData();
  upsertJsonLd("yala-jsonld-org", sd.organization);
  upsertJsonLd("yala-jsonld-website", sd.webSite);
  upsertJsonLd("yala-jsonld-rider", sd.riderApp);
  upsertJsonLd("yala-jsonld-driver", sd.driverApp);
  upsertJsonLd("yala-jsonld-delivery", sd.deliveryApp);
}
