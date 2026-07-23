// Paste this into Extensions > Apps Script on the "Vastu classes" spreadsheet.
// Sheet position 1 (leftmost tab) = Funnel, sheet position 2 = Confirmed.
// This is a reference copy for the repo — the deployed source of truth lives
// inside the spreadsheet's own Apps Script editor, not here.

var SHARED_SECRET = 'REPLACE_WITH_SHEETS_WEBHOOK_SECRET'; // must match SHEETS_WEBHOOK_SECRET in backend/.env

var FUNNEL_HEADERS = ['Session ID', 'Name', 'Mobile', 'Stage', 'Order ID', 'Payment ID', 'First Seen', 'Last Updated'];
var CONFIRMED_HEADERS = ['Session ID', 'Name', 'Mobile', 'Order ID', 'Payment ID', 'Paid At'];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.secret !== SHARED_SECRET) {
      return jsonResponse({ error: 'Unauthorized' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var isConfirmed = data.sheet === 'confirmed';
    var sheet = ss.getSheets()[isConfirmed ? 1 : 0];
    ensureHeaders(sheet, isConfirmed ? CONFIRMED_HEADERS : FUNNEL_HEADERS);

    if (isConfirmed) {
      upsertConfirmed(sheet, data);
    } else {
      upsertFunnel(sheet, data);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function ensureHeaders(sheet, headers) {
  var firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var isEmpty = firstRow.every(function (v) { return v === ''; });
  if (isEmpty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function findRowBySessionId(sheet, sessionId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === sessionId) return i + 2;
  }
  return -1;
}

function upsertFunnel(sheet, data) {
  var now = new Date();
  var row = findRowBySessionId(sheet, data.sessionId);
  if (row === -1) {
    sheet.appendRow([
      data.sessionId, data.name || '', data.mobile || '', data.stage || '',
      data.orderId || '', data.paymentId || '', now, now,
    ]);
    return;
  }
  var existing = sheet.getRange(row, 1, 1, 8).getValues()[0];
  sheet.getRange(row, 1, 1, 8).setValues([[
    data.sessionId,
    data.name || existing[1],
    data.mobile || existing[2],
    data.stage || existing[3],
    data.orderId || existing[4],
    data.paymentId || existing[5],
    existing[6] || now,
    now,
  ]]);
}

function upsertConfirmed(sheet, data) {
  var now = new Date();
  var row = findRowBySessionId(sheet, data.sessionId);
  var values = [data.sessionId, data.name || '', data.mobile || '', data.orderId || '', data.paymentId || '', now];
  if (row === -1) {
    sheet.appendRow(values);
  } else {
    sheet.getRange(row, 1, 1, 6).setValues([values]);
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
