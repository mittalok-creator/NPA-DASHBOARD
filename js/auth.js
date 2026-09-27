/* Admin login, gating Admin-only features (Settings / Update Data / Publish).
   Backed by Alok's own Synology-NAS-hosted backend (see npa-nas-backend
   repo) instead of GitHub OAuth -- there is exactly one Admin account
   (Alok's own), so "signed in with a valid, unexpired session token" IS
   the authorization; no separate role/permission check is needed.

   Storage key deliberately renamed from the old upgb-gh-auth (GitHub OAuth
   era) to upgb-nas-auth, so a stale GitHub token left over from before
   this cutover is never misread as a valid session. */
(function () {
  const STORAGE_KEY = 'upgb-nas-auth';

  function apiBase() { return window.UPGB_NAS_API_BASE || ''; }

  function getStoredAuth() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  }
  function setStoredAuth(auth) {
    if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    else localStorage.removeItem(STORAGE_KEY);
  }
  function getCurrentUser() {
    const auth = getStoredAuth();
    return auth ? { login: auth.login } : null;
  }
  // Exactly one admin account exists server-side -- any stored, non-empty
  // token is treated as "is admin" client-side; the backend itself is the
  // real gate (every Admin-only API call re-verifies the token there).
  function isAdmin() {
    const auth = getStoredAuth();
    return !!(auth && auth.token);
  }
  function getToken() {
    const auth = getStoredAuth();
    return auth ? auth.token : null;
  }

  function openAuthModal() {
    document.getElementById('adminAuthModalOverlay')?.classList.add('show');
    const statusEl = document.getElementById('adminLoginStatus');
    if (statusEl) statusEl.textContent = '';
  }
  function closeAuthModal() {
    document.getElementById('adminAuthModalOverlay')?.classList.remove('show');
  }

  function renderAuthUI() {
    const user = getCurrentUser();
    const signinBtn = document.getElementById('adminSignInBtn');
    const userInfo = document.getElementById('authUserInfo');
    if (!signinBtn || !userInfo) return;
    if (user) {
      signinBtn.style.display = 'none';
      userInfo.style.display = 'flex';
      const nameEl = document.getElementById('authUsername');
      if (nameEl) nameEl.textContent = user.login + ' · Admin';
    } else {
      signinBtn.style.display = 'flex';
      userInfo.style.display = 'none';
    }
  }

  async function doLogin(username, password) {
    const statusEl = document.getElementById('adminLoginStatus');
    const submitBtn = document.getElementById('adminLoginSubmitBtn');
    if (statusEl) statusEl.textContent = 'Signing in…';
    if (submitBtn) submitBtn.disabled = true;
    try {
      const res = await fetch(apiBase() + '/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error === 'invalid_credentials' ? 'Incorrect username or password.'
          : res.status === 429 ? 'Too many attempts -- please wait a few minutes and try again.'
          : data.error === 'admin_not_configured' ? 'Admin account not set up yet on the backend.'
          : 'Sign-in failed (' + (data.error || res.status) + ').';
        if (statusEl) statusEl.textContent = msg;
        return false;
      }
      setStoredAuth({ token: data.token, login: data.login, at: Date.now() });
      closeAuthModal();
      renderAuthUI();
      return true;
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Could not reach the Admin backend. Check your connection and try again.';
      return false;
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function beginSignIn() {
    return new Promise((resolve) => {
      openAuthModal();
      const form = document.getElementById('adminLoginForm');
      const cancelBtn = document.getElementById('adminLoginCancelBtn');
      if (!form) { resolve(false); return; }
      const onSubmit = async (e) => {
        e.preventDefault();
        const u = document.getElementById('adminLoginUsername')?.value || '';
        const p = document.getElementById('adminLoginPassword')?.value || '';
        const ok = await doLogin(u, p);
        if (ok) { cleanup(); resolve(true); }
      };
      const onCancel = () => { cleanup(); closeAuthModal(); resolve(false); };
      function cleanup() {
        form.removeEventListener('submit', onSubmit);
        cancelBtn?.removeEventListener('click', onCancel);
      }
      form.addEventListener('submit', onSubmit);
      cancelBtn?.addEventListener('click', onCancel);
    });
  }

  async function signOut() {
    const token = getToken();
    setStoredAuth(null);
    renderAuthUI();
    if (token) {
      // Best-effort server-side revocation -- the local session is already
      // cleared either way, so a network hiccup here shouldn't block
      // signing out from the user's own point of view.
      try {
        await fetch(apiBase() + '/api/admin/logout', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
        });
      } catch (e) {}
    }
  }

  function requireAdmin(onGranted) {
    if (isAdmin()) { onGranted(); return; }
    beginSignIn().then((ok) => { if (ok && isAdmin()) onGranted(); });
  }

  window.UPGBAuth = { isAdmin, getCurrentUser, getToken, signOut, requireAdmin, beginSignIn };

  document.addEventListener('DOMContentLoaded', function () {
    renderAuthUI();
    document.getElementById('adminSignInBtn')?.addEventListener('click', beginSignIn);
    document.getElementById('authSignOutBtn')?.addEventListener('click', signOut);
  });
})();
