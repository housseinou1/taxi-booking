import React from "react";
import { cx } from "../utils/cx";

export default function Skeleton({
  width = "100%",
  height = "1em",
  circle = false,
  className,
  style,
  ...rest
}) {
  return (
    <span
      className={cx("yds-skeleton", className)}
      style={{
        width,
        height,
        borderRadius: circle ? "50%" : undefined,
        display: "inline-block",
        ...style,
      }}
      aria-hidden="true"
      {...rest}
    />
  );
}
