import cron from 'node-cron';
import { createPool, migrate } from './db.js';
import { CompaniesHouse } from './companies-house.js';
import { createStripe } from './billing.js';
import { createApp } from './app.js';
import { runReminders } from './reminders.js';

const port = Number(process.env.PORT || 3000);
const baseUrl = (process.env.BASE_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${port}`)).replace(/\/$/, '');

const pool = createPool();
await migrate(pool);
const ch = new CompaniesHouse();
const stripe = createStripe();

createApp({ pool, ch, stripe, baseUrl }).listen(port, () => {
  console.log(`deadline-guard listening on ${port} base=${baseUrl} ch_mock=${ch.mock} stripe=${Boolean(stripe)}`);
});

// Daily reminder run at 07:00 UK time.
cron.schedule(process.env.REMINDER_CRON || '0 7 * * *', () => {
  runReminders({ pool, ch, baseUrl }).catch((err) => console.error('reminder run failed', err));
}, { timezone: 'Europe/London' });
