// Writes to the "Vastu classes" Google Sheet via an Apps Script Web App
// deployed inside that spreadsheet (Extensions > Apps Script). See
// backend/deploy/apps-script/Code.gs for the script source, and
// backend/README.md for deployment steps. No Google Cloud project or
// service account is involved — the script runs as the sheet's owner.

const APPS_SCRIPT_URL = process.env.SHEETS_WEBHOOK_URL;
const SHEETS_WEBHOOK_SECRET = process.env.SHEETS_WEBHOOK_SECRET;

async function postToSheet(payload) {
  if (!APPS_SCRIPT_URL) return; // not configured yet; skip silently

  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: SHEETS_WEBHOOK_SECRET, ...payload }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apps Script sheet write failed (${res.status}): ${text}`);
  }
}

async function upsertFunnelRow({ sessionId, name, mobile, stage, orderId, paymentId }) {
  return postToSheet({ sheet: "funnel", sessionId, name, mobile, stage, orderId, paymentId });
}

async function upsertConfirmedRow({ sessionId, name, mobile, orderId, paymentId }) {
  return postToSheet({ sheet: "confirmed", sessionId, name, mobile, orderId, paymentId });
}

module.exports = { upsertFunnelRow, upsertConfirmedRow };
