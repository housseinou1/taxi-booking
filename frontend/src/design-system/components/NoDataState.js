import React from "react";
import EmptyState from "./EmptyState";

export default function NoDataState({
  title = "No data available",
  description = "There is nothing to show yet.",
  icon,
  action,
  ...rest
}) {
  return (
    <EmptyState
      role="status"
      title={title}
      text={description}
      icon={icon}
      action={action}
      {...rest}
    />
  );
}
