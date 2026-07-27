import React from "react";
import { cx } from "../utils/cx";
import AppBar from "./AppBar";
import BottomNav from "./BottomNav";
import { Page } from "./Layout";

export function TopAppBar(props) {
  return <AppBar {...props} />;
}

export function BottomNavigation(props) {
  return <BottomNav {...props} />;
}

export function ScreenContainer({
  className,
  children,
  withSafeArea = true,
  ...rest
}) {
  return (
    <div
      className={cx(
        "yds-screen",
        withSafeArea && "yds-safe-top",
        withSafeArea && "yds-safe-bottom",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function ScrollablePage({ className, children, ...rest }) {
  return (
    <Page className={cx("yds-scrollable-page", className)} {...rest}>
      {children}
    </Page>
  );
}

export function StickyFooter({ className, children, ...rest }) {
  return (
    <footer className={cx("yds-sticky-footer", className)} {...rest}>
      {children}
    </footer>
  );
}

export function FloatingActionArea({ className, children, ...rest }) {
  return (
    <div className={cx("yds-fab-area", className)} {...rest}>
      {children}
    </div>
  );
}

export { AppBar, BottomNav, Page };

export default {
  TopAppBar,
  BottomNavigation,
  ScreenContainer,
  ScrollablePage,
  StickyFooter,
  FloatingActionArea,
};
