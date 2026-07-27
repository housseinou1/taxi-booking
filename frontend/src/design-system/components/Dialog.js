import React, { useEffect } from "react";
import { cx } from "../utils/cx";

export default function Dialog({
  open,
  title,
  children,
  actions,
  onClose,
  className,
  ...rest
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && onClose) onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={cx("yds-dialog-overlay", className)} onClick={onClose} {...rest}>
      <div
        className="yds-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {title ? <h2 className="yds-dialog__title">{title}</h2> : null}
        <div className="yds-dialog__body">{children}</div>
        {actions ? <div className="yds-dialog__actions">{actions}</div> : null}
      </div>
    </div>
  );
}
