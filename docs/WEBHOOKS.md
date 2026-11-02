# Outgoing webhooks

Set up in **Settings → Integrations → Outgoing webhooks** (owners and admins). Requires `GOOGLE_TOKEN_ENCRYPTION_KEY` (the signing secret is encrypted at rest) and migration `0043`.

## Events
| Type | Sent when |
|---|---|
| `customer.created` | A customer is added manually or through the integration API (not CSV imports or booking-system syncs, which would flood the endpoint) |
| `feedback.received` | A customer submits private feedback |
| `webhook.test` | You press "Send test event" |

## Request
`POST` with `Content-Type: application/json`:

```json
{ "id": "6f1c…", "type": "customer.created", "created_at": "2026-11-02T10:00:00.000Z", "data": { "customer_id": "…", "name": "Ann", "email": "ann@example.com", "source": "manual" } }
```

Headers: `Pentriq-Event`, `Pentriq-Delivery` (unique id, use it to de-duplicate), `Pentriq-Signature: t=<unix seconds>,v1=<hex>`.

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
- 3 second timeout, one attempt per event (no retries yet). Any non-2xx counts as a failure.
- After 10 consecutive failures the endpoint is switched off and the Integrations page says why; saving it again switches it back on.
- One endpoint per business. The last 15 deliveries are shown on the Integrations page.
- Known gap: the hostname is checked before sending and again resolved by the HTTP client, so a hostile DNS server could still change its answer in between. Running delivery through an egress proxy closes that fully.
