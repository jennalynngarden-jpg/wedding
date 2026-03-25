/* ============================================
   Wedding RSVP - Google Apps Script Backend
   ============================================

   SETUP INSTRUCTIONS:
   1. Create a Google Spreadsheet with two sheets (tabs):
      - "GuestList" with columns: guestId, partyId, displayName, relationship, hasResponded
      - "Responses" with columns: timestamp, partyId, guestId, guestName, attending, mealChoice, dietaryRestrictions, songRequest, photoFileId, photoFileName, submittedBy, specialSong
   2. Create a Google Drive folder for photo uploads
   3. Replace SPREADSHEET_ID and PHOTO_FOLDER_ID below with your actual IDs
   4. Deploy: Deploy > New deployment > Web app
      - Execute as: Me
      - Who has access: Anyone
   5. Copy the deployment URL into js/rsvp.js

   COLUMN LAYOUT (GuestList):
     A: guestId            (e.g., G001)
     B: partyId             (e.g., P001 — shared by members of the same household)
     C: displayName         (e.g., "Georgia Garden")
     D: relationship        ("adult" or "child")
     E: hasResponded        (FALSE — set to TRUE automatically on submission)
     F: side                ("bride" or "groom")
     G: partnershipStatus   ("married", "partner", or empty)

   SEARCH BEHAVIOR:
     All guests with relationship "adult" appear in search results.
     Children are excluded — parents RSVP for them via the party selection step.
   ============================================ */

var SPREADSHEET_ID = '1UWNgZ3LOkx_Ap1auSwHL5WbsllE7Rpj6i70Qo7oUhrc';
var GUEST_SHEET = 'GuestList';
var RESPONSE_SHEET = 'Responses';
var PHOTO_FOLDER_ID = '17E0PNTgr66PecYd1_YTK4s1q2ZTy-EyM';

/* ---------- Web App Entry Points ---------- */

function doGet(e) {
  var action = e.parameter.action;

  if (action === 'searchGuests') {
    return searchGuests(e.parameter.query);
  }
  if (action === 'getParty') {
    return getParty(e.parameter.guestId);
  }
  if (action === 'getAttendees') {
    return getAttendees(e.parameter.excludeParty);
  }

  return jsonResponse({ error: 'Unknown action' });
}

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var action = data.action;

  if (action === 'submitRsvp') {
    return submitRsvp(data);
  }
  if (action === 'uploadPhoto') {
    return uploadPhoto(data);
  }

  return jsonResponse({ error: 'Unknown action' });
}

/* ---------- GET: Search Guests ---------- */

function searchGuests(query) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(GUEST_SHEET);
  var data = sheet.getDataRange().getValues();
  var results = [];

  var queryLower = (query || '').toLowerCase().trim();
  if (queryLower.length < 2) {
    return jsonResponse({ guests: [] });
  }

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var displayName = String(row[2]).toLowerCase();  // Column C
    var relationship = String(row[3]).toLowerCase();  // Column D
    var hasResponded = row[4];                        // Column E

    // Show all adults in search, exclude children and plus-ones
    if (relationship !== 'child' && relationship !== 'plusone' && !hasResponded && displayName.indexOf(queryLower) !== -1) {
      results.push({
        guestId: row[0],
        partyId: row[1],
        displayName: row[2]
      });
    }
  }

  return jsonResponse({ guests: results });
}

/* ---------- GET: Get Party Members ---------- */

function getParty(guestId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(GUEST_SHEET);
  var data = sheet.getDataRange().getValues();

  // Find the partyId and partnership status for this guest
  var partyId = null;
  var partnershipStatus = '';
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === guestId) {
      partyId = data[i][1];
      partnershipStatus = data[i][6] || '';  // Column G
      break;
    }
  }

  if (!partyId) {
    return jsonResponse({ error: 'Guest not found' });
  }

  // Collect all party members
  var members = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === partyId) {
      members.push({
        guestId: data[i][0],
        displayName: data[i][2],   // Column C
        relationship: data[i][3]   // Column D
      });
    }
  }

  return jsonResponse({ partyId: partyId, members: members, partnershipStatus: partnershipStatus });
}

