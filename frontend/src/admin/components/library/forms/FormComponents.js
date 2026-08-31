import React from "react";

export default function SearchBar({ value, onChange, placeholder = "Search…", onSubmit, label = "Search" }) {
  return (
    <form
      className="admin-search-bar"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(value);
      }}
    >
      <label className="admin-search-bar__label">
        <span className="admin-shell__sr-only">{label}</span>
        <input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      </label>
      <button type="submit" className="admin-lib-btn">
        Search
      </button>
    </form>
  );
}

export function FilterBar({ children, onReset }) {
  return (
    <div className="admin-filter-bar">
      <div className="admin-filter-bar__fields">{children}</div>
      {onReset ? (
        <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={onReset}>
          Reset filters
        </button>
      ) : null}
    </div>
  );
}

export function DateRangePicker({ start, end, onStartChange, onEndChange, label = "Date range" }) {
  return (
    <fieldset className="admin-date-range">
      <legend>{label}</legend>
      <label>
        From
        <input type="date" value={start || ""} onChange={(e) => onStartChange(e.target.value)} />
      </label>
      <label>
        To
        <input type="date" value={end || ""} onChange={(e) => onEndChange(e.target.value)} />
      </label>
    </fieldset>
  );
}

export function Select({ label, value, onChange, options = [], placeholder, ...rest }) {
  return (
    <label className="admin-field">
      {label ? <span className="admin-field__label">{label}</span> : null}
      <select className="admin-lib-select" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((opt) => (
          <option key={opt.value ?? opt} value={opt.value ?? opt}>
            {opt.label ?? opt}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Autocomplete({ label, value, onChange, options = [], placeholder = "Type to search…" }) {
  const filtered = options.filter((opt) =>
    String(opt.label || opt).toLowerCase().includes(String(value || "").toLowerCase())
  );
  return (
    <label className="admin-field admin-autocomplete">
      {label ? <span className="admin-field__label">{label}</span> : null}
      <input
        type="text"
        list={`${label || "auto"}-list`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={`${label || "auto"}-list`}>
        {filtered.map((opt) => (
          <option key={opt.value ?? opt.label ?? opt} value={opt.label ?? opt} />
        ))}
      </datalist>
    </label>
  );
}

export function Drawer({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="admin-drawer-overlay" role="presentation" onClick={onClose}>
      <aside className="admin-drawer" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="admin-drawer__head">
          <h3>{title}</h3>
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={onClose} aria-label="Close drawer">
            ✕
          </button>
        </div>
        <div className="admin-drawer__body">{children}</div>
      </aside>
    </div>
  );
}

export function Modal({ open, title, children, onClose, footer }) {
  if (!open) return null;
  return (
    <div className="admin-modal-overlay" role="presentation" onClick={onClose}>
      <div className="admin-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal__head">
          <h3>{title}</h3>
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>
        <div className="admin-modal__body">{children}</div>
        {footer ? <div className="admin-modal__footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmationDialog({
  open,
  title = "Confirm action",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  tone = "danger",
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={`admin-lib-btn admin-lib-btn--${tone}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}

export function MultiStepForm({ steps = [], step = 0, onStepChange, children }) {
  return (
    <div className="admin-multi-step">
      <ol className="admin-multi-step__nav" aria-label="Form steps">
        {steps.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              className={`admin-multi-step__step ${index === step ? "admin-multi-step__step--active" : ""}`.trim()}
              aria-current={index === step ? "step" : undefined}
              onClick={() => onStepChange(index)}
            >
              {index + 1}. {label}
            </button>
          </li>
        ))}
      </ol>
      <div className="admin-multi-step__body">{children}</div>
    </div>
  );
}
