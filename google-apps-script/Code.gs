/* ============================================
   Wedding RSVP - Google Apps Script Backend
   ============================================

   SETUP INSTRUCTIONS:
   1. Create a Google Spreadsheet with two sheets (tabs):
      - "GuestList" with columns: guestId, partyId, displayName, relationship, hasResponded
      - "Responses" with columns: timestamp, partyId, guestId, guestName, attending, mealChoice, dietaryRestrictions, songRequest, submittedBy, specialSong, email, rsvpCode, emailStatus, photoIds
        (rsvpCode, emailStatus, and photoIds are filled in automatically)
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
     H: rehearsalDinner     (TRUE or FALSE — invited to rehearsal dinner)

   SEARCH BEHAVIOR:
     All guests with relationship "adult" appear in search results.
     Children are excluded — parents RSVP for them via the party selection step.
   ============================================ */

var SPREADSHEET_ID = '1UWNgZ3LOkx_Ap1auSwHL5WbsllE7Rpj6i70Qo7oUhrc';
var GUEST_SHEET = 'GuestList';
var RESPONSE_SHEET = 'Responses';
var PHOTO_FOLDER_ID = '17E0PNTgr66PecYd1_YTK4s1q2ZTy-EyM';

/* Registry sheets:
   - REGISTRY_SHEET "Registry" columns (row 1 = headers):
       A id | B name | C description | D link | E image | F price | G reserved
     Only A (any unique id) and D (the product link) are required — the script
     fetches the title, description, photo, and price from the product page
     automatically and refreshes them daily so prices stay current.
     B, C, E, and F are optional OVERRIDES: fill one in to use your own
     wording/photo/price instead of the fetched one.
     G (reserved) is managed automatically.
     Columns H–L are the fetched-metadata cache — the script maintains them;
     don't edit them by hand.
   - PURCHASES_SHEET "RegistryPurchases" columns:
       A timestamp | B itemId | C itemName | D buyerName | E buyerEmail | F note
     This is written automatically — it's your thank-you-note list. */
var REGISTRY_SHEET = 'Registry';
var PURCHASES_SHEET = 'RegistryPurchases';
/* DONATIONS_SHEET "Donations" is written automatically when a guest records a
   charitable donation — columns: A timestamp | B charity | C name | D amount |
   E note. It's your thank-you-note list for donations. */
var DONATIONS_SHEET = 'Donations';

/* Confirmation emails (sent after each RSVP):
   - EMAIL_FROM must be set up in this Google account's Gmail as a
     "Send mail as" address (Gmail settings > Accounts and Import).
   - Each RSVP gets a private link code, saved in column L of the Responses
     tab. The email's button opens RSVP_PAGE_URL?code=... so guests can
     finish the optional questions, or update a "can't make it" RSVP. */
var EMAIL_FROM = 'jennaliam2027@gmail.com';
var EMAIL_NAME = 'Jenna & Liam';
var RSVP_PAGE_URL = 'https://jennaliam.info/rsvp.html';
// A smaller copy of the website's oak crest, sized for emails
var EMAIL_CREST_URL = 'https://jennaliam.info/images/oak-crest-email.png';
var CODE_COLUMN = 12;  // Responses column L: rsvpCode
var STATUS_COLUMN = 13;  // Responses column M: emailStatus ("pending" or "sent")
// For guests who are coming, the email waits until they finish (or skip) the
// optional questions, so it only mentions them if they're still unanswered.
// If they leave the page instead, a timer sends it after this many minutes.
var PENDING_EMAIL_MINUTES = 15;

// Deadlines for changing an RSVP (Pacific time):
//   - who's coming (switching between yes and no): until the end of May 24, 2027
//     (the RSVP deadline)
//   - dinner choices and optional answers: until the end of July 14, 2027
//     (10 days before the wedding, when final numbers go to the venue)
var ATTENDANCE_DEADLINE = new Date('2027-05-25T07:00:00Z');  // midnight after May 24, Pacific
var EDIT_DEADLINE = new Date('2027-07-15T07:00:00Z');        // midnight after July 14, Pacific

// Responses column N: the guest's photos (Drive file IDs, separated by commas),
// kept on the first row of each RSVP, so their Your RSVP page can show them
var PHOTOS_COLUMN = 14;

// Guest map pins live in their own spreadsheet ("GuestPins" tab):
//   A timestamp | B name | C lat | D lng | E pinId | F rsvpCode | G removeKey | H city
// F and G are filled in automatically: they link a pin to the RSVP that added
// it, so only that guest can move or remove it (from their Your RSVP page).
var PINS_SPREADSHEET_ID = '1f6kn6VXJiKXJVi_WfWhq_LcBbkMKu2GDKpH62Gvknjs';
var PINS_SHEET = 'GuestPins';

// Jenna & Liam get an email about every new RSVP and every change. Their
// addresses are NOT in this file (it's public on GitHub): they're saved in
// Project Settings > Script properties, as NOTIFY_EMAILS (comma-separated).
var SHEET_URL = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit';

/* ---------- Web App Entry Points ---------- */

function doGet(e) {
  var action = e.parameter.action;

  if (action === 'getGuestList') {
    return getGuestList();
  }
  if (action === 'searchGuests') {
    return searchGuests(e.parameter.query);
  }
  if (action === 'getParty') {
    return getParty(e.parameter.guestId);
  }
  if (action === 'getRsvpByCode') {
    return getRsvpByCode(e.parameter.code);
  }
  if (action === 'rsvpLinkHint') {
    return rsvpLinkHint(e.parameter.guestId);
  }
  if (action === 'getPins') {
    return getPins();
  }
  if (action === 'addPin') {
    return addPin(e.parameter);
  }
  if (action === 'removePin') {
    return removePin(e.parameter);
  }
  if (action === 'getAttendees') {
    return getAttendees(e.parameter.excludeParty);
  }
  if (action === 'getPhotos') {
    return getPhotos();
  }
  if (action === 'getRegistry') {
    return getRegistry();
  }

  return jsonResponse({ error: 'Unknown action' });
}

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var action = data.action;

  if (action === 'submitRsvp') {
    return submitRsvp(data);
  }
  if (action === 'submitExtras') {
    return submitExtras(data);
  }
  if (action === 'sendConfirmation') {
    return sendConfirmation(data);
  }
  if (action === 'uploadPhoto') {
    return uploadPhoto(data);
  }
  if (action === 'updateRsvp') {
    return updateRsvp(data);
  }
  if (action === 'updateAnswers') {
    return updateRsvp(data);
  }
  if (action === 'removePhoto') {
    return removePhoto(data);
  }
  if (action === 'sendRsvpLink') {
    return sendRsvpLink(data);
  }
  if (action === 'markPurchased') {
    return markPurchased(data);
  }
  if (action === 'recordDonation') {
    return recordDonation(data);
  }

  return jsonResponse({ error: 'Unknown action' });
}

/* ---------- GET: Whole Guest List ---------- */
// The RSVP page loads this once when it opens, then searches and finds
// parties right in the browser. (One request per visit instead of one per
// search, since requests to Google occasionally stall.)

