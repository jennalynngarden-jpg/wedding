/* ============================================
   Wedding RSVP - Google Apps Script Backend
   ============================================

   SETUP INSTRUCTIONS:
   1. Create a Google Spreadsheet with two sheets (tabs):
      - "GuestList" with columns: guestId, partyId, displayName, relationship, hasResponded
      - "Responses" with columns: timestamp, partyId, guestId, guestName, attending, mealChoice, dietaryRestrictions, songRequest, submittedBy, specialSong, email
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

// Writes the email for one RSVP. Returns { subject, text, html }.
//   info: { firstName, guests: [{ guestName, attending, mealChoice,
//           dietaryRestrictions }], songRequest, specialSong,
//           finishedExtras, link }
// Three versions:
//   - Coming, optional questions finished: summary only
//   - Coming, optional questions not finished: summary + "Answer optional questions"
//   - Not coming: short note + "Update your RSVP"
function composeEmail(info) {
  var coming = info.guests.some(function (g) { return g.attending && g.attending !== 'no'; });
  var hello = info.firstName ? 'Hi ' + info.firstName + ',' : 'Hi there,';
  var subject = 'Your RSVP to Jenna and Liam’s wedding';
  var paragraphs, closing, buttonText = '', afterButton = '';
  var summaryText = '';
  var summaryHtml = '';

  function addRow(title, details) {
    summaryText += '\n  ' + title + ': ' + details;
    // Sizes are set right on the cell: some email apps (like Apple Mail)
    // don't pass the email's text size into tables, so they came out small
    summaryHtml += '<tr><td style="padding:10px 0;border-bottom:1px solid #e8e4df;font-size:16px;line-height:1.5;">' +
      '<strong style="color:#2c3e2d;font-size:16px;">' + escapeHtml(title) + '</strong><br>' +
      '<span style="color:#6b6b6b;font-size:16px;">' + escapeHtml(details) + '</span></td></tr>';
  }

  if (coming) {
    paragraphs = ['Thanks for RSVPing! Here’s what we have for you:'];
    info.guests.forEach(function (g) {
      var details = [attendingLabel(g.attending)];
      if (g.mealChoice) details.push(g.mealChoice);
      if (g.dietaryRestrictions) details.push('Dietary notes: ' + g.dietaryRestrictions);
      addRow(g.guestName, details.join(' · '));
    });
    if (info.specialSong) addRow('Your special song', info.specialSong);
    if (info.songRequest) addRow('Your song requests', info.songRequest);

    if (info.finishedExtras) {
      closing = 'Need to change anything? Just reply to this email.';
    } else {
      closing = 'Didn’t get to our optional questions about music, photos, and where you’re ' +
        'traveling from? You can answer them anytime with the button below.';
      buttonText = 'Answer optional questions';
      afterButton = 'Need to change anything else? Just reply to this email.';
    }
  } else {
    paragraphs = ['Thanks for letting us know you can’t make it. We’ll miss you, and we’re grateful for your love and friendship!'];
    closing = 'If your plans change, you can update your RSVP anytime before May 24, 2027.';
    buttonText = 'Update your RSVP';
  }

  // Plain-text version (for email apps that don't show formatting)
  var text = hello + '\n\n' + paragraphs.join('\n\n') + summaryText + '\n\n' + closing +
    (buttonText ? '\n' + buttonText + ': ' + info.link : '') +
    (afterButton ? '\n\n' + afterButton : '') + '\n\nLove,\nJenna & Liam';

  // Formatted version, in the website's colors and fonts
  var button = buttonText
    ? '<p style="text-align:center;margin:24px 0;">' +
        '<a href="' + info.link + '" style="background:#2c3e2d;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:13px;letter-spacing:1px;text-transform:uppercase;display:inline-block;">' +
        escapeHtml(buttonText) + '</a></p>'
    : '';
  var html =
    '<div style="background:#ffffff;padding:24px 16px;font-family:Helvetica,Arial,sans-serif;color:#3a3a3a;font-size:15px;line-height:1.6;">' +
      '<div style="max-width:520px;margin:0 auto;">' +
        // The oak crest from the website, above our names
        '<p style="text-align:center;margin:0 0 12px;">' +
          '<img src="' + EMAIL_CREST_URL + '" width="160" alt="" style="width:160px;max-width:60%;height:auto;border:0;"></p>' +
        '<p style="font-family:Georgia,serif;font-size:22px;color:#2c3e2d;text-align:center;margin:0 0 4px;">Jenna &amp; Liam</p>' +
        '<p style="text-align:center;color:#6b6b6b;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin:0 0 28px;">July 24, 2027 &middot; Monterey, California</p>' +
        '<p>' + escapeHtml(hello) + '</p>' +
        paragraphs.map(function (p) { return '<p>' + escapeHtml(p) + '</p>'; }).join('') +
        (summaryHtml ? '<table style="width:100%;border-collapse:collapse;margin:8px 0 20px;">' + summaryHtml + '</table>' : '') +
        '<p>' + escapeHtml(closing) + '</p>' +
        button +
        (afterButton ? '<p>' + escapeHtml(afterButton) + '</p>' : '') +
        '<p>Love,<br>Jenna &amp; Liam</p>' +
      '</div>' +
    '</div>';

  return { subject: subject, text: text, html: html };
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
    var rowNumbers = [], guests = [], info = { songRequest: '', specialSong: '', email: '', submittedBy: '' };

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
//   3. sends you all three sample emails to check the wording and design.
function setUpEmails() {
  var hasTimer = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'sendPendingEmails';
  });
  if (!hasTimer) {
    ScriptApp.newTrigger('sendPendingEmails').timeBased().everyMinutes(10).create();
  }

  var me = Session.getActiveUser().getEmail();
  var guests = [
    { guestId: 'S1', guestName: 'Sample Guest', attending: 'wedding-and-rehearsal', mealChoice: 'Salmon', dietaryRestrictions: '' },
    { guestId: 'S2', guestName: 'Sample Plusone', attending: 'yes', mealChoice: 'Chicken', dietaryRestrictions: 'No nuts' }
  ];
  var link = RSVP_PAGE_URL + '?code=sample';
  sendComposedEmail(me, composeEmail({ firstName: 'Sample', guests: guests, finishedExtras: false, link: link }));
  sendComposedEmail(me, composeEmail({ firstName: 'Sample', guests: guests, songRequest: 'September by Earth, Wind & Fire',
    specialSong: 'At Last by Etta James', finishedExtras: true, link: link }));
  sendComposedEmail(me, composeEmail({ firstName: 'Sample',
    guests: [{ guestId: 'S1', guestName: 'Sample Guest', attending: 'no' }], link: link }));
}

/* ---------- GET: Look up an RSVP from an email link ---------- */
// Returns the party for the RSVP with this code, marking which guests were
// part of it (inCode) and what they answered, so the page can either open
// the optional questions (if anyone's coming) or let a "can't make it"
// party update their RSVP.

