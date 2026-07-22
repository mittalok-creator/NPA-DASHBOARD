// Server-side Admin verification: the browser sends the same GitHub OAuth
// token it already holds from Device Flow sign-in (js/auth.js). Rather than
// trusting a client-supplied "I am the admin" claim, this calls GitHub's own
// /user endpoint with that token and checks the *real* login server-side --
// a meaningful security improvement over the earlier git-commit approach,
// where "admin-ness" was enforced only by GitHub's own token permissions,
// never re-checked by any of our own code.
const ADMIN_GITHUB_LOGIN = 'mittalok-creator';

export async function verifyAdmin(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'missing_token' };
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return { ok: false, status: 401, error: 'missing_token' };

  let ghRes;
  try {
    ghRes = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' },
    });
  } catch (err) {
    return { ok: false, status: 502, error: 'github_unreachable' };
  }
  if (!ghRes.ok) return { ok: false, status: 401, error: 'invalid_token' };

  const profile = await ghRes.json();
  if (!profile || !profile.login || profile.login.toLowerCase() !== ADMIN_GITHUB_LOGIN.toLowerCase()) {
    return { ok: false, status: 403, error: 'not_admin' };
  }
  return { ok: true, login: profile.login };
}