function getGuestList() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(GUEST_SHEET);
  var data = sheet.getDataRange().getValues();
  var guests = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;  // skip blank rows
    guests.push({
      guestId: row[0],                                              // Column A
      partyId: row[1],                                              // Column B
      displayName: row[2],                                          // Column C
      relationship: String(row[3]).toLowerCase(),                   // Column D
      hasResponded: row[4] === true || String(row[4]).toUpperCase() === 'TRUE',  // Column E
      partnershipStatus: row[6] || '',                              // Column G
      rehearsalDinner: row[7] === true || String(row[7]).toUpperCase() === 'TRUE' // Column H
    });
  }

  return jsonResponse({ guests: guests });
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

    // Show all adults in search, exclude children and plus-ones. Guests who
    // already RSVPed are included and flagged, so the page can offer to email
    // them a link to their RSVP.
    if (relationship !== 'child' && relationship !== 'plusone' && displayName.indexOf(queryLower) !== -1) {
      results.push({
        guestId: row[0],
        partyId: row[1],
        displayName: row[2],
        hasResponded: hasResponded === true || String(hasResponded).toUpperCase() === 'TRUE'
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
        relationship: data[i][3],  // Column D
        // Column E: lets the "Who's RSVPing today?" step show who's already done
        hasResponded: data[i][4] === true || String(data[i][4]).toUpperCase() === 'TRUE',
        rehearsalDinner: data[i][7] === true || String(data[i][7]).toUpperCase() === 'TRUE'  // Column H
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
  // The page makes this RSVP's private code before sending (used in the
  // confirmation email's link). If an RSVP with this code is already saved,
  // this is a repeat (a backup copy, or the guest tapping Submit again after
  // a slow connection), so we don't save it twice. The lock makes two copies
  // arriving at the same moment wait their turn.
  var code = /^[a-f0-9]{16,64}$/.test(data.code || '') ? data.code : Utilities.getUuid().replace(/-/g, '');
  var anyoneComing;
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var existing = responseSheet.getRange(1, CODE_COLUMN, responseSheet.getLastRow(), 1).getValues();
    for (var c = 0; c < existing.length; c++) {
      if (existing[c][0] === code) return jsonResponse({ success: true, code: code });
    }
    anyoneComing = saveNewRsvp(data, code, responseSheet, guestSheet);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  // "Can't make it" RSVPs get their email right away. RSVPs with someone
  // coming wait for the optional questions (the page calls sendConfirmation,
  // or the timer sends it). If sending fails, the RSVP is still saved.
  if (!anyoneComing) {
    try {
      sendConfirmationForCode(code, false);
    } catch (err) {
      console.error('RSVP email failed: ' + err);
    }
  }

  // Let Jenna & Liam know (if this fails, the RSVP is still saved)
  try {
    notifyNewRsvp(data);
  } catch (err) {
    console.error('New RSVP notification failed: ' + err);
  }

  return jsonResponse({ success: true, code: code });
}

// Saves a new RSVP (called by submitRsvp once it knows it isn't a repeat).
// Returns whether anyone on it is coming.
function saveNewRsvp(data, code, responseSheet, guestSheet) {
  var guestData = guestSheet.getDataRange().getValues();
  var timestamp = new Date();
  if (!responseSheet.getRange(1, CODE_COLUMN).getValue()) {
    responseSheet.getRange(1, CODE_COLUMN).setValue('rsvpCode');  // add the headers once
  }
  if (!responseSheet.getRange(1, STATUS_COLUMN).getValue()) {
    responseSheet.getRange(1, STATUS_COLUMN).setValue('emailStatus');
  }

  // Is anyone on this RSVP coming? (Decides when the email goes out.)
  var anyoneComing = data.guests.some(function (g) { return g.attending && g.attending !== 'no'; });

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
      data.submittedBy,
      data.specialSong || '',  // Column J: special song (for married/partnered guests)
      data.email || '',        // Column K: email address
      code,                    // Column L: private link code for the email
      data.email ? 'pending' : ''  // Column M: email status
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

  return anyoneComing;
}

/* ---------- Confirmation emails ---------- */

// Plain-language versions of the attendance choices
function attendingLabel(value) {
  if (value === 'wedding-and-rehearsal') return 'Wedding & rehearsal dinner';
  if (value === 'wedding-only') return 'Wedding only';
  if (value === 'yes') return 'Attending';
  return 'Can’t make it';
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The sentence about deadlines for guest emails (depends on today's date).
// anyoneComing: whether anyone on the RSVP is coming.
function changeDeadlineText(anyoneComing) {
  var now = new Date();
  if (!anyoneComing) {
    return now < ATTENDANCE_DEADLINE ? 'If your plans change, you can update your RSVP before May 24, 2027.' : '';
  }
  if (now < ATTENDANCE_DEADLINE) {
    return 'You can change who’s coming until May 24, 2027, and everything else until July 14, 2027.';
  }
  if (now < EDIT_DEADLINE) return 'You can update dinner choices and your other answers until July 14, 2027.';
  return '';
}

// Can this RSVP still be changed at all? (People who are coming can change
// dinner and answers until July 14; a "can't make it" RSVP until May 24.)
function rsvpStillEditable(anyoneComing) {
  var now = new Date();
  return anyoneComing ? now < EDIT_DEADLINE : now < ATTENDANCE_DEADLINE;
}

// One row per guest for the summary in guest emails:
// "Wedding & rehearsal dinner · Chicken · Dietary notes: ..."
function guestSummaryRows(guests, songRequest, specialSong) {
  var rows = [];
  guests.forEach(function (g) {
    var details = [attendingLabel(g.attending)];
    if (g.attending !== 'no' && g.mealChoice) details.push(g.mealChoice);
    if (g.attending !== 'no' && g.dietaryRestrictions) details.push('Dietary notes: ' + g.dietaryRestrictions);
    rows.push([g.guestName, details.join(' · ')]);
  });
  if (specialSong) rows.push(['Your special song', specialSong]);
  if (songRequest) rows.push(['Your song requests', songRequest]);
  return rows;
}

// Builds a guest email in the website's style. Returns { subject, text, html }.
//   e: { subject, hello, paragraphs: [...], rows: [[title, details]],
//        closing: [...], buttonText, link }
function buildGuestEmail(e) {
  var paragraphs = (e.paragraphs || []).filter(Boolean);
  var closing = (e.closing || []).filter(Boolean);
  var rows = e.rows || [];

  // Plain-text version (for email apps that don't show formatting)
  var text = e.hello + '\n\n' + paragraphs.join('\n\n') +
    rows.map(function (r) { return '\n  ' + r[0] + ': ' + r[1]; }).join('') +
    (closing.length ? '\n\n' + closing.join('\n\n') : '') +
    (e.buttonText ? '\n' + e.buttonText + ': ' + e.link : '') +
    '\n\nLove,\nJenna & Liam';

  // Sizes are set right on each table cell: some email apps (like Apple Mail)
  // don't pass the email's text size into tables, so they came out small
  var rowsHtml = rows.map(function (r) {
    return '<tr><td style="padding:10px 0;border-bottom:1px solid #e8e4df;font-size:16px;line-height:1.5;">' +
      '<strong style="color:#2c3e2d;font-size:16px;">' + escapeHtml(r[0]) + '</strong><br>' +
      '<span style="color:#6b6b6b;font-size:16px;">' + escapeHtml(r[1]) + '</span></td></tr>';
  }).join('');
  var button = e.buttonText
    ? '<p style="text-align:center;margin:24px 0;">' +
        '<a href="' + e.link + '" style="background:#2c3e2d;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:13px;letter-spacing:1px;text-transform:uppercase;display:inline-block;">' +
        escapeHtml(e.buttonText) + '</a></p>'
    : '';
  var html =
    '<div style="background:#ffffff;padding:24px 16px;font-family:Helvetica,Arial,sans-serif;color:#3a3a3a;font-size:15px;line-height:1.6;">' +
      '<div style="max-width:520px;margin:0 auto;">' +
        // The oak crest from the website, above our names
        '<p style="text-align:center;margin:0 0 12px;">' +
          '<img src="' + EMAIL_CREST_URL + '" width="160" alt="" style="width:160px;max-width:60%;height:auto;border:0;"></p>' +
        '<p style="font-family:Georgia,serif;font-size:22px;color:#2c3e2d;text-align:center;margin:0 0 4px;">Jenna &amp; Liam</p>' +
        '<p style="text-align:center;color:#6b6b6b;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin:0 0 28px;">July 24, 2027 &middot; Monterey, California</p>' +
        '<p>' + escapeHtml(e.hello) + '</p>' +
        paragraphs.map(function (p) { return '<p>' + escapeHtml(p) + '</p>'; }).join('') +
        (rowsHtml ? '<table style="width:100%;border-collapse:collapse;margin:8px 0 20px;">' + rowsHtml + '</table>' : '') +
        closing.map(function (p) { return '<p>' + escapeHtml(p) + '</p>'; }).join('') +
        button +
        '<p>Love,<br>Jenna &amp; Liam</p>' +
      '</div>' +
    '</div>';

  return { subject: e.subject, text: text, html: html };
}

// The confirmation email for a new RSVP.
//   info: { firstName, guests: [{ guestName, attending, mealChoice,
//           dietaryRestrictions }], songRequest, specialSong,
//           finishedExtras, answeredOptional, link }
// The optional questions are only mentioned if they haven't answered any
// of them (and didn't go through them on the page).
function composeEmail(info) {
  var coming = info.guests.some(function (g) { return g.attending && g.attending !== 'no'; });
  var hello = info.firstName ? 'Hi ' + info.firstName + ',' : 'Hi there,';
  var deadline = changeDeadlineText(coming);
  var editable = rsvpStillEditable(coming);

  if (coming) {
    var answered = info.finishedExtras || info.answeredOptional;
    var closing;
    if (answered) {
      closing = deadline ? 'Need to change anything? ' + deadline : 'Need to change anything? Just reply to this email.';
    } else {
      closing = 'Want to answer our optional questions about music, photos, and where you’re traveling from? ' +
        'You can do that from your RSVP page' + (deadline ? ', and make changes there too. ' + deadline : '.');
    }
    return buildGuestEmail({
      subject: 'Your RSVP to Jenna and Liam’s wedding',
      hello: hello,
      paragraphs: ['Thanks for RSVPing! Here’s what we have for you:'],
      rows: guestSummaryRows(info.guests, info.songRequest, info.specialSong),
      closing: [closing],
      buttonText: editable ? 'View or update your RSVP' : 'View your RSVP',
      link: info.link
    });
  }
  return buildGuestEmail({
    subject: 'Your RSVP to Jenna and Liam’s wedding',
    hello: hello,
    paragraphs: ['Thanks for letting us know you can’t make it. We’ll miss you, and we’re grateful for your love and friendship!'],
    closing: [deadline],
    buttonText: editable ? 'Update your RSVP' : '',
    link: info.link
  });
}

// The email after a guest changes their RSVP on their Your RSVP page
//   info: { firstName, guests, songRequest, specialSong, link }
function composeUpdateEmail(info) {
  var coming = info.guests.some(function (g) { return g.attending && g.attending !== 'no'; });
  var hello = info.firstName ? 'Hi ' + info.firstName + ',' : 'Hi there,';
  var editable = rsvpStillEditable(coming);
  if (coming) {
    return buildGuestEmail({
      subject: 'Your updated RSVP to Jenna and Liam’s wedding',
      hello: hello,
      paragraphs: ['Your changes are saved. Here’s your updated RSVP:'],
      rows: guestSummaryRows(info.guests, info.songRequest, info.specialSong),
      closing: [changeDeadlineText(true)],
      buttonText: editable ? 'View or update your RSVP' : 'View your RSVP',
      link: info.link
    });
  }
  return buildGuestEmail({
    subject: 'Your updated RSVP to Jenna and Liam’s wedding',
    hello: hello,
    paragraphs: ['Thanks for letting us know you can’t make it anymore. We’ll miss you, and we’re grateful for your love and friendship!'],
    closing: [new Date() < ATTENDANCE_DEADLINE ? 'If your plans change again, you can update your RSVP until May 24, 2027.' : ''],
    buttonText: editable ? 'Update your RSVP' : '',
    link: info.link
  });
}

// The email with a private link, for guests who already RSVPed and asked for
// it on the RSVP page. No RSVP details, since whoever asked may not be the
// person who RSVPed.
function composeLinkEmail(info) {
  return buildGuestEmail({
    subject: 'Your link to view or update your RSVP',
    hello: info.firstName ? 'Hi ' + info.firstName + ',' : 'Hi there,',
    paragraphs: ['Here’s your private link to see your RSVP to our wedding and make changes.'],
    closing: [changeDeadlineText(info.anyoneComing), 'Didn’t ask for this link? You can ignore this email.'],
    buttonText: 'View or update your RSVP',
    link: info.link
  });
}

/* ---------- Emails to Jenna & Liam ---------- */

// How many guests are coming, can't make it, or haven't RSVPed yet (each
// guest's latest answer counts)
function rsvpCounts() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var guests = ss.getSheetByName(GUEST_SHEET).getDataRange().getValues();
  var responses = ss.getSheetByName(RESPONSE_SHEET).getDataRange().getValues();
  var latest = {};
  for (var i = 1; i < responses.length; i++) latest[responses[i][2]] = String(responses[i][4] || '');
  var counts = { coming: 0, cant: 0, waiting: 0 };
  for (var j = 1; j < guests.length; j++) {
    if (!guests[j][0]) continue;
    var a = latest[guests[j][0]];
    if (a === undefined || a === '') counts.waiting++;
    else if (a === 'no') counts.cant++;
    else counts.coming++;
  }
  return counts;
}

// Builds an email to Jenna & Liam. Returns { subject, text, html }.
//   e: { subject, heading, counts (optional): { coming, cant, waiting,
//        change: { coming, cant } }, intro, rows: [[title, details]], closing }
function buildCoupleEmail(e) {
  var c = e.counts;
  function tag(n) {
    if (!n) return '';
    return ' <span style="display:inline-block;background:#ffffff;color:#5c7a4e;font-size:12px;font-weight:bold;padding:2px 7px;border-radius:10px;vertical-align:middle;">' +
      (n > 0 ? '+' + n : '−' + Math.abs(n)) + '</span>';
  }
  function box(num, label, bg, border, change) {
    return '<td width="33%" style="padding:0 5px;">' +
      '<div style="background:' + bg + ';' + (border ? 'border:1px solid #e8e4df;' : '') + 'border-radius:8px;padding:14px 6px 12px;text-align:center;">' +
        '<div style="font-family:Georgia,serif;font-size:30px;line-height:1.2;color:#2c3e2d;">' + num + tag(change) + '</div>' +
        '<div style="font-size:11px;letter-spacing:1.5px;color:#6b6b6b;font-weight:bold;">' + label + '</div>' +
      '</div></td>';
  }
  var countsHtml = c
    ? '<table style="width:100%;border-collapse:collapse;margin:4px -5px 18px;"><tr>' +
        box(c.coming, 'COMING', '#e8efe5', false, c.change && c.change.coming) +
        box(c.cant, 'CAN’T MAKE IT', '#f4f2ee', false, c.change && c.change.cant) +
        box(c.waiting, 'NO RSVP YET', '#ffffff', true, 0) +
      '</tr></table>'
    : '';
  var rowsHtml = (e.rows || []).map(function (r) {
    return '<tr><td style="padding:10px 0;border-bottom:1px solid #e8e4df;font-size:16px;line-height:1.5;">' +
      '<strong style="color:#2c3e2d;font-size:16px;">' + escapeHtml(r[0]) + '</strong><br>' +
      '<span style="color:#6b6b6b;font-size:16px;">' + escapeHtml(r[1]) + '</span></td></tr>';
  }).join('');
  var html =
    '<div style="background:#ffffff;padding:24px 16px;font-family:Helvetica,Arial,sans-serif;color:#3a3a3a;font-size:15px;line-height:1.6;">' +
      '<div style="max-width:520px;margin:0 auto;">' +
        '<p style="font-size:11px;letter-spacing:2px;color:#7a9a6d;font-weight:bold;margin:0 0 6px;">WEDDING WEBSITE</p>' +
        '<p style="font-family:Georgia,serif;font-size:22px;color:#2c3e2d;margin:0 0 14px;">' + escapeHtml(e.heading) + '</p>' +
        countsHtml +
        '<p>' + escapeHtml(e.intro) + '</p>' +
        (rowsHtml ? '<table style="width:100%;border-collapse:collapse;margin:8px 0 20px;">' + rowsHtml + '</table>' : '') +
        (e.closing ? '<p>' + escapeHtml(e.closing) + '</p>' : '') +
        '<p style="text-align:center;margin:24px 0 8px;">' +
          '<a href="' + SHEET_URL + '" style="background:#2c3e2d;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:13px;letter-spacing:1px;text-transform:uppercase;display:inline-block;">Open RSVP sheet</a></p>' +
      '</div>' +
    '</div>';
  var text = e.heading + '\n\n' +
    (c ? 'Coming: ' + c.coming + ' · Can’t make it: ' + c.cant + ' · No RSVP yet: ' + c.waiting + '\n\n' : '') +
    e.intro + (e.rows || []).map(function (r) { return '\n  ' + r[0] + ': ' + r[1]; }).join('') +
    (e.closing ? '\n\n' + e.closing : '') + '\n\nRSVP sheet: ' + SHEET_URL;
  return { subject: e.subject, text: text, html: html };
}

// Sends an email to Jenna & Liam (if their addresses are set up)
function notifyCouple(email) {
  var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAILS');
  if (!to) {
    console.log('NOTIFY_EMAILS isn’t set in Script properties, so no notification was sent.');
    return;
  }
  sendComposedEmail(to, email);
}

function nowLabel() {
  return Utilities.formatDate(new Date(), 'America/Los_Angeles', "MMM d 'at' h:mm a");
}

// "Morgan Lee" or "Morgan Lee's party"
function partyLabel(name, size) {
  return size > 1 ? name + '’s party' : name;
}

// After a new RSVP is saved
function notifyNewRsvp(data) {
  var guests = data.guests || [];
  var submitter = guests.filter(function (g) { return g.guestId === data.submittedBy; })[0] || guests[0];
  var name = submitter ? submitter.guestName : 'Someone';
  var coming = guests.filter(function (g) { return g.attending && g.attending !== 'no'; }).length;
  var cant = guests.length - coming;
  var counts = rsvpCounts();
  counts.change = { coming: coming, cant: cant };

  var subject = coming === 0
    ? 'New RSVP: ' + partyLabel(name, guests.length) + ' can’t make it'
    : 'New RSVP: ' + partyLabel(name, guests.length) + ' (' + coming + ' coming' + (cant ? ', ' + cant + ' can’t' : '') + ')';
  var rows = guests.map(function (g) {
    var details = [attendingLabel(g.attending)];
    if (g.attending !== 'no' && g.mealChoice) details.push(g.mealChoice);
    if (g.attending !== 'no' && g.dietaryRestrictions) details.push('Dietary notes: ' + g.dietaryRestrictions);
    return [g.guestName, details.join(' · ')];
  });
  notifyCouple(buildCoupleEmail({
    subject: subject,
    heading: 'New RSVP',
    counts: counts,
    intro: name + ' just RSVPed' + (guests.length > 1 ? ' for their party' : '') + ' (' + nowLabel() + ').',
    rows: rows
  }));
}

function sendComposedEmail(to, email) {
  GmailApp.sendEmail(to, email.subject, email.text, {
    htmlBody: email.html,
    from: EMAIL_FROM,
    name: EMAIL_NAME,
    replyTo: EMAIL_FROM
  });
}

// Sends the email for one RSVP (found by its code), using what's saved in
// the Responses tab. Only ever sends once per RSVP: rows are marked "sent".
function sendConfirmationForCode(code, finishedExtras) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);  // so the page and the timer can't both send it
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RESPONSE_SHEET);
    var rows = sheet.getDataRange().getValues();
    var rowNumbers = [], guests = [], info = { songRequest: '', specialSong: '', email: '', submittedBy: '', photos: '' };

    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (r[CODE_COLUMN - 1] !== code) continue;
      if (r[STATUS_COLUMN - 1] !== 'pending') return;  // already sent (or no email)
      rowNumbers.push(i + 1);
      guests.push({ guestId: r[2], guestName: r[3], attending: r[4], mealChoice: r[5], dietaryRestrictions: r[6] });
      info.songRequest = info.songRequest || r[7];
      info.submittedBy = r[8];
      info.specialSong = info.specialSong || r[9];
      info.email = r[10];
      info.photos = info.photos || r[PHOTOS_COLUMN - 1];
    }
    if (!rowNumbers.length || !info.email) return;

    var firstName = '';
    guests.forEach(function (g) {
      if (g.guestId === info.submittedBy) firstName = String(g.guestName).split(' ')[0];
    });

    sendComposedEmail(info.email, composeEmail({
      firstName: firstName,
      guests: guests,
      songRequest: info.songRequest,
      specialSong: info.specialSong,
      finishedExtras: finishedExtras,
      // Answered any optional question? Then the email won't ask them to
      answeredOptional: !!(info.songRequest || info.specialSong || info.photos || pinForCode(code)),
      link: RSVP_PAGE_URL + '?code=' + code
    }));

    rowNumbers.forEach(function (n) { sheet.getRange(n, STATUS_COLUMN).setValue('sent'); });
  } finally {
    lock.releaseLock();
  }
}

