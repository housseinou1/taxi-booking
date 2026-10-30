import React from "react";

export default function InlineError({ message = "Something went wrong", id, children }) {
  // Phase 11 fix: `children` used to be silently dropped, so callers that passed
  // custom content (e.g. a retry button) rendered an empty error. Children now
  // render after the message, and `message` may be omitted when children are used.
  const hasChildren = Boolean(children);
  return (
    <p className="admin-inline-error" role="alert" id={id}>
      {message ? <span>{message}</span> : null}
      {hasChildren ? <span className="admin-inline-error__extra">{children}</span> : null}
    </p>
  );
}
