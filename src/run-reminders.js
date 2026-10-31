// One-off reminder run: `npm run reminders` (useful for agents and manual checks).
import { createPool, migrate } from './db.js';
import { CompaniesHouse } from './companies-house.js';
import { runReminders } from './reminders.js';

const pool = createPool();
await migrate(pool);
const baseUrl = process.env.BASE_URL || `https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost'}`;
await runReminders({ pool, ch: new CompaniesHouse(), baseUrl });
await pool.end();