// POST from the page: the guest finished the optional questions (or chose
// "Maybe later"). Saves any last song answers, then sends their email.
//   data: { code, finishedExtras, songRequest, specialSong, partyId, guestIds }
function sendConfirmation(data) {
  if (data.songRequest || data.specialSong) {
    submitExtras(data);
    SpreadsheetApp.flush();  // make sure the email sees the saved answers
  }
  try {
    sendConfirmationForCode(data.code, !!data.finishedExtras);
  } catch (err) {
    console.error('RSVP email failed: ' + err);
  }
  return jsonResponse({ success: true });
}

// Runs automatically every 10 minutes (set up by setUpEmails). Sends any
// email that's been waiting longer than PENDING_EMAIL_MINUTES, for guests
// who left the page without finishing or skipping the optional questions.
function sendPendingEmails() {
  var rows = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RESPONSE_SHEET).getDataRange().getValues();
  var cutoff = new Date().getTime() - PENDING_EMAIL_MINUTES * 60 * 1000;
  var done = {};
  for (var i = 1; i < rows.length; i++) {
    var code = rows[i][CODE_COLUMN - 1];
    if (!code || done[code] || rows[i][STATUS_COLUMN - 1] !== 'pending') continue;
    if (new Date(rows[i][0]).getTime() > cutoff) continue;  // give them time to finish
    done[code] = true;
    try {
      sendConfirmationForCode(code, false);
    } catch (err) {
      console.error('Pending RSVP email failed: ' + err);
    }
  }
}

