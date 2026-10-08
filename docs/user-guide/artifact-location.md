---
title: 'Artifact location contract'
description: 'Let standalone HTML read and update the viewer link query and hash.'
---

# Artifact location contract

Exhibit renders standalone HTML inside a sandboxed `srcdoc` iframe with an opaque
origin. Inside that frame, `location` is `about:srcdoc`. The artifact therefore
cannot see the query (`?theme=light`) or hash (`#9`) of the link the reader opened,
and its own `history.replaceState` calls do not change the address bar.

The viewer bridges this with a small, versioned contract. It is optional: an
artifact that ignores it behaves exactly as before. It works without any script
injected by Exhibit, so it also works for artifacts that ship a strict meta CSP
admitting only their own hashed script.

## Version 1 shape

Every location value is a string. `search` is `''` or starts with `?`; `hash` is
`''` or starts with `#`. Each value is at most 2048 characters and contains no
control characters.

### Read the link at load

Before the artifact loads, the viewer names its frame:

```js
'exhibit-location:' + JSON.stringify({ v: 1, search: location.search, hash: location.hash });
```

Read your own `window.name`. This needs no parent access, so it works in the
opaque-origin sandbox:

```js
const prefix = 'exhibit-location:';
let outer = { search: '', hash: '' };
if (window.name.startsWith(prefix)) {
  try {
    const data = JSON.parse(window.name.slice(prefix.length));
    if (data && data.v === 1) outer = data;
  } catch {
    // Not opened through an Exhibit viewer; keep the defaults.
  }
}
```

The viewer replaces a value longer than 2048 characters with `''`.

### Update the address bar

Post a location update to the viewer:

```js
parent.postMessage({ type: 'exhibit-location', v: 1, search: '?theme=dark', hash: '#4' }, '*');
```

`search` and `hash` are each optional; an omitted field keeps its current value.
The viewer accepts the message only from its artifact frame, only as a plain object
with `type: 'exhibit-location'` and `v: 1`, and only when every supplied value has
the shape above. Anything else is ignored silently.

An accepted update replaces the current history entry. Only the query and hash
change: the origin and path never change, and the page is never navigated or
reloaded. The update adds no history entry and does not emit `hashchange`. A literal
`#` inside `search` is percent-encoded as part of the query.

### Follow later hash edits

When the reader edits the outer hash, including Back/Forward between hash entries,
the viewer posts the new location to the frame:

```js
{ type: 'exhibit-location', v: 1, search: location.search, hash: location.hash }
```

Accept it only from the viewer and with the same shape checks:

```js
window.addEventListener('message', (event) => {
  const data = event.data;
  if (event.source !== parent || !data || data.type !== 'exhibit-location' || data.v !== 1) return;
  // Validate data.search and data.hash, then apply them.
});
```

The viewer posts with target origin `'*'` because the frame origin is opaque. The
message carries only the URL the reader already has.

## Limits

- Storage inside the sandbox is unavailable: `localStorage` throws. A reader's
  choice, such as a theme toggle, does not persist across reloads on Exhibit.
  Reflect it in the query or hash if the link should carry it; the `?theme=` link
  and the toggle still work.
- Protected artifacts load after unlock. The frame name reflects the address at
  unlock time; the password gate itself does not take part in the contract.
- The [fragment-link helper](security-model.md#browser-isolation-and-network-policy)
  still scrolls within the document without changing the outer hash. Use this
  contract when the artifact should update the address bar.
- Updates are best effort. A browser may throttle very frequent history changes;
  the viewer then ignores the failed update.
- The artifact controls the query and hash of the reader's link. A reader who copies
  the link shares that state.
