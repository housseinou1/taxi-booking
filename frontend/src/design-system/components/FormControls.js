import React, { useId, useMemo } from "react";
import { cx } from "../utils/cx";
import Input from "./Input";

export function TextInput(props) {
  return <Input {...props} />;
}

export function PhoneInput({
  label = "Phone number",
  countryCode = "+222",
  value,
  onChange,
  error,
  className,
  ...rest
}) {
  return (
    <div className={cx("yds-phone-input", className)}>
      <Input
        label={label}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={value}
        onChange={onChange}
        error={error}
        placeholder={`${countryCode} …`}
        {...rest}
      />
    </div>
  );
}

export function OTPInput({
  length = 6,
  value = "",
  onChange,
  label = "Verification code",
  error,
  className,
  ...rest
}) {
  const id = useId();
  const digits = useMemo(() => {
    const chars = String(value || "").replace(/\D/g, "").slice(0, length).split("");
    while (chars.length < length) chars.push("");
    return chars;
  }, [value, length]);

  const updateAt = (index, nextChar) => {
    const next = digits.slice();
    next[index] = nextChar.replace(/\D/g, "").slice(-1);
    onChange?.(next.join(""));
  };

  return (
    <fieldset className={cx("yds-otp", className)} {...rest}>
      <legend className="yds-label">{label}</legend>
      <div className="yds-otp__row" role="group" aria-label={label}>
        {digits.map((digit, index) => (
          <input
            key={`${id}-${index}`}
            className={cx("yds-input", "yds-otp__cell", error && "yds-input--error")}
            inputMode="numeric"
            maxLength={1}
            value={digit}
            aria-label={`Digit ${index + 1}`}
            onChange={(e) => updateAt(index, e.target.value)}
          />
        ))}
      </div>
      {error ? <span className="yds-hint" style={{ color: "var(--yds-color-error)" }}>{error}</span> : null}
    </fieldset>
  );
}

export function Dropdown({
  label,
  options = [],
  value,
  onChange,
  error,
  hint,
  className,
  id,
  ...rest
}) {
  const selectId = id || `yds-select-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className={cx("yds-input-field", className)}>
      {label ? <label className="yds-label" htmlFor={selectId}>{label}</label> : null}
      <select
        id={selectId}
        className={cx("yds-input", "yds-select", error && "yds-input--error")}
        value={value}
        onChange={onChange}
        aria-invalid={Boolean(error)}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && !error ? <span className="yds-hint">{hint}</span> : null}
      {error ? <span className="yds-hint" style={{ color: "var(--yds-color-error)" }}>{error}</span> : null}
    </div>
  );
}

export function SegmentedControl({
  options = [],
  value,
  onChange,
  label,
  className,
  ...rest
}) {
  return (
    <div className={cx("yds-segmented", className)} role="group" aria-label={label} {...rest}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={cx("yds-segmented__item", selected && "is-selected")}
            aria-pressed={selected}
            onClick={() => onChange?.(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({
  checked = false,
  onChange,
  label,
  description,
  disabled = false,
  className,
  ...rest
}) {
  return (
    <label className={cx("yds-switch-row", className)}>
      <span className="yds-switch-row__copy">
        {label ? <strong className="yds-type-body">{label}</strong> : null}
        {description ? <span className="yds-type-caption">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        className={cx("yds-switch", checked && "is-on")}
        aria-checked={checked}
        aria-label={label || "Toggle"}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        {...rest}
      >
        <span className="yds-switch__thumb" aria-hidden="true" />
      </button>
    </label>
  );
}

export function Checkbox({
  checked = false,
  onChange,
  label,
  disabled = false,
  className,
  id,
  ...rest
}) {
  const inputId = id || `yds-check-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <label className={cx("yds-check", className)} htmlFor={inputId}>
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        {...rest}
      />
      <span>{label}</span>
    </label>
  );
}

export function RadioButton({
  checked = false,
  onChange,
  label,
  name,
  value,
  disabled = false,
  className,
  id,
  ...rest
}) {
  const inputId = id || `yds-radio-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <label className={cx("yds-radio", className)} htmlFor={inputId}>
      <input
        id={inputId}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        {...rest}
      />
      <span>{label}</span>
    </label>
  );
}

export default {
  TextInput,
  PhoneInput,
  OTPInput,
  Dropdown,
  SegmentedControl,
  Switch,
  Checkbox,
  RadioButton,
};
