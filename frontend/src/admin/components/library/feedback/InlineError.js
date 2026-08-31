import React from "react";

export default function InlineError({ message = "Something went wrong", id }) {
  return (
    <p className="admin-inline-error" role="alert" id={id}>
      {message}
    </p>
  );
}
