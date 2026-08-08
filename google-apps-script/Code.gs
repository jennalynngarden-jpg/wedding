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
      data.submittedBy,
      data.specialSong || '',  // Column J: special song (for married/partnered guests)
      data.email || ''         // Column K: email address
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
    var val = String(attending).toLowerCase();
    if (val === 'yes' || val === 'wedding-and-rehearsal' || val === 'wedding-only') {
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
