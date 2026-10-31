import { normaliseNumber } from './companies-house.js';
import { getCachedCompany, upsertCompany } from './db.js';

/** Cache-through lookup: Postgres first (24h), then Companies House. */
export async function loadCompany({ pool, ch }, input, { maxAgeHours = 24 } = {}) {
  const number = normaliseNumber(input);
  if (!number) return null;
  const cached = await getCachedCompany(pool, number, maxAgeHours);
  if (cached) return cached;
  const fresh = await ch.getCompany(number);
  if (fresh) await upsertCompany(pool, fresh);
  return fresh;
}
