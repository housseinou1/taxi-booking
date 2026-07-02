import React from "react";

import DeliveryCourierLegalSign from "../legal/DeliveryCourierLegalSign";

function getReturnPath() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("return");
  if (next && next.startsWith("/delivery/")) return next;
  return "/delivery/profile-setup";
}

export default function DeliveryCourierLegalSignRoute() {
  const returnPath = getReturnPath();

  return (
    <DeliveryCourierLegalSign
      onBack={() => {
        window.location.href = returnPath;
      }}
      onSigned={() => {
        window.location.href = returnPath;
      }}
    />
  );
}
