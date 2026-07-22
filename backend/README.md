# Vastu Masterclass Backend

Node.js + Express + PostgreSQL (via Prisma). Handles lead capture, ₹99 Razorpay
payment, and WhatsApp confirmation via MSG91.

## Flow

1. `POST /api/leads` — frontend popup submits `{ name, mobile }` → creates a
   lead with `status: "pending"`, returns `{ leadId }`.
2. `POST /api/payment/create-order` — frontend sends `{ leadId }` → creates a
   Razorpay order, returns `{ orderId, amount, currency, keyId }` for the
   Razorpay Checkout widget.
3. User pays via Razorpay Checkout in the browser.
4. `POST /api/payment/verify` — frontend sends back the Razorpay response
   fields → signature is verified, lead is marked `paid`, WhatsApp
   confirmation is sent via MSG91.
5. `POST /api/payment/webhook` — Razorpay also calls this directly as a
   backup, in case step 4 never reaches the server (browser closed, network
   drop, etc).
6. `GET /api/leads` — admin-only (`Authorization: Bearer <ADMIN_TOKEN>`),
   lists all registrations, optional `?status=paid`.

## Accounts you need to set up yourself

- **Razorpay** — create an account, get `Key ID` / `Key Secret` from
  Settings > API Keys, and set up a webhook (Settings > Webhooks) pointing
  to `https://api.your-domain.com/api/payment/webhook` for the
  `payment.captured` event, with a webhook secret.
- **MSG91 WhatsApp** — create an approved WhatsApp message template in the
  MSG91 dashboard (business-initiated messages require a pre-approved
  template — free-form text won't work). Note the template name, namespace,
  and your integrated WhatsApp number. Edit `src/services/whatsapp.js` if
  your template has more/different variables than the single `body_1`
  placeholder assumed here.
- **Hetzner VPS** — any small instance (Ubuntu) with Docker installed.
- **Domain** — point an `api.` subdomain (e.g. `api.your-domain.com`) at the
  Hetzner server's IP address, and update `Caddyfile` and `.env`'s
  `FRONTEND_ORIGIN` accordingly.

## Local development

```bash
cp .env.example .env   # fill in real values
npm install
npx prisma generate
npx prisma migrate dev   # requires a local/dev Postgres
npm run dev
```

## Deploying on Hetzner

```bash
# on the server, after cloning this repo and cd-ing into backend/
cp .env.example .env    # fill in real production values
# edit Caddyfile: replace api.your-domain.com with your real subdomain
docker compose up -d --build
```

Caddy automatically issues and renews a Let's Encrypt TLS certificate for the
domain in `Caddyfile`, and proxies HTTPS traffic to the app container. The
app container runs `prisma migrate deploy` on every start, so schema changes
just need a new migration committed and a redeploy.

## Frontend integration

The frontend (`frontend/index.html`) currently redirects on submit instead of
calling this API — it needs to be updated to:

1. `POST /api/leads` on Submit, capture `leadId`.
2. Load the Razorpay Checkout script and open it using
   `POST /api/payment/create-order`'s response.
3. On Razorpay success, call `POST /api/payment/verify`.

This wiring hasn't been done yet — it's the next step once these backend
credentials exist.
