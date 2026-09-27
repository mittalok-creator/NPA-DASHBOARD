/* Real one-click publish: sends the Admin's applied data to Alok's own
   Synology-NAS-hosted backend (npa-nas-backend), via the Admin's own NAS
   session token (see js/auth.js). Only the final /api/publish call
   actually changes what's live; the backend itself then dual-writes the
   same files to GitHub as a read-only fallback tier (see fetchDataFile()
   in js/app.js) -- Recovery Dashboard and any browser without a
   service-worker cache yet both still depend on that GitHub copy staying
   fresh, so it is not optional even though the NAS is now the real
   database. */
(function () {
  const AUTH_STORAGE_KEY = 'upgb-nas-auth';

  function apiBase() { return window.UPGB_NAS_API_BASE || ''; }

  function getToken() {
    try {
      const auth = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
      return auth && auth.token ? auth.token : null;
    } catch (e) { return null; }
  }

  async function nasApi(path, options) {
    options = options || {};
    const token = getToken();
    if (!token) throw new Error('Not signed in as Admin -- sign in first.');
    const headers = { Authorization: 'Bearer ' + token };
    if (options.body) headers['Content-Type'] = 'application/json';
    const res = await fetch(apiBase() + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error || ''; } catch (e) {}
      const err = new Error(`Backend ${res.status} on ${path}${detail ? ': ' + detail : ''}`);
      err.status = res.status;
      err.path = path;
      throw err;
    }
    return res.json();
  }

  /* ---------- Encrypted-data helpers (unchanged since 2026-09-17) ----------
     This entire block is untouched by the NAS migration on purpose:
     data/latest.json, data/pnpa*.json and data/kcc-overdue.json are still
     committed encrypted (AES-256-GCM, key derived via PBKDF2 from the
     splash screen's PIN) -- the backend never sees the PIN and stores/
     forwards these envelopes as opaque strings. Keeping this block
     byte-for-byte identical means every bit of this already-audited crypto
     code carries over with zero re-review needed. */
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
      return await nasApi('/api/history');
    } catch (e) {
      return [];
    }
  }

  async function getHistoryFileContent(fileName) {
    const envelope = await nasApi('/api/history/' + encodeURIComponent(fileName));
    return JSON.stringify(envelope);
  }

  /* meta: { asOnDate, rowCount, commitMessage, publishedBy, isRollback }
     extraFiles: optional [{path, content, label}] -- unchanged generic
     shape, still fully agnostic of how many/which extra datasets exist. */
  async function publishData(dataObj, meta, onProgress, extraFiles) {
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await publishDataOnce(dataObj, meta, onProgress, extraFiles);
      } catch (err) {
        // The 422 "not a fast forward" ref-race this retry used to guard
        // against genuinely can't happen anymore -- SQLite transactions on
        // the backend are atomic. Kept as a plain retry for an ordinary
        // transient network failure instead (a real, simpler class of
        // problem that can still happen against any HTTP backend).
        const isTransient = !err.status || err.status >= 500;
        if (!isTransient || attempt === MAX_ATTEMPTS) throw err;
        if (onProgress) onProgress(`Network hiccup -- retrying automatically (attempt ${attempt + 1} of ${MAX_ATTEMPTS})…`);
      }
    }
  }
  async function publishDataOnce(dataObj, meta, onProgress, extraFiles) {
    meta = meta || {};
    const progress = (msg) => { if (onProgress) onProgress(msg); };
    const pin = getStoredPin();
    if (!pin) throw new Error('Cannot publish: PIN session missing or expired. Reload the page, re-enter the PIN, then try again.');
    const dataJsonString = JSON.stringify(dataObj);

    progress('Encrypting data…');
    const dataEnvelope = await encryptToEnvelope(dataJsonString, pin);

    const files = [{ path: 'latest.json', content: JSON.stringify(dataEnvelope), label: null }];

    if (extraFiles && extraFiles.length) {
      progress('Encrypting additional data…');
      for (const f of extraFiles) {
        const plainString = typeof f.content === 'string' ? f.content : JSON.stringify(f.content);
        const envelope = await encryptToEnvelope(plainString, pin);
        files.push({ path: f.path.replace(/^data\//, ''), content: JSON.stringify(envelope), label: f.label });
      }
    }

    progress('Publishing…');
    const result = await nasApi('/api/publish', {
      method: 'POST',
      body: {
        files,
        meta: {
          asOnDate: meta.asOnDate, rowCount: meta.rowCount, npaLabel: meta.npaLabel,
          publishedBy: meta.publishedBy, isRollback: !!meta.isRollback,
          commitMessage: meta.commitMessage,
        },
      },
    });

    progress('Published.');
    return result;
  }

  async function rollbackToVersion(fileName, onProgress) {
    const progress = (msg) => { if (onProgress) onProgress(msg); };
    progress('Reading that version…');
    const content = await getHistoryFileContent(fileName);
    let parsed = JSON.parse(content);
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
