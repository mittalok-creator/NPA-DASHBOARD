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
