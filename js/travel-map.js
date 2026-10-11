/* ========================================
   Travel Page – Interactive Map
   Uses Leaflet + OpenStreetMap (free, no API key needed)
   ======================================== */

document.addEventListener('DOMContentLoaded', function () {
  var mapEl = document.getElementById('travel-map');
  if (!mapEl) return; // only run on the travel page

  /* ---------- Configuration ---------- */
  // Replace this URL with your deployed Google Apps Script URL for guest pins
  var GUEST_PINS_URL = 'https://script.google.com/macros/s/AKfycbwcPHnrg7AyTR5IzPS68qymBvdGhGmjhLH5Ya6qERwNAXL9fleY4Y-0EVhw5b1mKF2cbg/exec';

  /* ---------- Location data ----------
     Each entry has a name, category, coordinates, address, and drive time
     to the venue. Edit these if any info changes. */
  var locations = [
    {
      name: 'Fairview Laguna Seca',
      category: 'event',
      lat: 36.5714,
      lng: -121.7904,
      address: '10520 York Road, Monterey, CA 93940',
      distance: 'Wedding Ceremony & Reception'
    },
    {
      name: 'Hotel Pacific',
      category: 'hotel',
      lat: 36.6013,
      lng: -121.8956,
      address: '300 Pacific Street, Monterey',
      distance: '~15 min drive to venue'
    },
    {
      name: 'Portola Hotel & Spa',
      category: 'hotel',
      lat: 36.6016,
      lng: -121.8945,
      address: 'Two Portola Plaza, Monterey',
      distance: '~15 min drive to venue'
    },
    {
      name: 'Monterey Plaza Hotel',
      category: 'hotel',
      lat: 36.6121,
      lng: -121.8982,
      address: '400 Cannery Row, Monterey',
      distance: '~20 min drive to venue'
    },
    {
      name: 'InterContinental The Clement',
      category: 'hotel',
      lat: 36.6170,
      lng: -121.9009,
      address: '750 Cannery Row, Monterey',
      distance: '~20 min drive to venue'
    },
    {
      name: 'Hyatt Regency Monterey',
      category: 'hotel',
      lat: 36.5917,
      lng: -121.8770,
      address: '1 Old Golf Course Rd, Monterey',
      distance: '~15 min drive to venue'
    },
    {
      name: 'Monterey Regional Airport (MRY)',
      category: 'airport',
      lat: 36.5870,
      lng: -121.8430,
      address: '200 Fred Kane Dr, Monterey',
      distance: '~20 min drive to Monterey'
    },
    {
      name: 'San Jose International (SJC)',
      category: 'airport',
      lat: 37.3639,
      lng: -121.9289,
      address: 'San Jose, CA',
      distance: '~1.5 hrs drive to Monterey'
    },
    {
      name: 'San Francisco International (SFO)',
      category: 'airport',
      lat: 37.6165,
      lng: -122.3905,
      address: 'San Francisco, CA',
      distance: '~2 hrs drive to Monterey'
    },
    {
      name: 'The Fish Hopper',
      category: 'event',
      lat: 36.6164,
      lng: -121.8999,
      address: '700 Cannery Row, Monterey',
      distance: 'Rehearsal Dinner'
    },
    {
      name: "Gianni's Pizza",
      category: 'event',
      lat: 36.6149,
      lng: -121.9032,
      address: '725 Lighthouse Ave, Monterey',
      distance: 'Welcome Dinner'
    },
    {
      name: "Lover's Point Park",
      category: 'event',
      lat: 36.6234,
      lng: -121.9067,
      address: '631 Ocean View Blvd, Pacific Grove',
      distance: 'Park Day'
    }
  ];

  /* ---------- Marker colors by category ---------- */
  var markerColors = {
    hotel:   '#7a9a6d', // sage green
    airport: '#b8a88a', // warm gold
    event:   '#2c3e2d', // dark green
    guest:   '#d4a5a5'  // coral/pink for guest pins
  };

  var markerSizes = {
    hotel:   12,
    airport: 12,
    event:   12,
    guest:   12
  };

  /* Create a small circle marker icon */
  function createIcon(category) {
    var size = markerSizes[category];
    var color = markerColors[category];
    return L.divIcon({
      className: 'map-marker',
      html: '<div style="' +
        'width:' + size + 'px;' +
        'height:' + size + 'px;' +
        'background:' + color + ';' +
        'border:2px solid #fff;' +
        'border-radius:50%;' +
        'box-shadow:0 1px 4px rgba(0,0,0,0.3);' +
      '"></div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -(size / 2 + 2)]
    });
  }

  /* ---------- Build the popup HTML for each pin ---------- */
  function popupContent(loc) {
    var html = '<strong>' + loc.name + '</strong>' +
               '<span class="map-address">' + loc.address + '</span>';
    if (loc.distance) {
      html += '<span class="map-distance">' + loc.distance + '</span>';
    }
    return html;
  }

  /* Build popup content for guest pins */
  function guestPopupContent(name, city, pinId) {
    var tagline = city ? 'Traveling from ' + city : 'Traveling from here!';
    return '<div class="guest-popup">' +
           '<strong>' + name + '</strong>' +
           '<span class="guest-tagline">' + tagline + '</span>' +
           '<button class="guest-remove-btn" data-pin-id="' + pinId + '">Remove pin</button>' +
           '</div>';
  }

  /* Look up city name from coordinates using OpenStreetMap's Nominatim */
  function getCityFromCoords(lat, lng, callback) {
    var url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&zoom=10';

    fetch(url, {
      headers: { 'Accept-Language': 'en' }
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        console.log('Nominatim response:', data);
        var city = '';
        if (data.address) {
          // Try to get the most relevant location name
          city = data.address.city ||
                 data.address.town ||
                 data.address.village ||
                 data.address.municipality ||
                 data.address.county ||
                 data.address.state ||
                 '';
          console.log('Found city:', city);
        }
        callback(city);
      })
      .catch(function (err) {
        console.error('Geocoding error:', err);
        callback('');
      });
  }

  /* ---------- Set up the map ---------- */
  var map = L.map('travel-map', {
    scrollWheelZoom: false // don't hijack page scrolling
  }).setView([36.5900, -121.8500], 12);

  // Esri "Light Gray Canvas" tiles: clean, minimalist style, free for low
  // traffic and NO API key required (CARTO's free basemaps now watermark tiles
  // with "API KEY REQUIRED"). The base is the gray map; a second layer adds the
  // place labels/roads on top so towns stay readable.
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 16
  }).addTo(map);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 16,
    pane: 'overlayPane'
  }).addTo(map);

  /* ---------- Create layer groups (one per category) ---------- */
  var layerGroups = {
    hotel:   L.layerGroup().addTo(map),
    airport: L.layerGroup().addTo(map),
    event:   L.layerGroup().addTo(map),
    guest:   L.layerGroup() // NOT added by default
  };

  // Add each location as a marker in its category's layer group
  locations.forEach(function (loc) {
    var marker = L.marker([loc.lat, loc.lng], { icon: createIcon(loc.category) });
    marker.bindTooltip(popupContent(loc), { direction: 'top', offset: [0, -8] });
    layerGroups[loc.category].addLayer(marker);
  });

  /* ---------- Filter buttons ---------- */
  var filterBtns = document.querySelectorAll('.map-filter-btn');
  var activeCategories = { hotel: true, airport: true, event: true, guest: false };

  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var category = btn.getAttribute('data-category');

      if (category === 'guest') {
        // "Our guests" is exclusive - turn off all others when selected
        var guestWasOn = activeCategories.guest;
        activeCategories.guest = !guestWasOn;
        if (!guestWasOn) {
          // Turning guest on, turn others off
          activeCategories.hotel = false;
          activeCategories.airport = false;
          activeCategories.event = false;
        }
      } else {
        // Clicking event/hotel/airport turns off guest
        activeCategories[category] = !activeCategories[category];
        if (activeCategories[category]) {
          activeCategories.guest = false;
        }
      }

      // Update layers and button styles
      updateMap();
    });
  });

  function updateMap() {
    // Show/hide layer groups
    Object.keys(layerGroups).forEach(function (cat) {
      if (activeCategories[cat]) {
        map.addLayer(layerGroups[cat]);
      } else {
        map.removeLayer(layerGroups[cat]);
      }
    });

    // Update button active states
    filterBtns.forEach(function (btn) {
      var cat = btn.getAttribute('data-category');
      btn.classList.toggle('active', activeCategories[cat]);
    });

    // Fit the map to show all visible markers
    fitToVisible();
  }

  function fitToVisible() {
    var allVisible = [];
    Object.keys(layerGroups).forEach(function (cat) {
      if (activeCategories[cat]) {
        layerGroups[cat].eachLayer(function (marker) {
          allVisible.push(marker.getLatLng());
        });
      }
    });

    if (allVisible.length > 0) {
      var bounds = L.latLngBounds(allVisible);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }

  // Recalculate map size if the browser window changes
  window.addEventListener('resize', function () {
    map.invalidateSize();
  });

  // Enable scroll zoom when hovering over the map, disable when leaving
  mapEl.addEventListener('mouseenter', function () {
    map.scrollWheelZoom.enable();
  });

  mapEl.addEventListener('mouseleave', function () {
    map.scrollWheelZoom.disable();
  });

  /* ========================================
     Guest Pin Feature
     ======================================== */

  console.log('Guest pin feature loading...');

  // Get UI elements
  var addPinBtn = document.getElementById('add-pin-btn');
  console.log('Add pin button found:', addPinBtn);
  var pinForm = document.getElementById('pin-form');
  var pinNameInput = document.getElementById('pin-name');
  var pinConfirmBtn = document.getElementById('pin-confirm');
  var pinCancelBtn = document.getElementById('pin-cancel');
  var pinToast = document.getElementById('pin-toast');
  var pinUndoBtn = document.getElementById('pin-undo');
  var pinPlacingHint = document.getElementById('pin-placing-hint');
  var pinPlacingCancelBtn = document.getElementById('pin-placing-cancel');
  var pinConfirmBar = document.getElementById('pin-confirm-bar');
  var pinConfirmCancelBtn = document.getElementById('pin-confirm-cancel');
  var pinConfirmOkBtn = document.getElementById('pin-confirm-ok');
  var mapContainerEl = document.querySelector('.map-container');
  var mapCloseBtn = document.getElementById('map-close');
  var pinSearchInput = document.getElementById('pin-search-input');
  var pinSearchBtn = document.getElementById('pin-search-btn');
  var pinSearchStatus = document.getElementById('pin-search-status');

  // Preview marker shown before a pin is confirmed
  var previewMarker = null;

  // State for pin placement
  var isPlacingPin = false;
  var pendingPinName = '';
  var lastAddedPin = null;
  var undoTimeout = null;

  // Track guest markers by pinId for easy removal
  var guestMarkers = {};

  /* ---------- Load existing guest pins ---------- */
  function loadGuestPins() {
    // Skip if URL not configured
    if (GUEST_PINS_URL === 'YOUR_DEPLOYED_APPS_SCRIPT_URL_HERE') {
      console.log('Guest pins: Configure GUEST_PINS_URL to enable this feature');
      return;
    }

    fetch(GUEST_PINS_URL + '?action=getPins')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.pins && data.pins.length > 0) {
          data.pins.forEach(function (pin) {
            // If pin doesn't have a city, look it up
            if (!pin.city) {
              getCityFromCoords(pin.lat, pin.lng, function (city) {
                addGuestMarker(pin.name, pin.lat, pin.lng, pin.pinId, city);
              });
            } else {
              addGuestMarker(pin.name, pin.lat, pin.lng, pin.pinId, pin.city);
            }
          });
          // If the guests view is already showing (like from the RSVP link),
          // zoom out to fit everyone's pins
          if (showGuestsFromLink && activeCategories.guest) fitToVisible();
        }
      })
      .catch(function (err) {
        console.error('Failed to load guest pins:', err);
      });
  }

  /* ---------- Add a guest marker to the map ---------- */
  function addGuestMarker(name, lat, lng, pinId, city) {
    var marker = L.marker([lat, lng], { icon: createIcon('guest') });
    // Name shows on hover (tooltip); click opens the full popup with city + remove
    marker.bindTooltip(name, { direction: 'top', offset: [0, -6] });
    marker.bindPopup(guestPopupContent(name, city, pinId), { offset: [0, -6] });
    marker.pinId = pinId;
    marker.city = city;
    marker.guestName = name;
    layerGroups.guest.addLayer(marker);
    guestMarkers[pinId] = marker;

    // Handle remove button click when popup opens
    marker.on('popupopen', function () {
      var removeBtn = document.querySelector('.guest-remove-btn[data-pin-id="' + pinId + '"]');
      if (removeBtn) {
        removeBtn.addEventListener('click', function () {
          removeGuestPin(pinId);
        });
      }
    });

    return marker;
  }

  /* ---------- Remove a guest pin ---------- */
  function removeGuestPin(pinId) {
    var marker = guestMarkers[pinId];
    if (marker) {
      map.closePopup();
      layerGroups.guest.removeLayer(marker);
      delete guestMarkers[pinId];

      // Delete from backend
      deletePin(pinId, function (err) {
        if (err) {
          console.error('Failed to delete pin:', err);
        }
      });
    }
  }

  /* ---------- Save pin to backend ---------- */
  function savePin(name, lat, lng, city, callback) {
    if (GUEST_PINS_URL === 'YOUR_DEPLOYED_APPS_SCRIPT_URL_HERE') {
      // If not configured, simulate success for testing
      var fakePinId = 'local_' + Date.now();
      callback(null, fakePinId);
      return;
    }

    // Use GET with query params to avoid CORS issues with Google Apps Script
    var url = GUEST_PINS_URL + '?action=addPin' +
      '&name=' + encodeURIComponent(name) +
      '&lat=' + encodeURIComponent(lat) +
      '&lng=' + encodeURIComponent(lng) +
      '&city=' + encodeURIComponent(city || '');

    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.success) {
          callback(null, data.pinId);
        } else {
          callback(data.error || 'Unknown error');
        }
      })
      .catch(function (err) {
        callback(err.message || 'Network error');
      });
  }

  /* ---------- Remove pin from backend ---------- */
  function deletePin(pinId, callback) {
    if (GUEST_PINS_URL === 'YOUR_DEPLOYED_APPS_SCRIPT_URL_HERE') {
      callback(null);
      return;
    }

    // Use GET with query params to avoid CORS issues with Google Apps Script
    var url = GUEST_PINS_URL + '?action=removePin&pinId=' + encodeURIComponent(pinId);

    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        callback(data.error || null);
      })
      .catch(function (err) {
        callback(err.message || 'Network error');
      });
  }

  /* ---------- Pin placement workflow ---------- */

  // The name a guest searched for on the RSVP page, if they came here from
  // its "Add your pin" step (saved in this browser tab only)
  function rememberedRsvpName() {
    try {
      return sessionStorage.getItem('rsvpPinName') || '';
    } catch (e) {
      return '';
    }
  }

  // The banner's original wording (used when we don't know their name)
  var pinFormHeader = pinForm ? pinForm.querySelector('.pin-form-header') : null;
  var pinFormSubheader = pinForm ? pinForm.querySelector('.pin-form-subheader') : null;
  var defaultHeader = pinFormHeader ? pinFormHeader.textContent : '';
  var defaultSubheader = pinFormSubheader ? pinFormSubheader.textContent : '';

  // Open the "Show us where you're traveling from!" banner. If they just
  // RSVPed, we already know their name: greet them by first name and hide the
  // name box (the name is still used for their pin). Either way, they tap
  // "Place your pin" to start, so they know what's about to happen.
  function showPinForm() {
    addPinBtn.style.display = 'none';
    pinForm.classList.add('active');
    var knownName = rememberedRsvpName();
    if (knownName) {
      pinNameInput.value = knownName;
      pinNameInput.style.display = 'none';
      pinFormHeader.textContent = 'Hi ' + knownName.split(' ')[0] + '! Show us where you\u2019re traveling from.';
      pinFormSubheader.textContent = 'Drop a pin on the map to show other guests where you\u2019re coming from. You can search for your city once you start.';
      pinConfirmBtn.focus();
    } else {
      pinNameInput.value = '';
      pinNameInput.style.display = '';
      pinFormHeader.textContent = defaultHeader;
      pinFormSubheader.textContent = defaultSubheader;
      pinNameInput.focus();
    }
  }

  // Step 1: User clicks "Add your pin" button
  if (addPinBtn) {
    addPinBtn.addEventListener('click', showPinForm);
  }

  // Cancel button (in the name form)
  if (pinCancelBtn) {
    pinCancelBtn.addEventListener('click', function () {
      cancelPinPlacement();
    });
  }

  // Cancel button (shown while placing on the map)
  if (pinPlacingCancelBtn) {
    pinPlacingCancelBtn.addEventListener('click', function () {
      cancelPinPlacement();
    });
  }

  // Step 2: User enters name and clicks "Place on map"
  if (pinConfirmBtn) {
    pinConfirmBtn.addEventListener('click', function () {
      var name = pinNameInput.value.trim();
      if (!name) {
        pinNameInput.focus();
        return;
      }

      pendingPinName = name;
      pinForm.classList.remove('active');
      enterPlacingMode();
    });
  }

  // Allow pressing Enter in the name input
  if (pinNameInput) {
    pinNameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        pinConfirmBtn.click();
      }
      if (e.key === 'Escape') {
        cancelPinPlacement();
      }
    });

    // When the field is focused on mobile, the keyboard slides up and can
    // cover the form. Scroll the form into view so the input and its buttons
    // stay visible above the keyboard. (Delay lets the keyboard start opening.)
    pinNameInput.addEventListener('focus', function () {
      setTimeout(function () {
        if (pinForm.scrollIntoView) {
          pinForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    });
  }

  // Treat phones as "mobile" for the full-screen behavior
  function isMobile() {
    return window.matchMedia('(max-width: 700px)').matches;
  }

  function enterFullscreen() {
    if (!mapContainerEl) return;
    mapContainerEl.classList.add('map-fullscreen');
    document.body.classList.add('map-fullscreen-open');
    // Leaflet must recalc its size after the container resizes, or tiles break
    setTimeout(function () { map.invalidateSize(); }, 60);
  }

  function exitFullscreen() {
    if (!mapContainerEl) return;
    mapContainerEl.classList.remove('map-fullscreen');
    document.body.classList.remove('map-fullscreen-open');
    setTimeout(function () { map.invalidateSize(); }, 60);
  }

  function enterPlacingMode() {
    isPlacingPin = true;
    mapEl.classList.add('pin-placing');

    // Center-pin pattern: show the fixed pin and the confirm bar. The guest
    // pans the map so the pin sits over their location, then confirms.
    if (mapContainerEl) mapContainerEl.classList.add('is-placing');
    if (pinConfirmBar) {
      pinConfirmBar.classList.add('active');
      pinConfirmBar.classList.remove('is-compact');  // full instructions to start
    }
    // No pin until they click (or tap) the map, or pick a search result
    removePreviewPin();
    setPlacingText(false);
    if (pinPlacingHint) pinPlacingHint.classList.remove('active');
    if (pinSearchInput) pinSearchInput.value = '';
    hideSuggestions();
    var searchBox = document.getElementById('pin-search');
    if (searchBox) searchBox.classList.remove('is-collapsed');
    if (pinSearchStatus) pinSearchStatus.textContent = '';

    // On phones, go full-screen so there's room to zoom in and place accurately
    if (isMobile()) enterFullscreen();

    // Make sure guest layer is visible so user can see their pin
    if (!activeCategories.guest) {
      activeCategories.guest = true;
      activeCategories.hotel = false;
      activeCategories.airport = false;
      activeCategories.event = false;
      updateMap();
    }
  }

  function exitPlacingMode() {
    isPlacingPin = false;
    removePreviewPin();
    mapEl.classList.remove('pin-placing');
    if (mapContainerEl) mapContainerEl.classList.remove('is-placing');
    if (pinConfirmBar) pinConfirmBar.classList.remove('active');
    if (pinPlacingHint) pinPlacingHint.classList.remove('active');
    exitFullscreen();
    addPinBtn.style.display = 'block';
  }

  function cancelPinPlacement() {
    pinForm.classList.remove('active');
    exitPlacingMode();
    pendingPinName = '';
  }

  /* ---------- Their pin, while placing ---------- */
  // While placing, the mouse cursor is the pin (see .pin-placing in the CSS).
  // Clicking (or tapping) the map drops their pin there; clicking again moves
  // it, and it can also be dragged. Picking a search result drops it there too.
  var touchDevice = window.matchMedia('(hover: none)').matches;

  function placingPinIcon() {
    return L.divIcon({
      className: 'placing-pin',
      html: '<svg viewBox="0 0 24 36" width="30" height="45" aria-hidden="true">' +
        '<path d="M12 0 C5 0 0 5 0 12 C0 21 12 36 12 36 C12 36 24 21 24 12 C24 5 19 0 12 0 Z"/>' +
        '<circle cx="12" cy="12" r="4"/></svg>',
      iconSize: [30, 45],
      iconAnchor: [15, 45]   // the pin's tip marks the spot
    });
  }

  // The instructions in the bottom bar, before and after the pin is dropped
  function setPlacingText(hasPin) {
    var text = pinConfirmBar && pinConfirmBar.querySelector('.pin-confirm-text');
    if (text) {
      text.textContent = hasPin
        ? (touchDevice ? 'Tap again or drag your pin to adjust it' : 'Click again or drag your pin to adjust it')
        : (touchDevice ? 'Tap the map where you\u2019re traveling from' : 'Click the map where you\u2019re traveling from');
    }
    if (pinConfirmOkBtn) pinConfirmOkBtn.disabled = !hasPin;  // nothing to confirm yet
  }

  function dropPreviewPin(latlng) {
    if (previewMarker) {
      previewMarker.setLatLng(latlng);
    } else {
      previewMarker = L.marker(latlng, { icon: placingPinIcon(), draggable: true, keyboard: false }).addTo(map);
    }
    setPlacingText(true);
  }

  function removePreviewPin() {
    if (previewMarker) {
      map.removeLayer(previewMarker);
      previewMarker = null;
    }
  }

  map.on('click', function (e) {
    if (isPlacingPin) dropPreviewPin(e.latlng);
  });

  // Confirm: save the pin where they dropped it
  if (pinConfirmOkBtn) {
    pinConfirmOkBtn.addEventListener('click', function () {
      if (!isPlacingPin || !pendingPinName || !previewMarker) return;
      var spot = previewMarker.getLatLng();
      var lat = spot.lat;
      var lng = spot.lng;
      var name = pendingPinName;

      pinConfirmOkBtn.disabled = true;
      pinConfirmOkBtn.textContent = 'Saving…';

      getCityFromCoords(lat, lng, function (city) {
        savePin(name, lat, lng, city, function (err, pinId) {
          pinConfirmOkBtn.disabled = false;
          pinConfirmOkBtn.textContent = 'Confirm pin';
          if (err) {
            alert('Could not save your pin. Please try again.');
            return;
          }
          pendingPinName = '';
          exitPlacingMode();  // hides pin/bar, exits full-screen
          var marker = addGuestMarker(name, lat, lng, pinId, city);
          lastAddedPin = { pinId: pinId, marker: marker };
          showToast();
        });
      });
    });
  }

  // Cancel placement entirely
  if (pinConfirmCancelBtn) {
    pinConfirmCancelBtn.addEventListener('click', function () {
      cancelPinPlacement();
    });
  }

  // The X collapses the search bar into a small round search button (so it
  // covers less of the map); tapping that button opens it back up. To stop
  // placing a pin altogether, there's Cancel in the bar at the bottom.
  var pinSearchEl = document.getElementById('pin-search');
  var pinSearchOpenBtn = document.getElementById('pin-search-open');

  function collapseSearch() {
    hideSuggestions();
    pinSearchEl.classList.add('is-collapsed');
    pinSearchOpenBtn.focus();
  }

  function expandSearch() {
    pinSearchEl.classList.remove('is-collapsed');
    // Focus the box once the opening animation is mostly done
    setTimeout(function () { pinSearchInput.focus(); }, 250);
  }

  if (mapCloseBtn) mapCloseBtn.addEventListener('click', collapseSearch);
  if (pinSearchOpenBtn) pinSearchOpenBtn.addEventListener('click', expandSearch);

  // Address search: type a city/address to jump the map (and the center pin)
  // there, instead of panning by hand. Uses Esri's address search (the same
  // company as our map tiles), limited to the US since all our guests are
  // coming from the US. Free to use, no account needed.
  var GEOCODER = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer';

  // Move the map to a place Esri found: zoomed to fit it (close in for a
  // street address, wider for a whole city)
  function goToCandidate(c) {
    if (c.extent) {
      map.fitBounds([[c.extent.ymin, c.extent.xmin], [c.extent.ymax, c.extent.xmax]], { maxZoom: 16 });
    } else {
      map.setView([c.location.y, c.location.x], 14);
    }
    // ...and drop their pin right on it (they can still move it)
    if (isPlacingPin) dropPreviewPin([c.location.y, c.location.x]);
  }

  // Look up a place by its text (or by the key from a suggestion they picked)
  function findPlace(text, magicKey) {
    var url = GEOCODER + '/findAddressCandidates?f=json&maxLocations=1&countryCode=USA&SingleLine=' +
      encodeURIComponent(text) + (magicKey ? '&magicKey=' + encodeURIComponent(magicKey) : '');
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) { return (data && data.candidates && data.candidates[0]) || null; });
  }

  function runAddressSearch() {
    var q = (pinSearchInput.value || '').trim();
    if (!q) return;
    pinSearchStatus.textContent = 'Searching\u2026';
    pinSearchStatus.className = 'pin-search-status';

    findPlace(q)
      .then(function (c) {
        if (c) {
          goToCandidate(c);
          pinSearchStatus.textContent = '';
        } else {
          pinSearchStatus.textContent = 'No match found. Try a city or ZIP code.';
          pinSearchStatus.className = 'pin-search-status is-error';
        }
      })
      .catch(function () {
        pinSearchStatus.textContent = 'Search failed. Please try again.';
        pinSearchStatus.className = 'pin-search-status is-error';
      });
  }

  if (pinSearchBtn) {
    pinSearchBtn.addEventListener('click', function () {
      hideSuggestions();
      runAddressSearch();
    });
  }

  /* ---------- Search suggestions (like Google Maps) ---------- */
  // As they type, a tray under the search bar suggests matching US places
  // and addresses, from the same Esri address search as above.
  var suggestionsEl = document.getElementById('pin-search-suggestions');
  var suggestTimer = null;
  var latestSuggestId = 0;   // ignore slow answers to older searches
  var suggestions = [];      // the places currently shown in the tray
  var highlighted = -1;      // which one the arrow keys are on

  function hideSuggestions() {
    if (!suggestionsEl) return;
    suggestionsEl.hidden = true;
    suggestionsEl.innerHTML = '';
    suggestions = [];
    highlighted = -1;
    if (pinSearchInput) pinSearchInput.setAttribute('aria-expanded', 'false');
  }

  // Two lines per place: the address or place itself, then where it is.
  // Esri gives one line like "571 McCarty Ave, Mountain View, CA, 94041, USA".
  function describePlace(text) {
    var parts = String(text).replace(/, USA$/, '').split(', ');
    return { main: parts[0], where: parts.slice(1).join(', ') };
  }

  function escapeText(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function showSuggestions(items) {
    suggestions = [];
    var html = '';
    items.forEach(function (item) {
      var label = describePlace(item.text || '');
      if (!label.main) return;
      suggestions.push({ label: label, text: item.text, magicKey: item.magicKey });
      html += '<li class="pin-suggestion" role="option" data-index="' + (suggestions.length - 1) + '">' +
        '<span class="pin-suggestion-main">' + escapeText(label.main) + '</span>' +
        (label.where ? '<span class="pin-suggestion-where">' + escapeText(label.where) + '</span>' : '') +
      '</li>';
    });
    if (!suggestions.length) {
      hideSuggestions();
      return;
    }
    suggestionsEl.innerHTML = html;
    suggestionsEl.hidden = false;
    highlighted = -1;
    pinSearchInput.setAttribute('aria-expanded', 'true');
  }

  // While suggestions load, show the same line-art flower as the RSVP form's
  // loader (styled by .floral-loader in styles.css), so the tray opens right
  // away instead of after a pause
  function showSuggestionsLoading() {
    suggestions = [];
    highlighted = -1;
    suggestionsEl.innerHTML =
      '<li class="pin-suggestions-loading" role="status" aria-live="polite">' +
        '<div class="floral-loader">' +
          '<svg viewBox="0 0 100 108" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
            '<g transform="translate(50,40)">' +
              '<path pathLength="1" d="M0,16 C0,34 0,50 0,64"/>' +
              '<path pathLength="1" d="M0,44 C10,37 18,43 16,52 C9,54 2,50 0,46"/>' +
              '<ellipse pathLength="1" cx="0" cy="-15" rx="6.5" ry="15" transform="rotate(0)"/>' +
              '<ellipse pathLength="1" cx="0" cy="-15" rx="6.5" ry="15" transform="rotate(72)"/>' +
              '<ellipse pathLength="1" cx="0" cy="-15" rx="6.5" ry="15" transform="rotate(144)"/>' +
              '<ellipse pathLength="1" cx="0" cy="-15" rx="6.5" ry="15" transform="rotate(216)"/>' +
              '<ellipse pathLength="1" cx="0" cy="-15" rx="6.5" ry="15" transform="rotate(288)"/>' +
              '<circle pathLength="1" cx="0" cy="0" r="4.5"/>' +
            '</g>' +
          '</svg>' +
          '<p class="search-loading">Finding places&hellip;</p>' +
        '</div>' +
      '</li>';
    suggestionsEl.hidden = false;
    pinSearchInput.setAttribute('aria-expanded', 'true');
  }

  function fetchSuggestions(q) {
    var id = ++latestSuggestId;
    showSuggestionsLoading();
    // US only, favoring places near wherever the map is currently looking
    var c = map.getCenter();
    fetch(GEOCODER + '/suggest?f=json&countryCode=USA&maxSuggestions=5&location=' +
      c.lng.toFixed(3) + ',' + c.lat.toFixed(3) + '&text=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (id !== latestSuggestId) return;  // a newer search has taken over
        showSuggestions((data && data.suggestions) || []);
      })
      .catch(function () {
        // Suggestions are a bonus: if they fail, the Search button still works
        if (id === latestSuggestId) hideSuggestions();
      });
  }

  // Jump the map to a suggestion they picked
  function chooseSuggestion(i) {
    var s = suggestions[i];
    if (!s) return;
    pinSearchInput.value = s.label.main + (s.label.where ? ', ' + s.label.where : '');
    hideSuggestions();
    pinSearchStatus.textContent = '';
    findPlace(s.text, s.magicKey)
      .then(function (c) { if (c) goToCandidate(c); })
      .catch(function () {
        pinSearchStatus.textContent = 'Search failed. Please try again.';
        pinSearchStatus.className = 'pin-search-status is-error';
      });
  }

  function highlight(i) {
    var items = suggestionsEl.querySelectorAll('.pin-suggestion');
    if (!items.length) return;
    highlighted = (i + items.length) % items.length;  // wrap around
    for (var k = 0; k < items.length; k++) {
      items[k].classList.toggle('is-highlighted', k === highlighted);
    }
  }

  if (suggestionsEl) {
    // mousedown (not click) so it fires before the search box loses focus
    suggestionsEl.addEventListener('mousedown', function (e) {
      var item = e.target.closest('.pin-suggestion');
      if (!item) return;
      e.preventDefault();
      chooseSuggestion(parseInt(item.getAttribute('data-index'), 10));
    });
  }

  if (pinSearchInput) {
    pinSearchInput.addEventListener('input', function () {
      clearTimeout(suggestTimer);
      var q = pinSearchInput.value.trim();
      if (q.length < 3) {
        latestSuggestId++;
        hideSuggestions();
        return;
      }
      // Wait until they pause typing for a moment before looking it up
      suggestTimer = setTimeout(function () { fetchSuggestions(q); }, 300);
    });

    pinSearchInput.addEventListener('keydown', function (e) {
      var open = suggestionsEl && !suggestionsEl.hidden;
      if (e.key === 'ArrowDown' && open) {
        e.preventDefault();
        highlight(highlighted + 1);
      } else if (e.key === 'ArrowUp' && open) {
        e.preventDefault();
        highlight(highlighted - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (open && highlighted >= 0) {
          chooseSuggestion(highlighted);
        } else {
          hideSuggestions();
          runAddressSearch();
        }
      } else if (e.key === 'Escape' && open) {
        e.stopPropagation();  // close the tray, not the whole pin flow
        hideSuggestions();
      }
    });

    // Close the tray when they click away (after a moment, so a tap on a
    // suggestion still counts)
    pinSearchInput.addEventListener('blur', function () {
      setTimeout(hideSuggestions, 150);
    });
  }

  // The instructions bubble covers part of the map: once they start dragging
  // the map, shrink it to just the Cancel / Confirm pin buttons
  map.on('dragstart', function () {
    if (isPlacingPin && pinConfirmBar) pinConfirmBar.classList.add('is-compact');
  });

  // Allow pressing Escape to cancel placing mode
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isPlacingPin) {
      cancelPinPlacement();
    }
  });

  /* ---------- Toast / Undo ---------- */
  function showToast() {
    if (pinToast) {
      pinToast.classList.add('active');

      // Clear any existing timeout
      if (undoTimeout) {
        clearTimeout(undoTimeout);
      }

      // Hide toast after 8 seconds (gives time to find & tap Undo on mobile)
      undoTimeout = setTimeout(function () {
        hideToast();
      }, 8000);
    }
  }

  function hideToast() {
    if (pinToast) {
      pinToast.classList.remove('active');
    }
    lastAddedPin = null;
  }

  // Undo button
  if (pinUndoBtn) {
    pinUndoBtn.addEventListener('click', function () {
      if (!lastAddedPin) return;

      var pinId = lastAddedPin.pinId;
      var marker = lastAddedPin.marker;

      // Remove from map immediately
      if (marker) {
        layerGroups.guest.removeLayer(marker);
        delete guestMarkers[pinId];
      }

      // Delete from backend
      deletePin(pinId, function (err) {
        if (err) {
          console.error('Failed to delete pin from backend:', err);
        }
      });

      hideToast();
      if (undoTimeout) {
        clearTimeout(undoTimeout);
      }
    });
  }

  /* ---------- Initialize ---------- */
  loadGuestPins();

  // Auto-open pin form if URL has ?addpin=true (linked from RSVP confirmation)
  var urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('addpin') === 'true' && addPinBtn && pinForm) {
    // Coming from the RSVP flow to drop a pin: show the guests view on purpose
    // (this is the one case where we intentionally default to "Our guests").
    activeCategories.guest = true;
    activeCategories.hotel = false;
    activeCategories.airport = false;
    activeCategories.event = false;
    updateMap();

    // Scroll to map area
    var mapContainer = document.querySelector('.map-container');
    if (mapContainer) {
      mapContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // Open the banner after a short delay to let the page settle
    setTimeout(showPinForm, 500);
  }

  // "See where everyone is traveling from" (on the RSVP confirmation) links
  // here with ?guests=true: show the "Our guests" pins and scroll to the map
  var showGuestsFromLink = urlParams.get('guests') === 'true';
  if (showGuestsFromLink) {
    activeCategories.guest = true;
    activeCategories.hotel = false;
    activeCategories.airport = false;
    activeCategories.event = false;
    updateMap();
    var guestMap = document.querySelector('.map-container');
    if (guestMap) guestMap.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});
