import React from "react";

import { humanizeApiMessage } from "../utils/apiMessage";

export default function RetryBlock({ onRetry, label = "Try again", message }) {
  return (
    <div className="admin-retry">
      {message ? <p className="admin-retry__message">{humanizeApiMessage(message)}</p> : null}
      <button type="button" className="admin-lib-btn" onClick={onRetry}>
        {label}
      </button>
    </div>
  );
}
