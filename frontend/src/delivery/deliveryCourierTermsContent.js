/** Yala Delivery Courier Terms — versioned legal copy. */

import { LEGAL_VERSION } from "../legal/legalVersions";

export const COURIER_TERMS_VERSION = LEGAL_VERSION.courier;

export const COURIER_TERMS_SECTIONS = [
  {
    id: 1,
    title: "Acceptance",
    body: "By registering and delivering with Yala Delivery, you agree to these Courier Terms.",
  },
  {
    id: 2,
    title: "Courier Eligibility",
    bullets: [
      "Be 18 years or older",
      "Provide valid government-issued ID",
      "Provide all required delivery documents",
      "Keep documents updated and valid",
      "Pass Yala verification and background checks",
    ],
  },
  {
    id: 3,
    title: "Delivery Rules",
    intro: "Couriers agree to:",
    bullets: [
      "Deliver orders safely and on time",
      "Follow pickup and dropoff instructions",
      "Respect delivery PIN verification when required",
      "Handle packages responsibly",
      "Not tamper with, open, or damage goods",
    ],
  },
  {
    id: 4,
    title: "Prohibited Deliveries",
    intro: "Yala prohibits delivery of:",
    bullets: [
      "Illegal goods",
      "Weapons",
      "Drugs and controlled substances",
      "Hazardous chemicals",
      "Live animals",
      "Other restricted or prohibited products",
    ],
  },
  {
    id: 5,
    title: "Payment & Earnings",
    bullets: [
      "Courier earnings are displayed in MRU",
      "Yala commission may apply to completed deliveries",
      "Bonuses and promotions may change without prior notice",
      "Fraudulent activity may void payouts and lead to account action",
    ],
  },
  {
    id: 6,
    title: "PIN Verification",
    bullets: [
      "A recipient PIN may be required to complete delivery",
      "If the PIN is unavailable, the courier must use the in-app exception workflow",
      "Yala may review proof photos and notes before releasing payout",
    ],
  },
  {
    id: 7,
    title: "Cancellations",
    intro: "Orders may be cancelled by the customer, courier, merchant, or Yala admin. Cancellation fees may apply depending on order status and platform policy.",
  },
  {
    id: 8,
    title: "Ratings & Conduct",
    intro: "Couriers must behave professionally, respect customers, avoid harassment or discrimination, and maintain service quality. Repeated violations may lead to suspension.",
  },
  {
    id: 9,
    title: "Account Suspension",
    intro: "Yala may suspend or terminate courier accounts for:",
    bullets: [
      "Fraud or misrepresentation",
      "Abuse of customers, merchants, or support staff",
      "Fake or manipulated deliveries",
      "Expired or invalid documents",
      "Safety violations",
    ],
  },
  {
    id: 10,
    title: "Liability",
    intro: "Yala is not responsible for:",
    bullets: [
      "Incorrect customer addresses",
      "Delays caused by traffic, weather, or road conditions",
      "Customer unavailability at pickup or dropoff",
      "Force majeure events beyond reasonable control",
    ],
  },
  {
    id: 11,
    title: "Privacy",
    intro: "Yala collects location data, delivery history, device information, and payment information. Data is used only for service operations, safety, and platform improvement.",
  },
  {
    id: 12,
    title: "Support & Disputes",
    intro: "Support issues are handled through in-app support, admin review, and official Yala channels.",
  },
  {
    id: 13,
    title: "Updates",
    body: "Yala may update these courier terms at any time. Continued use of Yala Delivery means acceptance of the updated terms.",
  },
];
