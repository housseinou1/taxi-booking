import React from "react";

import { DRIVER_TERMS_SECTIONS } from "./driverTermsContent";
import { submitDriverESign } from "./legalApi";
import ElectronicSignatureScreen from "./components/ElectronicSignatureScreen";
import { DRIVER_LEGAL_DECLARATION, LEGAL_VERSION } from "./legalVersions";
import "./legal-compliance.css";

export default function DriverLegalSign({ onSigned, onBack }) {
  return (
    <ElectronicSignatureScreen
      title="Yala Driver Agreement"
      subtitle="Electronic signature required before approval and going online."
      sections={DRIVER_TERMS_SECTIONS}
      declarationText={DRIVER_LEGAL_DECLARATION}
      agreementType="driver"
      termsVersion={LEGAL_VERSION.driver}
      submitLabel="Sign Driver Agreement"
      onBack={onBack}
      onSubmit={async (formData) => {
        const result = await submitDriverESign(formData);
        onSigned?.(result);
      }}
    />
  );
}
