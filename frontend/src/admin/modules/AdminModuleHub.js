import React from "react";

import { AlertBanner } from "../components/library";
import { getModuleHub } from "./moduleHubConfig";

/**
 * AdminModuleHub — professional landing page for a Yala Admin section.
 *
 * Gives every sidebar section a real, navigable, consistent home. It links to the existing
 * module pages (no duplication) and deliberately does not invent statistics.
 *
 * It intentionally does **not** list backend API endpoints. That information is developer-facing
 * and does not belong in the administrator's interface; it previously appeared here as a
 * "Backend endpoints for this section" panel.
 */
export default function AdminModuleHub({ hubKey }) {
  const hub = getModuleHub(hubKey);

  if (!hub) {
    return (
      <AlertBanner tone="warning" title="Section unavailable">
        This admin section is not configured yet.
      </AlertBanner>
    );
  }

  return (
    <div className="admin-hub">
      <header className="admin-hub__head">
        <h2 className="admin-hub__title">{hub.title}</h2>
        <p className="admin-hub__subtitle">{hub.subtitle}</p>
      </header>

      {hub.links?.length ? (
        <section aria-labelledby="admin-hub-links">
          <h3 className="admin-hub__section-title" id="admin-hub-links">
            Open a module
          </h3>
          <div className="admin-hub__grid">
            {hub.links.map((link) => (
              <a className="admin-hub__card" href={link.path} key={link.path + link.label}>
                <span className="admin-hub__card-label">{link.label}</span>
                {link.description ? (
                  <span className="admin-hub__card-description">{link.description}</span>
                ) : null}
              </a>
            ))}
          </div>
        </section>
      ) : (
        <AlertBanner tone="info" title="No modules configured">
          No admin modules are available for this section yet.
        </AlertBanner>
      )}
    </div>
  );
}

