import React, { Suspense } from "react";

import { DeliveryUberPage } from "./DeliveryUberLayout";
import "./delivery-uber.css";

const LazyCourierSettings = React.lazy(() => import("./components/DeliveryCourierSettingsPanel"));

export default function DeliveryCourierSettings() {
  return (
    <DeliveryUberPage
      title="Settings"
      onBack={() => {
        window.location.href = "/delivery/account";
      }}
    >
      <Suspense fallback={<p className="delivery-uber__empty">Loading settings...</p>}>
        <LazyCourierSettings />
      </Suspense>
    </DeliveryUberPage>
  );
}
