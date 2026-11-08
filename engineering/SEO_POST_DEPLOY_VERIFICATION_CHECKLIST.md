# SEO post-deploy verification (after coordinated frontend release)

**GSC:** Property already verified via DNS TXT on DigitalOcean — do not add HTML verification tokens.

## Automated smoke (operator)

```bash
curl -sI https://www.yalataxi.live/sitemap.xml
# Expect: HTTP 200, Content-Type NOT text/html

curl -s https://www.yalataxi.live/sitemap.xml | head -1
# Expect: <?xml version="1.0"

curl -s https://www.yalataxi.live/robots.txt | grep -i Sitemap
# Expect: https://www.yalataxi.live/sitemap.xml
```

## Sitemap content

- [ ] Exactly **10** public URLs (home, about, safety, contact, website/rider|driver|delivery|support, privacy, terms)
- [ ] **No** `/login`, `/register`, `/admin`, `/rider`, `/driver`, `/delivery/*` app routes

## HTML shell (view source on `/`)

- [ ] Title references **YALA Technologies**
- [ ] `meta description` mentions Mauritania / Nouakchott where appropriate
- [ ] `link rel="canonical"` → `https://www.yalataxi.live/`
- [ ] Organization JSON-LD present in shell

## Live site (browser)

- [ ] `/` shows marketing **YALA Technologies** website (not login-only shell)
- [ ] Language switch EN / FR / AR updates `document.title` and `html lang`
- [ ] `/website/rider`, `/website/driver`, `/website/delivery` render with correct SEO titles

## Google Search Console (already verified)

- [ ] Submit sitemap: `https://www.yalataxi.live/sitemap.xml`
- [ ] URL inspection: request indexing for `/` and `/website/rider` if needed
- [ ] Review **Pages** for sitemap errors within 48h

## Regression

- [ ] `/login`, `/admin`, app dashboards unchanged functionally
- [ ] No Moosyl / payment / backend deploy as part of this frontend-only package
