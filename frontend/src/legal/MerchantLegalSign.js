import React from "react";

import ElectronicSignatureScreen from "./components/ElectronicSignatureScreen";
import { submitMerchantESign } from "./legalApi";
import { LEGAL_VERSION, MERCHANT_LEGAL_DECLARATION } from "./legalVersions";
import "./legal-compliance.css";

const MERCHANT_TERMS_SECTIONS = [
  {
    id: 1,
    title: "Merchant Agreement",
    body: "By signing, you agree to list products, fulfill orders accurately, and comply with Yala Delivery policies.",
  },
  {
    id: 2,
    title: "Pricing & Fulfillment",
    bullets: [
      "Publish accurate prices and item availability",
      "Prepare orders within stated prep times",
      "Maintain food safety and product quality standards",
    ],
  },
  {
    id: 3,
    title: "Refunds & Disputes",
    bullets: [
      "Cooperate with customer refund investigations",
      "Accept chargebacks for missing or incorrect items",
      "Respond to Yala support within reasonable time",
    ],
  },
  {
    id: 4,
    title: "Compliance",
    bullets: [
      "Maintain valid business licenses and tax documents",
      "Do not sell prohibited items",
      "Protect customer data shared for delivery",
    ],
  },
];

export default function MerchantLegalSign({ onSigned, onBack }) {
  return (
    <ElectronicSignatureScreen
      title="Merchant Agreement"
      subtitle="Required before your store can be approved."
      sections={MERCHANT_TERMS_SECTIONS}
      declarationText={MERCHANT_LEGAL_DECLARATION}
      agreementType="merchant"
      termsVersion={LEGAL_VERSION.merchant}
      submitLabel="Sign Merchant Agreement"
      onBack={onBack}
      onSubmit={async (formData) => {
        const result = await submitMerchantESign(formData);
        onSigned?.(result);
      }}
    />
  );
}
