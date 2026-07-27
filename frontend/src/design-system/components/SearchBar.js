import React from "react";
import { cx } from "../utils/cx";

export default function SearchBar({
  icon,
  placeholder,
  value,
  onChange,
  className,
  inputProps,
  ...rest
}) {
  return (
    <div className={cx("yds-search", className)} {...rest}>
      {icon || <span>🔍</span>}
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        {...inputProps}
      />
    </div>
  );
}
