/* ========================================
   Travel Page – Interactive Map
   Uses Leaflet + OpenStreetMap (free, no API key needed)
   ======================================== */

document.addEventListener('DOMContentLoaded', function () {
  var mapEl = document.getElementById('travel-map');
  if (!mapEl) return; // only run on the travel page

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
      name: 'Old Monterey Inn',
      category: 'hotel',
      lat: 36.5935,
      lng: -121.9006,
      address: '500 Martin St, Monterey',
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
    event:   '#2c3e2d'  // dark green
  };

  var markerSizes = {
    hotel:   12,
    airport: 12,
    event:   12
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
    event:   L.layerGroup().addTo(map)
  };

  // Add each location as a marker in its category's layer group
  locations.forEach(function (loc) {
    var marker = L.marker([loc.lat, loc.lng], { icon: createIcon(loc.category) });
    marker.bindTooltip(popupContent(loc), { direction: 'top', offset: [0, -8] });
    layerGroups[loc.category].addLayer(marker);
  });

  /* ---------- Filter buttons ---------- */
  var filterBtns = document.querySelectorAll('.map-filter-btn');
  var activeCategories = { hotel: true, airport: true, event: true };

  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var category = btn.getAttribute('data-category');

      if (category === 'all') {
        // If any category is off, turn them all on; otherwise turn all off
        var allOn = activeCategories.hotel && activeCategories.airport && activeCategories.event;
        var newState = !allOn;
        activeCategories.venue = newState;
        activeCategories.hotel = newState;
        activeCategories.airport = newState;
      } else {
        // Toggle this individual category
        activeCategories[category] = !activeCategories[category];
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
    var allOn = activeCategories.venue && activeCategories.hotel && activeCategories.airport;
    filterBtns.forEach(function (btn) {
      var cat = btn.getAttribute('data-category');
      if (cat === 'all') {
        btn.classList.toggle('active', allOn);
      } else {
        btn.classList.toggle('active', activeCategories[cat]);
      }
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
});
