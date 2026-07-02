import React from "react";

import MerchantLegalSign from "../legal/MerchantLegalSign";

export default function MerchantLegalSignRoute() {
  return (
    <MerchantLegalSign
      onBack={() => {
        window.location.href = "/merchant";
      }}
      onSigned={() => {
        window.location.href = "/merchant";
      }}
    />
  );
}
