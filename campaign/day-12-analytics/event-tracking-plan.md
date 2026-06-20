# Event Tracking Plan

## Recommended events to implement in `src/main.js`

| Event name | Trigger | Parameters | Why |
|------------|---------|------------|-----|
| `page_view` | Auto by gtag | — | baseline |
| `first_interaction` | First user click/touch | — | engagement |
| `body_focused` | User clicks a body in search or scene | `body_name` | most popular targets |
| `first_landing` | Camera lands on a solid body | `body_name` | core feature usage |
| `mode_switch` | User switches mode | `mode` (orbit/flight/walk) | feature adoption |
| `time_rate_changed` | User changes time rate | `rate` | power user signal |
| `camera_zoom_extreme` | Zoom < 1 km or > 1e9 km | `direction` (in/out) | wow moments |
| `search_used` | User opens search | `query` (optional) | discoverability |
| `language_switched` | Switch EN/ZH | `language` | i18n usage |
| `share_clicked` | Click share button (future) | `platform` | organic growth |
| `screenshot_taken` | PrtSc / UI screenshot button | — | UGC proxy |
| `error_encountered` | Catch unhandled errors | `message` | quality |

## Implementation example

```js
// src/main.js
function gtagEvent(name, params = {}) {
  if (typeof gtag !== 'undefined') {
    gtag('event', name, params);
  }
}

// On body focus
orbitCamera.addEventListener?.('focus', (e) => {
  gtagEvent('body_focused', { body_name: e.bodyName });
});

// On landing
if (distToSurface < landingThreshold && !hasLanded) {
  hasLanded = true;
  gtagEvent('first_landing', { body_name: currentBody.name });
}

// On mode switch
window.addEventListener('keydown', (e) => {
  if (e.key === 'f') gtagEvent('mode_switch', { mode: 'flight' });
  if (e.key === 'v') gtagEvent('mode_switch', { mode: 'inertial_toggle' });
});
```

## GA4 custom dimensions

Create in GA4 Admin → Custom definitions:

- `body_name` (event-scoped, text)
- `mode` (event-scoped, text)
- `rate` (event-scoped, number)
- `language` (user-scoped, text)

## Privacy

- Do not send precise geolocation.
- Do not send user IDs unless hashed and optional.
- Document tracking in a brief privacy note.
