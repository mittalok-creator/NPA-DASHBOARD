/* Real one-click publish: commits the Admin's applied data straight to the
   live repo using GitHub's Git Data API, via the Admin's own GitHub OAuth
   token (already granted "repo" scope at sign-in -- see js/auth.js). Only
   the final ref-update step actually changes what's live; every step
   before it can fail with zero visible impact on the deployed site, since
   blobs/trees/commits created but never attached to a ref are just
   orphaned objects GitHub garbage-collects. No separate backend/database
   is involved -- data/latest.json and data/history/ in this same repo are
   the only place NPA data lives. */
(function () {
  const REPO_OWNER = 'mittalok-creator';
  const REPO_NAME = 'NPA-DASHBOARD';
  const REPO_BRANCH = 'main';
  const API_BASE = 'https://api.github.com';
  const AUTH_STORAGE_KEY = 'upgb-gh-auth';
  const MAX_HISTORY_ENTRIES = 60;

  function getToken() {
    try {
      const auth = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
      return auth && auth.token ? auth.token : null;
    } catch (e) { return null; }
  }

  async function ghApi(path, options) {
    options = options || {};
    const token = getToken();
    if (!token) throw new Error('Not signed in as Admin -- sign in with GitHub first.');
    const headers = {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
    };
    if (options.body) headers['Content-Type'] = 'application/json';
    const res = await fetch(API_BASE + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = j.message || ''; } catch (e) {}
      throw new Error(`GitHub API ${res.status} on ${path}${detail ? ': ' + detail : ''}`);
    }
    return res.json();
  }

  // TextEncoder + chunked String.fromCharCode avoids both mangling non-ASCII
  // characters (plain btoa() only handles Latin1) and "Maximum call stack
  // size exceeded" on very large payloads.
  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }
  function base64ToUtf8(b64) {
    const binary = atob(b64.replace(/\n/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  async function getHistoryIndex() {
    try {
      const res = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/data/history/index.json?ref=${REPO_BRANCH}`);
      return JSON.parse(base64ToUtf8(res.content));
    } catch (e) {
      return [];
    }
  }

  async function getHistoryFileContent(fileName) {
    const res = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/data/${fileName}?ref=${REPO_BRANCH}`);
    return base64ToUtf8(res.content);
  }

  /* meta: { asOnDate, rowCount, commitMessage, publishedBy, isRollback }
     extraFiles: optional [{path, content}] -- additional files committed in
     the SAME commit as data/latest.json (content stringified if not already
     a string). Used for datasets that live in their own file separate from
     the main NPA book (e.g. data/bank-npa.json), so they can go live
     alongside a regular daily Publish without a second commit/step. */
  async function publishData(dataObj, meta, onProgress, extraFiles) {
    meta = meta || {};
    const progress = (msg) => { if (onProgress) onProgress(msg); };
    const dataJsonString = JSON.stringify(dataObj);

    progress('Reading current live version…');
    const ref = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/${REPO_BRANCH}`);
    const baseCommitSha = ref.object.sha;
    const baseCommit = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/commits/${baseCommitSha}`);
    const baseTreeSha = baseCommit.tree.sha;

    progress('Reading version history…');
    let historyIndex = await getHistoryIndex();

    progress('Uploading new data…');
    const dataBlob = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, {
      method: 'POST',
      body: { content: utf8ToBase64(dataJsonString), encoding: 'base64' },
    });

    const safeDate = (meta.asOnDate || 'unknown').replace(/[^0-9-]/g, '');
    const historyFileName = `history/${safeDate}-${Date.now()}.json`;
    historyIndex.unshift({
      date: meta.asOnDate || null,
      file: historyFileName,
      rowCount: meta.rowCount || null,
      publishedAt: new Date().toISOString(),
      publishedBy: meta.publishedBy || null,
      isRollback: !!meta.isRollback,
    });
    // Evicted entries must also be removed from the tree itself (sha:null
    // deletes a path in the Git Trees API), not just dropped from the index
    // list -- otherwise data/history/ grows unbounded forever across months
    // of daily publishes.
    let evicted = [];
    if (historyIndex.length > MAX_HISTORY_ENTRIES) {
      evicted = historyIndex.slice(MAX_HISTORY_ENTRIES);
      historyIndex = historyIndex.slice(0, MAX_HISTORY_ENTRIES);
    }
    const historyIndexBlob = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, {
      method: 'POST',
      body: { content: utf8ToBase64(JSON.stringify(historyIndex, null, 2)), encoding: 'base64' },
    });

    progress('Building commit…');
    const treeEntries = [
      { path: 'data/latest.json', mode: '100644', type: 'blob', sha: dataBlob.sha },
      { path: `data/${historyFileName}`, mode: '100644', type: 'blob', sha: dataBlob.sha },
      { path: 'data/history/index.json', mode: '100644', type: 'blob', sha: historyIndexBlob.sha },
    ];
    if (extraFiles && extraFiles.length) {
      progress('Uploading additional data…');
      for (const f of extraFiles) {
        const content = typeof f.content === 'string' ? f.content : JSON.stringify(f.content);
        const blob = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, {
          method: 'POST',
          body: { content: utf8ToBase64(content), encoding: 'base64' },
        });
        treeEntries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
      }
    }
    evicted.forEach(e => { if (e.file) treeEntries.push({ path: `data/${e.file}`, mode: '100644', type: 'blob', sha: null }); });
    const tree = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/trees`, {
      method: 'POST',
      body: { base_tree: baseTreeSha, tree: treeEntries },
    });

    const newCommit = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/commits`, {
      method: 'POST',
      body: {
        message: meta.commitMessage || 'Publish NPA data update',
        tree: tree.sha,
        parents: [baseCommitSha],
      },
    });

    progress('Going live…');
    await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${REPO_BRANCH}`, {
      method: 'PATCH',
      body: { sha: newCommit.sha, force: false },
    });

    progress('Published.');
    return { commitSha: newCommit.sha, historyFile: historyFileName, versionId: historyFileName };
  }

  async function rollbackToVersion(fileName, onProgress) {
    const progress = (msg) => { if (onProgress) onProgress(msg); };
    progress('Reading that version…');
    const content = await getHistoryFileContent(fileName);
    const parsed = JSON.parse(content);
    const rowCount = parsed.npa && parsed.npa.rows ? parsed.npa.rows.length : 0;
    return publishData(parsed, {
      asOnDate: parsed.asOnDate || null,
      rowCount,
      commitMessage: `Rollback NPA data to version ${fileName}`,
      isRollback: true,
    }, onProgress);
  }

  window.UPGBPublish = { publishData, getHistoryIndex, rollbackToVersion };
})();