// RUN THIS ONCE from the Apps Script editor (choose it in the function menu
// at the top, then click Run). It:
//   1. asks for permission to send email and run on a timer,
//   2. starts the 10-minute timer for waiting emails, and
//   3. sends you a sample of every email, to check the wording and design.
function setUpEmails() {
  var hasTimer = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'sendPendingEmails';
  });
  if (!hasTimer) {
    ScriptApp.newTrigger('sendPendingEmails').timeBased().everyMinutes(10).create();
  }
  sendSampleEmails();
}

// Sends you (whoever runs it) a sample of every email
function sendSampleEmails() {
  var me = Session.getActiveUser().getEmail();
  var guests = [
    { guestId: 'S1', guestName: 'Sample Guest', attending: 'wedding-and-rehearsal', mealChoice: 'Salmon', dietaryRestrictions: '' },
    { guestId: 'S2', guestName: 'Sample Plusone', attending: 'yes', mealChoice: 'Chicken', dietaryRestrictions: 'No nuts' }
  ];
  var declined = [{ guestId: 'S1', guestName: 'Sample Guest', attending: 'no' }];
  var link = RSVP_PAGE_URL + '?code=sample';
  sendComposedEmail(me, composeEmail({ firstName: 'Sample', guests: guests, link: link }));
  sendComposedEmail(me, composeEmail({ firstName: 'Sample', guests: guests, songRequest: 'September by Earth, Wind & Fire',
    specialSong: 'At Last by Etta James', answeredOptional: true, link: link }));
  sendComposedEmail(me, composeEmail({ firstName: 'Sample', guests: declined, link: link }));
  sendComposedEmail(me, composeUpdateEmail({ firstName: 'Sample', guests: guests, link: link }));
  sendComposedEmail(me, composeUpdateEmail({ firstName: 'Sample', guests: declined, link: link }));
  sendComposedEmail(me, composeLinkEmail({ firstName: 'Sample', anyoneComing: true, link: link }));
  var counts = rsvpCounts();
  counts.change = { coming: 2, cant: 0 };
  var sample = buildCoupleEmail({ subject: '(Sample) New RSVP: Sample Guest’s party (2 coming)', heading: 'New RSVP', counts: counts,
    intro: 'Sample Guest just RSVPed for their party (' + nowLabel() + ').',
    rows: guestSummaryRows(guests) });
  sendComposedEmail(me, sample);
  sendComposedEmail(me, buildCoupleEmail({ subject: '(Sample) RSVP change: Sample Guest’s party', heading: 'RSVP change',
    intro: 'Sample Guest updated their party’s RSVP (' + nowLabel() + '). Here’s what changed:',
    rows: [['Sample Plusone', 'Dinner: Chicken → Salmon']],
    closing: 'Everything else stayed the same. Their full RSVP is in the Responses tab.' }));
}

