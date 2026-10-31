import pg from 'pg';

export function createPool(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is required');
  const ssl = /localhost|127\.0\.0\.1|\.railway\.internal/.test(url) ? false : { rejectUnauthorized: false };
  return new pg.Pool({ connectionString: url, ssl, max: 10 });
}

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS companies (
     number        TEXT PRIMARY KEY,
     name          TEXT NOT NULL,
     data          JSONB NOT NULL,
     accounts_due  DATE,
     cs_due        DATE,
     fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS subscribers (
     id                   SERIAL PRIMARY KEY,
     email                TEXT NOT NULL,
     company_number       TEXT NOT NULL REFERENCES companies(number),
     status               TEXT NOT NULL DEFAULT 'pending',  -- pending | active | cancelled
     stripe_customer      TEXT,
     stripe_subscription  TEXT UNIQUE,
     checkout_session     TEXT UNIQUE,
     created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
     activated_at         TIMESTAMPTZ,
     cancelled_at         TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS subscribers_status_idx ON subscribers(status)`,
  `CREATE TABLE IF NOT EXISTS reminders_sent (
     subscriber_id  INT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
     reminder_key   TEXT NOT NULL,
     sent_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (subscriber_id, reminder_key)
   )`,
  `CREATE TABLE IF NOT EXISTS events (
     id          BIGSERIAL PRIMARY KEY,
     type        TEXT NOT NULL,          -- lookup | search | checkout_started | paid | cancelled | reminder_sent
     ref         TEXT,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS events_type_time_idx ON events(type, created_at)`,
];

export async function migrate(pool) {
  for (const sql of MIGRATIONS) await pool.query(sql);
}

export async function track(pool, type, ref = null) {
  try {
    await pool.query('INSERT INTO events(type, ref) VALUES ($1, $2)', [type, ref]);
  } catch (err) {
    console.error('track failed', err.message);
  }
}

export async function upsertCompany(pool, c) {
  await pool.query(
    `INSERT INTO companies(number, name, data, accounts_due, cs_due, fetched_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (number) DO UPDATE SET
       name = EXCLUDED.name, data = EXCLUDED.data, accounts_due = EXCLUDED.accounts_due,
       cs_due = EXCLUDED.cs_due, fetched_at = now()`,
    [c.number, c.name, c, c.accountsDue, c.csDue],
  );
}

export async function getCachedCompany(pool, number, maxAgeHours = 24) {
  const { rows } = await pool.query(
    `SELECT data FROM companies WHERE number = $1 AND fetched_at > now() - ($2 || ' hours')::interval`,
    [number, String(maxAgeHours)],
  );
  return rows[0]?.data || null;
}

/** Standard metrics shape shared by every venture, read by the validation agent. */
export async function metrics(pool, priceGbp) {
  const q = (sql, p = []) => pool.query(sql, p).then((r) => Number(r.rows[0].n));
  const paid = await q(`SELECT count(*) n FROM subscribers WHERE status = 'active'`);
  const since = `created_at > now() - interval '7 days'`;
  return {
    venture: 'deadline-guard',
    paid_active: paid,
    mrr_gbp: Number((paid * priceGbp).toFixed(2)),
    new_paid_7d: await q(`SELECT count(*) n FROM events WHERE type = 'paid' AND ${since}`),
    cancelled_7d: await q(`SELECT count(*) n FROM events WHERE type = 'cancelled' AND ${since}`),
    checkouts_started_7d: await q(`SELECT count(*) n FROM events WHERE type = 'checkout_started' AND ${since}`),
    lookups_7d: await q(`SELECT count(*) n FROM events WHERE type = 'lookup' AND ${since}`),
    companies_cached: await q(`SELECT count(*) n FROM companies`),
    generated_at: new Date().toISOString(),
  };
}
