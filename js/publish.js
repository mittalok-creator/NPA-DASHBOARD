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

  // Vercel's request payload ceiling is empirically ~4.5MB, and a genuine
  // bank-wide multi-region upload can exceed that even after gzip. The
  // compressed payload is always split into raw-byte chunks safely under
  // that ceiling and uploaded sequentially, then reassembled server-side --
  // simpler to always chunk (even a 1-chunk "small" upload) than to branch
  // between two different upload paths.
  const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB, comfortably under the ~4.5MB ceiling

  function makeUploadId() {
    return 'up_' + Date.now() + '_' + Math.random().toString(36).slice(2);
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
    const bytes = new Uint8Array(compressed);
    const totalChunks = Math.max(1, Math.ceil(bytes.length / CHUNK_SIZE));
    const uploadId = makeUploadId();

    for (let i = 0; i < totalChunks; i++) {
      progress(`Uploading (${i + 1}/${totalChunks})…`);
      const chunk = bytes.subarray(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, bytes.length));
      const res = await fetch(RELAY_BASE_URL + '/api/publish-chunk', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/octet-stream',
          'X-Upload-Id': uploadId,
          'X-Chunk-Index': String(i),
          'X-Total-Chunks': String(totalChunks),
        },
        body: chunk,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg = [errBody.error, errBody.detail].filter(Boolean).join(': ');
        throw new Error(msg || `Chunk ${i + 1}/${totalChunks} upload failed: ${res.status}`);
      }
    }

    progress('Finalizing…');
    const finalRes = await fetch(RELAY_BASE_URL + '/api/publish-finalize', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId }),
    });
    const result = await finalRes.json().catch(() => ({}));
    if (!finalRes.ok) {
      const msg = [result.error, result.detail].filter(Boolean).join(': ');
      throw new Error(msg || ('Server returned ' + finalRes.status));
    }

    progress('Published.');
    return { versionId: result.id, publishedAt: result.publishedAt };
  }

  async function getHistoryIndex() {
    const res = await fetch(RELAY_BASE_URL + '/api/data-history');
    if (!res.ok) return [];
    return res.json();
  }

  async function rollbackToVersion(versionId, onProgress) {
    const progress = (msg) => { if (onProgress) onProgress(msg); };
    const token = getToken();
    if (!token) throw new Error('Not signed in as Admin -- sign in with GitHub first.');

    progress('Rolling back…');
    const res = await fetch(RELAY_BASE_URL + '/api/data-rollback', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = [result.error, result.detail].filter(Boolean).join(': ');
      throw new Error(msg || ('Server returned ' + res.status));
    }

    progress('Rolled back.');
    return { versionId: result.id, publishedAt: result.publishedAt };
  }

  window.UPGBPublish = { publishData, getHistoryIndex, rollbackToVersion };
})();
