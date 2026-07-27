import React, { useEffect } from "react";
import { cx } from "../utils/cx";

export default function Snackbar({
  children,
  intent = "neutral",
  duration = 4000,
  onClose,
  className,
  ...rest
}) {
  useEffect(() => {
    if (!duration || !onClose) return;
    const id = setTimeout(onClose, duration);
    return () => clearTimeout(id);
  }, [duration, onClose]);

  const intentClass = {
    success: "yds-snackbar--success",
    error: "yds-snackbar--error",
    warning: "yds-snackbar--warning",
    neutral: "",
  }[intent];

  return (
    <div
      className={cx("yds-snackbar", intentClass, className)}
      role="status"
      {...rest}
    >
      {children}
    </div>
  );
}
