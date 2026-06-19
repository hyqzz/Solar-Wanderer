# Analytics Setup Guide

## Google Analytics 4

### 1. Create property

- Go to https://analytics.google.com/
- Create a new property: "Solar Wanderer"
- Data stream: Web → https://sw.icodestar.net
- Copy Measurement ID (e.g., `G-XXXXXXXXXX`)

### 2. Add gtag to `index.html` and `en/index.html`

Place in `<head>`, before any other scripts:

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX', {
    page_title: document.title,
    page_location: window.location.href
  });
</script>
```

### 3. Add custom events in `src/main.js`

Example helper:

```js
function trackEvent(name, params = {}) {
  if (typeof gtag !== 'undefined') {
    gtag('event', name, params);
  }
}
```

Usage:

```js
trackEvent('first_landing', { body: 'Moon' });
trackEvent('mode_switch', { mode: 'flight' });
```

---

## Cloudflare Web Analytics

### 1. Enable

- Go to Cloudflare dashboard → Analytics → Web Analytics
- Add site: https://sw.icodestar.net
- Copy beacon token

### 2. Add beacon script

```html
<script defer src='https://static.cloudflareinsights.com/beacon.min.js'
  data-cf-beacon='{"token": "YOUR_TOKEN"}'></script>
```

No event tracking, but gives core traffic data without cookies.

---

## Privacy note

- Add a brief note in README/privacy section about analytics.
- Do not track PII.
- If serving EU users, consider GDPR banner or use Plausible/Umami.

---

## Verification

1. Open site in browser.
2. Check GA4 Realtime report → should show 1 active user.
3. Check Cloudflare Analytics → should record page view.
4. Trigger a custom event and verify in GA4 DebugView.
