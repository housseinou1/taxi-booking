import React from "react";

import { humanizeApiMessage } from "../utils/apiMessage";

export default function InlineError({ message = "Something went wrong", id, children }) {
  // Phase 11 fix: `children` used to be silently dropped, so callers that passed
  // custom content (e.g. a retry button) rendered an empty error. Children now
  // render after the message, and `message` may be omitted when children are used.
  //
  // Many call sites pass the raw transport message (axios's
  // "Request failed with status code 404"). Normalising at the render layer means
  // every one of them becomes actionable without editing 100+ files, and the
  // normaliser is admin-only so the Rider/Driver/Delivery apps are unaffected.
  const display = humanizeApiMessage(message);
  const hasChildren = Boolean(children);
  return (
    <p className="admin-inline-error" role="alert" id={id}>
      {display ? <span>{display}</span> : null}
      {hasChildren ? <span className="admin-inline-error__extra">{children}</span> : null}
    </p>
  );
}
