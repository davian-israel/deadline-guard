# Agent runbook — Deadline Guard

Agents operating this business follow these rules. Humans review weekly.

## Ops agent (hourly)
1. `GET /healthz` must return `{"ok":true}`. If not: read Railway logs, fix, open a PR, redeploy.
2. Error rate check via Railway logs; any 5xx spike → investigate before anything else.
3. Never run destructive DB operations. Never change pricing, Stripe products or legal pages without human approval.

## Growth agent (daily)
- Seed `/company/:number` pages for newly incorporated companies (Companies House advanced search / bulk data), keep sitemap fresh.
- Write at most 2 helpful guides/week (e.g. "When are my first accounts due?"). No spam, no cold email, no fake reviews.

## Support agent (hourly)
- Answer inbox questions from the help docs. Refunds, legal questions, and anything about data deletion → escalate to Davian.

## Finance / validation agent (weekly, Mondays)
- Pull `/api/metrics` from all five ventures, report paid_active, MRR, conversion (paid / lookups), churn. Recommend which venture leads.

## Hard limits
No spending money, no new accounts, no messages to people who did not contact us first.

## Deploys
Pushes to `main` should deploy automatically. If no new Railway deployment appears within 5 minutes, reconnect the service source (Railway `connect-service-source`, same repo and branch) to trigger it, then confirm `/healthz`.
