# Outgoing webhooks

Set up in **Settings → Integrations → Outgoing webhooks** (owners and admins). Requires `GOOGLE_TOKEN_ENCRYPTION_KEY` (the signing secret is encrypted at rest) and migration `0043`.

## Events
| Type | Sent when |
|---|---|
| `customer.created` | A customer is added manually or through the integration API (not CSV imports or booking-system syncs, which would flood the endpoint) |
| `feedback.received` | A customer submits private feedback |
| `feedback.resolved` | A teammate marks private feedback resolved in the Feedback inbox (one event per message, including bulk resolves). `data`: `feedback_id`, `customer_id` |
| `visit.logged` | A visit is logged on a customer's page. `data`: `customer_id`, `visit_id`, `service_id`, `price`, `visited_at` |
| `webhook.test` | You press "Send test event" |

## Request
`POST` with `Content-Type: application/json`:

```json
{ "id": "6f1c…", "type": "customer.created", "created_at": "2026-11-02T10:00:00.000Z", "data": { "customer_id": "…", "name": "Ann", "email": "ann@example.com", "source": "manual" } }
```

Headers: `Pentriq-Event`, `Pentriq-Delivery` (unique id, use it to de-duplicate; it stays the same across retries), `Pentriq-Attempt` (1, 2 or 3), `Pentriq-Signature: t=<unix seconds>,v1=<hex>`.

## Verifying the signature
`v1 = HMAC_SHA256(secret, "<t>.<raw request body>")` as hex. Reject if `t` is more than 5 minutes old.

```js
const crypto = require('crypto');
function verify(secret, header, rawBody) {
  const p = Object.fromEntries(header.split(',').map((x) => x.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(p.t)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${p.t}.${rawBody}`).digest('hex');
  return p.v1.length === expected.length && crypto.timingSafeEqual(Buffer.from(p.v1), Buffer.from(expected));
}
```

## Behaviour and limits
- HTTPS only; localhost, private, link-local and cloud-metadata addresses are refused (checked on the URL and on what the hostname resolves to). Redirects are not followed.
- 3 second timeout per attempt. Transient failures (timeout, connection error, HTTP 429 or 5xx) are retried with backoff (0.4 s, then 1.5 s): events triggered by a user action get one retry, at most two extra attempts in total. Redirects and other 4xx responses are final. One delivery row is logged per event, whatever the number of attempts, and a retried failure counts once towards the switch-off limit.
- After 10 consecutive failures the endpoint is switched off and the Integrations page says why; saving it again switches it back on.
- One endpoint per business. The last 15 deliveries are shown on the Integrations page.
- Known gap: the hostname is checked before sending and again resolved by the HTTP client, so a hostile DNS server could still change its answer in between. Running delivery through an egress proxy closes that fully.
