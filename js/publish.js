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
      const err = new Error(`GitHub API ${res.status} on ${path}${detail ? ': ' + detail : ''}`);
      err.status = res.status;
      err.path = path;
      throw err;
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

  /* ---------- Encrypted-data helpers (2026-09-17) ----------
     Mirror of the equivalent block in js/app.js (which only needs
     decrypt) -- keep both in sync. data/latest.json, data/pnpa.json and
     data/kcc-overdue.json are now committed encrypted (AES-256-GCM, key
     derived via PBKDF2 from the splash screen's PIN) instead of plain
     JSON -- see js/app.js's own copy of this comment for the full "why".
     Distinct on purpose from utf8ToBase64/base64ToUtf8 above (those
     convert UTF-8 *text* <-> base64 for git blob bodies; these convert
     raw *binary* bytes <-> base64 for salt/iv/ciphertext) -- don't merge. */
  const PIN_STORAGE_KEY = 'upgb-splash-pin';
  const DEFAULT_PBKDF2_ITER = 200000;
  function getStoredPin() {
    try { return sessionStorage.getItem(PIN_STORAGE_KEY) || null; } catch (e) { return null; }
  }
  function bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }
  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  async function deriveAesKey(pin, saltBytes, iterations, usage) {
    const pinBytes = new TextEncoder().encode(pin);
    const baseKey = await crypto.subtle.importKey('raw', pinBytes, { name: 'PBKDF2' }, false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      [usage]
    );
  }
  function isEncryptedEnvelope(obj) {
    return !!(obj && typeof obj === 'object' && obj.enc === 1
      && typeof obj.data === 'string' && typeof obj.iv === 'string' && typeof obj.salt === 'string');
  }
  /* Encrypted bytes are high-entropy and don't gzip -- the first shipped
     version of this (2026-09-17) skipped compression and it cost dearly:
     data/latest.json's transfer size over the wire went from ~1.0MB (the
     plain JSON gzips to about a quarter of its size) to ~4.15MB (the
     encrypted+base64 blob barely compresses at all), a 4x regression that
     undid the same day's separate "slow/blank to open" fix. Fixed by
     compressing the plaintext BEFORE encrypting (deflate-raw via
     CompressionStream) -- the envelope's `comp` field records whether
     this happened, so a missing CompressionStream (old/locked-down
     browser) falls back to uncompressed rather than failing to publish
     at all, and decrypt always knows whether to decompress. */
  const hasCompressionStream = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
  async function pumpStream(stream, bytes) {
    const writer = stream.writable.getWriter();
    writer.write(bytes); writer.close();
    const chunks = [];
    const reader = stream.readable.getReader();
    while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0; for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }
  function compressBytes(bytes) { return pumpStream(new CompressionStream('deflate-raw'), bytes); }
  function decompressBytes(bytes) { return pumpStream(new DecompressionStream('deflate-raw'), bytes); }
  async function decryptEnvelope(envelope) {
    const pin = getStoredPin();
    if (!pin) {
      const e = new Error('Could not unlock data -- PIN session missing.');
      e.isDecryptError = true;
      throw e;
    }
    try {
      const key = await deriveAesKey(pin, base64ToBytes(envelope.salt), envelope.iter || DEFAULT_PBKDF2_ITER, 'decrypt');
      const plainBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.data));
      let bytes = new Uint8Array(plainBuf);
      if (envelope.comp === 'deflate-raw') bytes = await decompressBytes(bytes);
      return JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch (err) {
      const e = new Error('Could not unlock data -- it may be corrupted or the PIN session is invalid.');
      e.isDecryptError = true;
      throw e;
    }
  }
  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  /* plainHash (SHA-256 of the ORIGINAL, pre-compression plaintext, stored
     unencrypted in the envelope -- not a secret, git already publicly
     exposes this same content's blob shas today) exists so publishData()'s
     npaChanged check can tell "content genuinely changed" apart from
     "ciphertext changed because every encryption uses a fresh random
     salt/iv" -- without it, every single publish would look like a real
     NPA-book change. */
  async function encryptToEnvelope(plainJsonString, pin) {
    if (!pin) throw new Error('Cannot encrypt: no PIN available.');
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const ivBytes = crypto.getRandomValues(new Uint8Array(12));
    const [key, plainHash] = await Promise.all([
      deriveAesKey(pin, saltBytes, DEFAULT_PBKDF2_ITER, 'encrypt'),
      sha256Hex(plainJsonString),
    ]);
    let bodyBytes = new TextEncoder().encode(plainJsonString);
    let comp = null;
    if (hasCompressionStream) { bodyBytes = await compressBytes(bodyBytes); comp = 'deflate-raw'; }
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBytes }, key, bodyBytes);
    return {
      enc: 1, kdf: 'PBKDF2-SHA256', iter: DEFAULT_PBKDF2_ITER, comp,
      salt: bytesToBase64(saltBytes), iv: bytesToBase64(ivBytes),
      plainHash, data: bytesToBase64(new Uint8Array(cipherBuf)),
    };
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
  /* Every publish used to unconditionally stamp a brand-new "version" --
     a new data/history/<date>-<ts>.json snapshot plus a fresh
     data/history/index.json entry, and always the generic commit message
     "Publish NPA data: X accounts, as on Y" -- even when the actual NPA
     book hadn't changed at all and the publish was really just a KCC
     Overdue/Daily PNPA/Bank Dashboard upload going live via extraFiles.
     Alok's own complaint, verified against the real repo history: every
     single publish that day logged as "NPA data" regardless of what was
     actually new. Fixed by comparing the freshly-uploaded data/latest.json
     blob's sha against what's already live (via the Contents API, which
     returns a file's current blob sha directly) -- when they match, the
     NPA snapshot step is skipped entirely (no orphan history entry, no
     misleading "NPA data" commit line), and only the caller-labelled
     pieces that genuinely changed (meta.npaLabel + each extraFile's own
     .label) go into the commit message. */
  // Alok hit this directly (2026-09-23): publishData() reads the live
  // branch's current commit sha up front (below), builds blobs/a tree/a
  // commit against it, then does a fast-forward-only ref update at the very
  // end -- if *anything* else lands on main in between (another Admin
  // publishing, or -- what actually happened here -- a code deploy being
  // merged at the same moment), that final PATCH is rejected with a 422
  // "Update is not a fast forward", even though nothing about his own data
  // was wrong. The error message already said "safe to retry" (nothing had
  // gone live yet at that point -- the commit object was created but never
  // reachable from any ref), and retrying by hand did work, but a non-
  // technical Admin shouldn't have to notice that distinction and retry a
  // multi-step publish himself. Automatically re-runs the whole sequence
  // (re-reading the now-current sha first) up to 3 attempts total, but only
  // for this one specific, safe-to-retry failure -- an auth error, a wrong
  // PIN, or a genuine network failure still surfaces immediately rather
  // than being silently retried into a confusing repeated failure.
  async function publishData(dataObj, meta, onProgress, extraFiles) {
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await publishDataOnce(dataObj, meta, onProgress, extraFiles);
      } catch (err) {
        const isRefRace = err.status === 422 && /\/git\/refs\/heads\//.test(err.path || '');
        if (!isRefRace || attempt === MAX_ATTEMPTS) throw err;
        if (onProgress) onProgress(`Live site changed at the same moment -- retrying automatically (attempt ${attempt + 1} of ${MAX_ATTEMPTS})…`);
      }
    }
  }
  async function publishDataOnce(dataObj, meta, onProgress, extraFiles) {
    meta = meta || {};
    const progress = (msg) => { if (onProgress) onProgress(msg); };
    const pin = getStoredPin();
    if (!pin) throw new Error('Cannot publish: PIN session missing or expired. Reload the page, re-enter the PIN, then try again.');
    const dataJsonString = JSON.stringify(dataObj);

    progress('Reading current live version…');
    const ref = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/${REPO_BRANCH}`);
    const baseCommitSha = ref.object.sha;
    const baseCommit = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/commits/${baseCommitSha}`);
    const baseTreeSha = baseCommit.tree.sha;

    progress('Encrypting data…');
    const dataEnvelope = await encryptToEnvelope(dataJsonString, pin);
    const dataEnvelopeString = JSON.stringify(dataEnvelope);

    progress('Uploading data…');
    const dataBlob = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, {
      method: 'POST',
      body: { content: utf8ToBase64(dataEnvelopeString), encoding: 'base64' },
    });

    // Ciphertext (and therefore the blob sha) differs on every single
    // publish -- a fresh random salt/iv every time, by design -- even when
    // dataObj itself is byte-identical to what's already live. Comparing
    // blob shas here would therefore always say "changed," spamming a new
    // history snapshot and the "NPA data" commit label on every publish.
    // Compare the plaintext fingerprint instead once the live file is
    // already the new encrypted format; only fall back to the old sha
    // comparison for a still-plaintext live file (pre-migration/local
    // testing).
    let npaChanged = true;
    try {
      const currentFile = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/data/latest.json?ref=${REPO_BRANCH}`);
      const currentParsed = JSON.parse(base64ToUtf8(currentFile.content));
      npaChanged = (isEncryptedEnvelope(currentParsed) && currentParsed.plainHash)
        ? currentParsed.plainHash !== dataEnvelope.plainHash
        : currentFile.sha !== dataBlob.sha;
    } catch (e) { npaChanged = true; } // couldn't tell -- default to treating it as a real change, never silently drop a version

    const treeEntries = [
      { path: 'data/latest.json', mode: '100644', type: 'blob', sha: dataBlob.sha },
    ];
    let historyFileName = null;
    let evicted = [];
    if (npaChanged) {
      progress('Reading version history…');
      let historyIndex = await getHistoryIndex();
      const safeDate = (meta.asOnDate || 'unknown').replace(/[^0-9-]/g, '');
      historyFileName = `history/${safeDate}-${Date.now()}.json`;
      historyIndex.unshift({
        date: meta.asOnDate || null,
        file: historyFileName,
        rowCount: meta.rowCount || null,
        publishedAt: new Date().toISOString(),
        publishedBy: meta.publishedBy || null,
        isRollback: !!meta.isRollback,
      });
      // Evicted entries must also be removed from the tree itself (sha:null
      // deletes a path in the Git Trees API), not just dropped from the
      // index list -- otherwise data/history/ grows unbounded forever.
      if (historyIndex.length > MAX_HISTORY_ENTRIES) {
        evicted = historyIndex.slice(MAX_HISTORY_ENTRIES);
        historyIndex = historyIndex.slice(0, MAX_HISTORY_ENTRIES);
      }
      const historyIndexBlob = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, {
        method: 'POST',
        body: { content: utf8ToBase64(JSON.stringify(historyIndex, null, 2)), encoding: 'base64' },
      });
      treeEntries.push({ path: `data/${historyFileName}`, mode: '100644', type: 'blob', sha: dataBlob.sha });
      treeEntries.push({ path: 'data/history/index.json', mode: '100644', type: 'blob', sha: historyIndexBlob.sha });
    }

    progress('Building commit…');
    if (extraFiles && extraFiles.length) {
      progress('Uploading additional data…');
      for (const f of extraFiles) {
        // Currently data/pnpa.json, data/pnpa-weekly.json,
        // data/pnpa-monthly.json, or data/kcc-overdue.json -- all carry
        // borrower-identifying data same as data/latest.json, so all get
        // the same encryption treatment, unconditionally.
        const plainString = typeof f.content === 'string' ? f.content : JSON.stringify(f.content);
        const envelope = await encryptToEnvelope(plainString, pin);
        const content = JSON.stringify(envelope);
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

    const parts = [];
    if (npaChanged) parts.push(meta.npaLabel || `NPA data (${(meta.rowCount || 0).toLocaleString('en-IN')} accounts)`);
    (extraFiles || []).forEach(f => { if (f.label) parts.push(f.label); });
    const commitMessage = meta.isRollback
      ? (meta.commitMessage || 'Rollback NPA data')
      : (parts.length ? `Publish: ${parts.join(' + ')}` : (meta.commitMessage || 'Publish data update'));

    const newCommit = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/commits`, {
      method: 'POST',
      body: {
        message: commitMessage,
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
    return { commitSha: newCommit.sha, historyFile: historyFileName, versionId: historyFileName, npaChanged, commitMessage };
  }

  async function rollbackToVersion(fileName, onProgress) {
    const progress = (msg) => { if (onProgress) onProgress(msg); };
    progress('Reading that version…');
    const content = await getHistoryFileContent(fileName);
    let parsed = JSON.parse(content);
    // Old history snapshots (pre-2026-09-17) are still plain JSON and are
    // not being rewritten -- every new one goes out encrypted, so this has
    // to handle both. Rolling back an old plaintext version naturally
    // upgrades it to encrypted on the way back out, since publishData()
    // above always encrypts on write.
    if (isEncryptedEnvelope(parsed)) {
      progress('Unlocking that version…');
      parsed = await decryptEnvelope(parsed);
    }
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
