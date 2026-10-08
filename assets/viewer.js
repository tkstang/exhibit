/* Browser UI only. Cryptographic functions are supplied unchanged by StatiCrypt. */

/* Location contract v1 (docs/user-guide/artifact-location.md). Pure helpers, no DOM. */
window.ExhibitLocation = (() => {
  'use strict';
  const TYPE = 'exhibit-location';
  const NAME_PREFIX = 'exhibit-location:';
  const MAX_LENGTH = 2048;
  const capped = (value) => (value.length <= MAX_LENGTH ? value : '');
  const snapshot = (location) => ({
    v: 1,
    search: capped(location.search),
    hash: capped(location.hash),
  });
  // Structured clone yields realm-local plain objects; reject arrays and class instances.
  const isPlainObject = (value) => {
    if (value === null || typeof value !== 'object') return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || Object.getPrototypeOf(prototype) === null;
  };
  // An omitted field is valid and keeps the current value.
  const validField = (value, prefix) =>
    value === undefined ||
    (typeof value === 'string' &&
      value.length <= MAX_LENGTH &&
      (value === '' || value[0] === prefix) &&
      !/\p{Cc}/u.test(value));

  return {
    /** Value for frame.name, set before srcdoc so the artifact can read window.name. */
    windowName: (location) => NAME_PREFIX + JSON.stringify(snapshot(location)),
    /** Message posted to the artifact after the outer hash changes. */
    message: (location) => ({ type: TYPE, ...snapshot(location) }),
    /** Validated { search?, hash? } from the expected frame window, or null. */
    readUpdate(event, source) {
      if (!source || event.source !== source) return null;
      const data = event.data;
      if (!isPlainObject(data) || data.type !== TYPE || data.v !== 1) return null;
      const { search, hash } = data;
      if (!validField(search, '?') || !validField(hash, '#')) return null;
      const update = {};
      if (search !== undefined) update.search = search;
      if (hash !== undefined) update.hash = hash;
      return update;
    },
    /** Same origin and path; only the query and fragment can change. */
    nextUrl(href, update) {
      const url = new URL(href);
      if (update.search !== undefined) url.search = update.search;
      if (update.hash !== undefined) url.hash = update.hash;
      return url.href;
    },
  };
})();

