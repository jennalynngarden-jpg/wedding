/* ========================================
   RSVP Multi-Step Form
   ======================================== */

(function () {
  'use strict';

  /* ---------- Configuration ---------- */
  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxMldY7OfwgI-AaEhLRxgqVW_Du_Z9YdANivvVzGfA7MkVMFaA_MkPbyMPYcqSW2SszOQ/exec';
  var MEAL_OPTIONS = [
    { value: 'Filet Mignon',       description: 'Herb-crusted beef tenderloin with roasted garlic butter and seasonal vegetables' },
    { value: 'Pan-Seared Chicken', description: 'Free-range chicken breast with lemon herb sauce and wild rice pilaf' },
    { value: 'Grilled Salmon',     description: 'Atlantic salmon fillet with dill cream sauce and roasted asparagus' }
  ];
  var KIDS_MEAL = { value: "Kids' Meal", description: 'Chicken tenders with mac & cheese and fresh fruit' };
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
    stepFlow: ['1', '2', 'email', '3', '4'],  // Default flow; rebuilt after fetching party data
    photoFile: null,
    photoBase64: null
  };

  /* ---------- Step Flow ---------- */

  // Builds the ordered list of step IDs based on whether the guest
  // is married or in a long-term partnership. Called after fetching party data.
  function buildStepFlow() {
    var flow = ['1', '2', 'email', '3'];
    if (state.partnershipStatus === 'married' || state.partnershipStatus === 'partner') {
      flow.push('special-song');
    }
    flow.push('4');
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
  }

  /* ---------- Step 1: Guest Search ---------- */
  var searchTimeout = null;

  function initSearch() {
    var input = document.getElementById('guest-search');
    if (!input) return;

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

  // Fetch JSON with automatic retries. Google Apps Script can be slow to
  // "wake up" (cold start) and mobile connections occasionally drop a request,
  // so we retry a couple of times before giving up. Also treats a non-OK
  // response as a failure so it retries rather than choking on error HTML.
  function fetchJSON(url, retries) {
    if (retries == null) retries = 2;
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .catch(function (err) {
        if (retries > 0) {
          return new Promise(function (resolve) { setTimeout(resolve, 700); })
            .then(function () { return fetchJSON(url, retries - 1); });
        }
        throw err;
      });
  }

  function fetchGuests(query) {
    var resultsEl = document.getElementById('search-results');
    resultsEl.innerHTML = floralLoaderHTML('Finding your invitation&hellip;');

    var url = APPS_SCRIPT_URL + '?action=searchGuests&query=' + encodeURIComponent(query);
    fetchJSON(url)
      .then(function (data) {
        renderSearchResults(data.guests || []);
      })
      .catch(function () {
        resultsEl.innerHTML = '<p class="no-results">We had trouble reaching our guest list &mdash; please check your connection and try again.</p>';
      });
  }

  function renderSearchResults(guests) {
    var container = document.getElementById('search-results');
    if (guests.length === 0) {
      container.innerHTML = '<p class="no-results">No matching names found. Please check the spelling or contact us.</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < guests.length; i++) {
      html += '<button type="button" class="search-result-item" ' +
        'data-guest-id="' + guests[i].guestId + '" ' +
        'data-party-id="' + guests[i].partyId + '" ' +
        'data-name="' + guests[i].displayName + '">' +
        guests[i].displayName + '</button>';
    }
    container.innerHTML = html;

    var items = container.querySelectorAll('.search-result-item');
    for (var j = 0; j < items.length; j++) {
      items[j].addEventListener('click', onGuestSelected);
    }
  }

  function onGuestSelected(e) {
    var btn = e.currentTarget;
    state.selectedGuest = {
      guestId: btn.getAttribute('data-guest-id'),
      partyId: btn.getAttribute('data-party-id'),
      displayName: btn.getAttribute('data-name')
    };
    // Show the floral loader immediately — looking up the party is a network
    // round-trip to Google's servers and can take a moment, so give feedback
    // instead of leaving the form looking frozen.
    document.getElementById('search-results').innerHTML =
      floralLoaderHTML('Loading your party&hellip;');
    fetchParty(state.selectedGuest.guestId);
  }

  /* ---------- Step 2: Party Members ---------- */
  function fetchParty(guestId) {
    var url = APPS_SCRIPT_URL + '?action=getParty&guestId=' + encodeURIComponent(guestId);
    fetchJSON(url)
      .then(function (data) {
        state.partyMembers = [];
        for (var i = 0; i < data.members.length; i++) {
          var m = data.members[i];
          var defaultAttending = m.rehearsalDinner ? 'wedding-and-rehearsal' : 'yes';
          state.partyMembers.push({
            guestId: m.guestId,
            displayName: m.displayName,
            relationship: m.relationship,
            rehearsalDinner: !!m.rehearsalDinner,
            attending: defaultAttending
          });
        }

        // Set up the step flow based on the guest's partnership status
        state.partnershipStatus = data.partnershipStatus || '';
        buildStepFlow();
        renderProgressDots();

        // Set the special song heading based on married vs. partner
        if (state.partnershipStatus === 'married') {
          document.getElementById('special-song-heading').textContent =
            'What was your first dance song at your wedding?';
        } else if (state.partnershipStatus === 'partner') {
          document.getElementById('special-song-heading').textContent =
            "What's a song that's special to you and your partner?";
        }

        renderPartyMembers();
        goToStep('2');
      })
      .catch(function () {
        // Still on step 1 visually — replace the loader with a friendly error
        document.getElementById('search-results').innerHTML =
          '<p class="no-results">We had trouble loading your party &mdash; please check your connection and try again.</p>';
      });
  }

  function renderPartyMembers() {
    var container = document.getElementById('party-members');

    // Header row with "Attendance" label
    var html = '<div class="party-member-row" style="border-bottom:none;padding-bottom:0;">' +
      '<span class="party-member-name"></span>' +
      '<span style="font-family:var(--font-sans);font-size:0.72rem;font-weight:400;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-text-light);">Attendance</span>' +
      '</div>';

    for (var i = 0; i < state.partyMembers.length; i++) {
      var m = state.partyMembers[i];
      var isPlusOne = m.relationship === 'plusone';

      var selectHtml = dropdownHTML(i, attendanceOptions(m), m.attending);

      if (isPlusOne) {
        var primaryName = state.selectedGuest ? state.selectedGuest.displayName.split(' ')[0] : 'Guest';
        html += '<div class="party-member-row party-member-plusone">' +
          '<input type="text" class="plusone-name-input" data-index="' + i + '" ' +
          'placeholder="' + primaryName + '\'s +1" autocomplete="off">' +
          selectHtml +
          '</div>';
      } else {
        html += '<div class="party-member-row">' +
          '<span class="party-member-name">' + m.displayName + '</span>' +
          selectHtml +
          '</div>';
      }
    }
    container.innerHTML = html;

    // Wire up each custom dropdown
    var dds = container.querySelectorAll('.attend-dd');
    for (var j = 0; j < dds.length; j++) {
      setupDropdown(dds[j]);
    }

    // Update plus-one display names as they type
    var plusOneInputs = container.querySelectorAll('.plusone-name-input');
    for (var k = 0; k < plusOneInputs.length; k++) {
      plusOneInputs[k].addEventListener('input', function () {
        var idx = parseInt(this.getAttribute('data-index'), 10);
        state.partyMembers[idx].displayName = this.value.trim() || '+1 Guest';
      });
    }
  }

  /* ---------- Custom attendance dropdown ---------- */
  // Native <select> menus are drawn by the OS and can't be positioned; this is a
  // custom dropdown that opens directly below the field at matching width.

  function attendanceOptions(m) {
    if (m.rehearsalDinner) {
      return [
        { value: 'wedding-and-rehearsal', label: 'Wedding & rehearsal' },
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
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
      });
    }
  }

  function getSelectedMembers() {
    var selected = [];
    for (var i = 0; i < state.partyMembers.length; i++) {
      if (state.partyMembers[i].attending !== 'no') {
        selected.push(state.partyMembers[i]);
      }
    }
    return selected;
  }

  function getUnselectedMembers() {
    var unselected = [];
    for (var i = 0; i < state.partyMembers.length; i++) {
      if (state.partyMembers[i].attending === 'no') {
        unselected.push(state.partyMembers[i]);
      }
    }
    return unselected;
  }

  /* ---------- Step 3: Meal Selections ---------- */
  function renderMealSelections() {
    var container = document.getElementById('meal-selections');
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
      html += '<h4 class="meal-guest-name">' + m.displayName + '</h4>';
      html += '<div class="meal-options">';
      var options = (m.relationship === 'child') ? [KIDS_MEAL].concat(MEAL_OPTIONS) : MEAL_OPTIONS;
      for (var j = 0; j < options.length; j++) {
        var opt = options[j];
        var inputName = 'meal-' + m.guestId;
        html += '<label class="meal-option">' +
          '<input type="radio" name="' + inputName + '" value="' + opt.value + '">' +
          '<span class="meal-option-text">' +
            '<span class="meal-option-header">' + opt.value + '</span>' +
            '<span class="meal-option-description">' + opt.description + '</span>' +
          '</span>' +
          '</label>';
      }
      html += '</div>';
      html += '<div class="form-group">' +
        '<label>Dietary restrictions or allergies</label>' +
        '<input type="text" class="dietary-input" data-guest-id="' + m.guestId + '" ' +
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
      if (e.dataTransfer.files.length > 0) {
        handlePhotoFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', function () {
      if (this.files.length > 0) {
        handlePhotoFile(this.files[0]);
      }
    });

    document.getElementById('remove-photo').addEventListener('click', function () {
      state.photoFile = null;
      state.photoBase64 = null;
      document.getElementById('upload-preview').style.display = 'none';
      document.getElementById('upload-dropzone').style.display = '';
    });
  }

  function handlePhotoFile(file) {
    if (file.size > MAX_PHOTO_SIZE) {
      showModal('Photo too large', 'Please choose a photo under 10 MB.');
      return;
    }
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      showModal('Unsupported format', 'Please upload a JPG, PNG, or WebP image.');
      return;
    }

    state.photoFile = file;

    var reader = new FileReader();
    reader.onload = function (e) {
      document.getElementById('preview-img').src = e.target.result;
      document.getElementById('upload-preview').style.display = '';
      document.getElementById('upload-dropzone').style.display = 'none';
      state.photoBase64 = e.target.result.split(',')[1];
    };
    reader.readAsDataURL(file);
  }

  /* ---------- Submission ---------- */
  function submitRsvp() {
    collectMealData();
    state.songRequest = document.getElementById('song-request').value.trim();

    // Collect the special song if the step was shown
    var specialSongInput = document.getElementById('special-song-input');
    state.specialSong = specialSongInput ? specialSongInput.value.trim() : '';

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
        songRequest: state.songRequest
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
      specialSong: state.specialSong,
      email: state.email,
      guests: guests
    };

    var submitBtn = document.getElementById('submit-rsvp');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.success && state.photoBase64) {
        return uploadPhoto();
      }
    })
    .then(function () {
      showTerminalStep('step-confirmation');
      fetchAttendees();
    })
    .catch(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit RSVP';
      showModal('Something went wrong', 'Please try again.');
    });
  }

  function submitDecline() {
    // When declining, mark ALL party members (selected + unselected) as not attending
    var guests = [];
    for (var i = 0; i < state.partyMembers.length; i++) {
      guests.push({
        guestId: state.partyMembers[i].guestId,
        guestName: state.partyMembers[i].displayName,
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
      guests: guests
    };

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    .then(function () { showTerminalStep('step-decline'); })
    .catch(function () { showTerminalStep('step-decline'); });
  }

  function uploadPhoto() {
    return fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'uploadPhoto',
        partyId: state.selectedGuest.partyId,
        fileName: state.photoFile.name,
        mimeType: state.photoFile.type,
        base64Data: state.photoBase64
      })
    }).then(function (r) { return r.json(); });
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
    if (section) section.style.display = '';

    var html = '';

    if (brideParties.length > 0) {
      html += '<div class="attendee-group">';
      html += '<h4 class="attendee-group-heading">Jenna\'s side</h4>';
      for (var i = 0; i < brideParties.length; i++) {
        html += '<div class="attendee-party">';
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
        html += '<div class="attendee-party">';
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
    if (state.currentStep === '2') {
      // Ensure plus-ones marked as coming have a name entered
      var selected = getSelectedMembers();
      for (var p = 0; p < selected.length; p++) {
        if (selected[p].relationship === 'plusone' && (!selected[p].displayName || selected[p].displayName === '+1 Guest')) {
          showModal('Name missing', "Don't forget to enter a name for your +1 guest.");
          return false;
        }
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

    var backBtns = document.querySelectorAll('.step-btn--back');
    for (var i = 0; i < backBtns.length; i++) {
      backBtns[i].addEventListener('click', function () {
        var prev = getPrevStep();
        if (prev) goToStep(prev);
      });
    }

    var nextBtns = document.querySelectorAll('.step-btn--next');
    for (var j = 0; j < nextBtns.length; j++) {
      nextBtns[j].addEventListener('click', function () {
        if (!validateCurrentStep()) return;

        if (state.currentStep === '2') {
          var attending = getSelectedMembers();
          if (attending.length === 0) {
            submitDecline();
            return;
          }
          renderMealSelections();
        }

        var next = getNextStep();
        if (next) goToStep(next);
      });
    }

    // Skip button on the special song step — clears the input and moves on
    var skipBtn = document.getElementById('skip-special-song');
    if (skipBtn) {
      skipBtn.addEventListener('click', function () {
        document.getElementById('special-song-input').value = '';
        var next = getNextStep();
        if (next) goToStep(next);
      });
    }

    document.getElementById('submit-rsvp').addEventListener('click', function () {
      submitRsvp();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
