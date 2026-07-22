// Neon's serverless driver carries each `sql\`...\`` call over its own HTTPS
// request -- there is no ambient connection to run raw BEGIN/COMMIT across
// separate calls. Multi-statement atomicity goes through sql.transaction([])
// instead, which sends a whole batch as one non-interactive transaction.
import { neon } from '@neondatabase/serverless';

// Vercel's Postgres/Neon storage integration injects a few differently-named
// env vars for compatibility with different tools -- accept whichever is
// actually present rather than assuming one exact name.
const CONNECTION_STRING = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED;
const sql = neon(CONNECTION_STRING);
const MAX_HISTORY_ENTRIES = 60;

export async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS npa_versions (
      id SERIAL PRIMARY KEY,
      data JSONB NOT NULL,
      as_on_date TEXT,
      row_count INTEGER,
      regions TEXT[],
      published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_by TEXT,
      is_rollback BOOLEAN NOT NULL DEFAULT false,
      is_current BOOLEAN NOT NULL DEFAULT false
    )
  `;
  // Temporary holding table for chunked uploads -- a genuine bank-wide
  // multi-region publish can exceed Vercel's per-request payload ceiling
  // (empirically ~4.5MB) even after gzip, so large payloads are split into
  // raw-byte chunks client-side and reassembled here before publishing.
  // Stored as base64 TEXT rather than BYTEA to avoid any ambiguity in how
  // Neon's HTTP-based driver round-trips binary column types.
  await sql`
    CREATE TABLE IF NOT EXISTS upload_chunks (
      upload_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      total_chunks INTEGER NOT NULL,
      data_b64 TEXT NOT NULL,
      uploaded_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (upload_id, chunk_index)
    )
  `;
}

export async function storeChunk(uploadId, chunkIndex, totalChunks, base64Data, uploadedBy) {
  await ensureSchema();
  await sql`
    INSERT INTO upload_chunks (upload_id, chunk_index, total_chunks, data_b64, uploaded_by)
    VALUES (${uploadId}, ${chunkIndex}, ${totalChunks}, ${base64Data}, ${uploadedBy})
    ON CONFLICT (upload_id, chunk_index) DO UPDATE SET data_b64 = EXCLUDED.data_b64
  `;
  // Best-effort cleanup of abandoned uploads (client failed partway, never
  // finalized) -- avoids needing a separate cron job for this small table.
  await sql`DELETE FROM upload_chunks WHERE created_at < now() - interval '2 hours'`;
}

// Returns the reassembled compressed buffer once every chunk for this
// upload has arrived, or null if incomplete/not found. `requestedBy` is a
// defense-in-depth check -- only the admin who uploaded the chunks can
// finalize them.
export async function assembleChunks(uploadId, requestedBy) {
  await ensureSchema();
  const rows = await sql`
    SELECT chunk_index, total_chunks, data_b64, uploaded_by FROM upload_chunks
    WHERE upload_id = ${uploadId} ORDER BY chunk_index ASC
  `;
  if (!rows.length) return null;
  const totalChunks = rows[0].total_chunks;
  if (rows.length !== totalChunks) return null;
  if (rows.some(r => r.uploaded_by !== requestedBy)) return null;
  const buffers = rows.map(r => Buffer.from(r.data_b64, 'base64'));
  return Buffer.concat(buffers);
}

export async function deleteChunks(uploadId) {
  await sql`DELETE FROM upload_chunks WHERE upload_id = ${uploadId}`;
}

export async function getCurrentVersion() {
  await ensureSchema();
  const rows = await sql`
    SELECT data, as_on_date FROM npa_versions WHERE is_current = true LIMIT 1
  `;
  return rows[0] || null;
}

export async function getHistory() {
  await ensureSchema();
  const rows = await sql`
    SELECT id, as_on_date, row_count, regions, published_at, published_by, is_rollback, is_current
    FROM npa_versions
    ORDER BY published_at DESC
    LIMIT ${MAX_HISTORY_ENTRIES}
  `;
  return rows;
}

export async function getVersionData(id) {
  await ensureSchema();
  const rows = await sql`SELECT data, as_on_date FROM npa_versions WHERE id = ${id} LIMIT 1`;
  return rows[0] || null;
}

// Publishes a new version as the current live dataset (a rollback is just a
// normal publish whose content happens to be copied from an older version --
// never a destructive rewrite, so it shows up in history like any other
// publish). All three statements run as one atomic batch via
// sql.transaction() since the one-shot `sql` client can't share a session
// across separate calls.
export async function publishVersion({ data, asOnDate, rowCount, regions, publishedBy, isRollback }) {
  await ensureSchema();
  const results = await sql.transaction([
    sql`UPDATE npa_versions SET is_current = false WHERE is_current = true`,
    sql`
      INSERT INTO npa_versions (data, as_on_date, row_count, regions, published_by, is_rollback, is_current)
      VALUES (${JSON.stringify(data)}::jsonb, ${asOnDate}, ${rowCount}, ${regions}, ${publishedBy}, ${!!isRollback}, true)
      RETURNING id, published_at
    `,
    sql`
      DELETE FROM npa_versions
      WHERE id IN (
        SELECT id FROM npa_versions
        WHERE is_current = false
        ORDER BY published_at DESC
        OFFSET ${MAX_HISTORY_ENTRIES}
      )
    `,
  ]);
  return results[1][0];
}
