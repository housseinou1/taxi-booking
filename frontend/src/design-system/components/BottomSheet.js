import React, { useEffect } from "react";
import { cx } from "../utils/cx";

export default function BottomSheet({
  open,
  onClose,
  children,
  title,
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
    <>
      <div className="yds-sheet-overlay" onClick={onClose} />
      <div className={cx("yds-sheet", className)} role="dialog" aria-modal="true" {...rest}>
        <div className="yds-sheet__handle" aria-hidden="true" />
        {title ? <h2 className="yds-section-title" style={{ marginBottom: 12 }}>{title}</h2> : null}
        {children}
      </div>
    </>
  );
}
