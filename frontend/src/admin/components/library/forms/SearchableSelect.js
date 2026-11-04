import React, { useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * SearchableSelect — a professional, accessible dropdown for the YALA admin.
 *
 * Why this exists: the native <select> used elsewhere in the admin cannot be searched, has
 * no loading or empty state, cannot show a secondary code alongside a label, and lets a user
 * land on a disabled option. <datalist> is worse — it offers suggestions but does not
 * constrain the value, so an invalid city name can be submitted.
 *
 * This is a real ARIA combobox:
 *   - role="combobox" on the trigger with aria-expanded / aria-controls / aria-activedescendant
 *   - role="listbox" + role="option" for the popup, so screen readers announce the choices
 *   - full keyboard support: ArrowUp/Down, Home/End, Enter, Escape, Tab, type-to-filter
 *   - options marked `disabled` are visible but cannot be selected, so an invalid selection
 *     is impossible rather than merely discouraged
 *
 * Options are data, never hardcoded: pass whatever the API returns and new rows appear
 * without a frontend change.
 *
 * Option shape: { value, label, hint?, description?, disabled?, disabledReason? }
 * `hint` renders as a small code badge (e.g. the YALA code) next to the label.
 */
export default function SearchableSelect({
  label,
  icon,
  value,
  onChange,
  options = [],
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyLabel = "No options available",
  loading = false,
  loadingLabel = "Loading…",
  disabled = false,
  error = "",
  required = false,
  searchable = true,
  clearable = false,
  clearLabel = "Clear selection",
  name,
  className = "",
  id: idProp,
}) {
  const reactId = useId();
  const baseId = idProp || `ss-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const listId = `${baseId}-listbox`;
  const labelId = `${baseId}-label`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const normalised = useMemo(
    () =>
      options.map((opt) =>
        typeof opt === "object" && opt !== null ? opt : { value: opt, label: String(opt) }
      ),
    [options]
  );

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return normalised;
    const needle = query.trim().toLowerCase();
    return normalised.filter((opt) =>
      [opt.label, opt.hint, opt.description, opt.value]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle))
    );
  }, [normalised, query, searchable]);

  const selected = useMemo(
    () => normalised.find((opt) => String(opt.value) === String(value)) || null,
    [normalised, value]
  );

  const selectable = filtered.filter((opt) => !opt.disabled);
  const optionId = (index) => `${baseId}-opt-${index}`;


  // Close on outside click. Without this the popup stays open when the user clicks a
  // neighbouring field, which reads as a stuck control.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  // Focus the search field as soon as the popup opens so typing filters immediately.
  useEffect(() => {
    if (open && searchable && searchRef.current) searchRef.current.focus();
  }, [open, searchable]);

  // Keep the highlighted option in view during keyboard navigation.
  useEffect(() => {
    if (!open || activeIndex < 0 || !listRef.current) return;
    const node = listRef.current.querySelector(`[id="${optionId(activeIndex)}"]`);
    node?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, open]);

  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
    const currentIndex = filtered.findIndex((opt) => String(opt.value) === String(value));
    setActiveIndex(currentIndex >= 0 ? currentIndex : filtered.findIndex((opt) => !opt.disabled));
  };

  const closeMenu = () => {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  };

  const commit = (opt) => {
    if (!opt || opt.disabled) return;
    onChange?.(opt.value, opt);
    closeMenu();
  };

  const moveActive = (step) => {
    if (!filtered.length) return;
    let next = activeIndex;
    for (let i = 0; i < filtered.length; i += 1) {
      next = (next + step + filtered.length) % filtered.length;
      if (!filtered[next].disabled) break;
    }
    setActiveIndex(next);
  };

  const onTriggerKeyDown = (event) => {
    if (disabled) return;
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key) && !open) {
      event.preventDefault();
      openMenu();
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeMenu();
    }
  };

  const onSearchKeyDown = (event) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(filtered.findIndex((opt) => !opt.disabled));
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(filtered.length - 1);
        break;
      case "Enter":
        event.preventDefault();
        commit(filtered[activeIndex]);
        break;
      case "Escape":
        event.preventDefault();
        closeMenu();
        break;
      case "Tab":
        closeMenu();
        break;
      default:
        break;
    }
  };

  const activeOption = filtered[activeIndex];


  return (
    <div
      className={`ss ${className}`.trim()}
      ref={rootRef}
      data-open={open ? "true" : "false"}
      data-disabled={disabled ? "true" : "false"}
      data-invalid={error ? "true" : "false"}
    >
      {label ? (
        <span className="ss__label" id={labelId}>
          {icon ? (
            <span className="ss__icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          {label}
          {required ? (
            <span className="ss__required" aria-hidden="true">
              {" "}
              *
            </span>
          ) : null}
        </span>
      ) : null}

      <button
        type="button"
        className="ss__trigger"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-labelledby={label ? labelId : undefined}
        aria-activedescendant={open && activeOption ? optionId(activeIndex) : undefined}
        aria-invalid={error ? "true" : undefined}
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onTriggerKeyDown}
        name={name}
        data-value={selected ? selected.value : ""}
      >
        <span className={`ss__value ${selected ? "" : "ss__value--placeholder"}`.trim()}>
          {selected ? (
            <>
              <span className="ss__value-label">{selected.label}</span>
              {selected.hint ? <span className="ss__code">{selected.hint}</span> : null}
            </>
          ) : (
            placeholder
          )}
        </span>
        {clearable && selected && !disabled ? (
          <span
            className="ss__clear"
            role="button"
            tabIndex={-1}
            aria-label={clearLabel}
            title={clearLabel}
            onClick={(event) => {
              event.stopPropagation();
              onChange?.("", null);
            }}
          >
            ×
          </span>
        ) : null}
        <span className="ss__chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {error ? (
        <p className="ss__error" role="alert">
          {error}
        </p>
      ) : null}


      {open ? (
        <div className="ss__popup">
          {searchable ? (
            <div className="ss__search">
              <span className="ss__search-icon" aria-hidden="true">
                ⌕
              </span>
              <input
                ref={searchRef}
                type="text"
                className="ss__search-input"
                value={query}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-autocomplete="list"
                aria-controls={listId}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onSearchKeyDown}
              />
            </div>
          ) : null}

          <ul
            className="ss__list"
            id={listId}
            role="listbox"
            ref={listRef}
            aria-label={label || "Options"}
          >
            {loading ? (
              <li className="ss__state" role="presentation">
                {loadingLabel}
              </li>
            ) : filtered.length === 0 ? (
              <li className="ss__state" role="presentation">
                {query.trim() ? `No match for “${query.trim()}”` : emptyLabel}
              </li>
            ) : (
              filtered.map((opt, index) => (
                <li
                  key={`${opt.value}-${index}`}
                  id={optionId(index)}
                  role="option"
                  aria-selected={String(opt.value) === String(value)}
                  aria-disabled={opt.disabled ? "true" : undefined}
                  className={`ss__option ${index === activeIndex ? "ss__option--active" : ""} ${
                    String(opt.value) === String(value) ? "ss__option--selected" : ""
                  } ${opt.disabled ? "ss__option--disabled" : ""}`.trim()}
                  onMouseEnter={() => !opt.disabled && setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commit(opt)}
                  title={opt.disabled ? opt.disabledReason || "Not available" : undefined}
                >
                  <span className="ss__option-main">
                    <span className="ss__option-label">{opt.label}</span>
                    {opt.hint ? <span className="ss__code">{opt.hint}</span> : null}
                  </span>
                  {opt.description ? (
                    <span className="ss__option-desc">{opt.description}</span>
                  ) : null}
                </li>
              ))
            )}
          </ul>

          {filtered.length > 0 && selectable.length === 0 ? (
            <p className="ss__state ss__state--inline">No selectable option here.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
