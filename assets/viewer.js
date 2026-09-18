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

  function show(html) {
    // Opaque-origin sandbox: document scripts cannot access this page, passwords,
    // sibling artifacts' localStorage, or any trusted application on the CDN host.
    frame.srcdoc = html;
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