/* ---------- GET: Look up an RSVP from an email link ---------- */
// Everything the Your RSVP page shows for the RSVP with this private code:
// each person's answers, the optional answers (songs, photos, map pin), and
// whether the deadlines for changes have passed.

function getRsvpByCode(code) {
  if (!code) return jsonResponse({ error: 'Missing code' });
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var rows = ss.getSheetByName(RESPONSE_SHEET).getDataRange().getValues();

  var partyId = null, submittedBy = null, answers = {};
  var songRequest = '', specialSong = '', photoIds = '';
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (r[CODE_COLUMN - 1] !== code) continue;
    partyId = r[1];          // B: partyId
    submittedBy = r[8];      // I: submittedBy
    answers[r[2]] = {        // C: guestId
      guestName: r[3], attending: r[4], mealChoice: r[5], dietaryRestrictions: r[6]
    };
    songRequest = songRequest || r[7];
    specialSong = specialSong || r[9];
    photoIds = photoIds || r[PHOTOS_COLUMN - 1];
  }
  if (!partyId) return jsonResponse({ error: 'Not found' });

  var guests = ss.getSheetByName(GUEST_SHEET).getDataRange().getValues();
  var members = [], partnershipStatus = '';
  for (var j = 1; j < guests.length; j++) {
    var row = guests[j];
    if (row[1] !== partyId) continue;
    if (row[0] === submittedBy) partnershipStatus = row[6] || '';
    var a = answers[row[0]];
    members.push({
      guestId: row[0],
      displayName: a ? a.guestName : row[2],
      relationship: String(row[3]).toLowerCase(),
      hasResponded: row[4] === true || String(row[4]).toUpperCase() === 'TRUE',
      rehearsalDinner: row[7] === true || String(row[7]).toUpperCase() === 'TRUE',
      inCode: !!a,
      attending: a ? a.attending : '',
      mealChoice: a ? a.mealChoice : '',
      dietaryRestrictions: a ? a.dietaryRestrictions : ''
    });
  }

  var photos = splitIds(photoIds).map(function (id) {
    return { id: id, url: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w400' };
  });
  var pin = pinForCode(code);
  var now = new Date();

  return jsonResponse({
    partyId: partyId,
    submittedBy: submittedBy,
    partnershipStatus: partnershipStatus,
    members: members,
    songRequest: songRequest,
    specialSong: specialSong,
    photos: photos,
    pin: pin ? { city: pin.city } : null,
    attendanceOpen: now < ATTENDANCE_DEADLINE,
    editsOpen: now < EDIT_DEADLINE
  });
}

