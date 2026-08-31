import React from "react";

import { getAppDisplayName, getAppVersionLabel } from "../brand/appInfo";
import { getBrandLogoSrc } from "../brand/logo";

/**
 * About footer: logo, app name, version, copyright — shown on settings screens.
 */
export default function YalaAppFooter({ showLegalLinks = true }) {
  const versionLabel = getAppVersionLabel();

  return (
    <footer className="yala-app-footer">
      <img
        src={getBrandLogoSrc()}
        alt=""
        width={40}
        height={40}
        className="yala-app-footer__logo"
      />
      <strong className="yala-app-footer__name">{getAppDisplayName()}</strong>
      {versionLabel ? <span className="yala-app-footer__version">{versionLabel}</span> : null}
      {showLegalLinks ? (
        <nav className="yala-app-footer__links" aria-label="Legal">
          <a href="/privacy">Privacy</a>
          <span aria-hidden="true">·</span>
          <a href="/terms">Terms</a>
          <span aria-hidden="true">·</span>
          <a
            href="https://yalataxi.live/account-deletion"
            target="_blank"
            rel="noopener noreferrer"
          >
            Delete account
          </a>
        </nav>
      ) : null}
      <span className="yala-app-footer__copyright">© 2026 Yala Technologies</span>
    </footer>
  );
}
