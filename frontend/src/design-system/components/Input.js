import React from "react";
import { cx } from "../utils/cx";

export default function Input({
  label,
  hint,
  error,
  className,
  inputClassName,
  id,
  ...rest
}) {
  const inputId = id || `yds-input-${Math.random().toString(36).slice(2, 9)}`;
  const hasError = Boolean(error);

  return (
    <div className={cx("yds-input-field", className)}>
      {label ? <label className="yds-label" htmlFor={inputId}>{label}</label> : null}
      <input
        id={inputId}
        className={cx("yds-input", hasError && "yds-input--error", inputClassName)}
        aria-invalid={hasError}
        {...rest}
      />
      {hint && !hasError ? <span className="yds-hint">{hint}</span> : null}
      {hasError ? <span className="yds-hint" style={{ color: "var(--yds-color-error, var(--yds-danger))" }}>{error}</span> : null}
    </div>
  );
}