function splitIds(value) {
  return String(value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

// The Responses rows for one RSVP: { rows (sheet values), rowNumbers: { guestId: row } }
function rowsForCode(sheet, code) {
  var values = sheet.getDataRange().getValues();
  var rowNumbers = {}, first = null;
  for (var i = 1; i < values.length; i++) {
    if (values[i][CODE_COLUMN - 1] !== code) continue;
    rowNumbers[values[i][2]] = i;
    if (first === null) first = i;
  }
  return { values: values, rowNumbers: rowNumbers, first: first };
}

/* ---------- POST: Change an RSVP (from the Your RSVP page) ---------- */
// Updates the RSVP's rows in the Responses tab (in place, so each guest
// still has one row). Only the fields sent are changed:
//   data: { code, guests: [{ guestId, attending, mealChoice,
//           dietaryRestrictions, guestName (for a +1) }], songRequest, specialSong }
// Switching between yes and no closes May 24; everything else July 14.
// Afterward, the guest gets an updated copy and Jenna & Liam get an email
// listing what changed.

function updateRsvp(data) {
  var code = String(data.code || '');
  if (!/^[a-f0-9]{16,64}$/.test(code)) return jsonResponse({ error: 'Bad code' });
  var now = new Date();
  if (now >= EDIT_DEADLINE) return jsonResponse({ error: 'closed' });

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(RESPONSE_SHEET);
  var guestSheet = ss.getSheetByName(GUEST_SHEET);
  var changes = [];          // [person, "Dinner: Chicken → Salmon"]
  var comingChange = 0, cantChange = 0, attendanceChanged = false;
  var info;

  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var found = rowsForCode(sheet, code);
    if (found.first === null) return jsonResponse({ error: 'Not found' });
    var values = found.values;

    (data.guests || []).forEach(function (g) {
      var i = found.rowNumbers[g.guestId];
      if (i === undefined) return;  // only people on this RSVP
      var row = values[i];
      var name = row[3];
      var personChanges = [];

      // A +1's name
      if (g.guestName && String(g.guestName).trim() && String(g.guestName).trim() !== String(row[3])) {
        var newName = String(g.guestName).trim().slice(0, 80);
        personChanges.push('Name: ' + row[3] + ' → ' + newName);
        sheet.getRange(i + 1, 4).setValue(newName);
        updatePlusOneName(guestSheet, g.guestId, newName);
        row[3] = newName;
        name = newName;
      }
      // Coming or not (until May 24)
      if (g.attending !== undefined && g.attending !== row[4] && now < ATTENDANCE_DEADLINE) {
        var wasComing = row[4] && row[4] !== 'no', nowComing = g.attending !== 'no';
        personChanges.push(attendingLabel(row[4]) + ' → ' + attendingLabel(g.attending));
        sheet.getRange(i + 1, 5).setValue(g.attending);
        comingChange += (nowComing ? 1 : 0) - (wasComing ? 1 : 0);
        cantChange += (g.attending === 'no' ? 1 : 0) - (row[4] === 'no' ? 1 : 0);
        attendanceChanged = true;
        row[4] = g.attending;
        if (!nowComing && row[5]) {  // no dinner for someone who isn't coming
          sheet.getRange(i + 1, 6).setValue('');
          row[5] = '';
        }
      }
      // Dinner and dietary notes
      if (g.mealChoice !== undefined && row[4] !== 'no' && String(g.mealChoice) !== String(row[5])) {
        personChanges.push('Dinner: ' + (row[5] || 'none') + ' → ' + (g.mealChoice || 'none'));
        sheet.getRange(i + 1, 6).setValue(g.mealChoice);
        row[5] = g.mealChoice;
      }
      if (g.dietaryRestrictions !== undefined && String(g.dietaryRestrictions) !== String(row[6])) {
        personChanges.push('Dietary notes: ' + (row[6] || 'none') + ' → ' + (g.dietaryRestrictions || 'none'));
        sheet.getRange(i + 1, 7).setValue(g.dietaryRestrictions);
        row[6] = g.dietaryRestrictions;
      }
      if (personChanges.length) changes.push([name, personChanges.join(' · ')]);
    });

    // Songs (saved on every row of the RSVP)
    var rowList = Object.keys(found.rowNumbers).map(function (k) { return found.rowNumbers[k]; });
    var firstRow = values[found.first];
    [['songRequest', 8, 7, 'Song requests'], ['specialSong', 10, 9, 'Special song']].forEach(function (f) {
      if (data[f[0]] === undefined) return;
      var current = '';
      rowList.forEach(function (i) { current = current || values[i][f[2]]; });
      var next = String(data[f[0]] || '').trim().slice(0, 500);
      if (next === String(current || '')) return;
      changes.push([f[3], (current || 'none') + ' → ' + (next || 'none')]);
      rowList.forEach(function (i) { sheet.getRange(i + 1, f[1]).setValue(next); values[i][f[2]] = next; });
    });
    SpreadsheetApp.flush();

    // What the emails need
    var guests = rowList.map(function (i) {
      var r = values[i];
      return { guestId: r[2], guestName: r[3], attending: r[4], mealChoice: r[5], dietaryRestrictions: r[6] };
    });
    var submitter = guests.filter(function (g) { return g.guestId === firstRow[8]; })[0] || guests[0];
    var song = '', special = '';
    rowList.forEach(function (i) { song = song || values[i][7]; special = special || values[i][9]; });
    info = { guests: guests, submitter: submitter, email: firstRow[10], songRequest: song, specialSong: special };
  } finally {
    lock.releaseLock();
  }

  if (!changes.length) return jsonResponse({ success: true, changed: false });

  // Updated copy for the guest, and the list of changes for Jenna & Liam.
  // (If an email fails, the changes are still saved.)
  var anyoneComing = info.guests.some(function (g) { return g.attending && g.attending !== 'no'; });
  try {
    if (info.email) {
      sendComposedEmail(info.email, composeUpdateEmail({
        firstName: String(info.submitter.guestName).split(' ')[0],
        guests: info.guests, songRequest: info.songRequest, specialSong: info.specialSong,
        link: RSVP_PAGE_URL + '?code=' + code
      }));
    }
  } catch (err) {
    console.error('Update email failed: ' + err);
  }
  try {
    var who = info.submitter.guestName;
    var size = info.guests.length;
    var counts = null;
    if (attendanceChanged) {
      counts = rsvpCounts();
      counts.change = { coming: comingChange, cant: cantChange };
    }
    var allCant = attendanceChanged && !anyoneComing;
    notifyCouple(buildCoupleEmail({
      subject: 'RSVP change: ' + partyLabel(who, size) + (allCant ? ' can’t make it' : ''),
      heading: 'RSVP change',
      counts: counts,
      intro: allCant
        ? who + ' changed ' + (size > 1 ? 'their party’s RSVP' : 'their RSVP') + ' to can’t make it (' + nowLabel() + ').'
        : who + ' updated ' + (size > 1 ? 'their party’s RSVP' : 'their RSVP') + ' (' + nowLabel() + '). Here’s what changed:',
      rows: changes,
      closing: allCant
        ? 'That’s ' + Math.abs(comingChange) + ' fewer ' + (Math.abs(comingChange) === 1 ? 'guest' : 'guests') + '.'
        : 'Everything else stayed the same. Their full RSVP is in the Responses tab.'
    }));
  } catch (err) {
    console.error('Change notification failed: ' + err);
  }
  return jsonResponse({ success: true, changed: true });
}

// When a +1's name changes, update it on the GuestList tab too
function updatePlusOneName(guestSheet, guestId, name) {
  var data = guestSheet.getDataRange().getValues();
  for (var j = 1; j < data.length; j++) {
    if (data[j][0] === guestId) {
      if (String(data[j][3]).toLowerCase() === 'plusone') guestSheet.getRange(j + 1, 3).setValue(name);
      return;
    }
  }
}

/* ---------- Already RSVPed: email them a private link ---------- */

// The latest RSVP row for a guest that has an email address on it
function latestRsvpRowFor(values, guestId) {
  for (var i = values.length - 1; i >= 1; i--) {
    if (values[i][2] === guestId && values[i][10] && values[i][CODE_COLUMN - 1]) return values[i];
  }
  return null;
}

// "m••••@gmail.com", so guests know which inbox to check without the page
// showing the whole address
function maskEmail(email) {
  var parts = String(email).split('@');
  if (parts.length !== 2) return '';
  return parts[0].charAt(0) + '••••@' + parts[1];
}

// GET: which email address the link would go to (partly hidden)
function rsvpLinkHint(guestId) {
  var values = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RESPONSE_SHEET).getDataRange().getValues();
  var row = latestRsvpRowFor(values, guestId);
  if (!row) return jsonResponse({ error: 'no-email' });
  return jsonResponse({ masked: maskEmail(row[10]) });
}

// POST: email the link (to the address used for their RSVP). Limited to a
// few times an hour per guest, so it can't be used to flood anyone's inbox.
function sendRsvpLink(data) {
  var guestId = String(data.guestId || '');
  var cache = CacheService.getScriptCache();
  var key = 'rsvplink_' + guestId;
  var sent = Number(cache.get(key) || 0);
  if (sent >= 3) return jsonResponse({ error: 'too-many' });
  cache.put(key, String(sent + 1), 3600);

  var values = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RESPONSE_SHEET).getDataRange().getValues();
  var row = latestRsvpRowFor(values, guestId);
  if (!row) return jsonResponse({ error: 'no-email' });
  var code = row[CODE_COLUMN - 1];
  // Say hi to whoever owns the inbox (the person who submitted the RSVP)
  var firstName = '', anyoneComing = false;
  for (var i = 1; i < values.length; i++) {
    if (values[i][CODE_COLUMN - 1] !== code) continue;
    if (values[i][2] === row[8]) firstName = String(values[i][3]).split(' ')[0];
    if (values[i][4] && values[i][4] !== 'no') anyoneComing = true;
  }
  sendComposedEmail(row[10], composeLinkEmail({ firstName: firstName, anyoneComing: anyoneComing, link: RSVP_PAGE_URL + '?code=' + code }));
  return jsonResponse({ success: true });
}

/* ---------- POST: Submit Optional Answers (part 2 of the form) ---------- */
// The RSVP is saved first (part 1). If guests answer the optional music
// questions afterward, this fills in the song columns on their most recent
// rows in the Responses tab, so everything stays in one place.
//   data: { partyId, guestIds: [...], songRequest, specialSong }
// Blank answers are ignored, so they never erase something already saved.

function submitExtras(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var responseSheet = ss.getSheetByName(RESPONSE_SHEET);
  var rows = responseSheet.getDataRange().getValues();
  var guestIds = data.guestIds || [];

  for (var g = 0; g < guestIds.length; g++) {
    // Find this guest's most recent response row (search from the bottom)
    for (var r = rows.length - 1; r >= 1; r--) {
      if (rows[r][2] === guestIds[g] && rows[r][1] === data.partyId) {   // C: guestId, B: partyId
        if (data.songRequest) responseSheet.getRange(r + 1, 8).setValue(data.songRequest);   // H: songRequest
        if (data.specialSong) responseSheet.getRange(r + 1, 10).setValue(data.specialSong);  // J: specialSong
        break;
      }
    }
  }

  return jsonResponse({ success: true });
}

/* ---------- POST: Upload Photo ---------- */
// With the RSVP's code, the photo is named after the guest (like
// "Morgan Lee 2.jpg", so you can tell who sent what in Drive) and saved to
// their RSVP, so they can see and remove it on their Your RSVP page.

