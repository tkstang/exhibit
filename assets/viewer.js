/* Browser UI only. Cryptographic functions are supplied unchanged by StatiCrypt. */
window.ExhibitViewer = function startExhibit(engine, codec) {
  'use strict';
  const payload = JSON.parse(document.getElementById('exhibit-payload').textContent);
  const gate = document.getElementById('gate');
  const form = document.getElementById('unlock-form');
  const passwordInput = document.getElementById('password');
  const status = document.getElementById('status');
  const button = document.getElementById('unlock');
  const toolbar = document.getElementById('toolbar');
  const frame = document.getElementById('viewer');

  function handleFragments() {
    const onFragmentClick = (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!link || link.hasAttribute('download')) return;
      const target = link.getAttribute('target');
      if (target && target.toLowerCase() !== '_self') return;
      // Match URL parsing: trim C0 controls/spaces, then remove ASCII tabs/newlines.
      const href = link
        .getAttribute('href')
        // eslint-disable-next-line no-control-regex -- URL preprocessing requires C0 controls.
        .replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '')
        .replace(/[\t\n\r]/g, '');
      if (!href.startsWith('#')) return;

      // srcdoc inherits the outer URL: even a missing fragment must not navigate.
      event.preventDefault();
      let id = href.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        // A literal percent sign can also be part of a document ID.
      }
      const destination =
        document.getElementById(id) ||
        Array.from(document.getElementsByName(id)).find((element) => element.tagName === 'A');
      if (destination) {
        destination.scrollIntoView();
        destination.focus({ preventScroll: true });
      } else if (!id || id.toLowerCase() === 'top') {
        window.scrollTo({ top: 0 });
      }
    };
    // Let authored DOM-ready handlers install first, and document clicks bubble first.
    const install = () => setTimeout(() => window.addEventListener('click', onFragmentClick), 0);
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
    frame.srcdoc = html + '<script>(' + handleFragments.toString() + ')();<' + '/script>';
    frame.hidden = false;
    toolbar.hidden = false;
    gate.hidden = true;
    passwordInput.value = '';
    status.textContent = '';
    frame.focus();
  }

  document.getElementById('lock').addEventListener('click', () => window.location.reload());
  if (payload.mode === 'public') {
    const bytes = Uint8Array.from(atob(payload.body), (char) => char.charCodeAt(0));
    show(new TextDecoder().decode(bytes));
    document.getElementById('lock').hidden = true;
    document.getElementById('mode-label').textContent = 'Public artifact';
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
