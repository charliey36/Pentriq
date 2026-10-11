import Stripe from 'stripe';
import { PLAN } from '@/lib/billing';

let client: Stripe | null = null;

/** Lazily-created server-side Stripe client. Never import from a Client Component. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set.');
  client ??= new Stripe(key);
  return client;
}

/**
 * Stripe price ids Pentriq recognises. `STRIPE_PRICE_IDS` is a comma-separated
 * list (first = the price used for new checkouts, the rest are accepted when
 * mapping webhooks, e.g. an old price you have since replaced).
 * `STRIPE_PRICE_ID` (singular) is still honoured for backwards compatibility.
 */
export function getPriceIds(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = [env.STRIPE_PRICE_IDS, env.STRIPE_PRICE_ID].filter(Boolean).join(',');
  return Array.from(new Set(raw.split(',').map((s) => s.trim()).filter(Boolean)));
}

export const checkoutPriceId = () => getPriceIds()[0] ?? null;

/** Pentriq has exactly one plan today, so every price maps to it. */
export function planNameForPrice(priceId: string | null | undefined): string | null {
  return priceId ? PLAN.name : null;
}