function uploadPhoto(data) {
  var folder = DriveApp.getFolderById(PHOTO_FOLDER_ID);
  var decoded = Utilities.base64Decode(data.base64Data);
  var code = /^[a-f0-9]{16,64}$/.test(data.code || '') ? data.code : '';
  var sheet = code ? SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RESPONSE_SHEET) : null;
  var found = code ? rowsForCode(sheet, code) : null;
  if (found && found.first === null) found = null;

  var fileName = data.fileName;
  if (found) {
    var first = found.values[found.first];
    var name = String(first[3]);
    for (var k in found.rowNumbers) {
      if (k === first[8]) name = String(found.values[found.rowNumbers[k]][3]);  // the person who RSVPed
    }
    var ext = (String(data.fileName).match(/\.[A-Za-z0-9]+$/) || ['.jpg'])[0];
    fileName = name + ' ' + (splitIds(first[PHOTOS_COLUMN - 1]).length + 1) + ext;
  }
  var file = folder.createFile(Utilities.newBlob(decoded, data.mimeType, fileName));
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);  // so thumbnails show
  } catch (e) {}

  if (found) {
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var cell = sheet.getRange(found.first + 1, PHOTOS_COLUMN);
      var ids = splitIds(cell.getValue());
      ids.push(file.getId());
      cell.setValue(ids.join(','));
      if (!sheet.getRange(1, PHOTOS_COLUMN).getValue()) sheet.getRange(1, PHOTOS_COLUMN).setValue('photoIds');
    } finally {
      lock.releaseLock();
    }
  }

  return jsonResponse({
    success: true,
    fileId: file.getId(),
    fileUrl: file.getUrl()
  });
}

// POST: remove one of the guest's photos (moved to Drive's trash, so it can
// still be recovered). Only photos saved to this RSVP can be removed.
function removePhoto(data) {
  var code = String(data.code || '');
  if (!/^[a-f0-9]{16,64}$/.test(code)) return jsonResponse({ error: 'Bad code' });
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RESPONSE_SHEET);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var found = rowsForCode(sheet, code);
    if (found.first === null) return jsonResponse({ error: 'Not found' });
    var cell = sheet.getRange(found.first + 1, PHOTOS_COLUMN);
    var ids = splitIds(cell.getValue());
    if (ids.indexOf(data.fileId) === -1) return jsonResponse({ error: 'Not found' });
    try {
      DriveApp.getFileById(data.fileId).setTrashed(true);
    } catch (e) {}
    cell.setValue(ids.filter(function (id) { return id !== data.fileId; }).join(','));
  } finally {
    lock.releaseLock();
  }
  return jsonResponse({ success: true });
}

/* ---------- Guest map pins ---------- */
// (Moved here from the separate "Guest pins" project, so a pin can be linked
// to the RSVP that added it.) Pins can only be removed by:
//   - the guest, from their Your RSVP page (using their RSVP's code), or
//   - the browser that just added it (the Undo button), using a private key
//     only that browser was given.

function pinsSheet() {
  return SpreadsheetApp.openById(PINS_SPREADSHEET_ID).getSheetByName(PINS_SHEET);
}

// GET: all pins for the map (no codes or keys)
function getPins() {
  var data = pinsSheet().getDataRange().getValues();
  var pins = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row[1] && row[2] && row[3]) {
      pins.push({ name: row[1], lat: row[2], lng: row[3], pinId: row[4], city: row[7] || '' });
    }
  }
  return jsonResponse({ pins: pins });
}

// The pin linked to an RSVP (or null)
function pinForCode(code) {
  if (!code) return null;
  try {
    var data = pinsSheet().getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][5] === code) return { pinId: data[i][4], city: data[i][7] || '' };
    }
  } catch (e) {}
  return null;
}

// GET: add a pin. With an RSVP code, it replaces that RSVP's old pin (that's
// how "Move" works). Returns a private key the page can use to undo it.
function addPin(params) {
  var lat = parseFloat(params.lat), lng = parseFloat(params.lng);
  var name = String(params.name || '').trim().slice(0, 80);
  if (!name || isNaN(lat) || isNaN(lng)) return jsonResponse({ error: 'Missing details' });
  var code = /^[a-f0-9]{16,64}$/.test(params.code || '') ? params.code : '';
  var pinId = /^[a-z0-9_]{6,60}$/.test(params.pinId || '') ? params.pinId
    : 'pin_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9);
  var key = Utilities.getUuid().replace(/-/g, '');
  var sheet = pinsSheet();

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = sheet.getDataRange().getValues();
    // The same pin sent twice (a slow connection): just answer again
    for (var i = 1; i < data.length; i++) {
      if (data[i][4] === pinId) return jsonResponse({ success: true, pinId: pinId, removeKey: data[i][6] });
    }
    // Moving: take away this RSVP's old pin
    if (code) {
      for (var j = data.length - 1; j >= 1; j--) {
        if (data[j][5] === code) sheet.deleteRow(j + 1);
      }
    }
    sheet.appendRow([new Date(), name, lat, lng, pinId, code, key, String(params.city || '').slice(0, 80)]);
    if (!sheet.getRange(1, 6).getValue()) {  // label the new columns once
      sheet.getRange(1, 6, 1, 3).setValues([['rsvpCode', 'removeKey', 'city']]);
    }
  } finally {
    lock.releaseLock();
  }
  return jsonResponse({ success: true, pinId: pinId, removeKey: key });
}

// GET: remove a pin, with either its private key (Undo) or the RSVP's code
// (Your RSVP page)
function removePin(params) {
  var code = /^[a-f0-9]{16,64}$/.test(params.code || '') ? params.code : '';
  var key = String(params.key || '');
  if (!code && !key) return jsonResponse({ error: 'Not allowed' });
  var sheet = pinsSheet();
  var removed = 0;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      var match = code ? data[i][5] === code : (data[i][4] === params.pinId && data[i][6] && data[i][6] === key);
      if (match) {
        sheet.deleteRow(i + 1);
        removed++;
      }
    }
  } finally {
    lock.releaseLock();
  }
  return jsonResponse(removed ? { success: true } : { error: 'Pin not found' });
}

/* ---------- GET: Get Confirmed Attendees ---------- */

function getAttendees(excludeParty) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var responseSheet = ss.getSheetByName(RESPONSE_SHEET);
  var guestSheet = ss.getSheetByName(GUEST_SHEET);
  var responseData = responseSheet.getDataRange().getValues();
  var guestData = guestSheet.getDataRange().getValues();

  // Collect guestIds that are attending from Responses sheet.
  // New answers are added as new rows at the bottom, so going top to bottom,
  // each guest's latest row wins (if someone says yes, then later changes
  // to no, they come off the list).
  var attendingIds = {};
  for (var i = 1; i < responseData.length; i++) {
    var guestId = responseData[i][2];    // Column C: guestId
    var attending = responseData[i][4];  // Column E: attending
    var val = String(attending).toLowerCase();
    attendingIds[guestId] = (val === 'yes' || val === 'wedding-and-rehearsal' || val === 'wedding-only');
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
    // Extract last name for alphabetical sorting
    var nameParts = String(displayName).trim().split(' ');
    var lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
    partyMap[partyId].members.push({ name: displayName, sortOrder: sortOrder, lastName: lastName.toLowerCase() });
  }

  // Group parties by side
  var bride = [];
  var groom = [];
  var partyIds = Object.keys(partyMap);
  for (var k = 0; k < partyIds.length; k++) {
    var party = partyMap[partyIds[k]];
    // Sort members within party: adults first, then children — alphabetical by last name within each group
    party.members.sort(function (a, b) {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.lastName < b.lastName ? -1 : (a.lastName > b.lastName ? 1 : 0);
    });
    var names = [];
    for (var n = 0; n < party.members.length; n++) {
      names.push(party.members[n].name);
    }
    // Use the first adult's last name for sorting parties against each other
    var partyLastName = party.members[0] ? party.members[0].lastName : '';
    var entry = { partyId: partyIds[k], names: names, sortName: partyLastName };
    if (party.side === 'groom') {
      groom.push(entry);
    } else {
      bride.push(entry);
    }
  }

  // Sort parties alphabetically by last name
  bride.sort(function (a, b) { return a.sortName < b.sortName ? -1 : (a.sortName > b.sortName ? 1 : 0); });
  groom.sort(function (a, b) { return a.sortName < b.sortName ? -1 : (a.sortName > b.sortName ? 1 : 0); });

  return jsonResponse({ bride: bride, groom: groom });
}

