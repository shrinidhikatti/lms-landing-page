# Vastu Masterclass Backend

Node.js + Express + PostgreSQL (via Prisma). Handles lead capture, ₹99 Razorpay
payment, WhatsApp confirmation via MSG91, and mirrors every funnel stage into
a Google Sheet for easy viewing (Postgres stays the source of truth).

## Flow

1. `POST /api/leads` — frontend popup submits `{ name, mobile }` → creates a
   lead with `status: "lead"`, returns `{ leadId }`. Also upserts a row in the
   **Funnel** sheet tab keyed by `leadId` (the "Session ID" column).
2. `POST /api/payment/create-order` — frontend sends `{ leadId }` → creates a
   Razorpay order, sets `status: "payment_initiated"`, updates the same
   Funnel row, returns `{ orderId, amount, currency, keyId }` for the
   Razorpay Checkout widget.
3. User pays via Razorpay Checkout in the browser.
4. `POST /api/payment/verify` — frontend sends back the Razorpay response
   fields → signature is verified, lead is marked `paid`, the Funnel row is
   updated to stage `paid`, a row is added/updated in the **Confirmed** sheet
   tab, and a WhatsApp confirmation is sent via MSG91.
5. `POST /api/payment/webhook` — Razorpay also calls this directly as a
   backup, in case step 4 never reaches the server (browser closed, network
   drop, etc). Runs the exact same "mark paid" logic.
6. `GET /api/leads` — admin-only (`Authorization: Bearer <ADMIN_TOKEN>`),
   lists all registrations from Postgres, optional `?status=paid`.

Sheets writes are fire-and-forget (not awaited before responding) — if
Google Sheets is briefly down, checkout and WhatsApp still work; only the
sheet mirror lags until the next successful write.

## Google Sheet layout

Create one spreadsheet with two tabs, headers in row 1:

- **Funnel**: `Session ID | Name | Mobile | Stage | Order ID | Payment ID | First Seen | Last Updated`
  — one row per visitor who submitted the popup, updated in place as they
  progress through `lead` → `payment_initiated` → `paid`.
- **Confirmed**: `Session ID | Name | Mobile | Order ID | Payment ID | Paid At`
  — only customers whose ₹99 payment actually succeeded.

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
- **Google Sheets via Apps Script** (for the Funnel/Confirmed mirror — no
  Google Cloud project or service account needed):
  1. Open the target spreadsheet, then Extensions > Apps Script.
  2. Paste in the contents of `backend/deploy/apps-script/Code.gs`, and
     replace `SHARED_SECRET`'s placeholder with a random string of your
     choice — this same string goes into `SHEETS_WEBHOOK_SECRET` below.
  3. Deploy > New deployment > type "Web app" > Execute as "Me" > Who has
     access "Anyone". Deploy, then copy the Web app URL (ends in `/exec`).
  4. Paste that URL into `SHEETS_WEBHOOK_URL`, and the secret from step 2
     into `SHEETS_WEBHOOK_SECRET`.
  5. If you later edit the script, redeploy via Deploy > Manage deployments
     > edit (pencil) > New version — editing the code alone doesn't update
     the live Web App.
  The script auto-creates headers on first write; the first sheet tab
  (leftmost) is treated as Funnel, the second tab as Confirmed.
- **Hetzner VPS** — any small instance (Ubuntu) with Docker installed.
- **Domain** — point an `api.` subdomain (e.g. `apivastu.your-domain.com`) at
  the Hetzner server's IP address, and update `.env`'s `FRONTEND_ORIGIN`
  accordingly.

## Local development

```bash
cp .env.example .env   # fill in real values
npm install
npx prisma generate
npx prisma migrate dev   # requires a local/dev Postgres
npm run dev
```

## Deploying on Hetzner

This assumes a shared box that already runs Nginx for other sites (as ours
does) — Docker only runs Postgres + the app, bound to `127.0.0.1:4001`, and
the existing system Nginx reverse-proxies to it. If you're deploying to a
dedicated, empty server instead, swap in Caddy or your own Nginx + certbot
setup for TLS.

```bash
# on the server
mkdir -p /var/www/vastu-backend && cd /var/www/vastu-backend
git clone https://github.com/shrinidhikatti/lms-landing-page.git .
cd backend
cp .env.example .env    # fill in real production values
docker compose up -d --build

# wire up Nginx (only needs doing once)
cp deploy/nginx-vastu-backend.conf /etc/nginx/sites-available/vastu-backend
ln -s /etc/nginx/sites-available/vastu-backend /etc/nginx/sites-enabled/vastu-backend
nginx -t && systemctl reload nginx
certbot --nginx -d apivastu.your-domain.com
```

The app container runs `prisma migrate deploy` on every start, so schema
changes just need a new migration committed and a redeploy
(`docker compose up -d --build`).

## Frontend integration

The frontend (`frontend/index.html`) now calls this API end-to-end: popup
submit → `/api/leads` → `/api/payment/create-order` → Razorpay Checkout →
`/api/payment/verify` → redirect to `frontend/thank-you.html`. Set the
`apiBaseUrl` prop (in the page's publish settings) to your real
`https://api.your-domain.com` once the backend is deployed.
