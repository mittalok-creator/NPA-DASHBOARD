/* GitHub OAuth Device Flow login, gating Admin-only features (Settings / Update Data / future Publish).
   No client secret is used or needed — Device Flow is a public-client flow by design. */
(function () {
  const GITHUB_CLIENT_ID = 'Ov23liwGRJMlo4VZSBzn';
  const GITHUB_SCOPES = 'repo';
  const ADMIN_GITHUB_LOGIN = 'mittalok-creator';
  const STORAGE_KEY = 'upgb-gh-auth';

  let pollTimer = null;

  function getStoredAuth() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  }
  function setStoredAuth(auth) {
    if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    else localStorage.removeItem(STORAGE_KEY);
  }
  function getCurrentUser() {
    const auth = getStoredAuth();
    return auth ? { login: auth.login, avatarUrl: auth.avatarUrl } : null;
  }
  function isAdmin() {
    const auth = getStoredAuth();
    return !!(auth && auth.login && auth.login.toLowerCase() === ADMIN_GITHUB_LOGIN.toLowerCase());
  }

  async function startDeviceFlow() {
    const res = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: GITHUB_CLIENT_ID, scope: GITHUB_SCOPES })
    });
    if (!res.ok) throw new Error('start_failed_' + res.status);
    return res.json();
  }

  function pollForToken(deviceCode, initialInterval, expiresAt) {
    return new Promise((resolve, reject) => {
      let interval = initialInterval;
      async function tick() {
        if (Date.now() > expiresAt) { reject(new Error('expired')); return; }
        try {
          const res = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: GITHUB_CLIENT_ID,
              device_code: deviceCode,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            })
          });
          const data = await res.json();
          if (data.access_token) { resolve(data.access_token); return; }
          if (data.error === 'authorization_pending') { pollTimer = setTimeout(tick, interval * 1000); return; }
          if (data.error === 'slow_down') { interval = data.interval || interval + 5; pollTimer = setTimeout(tick, interval * 1000); return; }
          if (data.error === 'expired_token') { reject(new Error('expired')); return; }
          if (data.error === 'access_denied') { reject(new Error('denied')); return; }
          reject(new Error(data.error || 'unknown_error'));
        } catch (err) { reject(err); }
      }
      tick();
    });
  }

  async function fetchGithubUser(token) {
    const res = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' }
    });
    if (!res.ok) throw new Error('profile_failed_' + res.status);
    return res.json();
  }

  function cancelSignIn() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  }
  function signOut() {
    cancelSignIn();
    setStoredAuth(null);
    renderAuthUI();
  }

  function openAuthModal() { document.getElementById('githubAuthModalOverlay')?.classList.add('show'); }
  function closeAuthModal() { document.getElementById('githubAuthModalOverlay')?.classList.remove('show'); cancelSignIn(); }

  function renderAuthUI() {
    const user = getCurrentUser();
    const signinBtn = document.getElementById('githubSignInBtn');
    const userInfo = document.getElementById('authUserInfo');
    if (!signinBtn || !userInfo) return;
    if (user) {
      signinBtn.style.display = 'none';
      userInfo.style.display = 'flex';
      const avatar = document.getElementById('authAvatar');
      if (avatar) avatar.src = user.avatarUrl || '';
      const nameEl = document.getElementById('authUsername');
      if (nameEl) nameEl.textContent = user.login + (isAdmin() ? ' · Admin' : ' · not admin');
    } else {
      signinBtn.style.display = 'flex';
      userInfo.style.display = 'none';
    }
  }

  async function beginSignIn() {
    const statusEl = document.getElementById('deviceFlowStatus');
    const codeEl = document.getElementById('deviceCodeDisplay');
    const linkEl = document.getElementById('deviceVerificationLink');
    if (!statusEl || !codeEl || !linkEl) return;
    codeEl.textContent = '········';
    statusEl.textContent = 'Starting…';
    openAuthModal();
    try {
      const dc = await startDeviceFlow();
      codeEl.textContent = dc.user_code;
      linkEl.href = dc.verification_uri;
      linkEl.textContent = dc.verification_uri;
      statusEl.textContent = 'Waiting for you to approve on GitHub…';
      const expiresAt = Date.now() + dc.expires_in * 1000;
      const token = await pollForToken(dc.device_code, dc.interval || 5, expiresAt);
      const profile = await fetchGithubUser(token);
      setStoredAuth({ token: token, login: profile.login, avatarUrl: profile.avatar_url, at: Date.now() });
      closeAuthModal();
      renderAuthUI();
      if (!isAdmin()) {
        alert('Signed in as ' + profile.login + ', but this app\'s Admin features are restricted to a specific account. You are viewing as a regular user.');
      }
      return true;
    } catch (err) {
      statusEl.textContent =
        err.message === 'expired' ? 'Code expired — please try again.' :
        err.message === 'denied' ? 'Sign-in was declined.' :
        'Something went wrong (' + err.message + '). Please try again.';
      return false;
    }
  }

  function requireAdmin(onGranted) {
    if (isAdmin()) { onGranted(); return; }
    if (getCurrentUser()) {
      alert('You are signed in as ' + getCurrentUser().login + ', which is not the Administrator account for this app.');
      return;
    }
    beginSignIn().then((ok) => { if (ok && isAdmin()) onGranted(); });
  }

  window.UPGBAuth = { isAdmin, getCurrentUser, signOut, requireAdmin, beginSignIn };

  document.addEventListener('DOMContentLoaded', function () {
    renderAuthUI();
    document.getElementById('githubSignInBtn')?.addEventListener('click', beginSignIn);
    document.getElementById('authSignOutBtn')?.addEventListener('click', signOut);
    document.getElementById('cancelDeviceFlowBtn')?.addEventListener('click', closeAuthModal);
    document.getElementById('copyDeviceCodeBtn')?.addEventListener('click', function () {
      const code = document.getElementById('deviceCodeDisplay')?.textContent || '';
      if (navigator.clipboard) navigator.clipboard.writeText(code);
    });
  });
})();
