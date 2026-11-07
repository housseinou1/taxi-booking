/** Same-tab auth refresh (storage event only fires across tabs). */
export const WEBSITE_AUTH_CHANGED = "yala-website-auth-changed";

export function notifyWebsiteAuthChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WEBSITE_AUTH_CHANGED));
  }
}
