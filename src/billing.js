import Stripe from 'stripe';
import { track } from './db.js';

export const PRICE_GBP = Number(process.env.PRICE_GBP || 4);

export function createStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

/** Creates a pending subscriber and a Stripe Checkout session; returns the redirect URL. */
export async function startCheckout({ pool, stripe, baseUrl }, { email, company }) {
  const { rows } = await pool.query(
    `INSERT INTO subscribers(email, company_number) VALUES ($1, $2) RETURNING id`,
    [email, company.number],
  );
  const subscriberId = rows[0].id;
  await track(pool, 'checkout_started', company.number);

  if (!stripe) return { url: `${baseUrl}/thanks?pending=1`, subscriberId, configured: false };

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: email,
    client_reference_id: String(subscriberId),
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'gbp',
        unit_amount: Math.round(PRICE_GBP * 100),
        recurring: { interval: 'month' },
        product_data: { name: `Deadline Guard — ${company.name} (${company.number})` },
      },
    }],
    metadata: { subscriber_id: String(subscriberId), company_number: company.number },
    success_url: `${baseUrl}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/company/${company.number}?cancelled=1`,
  });
  await pool.query('UPDATE subscribers SET checkout_session = $1 WHERE id = $2', [session.id, subscriberId]);
  return { url: session.url, subscriberId, configured: true };
}

/** Handles a verified Stripe event. Idempotent. */
export async function handleStripeEvent(pool, event) {
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const id = Number(s.client_reference_id || s.metadata?.subscriber_id);
    if (!id) return;
    const { rowCount } = await pool.query(
      `UPDATE subscribers SET status = 'active', stripe_customer = $1, stripe_subscription = $2, activated_at = now()
       WHERE id = $3 AND status <> 'active'`,
      [s.customer, s.subscription, id],
    );
    if (rowCount) await track(pool, 'paid', String(id));
    return id;
  }
  if (event.type === 'invoice.payment_failed' && event.data.object.subscription) {
    const { rowCount } = await pool.query(
      `UPDATE subscribers SET status = 'past_due' WHERE stripe_subscription = $1 AND status = 'active'`, [event.data.object.subscription]);
    if (rowCount) await track(pool, 'payment_failed', event.data.object.subscription);
  }
  if (event.type === 'invoice.paid' && event.data.object.subscription) {
    const { rowCount } = await pool.query(
      `UPDATE subscribers SET status = 'active' WHERE stripe_subscription = $1 AND status = 'past_due'`, [event.data.object.subscription]);
    if (rowCount) await track(pool, 'payment_recovered', event.data.object.subscription);
  }
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const { rowCount } = await pool.query(
      `UPDATE subscribers SET status = 'cancelled', cancelled_at = now()
       WHERE stripe_subscription = $1 AND status IN ('active','past_due')`,
      [sub.id],
    );
    if (rowCount) await track(pool, 'cancelled', sub.id);
  }
}

export const WEBHOOK_EVENTS = ['checkout.session.completed', 'invoice.paid', 'invoice.payment_failed', 'customer.subscription.deleted'];
