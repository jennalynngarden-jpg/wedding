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

  // Add CartoDB Positron tiles (clean, minimalist style — free for low traffic)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19,
    subdomains: 'abcd'
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

  // Step 1: User clicks "Add your pin" button
  if (addPinBtn) {
    addPinBtn.addEventListener('click', function () {
      addPinBtn.style.display = 'none';
      pinForm.classList.add('active');
      pinNameInput.value = '';
      pinNameInput.focus();
    });
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
    if (pinConfirmBar) pinConfirmBar.classList.add('active');
    if (pinPlacingHint) pinPlacingHint.classList.remove('active');
    if (pinSearchInput) pinSearchInput.value = '';
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

  // Confirm: save the pin at whatever point the map is currently centered on
  if (pinConfirmOkBtn) {
    pinConfirmOkBtn.addEventListener('click', function () {
      if (!isPlacingPin || !pendingPinName) return;
      var center = map.getCenter();
      var lat = center.lat;
      var lng = center.lng;
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

  // Close (X) button — collapse the map / cancel placement
  if (mapCloseBtn) {
    mapCloseBtn.addEventListener('click', function () {
      cancelPinPlacement();
    });
  }

  // Address search: type a city/address to jump the map (and the center pin)
  // there, instead of panning by hand.
  function runAddressSearch() {
    var q = (pinSearchInput.value || '').trim();
    if (!q) return;
    pinSearchStatus.textContent = 'Searching…';
    pinSearchStatus.className = 'pin-search-status';

    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
      encodeURIComponent(q);
    fetch(url, { headers: { 'Accept-Language': 'en' } })
      .then(function (r) { return r.json(); })
      .then(function (results) {
        if (results && results.length) {
          var lat = parseFloat(results[0].lat);
          var lng = parseFloat(results[0].lon);
          map.setView([lat, lng], 12);
          pinSearchStatus.textContent = '';
        } else {
          pinSearchStatus.textContent = 'No match found — try a city or ZIP code.';
          pinSearchStatus.className = 'pin-search-status is-error';
        }
      })
      .catch(function () {
        pinSearchStatus.textContent = 'Search failed — please try again.';
        pinSearchStatus.className = 'pin-search-status is-error';
      });
  }

  if (pinSearchBtn) {
    pinSearchBtn.addEventListener('click', runAddressSearch);
  }
  if (pinSearchInput) {
    pinSearchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        runAddressSearch();
      }
    });
  }

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
    // Open the form after a short delay to let the page settle
    setTimeout(function() {
      addPinBtn.style.display = 'none';
      pinForm.classList.add('active');
      pinNameInput.focus();
    }, 500);
  }
});
