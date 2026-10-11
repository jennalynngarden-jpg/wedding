/* ========================================
   RSVP Multi-Step Form
   ======================================== */

(function () {
  'use strict';

  /* ---------- Configuration ---------- */
  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxMldY7OfwgI-AaEhLRxgqVW_Du_Z9YdANivvVzGfA7MkVMFaA_MkPbyMPYcqSW2SszOQ/exec';
  var MEAL_OPTIONS = [
    { value: 'Chicken',           description: 'Pan-seared chicken with a rich, cream sauce made with chicken stock, heavy cream, and sun-dried tomatoes' },
    { value: 'Salmon',            description: '' },
    { value: 'Vegetable Lasagna', description: '' }
  ];
  var KIDS_MEAL = {
    value: "Kids' Meal",
    description: "We're still confirming the kids' menu with the venue. We'll share the details closer to the date, and you'll be able to make changes then."
  };
  var MAX_PHOTO_SIZE = 10 * 1024 * 1024;

  /* ---------- State ---------- */
  var state = {
    currentStep: '1',
    selectedGuest: null,
    partyMembers: [],
    mealChoices: {},
    dietaryRestrictions: {},
    songRequest: '',
    specialSong: '',
    email: '',
    partnershipStatus: '',
    stepFlow: ['1', '2', 'email', '3'],  // Default flow; rebuilt after fetching party data
    photos: []  // photos chosen on the photo step: { file, url } (url = preview)
  };

  /* ---------- Step Flow ---------- */

  // The form has two parts:
  //   Part 1 (required): the RSVP itself, ending with Submit on the dinner step.
  //   Part 2 (optional): music and photo questions, offered after submitting.

  // Builds the ordered list of part 1 step IDs. Called after fetching party data.
  // The "Who's RSVPing today?" step only appears when there's a choice to make
  // (more than one person in the party who hasn't RSVPed yet).
  function buildStepFlow() {
    var flow = ['1'];
    if (getAvailableMembers().length > 1) flow.push('who');
    // Ask for the +1's name (before attendance) if a +1 is part of today's RSVP
    if (getTodayPlusOnes().length > 0) flow.push('plusone');
    flow.push('2', 'email');
    // Dinner only if someone's coming (otherwise email is the last step)
    if (!state.declining) flow.push('3');
    state.stepFlow = flow;
  }

  // Builds the ordered list of part 2 (optional) step IDs. The special song
  // question is only for guests who are married or in a long-term partnership.
  function buildExtrasFlow() {
    var flow = [];
    if (state.partnershipStatus === 'married' || state.partnershipStatus === 'partner') {
      flow.push('special-song');
    }
    flow.push('songs', 'photo', 'pin');
    state.stepFlow = flow;
  }

  // Creates the right number of progress dots for the current flow
  function renderProgressDots() {
    var container = document.getElementById('rsvp-progress');
    var html = '';
    for (var i = 0; i < state.stepFlow.length; i++) {
      if (i > 0) html += '<div class="progress-line"></div>';
      html += '<div class="progress-dot"></div>';
    }
    container.innerHTML = html;
  }

  // Returns the next step ID in the flow, or null if at the end
  function getNextStep() {
    var idx = state.stepFlow.indexOf(String(state.currentStep));
    return (idx < state.stepFlow.length - 1) ? state.stepFlow[idx + 1] : null;
  }

  // Returns the previous step ID in the flow, or null if at the start
  function getPrevStep() {
    var idx = state.stepFlow.indexOf(String(state.currentStep));
    return (idx > 0) ? state.stepFlow[idx - 1] : null;
  }

  /* ---------- Step Navigation ---------- */

  function goToStep(stepId) {
    var steps = document.querySelectorAll('.rsvp-step');
    for (var i = 0; i < steps.length; i++) {
      steps[i].classList.remove('active');
    }
    var target = document.getElementById('step-' + stepId);
    if (target) {
      target.classList.add('active');
      target.style.display = '';
    }
    state.currentStep = stepId;
    updateProgressDots(stepId);
    // Show the welcome intro only on the first step; hide it once in the form.
    setIntroVisible(stepId === '1');
    saveProgress();
    document.getElementById('rsvp-form-container').scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  // Show/hide both intro paragraphs at the top of the RSVP page.
  function setIntroVisible(visible) {
    var intros = document.querySelectorAll('.content-section .section-intro');
    for (var i = 0; i < intros.length; i++) {
      intros[i].style.display = visible ? '' : 'none';
    }
  }

  function updateProgressDots(stepId) {
    var currentIndex = state.stepFlow.indexOf(String(stepId));
    var dots = document.querySelectorAll('.progress-dot');
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.remove('active', 'completed');
      if (i === currentIndex) {
        dots[i].classList.add('active');
      } else if (i < currentIndex) {
        dots[i].classList.add('completed');
      }
    }
  }

  function hideAllSteps() {
    var steps = document.querySelectorAll('.rsvp-step');
    for (var i = 0; i < steps.length; i++) {
      steps[i].classList.remove('active');
    }
  }

  function showTerminalStep(id) {
    hideAllSteps();
    var el = document.getElementById(id);
    el.style.display = '';
    el.classList.add('active');
    document.getElementById('rsvp-progress').style.display = 'none';
    setIntroVisible(false);
    // Their RSVP is done, so there's no place to save anymore. (A refresh
    // starts fresh, so the next person using this browser starts clean.)
    state.finished = true;
    clearProgress();
  }

  /* ---------- Saving your place (so a refresh doesn't start over) ---------- */
  // While a guest fills out the form, their progress is kept in this browser
  // tab (sessionStorage: never sent anywhere, and gone when the tab closes).
  // If the page is refreshed, they pick up on the same step with their
  // answers. Cleared once their RSVP is finished (see showTerminalStep).
  var PROGRESS_KEY = 'rsvpProgress';

  // Copy what's typed in the fields into state, so it can be saved
  function captureFieldValues() {
    var emailInput = document.getElementById('guest-email');
    if (emailInput && emailInput.value.trim()) state.email = emailInput.value.trim();
    if (document.querySelector('#meal-selections input')) collectMealData();
    if (document.querySelector('#plusone-fields input')) collectPlusOneNames();
  }

  function saveProgress() {
    try {
      if (!state.selectedGuest || state.currentStep === '1' || state.finished || state.fromLink) {
        sessionStorage.removeItem(PROGRESS_KEY);
        return;
      }
      captureFieldValues();
      sessionStorage.setItem(PROGRESS_KEY, JSON.stringify({
        version: 1,
        currentStep: state.currentStep,
        inExtras: !!state.inExtras,
        selectedGuest: state.selectedGuest,
        partyMembers: state.partyMembers,
        partnershipStatus: state.partnershipStatus,
        email: state.email,
        mealChoices: state.mealChoices,
        dietaryRestrictions: state.dietaryRestrictions,
        declining: !!state.declining,
        pendingCode: state.pendingCode || null,
        rsvpCode: state.rsvpCode || null,
        extrasGuestIds: state.extrasGuestIds || [],
        confirmationRequested: !!state.confirmationRequested,
        songRequest: document.getElementById('song-request').value,
        specialSong: document.getElementById('special-song-input').value
      }));
    } catch (e) {}  // if the browser blocks storage, the form still works
  }

  function clearProgress() {
    try { sessionStorage.removeItem(PROGRESS_KEY); } catch (e) {}
  }

  // On page load: if there's saved progress, put the guest back where they
  // were. Returns true if it did.
  function restoreProgress() {
    var saved;
    try { saved = JSON.parse(sessionStorage.getItem(PROGRESS_KEY) || 'null'); } catch (e) { saved = null; }
    if (!saved || saved.version !== 1 || !saved.selectedGuest) return false;

    state.selectedGuest = saved.selectedGuest;
    state.partyMembers = saved.partyMembers || [];
    state.partnershipStatus = saved.partnershipStatus || '';
    state.email = saved.email || '';
    state.mealChoices = saved.mealChoices || {};
    state.dietaryRestrictions = saved.dietaryRestrictions || {};
    state.declining = saved.declining;
    state.pendingCode = saved.pendingCode;
    state.rsvpCode = saved.rsvpCode;
    state.extrasGuestIds = saved.extrasGuestIds;
    state.confirmationRequested = saved.confirmationRequested;
    state.inExtras = saved.inExtras;

    document.getElementById('guest-email').value = state.email;
    document.getElementById('song-request').value = saved.songRequest || '';
    document.getElementById('special-song-input').value = saved.specialSong || '';
    setSpecialSongHeading();

    // Rebuild the step order and dots for whichever part they were in
    if (state.inExtras) buildExtrasFlow(); else buildStepFlow();
    renderProgressDots();
    document.getElementById('rsvp-progress').style.display = '';

    // Fill in the step they were on, then show it
    var step = saved.currentStep;
    if (state.stepFlow.indexOf(step) === -1) return false;
    if (step === 'who') renderWhoList();
    if (step === 'plusone') renderPlusOneFields();
    if (step === '2') renderPartyMembers();
    if (step === 'email') {
      document.querySelector('#step-email [data-dir="next"]').textContent =
        state.declining ? 'Submit RSVP' : 'Continue';
    }
    if (step === '3') renderMealSelections();
    goToStep(step);
    return true;
  }

  /* ---------- Step 1: Guest Search ---------- */
  var searchTimeout = null;

  function initSearch() {
    var input = document.getElementById('guest-search');
    if (!input) return;

    // On phones, when the field is tapped, scroll it up near the top of the
    // screen so the results tray that drops below it stays fully on-screen
    // (and isn't hidden behind the on-screen keyboard). We wait a beat for the
    // keyboard to start opening before scrolling.
    input.addEventListener('focus', function () {
      if (window.matchMedia('(max-width: 768px)').matches) {
        setTimeout(function () {
          var field = input.closest('.form-group') || input;
          field.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
      }
    });

    input.addEventListener('input', function () {
      clearTimeout(searchTimeout);
      var query = this.value.trim();
      if (query.length < 2) {
        document.getElementById('search-results').innerHTML = '';
        return;
      }
      searchTimeout = setTimeout(function () {
        fetchGuests(query);
      }, 300);
    });
  }

  // Line-art "party" loader for the screen after picking your name: two people
  // side by side with a little heart, drawn in the same style (and with the
  // same draw-hold-erase animation) as the flower loader below.
  function partyLoaderHTML(caption) {
    return '<div class="floral-loader" role="status" aria-live="polite">' +
      '<svg viewBox="0 0 100 108" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<g>' +
          '<circle pathLength="1" cx="37" cy="44" r="10.5"/>' +                                // taller person's head
          '<path pathLength="1" d="M13,104 C13,80 24,67 37,66 C47,66 53,73 54,84"/>' +         // taller person's shoulders
          '<circle pathLength="1" cx="64" cy="53" r="9.5"/>' +                                 // shorter person's head
          '<path pathLength="1" d="M87,104 C87,86 79,74 64,73 C56,74 51,79 49,87"/>' +         // shorter person's shoulders, leaning in
          '<path pathLength="1" d="M51,31 C45,26 41,23 41,18 C41,14 44,12 47,12 C49,12 50.4,13.4 51,15 ' +
            'C51.6,13.4 53,12 55,12 C58,12 61,14 61,18 C61,23 57,26 51,31 Z"/>' +              // heart
        '</g>' +
      '</svg>' +
      '<p class="search-loading">' + caption + '</p>' +
    '</div>';
  }

  // Full-page loader shown while an RSVP is being sent: a flower on a stem,
  // with vines and leaves growing out to both sides, drawn in the same line
  // style as the other loaders. Each line draws itself in order (stem, then
  // vines, then leaves, then the flower blooms), holds, and loops.
  // className: "page-loader-art" (loops, for the loader) unless another is given
  function vineLoaderSVG(className) {
    // [drawing instructions, delay in seconds before it starts drawing]
    var lines = [
      ['<path pathLength="1" d="M120,73 C120,95 120,112 120,128"/>', 0],                                    // stem
      ['<path pathLength="1" d="M120,128 C104,130 94,122 80,124 C66,126 58,136 44,132 C36,130 32,124 36,120 C40,117 45,121 42,124"/>', 0.3],   // ground vine, left
      ['<path pathLength="1" d="M120,128 C136,130 146,122 160,124 C174,126 182,136 196,132 C204,130 208,124 204,120 C200,117 195,121 198,124"/>', 0.3], // ground vine, right
      ['<path pathLength="1" d="M120,104 C108,100 100,90 90,88 C82,86 76,92 80,97 C83,100 88,97 86,94"/>', 0.55],   // curling tendril, left
      ['<path pathLength="1" d="M120,98 C132,94 140,84 150,82 C158,80 164,86 160,91 C157,94 152,91 154,88"/>', 0.55],  // curling tendril, right
      ['<path pathLength="1" d="M80,124 C76,116 80,110 86,110 C88,116 85,122 80,124 Z"/>', 0.8],          // leaves on the vines
      ['<path pathLength="1" d="M58,131 C52,126 52,120 56,117 C61,120 61,127 58,131 Z"/>', 0.85],
      ['<path pathLength="1" d="M160,124 C164,116 160,110 154,110 C152,116 155,122 160,124 Z"/>', 0.8],
      ['<path pathLength="1" d="M182,131 C188,126 188,120 184,117 C179,120 179,127 182,131 Z"/>', 0.85],
      ['<path pathLength="1" d="M120,116 C112,114 106,118 104,124 C112,125 117,121 120,116 Z"/>', 0.7],    // leaves on the stem
      ['<path pathLength="1" d="M120,110 C128,106 135,108 138,113 C130,116 124,114 120,110 Z"/>', 0.7]
    ];
    // The flower: five petals and a center, blooming last
    for (var p = 0; p < 5; p++) {
      lines.push(['<ellipse pathLength="1" cx="120" cy="43" rx="6.5" ry="15" transform="rotate(' + (p * 72) + ' 120 58)"/>', 1.0 + p * 0.08]);
    }
    lines.push(['<circle pathLength="1" cx="120" cy="58" r="4.5"/>', 1.45]);

    var html = '';
    for (var i = 0; i < lines.length; i++) {
      html += lines[i][0].replace('<path ', '<path class="pl" style="animation-delay:' + lines[i][1] + 's" ')
        .replace('<ellipse ', '<ellipse class="pl" style="animation-delay:' + lines[i][1] + 's" ')
        .replace('<circle ', '<circle class="pl" style="animation-delay:' + lines[i][1] + 's" ');
    }
    return '<svg class="' + (className || 'page-loader-art') + '" viewBox="24 20 192 122" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + html + '</svg>';
  }

  // Cover the page with the vine loader (while sending an RSVP)
  function showPageLoader(caption) {
    var el = document.getElementById('page-loader');
    el.innerHTML = '<div class="page-loader-inner" role="status" aria-live="polite">' + vineLoaderSVG() +
      '<p class="page-loader-caption">' + caption + '</p></div>';
    el.classList.add('active');
  }

  function hidePageLoader() {
    document.getElementById('page-loader').classList.remove('active');
  }

  // Floral line-art loader: a flower that draws itself and loops, echoing the
  // continuous line-art florals on our invitations. Caption is customizable.
  function floralLoaderHTML(caption) {
    return '<div class="floral-loader" role="status" aria-live="polite">' +
      '<svg viewBox="0 0 100 108" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<g transform="translate(50,40)">' +
          '<path pathLength="1" d="M0,16 C0,34 0,50 0,64"/>' +               // stem
          '<path pathLength="1" d="M0,44 C10,37 18,43 16,52 C9,54 2,50 0,46"/>' + // leaf
          '<ellipse pathLength="1" cx="0" cy="-15" rx="6.5" ry="15" transform="rotate(0)"/>' +
          '<ellipse pathLength="1" cx="0" cy="-15" rx="6.5" ry="15" transform="rotate(72)"/>' +
          '<ellipse pathLength="1" cx="0" cy="-15" rx="6.5" ry="15" transform="rotate(144)"/>' +
          '<ellipse pathLength="1" cx="0" cy="-15" rx="6.5" ry="15" transform="rotate(216)"/>' +
          '<ellipse pathLength="1" cx="0" cy="-15" rx="6.5" ry="15" transform="rotate(288)"/>' +
          '<circle pathLength="1" cx="0" cy="0" r="4.5"/>' +                 // flower center
        '</g>' +
      '</svg>' +
      '<p class="search-loading">' + caption + '</p>' +
    '</div>';
  }

  // Fetch JSON from Google, with a backup plan for slow requests.
  //
  // Our script itself always answers in 1-2 seconds (see the Executions log
  // in Apps Script), but every so often a request gets stuck on Google's side
  // before it ever reaches the script, and just hangs. So instead of waiting
  // on one request, we send a backup copy if there's no answer after
  // HEDGE_DELAY, and use whichever answer arrives first. Up to MAX_ATTEMPTS
  // copies are sent in total; each one gives up after REQUEST_TIMEOUT.
  var HEDGE_DELAY = 3000;      // send a backup request after 3 seconds
  var REQUEST_TIMEOUT = 10000; // give up on any single request after 10 seconds
  var MAX_ATTEMPTS = 3;

  // One request, which gives up (fails) if it takes longer than timeout
  // (REQUEST_TIMEOUT unless a different one is given). body (optional):
  // sends the request as a POST with that body, for saving form answers.
  function fetchOnce(url, timeout, body) {
    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, timeout || REQUEST_TIMEOUT) : null;
    var options = controller ? { signal: controller.signal } : {};
    if (body) {
      options.method = 'POST';
      options.body = body;
      options.redirect = 'manual';  // see postToScript below
    }
    return fetch(url, options)
      .then(function (r) {
        if (r.type === 'opaqueredirect') return { success: true };  // see postToScript
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        clearTimeout(timer);
        return data;
      }, function (err) {
        clearTimeout(timer);
        throw err;
      });
  }

  // Optional settings: timeout (per copy), hedgeDelay (wait before sending a
  // backup), and body (send as a POST, for saving answers). Only use body
  // for saves the script can safely receive twice (see submitRsvp).
  function fetchJSON(url, timeout, hedgeDelay, body) {
    return new Promise(function (resolve, reject) {
      var done = false;     // true once we've used an answer (or given up)
      var started = 0;      // how many copies we've sent
      var failed = 0;       // how many copies have failed
      var hedgeTimer = null;

      function launch() {
        started++;
        // Give each copy a slightly different address (an extra "try" number
        // the script ignores). Browsers sometimes hold a second request for the
        // exact same address until the first finishes, which would make the
        // backup wait behind the stuck request it's meant to replace.
        var attemptUrl = url + (url.indexOf('?') === -1 ? '?' : '&') + 'try=' + started + '-' + Date.now();
        fetchOnce(attemptUrl, timeout, body).then(function (data) {
          if (done) return;          // another copy already answered
          done = true;
          clearTimeout(hedgeTimer);
          resolve(data);
        }, function (err) {
          failed++;
          if (done) return;
          if (failed >= MAX_ATTEMPTS) {
            done = true;               // every copy failed: show the error message
            clearTimeout(hedgeTimer);
            reject(err);
          } else if (failed >= started) {
            launch();                  // nothing else is on its way, so try again now
          }
        });
        // If this copy hasn't answered in a few seconds, send a backup
        clearTimeout(hedgeTimer);
        if (started < MAX_ATTEMPTS) {
          hedgeTimer = setTimeout(function () {
            if (!done && started < MAX_ATTEMPTS) launch();
          }, hedgeDelay || HEDGE_DELAY);
        }
      }

      launch();
    });
  }

  // Counts searches so that if an older, slower search answers after a newer
  // one, we ignore the old answer instead of letting it overwrite the tray.
  var latestSearchId = 0;

  /* ---------- Guest list (loaded once, when the page opens) ---------- */
  // Instead of asking Google on every search (which sometimes stalls), we load
  // the whole guest list once as soon as the RSVP page opens. Searching and
  // finding someone's party then happen instantly, right in the browser.
  // If the list can't be loaded, we fall back to asking Google per search.
  var guestListPromise = null;
  var guestListUnavailable = false;

  function loadGuestList() {
    if (!guestListPromise) {
      // Extra patience (30 seconds per try): this loads in the background as
      // soon as the page opens, and right after a new deploy (or a quiet
      // stretch) Google can take 20+ seconds to start the script up
      guestListPromise = fetchJSON(APPS_SCRIPT_URL + '?action=getGuestList', 30000)
        .then(function (data) {
          if (!data.guests) throw new Error('No guest list');
          return data.guests;
        });
      guestListPromise.catch(function () {
        guestListUnavailable = true; // use the per-search fallback from now on
      });
    }
    return guestListPromise;
  }

  // Search the loaded guest list: adults only (kids and +1s are RSVPed for by
  // others). Guests who already RSVPed are included and tagged, so they can
  // get a link to their RSVP.
  function searchGuestList(list, query) {
    var q = query.toLowerCase().trim();
    var results = [];
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      if (g.relationship === 'child' || g.relationship === 'plusone') continue;
      if (String(g.displayName).toLowerCase().indexOf(q) !== -1) {
        results.push({ guestId: g.guestId, partyId: g.partyId, displayName: g.displayName, hasResponded: !!g.hasResponded });
      }
    }
    return results;
  }

  // Ask Google to search (the fallback when the guest list isn't available)
  function searchOnline(query) {
    var url = APPS_SCRIPT_URL + '?action=searchGuests&query=' + encodeURIComponent(query);
    return fetchJSON(url).then(function (data) { return data.guests || []; });
  }

  function findGuests(query) {
    if (guestListUnavailable) return searchOnline(query);
    return loadGuestList().then(function (list) {
      return searchGuestList(list, query);
    }, function () {
      return searchOnline(query);
    });
  }

  function fetchGuests(query) {
    var resultsEl = document.getElementById('search-results');
    resultsEl.innerHTML = floralLoaderHTML('Finding your invitation&hellip;');
    var searchId = ++latestSearchId;

    findGuests(query)
      .then(function (guests) {
        if (searchId !== latestSearchId) return; // a newer search has taken over
        renderSearchResults(guests);
      })
      .catch(function () {
        if (searchId !== latestSearchId) return;
        resultsEl.innerHTML = '<p class="no-results">We had trouble reaching our guest list. Please check your connection and try again.</p>';
      });
  }

  function renderSearchResults(guests) {
    var container = document.getElementById('search-results');
    if (guests.length === 0) {
      container.innerHTML = '<p class="no-results">No matching names found. ' +
        '<a href="mailto:jennaliam2027@gmail.com">Contact us</a> to ask for help!</p>';
      return;
    }
    // Fallback mode only: start looking up each person's party in the
    // background right away, so it's usually ready by the time they tap.
    // (With the guest list loaded, parties are already on hand.)
    if (guestListUnavailable && guests.length <= 5) {
      for (var p = 0; p < guests.length; p++) {
        loadParty(guests[p].guestId);
      }
    }
    var html = '';
    for (var i = 0; i < guests.length; i++) {
      var done = !!guests[i].hasResponded;
      html += '<button type="button" class="search-result-item' + (done ? ' search-result-item--done' : '') + '" ' +
        'data-guest-id="' + guests[i].guestId + '" ' +
        'data-party-id="' + guests[i].partyId + '" ' +
        'data-name="' + escapeHTML(guests[i].displayName) + '"' +
        (done ? ' data-responded="true"' : '') + '>' +
        '<span>' + escapeHTML(guests[i].displayName) + '</span>' +
        (done ? '<span class="search-result-tag">Already RSVPed</span>' : '') + '</button>';
    }
    container.innerHTML = html;

    var items = container.querySelectorAll('.search-result-item');
    for (var j = 0; j < items.length; j++) {
      items[j].addEventListener('click', onGuestSelected);
    }
  }

  function onGuestSelected(e) {
    var btn = e.currentTarget;
    var guest = {
      guestId: btn.getAttribute('data-guest-id'),
      partyId: btn.getAttribute('data-party-id'),
      displayName: btn.getAttribute('data-name')
    };
    // Already RSVPed: offer to email them a link to their RSVP
    if (btn.getAttribute('data-responded') === 'true') {
      showAlreadyRsvped(guest);
      return;
    }
    state.selectedGuest = guest;
    // Move off the search screen to a separate loading screen while we look
    // up their party (often instant, thanks to the background lookup above).
    showLoadingScreen();
    fetchParty(state.selectedGuest.guestId);
  }

  /* ---------- Loading screen (between search and the party steps) ---------- */
  function showLoadingScreen(caption) {
    hideAllSteps();
    document.getElementById('loading-content').innerHTML =
      partyLoaderHTML(caption || 'Finding your party&hellip;');
    var el = document.getElementById('step-loading');
    el.classList.add('active');
    setIntroVisible(false);
  }

  function showLoadingError(message) {
    document.getElementById('loading-content').innerHTML =
      '<p class="no-results">' + (message || 'We had trouble loading your party. Please check your connection and try again.') + '</p>' +
      '<div class="step-nav step-nav--center">' +
        '<button type="button" class="step-btn step-btn--next" id="loading-back">Back to search</button>' +
      '</div>';
    document.getElementById('loading-back').addEventListener('click', function () {
      document.getElementById('rsvp-progress').style.display = '';
      goToStep('1');
    });
  }

  /* ---------- Party lookup ---------- */

  // Build someone's party from the loaded guest list (same shape as the
  // answer Google's getParty gives). Returns null if they aren't found.
  function partyFromList(list, guestId) {
    var me = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].guestId === guestId) { me = list[i]; break; }
    }
    if (!me) return null;
    var members = [];
    for (var j = 0; j < list.length; j++) {
      if (list[j].partyId === me.partyId) members.push(list[j]);
    }
    return { partyId: me.partyId, members: members, partnershipStatus: me.partnershipStatus || '' };
  }

  function loadParty(guestId) {
    if (guestListPromise && !guestListUnavailable) {
      return guestListPromise.then(function (list) {
        return partyFromList(list, guestId) || loadPartyOnline(guestId);
      }, function () {
        return loadPartyOnline(guestId);
      });
    }
    return loadPartyOnline(guestId);
  }

  // Fallback: ask Google for the party. Saved by guest ID so each one is
  // only fetched once.
  var partyCache = {};

  function loadPartyOnline(guestId) {
    if (!partyCache[guestId]) {
      var url = APPS_SCRIPT_URL + '?action=getParty&guestId=' + encodeURIComponent(guestId);
      partyCache[guestId] = fetchJSON(url).catch(function (err) {
        delete partyCache[guestId]; // don't keep a failed lookup; try fresh next time
        throw err;
      });
    }
    return partyCache[guestId];
  }

  /* ---------- Step 2: Party Members ---------- */
  function fetchParty(guestId) {
    loadParty(guestId)
      .then(function (data) {
        // Ignore a lookup that finishes after the guest went back to search
        if (!state.selectedGuest || state.selectedGuest.guestId !== guestId) return;
        setUpParty(data, guestId);
      })
      .catch(function () {
        if (!state.selectedGuest || state.selectedGuest.guestId !== guestId) return;
        showLoadingError();
      });
  }

  // Set the special song question based on married vs. partner
  function setSpecialSongHeading() {
    if (state.partnershipStatus === 'married') {
      document.getElementById('special-song-heading').textContent =
        'What was your first dance song at your wedding?';
    } else if (state.partnershipStatus === 'partner') {
      document.getElementById('special-song-heading').textContent =
        "What's a song that's special to you and your partner?";
    }
  }

  // Load a party into the form and open the first step of part 1.
  // reopenIds (optional): guests who already RSVPed "can't make it" and came
  // back through their email link. They're treated as not-yet-RSVPed and
  // pre-chosen, so they can update their answer.
  function setUpParty(data, guestId, reopenIds) {
    state.partyMembers = [];
    state.declining = false;
    state.inExtras = false;
    state.finished = false;
    state.pendingCode = null;  // a different party means a new RSVP
    for (var i = 0; i < data.members.length; i++) {
      var m = data.members[i];
      var defaultAttending = m.rehearsalDinner ? 'wedding-and-rehearsal' : 'yes';
      var alreadyResponded = m.hasResponded === true || String(m.hasResponded).toUpperCase() === 'TRUE';
      var reopened = !!reopenIds && reopenIds.indexOf(m.guestId) !== -1;
      state.partyMembers.push({
        guestId: m.guestId,
        displayName: m.displayName,
        relationship: String(m.relationship || '').toLowerCase(),
        rehearsalDinner: !!m.rehearsalDinner,
        attending: defaultAttending,
        hasResponded: alreadyResponded && !reopened,
        // Pre-chosen for today's RSVP: the person who searched (or, from an
        // email link, everyone on that RSVP)
        includedToday: reopenIds ? reopened : m.guestId === guestId
      });
    }

    // Set up the step flow based on the guest's partnership status
    state.partnershipStatus = data.partnershipStatus || '';
    buildStepFlow();
    renderProgressDots();
    setSpecialSongHeading();

    // Go to "Who's RSVPing today?" if there's a choice, else straight to step 2
    if (state.stepFlow.indexOf('who') !== -1) {
      renderWhoList();
      goToStep('who');
    } else {
      renderPartyMembers();
      goToStep('2');
    }
  }

  /* ---------- Your RSVP page (rsvp.html?code=...) ---------- */
  // Every email has a private link to the guest's RSVP. It opens a summary of
  // what they told us, in three cards: Attendance, Dinner, and Optional
  // answers. Each can be changed until its deadline:
  //   - who's coming (yes or no): until May 24, 2027
  //   - dinner and optional answers: until July 14, 2027
  // (The script decides whether each deadline has passed; see getRsvpByCode.)

  // Line icons for the summary's action buttons (on phones they show as
  // round icon buttons; on bigger screens, as small text links)
  var ACTION_ICONS = {
    edit: '<path d="M4.5 15.5 L5.5 11.8 L13 4.3 a1.5 1.5 0 0 1 2.1 0 l0.6 0.6 a1.5 1.5 0 0 1 0 2.1 L8.2 14.5 Z M11.8 5.5 L14.5 8.2"/>',
    remove: '<path d="M4 6 H16 M8 6 V4.2 H12 V6 M5.8 6 L6.6 16 H13.4 L14.2 6 M8.6 9 V13 M11.4 9 V13"/>',
    move: '<path d="M10 17.5 C10 17.5 4.8 12.4 4.8 8.6 a5.2 5.2 0 0 1 10.4 0 C15.2 12.4 10 17.5 10 17.5 Z"/><circle cx="10" cy="8.6" r="1.9"/>',
    add: '<path d="M10 4.5 V15.5 M4.5 10 H15.5"/>'
  };

  function actionButton(action, icon, text, label) {
    return '<button type="button" class="summary-action" data-action="' + action + '" aria-label="' + escapeHTML(label) + '">' +
      '<svg class="summary-action-icon" viewBox="0 0 20 20" aria-hidden="true">' + ACTION_ICONS[icon] + '</svg>' +
      '<span class="summary-action-text">' + text + '</span></button>';
  }

  // Load an RSVP from its code and show the Your RSVP page.
  // opts.saved: show the "Changes saved!" version
  function startFromCode(code, opts) {
    state.fromLink = true;  // nothing to save in this tab: it's all in the RSVP sheet
    state.rsvpCode = code;
    document.getElementById('rsvp-progress').style.display = 'none';
    showLoadingScreen('Finding your RSVP&hellip;');
    loadSummaryData(code)
      .then(function () { renderSummary(opts || {}); })
      .catch(function () {
        showLoadingError('We couldn&rsquo;t open that RSVP link. You can search for your name instead.');
      });
  }

  function loadSummaryData(code) {
    return fetchJSON(APPS_SCRIPT_URL + '?action=getRsvpByCode&code=' + encodeURIComponent(code), 30000)
      .then(function (data) {
        if (!data.members) throw new Error(data.error || 'Not found');
        state.summary = data;
        var submitter = null;
        for (var i = 0; i < data.members.length; i++) {
          if (data.members[i].guestId === data.submittedBy) submitter = data.members[i];
        }
        submitter = submitter || data.members[0];
        state.selectedGuest = { guestId: submitter.guestId, partyId: data.partyId, displayName: submitter.displayName };
        state.partnershipStatus = data.partnershipStatus || '';
        setSpecialSongHeading();
        return data;
      });
  }

  // The people on this RSVP, and which of them are coming
  function summaryMembers() {
    return state.summary.members.filter(function (m) { return m.inCode; });
  }
  function summaryComing() {
    return summaryMembers().filter(function (m) { return m.attending && m.attending !== 'no'; });
  }

  function attendingText(value) {
    if (value === 'wedding-and-rehearsal') return 'Wedding & rehearsal dinner';
    if (value === 'wedding-only') return 'Wedding only';
    if (value === 'yes') return 'Attending';
    return 'Can’t make it';
  }

  function renderSummary(opts) {
    var d = state.summary;
    var members = summaryMembers();
    var coming = summaryComing();
    var anyoneComing = coming.length > 0;
    var partnered = state.partnershipStatus === 'married' || state.partnershipStatus === 'partner';

    // Heading and subheader
    document.getElementById('summary-check').hidden = !opts.saved;
    document.getElementById('summary-heading').textContent = opts.saved ? 'Changes saved!' : 'Your RSVP';
    var sub, small = 'Questions? Reply to your confirmation email and we’ll help.';
    if (opts.saved) {
      sub = 'We’ve emailed you an updated copy of your RSVP.';
    } else if (!d.editsOpen || (!anyoneComing && !d.attendanceOpen)) {
      sub = 'RSVP changes closed on ' + (anyoneComing ? 'July 14' : 'May 24') + '. If something has changed, reply to your confirmation email and we’ll sort it out.';
      small = 'See you in July!';
    } else if (!d.attendanceOpen) {
      sub = 'Changes to who’s coming closed on May 24. You can still update dinner choices and your other answers until July 14, 2027.';
      small = 'Plans changed? Reply to your confirmation email and we’ll help.';
    } else if (anyoneComing) {
      sub = 'Here’s what we have for your party. You can change who’s coming until May 24, 2027, and everything else until July 14, 2027.';
    } else {
      sub = 'Here’s what we have for your party. You can change your RSVP until May 24, 2027.';
    }
    document.getElementById('summary-subheader').textContent = sub;
    document.getElementById('summary-small').textContent = small;

    var html = '';

    // Attendance
    html += '<section class="summary-card"><div class="summary-card-head"><h4>Attendance</h4>' +
      (d.attendanceOpen ? actionButton('edit-attendance', 'edit', 'Edit', 'Edit attendance') : '') + '</div>';
    members.forEach(function (m) {
      html += '<div class="summary-row"><p class="summary-name">' + escapeHTML(m.displayName) + '</p>' +
        '<p class="summary-detail">' + escapeHTML(attendingText(m.attending)) + '</p></div>';
    });
    html += '</section>';

    if (anyoneComing) {
      // Dinner
      html += '<section class="summary-card"><div class="summary-card-head"><h4>Dinner</h4>' +
        (d.editsOpen ? actionButton('edit-dinner', 'edit', 'Edit', 'Edit dinner choices') : '') + '</div>';
      coming.forEach(function (m) {
        html += '<div class="summary-row"><p class="summary-name">' + escapeHTML(m.displayName) + '</p>' +
          '<p class="summary-detail">' + escapeHTML(m.mealChoice || 'Not chosen yet') + '</p>' +
          (m.dietaryRestrictions ? '<p class="summary-note">Dietary: ' + escapeHTML(m.dietaryRestrictions) + '</p>' : '') +
          '</div>';
      });
      html += '</section>';

      // Optional answers: each has its own actions
      html += '<section class="summary-card"><div class="summary-card-head"><h4>Optional answers</h4></div>';
      html += answerRow('Song requests', d.songRequest, d.editsOpen ? (d.songRequest
        ? actionButton('edit-songs', 'edit', 'Edit', 'Edit song requests')
        : actionButton('edit-songs', 'add', 'Add', 'Add song requests')) : '');
      if (partnered) {
        html += answerRow('Special song', d.specialSong, d.editsOpen ? (d.specialSong
          ? actionButton('edit-special', 'edit', 'Edit', 'Edit your special song')
          : actionButton('edit-special', 'add', 'Add', 'Add your special song')) : '');
      }
      // Photos: a small gallery. Each has an x to remove it; + adds more.
      var photos = d.photos || [];
      var gallery = '<div class="summary-photos" id="summary-photos">';
      photos.forEach(function (ph, i) {
        gallery += '<div class="upload-thumb"><img src="' + escapeHTML(ph.url) + '" alt="Your photo ' + (i + 1) + '" loading="lazy">' +
          (d.editsOpen ? '<button type="button" class="upload-thumb-remove" data-action="remove-photo" data-id="' + escapeHTML(ph.id) + '" aria-label="Remove photo ' + (i + 1) + '">&times;</button>' : '') +
          '</div>';
      });
      if (d.editsOpen) gallery += '<button type="button" class="upload-add" data-action="add-photo" aria-label="Add photos">+</button>';
      gallery += '</div><p class="summary-status" id="summary-photo-status" role="status"></p>';
      if (!photos.length && !d.editsOpen) gallery = '<p class="summary-detail summary-empty">None</p>';
      html += '<div class="summary-answer summary-answer--stacked"><div class="summary-answer-text">' +
        '<p class="summary-label">Photos</p>' + gallery + '</div></div>';
      // Map pin
      var pinActions = '';
      if (d.editsOpen) {
        pinActions = d.pin
          ? actionButton('move-pin', 'move', 'Move', 'Move your map pin') + actionButton('remove-pin', 'remove', 'Remove', 'Remove your map pin')
          : actionButton('move-pin', 'add', 'Add', 'Add your map pin');
      }
      html += answerRow('Map pin', d.pin ? (d.pin.city || 'Added') : '', pinActions, 'Not added yet');
      html += '</section>';
    }

    document.getElementById('summary-cards').innerHTML = html;
    state.edit = null;
    showScreen('step-summary');
  }

  function answerRow(label, value, actions, emptyText) {
    return '<div class="summary-answer"><div class="summary-answer-text">' +
      '<p class="summary-label">' + escapeHTML(label) + '</p>' +
      '<p class="summary-detail' + (value ? '' : ' summary-empty') + '">' + escapeHTML(value || emptyText || 'Not answered yet') + '</p>' +
      '</div>' + (actions ? '<div class="summary-actions">' + actions + '</div>' : '') + '</div>';
  }

  // Show one screen that isn't part of a step flow
  function showScreen(id) {
    hideAllSteps();
    var el = document.getElementById(id);
    el.style.display = '';
    el.classList.add('active');
    document.getElementById('rsvp-progress').style.display = 'none';
    document.getElementById('edit-eyebrow').hidden = true;
    document.getElementById('rsvp-form-container').classList.remove('is-editing');
    setIntroVisible(false);
    document.getElementById('rsvp-form-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // The summary's buttons
  function onSummaryClick(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    if (action === 'edit-attendance') startEdit('attendance');
    else if (action === 'edit-dinner') startEdit('dinner');
    else if (action === 'edit-songs') startEdit('songs');
    else if (action === 'edit-special') startEdit('special');
    else if (action === 'add-photo') document.getElementById('summary-photo-input').click();
    else if (action === 'remove-photo') removeSummaryPhoto(btn.getAttribute('data-id'));
    else if (action === 'move-pin') goToMap();
    else if (action === 'remove-pin') removeSummaryPin();
  }

  // Reload the RSVP from the sheet, then redraw the summary
  function refreshSummary(opts) {
    return loadSummaryData(state.rsvpCode).then(function () { renderSummary(opts || {}); });
  }

  // Photos added on the Your RSVP page upload right away, one at a time
  function uploadSummaryPhotos(fileList) {
    var files = [], skipped = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      if (f.size > MAX_PHOTO_SIZE || !f.type.match(/^image\/(jpeg|png|webp)$/)) skipped.push(f.name);
      else files.push(f);
    }
    if (skipped.length) {
      showModal('Some photos weren’t added',
        'Photos need to be a JPG, PNG, or WebP under 10 MB. These weren’t added: ' + skipped.join(', '));
    }
    if (!files.length) return;
    var status = document.getElementById('summary-photo-status');
    var done = 0, failed = 0;
    function next() {
      if (done + failed === files.length) {
        status.textContent = '';
        if (failed) showModal('Some photos didn’t upload', (files.length - failed) + ' of ' + files.length + ' uploaded. Please try the rest again.');
        refreshSummary().catch(function () {});
        return;
      }
      status.textContent = files.length > 1 ? 'Uploading ' + (done + failed + 1) + ' of ' + files.length + '…' : 'Uploading…';
      uploadPhoto(files[done + failed])
        .then(function () { done++; }, function () { failed++; })
        .then(next);
    }
    next();
  }

  function removeSummaryPhoto(fileId) {
    var status = document.getElementById('summary-photo-status');
    if (status) status.textContent = 'Removing…';
    postToScript({ action: 'removePhoto', code: state.rsvpCode, fileId: fileId })
      .then(function () { return refreshSummary(); })
      .catch(function () {
        if (status) status.textContent = '';
        showModal('Something went wrong', 'We couldn’t remove that photo. Please try again.');
      });
  }

  // Add or move their pin: open the map (their pin is labeled with their name)
  function goToMap() {
    try { sessionStorage.setItem('rsvpPinName', state.selectedGuest.displayName); } catch (e) {}
    window.location.href = 'travel.html?addpin=true&code=' + encodeURIComponent(state.rsvpCode);
  }

  function removeSummaryPin() {
    fetchJSON(APPS_SCRIPT_URL + '?action=removePin&code=' + encodeURIComponent(state.rsvpCode))
      .then(function () { return refreshSummary(); })
      .catch(function () {
        showModal('Something went wrong', 'We couldn’t remove your pin. Please try again.');
      });
  }

  /* ---------- Changing an RSVP (from the Your RSVP page) ---------- */
  // Each card's Edit opens the same form steps guests already know, with
  // their answers filled in. The last step's button says "Save changes", and
  // saving goes straight back to the summary.
  //   attendance: "Can you make it?" (+ the +1's name, and dinner for anyone
  //               who wasn't coming before, if needed)
  //   dinner:     the dinner step
  //   songs / special: that song question

  function startEdit(mode) {
    var d = state.summary;
    state.edit = { mode: mode, history: [] };
    state.partyMembers = summaryMembers().map(function (m) {
      var isPlusOne = m.relationship === 'plusone';
      return {
        guestId: m.guestId,
        displayName: m.displayName,
        relationship: m.relationship,
        rehearsalDinner: !!m.rehearsalDinner,
        attending: m.attending || 'no',
        wasAttending: m.attending || 'no',
        hasResponded: false,
        includedToday: true,
        plusOneName: isPlusOne && m.displayName && m.displayName !== 'Guest' ? m.displayName : ''
      };
    });
    state.mealChoices = {};
    state.dietaryRestrictions = {};
    summaryMembers().forEach(function (m) {
      state.mealChoices[m.guestId] = m.mealChoice || '';
      state.dietaryRestrictions[m.guestId] = m.dietaryRestrictions || '';
    });
    document.getElementById('meal-selections').innerHTML = '';  // start fresh from the saved answers
    document.getElementById('song-request').value = d.songRequest || '';
    document.getElementById('special-song-input').value = d.specialSong || '';

    document.getElementById('edit-eyebrow').hidden = false;
    document.getElementById('rsvp-form-container').classList.add('is-editing');
    if (mode === 'attendance') { renderPartyMembers(); showEditStep('2'); }
    if (mode === 'dinner') { renderMealSelections(); showEditStep('3'); }
    if (mode === 'songs') showEditStep('songs');
    if (mode === 'special') showEditStep('special-song');
  }

  function showEditStep(stepId) {
    hideAllSteps();
    var el = document.getElementById('step-' + stepId);
    el.style.display = '';
    el.classList.add('active');
    state.currentStep = stepId;
    document.getElementById('rsvp-progress').style.display = 'none';
    setIntroVisible(false);
    updateEditButtons();
    document.getElementById('rsvp-form-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // After the attendance step: is a +1 name or a dinner choice still needed?
  function editNeedsPlusOneName() {
    return getTodayPlusOnes().some(function (m) {
      return m.attending !== 'no' && (!m.plusOneName || m.plusOneName.split(' ').length < 2);
    });
  }
  function editNeedsDinner() {
    return getSelectedMembers().some(function (m) { return !state.mealChoices[m.guestId]; });
  }

  // The main button says "Save changes" on the last step, "Continue" before it
  function updateEditButtons() {
    if (!state.edit) return;
    var step = state.currentStep;
    var last = true;
    if (step === '2') last = !editNeedsPlusOneName() && !editNeedsDinner();
    if (step === 'plusone') last = !editNeedsDinner();
    var btn = document.querySelector('#step-' + step + ' .step-btn[data-dir="next"], #step-' + step + ' #submit-rsvp');
    if (btn) btn.textContent = last ? 'Save changes' : 'Continue';
  }

  // Continue / Save changes while editing
  function editNext() {
    var step = state.currentStep;
    if (!validateCurrentStep()) return;
    if (step === '2' && editNeedsPlusOneName()) {
      state.edit.history.push(step);
      renderPlusOneFields();
      showEditStep('plusone');
      return;
    }
    if ((step === '2' || step === 'plusone') && editNeedsDinner()) {
      state.edit.history.push(step);
      state.edit.usedDinner = true;
      renderMealSelections();
      showEditStep('3');
      return;
    }
    saveEdit();
  }

  // Back while editing: the step before, or the summary
  function editBack() {
    var prev = state.edit.history.pop();
    if (prev) {
      if (prev === '2') renderPartyMembers();
      showEditStep(prev);
    } else {
      renderSummary({});
    }
  }

  function saveEdit() {
    var mode = state.edit.mode;
    var payload = { action: 'updateRsvp', code: state.rsvpCode };
    if (mode === 'songs') payload.songRequest = document.getElementById('song-request').value.trim();
    if (mode === 'special') payload.specialSong = document.getElementById('special-song-input').value.trim();
    if (mode === 'attendance' || mode === 'dinner') {
      if (mode === 'dinner' || state.edit.usedDinner) collectMealData();
      payload.guests = state.partyMembers.map(function (m) {
        var g = { guestId: m.guestId };
        if (mode === 'attendance') {
          g.attending = m.attending;
          if (m.relationship === 'plusone' && m.plusOneName) g.guestName = m.plusOneName;
        }
        if (m.attending !== 'no' && (mode === 'dinner' || state.edit.usedDinner)) {
          g.mealChoice = state.mealChoices[m.guestId] || '';
          g.dietaryRestrictions = state.dietaryRestrictions[m.guestId] || '';
        }
        return g;
      });
    }
    var everyoneOut = mode === 'attendance' && state.partyMembers.every(function (m) { return m.attending === 'no'; }) &&
      state.partyMembers.some(function (m) { return m.wasAttending !== 'no'; });

    showPageLoader('Saving your changes&hellip;');
    // Saving the same changes twice is harmless, so backup copies are fine
    fetchJSON(APPS_SCRIPT_URL, 30000, 8000, JSON.stringify(payload))
      .then(function () { return loadSummaryData(state.rsvpCode); })
      .then(function () {
        hidePageLoader();
        if (everyoneOut) {
          // Everyone switched to "can't make it": the "We'll miss you" screen
          document.getElementById('decline-art').innerHTML = vineLoaderSVG('confirm-art confirm-art--vine');
          document.getElementById('decline-text').textContent = 'Thanks for letting us know. We’ve updated your RSVP, and we’ll find another time to see each other!';
          document.getElementById('decline-small').textContent = 'If your plans change again, you can update your RSVP from your email until May 24, 2027.';
          state.edit = null;
          showScreen('step-decline');
        } else {
          renderSummary({ saved: true });
        }
      })
      .catch(function () {
        hidePageLoader();
        showModal('We couldn’t save your changes', 'Please check your connection and try again. (If they already went through, they won’t be saved twice.)');
      });
  }

  /* ---------- Already RSVPed (picked their name in the search) ---------- */
  // We don't show anything about their RSVP here. Instead we email a private
  // link to the address used for their RSVP (partly hidden on screen, so they
  // know which inbox to check).

  function showAlreadyRsvped(guest) {
    state.alreadyGuest = guest;
    var text = document.getElementById('already-text');
    var buttons = document.getElementById('already-buttons');
    var sendBtn = document.getElementById('already-send');
    text.textContent = 'Want to see your RSVP or make changes? We’ll email a private link to the address used for your RSVP.';
    sendBtn.hidden = false;
    sendBtn.disabled = false;
    buttons.hidden = false;
    showScreen('step-already');
    fetchJSON(APPS_SCRIPT_URL + '?action=rsvpLinkHint&guestId=' + encodeURIComponent(guest.guestId))
      .then(function (data) {
        if (state.alreadyGuest !== guest) return;
        if (data.masked) {
          state.alreadyMasked = data.masked;
          text.textContent = 'Want to see your RSVP or make changes? We’ll email a private link to the address used for your RSVP: ' + data.masked;
        } else {
          text.textContent = 'We don’t have an email address for your RSVP, so we can’t send you a link. Write to us and we’ll help.';
          sendBtn.hidden = true;
        }
      })
      .catch(function () {});
  }

  function sendRsvpLink(isResend) {
    var guest = state.alreadyGuest;
    if (!guest) return;
    var btn = document.getElementById(isResend ? 'link-resend' : 'already-send');
    btn.disabled = true;
    postToScript({ action: 'sendRsvpLink', guestId: guest.guestId })
      .then(function () {
        document.getElementById('link-sent-text').textContent = 'We sent a link to ' + (state.alreadyMasked || 'your email') +
          '. It can take a few minutes to arrive, so check your spam folder too.';
        if (isResend) {
          btn.textContent = 'Sent again';
          setTimeout(function () { btn.textContent = 'Send it again'; btn.disabled = false; }, 4000);
        } else {
          btn.disabled = false;
          showScreen('step-link-sent');
        }
      })
      .catch(function () {
        btn.disabled = false;
        showModal('Something went wrong', 'We couldn’t send the link. Please check your connection and try again.');
      });
  }

  /* ---------- Step: Who's RSVPing today? ---------- */

  // Everyone in the party who hasn't RSVPed yet
  function getAvailableMembers() {
    var list = [];
    for (var i = 0; i < state.partyMembers.length; i++) {
      if (!state.partyMembers[i].hasResponded) list.push(state.partyMembers[i]);
    }
    return list;
  }

  // Just the people chosen on the "Who's RSVPing today?" step
  function getTodayMembers() {
    var list = [];
    for (var i = 0; i < state.partyMembers.length; i++) {
      if (state.partyMembers[i].includedToday) list.push(state.partyMembers[i]);
    }
    return list;
  }

  // A plus-one doesn't have a real name yet, so show it as "Andrea's +1"
  // (or the name they've typed on the +1 step, if they've been there)
  function whoLabel(m) {
    if (m.relationship === 'plusone' && !m.hasResponded) {
      if (m.plusOneName) return m.plusOneName;
      var first = state.selectedGuest ? state.selectedGuest.displayName.split(' ')[0] : 'Guest';
      return first + '’s +1';
    }
    return m.displayName;
  }

  // Checks the "Who's RSVPing today?" choices. Returns a message if something
  // needs fixing, or '' if it's fine to continue.
  //
  // Kids and +1s can't search for their own name (a parent or the main guest
  // RSVPs for them). So if someone leaves a kid or +1 unchecked, there has to
  // be another adult in the party who hasn't RSVPed yet and could include
  // them later. Otherwise they'd be stuck with no way to RSVP.
  function checkWhoStep() {
    if (getTodayMembers().length === 0) {
      return 'Choose at least one person to RSVP for.';
    }
    var adultLeftForLater = false;
    var stranded = [];
    for (var i = 0; i < state.partyMembers.length; i++) {
      var m = state.partyMembers[i];
      if (m.hasResponded || m.includedToday) continue;
      if (m.relationship === 'child' || m.relationship === 'plusone') {
        stranded.push(whoLabel(m));
      } else {
        adultLeftForLater = true;
      }
    }
    if (stranded.length === 0 || adultLeftForLater) return '';

    var names = stranded.length === 1 ? stranded[0]
      : stranded.slice(0, -1).join(', ') + ' and ' + stranded[stranded.length - 1];
    return 'Since no one else in your party is left to RSVP, please include ' + names +
      '. You can mark ' + (stranded.length === 1 ? 'them' : 'anyone') +
      ' as “Can’t come” on the next step if needed.';
  }

  // Shows (or clears, if message is empty) the inline message under the list
  function showWhoError(message) {
    var el = document.getElementById('who-error');
    el.textContent = message || '';
    el.hidden = !message;
  }

  function renderWhoList() {
    showWhoError('');
    var container = document.getElementById('who-list');
    var html = '';
    for (var i = 0; i < state.partyMembers.length; i++) {
      var m = state.partyMembers[i];
      html += '<label class="who-option' + (m.hasResponded ? ' who-option--done' : '') + '">' +
        '<input type="checkbox" data-index="' + i + '"' +
          (m.includedToday ? ' checked' : '') +
          (m.hasResponded ? ' disabled' : '') + '>' +
        '<span class="who-name">' + escapeHTML(whoLabel(m)) + '</span>' +
        (m.hasResponded ? '<span class="who-note">Already RSVPed</span>' : '') +
      '</label>';
    }
    container.innerHTML = html;

    var boxes = container.querySelectorAll('input[type="checkbox"]');
    for (var j = 0; j < boxes.length; j++) {
      boxes[j].addEventListener('change', function () {
        var idx = parseInt(this.getAttribute('data-index'), 10);
        state.partyMembers[idx].includedToday = this.checked;
        // If the message is showing, update it as they fix things (it
        // disappears once everything's okay)
        if (!document.getElementById('who-error').hidden) showWhoError(checkWhoStep());
      });
    }
  }

  function renderPartyMembers() {
    var container = document.getElementById('party-members');

    // If anyone in the party is invited to the rehearsal dinner, show its
    // details (pulled from the Timeline page) so guests know what they're
    // choosing between.
    var invitedToRehearsal = false;
    for (var r = 0; r < state.partyMembers.length; r++) {
      var rm = state.partyMembers[r];
      if (rm.includedToday && rm.rehearsalDinner) { invitedToRehearsal = true; break; }
    }
    var step2desc = document.getElementById('step-2-desc');
    if (step2desc) {
      if (invitedToRehearsal) {
        step2desc.innerHTML = 'You&rsquo;re invited to the rehearsal dinner on ' +
          '<strong>Friday, July 23 at 5:30 PM</strong> at The Fish Hopper ' +
          '(700 Cannery Row, Monterey). Let us know which events each guest can join.';
        step2desc.style.display = '';
      } else {
        step2desc.style.display = 'none';
      }
    }

    var html = '';

    // Only list the people chosen on the "Who's RSVPing today?" step.
    // (We keep each person's position in the full party list as the index,
    // so the dropdowns update the right person.)
    for (var i = 0; i < state.partyMembers.length; i++) {
      var m = state.partyMembers[i];
      if (!m.includedToday) continue;

      var selectHtml = dropdownHTML(i, attendanceOptions(m), m.attending);

      // A +1 shows by the name entered on the step before
      html += '<div class="party-member-row">' +
        '<span class="party-member-name">' + escapeHTML(whoLabel(m)) + '</span>' +
        selectHtml +
        '</div>';
    }
    container.innerHTML = html;

    // Wire up each custom dropdown
    var dds = container.querySelectorAll('.attend-dd');
    for (var j = 0; j < dds.length; j++) {
      setupDropdown(dds[j]);
    }
  }

  /* ---------- Step: Who's your +1? ---------- */
  // Comes right after "Who's RSVPing today?" (before "Can you make it?"), so
  // the +1 shows by name on the attendance step. Shown whenever a +1 is part
  // of today's RSVP.

  // +1s who are part of today's RSVP
  function getTodayPlusOnes() {
    var list = [];
    for (var i = 0; i < state.partyMembers.length; i++) {
      var m = state.partyMembers[i];
      if (m.includedToday && m.relationship === 'plusone') list.push(m);
    }
    return list;
  }

  // One name field per +1 (almost always just one). If there's more than one,
  // each field is labeled "Hannah's +1 (1)", "(2)", and so on.
  function renderPlusOneFields() {
    var plusOnes = getTodayPlusOnes();
    var first = state.selectedGuest ? state.selectedGuest.displayName.split(' ')[0] : 'Guest';
    var html = '';
    for (var i = 0; i < plusOnes.length; i++) {
      var m = plusOnes[i];
      var idx = state.partyMembers.indexOf(m);
      var label = plusOnes.length > 1
        ? escapeHTML(first) + '&rsquo;s +1 (' + (i + 1) + ')'
        : 'Their name';
      html += '<div class="form-group">' +
        '<label for="plusone-name-' + idx + '">' + label + '</label>' +
        '<input type="text" id="plusone-name-' + idx + '" class="plusone-name" ' +
          'placeholder="First and last name" ' +
          'value="' + escapeHTML(m.plusOneName || '') + '" autocomplete="off">' +
      '</div>';
    }
    document.getElementById('plusone-fields').innerHTML = html;
  }

  // Save what was typed, and use it as the +1's name from here on (on the
  // next steps and in the RSVP sheet). Returns false if a name is missing,
  // or is only one word (we need first and last for the seating chart).
  function collectPlusOneNames() {
    var plusOnes = getTodayPlusOnes();
    var allFilled = true;
    for (var i = 0; i < plusOnes.length; i++) {
      var m = plusOnes[i];
      var input = document.getElementById('plusone-name-' + state.partyMembers.indexOf(m));
      m.plusOneName = input ? input.value.trim().replace(/\s+/g, ' ') : '';
      if (m.plusOneName.split(' ').length < 2) {
        allFilled = false;
      } else {
        m.displayName = m.plusOneName;
      }
    }
    return allFilled;
  }

  /* ---------- Custom attendance dropdown ---------- */
  // Native <select> menus are drawn by the OS and can't be positioned; this is a
  // custom dropdown that opens directly below the field at matching width.

  function attendanceOptions(m) {
    if (m.rehearsalDinner) {
      return [
        { value: 'wedding-and-rehearsal', label: 'Wedding & rehearsal dinner' },
        { value: 'wedding-only', label: 'Wedding only' },
        { value: 'no', label: "Can't come" }
      ];
    }
    return [
      { value: 'yes', label: 'Attending' },
      { value: 'no', label: "Can't come" }
    ];
  }

  function escapeHTML(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function dropdownHTML(index, options, current) {
    var currentLabel = options.length ? options[0].label : '';
    var optsHtml = '';
    for (var i = 0; i < options.length; i++) {
      var o = options[i];
      var sel = o.value === current;
      if (sel) currentLabel = o.label;
      optsHtml += '<li class="attend-dd-option' + (sel ? ' selected' : '') + '" role="option" ' +
        'data-value="' + o.value + '" aria-selected="' + (sel ? 'true' : 'false') + '">' +
        '<span class="attend-dd-check" aria-hidden="true">✓</span>' +
        '<span class="attend-dd-label">' + escapeHTML(o.label) + '</span></li>';
    }
    return '<div class="attend-dd" data-index="' + index + '">' +
      '<button type="button" class="attend-dd-trigger" aria-haspopup="listbox" aria-expanded="false">' +
        '<span class="attend-dd-value">' + escapeHTML(currentLabel) + '</span>' +
        '<span class="attend-dd-caret" aria-hidden="true"></span>' +
      '</button>' +
      '<ul class="attend-dd-menu" role="listbox">' + optsHtml + '</ul>' +
    '</div>';
  }

  function closeAllDropdowns() {
    var open = document.querySelectorAll('.attend-dd.open');
    for (var i = 0; i < open.length; i++) {
      open[i].classList.remove('open');
      var t = open[i].querySelector('.attend-dd-trigger');
      if (t) t.setAttribute('aria-expanded', 'false');
    }
  }

  function setupDropdown(dd) {
    var idx = parseInt(dd.getAttribute('data-index'), 10);
    var trigger = dd.querySelector('.attend-dd-trigger');
    var valueEl = dd.querySelector('.attend-dd-value');
    var options = dd.querySelectorAll('.attend-dd-option');

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var wasOpen = dd.classList.contains('open');
      closeAllDropdowns();
      if (!wasOpen) {
        dd.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });

    for (var i = 0; i < options.length; i++) {
      options[i].addEventListener('click', function () {
        state.partyMembers[idx].attending = this.getAttribute('data-value');
        valueEl.textContent = this.querySelector('.attend-dd-label').textContent;
        for (var k = 0; k < options.length; k++) {
          options[k].classList.remove('selected');
          options[k].setAttribute('aria-selected', 'false');
        }
        this.classList.add('selected');
        this.setAttribute('aria-selected', 'true');
        dd.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        updateEditButtons();  // "Continue" or "Save changes", while editing
      });
    }
  }

  // Of the people RSVPing today: who's coming
  function getSelectedMembers() {
    var selected = [];
    for (var i = 0; i < state.partyMembers.length; i++) {
      if (state.partyMembers[i].includedToday && state.partyMembers[i].attending !== 'no') {
        selected.push(state.partyMembers[i]);
      }
    }
    return selected;
  }

  // Of the people RSVPing today: who can't come. (Party members not chosen
  // today are left out completely, so they can RSVP on their own later.)
  function getUnselectedMembers() {
    var unselected = [];
    for (var i = 0; i < state.partyMembers.length; i++) {
      if (state.partyMembers[i].includedToday && state.partyMembers[i].attending === 'no') {
        unselected.push(state.partyMembers[i]);
      }
    }
    return unselected;
  }

  /* ---------- Step 3: Meal Selections ---------- */
  function renderMealSelections() {
    var container = document.getElementById('meal-selections');
    // Remember any choices already made, so stepping back and forth keeps them
    if (container.querySelector('input')) collectMealData();
    var members = getSelectedMembers();
    var html = '';

    // Adjust heading for single-person parties
    var step3 = document.getElementById('step-3');
    var heading = step3.querySelector('.step-heading');
    var description = step3.querySelector('.step-description');
    if (members.length === 1) {
      heading.textContent = 'Dinner selection';
      description.style.display = 'none';
    } else {
      heading.textContent = 'Dinner selections';
      description.style.display = '';
    }

    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      html += '<div class="meal-guest-group">';
      html += '<h4 class="meal-guest-name">' + escapeHTML(m.displayName) + '</h4>';
      html += '<div class="meal-options">';
      var options = (m.relationship === 'child') ? [KIDS_MEAL].concat(MEAL_OPTIONS) : MEAL_OPTIONS;
      for (var j = 0; j < options.length; j++) {
        var opt = options[j];
        var inputName = 'meal-' + m.guestId;
        var descHtml = opt.description
          ? '<span class="meal-option-description">' + opt.description + '</span>' : '';
        var wasChosen = state.mealChoices[m.guestId] === opt.value;
        html += '<label class="meal-option">' +
          '<input type="radio" name="' + inputName + '" value="' + opt.value + '"' + (wasChosen ? ' checked' : '') + '>' +
          '<span class="meal-option-text">' +
            '<span class="meal-option-header">' + opt.value + '</span>' +
            descHtml +
          '</span>' +
          '</label>';
      }
      html += '</div>';
      html += '<div class="form-group">' +
        '<label class="dietary-label">Dietary restrictions or allergies</label>' +
        '<input type="text" class="dietary-input" data-guest-id="' + m.guestId + '" ' +
        'value="' + escapeHTML(state.dietaryRestrictions[m.guestId] || '') + '" ' +
        'placeholder="e.g., gluten-free, nut allergy">' +
        '</div>';
      html += '</div>';
    }

    container.innerHTML = html;
  }

  function collectMealData() {
    var members = getSelectedMembers();
    state.mealChoices = {};
    state.dietaryRestrictions = {};

    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      var selected = document.querySelector('input[name="meal-' + m.guestId + '"]:checked');
      state.mealChoices[m.guestId] = selected ? selected.value : '';

      var dietaryInput = document.querySelector('.dietary-input[data-guest-id="' + m.guestId + '"]');
      state.dietaryRestrictions[m.guestId] = dietaryInput ? dietaryInput.value.trim() : '';
    }
  }

  /* ---------- Step 4: Photo Upload ---------- */
  // Guests can choose several photos (from the picker, or dragged onto the
  // box on a computer). They show as thumbnails; each can be removed, and the
  // + tile adds more. Nothing uploads until they tap Continue.
  function initPhotoUpload() {
    var dropzone = document.getElementById('upload-dropzone');
    var fileInput = document.getElementById('photo-input');
    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', function () {
      fileInput.click();
    });

    dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', function () {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      addPhotoFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', function () {
      addPhotoFiles(this.files);
      this.value = '';  // so picking the same photo again still works
    });

    // Remove (x) and add more (+), on the thumbnails
    document.getElementById('upload-previews').addEventListener('click', function (e) {
      var removeBtn = e.target.closest('.upload-thumb-remove');
      if (removeBtn) {
        removePhoto(Number(removeBtn.getAttribute('data-index')));
        return;
      }
      if (e.target.closest('.upload-add')) fileInput.click();
    });
  }

  // Add chosen files to the list. Files that are too big or not a photo are
  // left out, with one message naming them.
  function addPhotoFiles(fileList) {
    var skipped = [];
    for (var i = 0; i < fileList.length; i++) {
      var file = fileList[i];
      if (file.size > MAX_PHOTO_SIZE || !file.type.match(/^image\/(jpeg|png|webp)$/)) {
        skipped.push(file.name);
        continue;
      }
      // A quick preview link for the thumbnail (no need to read the whole file yet)
      state.photos.push({ file: file, url: URL.createObjectURL(file) });
    }
    renderPhotoPreviews();
    if (skipped.length) {
      showModal('Some photos weren\u2019t added',
        'Photos need to be a JPG, PNG, or WebP under 10 MB. These weren\u2019t added: ' + escapeHTML(skipped.join(', ')));
    }
  }

  function removePhoto(index) {
    var photo = state.photos[index];
    if (!photo) return;
    URL.revokeObjectURL(photo.url);  // frees the preview's memory
    state.photos.splice(index, 1);
    renderPhotoPreviews();
  }

  function clearPhotos() {
    while (state.photos.length) removePhoto(0);
  }

  // Show the chosen photos as thumbnails (or the browse box if there are none)
  function renderPhotoPreviews() {
    var previews = document.getElementById('upload-previews');
    var dropzone = document.getElementById('upload-dropzone');
    if (!state.photos.length) {
      previews.hidden = true;
      previews.innerHTML = '';
      dropzone.style.display = '';
      return;
    }
    var html = '';
    for (var i = 0; i < state.photos.length; i++) {
      html += '<div class="upload-thumb">' +
        '<img src="' + state.photos[i].url + '" alt="">' +
        '<button type="button" class="upload-thumb-remove" data-index="' + i + '" aria-label="Remove photo ' + (i + 1) + '">&times;</button>' +
        '</div>';
    }
    html += '<button type="button" class="upload-add" aria-label="Add more photos">+</button>';
    previews.innerHTML = html;
    previews.hidden = false;
    dropzone.style.display = 'none';
  }

  /* ---------- Submission ---------- */
  // Part 1's Submit button (on the dinner step). Saves the RSVP; the optional
  // song and photo answers are saved separately in part 2.
  function submitRsvp() {
    collectMealData();

    var members = getSelectedMembers();
    var unselected = getUnselectedMembers();
    var guests = [];
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      guests.push({
        guestId: m.guestId,
        guestName: m.displayName,
        attending: m.attending,
        mealChoice: state.mealChoices[m.guestId] || '',
        dietaryRestrictions: state.dietaryRestrictions[m.guestId] || '',
        songRequest: ''  // filled in later, if they answer part 2
      });
    }
    // Record unchecked party members as not attending
    for (var k = 0; k < unselected.length; k++) {
      guests.push({
        guestId: unselected[k].guestId,
        guestName: unselected[k].displayName,
        attending: 'no',
        mealChoice: '',
        dietaryRestrictions: '',
        songRequest: ''
      });
    }

    var payload = {
      action: 'submitRsvp',
      partyId: state.selectedGuest.partyId,
      submittedBy: state.selectedGuest.guestId,
      specialSong: '',  // filled in later, if they answer part 2
      email: state.email,
      guests: guests
    };

    var submitBtn = document.getElementById('submit-rsvp');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    showPageLoader('Sending your RSVP&hellip;');

    sendRsvp(payload)
      .then(function (data) {
        hidePageLoader();
        // This RSVP's private code: used to send their confirmation email
        // once they finish (or skip) the optional questions
        state.rsvpCode = data.code || payload.code;
        // Remember who's coming, so part 2 answers go on their rows in the sheet
        state.extrasGuestIds = [];
        for (var e = 0; e < members.length; e++) state.extrasGuestIds.push(members[e].guestId);
        setConfirmation('rsvp');
        showTerminalStep('step-confirmation');
        fetchAttendees();
      })
      .catch(function () {
        hidePageLoader();
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit RSVP';
        showModal('We couldn\u2019t confirm your RSVP', 'Please check your connection and tap Submit again. (If it already went through, it won\u2019t be saved twice.)');
      });
  }

  // "Can't make it" for everyone RSVPing today: saved from the email step,
  // so we have an address to send their "We'll miss you" email (which has a
  // link to update their RSVP if plans change). The rest of the party isn't
  // touched, so they can still RSVP on their own.
  function submitDecline() {
    var today = getTodayMembers();
    var guests = [];
    for (var i = 0; i < today.length; i++) {
      guests.push({
        guestId: today[i].guestId,
        guestName: today[i].displayName,
        attending: 'no',
        mealChoice: '',
        dietaryRestrictions: '',
        songRequest: ''
      });
    }

    var payload = {
      action: 'submitRsvp',
      partyId: state.selectedGuest.partyId,
      submittedBy: state.selectedGuest.guestId,
      email: state.email,
      guests: guests
    };

    var btn = document.querySelector('#step-email [data-dir="next"]');
    btn.disabled = true;
    btn.textContent = 'Submitting...';
    showPageLoader('Sending your RSVP&hellip;');

    sendRsvp(payload)
      .then(function () {
        hidePageLoader();
        btn.disabled = false;
        btn.textContent = 'Continue';
        document.getElementById('decline-art').innerHTML = vineLoaderSVG('confirm-art confirm-art--vine');
        showTerminalStep('step-decline');
      })
      .catch(function () {
        hidePageLoader();
        btn.disabled = false;
        btn.textContent = 'Submit RSVP';
        showModal('We couldn\u2019t confirm your RSVP', 'Please check your connection and try again. (If it already went through, it won\u2019t be saved twice.)');
      });
  }

  // Sends answers to the script (a POST), stopping as soon as the script has
  // run, without waiting for its reply.
  //
  // Why: every request to the script takes two hops. Hop 1 goes to
  // script.google.com, which runs the script (this is where the RSVP gets
  // saved), then answers "go pick up the reply over here". Hop 2 fetches
  // that reply from script.googleusercontent.com. In some browsers (Safari
  // with Apple's privacy relay features, in our testing) hop 2 can hang for
  // a long time even though everything saved fine. When the browser hears
  // back from hop 1 ("opaqueredirect"), the script has finished without
  // errors (if it had failed, there'd be an error page instead), so that's
  // all saves need. Returns { success: true } once it's through.
  // keepalive: true lets the request finish even if the page is being left.
  function postToScript(payload, keepalive) {
    return fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      redirect: 'manual',
      keepalive: !!keepalive
    }).then(function (r) {
      if (r.type === 'opaqueredirect' || r.ok) return { success: true };
      throw new Error('HTTP ' + r.status);
    });
  }

  // Sends an RSVP to the script, with backups if Google is slow to answer.
  // Each RSVP gets its private code here, before sending, and keeps it if
  // they have to try again: the script recognizes a code it has already
  // saved and won't save that RSVP a second time. That makes it safe for
  // the backup copies (and a guest tapping Submit again) to resend it.
  function sendRsvp(payload) {
    if (!state.pendingCode) state.pendingCode = makeCode();
    payload.code = state.pendingCode;
    // Up to 30 seconds per copy; a backup copy after 8 seconds without an answer
    return fetchJSON(APPS_SCRIPT_URL, 30000, 8000, JSON.stringify(payload))
      .then(function (data) {
        if (!data.success) throw new Error('RSVP not saved');
        state.pendingCode = null;  // done: a new RSVP would get a new code
        return data;
      });
  }

  // A random 32-character code (letters a-f and numbers), like the script makes
  function makeCode() {
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  // Uploads one photo. The file is read just before sending, so a phone
  // doesn't have to hold every chosen photo in memory at once.
  function uploadPhoto(file) {
    return readAsBase64(file).then(function (base64) {
      return postToScript({
        action: 'uploadPhoto',
        partyId: state.selectedGuest.partyId,
        code: state.rsvpCode || '',  // links the photo to their RSVP
        fileName: file.name,
        mimeType: file.type,
        base64Data: base64
      });
    });
  }

  // The file's contents as base64 text (the format the script expects)
  function readAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) { resolve(e.target.result.split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ---------- Part 2: optional music & photo questions ---------- */

  // "Sure" on the confirmation screen: start part 2 with its own progress dots
  function startExtras() {
    state.inExtras = true;
    state.finished = false;  // their place in the optional questions is saved too
    buildExtrasFlow();
    renderProgressDots();
    document.getElementById('rsvp-progress').style.display = '';
    goToStep(state.stepFlow[0]);
  }

  // Save the song answers to the RSVP sheet in the background, so whatever
  // guests share is kept even if they leave partway through. Saving the same
  // answers twice is harmless (it just fills in the same cells again).
  function saveExtras() {
    var songRequest = document.getElementById('song-request').value.trim();
    var specialSong = document.getElementById('special-song-input').value.trim();
    if (!songRequest && !specialSong) return Promise.resolve();

    var body = JSON.stringify({
      action: 'submitExtras',
      partyId: state.selectedGuest.partyId,
      guestIds: state.extrasGuestIds || [],
      songRequest: songRequest,
      specialSong: specialSong
    });
    function send() {
      return postToScript(JSON.parse(body));
    }
    // Try once more if the first attempt fails
    return send().catch(function () { return send(); }).catch(function () {});
  }

  // Move to the next part 2 step, or finish if this was the last one
  function nextExtrasStep() {
    var next = getNextStep();
    if (next) {
      goToStep(next);
    } else {
      finishExtras();
    }
  }

  // "Continue" on the photo step: upload the chosen photos one at a time
  // (showing progress), then move on to the last step (the guest map pin).
  // Photos that upload are taken off the list right away, so if some fail,
  // trying again only resends the ones that didn't make it.
  function continueFromPhoto() {
    var btn = document.getElementById('photo-continue');
    if (!state.photos.length) {
      nextExtrasStep();
      return;
    }
    var total = state.photos.length;
    var done = 0;
    var failed = [];
    btn.disabled = true;

    function next() {
      if (!state.photos.length) {
        btn.disabled = false;
        btn.textContent = 'Continue';
        // Put any that failed back on the list (and on screen) to try again
        state.photos = failed;
        renderPhotoPreviews();
        if (failed.length) {
          showModal('Some photos didn\u2019t upload',
            (total - failed.length) + ' of ' + total + ' uploaded. Tap Continue to try the rest again, or skip this step.');
        } else {
          nextExtrasStep();
        }
        return;
      }
      var photo = state.photos.shift();
      btn.textContent = total > 1 ? 'Uploading ' + (done + failed.length + 1) + ' of ' + total + '\u2026' : 'Uploading\u2026';
      uploadPhoto(photo.file)
        .then(function () {
          done++;
          URL.revokeObjectURL(photo.url);
        })
        .catch(function () {
          failed.push(photo);
        })
        .then(next);
    }
    next();
  }

  // Ask the script to send this RSVP's confirmation email. finished = whether
  // they went through the optional questions (if not, the email includes a
  // link to answer them). The script only ever sends one email per RSVP.
  // "keepalive" lets the request finish even if the page is being left
  // (like when "Add your pin" opens the Travel page).
  function sendConfirmationEmail(finished) {
    if (!state.rsvpCode || state.confirmationRequested) return;
    state.confirmationRequested = true;
    postToScript({
      action: 'sendConfirmation',
      code: state.rsvpCode,
      finishedExtras: finished,
      // Last song answers, so the email includes them (saving is harmless)
      songRequest: document.getElementById('song-request').value.trim(),
      specialSong: document.getElementById('special-song-input').value.trim(),
      partyId: state.selectedGuest.partyId,
      guestIds: state.extrasGuestIds || []
    }, true).catch(function () {});  // if this fails, the script's timer sends it later
  }

  // End of part 2 (skipping the pin step): back to the confirmation screen,
  // now the "Thanks for sharing!" version with the dancing couple. ("Add
  // your pin" instead goes to the Travel page; everything they shared is
  // already saved by then.)
  function finishExtras() {
    sendConfirmationEmail(true);
    setConfirmation('finished');
    showTerminalStep('step-confirmation');
    document.getElementById('rsvp-form-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // The confirmation screen's three versions (see the comment in rsvp.html):
  //   'rsvp'     right after the RSVP, inviting them to the optional questions
  //   'later'    they chose "Maybe later"
  //   'finished' they finished the optional questions
  var CONFIRMATION_COPY = {
    rsvp: {
      art: 'dinner',
      heading: 'Got your RSVP!',
      subheader: 'See you in July! We can\u2019t wait to dance with you.'
    },
    later: {
      art: 'dinner',
      heading: 'You\u2019re all set!',
      subheader: 'See you in July! We can\u2019t wait to dance with you.'
    },
    finished: {
      art: 'dance',
      heading: 'Thanks for sharing!',
      subheader: 'We\u2019ll use your answers to help plan the day. See you in July!'
    }
  };

  function setConfirmation(version) {
    var copy = CONFIRMATION_COPY[version];
    document.getElementById('confirm-art-dinner').style.display = copy.art === 'dinner' ? '' : 'none';
    document.getElementById('confirm-art-dance').style.display = copy.art === 'dance' ? '' : 'none';
    document.getElementById('confirm-heading').textContent = copy.heading;
    document.getElementById('confirm-subheader').textContent = copy.subheader;
    // The invite only shows on the first version; the "Maybe later" note and
    // travel tips button only on the second
    document.getElementById('extras-invite').hidden = version !== 'rsvp';
    document.getElementById('confirm-later-note').hidden = version !== 'later';
    document.getElementById('confirm-later-cta').hidden = version !== 'later';
  }

  // "Maybe later": the invite fades out, then the emailed-link note and the
  // "Get travel tips" button fade in where it was (see .confirm-later)
  function chooseMaybeLater() {
    sendConfirmationEmail(false);
    var invite = document.getElementById('extras-invite');
    var heading = document.getElementById('confirm-heading');
    invite.classList.add('is-leaving');
    heading.classList.add('is-leaving');
    setTimeout(function () {
      invite.classList.remove('is-leaving');
      heading.classList.remove('is-leaving');
      setConfirmation('later');
      // The button they pressed is gone, so keep keyboard focus nearby
      document.querySelector('#confirm-later-cta a').focus({ preventScroll: true });
    }, 250);
  }

  /* ---------- Attendee List ---------- */
  function fetchAttendees() {
    var url = APPS_SCRIPT_URL + '?action=getAttendees&excludeParty=' + encodeURIComponent(state.selectedGuest.partyId);
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        renderAttendees(data);
      })
      .catch(function () {});
  }

  function renderAttendees(data) {
    var container = document.getElementById('attendee-list');
    if (!container) return;

    var brideParties = data.bride || [];
    var groomParties = data.groom || [];

    if (brideParties.length === 0 && groomParties.length === 0) {
      return;
    }

    var section = document.getElementById('attendee-section');
    if (section) {
      section.style.display = '';
      // Fade and rise the card into place (see .attendee-section--reveal)
      section.classList.remove('attendee-section--reveal');
      void section.offsetWidth;  // lets the animation restart if shown again
      section.classList.add('attendee-section--reveal');
    }

    // Each party's names fade in shortly after the one before, in reading
    // order, starting once the card has mostly arrived. Capped so long
    // lists don't take ages to finish.
    var partyCount = 0;
    function partyOpenTag() {
      var delay = Math.min(0.25 + partyCount * 0.07, 1.6);
      partyCount++;
      return '<div class="attendee-party" style="animation-delay:' + delay.toFixed(2) + 's">';
    }

    var html = '';

    if (brideParties.length > 0) {
      html += '<div class="attendee-group">';
      html += '<h4 class="attendee-group-heading">Jenna\'s side</h4>';
      for (var i = 0; i < brideParties.length; i++) {
        html += partyOpenTag();
        for (var j = 0; j < brideParties[i].names.length; j++) {
          html += '<p class="attendee-name">' + brideParties[i].names[j] + '</p>';
        }
        html += '</div>';
      }
      html += '</div>';
    }

    if (groomParties.length > 0) {
      html += '<div class="attendee-group">';
      html += '<h4 class="attendee-group-heading">Liam\'s side</h4>';
      for (var i = 0; i < groomParties.length; i++) {
        html += partyOpenTag();
        for (var j = 0; j < groomParties[i].names.length; j++) {
          html += '<p class="attendee-name">' + groomParties[i].names[j] + '</p>';
        }
        html += '</div>';
      }
      html += '</div>';
    }

    container.innerHTML = html;
  }

  /* ---------- Modal ---------- */
  function showModal(heading, message) {
    document.getElementById('modal-heading').textContent = heading;
    document.getElementById('modal-message').textContent = message;
    document.getElementById('modal-overlay').style.display = '';
  }

  function initModal() {
    var overlay = document.getElementById('modal-overlay');
    var closeBtn = document.getElementById('modal-close');
    if (!overlay || !closeBtn) return;

    closeBtn.addEventListener('click', function () {
      overlay.style.display = 'none';
    });

    // Also close when clicking the dark background
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        overlay.style.display = 'none';
      }
    });
  }

  /* ---------- Validation ---------- */
  function validateCurrentStep() {
    if (state.currentStep === 'who') {
      var whoProblem = checkWhoStep();
      showWhoError(whoProblem);
      if (whoProblem) return false;
    }
    if (state.currentStep === 'plusone') {
      if (!collectPlusOneNames()) {
        showModal('Name missing', "Don't forget to enter your +1's first and last name.");
        return false;
      }
    }
    if (state.currentStep === 'email') {
      var emailInput = document.getElementById('guest-email');
      var email = emailInput.value.trim();
      if (!email) {
        showModal('Email missing', 'Please enter your email address so we can send you updates.');
        return false;
      }
      // Basic email format check
      if (email.indexOf('@') === -1 || email.indexOf('.') === -1) {
        showModal('Invalid email', 'Please enter a valid email address.');
        return false;
      }
      state.email = email;
    }
    if (state.currentStep === '3') {
      var members = getSelectedMembers();
      var missingNames = [];
      for (var i = 0; i < members.length; i++) {
        var checked = document.querySelector('input[name="meal-' + members[i].guestId + '"]:checked');
        if (!checked) {
          missingNames.push(members[i].displayName.split(' ')[0]);
        }
      }
      if (missingNames.length > 0) {
        var nameList;
        if (missingNames.length === 1) {
          nameList = missingNames[0];
        } else {
          nameList = missingNames.slice(0, -1).join(', ') + ' and ' + missingNames[missingNames.length - 1];
        }
        showModal('Meal selection missing', "Don't forget to select a meal for " + nameList + ".");
        return false;
      }
    }
    return true;
  }

  /* ---------- Init ---------- */
  function init() {
    if (!document.getElementById('rsvp-form-container')) return;

    // Start loading the guest list right away, while guests read the intro
    loadGuestList();

    initSearch();
    initPhotoUpload();
    initModal();

    // Close any open attendance dropdown when tapping elsewhere
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.attend-dd')) closeAllDropdowns();
    });

    // Render the initial progress dots (4 steps by default)
    renderProgressDots();
    updateProgressDots('1');

    // Regular step buttons are marked with data-dir="prev" / "next"
    var backBtns = document.querySelectorAll('.step-btn[data-dir="prev"]');
    for (var i = 0; i < backBtns.length; i++) {
      backBtns[i].addEventListener('click', function () {
        if (state.edit) { editBack(); return; }
        var prev = getPrevStep();
        if (prev) goToStep(prev);
      });
    }

    var nextBtns = document.querySelectorAll('.step-btn[data-dir="next"]');
    for (var j = 0; j < nextBtns.length; j++) {
      nextBtns[j].addEventListener('click', function () {
        // Changing an RSVP from the Your RSVP page
        if (state.edit) { editNext(); return; }

        // Part 2 steps: save what they've shared so far, then move on
        if (state.currentStep === 'special-song' || state.currentStep === 'songs') {
          saveExtras();
          nextExtrasStep();
          return;
        }

        if (!validateCurrentStep()) return;

        // If no one RSVPing today can come, the email step is the last one
        // (no dinner), and its button saves the "can't make it" RSVP
        if (state.currentStep === '2') {
          state.declining = getSelectedMembers().length === 0;
        }
        if (state.currentStep === 'email' && state.declining) {
          submitDecline();
          return;
        }

        // Who's included and who's coming can change the steps ahead (like
        // whether to ask for a +1's name), so rebuild the step order and dots
        if (state.currentStep === 'who' || state.currentStep === '2') {
          buildStepFlow();
          renderProgressDots();
        }

        var next = getNextStep();
        if (next === 'plusone') renderPlusOneFields();
        // Build "Can you make it?" right before showing it: just the people
        // chosen today, with a +1's name from the step before
        if (next === '2') renderPartyMembers();
        // Build the dinner step right before showing it, so it uses the
        // latest names (including a +1's name from the step before)
        if (next === '3') renderMealSelections();
        // The email step's button submits the RSVP when no one can come
        if (next === 'email') {
          document.querySelector('#step-email [data-dir="next"]').textContent =
            state.declining ? 'Submit RSVP' : 'Continue';
        }
        if (next) goToStep(next);
      });
    }

    // Skip buttons (part 2): clear that step's answer and move on
    var skipBtns = document.querySelectorAll('.step-btn--skip');
    for (var s = 0; s < skipBtns.length; s++) {
      skipBtns[s].addEventListener('click', function () {
        var step = this.closest('.rsvp-step');
        var fields = step.querySelectorAll('input[type="text"], textarea');
        for (var f = 0; f < fields.length; f++) fields[f].value = '';
        if (step.id === 'step-photo') {
          clearPhotos(); // drop any chosen photos
        }
        nextExtrasStep();
      });
    }

    // Part 1's Submit button, on the dinner step
    document.getElementById('submit-rsvp').addEventListener('click', function () {
      if (state.edit) { editNext(); return; }  // "Save changes" while editing
      if (!validateCurrentStep()) return; // e.g. a meal not chosen yet
      submitRsvp();
    });

    // Back buttons that only show while editing (on the song questions)
    var editBackBtns = document.querySelectorAll('[data-edit-back]');
    for (var eb = 0; eb < editBackBtns.length; eb++) {
      editBackBtns[eb].addEventListener('click', function () { if (state.edit) editBack(); });
    }

    // Your RSVP page
    document.getElementById('summary-cards').addEventListener('click', onSummaryClick);
    document.getElementById('summary-photo-input').addEventListener('change', function () {
      uploadSummaryPhotos(this.files);
      this.value = '';
    });

    // Already RSVPed screens
    document.getElementById('already-back').addEventListener('click', function () {
      state.alreadyGuest = null;
      document.getElementById('rsvp-progress').style.display = '';
      goToStep('1');
    });
    document.getElementById('already-send').addEventListener('click', function () { sendRsvpLink(false); });
    document.getElementById('link-resend').addEventListener('click', function () { sendRsvpLink(true); });

    // The invitation into part 2, on the confirmation screen
    document.getElementById('extras-start').addEventListener('click', startExtras);
    document.getElementById('extras-later').addEventListener('click', chooseMaybeLater);

    // Part 2's photo step uploads before moving on
    document.getElementById('photo-continue').addEventListener('click', continueFromPhoto);

    // "Add your pin" (last optional step) opens the Travel page; send the
    // confirmation email on the way out
    document.querySelector('.pin-step-link').addEventListener('click', function () {
      // Remember the name they searched for, so the map can label their pin
      // without asking again. (Kept in this browser tab only, never sent
      // anywhere; see the "addpin" section at the bottom of travel-map.js.)
      try {
        if (state.selectedGuest) sessionStorage.setItem('rsvpPinName', state.selectedGuest.displayName);
      } catch (e) {}  // if the browser blocks storage, the map just asks for the name
      // The RSVP's code links the pin to it (so they can move or remove it later)
      if (state.rsvpCode) this.href = 'travel.html?addpin=true&code=' + encodeURIComponent(state.rsvpCode);
      sendConfirmationEmail(true);
    });

    // Pressing Enter moves the form forward, like clicking the current step's
    // main button (Continue, Submit RSVP, and so on)
    var formContainer = document.getElementById('rsvp-form-container');
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      var t = e.target;
      // Only when typing in the form, or when nothing in particular is
      // selected (like after clicking a blank part of the page)
      if (t !== document.body && !formContainer.contains(t)) return;
      // Leave alone: multi-line boxes (Enter = new line), and buttons and
      // links (Enter already presses those, including the attendance dropdowns)
      if (t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.tagName === 'A') return;
      // A message pop-up is open: let it be dealt with first
      if (document.getElementById('modal-overlay').style.display !== 'none') return;

      // Name search: Enter picks the result if there's exactly one match
      if (t.id === 'guest-search') {
        var results = document.querySelectorAll('#search-results .search-result-item');
        if (results.length === 1) {
          e.preventDefault();
          results[0].click();
        }
        return;
      }

      var step = document.querySelector('.rsvp-step.active');
      var btn = step && step.querySelector('#submit-rsvp, #photo-continue, .step-btn[data-dir="next"], #extras-start');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      btn.click();
    });

    // Arriving from a confirmation email's link (rsvp.html?code=...)
    var codeMatch = window.location.search.match(/[?&]code=([A-Za-z0-9]+)/);
    if (codeMatch) {
      startFromCode(codeMatch[1]);
    } else {
      // After a refresh, put them back where they were (if they were mid-RSVP)
      restoreProgress();
    }

    // Save their place right before the page goes away (refresh, closing,
    // or switching away on a phone), including anything just typed
    window.addEventListener('pagehide', saveProgress);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') saveProgress();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
