import React from "react";

import DriverLegalSign from "../legal/DriverLegalSign";

function getReturnPath() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("return");
  if (next && next.startsWith("/driver")) return next;
  return "/driver";
}

export default function DriverLegalSignRoute() {
  const returnPath = getReturnPath();

  return (
    <DriverLegalSign
      onBack={() => {
        window.location.href = returnPath;
      }}
      onSigned={() => {
        window.location.href = returnPath;
      }}
    />
  );
}
