/** Yala Taxi Driver Agreement — versioned legal copy. */

import { LEGAL_VERSION } from "./legalVersions";

export const DRIVER_TERMS_VERSION = LEGAL_VERSION.driver;

export const DRIVER_TERMS_SECTIONS = [
  {
    id: 1,
    title: "Driver Agreement",
    body: "By signing, you agree to provide safe, lawful taxi services through the Yala Rider platform.",
  },
  {
    id: 2,
    title: "Eligibility & Documents",
    bullets: [
      "Maintain a valid driver license, insurance, and vehicle registration",
      "Keep your profile, vehicle, and contact information accurate",
      "Submit only authentic documents for admin verification",
    ],
  },
  {
    id: 3,
    title: "Safety & Conduct",
    bullets: [
      "Follow Mauritania traffic laws and never drive impaired",
      "Treat riders respectfully and protect their privacy",
      "Use in-app safety and support tools responsibly",
    ],
  },
  {
    id: 4,
    title: "Earnings & Compliance",
    bullets: [
      "Accept fares, tips, and payouts only through approved Yala processes",
      "Cooperate with fraud, safety, and service investigations",
      "Admin may suspend or remove drivers who violate this agreement",
    ],
  },
];
