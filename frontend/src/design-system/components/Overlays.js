import React from "react";
import { cx } from "../utils/cx";
import Dialog from "./Dialog";
import BottomSheet from "./BottomSheet";
import Snackbar from "./Snackbar";
import Button from "./Button";

export function ConfirmationDialog({
  open,
  title = "Are you sure?",
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  danger = false,
  className,
}) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      className={className}
      actions={
        <>
          <Button variant="text" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

export function Modal(props) {
  return <Dialog {...props} />;
}

export function Toast({ open = true, message, children, ...rest }) {
  if (!open || (!message && !children)) return null;
  return <Snackbar {...rest}>{message || children}</Snackbar>;
}

export function ActionSheet({
  open,
  title,
  actions = [],
  onClose,
  className,
}) {
  return (
    <BottomSheet open={open} onClose={onClose} className={cx("yds-action-sheet", className)}>
      {title ? <h3 className="yds-type-subtitle">{title}</h3> : null}
      <div className="yds-action-sheet__list">
        {actions.map((action) => (
          <button
            key={action.key || action.label}
            type="button"
            className={cx("yds-action-sheet__item", action.danger && "is-danger")}
            onClick={() => {
              action.onClick?.();
              onClose?.();
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

export { Dialog, BottomSheet, Snackbar };

export default {
  ConfirmationDialog,
  Modal,
  Toast,
  ActionSheet,
  Dialog,
  BottomSheet,
  Snackbar,
};
