import React from "react";

import { COURIER_TERMS_SECTIONS } from "../delivery/deliveryCourierTermsContent";
import { submitCourierESign } from "./legalApi";
import ElectronicSignatureScreen from "./components/ElectronicSignatureScreen";
import { LEGAL_VERSION } from "./legalVersions";
import "./legal-compliance.css";

export default function DeliveryCourierLegalSign({ onSigned, onBack }) {
  return (
    <ElectronicSignatureScreen
      title="Courier Agreement"
      subtitle="Electronic signature required before admin approval."
      sections={COURIER_TERMS_SECTIONS}
      agreementType="courier"
      termsVersion={LEGAL_VERSION.courier}
      submitLabel="Sign & Submit Application"
      onBack={onBack}
      onSubmit={async (formData) => {
        const result = await submitCourierESign(formData);
        onSigned?.(result);
      }}
    />
  );
}