window.ExhibitViewer = function startExhibit(engine, codec) {
  'use strict';
  const payload = JSON.parse(document.getElementById('exhibit-payload').textContent);
  const gate = document.getElementById('gate');
  const form = document.getElementById('unlock-form');
  const passwordInput = document.getElementById('password');
  const status = document.getElementById('status');
  const button = document.getElementById('unlock');
  const toolbar = document.getElementById('toolbar');
  let frame = document.getElementById('viewer');

  function handleFragments() {
    const fragmentLink = (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = event
        .composedPath()
        .find(
          (node) =>
            (node instanceof HTMLAnchorElement || node instanceof SVGAElement) &&
            (node.hasAttribute('href') ||
              node.hasAttributeNS('http://www.w3.org/1999/xlink', 'href')),
        );
      if (!link || link.hasAttribute('download')) return;
      const target = link.getAttribute('target');
      if (target && target.toLowerCase() !== '_self') return;
      // Match URL parsing: trim C0 controls/spaces, then remove ASCII tabs/newlines.
      const href = (
        link.getAttribute('href') ?? link.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
      )
        // eslint-disable-next-line no-control-regex -- URL preprocessing requires C0 controls.
        .replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '')
        .replace(/[\t\n\r]/g, '');
      if (!href.startsWith('#')) return;
      return { link, id: href.slice(1) };
    };

    const followFragment = (event, fragment) => {
      if (event.defaultPrevented) return;

      // srcdoc inherits the outer URL: even a missing fragment must not navigate.
      event.preventDefault();
      const { link, id } = fragment;
      const root = link.getRootNode();
      const findId = (value) => root.getElementById?.(value) || document.getElementById(value);
      let destination = findId(id);
      let decoded = id;
      try {
        decoded = decodeURIComponent(id);
      } catch {
        // A literal percent sign can also be part of a document ID.
      }
      destination ||=
        findId(decoded) ||
        Array.from(document.getElementsByName(decoded)).find((element) => element.tagName === 'A');
      if (destination) {
        destination.scrollIntoView();
        destination.focus({ preventScroll: true });
        if (
          destination.getRootNode().activeElement !== destination &&
          !destination.hasAttribute('tabindex')
        ) {
          destination.setAttribute('tabindex', '-1');
          destination.focus({ preventScroll: true });
          destination.addEventListener(
            'blur',
            () => {
              if (destination.getAttribute('tabindex') === '-1')
                destination.removeAttribute('tabindex');
            },
            { once: true },
          );
        }
      } else if (!decoded || decoded.toLowerCase() === 'top') {
        window.scrollTo({ top: 0 });
      }
    };

    const guardStoppedFragment = (event) => {
      if (!fragmentLink(event)) return;
      const path = event.composedPath();
      const guard = (current) => {
        if (current !== event || !event.cancelBubble) return;
        const fragment = fragmentLink(event);
        if (fragment) followFragment(event, fragment);
      };
      // Append after authored listeners on each node, preserving defaultPrevented
      // for delegation. Same-node listeners still run after stopPropagation().
      for (const node of path) {
        node.addEventListener('click', guard, true);
        node.addEventListener('click', guard);
      }
      guard(event);
      setTimeout(() => {
        for (const node of path) {
          node.removeEventListener('click', guard, true);
          node.removeEventListener('click', guard);
        }
      }, 0);
    };
    // Let authored DOM-ready handlers install first, and document clicks bubble first.
    const install = () =>
      setTimeout(() => {
        window.addEventListener('click', guardStoppedFragment, true);
        window.addEventListener('click', (event) => {
          const fragment = fragmentLink(event);
          if (fragment) followFragment(event, fragment);
        });
      }, 0);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
      install();
    }
  }

  function show(html) {
    // Opaque-origin sandbox: document scripts cannot access this page, passwords,
    // sibling artifacts' localStorage, or any trusted application on the CDN host.
    // Execute only inside the opaque frame; never parse artifact HTML in the parent.
    // A browsing context's name is fixed when it is created, so insert a fresh frame
    // (same sandbox and attributes) whose name carries the outer location before srcdoc.
    const fresh = frame.cloneNode(false);
    fresh.name = locationContract.windowName(window.location);
    fresh.srcdoc = html + '<script>(' + handleFragments.toString() + ')();<' + '/script>';
    fresh.hidden = false;
    frame.replaceWith(fresh);
    frame = fresh;
    toolbar.hidden = false;
    gate.hidden = true;
    passwordInput.value = '';
    status.textContent = '';
    frame.focus();
  }

  // Location messages carry only the URL the reader already has; postMessage is not
  // governed by CSP. The opaque frame origin is "null", so trust the source window only.
  const locationContract = window.ExhibitLocation;
  window.addEventListener('message', (event) => {
    const update = locationContract.readUpdate(event, frame.contentWindow);
    if (!update) return;
    try {
      // Never navigate or reload: replace the current entry's query and hash only.
      window.history.replaceState(
        window.history.state,
        '',
        locationContract.nextUrl(window.location.href, update),
      );
    } catch {
      // Browsers may throttle rapid history updates; the artifact keeps working.
    }
  });
  window.addEventListener('hashchange', () => {
    if (frame.hidden) return;
    frame.contentWindow?.postMessage(locationContract.message(window.location), '*');
  });

  document.getElementById('lock').addEventListener('click', () => window.location.reload());
  if (payload.mode === 'plaintext') {
    const bytes = Uint8Array.from(atob(payload.body), (char) => char.charCodeAt(0));
    show(new TextDecoder().decode(bytes));
    document.getElementById('lock').hidden = true;
    document.getElementById('mode-label').textContent = 'Unencrypted artifact';
    return;
  }
  if (!window.isSecureContext || !window.crypto || !window.crypto.subtle) {
    status.textContent = 'Browser decryption requires HTTPS or localhost.';
    button.disabled = true;
    return;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = 'Decrypting in your browser…';
    let password = passwordInput.value;
    passwordInput.value = '';
    try {
      const hash = await engine.hashPassword(password, payload.salt);
      password = '';
      const result = await codec.decode(payload.ciphertext, hash, payload.salt);
      if (!result.success) {
        status.textContent = 'Unable to unlock. Check the password and try again.';
        passwordInput.focus();
        return;
      }
      show(result.decoded);
    } catch {
      status.textContent = 'Unable to unlock this artifact.';
    } finally {
      password = '';
      button.disabled = false;
    }
  });
};