function getRsvpByCode(code) {
  if (!code) return jsonResponse({ error: 'Missing code' });
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var rows = ss.getSheetByName(RESPONSE_SHEET).getDataRange().getValues();

  var partyId = null, submittedBy = null, answers = {};
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][CODE_COLUMN - 1] === code) {
      partyId = rows[i][1];          // B: partyId
      submittedBy = rows[i][8];      // I: submittedBy
      answers[rows[i][2]] = rows[i][4];  // C: guestId -> E: attending
    }
  }
  if (!partyId) return jsonResponse({ error: 'Not found' });

  var guests = ss.getSheetByName(GUEST_SHEET).getDataRange().getValues();
  var members = [], partnershipStatus = '';
  for (var j = 1; j < guests.length; j++) {
    var row = guests[j];
    if (row[1] !== partyId) continue;
    if (row[0] === submittedBy) partnershipStatus = row[6] || '';
    members.push({
      guestId: row[0],
      displayName: row[2],
      relationship: String(row[3]).toLowerCase(),
      hasResponded: row[4] === true || String(row[4]).toUpperCase() === 'TRUE',
      rehearsalDinner: row[7] === true || String(row[7]).toUpperCase() === 'TRUE',
      inCode: answers.hasOwnProperty(row[0]),
      attending: answers[row[0]] || ''
    });
  }

  return jsonResponse({ partyId: partyId, submittedBy: submittedBy, partnershipStatus: partnershipStatus, members: members });
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
