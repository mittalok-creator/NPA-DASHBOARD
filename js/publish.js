/* Real one-click publish: sends the Admin's applied data to our own small
   backend (Vercel serverless functions + Postgres, see /relay), which
   verifies the Admin's GitHub token server-side before writing. This
   replaced an earlier design that committed data straight to the GitHub
   repo via the Git Data API -- that hit real per-file size ceilings once
   genuine bank-wide multi-region uploads were tried, and gets worse as
   more Excel-based modules are added. A real database has no such ceiling.

   The JSON payload is gzip-compressed in the browser before sending
   (Content-Encoding: gzip) -- Vercel's Serverless Functions enforce a
   request body size ceiling, and compression buys real headroom over it
   for realistic per-region upload sizes. */
(function () {
  const RELAY_BASE_URL = 'https://npa-dashboard.vercel.app';
  const AUTH_STORAGE_KEY = 'upgb-gh-auth';

  function getToken() {
    try {
      const auth = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
      return auth && auth.token ? auth.token : null;
    } catch (e) { return null; }
  }

  async function compressToGzip(text) {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(stream).arrayBuffer();
  }

  /* meta: { asOnDate, rowCount, regions, publishedBy(ignored, server derives it), isRollback } */
  async function publishData(dataObj, meta, onProgress) {
    meta = meta || {};
    const progress = (msg) => { if (onProgress) onProgress(msg); };
    const token = getToken();
    if (!token) throw new Error('Not signed in as Admin -- sign in with GitHub first.');

    progress('Compressing data…');
    const payloadText = JSON.stringify({ data: dataObj, meta });
    const compressed = await compressToGzip(payloadText);

    progress('Uploading to server…');
    const res = await fetch(RELAY_BASE_URL + '/api/publish', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
      },
      body: compressed,
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || ('Server returned ' + res.status));

    progress('Published.');
    return { versionId: result.id, publishedAt: result.publishedAt };
  }

  async function getHistoryIndex() {
    const res = await fetch(RELAY_BASE_URL + '/api/data/history');
    if (!res.ok) return [];
    return res.json();
  }

  async function rollbackToVersion(versionId, onProgress) {
    const progress = (msg) => { if (onProgress) onProgress(msg); };
    const token = getToken();
    if (!token) throw new Error('Not signed in as Admin -- sign in with GitHub first.');

    progress('Rolling back…');
    const res = await fetch(RELAY_BASE_URL + '/api/data/rollback', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || ('Server returned ' + res.status));

    progress('Rolled back.');
    return { versionId: result.id, publishedAt: result.publishedAt };
  }

  window.UPGBPublish = { publishData, getHistoryIndex, rollbackToVersion };
})();
