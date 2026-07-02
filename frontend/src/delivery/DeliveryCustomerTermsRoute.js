import React, { useEffect, useState } from "react";

import DeliveryCustomerTermsPage from "./DeliveryCustomerTermsPage";

export default function DeliveryCustomerTermsRoute() {
  const [showAccept, setShowAccept] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setShowAccept(params.get("accept") === "1");
  }, []);

  return <DeliveryCustomerTermsPage showAcceptButton={showAccept} />;
}