/* ---------- GET: Get Guest Photos ---------- */

function getPhotos() {
  var folder = DriveApp.getFolderById(PHOTO_FOLDER_ID);
  var files = folder.getFiles();
  var photos = [];

  while (files.hasNext()) {
    var file = files.next();
    var mimeType = file.getMimeType();

    // Only include image files
    if (mimeType.indexOf('image/') === 0) {
      // Make the file viewable by anyone with the link (if not already)
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (e) {
        // File might already be shared or we might not have permission
      }

      photos.push({
        id: file.getId(),
        name: file.getName(),
        // "thumbnail" format loads reliably in <img>; "uc?export=view" often does not.
        url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1600',
        dateCreated: file.getDateCreated().toISOString()
      });
    }
  }

  // Sort by date created (newest first)
  photos.sort(function(a, b) {
    return new Date(b.dateCreated) - new Date(a.dateCreated);
  });

  return jsonResponse({ photos: photos });
}

/* ---------- GET: Registry Items ---------- */

// How long fetched product metadata stays fresh before re-checking (hours),
// and how many product pages we'll fetch during a single request (keeps the
// registry loading fast; any remaining stale items refresh on later visits).
var META_CACHE_HOURS = 24;
var META_FETCHES_PER_CALL = 5;

function getRegistry() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(REGISTRY_SHEET);
  if (!sheet) return jsonResponse({ items: [] });

  var data = sheet.getDataRange().getValues();
  var items = [];
  var fetchesDone = 0;
  var now = new Date().getTime();

  // Row 0 = headers.
  // A id | B name | C description | D link | E image | F price | G reserved
  // H–L (auto-managed): fetched title, description, image, price, fetched-at
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var id = row[0];
    var link = String(row[3] || '').trim();
    if (!id) continue;  // skip blank rows

    var metaName = String(row[7] || '');
    var metaDesc = String(row[8] || '');
    var metaImage = String(row[9] || '');
    var metaPrice = String(row[10] || '');
    var fetchedAt = row[11] ? new Date(row[11]).getTime() : 0;

    // Re-fetch stale metadata so titles and prices track the merchant's page
    var isStale = !fetchedAt || (now - fetchedAt) > META_CACHE_HOURS * 3600 * 1000;
    if (link && isStale && fetchesDone < META_FETCHES_PER_CALL) {
      var meta = fetchProductMeta(link);
      fetchesDone++;
      // Keep previous values if a fetch comes back empty (page blocked/down)
      metaName = meta.title || metaName;
      metaDesc = meta.description || metaDesc;
      metaImage = meta.image || metaImage;
      metaPrice = meta.price || metaPrice;
      sheet.getRange(i + 1, 8, 1, 5)
        .setValues([[metaName, metaDesc, metaImage, metaPrice, new Date()]]);
    }

    // Sheet columns B/C/E/F act as overrides; fetched metadata fills the gaps
    items.push({
      id: String(id),
      name: String(row[1] || '').trim() || metaName || 'Gift',
      description: String(row[2] || '').trim() || metaDesc,
      link: link,
      image: String(row[4] || '').trim() || metaImage,
      price: String(row[5] || '').trim() || metaPrice,
      reserved: row[6] === true || String(row[6]).toLowerCase() === 'yes' ||
                String(row[6]).toLowerCase() === 'true'
    });
  }

  return jsonResponse({ items: items });
}

// Fetch a product page and pull its title, description, preview image, and
// price from standard tags (Open Graph, JSON-LD). Some stores (notably
// Amazon) block automated fetches — use the override columns for those.
function fetchProductMeta(url) {
  var meta = { title: '', description: '', image: '', price: '' };
  try {
    var res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WeddingRegistryBot/1.0)' }
    });
    if (res.getResponseCode() >= 400) return meta;
    var html = res.getContentText();

    meta.title = decodeEntities(matchMeta(html, 'og:title') || matchTag(html, 'title'));
    meta.description = decodeEntities(matchMeta(html, 'og:description') ||
                                      matchNameMeta(html, 'description'));
    meta.image = matchMeta(html, 'og:image');

    // Price: Open Graph / product tags first, then JSON-LD "price"
    var amount = matchMeta(html, 'og:price:amount') ||
                 matchMeta(html, 'product:price:amount');
    if (!amount) {
      var ld = html.match(/"price"\s*:\s*"?([0-9][0-9.,]*)"?/);
      if (ld) amount = ld[1];
    }
    if (amount) {
      var num = parseFloat(String(amount).replace(/,/g, ''));
      if (!isNaN(num) && num > 0) {
        meta.price = '$' + (num % 1 === 0 ? num.toFixed(0) : num.toFixed(2));
      }
    }

    // Keep descriptions card-sized
    if (meta.description.length > 220) {
      meta.description = meta.description.slice(0, 217) + '…';
    }
  } catch (e) {
    // Return whatever we managed to collect
  }
  return meta;
}

// <meta property="og:x" content="..."> in either attribute order
function matchMeta(html, property) {
  var m = html.match(new RegExp('<meta[^>]+property=["\']' + property + '["\'][^>]+content=["\']([^"\']+)["\']', 'i')) ||
          html.match(new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']' + property + '["\']', 'i'));
  return m ? m[1] : '';
}

// <meta name="description" content="...">
function matchNameMeta(html, name) {
  var m = html.match(new RegExp('<meta[^>]+name=["\']' + name + '["\'][^>]+content=["\']([^"\']+)["\']', 'i')) ||
          html.match(new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']' + name + '["\']', 'i'));
  return m ? m[1] : '';
}

// <title>...</title>
function matchTag(html, tag) {
  var m = html.match(new RegExp('<' + tag + '[^>]*>([^<]+)</' + tag + '>', 'i'));
  return m ? m[1].trim() : '';
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
}

/* ---------- POST: Mark Registry Item Purchased ---------- */

function markPurchased(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(REGISTRY_SHEET);
  if (!sheet) return jsonResponse({ success: false, error: 'No registry sheet' });

  var rows = sheet.getDataRange().getValues();
  var itemName = '';
  var found = false;

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.itemId)) {
      // Guard against a double-purchase race: reject if already reserved
      var already = rows[i][6] === true ||
                    String(rows[i][6]).toLowerCase() === 'yes' ||
                    String(rows[i][6]).toLowerCase() === 'true';
      if (already) {
        return jsonResponse({ success: false, error: 'already-reserved' });
      }
      // Use the override name if set, else the fetched product title
      itemName = String(rows[i][1] || rows[i][7] || '');
      sheet.getRange(i + 1, 7).setValue('yes');  // column G = reserved
      found = true;
      break;
    }
  }

  if (!found) return jsonResponse({ success: false, error: 'item-not-found' });

  // Record the purchase for thank-you notes
  var purchases = ss.getSheetByName(PURCHASES_SHEET);
  if (!purchases) {
    purchases = ss.insertSheet(PURCHASES_SHEET);
    purchases.appendRow(['Timestamp', 'Item ID', 'Item', 'Name', 'Email', 'Note']);
  }
  purchases.appendRow([
    new Date(),
    String(data.itemId),
    itemName,
    String(data.buyerName || ''),
    String(data.buyerEmail || ''),
    String(data.note || '')
  ]);

  return jsonResponse({ success: true });
}

/* ---------- POST: Record a Charitable Donation ---------- */

function recordDonation(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(DONATIONS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(DONATIONS_SHEET);
    sheet.appendRow(['Timestamp', 'Charity', 'Name', 'Amount', 'Note']);
  }
  sheet.appendRow([
    new Date(),
    String(data.charity || ''),
    String(data.name || ''),
    String(data.amount || ''),
    String(data.note || '')
  ]);

  return jsonResponse({ success: true });
}

/* ---------- Utility ---------- */

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
