# Deadline Guard

Companies House filing-deadline reminders for UK company directors. £4/month.

- Look up any company → see accounts + confirmation statement due dates, days left, penalty if late.
- Every company has an indexable page (`/company/:number`) → programmatic SEO.
- Turn on reminders → Stripe Checkout subscription → daily 07:00 UK job emails at 60/30/14/7/1 days and when overdue.

## Run locally
```bash
npm install
cp .env.example .env   # blank keys = mock Companies House, no payments, emails logged
DATABASE_URL=postgres://... npm start
npm test
```

## Deploy (Railway)
Service from this repo + a Postgres database. Set the variables in `.env.example`
(`DATABASE_URL=${{Postgres.DATABASE_URL}}`). Stripe webhook → `POST /webhooks/stripe`,
events `checkout.session.completed` and `customer.subscription.deleted`.

## Validation metric
`GET /api/metrics` with `Authorization: Bearer $METRICS_TOKEN` → `paid_active`, `mrr_gbp`, 7-day funnel.
Same shape across all five ventures.
