# Yala Technologies Compliance Site

Static public pages for Google Play review and user support.

## Canonical URLs

These are the URLs the Play listings must reference. They are plain static HTML,
so they render with JavaScript enabled **and** disabled, and require no login.

- Website: `https://yalataxi.live`
- **Privacy Policy (canonical):** `https://yalataxi.live/privacy-policy`
- Account Deletion: `https://yalataxi.live/account-deletion`
- Support: `support@yalataxi.live`

The same policy is also served in-app at `/privacy` (React route backed by
`frontend/src/legal/PrivacyPolicy.js`). The static page above is the canonical
one because it does not depend on JavaScript.

## Deploy

Deploy this folder as a static site with Netlify or Vercel.

For Netlify:

1. Create a new site from this folder.
2. Set the publish directory to `store-listings/compliance-site` if deploying from the repository root.
3. Add the custom domain `yalataxi.live`.
4. Follow Netlify's DNS instructions in Namecheap.
5. Wait for HTTPS/SSL to become active.

For Vercel:

1. Import the repository.
2. Set the project root to `store-listings/compliance-site`.
3. Add the custom domain `yalataxi.live`.
4. Follow Vercel's DNS instructions in Namecheap.
5. Wait for HTTPS/SSL to become active.
