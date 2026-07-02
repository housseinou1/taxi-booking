import React, { useEffect, useState } from "react";

import DeliveryCourierTermsPage from "./DeliveryCourierTermsPage";

export default function DeliveryCourierTermsRoute() {
  const [showAccept, setShowAccept] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setShowAccept(params.get("accept") === "1");
  }, []);

  return <DeliveryCourierTermsPage showAcceptButton={showAccept} />;
}
