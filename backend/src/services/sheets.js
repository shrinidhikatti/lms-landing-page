const { google } = require("googleapis");

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const FUNNEL_TAB = process.env.GOOGLE_SHEETS_FUNNEL_TAB || "Funnel";
const CONFIRMED_TAB = process.env.GOOGLE_SHEETS_CONFIRMED_TAB || "Confirmed";

// Funnel: Session ID | Name | Mobile | Stage | Order ID | Payment ID | First Seen | Last Updated
// Confirmed: Session ID | Name | Mobile | Order ID | Payment ID | Paid At
// Session ID is the Lead's Postgres id, so both sheets stay keyed to the same row across the funnel.

let sheetsClient = null;
function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

async function findRowBySessionId(tab, sessionId) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A:A`,
  });
  const rows = res.data.values || [];
  const index = rows.findIndex((row) => row[0] === sessionId);
  return index === -1 ? null : index + 1; // 1-indexed sheet row, header is row 1
}

async function upsertFunnelRow({ sessionId, name, mobile, stage, orderId, paymentId }) {
  const sheets = getSheetsClient();
  const now = new Date().toISOString();
  const row = await findRowBySessionId(FUNNEL_TAB, sessionId);

  if (!row) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${FUNNEL_TAB}!A:H`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[sessionId, name, mobile, stage, orderId || "", paymentId || "", now, now]] },
    });
    return;
  }

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${FUNNEL_TAB}!A${row}:H${row}`,
  });
  const [existingRow = []] = existing.data.values || [];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${FUNNEL_TAB}!A${row}:H${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        sessionId,
        name || existingRow[1] || "",
        mobile || existingRow[2] || "",
        stage,
        orderId || existingRow[4] || "",
        paymentId || existingRow[5] || "",
        existingRow[6] || now,
        now,
      ]],
    },
  });
}

async function upsertConfirmedRow({ sessionId, name, mobile, orderId, paymentId }) {
  const sheets = getSheetsClient();
  const now = new Date().toISOString();
  const row = await findRowBySessionId(CONFIRMED_TAB, sessionId);
  const values = [[sessionId, name, mobile, orderId || "", paymentId || "", now]];

  if (!row) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${CONFIRMED_TAB}!A:F`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
  } else {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${CONFIRMED_TAB}!A${row}:F${row}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
  }
}

module.exports = { upsertFunnelRow, upsertConfirmedRow };
