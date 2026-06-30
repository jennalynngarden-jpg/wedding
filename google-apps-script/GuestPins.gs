/* ============================================
   Guest Pins - Google Apps Script Backend
   ============================================

   SETUP INSTRUCTIONS:
   1. Create a Google Spreadsheet with one sheet called "GuestPins"
      Columns: timestamp, name, lat, lng, pinId
   2. Replace PINS_SPREADSHEET_ID below with your actual spreadsheet ID
   3. Deploy: Deploy > New deployment > Web app
      - Execute as: Me
      - Who has access: Anyone
   4. Copy the deployment URL into js/travel-map.js

   COLUMN LAYOUT (GuestPins):
     A: timestamp   (when the pin was added)
     B: name        (guest's name)
     C: lat         (latitude)
     D: lng         (longitude)
     E: pinId       (unique identifier for the pin)
   ============================================ */

var PINS_SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
var PINS_SHEET = 'GuestPins';

/* ---------- Web App Entry Points ---------- */

function doGet(e) {
  var action = e.parameter.action;

  if (action === 'getPins') {
    return getPins();
  }
  if (action === 'addPin') {
    return addPinFromGet(e.parameter);
  }
  if (action === 'removePin') {
    return removePinFromGet(e.parameter);
  }

  return jsonResponse({ error: 'Unknown action' });
}

/* ---------- GET: Add a Pin ---------- */
function addPinFromGet(params) {
  var ss = SpreadsheetApp.openById(PINS_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PINS_SHEET);
  var timestamp = new Date();

  var pinId = 'pin_' + timestamp.getTime() + '_' + Math.random().toString(36).substr(2, 9);

  sheet.appendRow([
    timestamp,
    params.name,
    parseFloat(params.lat),
    parseFloat(params.lng),
    pinId
  ]);

  return jsonResponse({
    success: true,
    pinId: pinId
  });
}

/* ---------- GET: Remove a Pin ---------- */
function removePinFromGet(params) {
  var ss = SpreadsheetApp.openById(PINS_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PINS_SHEET);
  var dataRange = sheet.getDataRange();
  var values = dataRange.getValues();

  for (var i = 1; i < values.length; i++) {
    if (values[i][4] === params.pinId) {
      sheet.deleteRow(i + 1);
      return jsonResponse({ success: true });
    }
  }

  return jsonResponse({ error: 'Pin not found' });
}

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var action = data.action;

  if (action === 'addPin') {
    return addPin(data);
  }
  if (action === 'removePin') {
    return removePin(data);
  }

  return jsonResponse({ error: 'Unknown action' });
}

/* ---------- GET: Get All Pins ---------- */

function getPins() {
  var ss = SpreadsheetApp.openById(PINS_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PINS_SHEET);
  var data = sheet.getDataRange().getValues();
  var pins = [];

  // Skip header row (row 0)
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    // Only include rows that have data
    if (row[1] && row[2] && row[3]) {
      pins.push({
        name: row[1],      // Column B: name
        lat: row[2],       // Column C: lat
        lng: row[3],       // Column D: lng
        pinId: row[4]      // Column E: pinId
      });
    }
  }

  return jsonResponse({ pins: pins });
}

/* ---------- POST: Add a Pin ---------- */

function addPin(data) {
  var ss = SpreadsheetApp.openById(PINS_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PINS_SHEET);
  var timestamp = new Date();

  // Generate a unique pin ID
  var pinId = 'pin_' + timestamp.getTime() + '_' + Math.random().toString(36).substr(2, 9);

  sheet.appendRow([
    timestamp,
    data.name,
    data.lat,
    data.lng,
    pinId
  ]);

  return jsonResponse({
    success: true,
    pinId: pinId
  });
}

/* ---------- POST: Remove a Pin ---------- */

function removePin(data) {
  var ss = SpreadsheetApp.openById(PINS_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PINS_SHEET);
  var dataRange = sheet.getDataRange();
  var values = dataRange.getValues();

  // Find and delete the row with this pinId
  for (var i = 1; i < values.length; i++) {
    if (values[i][4] === data.pinId) {
      sheet.deleteRow(i + 1); // +1 because rows are 1-indexed
      return jsonResponse({ success: true });
    }
  }

  return jsonResponse({ error: 'Pin not found' });
}

/* ---------- Utility ---------- */

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
