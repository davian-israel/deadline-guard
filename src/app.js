import express from 'express';
import { filingsFor } from './deadlines.js';
import { loadCompany } from './company-service.js';
import { normaliseNumber } from './companies-house.js';
import { startCheckout, handleStripeEvent, PRICE_GBP } from './billing.js';
import { metrics, track } from './db.js';
import { verifyToken } from './tokens.js';
import * as views from './views.js';
import { fileURLToPath } from 'node:url';

const FONT_DIR = fileURLToPath(new URL('../node_modules/@fontsource/', import.meta.url));
const FONTS = {
  'shoulders-800.woff2': 'big-shoulders-display/files/big-shoulders-display-latin-800-normal.woff2',
  'shoulders-700.woff2': 'big-shoulders-display/files/big-shoulders-display-latin-700-normal.woff2',
  'atkinson-400.woff2': 'atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2',
  'atkinson-700.woff2': 'atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function createApp({ pool, ch, stripe, baseUrl }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  const html = (res, body, status = 200) => res.status(status).type('html').send(body);
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // Stripe webhook needs the raw body — register before body parsers.
  app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), wrap(async (req, res) => {
    if (!stripe) return res.status(503).send('stripe not configured');
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return res.status(400).send(`signature error: ${err.message}`);
    }
    await handleStripeEvent(pool, event);
    res.json({ received: true });
  }));

  app.use(express.urlencoded({ extended: false, limit: '10kb' }));

  app.get('/healthz', wrap(async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, ch_mock: ch.mock, stripe: Boolean(stripe) });
  }));

  app.get('/', (_req, res) => html(res, views.homePage()));
  app.get('/pricing', (_req, res) => html(res, views.pricingPage()));
  app.get('/fonts/:file', (req, res) => {
    const rel = FONTS[req.params.file];
    if (!rel) return res.status(404).end();
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(FONT_DIR + rel);
  });

  app.get('/search', wrap(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) return res.redirect('/');
    const asNumber = normaliseNumber(q);
    if (asNumber && /\d{6,}/.test(q)) return res.redirect(`/company/${asNumber}`);
    await track(pool, 'search', q.slice(0, 80));
    html(res, views.searchPage(q, await ch.search(q)));
  }));

  app.get('/company/:number', wrap(async (req, res) => {
    const number = normaliseNumber(req.params.number);
    if (!number) return html(res, views.messagePage('Not a valid company number', '<p>Company numbers are 8 characters, e.g. 09446231 or SC123456.</p>'), 404);
    if (number !== req.params.number) return res.redirect(301, `/company/${number}`);
    const company = await loadCompany({ pool, ch }, number);
    if (!company) return html(res, views.messagePage('Company not found', '<p>We couldn\'t find that company on Companies House.</p>'), 404);
    await track(pool, 'lookup', number);
    const flash = req.query.cancelled ? 'Checkout cancelled — no charge was made.' : null;
    html(res, views.companyPage({ company, filings: filingsFor(company), baseUrl, flash, stripeReady: Boolean(stripe) }));
  }));

  app.post('/subscribe', wrap(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const company = await loadCompany({ pool, ch }, req.body.company);
    if (!company || !EMAIL_RE.test(email)) {
      return html(res, views.messagePage('Check your details', '<p>Please enter a valid email and company.</p>'), 400);
    }
    const { url } = await startCheckout({ pool, stripe, baseUrl }, { email, company });
    res.redirect(303, url);
  }));

  app.get('/thanks', (req, res) => html(res, req.query.pending
    ? views.messagePage('You are on the list', '<p>Payments open soon, so you have not been charged. We will email you the day reminders start.</p>')
    : views.messagePage('Reminders started', '<p>Your first email arrives at the next reminder date. Each email has a link to manage or cancel your reminders.</p>')));

  app.get('/manage/:token', wrap(async (req, res) => {
    const id = verifyToken(req.params.token);
    const { rows } = id ? await pool.query('SELECT s.*, c.name FROM subscribers s JOIN companies c ON c.number = s.company_number WHERE s.id = $1', [id]) : { rows: [] };
    const sub = rows[0];
    if (!sub) return html(res, views.messagePage('Link not valid', '<p>This link has expired or is wrong.</p>'), 404);
    const t = views.esc(req.params.token);
    const portal = stripe && sub.stripe_customer
      ? `<form method="post" action="/manage/${t}/billing" style="margin-bottom:12px"><button class="btn">Update card or see invoices</button></form>` : '';
    const warn = sub.status === 'past_due' ? '<p><b>Your last payment did not go through.</b> Update your card to keep your reminders.</p>' : '';
    const body = ['active', 'past_due'].includes(sub.status)
      ? `${warn}<p>Reminders for <b>${views.esc(sub.name)}</b> go to ${views.esc(sub.email)}.</p>${portal}
         <form method="post" action="/manage/${t}/cancel"><button class="btn">Cancel subscription</button></form>`
      : `<p>Reminders for <b>${views.esc(sub.name)}</b> are ${views.esc(sub.status)}.</p>`;
    html(res, views.messagePage('Manage reminders', body));
  }));

  app.post('/manage/:token/billing', wrap(async (req, res) => {
    const id = verifyToken(req.params.token);
    const { rows } = id ? await pool.query('SELECT stripe_customer FROM subscribers WHERE id = $1', [id]) : { rows: [] };
    if (!stripe || !rows[0]?.stripe_customer) return res.redirect(303, `/manage/${encodeURIComponent(req.params.token)}`);
    const portal = await stripe.billingPortal.sessions.create({ customer: rows[0].stripe_customer, return_url: `${baseUrl}/manage/${encodeURIComponent(req.params.token)}` });
    res.redirect(303, portal.url);
  }));

  app.post('/manage/:token/cancel', wrap(async (req, res) => {
    const id = verifyToken(req.params.token);
    const { rows } = id ? await pool.query('SELECT * FROM subscribers WHERE id = $1', [id]) : { rows: [] };
    const sub = rows[0];
    if (!sub) return res.status(404).send('not found');
    if (stripe && sub.stripe_subscription) await stripe.subscriptions.cancel(sub.stripe_subscription);
    const upd = await pool.query(`UPDATE subscribers SET status='cancelled', cancelled_at=now() WHERE id=$1 AND status<>'cancelled'`, [id]);
    if (upd.rowCount) await track(pool, 'cancelled', String(id));
    html(res, views.messagePage('Cancelled', '<p>Your reminders are cancelled and you won\'t be charged again.</p>'));
  }));

  app.get('/sitemap.xml', wrap(async (_req, res) => {
    const { rows } = await pool.query('SELECT number FROM companies ORDER BY fetched_at DESC LIMIT 45000');
    res.type('application/xml').send(views.sitemap(baseUrl, rows.map((r) => r.number)));
  }));

  app.get('/robots.txt', (_req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /manage/\nDisallow: /api/\nSitemap: ${baseUrl}/sitemap.xml\n`));

  app.get('/privacy', (_req, res) => html(res, views.messagePage('Privacy', '<p>We store your email address and the company you asked us to watch, only to send deadline reminders. Payments are handled by Stripe; we never see card details. Email us to delete your data.</p>')));
  app.get('/terms', (_req, res) => html(res, views.messagePage('Terms', '<p>Deadline Guard is a reminder service based on public Companies House data. We aim for accuracy but you remain responsible for filing on time. Cancel any time from any reminder email.</p>')));

  // Machine-readable metrics for the validation/ops agents.
  app.get('/api/metrics', wrap(async (req, res) => {
    const token = process.env.METRICS_TOKEN;
    if (!token || req.headers.authorization !== `Bearer ${token}`) return res.status(401).json({ error: 'unauthorized' });
    res.json(await metrics(pool, PRICE_GBP));
  }));

  app.use((_req, res) => html(res, views.messagePage('Page not found', '<p>That page doesn\'t exist.</p>'), 404));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    const status = err.status === 429 ? 503 : 500;
    html(res, views.messagePage('Something went wrong', '<p>Please try again in a minute.</p>'), status);
  });

  return app;
}