/* ---------- POST: Submit RSVP ---------- */

function submitRsvp(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var responseSheet = ss.getSheetByName(RESPONSE_SHEET);
  var guestSheet = ss.getSheetByName(GUEST_SHEET);
  var guestData = guestSheet.getDataRange().getValues();
  var timestamp = new Date();

  for (var i = 0; i < data.guests.length; i++) {
    var g = data.guests[i];
    responseSheet.appendRow([
      timestamp,
      data.partyId,
      g.guestId,
      g.guestName,
      g.attending,
      g.mealChoice || '',
      g.dietaryRestrictions || '',
      g.songRequest || '',
      '',
      '',
      data.submittedBy,
      data.specialSong || ''   // Column L: special song (for married/partnered guests)
    ]);

    // Update GuestList for this guest
    for (var j = 1; j < guestData.length; j++) {
      if (guestData[j][0] === g.guestId) {
        // Update displayName for plus-ones with the name entered in the form
        if (String(guestData[j][3]).toLowerCase() === 'plusone' && g.guestName) {
          guestSheet.getRange(j + 1, 3).setValue(g.guestName);
        }
        // Mark guest as responded (Column E = 5th column)
        guestSheet.getRange(j + 1, 5).setValue(true);
        break;
      }
    }
  }

  return jsonResponse({ success: true });
}

/* ---------- POST: Upload Photo ---------- */

function uploadPhoto(data) {
  var folder = DriveApp.getFolderById(PHOTO_FOLDER_ID);
  var decoded = Utilities.base64Decode(data.base64Data);
  var blob = Utilities.newBlob(decoded, data.mimeType, data.fileName);
  var file = folder.createFile(blob);

  return jsonResponse({
    success: true,
    fileId: file.getId(),
    fileUrl: file.getUrl()
  });
}

/* ---------- GET: Get Confirmed Attendees ---------- */

function getAttendees(excludeParty) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var responseSheet = ss.getSheetByName(RESPONSE_SHEET);
  var guestSheet = ss.getSheetByName(GUEST_SHEET);
  var responseData = responseSheet.getDataRange().getValues();
  var guestData = guestSheet.getDataRange().getValues();

  // Collect guestIds that are attending from Responses sheet
  var attendingIds = {};
  for (var i = 1; i < responseData.length; i++) {
    var guestId = responseData[i][2];    // Column C: guestId
    var attending = responseData[i][4];  // Column E: attending
    if (String(attending).toLowerCase() === 'yes') {
      attendingIds[guestId] = true;
    }
  }

  // Build a map of partyId -> { side, members[] } from GuestList
  var partyMap = {};
  for (var j = 1; j < guestData.length; j++) {
    var gId = guestData[j][0];          // Column A: guestId
    var partyId = guestData[j][1];      // Column B: partyId
    var displayName = guestData[j][2];  // Column C: displayName
    var relationship = guestData[j][3]; // Column D: relationship
    var side = String(guestData[j][5] || '').toLowerCase(); // Column F: side

    if (!attendingIds[gId]) continue;
    if (excludeParty && partyId === excludeParty) continue;

    if (!partyMap[partyId]) {
      partyMap[partyId] = { side: side || 'bride', members: [] };
    }
    // Sort priority: adults first, then children, then plus-ones
    var sortOrder = relationship === 'adult' ? 0 : (relationship === 'child' ? 1 : 2);
    partyMap[partyId].members.push({ name: displayName, sortOrder: sortOrder });
  }

  // Group parties by side
  var bride = [];
  var groom = [];
  var partyIds = Object.keys(partyMap);
  for (var k = 0; k < partyIds.length; k++) {
    var party = partyMap[partyIds[k]];
    // Sort members within party
    party.members.sort(function (a, b) { return a.sortOrder - b.sortOrder; });
    var names = [];
    for (var n = 0; n < party.members.length; n++) {
      names.push(party.members[n].name);
    }
    var entry = { partyId: partyIds[k], names: names };
    if (party.side === 'groom') {
      groom.push(entry);
    } else {
      bride.push(entry);
    }
  }

  return jsonResponse({ bride: bride, groom: groom });
}

/* ---------- Utility ---------- */

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
